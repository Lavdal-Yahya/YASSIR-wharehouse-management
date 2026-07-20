import { MovementType, OrderStatus } from '@prisma/client';
import { InsufficientStockError } from '../../src/inventory/errors';
import {
  OrderNotEditableError,
  ReceiveEmptyError,
  ReceiveExceedsRemainingError,
} from '../../src/incoming-orders/errors';
import { OpeningStockAlreadyExistsError } from '../../src/inventory/opening-stock.service';
import {
  createHarness,
  makeProduct,
  resetDatabase,
  seedBasics,
} from './setup';
import type { SessionUser } from '../../src/common/types/session-user';

// Phase 3 integration suite (P3-13). Runs against the dev Postgres.
// Asserts by reading the database, not API bodies — this is the contract
// per conventions §5.

const h = createHarness();
let ctx: { categoryId: string; warehouseId: string; userId: string };
let user: SessionUser;

beforeEach(async () => {
  await resetDatabase(h.prisma);
  ctx = await seedBasics(h.prisma);
  user = { id: ctx.userId, name: 'Test Owner', role: 'OWNER', assignedShopId: null };
});

// Standing invariant #1 (architecture §3.5): after EVERY test, ledger sums
// must equal balance rows for every (location, product).
afterEach(async () => {
  const violations = await h.inventory.verifyLedgerBalanceInvariant(h.prisma);
  expect(violations).toEqual([]);
});

afterAll(async () => {
  await h.disconnect();
});

describe('P3-13 · receive order', () => {
  it('1. receive full order → balance +N, receipt row, movement row, RECEIVED', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    const order = await h.orders.create(
      {
        orderDate: new Date().toISOString(),
        items: [{ productId, quantityOrdered: 10 }],
      },
      user,
    );

    await h.receive.receive(
      order.id,
      { items: [{ orderItemId: order.items[0]!.id, quantity: 10 }] },
      user,
    );

    const [balance, movements, refreshed] = await Promise.all([
      h.prisma.inventoryBalance.findUnique({
        where: { locationId_productId: { locationId: ctx.warehouseId, productId } },
      }),
      h.prisma.inventoryMovement.findMany({ where: { productId } }),
      h.prisma.incomingOrder.findUnique({ where: { id: order.id } }),
    ]);
    expect(balance?.quantity).toBe(10);
    expect(movements).toHaveLength(1);
    expect(movements[0]!.movementType).toBe(MovementType.ORDER_RECEIPT);
    expect(movements[0]!.destinationLocationId).toBe(ctx.warehouseId);
    expect(refreshed?.status).toBe(OrderStatus.RECEIVED);
  });

  it('2. partial then remainder → PARTIALLY_RECEIVED then RECEIVED; over-receive rejected', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    const order = await h.orders.create(
      { orderDate: new Date().toISOString(), items: [{ productId, quantityOrdered: 100 }] },
      user,
    );

    // Over-receive rejected up front (asks for 101 of 100).
    await expect(
      h.receive.receive(
        order.id,
        { items: [{ orderItemId: order.items[0]!.id, quantity: 101 }] },
        user,
      ),
    ).rejects.toBeInstanceOf(ReceiveExceedsRemainingError);

    // The rejected call must have written nothing.
    let ms = await h.prisma.inventoryMovement.findMany({ where: { productId } });
    expect(ms).toHaveLength(0);

    // Receive 70.
    await h.receive.receive(
      order.id,
      { items: [{ orderItemId: order.items[0]!.id, quantity: 70 }] },
      user,
    );
    let refreshed = await h.orders.findOne(order.id);
    expect(refreshed.status).toBe(OrderStatus.PARTIALLY_RECEIVED);
    expect(refreshed.items[0]!.quantityReceived).toBe(70);
    expect(refreshed.items[0]!.quantityRemaining).toBe(30);

    // Receive remaining 30.
    await h.receive.receive(
      order.id,
      { items: [{ orderItemId: order.items[0]!.id, quantity: 30 }] },
      user,
    );
    refreshed = await h.orders.findOne(order.id);
    expect(refreshed.status).toBe(OrderStatus.RECEIVED);

    ms = await h.prisma.inventoryMovement.findMany({ where: { productId } });
    expect(ms).toHaveLength(2);
    const balance = await h.prisma.inventoryBalance.findUnique({
      where: { locationId_productId: { locationId: ctx.warehouseId, productId } },
    });
    expect(balance?.quantity).toBe(100);
  });

  it('3. inline new product → exists with zero stock until received', async () => {
    const order = await h.orders.create(
      {
        orderDate: new Date().toISOString(),
        items: [
          {
            newProduct: { name: `Inline-${Date.now()}`, categoryId: ctx.categoryId },
            quantityOrdered: 5,
          },
        ],
      },
      user,
    );
    const item = order.items[0]!;
    const p = await h.prisma.product.findUnique({ where: { id: item.productId } });
    expect(p).toBeTruthy();
    const balance = await h.prisma.inventoryBalance.findUnique({
      where: { locationId_productId: { locationId: ctx.warehouseId, productId: item.productId } },
    });
    // No balance row yet — the ordered qty isn't stock.
    expect(balance).toBeNull();
  });

  it('rejects empty receive (all zeros)', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    const order = await h.orders.create(
      { orderDate: new Date().toISOString(), items: [{ productId, quantityOrdered: 3 }] },
      user,
    );
    await expect(
      h.receive.receive(
        order.id,
        { items: [{ orderItemId: order.items[0]!.id, quantity: 0 }] },
        user,
      ),
    ).rejects.toBeInstanceOf(ReceiveEmptyError);
  });
});

