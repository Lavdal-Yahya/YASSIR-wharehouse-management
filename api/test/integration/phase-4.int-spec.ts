import { MovementType, TransferStatus } from '@prisma/client';
import { InventoryService } from '../../src/inventory/inventory.service';
import { InsufficientStockError } from '../../src/inventory/errors';
import {
  DestinationInsufficientStockError,
  DuplicateTransferItemError,
  LocationArchivedError,
  TransferNoItemsError,
  TransferNotReversibleError,
  TransferSameLocationError,
} from '../../src/transfers/errors';
import {
  createHarness,
  makeProduct,
  makeShopLocation,
  resetDatabase,
  seedBasics,
} from './setup';
import type { SessionUser } from '../../src/common/types/session-user';

// Phase 4 integration suite (P4-09). Runs against the dev Postgres.
// Follows phase-4.md §6 test list. The invariant afterEach mirrors Phase 3
// and is the load-bearing safety net for the whole ledger.

const h = createHarness();
let ctx: { categoryId: string; warehouseId: string; userId: string };
let user: SessionUser;

beforeEach(async () => {
  await resetDatabase(h.prisma);
  ctx = await seedBasics(h.prisma);
  user = { id: ctx.userId, name: 'Test Owner', role: 'OWNER', assignedShopId: null };
});

afterEach(async () => {
  const violations = await h.inventory.verifyLedgerBalanceInvariant(h.prisma);
  expect(violations).toEqual([]);
});

afterAll(async () => {
  await h.disconnect();
});

async function seedStock(productId: string, locationId: string, qty: number) {
  // Bootstrap balance via opening stock — the only movement type allowed on
  // the initial (loc, product) pair. Reuses the chokepoint so it's real.
  await h.openingStock.create(
    { locationId, items: [{ productId, quantity: qty }] },
    user,
  );
}

describe('P4-09 · canonical transfer', () => {
  it('1. warehouse 20 → transfer 5 to shop → 15/5, TRF row, one movement per item with both sides set', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, ctx.warehouseId, 20);
    const shop = await makeShopLocation(h.prisma);

    const t = await h.transfers.create(
      {
        sourceLocationId: ctx.warehouseId,
        destinationLocationId: shop.locationId,
        transferDate: new Date().toISOString(),
        items: [{ productId, quantity: 5 }],
      },
      user,
    );

    expect(t.referenceNumber).toMatch(/^TRF-/);
    expect(t.status).toBe(TransferStatus.COMPLETED);

    const [srcBal, dstBal, transferMoves] = await Promise.all([
      h.prisma.inventoryBalance.findUnique({
        where: { locationId_productId: { locationId: ctx.warehouseId, productId } },
      }),
      h.prisma.inventoryBalance.findUnique({
        where: { locationId_productId: { locationId: shop.locationId, productId } },
      }),
      h.prisma.inventoryMovement.findMany({
        where: { productId, movementType: MovementType.TRANSFER },
      }),
    ]);
    expect(srcBal?.quantity).toBe(15);
    expect(dstBal?.quantity).toBe(5);
    expect(transferMoves).toHaveLength(1);
    expect(transferMoves[0]!.sourceLocationId).toBe(ctx.warehouseId);
    expect(transferMoves[0]!.destinationLocationId).toBe(shop.locationId);
    expect(transferMoves[0]!.relatedEntityType).toBe('StockTransfer');
    expect(transferMoves[0]!.relatedEntityId).toBe(t.id);
  });
});

