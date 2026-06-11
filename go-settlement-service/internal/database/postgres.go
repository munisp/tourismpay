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
	}

	for _, m := range migrations {
		if _, err := DB.Exec(m); err != nil {
			return fmt.Errorf("migration failed: %w\nSQL: %s", err, m[:80])
		}
	}
	return nil
}
