import { OrderStatus } from '@prisma/client';
import { IncomingOrdersReportService } from '../../src/reports/incoming-orders-report.service';
import { createHarness, resetDatabase, seedBasics } from './setup';
import type { SessionUser } from '../../src/common/types/session-user';

const h = createHarness();
let svc: IncomingOrdersReportService;
let ctx: { categoryId: string; warehouseId: string; userId: string };
let owner: SessionUser;

beforeAll(() => {
  svc = new IncomingOrdersReportService(h.prisma);
});

beforeEach(async () => {
  await resetDatabase(h.prisma);
  ctx = await seedBasics(h.prisma);
  owner = { id: ctx.userId, name: 'Owner', role: 'OWNER', assignedShopId: null };
});

afterEach(async () => {
  const ledger = await h.inventory.verifyLedgerBalanceInvariant(h.prisma);
  expect(ledger).toEqual([]);
});

afterAll(async () => {
  await h.disconnect();
});

async function makeProduct(name = `p-${Math.random().toString(36).slice(2, 8)}`) {
  const p = await h.prisma.product.create({
    data: { name, categoryId: ctx.categoryId },
  });
  return p.id;
}

describe('P7-08 · byStatus + recentOrders', () => {
  it('rolls up ordered/received/remaining and lists recent orders', async () => {
    const p1 = await makeProduct();
    const p2 = await makeProduct();

    // Order #1: 100 units total, receive 40 → PARTIALLY_RECEIVED.
    const o1 = await h.orders.create(
      {
        orderDate: '2026-06-01',
        supplierName: 'Supplier A',
        items: [
          { productId: p1, quantityOrdered: 60 },
          { productId: p2, quantityOrdered: 40 },
        ],
      },
      owner,
    );
    await h.receive.receive(
      o1.id,
      {
        receiptDate: '2026-06-05',
        items: [
          { orderItemId: o1.items[0]!.id, quantity: 30 },
          { orderItemId: o1.items[1]!.id, quantity: 10 },
        ],
      },
      owner,
    );
    // Order #2: 50 units total, fully received.
    const o2 = await h.orders.create(
      {
        orderDate: '2026-06-10',
        supplierName: 'Supplier B',
        items: [{ productId: p1, quantityOrdered: 50 }],
      },
      owner,
    );
    await h.receive.receive(
      o2.id,
      {
        receiptDate: '2026-06-12',
        items: [{ orderItemId: o2.items[0]!.id, quantity: 50 }],
      },
      owner,
    );
    // Order #3: cancelled.
    const o3 = await h.orders.create(
      {
        orderDate: '2026-06-15',
        items: [{ productId: p2, quantityOrdered: 20 }],
      },
      owner,
    );
    await h.orders.cancel(o3.id, { reason: 'supplier cancelled' }, owner);

    const report = await svc.build({}, owner);

    const partial = report.byStatus.find(
      (r) => r.status === OrderStatus.PARTIALLY_RECEIVED,
    );
    const received = report.byStatus.find(
      (r) => r.status === OrderStatus.RECEIVED,
    );
    const cancelled = report.byStatus.find(
      (r) => r.status === OrderStatus.CANCELLED,
    );
    expect(partial?.ordersCount).toBe(1);
    expect(partial?.orderedUnits).toBe(100);
    expect(partial?.receivedUnits).toBe(40);
    expect(partial?.remainingUnits).toBe(60);

    expect(received?.ordersCount).toBe(1);
    expect(received?.orderedUnits).toBe(50);
    expect(received?.receivedUnits).toBe(50);
    expect(received?.remainingUnits).toBe(0);

    expect(cancelled?.ordersCount).toBe(1);
    expect(cancelled?.orderedUnits).toBe(20);
    expect(cancelled?.receivedUnits).toBe(0);
    // remaining on a cancelled order is still ordered−received; the
    // report doesn't zero it out to preserve the audit trail. The UI
    // can decide whether to show it.
    expect(cancelled?.remainingUnits).toBe(20);

    // recentOrders is newest-first by orderDate.
    expect(report.recentOrders.map((o) => o.id)).toEqual([o3.id, o2.id, o1.id]);
  });
});
