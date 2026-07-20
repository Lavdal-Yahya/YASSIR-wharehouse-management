import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceNotFoundError } from '../common/errors/generic-errors';
import { Paginated, skipTake, toPaginated } from '../common/pagination';
import { ReferenceService } from '../inventory/reference.service';
import { SessionUser } from '../common/types/session-user';
import {
  CancelIncomingOrderDto,
  CreateIncomingOrderDto,
  CreateIncomingOrderItemDto,
  ListIncomingOrdersQueryDto,
  UpdateIncomingOrderDto,
} from './dto/incoming-order.dto';
import { OrderNoItemsError, OrderNotEditableError } from './errors';

// Read + basic CRUD for incoming orders (P3-04). Receive lives in
// receive.service.ts (P3-05); cancel in cancel.service.ts (P3-06).

export type IncomingOrderItemOut = {
  id: string;
  productId: string;
  productName: string;
  quantityOrdered: number;
  quantityReceived: number;
  quantityRemaining: number;
  unitCost: number | null;
  notes: string | null;
};

export type IncomingOrderOut = {
  id: string;
  referenceNumber: string;
  supplierName: string | null;
  orderDate: Date;
  expectedArrivalDate: Date | null;
  status: OrderStatus;
  notes: string | null;
  createdBy: string;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  totalOrdered: number;
  totalReceived: number;
  totalRemaining: number;
};

export type IncomingOrderDetail = IncomingOrderOut & {
  items: IncomingOrderItemOut[];
  receipts: Array<{ id: string; referenceNumber: string; receiptDate: Date }>;
};

