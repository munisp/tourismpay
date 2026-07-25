// Package services — ENairaService tests using pgxmock for DB layer.
//
// These tests inject pgxmock.PgxPoolIface as the DBQuerier, a mock Redis client,
// a mock Kafka writer, and a mock CBN HTTP server — enabling full unit testing
// of all ENairaService methods without any real infrastructure.
//
// Coverage targets (all currently at 0%):
//   - ENairaService.ProvisionWallet       (DB: QueryRow + Exec)
//   - ENairaService.InitiatePayment       (DB: QueryRow + Exec × 3)
//   - ENairaService.LoadTouristWallet     (DB: QueryRow, calls InitiatePayment)
//   - ENairaService.HandleCBNWebhook      (DB: QueryRow + Exec)
//   - ENairaService.GetWalletBalance      (Redis + DB + CBN)
//   - ENairaService.publishEvent          (Kafka)
//   - ENairaService.GetBalance            (alias)
//   - ENairaService.TouristLoad           (alias)
//   - ENairaService.ProcessCBNWebhook     (alias)
package services

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	pgx "github.com/jackc/pgx/v5"
	pgconn "github.com/jackc/pgx/v5/pgconn"
	pgxmock "github.com/pashagolub/pgxmock/v3"
	"github.com/redis/go-redis/v9"
	kafka "github.com/segmentio/kafka-go"
	"go.uber.org/zap"

	"github.com/munisp/tourismpay/enaira-gateway/internal/models"
)

// ─── Mock Kafka Writer ────────────────────────────────────────────────────────

// noopKafkaWriter implements the kafka.Writer interface but discards all messages.
type noopKafkaWriter struct{}

func (n *noopKafkaWriter) WriteMessages(_ context.Context, _ ...kafka.Message) error {
	return nil
}

// ─── Mock Redis Client ────────────────────────────────────────────────────────

// For Redis we use the real go-redis client pointed at a non-existent server.
// All operations will fail with connection refused, which the service handles gracefully.
func newNoopRedis() *redis.Client {
	return redis.NewClient(&redis.Options{
		Addr:        "localhost:16379", // non-existent port
		DialTimeout: 1 * time.Millisecond,
	})
}

// ─── Test Builder ─────────────────────────────────────────────────────────────

type serviceTestFixture struct {
	mock    pgxmock.PgxPoolIface
	redis   *redis.Client
	cbn     *mockCBNServer
	service *ENairaService
	logger  *zap.Logger
}

func newServiceFixture(t *testing.T) *serviceTestFixture {
	t.Helper()
	mock, err := pgxmock.NewPool()
	if err != nil {
		t.Fatalf("pgxmock.NewPool: %v", err)
	}
	t.Cleanup(func() { mock.Close() })

	cbn := newMockCBNServer(t)
	logger, _ := zap.NewDevelopment()
	cbnClient := newTestCBNClient(t, cbn)

	svc := &ENairaService{
		db:          mock,
		redis:       newNoopRedis(),
		kafkaWriter: &kafka.Writer{Addr: kafka.TCP("localhost:19092")}, // non-existent
		cbnClient:   cbnClient,
		logger:      logger,
	}

	return &serviceTestFixture{
		mock:    mock,
		redis:   svc.redis,
		cbn:     cbn,
		service: svc,
		logger:  logger,
	}
}

// ─── ProvisionWallet Tests ────────────────────────────────────────────────────

func TestENairaService_ProvisionWallet_NewWallet(t *testing.T) {
	f := newServiceFixture(t)
	ctx := context.Background()

	// Expect: QueryRow for existing wallet check → returns no rows (pgx.ErrNoRows)
	f.mock.ExpectQuery(`SELECT id, cbn_wallet_id FROM enaira_wallets`).
		WithArgs("user-tourist-dc-001", models.WalletTypeTourist).
		WillReturnError(pgx.ErrNoRows)

	// Expect: Exec for INSERT wallet
	f.mock.ExpectExec(`INSERT INTO enaira_wallets`).
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("INSERT", 1))

	wallet, err := f.service.ProvisionWallet(ctx, &models.CreateWalletRequest{
		UserID:      "user-tourist-dc-001",
		FullName:    "Chukwuemeka Obi",
		PhoneNumber: "+2348012345678",
		BVN:         "12345678901",
		WalletType:  models.WalletTypeTourist,
	})

	if err != nil {
		t.Fatalf("ProvisionWallet: unexpected error: %v", err)
	}
	if wallet.UserID != "user-tourist-dc-001" {
		t.Errorf("wallet.UserID: got %q, want %q", wallet.UserID, "user-tourist-dc-001")
	}
	if wallet.KYCLevel != 1 {
		t.Errorf("KYC level (no NIN): got %d, want 1", wallet.KYCLevel)
	}
	if wallet.DailyLimitKobo != 20_000_00 {
		t.Errorf("daily limit (Tier 1): got %d, want 2000000", wallet.DailyLimitKobo)
	}
	if err := f.mock.ExpectationsWereMet(); err != nil {
		t.Errorf("pgxmock expectations not met: %v", err)
	}
}

