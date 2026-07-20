import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { InventoryService } from '../../src/inventory/inventory.service';
import { ReferenceService } from '../../src/inventory/reference.service';
import { OpeningStockService } from '../../src/inventory/opening-stock.service';
import { CorrectionsService } from '../../src/inventory/corrections.service';
import { IncomingOrdersService } from '../../src/incoming-orders/incoming-orders.service';
import { ReceiveService } from '../../src/incoming-orders/receive.service';
import { StockReceiptsService } from '../../src/stock-receipts/stock-receipts.service';
import { TransfersService } from '../../src/transfers/transfers.service';
import { TransferReversalService } from '../../src/transfers/transfer-reversal.service';

// Integration harness: instantiate the real services against the dev Postgres.
// We do NOT go through Nest's TestingModule because we don't need HTTP for
// most tests — we assert by reading the database directly, which is what
// conventions §5 asks for.

export function createHarness(): {
  prisma: PrismaService;
  inventory: InventoryService;
  refs: ReferenceService;
  openingStock: OpeningStockService;
  corrections: CorrectionsService;
  orders: IncomingOrdersService;
  receive: ReceiveService;
  receipts: StockReceiptsService;
  transfers: TransfersService;
  transferReversal: TransferReversalService;
  disconnect: () => Promise<void>;
} {
  const prisma = new PrismaService();
  const refs = new ReferenceService();
  const inventory = new InventoryService(prisma);
  const openingStock = new OpeningStockService(prisma, inventory);
  const corrections = new CorrectionsService(prisma, inventory, refs);
  const orders = new IncomingOrdersService(prisma, refs);
  const receive = new ReceiveService(prisma, inventory, refs, orders);
  const receipts = new StockReceiptsService(prisma, inventory, refs);
  const transfers = new TransfersService(prisma, inventory, refs);
  const transferReversal = new TransferReversalService(prisma, inventory, transfers);
  return {
    prisma,
    inventory,
    refs,
    openingStock,
    corrections,
    orders,
    receive,
    receipts,
    transfers,
    transferReversal,
    disconnect: () => prisma.$disconnect(),
  };
}

// Wipe everything Phases 3–5 touch. Order matters: children first, then
// parents. Location/AppSetting/User stay (bootstrapped by prod seed).
// The counter values are reset so REC/ORD/ADJ/TRF/SAL refs start at 1
// each test.
export async function resetDatabase(prisma: PrismaService | PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.saleItem.deleteMany(),
    prisma.sale.deleteMany(),
    prisma.stockCorrection.deleteMany(),
    prisma.stockTransferItem.deleteMany(),
    prisma.stockTransfer.deleteMany(),
    prisma.inventoryMovement.deleteMany(),
    prisma.inventoryBalance.deleteMany(),
    prisma.stockReceiptItem.deleteMany(),
    prisma.stockReceipt.deleteMany(),
    prisma.incomingOrderItem.deleteMany(),
    prisma.incomingOrder.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.session.deleteMany(),
    // Locations for transient shops made by tests must go too, so their
    // paired Shop rows can be removed cleanly.
    prisma.location.deleteMany({ where: { type: 'SHOP' } }),
    prisma.shop.deleteMany(),
  ]);
  await prisma.$executeRaw`UPDATE "ReferenceCounter" SET "value" = 0`;
}

export async function seedBasics(prisma: PrismaService): Promise<{
  categoryId: string;
  warehouseId: string;
  userId: string;
}> {
  const [category, warehouse, user] = await Promise.all([
    prisma.category.create({ data: { name: `Phones-${Date.now()}` } }),
    prisma.location.findFirst({ where: { type: 'WAREHOUSE', shopId: null } }),
    prisma.user.upsert({
      where: { username: 'test-owner' },
      update: {},
      create: {
        name: 'Test Owner',
        username: 'test-owner',
        passwordHash: 'x',
        role: 'OWNER',
      },
    }),
  ]);
  if (!warehouse) throw new Error('Warehouse location not seeded — run prisma db seed first');
  return { categoryId: category.id, warehouseId: warehouse.id, userId: user.id };
}

export async function makeProduct(
  prisma: PrismaService,
  categoryId: string,
  name = `p-${Math.random().toString(36).slice(2, 8)}`,
): Promise<string> {
  const p = await prisma.product.create({ data: { name, categoryId } });
  return p.id;
}

// Test-only shop factory. Pairs a Shop with its Location the same way
// ShopsService.create does (schema-review §2 / phase-2 §3) so the
// resulting locationId is usable in Phase 4 transfer tests.
export async function makeShopLocation(
  prisma: PrismaService,
  name = `shop-${Math.random().toString(36).slice(2, 8)}`,
): Promise<{ shopId: string; locationId: string }> {
  const shop = await prisma.shop.create({ data: { name } });
  const location = await prisma.location.create({
    data: { name, type: 'SHOP', shopId: shop.id, active: true },
  });
  return { shopId: shop.id, locationId: location.id };
}
