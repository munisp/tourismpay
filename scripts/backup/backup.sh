#!/usr/bin/env bash
# TourismPay — PostgreSQL Backup to S3
# Usage: ./scripts/backup/backup.sh
# Env: DATABASE_URL, S3_BACKUP_BUCKET, S3_BACKUP_REGION

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/tmp/tourismpay-backups"
BACKUP_FILE="tourismpay_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

DATABASE_URL="${DATABASE_URL:-postgresql://tourismpay_user:testpass123@localhost:5432/tourismpay}"
S3_BUCKET="${S3_BACKUP_BUCKET:-tourismpay-backups}"
S3_REGION="${S3_BACKUP_REGION:-af-south-1}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

mkdir -p "$BACKUP_DIR"

echo "[Backup] Starting PostgreSQL backup at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "[Backup] Database: ${DATABASE_URL%%@*}@***"

# Extract connection params from DATABASE_URL
PGHOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\(.*\):[0-9]*/.*|\1|p')
PGPORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
PGUSER=$(echo "$DATABASE_URL" | sed -n 's|.*://\(.*\):.*@.*|\1|p')
PGPASSWORD=$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\(.*\)@.*|\1|p')
PGDATABASE=$(echo "$DATABASE_URL" | sed -n 's|.*/\(.*\)|\1|p')

export PGPASSWORD

# Create compressed backup with checksums
pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --verbose 2>/dev/null | gzip > "$BACKUP_PATH"

BACKUP_SIZE=$(stat --format="%s" "$BACKUP_PATH" 2>/dev/null || stat -f "%z" "$BACKUP_PATH" 2>/dev/null)
BACKUP_SHA256=$(sha256sum "$BACKUP_PATH" | cut -d' ' -f1)

echo "[Backup] File: $BACKUP_FILE"
echo "[Backup] Size: $((BACKUP_SIZE / 1024))KB"
echo "[Backup] SHA256: $BACKUP_SHA256"

# Save checksum file
echo "$BACKUP_SHA256  $BACKUP_FILE" > "${BACKUP_PATH}.sha256"

# Upload to S3 if AWS CLI is available
if command -v aws &>/dev/null; then
  echo "[Backup] Uploading to s3://$S3_BUCKET/backups/$BACKUP_FILE..."
  aws s3 cp "$BACKUP_PATH" "s3://$S3_BUCKET/backups/$BACKUP_FILE" --region "$S3_REGION"
  aws s3 cp "${BACKUP_PATH}.sha256" "s3://$S3_BUCKET/backups/${BACKUP_FILE}.sha256" --region "$S3_REGION"

  # Clean up old backups (retention policy)
  echo "[Backup] Cleaning up backups older than $RETENTION_DAYS days..."
  CUTOFF=$(date -d "-${RETENTION_DAYS} days" +%Y%m%d 2>/dev/null || date -v-${RETENTION_DAYS}d +%Y%m%d 2>/dev/null)
  aws s3 ls "s3://$S3_BUCKET/backups/" --region "$S3_REGION" | while read -r line; do
    FILE_DATE=$(echo "$line" | grep -oP 'tourismpay_\K[0-9]{8}' || true)
    if [ -n "$FILE_DATE" ] && [ "$FILE_DATE" -lt "$CUTOFF" ]; then
      FILE_NAME=$(echo "$line" | awk '{print $NF}')
      echo "[Backup] Removing old backup: $FILE_NAME"
      aws s3 rm "s3://$S3_BUCKET/backups/$FILE_NAME" --region "$S3_REGION"
    fi
  done

  echo "[Backup] S3 upload complete."
else
  echo "[Backup] AWS CLI not found — backup saved locally at $BACKUP_PATH"
fi

# Clean up local temp files older than 1 day
find "$BACKUP_DIR" -name "tourismpay_*.sql.gz*" -mtime +1 -delete 2>/dev/null || true

echo "[Backup] Completed at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "[Backup] Verify: sha256sum -c ${BACKUP_PATH}.sha256"
