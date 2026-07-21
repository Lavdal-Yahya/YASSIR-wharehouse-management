import { WarehouseReportService } from '../../src/reports/warehouse-report.service';
import {
  createHarness,
  makeShopLocation,
  resetDatabase,
  seedBasics,
} from './setup';
import type { SessionUser } from '../../src/common/types/session-user';

// Phase 7 · warehouse report (P7-05). Reads over the Phase 3 ledger
// + balances. No money model involvement. Standing invariants stay
// green (they don't touch this report but any test suite must keep
// them healthy).

const h = createHarness();
let svc: WarehouseReportService;
let ctx: { categoryId: string; warehouseId: string; userId: string };
let owner: SessionUser;
let shop: { shopId: string; locationId: string };

beforeAll(() => {
  svc = new WarehouseReportService(h.prisma);
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
  const paymentSnapshot = await h.payments.verifyPaymentSnapshotInvariant();
  expect(paymentSnapshot).toEqual([]);
});

afterAll(async () => {
  await h.disconnect();
});

async function makeProduct(name = `p-${Math.random().toString(36).slice(2, 8)}`, lowStockThreshold?: number) {
  const p = await h.prisma.product.create({
    data: { name, categoryId: ctx.categoryId, lowStockThreshold },
  });
  return p.id;
}

describe('P7-05 · current stock + low/out-of-stock', () => {
  it('sums balances and counts low/out-of-stock against thresholds', async () => {
    // p1 = 100, threshold 10 → healthy
    // p2 = 5, threshold 10 → low
    // p3 = 0, threshold 10 → out-of-stock (excluded from low count)
    const [p1, p2, p3] = await Promise.all([
      makeProduct('p1', 10),
      makeProduct('p2', 10),
      makeProduct('p3', 10),
    ]);
    await h.openingStock.create(
      {
        locationId: ctx.warehouseId,
        items: [
          { productId: p1, quantity: 100 },
          { productId: p2, quantity: 5 },
        ],
      },
      owner,
    );
    // Force a zero row for p3 by opening stock then correcting down.
    await h.openingStock.create(
      { locationId: ctx.warehouseId, items: [{ productId: p3, quantity: 3 }] },
      owner,
    );
    await h.corrections.create(
      {
        locationId: ctx.warehouseId,
        productId: p3,
        adjustmentQuantity: -3,
        reason: 'wastage',
      },
      owner,
    );

    const report = await svc.build({}, owner);
    expect(report.currentStock).toBe(105); // 100 + 5 + 0
    expect(report.distinctProducts).toBe(2); // p3 at zero excluded
    expect(report.lowStockCount).toBe(1); // p2 only
    expect(report.outOfStockCount).toBe(1); // p3 only
  });
});

describe('P7-05 · flows (received / transferredOut / corrections)', () => {
  it('sums receipts, transfers out, and corrections in the date window', async () => {
    const p = await makeProduct();
    // A direct receipt of 50 to the warehouse.
    await h.receipts.createDirect(
      {
        receiptDate: '2026-06-15',
        items: [{ productId: p, quantity: 50 }],
      },
      owner,
    );
    // Transfer 10 to shop.
    await h.transfers.create(
      {
        sourceLocationId: ctx.warehouseId,
        destinationLocationId: shop.locationId,
        transferDate: '2026-06-16',
        items: [{ productId: p, quantity: 10 }],
      },
      owner,
    );
    // +correction of 3 (found extra) — encoded as destinationLocation
    // via the corrections service.
    await h.corrections.create(
      {
        locationId: ctx.warehouseId,
        productId: p,
        adjustmentQuantity: 3,
        reason: 'found extra',
      },
      owner,
    );
    // -correction of 2.
    await h.corrections.create(
      {
        locationId: ctx.warehouseId,
        productId: p,
        adjustmentQuantity: -2,
        reason: 'damage',
      },
      owner,
    );

    const report = await svc.build({}, owner);
    expect(report.received.directReceipts).toBe(50);
    expect(report.received.orderReceipts).toBe(0);
    expect(report.received.total).toBe(50);
    expect(report.transferredOut).toBe(10);
    expect(report.corrections.up).toBe(3);
    expect(report.corrections.down).toBe(2);
    expect(report.corrections.net).toBe(1);
    // Current stock: 50 received - 10 transferred + 3 up - 2 down = 41
    expect(report.currentStock).toBe(41);
  });

  it('date window narrows the flow numbers; currentStock stays as-of', async () => {
    const p = await makeProduct();
    // A receipt in May, a receipt in June.
    await h.receipts.createDirect(
      { receiptDate: '2026-05-15', items: [{ productId: p, quantity: 40 }] },
      owner,
    );
    await h.receipts.createDirect(
      { receiptDate: '2026-06-15', items: [{ productId: p, quantity: 60 }] },
      owner,
    );
    // Note: createdAt uses NOW() (not the receiptDate); the movement
    // ledger's timestamp is what the report window filters on. Both
    // movements land at "now" during test, so both are inside any
    // range that includes now. Verify total currentStock, then narrow
    // by a window that excludes NOW → both flows drop out but stock
    // remains.
    const wide = await svc.build({}, owner);
    expect(wide.currentStock).toBe(100);
    expect(wide.received.total).toBe(100);

    const oldWindow = await svc.build(
      { from: '2020-01-01', to: '2020-12-31' },
      owner,
    );
    expect(oldWindow.currentStock).toBe(100); // as-of, unchanged
    expect(oldWindow.received.total).toBe(0); // no flow in that window
  });
});