describe('P4-09 · atomicity', () => {
  it('2. multi-item transfer is all-or-nothing: item 2 exceeds stock → zero movements', async () => {
    const p1 = await makeProduct(h.prisma, ctx.categoryId);
    const p2 = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(p1, ctx.warehouseId, 10);
    await seedStock(p2, ctx.warehouseId, 3); // will fail (need 5)
    const shop = await makeShopLocation(h.prisma);

    await expect(
      h.transfers.create(
        {
          sourceLocationId: ctx.warehouseId,
          destinationLocationId: shop.locationId,
          transferDate: new Date().toISOString(),
          items: [
            { productId: p1, quantity: 4 },
            { productId: p2, quantity: 5 },
          ],
        },
        user,
      ),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    const [transfers, moves, srcP1, srcP2, dstP1, dstP2] = await Promise.all([
      h.prisma.stockTransfer.count(),
      h.prisma.inventoryMovement.count({
        where: { movementType: MovementType.TRANSFER },
      }),
      h.prisma.inventoryBalance.findUnique({
        where: { locationId_productId: { locationId: ctx.warehouseId, productId: p1 } },
      }),
      h.prisma.inventoryBalance.findUnique({
        where: { locationId_productId: { locationId: ctx.warehouseId, productId: p2 } },
      }),
      h.prisma.inventoryBalance.findUnique({
        where: { locationId_productId: { locationId: shop.locationId, productId: p1 } },
      }),
      h.prisma.inventoryBalance.findUnique({
        where: { locationId_productId: { locationId: shop.locationId, productId: p2 } },
      }),
    ]);
    expect(transfers).toBe(0);
    expect(moves).toBe(0);
    expect(srcP1?.quantity).toBe(10);
    expect(srcP2?.quantity).toBe(3);
    expect(dstP1).toBeNull();
    expect(dstP2).toBeNull();
  });

  it('3. rollback proof: forcing applyMovements to throw after the transfer insert leaves nothing behind', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, ctx.warehouseId, 10);
    const shop = await makeShopLocation(h.prisma);

    const spy = jest
      .spyOn(InventoryService.prototype, 'applyMovements')
      .mockImplementationOnce(async () => {
        throw new Error('simulated inventory failure');
      });

    await expect(
      h.transfers.create(
        {
          sourceLocationId: ctx.warehouseId,
          destinationLocationId: shop.locationId,
          transferDate: new Date().toISOString(),
          items: [{ productId, quantity: 3 }],
        },
        user,
      ),
    ).rejects.toThrow('simulated inventory failure');

    spy.mockRestore();

    const [transfers, items, srcBal, dstBal] = await Promise.all([
      h.prisma.stockTransfer.count(),
      h.prisma.stockTransferItem.count(),
      h.prisma.inventoryBalance.findUnique({
        where: { locationId_productId: { locationId: ctx.warehouseId, productId } },
      }),
      h.prisma.inventoryBalance.findUnique({
        where: { locationId_productId: { locationId: shop.locationId, productId } },
      }),
    ]);
    expect(transfers).toBe(0);
    expect(items).toBe(0);
    expect(srcBal?.quantity).toBe(10);
    expect(dstBal).toBeNull();
  });
});

describe('P4-09 · validation', () => {
  it('4. same source/destination → TransferSameLocationError (service level; DB CHECK is the backstop)', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, ctx.warehouseId, 5);

    await expect(
      h.transfers.create(
        {
          sourceLocationId: ctx.warehouseId,
          destinationLocationId: ctx.warehouseId,
          transferDate: new Date().toISOString(),
          items: [{ productId, quantity: 1 }],
        },
        user,
      ),
    ).rejects.toBeInstanceOf(TransferSameLocationError);
  });

  it('5. archived destination → LocationArchivedError', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, ctx.warehouseId, 5);
    const shop = await makeShopLocation(h.prisma);
    await h.prisma.location.update({
      where: { id: shop.locationId },
      data: { active: false },
    });

    await expect(
      h.transfers.create(
        {
          sourceLocationId: ctx.warehouseId,
          destinationLocationId: shop.locationId,
          transferDate: new Date().toISOString(),
          items: [{ productId, quantity: 1 }],
        },
        user,
      ),
    ).rejects.toBeInstanceOf(LocationArchivedError);
  });

  it('rejects empty items and duplicate productIds', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, ctx.warehouseId, 5);
    const shop = await makeShopLocation(h.prisma);

    await expect(
      h.transfers.create(
        {
          sourceLocationId: ctx.warehouseId,
          destinationLocationId: shop.locationId,
          transferDate: new Date().toISOString(),
          items: [],
        },
        user,
      ),
    ).rejects.toBeInstanceOf(TransferNoItemsError);

    await expect(
      h.transfers.create(
        {
          sourceLocationId: ctx.warehouseId,
          destinationLocationId: shop.locationId,
          transferDate: new Date().toISOString(),
          items: [
            { productId, quantity: 1 },
            { productId, quantity: 2 },
          ],
        },
        user,
      ),
    ).rejects.toBeInstanceOf(DuplicateTransferItemError);
  });
});

