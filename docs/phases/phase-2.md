# Phase 2 — Core Master Data (Detail)

Scope: tasks P2-01 → P2-11.
Goal: all reference data manageable by the owner — categories, products
(with archiving), shops (+ auto-locations), users, customers, expense
categories, settings. Shop-scope guard goes live.

Carried in from Phase 1: live proof of the fail-closed authorization
(DoD item 1 below) and the on-device PWA/RTL checks (do them during this
phase, independently).

---

## 1. Migration (P2-01) — `core_master_data`

```prisma
model Category {
  id        String    @id @default(cuid())
  name      String    @unique
  active    Boolean   @default(true)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  products  Product[]
}

model Product {
  id                  String    @id @default(cuid())
  name                String
  sku                 String?   @unique
  barcode             String?   @unique
  categoryId          String
  category            Category  @relation(fields: [categoryId], references: [id])
  description         String?
  imageUrl            String?
  defaultPurchaseCost Int?      // whole MRU (D-004)
  defaultSalePrice    Int?      // whole MRU (D-004)
  lowStockThreshold   Int?
  active              Boolean   @default(true)
  archivedAt          DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  @@index([categoryId])
  @@index([name])
}

model Customer {
  id        String   @id @default(cuid())
  name      String
  phone     String?
  notes     String?
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([name])
  @@index([phone])
}

model ExpenseCategory {
  id        String   @id @default(cuid())
  name      String   @unique
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
}
```

Notes:
- `sku`/`barcode` unique but nullable — Postgres allows multiple NULLs, which
  is exactly what we want (optional identifiers, unique when present).
- Customer phone is **not** unique (family members share phones in practice);
  duplicate avoidance is search-driven per spec §18.4.
- No money on Customer, no stored debt — ever (D-009).

## 2. Shared API conventions introduced this phase

### Pagination (all list endpoints from now on)
`GET ...?page=1&pageSize=25&search=&...filters` →
`{ items: T[], total: number, page: number, pageSize: number }`.
Offset pagination; `pageSize` capped at 100 server-side. Defined once as a
`PaginationQueryDto` + helper, reused everywhere.

### Archive pattern (products now; shops now; reused later)
- `POST /:id/archive` → sets `active=false, archivedAt=now()`.
- `POST /:id/restore` → owner only, clears both.
- List endpoints default to `active=true`; `?includeArchived=true` is
  owner-only.
- Archived entities are rejected as *inputs* to new transactions (enforced
  where transactions are built, Phases 3–7).

### History check (the delete gate)
`ProductsService.hasHistory(productId)` — single method that checks
existence in every history table. **In Phase 2 there are no history tables
yet, so it returns false** — but the method, and the delete flow calling
it, exist now. Each later phase that adds a history table (movements,
order items, sale items, …) must extend this method in the same PR.
`DELETE /products/:id` → 409 `PRODUCT_HAS_HISTORY` if it returns true.

## 3. Modules & endpoints

All routes require auth; roles noted per route. This phase delivers the
live fail-closed + shop-scope proofs.

### categories (P2-02) — owner only
```
GET    /api/categories            OWNER, WAREHOUSE, SHOP   (read is universal — pickers need it)
POST   /api/categories            OWNER
PATCH  /api/categories/:id        OWNER
POST   /api/categories/:id/archive|restore   OWNER
```

### products (P2-03 … P2-05)
```
GET    /api/products              all roles   (search: name/sku/barcode; filter: categoryId, includeArchived)
GET    /api/products/:id          all roles
POST   /api/products              OWNER, WAREHOUSE
PATCH  /api/products/:id          OWNER, WAREHOUSE
POST   /api/products/:id/archive  OWNER
POST   /api/products/:id/restore  OWNER
DELETE /api/products/:id          OWNER       (gated by hasHistory)
POST   /api/products/:id/image    OWNER, WAREHOUSE
```
Create/update DTO: `name` + `categoryId` required, everything else optional
(spec §10.1). Prices validated as `@IsInt() @Min(0)`.

**Image upload (P2-04):** multer, memory storage → validate MIME
(jpeg/png/webp) *and* magic bytes, max 2 MB → resize to max 800px with
sharp → write to `/api/uploads/products/<cuid>.webp` → store relative URL.
Served statically at `/uploads` in dev; Caddy serves the directory in prod.
The `uploads/` volume is bind-mounted in prod and **included in the backup
plan** (note for Phase 8).

### shops (P2-06, P2-07)
```
GET    /api/shops                 OWNER (full) — plus a slim GET /api/shops/mine for SHOP users
POST   /api/shops                 OWNER
PATCH  /api/shops/:id             OWNER
POST   /api/shops/:id/archive     OWNER
POST   /api/shops/:id/restore     OWNER
```
- Create runs in a transaction: Shop + its Location
  (`{ name: shop.name, type: SHOP, shopId }`) together (P2-07). Renaming a
  shop renames its location in the same transaction.
- Archive: also sets the location inactive. The "shop still has stock"
  warning is stubbed behind `ShopsService.getStockSummary()` returning
  empty until Phase 3 wires InventoryBalance — the UI plumbing is built now.
- Archiving a shop with **active assigned users** → 409 listing them
  (reassign or disable users first). Cheap now, prevents orphans later.

