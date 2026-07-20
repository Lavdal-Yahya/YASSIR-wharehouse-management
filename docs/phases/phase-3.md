# Phase 3 — Warehouse & Incoming Orders (Detail)

Scope: tasks P3-01 → P3-13.
Goal: ordered ≠ stock; only received quantities enter the warehouse; the
inventory chokepoint and movement ledger go live. This is the phase where
the system starts holding truth it can never lose.

**Gate reminder:** phase-2.md §7 requires the full remaining-schema review
(`docs/phases/schema-review.md`, all tables through Phase 7) **before this
phase's migration is written**. The schema below is this phase's slice of
that review — do not run P3-01 until the review is done and any changes are
folded back in here.

---

## 1. Migration (P3-01) — `inventory_and_orders`

```prisma
enum OrderStatus {
  ORDERED
  SHIPPED
  PARTIALLY_RECEIVED
  RECEIVED
  CANCELLED
}

enum MovementType {
  OPENING_STOCK
  ORDER_RECEIPT
  DIRECT_RECEIPT
  TRANSFER            // Phase 4
  SALE                // Phase 5
  SALE_CANCELLATION   // Phase 6
  CUSTOMER_RETURN     // Phase 6, if built
  STOCK_CORRECTION
}

model ReferenceCounter {
  kind  String @id      // "ORD" | "REC" | "TRF" | "SAL" | "PAY" | "EXP" | "ADJ"
  value Int    @default(0)
}

model IncomingOrder {
  id                  String       @id @default(cuid())
  referenceNumber     String       @unique
  supplierName        String?
  orderDate           DateTime
  expectedArrivalDate DateTime?
  status              OrderStatus  @default(ORDERED)
  notes               String?
  createdBy           String
  cancelledBy         String?
  cancelledAt         DateTime?
  cancellationReason  String?
  createdAt           DateTime     @default(now())
  updatedAt           DateTime     @updatedAt
  items               IncomingOrderItem[]
  receipts            StockReceipt[]
}

model IncomingOrderItem {
  id               String        @id @default(cuid())
  incomingOrderId  String
  order            IncomingOrder @relation(fields: [incomingOrderId], references: [id])
  productId        String
  product          Product       @relation(fields: [productId], references: [id])
  quantityOrdered  Int
  quantityReceived Int           @default(0)
  unitCost         Int?          // whole MRU
  notes            String?

  @@index([incomingOrderId])
  @@index([productId])
}

model StockReceipt {
  id              String         @id @default(cuid())
  referenceNumber String         @unique
  incomingOrderId String?        // null = direct receipt
  order           IncomingOrder? @relation(fields: [incomingOrderId], references: [id])
  receiptDate     DateTime
  supplierName    String?
  notes           String?
  createdBy       String
  createdAt       DateTime       @default(now())
  items           StockReceiptItem[]
}

model StockReceiptItem {
  id             String       @id @default(cuid())
  stockReceiptId String
  receipt        StockReceipt @relation(fields: [stockReceiptId], references: [id])
  productId      String
  quantity       Int
  unitCost       Int?

  @@index([productId])
}

model InventoryBalance {
  id         String   @id @default(cuid())
  locationId String
  location   Location @relation(fields: [locationId], references: [id])
  productId  String
  product    Product  @relation(fields: [productId], references: [id])
  quantity   Int      @default(0)
  updatedAt  DateTime @updatedAt

  @@unique([locationId, productId])
}

model InventoryMovement {
  id                    String       @id @default(cuid())
  productId             String
  product               Product      @relation(fields: [productId], references: [id])
  movementType          MovementType
  quantity              Int          // ALWAYS > 0; direction = source/destination
  sourceLocationId      String?
  destinationLocationId String?
  relatedEntityType     String?      // "StockReceipt" | "StockTransfer" | "Sale" | "StockCorrection" | ...
  relatedEntityId       String?
  notes                 String?
  createdBy             String
  createdAt             DateTime     @default(now())

  @@index([productId, createdAt])
  @@index([sourceLocationId])
  @@index([destinationLocationId])
  @@index([relatedEntityType, relatedEntityId])
}

model StockCorrection {
  id                 String   @id @default(cuid())
  referenceNumber    String   @unique
  locationId         String
  productId          String
  adjustmentQuantity Int      // signed: +found / -removed (the human-facing record)
  reason             String
  notes              String?
  createdBy          String
  createdAt          DateTime @default(now())
}
```

