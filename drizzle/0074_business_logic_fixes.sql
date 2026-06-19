-- Migration: Business logic fixes — DB-driven tax rules, tip configs, kill switch schedules

-- Primary tax rules table (DB-driven, replaces hardcoded JURISDICTION_TAX_RULES)
CREATE TABLE IF NOT EXISTS tax_rules (
  id TEXT PRIMARY KEY,
  jurisdiction_code TEXT NOT NULL,
  tax_type TEXT NOT NULL,
  name TEXT NOT NULL,
  rate NUMERIC NOT NULL DEFAULT 0,
  flat_amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT,
  applies_to_category TEXT NOT NULL DEFAULT 'all',
  min_amount NUMERIC NOT NULL DEFAULT 0,
  max_cap NUMERIC NOT NULL DEFAULT 0,
  is_compound BOOLEAN NOT NULL DEFAULT FALSE,
  priority INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_tax_rules_jurisdiction ON tax_rules(jurisdiction_code);
CREATE INDEX IF NOT EXISTS idx_tax_rules_active ON tax_rules(is_active);

-- Tip configuration table (DB-driven, replaces hardcoded JURISDICTION_TIP_CONFIG)
CREATE TABLE IF NOT EXISTS tip_configs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  jurisdiction_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  currency TEXT NOT NULL,
  default_percentages TEXT NOT NULL DEFAULT '[10, 15, 20]',
  max_percentage NUMERIC NOT NULL DEFAULT 30,
  suggested_flat TEXT NOT NULL DEFAULT '[100, 500, 1000]',
  cultural_note TEXT,
  tax_on_tip BOOLEAN NOT NULL DEFAULT FALSE,
  tip_tax_rate NUMERIC NOT NULL DEFAULT 0,
  pool_split_rules TEXT NOT NULL DEFAULT '[]',
  distribution TEXT NOT NULL DEFAULT 'direct',
  round_up_unit NUMERIC NOT NULL DEFAULT 1,
  service_charge_included BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT
);

-- Kill switch scheduling table
CREATE TABLE IF NOT EXISTS kill_switch_schedules (
  id TEXT PRIMARY KEY,
  corridor TEXT NOT NULL,
  action TEXT NOT NULL,
  scheduled_at BIGINT NOT NULL,
  reason TEXT NOT NULL,
  created_by INTEGER,
  created_by_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  executed_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_ks_schedules_status ON kill_switch_schedules(status);
CREATE INDEX IF NOT EXISTS idx_ks_schedules_scheduled ON kill_switch_schedules(scheduled_at);
