-- Migration 001: Initial GDS Schema
-- Creates all core tables for the 15 GDS services.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ═══════════════════════════════════════════════════
-- TENANTS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(50) NOT NULL DEFAULT 'starter',
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO gds_tenants (id, name, slug, plan) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Default', 'default', 'enterprise')
ON CONFLICT (slug) DO NOTHING;

-- ═══════════════════════════════════════════════════
-- PROPERTIES
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES gds_tenants(id),
    name VARCHAR(500) NOT NULL,
    type VARCHAR(50) NOT NULL,
    country_code CHAR(2) NOT NULL,
    region VARCHAR(255),
    city VARCHAR(255),
    star_rating SMALLINT CHECK (star_rating BETWEEN 1 AND 5),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    commission_pct DECIMAL(5,2) DEFAULT 15.00,
    amenities TEXT[] DEFAULT '{}',
    images TEXT[] DEFAULT '{}',
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    chain_code VARCHAR(10),
    property_code VARCHAR(20) UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    policies JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    source VARCHAR(50) DEFAULT 'direct',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_properties_tenant ON gds_properties(tenant_id);
CREATE INDEX IF NOT EXISTS idx_properties_country ON gds_properties(country_code);
CREATE INDEX IF NOT EXISTS idx_properties_type ON gds_properties(type);
CREATE INDEX IF NOT EXISTS idx_properties_status ON gds_properties(status);

-- ═══════════════════════════════════════════════════
-- ROOM TYPES
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_room_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES gds_properties(id) ON DELETE CASCADE,
    code VARCHAR(10) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    max_occupancy SMALLINT NOT NULL DEFAULT 2,
    bed_configuration VARCHAR(100),
    size_sqm DECIMAL(6,1),
    amenities TEXT[] DEFAULT '{}',
    images TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(property_id, code)
);

-- ═══════════════════════════════════════════════════
-- RATE PLANS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_rate_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES gds_properties(id) ON DELETE CASCADE,
    room_type_code VARCHAR(10) NOT NULL,
    rate_plan_code VARCHAR(20) NOT NULL DEFAULT 'BAR',
    date DATE NOT NULL,
    rate DECIMAL(12,2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    meal_plan VARCHAR(5) DEFAULT 'RO',
    min_stay SMALLINT DEFAULT 1,
    stop_sell BOOLEAN DEFAULT FALSE,
    closed_to_arrival BOOLEAN DEFAULT FALSE,
    closed_to_departure BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_plans_lookup ON gds_rate_plans(property_id, room_type_code, date);

-- ═══════════════════════════════════════════════════
-- AVAILABILITY
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES gds_properties(id) ON DELETE CASCADE,
    room_type_code VARCHAR(10) NOT NULL,
    date DATE NOT NULL,
    total_rooms SMALLINT NOT NULL,
    booked_rooms SMALLINT NOT NULL DEFAULT 0,
    closed_to_arrival BOOLEAN DEFAULT FALSE,
    closed_to_departure BOOLEAN DEFAULT FALSE,
    UNIQUE(property_id, room_type_code, date)
);

CREATE INDEX IF NOT EXISTS idx_avail_lookup ON gds_availability(property_id, room_type_code, date);

-- ═══════════════════════════════════════════════════
-- AGENTS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES gds_tenants(id),
    agency_name VARCHAR(255) NOT NULL,
    agent_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    country_code CHAR(2) NOT NULL,
    iata_code VARCHAR(20),
    preferred_currency CHAR(3) DEFAULT 'USD',
    tier VARCHAR(20) NOT NULL DEFAULT 'bronze',
    commission_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    total_bookings INTEGER DEFAULT 0,
    api_key VARCHAR(64) UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    distribution_type VARCHAR(20) DEFAULT 'api',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_tenant ON gds_agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agents_email ON gds_agents(email);

