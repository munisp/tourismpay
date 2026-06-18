#!/bin/bash
# GDS Database Restore Script
# Restores a pg_dump backup with verification.
#
# Usage: ./restore.sh <backup_file> [--drop-existing]
# Example: ./restore.sh /var/backups/gds/gds_daily_20260611.sql.gz

set -euo pipefail

BACKUP_FILE="${1:?Usage: ./restore.sh <backup_file> [--drop-existing]}"
DROP_EXISTING="${2:-}"

DB_HOST="${GDS_DB_HOST:-localhost}"
DB_PORT="${GDS_DB_PORT:-5432}"
DB_NAME="${GDS_DB_NAME:-gds}"
DB_USER="${GDS_DB_USER:-gds_user}"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[Restore] ERROR: File not found: ${BACKUP_FILE}"
  exit 1
fi

# Verify checksum if available
if [ -f "${BACKUP_FILE}.sha256" ]; then
  echo "[Restore] Verifying checksum..."
  sha256sum -c "${BACKUP_FILE}.sha256" || {
    echo "[Restore] CHECKSUM MISMATCH — backup may be corrupted"
    exit 1
  }
fi

echo "[Restore] Starting restore from: ${BACKUP_FILE}"
echo "[Restore] Target: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo "[Restore] WARNING: This will overwrite existing data!"
read -p "Continue? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "[Restore] Aborted."
  exit 0
fi

RESTORE_ARGS=(
  -h "${DB_HOST}"
  -p "${DB_PORT}"
  -U "${DB_USER}"
  -d "${DB_NAME}"
  --verbose
  --no-owner
  --no-privileges
)

if [ "${DROP_EXISTING}" = "--drop-existing" ]; then
  RESTORE_ARGS+=(--clean --if-exists)
fi

PGPASSWORD="${GDS_DB_PASSWORD:-gds_pass}" pg_restore \
  "${RESTORE_ARGS[@]}" \
  "${BACKUP_FILE}" \
  2>&1 | tee /tmp/gds_restore.log

echo "[Restore] Completed at $(date -Iseconds)"

# Verify table counts
echo "[Restore] Verifying restored data..."
PGPASSWORD="${GDS_DB_PASSWORD:-gds_pass}" psql \
  -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
  -c "SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 20;"
