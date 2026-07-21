import { Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SessionUser } from '../common/types/session-user';
import { ReportFilterDto } from './dto/report-filter.dto';
import { ACTIVE_SALE } from './common/active-filters';
import { resolveReportScope } from './common/report-scope';

// P7-06 — sales breakdowns. Aggregations over Sale (ACTIVE) in the
// filter window, sliced four ways: by paymentStatus, by shop, by
// product (top-N by revenue), and by UTC day. Every slice honours
// the same shop-scope and active-only rules as the shop report.
//
// Design choice: one endpoint returns all breakdowns in one call, so
// the UI can render the sections without four round-trips. If a
// breakdown grows large enough to hurt latency, split then — v1 has
// a small enough catalog that a top-50 product list and a 90-day
// window fit comfortably.

const TOP_PRODUCTS_LIMIT = 50;

export type SalesReportOut = {
  scope: {
    shopId: string | null;
    from: Date | null;
    to: Date | null;
  };
  byStatus: Array<{
    paymentStatus: PaymentStatus;
    salesCount: number;
    salesValue: number;
    amountPaidAtSale: number;
    amountDue: number;
  }>;
  byShop: Array<{
    shopId: string;
    shopName: string;
    salesCount: number;
    salesValue: number;
    cashAtSale: number;
  }>;
  byProduct: Array<{
    productId: string;
    productName: string; // snapshot from SaleItem
    unitsSold: number;
    revenue: number;
  }>;
  byDate: Array<{
    date: string; // ISO date-only (UTC)
    salesCount: number;
    salesValue: number;
    cashAtSale: number;
  }>;
};

@Injectable()
export class SalesReportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(filter: ReportFilterDto, user: SessionUser): Promise<SalesReportOut> {
    const scope = resolveReportScope(user, filter);

    // Shared WHERE — ACTIVE sales in the window, optionally shop-scoped.
    const saleWhere: Prisma.SaleWhereInput = { ...ACTIVE_SALE };
    if (scope.shopId) saleWhere.shopId = scope.shopId;
    if (scope.from || scope.to) {
      saleWhere.saleDate = {
        ...(scope.from ? { gte: scope.from } : {}),
        ...(scope.to ? { lte: scope.to } : {}),
      };
    }

    const [byStatusRaw, byShopRaw, sales, byProductRows] = await Promise.all([
      this.prisma.sale.groupBy({
        by: ['paymentStatus'],
        where: saleWhere,
        _count: { _all: true },
        _sum: { totalAmount: true, amountPaidAtSale: true, amountDue: true },
      }),
      this.prisma.sale.groupBy({
        by: ['shopId'],
        where: saleWhere,
        _count: { _all: true },
        _sum: { totalAmount: true, amountPaidAtSale: true },
      }),
      // Pull the sale rows once for the byDate bucketing (UTC per D-015).
      // Small enough at v1 scale; if it ever bites, replace with a raw
      // date_trunc query.
      this.prisma.sale.findMany({
        where: saleWhere,
        select: {
          saleDate: true,
          totalAmount: true,
          amountPaidAtSale: true,
        },
      }),
      // SaleItem-side aggregation for byProduct — we join back to
      // Sale for the ACTIVE + scope filter via the relation predicate.
      this.prisma.saleItem.groupBy({
        by: ['productId', 'productNameSnapshot'],
        where: { sale: saleWhere },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { lineTotal: 'desc' } },
        take: TOP_PRODUCTS_LIMIT,
      }),
    ]);

    // byShop needs shop names — fetch once and index.
    const shopIds = byShopRaw.map((r) => r.shopId);
    const shopRows = shopIds.length
      ? await this.prisma.shop.findMany({
          where: { id: { in: shopIds } },
          select: { id: true, name: true },
        })
      : [];
    const shopNameById = new Map(shopRows.map((s) => [s.id, s.name]));

    const byDate = bucketByUtcDay(sales);

    return {
      scope: { shopId: scope.shopId, from: scope.from, to: scope.to },
      byStatus: byStatusRaw.map((r) => ({
        paymentStatus: r.paymentStatus,
        salesCount: r._count._all,
        salesValue: r._sum.totalAmount ?? 0,
        amountPaidAtSale: r._sum.amountPaidAtSale ?? 0,
        amountDue: r._sum.amountDue ?? 0,
      })),
      byShop: byShopRaw.map((r) => ({
        shopId: r.shopId,
        shopName: shopNameById.get(r.shopId) ?? '(unknown)',
        salesCount: r._count._all,
        salesValue: r._sum.totalAmount ?? 0,
        cashAtSale: r._sum.amountPaidAtSale ?? 0,
      })),
      byProduct: byProductRows.map((r) => ({
        productId: r.productId,
        productName: r.productNameSnapshot,
        unitsSold: r._sum.quantity ?? 0,
        revenue: r._sum.lineTotal ?? 0,
      })),
      byDate,
    };
  }
}

// UTC-day bucketing (D-015). Keys are 'YYYY-MM-DD' strings so JSON
// output is stable and sortable; the Date column on Sale is already
// UTC-stored.
function bucketByUtcDay(
  rows: Array<{ saleDate: Date; totalAmount: number; amountPaidAtSale: number }>,
): SalesReportOut['byDate'] {
  const byKey = new Map<
    string,
    { salesCount: number; salesValue: number; cashAtSale: number }
  >();
  for (const r of rows) {
    const key = utcDayKey(r.saleDate);
    const bucket = byKey.get(key) ?? {
      salesCount: 0,
      salesValue: 0,
      cashAtSale: 0,
    };
    bucket.salesCount += 1;
    bucket.salesValue += r.totalAmount;
    bucket.cashAtSale += r.amountPaidAtSale;
    byKey.set(key, bucket);
  }
  return [...byKey.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, agg]) => ({ date, ...agg }));
}

function utcDayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
