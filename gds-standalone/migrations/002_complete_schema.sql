-- Migration 002: Complete schema for all 28 routes
-- Adds tables missing from 001 that routes need

-- ═══════════════════════════════════════════════════
-- PNR RECORDS (separate from reservations — GDS PNR engine)
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_pnr_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES gds_tenants(id),
    record_locator VARCHAR(6) UNIQUE NOT NULL,
    guest_name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255),
    agency_id VARCHAR(64),
    agent_id VARCHAR(64),
    status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED',
    ticketing_status VARCHAR(20) DEFAULT 'PENDING',
    segments JSONB DEFAULT '[]',
    remarks JSONB DEFAULT '[]',
    history JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pnr_locator ON gds_pnr_records(record_locator);
CREATE INDEX IF NOT EXISTS idx_pnr_tenant ON gds_pnr_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pnr_status ON gds_pnr_records(status);

-- ═══════════════════════════════════════════════════
-- ONBOARDING APPLICATIONS (wizard workflow)
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_onboarding_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES gds_tenants(id),
    establishment_name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(50),
    country VARCHAR(5) NOT NULL,
    city VARCHAR(255),
    property_type VARCHAR(50) DEFAULT 'hotel',
    rooms INTEGER DEFAULT 0,
    channel VARCHAR(30) DEFAULT 'web',
    assigned_agent_id UUID,
    status VARCHAR(30) NOT NULL DEFAULT 'registered',
    step INTEGER NOT NULL DEFAULT 1,
    total_steps INTEGER NOT NULL DEFAULT 5,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_apps_status ON gds_onboarding_applications(status);

-- ═══════════════════════════════════════════════════
-- FIELD AGENTS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_field_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES gds_tenants(id),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    region VARCHAR(100),
    country VARCHAR(5) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending_kyc',
    kyc_verified BOOLEAN DEFAULT FALSE,
    training_completed BOOLEAN DEFAULT FALSE,
    properties_onboarded INTEGER DEFAULT 0,
    commission_earned DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_agents_status ON gds_field_agents(status);

-- ═══════════════════════════════════════════════════
-- ESTABLISHMENTS (full onboarding data)
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_establishments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES gds_tenants(id),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    country VARCHAR(5) NOT NULL,
    city VARCHAR(255),
    address TEXT,
    contact_name VARCHAR(255),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    rooms INTEGER DEFAULT 0,
    star_rating SMALLINT,
    tier VARCHAR(20) DEFAULT 'sms_only',
    status VARCHAR(30) DEFAULT 'pending_verification',
    onboarding_step INTEGER DEFAULT 1,
    onboarding_channel VARCHAR(30) DEFAULT 'web',
    amenities TEXT[] DEFAULT '{}',
    currency CHAR(3) DEFAULT 'USD',
    base_rate DECIMAL(12,2) DEFAULT 0,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_establishments_status ON gds_establishments(status);
CREATE INDEX IF NOT EXISTS idx_establishments_country ON gds_establishments(country);

-- ═══════════════════════════════════════════════════
-- TAX JURISDICTIONS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_tax_jurisdictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    country VARCHAR(5) NOT NULL,
    vat_rate DECIMAL(5,2) DEFAULT 0,
    tourism_levy DECIMAL(5,2) DEFAULT 0,
    service_charge DECIMAL(5,2) DEFAULT 0,
    authority VARCHAR(255),
    filing_frequency VARCHAR(20) DEFAULT 'monthly',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════
-- TAX CALCULATIONS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_tax_calculations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    jurisdiction_code VARCHAR(10) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    vat DECIMAL(12,2) DEFAULT 0,
    tourism_levy DECIMAL(12,2) DEFAULT 0,
    service_charge DECIMAL(12,2) DEFAULT 0,
    total_tax DECIMAL(12,2) DEFAULT 0,
    total_with_tax DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════
-- TIPPING TEMPLATES & RECORDS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_tipping_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country VARCHAR(5) NOT NULL,
    service_type VARCHAR(50) NOT NULL,
    suggested_pct DECIMAL(5,2) DEFAULT 10,
    min_pct DECIMAL(5,2) DEFAULT 5,
    max_pct DECIMAL(5,2) DEFAULT 25,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gds_tip_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id VARCHAR(64),
    total_amount DECIMAL(12,2) NOT NULL,
    currency CHAR(3) DEFAULT 'USD',
    split_mode VARCHAR(20) DEFAULT 'equal',
    recipients JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════
-- REMITTANCE
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_remittance_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES gds_tenants(id),
    jurisdiction_code VARCHAR(10) NOT NULL,
    period VARCHAR(20) NOT NULL,
    tax_type VARCHAR(30) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency CHAR(3) DEFAULT 'USD',
    status VARCHAR(20) DEFAULT 'pending',
    due_date DATE,
    filed_at TIMESTAMPTZ,
    reference VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gds_remittance_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    jurisdiction_code VARCHAR(10) NOT NULL,
    tax_type VARCHAR(30) NOT NULL,
    frequency VARCHAR(20) DEFAULT 'monthly',
    next_due DATE,
    auto_file BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════
-- LOYALTY
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_loyalty_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tier VARCHAR(20) NOT NULL UNIQUE,
    min_points INTEGER DEFAULT 0,
    multiplier DECIMAL(3,1) DEFAULT 1.0,
    benefits TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gds_loyalty_rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    points_required INTEGER NOT NULL,
    category VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gds_loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guest_id UUID REFERENCES gds_guest_profiles(id),
    amount DECIMAL(12,2) NOT NULL,
    property_type VARCHAR(50),
    guest_tier VARCHAR(20),
    points_earned INTEGER DEFAULT 0,
    night_credits DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════
-- DISTRIBUTION CHANNELS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_distribution_channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES gds_tenants(id),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(30) NOT NULL,
    endpoint VARCHAR(500),
    countries TEXT[] DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'active',
    bookings_count INTEGER DEFAULT 0,
    revenue DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════
-- DEMAND EVENTS (Revenue Management)
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_demand_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    country VARCHAR(5) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    demand_multiplier DECIMAL(4,2) DEFAULT 1.0,
    category VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════
-- SANDBOX (API Testing)
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_sandbox_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES gds_tenants(id),
    name VARCHAR(255) NOT NULL,
    api_key VARCHAR(64) UNIQUE NOT NULL,
    environment VARCHAR(20) DEFAULT 'sandbox',
    rate_limit INTEGER DEFAULT 100,
    status VARCHAR(20) DEFAULT 'active',
    last_used TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gds_sandbox_test_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_number VARCHAR(20) NOT NULL,
    brand VARCHAR(20) NOT NULL,
    scenario VARCHAR(50) NOT NULL,
    expected_result VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════
-- SETTLEMENT SAGA RECORDS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_settlement_sagas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id VARCHAR(64) NOT NULL,
    gross_amount DECIMAL(12,2) NOT NULL,
    currency CHAR(3) DEFAULT 'USD',
    country VARCHAR(5) NOT NULL,
    steps JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'completed',
    idempotency_key VARCHAR(64) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════
-- CONTENT LANGUAGES
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_languages (
    code VARCHAR(5) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    native_name VARCHAR(100),
    direction VARCHAR(3) DEFAULT 'ltr',
    active BOOLEAN DEFAULT TRUE
);

-- ═══════════════════════════════════════════════════
-- SEARCH HISTORY
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_search_log (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID REFERENCES gds_tenants(id),
    query VARCHAR(500),
    filters JSONB DEFAULT '{}',
    results_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
