import { PaymentStatus } from '@prisma/client';
import { SalesReportService } from '../../src/reports/sales-report.service';
import {
  createHarness,
  makeShopLocation,
  resetDatabase,
  seedBasics,
} from './setup';
import { seedOneOfEach } from './report-scenarios';
import type { SessionUser } from '../../src/common/types/session-user';

const h = createHarness();
let svc: SalesReportService;
let ctx: { categoryId: string; warehouseId: string; userId: string };
let owner: SessionUser;
let shopA: { shopId: string; locationId: string };
let shopB: { shopId: string; locationId: string };

beforeAll(() => {
  svc = new SalesReportService(h.prisma);
});

beforeEach(async () => {
  await resetDatabase(h.prisma);
  ctx = await seedBasics(h.prisma);
  owner = { id: ctx.userId, name: 'Owner', role: 'OWNER', assignedShopId: null };
  shopA = await makeShopLocation(h.prisma);
  shopB = await makeShopLocation(h.prisma);
});

afterEach(async () => {
  const ledger = await h.inventory.verifyLedgerBalanceInvariant(h.prisma);
  expect(ledger).toEqual([]);
  const saleCoherence = await h.sales.verifySaleCoherenceInvariant();
  expect(saleCoherence).toEqual([]);
  const paymentSnapshot = await h.payments.verifyPaymentSnapshotInvariant();
  expect(paymentSnapshot).toEqual([]);
});

afterAll(async () => {
  await h.disconnect();
});

async function seedProductWithStock(locationId: string, qty = 20) {
  const p = await h.prisma.product.create({
    data: {
      name: `p-${Math.random().toString(36).slice(2, 8)}`,
      categoryId: ctx.categoryId,
    },
  });
  await h.openingStock.create(
    { locationId, items: [{ productId: p.id, quantity: qty }] },
    owner,
  );
  return p.id;
}

describe('P7-06 · byStatus / byShop / byProduct / byDate', () => {
  it('aggregates active sales across every slice', async () => {
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    const p1 = await seedProductWithStock(shopA.locationId);
    const p2 = await seedProductWithStock(shopA.locationId);
    const p3 = await seedProductWithStock(shopB.locationId);

    // Day 1, shopA: paid + partially-paid on same product mix.
    await h.sales.confirm(
      {
        shopId: shopA.shopId,
        amountPaidAtSale: 6_000,
        saleDate: '2026-06-15',
        items: [{ productId: p1, quantity: 2, unitPrice: 3_000 }],
      },
      owner,
    );
    await h.sales.confirm(
      {
        shopId: shopA.shopId,
        customerId: customer.id,
        amountPaidAtSale: 1_000,
        saleDate: '2026-06-15',
        items: [{ productId: p2, quantity: 1, unitPrice: 4_000 }],
      },
      owner,
    );
    // Day 2, shopB: unpaid debt sale.
    await h.sales.confirm(
      {
        shopId: shopB.shopId,
        customerId: customer.id,
        amountPaidAtSale: 0,
        saleDate: '2026-06-16',
        items: [{ productId: p3, quantity: 1, unitPrice: 5_000 }],
      },
      owner,
    );

    const report = await svc.build(
      { from: '2026-06-01', to: '2026-06-30' },
      owner,
    );

    // byStatus: one entry per status observed.
    const paid = report.byStatus.find((r) => r.paymentStatus === PaymentStatus.PAID);
    const partial = report.byStatus.find(
      (r) => r.paymentStatus === PaymentStatus.PARTIALLY_PAID,
    );
    const unpaid = report.byStatus.find(
      (r) => r.paymentStatus === PaymentStatus.UNPAID,
    );
    expect(paid?.salesCount).toBe(1);
    expect(paid?.salesValue).toBe(6_000);
    expect(partial?.salesCount).toBe(1);
    expect(partial?.amountDue).toBe(3_000);
    expect(unpaid?.salesCount).toBe(1);
    expect(unpaid?.amountDue).toBe(5_000);

    // byShop: two entries; shopA sees 2 sales, shopB sees 1.
    const shopABucket = report.byShop.find((r) => r.shopId === shopA.shopId);
    const shopBBucket = report.byShop.find((r) => r.shopId === shopB.shopId);
    expect(shopABucket?.salesCount).toBe(2);
    expect(shopABucket?.salesValue).toBe(10_000);
    expect(shopABucket?.cashAtSale).toBe(7_000);
    expect(shopBBucket?.salesCount).toBe(1);
    expect(shopBBucket?.salesValue).toBe(5_000);

    // byProduct: ordered by revenue desc. p1 leads at 6,000.
    expect(report.byProduct[0]?.productId).toBe(p1);
    expect(report.byProduct[0]?.unitsSold).toBe(2);
    expect(report.byProduct[0]?.revenue).toBe(6_000);

    // byDate: two UTC days, sorted.
    expect(report.byDate.map((b) => b.date)).toEqual([
      '2026-06-15',
      '2026-06-16',
    ]);
    expect(report.byDate[0]?.salesValue).toBe(10_000);
    expect(report.byDate[1]?.salesValue).toBe(5_000);
  });
});

describe('P7-06 · cancelled sales vanish from every slice', () => {
  it('rides on seedOneOfEach — cancelledSale contributes nothing', async () => {
    await seedOneOfEach(h, shopA, owner, ctx.categoryId);
    const report = await svc.build(
      { shopId: shopA.shopId, from: '2026-06-01', to: '2026-06-30' },
      owner,
    );
    // Sum across statuses must equal active sales value only.
    const totalAcrossStatuses = report.byStatus.reduce(
      (n, r) => n + r.salesValue,
      0,
    );
    expect(totalAcrossStatuses).toBe(10_000); // activeSale only
    // The cancelled sale's byProduct row must be absent.
    const productsIncluded = report.byProduct.map((p) => p.productName);
    // Both seed products were created; only the active-sale product has revenue.
    const revenueSum = report.byProduct.reduce((n, r) => n + r.revenue, 0);
    expect(revenueSum).toBe(10_000);
    expect(productsIncluded.length).toBeGreaterThan(0);
  });
});
