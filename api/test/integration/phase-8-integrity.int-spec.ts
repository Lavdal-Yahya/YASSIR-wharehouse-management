import {
  createHarness,
  makeProduct,
  makeShopLocation,
  resetDatabase,
  seedBasics,
} from './setup';
import type { SessionUser } from '../../src/common/types/session-user';

// P8-02 — Integrity sweep.
//
// Seeds a realistic multi-operation dataset that exercises every
// stock-changing and debt-changing code path, then asserts that all three
// standing invariants hold simultaneously:
//
//   1. Ledger balance — Σ movements = InventoryBalance for every
//      (location, product) pair.
//   2. Sale coherence — amountPaid = amountPaidAtSale + Σ active
//      allocations; paymentStatus derivation is consistent.
//   3. Payment snapshot — debtAfter = debtBefore − amount on every
//      ACTIVE payment.
//
// Unlike the per-phase tests (which run the invariants after each
// individual operation), this suite runs a rich end-to-end scenario:
// multiple products, two shops, multiple sales, partial and full payments,
// a payment reversal, and a sale cancellation — then checks all invariants at once.

const h = createHarness();

afterAll(async () => {
  await h.disconnect();
});

describe('P8-02 · integrity sweep across a realistic scenario', () => {
  let ctx: { categoryId: string; warehouseId: string; userId: string };
  let owner: SessionUser;
  let shopA: { shopId: string; locationId: string };
  let shopB: { shopId: string; locationId: string };

  beforeEach(async () => {
    await resetDatabase(h.prisma);
    ctx = await seedBasics(h.prisma);
    owner = { id: ctx.userId, name: 'Test Owner', role: 'OWNER', assignedShopId: null };
    shopA = await makeShopLocation(h.prisma, 'shop-alpha');
    shopB = await makeShopLocation(h.prisma, 'shop-beta');
  });

  it('all three invariants hold after sales, payments, reversal, and cancellation', async () => {
    // -----------------------------------------------------------------------
    // Products
    // -----------------------------------------------------------------------
    const productA = await makeProduct(h.prisma, ctx.categoryId, 'Widget A');
    const productB = await makeProduct(h.prisma, ctx.categoryId, 'Widget B');

    // -----------------------------------------------------------------------
    // Stock: open warehouse with productA(50) and productB(30)
    // -----------------------------------------------------------------------
    await h.openingStock.create(
      {
        locationId: ctx.warehouseId,
        items: [
          { productId: productA, quantity: 50 },
          { productId: productB, quantity: 30 },
        ],
      },
      owner,
    );

    // -----------------------------------------------------------------------
    // Transfer to shops
    // -----------------------------------------------------------------------
    const today = new Date().toISOString().slice(0, 10);
    await h.transfers.create(
      {
        sourceLocationId: ctx.warehouseId,
        destinationLocationId: shopA.locationId,
        transferDate: today,
        items: [{ productId: productA, quantity: 20 }],
      },
      owner,
    );
    await h.transfers.create(
      {
        sourceLocationId: ctx.warehouseId,
        destinationLocationId: shopB.locationId,
        transferDate: today,
        items: [
          { productId: productA, quantity: 10 },
          { productId: productB, quantity: 15 },
        ],
      },
      owner,
    );

    // -----------------------------------------------------------------------
    // Customer + sales
    // -----------------------------------------------------------------------
    const customer = await h.customers.create({ name: 'Alice', phone: null, notes: null });

    // Sale 1 — partial payment (3 000 of 5 000) → PARTIALLY_PAID
    await h.sales.confirm(
      {
        shopId: shopA.shopId,
        customerId: customer.id,

        items: [{ productId: productA, quantity: 5, unitPrice: 1000 }],
        amountPaidAtSale: 3000,
      },
      owner,
    );

    // Sale 2 — zero upfront → UNPAID
    await h.sales.confirm(
      {
        shopId: shopB.shopId,
        customerId: customer.id,

        items: [
          { productId: productA, quantity: 2, unitPrice: 800 },
          { productId: productB, quantity: 3, unitPrice: 600 },
        ],
        amountPaidAtSale: 0,
      },
      owner,
    );

    // Sale 3 — paid in full, no customer
    await h.sales.confirm(
      {
        shopId: shopB.shopId,
        customerId: undefined,

        items: [{ productId: productB, quantity: 5, unitPrice: 400 }],
        amountPaidAtSale: 2000,
      },
      owner,
    );

    // -----------------------------------------------------------------------
    // Payment 1 — covers sale1 remainder (2 000) then starts on sale2
    // -----------------------------------------------------------------------
    const payment1 = await h.payments.register(
      {
        customerId: customer.id,
        amount: 3000,
        shopId: shopA.shopId,
        targetSaleId: undefined,
      },
      owner,
    );

    // -----------------------------------------------------------------------
    // Reverse payment1 — debt climbs back up
    // -----------------------------------------------------------------------
    await h.payments.reverse(payment1.id, { reason: 'entered wrong amount' }, owner);

    // -----------------------------------------------------------------------
    // Payment 2 — correct payment settling all remaining debt
    // -----------------------------------------------------------------------
    const outstanding = await h.customers.outstanding(customer.id);
    await h.payments.register(
      {
        customerId: customer.id,
        amount: outstanding,
        shopId: shopA.shopId,
        targetSaleId: undefined,
      },
      owner,
    );

    // -----------------------------------------------------------------------
    // Stock correction
    // -----------------------------------------------------------------------
    await h.corrections.create(
      {
        locationId: shopB.locationId,
        productId: productB,
        adjustmentQuantity: 2,
        reason: 'count discrepancy',
      },
      owner,
    );

    // -----------------------------------------------------------------------
    // Cancel a fully-paid (no customer) sale — clean path with no active
    // allocations to block cancellation.
    // -----------------------------------------------------------------------
    const saleToCancel = await h.sales.confirm(
      {
        shopId: shopB.shopId,
        customerId: undefined,

        items: [{ productId: productB, quantity: 1, unitPrice: 300 }],
        amountPaidAtSale: 300,
      },
      owner,
    );
    await h.saleCancellation.cancel(
      saleToCancel.id,
      { reason: 'customer changed mind' },
      owner,
    );

    // -----------------------------------------------------------------------
    // Assert all three invariants
    // -----------------------------------------------------------------------
    const ledgerViolations = await h.inventory.verifyLedgerBalanceInvariant(h.prisma);
    expect(ledgerViolations).toEqual([]);

    const saleViolations = await h.sales.verifySaleCoherenceInvariant();
    expect(saleViolations).toEqual([]);

    const snapshotViolations = await h.payments.verifyPaymentSnapshotInvariant();
    expect(snapshotViolations).toEqual([]);

    const finalOutstanding = await h.customers.outstanding(customer.id);
    expect(finalOutstanding).toBe(0);
  });
});