**Hand-edit the generated migration SQL** (Prisma can't express these):
```sql
ALTER TABLE "InventoryBalance"  ADD CONSTRAINT balance_non_negative  CHECK ("quantity" >= 0);
ALTER TABLE "InventoryMovement" ADD CONSTRAINT movement_qty_positive CHECK ("quantity" > 0);
ALTER TABLE "InventoryMovement" ADD CONSTRAINT movement_has_side
  CHECK ("sourceLocationId" IS NOT NULL OR "destinationLocationId" IS NOT NULL);
ALTER TABLE "IncomingOrderItem" ADD CONSTRAINT received_within_ordered
  CHECK ("quantityReceived" >= 0 AND "quantityReceived" <= "quantityOrdered");
```
Seed update: insert the 7 ReferenceCounter rows (idempotent upsert).

### Movement direction convention (memorize it)
`quantity` is always positive. Direction is encoded by which side is set:
- stock **in** → `destinationLocationId` set (receipt, opening stock, +correction)
- stock **out** → `sourceLocationId` set (sale, −correction)
- **move** → both set (transfer: one movement row, two balance changes)

`StockCorrection.adjustmentQuantity` keeps its human-facing sign; its
movement row is `abs(qty)` with the side chosen by the sign.

## 2. Inventory core (P3-02, P3-03) — the chokepoint

### ReferenceService
```ts
next(tx: Tx, kind: 'ORD'|'REC'|'TRF'|'SAL'|'PAY'|'EXP'|'ADJ'): Promise<string>
```
`SELECT ... FOR UPDATE` the counter row, increment, format
`` `${kind}-${String(value).padStart(6,'0')}` ``. Gaps after rollbacks are
acceptable (architecture §3.8).

### InventoryService.applyMovement — the only stock writer
```ts
applyMovement(tx: Tx, input: {
  productId: string; quantity: number; movementType: MovementType;
  sourceLocationId?: string; destinationLocationId?: string;
  relatedEntityType?: string; relatedEntityId?: string;
  notes?: string; createdBy: string;
}): Promise<void>
```
Inside the **caller's** transaction (`tx` mandatory — no default):
1. Validate `quantity > 0` (integer) and at least one side set.
2. Ensure balance rows exist:
   `INSERT ... ON CONFLICT ("locationId","productId") DO NOTHING` per side.
3. Lock the affected balance rows with `SELECT ... FOR UPDATE`, **ordered by
   (locationId, productId)** — deterministic lock order prevents deadlocks
   when transfers cross.
4. Source side: if `balance.quantity < quantity` →
   `InsufficientStockError { productId, available }`. Apply −qty.
5. Destination side: apply +qty.
6. Insert the `InventoryMovement` row.

The DB CHECK is the backstop, not the mechanism — the service throws the
domain error before the constraint ever fires in normal operation.

**Batch variant — required, not optional:** also expose
`applyMovements(tx, inputs: MovementInput[])` which collects *every*
affected (location, product) pair across all inputs, sorts them once, locks
them once, then applies all deltas and inserts all movement rows.
Multi-item operations (a 3-product sale, a multi-line transfer) MUST use
the batch call: looping `applyMovement` per item locks pairs in item order,
and two concurrent operations touching the same products in different
order will deadlock. Single-movement calls remain fine for single-item
operations (corrections, one-line receipts).

### Balance/ledger invariant test (standing test #1, runs in every suite)
For every (location, product):
`Σ movements(destination=loc) − Σ movements(source=loc) == balance.quantity`.

### hasHistory() extension (same PR as the migration — conventions rule)
Product history now = exists in `IncomingOrderItem` ∪ `StockReceiptItem`
∪ `InventoryMovement` ∪ `StockCorrection`.

### Shop-archive warning goes live (phase-2 §3 stub)
`ShopsService.getStockSummary(shopId)` now reads real balances; archiving
a shop that still holds stock shows "shop still holds N products / M units"
before the owner confirms (spec §15.4).

## 3. Modules & endpoints

Roles: `OWNER, WAREHOUSE` on everything below unless noted.

### incoming-orders (P3-04 … P3-06, P3-12)
```
GET    /api/incoming-orders                 list; filters: status[], search (ref/supplier), date range
GET    /api/incoming-orders/:id             with items + linked receipts
POST   /api/incoming-orders                 create
PATCH  /api/incoming-orders/:id             notes / expectedArrivalDate / supplierName only, and only while not RECEIVED/CANCELLED
POST   /api/incoming-orders/:id/receive     the receiving transaction
POST   /api/incoming-orders/:id/cancel      { reason } — required
```

**Create DTO** — items accept either an existing product or an inline new one:
```ts
{ supplierName?, orderDate, expectedArrivalDate?, notes?,
  items: Array<
    { productId: string;                       quantityOrdered: number; unitCost?: number; notes?: string } |
    { newProduct: { name: string; categoryId: string; sku?; defaultSalePrice?; ... };
                                               quantityOrdered: number; unitCost?: number; notes?: string }
  > }
```
Inline products are created inside the same transaction (spec §11.2), with
zero stock and no movements — they simply exist and are on order.

**Receive transaction (P3-05)** — body
`{ receiptDate?, notes?, items: [{ orderItemId, quantity }] }`; per order,
in one transaction:
1. Load order `FOR UPDATE`; reject if `CANCELLED` or `RECEIVED`.
2. Per item: `0 < quantity ≤ (quantityOrdered − quantityReceived)`.
   Over-receipt → `RECEIVE_EXCEEDS_REMAINING` with a message pointing the
   user to a direct receipt for the extra units (spec §11.6). At least one
   item with quantity > 0.
3. `ReferenceService.next(tx,'REC')` → create StockReceipt (linked to order,
   carrying each item's `unitCost` from the order item) + items.
4. Per item: `applyMovement(tx, { type: ORDER_RECEIPT, quantity,
   destination: warehouse, relatedEntity: receipt })` and increment
   `quantityReceived`.
5. Recompute status: all items full → `RECEIVED`; any received → `PARTIALLY_RECEIVED`.

**Cancel (P3-06):** allowed unless status is `RECEIVED` or already
`CANCELLED`. **Interpretation decided here:** cancelling a
partially-received order keeps the already-received stock and its
receipts/movements (the goods physically arrived) and closes the remainder;
the order shows received vs ordered forever. Reason mandatory; adds no
stock; excluded from active lists (spec §11.7).

### stock-receipts (P3-07)
```
GET    /api/stock-receipts              list (source: order-linked | direct), search, dates
GET    /api/stock-receipts/:id
POST   /api/stock-receipts/direct       { receiptDate?, supplierName?, notes?, items: [{ productId, quantity, unitCost? }] }
```
Direct receipt = same transaction shape as receiving, minus the order:
REC reference, receipt + items, `DIRECT_RECEIPT` movements into the warehouse.

### inventory (P3-08 … P3-11)
```
GET    /api/inventory/:locationId               balances; search, categoryId, lowStockOnly, outOfStockOnly
                                                (WAREHOUSE role: warehouse location only; SHOP: own shop — ShopScopeGuard;
                                                 shop UI consumes this in Phase 4)
GET    /api/inventory/movements                 filters: productId, locationId, movementType, dates — paginated ledger view
POST   /api/inventory/opening-stock             OWNER only (spec §13): { locationId, items: [{ productId, quantity, unitCost?, notes? }] }
POST   /api/inventory/corrections               OWNER, WAREHOUSE: { locationId, productId, adjustmentQuantity (≠0), reason (required), notes? }
GET    /api/inventory/corrections               list
```
- **Opening stock:** one `OPENING_STOCK` movement per item into the chosen
  location. Reject items for (location, product) pairs that already have
  *any* movement — opening stock initializes, it never adjusts; corrections
  do that. (Interpretation decided here — keeps "initial stock" honest.)
- **Corrections:** ADJ reference + StockCorrection row + one movement
  (`abs(qty)`, side by sign). Negative corrections hit the same
  insufficient-stock guard as everything else. Reason is required, not
  optional — this is the audit trail for shrinkage.
- Low stock derivation: `quantity ≤ (product.lowStockThreshold ??
  settings.defaultLowStockThreshold ?? 0)`; out-of-stock = 0. Computed in
  the query, returned as flags — the client never derives it.

## 4. Frontend

### Routes added
```
/warehouse                          OWNER, WAREHOUSE   (stock list — becomes the warehouse home)
/warehouse/movements                OWNER, WAREHOUSE   (ledger, filterable; also reachable per-product)
/warehouse/corrections              OWNER, WAREHOUSE
/warehouse/receipts, /receipts/:id  OWNER, WAREHOUSE
/warehouse/receipts/direct          OWNER, WAREHOUSE
/orders, /orders/new, /orders/:id   OWNER, WAREHOUSE
/orders/:id/receive                 OWNER, WAREHOUSE
/settings/opening-stock             OWNER
```

### Screens & components
- **Warehouse stock list**: the ListPage pattern from Phase 2 + quantity
  prominent, Low/Out badges (text+color), row actions: history · receive ·
  (transfer — appears Phase 4). This is the warehouse employee's home.
- **Order create**: multi-item form with the searchable product picker +
  "create new product" inline sheet (reuses the Phase 2 product form with
  only name+category required); running item count. `QuantityInput`
  (integer stepper, min 1) is built here and reused everywhere after.
- **Receive flow**: the order's items as rows — ordered · already received ·
  remaining · [receive now] input pre-filled with remaining; confirm screen
  summarizes what will enter stock. Success message per spec voice:
  "45 units added to the warehouse. 5 remaining on ORD-000003."
- **Movement history**: reverse-chron ledger rows: date · type ·
  qty with direction (＋/−/→) · source→destination · reference link · user.
  Read-only by design — there is no edit affordance anywhere near stock
  numbers.
- **Direct receipt / correction / opening stock**: small focused forms;
  correction requires reason before submit enables.

### Query keys
`['inventory','balances',locationId,params]`,
`['inventory','movements',params]`, `['orders','list',params]`,
`['orders','detail',id]`, `['receipts',...]`, `['corrections',...]`.
Receive/direct-receipt/correction/opening-stock mutations invalidate
`['inventory']` + their own entity prefix. i18n namespaces: `orders`,
`warehouse` (+ new error codes) in fr and ar together.

## 5. Integration tests (P3-13) — the suite that matters from now on

Run against real Postgres. Assert by reading rows, not API bodies.
1. Receive full order → balance +N, receipt row, movement row, status RECEIVED.
2. Receive partial (70 of 100) → +70, remaining 30, PARTIALLY_RECEIVED; then
   receive 30 → RECEIVED; receiving 31 first → rejected, nothing written.
3. Order with inline new product → product exists with zero stock until received.
4. Cancel untouched order → no stock, no movements, CANCELLED, reason stored.
5. Cancel partially-received order → received stock intact, order CANCELLED.
6. Direct receipt → balance + movement with null order.
7. Opening stock → movement; second opening for same (loc, product) rejected.
8. Correction −2 → balance −2; correction below available → rejected;
   reason missing → rejected.
9. **Rollback proof**: force a failure after the receipt insert but before
   movements (test hook) → zero rows from the whole operation.
10. **Concurrency**: two parallel corrections/receipts on one product →
    both apply, final balance exact (locks serialize).
10b. **Crossed lock order**: two parallel batch operations, A touching
    (p1, p2) and B touching (p2, p1) → both complete, no deadlock —
    proves the batch sort in `applyMovements` actually runs.
11. **Standing invariant #1** (ledger Σ = balances) wired into the suite teardown.
12. SHOP-role user calls any warehouse endpoint → 403.

## 6. Definition of Done — Phase 3 checklist
- [x] All §5 tests green in CI/locally against dockerized Postgres — `npm --prefix api run test:int` (12 pass, standing invariant asserted in afterEach)
- [x] The four hand-added CHECK constraints exist in the migration SQL (grep of `20260720020355_inventory_and_orders/migration.sql` returns balance_non_negative, movement_qty_positive, movement_has_side, received_within_ordered)
- [x] No code path outside `applyMovement` writes InventoryBalance/InventoryMovement (grep in `api/src` returns empty outside `inventory.service.ts`)
- [x] `hasHistory` extended (IncomingOrderItem ∪ StockReceiptItem ∪ InventoryMovement ∪ StockCorrection) — feat(P3-cross)
- [ ] Warehouse flow on a phone: create order → receive partially → see stock → see ledger, in Arabic RTL — *manual pass, do before opening the PR*
- [x] Reference numbers sequential and unique across parallel requests — ReferenceService uses `UPDATE ... RETURNING`; concurrent integration test 10 sees two receipts write consistent balances
- [x] Low-stock badge appears when threshold crossed (product-level and settings default) — flags computed in `InventoryReadsService.listBalances`, rendered by `WarehouseStockPage`
- [x] decisions.md gains **D-011** — landed in P3-00 pre-work commit

## 7. Explicitly deferred
Transfers and the shop stock UI (Phase 4 — the balances API is already
shop-ready via ShopScopeGuard), any dashboard numbers (Phase 7), unitCost
aggregation/COGS anywhere (Phase 7, estimated-only), barcode scanning
hardware (out of scope v1 — the barcode field is searchable text, nothing more).