describe('P4-09 · direction', () => {
  it('6. shop → warehouse return works (direction is just data)', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    const shop = await makeShopLocation(h.prisma);
    await seedStock(productId, shop.locationId, 8);

    await h.transfers.create(
      {
        sourceLocationId: shop.locationId,
        destinationLocationId: ctx.warehouseId,
        transferDate: new Date().toISOString(),
        items: [{ productId, quantity: 3 }],
      },
      user,
    );
    const [shopBal, whBal] = await Promise.all([
      h.prisma.inventoryBalance.findUnique({
        where: { locationId_productId: { locationId: shop.locationId, productId } },
      }),
      h.prisma.inventoryBalance.findUnique({
        where: { locationId_productId: { locationId: ctx.warehouseId, productId } },
      }),
    ]);
    expect(shopBal?.quantity).toBe(5);
    expect(whBal?.quantity).toBe(3);
  });

  it('7. shop A → shop B works (D-014)', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    const shopA = await makeShopLocation(h.prisma);
    const shopB = await makeShopLocation(h.prisma);
    await seedStock(productId, shopA.locationId, 7);

    await h.transfers.create(
      {
        sourceLocationId: shopA.locationId,
        destinationLocationId: shopB.locationId,
        transferDate: new Date().toISOString(),
        items: [{ productId, quantity: 4 }],
      },
      user,
    );
    const [aBal, bBal] = await Promise.all([
      h.prisma.inventoryBalance.findUnique({
        where: { locationId_productId: { locationId: shopA.locationId, productId } },
      }),
      h.prisma.inventoryBalance.findUnique({
        where: { locationId_productId: { locationId: shopB.locationId, productId } },
      }),
    ]);
    expect(aBal?.quantity).toBe(3);
    expect(bBal?.quantity).toBe(4);
  });
});

