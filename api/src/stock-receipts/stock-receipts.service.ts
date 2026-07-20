import { BadRequestException, Injectable } from '@nestjs/common';
import { LocationType, MovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceNotFoundError } from '../common/errors/generic-errors';
import { Paginated, skipTake, toPaginated } from '../common/pagination';
import { InventoryService, MovementInput } from '../inventory/inventory.service';
import { ReferenceService } from '../inventory/reference.service';
import { SessionUser } from '../common/types/session-user';
import {
  CreateDirectReceiptDto,
  ListStockReceiptsQueryDto,
} from './dto/stock-receipt.dto';

// Stock receipts have two sources: an incoming order (created by the receive
// transaction in P3-05) or a direct receipt (POST /stock-receipts/direct,
// spec §12). Both live in the same table so the ledger and cost trail stay
// uniform; the incomingOrderId column disambiguates.

export type StockReceiptItemOut = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number | null;
};

export type StockReceiptOut = {
  id: string;
  referenceNumber: string;
  incomingOrderId: string | null;
  incomingOrderReference: string | null;
  supplierName: string | null;
  receiptDate: Date;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
  itemCount: number;
  totalQuantity: number;
};

export type StockReceiptDetail = StockReceiptOut & {
  items: StockReceiptItemOut[];
};

@Injectable()
export class StockReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly refs: ReferenceService,
  ) {}

  async list(q: ListStockReceiptsQueryDto): Promise<Paginated<StockReceiptOut>> {
    const where: Prisma.StockReceiptWhereInput = {};
    if (q.source === 'direct' || q.directOnly) where.incomingOrderId = null;
    else if (q.source === 'order') where.incomingOrderId = { not: null };
    if (q.from || q.to) {
      where.receiptDate = {};
      if (q.from) where.receiptDate.gte = new Date(q.from);
      if (q.to) where.receiptDate.lte = new Date(q.to);
    }
    if (q.search) {
      const s = q.search;
      where.OR = [
        { referenceNumber: { contains: s, mode: 'insensitive' } },
        { supplierName: { contains: s, mode: 'insensitive' } },
        { order: { referenceNumber: { contains: s, mode: 'insensitive' } } },
      ];
    }
    const { skip, take } = skipTake(q.page, q.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockReceipt.findMany({
        where,
        include: {
          items: { select: { quantity: true } },
          order: { select: { referenceNumber: true } },
        },
        orderBy: [{ receiptDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.stockReceipt.count({ where }),
    ]);
    return toPaginated(rows.map(mapReceiptRow), total, q.page, q.pageSize);
  }

  async findOne(id: string): Promise<StockReceiptDetail> {
    const row = await this.prisma.stockReceipt.findUnique({
      where: { id },
      include: {
        items: {
          include: { product: { select: { id: true, name: true } } },
          orderBy: { id: 'asc' },
        },
        order: { select: { referenceNumber: true } },
      },
    });
    if (!row) throw new ResourceNotFoundError('StockReceipt', id);
    return {
      ...mapReceiptRow(row),
      items: row.items.map((it) => ({
        id: it.id,
        productId: it.productId,
        productName: it.product.name,
        quantity: it.quantity,
        unitCost: it.unitCost,
      })),
    };
  }

  // Direct receipt (P3-07): same transaction shape as order-based receive
  // (P3-05), minus the order. REC ref, receipt + items, DIRECT_RECEIPT
  // movements into the warehouse. One transaction; a failure rolls the
  // whole thing back.
  async createDirect(
    dto: CreateDirectReceiptDto,
    user: SessionUser,
  ): Promise<StockReceiptDetail> {
    if (dto.items.length === 0) {
      throw new BadRequestException('At least one item is required');
    }

    const receiptId = await this.prisma.$transaction(async (tx) => {
      // Warehouse location (seeded on install).
      const warehouse = await tx.location.findFirst({
        where: { type: LocationType.WAREHOUSE, shopId: null },
        select: { id: true },
      });
      if (!warehouse) throw new ResourceNotFoundError('Location', 'central-warehouse');

      // Validate products exist and are active. Rejecting archived products
      // as inputs to new transactions is the phase-2 archive rule (§2).
      const productIds = dto.items.map((it) => it.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, active: true },
      });
      const byId = new Map(products.map((p) => [p.id, p]));
      for (const it of dto.items) {
        const p = byId.get(it.productId);
        if (!p) throw new ResourceNotFoundError('Product', it.productId);
        if (!p.active) {
          throw new BadRequestException(`Product ${it.productId} is archived`);
        }
      }

      const receiptRef = await this.refs.next(tx, 'REC');
      const receiptDate = dto.receiptDate ? new Date(dto.receiptDate) : new Date();

      const receipt = await tx.stockReceipt.create({
        data: {
          referenceNumber: receiptRef,
          incomingOrderId: null,
          supplierName: dto.supplierName ?? null,
          receiptDate,
          notes: dto.notes ?? null,
          createdBy: user.id,
          items: {
            create: dto.items.map((it) => ({
              productId: it.productId,
              quantity: it.quantity,
              unitCost: it.unitCost ?? null,
            })),
          },
        },
        select: { id: true },
      });

      const movements: MovementInput[] = dto.items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        movementType: MovementType.DIRECT_RECEIPT,
        destinationLocationId: warehouse.id,
        relatedEntityType: 'StockReceipt',
        relatedEntityId: receipt.id,
        createdBy: user.id,
      }));
      await this.inventory.applyMovements(tx, movements);

      return receipt.id;
    });

    return this.findOne(receiptId);
  }
}

function mapReceiptRow(row: {
  id: string;
  referenceNumber: string;
  incomingOrderId: string | null;
  supplierName: string | null;
  receiptDate: Date;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
  items: Array<{ quantity: number }>;
  order?: { referenceNumber: string } | null;
}): StockReceiptOut {
  let totalQuantity = 0;
  for (const it of row.items) totalQuantity += it.quantity;
  return {
    id: row.id,
    referenceNumber: row.referenceNumber,
    incomingOrderId: row.incomingOrderId,
    incomingOrderReference: row.order?.referenceNumber ?? null,
    supplierName: row.supplierName,
    receiptDate: row.receiptDate,
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    itemCount: row.items.length,
    totalQuantity,
  };
}
