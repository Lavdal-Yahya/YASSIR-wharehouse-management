# Phase 6 — Customer Payments, Receipts & Cancellations (Detail)

Scope: tasks P6-01 → P6-11.
Goal: debts get repaid correctly (oldest-first allocation), every
transaction has a printable trace, and sales/payments can be reversed
without ever corrupting stock or debt. This phase reads and recomputes the
money that Phase 5 wrote — the reversal paths are where naive systems
break, so the same test discipline applies.

Prerequisite: Phase 5 (both PRs) merged. The two standing invariants
(ledger Σ; sale coherence) are live in the global afterEach and must stay
green through every test added here.

## 1. PR structure

- **PR-A**: P6-02 payment service + P6-04 reversal + P6-10/11 cancellation
  + P6-03 admin-targeted allocation + all service tests. **No UI.**
  Reversal and cancellation get the same strict isolated review PR-A got
  in Phase 5.
- **PR-B**: P6-01 customer account page + P6-05 register-payment UI +
  P6-06/07/08 receipts + HTTP-level tests.

## 2. Migration (P6-01 tables) — `customer_payments`

Implement **schema-review.md §3 verbatim**: `CustomerPaymentStatus`,
`CustomerPayment`, `PaymentAllocation`, plus the CHECKs
(`payment_amount_positive`, `payment_debt_snapshot_coherent`,
`allocation_positive`) and the `@@unique([customerPaymentId, saleId])`.
Eyeball the SQL CHECKs before committing.

**Do not add a status column to PaymentAllocation** — D-013: an allocation
is active iff its payment is ACTIVE **and** its sale is ACTIVE. This is the
single most important modeling rule of the phase; every query below leans
on it. `hasHistory()` does **not** grow here (payments/allocations
reference sales and customers, not products).

## 3. The allocation engine (P6-02) — the heart of the phase

`PaymentsService.register(user, dto)` — one transaction:

```
dto = { customerId, shopId, amount, paymentDate?, notes? }
```

1. **Authorize**: OWNER any shop; SHOP → `shopId` substituted to their
   `assignedShopId`; WAREHOUSE → 403. Shop active.
2. **Validate**: `amount` integer > 0; customer exists.
3. **Read outstanding under lock**: load the customer's ACTIVE sales with
   `amountDue > 0`, **oldest first (saleDate, then createdAt)**, and lock
   those sale rows (`SELECT ... FOR UPDATE`) so a concurrent payment/sale
   can't race the allocation. `debtBefore = Σ amountDue`.
4. **Reject overpayment**: `amount > debtBefore` → 409
   `PAYMENT_EXCEEDS_DEBT` (v1 has no credit balances — spec §21.2). Message
   carries the actual outstanding ("The customer only owes N").
5. **Reference**: `ReferenceService.next(tx, 'PAY')`.
6. **Allocate oldest-first**: walk the sorted sales, consuming `amount`;
   for each touched sale create a `PaymentAllocation(amountAllocated)`,
   increase `sale.amountPaid`, recompute `amountDue` and `paymentStatus`
   via the shared `derivePaymentStatus`. Stop when `amount` is exhausted
   (spec §21.3 example: 4,000 across 3,000+5,000 → first settled, 1,000
   onto the second).
7. **Snapshot**: `debtAfterPayment = debtBefore − amount`; store both on
   the payment (receipt reads these).
8. Money-received-by-shop is recorded via `CustomerPayment.shopId` — no
   separate cash table; reports sum it (Phase 7).

### Admin-targeted allocation (P6-03)
OWNER may pass optional `targetSaleId` to direct the whole payment at one
sale (still bounded by that sale's `amountDue` and the customer's total
debt). The employee flow stays automatic oldest-first — no UI for
targeting; it's an owner-only escape hatch (spec §21.3).

## 4. Payment reversal (P6-04)

`PaymentsService.reverse(user, paymentId, reason)` — OWNER only, one
transaction:

1. Lock the payment; status must be ACTIVE → else 409
   `PAYMENT_NOT_REVERSIBLE`. Reason required.
2. For each of its allocations, lock the sale, subtract `amountAllocated`
   from `sale.amountPaid`, recompute `amountDue` + `paymentStatus`.
3. Set payment status CANCELLED + cancelledBy/At/reason. **Allocations are
   neither deleted nor flagged** (D-013) — they simply stop counting
   because their parent payment is no longer ACTIVE. History intact.
