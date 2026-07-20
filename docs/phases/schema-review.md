# Schema Review — All Remaining Tables (Phases 3–7)

Purpose: the phase-2.md §7 exit gate. Every table the system will ever have,
reviewed on paper before the Phase 3 migration is written. After sign-off,
each phase's migration implements its slice of this document verbatim;
deviations require editing this file first.

Status of each slice:
- **Phase 3 slice** — already specified in phase-3.md §1; reviewed here,
  confirmed, no changes. (Not repeated below.)
- **Phases 4–7 slices** — defined below.

Two modeling decisions are made in this review (§5). They become D-012 and
D-013 in decisions.md; D-011 (movement semantics) is drafted in §6.

---

## 1. Phase 4 — Transfers

```prisma
enum TransferStatus {
  COMPLETED
  REVERSED
}

model StockTransfer {
  id                    String              @id @default(cuid())
  referenceNumber       String              @unique
  sourceLocationId      String
  sourceLocation        Location            @relation("transferSource", fields: [sourceLocationId], references: [id])
  destinationLocationId String
  destinationLocation   Location            @relation("transferDestination", fields: [destinationLocationId], references: [id])
  status                TransferStatus      @default(COMPLETED)
  transferDate          DateTime
  notes                 String?
  createdBy             String
  reversedBy            String?
  reversedAt            DateTime?
  reversalReason        String?
  createdAt             DateTime            @default(now())
  items                 StockTransferItem[]

  @@index([sourceLocationId, transferDate])
  @@index([destinationLocationId, transferDate])
}

model StockTransferItem {
  id              String        @id @default(cuid())
  stockTransferId String
  transfer        StockTransfer @relation(fields: [stockTransferId], references: [id])
  productId       String
  product         Product       @relation(fields: [productId], references: [id])
  quantity        Int

  @@index([productId])
}
```

Hand-added SQL:
```sql
ALTER TABLE "StockTransfer" ADD CONSTRAINT transfer_distinct_locations
  CHECK ("sourceLocationId" <> "destinationLocationId");
ALTER TABLE "StockTransferItem" ADD CONSTRAINT transfer_item_qty_positive
  CHECK ("quantity" > 0);
```

Notes:
- A transfer emits **one TRANSFER movement per item** with both sides set
  (phase-3 §1 convention). Reversal emits mirror movements
  (source↔destination swapped) — the ledger shows both events; nothing is
  rewritten.
- There is no DRAFT status. A transfer exists only once completed
  (spec §16 has no approval workflow, and spec §43 forbids adding one).

## 2. Phase 5 — Sales

```prisma
enum SaleStatus {
  ACTIVE
  CANCELLED
}

enum PaymentStatus {
  PAID
  PARTIALLY_PAID
  UNPAID
}

model Sale {
  id                    String        @id @default(cuid())
  referenceNumber       String        @unique
  shopId                String
  shop                  Shop          @relation(fields: [shopId], references: [id])
  customerId            String?
  customer              Customer?     @relation(fields: [customerId], references: [id])
  customerNameSnapshot  String?
  customerPhoneSnapshot String?
  status                SaleStatus    @default(ACTIVE)
  paymentStatus         PaymentStatus
  totalAmount           Int
  amountPaidAtSale      Int           @default(0)   // cash taken when the sale was made (see §5, D-012)
  amountPaid            Int                          // amountPaidAtSale + Σ active allocations (maintained, invariant-tested)
  amountDue             Int                          // totalAmount − amountPaid
  saleDate              DateTime
  notes                 String?
  createdBy             String
  cancelledBy           String?
  cancelledAt           DateTime?
  cancellationReason    String?
  createdAt             DateTime      @default(now())
  updatedAt             DateTime      @updatedAt
  items                 SaleItem[]
  allocations           PaymentAllocation[]

  @@index([shopId, saleDate])
  @@index([customerId, paymentStatus])
  @@index([saleDate])
}

model SaleItem {
  id                  String  @id @default(cuid())
  saleId              String
  sale                Sale    @relation(fields: [saleId], references: [id])
  productId           String
  product             Product @relation(fields: [productId], references: [id])
  productNameSnapshot String
  quantity            Int
  unitPrice           Int     // actual negotiated price, whole MRU
  unitCostSnapshot    Int?    // product.defaultPurchaseCost at sale time, if any
  lineTotal           Int     // quantity * unitPrice

  @@index([productId])
  @@index([saleId])
}
```

