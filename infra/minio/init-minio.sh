#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# MinIO Lakehouse Initialisation Script — TourismPay Agency Banking Platform
#
# Creates all required buckets and sets lifecycle policies.
# Run once after MinIO starts: ./infra/minio/init-minio.sh
#
# Prerequisites:
#   - mc (MinIO Client) installed: https://min.io/docs/minio/linux/reference/minio-mc.html
#   - MinIO running at MINIO_ENDPOINT (default: http://localhost:9000)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://localhost:9000}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-minioadmin}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-minioadmin}"
ALIAS="tourismpay"

echo "[MinIO] Configuring mc alias → ${MINIO_ENDPOINT}"
mc alias set "${ALIAS}" "${MINIO_ENDPOINT}" "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}" --api S3v4

# ── Create buckets ────────────────────────────────────────────────────────────
BUCKETS=(
  "tourismpay-transactions"      # Raw transaction records (Parquet)
  "tourismpay-settlements"       # Daily settlement reports (CSV + Parquet)
  "tourismpay-fraud-events"      # Fraud detection events (JSON)
  "tourismpay-kyc-documents"     # KYC/KYB document uploads (encrypted)
  "tourismpay-receipts"          # Generated PDF receipts
  "tourismpay-audit-logs"        # Immutable audit trail (WORM)
  "tourismpay-analytics"         # Aggregated analytics datasets
  "tourismpay-backups"           # Database and config backups
  "tourismpay-ota-packages"      # OTA firmware update packages
  "tourismpay-agent-media"       # Agent profile photos and documents
)

for BUCKET in "${BUCKETS[@]}"; do
  if mc ls "${ALIAS}/${BUCKET}" &>/dev/null; then
    echo "[MinIO] Bucket already exists: ${BUCKET}"
  else
    mc mb "${ALIAS}/${BUCKET}"
    echo "[MinIO] Created bucket: ${BUCKET}"
  fi
done

# ── Set versioning on critical buckets ────────────────────────────────────────
VERSIONED_BUCKETS=(
  "tourismpay-transactions"
  "tourismpay-settlements"
  "tourismpay-audit-logs"
  "tourismpay-kyc-documents"
)

for BUCKET in "${VERSIONED_BUCKETS[@]}"; do
  mc version enable "${ALIAS}/${BUCKET}"
  echo "[MinIO] Versioning enabled: ${BUCKET}"
done

# ── Set object lock (WORM) on audit logs ─────────────────────────────────────
# Note: Object lock must be enabled at bucket creation time.
# Re-create with lock if needed:
# mc mb --with-lock "${ALIAS}/tourismpay-audit-logs"

# ── Set lifecycle policies ────────────────────────────────────────────────────
# Transactions: archive after 90 days, delete after 7 years (CBN compliance)
cat > /tmp/transactions-lifecycle.json << 'EOF'
{
  "Rules": [
    {
      "ID": "archive-old-transactions",
      "Status": "Enabled",
      "Filter": {"Prefix": ""},
      "Transition": {
        "Days": 90,
        "StorageClass": "GLACIER"
      },
      "Expiration": {
        "Days": 2555
      }
    }
  ]
}
EOF
mc ilm import "${ALIAS}/tourismpay-transactions" < /tmp/transactions-lifecycle.json
echo "[MinIO] Lifecycle policy set: tourismpay-transactions"

# Receipts: delete after 2 years
cat > /tmp/receipts-lifecycle.json << 'EOF'
{
  "Rules": [
    {
      "ID": "expire-old-receipts",
      "Status": "Enabled",
      "Filter": {"Prefix": ""},
      "Expiration": {
        "Days": 730
      }
    }
  ]
}
EOF
mc ilm import "${ALIAS}/tourismpay-receipts" < /tmp/receipts-lifecycle.json
echo "[MinIO] Lifecycle policy set: tourismpay-receipts"

# Backups: delete after 90 days
cat > /tmp/backups-lifecycle.json << 'EOF'
{
  "Rules": [
    {
      "ID": "expire-old-backups",
      "Status": "Enabled",
      "Filter": {"Prefix": ""},
      "Expiration": {
        "Days": 90
      }
    }
  ]
}
EOF
mc ilm import "${ALIAS}/tourismpay-backups" < /tmp/backups-lifecycle.json
echo "[MinIO] Lifecycle policy set: tourismpay-backups"

# ── Set bucket policies ───────────────────────────────────────────────────────
# KYC documents: private (no public access)
mc anonymous set none "${ALIAS}/tourismpay-kyc-documents"
mc anonymous set none "${ALIAS}/tourismpay-audit-logs"
mc anonymous set none "${ALIAS}/tourismpay-backups"
echo "[MinIO] Private access enforced on sensitive buckets"

# ── Create service account for application ────────────────────────────────────
mc admin user add "${ALIAS}" "tourismpay-app" "tourismpay-app-secret-change-in-prod"
mc admin policy attach "${ALIAS}" readwrite --user "tourismpay-app"
echo "[MinIO] Service account created: tourismpay-app"

echo ""
echo "[MinIO] ✅ Lakehouse initialisation complete"
echo "  Buckets: ${#BUCKETS[@]} created"
echo "  Versioning: ${#VERSIONED_BUCKETS[@]} buckets"
echo "  Lifecycle policies: transactions (7yr), receipts (2yr), backups (90d)"

# ── Apply lifecycle policies from JSON files ──────────────────────────────────
# Screenshots: expire after 90 days, transition to GLACIER after 30 days
if [[ -f "/init/lifecycle/tourismpay-screenshots-lifecycle.json" ]]; then
  mc mb "${ALIAS}/tourismpay-screenshots" 2>/dev/null || true
  mc ilm import "${ALIAS}/tourismpay-screenshots" < /init/lifecycle/tourismpay-screenshots-lifecycle.json
  echo "[MinIO] Lifecycle policy set: tourismpay-screenshots"
fi

# Firmware: expire old non-current versions after 1 year
if [[ -f "/init/lifecycle/tourismpay-firmware-lifecycle.json" ]]; then
  mc mb "${ALIAS}/tourismpay-firmware" 2>/dev/null || true
  mc ilm import "${ALIAS}/tourismpay-firmware" < /init/lifecycle/tourismpay-firmware-lifecycle.json
  echo "[MinIO] Lifecycle policy set: tourismpay-firmware"
fi

# Lakehouse: tiered storage (hot→warm→cold→delete)
if [[ -f "/init/lifecycle/tourismpay-lakehouse-lifecycle.json" ]]; then
  mc mb "${ALIAS}/tourismpay-lakehouse" 2>/dev/null || true
  mc ilm import "${ALIAS}/tourismpay-lakehouse" < /init/lifecycle/tourismpay-lakehouse-lifecycle.json
  echo "[MinIO] Lifecycle policy set: tourismpay-lakehouse"
fi

echo "[MinIO] ✅ All lifecycle policies applied"
