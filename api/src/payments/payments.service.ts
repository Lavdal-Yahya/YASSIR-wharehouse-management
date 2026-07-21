import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  CustomerPaymentStatus,
  Prisma,
  Role,
  SaleStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceNotFoundError } from '../common/errors/generic-errors';
import { Paginated, skipTake, toPaginated } from '../common/pagination';
import { SessionUser } from '../common/types/session-user';
import { ReferenceService } from '../inventory/reference.service';
import type { Tx } from '../inventory/tx';
import { derivePaymentStatus } from '../sales/payment-status';
import {
  ListPaymentsQueryDto,
  RegisterPaymentDto,
  ReversePaymentDto,
} from './dto/payment.dto';
import {
  InvalidTargetSaleError,
  NoOutstandingDebtError,
  PaymentExceedsDebtError,
  PaymentNotFoundError,
  PaymentNotReversibleError,
} from './errors';

// PaymentsService — the customer-debt allocation engine (Phase 6, PR-A).
// Two write paths, both single transactions:
//   register(dto, user)  — oldest-first allocation across active sales
//                          (or a single sale, OWNER-targeted, P6-03).
//   reverse(id, user)    — flip status to CANCELLED, recompute each
//                          touched sale's amountPaid from scratch.
//
// Read paths (list, findOne) enforce shop scoping the same way sales
// do: a SHOP user is silently confined to their own shop; a SHOP
// request for a foreign payment id returns 404, not 403, so we don't
// leak existence.
//
// Invariants this service is responsible for:
//   1. Every registered payment satisfies debtAfter = debtBefore − amount
//      (also enforced by the payment_debt_snapshot_coherent CHECK).
//   2. Σ active allocations of a sale never exceeds its totalAmount.
//      This falls out of the "amount ≤ Σ locked amountDue" check —
//      overpay across the batch is rejected before any allocation is
//      written.
//   3. Reversal recomputes touched sales from
//      amountPaidAtSale + Σ still-active allocations. Never patches.

export type PaymentAllocationOut = {
  id: string;
  saleId: string;
  saleReference: string;
  amountAllocated: number;
};

export type PaymentOut = {
  id: string;
  referenceNumber: string;
  customerId: string;
  customerName: string;
  shopId: string;
  shopName: string;
  amount: number;
  paymentDate: Date;
  debtBeforePayment: number;
  debtAfterPayment: number;
  notes: string | null;
  status: CustomerPaymentStatus;
  createdBy: string;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
};

