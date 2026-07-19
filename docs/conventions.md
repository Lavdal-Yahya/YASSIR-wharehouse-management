# Conventions

Working agreements for this codebase. Tooling enforces what it can
(TypeScript strict, ESLint, Prettier); this file covers what tooling can't.
When this file and laziness disagree, this file wins.

---

## 1. Git

### Branching
Simple trunk-based flow — we are a small team:

- `main` is always deployable. Migrations on `main` are never edited, only
  followed by new ones.
- Work happens on short-lived branches: `feat/P5-02-sale-service`,
  `fix/P3-05-over-receive`, `chore/deps`. Branch name includes the task ID.
- Merge to `main` via PR (even solo — the PR is your self-review checkpoint).
  Squash-merge; the squash commit message follows the format below.
- No long-lived develop/release branches. Tag releases: `v0.3.0`.

### Commits
Conventional commits + task ID:

```
feat(P5-02): implement sale confirmation transaction
fix(P3-05): reject receiving above outstanding quantity
test(P6-09): oldest-first allocation across two sales
chore: bump prisma to 5.x
docs: phase 3 detail document
```

Types: `feat` `fix` `test` `refactor` `chore` `docs`. Anything touching
stock or debt logic must have `feat`/`fix` and `test` commits in the
same PR.

### Self-review checklist before merging
- [ ] Server-side validation exists (frontend validation alone counts as none)
- [ ] Stock/debt changes go through the chokepoints and run in one transaction
- [ ] New strings exist in both `fr` and `ar` i18n files
- [ ] Integration test added/updated if the task touches stock or money
- [ ] No `console.log`, no commented-out code, no `any` without a `// why`

---

## 2. TypeScript (both apps)

- `strict: true`, `noUncheckedIndexedAccess: true`. `any` is a code smell
  requiring a comment; prefer `unknown` + narrowing.
- Naming: `PascalCase` types/classes/components, `camelCase` variables and
  functions, `SCREAMING_SNAKE` for true constants, kebab-case file names
  (`sale-confirmation.service.ts`), except React components: `SaleForm.tsx`.
- Use the domain glossary (§7) — one English term per concept, everywhere.

## 3. Backend (NestJS + Prisma)

### Boilerplate generation
Start every module from the CLI instead of hand-writing:

```bash
nest g module sales
nest g controller sales --no-spec
nest g service sales --no-spec
```

Then add per-feature files by hand: `dto/`, `errors.ts`, and (if complex)
split services like `sale-confirmation.service.ts`.

### Module layout
```
src/sales/
  sales.module.ts
  sales.controller.ts
  sales.service.ts            # queries, listing
  sale-confirmation.service.ts# the big transaction (one per complex op)
  sale-cancellation.service.ts
  dto/create-sale.dto.ts
  errors.ts
```

### Rules
- **DTOs**: class-validator decorators on every field; whitelist +
  forbidNonWhitelisted in the global ValidationPipe. Client input is hostile
  until validated.
- **Controllers** call one service method, return DTO-shaped data. No
  Prisma, no business logic, no try/catch (the global filter handles it).
- **Services** own transactions. Any method that writes stock or money
  takes/creates a `tx` and does everything on it. Never mix `prisma.` and
  `tx.` calls in one operation.
- **Cross-module access** via the other module's service, never its tables.
- **Domain errors** extend `DomainError` with a stable `code` (e.g.
  `INSUFFICIENT_STOCK`) that doubles as the frontend translation key.
- **Authorization**: `@Roles()` on every controller route — no unguarded
  routes, ever. Shop-scoped services take the *session user*, not a raw
  shopId, and derive scope from it.
- **Money is `Int` (MRU)**. No floats, no `Number` parsing of user input
  without validation. Quantities are `Int` too.
- **Dates**: store UTC timestamps; business-day grouping happens in the
  report layer using the business timezone from settings.

### Prisma
- Schema changes only via `prisma migrate dev --name descriptive_name`;
  production uses `prisma migrate deploy`. `db push` is forbidden outside
  throwaway experiments.
- Enums live in `schema.prisma` (`Role`, `MovementType`, `PaymentStatus`,
  `OrderStatus`, ...) — mirrored manually in `/web/src/shared/enums.ts`.
- Every table: `createdAt @default(now())`, `updatedAt @updatedAt` where
  rows are mutable.
- Raw SQL is allowed for exactly two things: `SELECT ... FOR UPDATE` row
  locks and report aggregations — always via `$queryRaw` parameterized
  templates, never string concatenation.

## 4. Frontend (React)

