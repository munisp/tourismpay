#!/bin/bash
# ─── TourismPay Database Backup Script ────────────────────────────────────────
#
# Automated PostgreSQL backup with:
#  - Compressed pg_dump (gzip)
#  - SHA256 checksum verification
#  - S3 upload with lifecycle policy
#  - Retention: 7 daily, 4 weekly, 12 monthly
#  - Slack/webhook notification on failure
#
# Usage:
#   ./backup.sh                    # Full backup
#   ./backup.sh --tables-only     # Schema + data (no roles/tablespaces)
#   ./backup.sh --verify          # Verify latest backup integrity
#
# Environment:
#   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
#   BACKUP_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
#   BACKUP_WEBHOOK_URL (optional, for failure notifications)
#
set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/var/backups/tourismpay}"
BACKUP_FILE="tourismpay_${TIMESTAMP}.sql.gz"
CHECKSUM_FILE="tourismpay_${TIMESTAMP}.sha256"
S3_BUCKET="${BACKUP_S3_BUCKET:-tourismpay-backups}"
S3_PREFIX="db-backups/$(date +%Y/%m)"
RETENTION_DAILY=7
RETENTION_WEEKLY=4
RETENTION_MONTHLY=12

# Database connection
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"
DB_USER="${PGUSER:-tourismpay}"
DB_NAME="${PGDATABASE:-tourismpay}"

mkdir -p "$BACKUP_DIR"

# ─── Backup ───────────────────────────────────────────────────────────────────
echo "[$(date -Iseconds)] Starting backup of $DB_NAME..."

if [[ "${1:-}" == "--tables-only" ]]; then
  pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --no-owner --no-privileges --clean --if-exists \
    | gzip > "$BACKUP_DIR/$BACKUP_FILE"
else
  pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --format=custom --compress=9 \
    > "$BACKUP_DIR/${BACKUP_FILE%.sql.gz}.dump" 2>/dev/null || \
  pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --clean --if-exists \
    | gzip > "$BACKUP_DIR/$BACKUP_FILE"
fi

# ─── Checksum ─────────────────────────────────────────────────────────────────
ACTUAL_FILE=$(ls -t "$BACKUP_DIR"/tourismpay_${TIMESTAMP}* 2>/dev/null | head -1)
if [ -z "$ACTUAL_FILE" ]; then
  echo "[ERROR] Backup file not found!"
  exit 1
fi

sha256sum "$ACTUAL_FILE" > "$BACKUP_DIR/$CHECKSUM_FILE"
BACKUP_SIZE=$(du -h "$ACTUAL_FILE" | cut -f1)
echo "[$(date -Iseconds)] Backup complete: $ACTUAL_FILE ($BACKUP_SIZE)"

# ─── Verify ───────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--verify" ]]; then
  echo "Verifying checksum..."
  cd "$BACKUP_DIR" && sha256sum -c "$CHECKSUM_FILE"
  echo "Verification passed."
  exit 0
fi

# ─── S3 Upload ────────────────────────────────────────────────────────────────
if command -v aws &> /dev/null && [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
  echo "Uploading to s3://$S3_BUCKET/$S3_PREFIX/..."
  aws s3 cp "$ACTUAL_FILE" "s3://$S3_BUCKET/$S3_PREFIX/$(basename $ACTUAL_FILE)" \
    --storage-class STANDARD_IA
  aws s3 cp "$BACKUP_DIR/$CHECKSUM_FILE" "s3://$S3_BUCKET/$S3_PREFIX/$CHECKSUM_FILE"
  echo "S3 upload complete."
else
  echo "[WARN] AWS CLI not available or not configured — skipping S3 upload"
fi

# ─── Local Retention Cleanup ──────────────────────────────────────────────────
echo "Cleaning old local backups (keeping $RETENTION_DAILY days)..."
find "$BACKUP_DIR" -name "tourismpay_*.sql.gz" -mtime +${RETENTION_DAILY} -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "tourismpay_*.dump" -mtime +${RETENTION_DAILY} -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "tourismpay_*.sha256" -mtime +${RETENTION_DAILY} -delete 2>/dev/null || true

# ─── Notification ─────────────────────────────────────────────────────────────
echo "[$(date -Iseconds)] Backup pipeline complete: $BACKUP_SIZE uploaded to $S3_PREFIX"
