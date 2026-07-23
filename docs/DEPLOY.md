# Deployment Runbook

## Prerequisites

- A Linux VPS with Docker ≥ 24 and Docker Compose v2 (`docker compose`)
- A domain name with an A record pointing to the server's IP
- Ports 80 and 443 open in the firewall (Caddy uses them for HTTP→HTTPS redirect and TLS)
- Git installed on the server

---

## First deploy

### 1. Clone the repository

```bash
git clone <repo-url> /opt/warehouse
cd /opt/warehouse
```

### 2. Create the environment file

```bash
cp env.production.example .env
```

Edit `.env` and fill in every value:

| Variable | How to set |
|---|---|
| `DOMAIN` | Your public domain, e.g. `warehouse.example.com` |
| `DB_USER` | Postgres user (keep `app` or change) |
| `DB_PASSWORD` | Strong random password |
| `DB_NAME` | Database name (keep `shopdb` or change) |
| `WEB_ORIGIN` | `https://<DOMAIN>` — must match `DOMAIN` exactly |
| `SESSION_SECRET` | `openssl rand -hex 64` |
| `SEED_ADMIN_USERNAME` | Username for the first owner account |
| `SEED_ADMIN_PASSWORD` | Password for the first owner account (≥ 8 chars) |

### 3. Build and start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Caddy will automatically obtain a TLS certificate for your domain on first request.

### 4. Verify

```bash
# All three services should show "Up"
docker compose -f docker-compose.prod.yml ps

# Tail API logs for migration output and startup confirmation
docker compose -f docker-compose.prod.yml logs -f api
```

Open `https://<DOMAIN>` in a browser and log in with the admin credentials you set in `SEED_ADMIN_*`.

---

## Updating (rolling deploy)

```bash
cd /opt/warehouse

# Pull latest code
git pull

# Rebuild and restart — Prisma migrations run automatically on api startup
docker compose -f docker-compose.prod.yml up -d --build

# Confirm the new API started cleanly
docker compose -f docker-compose.prod.yml logs --tail=50 api
```

The database and uploads volumes are untouched; only the `api` and `web` images are rebuilt.

---

## Rollback

If a deploy goes wrong:

```bash
# Roll back to the previous image (before the last build)
docker compose -f docker-compose.prod.yml up -d --no-build

# Or check out the previous git tag / commit and rebuild
git checkout <previous-tag>
docker compose -f docker-compose.prod.yml up -d --build
```

If the database migration cannot be reversed automatically, restore from backup (see below).

---

## Backups

### Automated (recommended)

Add a cron entry on the server to run the backup script daily:

```bash
crontab -e
# Add:
0 3 * * * /opt/warehouse/scripts/backup.sh >> /var/log/warehouse-backup.log 2>&1
```

Dumps land in `./backups/` by default.  Set `KEEP_DAYS=30` in `.env` to keep 30 days of history.

For off-site storage, install [rclone](https://rclone.org), configure a remote, and set `RCLONE_DEST=s3:my-bucket/db` in `.env`.

### Manual backup

```bash
./scripts/backup.sh
```

### Restore rehearsal

Run this on a staging server (never on production without a plan) to verify the backup is valid:

```bash
./scripts/restore.sh ./backups/shopdb_<timestamp>.dump
```

The script drops and recreates the database, then replays the dump.  After restore, restart the API:

```bash
docker compose -f docker-compose.prod.yml restart api
```

---

## Logs

Each service writes JSON logs capped at 10 MB × 5 files (50 MB max per service).

```bash
# Live follow
docker compose -f docker-compose.prod.yml logs -f

# Last 100 lines from API only
docker compose -f docker-compose.prod.yml logs --tail=100 api
```

---

## Useful one-liners

```bash
# Open a psql shell
docker compose -f docker-compose.prod.yml exec db psql -U app -d shopdb

# Run a one-off prisma command (e.g. studio for inspection)
docker compose -f docker-compose.prod.yml exec api npx prisma studio

# Reload Caddy config without downtime
docker compose -f docker-compose.prod.yml exec web caddy reload --config /etc/caddy/Caddyfile
```
