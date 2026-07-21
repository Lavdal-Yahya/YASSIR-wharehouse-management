import { ShopReportService } from '../../src/reports/shop-report.service';
import {
  createHarness,
  makeShopLocation,
  resetDatabase,
  seedBasics,
} from './setup';
import { seedOneOfEach } from './report-scenarios';
import type { SessionUser } from '../../src/common/types/session-user';

// Phase 7 · shop report (P7-04) — the marquee suite. The tests in
// this file are the load-bearing tests of the whole phase (advisor):
//
//  1. Spec §22 canonical scenario (100k sold / 60k collected / 40k
//     debt) reproduces as three DISTINCT numbers.
//  2. Later debt payment moves cash-collected and outstanding but NOT
//     that day's sales value — this is why D-012 exists.
//  3. Cancelled sales / reversed payments / cancelled expenses
//     vanish from every total (via the shared seedOneOfEach).
//  4. Outstanding is as-of, not date-bound — a debt sale from before
//     the window still counts.
//  5. Shop scoping: shop A's report excludes shop B's data, even
//     when the OWNER filters by shopId.

const h = createHarness();
let shopReport: ShopReportService;
let ctx: { categoryId: string; warehouseId: string; userId: string };
let owner: SessionUser;
let shopA: { shopId: string; locationId: string };
let shopB: { shopId: string; locationId: string };

