import {
  CustomerPaymentStatus,
  MovementType,
  PaymentStatus,
  SaleStatus,
} from '@prisma/client';
import {
  InvalidTargetSaleError,
  NoOutstandingDebtError,
  PaymentExceedsDebtError,
  PaymentNotFoundError,
  PaymentNotReversibleError,
} from '../../src/payments/errors';
import {
  SaleHasActivePaymentsError,
  SaleNotCancellableError,
} from '../../src/sales/errors';
import {
  createHarness,
  makeProduct,
  makeShopLocation,
  resetDatabase,
  seedBasics,
} from './setup';
import type { SessionUser } from '../../src/common/types/session-user';

// Phase 6 integration suite (PR-A). Follows the phase-6.md §8 test list.
// Runs against the dev Postgres. Three standing invariants live in the
// global afterEach and must all hold after every reversal/cancellation:
//   1. Σ movements = InventoryBalance (ledger)
//   2. amountPaid = amountPaidAtSale + Σ active allocations (sale coherence)
//   3. debtAfter = debtBefore − amount on every payment (payment snapshot)
// #3 is a Phase 6 addition; #1 and #2 are the standing pair, extended by
// SalesService.verifySaleCoherenceInvariant to include allocations.

const h = createHarness();
let ctx: { categoryId: string; warehouseId: string; userId: string };
let owner: SessionUser;
let shopUser: SessionUser;
let shop: { shopId: string; locationId: string };

