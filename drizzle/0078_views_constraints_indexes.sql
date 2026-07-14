-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0078: Views, Check Constraints, and Composite Indexes
-- ─────────────────────────────────────────────────────────────────────────────
-- This migration adds:
--   1. Regular PostgreSQL views for analytics and dashboards
--   2. Materialized views for high-frequency aggregations
--   3. Check constraints for data integrity
--   4. Composite indexes for hot-path query optimization
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Regular Views ────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_wallet_summary AS
  SELECT
    wb.user_id,
    COUNT(DISTINCT wb.currency)::int         AS currency_count,
    SUM(wb.balance::numeric)                 AS total_balance_native,
    MAX(wb.updated_at)                       AS last_updated
  FROM wallet_balances wb
  GROUP BY wb.user_id;

CREATE OR REPLACE VIEW v_transaction_stats AS
  SELECT
    DATE(to_timestamp(created_at))           AS tx_date,
    from_currency                            AS currency,
    type,
    status,
    COUNT(*)::int                            AS tx_count,
    SUM(amount::numeric)                     AS total_volume,
    AVG(amount::numeric)                     AS avg_amount,
    MAX(amount::numeric)                     AS max_amount
  FROM wallet_transactions
  WHERE status = 'completed'
  GROUP BY DATE(to_timestamp(created_at)), from_currency, type, status;

CREATE OR REPLACE VIEW v_kyc_status_summary AS
  SELECT
    status,
    document_type,
    COUNT(*)::int                            AS record_count,
    AVG(liveness_score::numeric)             AS avg_liveness_score,
    AVG(document_match_score::numeric)       AS avg_doc_match_score,
    AVG(risk_score::numeric)                 AS avg_risk_score,
    MIN(created_at)                          AS earliest,
    MAX(created_at)                          AS latest
  FROM kyc_verification_records
  GROUP BY status, document_type;

CREATE OR REPLACE VIEW v_establishment_metrics AS
  SELECT
    e.id                                     AS establishment_id,
    e.name                                   AS establishment_name,
    e.type                                   AS establishment_type,
    e.country,
    COUNT(DISTINCT tb.id)::int               AS total_bookings,
    COUNT(DISTINCT CASE WHEN tb.status = 'completed' THEN tb.id END)::int AS completed_bookings,
    COUNT(DISTINCT CASE WHEN tb.status = 'cancelled' THEN tb.id END)::int AS cancelled_bookings,
    SUM(CASE WHEN tb.status = 'completed' THEN tb.price_usd::numeric ELSE 0 END) AS total_revenue_usd,
    AVG(CASE WHEN tb.status = 'completed' THEN tb.price_usd::numeric END) AS avg_booking_value,
    COUNT(DISTINCT tr.id)::int               AS total_reviews,
    AVG(tr.overall_rating::numeric)          AS avg_rating
  FROM establishments e
  LEFT JOIN tourist_bookings tb ON tb.establishment_id = e.id
  LEFT JOIN tourist_reviews tr ON tr.establishment_id = e.id
  GROUP BY e.id, e.name, e.type, e.country;

CREATE OR REPLACE VIEW v_loyalty_leaderboard AS
  SELECT
    la.user_id,
    u.email,
    la.tier,
    la.points_balance,
    la.lifetime_points,
    RANK() OVER (ORDER BY la.lifetime_points DESC)::int AS rank,
    RANK() OVER (PARTITION BY la.tier ORDER BY la.lifetime_points DESC)::int AS tier_rank
  FROM loyalty_accounts la
  JOIN users u ON u.id::text = la.user_id
  WHERE la.leaderboard_opt_out = false;

CREATE OR REPLACE VIEW v_remittance_corridor AS
  SELECT
    sender_currency,
    recipient_currency,
    COUNT(*)::int                            AS transfer_count,
    SUM(sender_amount::numeric)              AS total_sender_volume,
    SUM(recipient_amount::numeric)           AS total_recipient_volume,
    AVG(exchange_rate::numeric)              AS avg_exchange_rate,
    AVG(fee::numeric)                        AS avg_fee,
    MIN(created_at)                          AS first_transfer,
    MAX(created_at)                          AS last_transfer
  FROM remittances
  WHERE status = 'completed'
  GROUP BY sender_currency, recipient_currency
  ORDER BY transfer_count DESC;