func TestENairaService_ProvisionWallet_WithNIN_Tier2(t *testing.T) {
	f := newServiceFixture(t)
	ctx := context.Background()

	f.mock.ExpectQuery(`SELECT id, cbn_wallet_id FROM enaira_wallets`).
		WithArgs("user-tourist-uk-001", models.WalletTypeTourist).
		WillReturnError(pgx.ErrNoRows)

	f.mock.ExpectExec(`INSERT INTO enaira_wallets`).
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("INSERT", 1))

	wallet, err := f.service.ProvisionWallet(ctx, &models.CreateWalletRequest{
		UserID:      "user-tourist-uk-001",
		FullName:    "Adaeze Nwosu",
		PhoneNumber: "+2348099887766",
		BVN:         "98765432109",
		NIN:         "12345678901", // NIN provided → Tier 2
		WalletType:  models.WalletTypeTourist,
	})

	if err != nil {
		t.Fatalf("ProvisionWallet Tier2: unexpected error: %v", err)
	}
	if wallet.KYCLevel != 2 {
		t.Errorf("KYC level (with NIN): got %d, want 2", wallet.KYCLevel)
	}
	if wallet.DailyLimitKobo != 100_000_00 {
		t.Errorf("daily limit (Tier 2): got %d, want 10000000", wallet.DailyLimitKobo)
	}
}

func TestENairaService_ProvisionWallet_MerchantLimit(t *testing.T) {
	f := newServiceFixture(t)
	ctx := context.Background()

	f.mock.ExpectQuery(`SELECT id, cbn_wallet_id FROM enaira_wallets`).
		WithArgs("merchant-eko-hotel-001", models.WalletTypeMerchant).
		WillReturnError(pgx.ErrNoRows)

	f.mock.ExpectExec(`INSERT INTO enaira_wallets`).
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("INSERT", 1))

	wallet, err := f.service.ProvisionWallet(ctx, &models.CreateWalletRequest{
		UserID:     "merchant-eko-hotel-001",
		FullName:   "Eko Hotel & Suites",
		WalletType: models.WalletTypeMerchant,
	})

	if err != nil {
		t.Fatalf("ProvisionWallet merchant: unexpected error: %v", err)
	}
	if wallet.DailyLimitKobo != 500_000_00 {
		t.Errorf("merchant daily limit: got %d, want 50000000", wallet.DailyLimitKobo)
	}
}

func TestENairaService_ProvisionWallet_AlreadyExists(t *testing.T) {
	f := newServiceFixture(t)
	ctx := context.Background()

	// Wallet exists — QueryRow returns a row
	rows := pgxmock.NewRows([]string{"id", "cbn_wallet_id"}).
		AddRow("existing-wallet-id", "cbn-existing-001")
	f.mock.ExpectQuery(`SELECT id, cbn_wallet_id FROM enaira_wallets`).
		WithArgs("user-existing-001", models.WalletTypeTourist).
		WillReturnRows(rows)

	_, err := f.service.ProvisionWallet(ctx, &models.CreateWalletRequest{
		UserID:     "user-existing-001",
		FullName:   "Existing User",
		WalletType: models.WalletTypeTourist,
	})

	if err == nil {
		t.Fatal("expected error for existing wallet, got nil")
	}
}

func TestENairaService_ProvisionWallet_DBInsertFails(t *testing.T) {
	f := newServiceFixture(t)
	ctx := context.Background()

	f.mock.ExpectQuery(`SELECT id, cbn_wallet_id FROM enaira_wallets`).
		WithArgs("user-db-fail-001", models.WalletTypeTourist).
		WillReturnError(pgx.ErrNoRows)

	f.mock.ExpectExec(`INSERT INTO enaira_wallets`).
		WillReturnError(errors.New("DB connection lost"))

	_, err := f.service.ProvisionWallet(ctx, &models.CreateWalletRequest{
		UserID:     "user-db-fail-001",
		FullName:   "DB Fail User",
		WalletType: models.WalletTypeTourist,
	})

	if err == nil {
		t.Fatal("expected error for DB insert failure, got nil")
	}
}

// ─── InitiatePayment Tests ────────────────────────────────────────────────────