describe('P3-13 · cancel order', () => {
  it('4. cancel untouched → no stock, CANCELLED, reason stored', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    const order = await h.orders.create(
      { orderDate: new Date().toISOString(), items: [{ productId, quantityOrdered: 4 }] },
      user,
    );

    await h.orders.cancel(order.id, { reason: 'supplier bankrupt' }, user);

    const refreshed = await h.prisma.incomingOrder.findUnique({ where: { id: order.id } });
    expect(refreshed?.status).toBe(OrderStatus.CANCELLED);
    expect(refreshed?.cancellationReason).toBe('supplier bankrupt');
    expect(refreshed?.cancelledBy).toBe(user.id);
    const ms = await h.prisma.inventoryMovement.count({ where: { productId } });
    expect(ms).toBe(0);
  });

  it('5. cancel partially-received order → received stock intact, order CANCELLED', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    const order = await h.orders.create(
      { orderDate: new Date().toISOString(), items: [{ productId, quantityOrdered: 10 }] },
      user,
    );
    await h.receive.receive(
      order.id,
      { items: [{ orderItemId: order.items[0]!.id, quantity: 4 }] },
      user,
    );
    await h.orders.cancel(order.id, { reason: 'stopped shipment' }, user);

    const refreshed = await h.prisma.incomingOrder.findUnique({ where: { id: order.id } });
    expect(refreshed?.status).toBe(OrderStatus.CANCELLED);
    const balance = await h.prisma.inventoryBalance.findUnique({
      where: { locationId_productId: { locationId: ctx.warehouseId, productId } },
    });
    // Physically-arrived stock stays (phase-3 §3 interpretation).
    expect(balance?.quantity).toBe(4);
    const receipts = await h.prisma.stockReceipt.count({ where: { incomingOrderId: order.id } });
    expect(receipts).toBe(1);
  });

  it('rejects cancelling a RECEIVED order', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    const order = await h.orders.create(
      { orderDate: new Date().toISOString(), items: [{ productId, quantityOrdered: 2 }] },
      user,
    );
    await h.receive.receive(
      order.id,
      { items: [{ orderItemId: order.items[0]!.id, quantity: 2 }] },
      user,
    );
    await expect(
      h.orders.cancel(order.id, { reason: 'too late' }, user),
    ).rejects.toBeInstanceOf(OrderNotEditableError);
  });
});

