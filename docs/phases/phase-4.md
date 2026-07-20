# Phase 4 — Transfers & Shop Inventory (Detail)

Scope: tasks P4-01 → P4-09.
Goal: stock moves between locations atomically through the Phase 3
chokepoint; shops get their own scoped stock pages; transfer reversal
works without ever rewriting history.

This phase is deliberately thin: the dangerous machinery (locking,
movements, negative-stock protection, batch lock ordering) already exists
and is tested. Transfers are mostly *plumbing into* it. If any task here
feels like it needs new stock-mutation logic, stop — something is wrong.

Prerequisites: Phase 3 merged, including the #9/#12 backfilled tests and
the `loginAs(role)` test harness (reused heavily here).

---

## 1. Migration (P4-01) — `stock_transfers`

Implement **schema-review.md §1 verbatim**: `TransferStatus` enum,
`StockTransfer`, `StockTransferItem`, plus the two hand-added CHECKs
(`transfer_distinct_locations`, `transfer_item_qty_positive`). No
deviations; if one seems needed, edit schema-review.md first.

Same-PR obligations:
- `hasHistory()` gains `StockTransferItem` (conventions rule).
- Eyeball the generated SQL for the hand-added CHECKs before committing
  (same discipline as P3-01).

## 2. Scope decision (P4-03, resolved now): shop-to-shop is ENABLED

The spec permits shop-to-shop "if it uses the same simple transfer
process" (§16). Our transfer service is generic over (source, destination)
locations — shop-to-shop costs zero extra code and zero extra UI modes,
so it's in. What keeps it simple: **only WAREHOUSE and OWNER roles create
transfers of any kind** (the spec never grants shop employees transfer
rights — a shop "return" is recorded by the warehouse employee, §6.2).

Paste into decisions.md:

```
## D-014 · 2026-07 · Accepted
**Shop-to-shop transfers enabled; all transfers (any direction) are
created by WAREHOUSE/OWNER roles only.**
The generic (source, destination) transfer service makes shop-to-shop
free (spec §16 allows it when the process is identical). Shop employees
never create transfers — matches spec §6.2/§6.3; their visibility is
their own stock page and movement history.
```

## 3. Transfer service (P4-02)

`TransfersService.create(user, dto)` — one transaction:

1. Validate: source ≠ destination (service-level, before the CHECK ever
   fires), both locations exist and are **active** (archived → 409
   `LOCATION_ARCHIVED`), ≥1 item, quantities integer > 0, products active,
   no duplicate productId across items (merge or reject — reject, clearer).
2. `ReferenceService.next(tx, 'TRF')`.
3. Create `StockTransfer` + items (status COMPLETED — transfers have no
   draft state, schema-review §1).
4. **One batch `applyMovements` call** — one TRANSFER movement per item
   with both source and destination set, related = the transfer. The batch
   call is mandatory here (multi-item ⇒ crossed-lock rule, D-011).
   Insufficient source stock surfaces as the standard
   `INSUFFICIENT_STOCK { productId, available }` → UI message
   "The available quantity is only N" (spec §38.5).

Nothing else. Both balances move or neither does because it's one
transaction through one chokepoint call — the atomicity requirement
(spec §16.4) falls out of the architecture instead of being implemented.

### Reversal (P4-04) — `TransfersService.reverse(user, id, reason)`

OWNER only. One transaction:

1. Lock the transfer row (`SELECT ... FOR UPDATE`); status must be
   COMPLETED → else 409 `TRANSFER_NOT_REVERSIBLE`.
2. Reason required (400 without).
3. Batch `applyMovements` with **mirrored** movements (source ↔
   destination swapped, same quantities, type TRANSFER, notes
   "reversal of TRF-xxxxxx"). If the destination has since sold/moved the
   goods, the chokepoint's insufficient-stock check fires naturally →
   409 surfaced as `DESTINATION_INSUFFICIENT_STOCK` (message: the
   destination no longer holds enough of product X to reverse).
4. Set status REVERSED + reversedBy/At/reason. The original movements are
   untouched — the ledger shows both events (spec §16.5: preserve, never
   delete).

No "reverse the reversal" — re-do the transfer forward instead.

## 4. Endpoints

```
GET  /api/transfers            W+O   filters: sourceLocationId, destinationLocationId,
                                     status, date range, search by reference
GET  /api/transfers/:id        W+O
POST /api/transfers            W+O   { sourceLocationId, destinationLocationId,
                                     transferDate, notes?, items:[{productId, quantity}] }
POST /api/transfers/:id/reverse  OWNER   { reason }
```