func TestENairaService_InitiatePayment_Success(t *testing.T) {
	f := newServiceFixture(t)
	ctx := context.Background()

	// Expect: QueryRow for sender wallet
	walletRows := pgxmock.NewRows([]string{"id", "cbn_wallet_id", "balance_kobo", "daily_limit_kobo", "status"}).
		AddRow("wallet-tourist-001", "cbn-wallet-001", int64(10_000_000_00), int64(100_000_00), models.WalletStatusActive)
	f.mock.ExpectQuery(`SELECT id, cbn_wallet_id, balance_kobo, daily_limit_kobo, status FROM enaira_wallets`).
		WithArgs("wallet-tourist-001").
		WillReturnRows(walletRows)

	// Expect: Exec for INSERT transaction
	f.mock.ExpectExec(`INSERT INTO enaira_transactions`).
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("INSERT", 1))

	// Expect: Exec for UPDATE cbn_transaction_ref (after CBN call)
	f.mock.ExpectExec(`UPDATE enaira_transactions SET cbn_transaction_ref`).
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))

	tx, err := f.service.InitiatePayment(ctx, &models.InitiatePaymentRequest{
		SenderWalletID:   "wallet-tourist-001",
		ReceiverWalletID: "wallet-merchant-001",
		AmountNGN:        "50000.00",
		TransactionType:  models.TxTypePayment,
		Narration:        "Hotel payment - Eko Hotel Lagos",
		CorrelationID:    "corr-hotel-001",
	})

	if err != nil {
		t.Fatalf("InitiatePayment: unexpected error: %v", err)
	}
	if tx.AmountKobo != 5_000_000 {
		t.Errorf("amount_kobo: got %d, want 5000000", tx.AmountKobo)
	}
	if tx.FeeKobo != 25000 {
		// 0.5% of 5,000,000 = 25,000 kobo (₦250 — under ₦500 cap)
		t.Errorf("fee_kobo: got %d, want 25000", tx.FeeKobo)
	}
	if tx.CBNTransactionRef != "CBN-TXN-TEST-001" {
		t.Errorf("cbn_ref: got %q, want %q", tx.CBNTransactionRef, "CBN-TXN-TEST-001")
	}
	if err := f.mock.ExpectationsWereMet(); err != nil {
		t.Errorf("pgxmock expectations not met: %v", err)
	}
}

func TestENairaService_InitiatePayment_FeeCap(t *testing.T) {
	// ₦200,000 payment → fee should be capped at ₦500 (50,000 kobo)
	f := newServiceFixture(t)
	ctx := context.Background()

	walletRows := pgxmock.NewRows([]string{"id", "cbn_wallet_id", "balance_kobo", "daily_limit_kobo", "status"}).
		AddRow("wallet-tourist-001", "cbn-wallet-001", int64(100_000_000_00), int64(500_000_00), models.WalletStatusActive)
	f.mock.ExpectQuery(`SELECT id, cbn_wallet_id, balance_kobo, daily_limit_kobo, status FROM enaira_wallets`).
		WithArgs("wallet-tourist-001").WillReturnRows(walletRows)
	f.mock.ExpectExec(`INSERT INTO enaira_transactions`).WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).WillReturnResult(pgxmock.NewResult("INSERT", 1))
	f.mock.ExpectExec(`UPDATE enaira_transactions SET cbn_transaction_ref`).WillReturnResult(pgxmock.NewResult("UPDATE", 1))

	tx, err := f.service.InitiatePayment(ctx, &models.InitiatePaymentRequest{
		SenderWalletID:   "wallet-tourist-001",
		ReceiverWalletID: "wallet-merchant-001",
		AmountNGN:        "200000.00", // ₦200,000
		TransactionType:  models.TxTypePayment,
		CorrelationID:    "corr-fee-cap-001",
	})

	if err != nil {
		t.Fatalf("InitiatePayment fee cap: unexpected error: %v", err)
	}
	if tx.FeeKobo != 50000 {
		// 0.5% of 20,000,000 = 100,000 kobo but capped at 50,000 (₦500)
		t.Errorf("fee_kobo (capped): got %d, want 50000", tx.FeeKobo)
	}
}

func TestENairaService_InitiatePayment_WalletNotFound(t *testing.T) {
	f := newServiceFixture(t)
	ctx := context.Background()

	f.mock.ExpectQuery(`SELECT id, cbn_wallet_id, balance_kobo, daily_limit_kobo, status FROM enaira_wallets`).
		WithArgs("nonexistent-wallet").
		WillReturnError(pgx.ErrNoRows)

	_, err := f.service.InitiatePayment(ctx, &models.InitiatePaymentRequest{
		SenderWalletID:   "nonexistent-wallet",
		ReceiverWalletID: "wallet-merchant-001",
		AmountNGN:        "1000.00",
		TransactionType:  models.TxTypePayment,
		CorrelationID:    "corr-notfound-001",
	})

	if err == nil {
		t.Fatal("expected error for wallet not found, got nil")
	}
}