### users (P2-08) — owner only, all routes
```
GET    /api/users
POST   /api/users                 { name, username, password, role, assignedShopId? }
PATCH  /api/users/:id             name / role / assignedShopId
POST   /api/users/:id/reset-password
POST   /api/users/:id/disable | enable
```
Rules (service-enforced, each with a domain error):
- role=SHOP ⇒ `assignedShopId` required and must be an active shop;
  role≠SHOP ⇒ `assignedShopId` must be null.
- Disabling a user deletes their sessions (mechanism proven in Phase 1).
- A user cannot disable themselves; the last active OWNER cannot be
  disabled or demoted (`LAST_OWNER_PROTECTED`).
- Passwords/PINs: min 6 chars for SHOP/WAREHOUSE (numeric PIN reality),
  min 8 for OWNER. Reset returns a one-time generated value shown once.

### customers (P2-09)
```
GET    /api/customers             all roles   (search matches name OR phone, per spec §31)
GET    /api/customers/:id         all roles
POST   /api/customers             all roles   (shop employees create customers mid-sale)
PATCH  /api/customers/:id         OWNER, SHOP
```
Customer read is deliberately global (not shop-scoped): the spec scopes
*debt transactions* by shop, not the persons — a customer may buy in both
shops. The customer *account page* with balances arrives in Phase 6.

### expense-categories (P2-10) — mirror of categories, OWNER writes.

### settings (P2-11)
```
GET    /api/settings              @Public   (whitelisted keys only: businessName, currency, receiptFooter, logoUrl)
PUT    /api/settings              OWNER     (bulk upsert of whitelisted keys)
POST   /api/settings/logo         OWNER     (same upload pipeline as products)
```
The login page reads businessName → the GET must be public; the whitelist
is what makes that safe. Non-whitelisted keys are rejected, not ignored.

### Shop-scope guard goes live
`ShopScopeGuard` (built in Phase 1) is now wired wherever a shopId appears
in params/body. Phase 2 has few such routes; the guard's contract from
here on: SHOP users' client-supplied shopId is **replaced** by their
session's `assignedShopId`; OWNER passes through; WAREHOUSE is rejected
from shop-money routes (relevant from Phase 5).

## 4. Frontend

### Routes added
```
/products, /products/new, /products/:id        OWNER, WAREHOUSE
/categories                                    OWNER
/customers, /customers/:id                     all roles
/shops, /shops/:id                             OWNER
/users                                         OWNER
/settings                                      OWNER (now a real page)
/expense-categories                            OWNER (can live as a tab inside /settings)
```

### Shared components to build once, this phase
- `ListPage` pattern: SearchInput (debounced 300ms) + filter row +
  `PagedList` (cards on mobile, table ≥md) + Pagination controls.
- `EntityForm` conventions: RHF + zod, optional fields visually marked
  (spec §38.3), sticky submit bar on mobile.
- `ConfirmDialog` (used by archive/disable/delete),
  `StatusBadge` (text + color, never color alone),
  `ImageUploadField` (preview, client-side size check, server errors surfaced),
  `MoneyInput` (integer-only, formats per locale, arabic-numeral tolerant).

### Query keys (per conventions §4)
`['categories','list',params]`, `['products','list',params]`,
`['products','detail',id]`, `['customers',...]`, `['shops',...]`,
`['users',...]`, `['settings']`. Mutations invalidate their prefix;
product image upload also invalidates `['products','detail',id]`.

### i18n
New namespaces: `products`, `customers`, `shops`, `users`, `settings` +
error codes added this phase (`PRODUCT_HAS_HISTORY`, `LAST_OWNER_PROTECTED`,
`SHOP_HAS_ACTIVE_USERS`, …). fr + ar land together, per checklist.

## 5. Definition of Done — Phase 2 checklist

- [ ] **1. (carried from P1)** SHOP-role user calls `POST /api/categories` → 403 from the API — the live fail-closed/roles proof
- [ ] 2. Owner creates category → product with only name+category → product appears in warehouse-role product list
- [ ] 3. Product with no history: DELETE succeeds. `hasHistory` gate returns 409 path proven with a unit test (method mocked true)
- [ ] 4. Archive product → gone from default list, visible with includeArchived (owner), restore works
- [ ] 5. Creating a shop creates its Location in the same transaction (verify row); renaming shop renames location
- [ ] 6. Archiving a shop with an active assigned user → 409 with the user listed
- [ ] 7. Create SHOP user without assignedShopId → 400; WAREHOUSE user with one → 400
- [ ] 8. Last-owner protection: disabling/demoting the only OWNER → 409
- [ ] 9. Password reset returns a value once; old sessions of that user are dead
- [ ] 10. Customer search by partial name and by phone fragment both work
- [ ] 11. Image upload: >2 MB rejected; a .exe renamed .jpg rejected (magic bytes); result is a webp ≤800px
- [ ] 12. Settings GET works logged-out with only whitelisted keys; PUT rejects a non-whitelisted key
- [ ] 13. Every new string exists in fr and ar; product form usable on a phone in RTL
- [ ] 14. decisions.md D-004 flipped to Accepted

## 6. Explicitly deferred
Stock quantities anywhere (Phase 3), shop stock warning content (Phase 3/4),
customer balances/account page (Phase 6), any expense entry (Phase 7),
duplicate-customer merging (out of scope v1).

## 7. Schema review gate before Phase 3
Phase 3 introduces the irreversible core (`InventoryBalance`,
`InventoryMovement`, orders, receipts). **Before writing that migration**,
we review the complete remaining schema on paper — all tables through
Phase 7 — as `docs/phases/schema-review.md`. That review is the exit
criterion of Phase 2.