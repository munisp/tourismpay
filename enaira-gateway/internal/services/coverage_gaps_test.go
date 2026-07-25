// Package services — coverage gap tests.
//
// These tests target the specific uncovered branches identified by go tool cover:
//   - NewENairaService constructor (0%)
//   - publishEvent marshal error branch (71.4%)
//   - GetWalletBalance CBN fallback + DB fallback (81.2%)
//   - CBNClient.post/get error paths (82-85%)
package services

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/munisp/tourismpay/enaira-gateway/internal/models"
	"github.com/pashagolub/pgxmock/v3"
	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

// ─── NewENairaService constructor ─────────────────────────────────────────────

func TestNewENairaService_Constructor(t *testing.T) {
	mock, err := pgxmock.NewPool()
	if err != nil {
		t.Fatalf("pgxmock.NewPool: %v", err)
	}
	defer mock.Close()

	rdb := redis.NewClient(&redis.Options{Addr: "localhost:6379"})
	logger, _ := zap.NewDevelopment()
	cbn := NewCBNClient("https://api.cbn.gov.ng", "test-key", "merchant-001", logger)

	svc := NewENairaService(mock, rdb, nil, cbn, logger)
	if svc == nil {
		t.Fatal("NewENairaService returned nil")
	}
	if svc.db == nil {
		t.Error("NewENairaService: db field is nil")
	}
	if svc.redis == nil {
		t.Error("NewENairaService: redis field is nil")
	}
	if svc.cbnClient == nil {
		t.Error("NewENairaService: cbnClient field is nil")
	}
	if svc.logger == nil {
		t.Error("NewENairaService: logger field is nil")
	}
}

// ─── publishEvent — marshal error branch ──────────────────────────────────────

func TestPublishEvent_MarshalError(t *testing.T) {
	// json.Marshal fails on channels
	mock, _ := pgxmock.NewPool()
	defer mock.Close()
	logger, _ := zap.NewDevelopment()

	svc := &ENairaService{
		db:          mock,
		kafkaWriter: &kafka.Writer{},
		logger:      logger,
	}

	ctx := context.Background()
	// Pass a channel which cannot be marshalled to JSON
	badPayload := map[string]interface{}{
		"channel": make(chan int), // json.Marshal will fail on this
	}
	// Should not panic — the error is logged and the function returns
	svc.publishEvent(ctx, "test-topic", "test-key", badPayload)
}

// ─── publishEvent — Kafka write error (non-fatal) ─────────────────────────────

func TestPublishEvent_KafkaWriteError_NonFatal(t *testing.T) {
	mock, _ := pgxmock.NewPool()
	defer mock.Close()
	logger, _ := zap.NewDevelopment()

	// Use a KafkaWriter pointing to a non-existent broker
	svc := &ENairaService{
		db: mock,
		kafkaWriter: &kafka.Writer{
			Addr:  kafka.TCP("localhost:19092"),
			Topic: "test",
		},
		logger: logger,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	// Should not panic — Kafka failure is logged as Warn and function returns
	svc.publishEvent(ctx, "test-topic", "test-key", map[string]interface{}{
		"event": "test",
		"data":  "value",
	})
}

// ─── GetWalletBalance — CBN fallback to DB ────────────────────────────────────

func TestGetWalletBalance_CBNFallbackToDBBalance(t *testing.T) {
	// Scenario: Redis miss, CBN returns error, fall back to DB balance
	mock, err := pgxmock.NewPool()
	if err != nil {
		t.Fatalf("pgxmock.NewPool: %v", err)
	}
	defer mock.Close()

	// Redis client pointing to non-existent server (will miss cache)
	rdb := redis.NewClient(&redis.Options{
		Addr:        "localhost:16379",
		DialTimeout: 10 * time.Millisecond,
		ReadTimeout: 10 * time.Millisecond,
	})

	// CBN server that returns 500 to force fallback
	cbnServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "CBN unavailable"})
	}))
	defer cbnServer.Close()

	logger, _ := zap.NewDevelopment()
	cbn := NewCBNClient(cbnServer.URL, "test-key", "merchant-001", logger).
		WithHTTPClient(cbnServer.Client()).
		WithBaseURL(cbnServer.URL)

	svc := &ENairaService{
		db:          mock,
		redis:       rdb,
		kafkaWriter: nil,
		cbnClient:   cbn,
		logger:      logger,
	}

	ctx := context.Background()
	walletID := "wallet-test-001"

	// Mock: SELECT cbn_wallet_id FROM enaira_wallets (for CBN call)
	mock.ExpectQuery(`SELECT cbn_wallet_id FROM enaira_wallets`).
		WithArgs(walletID).
		WillReturnRows(pgxmock.NewRows([]string{"cbn_wallet_id"}).AddRow("CBN-WALLET-001"))

	// Mock: SELECT balance_kobo FROM enaira_wallets (fallback after CBN failure)
	mock.ExpectQuery(`SELECT balance_kobo FROM enaira_wallets`).
		WithArgs(walletID).
		WillReturnRows(pgxmock.NewRows([]string{"balance_kobo"}).AddRow(int64(50000000))) // ₦500,000

	resp, err := svc.GetWalletBalance(ctx, walletID)
	if err != nil {
		t.Fatalf("GetWalletBalance CBN fallback: unexpected error: %v", err)
	}
	if resp.WalletID != walletID {
		t.Errorf("GetWalletBalance: wallet_id mismatch: got %s, want %s", resp.WalletID, walletID)
	}
	if resp.BalanceKobo != 50000000 {
		t.Errorf("GetWalletBalance: balance_kobo mismatch: got %d, want 50000000", resp.BalanceKobo)
	}
}

