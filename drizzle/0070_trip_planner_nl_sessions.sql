-- Trip Planner NL Sessions & Conversation History
-- Supports multi-turn conversational trip planning with merchant-linked itineraries

-- NL trip planning sessions
CREATE TABLE IF NOT EXISTS trip_planner_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    country_code VARCHAR(2) NOT NULL DEFAULT 'NG',
    destination VARCHAR(128),
    duration_days INTEGER NOT NULL DEFAULT 5,
    budget_level VARCHAR(16) NOT NULL DEFAULT 'mid-range',
    budget_usd NUMERIC(18,2),
    interests TEXT[] DEFAULT '{}',
    travelers INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- active | completed | abandoned
    itinerary_id INTEGER REFERENCES tourist_itineraries(id) ON DELETE SET NULL,
    merchant_coverage_pct INTEGER DEFAULT 0,
    total_cost_usd NUMERIC(18,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Conversation messages within a session
CREATE TABLE IF NOT EXISTS trip_planner_messages (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES trip_planner_sessions(id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL, -- user | assistant | system
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}', -- intent parse results, itinerary snapshots, etc.
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Merchant recommendations per session (tracks which merchants were shown)
CREATE TABLE IF NOT EXISTS trip_planner_recommendations (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES trip_planner_sessions(id) ON DELETE CASCADE,
    establishment_id INTEGER REFERENCES establishments(id) ON DELETE SET NULL,
    product_id INTEGER REFERENCES merchant_products(id) ON DELETE SET NULL,
    day_number INTEGER,
    time_slot VARCHAR(16),
    cost_usd NUMERIC(18,2),
    booked BOOLEAN NOT NULL DEFAULT false,
    booking_id INTEGER REFERENCES tourist_bookings(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_tps_user ON trip_planner_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_tps_country ON trip_planner_sessions(country_code);
CREATE INDEX IF NOT EXISTS idx_tps_status ON trip_planner_sessions(status);
CREATE INDEX IF NOT EXISTS idx_tpm_session ON trip_planner_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_tpm_role ON trip_planner_messages(role);
CREATE INDEX IF NOT EXISTS idx_tpr_session ON trip_planner_recommendations(session_id);
CREATE INDEX IF NOT EXISTS idx_tpr_establishment ON trip_planner_recommendations(establishment_id);
CREATE INDEX IF NOT EXISTS idx_tpr_booked ON trip_planner_recommendations(booked);