Shop employees do **not** get transfer routes (D-014). Their view of
transfers is their stock page and the movement ledger scoped to their
location (both already exist from Phase 3 — this phase adds the routes/UI
below, not new read logic).

## 5. Frontend

### Routes
```
/transfers                W+O    list + filters
/transfers/new            W+O    form
/transfers/:id            W+O    detail + Reverse (owner)
/shop/stock               SHOP (own shop, ShopScopeGuard) + OWNER (shop picker)
```

### Components
- `TransferForm` — source picker (warehouse + active shops), destination
  picker (excludes the chosen source), then the line-item editor:
  searchable product picker showing **available quantity at the source**
  next to each product; per-line quantity capped client-side at available
  (server re-validates, as always); confirm summary
  ("5 × AirPods Pro: Entrepôt central → Boutique 1") before submit.
- `TransferDetail` — items, both locations, user, status badge
  (COMPLETED/REVERSED as text+color), link to each product's ledger;
  Reverse button (owner) opens a ConfirmDialog with mandatory reason and
  an explicit warning that destination stock will be checked.
- `ShopStockPage` — reuses `StockList` from Phase 3 pointed at the shop's
  location: search, category filter, LOW/OUT badges, per-row "movements"
  shortcut. Includes a disabled/placeholder "Sell" primary action —
  visible so the layout is final, wired in Phase 5.
- Success toasts per spec §38.5: "5 units transferred to {shop}." /
  "Transfer reversed — stock restored to {source}."

### Query keys & invalidation
`['transfers','list',params]`, `['transfers','detail',id]`. Create and
reverse invalidate `['transfers']` + `['inventory']` (both locations'
stock and ledgers refresh).

### i18n
Namespace `transfers`; new error codes: `LOCATION_ARCHIVED`,
`TRANSFER_SAME_LOCATION`, `TRANSFER_NOT_REVERSIBLE`,
`DESTINATION_INSUFFICIENT_STOCK`, `DUPLICATE_TRANSFER_ITEM`.
fr + ar together, as always.

## 6. Tests (P4-09)

Integration (the harness from Phase 3 does the role work):

1. Warehouse 20 → transfer 5 to Shop 1 → warehouse 15, shop 5, one TRF
   row, one movement per item with both sides set (spec's canonical §16.2).
2. Multi-item transfer is all-or-nothing: item 2 exceeds stock → zero
   movements, zero balance changes, no transfer row.
3. Rollback proof (the Phase 3 #9 spy pattern): force `applyMovements` to
   throw after the transfer row insert → nothing persists.
4. Same source/destination → 400 from the service (and the DB CHECK exists
   as backstop).
5. Archived destination → 409 `LOCATION_ARCHIVED`.
6. Shop → warehouse return works (direction is just data).
7. Shop A → Shop B works (D-014).
8. Reversal: full round-trip restores both balances; ledger contains
   original + mirrored movements; status REVERSED.
9. Reversal blocked when destination already sold the stock (drain the
   destination via a correction first) → 409, nothing changed.
10. Reversing a REVERSED transfer → 409 `TRANSFER_NOT_REVERSIBLE`.
11. Permissions (table-driven via `loginAs`): SHOP → 403 on every
    /transfers route; WAREHOUSE → 403 on /reverse; SHOP user requesting
    another shop's stock → gets **own** shop's data (ShopScopeGuard
    substitution, not just 403 — assert the substitution).
12. Standing invariant in afterEach (already global) stays green
    throughout.

## 7. Definition of Done — Phase 4 checklist

- [ ] Canonical example: 20 phones, transfer 5 → 15/5, TRF record visible in both locations' ledgers
- [ ] Multi-item transfer with one bad line writes nothing (test 2 + UI shows the per-line error)
- [ ] Same-location transfer impossible from UI (destination excludes source) AND API AND DB
- [ ] Reversal restores stock; reversal after destination sold out → clean 409 with product named
- [ ] Original transfer untouched after reversal; both events in the ledger
- [ ] Shop employee: sees /shop/stock for their shop only; ShopScopeGuard substitution asserted; zero transfer routes reachable (403)
- [ ] Warehouse employee: everything except /reverse (403)
- [ ] hasHistory now blocks deleting a product that only appears in a transfer
- [ ] Transfer form usable one-handed on a 360px phone in Arabic RTL; available-qty visible while picking
- [ ] decisions.md gains D-014
- [ ] All Phase 4 tests green in CI; invariant never tripped

## 8. Explicitly deferred
Selling from the shop stock page (Phase 5 — the button is a placeholder),
customer returns as a movement emitter (Phase 6), transfer reporting
beyond the list/filters (Phase 7), any approval/draft workflow (out of
scope, spec §43 — permanently).
