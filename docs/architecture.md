# Architecture

This document defines the structural decisions every feature must fit into.
It should change rarely. If a task seems to require violating something here,
stop and discuss before coding — either the task is wrong or this document
needs a deliberate, recorded amendment (see decisions.md).

Detail that changes per feature (endpoints, DTOs, components) lives in the
per-phase documents, not here.

---

## 1. System overview

```
                ┌──────────────────────────── VPS ────────────────────────────┐
                │                                                             │
 Phone/Laptop   │   ┌────────┐        ┌─────────────┐       ┌─────────────┐   │
 Browser / PWA ─┼──▶│ Caddy  │───────▶│  NestJS API │──────▶│ PostgreSQL  │   │
 (React app)    │   │ HTTPS  │  /api  │  (Node)     │Prisma │             │   │
                │   │        │        └─────────────┘       └──────┬──────┘   │
                │   │ serves │                                     │          │
                │   │ /web   │                              nightly pg_dump   │
                │   │ build  │                                     │          │
                │   └────────┘                                     ▼          │
                │                                        off-box backup store │
                └─────────────────────────────────────────────────────────────┘
```

- One React SPA (PWA-installable), one NestJS API, one PostgreSQL database.
- No microservices, no queues, no cache servers. This scale does not need them.
- Same server and database regardless of device or install mode (per spec §4).

## 2. Repository layout

```
/api            NestJS application
/web            React (Vite) application
/docs           architecture.md, conventions.md, decisions.md, phase docs
/spec.md        client specification (read-only reference — never edited)
/tasks.md       task board
docker-compose.yml          local dev (Postgres)
docker-compose.prod.yml     production (Postgres + API + Caddy)
```

No monorepo tooling (Nx/Turbo). Shared enums/constants are duplicated
deliberately in `/api/src/shared` and `/web/src/shared` and kept in sync by
convention — revisit only if drift actually bites.

---

## 3. Backend architecture

### 3.1 Layering

```
HTTP → Guard(s) → Controller → Service → Prisma → PostgreSQL
```

- **Controllers**: parse/validate input (DTOs), call exactly one service
  method, shape the response. No business logic. No Prisma access.
- **Services**: all business logic and transaction boundaries.
- **Prisma**: only ever called from services (or the inventory core).

### 3.2 Module map

One NestJS module per bounded area, matching the spec's sections:

```
auth        users       shops        locations    settings
categories  products    customers    expenses
incoming-orders         stock-receipts
inventory   ← core: balances, movements, corrections (the chokepoint)
transfers   sales       payments     reports
```

Modules may import other modules' *services*; they never touch another
module's tables directly through Prisma.

### 3.3 The inventory chokepoint (most important rule in this document)

There is exactly one code path that changes stock:

```ts
InventoryService.applyMovement(tx, {
  productId, quantity, movementType,
  sourceLocationId?, destinationLocationId?,
  relatedEntityType?, relatedEntityId?, notes?
})
```

It runs **inside the caller's transaction** (`tx` is a Prisma transaction
client, required — there is no non-transactional variant). It:

1. Row-locks the affected `InventoryBalance` rows (`SELECT ... FOR UPDATE`).
2. Applies the delta(s).
3. Throws `InsufficientStockError` if any balance would go negative.
4. Writes the `InventoryMovement` record.

Receiving, transfers, sales, cancellations, returns, corrections — all call
this. Nothing else writes to `InventoryBalance` or `InventoryMovement`.
The database backs this up with `CHECK (quantity >= 0)` and the unique
`(locationId, productId)` constraint as a last line of defense.

### 3.4 Transaction boundaries

Every operation listed in spec §36 is one service method wrapping one
`prisma.$transaction(async (tx) => { ... })`. The transaction is opened at
the top of the service method and everything — validation reads that must be
consistent, writes, movements, allocations — happens on `tx`. Partial success
is not a state this system can be in.

### 3.5 Derived vs stored money values

- **Source of truth**: `Sale` + `SaleItem` + `CustomerPayment` +
  `PaymentAllocation` rows, and the `InventoryMovement` ledger.
- **Customer debt is always derived**: Σ `amountDue` over active sales.
  There is no editable "debt" column anywhere.
- `Sale.amountPaid` / `amountDue` are maintained *only* by the sale,
  payment, and reversal services — inside their transactions — and must at
  all times equal the sum of that sale's active allocations. An integrity
  test asserts this.
- `InventoryBalance` is a performance cache of the movement ledger. An
  integrity test asserts Σ movements = balance for every (location, product).