@Injectable()
export class IncomingOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refs: ReferenceService,
  ) {}

  async list(q: ListIncomingOrdersQueryDto): Promise<Paginated<IncomingOrderOut>> {
    const where: Prisma.IncomingOrderWhereInput = {};
    if (q.status && q.status.length > 0) where.status = { in: q.status };
    if (q.from || q.to) {
      where.orderDate = {};
      if (q.from) where.orderDate.gte = new Date(q.from);
      if (q.to) where.orderDate.lte = new Date(q.to);
    }
    if (q.search) {
      const s = q.search;
      where.OR = [
        { referenceNumber: { contains: s, mode: 'insensitive' } },
        { supplierName: { contains: s, mode: 'insensitive' } },
      ];
    }
    const { skip, take } = skipTake(q.page, q.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.incomingOrder.findMany({
        where,
        include: { items: { select: { quantityOrdered: true, quantityReceived: true } } },
        orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.incomingOrder.count({ where }),
    ]);
    return toPaginated(rows.map(mapOrderRow), total, q.page, q.pageSize);
  }

  async findOne(id: string): Promise<IncomingOrderDetail> {
    const row = await this.prisma.incomingOrder.findUnique({
      where: { id },
      include: {
        items: {
          include: { product: { select: { id: true, name: true } } },
          orderBy: { id: 'asc' },
        },
        receipts: {
          select: { id: true, referenceNumber: true, receiptDate: true },
          orderBy: { receiptDate: 'asc' },
        },
      },
    });
    if (!row) throw new ResourceNotFoundError('Order', id);
    return {
      ...mapOrderRow(row),
      items: row.items.map((it) => ({
        id: it.id,
        productId: it.productId,
        productName: it.product.name,
        quantityOrdered: it.quantityOrdered,
        quantityReceived: it.quantityReceived,
        quantityRemaining: it.quantityOrdered - it.quantityReceived,
        unitCost: it.unitCost,
        notes: it.notes,
      })),
      receipts: row.receipts,
    };
  }

  async create(dto: CreateIncomingOrderDto, user: SessionUser): Promise<IncomingOrderDetail> {
    if (dto.items.length === 0) throw new OrderNoItemsError();

    // Everything — inline product creation, order+items insert, reference
    // number — happens in one transaction (spec §36). If any item's product
    // resolution fails, nothing is written.
    const orderId = await this.prisma.$transaction(async (tx) => {
      const referenceNumber = await this.refs.next(tx, 'ORD');

      const preparedItems = await Promise.all(
        dto.items.map((it) => this.resolveItemProduct(tx, it)),
      );

      const order = await tx.incomingOrder.create({
        data: {
          referenceNumber,
          supplierName: dto.supplierName ?? null,
          orderDate: new Date(dto.orderDate),
          expectedArrivalDate: dto.expectedArrivalDate ? new Date(dto.expectedArrivalDate) : null,
          notes: dto.notes ?? null,
          status: OrderStatus.ORDERED,
          createdBy: user.id,
          items: {
            create: preparedItems.map((it) => ({
              productId: it.productId,
              quantityOrdered: it.quantityOrdered,
              quantityReceived: 0,
              unitCost: it.unitCost ?? null,
              notes: it.notes ?? null,
            })),
          },
        },
      });
      return order.id;
    });

    return this.findOne(orderId);
  }

  async update(
    id: string,
    dto: UpdateIncomingOrderDto,
  ): Promise<IncomingOrderDetail> {
    const existing = await this.prisma.incomingOrder.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!existing) throw new ResourceNotFoundError('Order', id);
    if (
      existing.status === OrderStatus.RECEIVED ||
      existing.status === OrderStatus.CANCELLED
    ) {
      throw new OrderNotEditableError(existing.status);
    }
    // Only these three fields flow through; items are immutable post-create.
    // Delete-then-recreate would corrupt the received counts.
    await this.prisma.incomingOrder.update({
      where: { id },
      data: {
        supplierName: dto.supplierName ?? undefined,
        expectedArrivalDate:
          dto.expectedArrivalDate === undefined
            ? undefined
            : dto.expectedArrivalDate === null
            ? null
            : new Date(dto.expectedArrivalDate),
        notes: dto.notes ?? undefined,
      },
    });
    return this.findOne(id);
  }

  // Cancellation (P3-06). No stock effect — cancelled orders never posted
  // stock (ORDERED) or already posted it via receipts (PARTIALLY_RECEIVED,
  // whose stock stays). Reason mandatory (validated by DTO). Excluded from
  // active lists via status = CANCELLED; visible in history.
  //
  // Interpretation for partial: keep already-received stock and its receipts;
  // close the remainder. Ordered vs received stays visible forever.
  async cancel(
    id: string,
    dto: CancelIncomingOrderDto,
    user: SessionUser,
  ): Promise<IncomingOrderDetail> {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; status: OrderStatus }>
      >`
        SELECT "id", "status"
          FROM "IncomingOrder"
         WHERE "id" = ${id}
         FOR UPDATE
      `;
      if (rows.length === 0) throw new ResourceNotFoundError('Order', id);
      const order = rows[0]!;
      if (order.status === OrderStatus.RECEIVED || order.status === OrderStatus.CANCELLED) {
        throw new OrderNotEditableError(order.status);
      }
      await tx.incomingOrder.update({
        where: { id },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledBy: user.id,
          cancelledAt: new Date(),
          cancellationReason: dto.reason,
        },
      });
    });
    return this.findOne(id);
  }

  private async resolveItemProduct(
    tx: Prisma.TransactionClient,
    item: CreateIncomingOrderItemDto,
  ): Promise<{
    productId: string;
    quantityOrdered: number;
    unitCost?: number;
    notes?: string | null;
  }> {
    const hasProduct = !!item.productId;
    const hasNew = !!item.newProduct;
    if (hasProduct === hasNew) {
      throw new BadRequestException(
        'Each item must supply exactly one of productId or newProduct',
      );
    }
    if (hasProduct) {
      const p = await tx.product.findUnique({
        where: { id: item.productId! },
        select: { id: true, active: true },
      });
      if (!p) throw new ResourceNotFoundError('Product', item.productId!);
      if (!p.active) {
        // Archived products cannot enter new transactions (phase-2 §2).
        throw new BadRequestException(`Product ${item.productId} is archived`);
      }
      return {
        productId: p.id,
        quantityOrdered: item.quantityOrdered,
        unitCost: item.unitCost,
        notes: item.notes,
      };
    }
    // Inline new product — validate category exists and is active, then create
    // it with zero stock (the ordered quantity is not stock until received).
    const np = item.newProduct!;
    const cat = await tx.category.findUnique({
      where: { id: np.categoryId },
      select: { id: true, active: true },
    });
    if (!cat) throw new ResourceNotFoundError('Category', np.categoryId);
    if (!cat.active) {
      throw new BadRequestException(`Category ${np.categoryId} is archived`);
    }
    const created = await tx.product.create({
      data: {
        name: np.name,
        categoryId: np.categoryId,
        sku: np.sku ?? null,
        barcode: np.barcode ?? null,
        defaultPurchaseCost: np.defaultPurchaseCost ?? null,
        defaultSalePrice: np.defaultSalePrice ?? null,
        lowStockThreshold: np.lowStockThreshold ?? null,
      },
      select: { id: true },
    });
    return {
      productId: created.id,
      quantityOrdered: item.quantityOrdered,
      unitCost: item.unitCost,
      notes: item.notes,
    };
  }
}

function mapOrderRow(row: {
  id: string;
  referenceNumber: string;
  supplierName: string | null;
  orderDate: Date;
  expectedArrivalDate: Date | null;
  status: OrderStatus;
  notes: string | null;
  createdBy: string;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{ quantityOrdered: number; quantityReceived: number }>;
}): IncomingOrderOut {
  let totalOrdered = 0;
  let totalReceived = 0;
  for (const it of row.items) {
    totalOrdered += it.quantityOrdered;
    totalReceived += it.quantityReceived;
  }
  return {
    id: row.id,
    referenceNumber: row.referenceNumber,
    supplierName: row.supplierName,
    orderDate: row.orderDate,
    expectedArrivalDate: row.expectedArrivalDate,
    status: row.status,
    notes: row.notes,
    createdBy: row.createdBy,
    cancelledBy: row.cancelledBy,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    totalOrdered,
    totalReceived,
    totalRemaining: totalOrdered - totalReceived,
  };
}
