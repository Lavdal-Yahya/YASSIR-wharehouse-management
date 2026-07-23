#!/usr/bin/env bash
# backup.sh — dump the production Postgres database and rotate old files.
#
# Usage (from repo root):
#   ./scripts/backup.sh
#
# Environment (read from .env if present, else shell):
#   DB_USER        postgres user (default: app)
#   DB_PASSWORD    postgres password
#   DB_NAME        database name (default: shopdb)
#   BACKUP_DIR     where to store dumps (default: ./backups)
#   KEEP_DAYS      how many days of backups to keep (default: 14)
#   RCLONE_DEST    optional rclone remote path, e.g. "s3:my-bucket/db"
#                  — if set, the dump is uploaded after creation.

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Source .env if it exists so the script works from cron without a login shell.
if [[ -f "$ROOT_DIR/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$ROOT_DIR/.env"; set +a
fi

DB_USER="${DB_USER:-app}"
DB_PASSWORD="${DB_PASSWORD:?DB_PASSWORD must be set}"
DB_NAME="${DB_NAME:-shopdb}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
RCLONE_DEST="${RCLONE_DEST:-}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.dump"

# ---------------------------------------------------------------------------
# Dump
# ---------------------------------------------------------------------------
echo "[backup] dumping $DB_NAME → $DUMP_FILE"

# pg_dump runs inside the Docker container so we don't need a local pg client.
PGPASSWORD="$DB_PASSWORD" docker compose -f "$ROOT_DIR/docker-compose.prod.yml" \
  exec -T db \
  pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc \
  > "$DUMP_FILE"

echo "[backup] dump complete ($(du -sh "$DUMP_FILE" | cut -f1))"

# ---------------------------------------------------------------------------
# Optional remote upload via rclone
# ---------------------------------------------------------------------------
if [[ -n "$RCLONE_DEST" ]]; then
  echo "[backup] uploading to $RCLONE_DEST"
  rclone copy "$DUMP_FILE" "$RCLONE_DEST"
  echo "[backup] upload done"
fi

# ---------------------------------------------------------------------------
# Rotation — delete dumps older than KEEP_DAYS
# ---------------------------------------------------------------------------
echo "[backup] rotating files older than ${KEEP_DAYS} days"
find "$BACKUP_DIR" -name "${DB_NAME}_*.dump" -mtime +"$KEEP_DAYS" -delete

echo "[backup] done"