### Structure
```
src/
  app/            router, providers, layout shells
  features/       one folder per domain area (mirrors API modules)
    sales/
      api.ts      # query/mutation hooks for this feature
      components/ # feature components
      pages/      # routed pages
  components/     # shared UI (Button, Dialog, StatusBadge, MoneyInput...)
  shared/         # enums, types, formatters (money, date)
  i18n/           # fr/, ar/ resource files
```

### Rules
- **TanStack Query keys** are arrays with a stable scheme:
  `['sales', 'list', { shopId, filters }]`, `['sales', 'detail', id]`,
  `['inventory', 'balance', locationId]`. Mutations invalidate by prefix
  (a sale invalidates `['sales']`, `['inventory']`, `['customers', 'detail',
  customerId]`, `['dashboard']`).
- **Forms**: react-hook-form + zod resolver. The zod schema mirrors server
  DTO rules but the server remains the authority; surface server domain
  errors on the form via their `code`.
- **i18n**: no hardcoded user-facing strings — everything through `t()`.
  Key scheme: `feature.element.description` (`sales.form.amountPaid`,
  `errors.INSUFFICIENT_STOCK`). Add fr and ar together; a key existing in
  one language only fails review.
- **RTL**: Tailwind logical utilities only (`ms-* me-* ps-* pe-*
  text-start/text-end`). `ml-`/`mr-` in a diff is a bug.
- **Money display**: one shared `formatMoney()`; one shared `<MoneyInput>`
  that outputs integers. Never `toFixed` scattered around.
- **Status labels**: text from i18n + color, never color alone (spec §38.4).
- Reusable components go to `/components` after the *second* use, not
  speculatively.

## 5. Testing

- **Integration tests are the contract** for anything touching stock or
  money: run against a real Postgres (docker) with the API's actual
  services, assert by reading the database.
- Required per feature (matches tasks.md test tasks): happy path, each
  validation rejection, and the reversal/cancellation path restoring exact
  prior state.
- Two standing invariant tests run in every suite:
  1. Σ movements = InventoryBalance for every (location, product).
  2. Sale.amountPaid = Σ active allocations for every sale.
- Concurrency: the "two sales of the last unit" test uses parallel
  transactions and asserts exactly one succeeds.
- Unit tests only where logic is pure and non-trivial (allocation order,
  status derivation). Don't unit-test glue.
- Naming: `*.spec.ts` colocated for units; `test/integration/*.int-spec.ts`
  for integration.

## 6. Definition of Done (any task)

1. Server-validated, role-guarded, shop-scoped where relevant.
2. In one DB transaction if it writes stock or money.
3. Tested per §5 if it touches stock or money.
4. Strings in fr **and** ar; layout verified in RTL.
5. Usable on a phone screen.
6. tasks.md checkbox updated; phase doc corrected if reality diverged.

## 7. Domain glossary (canonical terms)

Code and API use the English term, exactly. UI uses the fr/ar translations,
consistently. If a new concept appears, add it here first.

| English (code)     | Français              | العربية              |
|--------------------|-----------------------|----------------------|
| Product            | Produit               | منتج                 |
| Category           | Catégorie             | فئة                  |
| Warehouse          | Entrepôt              | مستودع               |
| Shop               | Boutique              | محل                  |
| Incoming order     | Commande fournisseur  | طلب شراء             |
| Receipt (stock)    | Réception             | استلام               |
| Transfer           | Transfert             | تحويل                |
| Sale               | Vente                 | بيع                  |
| Customer           | Client                | زبون                 |
| Debt / outstanding | Dette / reste à payer | دين / المتبقي        |
| Payment (customer) | Versement             | دفعة                 |
| Allocation         | Imputation            | تخصيص                |
| Expense            | Dépense               | مصروف                |
| Stock correction   | Ajustement de stock   | تصحيح المخزون        |
| Movement (ledger)  | Mouvement             | حركة                 |
| Cancelled          | Annulé                | ملغى                 |
| Archived           | Archivé               | مؤرشف                |

(Translations are a starting point — confirm wording with the client, who
knows the vocabulary their employees actually use, then freeze.)

## 8. Things we never do

- Write to `InventoryBalance` or `InventoryMovement` outside
  `InventoryService.applyMovement`.
- Store or compute money as floats.
- Trust a client-supplied shopId for a SHOP-role user.
- Edit an applied migration, `db push` to a real database, or hand-edit
  production data.
- Delete a financial record (cancel/reverse instead).
- Merge stock- or debt-touching code without its integration test.
- Ship a user-facing string in one language.