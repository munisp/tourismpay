-- Migration 005: Additional tables for backend microservices
-- Tables for revenue calculations, discount promos, cancellation records, commission rules

CREATE TABLE IF NOT EXISTS gds_revenue_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    property_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    value DOUBLE PRECISION DEFAULT 0,
    metadata TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gds_revenue_calculations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    property_id TEXT NOT NULL,
    base_rate DOUBLE PRECISION NOT NULL,
    dynamic_rate DOUBLE PRECISION NOT NULL,
    multiplier DOUBLE PRECISION DEFAULT 1.0,
    occupancy_pct DOUBLE PRECISION DEFAULT 0,
    days_until_arrival INTEGER DEFAULT 0,
    season TEXT DEFAULT 'normal',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gds_discount_promos (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    discount_type TEXT DEFAULT 'percentage',
    discount_value DOUBLE PRECISION DEFAULT 0,
    min_booking_amount DOUBLE PRECISION DEFAULT 0,
    max_discount DOUBLE PRECISION DEFAULT 0,
    valid_from TEXT DEFAULT '',
    valid_to TEXT DEFAULT '',
    max_uses INTEGER DEFAULT 0,
    current_uses INTEGER DEFAULT 0,
    applicable_properties TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gds_cancellation_records (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    booking_amount DOUBLE PRECISION NOT NULL,
    fee DOUBLE PRECISION NOT NULL,
    refund_amount DOUBLE PRECISION NOT NULL,
    policy_type TEXT NOT NULL,
    days_before INTEGER DEFAULT 0,
    force_majeure BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gds_commission_rules (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    stakeholder_type TEXT NOT NULL,
    rate_type TEXT DEFAULT 'percentage',
    rate DOUBLE PRECISION DEFAULT 0,
    min_amount DOUBLE PRECISION DEFAULT 0,
    max_amount DOUBLE PRECISION DEFAULT 0,
    currency TEXT DEFAULT 'NGN',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add missing columns to existing tables if needed
ALTER TABLE gds_commission_splits ADD COLUMN IF NOT EXISTS tax_authority TEXT DEFAULT '';
ALTER TABLE gds_commission_splits ADD COLUMN IF NOT EXISTS field_agent_commission DOUBLE PRECISION DEFAULT 0;
ALTER TABLE gds_commission_splits ADD COLUMN IF NOT EXISTS property_net DOUBLE PRECISION DEFAULT 0;
ALTER TABLE gds_commission_splits ADD COLUMN IF NOT EXISTS country TEXT DEFAULT '';

ALTER TABLE gds_queue_items ADD COLUMN IF NOT EXISTS assigned_agent TEXT;
ALTER TABLE gds_queue_items ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE gds_queue_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE gds_cancellation_policies ADD COLUMN IF NOT EXISTS penalty_pct DOUBLE PRECISION DEFAULT 0;
ALTER TABLE gds_cancellation_policies ADD COLUMN IF NOT EXISTS refund_pct DOUBLE PRECISION DEFAULT 0;
ALTER TABLE gds_cancellation_policies ADD COLUMN IF NOT EXISTS grace_period_hours INTEGER DEFAULT 0;
ALTER TABLE gds_cancellation_policies ADD COLUMN IF NOT EXISTS force_majeure_exempt BOOLEAN DEFAULT false;
ALTER TABLE gds_cancellation_policies ADD COLUMN IF NOT EXISTS days_before INTEGER DEFAULT 0;

ALTER TABLE gds_negotiated_rates ADD COLUMN IF NOT EXISTS room_types TEXT DEFAULT '';
ALTER TABLE gds_negotiated_rates ADD COLUMN IF NOT EXISTS min_nights INTEGER DEFAULT 0;
ALTER TABLE gds_negotiated_rates ADD COLUMN IF NOT EXISTS min_rooms INTEGER DEFAULT 0;

ALTER TABLE gds_settlement_sagas ADD COLUMN IF NOT EXISTS property_id TEXT DEFAULT '';
ALTER TABLE gds_settlement_sagas ADD COLUMN IF NOT EXISTS agent_id TEXT DEFAULT '';
ALTER TABLE gds_settlement_sagas ADD COLUMN IF NOT EXISTS steps_completed INTEGER DEFAULT 0;
ALTER TABLE gds_settlement_sagas ADD COLUMN IF NOT EXISTS total_steps INTEGER DEFAULT 0;

-- Seed discount promos for Nigeria
INSERT INTO gds_discount_promos (id, tenant_id, code, name, discount_type, discount_value, min_booking_amount, max_discount, max_uses, status)
VALUES
    ('promo-001', '00000000-0000-0000-0000-000000000001', 'NAIJA15', 'Nigeria Welcome', 'percentage', 15, 50000, 30000, 1000, 'active'),
    ('promo-002', '00000000-0000-0000-0000-000000000001', 'LAGOS20', 'Lagos Explorer', 'percentage', 20, 100000, 50000, 500, 'active'),
    ('promo-003', '00000000-0000-0000-0000-000000000001', 'ABUJA10', 'Abuja Weekend', 'percentage', 10, 30000, 20000, 2000, 'active'),
    ('promo-004', '00000000-0000-0000-0000-000000000001', 'FIRST5K', 'First Booking', 'fixed', 5000, 25000, 5000, 5000, 'active'),
    ('promo-005', '00000000-0000-0000-0000-000000000001', 'SAFARI25', 'Safari Season', 'percentage', 25, 200000, 100000, 200, 'active')
ON CONFLICT (id) DO NOTHING;

-- Seed commission rules
INSERT INTO gds_commission_rules (id, tenant_id, name, stakeholder_type, rate_type, rate, min_amount, max_amount, currency, status)
VALUES
    ('rule-001', '00000000-0000-0000-0000-000000000001', 'Standard Agent', 'agent', 'percentage', 10, 0, 1000000, 'NGN', 'active'),
    ('rule-002', '00000000-0000-0000-0000-000000000001', 'Platform Fee', 'platform', 'percentage', 3, 0, 5000000, 'NGN', 'active'),
    ('rule-003', '00000000-0000-0000-0000-000000000001', 'Tax Withholding', 'tax_authority', 'percentage', 5, 0, 10000000, 'NGN', 'active'),
    ('rule-004', '00000000-0000-0000-0000-000000000001', 'Field Agent', 'field_agent', 'percentage', 2, 0, 500000, 'NGN', 'active'),
    ('rule-005', '00000000-0000-0000-0000-000000000001', 'Premium Agent', 'agent', 'percentage', 15, 500000, 5000000, 'NGN', 'active')
ON CONFLICT (id) DO NOTHING;
