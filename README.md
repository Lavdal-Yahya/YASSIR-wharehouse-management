# Warehouse & Multi-Shop Management System

Inventory, sales, customer-debt, and expense management for a trading
business with one central warehouse and multiple shops. Mobile-first web
app, installable as a PWA, with a French/Arabic (RTL) interface.

**Stack:** NestJS · Prisma · PostgreSQL · React (Vite) · Tailwind · TanStack Query

---

## Documentation — read in this order

| Doc | What it's for |
|---|---|
| [`spec.md`](./spec.md) | The client specification. **Source of truth** — read fully before coding. Never edited. |
| [`tasks.md`](./tasks.md) | The plan: 8 phases of small tasks with IDs (`P1-01`…) used in branches and commits. Each phase has a Definition of Done. |
| [`docs/architecture.md`](./docs/architecture.md) | Structural rules every feature must fit: inventory chokepoint, transaction boundaries, derived debt, auth model. Changes rarely. |
| [`docs/conventions.md`](./docs/conventions.md) | How we work: git flow, NestJS/Prisma/React conventions, testing rules, domain glossary (en/fr/ar). |
| [`docs/decisions.md`](./docs/decisions.md) | Why the big choices were made. Check here before reopening a settled question. |
| [`docs/phases/`](./docs/phases/) | Detailed implementation doc for the current phase (written just-in-time, one phase ahead). |

New to the project? Read `spec.md` → `tasks.md` → `architecture.md` →
`conventions.md`, then the current phase doc.

## Repository layout

```
/api          NestJS API (Prisma, PostgreSQL)
/web          React SPA (Vite, Tailwind, PWA)
/docs         architecture, conventions, decisions, phase docs
spec.md       client specification (read-only)
tasks.md      task board
```

## Prerequisites

- Node.js 20+
- Docker + Docker Compose (for local PostgreSQL)

## Running locally

```bash
# 1. Database
docker compose up -d db

# 2. API — http://localhost:3000
cd api
cp .env.example .env          # fill in values; app crashes on missing vars (by design)
npm install
npx prisma migrate dev        # apply migrations
npx prisma db seed            # warehouse location, settings, admin user
npm run start:dev

# 3. Web — http://localhost:5173
cd ../web
npm install
npm run dev
```

Log in with the seeded admin credentials from `api/.env`
(`SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`). **Dev only — production
admin credentials must come from environment variables and never use
defaults.**

## Tests

```bash
cd api
npm run test          # unit tests
npm run test:int      # integration tests (require the docker Postgres)
```

Integration tests are mandatory for anything touching stock or money —
see `docs/conventions.md` §5.

## The three rules

1. Every stock or money change runs in **one database transaction**, through
   the designated services (stock: `InventoryService.applyMovement` only).
2. Financial records are **never deleted** — cancelled/reversed with user
   and reason.
3. Every user-facing string ships in **both French and Arabic**, and layouts
   work in RTL.

## Deployment

Production runs on a VPS via Docker Compose (PostgreSQL + API + Caddy with
automatic HTTPS), with nightly off-box database backups and a tested
restore procedure. Details and runbook: Phase 8 (`tasks.md`) — documented
when built.

## Status

Phases 1–4 shipped end-to-end (foundation, master data, warehouse +
incoming orders, transfers). Phase 5 and Phase 6 services + tests
are on `main`; the sale flow + customer money screens are the next
UI work. Phase 7 shipped both PRs (expenses, dashboards, shop
report, reports API). The Ledger design system (indigo palette, IBM
Plex fonts, BalanceBar signature element) is live across every
screen.

Currently in flight: **Phase 6 PR-B** — sale flow (`P5-04/05`),
customer account (`P6-01`), register-payment (`P6-05`), print
receipts (`P6-06/07/08`). See `tasks.md` for the granular checklist
and `docs/phases/phase-6.md` for the design.
