# Phase 8 — Hardening & Deployment (Detail)

Scope: tasks P8-01 → P8-12.
Goal: the system runs in production on the VPS, on HTTPS, backed up with a
**tested** restore, and every one of the spec's 45 acceptance criteria is
checked off with evidence.

> **Draft caveat:** written before Phases 6–7 merged. Deployment specifics
> (exact Caddyfile, backup target) are stable; the audit scope depends on
> what the final feature set actually is. Reconcile against the merged code
> before executing.

Prerequisite: Phases 1–7 merged; the app is feature-complete on paper.
This phase adds almost no features — it proves what exists and ships it.

## 1. Security & integrity audits (P8-01, P8-02) — do these FIRST

Before deployment, not after. Fixing a permissions hole is cheap in dev,
expensive once it's serving real customer debt.

**Permission sweep (P8-01)** — extend the `loginAs` harness into a
full matrix: every endpoint × every role, asserting the intended
status. Explicitly include the attack the spec names (§6.4): a SHOP user
manipulating a URL/body shopId to reach another shop → must get their own
data or 403/404, never the foreign shop's. This is the harness that caught
the mis-wired guard in Phase 5 — now run it exhaustively.

**Integrity sweep (P8-02)** — against a production-like dataset:
- Both standing invariants hold across the whole DB (not just per-test):
  `Σ movements = balance` for every (location, product); `amountPaid =
  amountPaidAtSale + Σ active allocations` for every sale.
- `outstanding` derived two ways (sum of sale.amountDue vs recompute from
  allocations) agree for every customer.
- No negative balance exists; no active debt sale lacks a customer (the DB
  CHECK guarantees it, but assert it on real data anyway).
- Write a one-shot `scripts/audit-integrity.ts` that runs these and can be
  re-run against production periodically.

## 2. Deployment (P8-06, P8-07)

Production `docker-compose.prod.yml`: three services.

- **postgres**: pinned `postgres:16`, named volume, not port-exposed to the
  host (only the api service reaches it over the compose network).
- **api**: multi-stage Dockerfile (build → slim runtime), runs
  `prisma migrate deploy` on start (never `migrate dev`, never `db push` —
  conventions §3), then serves. All config via env; secrets from the
  server's env/secrets, never the image.
- **caddy**: automatic HTTPS (Let's Encrypt), serves the built `/web`
  static bundle, reverse-proxies `/api` to the api service. The
  `navigateFallbackDenylist` for `/api` (Phase 1) means the SPA and API
  coexist cleanly.

```
# Caddyfile (shape)
your-domain {
  handle /api/* { reverse_proxy api:3000 }
  handle       { root * /srv/web; try_files {path} /index.html; file_server }
}
```

Production env checklist (P8-07): `NODE_ENV=production`; strong
`SESSION_SECRET`; cookies Secure+httpOnly+SameSite=Lax (Phase 1, verify
live); CORS locked to the real origin; the seed admin's password rotated
off any dev default (spec-critical — a default admin in production is the
whole system compromised).

## 3. Backups & restore (P8-08) — the hard deliverable

The spec (§41) says the project is not finished without a documented,
tested restore. Treat that literally.

- **Nightly `pg_dump`** via cron (host cron or a small sidecar):
  timestamped, compressed.
- **Retention**: keep N daily (e.g. 14); prune older.
- **Off-box**: sync each dump to separate storage (Backblaze B2 / S3 /
  another host) — a backup on the same disk as the database is not a
  backup. Include the `uploads/` directory (product/logo images —
  `pg_dump` does not capture files; phase-2 §3 flagged this).
- **Documented restore runbook** in the repo: exact commands to restore a
  dump into a fresh Postgres, step by step.
- **Rehearse it once, for real** (P8's non-negotiable): restore the latest
  dump into a scratch database, point a throwaway api at it, confirm the
  data is intact and the integrity audit (§1) passes. An untested backup
  is a hope. Record that the rehearsal happened.

## 4. Observability (P8-09)

- API logs to stdout → Docker json-file driver with rotation
  (max-size/max-file) so logs can't fill the disk.
- Errors carry request context (route, user id, reference numbers) but
  **never secrets or full request bodies with money/PII**.
- The global exception filter (Phase 1) already guarantees no stack trace
  reaches users — verify once against a forced production 500.

## 5. Device & PWA passes (P8-03, P8-04, P8-05)

The manual passes deferred through earlier phases converge here, on real
hardware, in both languages:

- **Responsive** (P8-03): small Android, iPhone, tablet, laptop — every
  primary flow (sell, receive, transfer, register payment, add expense) in
  fr LTR and ar RTL. No horizontal scroll, thumb-reachable primary actions.
- **PWA** (P8-04): install on Android + iOS, standalone launch, session
  expiry forces re-auth, logout clears access on a shared device
  (the Phase 1 leftovers, now on the finished app).
- **Receipts** (P8-05): browser print + an 80mm thermal printer if
  available; sale and payment receipts legible in both languages.

## 6. Go-live (P8-10, P8-11)

- **Deploy runbook** (P8-10): update = pull, build, `migrate deploy`,
  restart; documented rollback (previous image + the fact that migrations
  are forward-only, so a schema rollback is a written procedure, not an
  afterthought).
- **Initial data with the client** (P8-11): create the real admin, the
  two shops, categories, users, and enter **opening stock** (Phase 3 tool)
  for warehouse + both shops. This is the client's first real use — walk
  them through it.

## 7. Acceptance walk (P8-12) — the finish line

Go through spec §46's 45 criteria one by one, each with a recorded
evidence pointer (a test name, a screen, a DB query result). The
project is done when all 45 are checked — not before, not when "the UI
exists." Pair this with the spec §45 test scenarios as the script.

Highlights that must pass (not a substitute for the full 45):
- Ordered stock never counts as physical stock; only received does.
- Both transfer locations update atomically; reversal restores.
- The three canonical sales; debt requires a customer; oversell impossible.
- Oldest-first allocation; reversal restores debt; cancellation restores
  stock and debt.
- Sales value ≠ cash collected, everywhere.
- Negative stock and negative debt impossible.
- Products/shops with history archive, not delete.
- Installs as a PWA on Android + iPhone.
- Backup taken and **restored** successfully.

## 8. Definition of Done — Phase 8 checklist (= project DoD)

- [ ] Permission matrix exhaustive and green; the cross-shop URL attack proven blocked
- [ ] Integrity audit passes on production-like data; re-runnable script committed
- [ ] Live on HTTPS via Caddy; migrations applied with `migrate deploy`; no dev defaults in production
- [ ] Nightly backups running, off-box, including uploads/; retention pruning works
- [ ] A backup has been **restored** to a scratch DB and passed the integrity audit — rehearsal recorded
- [ ] Logs rotate; no stack traces or secrets leak to users or logs
- [ ] Every primary flow verified on real Android + iPhone in fr and ar; installs standalone; logout clears shared-device access
- [ ] Receipts print correctly (browser + thermal if available)
- [ ] Deploy + rollback runbook in the repo
- [ ] Client's real data seeded; owner walked through opening-stock entry
- [ ] All 45 spec §46 acceptance criteria checked with evidence
- [ ] No feature from spec §43's exclusion list was added along the way

## 9. After handover
Out of scope for v1, parked for a future conversation if the client asks:
CSV/Excel export, offline mode, multi-warehouse, notifications
(SMS/WhatsApp), analytics/BI, partial/item-level returns. All were
deliberately excluded (spec §43) — adding any of them is a new project
with its own spec, not a Phase 8 task.
