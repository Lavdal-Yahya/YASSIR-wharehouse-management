# Decisions Log

One entry per settled decision. Purpose: stop us relitigating closed
questions, and give anyone (including future-us) the *why*, not just the
*what*. Newest at the bottom. Never delete an entry — supersede it with a
new one that references the old.

Format: ID · date · status (Accepted / Pending / Superseded by D-xxx).

---

## D-001 · 2026-07 · Accepted
**Stack: NestJS API + separate React (Vite) SPA, in one plain monorepo.**
Chosen over a single Next.js app (Claude's initial suggestion) because the
developer knows and prefers NestJS/React. Clean API/frontend separation;
NestJS modules/guards map directly onto the spec's role and shop-scoping
requirements. No monorepo tooling (Nx/Turbo) — two folders and duplicated
shared enums are cheaper than build orchestration at this size.

## D-002 · 2026-07 · Accepted
**ORM: Prisma, not TypeORM.**
Despite TypeORM being the traditional NestJS pairing. Reasons: reliable
migration workflow (`migrate dev`/`migrate deploy`), stronger generated
types, and `$transaction` + `$queryRaw` covers our row-locking needs
(`SELECT ... FOR UPDATE`). TypeORM's migration and maintenance story is the
main rejection reason. Consequence: raw SQL is needed for locks and some
report aggregations — accepted, bounded by conventions §3.

## D-003 · 2026-07 · Accepted
**Auth: server-side DB-backed sessions with httpOnly cookies, not JWT.**
Sessions are instantly revocable (disable user, reset PIN → sessions die),
which matters on shared shop devices — an explicit spec concern (§39/§40).
httpOnly cookie removes token-in-localStorage XSS exposure. JWT's statelessness
solves a scale problem we don't have. Cost: a Session table and a DB read
per request — negligible at this load.

## D-004 · 2026-07 · Accepted
**Money stored as integer MRU (and quantities as integers). No floats, ever.**
MRU's khoums subunit is practically unused and every example in the spec is
a whole number. Integers eliminate float-rounding bugs in debt/allocation
math entirely. Confirmed with the client 2026-07-19: no fractional prices
occur in the business. If fractional prices are ever needed later, the
migration path is integer khoums (×5), not floats.

## D-005 · 2026-07 · Accepted
**Git: trunk-based; short-lived task branches; squash-merge PRs (even solo);
conventional commits carrying task IDs.**
Rejected GitFlow (develop/release branches): ceremony without benefit for a
team of one-plus-AI with a single production environment. The PR step is
kept solo because it forces the self-review checklist (conventions §1).

## D-006 · 2026-07 · Accepted
**Frontend state: TanStack Query for all server state; React state/context
for ephemeral UI only. No Redux/Zustand.**
Server data has exactly one owner (the query cache) and mutations
invalidate by key prefix — this keeps stock and debt figures fresh after
every operation without hand-rolled sync logic. The only meaningful client
state is the pre-confirmation sale cart.

## D-007 · 2026-07 · Accepted
**Service worker never caches API responses; app-shell precache only.
No offline mode in v1.**
Spec §4 excludes offline sync; stale stock/debt data is actively dangerous
in this domain (selling stock that isn't there, misreporting debt). Offline
support, if ever wanted, is a v2 project with its own design.

## D-008 · 2026-07 · Accepted
**All stock mutations flow through one chokepoint:
`InventoryService.applyMovement(tx, ...)` with a mandatory transaction client.**
Making `tx` a required parameter makes "stock change outside a transaction"
unrepresentable in code. DB-level `CHECK (quantity >= 0)` and the unique
(location, product) constraint back it up. Sits alongside two standing
invariant tests: ledger Σ = balances; sale.amountPaid = Σ active allocations.
(Full rationale: architecture.md §3.3–3.5.)

## D-009 · 2026-07 · Accepted
**Customer debt is always derived from active sales' amountDue — never a
stored, editable balance.**
Direct spec requirement (§20) and the single best defense against debt
corruption: reversals and cancellations recompute state instead of patching
a running total. Customer "credit balances" are explicitly out of scope for
v1 (spec §21.2), which is what makes this model sufficient.

## D-010 · 2026-07 · Accepted
**i18n: French + Arabic from day one; canonical English domain terms in
code (glossary in conventions §7); RTL via Tailwind logical properties only.**
Retrofitting RTL and renaming i18n keys later is far more expensive than
starting correct. Glossary translations to be validated with the client and
frozen before Phase 2.

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
allocation rows are never deleted or flagged, so allocation history is
never destroyed. Full rationale: schema-review.md §5.