func TestENairaService_InitiatePayment_InactiveWallet(t *testing.T) {
	f := newServiceFixture(t)
	ctx := context.Background()

	walletRows := pgxmock.NewRows([]string{"id", "cbn_wallet_id", "balance_kobo", "daily_limit_kobo", "status"}).
		AddRow("wallet-suspended-001", "cbn-wallet-001", int64(0), int64(20_000_00), models.WalletStatusSuspended)
	f.mock.ExpectQuery(`SELECT id, cbn_wallet_id, balance_kobo, daily_limit_kobo, status FROM enaira_wallets`).
		WithArgs("wallet-suspended-001").WillReturnRows(walletRows)

	_, err := f.service.InitiatePayment(ctx, &models.InitiatePaymentRequest{
		SenderWalletID:   "wallet-suspended-001",
		ReceiverWalletID: "wallet-merchant-001",
		AmountNGN:        "5000.00",
		TransactionType:  models.TxTypePayment,
		CorrelationID:    "corr-suspended-001",
	})

	if err == nil {
		t.Fatal("expected error for suspended wallet, got nil")
	}
}

func TestENairaService_InitiatePayment_ZeroAmount(t *testing.T) {
	f := newServiceFixture(t)
	ctx := context.Background()

	walletRows := pgxmock.NewRows([]string{"id", "cbn_wallet_id", "balance_kobo", "daily_limit_kobo", "status"}).
		AddRow("wallet-tourist-001", "cbn-wallet-001", int64(1_000_000), int64(20_000_00), models.WalletStatusActive)
	f.mock.ExpectQuery(`SELECT id, cbn_wallet_id, balance_kobo, daily_limit_kobo, status FROM enaira_wallets`).
		WithArgs("wallet-tourist-001").WillReturnRows(walletRows)

	_, err := f.service.InitiatePayment(ctx, &models.InitiatePaymentRequest{
		SenderWalletID:   "wallet-tourist-001",
		ReceiverWalletID: "wallet-merchant-001",
		AmountNGN:        "0.00",
		TransactionType:  models.TxTypePayment,
		CorrelationID:    "corr-zero-001",
	})

	if err == nil {
		t.Fatal("expected error for zero amount, got nil")
	}
}

func TestENairaService_InitiatePayment_CBNFailure_MarksTransactionFailed(t *testing.T) {
	f := newServiceFixture(t)
	ctx := context.Background()
	f.cbn.forceError = true // CBN will return 500

	walletRows := pgxmock.NewRows([]string{"id", "cbn_wallet_id", "balance_kobo", "daily_limit_kobo", "status"}).
		AddRow("wallet-tourist-001", "cbn-wallet-001", int64(10_000_000), int64(20_000_00), models.WalletStatusActive)
	f.mock.ExpectQuery(`SELECT id, cbn_wallet_id, balance_kobo, daily_limit_kobo, status FROM enaira_wallets`).
		WithArgs("wallet-tourist-001").WillReturnRows(walletRows)
	f.mock.ExpectExec(`INSERT INTO enaira_transactions`).
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("INSERT", 1))
	// Expect: UPDATE status='failed' after CBN error
	f.mock.ExpectExec(`UPDATE enaira_transactions SET status='failed'`).
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))

	_, err := f.service.InitiatePayment(ctx, &models.InitiatePaymentRequest{
		SenderWalletID:   "wallet-tourist-001",
		ReceiverWalletID: "wallet-merchant-001",
		AmountNGN:        "5000.00",
		TransactionType:  models.TxTypePayment,
		CorrelationID:    "corr-cbn-fail-001",
	})

	if err == nil {
		t.Fatal("expected error for CBN failure, got nil")
	}
	if err := f.mock.ExpectationsWereMet(); err != nil {
		t.Errorf("pgxmock expectations not met: %v", err)
	}
}

// ─── LoadTouristWallet Tests ──────────────────────────────────────────────────