4. The customer's outstanding rises back by exactly `amount` (spec §25).

## 5. Sale cancellation (P6-10, P6-11)

### Plain cancellation (P6-10) — sale with NO later payments
`SalesService.cancel(user, saleId, reason)` — OWNER only, one transaction:

1. Lock the sale; must be ACTIVE and have **zero active allocations**
   (only its own `amountPaidAtSale`). Reason required.
2. **Return stock**: batch `applyMovements` — one SALE_CANCELLATION
   movement per item, `destination = shop's location` (mirror of the
   original SALE), related = the sale. Stock comes back.
3. Set sale status CANCELLED + fields. Its `amountDue` leaves the
   customer's outstanding automatically (derived query filters
   `status = ACTIVE`). Its `amountPaidAtSale` leaves cash-collected
   automatically (Phase 7 reports filter ACTIVE). Nothing to patch.

### Protected cancellation (P6-11) — sale WITH later payments
The sensitive case (spec §24.2). Rule for v1:

- OWNER only; ordinary roles 403 (already true — but explicitly tested).
- If the sale has **any active allocation**, `cancel` refuses with 409
  `SALE_HAS_ACTIVE_PAYMENTS`, listing the payment references that must be
  reversed first. The system does **not** auto-reverse them — the owner
  reverses each payment (P6-04) deliberately, then cancels. This is the
  "properly reversed or addressed" safe path the spec asks for, chosen
  over silent cascade because money movements should never be implicit.
- Once all allocations are inactive (payments reversed), the sale meets
  the plain-cancellation precondition and cancels normally.

### Returns (spec §24.3)
Full-sale cancellation (above) is the supported return in v1. **Partial
returns are NOT built** — the spec explicitly says not to ship a fragile
partial-return flow, and item-level returns would touch stock + debt +
allocation recomputation at once. Deferred, documented, not attempted.
(CUSTOMER_RETURN movement type stays reserved for a future safe design.)

## 6. Endpoints

```
GET  /api/customers/:id/account   OWNER · SHOP   totals + unpaid sales + payment history (P6-01)
POST /api/payments                 OWNER · SHOP(substituted) · WAREHOUSE 403   (register)
GET  /api/payments                 OWNER (all, shop filter) · SHOP (own shop) · filters: customer, date range, status
GET  /api/payments/:id             OWNER · SHOP(own shop; foreign → 404)
POST /api/payments/:id/reverse     OWNER   { reason }
POST /api/sales/:id/cancel         OWNER   { reason }
GET  /api/sales/:id/receipt        OWNER · SHOP(own shop)   receipt data (snapshots)
GET  /api/payments/:id/receipt     OWNER · SHOP(own shop)   payment receipt data
```

Receipt endpoints return **snapshot data only** — never live-joined
product names or recomputed debt — so a reprint is byte-for-byte the
original (spec §23.4). They render the print pages in §7.

## 7. Frontend

### Customer account page (P6-01) — replaces the paper debt notebook
Route `/customers/:id`. Per spec §18.5: name/phone; totals (total bought /
total paid / **outstanding**, outstanding visually dominant); list of
unpaid + partially-paid sales each with its remaining balance and a link
to the sale; payment history (each with reference, amount, date, shop,
reversed badge if cancelled); **Register Payment** primary action;
per-payment "Print receipt". This screen must feel instantly trustworthy —
it's the one the owner checks when a customer disputes a debt.

### Register payment (P6-05)
From the account page. `MoneyInput` bounded by outstanding (server
re-validates); a plain-language allocation preview **before** confirm
("This settles SAL-000015 and pays 1,000 toward SAL-000021"); confirm
shows debt-before → debt-after and offers the receipt. Copy per spec
§38.5: "Customer payment recorded. Remaining debt: 7,000 MRU."

### Receipts (P6-06, P6-07, P6-08) — separate print register
Dedicated routes `/sales/:id/receipt` and `/payments/:id/receipt` with
**print-only CSS** (per the design brief §3.5): white background, black
text, no color, 80mm-thermal friendly, browser-print ready. Sale receipt
and payment receipt carry exactly the spec §23.1/§23.2 fields, all from
snapshots. Reprint = navigate to the same route; values are frozen.
Wire the disabled "Print receipt" buttons left as slots in Phase 5's
confirmation screen and detail page.

