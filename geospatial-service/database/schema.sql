-- PostGIS Geospatial Database Schema
-- Nigerian Insurance Platform - Geospatial Data Layer

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
CREATE EXTENSION IF NOT EXISTS postgis_tiger_geocoder;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema for geospatial data
CREATE SCHEMA IF NOT EXISTS geospatial;

-- ============================================================================
-- NIGERIAN ADMINISTRATIVE BOUNDARIES
-- ============================================================================

-- States table with boundaries
CREATE TABLE geospatial.states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(10) NOT NULL UNIQUE,
    capital VARCHAR(100),
    region VARCHAR(50), -- North-Central, North-East, North-West, South-East, South-South, South-West
    boundary GEOMETRY(MULTIPOLYGON, 4326),
    centroid GEOMETRY(POINT, 4326),
    area_sq_km DECIMAL(12, 2),
    population BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Local Government Areas (LGAs)
CREATE TABLE geospatial.lgas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    state_id UUID REFERENCES geospatial.states(id),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),
    boundary GEOMETRY(MULTIPOLYGON, 4326),
    centroid GEOMETRY(POINT, 4326),
    area_sq_km DECIMAL(12, 2),
    population BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(state_id, name)
);

-- ============================================================================
-- POLICY LOCATIONS
-- ============================================================================

CREATE TABLE geospatial.policy_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_id UUID NOT NULL UNIQUE,
    customer_id UUID NOT NULL,
    policy_type VARCHAR(50) NOT NULL, -- HEALTH, AUTO, PROPERTY, LIFE
    
    -- Address components
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state_code VARCHAR(10),
    lga_id UUID REFERENCES geospatial.lgas(id),
    postal_code VARCHAR(20),
    country VARCHAR(50) DEFAULT 'Nigeria',
    
    -- Geospatial data
    location GEOMETRY(POINT, 4326),
    geocoding_accuracy VARCHAR(20), -- ROOFTOP, RANGE_INTERPOLATED, GEOMETRIC_CENTER, APPROXIMATE
    geocoding_source VARCHAR(50), -- GOOGLE, OPENSTREETMAP, MANUAL
    
    -- Risk zone assignments
    flood_risk_zone_id UUID,
    crime_risk_zone_id UUID,
    fire_risk_zone_id UUID,
    
    -- Metadata
    sum_assured DECIMAL(18, 2),
    premium_amount DECIMAL(18, 2),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Spatial index for policy locations
CREATE INDEX idx_policy_locations_geom ON geospatial.policy_locations USING GIST(location);
CREATE INDEX idx_policy_locations_state ON geospatial.policy_locations(state_code);
CREATE INDEX idx_policy_locations_type ON geospatial.policy_locations(policy_type);
CREATE INDEX idx_policy_locations_customer ON geospatial.policy_locations(customer_id);

-- ============================================================================
-- CLAIM LOCATIONS
-- ============================================================================

CREATE TABLE geospatial.claim_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_id UUID NOT NULL UNIQUE,
    policy_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    claim_type VARCHAR(50) NOT NULL, -- ACCIDENT, THEFT, FLOOD, FIRE, MEDICAL, etc.
    
    -- Incident location
    incident_address VARCHAR(500),
    incident_city VARCHAR(100),
    incident_state_code VARCHAR(10),
    incident_lga_id UUID REFERENCES geospatial.lgas(id),
    incident_location GEOMETRY(POINT, 4326),
    
    -- Claim details
    claim_amount DECIMAL(18, 2),
    incident_date TIMESTAMP,
    status VARCHAR(20) DEFAULT 'PENDING',
    
    -- Fraud detection flags
    is_clustered BOOLEAN DEFAULT FALSE,
    cluster_id UUID,
    distance_from_policy_km DECIMAL(10, 2),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Spatial index for claim locations
CREATE INDEX idx_claim_locations_geom ON geospatial.claim_locations USING GIST(incident_location);
CREATE INDEX idx_claim_locations_type ON geospatial.claim_locations(claim_type);
CREATE INDEX idx_claim_locations_date ON geospatial.claim_locations(incident_date);
CREATE INDEX idx_claim_locations_policy ON geospatial.claim_locations(policy_id);

