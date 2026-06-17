-- Migration: 0069_travel_readiness_gaps
-- Addresses all 28 blocking scenarios for tourist wallet loading and payments
-- New tables: bank notifications, eSIM orders, expanded agent kiosks, currency corridors,
--   pre-travel checklists, KYC fast-track history, offline token renewals, country risk cache

-- ─── Bank Travel Notifications ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_travel_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  bank_id TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  card_last4 TEXT,
  destination_country TEXT NOT NULL,
  travel_start TEXT NOT NULL,
  travel_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, confirmed, failed
  channel TEXT NOT NULL DEFAULT 'api', -- api, email, sms, manual
  sent_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);
CREATE INDEX IF NOT EXISTS idx_bank_notify_user ON bank_travel_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_notify_status ON bank_travel_notifications(status);

-- ─── eSIM Orders ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS esim_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  package_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  country TEXT NOT NULL,
  data_gb REAL NOT NULL,
  valid_days INTEGER NOT NULL,
  price_usd REAL NOT NULL,
  qr_code_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, activated, expired, refunded
  activated_at BIGINT,
  expires_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);
CREATE INDEX IF NOT EXISTS idx_esim_user ON esim_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_esim_status ON esim_orders(status);

-- ─── Expanded Agent Kiosk Registry ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_kiosk_registry (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  airport_code TEXT,
  type TEXT NOT NULL, -- airport, hotel, mall, bureau_de_change
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  operating_hours TEXT,
  accepted_currencies TEXT[] NOT NULL DEFAULT '{}',
  max_tier_limit INTEGER NOT NULL DEFAULT 1,
  has_esim_vending BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active', -- active, maintenance, closed
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);
CREATE INDEX IF NOT EXISTS idx_kiosk_country ON agent_kiosk_registry(country);
CREATE INDEX IF NOT EXISTS idx_kiosk_status ON agent_kiosk_registry(status);
CREATE INDEX IF NOT EXISTS idx_kiosk_type ON agent_kiosk_registry(type);

-- ─── Currency Corridor Config ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS currency_corridors (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  symbol TEXT NOT NULL,
  rate_to_usd REAL NOT NULL,
  onramp_rails TEXT[] NOT NULL DEFAULT '{}',
  min_amount_usd REAL NOT NULL DEFAULT 1,
  max_amount_usd REAL NOT NULL DEFAULT 50000,
  settlement_time_ms BIGINT NOT NULL DEFAULT 60000,
  fee_percent REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'active', -- active, coming_soon, restricted
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);
CREATE INDEX IF NOT EXISTS idx_corridor_status ON currency_corridors(status);

-- ─── Pre-Travel Checklists ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pre_travel_checklists (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  destination TEXT NOT NULL,
  departure_date TEXT NOT NULL,
  checklist_data JSONB NOT NULL DEFAULT '{}',
  completion_percent REAL NOT NULL DEFAULT 0,
  ready_to_travel BOOLEAN NOT NULL DEFAULT false,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000),
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);
CREATE INDEX IF NOT EXISTS idx_checklist_user ON pre_travel_checklists(user_id);

-- ─── KYC Fast-Track History ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kyc_fast_track_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  previous_tier INTEGER NOT NULL,
  new_tier INTEGER NOT NULL,
  new_daily_limit_usd REAL NOT NULL,
  upgrade_reason TEXT NOT NULL,
  requirements_met TEXT[] NOT NULL DEFAULT '{}',
  requirements_missing TEXT[] NOT NULL DEFAULT '{}',
  nationality TEXT NOT NULL,
  passport_hash TEXT NOT NULL,
  verified_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);
CREATE INDEX IF NOT EXISTS idx_kyc_ft_user ON kyc_fast_track_history(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_ft_tier ON kyc_fast_track_history(new_tier);

-- ─── Offline Token Renewals ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offline_token_renewals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  renewed_from TEXT NOT NULL, -- original expired token ID
  amount_usd REAL NOT NULL,
  currency TEXT NOT NULL,
  merchant_id TEXT,
  qr_payload TEXT NOT NULL,
  valid_minutes INTEGER NOT NULL DEFAULT 30,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000),
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_token_renew_user ON offline_token_renewals(user_id);
CREATE INDEX IF NOT EXISTS idx_token_renew_expires ON offline_token_renewals(expires_at);

-- ─── Country Risk Cache ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS country_risk_cache (
  country_code TEXT PRIMARY KEY,
  country_name TEXT NOT NULL,
  risk_level TEXT NOT NULL, -- low, medium, high, very_high
  sanctions_status TEXT NOT NULL DEFAULT 'clear', -- clear, restricted, sanctioned
  travel_advisory TEXT,
  max_kyc_tier INTEGER NOT NULL DEFAULT 3,
  daily_limit_usd REAL NOT NULL DEFAULT 10000,
  requires_edd BOOLEAN NOT NULL DEFAULT false,
  available_rails TEXT[] NOT NULL DEFAULT '{}',
  restrictions TEXT[] NOT NULL DEFAULT '{}',
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

-- ─── Travel Risk Assessments ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS travel_risk_assessments (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  origin_country TEXT NOT NULL,
  destination_country TEXT NOT NULL,
  risk_score REAL NOT NULL,
  risk_level TEXT NOT NULL,
  card_block_probability REAL NOT NULL,
  warnings JSONB NOT NULL DEFAULT '[]',
  recommendations JSONB NOT NULL DEFAULT '[]',
  loading_strategy JSONB NOT NULL DEFAULT '[]',
  assessed_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);
CREATE INDEX IF NOT EXISTS idx_risk_assess_user ON travel_risk_assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_risk_assess_dest ON travel_risk_assessments(destination_country);

-- ─── Gap Resolution Audit Trail ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gap_resolution_log (
  id SERIAL PRIMARY KEY,
  gap_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'fixed',
  fix_description TEXT NOT NULL,
  implemented_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);
CREATE INDEX IF NOT EXISTS idx_gap_status ON gap_resolution_log(status);
CREATE INDEX IF NOT EXISTS idx_gap_severity ON gap_resolution_log(severity);