describe('P4-09 · reversal', () => {
  it('8. reversal round-trips: both balances restored, ledger keeps both events, status REVERSED', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, ctx.warehouseId, 20);
    const shop = await makeShopLocation(h.prisma);
    const t = await h.transfers.create(
      {
        sourceLocationId: ctx.warehouseId,
        destinationLocationId: shop.locationId,
        transferDate: new Date().toISOString(),
        items: [{ productId, quantity: 6 }],
      },
      user,
    );

    const reversed = await h.transferReversal.reverse(
      t.id,
      { reason: 'shop closed early, restock warehouse' },
      user,
    );
    expect(reversed.status).toBe(TransferStatus.REVERSED);
    expect(reversed.reversalReason).toBe('shop closed early, restock warehouse');
    expect(reversed.reversedBy).toBe(user.id);

    const [srcBal, dstBal, moves] = await Promise.all([
      h.prisma.inventoryBalance.findUnique({
        where: { locationId_productId: { locationId: ctx.warehouseId, productId } },
      }),
      h.prisma.inventoryBalance.findUnique({
        where: { locationId_productId: { locationId: shop.locationId, productId } },
      }),
      h.prisma.inventoryMovement.findMany({
        where: { productId, movementType: MovementType.TRANSFER },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    expect(srcBal?.quantity).toBe(20);
    expect(dstBal?.quantity).toBe(0);
    // Original + mirrored — never delete (spec §16.5).
    expect(moves).toHaveLength(2);
    expect(moves[0]!.sourceLocationId).toBe(ctx.warehouseId);
    expect(moves[0]!.destinationLocationId).toBe(shop.locationId);
    expect(moves[1]!.sourceLocationId).toBe(shop.locationId);
    expect(moves[1]!.destinationLocationId).toBe(ctx.warehouseId);
  });

  it('9. reversal blocked when destination already sold the stock → DESTINATION_INSUFFICIENT_STOCK, nothing changed', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, ctx.warehouseId, 10);
    const shop = await makeShopLocation(h.prisma);
    const t = await h.transfers.create(
      {
        sourceLocationId: ctx.warehouseId,
        destinationLocationId: shop.locationId,
        transferDate: new Date().toISOString(),
        items: [{ productId, quantity: 6 }],
      },
      user,
    );
    // Drain the destination via a negative correction — simulates a sale
    // the destination made after receiving the transfer.
    await h.corrections.create(
      {
        locationId: shop.locationId,
        productId,
        adjustmentQuantity: -6,
        reason: 'sold at shop',
      },
      user,
    );

    await expect(
      h.transferReversal.reverse(t.id, { reason: 'change of plan' }, user),
    ).rejects.toBeInstanceOf(DestinationInsufficientStockError);

    const [srcBal, dstBal, refreshed] = await Promise.all([
      h.prisma.inventoryBalance.findUnique({
        where: { locationId_productId: { locationId: ctx.warehouseId, productId } },
      }),
      h.prisma.inventoryBalance.findUnique({
        where: { locationId_productId: { locationId: shop.locationId, productId } },
      }),
      h.prisma.stockTransfer.findUnique({ where: { id: t.id } }),
    ]);
    expect(srcBal?.quantity).toBe(4);
    expect(dstBal?.quantity).toBe(0);
    expect(refreshed?.status).toBe(TransferStatus.COMPLETED);
    expect(refreshed?.reversedAt).toBeNull();
  });

  it('10. reversing a REVERSED transfer → TransferNotReversibleError', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, ctx.warehouseId, 5);
    const shop = await makeShopLocation(h.prisma);
    const t = await h.transfers.create(
      {
        sourceLocationId: ctx.warehouseId,
        destinationLocationId: shop.locationId,
        transferDate: new Date().toISOString(),
        items: [{ productId, quantity: 2 }],
      },
      user,
    );
    await h.transferReversal.reverse(t.id, { reason: 'first' }, user);

    await expect(
      h.transferReversal.reverse(t.id, { reason: 'twice' }, user),
    ).rejects.toBeInstanceOf(TransferNotReversibleError);
  });
});

// 11 (HTTP-level permissions matrix via loginAs) is deferred until the
// auth E2E harness lands — service-layer tests can't exercise the Roles
// guard or ShopScopeGuard substitution. Tracked as follow-up.

describe('P4-09 · invariant', () => {
  it('12. invariant stays green across create + reverse + shop→shop chain', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, ctx.warehouseId, 30);
    const shopA = await makeShopLocation(h.prisma);
    const shopB = await makeShopLocation(h.prisma);

    const t1 = await h.transfers.create(
      {
        sourceLocationId: ctx.warehouseId,
        destinationLocationId: shopA.locationId,
        transferDate: new Date().toISOString(),
        items: [{ productId, quantity: 10 }],
      },
      user,
    );
    await h.transfers.create(
      {
        sourceLocationId: shopA.locationId,
        destinationLocationId: shopB.locationId,
        transferDate: new Date().toISOString(),
        items: [{ productId, quantity: 4 }],
      },
      user,
    );
    // Move the 4 back to shopA so t1's full quantity (10) is available for
    // reversal — otherwise the chain trips DESTINATION_INSUFFICIENT_STOCK.
    await h.transfers.create(
      {
        sourceLocationId: shopB.locationId,
        destinationLocationId: shopA.locationId,
        transferDate: new Date().toISOString(),
        items: [{ productId, quantity: 4 }],
      },
      user,
    );
    await h.transferReversal.reverse(t1.id, { reason: 'reset' }, user);

    // afterEach hook checks the invariant across every (location, product)
    // — nothing to assert here beyond that the chain runs cleanly.
    expect(true).toBe(true);
  });
});