-- ============================================================================
-- RISK ZONES
-- ============================================================================

-- Flood risk zones
CREATE TABLE geospatial.flood_risk_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100),
    risk_level VARCHAR(20) NOT NULL, -- LOW, MEDIUM, HIGH, CRITICAL
    boundary GEOMETRY(POLYGON, 4326),
    
    -- Risk metrics
    historical_claim_count INTEGER DEFAULT 0,
    historical_loss_amount DECIMAL(18, 2) DEFAULT 0,
    avg_claim_amount DECIMAL(18, 2),
    last_major_event DATE,
    
    -- Premium adjustment
    premium_multiplier DECIMAL(5, 2) DEFAULT 1.0,
    
    -- Data source
    data_source VARCHAR(100), -- NIMET, NEMA, HISTORICAL_CLAIMS
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_flood_risk_zones_geom ON geospatial.flood_risk_zones USING GIST(boundary);
CREATE INDEX idx_flood_risk_zones_level ON geospatial.flood_risk_zones(risk_level);

-- Crime risk zones
CREATE TABLE geospatial.crime_risk_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100),
    risk_level VARCHAR(20) NOT NULL,
    boundary GEOMETRY(POLYGON, 4326),
    
    -- Crime statistics
    theft_rate DECIMAL(10, 2), -- per 100,000 population
    robbery_rate DECIMAL(10, 2),
    vandalism_rate DECIMAL(10, 2),
    vehicle_theft_rate DECIMAL(10, 2),
    
    -- Premium adjustment
    premium_multiplier DECIMAL(5, 2) DEFAULT 1.0,
    
    data_source VARCHAR(100),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_crime_risk_zones_geom ON geospatial.crime_risk_zones USING GIST(boundary);

-- Fire risk zones
CREATE TABLE geospatial.fire_risk_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100),
    risk_level VARCHAR(20) NOT NULL,
    boundary GEOMETRY(POLYGON, 4326),
    
    -- Fire risk factors
    building_density VARCHAR(20), -- LOW, MEDIUM, HIGH
    fire_station_distance_km DECIMAL(10, 2),
    water_source_availability VARCHAR(20),
    historical_fire_count INTEGER DEFAULT 0,
    
    premium_multiplier DECIMAL(5, 2) DEFAULT 1.0,
    
    data_source VARCHAR(100),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fire_risk_zones_geom ON geospatial.fire_risk_zones USING GIST(boundary);

-- ============================================================================
-- AGENT LOCATIONS AND TERRITORIES
-- ============================================================================

CREATE TABLE geospatial.agent_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL UNIQUE,
    agent_name VARCHAR(200) NOT NULL,
    agent_type VARCHAR(50), -- INDIVIDUAL, CORPORATE, BROKER
    
    -- Office location
    office_address VARCHAR(500),
    office_city VARCHAR(100),
    office_state_code VARCHAR(10),
    office_location GEOMETRY(POINT, 4326),
    
    -- Service area
    service_radius_km DECIMAL(10, 2) DEFAULT 50,
    territory GEOMETRY(POLYGON, 4326),
    
    -- Performance metrics
    assigned_policies_count INTEGER DEFAULT 0,
    total_premium_managed DECIMAL(18, 2) DEFAULT 0,
    avg_response_time_hours DECIMAL(10, 2),
    
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_agent_locations_geom ON geospatial.agent_locations USING GIST(office_location);
CREATE INDEX idx_agent_locations_territory ON geospatial.agent_locations USING GIST(territory);
CREATE INDEX idx_agent_locations_state ON geospatial.agent_locations(office_state_code);

-- ============================================================================
-- HEALTHCARE PROVIDERS (for Health Insurance)
-- ============================================================================

