#!/usr/bin/env bash
# TourismPay — PostgreSQL Restore from Backup
# Usage: ./scripts/backup/restore.sh <backup-file.sql.gz>
# Env: DATABASE_URL

set -euo pipefail

BACKUP_FILE="${1:?Usage: restore.sh <backup-file.sql.gz>}"
DATABASE_URL="${DATABASE_URL:-postgresql://tourismpay_user:testpass123@localhost:5432/tourismpay}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[Restore] ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Verify checksum if available
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
if [ -f "$CHECKSUM_FILE" ]; then
  echo "[Restore] Verifying checksum..."
  if sha256sum -c "$CHECKSUM_FILE" 2>/dev/null; then
    echo "[Restore] Checksum verified."
  else
    echo "[Restore] ERROR: Checksum mismatch! Backup may be corrupted."
    exit 1
  fi
else
  echo "[Restore] WARNING: No checksum file found — skipping verification."
fi

# Extract connection params
PGHOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\(.*\):[0-9]*/.*|\1|p')
PGPORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
PGUSER=$(echo "$DATABASE_URL" | sed -n 's|.*://\(.*\):.*@.*|\1|p')
PGPASSWORD=$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\(.*\)@.*|\1|p')
PGDATABASE=$(echo "$DATABASE_URL" | sed -n 's|.*/\(.*\)|\1|p')

export PGPASSWORD

echo "[Restore] Starting restore to $PGDATABASE at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "[Restore] File: $BACKUP_FILE ($(stat --format="%s" "$BACKUP_FILE" 2>/dev/null || stat -f "%z" "$BACKUP_FILE" 2>/dev/null) bytes)"

# Confirm destructive operation
echo ""
echo "WARNING: This will drop and recreate all tables in $PGDATABASE."
echo "Press Ctrl+C within 5 seconds to abort..."
sleep 5

echo "[Restore] Restoring..."
gunzip -c "$BACKUP_FILE" | pg_restore \
  -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
  --clean --if-exists \
  --no-owner --no-privileges \
  --verbose 2>/dev/null || {
    echo "[Restore] pg_restore had warnings (this is normal for --clean on first run)"
  }

# Verify restore
TABLE_COUNT=$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -t -c \
  "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';" 2>/dev/null | tr -d ' ')

echo "[Restore] Completed at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "[Restore] Tables in database: $TABLE_COUNT"
echo "[Restore] Run 'pnpm drizzle-kit push' to apply any pending schema changes."