beforeEach(async () => {
  await resetDatabase(h.prisma);
  ctx = await seedBasics(h.prisma);
  owner = { id: ctx.userId, name: 'Test Owner', role: 'OWNER', assignedShopId: null };
  shop = await makeShopLocation(h.prisma);
  // A SHOP user assigned to `shop` — used for permission tests and the
  // "SHOP registers, cannot reverse/cancel" checks.
  const shopUserRow = await h.prisma.user.upsert({
    where: { username: 'test-shop-user' },
    update: { assignedShopId: shop.shopId, role: 'SHOP' },
    create: {
      name: 'Test Shop User',
      username: 'test-shop-user',
      passwordHash: 'x',
      role: 'SHOP',
      assignedShopId: shop.shopId,
    },
  });
  shopUser = {
    id: shopUserRow.id,
    name: shopUserRow.name,
    role: 'SHOP',
    assignedShopId: shop.shopId,
  };
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

async function seedStock(productId: string, locationId: string, qty: number) {
  await h.openingStock.create(
    { locationId, items: [{ productId, quantity: qty }] },
    owner,
  );
}

// Convenience: a debt sale (customer specified, amountPaidAtSale = 0).
// Returns the sale + first-item info for stock-return assertions.
async function debtSale(
  customerId: string,
  productId: string,
  quantity: number,
  unitPrice: number,
  saleDate?: string,
) {
  return h.sales.confirm(
    {
      shopId: shop.shopId,
      customerId,
      amountPaidAtSale: 0,
      saleDate,
      items: [{ productId, quantity, unitPrice }],
    },
    owner,
  );
}

// Convenience: a partially-paid sale (customer, paid < total).
async function partialSale(
  customerId: string,
  productId: string,
  quantity: number,
  unitPrice: number,
  paid: number,
) {
  return h.sales.confirm(
    {
      shopId: shop.shopId,
      customerId,
      amountPaidAtSale: paid,
      items: [{ productId, quantity, unitPrice }],
    },
    owner,
  );
}

describe('P6-02/03 · allocation engine (spec §21.3)', () => {
  it('1. oldest-first: 4,000 across 3,000 + 5,000 → first PAID, second PARTIALLY_PAID', async () => {
    const productA = await makeProduct(h.prisma, ctx.categoryId);
    const productB = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productA, shop.locationId, 10);
    await seedStock(productB, shop.locationId, 10);
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });

    // First sale, earlier date → oldest. Second sale later.
    const s1 = await debtSale(customer.id, productA, 1, 3_000, '2026-06-01');
    const s2 = await debtSale(customer.id, productB, 1, 5_000, '2026-06-15');

    const pay = await h.payments.register(
      { customerId: customer.id, shopId: shop.shopId, amount: 4_000 },
      owner,
    );
    expect(pay.referenceNumber).toMatch(/^PAY-/);
    expect(pay.status).toBe(CustomerPaymentStatus.ACTIVE);
    expect(pay.amount).toBe(4_000);
    expect(pay.debtBeforePayment).toBe(8_000);
    expect(pay.debtAfterPayment).toBe(4_000);

    const [refreshed1, refreshed2] = await Promise.all([
      h.sales.findOne(s1.id),
      h.sales.findOne(s2.id),
    ]);
    expect(refreshed1.paymentStatus).toBe(PaymentStatus.PAID);
    expect(refreshed1.amountDue).toBe(0);
    expect(refreshed2.paymentStatus).toBe(PaymentStatus.PARTIALLY_PAID);
    expect(refreshed2.amountDue).toBe(4_000);

    // Allocations sum to 4,000 across the two touched sales.
    const allocs = await h.prisma.paymentAllocation.findMany({
      where: { customerPaymentId: pay.id },
    });
    expect(allocs.reduce((n, a) => n + a.amountAllocated, 0)).toBe(4_000);

    // Derived outstanding is 4,000.
    expect(await h.customers.outstanding(customer.id)).toBe(4_000);
  });

  it('2. exact settle across two sales: 8,000 across 3,000 + 5,000 → both PAID, outstanding 0', async () => {
    const productA = await makeProduct(h.prisma, ctx.categoryId);
    const productB = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productA, shop.locationId, 10);
    await seedStock(productB, shop.locationId, 10);
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    await debtSale(customer.id, productA, 1, 3_000, '2026-06-01');
    await debtSale(customer.id, productB, 1, 5_000, '2026-06-15');

    const pay = await h.payments.register(
      { customerId: customer.id, shopId: shop.shopId, amount: 8_000 },
      owner,
    );
    expect(pay.debtAfterPayment).toBe(0);
    expect(await h.customers.outstanding(customer.id)).toBe(0);
    const paid = await h.prisma.sale.count({
      where: { customerId: customer.id, paymentStatus: PaymentStatus.PAID },
    });
    expect(paid).toBe(2);
  });

  it('3. overpay → PAYMENT_EXCEEDS_DEBT, nothing written', async () => {
    const productA = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productA, shop.locationId, 10);
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    await debtSale(customer.id, productA, 1, 3_000);

    await expect(
      h.payments.register(
        { customerId: customer.id, shopId: shop.shopId, amount: 4_000 },
        owner,
      ),
    ).rejects.toBeInstanceOf(PaymentExceedsDebtError);
    expect(await h.prisma.customerPayment.count()).toBe(0);
    expect(await h.prisma.paymentAllocation.count()).toBe(0);
    // Sale untouched.
    const refreshed = await h.prisma.sale.findFirst({
      where: { customerId: customer.id },
    });
    expect(refreshed?.amountDue).toBe(3_000);
  });

  it('11. admin-targeted allocation directs the whole payment at one sale', async () => {
    const productA = await makeProduct(h.prisma, ctx.categoryId);
    const productB = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productA, shop.locationId, 10);
    await seedStock(productB, shop.locationId, 10);
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });

    // s1 is the older debt (would receive priority under oldest-first),
    // s2 is the intended target.
    const s1 = await debtSale(customer.id, productA, 1, 3_000, '2026-06-01');
    const s2 = await debtSale(customer.id, productB, 1, 5_000, '2026-06-15');

    await h.payments.register(
      {
        customerId: customer.id,
        shopId: shop.shopId,
        amount: 2_000,
        targetSaleId: s2.id,
      },
      owner,
    );
    // s1 is untouched; s2 receives 2,000.
    const [r1, r2] = await Promise.all([
      h.sales.findOne(s1.id),
      h.sales.findOne(s2.id),
    ]);
    expect(r1.amountDue).toBe(3_000);
    expect(r2.amountDue).toBe(3_000); // 5,000 − 2,000
  });

  it('11b. admin-targeted rejects overflow (amount > that sale amountDue)', async () => {
    const productA = await makeProduct(h.prisma, ctx.categoryId);
    const productB = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productA, shop.locationId, 10);
    await seedStock(productB, shop.locationId, 10);
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    await debtSale(customer.id, productA, 1, 3_000, '2026-06-01');
    const s2 = await debtSale(customer.id, productB, 1, 5_000, '2026-06-15');

    await expect(
      h.payments.register(
        {
          customerId: customer.id,
          shopId: shop.shopId,
          amount: 6_000, // exceeds s2.amountDue (5,000) though not total debt (8,000)
          targetSaleId: s2.id,
        },
        owner,
      ),
    ).rejects.toBeInstanceOf(InvalidTargetSaleError);
    expect(await h.prisma.customerPayment.count()).toBe(0);
  });

  it('rejects a payment when the customer has no outstanding debt', async () => {
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    await expect(
      h.payments.register(
        { customerId: customer.id, shopId: shop.shopId, amount: 1_000 },
        owner,
      ),
    ).rejects.toBeInstanceOf(NoOutstandingDebtError);
  });
});

