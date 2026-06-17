-- Migration: 0068_local_payments.sql
-- Local payment tables for tourist/diaspora everyday payments
-- Covers: bill payments, virtual cards, bank transfers, payment links, split bills, money requests

-- ─── Bill Payments ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bill_payments (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  provider_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  category TEXT NOT NULL, -- airtime, data, electricity, cable_tv, water, internet
  account_number TEXT NOT NULL,
  amount NUMERIC(18,6) NOT NULL,
  fee NUMERIC(18,6) DEFAULT 0,
  total_charged NUMERIC(18,6) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded
  reference TEXT,
  token TEXT, -- electricity prepaid token
  units TEXT, -- electricity units
  customer_name TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bill_payments_user_id ON bill_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_bill_payments_status ON bill_payments(status);
CREATE INDEX IF NOT EXISTS idx_bill_payments_category ON bill_payments(category);
CREATE INDEX IF NOT EXISTS idx_bill_payments_created_at ON bill_payments(created_at);

-- ─── Virtual Cards ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS virtual_cards (
  id SERIAL PRIMARY KEY,
  card_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  card_type TEXT NOT NULL, -- visa, mastercard, verve
  masked_pan TEXT NOT NULL,
  expiry_month INT NOT NULL,
  expiry_year INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  balance NUMERIC(18,6) DEFAULT 0,
  spend_limit NUMERIC(18,6) DEFAULT 50000,
  daily_limit NUMERIC(18,6) DEFAULT 5000,
  daily_spent NUMERIC(18,6) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- active, frozen, expired, cancelled
  label TEXT DEFAULT 'Travel Card',
  is_contactless BOOLEAN DEFAULT TRUE,
  three_ds_enabled BOOLEAN DEFAULT TRUE,
  allow_atm BOOLEAN DEFAULT FALSE,
  allow_online BOOLEAN DEFAULT TRUE,
  allow_pos BOOLEAN DEFAULT TRUE,
  allow_international BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_virtual_cards_user_id ON virtual_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_virtual_cards_status ON virtual_cards(status);
CREATE INDEX IF NOT EXISTS idx_virtual_cards_card_id ON virtual_cards(card_id);

-- ─── Virtual Card Transactions ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS virtual_card_transactions (
  id SERIAL PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES virtual_cards(card_id),
  transaction_id TEXT NOT NULL UNIQUE,
  merchant_name TEXT,
  merchant_category TEXT,
  amount NUMERIC(18,6) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  type TEXT NOT NULL, -- purchase, atm, refund, fee
  is_international BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vcard_txns_card_id ON virtual_card_transactions(card_id);
CREATE INDEX IF NOT EXISTS idx_vcard_txns_created_at ON virtual_card_transactions(created_at);

-- ─── Bank Transfer Out (NIBSS NIP) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bank_transfers_out (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  session_id TEXT, -- NIBSS session ID
  bank_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  amount NUMERIC(18,6) NOT NULL,
  fee NUMERIC(18,6) DEFAULT 0,
  total_debited NUMERIC(18,6) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, reversed
  rail TEXT DEFAULT 'nip', -- nip, neft
  narration TEXT,
  reference TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bank_transfers_out_user_id ON bank_transfers_out(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_transfers_out_status ON bank_transfers_out(status);
CREATE INDEX IF NOT EXISTS idx_bank_transfers_out_created_at ON bank_transfers_out(created_at);

-- ─── Saved Beneficiaries ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS saved_beneficiaries (
  id SERIAL PRIMARY KEY,
  beneficiary_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  bank_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  nickname TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_beneficiaries_user_id ON saved_beneficiaries(user_id);

-- ─── Payment Links ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payment_links (
  id SERIAL PRIMARY KEY,
  link_id TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  amount NUMERIC(18,6), -- NULL = payer enters amount
  currency TEXT NOT NULL DEFAULT 'NGN',
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active, paid, expired, cancelled
  paid_by TEXT,
  paid_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_links_created_by ON payment_links(created_by);
CREATE INDEX IF NOT EXISTS idx_payment_links_status ON payment_links(status);
CREATE INDEX IF NOT EXISTS idx_payment_links_link_id ON payment_links(link_id);

-- ─── Split Bills ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS split_bills (
  id SERIAL PRIMARY KEY,
  split_id TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  total_amount NUMERIC(18,6) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  description TEXT NOT NULL,
  merchant_name TEXT,
  split_type TEXT NOT NULL DEFAULT 'equal', -- equal, custom
  status TEXT NOT NULL DEFAULT 'active', -- active, completed, cancelled
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_split_bills_created_by ON split_bills(created_by);
CREATE INDEX IF NOT EXISTS idx_split_bills_status ON split_bills(status);

CREATE TABLE IF NOT EXISTS split_bill_participants (
  id SERIAL PRIMARY KEY,
  split_id TEXT NOT NULL,
  user_id TEXT,
  name TEXT NOT NULL,
  email TEXT,
  amount NUMERIC(18,6) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, declined
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_split_participants_split_id ON split_bill_participants(split_id);
CREATE INDEX IF NOT EXISTS idx_split_participants_user_id ON split_bill_participants(user_id);

-- ─── Money Requests ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS money_requests (
  id SERIAL PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  requester_id TEXT NOT NULL,
  recipient_user_id TEXT,
  recipient_email TEXT,
  amount NUMERIC(18,6) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, fulfilled, expired, cancelled
  expires_at TIMESTAMP NOT NULL,
  fulfilled_at TIMESTAMP,
  fulfilled_by TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_money_requests_requester_id ON money_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_money_requests_recipient_user_id ON money_requests(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_money_requests_status ON money_requests(status);

-- ─── Ride Hailing ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ride_bookings (
  id SERIAL PRIMARY KEY,
  ride_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL, -- uber, bolt, indrive, rida, safeboda
  pickup_address TEXT NOT NULL,
  dropoff_address TEXT NOT NULL,
  pickup_lat NUMERIC(10,6),
  pickup_lng NUMERIC(10,6),
  dropoff_lat NUMERIC(10,6),
  dropoff_lng NUMERIC(10,6),
  estimated_fare NUMERIC(18,6),
  final_fare NUMERIC(18,6),
  currency TEXT NOT NULL DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'requested',
  payment_method TEXT DEFAULT 'wallet',
  driver_name TEXT,
  driver_phone TEXT,
  vehicle_plate TEXT,
  vehicle_model TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ride_bookings_user_id ON ride_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_ride_bookings_status ON ride_bookings(status);
CREATE INDEX IF NOT EXISTS idx_ride_bookings_provider ON ride_bookings(provider);

-- ─── NFC Payment Tokens ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nfc_payment_tokens (
  id SERIAL PRIMARY KEY,
  token_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  amount NUMERIC(18,6) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  merchant_id TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active, used, expired
  nfc_payload BYTEA,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nfc_tokens_user_id ON nfc_payment_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_nfc_tokens_status ON nfc_payment_tokens(status);
