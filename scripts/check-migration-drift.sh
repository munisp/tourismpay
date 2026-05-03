#!/usr/bin/env bash
# =============================================================================
# Migration Drift CI Check
#
# Verifies that the Drizzle schema and migrations are in sync.
# Run in CI to catch schema changes that haven't been properly migrated.
#
# Usage: ./scripts/check-migration-drift.sh
# =============================================================================

set -euo pipefail

echo "=== Migration Drift Check ==="

# Check if drizzle-kit is available
if ! npx drizzle-kit --version &>/dev/null; then
  echo "ERROR: drizzle-kit not found. Run 'pnpm install' first."
  exit 1
fi

echo "1. Generating schema diff..."
DIFF_OUTPUT=$(npx drizzle-kit generate 2>&1 || true)

if echo "$DIFF_OUTPUT" | grep -q "No schema changes"; then
  echo "PASS: Schema and migrations are in sync."
  exit 0
fi

if echo "$DIFF_OUTPUT" | grep -q "migration file"; then
  echo "FAIL: Schema has changed but migrations are not up to date."
  echo ""
  echo "Changes detected:"
  echo "$DIFF_OUTPUT"
  echo ""
  echo "Fix: Run 'npx drizzle-kit generate' locally, review the migration, and commit it."
  exit 1
fi

echo "INFO: drizzle-kit output:"
echo "$DIFF_OUTPUT"
echo ""
echo "If no new migration files were generated, schema is in sync."
exit 0
