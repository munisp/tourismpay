-- Foreign Tourist Wallet Loading — 4 gaps implementation
-- Tables for SWIFT wire transfers, agent banking, partner remittance, and USSD sessions

-- ─── 1. SWIFT / SEPA / ACH Wire Transfers ──────────────────────────────────

CREATE TABLE IF NOT EXISTS wire_transfer_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending_collection',
  source_currency TEXT NOT NULL,
  source_amount NUMERIC(20,2) NOT NULL,
  target_currency TEXT NOT NULL,
  target_amount NUMERIC(20,2) NOT NULL,
  wire_rail TEXT NOT NULL,
  collection_ref TEXT NOT NULL UNIQUE,
  swift_ref TEXT,
  sender_name TEXT NOT NULL,
  sender_iban TEXT,
  sender_bic TEXT,
  sender_routing_number TEXT,
  sender_account_number TEXT,
  sender_country TEXT NOT NULL,
  recipient_wallet_id TEXT NOT NULL,
  exchange_rate NUMERIC(20,8) NOT NULL,
  fee NUMERIC(20,2) NOT NULL,
  fee_percent NUMERIC(5,2) NOT NULL,
  travel_rule_data JSONB,
  kyc_tier INTEGER NOT NULL DEFAULT 1,
  fraud_score NUMERIC(5,4) DEFAULT 0,
  created_at BIGINT NOT NULL,
  settled_at BIGINT,
  credited_at BIGINT,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wire_transfer_orders_user_id ON wire_transfer_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_wire_transfer_orders_status ON wire_transfer_orders(status);
CREATE INDEX IF NOT EXISTS idx_wire_transfer_orders_collection_ref ON wire_transfer_orders(collection_ref);
CREATE INDEX IF NOT EXISTS idx_wire_transfer_orders_wire_rail ON wire_transfer_orders(wire_rail);

-- ─── 2. Agent Banking / Airport Kiosk ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tier TEXT NOT NULL,
  location TEXT NOT NULL,
  country TEXT NOT NULL,
  license_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  daily_limit_usd NUMERIC(12,2) NOT NULL DEFAULT 50000,
  daily_used_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_percent NUMERIC(5,2) NOT NULL DEFAULT 0.3,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_float_balances (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  currency TEXT NOT NULL,
  balance NUMERIC(20,2) NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL,
  UNIQUE(agent_id, currency)
);

CREATE TABLE IF NOT EXISTS cash_load_orders (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  tourist_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending_kyc',
  cash_currency TEXT NOT NULL,
  cash_amount NUMERIC(20,2) NOT NULL,
  wallet_currency TEXT NOT NULL,
  wallet_amount NUMERIC(20,2) NOT NULL,
  exchange_rate NUMERIC(20,8) NOT NULL,
  fee NUMERIC(20,2) NOT NULL,
  agent_commission NUMERIC(20,2) NOT NULL,
  passport_number_hash TEXT,
  passport_country TEXT,
  kyc_tier INTEGER NOT NULL DEFAULT 1,
  receipt_code TEXT NOT NULL UNIQUE,
  created_at BIGINT NOT NULL,
  completed_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_cash_load_orders_agent_id ON cash_load_orders(agent_id);
CREATE INDEX IF NOT EXISTS idx_cash_load_orders_tourist_user_id ON cash_load_orders(tourist_user_id);
CREATE INDEX IF NOT EXISTS idx_cash_load_orders_status ON cash_load_orders(status);
CREATE INDEX IF NOT EXISTS idx_cash_load_orders_receipt_code ON cash_load_orders(receipt_code);
CREATE INDEX IF NOT EXISTS idx_agents_country ON agents(country);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);

-- ─── 3. Partner Remittance (Wise, Revolut, Remitly, LemFi) ─────────────────

CREATE TABLE IF NOT EXISTS partner_quotes (
  id TEXT PRIMARY KEY,
  partner TEXT NOT NULL,
  source_currency TEXT NOT NULL,
  source_amount NUMERIC(20,2) NOT NULL,
  target_currency TEXT NOT NULL,
  target_amount NUMERIC(20,2) NOT NULL,
  exchange_rate NUMERIC(20,8) NOT NULL,
  fee NUMERIC(20,2) NOT NULL,
  partner_fee NUMERIC(20,2) NOT NULL,
  redirect_url TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS partner_transfers (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES partner_quotes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  partner TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'initiated',
  source_currency TEXT NOT NULL,
  source_amount NUMERIC(20,2) NOT NULL,
  target_currency TEXT NOT NULL,
  target_amount NUMERIC(20,2) NOT NULL,
  exchange_rate NUMERIC(20,8) NOT NULL,
  fee NUMERIC(20,2) NOT NULL,
  partner_fee NUMERIC(20,2) NOT NULL,
  partner_ref TEXT NOT NULL,
  payment_url TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  wallet_tx_id TEXT,
  created_at BIGINT NOT NULL,
  settled_at BIGINT,
  credited_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_partner_transfers_user_id ON partner_transfers(user_id);
CREATE INDEX IF NOT EXISTS idx_partner_transfers_status ON partner_transfers(status);
CREATE INDEX IF NOT EXISTS idx_partner_transfers_partner ON partner_transfers(partner);
CREATE INDEX IF NOT EXISTS idx_partner_transfers_partner_ref ON partner_transfers(partner_ref);

-- ─── 4. USSD Sessions ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ussd_sessions (
  id TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL,
  user_id TEXT,
  state TEXT NOT NULL DEFAULT 'main_menu',
  data JSONB DEFAULT '{}',
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  completed_at BIGINT
);

CREATE TABLE IF NOT EXISTS ussd_transactions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id TEXT NOT NULL REFERENCES ussd_sessions(id),
  user_id TEXT,
  type TEXT NOT NULL,
  currency TEXT,
  amount NUMERIC(20,2),
  status TEXT NOT NULL DEFAULT 'completed',
  reference TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ussd_sessions_phone_number ON ussd_sessions(phone_number);
CREATE INDEX IF NOT EXISTS idx_ussd_sessions_user_id ON ussd_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ussd_transactions_session_id ON ussd_transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_ussd_transactions_user_id ON ussd_transactions(user_id);

-- ─── 5. Agent KYC Verifications ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_kyc_verifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_id TEXT NOT NULL,
  tourist_user_id TEXT NOT NULL REFERENCES users(id),
  approved_tier INTEGER NOT NULL,
  daily_limit_usd NUMERIC(12,2) NOT NULL,
  passport_valid BOOLEAN NOT NULL,
  passport_expired BOOLEAN NOT NULL DEFAULT false,
  sanctions_clear BOOLEAN NOT NULL,
  pep_clear BOOLEAN NOT NULL DEFAULT true,
  risk_score NUMERIC(5,4) NOT NULL,
  risk_level TEXT NOT NULL,
  passport_country TEXT NOT NULL,
  verified_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_kyc_tourist_user_id ON agent_kyc_verifications(tourist_user_id);
CREATE INDEX IF NOT EXISTS idx_agent_kyc_agent_id ON agent_kyc_verifications(agent_id);
