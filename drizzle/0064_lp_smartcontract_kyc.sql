-- Liquidity Provider tables
CREATE TABLE IF NOT EXISTS lp_applications (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  entity_type VARCHAR(20) NOT NULL,
  entity_name VARCHAR(128) NOT NULL,
  registration_country VARCHAR(2) NOT NULL,
  tax_id VARCHAR(64),
  wallet_address VARCHAR(128) NOT NULL,
  intended_pools TEXT,
  intended_deposit_usd DECIMAL(20,2),
  tier VARCHAR(20) NOT NULL DEFAULT 'bronze',
  status VARCHAR(30) NOT NULL DEFAULT 'pending_review',
  notes TEXT,
  reviewed_by VARCHAR(36),
  reviewed_at BIGINT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS lp_providers (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  entity_type VARCHAR(20),
  entity_name VARCHAR(128),
  tier VARCHAR(20) NOT NULL DEFAULT 'bronze',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  wallet_address VARCHAR(128),
  total_deposited DECIMAL(20,6) NOT NULL DEFAULT 0,
  total_earned DECIMAL(20,6) NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS lp_positions (
  id VARCHAR(36) PRIMARY KEY,
  lp_id VARCHAR(36) NOT NULL REFERENCES lp_providers(id),
  user_id VARCHAR(36) NOT NULL,
  pool_id VARCHAR(30) NOT NULL,
  stablecoin VARCHAR(20),
  amount DECIMAL(20,6) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  deposit_tx_hash VARCHAR(128),
  locked_until BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS lp_pos_lp_idx ON lp_positions(lp_id);
CREATE INDEX IF NOT EXISTS lp_pos_pool_idx ON lp_positions(pool_id);

CREATE TABLE IF NOT EXISTS lp_rewards (
  id VARCHAR(36) PRIMARY KEY,
  lp_id VARCHAR(36) NOT NULL REFERENCES lp_providers(id),
  pool_id VARCHAR(30) NOT NULL,
  amount DECIMAL(20,6) NOT NULL,
  period_start BIGINT NOT NULL,
  period_end BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS lp_pool_snapshots (
  id VARCHAR(36) PRIMARY KEY,
  pool_id VARCHAR(30) NOT NULL,
  total_liquidity DECIMAL(20,6) NOT NULL DEFAULT 0,
  lp_count INTEGER NOT NULL DEFAULT 0,
  snapshot_at BIGINT NOT NULL,
  UNIQUE(pool_id, snapshot_at)
);

CREATE TABLE IF NOT EXISTS lp_withdrawals (
  id VARCHAR(36) PRIMARY KEY,
  lp_id VARCHAR(36) NOT NULL REFERENCES lp_providers(id),
  user_id VARCHAR(36) NOT NULL,
  position_id VARCHAR(36) REFERENCES lp_positions(id),
  pool_id VARCHAR(30) NOT NULL,
  amount DECIMAL(20,6) NOT NULL,
  destination_address VARCHAR(128),
  requires_multisig BOOLEAN DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS lp_rebalance_events (
  id VARCHAR(36) PRIMARY KEY,
  from_pool VARCHAR(30) NOT NULL,
  to_pool VARCHAR(30) NOT NULL,
  amount DECIMAL(20,6) NOT NULL,
  initiated_by VARCHAR(36),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at BIGINT NOT NULL
);

-- Smart Contract Deployments
CREATE TABLE IF NOT EXISTS smart_contract_deployments (
  id VARCHAR(36) PRIMARY KEY,
  contract_name VARCHAR(64) NOT NULL,
  network VARCHAR(30) NOT NULL,
  contract_address VARCHAR(128),
  deploy_tx_hash VARCHAR(128),
  version VARCHAR(20),
  abi_hash VARCHAR(128),
  deployer VARCHAR(128),
  supply_cap DECIMAL(20,6),
  mint_cap_per_epoch DECIMAL(20,6),
  burn_cap_per_epoch DECIMAL(20,6),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  audit_report_url VARCHAR(500),
  created_at BIGINT NOT NULL
);

-- Smart Contract Events
CREATE TABLE IF NOT EXISTS smart_contract_events (
  id VARCHAR(36) PRIMARY KEY,
  contract_name VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  tx_hash VARCHAR(128) NOT NULL,
  block_number INTEGER NOT NULL,
  gas_used INTEGER NOT NULL,
  from_address VARCHAR(128),
  to_address VARCHAR(128),
  amount DECIMAL(30,6),
  nonce VARCHAR(128),
  metadata TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sce_event_type_idx ON smart_contract_events(event_type);
CREATE INDEX IF NOT EXISTS sce_contract_idx ON smart_contract_events(contract_name);
CREATE INDEX IF NOT EXISTS sce_created_idx ON smart_contract_events(created_at);

-- KYC Verification Records
CREATE TABLE IF NOT EXISTS kyc_verification_records (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  verification_type VARCHAR(30) NOT NULL,
  document_type VARCHAR(30),
  document_number VARCHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  provider VARCHAR(30),
  provider_ref VARCHAR(128),
  risk_score INTEGER,
  metadata TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT
);
