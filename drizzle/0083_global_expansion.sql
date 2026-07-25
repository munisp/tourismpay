-- Global Expansion Migration
-- Adds country_code and currency fields to all journey tables
-- so they work for any country, not just Nigeria

-- Add country_code to tourist_profiles if not exists
ALTER TABLE tourist_profiles ADD COLUMN IF NOT EXISTS origin_country_code TEXT DEFAULT 'NG';
ALTER TABLE tourist_profiles ADD COLUMN IF NOT EXISTS current_country_code TEXT DEFAULT 'NG';
ALTER TABLE tourist_profiles ADD COLUMN IF NOT EXISTS current_city TEXT DEFAULT 'Lagos';
ALTER TABLE tourist_profiles ADD COLUMN IF NOT EXISTS preferred_currency TEXT DEFAULT 'NGN';
ALTER TABLE tourist_profiles ADD COLUMN IF NOT EXISTS home_currency TEXT DEFAULT 'USD';
ALTER TABLE tourist_profiles ADD COLUMN IF NOT EXISTS diaspora_corridor TEXT;

-- Add country_code to wallet_balances
ALTER TABLE wallet_balances ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'NG';

-- Add country_code to wallet_transactions
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS origin_country_code TEXT DEFAULT 'NG';
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS destination_country_code TEXT DEFAULT 'NG';
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS payment_rail TEXT DEFAULT 'bank_transfer';
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS exchange_rate REAL;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS original_currency TEXT;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS original_amount REAL;

-- Add country_code to merchants
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'NG';
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS settlement_currency TEXT DEFAULT 'NGN';

-- Add country_code to establishments
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'NG';
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'Lagos';
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Africa/Lagos';

-- Add country_code to tourist_bookings
ALTER TABLE tourist_bookings ADD COLUMN IF NOT EXISTS destination_country_code TEXT DEFAULT 'NG';
ALTER TABLE tourist_bookings ADD COLUMN IF NOT EXISTS booking_currency TEXT DEFAULT 'NGN';

-- Add country_code to tip_transactions
ALTER TABLE tip_transactions ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'NG';
ALTER TABLE tip_transactions ADD COLUMN IF NOT EXISTS tip_currency TEXT DEFAULT 'NGN';

-- Add country_code to tax_collections
ALTER TABLE tax_collections ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'NG';
ALTER TABLE tax_collections ADD COLUMN IF NOT EXISTS tax_currency TEXT DEFAULT 'NGN';
ALTER TABLE tax_collections ADD COLUMN IF NOT EXISTS tax_name TEXT DEFAULT 'VAT';
ALTER TABLE tax_collections ADD COLUMN IF NOT EXISTS tourist_tax_amount REAL DEFAULT 0;

-- Add country_code to loyalty_transactions
ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'NG';
ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS transaction_currency TEXT DEFAULT 'NGN';

-- Add country_code to itineraries
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS destination_country_code TEXT DEFAULT 'NG';
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS origin_country_code TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS budget_currency TEXT DEFAULT 'USD';

-- Global tourist profiles registry
CREATE TABLE IF NOT EXISTS global_tourist_profiles (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  origin_country_code TEXT NOT NULL,
  origin_city TEXT,
  origin_currency TEXT NOT NULL,
  home_language TEXT DEFAULT 'English',
  passport_country TEXT,
  diaspora_corridor TEXT,
  preferred_payment_rail TEXT DEFAULT 'card',
  total_trips INTEGER DEFAULT 0,
  total_spend_usd REAL DEFAULT 0,
  loyalty_tier TEXT DEFAULT 'standard',
  created_at INTEGER,
  updated_at INTEGER
);

-- Global FX rates (multi-currency)
CREATE TABLE IF NOT EXISTS global_fx_rates (
  id TEXT PRIMARY KEY,
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate REAL NOT NULL,
  inverse_rate REAL NOT NULL,
  source TEXT DEFAULT 'open_exchange_rates',
  bid_rate REAL,
  ask_rate REAL,
  spread_percent REAL DEFAULT 0.5,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_global_fx_rates_pair ON global_fx_rates(from_currency, to_currency);
CREATE INDEX IF NOT EXISTS idx_global_fx_rates_from ON global_fx_rates(from_currency);
CREATE INDEX IF NOT EXISTS idx_global_fx_rates_to ON global_fx_rates(to_currency);

-- Payment rail transactions
CREATE TABLE IF NOT EXISTS payment_rail_transactions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  tourist_profile_id TEXT,
  payment_rail TEXT NOT NULL,
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  from_country_code TEXT NOT NULL,
  to_country_code TEXT NOT NULL,
  from_amount REAL NOT NULL,
  to_amount REAL NOT NULL,
  exchange_rate REAL NOT NULL,
  fee_amount REAL DEFAULT 0,
  fee_currency TEXT,
  status TEXT DEFAULT 'pending',
  provider_reference TEXT,
  wallet_transaction_id TEXT,
  created_at INTEGER,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_payment_rail_txns_user ON payment_rail_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_rail_txns_rail ON payment_rail_transactions(payment_rail);

-- Country-specific tax audit log
CREATE TABLE IF NOT EXISTS global_tax_audit (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  country_code TEXT NOT NULL,
  merchant_id TEXT,
  merchant_type TEXT,
  base_amount REAL NOT NULL,
  currency TEXT NOT NULL,
  vat_rate REAL DEFAULT 0,
  vat_amount REAL DEFAULT 0,
  vat_name TEXT DEFAULT 'VAT',
  service_charge_rate REAL DEFAULT 0,
  service_charge_amount REAL DEFAULT 0,
  tourist_tax_rate REAL DEFAULT 0,
  tourist_tax_amount REAL DEFAULT 0,
  total_tax_amount REAL NOT NULL,
  total_with_tax REAL NOT NULL,
  regulatory_body TEXT,
  is_tourist BOOLEAN DEFAULT FALSE,
  created_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_global_tax_audit_country ON global_tax_audit(country_code);
CREATE INDEX IF NOT EXISTS idx_global_tax_audit_transaction ON global_tax_audit(transaction_id);