CREATE OR REPLACE VIEW v_soc_alert_summary AS
  SELECT
    severity,
    type,
    COUNT(*)::int                            AS alert_count,
    MIN(created_at)                          AS oldest_alert,
    MAX(created_at)                          AS newest_alert
  FROM soc_alerts
  WHERE status = 'open'
  GROUP BY severity, type
  ORDER BY
    CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
    alert_count DESC;

CREATE OR REPLACE VIEW v_booking_occupancy AS
  SELECT
    sa.establishment_id,
    sa.product_id,
    sa.date,
    sa.total_slots,
    sa.booked_slots,
    CASE
      WHEN sa.total_slots > 0
      THEN ROUND((sa.booked_slots::numeric / sa.total_slots::numeric) * 100, 2)
      ELSE 0
    END                                      AS occupancy_pct,
    sa.is_blocked
  FROM service_availability sa
  WHERE sa.date >= CURRENT_DATE - INTERVAL '30 days'
    AND sa.date <= CURRENT_DATE + INTERVAL '30 days';

-- ─── Materialized Views ───────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_revenue AS
  SELECT
    DATE(to_timestamp(wt.created_at))        AS revenue_date,
    wt.from_currency                         AS currency,
    wt.type                                  AS payment_type,
    COUNT(*)::int                            AS transaction_count,
    SUM(wt.amount::numeric)                  AS gross_volume,
    SUM(wt.fee::numeric)                     AS total_fees,
    SUM(wt.amount::numeric) - SUM(wt.fee::numeric) AS net_volume
  FROM wallet_transactions wt
  WHERE wt.status = 'completed'
  GROUP BY DATE(to_timestamp(wt.created_at)), wt.from_currency, wt.type;

-- Unique index required for CONCURRENT refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_revenue_pk
  ON mv_daily_revenue (revenue_date, currency, payment_type);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_user_activity_score AS
  SELECT
    u.id::text                               AS user_id,
    u.email,
    COALESCE(tx.tx_count_30d, 0)            AS tx_count_30d,
    COALESCE(tx.tx_volume_30d, 0)           AS tx_volume_30d,
    COALESCE(la.points_balance, 0)          AS loyalty_points,
    COALESCE(la.tier, 'BRONZE')             AS loyalty_tier,
    COALESCE(bk.booking_count_90d, 0)       AS booking_count_90d,
    LEAST(100, (
      COALESCE(tx.tx_count_30d, 0) * 2
      + LEAST(50, COALESCE(la.points_balance, 0) / 100)
      + COALESCE(bk.booking_count_90d, 0) * 5
    ))::int                                  AS activity_score,
    NOW()                                    AS computed_at
  FROM users u
  LEFT JOIN (
    SELECT
      user_id,
      COUNT(*)::int                          AS tx_count_30d,
      SUM(amount::numeric)                   AS tx_volume_30d
    FROM wallet_transactions
    WHERE status = 'completed'
      AND created_at >= EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days')::int
    GROUP BY user_id
  ) tx ON tx.user_id = u.id::text
  LEFT JOIN loyalty_accounts la ON la.user_id = u.id::text
  LEFT JOIN (
    SELECT
      user_id,
      COUNT(*)::int                          AS booking_count_90d
    FROM tourist_bookings
    WHERE status = 'completed'
      AND created_at >= NOW() - INTERVAL '90 days'
    GROUP BY user_id
  ) bk ON bk.user_id = u.id;

-- Unique index required for CONCURRENT refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_user_activity_pk
  ON mv_user_activity_score (user_id);

-- ─── Check Constraints ────────────────────────────────────────────────────────

