-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0081: Comprehensive optimized indexes for all critical tables
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Transactions (most queried table) ───────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_user_id ON transactions (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_status ON transactions (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_created_at ON transactions (created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_type ON transactions (type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_reference ON transactions (reference);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_user_created ON transactions (user_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_status_created ON transactions (status, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_amount ON transactions (amount);

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_phone ON users (phone);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_keycloak_sub ON users (keycloak_sub) WHERE keycloak_sub IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created_at ON users (created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role ON users (role);

-- ─── Agents ───────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agents_user_id ON agents (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agents_status ON agents (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agents_tier ON agents (tier);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agents_supervisor_id ON agents (supervisor_id) WHERE supervisor_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agents_region_id ON agents (region_id) WHERE region_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agents_keycloak_sub ON agents (keycloak_sub) WHERE keycloak_sub IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agents_location ON agents USING GIN (location gin_trgm_ops) WHERE location IS NOT NULL;

-- ─── Wallet Balances ──────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_balances_user_id ON wallet_balances (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_balances_currency ON wallet_balances (currency);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_balances_user_currency ON wallet_balances (user_id, currency);

-- ─── Wallet Transactions ──────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_transactions_type ON wallet_transactions (type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_transactions_status ON wallet_transactions (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions (created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_transactions_reference ON wallet_transactions (reference) WHERE reference IS NOT NULL;

-- ─── Establishments ───────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_establishments_owner_id ON establishments (owner_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_establishments_status ON establishments (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_establishments_kyb_status ON establishments (kyb_status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_establishments_business_type ON establishments (business_type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_establishments_deleted_at ON establishments (deleted_at) WHERE deleted_at IS NULL;

-- ─── Tourist Bookings ─────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tourist_bookings_user_id ON tourist_bookings (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tourist_bookings_establishment_id ON tourist_bookings (establishment_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tourist_bookings_status ON tourist_bookings (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tourist_bookings_check_in ON tourist_bookings (check_in);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tourist_bookings_created_at ON tourist_bookings (created_at DESC);

-- ─── Fraud Alerts ─────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fraud_alerts_status ON fraud_alerts (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fraud_alerts_user_id ON fraud_alerts (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fraud_alerts_created_at ON fraud_alerts (created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fraud_alerts_risk_level ON fraud_alerts (risk_level);

-- ─── Fraud Rules ──────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fraud_rules_type ON fraud_rules (rule_type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fraud_rules_active ON fraud_rules (is_active);

-- ─── KYB Applications ────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kyb_applications_user_id ON kyb_applications (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kyb_applications_status ON kyb_applications (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kyb_applications_created_at ON kyb_applications (created_at DESC);

-- ─── Audit Logs ───────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs (entity_type);

-- ─── AI Conversations ─────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_conversations_user_id ON ai_conversations (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_conversations_session_id ON ai_conversations (session_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_conversations_created_at ON ai_conversations (created_at DESC);

-- ─── Ledger Transfers ─────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_transfers_debit_account ON ledger_transfers (debit_account_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_transfers_credit_account ON ledger_transfers (credit_account_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_transfers_status ON ledger_transfers (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_transfers_created_at ON ledger_transfers (created_at DESC);

-- ─── Loyalty Accounts ─────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loyalty_accounts_user_id ON loyalty_accounts (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loyalty_transactions_account_id ON loyalty_transactions (account_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loyalty_transactions_created_at ON loyalty_transactions (created_at DESC);

-- ─── Commission Payouts ───────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commission_payouts_agent_id ON commission_payouts (agent_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commission_payouts_status ON commission_payouts (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commission_payouts_period ON commission_payouts (period);

-- ─── Notifications ────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_notifications_user_id ON user_notifications (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_notifications_read ON user_notifications (is_read);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_notifications_created_at ON user_notifications (created_at DESC);

-- ─── Settlement ───────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_settlement_batches_status ON settlement_batches (status) WHERE status IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_settlement_batches_created_at ON settlement_batches (created_at DESC) WHERE created_at IS NOT NULL;

-- ─── Temporal Workflow Executions ─────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_temporal_workflow_status ON temporal_workflow_executions (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_temporal_workflow_type ON temporal_workflow_executions (workflow_type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_temporal_workflow_created_at ON temporal_workflow_executions (created_at DESC);

-- ─── Fluvio Consumer Offsets ──────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fluvio_offsets_topic ON fluvio_consumer_offsets (topic);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fluvio_offsets_consumer ON fluvio_consumer_offsets (consumer_group);

-- ─── Lakehouse ETL Runs ───────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lakehouse_etl_status ON lakehouse_etl_runs (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lakehouse_etl_created_at ON lakehouse_etl_runs (created_at DESC);

-- ─── OpenAppSec WAF Events ────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_openappsec_waf_severity ON openappsec_waf_events (severity);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_openappsec_waf_created_at ON openappsec_waf_events (created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_openappsec_waf_ip ON openappsec_waf_events (source_ip) WHERE source_ip IS NOT NULL;

-- ─── Keycloak Session Tokens ──────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_keycloak_sessions_user_id ON keycloak_session_tokens (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_keycloak_sessions_expires_at ON keycloak_session_tokens (expires_at);

-- ─── APISIX Route Registry ────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_apisix_routes_status ON apisix_route_registry (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_apisix_routes_path ON apisix_route_registry (path);

-- ─── Dapr State Entries ───────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dapr_state_app_id ON dapr_state_entries (app_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dapr_state_key ON dapr_state_entries (state_key);

-- ─── Partial indexes for performance ─────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_pending ON transactions (created_at DESC) WHERE status = 'pending';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_failed ON transactions (created_at DESC) WHERE status = 'failed';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agents_active ON agents (created_at DESC) WHERE status = 'active' AND deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_establishments_approved ON establishments (created_at DESC) WHERE kyb_status = 'approved' AND deleted_at IS NULL;