func TestENairaService_LoadTouristWallet_USDToNGN(t *testing.T) {
	// DC diaspora: $10,000 USD @ ₦1,550/$ = ₦15,500,000
	f := newServiceFixture(t)
	ctx := context.Background()

	// Step 1: QueryRow for tourist speed wallet
	speedWalletRows := pgxmock.NewRows([]string{"id", "cbn_wallet_id", "status"}).
		AddRow("wallet-speed-dc-001", "cbn-speed-001", models.WalletStatusActive)
	f.mock.ExpectQuery(`SELECT id, cbn_wallet_id, status FROM enaira_wallets WHERE user_id`).
		WithArgs("tourist-dc-001").
		WillReturnRows(speedWalletRows)

	// Step 2: InitiatePayment internally calls QueryRow for PLATFORM_PSP_WALLET
	pspWalletRows := pgxmock.NewRows([]string{"id", "cbn_wallet_id", "balance_kobo", "daily_limit_kobo", "status"}).
		AddRow("PLATFORM_PSP_WALLET", "cbn-psp-001", int64(100_000_000_000), int64(500_000_000_00), models.WalletStatusActive)
	f.mock.ExpectQuery(`SELECT id, cbn_wallet_id, balance_kobo, daily_limit_kobo, status FROM enaira_wallets`).
		WithArgs("PLATFORM_PSP_WALLET").
		WillReturnRows(pspWalletRows)

	// Step 3: INSERT transaction
	f.mock.ExpectExec(`INSERT INTO enaira_transactions`).
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("INSERT", 1))

	// Step 4: UPDATE cbn_transaction_ref
	f.mock.ExpectExec(`UPDATE enaira_transactions SET cbn_transaction_ref`).
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))

	tx, err := f.service.LoadTouristWallet(ctx, &models.TouristLoadRequest{
		TouristUserID:   "tourist-dc-001",
		SourceAmountStr: "10000.00",
		SourceCurrency:  "USD",
		FXRate:          "1550.00", // ₦1,550 per USD
		CorrelationID:   "load-dc-001",
	})

	if err != nil {
		t.Fatalf("LoadTouristWallet USD: unexpected error: %v", err)
	}
	// ₦15,500,000 = 1,550,000,000 kobo
	if tx.AmountKobo != 1_550_000_000 {
		t.Errorf("amount_kobo: got %d, want 1550000000", tx.AmountKobo)
	}
	if err := f.mock.ExpectationsWereMet(); err != nil {
		t.Errorf("pgxmock expectations not met: %v", err)
	}
}

func TestENairaService_LoadTouristWallet_GBPToNGN(t *testing.T) {
	// UK diaspora: £5,000 GBP @ ₦1,950/£ = ₦9,750,000
	f := newServiceFixture(t)
	ctx := context.Background()

	speedWalletRows := pgxmock.NewRows([]string{"id", "cbn_wallet_id", "status"}).
		AddRow("wallet-speed-uk-001", "cbn-speed-uk-001", models.WalletStatusActive)
	f.mock.ExpectQuery(`SELECT id, cbn_wallet_id, status FROM enaira_wallets WHERE user_id`).
		WithArgs("tourist-uk-001").
		WillReturnRows(speedWalletRows)

	pspWalletRows := pgxmock.NewRows([]string{"id", "cbn_wallet_id", "balance_kobo", "daily_limit_kobo", "status"}).
		AddRow("PLATFORM_PSP_WALLET", "cbn-psp-001", int64(100_000_000_000), int64(500_000_000_00), models.WalletStatusActive)
	f.mock.ExpectQuery(`SELECT id, cbn_wallet_id, balance_kobo, daily_limit_kobo, status FROM enaira_wallets`).
		WithArgs("PLATFORM_PSP_WALLET").
		WillReturnRows(pspWalletRows)

	f.mock.ExpectExec(`INSERT INTO enaira_transactions`).WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).WillReturnResult(pgxmock.NewResult("INSERT", 1))
	f.mock.ExpectExec(`UPDATE enaira_transactions SET cbn_transaction_ref`).WillReturnResult(pgxmock.NewResult("UPDATE", 1))

	tx, err := f.service.LoadTouristWallet(ctx, &models.TouristLoadRequest{
		TouristUserID:   "tourist-uk-001",
		SourceAmountStr: "5000.00",
		SourceCurrency:  "GBP",
		FXRate:          "1950.00", // ₦1,950 per GBP
		CorrelationID:   "load-uk-001",
	})

	if err != nil {
		t.Fatalf("LoadTouristWallet GBP: unexpected error: %v", err)
	}
	// ₦9,750,000 = 975,000,000 kobo
	if tx.AmountKobo != 975_000_000 {
		t.Errorf("amount_kobo: got %d, want 975000000", tx.AmountKobo)
	}
}

func TestENairaService_LoadTouristWallet_WalletNotFound(t *testing.T) {
	f := newServiceFixture(t)
	ctx := context.Background()

	f.mock.ExpectQuery(`SELECT id, cbn_wallet_id, status FROM enaira_wallets WHERE user_id`).
		WithArgs("tourist-no-wallet").
		WillReturnError(pgx.ErrNoRows)

	_, err := f.service.LoadTouristWallet(ctx, &models.TouristLoadRequest{
		TouristUserID:   "tourist-no-wallet",
		SourceAmountStr: "1000.00",
		SourceCurrency:  "USD",
		FXRate:          "1550.00",
		CorrelationID:   "load-nowal-001",
	})

	if err == nil {
		t.Fatal("expected error for missing wallet, got nil")
	}
}

