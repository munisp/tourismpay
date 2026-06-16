-- Africa-first GDS — Database Schema
-- Multi-tenant: all tables include tenant_id for data isolation.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Tenants
CREATE TABLE IF NOT EXISTS gds_tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(50) NOT NULL DEFAULT 'starter',
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Properties
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

CREATE INDEX idx_properties_tenant ON gds_properties(tenant_id);
CREATE INDEX idx_properties_country ON gds_properties(country_code);
CREATE INDEX idx_properties_type ON gds_properties(type);
CREATE INDEX idx_properties_status ON gds_properties(status);
CREATE INDEX idx_properties_name_trgm ON gds_properties USING gin(name gin_trgm_ops);

-- Room Types
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

-- Rate Plans
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

CREATE INDEX idx_rate_plans_property ON gds_rate_plans(property_id, room_type_code, date);
CREATE INDEX idx_rate_plans_date ON gds_rate_plans(date);

-- Availability
CREATE TABLE IF NOT EXISTS gds_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES gds_properties(id) ON DELETE CASCADE,
    room_type_code VARCHAR(10) NOT NULL,
    date DATE NOT NULL,
    total_rooms SMALLINT NOT NULL,
    booked_rooms SMALLINT NOT NULL DEFAULT 0,
    available_rooms SMALLINT GENERATED ALWAYS AS (total_rooms - booked_rooms) STORED,
    closed_to_arrival BOOLEAN DEFAULT FALSE,
    closed_to_departure BOOLEAN DEFAULT FALSE,
    UNIQUE(property_id, room_type_code, date)
);

CREATE INDEX idx_availability_lookup ON gds_availability(property_id, room_type_code, date);

-- Agents
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

CREATE INDEX idx_agents_tenant ON gds_agents(tenant_id);
CREATE INDEX idx_agents_email ON gds_agents(email);
CREATE INDEX idx_agents_api_key ON gds_agents(api_key);

-- Reservations
CREATE TABLE IF NOT EXISTS gds_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES gds_tenants(id),
    confirmation_no VARCHAR(20) UNIQUE NOT NULL,
    property_id UUID NOT NULL REFERENCES gds_properties(id),
    agent_id UUID REFERENCES gds_agents(id),
    room_type_code VARCHAR(10) NOT NULL,
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

CREATE INDEX idx_reservations_tenant ON gds_reservations(tenant_id);
CREATE INDEX idx_reservations_property ON gds_reservations(property_id);
CREATE INDEX idx_reservations_agent ON gds_reservations(agent_id);
CREATE INDEX idx_reservations_dates ON gds_reservations(check_in, check_out);
CREATE INDEX idx_reservations_status ON gds_reservations(status);

-- Settlement Batches
CREATE TABLE IF NOT EXISTS gds_settlement_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES gds_tenants(id),
    property_id UUID NOT NULL REFERENCES gds_properties(id),
    agent_id UUID NOT NULL REFERENCES gds_agents(id),
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

CREATE INDEX idx_settlements_tenant ON gds_settlement_batches(tenant_id);
CREATE INDEX idx_settlements_status ON gds_settlement_batches(status);

-- Distribution Channels
CREATE TABLE IF NOT EXISTS gds_distribution_channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES gds_tenants(id),
    agent_id UUID NOT NULL REFERENCES gds_agents(id),
    type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    endpoint VARCHAR(500),
    subscribed_properties UUID[] DEFAULT '{}',
    subscribed_countries TEXT[] DEFAULT '{}',
    last_push TIMESTAMPTZ,
    last_pull TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Parity Alerts
CREATE TABLE IF NOT EXISTS gds_parity_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES gds_tenants(id),
    property_id UUID NOT NULL REFERENCES gds_properties(id),
    room_type_code VARCHAR(10) NOT NULL,
    date DATE NOT NULL,
    gds_rate DECIMAL(12,2) NOT NULL,
    channel_name VARCHAR(100) NOT NULL,
    channel_rate DECIMAL(12,2) NOT NULL,
    variance_pct DECIMAL(5,2) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    resolved BOOLEAN DEFAULT FALSE,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_parity_alerts_property ON gds_parity_alerts(property_id);
CREATE INDEX idx_parity_alerts_severity ON gds_parity_alerts(severity);

-- Webhooks
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

-- Insert default tenant
INSERT INTO gds_tenants (id, name, slug, plan) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Default', 'default', 'enterprise')
ON CONFLICT (slug) DO NOTHING;
