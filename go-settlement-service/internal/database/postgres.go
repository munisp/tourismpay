package database

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"time"

	_ "github.com/lib/pq"
)

var DB *sql.DB

func Connect() error {
	dsn := os.Getenv("SETTLEMENT_DATABASE_URL")
	if dsn == "" {
		dsn = os.Getenv("DATABASE_URL")
	}
	if dsn == "" {
		dsn = "postgres://postgres:postgres@localhost:5432/tourismpay_settlement?sslmode=disable"
	}

	var err error
	DB, err = sql.Open("postgres", dsn)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	DB.SetMaxOpenConns(25)
	DB.SetMaxIdleConns(10)
	DB.SetConnMaxLifetime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := DB.PingContext(ctx); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	if err := runMigrations(); err != nil {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	return nil
}

func Close() {
	if DB != nil {
		DB.Close()
	}
}

func runMigrations() error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS ledger_accounts (
			id BIGINT PRIMARY KEY,
			entity_type VARCHAR(64) NOT NULL,
			entity_id VARCHAR(128) NOT NULL,
			currency VARCHAR(10) NOT NULL,
			debits_pending BIGINT NOT NULL DEFAULT 0,
			debits_posted BIGINT NOT NULL DEFAULT 0,
			credits_pending BIGINT NOT NULL DEFAULT 0,
			credits_posted BIGINT NOT NULL DEFAULT 0,
			ledger_code INT NOT NULL DEFAULT 1,
			account_code SMALLINT NOT NULL DEFAULT 840,
			flags SMALLINT NOT NULL DEFAULT 0,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE(entity_type, entity_id, currency)
		)`,
		`CREATE TABLE IF NOT EXISTS ledger_transfers (
			id BIGINT PRIMARY KEY,
			debit_account_id BIGINT NOT NULL REFERENCES ledger_accounts(id),
			credit_account_id BIGINT NOT NULL REFERENCES ledger_accounts(id),
			amount BIGINT NOT NULL,
			pending_id BIGINT DEFAULT 0,
			ledger_code INT NOT NULL DEFAULT 1,
			transfer_code SMALLINT NOT NULL DEFAULT 1,
			flags SMALLINT NOT NULL DEFAULT 0,
			reference VARCHAR(256),
			status VARCHAR(20) NOT NULL DEFAULT 'posted',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_transfers_debit ON ledger_transfers(debit_account_id)`,
		`CREATE INDEX IF NOT EXISTS idx_transfers_credit ON ledger_transfers(credit_account_id)`,
		`CREATE INDEX IF NOT EXISTS idx_transfers_status ON ledger_transfers(status)`,
		`CREATE INDEX IF NOT EXISTS idx_accounts_entity ON ledger_accounts(entity_type, entity_id)`,
		`CREATE TABLE IF NOT EXISTS settlement_batches (
			id VARCHAR(64) PRIMARY KEY,
			provider_id VARCHAR(128) NOT NULL,
			total_amount DECIMAL(18,2) NOT NULL,
			net_amount DECIMAL(18,2) NOT NULL,
			fee_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
			currency VARCHAR(10) NOT NULL DEFAULT 'USD',
			transaction_count INT NOT NULL DEFAULT 0,
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
			processed_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS pending_settlements (
			id SERIAL PRIMARY KEY,
			provider_id VARCHAR(128) NOT NULL,
			booking_id VARCHAR(128) NOT NULL,
			amount DECIMAL(18,2) NOT NULL,
			platform_fee DECIMAL(18,2) NOT NULL DEFAULT 0,
			processing_fee DECIMAL(18,2) NOT NULL DEFAULT 0,
			currency VARCHAR(10) NOT NULL DEFAULT 'USD',
			batch_id VARCHAR(64),
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			settled_at TIMESTAMPTZ
		)`,
		`CREATE INDEX IF NOT EXISTS idx_pending_provider ON pending_settlements(provider_id, status)`,
		`CREATE TABLE IF NOT EXISTS inventory_items (
			item_id VARCHAR(64) PRIMARY KEY,
			provider_id VARCHAR(128) NOT NULL,
			item_type VARCHAR(64) NOT NULL,
			name VARCHAR(256) NOT NULL,
			available_quantity INT NOT NULL DEFAULT 0,
			reserved_quantity INT NOT NULL DEFAULT 0,
			price DECIMAL(18,2) NOT NULL,
			currency VARCHAR(10) NOT NULL DEFAULT 'USD',
			last_synced TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			sync_source VARCHAR(64) NOT NULL DEFAULT 'api'
		)`,
		`CREATE TABLE IF NOT EXISTS inventory_reservations (
			reservation_id VARCHAR(64) PRIMARY KEY,
			item_id VARCHAR(64) NOT NULL REFERENCES inventory_items(item_id),
			quantity INT NOT NULL,
			booking_ref VARCHAR(128),
			status VARCHAR(20) NOT NULL DEFAULT 'held',
			expires_at TIMESTAMPTZ NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS sync_jobs (
			job_id VARCHAR(64) PRIMARY KEY,
			partner_id VARCHAR(128) NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
			items_synced INT NOT NULL DEFAULT 0,
			errors TEXT[] NOT NULL DEFAULT '{}',
			started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			completed_at TIMESTAMPTZ
		)`,
		`CREATE INDEX IF NOT EXISTS idx_sync_jobs_partner ON sync_jobs(partner_id, status)`,
		`CREATE TABLE IF NOT EXISTS partner_webhooks (
			partner_id VARCHAR(128) PRIMARY KEY,
			webhook_url TEXT NOT NULL,
			registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS mojaloop_participants (
			fsp_id VARCHAR(64) PRIMARY KEY,
			name VARCHAR(256) NOT NULL,
			currency VARCHAR(10) NOT NULL DEFAULT 'USD',
			account_id VARCHAR(128),
			is_active BOOLEAN NOT NULL DEFAULT true,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS mojaloop_transfers (
			transfer_id VARCHAR(64) PRIMARY KEY,
			quote_id VARCHAR(64),
			payer_fsp VARCHAR(64) NOT NULL,
			payee_fsp VARCHAR(64) NOT NULL,
			amount DECIMAL(18,2) NOT NULL,
			currency VARCHAR(10) NOT NULL DEFAULT 'USD',
			state VARCHAR(20) NOT NULL DEFAULT 'RECEIVED',
			fulfilment VARCHAR(256),
			completed_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		// Tipping service
		`CREATE TABLE IF NOT EXISTS tip_transactions (
			id VARCHAR(64) PRIMARY KEY,
			transaction_id VARCHAR(128) NOT NULL,
			payer_id VARCHAR(128) NOT NULL,
			recipient_id VARCHAR(128) NOT NULL,
			establishment_id INT NOT NULL,
			amount DECIMAL(18,2) NOT NULL,
			currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
			tip_type VARCHAR(20) NOT NULL DEFAULT 'PERCENTAGE',
			distribution VARCHAR(20) NOT NULL DEFAULT 'DIRECT',
			jurisdiction_code VARCHAR(10) NOT NULL DEFAULT 'NG',
			tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
			net_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
			status VARCHAR(20) NOT NULL DEFAULT 'completed',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_tips_payer ON tip_transactions(payer_id)`,
		`CREATE INDEX IF NOT EXISTS idx_tips_recipient ON tip_transactions(recipient_id)`,
		// Bank transfers
		`CREATE TABLE IF NOT EXISTS bank_transfers (
			id VARCHAR(64) PRIMARY KEY,
			user_id VARCHAR(128) NOT NULL,
			beneficiary_name VARCHAR(256) NOT NULL,
			bank_code VARCHAR(20) NOT NULL,
			account_number VARCHAR(20) NOT NULL,
			amount DECIMAL(18,2) NOT NULL,
			currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
			reference VARCHAR(256),
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			completed_at TIMESTAMPTZ
		)`,
		`CREATE INDEX IF NOT EXISTS idx_bank_transfers_user ON bank_transfers(user_id)`,
		// Agent banking
		`CREATE TABLE IF NOT EXISTS agent_transactions (
			id VARCHAR(64) PRIMARY KEY,
			agent_id VARCHAR(128) NOT NULL,
			customer_id VARCHAR(128),
			transaction_type VARCHAR(20) NOT NULL,
			amount DECIMAL(18,2) NOT NULL,
			currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
			commission DECIMAL(18,2) NOT NULL DEFAULT 0,
			status VARCHAR(20) NOT NULL DEFAULT 'completed',
			location_lat DECIMAL(10,6),
			location_lng DECIMAL(10,6),
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_agent_tx_agent ON agent_transactions(agent_id)`,
		// Virtual cards
		`CREATE TABLE IF NOT EXISTS virtual_cards (
			id VARCHAR(64) PRIMARY KEY,
			user_id VARCHAR(128) NOT NULL,
			card_number VARCHAR(19) NOT NULL,
			card_type VARCHAR(20) NOT NULL DEFAULT 'VISA',
			currency VARCHAR(10) NOT NULL DEFAULT 'USD',
			balance DECIMAL(18,2) NOT NULL DEFAULT 0,
			spending_limit DECIMAL(18,2) NOT NULL DEFAULT 5000,
			status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
			expires_at TIMESTAMPTZ NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_vcards_user ON virtual_cards(user_id)`,
		// SWIFT/wire transfers
		`CREATE TABLE IF NOT EXISTS swift_transfers (
			id VARCHAR(64) PRIMARY KEY,
			sender_id VARCHAR(128) NOT NULL,
			recipient_iban VARCHAR(64) NOT NULL,
			recipient_swift VARCHAR(11) NOT NULL,
			amount DECIMAL(18,2) NOT NULL,
			currency VARCHAR(10) NOT NULL DEFAULT 'USD',
			fee DECIMAL(18,2) NOT NULL DEFAULT 0,
			reference VARCHAR(256),
			status VARCHAR(20) NOT NULL DEFAULT 'initiated',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		// Tax calculations
		`CREATE TABLE IF NOT EXISTS tax_calculations (
			id VARCHAR(64) PRIMARY KEY,
			jurisdiction_code VARCHAR(10) NOT NULL,
			base_amount DECIMAL(18,2) NOT NULL,
			total_tax DECIMAL(18,2) NOT NULL,
			total_with_tax DECIMAL(18,2) NOT NULL,
			currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
			category VARCHAR(64) NOT NULL DEFAULT 'accommodation',
			breakdown JSONB NOT NULL DEFAULT '[]',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		// Crypto transactions
		`CREATE TABLE IF NOT EXISTS crypto_transactions (
			id VARCHAR(64) PRIMARY KEY,
			user_id VARCHAR(128) NOT NULL,
			wallet_address VARCHAR(256),
			tx_type VARCHAR(20) NOT NULL,
			amount DECIMAL(18,8) NOT NULL,
			token VARCHAR(20) NOT NULL,
			chain VARCHAR(20) NOT NULL DEFAULT 'ethereum',
			tx_hash VARCHAR(128),
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		// CBDC transactions
		`CREATE TABLE IF NOT EXISTS cbdc_transactions (
			id VARCHAR(64) PRIMARY KEY,
			user_id VARCHAR(128) NOT NULL,
			cbdc_type VARCHAR(20) NOT NULL DEFAULT 'eNaira',
			amount DECIMAL(18,2) NOT NULL,
			currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
			direction VARCHAR(10) NOT NULL DEFAULT 'IN',
			reference VARCHAR(256),
			status VARCHAR(20) NOT NULL DEFAULT 'completed',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		// Offline NFC transactions
		`CREATE TABLE IF NOT EXISTS nfc_transactions (
			id VARCHAR(64) PRIMARY KEY,
			payer_device_id VARCHAR(128) NOT NULL,
			payee_device_id VARCHAR(128) NOT NULL,
			amount DECIMAL(18,2) NOT NULL,
			currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
			offline BOOLEAN NOT NULL DEFAULT true,
			synced BOOLEAN NOT NULL DEFAULT false,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			synced_at TIMESTAMPTZ
		)`,
		// USSD sessions
		`CREATE TABLE IF NOT EXISTS ussd_sessions (
			id VARCHAR(64) PRIMARY KEY,
			msisdn VARCHAR(20) NOT NULL,
			session_code VARCHAR(10) NOT NULL,
			current_menu VARCHAR(64) NOT NULL DEFAULT 'main',
			input_stack TEXT[] NOT NULL DEFAULT '{}',
			status VARCHAR(20) NOT NULL DEFAULT 'active',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		// Bill payments
		`CREATE TABLE IF NOT EXISTS bill_payments (
			id VARCHAR(64) PRIMARY KEY,
			user_id VARCHAR(128) NOT NULL,
			biller_code VARCHAR(64) NOT NULL,
			biller_name VARCHAR(256) NOT NULL,
			amount DECIMAL(18,2) NOT NULL,
			currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
			reference VARCHAR(256),
			status VARCHAR(20) NOT NULL DEFAULT 'completed',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		// Onramp/Offramp transactions
		`CREATE TABLE IF NOT EXISTS onramp_offramp_transactions (
			id VARCHAR(64) PRIMARY KEY,
			user_id VARCHAR(128) NOT NULL,
			direction VARCHAR(10) NOT NULL,
			rail VARCHAR(20) NOT NULL,
			fiat_amount DECIMAL(18,2) NOT NULL,
			fiat_currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
			crypto_amount DECIMAL(18,8),
			crypto_token VARCHAR(20),
			fee DECIMAL(18,2) NOT NULL DEFAULT 0,
			status VARCHAR(20) NOT NULL DEFAULT 'completed',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		// Multi-tip sessions
		`CREATE TABLE IF NOT EXISTS multi_tip_sessions (
			id VARCHAR(64) PRIMARY KEY,
			payer_id VARCHAR(128) NOT NULL,
			establishment_id INT NOT NULL,
			total_amount DECIMAL(18,2) NOT NULL,
			currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
			recipients_count INT NOT NULL DEFAULT 0,
			status VARCHAR(20) NOT NULL DEFAULT 'completed',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS multi_tip_recipients (
			id SERIAL PRIMARY KEY,
			session_id VARCHAR(64) NOT NULL,
			recipient_name VARCHAR(256) NOT NULL,
			role VARCHAR(64),
			amount DECIMAL(18,2) NOT NULL,
			percentage DECIMAL(5,2)
		)`,
		`CREATE TABLE IF NOT EXISTS tax_rules (
			id VARCHAR(64) PRIMARY KEY,
			jurisdiction_code VARCHAR(10) NOT NULL,
			tax_type VARCHAR(32) NOT NULL,
			name VARCHAR(256) NOT NULL,
			rate DECIMAL(8,4) NOT NULL DEFAULT 0,
			flat_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
			currency VARCHAR(10) NOT NULL,
			applies_to_category VARCHAR(64) NOT NULL DEFAULT 'all',
			min_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
			max_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
			priority INT NOT NULL DEFAULT 0,
			is_compound BOOLEAN NOT NULL DEFAULT false,
			is_active BOOLEAN NOT NULL DEFAULT true,
			effective_from BIGINT NOT NULL DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS reconciliation_reports (
			report_id VARCHAR(64) PRIMARY KEY,
			period_start TIMESTAMPTZ NOT NULL,
			period_end TIMESTAMPTZ NOT NULL,
			total_bookings INT NOT NULL DEFAULT 0,
			total_revenue DECIMAL(18,2) NOT NULL DEFAULT 0,
			total_settlements DECIMAL(18,2) NOT NULL DEFAULT 0,
			discrepancies JSONB NOT NULL DEFAULT '[]',
			status VARCHAR(20) NOT NULL DEFAULT 'CLEAN',
			generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS mojaloop_quotes (
			quote_id VARCHAR(64) PRIMARY KEY,
			transaction_id VARCHAR(64) NOT NULL,
			payer_fsp VARCHAR(64) NOT NULL,
			payee_fsp VARCHAR(64) NOT NULL,
			amount DECIMAL(18,2) NOT NULL,
			currency VARCHAR(10) NOT NULL DEFAULT 'USD',
			fees DECIMAL(18,2) NOT NULL DEFAULT 0,
			commission DECIMAL(18,2) NOT NULL DEFAULT 0,
			expiration TIMESTAMPTZ NOT NULL,
			condition VARCHAR(256),
			ilp_packet VARCHAR(256),
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS mojaloop_settlement_windows (
			window_id VARCHAR(64) PRIMARY KEY,
			state VARCHAR(20) NOT NULL DEFAULT 'OPEN',
			total_transfers INT NOT NULL DEFAULT 0,
			total_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			closed_at TIMESTAMPTZ
		)`,
		`CREATE TABLE IF NOT EXISTS tip_configs (
			jurisdiction_code VARCHAR(10) PRIMARY KEY,
			currency VARCHAR(10) NOT NULL,
			max_percentage DECIMAL(8,2) NOT NULL DEFAULT 25,
			max_flat_amount DECIMAL(18,2) NOT NULL DEFAULT 100,
			distribution VARCHAR(32) NOT NULL DEFAULT 'direct',
			tax_on_tip BOOLEAN NOT NULL DEFAULT false,
			cultural_note TEXT,
			is_enabled BOOLEAN NOT NULL DEFAULT true
		)`,
	}

	for _, m := range migrations {
		if _, err := DB.Exec(m); err != nil {
			return fmt.Errorf("migration failed: %w\nSQL: %s", err, m[:80])
		}
	}
	return nil
}
