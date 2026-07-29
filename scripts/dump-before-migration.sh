#!/usr/bin/env bash
# dump-before-migration.sh — labelled pre-migration snapshot of the DB.
#
# Writes two files under backups/pre-migration/ (kept forever, not touched
# by backup.sh's rotation):
#   <label>_<timestamp>.dump     custom-format, restorable with pg_restore
#   <label>_<timestamp>.sql      plain SQL, readable + diffable
#
# Usage (from repo root):
#   ./scripts/dump-before-migration.sh                          # label = "pre-migration"
#   ./scripts/dump-before-migration.sh shop-product-prices       # custom label
#   COMPOSE_FILE=docker-compose.yml ./scripts/dump-before-migration.sh  # dev DB
#
# Environment (read from .env if present, else shell):
#   DB_USER          postgres user (default: app)
#   DB_PASSWORD      postgres password (required)
#   DB_NAME          database name (default: shopdb)
#   BACKUP_DIR       parent dir for backups (default: ./backups)
#   COMPOSE_FILE     compose file to exec into (default: docker-compose.prod.yml)
#   DB_SERVICE       compose service name for postgres (default: db)

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
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DB_SERVICE="${DB_SERVICE:-db}"

LABEL="${1:-pre-migration}"
# Sanitise label so it's a safe filename fragment.
LABEL="$(echo "$LABEL" | tr -c '[:alnum:]._-' '-')"

OUT_DIR="$BACKUP_DIR/pre-migration"
mkdir -p "$OUT_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="$OUT_DIR/${LABEL}_${TIMESTAMP}.dump"
SQL_FILE="$OUT_DIR/${LABEL}_${TIMESTAMP}.sql"

echo "[dump] using compose file: $COMPOSE_FILE (service: $DB_SERVICE)"
echo "[dump] database: $DB_NAME as $DB_USER"

# Sanity: fail fast if the compose service isn't up.
if ! docker compose -f "$ROOT_DIR/$COMPOSE_FILE" ps --services --filter status=running \
     | grep -qx "$DB_SERVICE"; then
  echo "ERROR: '$DB_SERVICE' is not running in $COMPOSE_FILE." >&2
  echo "       Start the stack first: docker compose -f $COMPOSE_FILE up -d $DB_SERVICE" >&2
  exit 1
fi

# --- Custom-format dump: restorable, compact, the file restore.sh consumes.
echo "[dump] writing custom-format dump → $DUMP_FILE"
PGPASSWORD="$DB_PASSWORD" docker compose -f "$ROOT_DIR/$COMPOSE_FILE" \
  exec -T "$DB_SERVICE" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc \
  > "$DUMP_FILE"

# --- Plain-SQL dump: human-readable, greppable, diffable across snapshots.
echo "[dump] writing plain SQL → $SQL_FILE"
PGPASSWORD="$DB_PASSWORD" docker compose -f "$ROOT_DIR/$COMPOSE_FILE" \
  exec -T "$DB_SERVICE" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" \
  --format=plain --no-owner --no-privileges \
  > "$SQL_FILE"

echo ""
echo "[dump] done."
printf '  %s  (%s)\n' "$DUMP_FILE" "$(du -h "$DUMP_FILE" | cut -f1)"
printf '  %s  (%s)\n' "$SQL_FILE" "$(du -h "$SQL_FILE" | cut -f1)"
echo ""
echo "To restore this snapshot if the migration goes wrong:"
echo "  ./scripts/restore.sh \"$DUMP_FILE\""