### 3.6 Snapshots

Written at transaction time, never updated afterward:
- `SaleItem`: productNameSnapshot, unitPrice, unitCostSnapshot
- `Sale`: customerNameSnapshot, customerPhoneSnapshot
- `CustomerPayment`: debtBeforePayment, debtAfterPayment

Receipts render exclusively from snapshots, which is why reprints are
historically accurate for free.

### 3.7 Cancellation model

Financial records (sales, payments, expenses, transfers) are never deleted.
Cancellation/reversal = a compensating transaction that restores state
(stock, balances, debt) + status change + `cancelledBy/At/reason` on the
original record. Cancelled records are excluded from all active totals by
the report layer, and remain fully visible in history.

### 3.8 Reference numbers

`ReferenceService.next(tx, kind)` — a per-kind counter row locked and
incremented inside the caller's transaction, formatted `SAL-000001` etc.
Guaranteed unique and gap-tolerant (a rolled-back transaction may skip a
number; that is acceptable and normal).

### 3.9 Errors

- Services throw typed domain errors (`InsufficientStockError`,
  `CustomerRequiredError`, `PaymentExceedsDebtError`, ...).
- A global exception filter maps them to HTTP status + a translatable
  message key (the frontend translates to fr/ar).
- Unknown errors → logged with stack, returned as generic 500 message.
  Stack traces never leave the server.

---

## 4. Authentication & authorization

- Login: phone/username + password/PIN → argon2 verification → server-side
  session, httpOnly + Secure + SameSite=Lax cookie. No JWT, no localStorage.
- Sessions are revocable: disabling a user or resetting a PIN kills their
  sessions immediately (spec's shared-device concern).
- Roles: `OWNER`, `WAREHOUSE`, `SHOP` — enforced by guards on every route.
- Shop scoping: a `SHOP` user carries `assignedShopId`; a guard + service-level
  checks ensure every shop-scoped query filters by it. **The client-supplied
  shopId is never trusted for SHOP users** — the server substitutes the
  session's assignedShopId.
- Authorization is a server concern. The frontend hides menus for UX only.

## 5. Frontend architecture

- **Server state**: TanStack Query owns everything fetched from the API.
  Mutations invalidate the affected query keys (see conventions.md for the
  key scheme). No copy of server data in any other store.
- **Client state**: only ephemeral UI state (the sale cart before
  confirmation, open dialogs, active language) — React state/context.
  No Redux.
- **Routing**: React Router; route tree mirrors the nav sections; guarded
  layouts per role.
- **i18n/RTL**: react-i18next with `fr` and `ar` namespaces; `dir` set on
  `<html>` from the active language; Tailwind logical properties only.
- **Forms**: react-hook-form + zod schemas that mirror (not replace) server
  validation.
- **PWA**: vite-plugin-pwa; precache the app shell and static assets only.
  **API responses are never cached by the service worker** — stale stock or
  debt data is worse than a spinner. No offline mode in v1 (spec §4).
- **Receipts**: dedicated print routes with print CSS (white, black,
  narrow-width friendly), rendered from snapshot data.

## 6. Database

- PostgreSQL 16, accessed only via Prisma. Schema evolves only through
  migrations (`prisma migrate`), including in production.
- Money: integers in MRU (no floats, ever). See decisions.md.
- Constraints in the DB, not just code: FK everywhere, unique refs,
  `CHECK (quantity >= 0)` on balances, unique (locationId, productId).
- Soft lifecycle: `active` + `archivedAt` on products/shops; hard delete
  only for history-free products, verified server-side.

## 7. Deployment & operations

- Docker Compose on the VPS: `postgres`, `api`, `caddy` (auto-HTTPS,
  serves the built SPA, proxies `/api`).
- Config via environment variables only; secrets never in the repo.
- Deploy = pull, build, `prisma migrate deploy`, restart. Documented in
  the repo; no manual DB surgery.
- Backups: nightly `pg_dump` via cron, N-day retention, copied off-box.
  Restore procedure documented **and rehearsed** — an untested backup is
  a hope, not a backup.
- Logs: API logs to stdout → Docker log rotation; errors carry request
  context but never secrets.

## 8. What this architecture deliberately does not have

Per spec §43 and §3.3: no microservices, no message queues, no Redis, no
GraphQL, no offline sync, no multi-warehouse, no accounting engine, no
payment gateways, no notification integrations. If a feature seems to need
one of these, the feature is out of scope — confirm with the client before
anything else.