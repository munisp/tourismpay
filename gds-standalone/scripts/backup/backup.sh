#!/bin/bash
# GDS Database Backup Script
# Performs pg_dump with compression and uploads to S3-compatible storage.
# Designed to run as a cron job or Temporal scheduled workflow.
#
# Usage: ./backup.sh [daily|weekly|monthly]
# Environment:
#   GDS_DB_HOST, GDS_DB_PORT, GDS_DB_NAME, GDS_DB_USER, GDS_DB_PASSWORD
#   S3_BUCKET, S3_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY

set -euo pipefail

BACKUP_TYPE="${1:-daily}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/gds"
BACKUP_FILE="gds_${BACKUP_TYPE}_${TIMESTAMP}.sql.gz"
RETENTION_DAYS_DAILY=7
RETENTION_DAYS_WEEKLY=30
RETENTION_DAYS_MONTHLY=365

DB_HOST="${GDS_DB_HOST:-localhost}"
DB_PORT="${GDS_DB_PORT:-5432}"
DB_NAME="${GDS_DB_NAME:-gds}"
DB_USER="${GDS_DB_USER:-gds_user}"

echo "[Backup] Starting ${BACKUP_TYPE} backup at $(date -Iseconds)"

mkdir -p "${BACKUP_DIR}"

# Dump database with compression
PGPASSWORD="${GDS_DB_PASSWORD:-gds_pass}" pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --format=custom \
  --compress=9 \
  --verbose \
  --file="${BACKUP_DIR}/${BACKUP_FILE}" \
  2>&1 | tee -a "${BACKUP_DIR}/backup.log"

FILESIZE=$(stat --format=%s "${BACKUP_DIR}/${BACKUP_FILE}" 2>/dev/null || stat -f%z "${BACKUP_DIR}/${BACKUP_FILE}" 2>/dev/null || echo "unknown")
echo "[Backup] Created: ${BACKUP_FILE} (${FILESIZE} bytes)"

# Generate SHA256 checksum
sha256sum "${BACKUP_DIR}/${BACKUP_FILE}" > "${BACKUP_DIR}/${BACKUP_FILE}.sha256"

# Upload to S3 (if configured)
if [ -n "${S3_BUCKET:-}" ]; then
  S3_PATH="s3://${S3_BUCKET}/gds-backups/${BACKUP_TYPE}/${BACKUP_FILE}"
  aws s3 cp "${BACKUP_DIR}/${BACKUP_FILE}" "${S3_PATH}" \
    --endpoint-url "${S3_ENDPOINT:-}" \
    --storage-class STANDARD_IA
  aws s3 cp "${BACKUP_DIR}/${BACKUP_FILE}.sha256" "${S3_PATH}.sha256" \
    --endpoint-url "${S3_ENDPOINT:-}"
  echo "[Backup] Uploaded to ${S3_PATH}"
fi

# Clean up old local backups
case "${BACKUP_TYPE}" in
  daily)   find "${BACKUP_DIR}" -name "gds_daily_*" -mtime +${RETENTION_DAYS_DAILY} -delete ;;
  weekly)  find "${BACKUP_DIR}" -name "gds_weekly_*" -mtime +${RETENTION_DAYS_WEEKLY} -delete ;;
  monthly) find "${BACKUP_DIR}" -name "gds_monthly_*" -mtime +${RETENTION_DAYS_MONTHLY} -delete ;;
esac

echo "[Backup] Completed ${BACKUP_TYPE} backup at $(date -Iseconds)"

# Verify backup integrity
echo "[Backup] Verifying backup integrity..."
PGPASSWORD="${GDS_DB_PASSWORD:-gds_pass}" pg_restore \
  --list "${BACKUP_DIR}/${BACKUP_FILE}" > /dev/null 2>&1 && \
  echo "[Backup] Integrity check: PASSED" || \
  echo "[Backup] Integrity check: FAILED"