// ─── GetWalletBalance — Redis cache miss + CBN fallback ───────────────────────

func TestGetWalletBalance_RedisCacheMiss_CBNFallback(t *testing.T) {
	mock, _ := pgxmock.NewPool()
	defer mock.Close()

	// Redis pointing to non-existent server (cache miss)
	rdb := redis.NewClient(&redis.Options{
		Addr:        "localhost:16379",
		DialTimeout: 10 * time.Millisecond,
		ReadTimeout: 10 * time.Millisecond,
	})

	logger, _ := zap.NewDevelopment()
	cbn := NewCBNClient("http://localhost:19999", "test-key", "merchant-001", logger)

	svc := &ENairaService{
		db:          mock,
		redis:       rdb,
		kafkaWriter: nil,
		cbnClient:   cbn,
		logger:      logger,
	}

	ctx := context.Background()
	walletID := "wallet-cache-test"

	// Mock DB queries for the cache miss path
	mock.ExpectQuery(`SELECT cbn_wallet_id FROM enaira_wallets`).
		WithArgs(walletID).
		WillReturnRows(pgxmock.NewRows([]string{"cbn_wallet_id"}).AddRow("CBN-CACHE-001"))

	mock.ExpectQuery(`SELECT balance_kobo FROM enaira_wallets`).
		WithArgs(walletID).
		WillReturnRows(pgxmock.NewRows([]string{"balance_kobo"}).AddRow(int64(10000000))) // ₦100,000

	resp, err := svc.GetWalletBalance(ctx, walletID)
	if err != nil {
		t.Fatalf("GetWalletBalance cache miss: unexpected error: %v", err)
	}
	if resp.Currency != "NGN" {
		t.Errorf("GetWalletBalance: currency mismatch: got %s, want NGN", resp.Currency)
	}
}

// ─── CBNClient.post — connection refused ──────────────────────────────────────

func TestCBNClient_Post_ConnectionRefused(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	// Point to a port that is definitely not listening
	cbn := NewCBNClient("http://localhost:19999", "test-key", "merchant-001", logger)

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	_, _, err := cbn.ProvisionWallet(ctx, &models.CreateWalletRequest{
		UserID:      "test-user",
		WalletType:  models.WalletTypeTourist,
		BVN:         "12345678901",
		PhoneNumber: "+2348012345678",
		FullName:    "Test User",
	})
	if err == nil {
		t.Error("ProvisionWallet with connection refused: expected error, got nil")
	}
}

// ─── CBNClient.get — connection refused ───────────────────────────────────────

func TestCBNClient_Get_ConnectionRefused(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	cbn := NewCBNClient("http://localhost:19999", "test-key", "merchant-001", logger)

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	_, err := cbn.GetBalance(ctx, "CBN-WALLET-001")
	if err == nil {
		t.Error("GetBalance with connection refused: expected error, got nil")
	}
}

// ─── CBNClient.post — invalid JSON response ───────────────────────────────────

