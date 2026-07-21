import type { SessionUser } from '../../src/common/types/session-user';
import type { createHarness, makeProduct, makeShopLocation } from './setup';

// Shared seeding helpers for the Phase 7 report suites. Every report
// test suite exercises the "cancelled and reversed vanish from totals"
// rule (phase-7 §7 item 3); this file builds the fixture once so each
// suite asserts the invariant the same way.
//
// Scenario: seed one of each (active sale, cancelled sale, active
// payment, reversed payment, active expense, cancelled expense) at a
// single shop on a single date. A report's totals then must equal the
// ACTIVE-only subset — cancelled/reversed rows have zero effect.

type Harness = ReturnType<typeof createHarness>;
type Shop = Awaited<ReturnType<typeof makeShopLocation>>;

export type OneOfEachSeed = {
  activeSaleId: string;
  cancelledSaleId: string;
  activePaymentId: string;
  reversedPaymentId: string;
  activeExpenseId: string;
  cancelledExpenseId: string;
  // Numbers a report should see (ACTIVE-only). Cancelled/reversed
  // contribute zero to each.
  expected: {
    salesValue: number;
    cashAtSale: number;
    laterPayments: number;
    totalCollected: number;
    newDebt: number;
    outstanding: number;
    expenses: number;
  };
};

// Deterministic-ish numbers so assertion messages read clearly:
//   activeSale      total 10,000, paidAtSale 3,000, due 7,000
//   cancelledSale   total  5,000, paidAtSale 2,000 (cancelled → excluded)
//   activePayment   1,500 (against activeSale)
//   reversedPayment 1,000 (registered then reversed — excluded)
//   activeExpense     400
//   cancelledExpense  700 (cancelled → excluded)
export async function seedOneOfEach(
  h: Harness,
  shop: Shop,
  owner: SessionUser,
  categoryId: string,
  saleDate = '2026-06-15',
  paymentDate = '2026-06-16',
  expenseDate = '2026-06-15',
): Promise<OneOfEachSeed> {
  // Two customers so debts don't collide; two products so stock is
  // never the bottleneck.
  const [customerA, customerB, productA, productB] = await Promise.all([
    h.prisma.customer.create({ data: { name: 'Ali' } }),
    h.prisma.customer.create({ data: { name: 'Bilal' } }),
    (async () => makeProductLocal(h, categoryId))(),
    (async () => makeProductLocal(h, categoryId))(),
  ]);
  await h.openingStock.create(
    {
      locationId: shop.locationId,
      items: [
        { productId: productA, quantity: 20 },
        { productId: productB, quantity: 20 },
      ],
    },
    owner,
  );

  const activeSale = await h.sales.confirm(
    {
      shopId: shop.shopId,
      customerId: customerA.id,
      amountPaidAtSale: 3_000,
      saleDate,
      items: [{ productId: productA, quantity: 2, unitPrice: 5_000 }], // 10,000
    },
    owner,
  );

  const cancelledSale = await h.sales.confirm(
    {
      shopId: shop.shopId,
      customerId: customerB.id,
      amountPaidAtSale: 2_000,
      saleDate,
      items: [{ productId: productB, quantity: 1, unitPrice: 5_000 }], // 5,000
    },
    owner,
  );
  await h.saleCancellation.cancel(
    cancelledSale.id,
    { reason: 'seed: cancelled sale' },
    owner,
  );

  const activePayment = await h.payments.register(
    {
      customerId: customerA.id,
      shopId: shop.shopId,
      amount: 1_500,
      paymentDate,
    },
    owner,
  );

  const reversedPayment = await h.payments.register(
    {
      customerId: customerA.id,
      shopId: shop.shopId,
      amount: 1_000,
      paymentDate,
    },
    owner,
  );
  await h.payments.reverse(
    reversedPayment.id,
    { reason: 'seed: reversed payment' },
    owner,
  );

  const activeExpense = await h.expenses.create(
    {
      shopId: shop.shopId,
      amount: 400,
      description: 'seed: active expense',
      expenseDate,
    },
    owner,
  );

  const cancelledExpense = await h.expenses.create(
    {
      shopId: shop.shopId,
      amount: 700,
      description: 'seed: cancelled expense',
      expenseDate,
    },
    owner,
  );
  await h.expenses.cancel(
    cancelledExpense.id,
    { reason: 'seed: cancelled expense' },
    owner,
  );

  // Expected active-only aggregates. activeSale total 10,000 −
  // (3,000 paidAtSale + 1,500 active payment) = 5,500 due; +0 from
  // cancelled sale, +0 from reversed payment, +0 from cancelled expense.
  return {
    activeSaleId: activeSale.id,
    cancelledSaleId: cancelledSale.id,
    activePaymentId: activePayment.id,
    reversedPaymentId: reversedPayment.id,
    activeExpenseId: activeExpense.id,
    cancelledExpenseId: cancelledExpense.id,
    expected: {
      salesValue: 10_000,
      cashAtSale: 3_000,
      laterPayments: 1_500,
      totalCollected: 4_500,
      newDebt: 7_000, // activeSale amountDue at creation time
      outstanding: 5_500, // activeSale.amountDue after 1,500 payment
      expenses: 400,
    },
  };
}

// Inline helper — we can't re-import makeProduct via a top-level
// import (setup.ts imports from Prisma, causing test-runtime coupling
// churn). This mirrors the local factory used across the phase suites.
async function makeProductLocal(h: Harness, categoryId: string): Promise<string> {
  const name = `p-${Math.random().toString(36).slice(2, 8)}`;
  const p = await h.prisma.product.create({ data: { name, categoryId } });
  return p.id;
}