describe('P6-04 · reversal', () => {
  it('4. reversal restores every touched sale and outstanding, allocations remain', async () => {
    const productA = await makeProduct(h.prisma, ctx.categoryId);
    const productB = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productA, shop.locationId, 10);
    await seedStock(productB, shop.locationId, 10);
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    const s1 = await debtSale(customer.id, productA, 1, 3_000, '2026-06-01');
    const s2 = await debtSale(customer.id, productB, 1, 5_000, '2026-06-15');

    const pay = await h.payments.register(
      { customerId: customer.id, shopId: shop.shopId, amount: 4_000 },
      owner,
    );
    // Snapshot pre-reverse state.
    const preAllocCount = await h.prisma.paymentAllocation.count({
      where: { customerPaymentId: pay.id },
    });
    expect(preAllocCount).toBeGreaterThan(0);

    await h.payments.reverse(pay.id, { reason: 'test reversal' }, owner);

    // Every touched sale is back to pre-payment state.
    const [r1, r2] = await Promise.all([
      h.sales.findOne(s1.id),
      h.sales.findOne(s2.id),
    ]);
    expect(r1.amountDue).toBe(3_000);
    expect(r1.paymentStatus).toBe(PaymentStatus.UNPAID);
    expect(r2.amountDue).toBe(5_000);
    expect(r2.paymentStatus).toBe(PaymentStatus.UNPAID);
    // Outstanding back to 8,000.
    expect(await h.customers.outstanding(customer.id)).toBe(8_000);

    // Allocations still exist (D-013) — but inactive, so excluded from
    // both the sale-coherence invariant and the outstanding derivation.
    const postAllocCount = await h.prisma.paymentAllocation.count({
      where: { customerPaymentId: pay.id },
    });
    expect(postAllocCount).toBe(preAllocCount);
    const reversed = await h.prisma.customerPayment.findUnique({
      where: { id: pay.id },
    });
    expect(reversed?.status).toBe(CustomerPaymentStatus.CANCELLED);
    expect(reversed?.cancellationReason).toBe('test reversal');
  });

  it('5. reverse-twice → PAYMENT_NOT_REVERSIBLE', async () => {
    const productA = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productA, shop.locationId, 5);
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    await debtSale(customer.id, productA, 1, 3_000);
    const pay = await h.payments.register(
      { customerId: customer.id, shopId: shop.shopId, amount: 2_000 },
      owner,
    );
    await h.payments.reverse(pay.id, { reason: 'first' }, owner);
    await expect(
      h.payments.reverse(pay.id, { reason: 'second' }, owner),
    ).rejects.toBeInstanceOf(PaymentNotReversibleError);
  });

  it('reverse of nonexistent → PAYMENT_NOT_FOUND', async () => {
    await expect(
      h.payments.reverse('does-not-exist', { reason: 'x' }, owner),
    ).rejects.toBeInstanceOf(PaymentNotFoundError);
  });
});