CREATE TABLE geospatial.healthcare_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    provider_type VARCHAR(50), -- HOSPITAL, CLINIC, PHARMACY, DIAGNOSTIC_CENTER, SPECIALIST
    
    -- Location
    address VARCHAR(500),
    city VARCHAR(100),
    state_code VARCHAR(10),
    lga_id UUID REFERENCES geospatial.lgas(id),
    location GEOMETRY(POINT, 4326),
    
    -- Provider details
    is_network_provider BOOLEAN DEFAULT FALSE,
    tier VARCHAR(20), -- TIER1, TIER2, TIER3
    specialties TEXT[], -- Array of specialties
    services TEXT[],
    
    -- Contact
    phone VARCHAR(50),
    email VARCHAR(100),
    website VARCHAR(200),
    
    -- Operating hours
    operating_hours JSONB,
    is_24_hours BOOLEAN DEFAULT FALSE,
    accepts_emergency BOOLEAN DEFAULT FALSE,
    
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_healthcare_providers_geom ON geospatial.healthcare_providers USING GIST(location);
CREATE INDEX idx_healthcare_providers_type ON geospatial.healthcare_providers(provider_type);
CREATE INDEX idx_healthcare_providers_network ON geospatial.healthcare_providers(is_network_provider);

-- ============================================================================
-- AUTO REPAIR SHOPS (for Auto Insurance)
-- ============================================================================

CREATE TABLE geospatial.repair_shops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    shop_type VARCHAR(50), -- AUTHORIZED_DEALER, INDEPENDENT, SPECIALIST
    
    -- Location
    address VARCHAR(500),
    city VARCHAR(100),
    state_code VARCHAR(10),
    location GEOMETRY(POINT, 4326),
    
    -- Shop details
    is_network_provider BOOLEAN DEFAULT FALSE,
    brands_serviced TEXT[],
    services TEXT[], -- BODY_WORK, MECHANICAL, ELECTRICAL, PAINTING, etc.
    
    -- Ratings
    avg_rating DECIMAL(3, 2),
    total_reviews INTEGER DEFAULT 0,
    avg_repair_time_days DECIMAL(5, 2),
    
    phone VARCHAR(50),
    email VARCHAR(100),
    
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_repair_shops_geom ON geospatial.repair_shops USING GIST(location);
CREATE INDEX idx_repair_shops_network ON geospatial.repair_shops(is_network_provider);

-- ============================================================================
-- GEOSPATIAL ANALYTICS VIEWS
-- ============================================================================

-- Policy density by LGA
CREATE OR REPLACE VIEW geospatial.v_policy_density_by_lga AS
SELECT 
    l.id as lga_id,
    l.name as lga_name,
    s.name as state_name,
    COUNT(p.id) as policy_count,
    SUM(p.sum_assured) as total_sum_assured,
    SUM(p.premium_amount) as total_premium,
    l.boundary,
    l.centroid
FROM geospatial.lgas l
JOIN geospatial.states s ON l.state_id = s.id
LEFT JOIN geospatial.policy_locations p ON p.lga_id = l.id
GROUP BY l.id, l.name, s.name, l.boundary, l.centroid;

-- Claims heatmap data
CREATE OR REPLACE VIEW geospatial.v_claims_heatmap AS
SELECT 
    c.incident_location,
    c.claim_type,
    c.claim_amount,
    c.incident_date,
    c.status,
    ST_X(c.incident_location) as longitude,
    ST_Y(c.incident_location) as latitude
FROM geospatial.claim_locations c
WHERE c.incident_location IS NOT NULL;

-- Risk score by location
CREATE OR REPLACE VIEW geospatial.v_location_risk_scores AS
SELECT 
    p.id,
    p.policy_id,
    p.location,
    ST_X(p.location) as longitude,
    ST_Y(p.location) as latitude,
    p.policy_type,
    COALESCE(f.risk_level, 'LOW') as flood_risk,
    COALESCE(f.premium_multiplier, 1.0) as flood_multiplier,
    COALESCE(c.risk_level, 'LOW') as crime_risk,
    COALESCE(c.premium_multiplier, 1.0) as crime_multiplier,
    COALESCE(fr.risk_level, 'LOW') as fire_risk,
    COALESCE(fr.premium_multiplier, 1.0) as fire_multiplier,
    (COALESCE(f.premium_multiplier, 1.0) * 
     COALESCE(c.premium_multiplier, 1.0) * 
     COALESCE(fr.premium_multiplier, 1.0)) as combined_multiplier
