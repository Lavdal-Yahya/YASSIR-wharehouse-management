import { MovementType, PaymentStatus, SaleStatus } from '@prisma/client';
import { InventoryService } from '../../src/inventory/inventory.service';
import { InsufficientStockError } from '../../src/inventory/errors';
import {
  CustomerRequiredError,
  DuplicateSaleItemError,
  PaymentExceedsTotalError,
  SaleShopArchivedError,
} from '../../src/sales/errors';
import {
  createHarness,
  makeProduct,
  makeShopLocation,
  resetDatabase,
  seedBasics,
} from './setup';
import type { SessionUser } from '../../src/common/types/session-user';

// Phase 5 integration suite (P5-08). Runs against the dev Postgres.
// Follows phase-5.md §6 test list. Standing invariants #1 (ledger) and
// #2 (sale coherence) run in the global afterEach.

const h = createHarness();
let ctx: { categoryId: string; warehouseId: string; userId: string };
let user: SessionUser;
let shop: { shopId: string; locationId: string };

beforeEach(async () => {
  await resetDatabase(h.prisma);
  ctx = await seedBasics(h.prisma);
  user = { id: ctx.userId, name: 'Test Owner', role: 'OWNER', assignedShopId: null };
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

async function seedStock(productId: string, locationId: string, qty: number) {
  await h.openingStock.create(
    { locationId, items: [{ productId, quantity: qty }] },
    user,
  );
}

describe('P5-08 · canonical trio (spec §19.7–19.9)', () => {
  it('1a. 10,000 fully paid without customer → PAID, no debt', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, shop.locationId, 10);
    const sale = await h.sales.confirm(
      {
        shopId: shop.shopId,
        amountPaidAtSale: 10_000,
        items: [{ productId, quantity: 2, unitPrice: 5_000 }],
      },
      user,
    );
    expect(sale.referenceNumber).toMatch(/^SAL-/);
    expect(sale.totalAmount).toBe(10_000);
    expect(sale.amountPaid).toBe(10_000);
    expect(sale.amountDue).toBe(0);
    expect(sale.paymentStatus).toBe(PaymentStatus.PAID);
    expect(sale.customerId).toBeNull();
  });

  it('1b. 4,000 of 10,000 with customer → PARTIALLY_PAID, due 6,000', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, shop.locationId, 10);
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    const sale = await h.sales.confirm(
      {
        shopId: shop.shopId,
        customerId: customer.id,
        amountPaidAtSale: 4_000,
        items: [{ productId, quantity: 2, unitPrice: 5_000 }],
      },
      user,
    );
    expect(sale.amountDue).toBe(6_000);
    expect(sale.paymentStatus).toBe(PaymentStatus.PARTIALLY_PAID);
    expect(sale.customerId).toBe(customer.id);
    expect(sale.customerName).toBe('Ali'); // snapshot
    // Derived debt reflects the sale immediately.
    const debt = await h.customers.outstanding(customer.id);
    expect(debt).toBe(6_000);
  });

  it('1c. 0 of 10,000 with customer → UNPAID, due 10,000', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, shop.locationId, 10);
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    const sale = await h.sales.confirm(
      {
        shopId: shop.shopId,
        customerId: customer.id,
        amountPaidAtSale: 0,
        items: [{ productId, quantity: 2, unitPrice: 5_000 }],
      },
      user,
    );
    expect(sale.amountDue).toBe(10_000);
    expect(sale.paymentStatus).toBe(PaymentStatus.UNPAID);
  });
});

describe('P5-08 · CUSTOMER_REQUIRED (service + DB CHECK)', () => {
  it('2a. service: unpaid without customer → CustomerRequiredError', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, shop.locationId, 10);
    await expect(
      h.sales.confirm(
        {
          shopId: shop.shopId,
          amountPaidAtSale: 0,
          items: [{ productId, quantity: 1, unitPrice: 5_000 }],
        },
        user,
      ),
    ).rejects.toBeInstanceOf(CustomerRequiredError);
    // Nothing written.
    expect(await h.prisma.sale.count()).toBe(0);
    expect(await h.prisma.saleItem.count()).toBe(0);
  });

  it('2b. DB CHECK: raw insert with amountDue > 0 and null customerId → rejected', async () => {
    await expect(
      h.prisma.$executeRaw`
        INSERT INTO "Sale"
          ("id", "referenceNumber", "shopId", "paymentStatus",
           "totalAmount", "amountPaid", "amountDue", "amountPaidAtSale",
           "saleDate", "createdBy", "updatedAt")
        VALUES ('raw-check-1', 'RAW-1', ${shop.shopId}, 'UNPAID',
                1000, 0, 1000, 0, NOW(), ${ctx.userId}, NOW())
      `,
    ).rejects.toThrow(/sale_debt_requires_customer/);
  });
});