export type PaymentDetail = PaymentOut & {
  allocations: PaymentAllocationOut[];
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refs: ReferenceService,
  ) {}

  async register(
    dto: RegisterPaymentDto,
    user: SessionUser,
  ): Promise<PaymentDetail> {
    // targetSaleId is OWNER-only (P6-03, phase-6 §3). Reject early with a
    // clean 403 rather than silently ignoring — a SHOP employee sending it
    // means the client is buggy, and silent-ignore hides the bug.
    if (dto.targetSaleId && user.role !== Role.OWNER) {
      throw new ForbiddenException(
        'Only OWNER may direct a payment to a specific sale',
      );
    }

    const paymentId = await this.prisma.$transaction(async (tx) => {
      // Shop + customer resolution. The Shop scope guard already forced
      // SHOP.shopId = assignedShopId; here we assert the shop exists and
      // is active regardless of role (OWNER's shopId is client input).
      const shop = await tx.shop.findUnique({
        where: { id: dto.shopId },
        select: { id: true, active: true },
      });
      if (!shop) throw new ResourceNotFoundError('Shop', dto.shopId);
      if (!shop.active) {
        throw new ResourceNotFoundError('Shop', dto.shopId);
      }
      const customer = await tx.customer.findUnique({
        where: { id: dto.customerId },
        select: { id: true },
      });
      if (!customer) throw new ResourceNotFoundError('Customer', dto.customerId);

      // Lock the customer's ACTIVE sales that still owe money, oldest first.
      // FOR UPDATE is what prevents two concurrent payments on the same
      // customer from double-spending the same amountDue (phase-6 §8 test
      // 10). We SELECT amountDue in the same query and use those numbers
      // as the source of truth for both the overpay check and each per-sale
      // ceiling — computing debtBefore against a separately-fetched
      // customers.outstanding() would leave a race window between the two
      // reads.
      const locked = await tx.$queryRaw<
        Array<{
          id: string;
          referenceNumber: string;
          amountPaid: number;
          amountDue: number;
          totalAmount: number;
          amountPaidAtSale: number;
        }>
      >`
        SELECT "id", "referenceNumber", "amountPaid", "amountDue",
               "totalAmount", "amountPaidAtSale"
          FROM "Sale"
         WHERE "customerId" = ${dto.customerId}
           AND "status" = 'ACTIVE'::"SaleStatus"
           AND "amountDue" > 0
         ORDER BY "saleDate" ASC, "createdAt" ASC
         FOR UPDATE
      `;

      const debtBefore = locked.reduce((n, s) => n + s.amountDue, 0);

      if (debtBefore === 0) throw new NoOutstandingDebtError(dto.customerId);
      if (dto.amount > debtBefore) {
        throw new PaymentExceedsDebtError(debtBefore, dto.amount);
      }

      // Decide which sales get touched. Two shapes:
      //   * OWNER-targeted (P6-03): the whole amount goes to one sale,
      //     bounded by that sale's amountDue.
      //   * Oldest-first (default): walk the sorted list, consuming
      //     amount as we go (spec §21.3 worked example).
      type Plan = { saleId: string; saleReference: string; amountAllocated: number };
      const plan: Plan[] = [];
      if (dto.targetSaleId) {
        const target = locked.find((s) => s.id === dto.targetSaleId);
        if (!target) {
          // Either the sale doesn't belong to this customer, isn't ACTIVE,
          // or is already fully paid — all funnel to the same domain error.
          throw new InvalidTargetSaleError(
            dto.targetSaleId,
            'not an active outstanding sale for this customer',
          );
        }
        if (dto.amount > target.amountDue) {
          throw new InvalidTargetSaleError(
            dto.targetSaleId,
            `sale outstanding is ${target.amountDue}, payment ${dto.amount}`,
          );
        }
        plan.push({
          saleId: target.id,
          saleReference: target.referenceNumber,
          amountAllocated: dto.amount,
        });
      } else {
        let remaining = dto.amount;
        for (const s of locked) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, s.amountDue);
          plan.push({
            saleId: s.id,
            saleReference: s.referenceNumber,
            amountAllocated: take,
          });
          remaining -= take;
        }
        // We already reject amount > debtBefore, so this must be zero.
        if (remaining !== 0) {
          throw new Error(
            `allocation planner failed to consume amount (remaining=${remaining})`,
          );
        }
      }

      const referenceNumber = await this.refs.next(tx, 'PAY');
      const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : new Date();

      const payment = await tx.customerPayment.create({
        data: {
          referenceNumber,
          customerId: dto.customerId,
          shopId: dto.shopId,
          amount: dto.amount,
          paymentDate,
          debtBeforePayment: debtBefore,
          debtAfterPayment: debtBefore - dto.amount,
          notes: dto.notes ?? null,
          status: CustomerPaymentStatus.ACTIVE,
          createdBy: user.id,
          allocations: {
            create: plan.map((p) => ({
              saleId: p.saleId,
              amountAllocated: p.amountAllocated,
            })),
          },
        },
        select: { id: true },
      });

      // Update each touched sale. Additive is safe here because we just
      // inserted the allocations above and no other allocation on these
      // sales can have changed (they're FOR UPDATE-locked). Reversal will
      // recompute from scratch instead.
      const byId = new Map(locked.map((s) => [s.id, s]));
      for (const p of plan) {
        const s = byId.get(p.saleId)!;
        const newPaid = s.amountPaid + p.amountAllocated;
        const newDue = s.totalAmount - newPaid;
        await tx.sale.update({
          where: { id: p.saleId },
          data: {
            amountPaid: newPaid,
            amountDue: newDue,
            paymentStatus: derivePaymentStatus(s.totalAmount, newPaid),
          },
        });
      }

      return payment.id;
    });

    return this.findOne(paymentId);
  }

  async reverse(
    id: string,
    dto: ReversePaymentDto,
    user: SessionUser,
  ): Promise<PaymentDetail> {
    await this.prisma.$transaction(async (tx) => {
      // Lock the payment. Two concurrent reversals must serialize instead
      // of both computing "ACTIVE, go" and applying the compensation twice.
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          status: CustomerPaymentStatus;
        }>
      >`
        SELECT "id", "status"
          FROM "CustomerPayment"
         WHERE "id" = ${id}
         FOR UPDATE
      `;
      if (rows.length === 0) throw new PaymentNotFoundError(id);
      const payment = rows[0]!;
      if (payment.status !== CustomerPaymentStatus.ACTIVE) {
        throw new PaymentNotReversibleError(payment.status);
      }

      const allocations = await tx.paymentAllocation.findMany({
        where: { customerPaymentId: id },
        select: { saleId: true },
      });
      // Empty-allocation payment shouldn't exist (register always writes
      // at least one), but guard so the reversal is a no-op rather than
      // touching the wrong sales.
      const touchedSaleIds = [...new Set(allocations.map((a) => a.saleId))];
      // Deterministic ordering matches the batched inventory chokepoint
      // discipline (D-011) — sort the ids so concurrent reversals lock
      // in the same order and can't deadlock.
      touchedSaleIds.sort();

      for (const saleId of touchedSaleIds) {
        // Lock the sale row for the recompute. We can't just subtract
        // because a second reversal on a different payment could race
        // otherwise. Instead: lock, then recompute amountPaid from
        // amountPaidAtSale + Σ ACTIVE allocations (excluding this
        // payment, which we're about to flip). Same logic as the
        // invariant check.
        const saleRows = await tx.$queryRaw<
          Array<{
            id: string;
            totalAmount: number;
            amountPaidAtSale: number;
          }>
        >`
          SELECT "id", "totalAmount", "amountPaidAtSale"
            FROM "Sale"
           WHERE "id" = ${saleId}
           FOR UPDATE
        `;
        const sale = saleRows[0]!;
        const activeSum = await tx.paymentAllocation.aggregate({
          where: {
            saleId,
            // Exclude THIS payment — we're about to cancel it, but the
            // row is still ACTIVE in this snapshot.
            customerPaymentId: { not: id },
            payment: { status: CustomerPaymentStatus.ACTIVE },
            sale: { status: SaleStatus.ACTIVE },
          },
          _sum: { amountAllocated: true },
        });
        const activeAllocSum = activeSum._sum.amountAllocated ?? 0;
        const newPaid = sale.amountPaidAtSale + activeAllocSum;
        const newDue = sale.totalAmount - newPaid;
        await tx.sale.update({
          where: { id: saleId },
          data: {
            amountPaid: newPaid,
            amountDue: newDue,
            paymentStatus: derivePaymentStatus(sale.totalAmount, newPaid),
          },
        });
      }

      // Flip the payment status. Allocations rows stay put — D-013: their
      // liveness derives from parent state, not a column of their own.
      // History is preserved: the receipt reprint still shows the same
      // snapshot values because those are on CustomerPayment itself.
      await tx.customerPayment.update({
        where: { id },
        data: {
          status: CustomerPaymentStatus.CANCELLED,
          cancelledBy: user.id,
          cancelledAt: new Date(),
          cancellationReason: dto.reason,
        },
      });
    });

    return this.findOne(id);
  }

  async findOne(id: string, user?: SessionUser): Promise<PaymentDetail> {
    const row = await this.prisma.customerPayment.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true } },
        shop: { select: { name: true } },
        allocations: {
          orderBy: { createdAt: 'asc' },
          include: { sale: { select: { referenceNumber: true } } },
        },
      },
    });
    // SHOP scoping: a SHOP request for another shop's payment id returns
    // 404 (not 403) so we don't leak existence, matching the SalesService
    // policy (spec §29.3).
    if (!row) throw new PaymentNotFoundError(id);
    if (user && user.role === Role.SHOP && row.shopId !== user.assignedShopId) {
      throw new PaymentNotFoundError(id);
    }
    return {
      ...mapPayment(row),
      allocations: row.allocations.map((a) => ({
        id: a.id,
        saleId: a.saleId,
        saleReference: a.sale.referenceNumber,
        amountAllocated: a.amountAllocated,
      })),
    };
  }

  async list(
    q: ListPaymentsQueryDto,
    user: SessionUser,
  ): Promise<Paginated<PaymentOut>> {
    const where: Prisma.CustomerPaymentWhereInput = {};
    if (user.role === Role.SHOP) {
      if (!user.assignedShopId) throw new ResourceNotFoundError('Shop', 'own');
      where.shopId = user.assignedShopId;
    } else if (q.shopId) {
      where.shopId = q.shopId;
    }
    if (q.customerId) where.customerId = q.customerId;
    if (q.status && q.status.length > 0) where.status = { in: q.status };
    if (q.from || q.to) {
      where.paymentDate = {};
      if (q.from) where.paymentDate.gte = new Date(q.from);
      if (q.to) where.paymentDate.lte = new Date(q.to);
    }
    if (q.search) {
      where.referenceNumber = { contains: q.search, mode: 'insensitive' };
    }

    const { skip, take } = skipTake(q.page, q.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customerPayment.findMany({
        where,
        include: {
          customer: { select: { name: true } },
          shop: { select: { name: true } },
        },
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.customerPayment.count({ where }),
    ]);

    return toPaginated(rows.map(mapPayment), total, q.page, q.pageSize);
  }

  // Verifies the payment-side snapshot rule (schema-review §3):
  // debtAfterPayment = debtBeforePayment − amount for every payment. The
  // CHECK covers it at insert time, but a global assertion in tests
  // catches any raw SQL that would sidestep it.
  async verifyPaymentSnapshotInvariant(): Promise<
    Array<{ paymentId: string; referenceNumber: string; reason: string }>
  > {
    const rows = await this.prisma.customerPayment.findMany({
      select: {
        id: true,
        referenceNumber: true,
        debtBeforePayment: true,
        debtAfterPayment: true,
        amount: true,
      },
    });
    const out: Array<{ paymentId: string; referenceNumber: string; reason: string }> =
      [];
    for (const p of rows) {
      if (p.debtAfterPayment !== p.debtBeforePayment - p.amount) {
        out.push({
          paymentId: p.id,
          referenceNumber: p.referenceNumber,
          reason: `debtAfter ${p.debtAfterPayment} !== debtBefore ${p.debtBeforePayment} − amount ${p.amount}`,
        });
      }
    }
    return out;
  }
}

type PaymentRow = {
  id: string;
  referenceNumber: string;
  customerId: string;
  customer: { name: string };
  shopId: string;
  shop: { name: string };
  amount: number;
  paymentDate: Date;
  debtBeforePayment: number;
  debtAfterPayment: number;
  notes: string | null;
  status: CustomerPaymentStatus;
  createdBy: string;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
};

function mapPayment(row: PaymentRow): PaymentOut {
  return {
    id: row.id,
    referenceNumber: row.referenceNumber,
    customerId: row.customerId,
    customerName: row.customer.name,
    shopId: row.shopId,
    shopName: row.shop.name,
    amount: row.amount,
    paymentDate: row.paymentDate,
    debtBeforePayment: row.debtBeforePayment,
    debtAfterPayment: row.debtAfterPayment,
    notes: row.notes,
    status: row.status,
    createdBy: row.createdBy,
    cancelledBy: row.cancelledBy,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    createdAt: row.createdAt,
  };
}

// Kept exported so integration tests can build a Tx alias without
// re-importing from the inventory module.
export type PaymentsTx = Tx;