describe('P6-10 · plain cancellation', () => {
  it('6. unpaid sale → stock returns (SALE_CANCELLATION matches SALE), sale CANCELLED', async () => {
    const productA = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productA, shop.locationId, 10);
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    const sale = await h.sales.confirm(
      {
        shopId: shop.shopId,
        customerId: customer.id,
        amountPaidAtSale: 0,
        items: [{ productId: productA, quantity: 3, unitPrice: 1_000 }],
      },
      owner,
    );
    const preBalance = await h.prisma.inventoryBalance.findUnique({
      where: {
        locationId_productId: { locationId: shop.locationId, productId: productA },
      },
    });
    expect(preBalance?.quantity).toBe(7); // 10 − 3

    await h.saleCancellation.cancel(sale.id, { reason: 'test cancel' }, owner);

    // Stock is back to 10.
    const postBalance = await h.prisma.inventoryBalance.findUnique({
      where: {
        locationId_productId: { locationId: shop.locationId, productId: productA },
      },
    });
    expect(postBalance?.quantity).toBe(10);
    // A SALE_CANCELLATION movement for the same quantity as the SALE.
    const [saleMove, cancelMove] = await Promise.all([
      h.prisma.inventoryMovement.findFirst({
        where: {
          movementType: MovementType.SALE,
          relatedEntityType: 'Sale',
          relatedEntityId: sale.id,
        },
      }),
      h.prisma.inventoryMovement.findFirst({
        where: {
          movementType: MovementType.SALE_CANCELLATION,
          relatedEntityType: 'Sale',
          relatedEntityId: sale.id,
        },
      }),
    ]);
    expect(saleMove?.quantity).toBe(3);
    expect(cancelMove?.quantity).toBe(3);
    expect(cancelMove?.destinationLocationId).toBe(shop.locationId);

    // Sale is CANCELLED; outstanding drops to 0.
    const refreshed = await h.sales.findOne(sale.id);
    expect(refreshed.status).toBe(SaleStatus.CANCELLED);
    expect(refreshed.cancellationReason).toBe('test cancel');
    expect(await h.customers.outstanding(customer.id)).toBe(0);
  });

  it('9. cash-at-sale on a partial-payment sale: cancel filters ACTIVE out of totals', async () => {
    const productA = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productA, shop.locationId, 5);
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    const sale = await partialSale(customer.id, productA, 1, 3_000, 1_000);
    // Confirm cancellation with an amountPaidAtSale > 0 is legal — no
    // active allocation exists, so the plain-cancel gate passes.
    await h.saleCancellation.cancel(sale.id, { reason: 'partial-refund case' }, owner);
    const cancelled = await h.prisma.sale.findUnique({ where: { id: sale.id } });
    expect(cancelled?.status).toBe(SaleStatus.CANCELLED);
    // Active-filtered aggregates: outstanding drops to zero; ACTIVE
    // amountPaidAtSale (Phase 7 cash-collected) also excludes this sale.
    expect(await h.customers.outstanding(customer.id)).toBe(0);
    const activeCash = await h.prisma.sale.aggregate({
      where: { customerId: customer.id, status: SaleStatus.ACTIVE },
      _sum: { amountPaidAtSale: true },
    });
    expect(activeCash._sum.amountPaidAtSale ?? 0).toBe(0);
  });

  it('double-cancel → SALE_NOT_CANCELLABLE', async () => {
    const productA = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productA, shop.locationId, 5);
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    const sale = await debtSale(customer.id, productA, 1, 3_000);
    await h.saleCancellation.cancel(sale.id, { reason: 'first' }, owner);
    await expect(
      h.saleCancellation.cancel(sale.id, { reason: 'second' }, owner),
    ).rejects.toBeInstanceOf(SaleNotCancellableError);
  });
});

