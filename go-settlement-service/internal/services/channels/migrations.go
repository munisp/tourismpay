package channels

import (
	"database/sql"
	"log"
)

// RunMigrations creates channel manager tables if they don't exist.
func RunMigrations(db *sql.DB) error {
	if db == nil {
		return nil
	}

	migrations := []string{
		`CREATE TABLE IF NOT EXISTS channel_connections (
			id VARCHAR(64) PRIMARY KEY,
			name VARCHAR(50) NOT NULL,
			display_name VARCHAR(100) NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'active',
			config JSONB NOT NULL DEFAULT '{}',
			last_sync_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_channel_conn_name ON channel_connections(name)`,
		`CREATE INDEX IF NOT EXISTS idx_channel_conn_status ON channel_connections(status)`,

		`CREATE TABLE IF NOT EXISTS channel_rate_updates (
			id SERIAL PRIMARY KEY,
			channel_id VARCHAR(64) NOT NULL REFERENCES channel_connections(id),
			establishment_id INTEGER NOT NULL,
			product_id INTEGER NOT NULL,
			room_type_code VARCHAR(50),
			rate_plan_code VARCHAR(50),
			date DATE NOT NULL,
			price DECIMAL(12,2) NOT NULL,
			currency CHAR(3) NOT NULL,
			min_stay INTEGER DEFAULT 1,
			max_stay INTEGER,
			closed_to_arrival BOOLEAN DEFAULT FALSE,
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			sent_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_rate_updates_channel_status ON channel_rate_updates(channel_id, status)`,
		`CREATE INDEX IF NOT EXISTS idx_rate_updates_date ON channel_rate_updates(date)`,

		`CREATE TABLE IF NOT EXISTS channel_availability_updates (
			id SERIAL PRIMARY KEY,
			channel_id VARCHAR(64) NOT NULL REFERENCES channel_connections(id),
			establishment_id INTEGER NOT NULL,
			product_id INTEGER NOT NULL,
			date DATE NOT NULL,
			total_slots INTEGER NOT NULL DEFAULT 0,
			available_slots INTEGER NOT NULL DEFAULT 0,
			is_blocked BOOLEAN DEFAULT FALSE,
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			sent_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_avail_updates_channel_status ON channel_availability_updates(channel_id, status)`,

		`CREATE TABLE IF NOT EXISTS channel_inbound_bookings (
			id VARCHAR(64) PRIMARY KEY,
			channel_id VARCHAR(64) NOT NULL,
			channel_booking_ref VARCHAR(255) NOT NULL UNIQUE,
			establishment_id INTEGER,
			product_id INTEGER,
			guest_name VARCHAR(255),
			guest_email VARCHAR(255),
			guest_phone VARCHAR(50),
			check_in DATE,
			check_out DATE,
			nights INTEGER,
			party_size INTEGER DEFAULT 1,
			total_price DECIMAL(12,2),
			currency CHAR(3),
			status VARCHAR(30) NOT NULL DEFAULT 'confirmed',
			raw_payload JSONB,
			received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			processed_at TIMESTAMPTZ
		)`,
		`CREATE INDEX IF NOT EXISTS idx_inbound_bookings_channel ON channel_inbound_bookings(channel_id)`,
		`CREATE INDEX IF NOT EXISTS idx_inbound_bookings_est ON channel_inbound_bookings(establishment_id)`,
		`CREATE INDEX IF NOT EXISTS idx_inbound_bookings_status ON channel_inbound_bookings(status)`,

		`CREATE TABLE IF NOT EXISTS channel_sync_log (
			id SERIAL PRIMARY KEY,
			channel_id VARCHAR(64) NOT NULL,
			operation VARCHAR(30) NOT NULL,
			items_total INTEGER DEFAULT 0,
			items_success INTEGER DEFAULT 0,
			items_failed INTEGER DEFAULT 0,
			errors JSONB DEFAULT '[]',
			duration_ms BIGINT DEFAULT 0,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_sync_log_channel ON channel_sync_log(channel_id, created_at DESC)`,

		`CREATE TABLE IF NOT EXISTS channel_webhooks (
			id VARCHAR(64) PRIMARY KEY,
			channel_name VARCHAR(50) NOT NULL,
			payload JSONB NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			processed_at TIMESTAMPTZ,
			error_message TEXT,
			received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_webhooks_status ON channel_webhooks(status)`,

		// Rate parity monitoring — detect price differences across channels
		`CREATE TABLE IF NOT EXISTS channel_rate_parity (
			id SERIAL PRIMARY KEY,
			establishment_id INTEGER NOT NULL,
			product_id INTEGER NOT NULL,
			date DATE NOT NULL,
			base_price DECIMAL(12,2) NOT NULL,
			channel_prices JSONB NOT NULL DEFAULT '{}',
			parity_status VARCHAR(20) DEFAULT 'ok',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE(establishment_id, product_id, date)
		)`,
	}

	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil {
			log.Printf("[ChannelManager] Migration warning: %v", err)
			// Continue — non-fatal (e.g., table already exists)
		}
	}

	log.Println("[ChannelManager] Migrations complete")
	return nil
}
