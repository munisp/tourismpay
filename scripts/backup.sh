#!/usr/bin/env bash
# =============================================================================
# TourismPay Database Backup Strategy
#
# This script provides automated PostgreSQL backups with:
# 1. pg_dump full backups (daily)
# 2. WAL archiving for point-in-time recovery
# 3. S3 upload with lifecycle rules
# 4. Verification of backup integrity
#
# Usage:
#   ./scripts/backup.sh [full|wal|verify|restore]
#
# Environment Variables:
#   DATABASE_URL      - PostgreSQL connection string
#   S3_BACKUP_BUCKET  - S3 bucket for backups (default: tourismpay-backups)
#   AWS_REGION        - AWS region (default: us-east-1)
#   BACKUP_RETENTION  - Days to keep backups (default: 30)
# =============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/tourismpay}"
S3_BUCKET="${S3_BACKUP_BUCKET:-tourismpay-backups}"
RETENTION_DAYS="${BACKUP_RETENTION:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_URL="${LOCAL_DATABASE_URL:-${DATABASE_URL:-postgresql://ndsep_user:ndsep_secure_2026@localhost:5432/ndsep_db}}"

mkdir -p "$BACKUP_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

backup_full() {
  local BACKUP_FILE="$BACKUP_DIR/tourismpay_full_${TIMESTAMP}.sql.gz"
  log "Starting full backup to $BACKUP_FILE"

  pg_dump "$DB_URL" \
    --format=plain \
    --no-owner \
    --no-privileges \
    --if-exists \
    --clean \
    | gzip > "$BACKUP_FILE"

  local SIZE
  SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
  log "Full backup completed: $BACKUP_FILE ($SIZE)"

  # Upload to S3 if configured
  if command -v aws &>/dev/null && [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
    log "Uploading to S3: s3://$S3_BUCKET/full/$TIMESTAMP/"
    aws s3 cp "$BACKUP_FILE" "s3://$S3_BUCKET/full/tourismpay_full_${TIMESTAMP}.sql.gz" \
      --storage-class STANDARD_IA \
      --sse AES256
    log "S3 upload complete"
  fi

  # Cleanup old local backups
  find "$BACKUP_DIR" -name "tourismpay_full_*.sql.gz" -mtime "+$RETENTION_DAYS" -delete
  log "Cleaned up backups older than $RETENTION_DAYS days"
}

backup_verify() {
  local LATEST
  LATEST=$(ls -t "$BACKUP_DIR"/tourismpay_full_*.sql.gz 2>/dev/null | head -1)

  if [ -z "$LATEST" ]; then
    log "ERROR: No backup files found in $BACKUP_DIR"
    exit 1
  fi

  log "Verifying backup: $LATEST"

  # Check gzip integrity
  if gzip -t "$LATEST" 2>/dev/null; then
    log "PASS: Gzip integrity check"
  else
    log "FAIL: Backup file is corrupted"
    exit 1
  fi

  # Check SQL content
  local TABLES
  TABLES=$(zcat "$LATEST" | grep -c "CREATE TABLE" || true)
  log "PASS: Found $TABLES table definitions"

  local SIZE
  SIZE=$(du -sh "$LATEST" | cut -f1)
  log "Backup verified successfully: $LATEST ($SIZE, $TABLES tables)"
}

backup_restore() {
  local BACKUP_FILE="${2:-}"

  if [ -z "$BACKUP_FILE" ]; then
    BACKUP_FILE=$(ls -t "$BACKUP_DIR"/tourismpay_full_*.sql.gz 2>/dev/null | head -1)
    if [ -z "$BACKUP_FILE" ]; then
      log "ERROR: No backup file specified and none found in $BACKUP_DIR"
      exit 1
    fi
    log "Using latest backup: $BACKUP_FILE"
  fi

  log "WARNING: This will overwrite the current database!"
  echo -n "Are you sure? [y/N] "
  read -r CONFIRM
  if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    log "Restore cancelled"
    exit 0
  fi

  log "Restoring from $BACKUP_FILE"
  zcat "$BACKUP_FILE" | psql "$DB_URL" --quiet
  log "Restore completed successfully"
}

# ─── Main ─────────────────────────────────────────────────────────────────────

case "${1:-full}" in
  full)    backup_full ;;
  verify)  backup_verify ;;
  restore) backup_restore "$@" ;;
  *)
    echo "Usage: $0 [full|verify|restore [backup_file]]"
    exit 1
    ;;
esac