describe('P5-08 · multi-item + concurrency', () => {
  it('3. multi-item sale → one SALE movement per item, batch call (no crossed-lock deadlock)', async () => {
    const p1 = await makeProduct(h.prisma, ctx.categoryId);
    const p2 = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(p1, shop.locationId, 10);
    await seedStock(p2, shop.locationId, 10);

    // Two concurrent single-item sales in different lock orders would
    // stress the crossed-lock defense; but for phase-5 the more direct
    // stress is two multi-item sales interleaving the same pair.
    await Promise.all([
      h.sales.confirm(
        {
          shopId: shop.shopId,
          amountPaidAtSale: 3_000,
          items: [
            { productId: p1, quantity: 1, unitPrice: 1_000 },
            { productId: p2, quantity: 2, unitPrice: 1_000 },
          ],
        },
        user,
      ),
      h.sales.confirm(
        {
          shopId: shop.shopId,
          amountPaidAtSale: 3_000,
          items: [
            { productId: p2, quantity: 1, unitPrice: 1_000 },
            { productId: p1, quantity: 2, unitPrice: 1_000 },
          ],
        },
        user,
      ),
    ]);
    const [b1, b2, moves] = await Promise.all([
      h.prisma.inventoryBalance.findUnique({
        where: { locationId_productId: { locationId: shop.locationId, productId: p1 } },
      }),
      h.prisma.inventoryBalance.findUnique({
        where: { locationId_productId: { locationId: shop.locationId, productId: p2 } },
      }),
      h.prisma.inventoryMovement.count({
        where: { movementType: MovementType.SALE },
      }),
    ]);
    expect(b1?.quantity).toBe(7); // 10 - 1 - 2
    expect(b2?.quantity).toBe(7); // 10 - 2 - 1
    expect(moves).toBe(4); // 2 sales × 2 items each
  });
});

describe('P5-08 · overselling + rollback', () => {
  it('4. qty 4 of 3 available → INSUFFICIENT_STOCK, zero rows written', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, shop.locationId, 3);
    await expect(
      h.sales.confirm(
        {
          shopId: shop.shopId,
          amountPaidAtSale: 4_000,
          items: [{ productId, quantity: 4, unitPrice: 1_000 }],
        },
        user,
      ),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await h.prisma.sale.count()).toBe(0);
    expect(await h.prisma.saleItem.count()).toBe(0);
    expect(
      await h.prisma.inventoryMovement.count({
        where: { movementType: MovementType.SALE },
      }),
    ).toBe(0);
    const bal = await h.prisma.inventoryBalance.findUnique({
      where: { locationId_productId: { locationId: shop.locationId, productId } },
    });
    expect(bal?.quantity).toBe(3);
  });

  it('5. rollback spy: applyMovements throws → no sale, no items, no inline customer', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, shop.locationId, 10);
    const spy = jest
      .spyOn(InventoryService.prototype, 'applyMovements')
      .mockImplementationOnce(async () => {
        throw new Error('simulated inventory failure');
      });

    await expect(
      h.sales.confirm(
        {
          shopId: shop.shopId,
          newCustomer: { name: 'Ephemeral' },
          amountPaidAtSale: 0,
          items: [{ productId, quantity: 1, unitPrice: 1_000 }],
        },
        user,
      ),
    ).rejects.toThrow('simulated inventory failure');
    spy.mockRestore();

    expect(await h.prisma.sale.count()).toBe(0);
    expect(await h.prisma.saleItem.count()).toBe(0);
    // Inline customer rolled back too — this is the whole reason it's
    // created in the same transaction.
    expect(
      await h.prisma.customer.count({ where: { name: 'Ephemeral' } }),
    ).toBe(0);
  });
});

describe('P5-08 · concurrent last unit', () => {
  it('6. two parallel confirms for the final unit → exactly one succeeds', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, shop.locationId, 1);
    const oneItem = {
      shopId: shop.shopId,
      amountPaidAtSale: 1_000,
      items: [{ productId, quantity: 1, unitPrice: 1_000 }],
    };
    const results = await Promise.allSettled([
      h.sales.confirm(oneItem, user),
      h.sales.confirm(oneItem, user),
    ]);
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter(
      (r) => r.status === 'rejected' && (r as PromiseRejectedResult).reason instanceof InsufficientStockError,
    ).length;
    expect(succeeded).toBe(1);
    expect(failed).toBe(1);
    const bal = await h.prisma.inventoryBalance.findUnique({
      where: { locationId_productId: { locationId: shop.locationId, productId } },
    });
    expect(bal?.quantity).toBe(0);
  });
});

