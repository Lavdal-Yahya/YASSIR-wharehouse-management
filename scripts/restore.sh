#!/usr/bin/env bash
# restore.sh — restore a pg_dump file into the production database.
#
# Usage:
#   ./scripts/restore.sh ./backups/shopdb_20260120T120000Z.dump
#
# WARNING: this DROPS and recreates the target database — all current data
# will be lost.  Always verify you have a recent backup before restoring.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [[ -f "$ROOT_DIR/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$ROOT_DIR/.env"; set +a
fi

DB_USER="${DB_USER:-app}"
DB_PASSWORD="${DB_PASSWORD:?DB_PASSWORD must be set}"
DB_NAME="${DB_NAME:-shopdb}"

DUMP_FILE="${1:?Usage: $0 <dump-file>}"

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "ERROR: dump file not found: $DUMP_FILE" >&2
  exit 1
fi

echo "============================================================"
echo "  RESTORE: $DUMP_FILE"
echo "  Target:  $DB_NAME on localhost (Docker service: db)"
echo "============================================================"
echo ""
echo "  WARNING: the current database will be DROPPED and recreated."
read -rp "  Type 'yes' to continue: " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  echo "Aborted."
  exit 1
fi

# ---------------------------------------------------------------------------
# Drop + recreate the database
# ---------------------------------------------------------------------------
echo "[restore] dropping and recreating $DB_NAME"
PGPASSWORD="$DB_PASSWORD" docker compose -f "$ROOT_DIR/docker-compose.prod.yml" \
  exec -T db \
  psql -U "$DB_USER" -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB_NAME' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS $DB_NAME;" \
  -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------
echo "[restore] restoring dump"
PGPASSWORD="$DB_PASSWORD" docker compose -f "$ROOT_DIR/docker-compose.prod.yml" \
  exec -T db \
  pg_restore -U "$DB_USER" -d "$DB_NAME" --no-owner --role="$DB_USER" \
  < "$DUMP_FILE"

echo "[restore] done — restart the API to pick up the restored state:"
echo "  docker compose -f docker-compose.prod.yml restart api"
