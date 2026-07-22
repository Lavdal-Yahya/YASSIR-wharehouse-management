# Warehouse & Multi-Shop Management System — Task Board

Stack: NestJS + Prisma + PostgreSQL · React (Vite) + Tailwind + TanStack Query · PWA · fr/ar (RTL) · VPS deploy

Conventions:
- Each task is sized to be completable by one person in roughly 0.5–2 days.
- `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked
- A phase is done only when its **Definition of Done** checks pass — not when the UI merely exists.
- Task IDs: `P<phase>-<number>` so we can reference them in commits (e.g. `feat(P3-04): partial receiving`).

---

## Phase 1 — Project Foundation

Goal: running skeleton — login works, role-appropriate empty shell, fr/ar with RTL, installable PWA.

### Setup & tooling
- [x] P1-01 Initialize monorepo structure: `/api` (NestJS), `/web` (Vite + React + TS), root README
- [x] P1-02 docker-compose with PostgreSQL 16 for local dev (volume, healthcheck)
- [x] P1-03 ESLint + Prettier config for both apps; shared TS strict settings
- [x] P1-04 API env config with `@nestjs/config` + schema validation (fail fast on missing vars)
- [x] P1-05 Set up Prisma in `/api`; first migration with `User`, `Shop`, `Location`, `AppSetting` + `Session`
- [x] P1-06 Seed script: central warehouse Location + initial OWNER admin account

### Authentication & authorization
- [x] P1-07 Auth module: login (phone/username + password/PIN), argon2/bcrypt hashing, logout
- [x] P1-08 httpOnly cookie sessions; session invalidation on logout and on user disable
- [x] P1-09 Roles guard + `@Roles()` decorator (OWNER, WAREHOUSE, SHOP)
- [x] P1-10 Shop-scope guard: SHOP role can only touch its `assignedShopId` (server-side, tested) — *built, wired in Phase 2*
- [x] P1-11 Login rate limiting with `@nestjs/throttler`
- [x] P1-12 Global exception filter: clean user-facing errors, no stack traces; error logging

### Frontend shell
- [x] P1-13 Vite + Tailwind + React Router setup; use logical properties (`ms-`/`me-`) only
- [x] P1-14 i18next setup: fr + ar resource files, language switcher, `dir` flip on `<html>`
- [x] P1-15 Login page wired to API; auth context; route guards by role
- [x] P1-16 App layout: bottom nav (mobile) / sidebar (desktop), role-filtered menu items
- [x] P1-17 TanStack Query setup + API client (fetch wrapper with credentials, error normalization)

### PWA
- [x] P1-18 `vite-plugin-pwa`: manifest, icons, name, theme/background color, standalone mode
- [x] P1-19 Service worker: precache app shell only (no API caching); verify install on Android + iOS

**Definition of Done:** log in/out as each role on phone + laptop; wrong role can't reach guarded route or API endpoint; language switch flips layout to RTL; app installs to home screen.

---

## Phase 2 — Core Master Data

Goal: all reference data manageable by the owner; archiving works.

- [x] P2-01 Prisma migration: `Category`, `Product`, `Customer`, `ExpenseCategory` (+ archive fields)
- [x] P2-02 Categories CRUD (API + UI, owner only)
- [x] P2-03 Products API: create/edit with only name + category required; all prices optional
- [x] P2-04 Products UI: list with search + category filter, create/edit form, image upload (safe: type/size validation, random filename)
- [x] P2-05 Product archive/restore; hard delete allowed only when zero history (server-checked)
- [x] P2-06 Shops CRUD (owner): create, edit, archive with "still has stock" warning hook (warning wired in Phase 4)
- [x] P2-07 Auto-create a `Location` row when a Shop is created (transactionally)
- [x] P2-08 Users management (owner): create user, assign role + shop, reset PIN, enable/disable
- [x] P2-09 Customers: list, search by name/phone, create/edit
- [x] P2-10 Expense categories CRUD (owner)
- [x] P2-11 App settings: read endpoint + minimal owner UI (business name, logo, currency, receipt footer)

**Definition of Done:** owner creates category → product (no price) → shop → shop employee assigned to it; archived product disappears from active lists; product with no history can be deleted, others only archived.

---

## Phase 3 — Warehouse & Incoming Orders

Goal: ordered ≠ stock; only received quantities enter the warehouse; movement ledger begins.

- [x] P3-01 Prisma migration: `IncomingOrder(+Items)`, `StockReceipt(+Items)`, `InventoryBalance` (unique location+product, `CHECK quantity >= 0`), `InventoryMovement`, `StockCorrection`
- [x] P3-02 Reference-number generator service (ORD-/REC-/TRF-/SAL-/PAY-/EXP-/ADJ-, unique, transaction-safe)
- [x] P3-03 Inventory core service: `adjustBalance(location, product, delta)` — always inside a caller's transaction, always writes a movement, row-locks the balance, throws on negative result. **All later stock changes go through this one path.**
- [x] P3-04 Incoming orders: create with multiple items; inline new-product creation; statuses (Ordered/Shipped/Partially Received/Received/Cancelled)
- [x] P3-05 Receive products flow: per-item received qty, prevents over-receiving, creates StockReceipt + movements + balance updates in one transaction; auto status update
- [x] P3-06 Cancel order (no stock effect, reason recorded, stays in history)
- [x] P3-07 Direct warehouse receipt (product, qty, optional supplier/cost) → receipt + movement
- [x] P3-08 Initial stock entry (admin only, any location) → "Opening stock" movements
- [x] P3-09 Stock corrections (±qty, reason required, authorized roles) → ADJ movement
- [x] P3-10 Warehouse stock page: search, category filter, low-stock/out-of-stock badges
- [x] P3-11 Product movement history view (per product, per location)
- [x] P3-12 Incoming orders list UI with status filters + ordered/received/remaining columns
- [x] P3-13 Integration tests: receive full, receive partial then remainder, over-receive rejected, negative stock impossible, every balance change has a matching movement

**Definition of Done:** order 50 → receive 45 → warehouse shows 45, order shows 5 remaining, Partially Received; ledger explains every unit in the warehouse.

---

## Phase 4 — Transfers & Shop Inventory

Goal: stock moves between locations atomically; each shop sees only its own stock.

- [x] P4-01 Prisma migration: `StockTransfer(+Items)` with reversal fields
- [x] P4-02 Transfer service: warehouse→shop and shop→warehouse, multi-item, single transaction via inventory core; validations (qty > 0, stock available, source ≠ destination, no archived locations)
- [x] P4-03 (Optional, decide before building) shop→shop transfer using the same service  *(D-014: enabled, WAREHOUSE/OWNER-only)*
- [x] P4-04 Transfer reversal (admin): checks destination still has qty, restores both sides, reason recorded, original preserved as Reversed
- [x] P4-05 Transfer UI: searchable product picker with available qty shown, destination select, confirm summary
- [x] P4-06 Transfers list + detail view (reference, items, user, status)
- [x] P4-07 Shop inventory page (scoped by role): search, filters, low/out-of-stock badges
- [x] P4-08 Wire shop-archive warning: block/warn when archiving a shop that still holds stock
- [x] P4-09 Integration tests: both balances update together, rollback on induced failure mid-transfer, transfer above stock rejected, shop employee cannot transfer/see another shop (API-level test)

**Definition of Done:** transfer 5 of 20 phones → warehouse 15, shop 5, TRF record + two movement legs; a forced failure between the two legs leaves both balances untouched.

---

## Phase 5 — Sales & Customer Debt

Goal: the core money path. Highest-risk phase — no shortcuts on tests.

- [x] P5-01 Prisma migration: `Sale`, `SaleItem` (with name/price/cost snapshots), `CustomerPayment`, `PaymentAllocation`  *(Sale + SaleItem landed in Phase 5; CustomerPayment + PaymentAllocation followed in Phase 6 PR-A per schema-review §3)*
- [x] P5-02 Sale service — single transaction implementing the spec's 15-step confirmation: validate shop/products/stock/payment, require customer when `amountDue > 0`, create sale + items + movements, deduct stock via inventory core, create initial CustomerPayment + allocation when money paid  *(D-012 split: cash-at-sale lives on `Sale.amountPaidAtSale`; the initial CustomerPayment row is not created — later payments only)*
- [x] P5-03 Derived debt queries: customer outstanding = Σ active sale `amountDue`; never a stored editable number
- [ ] P5-04 Sale UI — cart flow: searchable product picker (shows available qty + suggested price), editable unit price per line, qty stepper, running total  *(placeholder with construction tape at `/sell` until this ships)*
- [ ] P5-05 Sale UI — payment step: amount paid now, auto remaining, inline customer create/select, customer forced when remaining > 0, clear confirmation message
- [~] P5-06 Sales list (scoped by shop for employees) + sale detail with items, payments, statuses  *(list endpoint + HTTP tests done; dedicated pages are follow-up alongside the sale flow)*
- [x] P5-07 Payment status derivation (Paid / Partially Paid / Unpaid / Cancelled) — computed in one place, reused everywhere  *(shared `derivePaymentStatus` in api/src/sales/payment-status.ts)*
- [x] P5-08 Integration tests: paid sale w/o customer, partial sale requires customer, full-debt sale, price change during sale doesn't touch product defaults, editing product later doesn't touch old sale, overselling rejected, concurrent sale of last unit → exactly one succeeds

**Definition of Done:** the three canonical sales (10,000 paid / 4,000 of 10,000 / 0 of 10,000) produce correct stock, statuses, and customer balances, verified by reading the DB, not the UI.

---

## Phase 6 — Customer Payments & Receipts

Goal: debts get repaid correctly; every transaction has a printable trace.

- [ ] P6-01 Customer account page: totals (purchases / paid / outstanding), unpaid & partially paid sales with balances, payment history  *(migration + tables landed in PR-A; UI is PR-B)*
- [x] P6-02 Payment service: validate amount (> 0, ≤ outstanding), allocate oldest-sale-first across sales, update sale amounts + statuses, record debtBefore/After — one transaction
- [x] P6-03 Admin option: allocate a payment to a specific sale (employee flow stays automatic)
- [x] P6-04 Payment reversal (admin): reverse allocations, restore sale balances + statuses + debt, exclude from cash totals, reason recorded — one transaction
- [ ] P6-05 Register Payment UI from customer page, shop-scoped, confirmation with remaining debt
- [ ] P6-06 Sale receipt: print-friendly page (white/black, narrow-printer friendly), all spec fields, browser print
- [ ] P6-07 Payment receipt: spec fields incl. debt before/after
- [ ] P6-08 Reprint old receipts from sale/payment detail; values frozen from snapshots
- [x] P6-09 Integration tests: 4,000 payment over 3,000+5,000 debts → oldest settled + 1,000 allocated; overpay rejected; reversal restores exact prior state
- [x] P6-10 Sale cancellation service (admin): restore stock, reverse movements, remove debt, reverse initial payment; sale kept as Cancelled with reason
- [x] P6-11 Protected cancellation: sale with later payments — block unless allocations reversed first; warning UI; ordinary employees blocked server-side  *(server-side gate landed in PR-A; warning UI is PR-B)*

**Definition of Done:** full lifecycle works and reverses cleanly: debt sale → two later payments → reverse one payment → cancel a different unpaid sale — balances correct at every step.

---

## Phase 7 — Expenses, Reports & Dashboard

Goal: the owner can finally *see* the business.

- [x] P7-01 Expenses: create (shop-scoped), edit, cancel with reason; cancelled excluded from totals
- [x] P7-02 Expenses list + filters (shop, category, date)
- [x] P7-03 Report query layer: reusable date-range + shop filters; cancelled records excluded everywhere
- [x] P7-04 Shop report: sales value / cash at sale / later debt payments / total collected / new debt / outstanding / expenses / collected-minus-expenses
- [x] P7-05 Warehouse reports: current stock, received, transferred out, corrections, low/out-of-stock  *(service landed; dedicated report screen is a follow-up)*
- [x] P7-06 Sales reports: by status, shop, product, date  *(service landed + surfaced in owner-dashboard per-shop grid; dedicated screen is a follow-up)*
- [x] P7-07 Debt reports: by customer, by shop, unpaid/partial sales, payments in period  *(service landed; dedicated report screen is a follow-up)*
- [x] P7-08 Incoming-order report: ordered vs received vs remaining by status  *(service landed + surfaced in owner-dashboard pending-orders tile; dedicated screen is a follow-up)*
- [x] P7-09 Estimated profit block: COGS + gross profit only where costs exist, clearly labeled "estimated"; never "net profit" with missing costs  *(service landed; UI to render coverage % is a follow-up)*
- [x] P7-10 Owner dashboard: today's sales value vs cash collected vs new debt (distinct!), total outstanding debt, low stock, pending orders, per-shop summary
- [x] P7-11 Shop-employee dashboard: own shop only
- [x] P7-12 Report tests: the spec's 100k sold / 60k collected / 40k debt example; later 10k debt payment moves cash but not sales; totals match DB sums + HTTP permission matrix

**Definition of Done:** owner answers every question in spec §2 from the app; sales value ≠ cash collected everywhere they appear.

---

## Phase 8 — Hardening & Deployment

Goal: production on the VPS, safe against the ways it will actually break.

- [ ] P8-01 Permission sweep: scripted API tests hitting every endpoint as every role (incl. cross-shop attempts by URL/ID manipulation)
- [ ] P8-02 Transaction/integrity sweep: rerun all stock + debt integrity tests against a production-like DB; verify Σ movements = balances for every product/location
- [ ] P8-03 Responsive pass on real devices (small Android, iPhone, tablet, laptop) in fr and ar
- [ ] P8-04 PWA pass: install Android + iOS, standalone mode, session expiry re-auth, logout clears access on shared devices
- [ ] P8-05 Receipt print pass: browser print + narrow receipt printer if available
- [ ] P8-06 Dockerfiles (api, web) + production docker-compose: Postgres, API, Caddy (auto-HTTPS, serves web build, proxies /api)
- [ ] P8-07 Production env setup: secrets in env vars, secure cookie settings, CORS locked down
- [ ] P8-08 Backup system: nightly `pg_dump` cron, N-day retention, off-box copy (S3/Backblaze); **restore documented and actually tested once**
- [ ] P8-09 Error logging in production (persistent logs, rotation)
- [ ] P8-10 Deploy process documented (update, migrate, rollback steps)
- [ ] P8-11 Go-live: admin account, shops, categories, users, initial stock entry with client
- [ ] P8-12 Walk the full acceptance-criteria checklist (spec §46, all 45 items) and record evidence for each

**Definition of Done:** system live on HTTPS, a backup has been restored successfully to a scratch database, and all 45 acceptance criteria are checked off.

---

## Standing rules (apply to every task)

1. Every stock change goes through the inventory core service (P3-03) — no exceptions, ever.
2. Every money- or stock-touching operation runs in one DB transaction.
3. All validation exists on the server; the UI only mirrors it.
4. Nothing financial is deleted — cancelled/reversed with user + reason.
5. Snapshots (product name, unit price, cost) are written at transaction time and never updated.
6. A task touching stock or debt is not done without its integration test.