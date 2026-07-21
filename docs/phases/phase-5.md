# Phase 5 — Sales & Customer Debt (Detail)

Scope: tasks P5-01 → P5-08.
Goal: the core money path. A sale atomically validates stock, snapshots
prices, deducts inventory, records cash taken, and creates debt that
requires a customer. This is the highest-risk phase of the project —
everything in Phases 6–7 computes on top of what this phase writes.

## 0. HARD GATE — clears before P5-02 can merge

The auth E2E harness (`loginAs(role)` supertest helper: seeded users,
real login, captured session cookie, authenticated agent in
`test/utils/`) plus the two deferred permission matrices it unblocks:

- [ ] Phase 3 #12 backfill: SHOP → 403 on every warehouse endpoint
- [ ] Phase 4 #11 backfill: transfers matrix + ShopScopeGuard substitution assertion

This was deferred in Phase 3 and again in Phase 4. It does not survive a
third deferral: Phase 5 endpoints expose money, and "permissions verified"
must mean HTTP-level proof, not guard unit tests. Build the harness first;
it is also the tool half of this phase's own tests use.

## 1. PR structure (mandatory for this phase)

- **PR-A**: P5-01 migration + P5-02 sale service + P5-03 derived-debt
  queries + all service-level tests. **No UI.** This PR gets the
  strictest review of the project — small, isolated, focused on the
  transaction.
- **PR-B**: P5-04/05/06 UI + P5-07 wiring + HTTP-level tests.

## 2. Migration (P5-01) — `sales`

Implement **schema-review.md §2 verbatim**: `SaleStatus`, `PaymentStatus`,
`Sale`, `SaleItem`, plus the three hand-added CHECKs
(`sale_amounts_coherent`, `sale_debt_requires_customer`,
`sale_item_coherent`). Eyeball the SQL for the CHECKs before committing.

Same-PR obligations:
- `hasHistory()` gains `SaleItem`.
- Note `amountPaidAtSale` exists per **D-012** — no CustomerPayment rows
  are created in this phase at all; later debt payments are Phase 6.

## 3. The sale confirmation service (P5-02)

`SalesService.confirm(user, dto)` — spec §19.10's fifteen steps, adapted
to D-012, in **one transaction**:

```
dto = {
  shopId,                          // ignored & substituted for SHOP users
  saleDate?,                       // default now
  customerId? | newCustomer?: { name, phone? },
  amountPaidAtSale,                // integer ≥ 0
  notes?,
  items: [{ productId, quantity, unitPrice }]   // NO totals from the client
}
```

1. **Authorize**: OWNER any shop; SHOP → server substitutes their
   `assignedShopId` (ShopScopeGuard contract); WAREHOUSE → 403. Shop must
   be active.
2. **Validate items**: ≥1 item; no duplicate productId (reject,
   `DUPLICATE_SALE_ITEM` — same precedent as transfers); quantity integer
   > 0; unitPrice integer ≥ 0 (free line legal, zero-qty is not);
   products active.
3. **Compute money server-side**: `lineTotal = quantity × unitPrice`,
   `totalAmount = Σ lineTotal`. Any totals in the request body are
   ignored — the client displays, the server calculates. Validate
   `0 ≤ amountPaidAtSale ≤ totalAmount` (409 `PAYMENT_EXCEEDS_TOTAL`).
4. **Customer rule**: `amountDue = totalAmount − amountPaidAtSale`; if
   `amountDue > 0` a customer is mandatory (409 `CUSTOMER_REQUIRED`).
   `newCustomer` is created inside this transaction (name required, phone
   optional — spec §18.2). Snapshot `customerNameSnapshot` /
   `customerPhoneSnapshot` onto the sale when a customer is attached
   (even fully-paid ones).
5. **Reference**: `ReferenceService.next(tx, 'SAL')`.
6. **Create Sale + SaleItems** with snapshots: `productNameSnapshot` =
   current product name; `unitCostSnapshot` = current
   `defaultPurchaseCost` (may be null); `paymentStatus` from the shared
   derivation (P5-07); `amountPaid = amountPaidAtSale` (no allocations
   exist yet — D-012 invariant holds trivially).
7. **Deduct stock**: one **batch** `applyMovements` call — one SALE
   movement per item, `source = shop's location`, related = the sale.
   Insufficient stock → the standard `INSUFFICIENT_STOCK` with available
   quantity (spec §38.5 message), and the whole sale rolls back.
8. Return the sale with items — the confirmation screen and (Phase 6)
   receipt render from this.

What this service does NOT do: discounts (no such concept), CustomerPayment
rows (D-012), receipts (Phase 6), cancellation (Phase 6, tasks P6-10/11).

### Payment status derivation (P5-07)
One exported pure function, the only place this logic exists:
`derivePaymentStatus(totalAmount, amountPaid)` → PAID | PARTIALLY_PAID |
UNPAID. Used here, by Phase 6 recomputation, and by tests.

### Derived debt (P5-03)
`CustomersService.outstanding(tx?, customerId)` =
`Σ amountDue WHERE customerId AND status = ACTIVE`. Exposed now (the
customer list can show it), load-bearing in Phase 6 (payment validation).
Never stored on Customer — D-009.

## 4. Endpoints

```
GET  /api/sales          OWNER (all shops, shop filter) · SHOP (own shop, substituted) · WAREHOUSE 403
                         filters: paymentStatus, status, date range, customerId, search by reference
GET  /api/sales/:id      OWNER · SHOP (own shop only — a foreign sale id → 404, not 403, no existence leak)
POST /api/sales          OWNER · SHOP (substituted)
```

