import { Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SessionUser } from '../common/types/session-user';
import { ReportFilterDto } from './dto/report-filter.dto';
import { ACTIVE_PAYMENT, ACTIVE_SALE } from './common/active-filters';
import {
  resolveOutstandingScope,
  resolveReportScope,
} from './common/report-scope';

// P7-07 — the debt view. Three related aggregations in one response:
//
//   outstandingByCustomer — who owes money, sorted by amount owed.
//                           Outstanding is as-of (D-015 + advisor #3),
//                           so a debt sale from before the window
//                           still counts.
//
//   outstandingByShop     — outstanding split by the shop where each
//                           original sale happened. OWNER-facing;
//                           SHOP sees only their own shop's slice.
//
//   paymentsInPeriod      — CustomerPayment rows (ACTIVE, in the
//                           window). Uses paymentDate — the same
//                           date column computeCashCollected's
//                           later-payments leg uses.

const TOP_LIMIT = 100;

export type DebtReportOut = {
  scope: {
    shopId: string | null;
    from: Date | null;
    to: Date | null;
  };
  outstandingByCustomer: Array<{
    customerId: string;
    customerName: string;
    customerPhone: string | null;
    outstanding: number;
    unpaidSalesCount: number;
    partialSalesCount: number;
  }>;
  outstandingByShop: Array<{
    shopId: string;
    shopName: string;
    outstanding: number;
    debtorsCount: number;
  }>;
  paymentsInPeriod: Array<{
    paymentId: string;
    referenceNumber: string;
    customerId: string;
    customerName: string;
    shopId: string;
    shopName: string;
    amount: number;
    paymentDate: Date;
  }>;
};

@Injectable()
export class DebtReportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(filter: ReportFilterDto, user: SessionUser): Promise<DebtReportOut> {
    const scope = resolveReportScope(user, filter);
    const outstandingScope = resolveOutstandingScope(user, filter);

    // Shared SALE filter for outstanding queries. saleDate lte asOf
    // if provided; NO `from` (as-of, advisor #3).
    const outstandingSaleWhere: Prisma.SaleWhereInput = {
      ...ACTIVE_SALE,
      amountDue: { gt: 0 },
    };
    if (outstandingScope.shopId) outstandingSaleWhere.shopId = outstandingScope.shopId;
    if (outstandingScope.asOf) {
      outstandingSaleWhere.saleDate = { lte: outstandingScope.asOf };
    }

    // ------ outstandingByCustomer -------------------------------------
    // Group by customerId; join Customer for the display name.
    const customerAgg = await this.prisma.sale.groupBy({
      by: ['customerId', 'paymentStatus'],
      where: {
        ...outstandingSaleWhere,
        customerId: { not: null },
      },
      _sum: { amountDue: true },
      _count: { _all: true },
    });
    type CustomerAcc = {
      outstanding: number;
      unpaidSalesCount: number;
      partialSalesCount: number;
    };
    const byCustomerId = new Map<string, CustomerAcc>();
    for (const row of customerAgg) {
      const cid = row.customerId;
      if (!cid) continue;
      const acc = byCustomerId.get(cid) ?? {
        outstanding: 0,
        unpaidSalesCount: 0,
        partialSalesCount: 0,
      };
      acc.outstanding += row._sum.amountDue ?? 0;
      if (row.paymentStatus === PaymentStatus.UNPAID) {
        acc.unpaidSalesCount += row._count._all;
      } else if (row.paymentStatus === PaymentStatus.PARTIALLY_PAID) {
        acc.partialSalesCount += row._count._all;
      }
      byCustomerId.set(cid, acc);
    }
    const customerIds = [...byCustomerId.keys()];
    const customers = customerIds.length
      ? await this.prisma.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, name: true, phone: true },
        })
      : [];
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const outstandingByCustomer = customerIds
      .map((cid) => {
        const acc = byCustomerId.get(cid)!;
        const c = customerById.get(cid);
        return {
          customerId: cid,
          customerName: c?.name ?? '(unknown)',
          customerPhone: c?.phone ?? null,
          outstanding: acc.outstanding,
          unpaidSalesCount: acc.unpaidSalesCount,
          partialSalesCount: acc.partialSalesCount,
        };
      })
      .filter((r) => r.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, TOP_LIMIT);

    // ------ outstandingByShop ----------------------------------------
    const shopAgg = await this.prisma.sale.groupBy({
      by: ['shopId'],
      where: outstandingSaleWhere,
      _sum: { amountDue: true },
    });
    const shopIds = shopAgg.map((r) => r.shopId);
    // debtorsCount = distinct customers with debt, per shop. One extra
    // query — small in v1; if it grows, replace with a raw CTE.
    const debtorsPerShop = await Promise.all(
      shopIds.map(async (sid) => {
        const rows = await this.prisma.sale.findMany({
          where: {
            ...outstandingSaleWhere,
            shopId: sid,
            customerId: { not: null },
          },
          select: { customerId: true },
          distinct: ['customerId'],
        });
        return [sid, rows.length] as const;
      }),
    );
    const debtorsByShop = new Map(debtorsPerShop);
    const shopRows = shopIds.length
      ? await this.prisma.shop.findMany({
          where: { id: { in: shopIds } },
          select: { id: true, name: true },
        })
      : [];
    const shopNameById = new Map(shopRows.map((s) => [s.id, s.name]));
    const outstandingByShop = shopAgg
      .map((r) => ({
        shopId: r.shopId,
        shopName: shopNameById.get(r.shopId) ?? '(unknown)',
        outstanding: r._sum.amountDue ?? 0,
        debtorsCount: debtorsByShop.get(r.shopId) ?? 0,
      }))
      .filter((r) => r.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding);

    // ------ paymentsInPeriod -----------------------------------------
    const paymentWhere: Prisma.CustomerPaymentWhereInput = { ...ACTIVE_PAYMENT };
    if (scope.shopId) paymentWhere.shopId = scope.shopId;
    if (scope.from || scope.to) {
      paymentWhere.paymentDate = {
        ...(scope.from ? { gte: scope.from } : {}),
        ...(scope.to ? { lte: scope.to } : {}),
      };
    }
    const payments = await this.prisma.customerPayment.findMany({
      where: paymentWhere,
      include: {
        customer: { select: { name: true } },
        shop: { select: { name: true } },
      },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
      take: TOP_LIMIT,
    });
    const paymentsInPeriod = payments.map((p) => ({
      paymentId: p.id,
      referenceNumber: p.referenceNumber,
      customerId: p.customerId,
      customerName: p.customer.name,
      shopId: p.shopId,
      shopName: p.shop.name,
      amount: p.amount,
      paymentDate: p.paymentDate,
    }));

    return {
      scope: { shopId: scope.shopId, from: scope.from, to: scope.to },
      outstandingByCustomer,
      outstandingByShop,
      paymentsInPeriod,
    };
  }
}
