import { DebtReportService } from '../../src/reports/debt-report.service';
import {
  createHarness,
  makeShopLocation,
  resetDatabase,
  seedBasics,
} from './setup';
import { seedOneOfEach } from './report-scenarios';
import type { SessionUser } from '../../src/common/types/session-user';

const h = createHarness();
let svc: DebtReportService;
let ctx: { categoryId: string; warehouseId: string; userId: string };
let owner: SessionUser;
let shopA: { shopId: string; locationId: string };
let shopB: { shopId: string; locationId: string };

beforeAll(() => {
  svc = new DebtReportService(h.prisma);
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

async function makeSale(
  shop: { shopId: string; locationId: string },
  customerId: string,
  unitPrice: number,
  amountPaidAtSale: number,
  saleDate = '2026-06-15',
) {
  const p = await h.prisma.product.create({
    data: {
      name: `p-${Math.random().toString(36).slice(2, 8)}`,
      categoryId: ctx.categoryId,
    },
  });
  await h.openingStock.create(
    { locationId: shop.locationId, items: [{ productId: p.id, quantity: 5 }] },
    owner,
  );
  return h.sales.confirm(
    {
      shopId: shop.shopId,
      customerId,
      amountPaidAtSale,
      saleDate,
      items: [{ productId: p.id, quantity: 1, unitPrice }],
    },
    owner,
  );
}

describe('P7-07 · outstandingByCustomer + outstandingByShop', () => {
  it('sorts customers by amount owed and splits by shop', async () => {
    const ali = await h.prisma.customer.create({ data: { name: 'Ali' } });
    const bilal = await h.prisma.customer.create({ data: { name: 'Bilal' } });
    // Ali owes 5,000 at shopA + 3,000 at shopB; Bilal owes 1,000 at shopA.
    await makeSale(shopA, ali.id, 5_000, 0);
    await makeSale(shopB, ali.id, 3_000, 0);
    await makeSale(shopA, bilal.id, 1_000, 0);

    const report = await svc.build({}, owner);

    expect(report.outstandingByCustomer[0]).toMatchObject({
      customerName: 'Ali',
      outstanding: 8_000,
      unpaidSalesCount: 2,
    });
    expect(report.outstandingByCustomer[1]).toMatchObject({
      customerName: 'Bilal',
      outstanding: 1_000,
    });

    const shopAOut = report.outstandingByShop.find(
      (r) => r.shopId === shopA.shopId,
    );
    const shopBOut = report.outstandingByShop.find(
      (r) => r.shopId === shopB.shopId,
    );
    expect(shopAOut?.outstanding).toBe(6_000); // 5,000 + 1,000
    expect(shopAOut?.debtorsCount).toBe(2);
    expect(shopBOut?.outstanding).toBe(3_000);
    expect(shopBOut?.debtorsCount).toBe(1);
  });

  it('is as-of: an old debt shows even with a future-only window', async () => {
    const ali = await h.prisma.customer.create({ data: { name: 'Ali' } });
    await makeSale(shopA, ali.id, 5_000, 0, '2026-05-01');
    const report = await svc.build(
      { from: '2026-06-01', to: '2026-06-30' },
      owner,
    );
    expect(report.outstandingByCustomer[0]?.outstanding).toBe(5_000);
  });
});

describe('P7-07 · paymentsInPeriod uses paymentDate + ACTIVE only', () => {
  it('lists only ACTIVE payments and reversed ones vanish', async () => {
    await seedOneOfEach(h, shopA, owner, ctx.categoryId);
    const report = await svc.build(
      { shopId: shopA.shopId, from: '2026-06-01', to: '2026-06-30' },
      owner,
    );
    // Only the active payment; the reversed one is gone.
    expect(report.paymentsInPeriod).toHaveLength(1);
    expect(report.paymentsInPeriod[0]?.amount).toBe(1_500);
  });
});