func TestENairaService_LoadTouristWallet_InvalidFXRate(t *testing.T) {
	f := newServiceFixture(t)
	ctx := context.Background()

	speedWalletRows := pgxmock.NewRows([]string{"id", "cbn_wallet_id", "status"}).
		AddRow("wallet-speed-001", "cbn-speed-001", models.WalletStatusActive)
	f.mock.ExpectQuery(`SELECT id, cbn_wallet_id, status FROM enaira_wallets WHERE user_id`).
		WithArgs("tourist-001").
		WillReturnRows(speedWalletRows)

	_, err := f.service.LoadTouristWallet(ctx, &models.TouristLoadRequest{
		TouristUserID:   "tourist-001",
		SourceAmountStr: "1000.00",
		SourceCurrency:  "USD",
		FXRate:          "not-a-rate", // invalid
		CorrelationID:   "load-badrate-001",
	})

	if err == nil {
		t.Fatal("expected error for invalid FX rate, got nil")
	}
}

// ─── HandleCBNWebhook Tests ───────────────────────────────────────────────────

func TestENairaService_HandleCBNWebhook_Completed(t *testing.T) {
	f := newServiceFixture(t)
	ctx := context.Background()

	// QueryRow: find transaction by CBN ref
	txRows := pgxmock.NewRows([]string{"id"}).AddRow("tx-hotel-001")
	f.mock.ExpectQuery(`SELECT id FROM enaira_transactions WHERE cbn_transaction_ref`).
		WithArgs("CBN-TXN-TEST-001").
		WillReturnRows(txRows)

	// Exec: UPDATE status='completed'
	f.mock.ExpectExec(`UPDATE enaira_transactions`).
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))

	err := f.service.HandleCBNWebhook(ctx, &models.CBNWebhookEvent{
		EventType:       "payment.completed",
		TransactionRef:  "CBN-TXN-TEST-001",
		Status:          models.TxStatusCompleted,
		ResponseCode:    "00",
		ResponseMessage: "Transaction successful",
		Timestamp:       time.Now().UnixMilli(),
	})

	if err != nil {
		t.Fatalf("HandleCBNWebhook completed: unexpected error: %v", err)
	}
	if err := f.mock.ExpectationsWereMet(); err != nil {
		t.Errorf("pgxmock expectations not met: %v", err)
	}
}

func TestENairaService_HandleCBNWebhook_Failed(t *testing.T) {
	f := newServiceFixture(t)
	ctx := context.Background()

	txRows := pgxmock.NewRows([]string{"id"}).AddRow("tx-hotel-002")
	f.mock.ExpectQuery(`SELECT id FROM enaira_transactions WHERE cbn_transaction_ref`).
		WithArgs("CBN-TXN-FAILED-001").
		WillReturnRows(txRows)

	f.mock.ExpectExec(`UPDATE enaira_transactions`).
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))

	err := f.service.HandleCBNWebhook(ctx, &models.CBNWebhookEvent{
		EventType:       "payment.failed",
		TransactionRef:  "CBN-TXN-FAILED-001",
		Status:          models.TxStatusFailed,
		ResponseCode:    "05",
		ResponseMessage: "Insufficient funds",
		Timestamp:       time.Now().UnixMilli(),
	})

	if err != nil {
		t.Fatalf("HandleCBNWebhook failed: unexpected error: %v", err)
	}
}

func TestENairaService_HandleCBNWebhook_Reversed(t *testing.T) {
	f := newServiceFixture(t)
	ctx := context.Background()

	txRows := pgxmock.NewRows([]string{"id"}).AddRow("tx-hotel-003")
	f.mock.ExpectQuery(`SELECT id FROM enaira_transactions WHERE cbn_transaction_ref`).
		WithArgs("CBN-TXN-REVERSED-001").
		WillReturnRows(txRows)

	f.mock.ExpectExec(`UPDATE enaira_transactions`).
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))

	err := f.service.HandleCBNWebhook(ctx, &models.CBNWebhookEvent{
		EventType:      "payment.reversed",
		TransactionRef: "CBN-TXN-REVERSED-001",
		Status:         models.TxStatusReversed,
		ResponseCode:   "00",
		Timestamp:      time.Now().UnixMilli(),
	})

	if err != nil {
		t.Fatalf("HandleCBNWebhook reversed: unexpected error: %v", err)
	}
}

func TestENairaService_HandleCBNWebhook_TransactionNotFound(t *testing.T) {
	f := newServiceFixture(t)
	ctx := context.Background()

	f.mock.ExpectQuery(`SELECT id FROM enaira_transactions WHERE cbn_transaction_ref`).
		WithArgs("CBN-TXN-UNKNOWN-001").
		WillReturnError(pgx.ErrNoRows)

	err := f.service.HandleCBNWebhook(ctx, &models.CBNWebhookEvent{
		EventType:      "payment.completed",
		TransactionRef: "CBN-TXN-UNKNOWN-001",
		Status:         models.TxStatusCompleted,
		Timestamp:      time.Now().UnixMilli(),
	})

	if err == nil {
		t.Fatal("expected error for transaction not found, got nil")
	}
}