describe('P3-13 · direct receipt', () => {
  it('6. direct receipt → balance + movement with null incomingOrderId', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    const rec = await h.receipts.createDirect(
      { items: [{ productId, quantity: 7, unitCost: 250 }] },
      user,
    );
    const receipt = await h.prisma.stockReceipt.findUnique({ where: { id: rec.id } });
    expect(receipt?.incomingOrderId).toBeNull();
    const balance = await h.prisma.inventoryBalance.findUnique({
      where: { locationId_productId: { locationId: ctx.warehouseId, productId } },
    });
    expect(balance?.quantity).toBe(7);
    const m = await h.prisma.inventoryMovement.findFirst({ where: { productId } });
    expect(m?.movementType).toBe(MovementType.DIRECT_RECEIPT);
  });
});

describe('P3-13 · opening stock', () => {
  it('7. opening stock creates a movement; second opening for same pair rejected', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await h.openingStock.create(
      { locationId: ctx.warehouseId, items: [{ productId, quantity: 12 }] },
      user,
    );
    const balance = await h.prisma.inventoryBalance.findUnique({
      where: { locationId_productId: { locationId: ctx.warehouseId, productId } },
    });
    expect(balance?.quantity).toBe(12);
    const m = await h.prisma.inventoryMovement.findFirst({ where: { productId } });
    expect(m?.movementType).toBe(MovementType.OPENING_STOCK);

    // Second opening for the same (loc, product) must fail.
    await expect(
      h.openingStock.create(
        { locationId: ctx.warehouseId, items: [{ productId, quantity: 1 }] },
        user,
      ),
    ).rejects.toBeInstanceOf(OpeningStockAlreadyExistsError);
  });
});

describe('P3-13 · corrections', () => {
  it('8. correction -2 reduces balance; below-available rejected', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await h.receipts.createDirect(
      { items: [{ productId, quantity: 5 }] },
      user,
    );

    await h.corrections.create(
      {
        locationId: ctx.warehouseId,
        productId,
        adjustmentQuantity: -2,
        reason: 'damaged in transit',
      },
      user,
    );
    let balance = await h.prisma.inventoryBalance.findUnique({
      where: { locationId_productId: { locationId: ctx.warehouseId, productId } },
    });
    expect(balance?.quantity).toBe(3);

    // Try to remove 10 — only 3 left; rejected before any write.
    await expect(
      h.corrections.create(
        {
          locationId: ctx.warehouseId,
          productId,
          adjustmentQuantity: -10,
          reason: 'accidental',
        },
        user,
      ),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    balance = await h.prisma.inventoryBalance.findUnique({
      where: { locationId_productId: { locationId: ctx.warehouseId, productId } },
    });
    expect(balance?.quantity).toBe(3);
  });
});

describe('P3-13 · concurrency', () => {
  it('10. two parallel direct receipts on one product → final balance exact', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await Promise.all([
      h.receipts.createDirect({ items: [{ productId, quantity: 4 }] }, user),
      h.receipts.createDirect({ items: [{ productId, quantity: 6 }] }, user),
    ]);
    const balance = await h.prisma.inventoryBalance.findUnique({
      where: { locationId_productId: { locationId: ctx.warehouseId, productId } },
    });
    expect(balance?.quantity).toBe(10);
  });

  it('10b. crossed lock order — A(p1,p2) and B(p2,p1) in parallel → no deadlock', async () => {
    const p1 = await makeProduct(h.prisma, ctx.categoryId);
    const p2 = await makeProduct(h.prisma, ctx.categoryId);
    // A batches (p1, p2); B batches (p2, p1) — different item orders. The
    // sorted lock pass in applyMovements is what keeps this deadlock-free.
    await Promise.all([
      h.receipts.createDirect(
        { items: [{ productId: p1, quantity: 2 }, { productId: p2, quantity: 3 }] },
        user,
      ),
      h.receipts.createDirect(
        { items: [{ productId: p2, quantity: 5 }, { productId: p1, quantity: 4 }] },
        user,
      ),
    ]);
    const b1 = await h.prisma.inventoryBalance.findUnique({
      where: { locationId_productId: { locationId: ctx.warehouseId, productId: p1 } },
    });
    const b2 = await h.prisma.inventoryBalance.findUnique({
      where: { locationId_productId: { locationId: ctx.warehouseId, productId: p2 } },
    });
    expect(b1?.quantity).toBe(6);
    expect(b2?.quantity).toBe(8);
  });
});
