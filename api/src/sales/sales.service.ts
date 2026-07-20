import { Injectable } from '@nestjs/common';
import { MovementType, Prisma, Role, SaleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceNotFoundError } from '../common/errors/generic-errors';
import { Paginated, skipTake, toPaginated } from '../common/pagination';
import { SessionUser } from '../common/types/session-user';
import { InventoryService, MovementInput } from '../inventory/inventory.service';
import { ReferenceService } from '../inventory/reference.service';
import { CreateSaleDto, ListSalesQueryDto } from './dto/sale.dto';
import {
  CustomerRequiredError,
  DuplicateSaleItemError,
  PaymentExceedsTotalError,
  SaleNoItemsError,
  SaleNotFoundError,
  SaleShopArchivedError,
} from './errors';
import { derivePaymentStatus } from './payment-status';

// SalesService — the sale confirmation transaction (P5-02, spec §19.10
// adapted to D-012). One HTTP request, one Postgres transaction. If any
// step fails, everything rolls back — including any inline customer we
// created (that's the whole reason it's in the same tx).
//
// Invariants this service is responsible for:
//   1. Money is server-computed. Client lineTotal/totalAmount are stripped
//      by the whitelist ValidationPipe and never trusted; the service
//      recomputes lineTotal = quantity × unitPrice and totalAmount = Σ.
//   2. amountPaidAtSale ∈ [0, totalAmount]. Enforced by service (specific
//      error code) AND the schema CHECK (backstop).
//   3. amountDue > 0 → customer is mandatory. Same double-lock — service
//      throws CUSTOMER_REQUIRED, DB CHECK sale_debt_requires_customer.
//   4. Stock deduction goes through the inventory chokepoint's *batch*
//      applyMovements (D-011), one SALE movement per item, source = shop
//      location — insufficient stock rolls the whole thing back.

export type SaleItemOut = {
  id: string;
  productId: string;
  productName: string; // snapshot
  quantity: number;
  unitPrice: number;
  unitCostSnapshot: number | null;
  lineTotal: number;
};

export type SaleOut = {
  id: string;
  referenceNumber: string;
  shopId: string;
  shopName: string;
  customerId: string | null;
  customerName: string | null; // snapshot
  customerPhone: string | null; // snapshot
  status: SaleStatus;
  paymentStatus: string;
  totalAmount: number;
  amountPaidAtSale: number;
  amountPaid: number;
  amountDue: number;
  saleDate: Date;
  notes: string | null;
  createdBy: string;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  itemCount: number;
};

export type SaleDetail = SaleOut & { items: SaleItemOut[] };