func TestCBNClient_Post_InvalidJSONResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("this is not json"))
	}))
	defer server.Close()

	logger, _ := zap.NewDevelopment()
	cbn := NewCBNClient(server.URL, "test-key", "merchant-001", logger).
		WithHTTPClient(server.Client()).
		WithBaseURL(server.URL)

	ctx := context.Background()
	_, _, err := cbn.ProvisionWallet(ctx, &models.CreateWalletRequest{
		UserID:      "test-user",
		WalletType:  models.WalletTypeTourist,
		BVN:         "12345678901",
		PhoneNumber: "+2348012345678",
		FullName:    "Test User",
	})
	if err == nil {
		t.Error("ProvisionWallet with invalid JSON response: expected error, got nil")
	}
}

// ─── CBNClient.get — invalid JSON response ────────────────────────────────────

func TestCBNClient_Get_InvalidJSONResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("not json"))
	}))
	defer server.Close()

	logger, _ := zap.NewDevelopment()
	cbn := NewCBNClient(server.URL, "test-key", "merchant-001", logger).
		WithHTTPClient(server.Client()).
		WithBaseURL(server.URL)

	ctx := context.Background()
	_, err := cbn.GetBalance(ctx, "CBN-WALLET-001")
	if err == nil {
		t.Error("GetBalance with invalid JSON response: expected error, got nil")
	}
}

// ─── GetWalletBalance — Redis cache hit (miniredis) ───────────────────────────

func TestGetWalletBalance_RedisCacheHit_Miniredis(t *testing.T) {
	// Use miniredis to simulate a real Redis server
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis.Run: %v", err)
	}
	defer mr.Close()

	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	mock, _ := pgxmock.NewPool()
	defer mock.Close()

	logger, _ := zap.NewDevelopment()
	cbn := NewCBNClient("http://localhost:19999", "test-key", "merchant-001", logger)

	svc := &ENairaService{
		db:          mock,
		redis:       rdb,
		kafkaWriter: nil,
		cbnClient:   cbn,
		logger:      logger,
	}

	ctx := context.Background()
	walletID := "wallet-miniredis-001"

	// Pre-populate the cache
	cachedResp := `{"wallet_id":"wallet-miniredis-001","balance_ngn":"5000.00","balance_kobo":500000,"currency":"NGN","as_of":"2024-01-01T00:00:00Z"}`
	mr.Set("enaira:wallet:"+walletID+":balance", cachedResp)

	resp, err := svc.GetWalletBalance(ctx, walletID)
	if err != nil {
		t.Fatalf("GetWalletBalance cache hit: unexpected error: %v", err)
	}
	if resp.WalletID != walletID {
		t.Errorf("cache hit: wallet_id mismatch: got %s, want %s", resp.WalletID, walletID)
	}
	if resp.Currency != "NGN" {
		t.Errorf("cache hit: currency mismatch: got %s, want NGN", resp.Currency)
	}
	if resp.BalanceKobo != 500000 {
		t.Errorf("cache hit: balance_kobo mismatch: got %d, want 500000", resp.BalanceKobo)
	}
}

// ─── GetWalletBalance — CBN success path (miniredis cache miss) ───────────────

func TestGetWalletBalance_CBNSuccess_Miniredis(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis.Run: %v", err)
	}
	defer mr.Close()

	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	mock, _ := pgxmock.NewPool()
	defer mock.Close()

	// CBN server that returns a valid balance
	cbnServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"balance_kobo": int64(75000000),
			"wallet_id":    "CBN-WALLET-MINI-001",
		})
	}))
	defer cbnServer.Close()

	logger, _ := zap.NewDevelopment()
	cbn := NewCBNClient(cbnServer.URL, "test-key", "merchant-001", logger).
		WithHTTPClient(cbnServer.Client()).
		WithBaseURL(cbnServer.URL)

	svc := &ENairaService{
		db:          mock,
		redis:       rdb,
		kafkaWriter: nil,
		cbnClient:   cbn,
		logger:      logger,
	}

	ctx := context.Background()
	walletID := "wallet-cbn-success-001"

	// Mock: SELECT cbn_wallet_id FROM enaira_wallets
	mock.ExpectQuery(`SELECT cbn_wallet_id FROM enaira_wallets`).
		WithArgs(walletID).
		WillReturnRows(pgxmock.NewRows([]string{"cbn_wallet_id"}).AddRow("CBN-WALLET-MINI-001"))

	resp, err := svc.GetWalletBalance(ctx, walletID)
	if err != nil {
		t.Fatalf("GetWalletBalance CBN success: unexpected error: %v", err)
	}
	if resp.WalletID != walletID {
		t.Errorf("CBN success: wallet_id mismatch: got %s, want %s", resp.WalletID, walletID)
	}
}

