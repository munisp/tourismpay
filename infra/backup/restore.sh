#!/bin/bash
# ─── TourismPay Database Restore Script ───────────────────────────────────────
#
# Restores from the most recent backup or a specified backup file.
#
# Usage:
#   ./restore.sh                                    # Restore latest
#   ./restore.sh /path/to/tourismpay_20260101.sql.gz  # Restore specific
#   ./restore.sh --from-s3 2026/01/tourismpay_20260101.sql.gz
#
# ⚠️  THIS WILL DROP AND RECREATE ALL TABLES
#
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/tourismpay}"
S3_BUCKET="${BACKUP_S3_BUCKET:-tourismpay-backups}"
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"
DB_USER="${PGUSER:-tourismpay}"
DB_NAME="${PGDATABASE:-tourismpay}"

# ─── Determine backup file ───────────────────────────────────────────────────
BACKUP_FILE=""

if [[ "${1:-}" == "--from-s3" ]]; then
  S3_KEY="${2:?Usage: restore.sh --from-s3 <s3-key>}"
  echo "Downloading from s3://$S3_BUCKET/db-backups/$S3_KEY..."
  mkdir -p "$BACKUP_DIR"
  aws s3 cp "s3://$S3_BUCKET/db-backups/$S3_KEY" "$BACKUP_DIR/$(basename $S3_KEY)"
  BACKUP_FILE="$BACKUP_DIR/$(basename $S3_KEY)"
elif [ -n "${1:-}" ] && [ -f "${1}" ]; then
  BACKUP_FILE="$1"
else
  # Find most recent local backup
  BACKUP_FILE=$(ls -t "$BACKUP_DIR"/tourismpay_*.sql.gz "$BACKUP_DIR"/tourismpay_*.dump 2>/dev/null | head -1)
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "[ERROR] No backup file found. Specify a path or ensure backups exist in $BACKUP_DIR"
  exit 1
fi

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ⚠️  DESTRUCTIVE OPERATION                                   ║"
echo "║  Database: $DB_NAME@$DB_HOST:$DB_PORT"
echo "║  Backup:   $(basename $BACKUP_FILE)"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
read -p "Type 'RESTORE' to confirm: " CONFIRM
if [ "$CONFIRM" != "RESTORE" ]; then
  echo "Aborted."
  exit 1
fi

# ─── Verify checksum ─────────────────────────────────────────────────────────
CHECKSUM_FILE="${BACKUP_FILE%.sql.gz}.sha256"
CHECKSUM_FILE="${CHECKSUM_FILE%.dump}.sha256"
if [ -f "$CHECKSUM_FILE" ]; then
  echo "Verifying checksum..."
  cd "$(dirname $BACKUP_FILE)" && sha256sum -c "$(basename $CHECKSUM_FILE)"
  echo "Checksum verified ✓"
fi

# ─── Restore ──────────────────────────────────────────────────────────────────
echo "[$(date -Iseconds)] Starting restore..."

if [[ "$BACKUP_FILE" == *.dump ]]; then
  pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --clean --if-exists --no-owner --no-privileges \
    "$BACKUP_FILE"
else
  gunzip -c "$BACKUP_FILE" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"
fi

echo "[$(date -Iseconds)] Restore complete!"
echo "Run 'pnpm drizzle-kit push' to apply any pending migrations."