No PATCH, no DELETE — sales are immutable once confirmed; the only future
mutation is Phase 6's cancellation endpoint.

## 5. Frontend

### The sale flow (P5-04, P5-05) — the product's hero screen
Route `/shop/sell` (wires the Phase 4 placeholder button). Three steps in
one page, mobile-first, one-handed:

1. **Cart** — `ProductPicker` searching the shop's own stock (available
   qty on every row; out-of-stock rows visible but disabled); tapping adds
   a `CartLine`: qty stepper, `MoneyInput` for unit price **prefilled from
   `defaultSalePrice` when present, always editable** (spec §10.3);
   running total pinned bottom.
2. **Payment** — total; `MoneyInput` for amount paid now (quick actions:
   "Full amount" / "0"); remaining auto-displayed and impossible to
   miss. The moment remaining > 0, the customer block appears and is
   required: search existing (name/phone) or inline-create (name +
   optional phone). Copy per spec §38.5: "A customer is required because
   part of the sale remains unpaid."
3. **Done** — success state with reference, line items, total / paid /
   remaining, payment-status badge; "Print receipt" button present but
   disabled with a "coming in the next update" hint (receipt pages are
   Phase 6 — the layout slot is final now, like Phase 4's Sell button).

Client caps (qty ≤ available, paid ≤ total) mirror the server; the server
remains the authority; server domain errors surface on the exact field.

### Lists (P5-06)
`/sales` (OWNER: all + shop filter; SHOP: own shop) — reference, date,
customer (snapshot), total, paid, remaining, status badges; detail page
with full line items and (Phase 6 slots) payments/cancellation sections.

### Query keys & i18n
`['sales','list'|'detail']`; confirming a sale invalidates `['sales']`,
`['inventory']`, `['customers']` (outstanding changed), `['dashboard']`
(exists Phase 7 — key reserved). Namespace `sales`; new codes:
`DUPLICATE_SALE_ITEM`, `PAYMENT_EXCEEDS_TOTAL`, `CUSTOMER_REQUIRED`,
`SALE_SHOP_ARCHIVED`. fr + ar together.

## 6. Tests (P5-08) — PR-A carries most of these

**New standing invariant #2, wired into the global afterEach next to the
ledger check:** for every sale,
`amountPaid = amountPaidAtSale + Σ active allocations` (trivially
`amountPaidAtSale` this phase) **and** `amountDue = totalAmount −
amountPaid` **and** paymentStatus matches the derivation function.

1. Canonical trio (spec §19.7–19.9): 10,000 fully paid without customer;
   4,000 of 10,000 → customer mandatory, PARTIALLY_PAID, due 6,000;
   0 of 10,000 → UNPAID, due 10,000.
2. `CUSTOMER_REQUIRED` fires at the service AND the DB CHECK is proven
   once by raw insert attempt (`sale_debt_requires_customer`).
3. Multi-item sale: stock deducted per item, one movement each, batch
   call (assert single lock pass via no-deadlock crossed test at sale
   level: two concurrent sales, items (p1,p2) vs (p2,p1)).
4. Overselling: qty 4 of 3 available → 409 with available=3, zero rows.
5. Rollback spy (the Phase 3 #9 pattern): applyMovements throws → no
   sale, no items, no customer created (inline-create rolls back too).
6. Concurrent last unit: two parallel confirms for the final unit →
   exactly one succeeds; loser gets INSUFFICIENT_STOCK.
7. Snapshot immunity: confirm sale → rename product + change
   defaultSalePrice → sale item unchanged (spec §10.4 / rule §37.14).
8. Tampered client money: request carrying fake lineTotal/totalAmount
   fields → ignored, server-computed values stored (whitelist DTO proves
   it).
9. amountPaidAtSale > total → 409; negative → 400.
10. Inline customer creation: created + snapshotted; duplicate-looking
    names both allowed (search handles dupes, spec §18.4).
11. HTTP matrix (harness): WAREHOUSE → 403 on all /sales routes; SHOP
    posting with a foreign shopId → sale lands in **their own** shop
    (substitution asserted); SHOP fetching a foreign sale id → 404.
12. Archived shop → `SALE_SHOP_ARCHIVED`, nothing written.

## 7. Definition of Done — Phase 5 checklist

- [ ] Gate §0 cleared: harness exists, P3 #12 and P4 #11 backfilled and green
- [ ] PR-A merged before any UI commit touches sales
- [ ] Canonical trio verified **by reading the database**, not the UI (spec's own standard)
- [ ] Both standing invariants (ledger Σ; sale coherence) in global afterEach and green across the whole suite
- [ ] Concurrency tests 3 & 6 green in CI, not just locally
- [ ] A 3-item sale on a 360px phone in Arabic RTL completes in under ~20 seconds by a first-time user (hand the phone to someone)
- [ ] Suggested price prefills and is editable; product with no price sells fine (spec §10.3)
- [ ] "Customer required" moment is impossible to miss and inline-create works mid-sale
- [ ] Sales list/detail show snapshots (rename a product and check old sales display the old name)
- [ ] WAREHOUSE role sees no sales UI and gets 403s
- [ ] decisions.md unchanged this phase (D-012 already covers the model) — confirm no undocumented deviations crept in

## 8. Explicitly deferred
Receipts and printing (P6-06/07/08), later debt payments and allocation
(P6-02), sale cancellation incl. protected cancellation (P6-10/11),
customer account page with balances (P6-01), returns (P6, and only the
safe variant), all reporting (P7). The disabled Print button and the
empty payments section on the detail page are their landing slots.