DO $$
BEGIN
  -- wallet_balances
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_balances_balance_non_negative') THEN
    ALTER TABLE wallet_balances ADD CONSTRAINT wallet_balances_balance_non_negative CHECK (balance >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_balances_locked_non_negative') THEN
    ALTER TABLE wallet_balances ADD CONSTRAINT wallet_balances_locked_non_negative CHECK (locked_balance >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_balances_locked_lte_balance') THEN
    ALTER TABLE wallet_balances ADD CONSTRAINT wallet_balances_locked_lte_balance CHECK (locked_balance <= balance);
  END IF;

  -- wallet_transactions
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transactions_amount_positive') THEN
    ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_amount_positive CHECK (amount > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transactions_fee_non_negative') THEN
    ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_fee_non_negative CHECK (fee >= 0);
  END IF;

  -- remittances
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'remittances_sender_amount_positive') THEN
    ALTER TABLE remittances ADD CONSTRAINT remittances_sender_amount_positive CHECK (sender_amount > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'remittances_fee_non_negative') THEN
    ALTER TABLE remittances ADD CONSTRAINT remittances_fee_non_negative CHECK (fee >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'remittances_exchange_rate_positive') THEN
    ALTER TABLE remittances ADD CONSTRAINT remittances_exchange_rate_positive CHECK (exchange_rate IS NULL OR exchange_rate > 0);
  END IF;

  -- loyalty_accounts
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_accounts_points_non_negative') THEN
    ALTER TABLE loyalty_accounts ADD CONSTRAINT loyalty_accounts_points_non_negative CHECK (points_balance >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_accounts_lifetime_non_negative') THEN
    ALTER TABLE loyalty_accounts ADD CONSTRAINT loyalty_accounts_lifetime_non_negative CHECK (lifetime_points >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_accounts_lifetime_gte_balance') THEN
    ALTER TABLE loyalty_accounts ADD CONSTRAINT loyalty_accounts_lifetime_gte_balance CHECK (lifetime_points >= points_balance);
  END IF;

  -- tourist_bookings
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tourist_bookings_price_non_negative') THEN
    ALTER TABLE tourist_bookings ADD CONSTRAINT tourist_bookings_price_non_negative CHECK (price_usd >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tourist_bookings_party_size_positive') THEN
    ALTER TABLE tourist_bookings ADD CONSTRAINT tourist_bookings_party_size_positive CHECK (party_size >= 1);
  END IF;

  -- merchant_products
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'merchant_products_price_non_negative') THEN
    ALTER TABLE merchant_products ADD CONSTRAINT merchant_products_price_non_negative CHECK (price >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'merchant_products_sort_order_non_negative') THEN
    ALTER TABLE merchant_products ADD CONSTRAINT merchant_products_sort_order_non_negative CHECK (sort_order >= 0);
  END IF;
END $$;

-- ─── Composite Indexes ────────────────────────────────────────────────────────

-- Wallet transaction history: user + status + time (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_status_created
  ON wallet_transactions (user_id, status, created_at DESC);

-- Wallet transaction idempotency lookup by reference
CREATE INDEX IF NOT EXISTS idx_wallet_tx_reference
  ON wallet_transactions (reference)
  WHERE reference IS NOT NULL;

-- Booking list by user + status
CREATE INDEX IF NOT EXISTS idx_tourist_bookings_user_status
  ON tourist_bookings (user_id, status);

-- Booking calendar view: establishment + date
CREATE INDEX IF NOT EXISTS idx_tourist_bookings_est_date
  ON tourist_bookings (establishment_id, booking_date DESC);

-- Remittance history: user + status + time
CREATE INDEX IF NOT EXISTS idx_remittances_user_status_created
  ON remittances (user_id, status, created_at DESC);

-- Loyalty transaction history: user + time
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_user_created
  ON loyalty_transactions (user_id, created_at DESC);

-- Audit log: entity lookup (most common admin query)
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON audit_logs (entity_type, entity_id);

-- Audit log: actor activity
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created
  ON audit_logs (actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;