describe('P5-08 · snapshot immunity (spec §37.14)', () => {
  it('7. rename product + change price after sale → sale item unchanged', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId, 'iPhone 15');
    await seedStock(productId, shop.locationId, 5);
    await h.prisma.product.update({
      where: { id: productId },
      data: { defaultPurchaseCost: 2000, defaultSalePrice: 3000 },
    });
    const sale = await h.sales.confirm(
      {
        shopId: shop.shopId,
        amountPaidAtSale: 3_000,
        items: [{ productId, quantity: 1, unitPrice: 3_000 }],
      },
      user,
    );

    // Now the product changes.
    await h.prisma.product.update({
      where: { id: productId },
      data: { name: 'iPhone 15 Pro', defaultSalePrice: 9_999 },
    });

    const refreshed = await h.sales.findOne(sale.id);
    const item = refreshed.items[0]!;
    expect(item.productName).toBe('iPhone 15'); // snapshot preserved
    expect(item.unitPrice).toBe(3_000);
    expect(item.unitCostSnapshot).toBe(2_000);
    expect(item.lineTotal).toBe(3_000);
  });
});

describe('P5-08 · payment bounds', () => {
  it('9a. amountPaidAtSale > total → PaymentExceedsTotalError', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, shop.locationId, 1);
    await expect(
      h.sales.confirm(
        {
          shopId: shop.shopId,
          amountPaidAtSale: 2_000,
          items: [{ productId, quantity: 1, unitPrice: 1_000 }],
        },
        user,
      ),
    ).rejects.toBeInstanceOf(PaymentExceedsTotalError);
  });

  it('rejects duplicate productIds', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, shop.locationId, 5);
    await expect(
      h.sales.confirm(
        {
          shopId: shop.shopId,
          amountPaidAtSale: 2_000,
          items: [
            { productId, quantity: 1, unitPrice: 1_000 },
            { productId, quantity: 1, unitPrice: 1_000 },
          ],
        },
        user,
      ),
    ).rejects.toBeInstanceOf(DuplicateSaleItemError);
  });
});

describe('P5-08 · inline customer creation', () => {
  it('10. inline newCustomer is created + snapshotted; two customers with the same name are both allowed', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, shop.locationId, 5);

    const s1 = await h.sales.confirm(
      {
        shopId: shop.shopId,
        newCustomer: { name: 'Fatimatou', phone: '11223344' },
        amountPaidAtSale: 1_000,
        items: [{ productId, quantity: 2, unitPrice: 1_000 }],
      },
      user,
    );
    expect(s1.customerId).toBeTruthy();
    expect(s1.customerName).toBe('Fatimatou');
    expect(s1.customerPhone).toBe('11223344');

    // Same-name customer is created cleanly again; spec §18.4 says
    // duplicate avoidance is via the search box, not a unique constraint.
    const s2 = await h.sales.confirm(
      {
        shopId: shop.shopId,
        newCustomer: { name: 'Fatimatou' },
        amountPaidAtSale: 0,
        items: [{ productId, quantity: 1, unitPrice: 1_000 }],
      },
      user,
    );
    expect(s2.customerId).toBeTruthy();
    expect(s2.customerId).not.toBe(s1.customerId);
    expect(
      await h.prisma.customer.count({ where: { name: 'Fatimatou' } }),
    ).toBe(2);
  });
});

describe('P5-08 · archived shop', () => {
  it('12. archived shop → SaleShopArchivedError, nothing written', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, shop.locationId, 5);
    await h.prisma.shop.update({
      where: { id: shop.shopId },
      data: { active: false },
    });
    await expect(
      h.sales.confirm(
        {
          shopId: shop.shopId,
          amountPaidAtSale: 1_000,
          items: [{ productId, quantity: 1, unitPrice: 1_000 }],
        },
        user,
      ),
    ).rejects.toBeInstanceOf(SaleShopArchivedError);
    expect(await h.prisma.sale.count()).toBe(0);
  });
});

describe('P5-08 · sale cancels get status ACTIVE (Phase 6 will flip to CANCELLED)', () => {
  it('confirmed sales are ACTIVE and stay ACTIVE until Phase 6 cancellation lands', async () => {
    const productId = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productId, shop.locationId, 3);
    const sale = await h.sales.confirm(
      {
        shopId: shop.shopId,
        amountPaidAtSale: 1_000,
        items: [{ productId, quantity: 1, unitPrice: 1_000 }],
      },
      user,
    );
    expect(sale.status).toBe(SaleStatus.ACTIVE);
  });
});
