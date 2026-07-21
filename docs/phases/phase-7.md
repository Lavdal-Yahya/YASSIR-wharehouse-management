# Phase 7 — Expenses, Reports & Dashboard (Detail)

Scope: tasks P7-01 → P7-12.
Goal: the owner finally *sees* the business — and the system's marquee
distinction, **sales value vs money collected vs outstanding debt**,
becomes visible everywhere it's reported.

> **Draft caveat:** written before Phase 6 merged. The report layer sits
> on top of the money model D-012/D-013 established, so refine the exact
> aggregation queries against what Phases 5–6 actually wrote before
> committing. The *shape* below is stable; the SQL specifics may shift.

Prerequisite: Phase 6 merged. Both standing invariants live and green.

## 1. PR structure

- **PR-A**: P7-01 expenses (service + endpoints + tests) + P7-03 the
  reusable report query layer + P7-04→08 report services with tests.
  Reports are read-only aggregations — lower risk than Phases 5–6 — so a
  single service-focused PR is fine; no forced UI split.
- **PR-B**: P7-02/10/11 UI (expenses, dashboards, report screens) + HTTP
  permission tests.

The one thing in this phase that *writes* is expenses; it gets the normal
cancellation-not-deletion treatment and its own tests.

## 2. Migration (P7-01) — `expenses`

Implement **schema-review.md §4 verbatim**: `ExpenseStatus`, `Expense`,
plus `expense_amount_positive`. `ExpenseCategory` already exists (Phase 2).
`hasHistory()` does not grow (expenses reference shops/categories, not
products). Eyeball the CHECK before committing.

## 3. Expenses (P7-01, P7-02)

`ExpensesService` — straightforward, but cancellation-not-deletion applies
(spec §26.3, integrity rule §37.17):

```
GET   /api/expenses            OWNER(all, shop filter) · SHOP(own, substituted) · WAREHOUSE 403
                               filters: shopId, categoryId, date range, status, search by reference
GET   /api/expenses/:id        OWNER · SHOP(own; foreign → 404)
POST  /api/expenses            OWNER · SHOP(substituted)   { shopId, categoryId?, amount, expenseDate, description, notes? }
PATCH /api/expenses/:id        OWNER · SHOP(own)   edit description/category/amount while ACTIVE
POST  /api/expenses/:id/cancel OWNER · SHOP(own)   { reason }   → status CANCELLED, excluded from totals
```

- `amount` integer > 0; `description` required; `expenseDate` defaults now.
- Reference `EXP-xxxxxx`. Cancelled expenses stay in history, leave all
  totals (the report layer filters `status = ACTIVE`).
- UI: `/shop/expenses` (add/list/cancel, shop-scoped) reusing the
  ListPage + EntityForm + ConfirmDialog patterns; expense categories
  managed under settings (Phase 2).

## 4. The report query layer (P7-03) — build once, reuse everywhere

A single module every report goes through, so filtering and the
active-only rule are never re-implemented:

- **Common filter**: `{ shopId?, from?, to? }`; date grouping uses the
  business timezone from settings (dates are stored UTC — conventions §3).
- **Iron rule, enforced in one place**: every aggregation counts only
  `status = ACTIVE` rows (sales, payments, expenses) and only active
  allocations (D-013: payment ACTIVE ∧ sale ACTIVE). Cancelled/reversed
  anything is invisible to totals. A cancelled-records-excluded test rides
  every report.
- **The three money quantities**, defined once and never conflated
  (spec §22, the reason D-012 exists):

  | Quantity | Definition |
  |---|---|
  | **Sales value** | Σ `Sale.totalAmount` where ACTIVE, by `saleDate` |
  | **Cash collected** | Σ `Sale.amountPaidAtSale` (ACTIVE, by saleDate) **+** Σ `CustomerPayment.amount` (ACTIVE, by paymentDate) |
  | **New debt created** | Σ `Sale.amountDue` where ACTIVE, by saleDate |
  | **Outstanding debt** | Σ `Sale.amountDue` where ACTIVE (as-of, not date-bound) |

  Cash collected splits into "cash at sale" and "later debt payments" so a
  report can show both (spec §30.2). The invariant that keeps everyone
  honest: a later debt payment raises cash-collected and lowers
  outstanding but **never** touches sales value for its day.

## 5. Reports (P7-04 → P7-08)

Each is a read endpoint returning numbers + the rows behind them; all go
through §4. Roles: OWNER sees all/any shop; SHOP sees own shop only
(substituted); WAREHOUSE sees warehouse reports only.