describe('P6-11 · protected cancellation', () => {
  it('7. sale with active allocation → SALE_HAS_ACTIVE_PAYMENTS naming the payment; nothing changed', async () => {
    const productA = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productA, shop.locationId, 5);
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    const sale = await debtSale(customer.id, productA, 1, 3_000);
    const pay = await h.payments.register(
      { customerId: customer.id, shopId: shop.shopId, amount: 1_000 },
      owner,
    );

    const preStock = (
      await h.prisma.inventoryBalance.findUnique({
        where: {
          locationId_productId: { locationId: shop.locationId, productId: productA },
        },
      })
    )?.quantity;

    try {
      await h.saleCancellation.cancel(sale.id, { reason: 'try' }, owner);
      throw new Error('expected SaleHasActivePaymentsError');
    } catch (err) {
      expect(err).toBeInstanceOf(SaleHasActivePaymentsError);
      const e = err as SaleHasActivePaymentsError;
      expect(e.paymentReferences).toContain(pay.referenceNumber);
    }

    // Nothing changed: sale still ACTIVE, stock unchanged.
    const refreshed = await h.sales.findOne(sale.id);
    expect(refreshed.status).toBe(SaleStatus.ACTIVE);
    const postStock = (
      await h.prisma.inventoryBalance.findUnique({
        where: {
          locationId_productId: { locationId: shop.locationId, productId: productA },
        },
      })
    )?.quantity;
    expect(postStock).toBe(preStock);
  });

  it('8. protected-cancel happy path: reverse the payment, then cancel succeeds; stock back', async () => {
    const productA = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productA, shop.locationId, 10);
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    const sale = await debtSale(customer.id, productA, 2, 2_000);
    const pay = await h.payments.register(
      { customerId: customer.id, shopId: shop.shopId, amount: 1_500 },
      owner,
    );

    // Reverse the payment first — deliberately.
    await h.payments.reverse(pay.id, { reason: 'undo' }, owner);
    // Now cancel — no active allocations left, so the gate passes.
    const cancelled = await h.saleCancellation.cancel(
      sale.id,
      { reason: 'refund' },
      owner,
    );
    expect(cancelled.status).toBe(SaleStatus.CANCELLED);
    // Stock is back to 10.
    const balance = await h.prisma.inventoryBalance.findUnique({
      where: {
        locationId_productId: { locationId: shop.locationId, productId: productA },
      },
    });
    expect(balance?.quantity).toBe(10);
    // Outstanding drops to 0 (sale is CANCELLED; payment already CANCELLED).
    expect(await h.customers.outstanding(customer.id)).toBe(0);
  });
});

describe('concurrency', () => {
  it('10. two parallel payments on the same customer never exceed debt (FOR UPDATE serialisation)', async () => {
    const productA = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productA, shop.locationId, 10);
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    // One settleable sale of 1,000.
    await debtSale(customer.id, productA, 1, 1_000);

    const pay = () =>
      h.payments.register(
        { customerId: customer.id, shopId: shop.shopId, amount: 1_000 },
        owner,
      );
    const results = await Promise.allSettled([pay(), pay()]);
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter(
      (r) =>
        r.status === 'rejected' &&
        ((r as PromiseRejectedResult).reason instanceof PaymentExceedsDebtError ||
          (r as PromiseRejectedResult).reason instanceof NoOutstandingDebtError),
    ).length;
    expect(succeeded).toBe(1);
    expect(failed).toBe(1);
    // Combined never exceeded debt: outstanding is exactly 0.
    expect(await h.customers.outstanding(customer.id)).toBe(0);
  });
});

describe('receipt immutability (spec §23.4)', () => {
  it('12. cancel/reverse after issuing → snapshot values on the payment row are unchanged', async () => {
    const productA = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productA, shop.locationId, 5);
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    await debtSale(customer.id, productA, 1, 3_000);
    const pay = await h.payments.register(
      { customerId: customer.id, shopId: shop.shopId, amount: 2_000 },
      owner,
    );
    const originalBefore = pay.debtBeforePayment;
    const originalAfter = pay.debtAfterPayment;
    const originalAmount = pay.amount;

    // Reverse the payment — snapshot must not change (receipt reprint
    // reads exactly the numbers that were on the paper the first time).
    await h.payments.reverse(pay.id, { reason: 'test' }, owner);
    const raw = await h.prisma.customerPayment.findUnique({
      where: { id: pay.id },
    });
    expect(raw?.debtBeforePayment).toBe(originalBefore);
    expect(raw?.debtAfterPayment).toBe(originalAfter);
    expect(raw?.amount).toBe(originalAmount);
    // Status is CANCELLED; the receipt renderer overlays a "REVERSED"
    // banner but the underlying numbers stay intact.
    expect(raw?.status).toBe(CustomerPaymentStatus.CANCELLED);
  });
});