-- ═══════════════════════════════════════════════════
-- RESERVATIONS (PNR)
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES gds_tenants(id),
    confirmation_no VARCHAR(20) UNIQUE NOT NULL,
    property_id UUID REFERENCES gds_properties(id),
    agent_id UUID REFERENCES gds_agents(id),
    room_type_code VARCHAR(10),
    rate_plan_code VARCHAR(20) DEFAULT 'BAR',
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    nights SMALLINT NOT NULL,
    guests SMALLINT NOT NULL DEFAULT 2,
    rooms SMALLINT NOT NULL DEFAULT 1,
    guest_name VARCHAR(255) NOT NULL,
    guest_email VARCHAR(255),
    guest_phone VARCHAR(50),
    guest_country CHAR(2),
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    commission_amount DECIMAL(12,2) DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    source VARCHAR(50) DEFAULT 'agent_portal',
    special_requests TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_reservations_tenant ON gds_reservations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_dates ON gds_reservations(check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON gds_reservations(status);

-- ═══════════════════════════════════════════════════
-- SETTLEMENT BATCHES
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_settlement_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES gds_tenants(id),
    property_id UUID REFERENCES gds_properties(id),
    agent_id UUID REFERENCES gds_agents(id),
    period VARCHAR(20) NOT NULL,
    reservation_ids UUID[] DEFAULT '{}',
    total_gross DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_commission DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_net DECIMAL(12,2) NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    payout_method VARCHAR(30),
    payout_ref VARCHAR(100),
    tigerbeetle_transfer_id VARCHAR(64),
    mojaloop_transfer_id VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_settlements_status ON gds_settlement_batches(status);

-- ═══════════════════════════════════════════════════
-- GUEST PROFILES
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_guest_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES gds_tenants(id),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    country_code CHAR(2),
    loyalty_tier VARCHAR(20) DEFAULT 'bronze',
    loyalty_points INTEGER DEFAULT 0,
    total_stays INTEGER DEFAULT 0,
    total_spend DECIMAL(12,2) DEFAULT 0,
    preferences JSONB DEFAULT '{}',
    corporate_id UUID,
    travel_policy JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guests_tenant ON gds_guest_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_guests_email ON gds_guest_profiles(email);

-- ═══════════════════════════════════════════════════
-- QUEUE ITEMS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_queue_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES gds_tenants(id),
    queue_type VARCHAR(50) NOT NULL,
    priority INTEGER DEFAULT 3,
    pnr_locator VARCHAR(20),
    title VARCHAR(500) NOT NULL,
    details JSONB DEFAULT '{}',
    assigned_to UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    sla_minutes INTEGER DEFAULT 30,
    sla_deadline TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_queue_type ON gds_queue_items(queue_type, status);
CREATE INDEX IF NOT EXISTS idx_queue_priority ON gds_queue_items(priority, created_at);

-- ═══════════════════════════════════════════════════
-- CONTENT
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID REFERENCES gds_properties(id),
    language_code VARCHAR(5) NOT NULL DEFAULT 'en',
    title VARCHAR(500),
    description TEXT,
    highlights TEXT[],
    amenity_categories JSONB DEFAULT '{}',
    policies JSONB DEFAULT '{}',
    images JSONB DEFAULT '[]',
    completeness_score DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_property ON gds_content(property_id, language_code);

-- ═══════════════════════════════════════════════════
-- COMMISSION SPLITS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_commission_splits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id VARCHAR(64) NOT NULL,
    gross_amount DECIMAL(12,2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    country_code CHAR(2) NOT NULL,
    agent_tier VARCHAR(20),
    property_tier VARCHAR(20),
    tax_amount DECIMAL(12,2) DEFAULT 0,
    platform_fee DECIMAL(12,2) DEFAULT 0,
    agent_commission DECIMAL(12,2) DEFAULT 0,
    field_agent_fee DECIMAL(12,2) DEFAULT 0,
    property_net DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_booking ON gds_commission_splits(booking_id);

-- ═══════════════════════════════════════════════════
-- DISCOUNTS / PROMOS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_discounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(30) NOT NULL,
    value DECIMAL(12,2) NOT NULL,
    min_amount DECIMAL(12,2) DEFAULT 0,
    max_uses INTEGER,
    used_count INTEGER DEFAULT 0,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    applicable_countries TEXT[],
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discounts_code ON gds_discounts(code);

-- ═══════════════════════════════════════════════════
-- CANCELLATION POLICIES
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_cancellation_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID REFERENCES gds_properties(id),
    policy_type VARCHAR(30) NOT NULL,
    tiers JSONB NOT NULL DEFAULT '[]',
    refund_waterfall JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════
-- NEGOTIATED RATES
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_negotiated_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    corporate_id VARCHAR(64) NOT NULL,
    corporate_name VARCHAR(255) NOT NULL,
    agreement_type VARCHAR(30) NOT NULL,
    discount_pct DECIMAL(5,2) NOT NULL,
    property_ids UUID[],
    valid_from DATE,
    valid_until DATE,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_neg_rates_corp ON gds_negotiated_rates(corporate_id);

-- ═══════════════════════════════════════════════════
-- GROUP BOOKINGS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_group_bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES gds_tenants(id),
    group_name VARCHAR(255) NOT NULL,
    group_type VARCHAR(30) NOT NULL,
    property_id UUID REFERENCES gds_properties(id),
    rooms_blocked INTEGER NOT NULL,
    rooms_picked_up INTEGER DEFAULT 0,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    contact_name VARCHAR(255),
    contact_email VARCHAR(255),
    status VARCHAR(20) DEFAULT 'provisional',
    attrition_schedule JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════
-- ONBOARDING TIERS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_onboarding_establishments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    country_code CHAR(2) NOT NULL,
    tier VARCHAR(20) NOT NULL DEFAULT 'sms_only',
    channel VARCHAR(30),
    total_bookings INTEGER DEFAULT 0,
    response_rate DECIMAL(5,2) DEFAULT 0,
    engagement_score DECIMAL(5,2) DEFAULT 0,
    registered_via VARCHAR(30),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    upgraded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_onboarding_tier ON gds_onboarding_establishments(tier);

-- ═══════════════════════════════════════════════════
-- AUDIT LOG
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_audit_log (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID REFERENCES gds_tenants(id),
    actor_id VARCHAR(64),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(64),
    details JSONB DEFAULT '{}',
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON gds_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON gds_audit_log(created_at);

-- ═══════════════════════════════════════════════════
-- API METERING
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_api_usage (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES gds_tenants(id),
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code SMALLINT NOT NULL,
    response_time_ms INTEGER,
    api_key VARCHAR(64),
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_tenant ON gds_api_usage(tenant_id, created_at);

-- ═══════════════════════════════════════════════════
-- WEBHOOKS
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gds_webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES gds_tenants(id),
    agent_id UUID REFERENCES gds_agents(id),
    url VARCHAR(500) NOT NULL,
    events TEXT[] DEFAULT '{}',
    secret VARCHAR(64) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    last_delivery TIMESTAMPTZ,
    failure_count SMALLINT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