- **Shop report** (P7-04): sales value / cash at sale / later payments /
  total collected / new debt / outstanding / expenses /
  (collected − expenses). This is the spec §22 example made real —
  100,000 sold, 60,000 collected, 40,000 debt must render as three
  distinct figures.
- **Warehouse reports** (P7-05): current stock, received, transferred out,
  corrections, low/out-of-stock — mostly reads over the movement ledger
  and balances from Phase 3.
- **Sales reports** (P7-06): by status, shop, product, date.
- **Debt reports** (P7-07): outstanding by customer, by shop; unpaid vs
  partially-paid sales; payments received in a period.
- **Incoming-order report** (P7-08): ordered vs received vs remaining by
  status (over Phase 3 data).
- **Date filters** (part of §4): today / this week / this month / custom
  range, applied uniformly.
- **Estimated profit block** (P7-09): COGS = Σ `unitCostSnapshot × qty`
  **only for lines where the snapshot exists**; gross = sales value − COGS.
  **Label it "estimated" and show the coverage** ("costs known for 70% of
  items") whenever any cost is missing. Never render "net profit" with
  incomplete costs (spec §27, integrity rule — this is a labeling
  requirement, not just a calculation).

## 6. Dashboards (P7-10, P7-11)

- **Owner dashboard** (P7-10): today's **sales value / cash collected /
  new debt as three separate figures** (the design brief's signature
  distinction), total outstanding debt, low-stock list, incoming orders
  not fully received, per-shop summary cards. Numbers-first; no decorative
  charts (spec §9, design brief §4.3).
- **Shop dashboard** (P7-11): the same but scoped to the employee's shop —
  today's sales value vs collected, their new debt, their low stock, quick
  actions (Sell / Register Payment / Add Expense wired from Phases 5–6).
- Reuses the stock-status function (Phase 3) and the §4 money definitions —
  the dashboard invents no new math.

## 7. Tests (P7-12)

Read-heavy, but the money-separation tests are the point of the phase:

1. **Spec §22 scenario**: sell 100,000 across sales, collect 60,000 →
   report shows sales value 100,000, cash collected 60,000, outstanding
   40,000 — three distinct numbers, verified in DB terms.
2. **Later payment moves cash not sales**: on a later day, a 10,000 debt
   payment → that day's cash collected +10,000, that day's sales value
   +0, outstanding −10,000.
3. **Cancelled/reversed exclusion**: a cancelled sale and a reversed
   payment vanish from every total (rides every report).
4. **Outstanding = Σ active sale amountDue**, cross-checked against the
   Phase 5 derived-debt query (two paths, same number).
5. **Estimated profit**: mixed known/unknown costs → gross labeled
   estimated with correct coverage %; all-unknown → no profit figure, only
   collected − expenses.
6. **Date boundaries**: a sale at 23:59 business-time lands in the right
   day; week/month/custom filters partition correctly.
7. **Shop scoping**: shop report for shop A excludes shop B's sales,
   payments, expenses; SHOP role can't pull another shop's report (HTTP).
8. **Expense lifecycle**: add → in totals; cancel → out of totals, still
   in history; WAREHOUSE 403 on expenses.

## 8. Definition of Done — Phase 7 checklist

- [ ] Sales value, cash collected, and outstanding debt are three visibly
      distinct figures on the owner dashboard and shop report — never conflated
- [ ] Spec §22 example reproduces exactly (100k / 60k / 40k) from real data
- [ ] A later debt payment moves cash-collected and outstanding but not that day's sales value
- [ ] Every report excludes cancelled sales, reversed payments, cancelled expenses
- [ ] Estimated profit is labeled estimated with coverage whenever costs are partial; never "net profit" with gaps
- [ ] Date filters (today/week/month/custom) partition correctly across a day boundary in business timezone
- [ ] Shop employee sees only their shop's reports/dashboard; proven over HTTP
- [ ] Expenses: add/edit/cancel, cancelled excluded from totals, WAREHOUSE 403
- [ ] Owner can answer every question in spec §2 from the app
- [ ] Dashboards usable on a phone in Arabic RTL; numbers legible, no horizontal scroll
- [ ] Both standing invariants still green across the whole suite

## 9. Explicitly deferred
CSV/Excel export (spec §30.7 — optional, only if separately approved; do
not let it delay the phase), any BI/analytics charting (out of scope §43),
production deployment + backups (Phase 8).
