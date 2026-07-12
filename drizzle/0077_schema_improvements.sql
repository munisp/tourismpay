-- Migration: 0077_schema_improvements.sql
-- Purpose: Add check constraints, composite indexes, new enum types, and
--          performance-critical indexes identified in the schema audit.
-- Author:  Manus AI
-- Date:    2026-07-12

-- ─── New PostgreSQL Enum Types ────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE wallet_tx_direction AS ENUM ('credit', 'debit');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE enaira_wallet_status AS ENUM ('active', 'frozen', 'suspended', 'closed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE enaira_transaction_type AS ENUM (
    'tourist_load', 'merchant_payment', 'peer_transfer',
    'withdrawal', 'reversal', 'fee'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE temporal_workflow_status AS ENUM (
    'running', 'completed', 'failed', 'cancelled',
    'terminated', 'continued_as_new', 'timed_out'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE tax_collection_status AS ENUM (
    'pending', 'collected', 'remitted', 'disputed', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE kyb_application_status AS ENUM (
    'draft', 'submitted', 'under_review', 'approved', 'rejected', 'suspended'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE bis_investigation_status AS ENUM (
    'open', 'in_progress', 'escalated', 'resolved', 'closed'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE trip_message_role AS ENUM ('user', 'assistant', 'system');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE tip_distribution_status AS ENUM (
    'pending', 'distributed', 'failed', 'reversed'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE wire_transfer_status AS ENUM (
    'initiated', 'pending_confirmation', 'confirmed', 'settled', 'failed', 'recalled'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE fraud_alert_severity AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE fluvio_offset_status AS ENUM ('active', 'paused', 'lagging', 'stalled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── Check Constraints ────────────────────────────────────────────────────────

-- eNaira Wallets: balance cannot be negative
ALTER TABLE enaira_wallets
  ADD CONSTRAINT chk_enaira_wallet_balance_non_negative
  CHECK (balance_kobo >= 0);

-- eNaira Wallets: daily limit must be positive
ALTER TABLE enaira_wallets
  ADD CONSTRAINT chk_enaira_wallet_daily_limit_positive
  CHECK (daily_limit_kobo > 0);

-- eNaira Transactions: amount must be positive
ALTER TABLE enaira_transactions
  ADD CONSTRAINT chk_enaira_tx_amount_positive
  CHECK (amount_kobo > 0);

-- eNaira Wallets: KYC tier must be 1, 2, or 3
ALTER TABLE enaira_wallets
  ADD CONSTRAINT chk_enaira_wallet_kyc_tier
  CHECK (kyc_tier IN (1, 2, 3));

-- Tip transactions: amount must be positive
ALTER TABLE tip_transactions
  ADD CONSTRAINT chk_tip_amount_positive
  CHECK (amount_kobo > 0);

-- Tax collections: amount must be positive
ALTER TABLE tax_collections
  ADD CONSTRAINT chk_tax_amount_positive
  CHECK (amount_kobo > 0);

-- Tax collections: tax rate must be between 0 and 1
ALTER TABLE tax_collections
  ADD CONSTRAINT chk_tax_rate_range
  CHECK (tax_rate >= 0 AND tax_rate <= 1);

-- Loyalty transactions: points must be non-zero
ALTER TABLE loyalty_transactions
  ADD CONSTRAINT chk_loyalty_points_nonzero
  CHECK (points != 0);

-- Wire transfer orders: amount must be positive
ALTER TABLE wire_transfer_orders
  ADD CONSTRAINT chk_wire_transfer_amount_positive
  CHECK (amount_kobo > 0);

-- Agent float balances: balance cannot be negative
ALTER TABLE agent_float_balances
  ADD CONSTRAINT chk_agent_float_non_negative
  CHECK (balance_kobo >= 0);

-- Users: login count cannot be negative
ALTER TABLE users
  ADD CONSTRAINT chk_users_login_count_non_negative
  CHECK (login_count >= 0);

-- ─── Composite Performance Indexes ───────────────────────────────────────────

-- eNaira transactions: wallet + created_at for history queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enaira_tx_wallet_created
  ON enaira_transactions (enaira_wallet_id, created_at DESC);

-- eNaira transactions: transaction type + status for reporting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enaira_tx_type_status
  ON enaira_transactions (transaction_type, status);

-- Temporal workflow executions: workflow type + status for monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_temporal_wf_type_status
  ON temporal_workflow_executions (workflow_type, status);

-- Temporal workflow executions: started_at for time-range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_temporal_wf_started_at
  ON temporal_workflow_executions (started_at DESC);

-- Tax collections: user + created_at for tax history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tax_collections_user_created
  ON tax_collections (user_id, created_at DESC);

-- Tax remittance tracker: status + remittance_date for government reports
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tax_remittance_status_date
  ON tax_remittance_tracker (status, remittance_date DESC);

-- Tip transactions: recipient + created_at for earnings history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tip_tx_recipient_created
  ON tip_transactions (recipient_id, created_at DESC);

-- Trip planner messages: session + created_at for conversation history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trip_msg_session_created
  ON trip_planner_messages (session_id, created_at ASC);

-- Audit logs: user + created_at for user activity timeline
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_created
  ON audit_logs (user_id, created_at DESC);

-- Audit logs: entity_type + entity_id for entity-level audit trail
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_entity
  ON audit_logs (entity_type, entity_id, created_at DESC);

-- Fraud alerts: severity + status for triage dashboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fraud_alerts_severity_status
  ON fraud_alerts (severity, status, created_at DESC);

-- Wire transfer orders: user + status for user's transfer history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wire_transfer_user_status
  ON wire_transfer_orders (user_id, status);

-- Loyalty transactions: account + created_at for points history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loyalty_tx_account_created
  ON loyalty_transactions (loyalty_account_id, created_at DESC);

-- Virtual card transactions: card + created_at for card statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vcard_tx_card_created
  ON virtual_card_transactions (virtual_card_id, created_at DESC);

-- Fluvio consumer offsets: topic + partition for offset tracking
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_fluvio_offsets_topic_partition
  ON fluvio_consumer_offsets (topic, partition_id);

-- Lakehouse ETL runs: table_name + started_at for ETL monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lakehouse_etl_table_started
  ON lakehouse_etl_runs (table_name, started_at DESC);

-- OpenAppSec WAF events: severity + created_at for security monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_waf_events_severity_created
  ON openappsec_waf_events (severity, created_at DESC);

-- Keycloak session tokens: user + expires_at for session management
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_keycloak_tokens_user_expires
  ON keycloak_session_tokens (user_id, expires_at);

-- KYB applications: status + submitted_at for review queue
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kyb_status_submitted
  ON kyb_applications (status, submitted_at DESC);

-- BIS investigations: status + created_at for investigation queue
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bis_status_created
  ON bis_investigations (status, created_at DESC);

-- Agent cash load orders: agent + status for agent dashboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cash_load_agent_status
  ON cash_load_orders (agent_id, status);

-- GDS demand forecasts: destination + forecast_date for planning
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gds_forecast_dest_date
  ON gds_demand_forecasts (destination_code, forecast_date DESC);

-- ─── Partial Indexes for Hot Query Paths ─────────────────────────────────────

-- Active eNaira wallets only (most queries filter on status = 'active')
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enaira_wallets_active
  ON enaira_wallets (user_id)
  WHERE status = 'active';

-- Pending tax remittances (government remittance processing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tax_remittance_pending
  ON tax_remittance_tracker (remittance_date)
  WHERE status = 'pending';

-- Open BIS investigations (analyst dashboard)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bis_open_investigations
  ON bis_investigations (created_at DESC)
  WHERE status IN ('open', 'in_progress', 'escalated');

-- Unread user notifications
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_unread
  ON user_notifications (user_id, created_at DESC)
  WHERE read = false;

-- Running Temporal workflows (monitoring dashboard)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_temporal_running
  ON temporal_workflow_executions (started_at DESC)
  WHERE status = 'running';

-- Active Keycloak sessions (auth middleware)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_keycloak_active_sessions
  ON keycloak_session_tokens (user_id)
  WHERE revoked = false AND expires_at > NOW();

-- ─── Full-Text Search Indexes ─────────────────────────────────────────────────

-- Trip planner messages: full-text search on content
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trip_msg_content_fts
  ON trip_planner_messages
  USING gin(to_tsvector('english', content));

-- Fraud alerts: full-text search on description
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fraud_alerts_desc_fts
  ON fraud_alerts
  USING gin(to_tsvector('english', description));

-- Audit logs: full-text search on action + metadata
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_action_fts
  ON audit_logs
  USING gin(to_tsvector('english', action));
