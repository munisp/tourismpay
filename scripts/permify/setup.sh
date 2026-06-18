#!/usr/bin/env bash
# Permify schema + initial relationships setup
# Usage: PERMIFY_URL=http://localhost:3476 ./scripts/permify/setup.sh

set -euo pipefail

PERMIFY_URL="${PERMIFY_URL:-http://localhost:3476}"
TENANT_ID="${PERMIFY_TENANT_ID:-tourismpay}"

echo "[Permify] Writing authorization schema to $PERMIFY_URL..."

SCHEMA=$(cat scripts/permify/schema.perm)

curl -sS -X POST "$PERMIFY_URL/v1/tenants/$TENANT_ID/schemas/write" \
  -H "Content-Type: application/json" \
  -d "{\"schema\": $(echo "$SCHEMA" | jq -Rs .)}" | jq .

echo "[Permify] Writing seed relationships..."

# Admin user gets full system access
curl -sS -X POST "$PERMIFY_URL/v1/tenants/$TENANT_ID/relationships/write" \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {"schema_version": ""},
    "tuples": [
      {"entity": {"type": "system", "id": "tourismpay"}, "relation": "admin", "subject": {"type": "user", "id": "admin-1"}},
      {"entity": {"type": "system", "id": "tourismpay"}, "relation": "operator", "subject": {"type": "user", "id": "noc-1"}},
      {"entity": {"type": "system", "id": "tourismpay"}, "relation": "viewer", "subject": {"type": "user", "id": "analyst-1"}}
    ]
  }' | jq .

echo "[Permify] Setup complete."