Hand-added SQL:
```sql
ALTER TABLE "Sale" ADD CONSTRAINT sale_amounts_coherent
  CHECK ("amountPaid" >= 0 AND "amountPaid" <= "totalAmount"
     AND "amountDue" = "totalAmount" - "amountPaid"
     AND "amountPaidAtSale" >= 0 AND "amountPaidAtSale" <= "amountPaid");
ALTER TABLE "Sale" ADD CONSTRAINT sale_debt_requires_customer
  CHECK ("amountDue" = 0 OR "customerId" IS NOT NULL);
ALTER TABLE "SaleItem" ADD CONSTRAINT sale_item_coherent
  CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "lineTotal" = "quantity" * "unitPrice");
```

Notes:
- **Deviation from spec §34, deliberate:** the spec lists both `subtotal`
  and `totalAmount`. v1 has no discounts, taxes, or fees, so they'd always
  be equal; carrying both invites drift. We keep only `totalAmount`. If
  discounts ever enter scope, a `subtotal` column gets added *then*.
- `sale_debt_requires_customer` puts spec rule §37.7 into the database
  itself — a debt sale without a customer becomes unrepresentable, not
  merely validated.
- `paymentStatus` is derived by one shared function (paid → PAID, 0 →
  UNPAID, else PARTIALLY_PAID) and stored for query/filter performance;
  cancellation lives in `status`, not `paymentStatus` (a cancelled sale
  keeps its last payment state for history, and `status = CANCELLED`
  excludes it from every active total).
- `unitPrice >= 0` (not > 0): a genuinely free/gift line is legal;
  quantity is not allowed to be zero.

## 3. Phase 6 — Customer payments & allocations

```prisma
enum CustomerPaymentStatus {
  ACTIVE
  CANCELLED
}

model CustomerPayment {
  id                 String                @id @default(cuid())
  referenceNumber    String                @unique
  customerId         String
  customer           Customer              @relation(fields: [customerId], references: [id])
  shopId             String                // shop that received the cash
  shop               Shop                  @relation(fields: [shopId], references: [id])
  amount             Int
  paymentDate        DateTime
  debtBeforePayment  Int                   // snapshots for the receipt
  debtAfterPayment   Int
  notes              String?
  status             CustomerPaymentStatus @default(ACTIVE)
  createdBy          String
  cancelledBy        String?
  cancelledAt        DateTime?
  cancellationReason String?
  createdAt          DateTime              @default(now())
  allocations        PaymentAllocation[]

  @@index([customerId, paymentDate])
  @@index([shopId, paymentDate])
}

model PaymentAllocation {
  id                String          @id @default(cuid())
  customerPaymentId String
  payment           CustomerPayment @relation(fields: [customerPaymentId], references: [id])
  saleId            String
  sale              Sale            @relation(fields: [saleId], references: [id])
  amountAllocated   Int
  createdAt         DateTime        @default(now())

  @@unique([customerPaymentId, saleId])
  @@index([saleId])
}
```

Hand-added SQL:
```sql
ALTER TABLE "CustomerPayment" ADD CONSTRAINT payment_amount_positive
  CHECK ("amount" > 0);
ALTER TABLE "CustomerPayment" ADD CONSTRAINT payment_debt_snapshot_coherent
  CHECK ("debtAfterPayment" = "debtBeforePayment" - "amount" AND "debtAfterPayment" >= 0);
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT allocation_positive
  CHECK ("amountAllocated" > 0);
```

Notes:
- `@@unique([customerPaymentId, saleId])` — one payment allocates to a
  given sale at most once (the oldest-first algorithm produces exactly
  that; the constraint makes violations impossible).
- Allocations are **deleted physically when a payment is reversed**? No —
  see D-013 (§5): allocations of a cancelled payment are kept, and
  "active allocations" means allocations whose payment has
  `status = ACTIVE` and whose sale has `status = ACTIVE`. No status column
  on the allocation itself — its liveness derives from its parents,
  removing a three-way consistency problem.
- Payment reversal recomputes each touched sale's `amountPaid`/`amountDue`/
  `paymentStatus` from scratch (amountPaidAtSale + Σ active allocations) —
  recomputation over patching, always.

## 4. Phase 7 — Expenses

