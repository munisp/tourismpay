-- Migration 0071: Tipping & Tax Collection System
-- Supports multi-jurisdiction tipping with pool distribution
-- and jurisdiction-specific tax calculation, collection, and remittance tracking.

-- ─── Tipping Tables ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tip_transactions (
    id VARCHAR(36) PRIMARY KEY,
    payer_id VARCHAR(36) NOT NULL,
    recipient_id VARCHAR(36),
    establishment_id INTEGER,
    transaction_ref VARCHAR(100),
    bill_amount DECIMAL(18,2) NOT NULL,
    tip_amount DECIMAL(18,2) NOT NULL,
    tip_type VARCHAR(20) NOT NULL,  -- 'percentage', 'flat', 'round_up'
    tip_percentage DECIMAL(5,2) DEFAULT 0,
    tax_on_tip DECIMAL(18,2) DEFAULT 0,
    net_tip DECIMAL(18,2) NOT NULL,
    currency VARCHAR(5) NOT NULL,
    jurisdiction_code VARCHAR(2) NOT NULL,
    distribution_type VARCHAR(20) NOT NULL DEFAULT 'direct',  -- 'direct', 'pool'
    message VARCHAR(200),
    status VARCHAR(20) NOT NULL DEFAULT 'completed',
    created_at BIGINT NOT NULL
);

CREATE INDEX idx_tip_payer ON tip_transactions(payer_id);
CREATE INDEX idx_tip_recipient ON tip_transactions(recipient_id);
CREATE INDEX idx_tip_establishment ON tip_transactions(establishment_id);
CREATE INDEX idx_tip_jurisdiction ON tip_transactions(jurisdiction_code);
CREATE INDEX idx_tip_status ON tip_transactions(status);
CREATE INDEX idx_tip_created ON tip_transactions(created_at DESC);

CREATE TABLE IF NOT EXISTS tip_distribution_log (
    id VARCHAR(36) PRIMARY KEY,
    tip_id VARCHAR(36) NOT NULL REFERENCES tip_transactions(id),
    role VARCHAR(50) NOT NULL,
    amount DECIMAL(18,2) NOT NULL,
    percentage DECIMAL(5,2) NOT NULL,
    recipient_staff_id VARCHAR(36),
    created_at BIGINT NOT NULL
);

CREATE INDEX idx_tip_dist_tip_id ON tip_distribution_log(tip_id);
CREATE INDEX idx_tip_dist_role ON tip_distribution_log(role);

CREATE TABLE IF NOT EXISTS tip_configs (
    id VARCHAR(36) PRIMARY KEY,
    establishment_id INTEGER NOT NULL UNIQUE,
    jurisdiction_code VARCHAR(2) NOT NULL,
    custom_percentages TEXT DEFAULT '[]',
    distribution_type VARCHAR(20) NOT NULL DEFAULT 'pool',
    pool_split_rules TEXT DEFAULT '[]',
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE INDEX idx_tip_config_establishment ON tip_configs(establishment_id);
CREATE INDEX idx_tip_config_jurisdiction ON tip_configs(jurisdiction_code);

-- ─── Tax Collection Tables ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tax_collections (
    id VARCHAR(36) PRIMARY KEY,
    tax_record_id VARCHAR(36) NOT NULL,
    transaction_id VARCHAR(100) NOT NULL,
    jurisdiction_code VARCHAR(2) NOT NULL,
    tax_type VARCHAR(30) NOT NULL,
    tax_name VARCHAR(100) NOT NULL,
    rate DECIMAL(6,3) NOT NULL,
    taxable_base DECIMAL(18,2) NOT NULL,
    amount DECIMAL(18,2) NOT NULL,
    currency VARCHAR(5) NOT NULL,
    merchant_id VARCHAR(36) NOT NULL,
    category VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'collected',
    created_at BIGINT NOT NULL
);

CREATE INDEX idx_tax_coll_transaction ON tax_collections(transaction_id);
CREATE INDEX idx_tax_coll_jurisdiction ON tax_collections(jurisdiction_code);
CREATE INDEX idx_tax_coll_merchant ON tax_collections(merchant_id);
CREATE INDEX idx_tax_coll_tax_type ON tax_collections(tax_type);
CREATE INDEX idx_tax_coll_period ON tax_collections(created_at DESC);
CREATE INDEX idx_tax_coll_status ON tax_collections(status);
CREATE INDEX idx_tax_coll_record ON tax_collections(tax_record_id);

CREATE TABLE IF NOT EXISTS tax_remittance_tracker (
    id VARCHAR(36) PRIMARY KEY,
    jurisdiction_code VARCHAR(2) NOT NULL,
    tax_type VARCHAR(30) NOT NULL,
    period VARCHAR(10) NOT NULL,  -- '2025-07' or '2025-Q3'
    total_collected DECIMAL(18,2) NOT NULL DEFAULT 0,
    total_remitted DECIMAL(18,2) NOT NULL DEFAULT 0,
    currency VARCHAR(5) NOT NULL,
    transaction_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, filed, remitted, overdue
    updated_at BIGINT NOT NULL,
    UNIQUE(jurisdiction_code, tax_type, period)
);

CREATE INDEX idx_tax_remit_jurisdiction ON tax_remittance_tracker(jurisdiction_code);
CREATE INDEX idx_tax_remit_period ON tax_remittance_tracker(period);
CREATE INDEX idx_tax_remit_status ON tax_remittance_tracker(status);

CREATE TABLE IF NOT EXISTS tax_rules_custom (
    id VARCHAR(100) PRIMARY KEY,
    jurisdiction_code VARCHAR(2) NOT NULL,
    tax_type VARCHAR(30) NOT NULL,
    name VARCHAR(100) NOT NULL,
    rate DECIMAL(6,3) NOT NULL DEFAULT 0,
    flat_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    applies_to_category VARCHAR(30) NOT NULL DEFAULT 'all',
    min_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    max_cap DECIMAL(18,2) NOT NULL DEFAULT 0,
    is_compound BOOLEAN NOT NULL DEFAULT false,
    priority INTEGER NOT NULL DEFAULT 50,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at BIGINT NOT NULL
);

CREATE INDEX idx_custom_rules_jurisdiction ON tax_rules_custom(jurisdiction_code);
CREATE INDEX idx_custom_rules_active ON tax_rules_custom(is_active);

-- ─── Tax Receipt Generation ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tax_receipts (
    id VARCHAR(36) PRIMARY KEY,
    receipt_number VARCHAR(50) NOT NULL UNIQUE,
    transaction_id VARCHAR(100) NOT NULL,
    jurisdiction_code VARCHAR(2) NOT NULL,
    payer_id VARCHAR(36) NOT NULL,
    merchant_id VARCHAR(36) NOT NULL,
    sub_total DECIMAL(18,2) NOT NULL,
    total_tax DECIMAL(18,2) NOT NULL,
    grand_total DECIMAL(18,2) NOT NULL,
    currency VARCHAR(5) NOT NULL,
    breakdown_json TEXT NOT NULL DEFAULT '[]',
    tax_authority VARCHAR(200),
    issued_at BIGINT NOT NULL,
    is_void BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_tax_receipt_payer ON tax_receipts(payer_id);
CREATE INDEX idx_tax_receipt_merchant ON tax_receipts(merchant_id);
CREATE INDEX idx_tax_receipt_jurisdiction ON tax_receipts(jurisdiction_code);
CREATE INDEX idx_tax_receipt_transaction ON tax_receipts(transaction_id);
