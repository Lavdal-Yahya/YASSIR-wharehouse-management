import { EstimatedProfitService } from '../../src/reports/estimated-profit.service';
import {
  createHarness,
  makeShopLocation,
  resetDatabase,
  seedBasics,
} from './setup';
import type { SessionUser } from '../../src/common/types/session-user';

// P7-09 · estimated profit — the label discipline is the point
// (spec §27). Tests verify:
//   * COGS sums only lines with a unitCostSnapshot.
//   * Coverage denominator is line count (advisor choice).
//   * isEstimated flips true when ANY line is missing its snapshot.
//   * grossEstimated = salesValue − cogs.
//   * Empty window is fully-covered (nothing to estimate).

const h = createHarness();
let svc: EstimatedProfitService;
let ctx: { categoryId: string; warehouseId: string; userId: string };
let owner: SessionUser;
let shop: { shopId: string; locationId: string };

beforeAll(() => {
  svc = new EstimatedProfitService(h.prisma);
});

beforeEach(async () => {
  await resetDatabase(h.prisma);
  ctx = await seedBasics(h.prisma);
  owner = { id: ctx.userId, name: 'Owner', role: 'OWNER', assignedShopId: null };
  shop = await makeShopLocation(h.prisma);
});

afterEach(async () => {
  const ledger = await h.inventory.verifyLedgerBalanceInvariant(h.prisma);
  expect(ledger).toEqual([]);
  const saleCoherence = await h.sales.verifySaleCoherenceInvariant();
  expect(saleCoherence).toEqual([]);
});

afterAll(async () => {
  await h.disconnect();
});

async function makeProductWithCost(cost: number | null, qty = 10) {
  const p = await h.prisma.product.create({
    data: {
      name: `p-${Math.random().toString(36).slice(2, 8)}`,
      categoryId: ctx.categoryId,
      defaultPurchaseCost: cost,
    },
  });
  await h.openingStock.create(
    { locationId: shop.locationId, items: [{ productId: p.id, quantity: qty }] },
    owner,
  );
  return p.id;
}

describe('P7-09 · full coverage (every line has a cost snapshot)', () => {
  it('grossEstimated = salesValue − cogs; isEstimated false; ratio 1', async () => {
    const p1 = await makeProductWithCost(600); // profit 400/unit at 1,000 sale
    const p2 = await makeProductWithCost(800); // profit 200/unit at 1,000 sale
    await h.sales.confirm(
      {
        shopId: shop.shopId,
        amountPaidAtSale: 3_000,
        saleDate: '2026-06-15',
        items: [
          { productId: p1, quantity: 2, unitPrice: 1_000 }, // rev 2,000, cost 1,200
          { productId: p2, quantity: 1, unitPrice: 1_000 }, // rev 1,000, cost 800
        ],
      },
      owner,
    );
    const report = await svc.build(
      { shopId: shop.shopId, from: '2026-06-01', to: '2026-06-30' },
      owner,
    );
    expect(report.salesValue).toBe(3_000);
    expect(report.cogs).toBe(2_000); // 1,200 + 800
    expect(report.grossEstimated).toBe(1_000);
    expect(report.coverage).toEqual({
      lineCount: 2,
      linesWithCost: 2,
      ratio: 1,
    });
    expect(report.isEstimated).toBe(false);
  });
});

describe('P7-09 · partial coverage (one line without a cost snapshot)', () => {
  it('COGS excludes the snapshot-less line; isEstimated flips true', async () => {
    const pKnown = await makeProductWithCost(600);
    const pUnknown = await makeProductWithCost(null);
    await h.sales.confirm(
      {
        shopId: shop.shopId,
        amountPaidAtSale: 2_000,
        saleDate: '2026-06-15',
        items: [
          { productId: pKnown, quantity: 1, unitPrice: 1_000 },
          { productId: pUnknown, quantity: 1, unitPrice: 1_000 },
        ],
      },
      owner,
    );
    const report = await svc.build(
      { shopId: shop.shopId, from: '2026-06-01', to: '2026-06-30' },
      owner,
    );
    expect(report.salesValue).toBe(2_000);
    expect(report.cogs).toBe(600); // only pKnown contributes
    expect(report.grossEstimated).toBe(1_400);
    expect(report.coverage.lineCount).toBe(2);
    expect(report.coverage.linesWithCost).toBe(1);
    expect(report.coverage.ratio).toBe(0.5);
    expect(report.isEstimated).toBe(true); // must be labeled estimated
  });
});

describe('P7-09 · empty window is fully covered', () => {
  it('zero lines → coverage.ratio 1 and isEstimated false', async () => {
    const report = await svc.build(
      { shopId: shop.shopId, from: '2026-06-01', to: '2026-06-30' },
      owner,
    );
    expect(report.salesValue).toBe(0);
    expect(report.cogs).toBe(0);
    expect(report.grossEstimated).toBe(0);
    expect(report.coverage.ratio).toBe(1);
    expect(report.isEstimated).toBe(false);
  });
});

describe('P7-09 · never renders a net profit field', () => {
  it('response shape has no netProfit key even with full coverage', async () => {
    const p = await makeProductWithCost(500);
    await h.sales.confirm(
      {
        shopId: shop.shopId,
        amountPaidAtSale: 1_000,
        saleDate: '2026-06-15',
        items: [{ productId: p, quantity: 1, unitPrice: 1_000 }],
      },
      owner,
    );
    const report = await svc.build(
      { shopId: shop.shopId, from: '2026-06-01', to: '2026-06-30' },
      owner,
    );
    // Belt: assert the field simply isn't there. spec §27 forbids
    // rendering net profit; making the field absent means the UI
    // can't accidentally show it.
    expect(report).not.toHaveProperty('netProfit');
  });
});
