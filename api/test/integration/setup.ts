import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { InventoryService } from '../../src/inventory/inventory.service';
import { ReferenceService } from '../../src/inventory/reference.service';
import { OpeningStockService } from '../../src/inventory/opening-stock.service';
import { CorrectionsService } from '../../src/inventory/corrections.service';
import { IncomingOrdersService } from '../../src/incoming-orders/incoming-orders.service';
import { ReceiveService } from '../../src/incoming-orders/receive.service';
import { StockReceiptsService } from '../../src/stock-receipts/stock-receipts.service';

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
  return {
    prisma,
    inventory,
    refs,
    openingStock,
    corrections,
    orders,
    receive,
    receipts,
    disconnect: () => prisma.$disconnect(),
  };
}

// Wipe everything Phase 3 touches. Order matters: children first, then
// parents. Location/AppSetting/User stay (bootstrapped by prod seed).
// The counter values are reset so REC/ORD/ADJ refs start at 1 each test.
// Phase 4+ tables will be added here as those phases land.
export async function resetDatabase(prisma: PrismaService | PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.stockCorrection.deleteMany(),
    prisma.inventoryMovement.deleteMany(),
    prisma.inventoryBalance.deleteMany(),
    prisma.stockReceiptItem.deleteMany(),
    prisma.stockReceipt.deleteMany(),
    prisma.incomingOrderItem.deleteMany(),
    prisma.incomingOrder.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.session.deleteMany(),
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
