-- Stablecoin feature completeness: recurring buys, price alerts, travel rule, disputes, user freezes

CREATE TABLE IF NOT EXISTS stablecoin_recurring_buys (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  source_currency VARCHAR(10) NOT NULL,
  source_amount VARCHAR(30) NOT NULL,
  target_stablecoin VARCHAR(20) NOT NULL,
  payment_rail VARCHAR(30) NOT NULL,
  frequency VARCHAR(20) NOT NULL,
  day_of_week INTEGER,
  day_of_month INTEGER,
  next_execution_at BIGINT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  total_executed INTEGER NOT NULL DEFAULT 0,
  total_spent VARCHAR(30) NOT NULL DEFAULT '0',
  created_at BIGINT NOT NULL,
  updated_at BIGINT
);

CREATE TABLE IF NOT EXISTS stablecoin_price_alerts (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  stablecoin VARCHAR(20) NOT NULL,
  fiat_currency VARCHAR(10) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  target_rate VARCHAR(30) NOT NULL,
  current_rate_at_creation VARCHAR(30),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  triggered_at BIGINT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS stablecoin_travel_rule_records (
  id VARCHAR(36) PRIMARY KEY,
  transaction_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  originator_name VARCHAR(255) NOT NULL,
  originator_account VARCHAR(128) NOT NULL,
  originator_country VARCHAR(2) NOT NULL,
  originator_id_type VARCHAR(30) NOT NULL,
  originator_id_number VARCHAR(64) NOT NULL,
  beneficiary_name VARCHAR(255) NOT NULL,
  beneficiary_account VARCHAR(128) NOT NULL,
  beneficiary_country VARCHAR(2) NOT NULL,
  beneficiary_institution VARCHAR(255),
  sanctions_screened BOOLEAN NOT NULL DEFAULT false,
  sanctions_result VARCHAR(30),
  sanctions_provider VARCHAR(64),
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS stablecoin_disputes (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  transaction_id VARCHAR(36) NOT NULL,
  transaction_type VARCHAR(20) NOT NULL,
  reason VARCHAR(50) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  resolution_notes TEXT,
  resolved_by VARCHAR(36),
  resolved_at BIGINT,
  refund_amount VARCHAR(30),
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS stablecoin_user_freezes (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  action VARCHAR(20) NOT NULL,
  reason TEXT NOT NULL,
  initiated_by VARCHAR(36) NOT NULL,
  created_at BIGINT NOT NULL
);