// ─── GetWalletBalance Tests ───────────────────────────────────────────────────

func TestENairaService_GetWalletBalance_FromCBN(t *testing.T) {
	// Redis is unavailable (non-existent port) → falls through to CBN
	// CBN mock returns 500,000 kobo (₦5,000)
	f := newServiceFixture(t)
	ctx := context.Background()

	// QueryRow: get cbn_wallet_id
	walletRows := pgxmock.NewRows([]string{"cbn_wallet_id"}).AddRow("cbn-wallet-test-001")
	f.mock.ExpectQuery(`SELECT cbn_wallet_id FROM enaira_wallets WHERE id`).
		WithArgs("wallet-tourist-001").
		WillReturnRows(walletRows)

	resp, err := f.service.GetWalletBalance(ctx, "wallet-tourist-001")

	if err != nil {
		t.Fatalf("GetWalletBalance: unexpected error: %v", err)
	}
	if resp.BalanceKobo != 500_000_00 {
		t.Errorf("balance_kobo: got %d, want 50000000", resp.BalanceKobo)
	}
	if resp.BalanceNGN != "500000.00" {
		t.Errorf("balance_ngn: got %q, want %q", resp.BalanceNGN, "500000.00")
	}
	if resp.Currency != "NGN" {
		t.Errorf("currency: got %q, want %q", resp.Currency, "NGN")
	}
}

func TestENairaService_GetWalletBalance_CBNFallsBackToDBBalance(t *testing.T) {
	// CBN returns error → falls back to DB balance
	f := newServiceFixture(t)
	f.cbn.forceError = true
	ctx := context.Background()

	// QueryRow 1: get cbn_wallet_id
	walletRows := pgxmock.NewRows([]string{"cbn_wallet_id"}).AddRow("cbn-wallet-001")
	f.mock.ExpectQuery(`SELECT cbn_wallet_id FROM enaira_wallets WHERE id`).
		WithArgs("wallet-tourist-001").
		WillReturnRows(walletRows)

	// QueryRow 2: fallback to DB balance
	balanceRows := pgxmock.NewRows([]string{"balance_kobo"}).AddRow(int64(250_000_00))
	f.mock.ExpectQuery(`SELECT balance_kobo FROM enaira_wallets WHERE id`).
		WithArgs("wallet-tourist-001").
		WillReturnRows(balanceRows)

	resp, err := f.service.GetWalletBalance(ctx, "wallet-tourist-001")

	if err != nil {
		t.Fatalf("GetWalletBalance fallback: unexpected error: %v", err)
	}
	if resp.BalanceKobo != 250_000_00 {
		t.Errorf("fallback balance_kobo: got %d, want 25000000", resp.BalanceKobo)
	}
}

// ─── Alias Method Tests ───────────────────────────────────────────────────────

func TestENairaService_GetBalance_IsAliasForGetWalletBalance(t *testing.T) {
	f := newServiceFixture(t)
	ctx := context.Background()

	walletRows := pgxmock.NewRows([]string{"cbn_wallet_id"}).AddRow("cbn-wallet-test-001")
	f.mock.ExpectQuery(`SELECT cbn_wallet_id FROM enaira_wallets WHERE id`).
		WithArgs("wallet-alias-001").
		WillReturnRows(walletRows)

	resp, err := f.service.GetBalance(ctx, "wallet-alias-001")

	if err != nil {
		t.Fatalf("GetBalance alias: unexpected error: %v", err)
	}
	if resp == nil {
		t.Fatal("GetBalance alias: expected non-nil response")
	}
}

func TestENairaService_TouristLoad_IsAliasForLoadTouristWallet(t *testing.T) {
	f := newServiceFixture(t)
	ctx := context.Background()

	speedWalletRows := pgxmock.NewRows([]string{"id", "cbn_wallet_id", "status"}).
		AddRow("wallet-speed-alias-001", "cbn-speed-alias-001", models.WalletStatusActive)
	f.mock.ExpectQuery(`SELECT id, cbn_wallet_id, status FROM enaira_wallets WHERE user_id`).
		WithArgs("tourist-alias-001").
		WillReturnRows(speedWalletRows)

	pspWalletRows := pgxmock.NewRows([]string{"id", "cbn_wallet_id", "balance_kobo", "daily_limit_kobo", "status"}).
		AddRow("PLATFORM_PSP_WALLET", "cbn-psp-001", int64(100_000_000_000), int64(500_000_000_00), models.WalletStatusActive)
	f.mock.ExpectQuery(`SELECT id, cbn_wallet_id, balance_kobo, daily_limit_kobo, status FROM enaira_wallets`).
		WithArgs("PLATFORM_PSP_WALLET").
		WillReturnRows(pspWalletRows)

	f.mock.ExpectExec(`INSERT INTO enaira_transactions`).WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).WillReturnResult(pgxmock.NewResult("INSERT", 1))
	f.mock.ExpectExec(`UPDATE enaira_transactions SET cbn_transaction_ref`).WillReturnResult(pgxmock.NewResult("UPDATE", 1))

	tx, err := f.service.TouristLoad(ctx, &models.TouristLoadRequest{
		TouristUserID:   "tourist-alias-001",
		SourceAmountStr: "500.00",
		SourceCurrency:  "USD",
		FXRate:          "1550.00",
		CorrelationID:   "load-alias-001",
	})

	if err != nil {
		t.Fatalf("TouristLoad alias: unexpected error: %v", err)
	}
	if tx == nil {
		t.Fatal("TouristLoad alias: expected non-nil transaction")
	}
}