beforeAll(() => {
  shopReport = new ShopReportService(h.prisma);
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

// One-item helper — shopA-scoped opening stock + sale in one go.
async function seedSaleAt(
  saleDate: string,
  amountPaidAtSale: number,
  total: number,
  customerId: string,
) {
  const p = await h.prisma.product.create({
    data: {
      name: `p-${Math.random().toString(36).slice(2, 8)}`,
      categoryId: ctx.categoryId,
    },
  });
  await h.openingStock.create(
    { locationId: shopA.locationId, items: [{ productId: p.id, quantity: 100 }] },
    owner,
  );
  return h.sales.confirm(
    {
      shopId: shopA.shopId,
      customerId,
      amountPaidAtSale,
      saleDate,
      items: [{ productId: p.id, quantity: 1, unitPrice: total }],
    },
    owner,
  );
}

describe('P7-04 · spec §22 canonical scenario (100k / 60k / 40k)', () => {
  it('renders sales value, cash collected, and outstanding as three distinct numbers', async () => {
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    // 100,000 sold — one big fully-cash sale + one debt sale that
    // covers the remaining 40,000 owed.
    await seedSaleAt('2026-06-15', 60_000, 60_000, customer.id); // paid at sale
    await seedSaleAt('2026-06-15', 0, 40_000, customer.id); // debt

    const report = await shopReport.build(
      { shopId: shopA.shopId, from: '2026-06-01', to: '2026-06-30' },
      owner,
    );
    expect(report.salesValue).toBe(100_000);
    expect(report.cashAtSale).toBe(60_000);
    expect(report.laterPayments).toBe(0);
    expect(report.totalCollected).toBe(60_000);
    expect(report.newDebt).toBe(40_000);
    expect(report.outstanding).toBe(40_000);
  });
});

describe('P7-04 · later debt payment moves cash + outstanding, NOT that day’s sales value', () => {
  it('phase-7 §7 item 2 — the conceptual pivot of D-012', async () => {
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    // Day 1: a 40,000 debt sale (nothing collected at sale time).
    await seedSaleAt('2026-06-15', 0, 40_000, customer.id);
    // Day 2: a 10,000 debt payment against that sale (oldest-first).
    await h.payments.register(
      {
        customerId: customer.id,
        shopId: shopA.shopId,
        amount: 10_000,
        paymentDate: '2026-06-16',
      },
      owner,
    );

    // Report for DAY 1 only — cash collected on day 1 is 0 (the
    // payment lives in day 2), sales value on day 1 is 40,000,
    // outstanding as-of end of day 1 is 40,000.
    const day1 = await shopReport.build(
      { shopId: shopA.shopId, from: '2026-06-15', to: '2026-06-15' },
      owner,
    );
    expect(day1.salesValue).toBe(40_000);
    expect(day1.cashAtSale).toBe(0);
    expect(day1.laterPayments).toBe(0);

    // Report for DAY 2 only — sales value on day 2 is 0 (no new
    // sale), cash collected on day 2 is 10,000 (the debt payment),
    // outstanding as-of end of day 2 is 30,000.
    const day2 = await shopReport.build(
      { shopId: shopA.shopId, from: '2026-06-16', to: '2026-06-16' },
      owner,
    );
    expect(day2.salesValue).toBe(0); // <-- the invariant: no double-count
    expect(day2.cashAtSale).toBe(0);
    expect(day2.laterPayments).toBe(10_000);
    expect(day2.totalCollected).toBe(10_000);
    expect(day2.outstanding).toBe(30_000);
  });
});

describe('P7-04 · cancelled + reversed vanish from every total', () => {
  it('phase-7 §7 item 3 — using the shared seedOneOfEach fixture', async () => {
    const seed = await seedOneOfEach(h, shopA, owner, ctx.categoryId);
    const report = await shopReport.build(
      { shopId: shopA.shopId, from: '2026-06-01', to: '2026-06-30' },
      owner,
    );
    // Every number must equal the ACTIVE-only expected value from the
    // fixture — cancelled/reversed rows contribute exactly 0.
    expect(report.salesValue).toBe(seed.expected.salesValue);
    expect(report.cashAtSale).toBe(seed.expected.cashAtSale);
    expect(report.laterPayments).toBe(seed.expected.laterPayments);
    expect(report.totalCollected).toBe(seed.expected.totalCollected);
    expect(report.newDebt).toBe(seed.expected.newDebt);
    expect(report.outstanding).toBe(seed.expected.outstanding);
    expect(report.expenses).toBe(seed.expected.expenses);
    expect(report.netCollected).toBe(
      seed.expected.totalCollected - seed.expected.expenses,
    );
  });
});

describe('P7-04 · outstanding is as-of, not date-bound', () => {
  it('a debt sale from BEFORE the window still counts', async () => {
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    // Old debt (May) — must appear in outstanding even when the report
    // window is June only.
    await seedSaleAt('2026-05-01', 0, 5_000, customer.id);
    const juneReport = await shopReport.build(
      { shopId: shopA.shopId, from: '2026-06-01', to: '2026-06-30' },
      owner,
    );
    // Sales value in June: 0. Outstanding as-of end-of-June: 5,000.
    expect(juneReport.salesValue).toBe(0);
    expect(juneReport.newDebt).toBe(0);
    expect(juneReport.outstanding).toBe(5_000);
  });
});

describe('P7-04 · UTC date-boundary partitioning (D-015)', () => {
  it('a sale at 23:59:00Z lands in that UTC day; 00:01Z the next day does not', async () => {
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    const p = await h.prisma.product.create({
      data: {
        name: `p-${Math.random().toString(36).slice(2, 8)}`,
        categoryId: ctx.categoryId,
      },
    });
    await h.openingStock.create(
      { locationId: shopA.locationId, items: [{ productId: p.id, quantity: 5 }] },
      owner,
    );

    // Sale A: 23:59:00Z on 2026-06-15 (should count on 2026-06-15).
    // Sale B: 00:01:00Z on 2026-06-16 (should NOT count on 2026-06-15).
    await h.sales.confirm(
      {
        shopId: shopA.shopId,
        customerId: customer.id,
        amountPaidAtSale: 100,
        saleDate: '2026-06-15T23:59:00.000Z',
        items: [{ productId: p.id, quantity: 1, unitPrice: 100 }],
      },
      owner,
    );
    await h.sales.confirm(
      {
        shopId: shopA.shopId,
        customerId: customer.id,
        amountPaidAtSale: 200,
        saleDate: '2026-06-16T00:01:00.000Z',
        items: [{ productId: p.id, quantity: 1, unitPrice: 200 }],
      },
      owner,
    );

    // Filter by DATE-ONLY strings — resolveReportScope widens `to`
    // to end-of-day (23:59:59.999Z). Only the 23:59:00Z sale must
    // land in the day-15 window.
    const day15 = await shopReport.build(
      { shopId: shopA.shopId, from: '2026-06-15', to: '2026-06-15' },
      owner,
    );
    expect(day15.salesValue).toBe(100);
    expect(day15.cashAtSale).toBe(100);

    const day16 = await shopReport.build(
      { shopId: shopA.shopId, from: '2026-06-16', to: '2026-06-16' },
      owner,
    );
    expect(day16.salesValue).toBe(200);
    expect(day16.cashAtSale).toBe(200);
  });
});

describe('P7-04 · shop scoping', () => {
  it('OWNER filtering to shopA excludes shopB entirely', async () => {
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    // A sale in shopA.
    await seedSaleAt('2026-06-15', 1_000, 1_000, customer.id);
    // A sale in shopB (bypass the shopA helper).
    const p = await h.prisma.product.create({
      data: {
        name: `p-${Math.random().toString(36).slice(2, 8)}`,
        categoryId: ctx.categoryId,
      },
    });
    await h.openingStock.create(
      { locationId: shopB.locationId, items: [{ productId: p.id, quantity: 5 }] },
      owner,
    );
    await h.sales.confirm(
      {
        shopId: shopB.shopId,
        customerId: customer.id,
        amountPaidAtSale: 9_999,
        saleDate: '2026-06-15',
        items: [{ productId: p.id, quantity: 1, unitPrice: 9_999 }],
      },
      owner,
    );

    const shopAReport = await shopReport.build(
      { shopId: shopA.shopId, from: '2026-06-01', to: '2026-06-30' },
      owner,
    );
    expect(shopAReport.salesValue).toBe(1_000);
    expect(shopAReport.cashAtSale).toBe(1_000);

    // Cross-shop report — OWNER without a shopId sees the combined
    // figure. Serves the owner dashboard's per-shop-summary sibling.
    const allShops = await shopReport.build(
      { from: '2026-06-01', to: '2026-06-30' },
      owner,
    );
    expect(allShops.salesValue).toBe(10_999); // 1,000 + 9,999
  });

  it('SHOP user is forced to their assigned shop regardless of shopId query', async () => {
    // Owner-authored data in shopB.
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    const p = await h.prisma.product.create({
      data: {
        name: `p-${Math.random().toString(36).slice(2, 8)}`,
        categoryId: ctx.categoryId,
      },
    });
    await h.openingStock.create(
      { locationId: shopB.locationId, items: [{ productId: p.id, quantity: 5 }] },
      owner,
    );
    await h.sales.confirm(
      {
        shopId: shopB.shopId,
        customerId: customer.id,
        amountPaidAtSale: 5_000,
        saleDate: '2026-06-15',
        items: [{ productId: p.id, quantity: 1, unitPrice: 5_000 }],
      },
      owner,
    );

    const shopUserA: SessionUser = {
      id: ctx.userId,
      name: 'shop-a',
      role: 'SHOP',
      assignedShopId: shopA.shopId,
    };
    // Client asks for shopB; the resolver forces shopA. Numbers reflect
    // shopA — which is empty (no sales seeded there in this test).
    const report = await shopReport.build(
      { shopId: shopB.shopId, from: '2026-06-01', to: '2026-06-30' },
      shopUserA,
    );
    expect(report.scope.shopId).toBe(shopA.shopId);
    expect(report.salesValue).toBe(0);
  });
});
