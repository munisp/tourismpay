package db

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"sync"

	_ "github.com/lib/pq"
)

var (
	pool     *sql.DB
	initOnce sync.Once
	initErr  error
)

func GetDB() (*sql.DB, error) {
	initOnce.Do(func() {
		dsn := os.Getenv("DATABASE_URL")
		if dsn == "" {
			host := envOr("DB_HOST", "localhost")
			port := envOr("DB_PORT", "5432")
			user := envOr("DB_USER", "ngapp")
			pass := envOr("DB_PASSWORD", "ngapp")
			name := envOr("DB_NAME", "ngapp")
			dsn = fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", user, pass, host, port, name)
		}
		conn, err := sql.Open("postgres", dsn)
		if err != nil {
			initErr = fmt.Errorf("open postgres: %w", err)
			return
		}
		conn.SetMaxOpenConns(25)
		conn.SetMaxIdleConns(5)
		if err := conn.Ping(); err != nil {
			initErr = fmt.Errorf("ping postgres: %w", err)
			return
		}
		pool = conn
		log.Println("[db] PostgreSQL connected")
	})
	return pool, initErr
}

func Migrate() error {
	conn, err := GetDB()
	if err != nil {
		return err
	}
	for _, ddl := range migrations {
		if _, err := conn.Exec(ddl); err != nil {
			return fmt.Errorf("migration failed: %w\nSQL: %s", err, ddl)
		}
	}
	log.Println("[db] migrations applied")
	return nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

var migrations = []string{
	`CREATE TABLE IF NOT EXISTS tb_accounts (
		id BIGINT PRIMARY KEY,
		ledger INT NOT NULL DEFAULT 1,
		code SMALLINT NOT NULL DEFAULT 840,
		flags INT NOT NULL DEFAULT 0,
		debits_pending BIGINT NOT NULL DEFAULT 0,
		debits_posted BIGINT NOT NULL DEFAULT 0,
		credits_pending BIGINT NOT NULL DEFAULT 0,
		credits_posted BIGINT NOT NULL DEFAULT 0,
		user_data TEXT,
		entity_type TEXT NOT NULL,
		entity_id TEXT NOT NULL,
		currency TEXT NOT NULL DEFAULT 'USD',
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`,
	`CREATE INDEX IF NOT EXISTS idx_tb_accounts_entity ON tb_accounts(entity_type, entity_id, currency)`,

	`CREATE TABLE IF NOT EXISTS tb_transfers (
		id BIGINT PRIMARY KEY,
		debit_account_id BIGINT NOT NULL,
		credit_account_id BIGINT NOT NULL,
		amount BIGINT NOT NULL,
		pending_id BIGINT DEFAULT 0,
		user_data TEXT,
		ledger INT NOT NULL DEFAULT 1,
		code SMALLINT NOT NULL DEFAULT 1,
		flags INT NOT NULL DEFAULT 0,
		status TEXT NOT NULL DEFAULT 'posted',
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`,

	`CREATE TABLE IF NOT EXISTS inventory_items (
		item_id TEXT PRIMARY KEY,
		provider_id TEXT NOT NULL,
		item_type TEXT NOT NULL,
		name TEXT NOT NULL,
		available_quantity INT NOT NULL DEFAULT 0,
		reserved_quantity INT NOT NULL DEFAULT 0,
		price DOUBLE PRECISION NOT NULL DEFAULT 0,
		currency TEXT NOT NULL DEFAULT 'USD',
		last_synced TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		sync_source TEXT NOT NULL DEFAULT 'api'
	)`,
	`CREATE INDEX IF NOT EXISTS idx_inventory_provider ON inventory_items(provider_id)`,

	`CREATE TABLE IF NOT EXISTS inventory_reservations (
		reservation_id TEXT PRIMARY KEY,
		item_id TEXT NOT NULL REFERENCES inventory_items(item_id),
		quantity INT NOT NULL,
		status TEXT NOT NULL DEFAULT 'reserved',
		tourist_id TEXT NOT NULL DEFAULT '',
		reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes'
	)`,

	`CREATE TABLE IF NOT EXISTS sync_jobs (
		job_id TEXT PRIMARY KEY,
		partner_id TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'pending',
		items_synced INT NOT NULL DEFAULT 0,
		errors_count INT NOT NULL DEFAULT 0,
		started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		completed_at TIMESTAMPTZ
	)`,

	`CREATE TABLE IF NOT EXISTS mojaloop_participants (
		fsp_id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		currency TEXT NOT NULL DEFAULT 'TZS',
		account_id TEXT NOT NULL,
		is_active BOOLEAN NOT NULL DEFAULT TRUE
	)`,

	`CREATE TABLE IF NOT EXISTS mojaloop_quotes (
		quote_id TEXT PRIMARY KEY,
		transaction_id TEXT NOT NULL,
		payer_fsp TEXT NOT NULL,
		payee_fsp TEXT NOT NULL,
		amount DOUBLE PRECISION NOT NULL,
		currency TEXT NOT NULL,
		fees DOUBLE PRECISION NOT NULL DEFAULT 0,
		commission DOUBLE PRECISION NOT NULL DEFAULT 0,
		expiration TIMESTAMPTZ NOT NULL,
		condition TEXT NOT NULL DEFAULT '',
		ilp_packet TEXT NOT NULL DEFAULT '',
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`,

	`CREATE TABLE IF NOT EXISTS mojaloop_transfers (
		transfer_id TEXT PRIMARY KEY,
		quote_id TEXT NOT NULL,
		payer_fsp TEXT NOT NULL,
		payee_fsp TEXT NOT NULL,
		amount DOUBLE PRECISION NOT NULL,
		currency TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'RESERVED',
		condition TEXT NOT NULL DEFAULT '',
		fulfilment TEXT NOT NULL DEFAULT '',
		ilp_packet TEXT NOT NULL DEFAULT '',
		committed_at TIMESTAMPTZ,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`,

	`CREATE TABLE IF NOT EXISTS settlement_windows (
		window_id TEXT PRIMARY KEY,
		state TEXT NOT NULL DEFAULT 'OPEN',
		open_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		close_time TIMESTAMPTZ,
		total_value DOUBLE PRECISION NOT NULL DEFAULT 0,
		transfer_count INT NOT NULL DEFAULT 0
	)`,

	`CREATE TABLE IF NOT EXISTS settlement_batches (
		batch_id TEXT PRIMARY KEY,
		provider_id TEXT NOT NULL,
		settlement_date TEXT NOT NULL,
		total_amount DOUBLE PRECISION NOT NULL,
		settlement_fee DOUBLE PRECISION NOT NULL DEFAULT 0,
		net_amount DOUBLE PRECISION NOT NULL,
		currency TEXT NOT NULL DEFAULT 'USD',
		status TEXT NOT NULL DEFAULT 'pending',
		transactions TEXT[] NOT NULL DEFAULT '{}',
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		processed_at TIMESTAMPTZ
	)`,

	`CREATE TABLE IF NOT EXISTS pending_settlements (
		id SERIAL PRIMARY KEY,
		provider_id TEXT NOT NULL,
		booking_id TEXT NOT NULL,
		amount DOUBLE PRECISION NOT NULL,
		currency TEXT NOT NULL DEFAULT 'USD',
		platform_fee DOUBLE PRECISION NOT NULL DEFAULT 0,
		processing_fee DOUBLE PRECISION NOT NULL DEFAULT 0,
		recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`,
	`CREATE INDEX IF NOT EXISTS idx_pending_provider ON pending_settlements(provider_id)`,

	`CREATE TABLE IF NOT EXISTS reconciliation_reports (
		report_id TEXT PRIMARY KEY,
		provider_id TEXT NOT NULL,
		period_start TIMESTAMPTZ NOT NULL,
		period_end TIMESTAMPTZ NOT NULL,
		total_bookings DOUBLE PRECISION NOT NULL DEFAULT 0,
		total_settled DOUBLE PRECISION NOT NULL DEFAULT 0,
		discrepancy DOUBLE PRECISION NOT NULL DEFAULT 0,
		status TEXT NOT NULL DEFAULT 'generated',
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`,

	`CREATE TABLE IF NOT EXISTS crypto_wallets (
		wallet_id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL UNIQUE,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`,

	`CREATE TABLE IF NOT EXISTS crypto_balances (
		wallet_id TEXT NOT NULL REFERENCES crypto_wallets(wallet_id),
		coin TEXT NOT NULL,
		amount DOUBLE PRECISION NOT NULL DEFAULT 0,
		PRIMARY KEY (wallet_id, coin)
	)`,

	`CREATE TABLE IF NOT EXISTS crypto_addresses (
		wallet_id TEXT NOT NULL REFERENCES crypto_wallets(wallet_id),
		coin TEXT NOT NULL,
		address TEXT NOT NULL,
		PRIMARY KEY (wallet_id, coin)
	)`,

	`CREATE TABLE IF NOT EXISTS crypto_transactions (
		tx_id TEXT PRIMARY KEY,
		wallet_id TEXT NOT NULL,
		tx_type TEXT NOT NULL,
		coin TEXT NOT NULL,
		amount DOUBLE PRECISION NOT NULL,
		fee DOUBLE PRECISION NOT NULL DEFAULT 0,
		status TEXT NOT NULL DEFAULT 'pending',
		blockchain_txn TEXT,
		confirmations INT NOT NULL DEFAULT 0,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		confirmed_at TIMESTAMPTZ
	)`,

	`CREATE TABLE IF NOT EXISTS webhooks (
		id TEXT PRIMARY KEY,
		url TEXT NOT NULL,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`,
}