describe('phase-6 DoD · full debt lifecycle acceptance walk', () => {
  it('debt sale → two payments → reverse one → cancel another → balances correct at every step', async () => {
    // Three debt sales at three different dates so oldest-first ordering
    // is predictable. Product costs 1,000/unit; quantities pick prices.
    const productA = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productA, shop.locationId, 20);
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    const s1 = await debtSale(customer.id, productA, 3, 1_000, '2026-06-01'); // 3,000
    const s2 = await debtSale(customer.id, productA, 5, 1_000, '2026-06-15'); // 5,000
    const s3 = await debtSale(customer.id, productA, 2, 1_000, '2026-07-01'); // 2,000

    // Initial state: outstanding is the sum of the three sales.
    expect(await h.customers.outstanding(customer.id)).toBe(10_000);
    // Stock was 20; 3+5+2 = 10 units left.
    expect(
      (
        await h.prisma.inventoryBalance.findUnique({
          where: {
            locationId_productId: {
              locationId: shop.locationId,
              productId: productA,
            },
          },
        })
      )?.quantity,
    ).toBe(10);

    // Payment #1: 3,000 → oldest-first settles s1 exactly.
    const pay1 = await h.payments.register(
      { customerId: customer.id, shopId: shop.shopId, amount: 3_000 },
      owner,
    );
    expect(pay1.debtBeforePayment).toBe(10_000);
    expect(pay1.debtAfterPayment).toBe(7_000);
    expect(await h.customers.outstanding(customer.id)).toBe(7_000);
    expect((await h.sales.findOne(s1.id)).paymentStatus).toBe(PaymentStatus.PAID);

    // Payment #2: 5,000 → oldest-first settles s2 exactly.
    const pay2 = await h.payments.register(
      { customerId: customer.id, shopId: shop.shopId, amount: 5_000 },
      owner,
    );
    expect(pay2.debtBeforePayment).toBe(7_000);
    expect(pay2.debtAfterPayment).toBe(2_000);
    expect(await h.customers.outstanding(customer.id)).toBe(2_000);
    expect((await h.sales.findOne(s2.id)).paymentStatus).toBe(PaymentStatus.PAID);

    // Reverse payment #1 → s1 rises back to UNPAID; s2 unaffected;
    // outstanding rises by exactly 3,000.
    await h.payments.reverse(pay1.id, { reason: 'test-lifecycle' }, owner);
    expect((await h.sales.findOne(s1.id)).paymentStatus).toBe(PaymentStatus.UNPAID);
    expect((await h.sales.findOne(s2.id)).paymentStatus).toBe(PaymentStatus.PAID);
    expect(await h.customers.outstanding(customer.id)).toBe(5_000);

    // Cancel s3 — no active allocation touches it (payment #2 only
    // allocated to s2, payment #1 is now CANCELLED). Plain-cancel path
    // succeeds; stock returns; outstanding drops by exactly s3's due.
    await h.saleCancellation.cancel(
      s3.id,
      { reason: 'test-lifecycle' },
      owner,
    );
    expect((await h.sales.findOne(s3.id)).status).toBe(SaleStatus.CANCELLED);
    expect(await h.customers.outstanding(customer.id)).toBe(3_000);
    // Stock returned: 10 + 2 = 12.
    expect(
      (
        await h.prisma.inventoryBalance.findUnique({
          where: {
            locationId_productId: {
              locationId: shop.locationId,
              productId: productA,
            },
          },
        })
      )?.quantity,
    ).toBe(12);

    // Final state summary — the sale-coherence + payment-snapshot
    // invariants in afterEach guarantee nothing drifted internally.
    // The remaining active outstanding is exactly s1's amountDue.
    const s1Final = await h.sales.findOne(s1.id);
    expect(s1Final.amountDue).toBe(3_000);
  });
});

describe('SHOP permissions at the service level', () => {
  it('SHOP passing targetSaleId → 403 (owner-only escape hatch)', async () => {
    const productA = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productA, shop.locationId, 5);
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    const sale = await debtSale(customer.id, productA, 1, 3_000);
    await expect(
      h.payments.register(
        {
          customerId: customer.id,
          shopId: shop.shopId,
          amount: 1_000,
          targetSaleId: sale.id,
        },
        shopUser,
      ),
    ).rejects.toThrow(/Only OWNER/i);
  });

  it('SHOP registers a payment fine (their shop, oldest-first)', async () => {
    const productA = await makeProduct(h.prisma, ctx.categoryId);
    await seedStock(productA, shop.locationId, 5);
    const customer = await h.prisma.customer.create({ data: { name: 'Ali' } });
    await debtSale(customer.id, productA, 1, 3_000);
    const pay = await h.payments.register(
      { customerId: customer.id, shopId: shop.shopId, amount: 1_500 },
      shopUser,
    );
    expect(pay.amount).toBe(1_500);
    expect(pay.shopId).toBe(shop.shopId);
  });
});