### Cancellation UI
On the sale detail page (OWNER): Cancel button → ConfirmDialog with
mandatory reason; if the API returns `SALE_HAS_ACTIVE_PAYMENTS`, the
dialog shows the blocking payment references with links to reverse them —
turning the 409 into a guided next step, not a dead end. Payment reversal:
same pattern on the payment detail / account page.

### Query keys & invalidation
`['payments','list'|'detail']`, `['customers','account',id]`. Registering
a payment invalidates `['customers','account',id]`, `['customers']`
(outstanding), `['sales']` (statuses), `['payments']`, `['dashboard']`.
Reversal and cancellation invalidate the same set. i18n namespace
`payments` + codes: `PAYMENT_EXCEEDS_DEBT`, `PAYMENT_NOT_REVERSIBLE`,
`SALE_HAS_ACTIVE_PAYMENTS`, `SALE_NOT_CANCELLABLE`. fr + ar together.

## 8. Tests — PR-A carries the money paths

Both standing invariants stay in afterEach and must hold after every
reversal/cancellation test (that they still hold post-reversal is half the
point).

1. **Oldest-first**: 3,000 + 5,000 debts, pay 4,000 → first PAID, second
   PARTIALLY_PAID due 4,000; allocations sum to 4,000 (spec §21.3).
2. **Exact settle across two sales**: pay 8,000 → both PAID, outstanding 0.
3. **Overpay** → 409 `PAYMENT_EXCEEDS_DEBT`, nothing written.
4. **Reversal restores exactly**: register → reverse → every touched sale
   back to its pre-payment amountPaid/amountDue/status; outstanding back
   up by `amount`; allocations still present but inactive (assert they're
   excluded from the derived debt).
5. **Reverse-twice** → 409 `PAYMENT_NOT_REVERSIBLE`.
6. **Plain cancel**: unpaid sale → stock returns (SALE_CANCELLATION
   movements assert-match the original SALE quantities), sale CANCELLED,
   gone from active sales + outstanding.
7. **Protected cancel blocked**: sale with an active allocation → 409
   `SALE_HAS_ACTIVE_PAYMENTS` naming the payment; nothing changed.
8. **Protected cancel happy path**: reverse the payment, then cancel →
   succeeds; stock back; both invariants hold.
9. **Cash-at-sale on cancel**: a partially-paid sale's cancellation
   removes its amountPaidAtSale from active totals (Phase 7 will read it;
   assert the sale is ACTIVE-filtered out).
10. **Concurrency**: two parallel payments on the same customer with one
    settleable sale → allocations don't double-spend (row locks on sales);
    combined never exceeds debt.
11. **Admin-targeted allocation** (P6-03): owner directs payment to a
    specific sale; bounded by that sale's due.
12. **Receipt immutability**: cancel/reverse after issuing → reprint still
    shows original snapshot values (spec §23.4).
13. **HTTP matrix**: WAREHOUSE 403 on payments + cancel + reverse; SHOP
    can register (own shop, substituted) but SHOP calling reverse/cancel →
    403; foreign customer/payment id → 404.

## 9. Definition of Done — Phase 6 checklist

- [ ] PR-A merged before any receipt/account UI commit
- [ ] Oldest-first allocation matches spec §21.3 example, verified in DB
- [ ] Reversal and cancellation restore exact prior state; both standing invariants green after every such test
- [ ] Protected-cancel path: blocked with named payments, then works once they're reversed — no auto-cascade
- [ ] Overpay and double-reverse both rejected cleanly with useful messages
- [ ] Receipts print white/black, thermal-friendly, from snapshots; reprint after cancellation is unchanged
- [ ] Customer account page: outstanding dominant, unpaid sales + history correct; usable on a phone in Arabic RTL
- [ ] Register-payment shows the allocation preview before confirm and debt-before→after after
- [ ] WAREHOUSE sees none of this; SHOP registers but cannot reverse/cancel — proven over HTTP
- [ ] Partial returns confirmed NOT built; CUSTOMER_RETURN still unused
- [ ] Full debt lifecycle demoed end to end: debt sale → two payments → reverse one → cancel another sale — balances correct at every step (spec's own acceptance walk)

## 10. Explicitly deferred
All reporting and the dashboards that aggregate this money (Phase 7 —
cash-collected vs sales-value separation, per-shop/customer debt reports),
expenses (Phase 7), partial/item-level returns (out of scope v1),
production hardening + backups (Phase 8).