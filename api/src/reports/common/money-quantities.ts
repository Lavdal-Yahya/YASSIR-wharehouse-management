import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  ACTIVE_EXPENSE,
  ACTIVE_PAYMENT,
  ACTIVE_REMITTANCE,
  ACTIVE_SALE,
} from './active-filters';
import type { OutstandingScope, ReportScope } from './report-scope';

// The four money quantities, defined exactly once (phase-7 §4). These
// are the load-bearing primitives — every report reads its numbers
// through them. Never conflate; keep the type signatures explicit so a
// future reader can't accidentally sum sales value into cash collected
// (which is exactly the trap D-012 exists to prevent).
//
// All four honour the shared ACTIVE-only rule from active-filters.ts.
// Date bounds are UTC (D-015).

// Sales value = Σ Sale.totalAmount (ACTIVE, filtered by saleDate).
// This is "what did we sell", not "what did we get". Cancellations
// drop out because ACTIVE_SALE filters them.
export async function computeSalesValue(
  prisma: PrismaService,
  scope: ReportScope,
): Promise<number> {
  const where: Prisma.SaleWhereInput = { ...ACTIVE_SALE };
  if (scope.shopId) where.shopId = scope.shopId;
  applyDateBounds(where, 'saleDate', scope);
  const agg = await prisma.sale.aggregate({ where, _sum: { totalAmount: true } });
  return agg._sum.totalAmount ?? 0;
}

// New debt created = Σ (Sale.totalAmount − Sale.amountPaidAtSale)
// for ACTIVE sales dated in the window. This is the debt that came
// into existence in the window AT SALE TIME — later payments do NOT
// retroactively reduce it (that would silently conflate "new debt"
// with "still-outstanding portion of new debt" and duplicate the
// outstanding figure).
//
// The phase-7 §4 table shorthanded this as "Σ Sale.amountDue where
// ACTIVE, by saleDate", which reads the current amountDue and thus
// drifts as later payments allocate. The owner-useful reading is the
// initial debt at sale time — matched by phase-7 §7 item 2's
// invariant that "a later payment moves cash and outstanding but
// nothing else that day".
export async function computeNewDebt(
  prisma: PrismaService,
  scope: ReportScope,
): Promise<number> {
  const where: Prisma.SaleWhereInput = { ...ACTIVE_SALE };
  if (scope.shopId) where.shopId = scope.shopId;
  applyDateBounds(where, 'saleDate', scope);
  const agg = await prisma.sale.aggregate({
    where,
    _sum: { totalAmount: true, amountPaidAtSale: true },
  });
  const total = agg._sum.totalAmount ?? 0;
  const paidAtSale = agg._sum.amountPaidAtSale ?? 0;
  return total - paidAtSale;
}

// Cash collected — the two-date-column primitive. Advisor flag #1:
// the two legs use DIFFERENT date fields on DIFFERENT tables. A single
// "sum whatever" helper would silently be wrong, so the type signature
// forces the caller to see both legs. Returns the split so a report
// can render "cash at sale" vs "later payments" separately (spec §30.2
// asks for exactly that).
//
// * cashAtSale — Σ Sale.amountPaidAtSale (ACTIVE, by saleDate)
// * laterPayments — Σ CustomerPayment.amount (ACTIVE, by paymentDate)
// * total — sum of the two, the "total collected" figure a shop report
//   headlines.
export async function computeCashCollected(
  prisma: PrismaService,
  scope: ReportScope,
): Promise<{ cashAtSale: number; laterPayments: number; total: number }> {
  const saleWhere: Prisma.SaleWhereInput = { ...ACTIVE_SALE };
  if (scope.shopId) saleWhere.shopId = scope.shopId;
  applyDateBounds(saleWhere, 'saleDate', scope);

  const paymentWhere: Prisma.CustomerPaymentWhereInput = { ...ACTIVE_PAYMENT };
  if (scope.shopId) paymentWhere.shopId = scope.shopId;
  applyDateBounds(paymentWhere, 'paymentDate', scope);

  const [saleAgg, payAgg] = await Promise.all([
    prisma.sale.aggregate({ where: saleWhere, _sum: { amountPaidAtSale: true } }),
    prisma.customerPayment.aggregate({
      where: paymentWhere,
      _sum: { amount: true },
    }),
  ]);
  const cashAtSale = saleAgg._sum.amountPaidAtSale ?? 0;
  const laterPayments = payAgg._sum.amount ?? 0;
  return { cashAtSale, laterPayments, total: cashAtSale + laterPayments };
}