// ─── CBNClient.ProvisionWallet — rejection (non-00 response code) ─────────────

func TestCBNClient_ProvisionWallet_Rejected(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"response_code":    "51",
			"message":          "BVN not found",
			"wallet_id":        "",
			"wallet_address":   "",
		})
	}))
	defer server.Close()

	logger, _ := zap.NewDevelopment()
	cbn := NewCBNClient(server.URL, "test-key", "merchant-001", logger).
		WithHTTPClient(server.Client()).
		WithBaseURL(server.URL)

	ctx := context.Background()
	_, _, err := cbn.ProvisionWallet(ctx, &models.CreateWalletRequest{
		UserID:      "test-user",
		WalletType:  models.WalletTypeTourist,
		BVN:         "00000000000",
		PhoneNumber: "+2348012345678",
		FullName:    "Test User",
	})
	if err == nil {
		t.Error("ProvisionWallet rejection: expected error, got nil")
	}
}

// ─── CBNClient.InitiatePayment — rejection (non-00/09 response code) ──────────

func TestCBNClient_InitiatePayment_Rejected(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"response_code":   "51",
			"message":         "Insufficient funds",
			"transaction_ref": "",
		})
	}))
	defer server.Close()

	logger, _ := zap.NewDevelopment()
	cbn := NewCBNClient(server.URL, "test-key", "merchant-001", logger).
		WithHTTPClient(server.Client()).
		WithBaseURL(server.URL)

	ctx := context.Background()
	_, err := cbn.InitiatePayment(ctx, &models.InitiatePaymentRequest{
		SenderWalletID:   "wallet-sender-001",
		ReceiverWalletID: "wallet-receiver-001",
		AmountNGN:        "1500.00",
		TransactionType:  models.TxTypePayment,
		CorrelationID:    "corr-reject-001",
	})
	if err == nil {
		t.Error("InitiatePayment rejection: expected error, got nil")
	}
}

// ─── CBNClient.post — 4xx HTTP error ─────────────────────────────────────────

func TestCBNClient_Post_4xxError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"error": "unauthorized"}`))
	}))
	defer server.Close()

	logger, _ := zap.NewDevelopment()
	cbn := NewCBNClient(server.URL, "bad-key", "merchant-001", logger).
		WithHTTPClient(server.Client()).
		WithBaseURL(server.URL)

	ctx := context.Background()
	_, _, err := cbn.ProvisionWallet(ctx, &models.CreateWalletRequest{
		UserID:      "test-user",
		WalletType:  models.WalletTypeTourist,
		BVN:         "12345678901",
		PhoneNumber: "+2348012345678",
		FullName:    "Test User",
	})
	if err == nil {
		t.Error("post 4xx: expected error, got nil")
	}
}

// ─── CBNClient.get — 4xx HTTP error ──────────────────────────────────────────

func TestCBNClient_Get_4xxError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"error": "wallet not found"}`))
	}))
	defer server.Close()

	logger, _ := zap.NewDevelopment()
	cbn := NewCBNClient(server.URL, "test-key", "merchant-001", logger).
		WithHTTPClient(server.Client()).
		WithBaseURL(server.URL)

	ctx := context.Background()
	_, err := cbn.GetBalance(ctx, "nonexistent-wallet")
	if err == nil {
		t.Error("get 4xx: expected error, got nil")
	}
}

// ─── MockCBNClient.GetBalance — failure path ──────────────────────────────────

func TestMockCBNClient_GetBalance_Failure_Gap(t *testing.T) {
	mock := NewMockCBNClient()
	mock.ShouldFail = true
	mock.FailureCode = "51"
	ctx := context.Background()
	_, err := mock.GetBalance(ctx, "CBN-WALLET-FAIL")
	if err == nil {
		t.Error("MockCBNClient.GetBalance failure: expected error, got nil")
	}
}
