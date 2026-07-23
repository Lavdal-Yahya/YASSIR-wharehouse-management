# Demo Guide

## How to run the app locally

### Prerequisites

- Docker Desktop (or Docker + Docker Compose v2)
- Node.js 20+ (for running the dev servers)

### Start

```bash
# 1 — start the database
docker compose up -d

# 2 — start the API
cd api
npm install
npm run start:dev

# 3 — in a separate terminal, start the web app
cd web
npm install
npm run dev
```

Open http://localhost:5173 and log in with the credentials from `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` in your local `.env` (defaults: **admin / admin1234** if you used the dev compose without changes).

---

## Canonical demo flow

Work through the scenarios below in order — each one builds on the previous state.

---

### 1. Initial setup (Owner)

**Goal:** show the owner can configure the system before handing it to staff.

1. Log in as **Owner**.
2. **Settings → Boutiques** — create two shops: _Boutique Centre_ and _Boutique Nord_.
3. **Settings → Catégories** — create _Smartphones_ and _Accessoires_.
4. **Settings → Utilisateurs** — create:
   - a WAREHOUSE user `magasinier` (no shop)
   - a SHOP user `vendeur_centre` assigned to _Boutique Centre_
5. **Produits** — create three products:
   - _Samsung Galaxy A35_ (catégorie: Smartphones)
   - _Chargeur USB-C_ (catégorie: Accessoires)
   - _Étui de protection_ (catégorie: Accessoires)

---

### 2. Stock entry (Warehouse manager)

**Goal:** show the stock flow from warehouse to shops.

1. Log in as **magasinier** (WAREHOUSE).
2. **Réceptions directes** — do a direct warehouse receipt:
   - 50 × Samsung Galaxy A35
   - 100 × Chargeur USB-C
   - 80 × Étui de protection
3. **Transferts** — transfer to _Boutique Centre_:
   - 15 × Samsung Galaxy A35
   - 30 × Chargeur USB-C
   - 20 × Étui de protection
4. **Stock entrepôt** — verify warehouse balances decreased.
5. Log back in as **Owner** → **Stock boutique** — verify _Boutique Centre_ received the stock.

---

### 3. Paid-in-full sale (10 000 MRU)

**Goal:** the simplest sale path — cash buyer, no debt.

1. Log in as **vendeur_centre** (SHOP — Boutique Centre).
2. **Nouvelle vente** — add:
   - 2 × Samsung Galaxy A35 @ 4 000 MRU each
   - 2 × Chargeur USB-C @ 1 000 MRU each
   - Total: **10 000 MRU**
3. Set **Montant encaissé = 10 000**.
4. Click **Valider la vente**.
5. On the confirmation screen: status badge shows **PAYÉ**. Print Receipt — clean receipt, no app chrome.
6. Go back to **Stock boutique** — show that Galaxy A35 dropped by 2, Chargeur by 2.

**What to verify:** stock reduced, PAID status, receipt prints cleanly.

---

### 4. Partial-payment sale (4 000 paid of 10 000)

**Goal:** show debt creation and the customer account flow.

1. Still as **vendeur_centre**.
2. **Clients** — create customer _Mohamed Yahya_, phone _22012345_.
3. **Nouvelle vente** — add:
   - 2 × Samsung Galaxy A35 @ 4 000 MRU each
   - 2 × Étui de protection @ 1 000 MRU each
   - Total: **10 000 MRU**
4. Assign to _Mohamed Yahya_. Set **Montant encaissé = 4 000**.
5. Validate. Confirmation shows **PARTIELLEMENT PAYÉ** · dû: 6 000 MRU.
6. Print Receipt — shows 4 000 collected, 6 000 still owed.
7. Navigate **Clients → Mohamed Yahya** — BalanceBar shows the 6 000 outstanding.

**What to verify:** PARTIALLY_PAID status, BalanceBar on customer page, correct amountDue.

---

### 5. Debt sale (0 upfront) + allocation across two debts

**Goal:** show oldest-first payment allocation across multiple open sales.

1. As **vendeur_centre**, add another sale for _Mohamed Yahya_:
   - 3 × Chargeur USB-C @ 1 000 MRU each
   - Total: **3 000 MRU** · encaissé = **0**
   - Status: IMPAYÉ.

2. **Clients → Mohamed Yahya** — outstanding is now **9 000 MRU** (6 000 + 3 000).

3. Click **Enregistrer un paiement**:
   - Montant: **8 000 MRU**.
   - Simulation shows oldest sale covered first (6 000 from sale #1 → PAYÉ, then 2 000 from sale #2).
   - Validate.

4. Back on customer page:
   - Outstanding is now **1 000 MRU**.
   - Sale #1 → PAYÉ. Sale #2 → PARTIELLEMENT PAYÉ.
   - Payment receipt shows debtBefore / debtAfter snapshot.

5. Reprint the payment receipt from the customer page — snapshot values unchanged.

**What to verify:** oldest-first allocation, correct outstanding after payment, receipt reprints correctly.

---

### 6. Reversal + re-payment (Owner)

**Goal:** show the OWNER can fix an incorrect payment without corrupting the ledger.

1. Log in as **Owner**.
2. **Clients → Mohamed Yahya → Historique des paiements** — click **Annuler** on the 8 000 MRU payment.
3. Enter reason: _"Montant saisi incorrect"_ → confirm.
4. Outstanding jumps back to **9 000 MRU**. Sales revert to their pre-payment statuses.
5. Register a correct payment of **9 000 MRU** → all sales become PAYÉ.

**What to verify:** outstanding recalculates correctly, sales status reverts and re-updates, invariants hold.

---

### 7. Sale cancellation (Owner)

**Goal:** show that a paid-in-full sale can be cancelled and stock restored.

1. As **Owner**, go to any sale with no active payments.
2. **Annuler la vente** → enter a reason → confirm.
3. Status changes to **ANNULÉE**. Stock is restored to the shop.
4. As **vendeur_centre** (SHOP), verify the Cancel button is absent (OWNER-only).

**What to verify:** status = CANCELLED, stock restored, SHOP role cannot cancel.

---

### 8. Reports (Owner)

**Goal:** prove the financial picture matches everything done above.

1. **Rapports → Boutique** — pick _Boutique Centre_, today's date range.
   - Ventes totales, cash encaissé, dettes créées all match the demo activity.
2. **Rapports → Dettes clients** — shows Mohamed Yahya at 0 (all settled).
3. **Rapports → Entrepôt** — shows correct warehouse balances.
4. **Rapports → Commandes** — empty (no orders placed today, or show a direct receipt).

---

## Features to test during the demo

| Area | What to test |
|---|---|
| Auth | Wrong password → error; SHOP can't reach /api/inventory |
| Role isolation | SHOP user can only see their own shop's sales and stock |
| Negative stock | Try to sell 100 units when only 5 are in stock → rejected |
| No customer on debt sale | Sell with 0 upfront and no customer → rejected |
| Receipt print | Print from browser (Ctrl+P) — only the receipt, no sidebar |
| PWA install | Add to home screen on phone, open offline → app shell loads |
| Arabic/RTL | Switch language → layout mirrors, numbers stay Western |
| Concurrent cancel | Open two tabs, cancel same sale in both — second gets an error |

---

## Running in production (Docker)

```bash
cp env.production.example .env
# Fill in DOMAIN, DB_PASSWORD, SESSION_SECRET, etc.

docker compose -f docker-compose.prod.yml up -d --build
```

See `docs/DEPLOY.md` for the full runbook including backups and rollback.