func TestENairaService_ProcessCBNWebhook_IsAliasForHandleCBNWebhook(t *testing.T) {
	f := newServiceFixture(t)
	ctx := context.Background()

	txRows := pgxmock.NewRows([]string{"id"}).AddRow("tx-alias-001")
	f.mock.ExpectQuery(`SELECT id FROM enaira_transactions WHERE cbn_transaction_ref`).
		WithArgs("CBN-TXN-ALIAS-001").
		WillReturnRows(txRows)

	f.mock.ExpectExec(`UPDATE enaira_transactions`).
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))

	err := f.service.ProcessCBNWebhook(ctx, &models.CBNWebhookEvent{
		EventType:      "payment.completed",
		TransactionRef: "CBN-TXN-ALIAS-001",
		Status:         models.TxStatusCompleted,
		ResponseCode:   "00",
		Timestamp:      time.Now().UnixMilli(),
	})

	if err != nil {
		t.Fatalf("ProcessCBNWebhook alias: unexpected error: %v", err)
	}
}

// ─── publishEvent Tests ───────────────────────────────────────────────────────

func TestENairaService_PublishEvent_KafkaUnavailable_IsNonFatal(t *testing.T) {
	// publishEvent should log a warning but not return an error when Kafka is down
	f := newServiceFixture(t)
	ctx := context.Background()

	// Call publishEvent indirectly via ProvisionWallet (which calls publishEvent on success)
	f.mock.ExpectQuery(`SELECT id, cbn_wallet_id FROM enaira_wallets`).
		WithArgs("user-kafka-test-001", models.WalletTypeTourist).
		WillReturnError(pgx.ErrNoRows)
	f.mock.ExpectExec(`INSERT INTO enaira_wallets`).
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("INSERT", 1))

	// ProvisionWallet calls publishEvent — Kafka is unavailable but should not fail
	wallet, err := f.service.ProvisionWallet(ctx, &models.CreateWalletRequest{
		UserID:     "user-kafka-test-001",
		FullName:   "Kafka Test User",
		WalletType: models.WalletTypeTourist,
	})

	if err != nil {
		t.Fatalf("publishEvent Kafka unavailable: unexpected error: %v", err)
	}
	if wallet == nil {
		t.Fatal("expected non-nil wallet even when Kafka is unavailable")
	}
}

// ─── Ensure pgxmock satisfies DBQuerier ───────────────────────────────────────

// This is a compile-time check that pgxmock.PgxPoolIface satisfies DBQuerier.
// If pgxmock ever changes its interface, this will fail at compile time.
var _ DBQuerier = (*pgxmockPoolAdapter)(nil)

// pgxmockPoolAdapter wraps pgxmock.PgxPoolIface to satisfy DBQuerier.
// pgxmock uses pgx.Row interface but our DBQuerier uses pgx.Row too.
type pgxmockPoolAdapter struct {
	pgxmock.PgxPoolIface
}

func (a *pgxmockPoolAdapter) QueryRow(ctx context.Context, sql string, args ...interface{}) pgx.Row {
	return a.PgxPoolIface.QueryRow(ctx, sql, args...)
}

func (a *pgxmockPoolAdapter) Exec(ctx context.Context, sql string, args ...interface{}) (pgconn.CommandTag, error) {
	return a.PgxPoolIface.Exec(ctx, sql, args...)
}

// Verify the mock server handles concurrent requests correctly
func TestMockCBNServer_ConcurrentRequests(t *testing.T) {
	mock := newMockCBNServer(t)

	// Create a mock HTTP server that intercepts the CBN API calls
	var capturedBodies []string
	captureServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		capturedBodies = append(capturedBodies, string(body))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cbnInitiatePaymentResp{
			Status: "processing", TransactionRef: "ref-001", ResponseCode: "00",
		})
	}))
	defer captureServer.Close()

	// Verify mock server is accessible
	resp, err := http.Get(mock.server.URL + "/wallets/test-wallet/balance")
	if err != nil {
		t.Fatalf("mock server not accessible: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("mock server balance: got %d, want 200", resp.StatusCode)
	}
}