const withShop = { shop: { select: { name: true } } } as const;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly refs: ReferenceService,
  ) {}

  async confirm(dto: CreateSaleDto, user: SessionUser): Promise<SaleDetail> {
    // Cheap up-front checks before opening a transaction.
    if (dto.items.length === 0) throw new SaleNoItemsError();

    // Reject duplicate productIds. Same precedent as transfers — merging
    // silently hides an intent bug in the UI.
    const seen = new Set<string>();
    for (const it of dto.items) {
      if (seen.has(it.productId)) throw new DuplicateSaleItemError(it.productId);
      seen.add(it.productId);
    }

    // Money is authoritative on the server. Whitelist pipe strips any
    // lineTotal / totalAmount from the payload; recompute from scratch.
    let totalAmount = 0;
    for (const it of dto.items) totalAmount += it.quantity * it.unitPrice;

    if (dto.amountPaidAtSale > totalAmount) {
      throw new PaymentExceedsTotalError(totalAmount, dto.amountPaidAtSale);
    }
    const amountDue = totalAmount - dto.amountPaidAtSale;
    if (amountDue > 0 && !dto.customerId && !dto.newCustomer) {
      throw new CustomerRequiredError();
    }

    const saleId = await this.prisma.$transaction(async (tx) => {
      // Shop must exist and be active. The paired location is the source
      // of the stock deduction.
      const shop = await tx.shop.findUnique({
        where: { id: dto.shopId },
        include: { location: { select: { id: true } } },
      });
      if (!shop) throw new ResourceNotFoundError('Shop', dto.shopId);
      if (!shop.active) throw new SaleShopArchivedError(dto.shopId);
      const shopLocation = shop.location;
      if (!shopLocation) {
        // Data invariant from ShopsService.create — every Shop has a paired
        // Location. If we ever land here, something else has gone wrong.
        throw new ResourceNotFoundError('Location', dto.shopId);
      }

      // Products: all must exist and be active. Snapshot name + purchase
      // cost NOW so later edits don't rewrite this sale's history.
      const productIds = dto.items.map((it) => it.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          name: true,
          active: true,
          defaultPurchaseCost: true,
        },
      });
      const productById = new Map(products.map((p) => [p.id, p]));
      for (const it of dto.items) {
        const p = productById.get(it.productId);
        // Same policy as transfers: archived product ⇒ 404 (they cannot
        // enter new transactions per phase-2 §2).
        if (!p || !p.active) {
          throw new ResourceNotFoundError('Product', it.productId);
        }
      }

      // Customer: attach existing OR create inline (in-tx so it rolls back
      // with the rest). Snapshot name+phone even when fully-paid — the
      // receipt renders from these fields (spec §37.14).
      let customerId: string | null = null;
      let customerNameSnapshot: string | null = null;
      let customerPhoneSnapshot: string | null = null;
      if (dto.customerId) {
        const existing = await tx.customer.findUnique({
          where: { id: dto.customerId },
        });
        if (!existing || !existing.active) {
          throw new ResourceNotFoundError('Customer', dto.customerId);
        }
        customerId = existing.id;
        customerNameSnapshot = existing.name;
        customerPhoneSnapshot = existing.phone;
      } else if (dto.newCustomer) {
        const created = await tx.customer.create({
          data: {
            name: dto.newCustomer.name,
            phone: dto.newCustomer.phone ?? null,
          },
        });
        customerId = created.id;
        customerNameSnapshot = created.name;
        customerPhoneSnapshot = created.phone;
      }

      const referenceNumber = await this.refs.next(tx, 'SAL');
      const paymentStatus = derivePaymentStatus(totalAmount, dto.amountPaidAtSale);

      const sale = await tx.sale.create({
        data: {
          referenceNumber,
          shopId: dto.shopId,
          customerId,
          customerNameSnapshot,
          customerPhoneSnapshot,
          status: SaleStatus.ACTIVE,
          paymentStatus,
          totalAmount,
          amountPaidAtSale: dto.amountPaidAtSale,
          amountPaid: dto.amountPaidAtSale, // D-012: no allocations yet
          amountDue,
          saleDate: dto.saleDate ? new Date(dto.saleDate) : new Date(),
          notes: dto.notes ?? null,
          createdBy: user.id,
          items: {
            create: dto.items.map((it) => {
              const snap = productById.get(it.productId)!;
              return {
                productId: it.productId,
                productNameSnapshot: snap.name,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
                unitCostSnapshot: snap.defaultPurchaseCost ?? null,
                lineTotal: it.quantity * it.unitPrice,
              };
            }),
          },
        },
        select: { id: true },
      });

      // Stock deduction. Batch call ⇒ one sorted lock pass across every
      // (shopLocation, product) pair (D-011). Insufficient stock rolls
      // the whole sale back — including the customer we may have created.
      const movements: MovementInput[] = dto.items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        movementType: MovementType.SALE,
        sourceLocationId: shopLocation.id,
        relatedEntityType: 'Sale',
        relatedEntityId: sale.id,
        createdBy: user.id,
      }));
      await this.inventory.applyMovements(tx, movements);

      return sale.id;
    });

    return this.findOne(saleId);
  }

  async findOne(id: string, user?: SessionUser): Promise<SaleDetail> {
    const row = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        ...withShop,
        items: {
          orderBy: { id: 'asc' },
          include: { product: { select: { id: true, name: true } } },
        },
      },
    });
    // SHOP users must never see another shop's sale id — return the same
    // 404 as "does not exist" so we don't leak sale existence (spec
    // §29.3 permission model). OWNER sees everything.
    if (!row) throw new SaleNotFoundError(id);
    if (user && user.role === Role.SHOP && row.shopId !== user.assignedShopId) {
      throw new SaleNotFoundError(id);
    }
    return {
      ...mapRow(row),
      items: row.items.map((it) => ({
        id: it.id,
        productId: it.productId,
        productName: it.productNameSnapshot,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        unitCostSnapshot: it.unitCostSnapshot,
        lineTotal: it.lineTotal,
      })),
    };
  }

  async list(
    q: ListSalesQueryDto,
    user: SessionUser,
  ): Promise<Paginated<SaleOut>> {
    const where: Prisma.SaleWhereInput = {};
    // SHOP users are forced into their own shop regardless of any shopId
    // they passed — the guard already substituted at the params level for
    // POST/GET :id, but this list endpoint uses a query filter so we
    // constrain here defensively.
    if (user.role === Role.SHOP) {
      if (!user.assignedShopId) throw new ResourceNotFoundError('Shop', 'own');
      where.shopId = user.assignedShopId;
    } else if (q.shopId) {
      where.shopId = q.shopId;
    }
    if (q.customerId) where.customerId = q.customerId;
    if (q.paymentStatus && q.paymentStatus.length > 0) {
      where.paymentStatus = { in: q.paymentStatus };
    }
    if (q.status && q.status.length > 0) where.status = { in: q.status };
    if (q.from || q.to) {
      where.saleDate = {};
      if (q.from) where.saleDate.gte = new Date(q.from);
      if (q.to) where.saleDate.lte = new Date(q.to);
    }
    if (q.search) {
      where.referenceNumber = { contains: q.search, mode: 'insensitive' };
    }

    const { skip, take } = skipTake(q.page, q.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        include: {
          ...withShop,
          _count: { select: { items: true } },
        },
        orderBy: [{ saleDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.sale.count({ where }),
    ]);

    const items = rows.map((r) => mapRow(r, r._count?.items));
    return toPaginated(items, total, q.page, q.pageSize);
  }
}

