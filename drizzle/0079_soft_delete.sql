-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0079: Soft Delete Support
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds soft delete columns (deleted_at, is_deleted) to key tables that
-- require audit trails and data recovery capabilities.
--
-- Tables receiving soft delete:
--   - users              (GDPR right-to-erasure: mark deleted, anonymize later)
--   - establishments     (merchant offboarding audit trail)
--   - tourist_bookings   (financial audit trail)
--   - merchant_products  (product lifecycle management)
--   - loyalty_rewards    (reward catalogue versioning)
--   - payment_links      (payment link expiry/revocation)
--   - kyb_applications   (regulatory audit trail)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Add deleted_at columns ───────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE tourist_bookings
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE merchant_products
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE loyalty_rewards
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE payment_links
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE kyb_applications
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- ─── Partial indexes for active (non-deleted) records ─────────────────────────
-- These indexes are used by all queries that filter WHERE deleted_at IS NULL.
-- They are smaller and faster than full-table indexes.

CREATE INDEX IF NOT EXISTS idx_users_active
  ON users (id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_establishments_active
  ON establishments (id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tourist_bookings_active
  ON tourist_bookings (user_id, establishment_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_merchant_products_active
  ON merchant_products (establishment_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_active
  ON loyalty_rewards (id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payment_links_active
  ON payment_links (id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_kyb_applications_active
  ON kyb_applications (establishment_id)
  WHERE deleted_at IS NULL;

-- ─── Soft delete helper function ─────────────────────────────────────────────
-- Convenience function to soft-delete any row in a supported table.
-- Usage: SELECT soft_delete('users', 42);

CREATE OR REPLACE FUNCTION soft_delete(p_table TEXT, p_id BIGINT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format(
    'UPDATE %I SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
    p_table
  ) USING p_id;
END;
$$ LANGUAGE plpgsql;

-- ─── Restore soft-deleted record ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION soft_restore(p_table TEXT, p_id BIGINT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format(
    'UPDATE %I SET deleted_at = NULL WHERE id = $1',
    p_table
  ) USING p_id;
END;
$$ LANGUAGE plpgsql;

-- ─── Purge old soft-deleted records (GDPR compliance) ────────────────────────
-- Permanently deletes records soft-deleted more than p_days days ago.
-- Intended to be called by a scheduled job (e.g., daily at 03:00 UTC).
-- Usage: SELECT purge_deleted_records(30);

CREATE OR REPLACE FUNCTION purge_deleted_records(p_days INT DEFAULT 90)
RETURNS TABLE(table_name TEXT, rows_purged BIGINT) AS $$
DECLARE
  v_table TEXT;
  v_count BIGINT;
  v_cutoff TIMESTAMPTZ := NOW() - (p_days || ' days')::INTERVAL;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'users', 'establishments', 'tourist_bookings',
    'merchant_products', 'loyalty_rewards', 'payment_links', 'kyb_applications'
  ] LOOP
    EXECUTE format(
      'WITH deleted AS (
        DELETE FROM %I WHERE deleted_at IS NOT NULL AND deleted_at < $1 RETURNING 1
      ) SELECT COUNT(*) FROM deleted',
      v_table
    ) INTO v_count USING v_cutoff;

    table_name := v_table;
    rows_purged := v_count;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