// Outstanding debt = Σ Sale.amountDue (ACTIVE, as-of asOf).
// Signature-enforced: NO `from` bound (advisor flag #3). A sale from
// before any window still owes if it's ACTIVE and unpaid. `asOf` is
// the upper bound — "outstanding as of end of last month" is
// meaningful; "outstanding for last month" would drop older debt and
// silently lie.
export async function computeOutstanding(
  prisma: PrismaService,
  scope: OutstandingScope,
): Promise<number> {
  const where: Prisma.SaleWhereInput = { ...ACTIVE_SALE };
  if (scope.shopId) where.shopId = scope.shopId;
  if (scope.asOf) where.saleDate = { lte: scope.asOf };
  const agg = await prisma.sale.aggregate({ where, _sum: { amountDue: true } });
  return agg._sum.amountDue ?? 0;
}

// Expenses total — Σ Expense.amount (ACTIVE, by expenseDate).
export async function computeExpenses(
  prisma: PrismaService,
  scope: ReportScope,
): Promise<number> {
  const where: Prisma.ExpenseWhereInput = { ...ACTIVE_EXPENSE };
  if (scope.shopId) where.shopId = scope.shopId;
  applyDateBounds(where, 'expenseDate', scope);
  const agg = await prisma.expense.aggregate({ where, _sum: { amount: true } });
  return agg._sum.amount ?? 0;
}

// Remittances total (period) — Σ CashRemittance.amount (ACTIVE, by
// remittanceDate). Cash leaving the shop to be banked at the warehouse.
// Purely informational on the shop report; cash-on-hand math uses
// computeShopCashOnHand / computeWarehouseCash below.
export async function computeRemittancesSent(
  prisma: PrismaService,
  scope: ReportScope,
): Promise<number> {
  const where: Prisma.CashRemittanceWhereInput = { ...ACTIVE_REMITTANCE };
  if (scope.shopId) where.shopId = scope.shopId;
  applyDateBounds(where, 'remittanceDate', scope);
  const agg = await prisma.cashRemittance.aggregate({
    where,
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

// Shop cash-on-hand as of `asOf` (defaults to now). Derived, not stored:
//   Σ cash-at-sale + Σ later payments − Σ expenses − Σ remittances
// All four legs filtered by their own date column ≤ asOf, ACTIVE only.
// If shopId is null, aggregates across every shop.
export async function computeShopCashOnHand(
  prisma: PrismaService,
  shopId: string | null,
  asOf: Date = new Date(),
): Promise<number> {
  const saleWhere: Prisma.SaleWhereInput = {
    ...ACTIVE_SALE,
    saleDate: { lte: asOf },
  };
  const payWhere: Prisma.CustomerPaymentWhereInput = {
    ...ACTIVE_PAYMENT,
    paymentDate: { lte: asOf },
  };
  const expWhere: Prisma.ExpenseWhereInput = {
    ...ACTIVE_EXPENSE,
    expenseDate: { lte: asOf },
  };
  const remWhere: Prisma.CashRemittanceWhereInput = {
    ...ACTIVE_REMITTANCE,
    remittanceDate: { lte: asOf },
  };
  if (shopId) {
    saleWhere.shopId = shopId;
    payWhere.shopId = shopId;
    expWhere.shopId = shopId;
    remWhere.shopId = shopId;
  }
  const [sales, pays, exps, rems] = await Promise.all([
    prisma.sale.aggregate({ where: saleWhere, _sum: { amountPaidAtSale: true } }),
    prisma.customerPayment.aggregate({ where: payWhere, _sum: { amount: true } }),
    prisma.expense.aggregate({ where: expWhere, _sum: { amount: true } }),
    prisma.cashRemittance.aggregate({ where: remWhere, _sum: { amount: true } }),
  ]);
  return (
    (sales._sum.amountPaidAtSale ?? 0) +
    (pays._sum.amount ?? 0) -
    (exps._sum.amount ?? 0) -
    (rems._sum.amount ?? 0)
  );
}

// Warehouse cash-on-hand as of `asOf`. Currently only credited by
// remittances (there are no warehouse expenses). Same asOf semantics as
// the shop version — a report layer can compute both consistently.
export async function computeWarehouseCash(
  prisma: PrismaService,
  asOf: Date = new Date(),
): Promise<number> {
  const agg = await prisma.cashRemittance.aggregate({
    where: { ...ACTIVE_REMITTANCE, remittanceDate: { lte: asOf } },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

// Narrow helper — DRY over the "if from/to are set, add date bounds"
// pattern each quantity would otherwise repeat. `field` is
// deliberately typed as the union of every date column we filter on,
// so a typo like 'saledate' fails at build time.
type DateField = 'saleDate' | 'paymentDate' | 'expenseDate' | 'remittanceDate';

function applyDateBounds(
  where:
    | Prisma.SaleWhereInput
    | Prisma.CustomerPaymentWhereInput
    | Prisma.ExpenseWhereInput
    | Prisma.CashRemittanceWhereInput,
  field: DateField,
  scope: ReportScope,
): void {
  if (!scope.from && !scope.to) return;
  const range: Prisma.DateTimeFilter = {};
  if (scope.from) range.gte = scope.from;
  if (scope.to) range.lte = scope.to;
  (where as Record<string, unknown>)[field] = range;
}