function mapRow(
  row: {
    id: string;
    referenceNumber: string;
    shopId: string;
    shop: { name: string };
    customerId: string | null;
    customerNameSnapshot: string | null;
    customerPhoneSnapshot: string | null;
    status: SaleStatus;
    paymentStatus: string;
    totalAmount: number;
    amountPaidAtSale: number;
    amountPaid: number;
    amountDue: number;
    saleDate: Date;
    notes: string | null;
    createdBy: string;
    cancelledBy: string | null;
    cancelledAt: Date | null;
    cancellationReason: string | null;
    createdAt: Date;
    items?: unknown[];
  },
  countOverride?: number,
): SaleOut {
  return {
    id: row.id,
    referenceNumber: row.referenceNumber,
    shopId: row.shopId,
    shopName: row.shop.name,
    customerId: row.customerId,
    customerName: row.customerNameSnapshot,
    customerPhone: row.customerPhoneSnapshot,
    status: row.status,
    paymentStatus: row.paymentStatus,
    totalAmount: row.totalAmount,
    amountPaidAtSale: row.amountPaidAtSale,
    amountPaid: row.amountPaid,
    amountDue: row.amountDue,
    saleDate: row.saleDate,
    notes: row.notes,
    createdBy: row.createdBy,
    cancelledBy: row.cancelledBy,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    createdAt: row.createdAt,
    itemCount: countOverride ?? row.items?.length ?? 0,
  };
}