```prisma
enum ExpenseStatus {
  ACTIVE
  CANCELLED
}

model Expense {
  id                 String           @id @default(cuid())
  referenceNumber    String           @unique
  shopId             String
  shop               Shop             @relation(fields: [shopId], references: [id])
  categoryId         String?
  category           ExpenseCategory? @relation(fields: [categoryId], references: [id])
  amount             Int
  expenseDate        DateTime
  description        String
  notes              String?
  status             ExpenseStatus    @default(ACTIVE)
  createdBy          String
  cancelledBy        String?
  cancelledAt        DateTime?
  cancellationReason String?
  createdAt          DateTime         @default(now())
  updatedAt          DateTime         @updatedAt

  @@index([shopId, expenseDate])
}
```

Hand-added SQL:
```sql
ALTER TABLE "Expense" ADD CONSTRAINT expense_amount_positive CHECK ("amount" > 0);
```

## 5. Decisions made by this review

**D-012 — Cash at sale is a field on Sale, not a fabricated CustomerPayment.**
Spec §19.10 says "create the initial customer payment and allocate it," but
spec §34 makes `CustomerPayment.customerId` required while §19.7 allows
fully-paid sales with *no customer* — the spec is internally inconsistent
there. Resolution: `Sale.amountPaidAtSale` records money taken at sale
time; `CustomerPayment` rows represent **later debt payments only** (always
have a real customer, matching their table shape and receipts). The
invariant becomes: `amountPaid = amountPaidAtSale + Σ active allocations`
(standing test #2, updated). "Cash collected" reports =
Σ `amountPaidAtSale` of active sales (by saleDate) + Σ active payments (by
paymentDate) — which is exactly spec §22's required separation. Sale
cancellation reverses its own `amountPaidAtSale` implicitly by excluding
the sale.

**D-013 — Allocations have no status; liveness derives from both parents.**
An allocation counts iff its payment is ACTIVE **and** its sale is ACTIVE.
Reversing a payment or cancelling a sale flips one parent flag and
recomputes affected sale balances; allocation rows are never deleted or
flagged, eliminating a class of partial-update bugs and keeping full
history ("this payment *was* allocated to that sale before reversal").

## 6. decisions.md entries to append (paste-ready)

```
## D-011 · 2026-07 · Accepted
**Inventory movements: quantity always positive; direction encoded by
source/destination locations; transfers are ONE row with both sides;
multi-item operations must use the batch applyMovements (single sorted
lock pass) to prevent crossed-lock deadlocks.**
Uniform ledger arithmetic: balance(L,P) = Σ in − Σ out, one query,
testable. Full spec: phase-3.md §1–2.

## D-012 · 2026-07 · Accepted
**Money taken at sale time is Sale.amountPaidAtSale; CustomerPayment rows
are later debt payments only.**
Resolves the spec's internal inconsistency (initial payment rows vs
customer-optional paid sales). Invariant: amountPaid = amountPaidAtSale +
Σ active allocations. Full rationale: schema-review.md §5.

## D-013 · 2026-07 · Accepted
**PaymentAllocation carries no status; an allocation is active iff its
payment AND its sale are ACTIVE.**
Reversals flip parent status and recompute sale balances from scratch;
allocation history is never destroyed. Full rationale: schema-review.md §5.
```

## 7. Cross-cutting confirmations

- **No changes required to merged Phase 1–2 tables.** New relations point
  *at* Product/Customer/Shop/Location; nothing existing is altered.
- `createdBy`/`cancelledBy`/`reversedBy` stay as plain user-id strings
  (consistent with Phases 1–3). Reports join to User for display names.
- `hasHistory()` grows twice more: + StockTransferItem (Phase 4),
  + SaleItem (Phase 5) — same-PR rule.
- MovementType already contains every emitter this schema needs
  (TRANSFER, SALE, SALE_CANCELLATION, CUSTOMER_RETURN) — no enum migration
  later.
- Every money column is `Int` (D-004). Every table with cancellation has
  the same four fields (status, cancelledBy, cancelledAt,
  cancellationReason) — one shared UI/DTO pattern.
- Reference kinds: all seven counters already seeded in P3-01.

## 8. Sign-off checklist (gate clears when all checked)

- [x] Developer has read this document end to end
- [x] D-011, D-012, D-013 appended to decisions.md
- [x] phase-2.md §7 gate marked cleared (link to this file)
- [x] Any disagreement resolved by editing THIS file before P3-01 begins
