# Phase 1 — Project Foundation (Detail)

Scope: tasks P1-01 → P1-19.
Goal: a running skeleton — login/logout with roles, role-appropriate empty
shell, fr/ar with RTL, installable PWA, seeded warehouse + admin.

Everything here is binding unless reality proves it wrong — in which case
fix this document in the same PR that diverges from it.

---

## 1. Repo scaffold (P1-01 … P1-04)

```
/api                    # nest new api (npm)
/web                    # npm create vite@latest web -- --template react-ts
/docs                   # architecture.md, conventions.md, decisions.md, phases/
/spec.md
/tasks.md
docker-compose.yml
.gitignore              # node_modules, dist, .env*, uploads/
README.md               # doc index + "how to run" (see §8)
```

### docker-compose.yml (local dev)
```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: shopdb
    ports: ["5432:5432"]
    volumes: [dbdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d shopdb"]
      interval: 5s
volumes:
  dbdata:
```

### API environment (validated at boot — app must crash on missing vars)
```
DATABASE_URL=postgresql://app:app@localhost:5432/shopdb
SESSION_SECRET=<64+ random chars>
PORT=3000
NODE_ENV=development
WEB_ORIGIN=http://localhost:5173
```
Validation via `@nestjs/config` + zod schema in `src/config/env.ts`.

---

## 2. Prisma schema v0 (P1-05)

Only Phase 1 tables. Later phases add their own migrations.

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum Role {
  OWNER
  WAREHOUSE
  SHOP
}

enum LocationType {
  WAREHOUSE
  SHOP
}

model User {
  id             String    @id @default(cuid())
  name           String
  username       String    @unique          // phone number or chosen username
  passwordHash   String
  role           Role
  assignedShopId String?                    // required iff role = SHOP (service-enforced)
  assignedShop   Shop?     @relation(fields: [assignedShopId], references: [id])
  active         Boolean   @default(true)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  sessions       Session[]
}

model Session {
  id        String   @id                    // 32-byte random token, generated server-side
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())
  @@index([userId])
}

model Shop {
  id         String    @id @default(cuid())
  name       String
  address    String?
  phone      String?
  active     Boolean   @default(true)
  archivedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  users      User[]
  location   Location?
}

model Location {
  id        String       @id @default(cuid())
  name      String
  type      LocationType
  shopId    String?      @unique            // null for the warehouse
  shop      Shop?        @relation(fields: [shopId], references: [id])
  active    Boolean      @default(true)
  createdAt DateTime     @default(now())
}

model AppSetting {
  key       String   @id                    // e.g. "businessName", "currency"
  value     String
  updatedAt DateTime @updatedAt
}
```

Notes:
- Sessions live in the DB → revocable and restart-proof. Cleanup of expired
  rows: piggyback on login (delete expired for that user) + a daily cron later.
- `assignedShopId` nullability rule (SHOP ⇒ required, others ⇒ null) is
  enforced in the users service, not the schema.
- Migration name: `init_foundation`.

### Seed (`prisma/seed.ts`) — idempotent (safe to re-run)
1. Upsert Location `{ name: "Entrepôt central", type: WAREHOUSE, shopId: null }`.
2. Upsert AppSettings: `businessName`, `currency: "MRU"`, `receiptFooter: ""`.
3. If no OWNER exists: create one from env `SEED_ADMIN_USERNAME` /
   `SEED_ADMIN_PASSWORD` (dev defaults allowed; production requires env).

---

## 3. Auth module (P1-07 … P1-12)

### Flow
Cookie name `sid`, httpOnly, SameSite=Lax, Secure in production, maxAge 12h
(a work day; shared-device concern favors shorter over longer).

### Endpoints
| Method | Path             | Guard      | Body / Result |
|--------|------------------|------------|----------------|
| POST   | /api/auth/login  | public + throttle | `{ username, password }` → sets cookie, returns `{ user }` |
| POST   | /api/auth/logout | authed     | deletes session row, clears cookie |
| GET    | /api/auth/me     | authed     | `{ user: { id, name, role, assignedShopId } }` — the SPA's session probe on boot |

Login behavior:
- Find active user by username; verify with **argon2id**.
- Same generic error + same latency path for "no user" and "bad password"
  (always run a dummy argon2 verify on miss) — no user enumeration.
- Throttle: 5 attempts / minute / IP on `/auth/login` via `@nestjs/throttler`.
- On success: delete that user's expired sessions, create session row,
  set cookie.

### Guards (global order)
1. `SessionGuard` (global via APP_GUARD): reads `sid`, loads session+user,
   rejects if missing/expired/user-inactive, attaches `req.user =
   { id, name, role, assignedShopId }`. Routes opt out with `@Public()`.
2. `RolesGuard` (global): reads `@Roles(...)` metadata; **routes without
   `@Roles()` are rejected in non-public controllers** — forgetting the
   decorator fails closed, not open.
3. `ShopScopeGuard`: used from Phase 2 onward on shop-scoped routes; for
   SHOP users it overwrites any client-supplied shopId with
   `req.user.assignedShopId`. Build it now, wire it later.

### Global plumbing
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- Exception filter: `DomainError → { statusCode, code, message }` where
  `code` is the i18n key (e.g. `AUTH_INVALID_CREDENTIALS`); unknown errors
  → log with stack, return `{ code: "INTERNAL" }`, HTTP 500.
- CORS: origin = `WEB_ORIGIN`, credentials = true.
- Logging: Nest's built-in logger is enough for Phase 1; structured logging
  is a Phase 8 concern.

### Module layout after Phase 1
```
src/
  config/env.ts
  prisma/prisma.module.ts, prisma.service.ts
  common/
    decorators/public.decorator.ts, roles.decorator.ts, current-user.decorator.ts
    guards/session.guard.ts, roles.guard.ts, shop-scope.guard.ts
    filters/domain-exception.filter.ts
    errors/domain-error.ts
  auth/ (module, controller, service, dto/login.dto.ts, errors.ts)
  settings/ (module, controller, service)   # GET /api/settings (public keys only)
  main.ts
