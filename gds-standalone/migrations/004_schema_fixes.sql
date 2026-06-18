-- Migration 004: Schema fixes for route compatibility
-- Adds missing columns needed by the rewritten DB-backed routes

-- Availability needs updated_at for PUT
ALTER TABLE gds_availability ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Guest profiles need first_name/last_name for analytics (keep name for backward compat)
ALTER TABLE gds_guest_profiles ADD COLUMN IF NOT EXISTS first_name VARCHAR(255);
ALTER TABLE gds_guest_profiles ADD COLUMN IF NOT EXISTS last_name VARCHAR(255);

-- Reservations: add guest_id FK for reservations→guest join
ALTER TABLE gds_reservations ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES gds_guest_profiles(id);

-- Availability: allow nullable room_type_code for property-level availability
ALTER TABLE gds_availability ALTER COLUMN room_type_code DROP NOT NULL;

-- Add missing index for search performance
CREATE INDEX IF NOT EXISTS idx_properties_name_trgm ON gds_properties USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_properties_city_trgm ON gds_properties USING gin (city gin_trgm_ops);
