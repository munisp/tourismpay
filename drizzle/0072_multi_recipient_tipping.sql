-- Multi-Recipient Tipping Tables
-- Supports tipping multiple individuals from a single bill with
-- custom per-recipient amounts, equal splits, or percentage-based allocation.

CREATE TABLE IF NOT EXISTS multi_tip_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_id VARCHAR(128) NOT NULL,
  establishment_id INTEGER REFERENCES establishments(id) ON DELETE SET NULL,
  bill_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
  total_tip DECIMAL(14, 2) NOT NULL,
  currency VARCHAR(5) NOT NULL DEFAULT 'NGN',
  jurisdiction_code VARCHAR(2) NOT NULL DEFAULT 'NG',
  split_mode VARCHAR(20) NOT NULL DEFAULT 'equal', -- equal, custom_amount, custom_percent
  recipient_count INTEGER NOT NULL DEFAULT 1,
  transaction_ref VARCHAR(128),
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT
);

CREATE TABLE IF NOT EXISTS multi_tip_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES multi_tip_groups(id) ON DELETE CASCADE,
  recipient_id VARCHAR(128) NOT NULL,
  recipient_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'staff',
  amount DECIMAL(14, 2) NOT NULL,
  percentage DECIMAL(5, 1) NOT NULL DEFAULT 0,
  message VARCHAR(200),
  receipt_ref VARCHAR(128),
  wallet_credited BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, credited, failed
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  notified_at BIGINT
);

-- Indices for multi_tip_groups
CREATE INDEX IF NOT EXISTS idx_mtg_payer ON multi_tip_groups(payer_id);
CREATE INDEX IF NOT EXISTS idx_mtg_establishment ON multi_tip_groups(establishment_id);
CREATE INDEX IF NOT EXISTS idx_mtg_jurisdiction ON multi_tip_groups(jurisdiction_code);
CREATE INDEX IF NOT EXISTS idx_mtg_status ON multi_tip_groups(status);
CREATE INDEX IF NOT EXISTS idx_mtg_created ON multi_tip_groups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mtg_txref ON multi_tip_groups(transaction_ref);

-- Indices for multi_tip_recipients
CREATE INDEX IF NOT EXISTS idx_mtr_group ON multi_tip_recipients(group_id);
CREATE INDEX IF NOT EXISTS idx_mtr_recipient ON multi_tip_recipients(recipient_id);
CREATE INDEX IF NOT EXISTS idx_mtr_role ON multi_tip_recipients(role);
CREATE INDEX IF NOT EXISTS idx_mtr_status ON multi_tip_recipients(status);
CREATE INDEX IF NOT EXISTS idx_mtr_receipt ON multi_tip_recipients(receipt_ref);
CREATE INDEX IF NOT EXISTS idx_mtr_amount ON multi_tip_recipients(amount DESC);