```

---

## 4. Frontend shell (P1-13 … P1-17)

### Dependencies
`react-router-dom`, `@tanstack/react-query`, `react-i18next` + `i18next` +
`i18next-browser-languagedetector`, `react-hook-form`, `zod`,
`@hookform/resolvers`, `tailwindcss`, `vite-plugin-pwa`.

### Boot sequence
`main.tsx` → providers (QueryClient, i18n, Router) → `<App>` calls
`GET /auth/me` once (`['auth','me']` query): pending → splash; 401 → login
route; ok → authed layout.

### Route tree (Phase 1 — mostly placeholders)
```
/login                          public
/                               AuthedLayout (guard: session)
  index → role redirect         OWNER→/dashboard, WAREHOUSE→/warehouse, SHOP→/shop
  /dashboard                    OWNER            (placeholder page)
  /warehouse                    OWNER, WAREHOUSE (placeholder)
  /shop                         OWNER, SHOP      (placeholder)
  /settings                     OWNER            (placeholder)
  *                             NotFound
```
`RequireRole` wrapper renders 403 page if `me.role` not allowed (UX only —
the API is the real enforcement).

### Components to build
```
app/providers.tsx, app/router.tsx
app/layouts/AuthedLayout.tsx     # header (business name, user, lang switch, logout)
                                 # bottom nav (mobile) / sidebar (≥md), items filtered by role
features/auth/pages/LoginPage.tsx
features/auth/api.ts             # useMe(), useLogin(), useLogout()
components/{Button,Input,Spinner,LanguageSwitcher,NavItem}.tsx
shared/api-client.ts             # fetch wrapper: credentials:'include',
                                 # JSON, throws {code,message}, 401 → clear ['auth','me']
i18n/index.ts, i18n/fr/common.json, i18n/ar/common.json
```

### i18n/RTL specifics
- On language change: `document.documentElement.lang = lng` and
  `dir = lng === 'ar' ? 'rtl' : 'ltr'`; persist choice in localStorage
  (language preference is not sensitive — this is the one localStorage use).
- Phase 1 namespace: `common` only (nav labels, login form, errors.INTERNAL,
  errors.AUTH_INVALID_CREDENTIALS). Both files complete before merge.

---

## 5. PWA (P1-18, P1-19)

`vite-plugin-pwa`, `registerType: 'autoUpdate'`:
- Manifest: name/short_name from business name (hardcode for now — dynamic
  manifest is not worth it), `display: "standalone"`, theme/background
  colors, icons 192/512 + maskable + apple-touch-icon.
- Workbox config: precache build assets only. `navigateFallback: '/index.html'`,
  **`navigateFallbackDenylist: [/^\/api\//]`** and no runtime caching rules —
  API responses must never be cached (architecture §5).
- iOS: apple-touch-icon link + verify add-to-home-screen manually.

---

## 6. Definition of Done — Phase 1 checklist

- [ ] `docker compose up db` + `npm run start:dev` (api) + `npm run dev` (web) = working app from clean clone following only the README
- [ ] Seed creates warehouse location, settings, admin; re-running seed changes nothing
- [ ] Login as OWNER works; wrong password and unknown user give the identical generic error
- [ ] 6th login attempt within a minute → 429
- [ ] `GET /api/auth/me` without cookie → 401; after logout → 401
- [ ] Disabling a user (SQL by hand for now) kills their existing session on next request
- [ ] Route without `@Roles()` in a non-public controller is rejected (prove with a temp route)
- [ ] SHOP-role test user (insert by hand) sees only shop nav; direct fetch to an OWNER endpoint → 403 from the API, not just hidden UI
- [ ] Switching to العربية flips the entire layout RTL; nav labels translated in both languages
- [ ] Lighthouse PWA installability passes; installed app on Android + iPhone opens standalone to the login page
- [ ] After logout on the installed app, no authed screen is reachable (back button included)
- [ ] No stack trace in any error response (check a forced 500)

---

## 7. Explicitly deferred (do not build in Phase 1)
Users CRUD UI (Phase 2 — create test users via seed/SQL for now), settings
edit UI (Phase 2), password change flow (Phase 2), shop-scope guard wiring
(Phase 2), structured logging and session-cleanup cron (Phase 8).

## 8. README skeleton to write in P1-01
Project one-liner → doc index (spec, tasks, architecture, conventions,
decisions, phases) → prerequisites → run-locally steps → test command →
seed credentials note (dev only).