FROM geospatial.policy_locations p
LEFT JOIN geospatial.flood_risk_zones f ON ST_Within(p.location, f.boundary)
LEFT JOIN geospatial.crime_risk_zones c ON ST_Within(p.location, c.boundary)
LEFT JOIN geospatial.fire_risk_zones fr ON ST_Within(p.location, fr.boundary);

-- ============================================================================
-- GEOSPATIAL FUNCTIONS
-- ============================================================================

-- Find nearest agents to a location
CREATE OR REPLACE FUNCTION geospatial.find_nearest_agents(
    p_longitude DECIMAL,
    p_latitude DECIMAL,
    p_limit INTEGER DEFAULT 5,
    p_max_distance_km DECIMAL DEFAULT 100
)
RETURNS TABLE (
    agent_id UUID,
    agent_name VARCHAR,
    office_address VARCHAR,
    distance_km DECIMAL,
    assigned_policies_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.agent_id,
        a.agent_name,
        a.office_address,
        ROUND((ST_Distance(
            a.office_location::geography,
            ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography
        ) / 1000)::DECIMAL, 2) as distance_km,
        a.assigned_policies_count
    FROM geospatial.agent_locations a
    WHERE a.status = 'ACTIVE'
    AND ST_DWithin(
        a.office_location::geography,
        ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
        p_max_distance_km * 1000
    )
    ORDER BY a.office_location <-> ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Find nearest healthcare providers
CREATE OR REPLACE FUNCTION geospatial.find_nearest_healthcare(
    p_longitude DECIMAL,
    p_latitude DECIMAL,
    p_provider_type VARCHAR DEFAULT NULL,
    p_network_only BOOLEAN DEFAULT TRUE,
    p_limit INTEGER DEFAULT 10,
    p_max_distance_km DECIMAL DEFAULT 50
)
RETURNS TABLE (
    provider_id UUID,
    name VARCHAR,
    provider_type VARCHAR,
    address VARCHAR,
    distance_km DECIMAL,
    is_24_hours BOOLEAN,
    accepts_emergency BOOLEAN,
    phone VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        h.provider_id,
        h.name,
        h.provider_type,
        h.address,
        ROUND((ST_Distance(
            h.location::geography,
            ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography
        ) / 1000)::DECIMAL, 2) as distance_km,
        h.is_24_hours,
        h.accepts_emergency,
        h.phone
    FROM geospatial.healthcare_providers h
    WHERE h.status = 'ACTIVE'
    AND (p_provider_type IS NULL OR h.provider_type = p_provider_type)
    AND (NOT p_network_only OR h.is_network_provider = TRUE)
    AND ST_DWithin(
        h.location::geography,
        ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
        p_max_distance_km * 1000
    )
    ORDER BY h.location <-> ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Calculate risk score for a location
CREATE OR REPLACE FUNCTION geospatial.calculate_location_risk(
    p_longitude DECIMAL,
    p_latitude DECIMAL,
    p_policy_type VARCHAR
)
RETURNS TABLE (
    flood_risk VARCHAR,
    flood_multiplier DECIMAL,
    crime_risk VARCHAR,
    crime_multiplier DECIMAL,
    fire_risk VARCHAR,
    fire_multiplier DECIMAL,
    combined_risk_score INTEGER,
    combined_multiplier DECIMAL,
    risk_factors JSONB
) AS $$
DECLARE
    v_point GEOMETRY;
    v_flood_risk VARCHAR := 'LOW';
    v_flood_mult DECIMAL := 1.0;
    v_crime_risk VARCHAR := 'LOW';
    v_crime_mult DECIMAL := 1.0;
    v_fire_risk VARCHAR := 'LOW';
    v_fire_mult DECIMAL := 1.0;
    v_risk_score INTEGER := 0;
    v_risk_factors JSONB := '[]'::JSONB;
BEGIN
    v_point := ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326);
    
    -- Check flood risk
    SELECT f.risk_level, f.premium_multiplier
    INTO v_flood_risk, v_flood_mult
    FROM geospatial.flood_risk_zones f
    WHERE ST_Within(v_point, f.boundary)
    ORDER BY f.premium_multiplier DESC
    LIMIT 1;
    
    IF v_flood_risk IS NULL THEN
        v_flood_risk := 'LOW';
        v_flood_mult := 1.0;
    END IF;
    
    -- Check crime risk
    SELECT c.risk_level, c.premium_multiplier
    INTO v_crime_risk, v_crime_mult
    FROM geospatial.crime_risk_zones c
    WHERE ST_Within(v_point, c.boundary)
    ORDER BY c.premium_multiplier DESC
    LIMIT 1;
    
    IF v_crime_risk IS NULL THEN
        v_crime_risk := 'LOW';
        v_crime_mult := 1.0;
    END IF;
    
    -- Check fire risk
    SELECT fr.risk_level, fr.premium_multiplier
    INTO v_fire_risk, v_fire_mult
    FROM geospatial.fire_risk_zones fr
    WHERE ST_Within(v_point, fr.boundary)
    ORDER BY fr.premium_multiplier DESC
    LIMIT 1;
    
    IF v_fire_risk IS NULL THEN
        v_fire_risk := 'LOW';
        v_fire_mult := 1.0;
    END IF;
    
    -- Calculate combined risk score (0-100)
    v_risk_score := 
        CASE v_flood_risk WHEN 'CRITICAL' THEN 30 WHEN 'HIGH' THEN 20 WHEN 'MEDIUM' THEN 10 ELSE 0 END +
        CASE v_crime_risk WHEN 'CRITICAL' THEN 30 WHEN 'HIGH' THEN 20 WHEN 'MEDIUM' THEN 10 ELSE 0 END +
        CASE v_fire_risk WHEN 'CRITICAL' THEN 30 WHEN 'HIGH' THEN 20 WHEN 'MEDIUM' THEN 10 ELSE 0 END;
    
    -- Build risk factors JSON
    v_risk_factors := jsonb_build_array(
        jsonb_build_object('type', 'flood', 'level', v_flood_risk, 'multiplier', v_flood_mult),
        jsonb_build_object('type', 'crime', 'level', v_crime_risk, 'multiplier', v_crime_mult),
        jsonb_build_object('type', 'fire', 'level', v_fire_risk, 'multiplier', v_fire_mult)
    );
    
    RETURN QUERY SELECT 
        v_flood_risk,
        v_flood_mult,
        v_crime_risk,
        v_crime_mult,
        v_fire_risk,
        v_fire_mult,
        v_risk_score,
        (v_flood_mult * v_crime_mult * v_fire_mult),
        v_risk_factors;
END;
$$ LANGUAGE plpgsql;

-- Detect claim clusters (potential fraud)
CREATE OR REPLACE FUNCTION geospatial.detect_claim_clusters(
    p_distance_km DECIMAL DEFAULT 1.0,
    p_time_window_days INTEGER DEFAULT 30,
    p_min_claims INTEGER DEFAULT 3
)
RETURNS TABLE (
    cluster_id UUID,
    claim_ids UUID[],
    claim_count INTEGER,
    total_amount DECIMAL,
    centroid_longitude DECIMAL,
    centroid_latitude DECIMAL,
    radius_km DECIMAL,
    earliest_date TIMESTAMP,
    latest_date TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    WITH claim_pairs AS (
        SELECT 
            c1.id as claim1_id,
            c2.id as claim2_id,
            c1.incident_location as loc1,
            c2.incident_location as loc2,
            c1.claim_amount as amount1,
            c2.claim_amount as amount2,
            c1.incident_date as date1,
            c2.incident_date as date2
        FROM geospatial.claim_locations c1
        JOIN geospatial.claim_locations c2 ON c1.id < c2.id
        WHERE ST_DWithin(
            c1.incident_location::geography,
            c2.incident_location::geography,
            p_distance_km * 1000
        )
        AND ABS(EXTRACT(EPOCH FROM (c1.incident_date - c2.incident_date)) / 86400) <= p_time_window_days
    ),
    clusters AS (
        SELECT 
            uuid_generate_v4() as cluster_id,
            ARRAY_AGG(DISTINCT claim1_id) || ARRAY_AGG(DISTINCT claim2_id) as all_claims
        FROM claim_pairs
        GROUP BY claim1_id
        HAVING COUNT(*) >= p_min_claims - 1
    )
    SELECT 
        cl.cluster_id,
        ARRAY(SELECT DISTINCT unnest(cl.all_claims)) as claim_ids,
        CARDINALITY(ARRAY(SELECT DISTINCT unnest(cl.all_claims))) as claim_count,
        (SELECT SUM(c.claim_amount) FROM geospatial.claim_locations c WHERE c.id = ANY(cl.all_claims)) as total_amount,
        ST_X(ST_Centroid(ST_Collect(ARRAY(
            SELECT c.incident_location FROM geospatial.claim_locations c WHERE c.id = ANY(cl.all_claims)
        )))) as centroid_longitude,
        ST_Y(ST_Centroid(ST_Collect(ARRAY(
            SELECT c.incident_location FROM geospatial.claim_locations c WHERE c.id = ANY(cl.all_claims)
        )))) as centroid_latitude,
        p_distance_km as radius_km,
        (SELECT MIN(c.incident_date) FROM geospatial.claim_locations c WHERE c.id = ANY(cl.all_claims)) as earliest_date,
        (SELECT MAX(c.incident_date) FROM geospatial.claim_locations c WHERE c.id = ANY(cl.all_claims)) as latest_date
    FROM clusters cl;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DATA: Nigerian States
-- ============================================================================

INSERT INTO geospatial.states (name, code, capital, region) VALUES
('Abia', 'AB', 'Umuahia', 'South-East'),
('Adamawa', 'AD', 'Yola', 'North-East'),
('Akwa Ibom', 'AK', 'Uyo', 'South-South'),
('Anambra', 'AN', 'Awka', 'South-East'),
('Bauchi', 'BA', 'Bauchi', 'North-East'),
('Bayelsa', 'BY', 'Yenagoa', 'South-South'),
('Benue', 'BE', 'Makurdi', 'North-Central'),
('Borno', 'BO', 'Maiduguri', 'North-East'),
('Cross River', 'CR', 'Calabar', 'South-South'),
('Delta', 'DE', 'Asaba', 'South-South'),
('Ebonyi', 'EB', 'Abakaliki', 'South-East'),
('Edo', 'ED', 'Benin City', 'South-South'),
('Ekiti', 'EK', 'Ado-Ekiti', 'South-West'),
('Enugu', 'EN', 'Enugu', 'South-East'),
('FCT', 'FC', 'Abuja', 'North-Central'),
('Gombe', 'GO', 'Gombe', 'North-East'),
('Imo', 'IM', 'Owerri', 'South-East'),
('Jigawa', 'JI', 'Dutse', 'North-West'),
('Kaduna', 'KD', 'Kaduna', 'North-West'),
('Kano', 'KN', 'Kano', 'North-West'),
('Katsina', 'KT', 'Katsina', 'North-West'),
('Kebbi', 'KE', 'Birnin Kebbi', 'North-West'),
('Kogi', 'KO', 'Lokoja', 'North-Central'),
('Kwara', 'KW', 'Ilorin', 'North-Central'),
('Lagos', 'LA', 'Ikeja', 'South-West'),
('Nasarawa', 'NA', 'Lafia', 'North-Central'),
('Niger', 'NI', 'Minna', 'North-Central'),
('Ogun', 'OG', 'Abeokuta', 'South-West'),
('Ondo', 'ON', 'Akure', 'South-West'),
('Osun', 'OS', 'Osogbo', 'South-West'),
('Oyo', 'OY', 'Ibadan', 'South-West'),
('Plateau', 'PL', 'Jos', 'North-Central'),
('Rivers', 'RI', 'Port Harcourt', 'South-South'),
('Sokoto', 'SO', 'Sokoto', 'North-West'),
('Taraba', 'TA', 'Jalingo', 'North-East'),
('Yobe', 'YO', 'Damaturu', 'North-East'),
('Zamfara', 'ZA', 'Gusau', 'North-West')
ON CONFLICT (code) DO NOTHING;

-- Grant permissions
GRANT USAGE ON SCHEMA geospatial TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA geospatial TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA geospatial TO PUBLIC;
