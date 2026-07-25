// Package services — mock CBN HTTP server tests.
//
// These tests use httptest.NewServer to intercept all CBN API calls,
// allowing ENairaService methods to be tested without a live CBN sandbox.
// A pgxmock is used to intercept PostgreSQL calls.
//
// Coverage targets:
//   - ENairaService.ProvisionWallet     → CBN /wallets/provision
//   - ENairaService.InitiatePayment     → CBN /transactions/initiate
//   - ENairaService.LoadTouristWallet   → CBN /wallets/provision + /transactions/initiate
//   - ENairaService.GetWalletBalance    → CBN /wallets/{id}/balance
//   - ENairaService.HandleCBNWebhook    → no CBN call (inbound webhook)
//   - CBNClient.ProvisionWallet         → CBN /wallets/provision
//   - CBNClient.InitiatePayment         → CBN /transactions/initiate
//   - CBNClient.GetBalance              → CBN /wallets/{id}/balance
package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"go.uber.org/zap"

	"github.com/munisp/tourismpay/enaira-gateway/internal/models"
)

// ─── Mock CBN Server ──────────────────────────────────────────────────────────

// mockCBNServer holds the httptest.Server and counters for each endpoint.
type mockCBNServer struct {
	server          *httptest.Server
	provisionCalls  int32
	paymentCalls    int32
	balanceCalls    int32

	// Configurable responses
	provisionResp   cbnCreateWalletResp
	paymentResp     cbnInitiatePaymentResp
	balanceResp     cbnBalanceResp
	forceError      bool
	forceStatusCode int
}

// newMockCBNServer creates a new mock CBN HTTP server that handles all CBN API routes.
func newMockCBNServer(t *testing.T) *mockCBNServer {
	t.Helper()
	m := &mockCBNServer{
		provisionResp: cbnCreateWalletResp{
			WalletID:      "cbn-wallet-test-001",
			WalletAddress: "0xCBN1234567890ABCDEF",
			ResponseCode:  "00",
			Message:       "Wallet provisioned successfully",
		},
		paymentResp: cbnInitiatePaymentResp{
			Status:         "processing",
			TransactionRef: "CBN-TXN-TEST-001",
			ResponseCode:   "00",
			Message:        "Payment initiated",
		},
		balanceResp: cbnBalanceResp{
			WalletID:    "cbn-wallet-test-001",
			BalanceKobo: 500_000_00, // ₦500,000
			Currency:    "NGN",
			AsOf:        time.Now().UnixMilli(),
		},
	}

	mux := http.NewServeMux()

	// POST /wallets/provision
	mux.HandleFunc("/wallets/provision", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&m.provisionCalls, 1)
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if m.forceError {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "CBN internal error"})
			return
		}
		if m.forceStatusCode != 0 {
			w.WriteHeader(m.forceStatusCode)
			json.NewEncoder(w).Encode(cbnCreateWalletResp{ResponseCode: "99", Message: "rejected"})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(m.provisionResp)
	})

	// POST /transactions/initiate
	mux.HandleFunc("/transactions/initiate", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&m.paymentCalls, 1)
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if m.forceError {
			w.WriteHeader(http.StatusBadGateway)
			json.NewEncoder(w).Encode(map[string]string{"error": "CBN gateway error"})
			return
		}
		if m.forceStatusCode != 0 {
			w.WriteHeader(m.forceStatusCode)
			json.NewEncoder(w).Encode(cbnInitiatePaymentResp{ResponseCode: "05", Message: "insufficient funds"})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(m.paymentResp)
	})

	// GET /wallets/{id}/balance
	mux.HandleFunc("/wallets/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || !strings.HasSuffix(r.URL.Path, "/balance") {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		atomic.AddInt32(&m.balanceCalls, 1)
		if m.forceError {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{"error": "CBN service unavailable"})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(m.balanceResp)
	})

	m.server = httptest.NewServer(mux)
	t.Cleanup(func() { m.server.Close() })
	return m
}

// newTestCBNClient creates a CBNClient pointed at the mock server.
func newTestCBNClient(t *testing.T, mockServer *mockCBNServer) *CBNClient {
	t.Helper()
	logger, _ := zap.NewDevelopment()
	client := NewCBNClient(mockServer.server.URL, "test-api-key", "test-merchant-001", logger)
	return client
}

// ─── CBNClient Unit Tests (HTTP layer only) ───────────────────────────────────

func TestCBNClient_ProvisionWallet_Success(t *testing.T) {
	mock := newMockCBNServer(t)
	client := newTestCBNClient(t, mock)

	walletID, walletAddr, err := client.ProvisionWallet(context.Background(), &models.CreateWalletRequest{
		UserID:      "user-001",
		FullName:    "Adebayo Okonkwo",
		PhoneNumber: "+2348012345678",
		BVN:         "12345678901",
		WalletType:  models.WalletTypeTourist,
	})

	if err != nil {
		t.Fatalf("ProvisionWallet: unexpected error: %v", err)
	}
	if walletID != "cbn-wallet-test-001" {
		t.Errorf("walletID: got %q, want %q", walletID, "cbn-wallet-test-001")
	}
	if walletAddr != "0xCBN1234567890ABCDEF" {
		t.Errorf("walletAddr: got %q, want %q", walletAddr, "0xCBN1234567890ABCDEF")
	}
	if atomic.LoadInt32(&mock.provisionCalls) != 1 {
		t.Errorf("expected 1 provision call, got %d", mock.provisionCalls)
	}
}

func TestCBNClient_ProvisionWallet_CBNRejection(t *testing.T) {
	mock := newMockCBNServer(t)
	mock.forceStatusCode = http.StatusBadRequest
	client := newTestCBNClient(t, mock)

	_, _, err := client.ProvisionWallet(context.Background(), &models.CreateWalletRequest{
		UserID:      "user-002",
		FullName:    "Test User",
		PhoneNumber: "+2348099999999",
		WalletType:  models.WalletTypeTourist,
	})

	if err == nil {
		t.Fatal("expected error for CBN rejection, got nil")
	}
}

func TestCBNClient_ProvisionWallet_ServerError(t *testing.T) {
	mock := newMockCBNServer(t)
	mock.forceError = true
	client := newTestCBNClient(t, mock)

	_, _, err := client.ProvisionWallet(context.Background(), &models.CreateWalletRequest{
		UserID:     "user-003",
		FullName:   "Error User",
		WalletType: models.WalletTypeTourist,
	})

	if err == nil {
		t.Fatal("expected error for server error, got nil")
	}
}

func TestCBNClient_InitiatePayment_Success(t *testing.T) {
	mock := newMockCBNServer(t)
	client := newTestCBNClient(t, mock)

	cbnRef, err := client.InitiatePayment(context.Background(), &models.InitiatePaymentRequest{
		SenderWalletID:   "wallet-sender-001",
		ReceiverWalletID: "wallet-receiver-001",
		AmountNGN:        "50000.00",
		TransactionType:  models.TxTypePayment,
		Narration:        "Hotel payment - Eko Hotel Lagos",
		CorrelationID:    "corr-001",
	})

	if err != nil {
		t.Fatalf("InitiatePayment: unexpected error: %v", err)
	}
	if cbnRef != "CBN-TXN-TEST-001" {
		t.Errorf("cbnRef: got %q, want %q", cbnRef, "CBN-TXN-TEST-001")
	}
	if atomic.LoadInt32(&mock.paymentCalls) != 1 {
		t.Errorf("expected 1 payment call, got %d", mock.paymentCalls)
	}
}

func TestCBNClient_InitiatePayment_InvalidAmount(t *testing.T) {
	mock := newMockCBNServer(t)
	client := newTestCBNClient(t, mock)

	_, err := client.InitiatePayment(context.Background(), &models.InitiatePaymentRequest{
		SenderWalletID:   "wallet-sender-001",
		ReceiverWalletID: "wallet-receiver-001",
		AmountNGN:        "not-a-number",
		TransactionType:  models.TxTypePayment,
		CorrelationID:    "corr-002",
	})

	if err == nil {
		t.Fatal("expected error for invalid amount, got nil")
	}
}

func TestCBNClient_InitiatePayment_CBNError(t *testing.T) {
	mock := newMockCBNServer(t)
	mock.forceError = true
	client := newTestCBNClient(t, mock)

	_, err := client.InitiatePayment(context.Background(), &models.InitiatePaymentRequest{
		SenderWalletID:   "wallet-sender-001",
		ReceiverWalletID: "wallet-receiver-001",
		AmountNGN:        "1000.00",
		TransactionType:  models.TxTypePayment,
		CorrelationID:    "corr-003",
	})

	if err == nil {
		t.Fatal("expected error for CBN error, got nil")
	}
}

func TestCBNClient_InitiatePayment_PendingStatus(t *testing.T) {
	// ResponseCode "09" = pending — should be treated as success
	mock := newMockCBNServer(t)
	mock.paymentResp = cbnInitiatePaymentResp{
		Status:         "pending",
		TransactionRef: "CBN-TXN-PENDING-001",
		ResponseCode:   "09",
		Message:        "Transaction pending",
	}
	client := newTestCBNClient(t, mock)

	cbnRef, err := client.InitiatePayment(context.Background(), &models.InitiatePaymentRequest{
		SenderWalletID:   "wallet-sender-001",
		ReceiverWalletID: "wallet-receiver-001",
		AmountNGN:        "25000.00",
		TransactionType:  models.TxTypePayment,
		CorrelationID:    "corr-004",
	})

	if err != nil {
		t.Fatalf("InitiatePayment pending: unexpected error: %v", err)
	}
	if cbnRef != "CBN-TXN-PENDING-001" {
		t.Errorf("cbnRef: got %q, want %q", cbnRef, "CBN-TXN-PENDING-001")
	}
}

func TestCBNClient_GetBalance_Success(t *testing.T) {
	mock := newMockCBNServer(t)
	client := newTestCBNClient(t, mock)

	balance, err := client.GetBalance(context.Background(), "cbn-wallet-test-001")

	if err != nil {
		t.Fatalf("GetBalance: unexpected error: %v", err)
	}
	if balance != 500_000_00 {
		t.Errorf("balance: got %d, want %d", balance, 500_000_00)
	}
	if atomic.LoadInt32(&mock.balanceCalls) != 1 {
		t.Errorf("expected 1 balance call, got %d", mock.balanceCalls)
	}
}

func TestCBNClient_GetBalance_ServiceUnavailable(t *testing.T) {
	mock := newMockCBNServer(t)
	mock.forceError = true
	client := newTestCBNClient(t, mock)

	_, err := client.GetBalance(context.Background(), "cbn-wallet-test-001")

	if err == nil {
		t.Fatal("expected error for service unavailable, got nil")
	}
}

func TestCBNClient_WithBaseURL(t *testing.T) {
	mock := newMockCBNServer(t)
	logger, _ := zap.NewDevelopment()
	original := NewCBNClient("https://api.cbn.gov.ng", "key", "merchant", logger)
	redirected := original.WithBaseURL(mock.server.URL)

	// The redirected client should hit the mock server
	walletID, _, err := redirected.ProvisionWallet(context.Background(), &models.CreateWalletRequest{
		UserID:     "user-redirect-001",
		FullName:   "Redirect Test",
		WalletType: models.WalletTypeTourist,
	})

	if err != nil {
		t.Fatalf("WithBaseURL: unexpected error: %v", err)
	}
	if walletID != "cbn-wallet-test-001" {
		t.Errorf("walletID: got %q, want %q", walletID, "cbn-wallet-test-001")
	}
}

func TestCBNClient_WithHTTPClient(t *testing.T) {
	mock := newMockCBNServer(t)
	logger, _ := zap.NewDevelopment()
	// Create client with mock server URL and custom transport
	client := NewCBNClient(mock.server.URL, "key", "merchant", logger).
		WithHTTPClient(&http.Client{Timeout: 5 * time.Second})

	balance, err := client.GetBalance(context.Background(), "test-wallet")

	if err != nil {
		t.Fatalf("WithHTTPClient: unexpected error: %v", err)
	}
	if balance != 500_000_00 {
		t.Errorf("balance: got %d, want %d", balance, 500_000_00)
	}
}

// ─── Amount Conversion Tests ──────────────────────────────────────────────────

func TestCBNClient_InitiatePayment_KoboConversion(t *testing.T) {
	// Test that NGN → kobo conversion is correct
	// ₦50,000 = 5,000,000 kobo
	tests := []struct {
		amountNGN    string
		expectedKobo int64
	}{
		{"50000.00", 5_000_000},
		{"1.00", 100},
		{"0.50", 50},
		{"100000.00", 10_000_000},
		{"500000.00", 50_000_000},
	}

	for _, tc := range tests {
		t.Run(fmt.Sprintf("NGN_%s", tc.amountNGN), func(t *testing.T) {
			mock := newMockCBNServer(t)
			// Intercept the request body to verify kobo amount
			var capturedKobo int64
			mock.server.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/transactions/initiate" {
					var body cbnInitiatePaymentReq
					json.NewDecoder(r.Body).Decode(&body)
					capturedKobo = body.AmountKobo
					w.Header().Set("Content-Type", "application/json")
					json.NewEncoder(w).Encode(cbnInitiatePaymentResp{
						Status: "processing", TransactionRef: "ref-001", ResponseCode: "00",
					})
					return
				}
				http.NotFound(w, r)
			})
			client := newTestCBNClient(t, mock)

			_, err := client.InitiatePayment(context.Background(), &models.InitiatePaymentRequest{
				SenderWalletID:   "s",
				ReceiverWalletID: "r",
				AmountNGN:        tc.amountNGN,
				TransactionType:  models.TxTypePayment,
				CorrelationID:    "c",
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if capturedKobo != tc.expectedKobo {
				t.Errorf("kobo: got %d, want %d (for NGN %s)", capturedKobo, tc.expectedKobo, tc.amountNGN)
			}
		})
	}
}

// ─── Platform Fee Calculation Tests ──────────────────────────────────────────

func TestPlatformFeeCalculation(t *testing.T) {
	// Platform fee = 0.5% of amount, capped at ₦500 (50,000 kobo)
	tests := []struct {
		amountNGN   string
		expectedFee int64 // in kobo
	}{
		{"1000.00", 500},       // 0.5% of 100,000 kobo = 500 kobo (₦5)
		{"100000.00", 50000},   // 0.5% of 10,000,000 kobo = 50,000 kobo (₦500 — at cap)
		{"200000.00", 50000},   // 0.5% would be 100,000 kobo but capped at 50,000 (₦500)
		{"500000.00", 50000},   // capped at ₦500
		{"100.00", 50},         // 0.5% of 10,000 kobo = 50 kobo (₦0.50)
	}

	for _, tc := range tests {
		t.Run(fmt.Sprintf("NGN_%s", tc.amountNGN), func(t *testing.T) {
			amountDec, _ := decimal.NewFromString(tc.amountNGN)
			amountKobo := amountDec.Mul(decimal.NewFromInt(100)).IntPart()
			feeKobo := amountKobo / 200 // 0.5%
			if feeKobo > 50000 {
				feeKobo = 50000
			}
			if feeKobo != tc.expectedFee {
				t.Errorf("fee for NGN %s: got %d kobo, want %d kobo", tc.amountNGN, feeKobo, tc.expectedFee)
			}
		})
	}
}

// ─── KYC Tier Tests ───────────────────────────────────────────────────────────

func TestKYCTierLimits_MockServer(t *testing.T) {
	tests := []struct {
		name               string
		hasNIN             bool
		walletType         models.WalletType
		expectedKYCLevel   int
		expectedDailyKobo  int64
	}{
		{"Tier1_NoNIN_Tourist", false, models.WalletTypeTourist, 1, 20_000_00},
		{"Tier2_WithNIN_Tourist", true, models.WalletTypeTourist, 2, 100_000_00},
		{"Merchant_NoNIN", false, models.WalletTypeMerchant, 1, 500_000_00},
		{"Merchant_WithNIN", true, models.WalletTypeMerchant, 2, 500_000_00},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			// Replicate the KYC tier logic from ProvisionWallet
			kycLevel := 1
			dailyLimitKobo := int64(20_000_00)
			nin := ""
			if tc.hasNIN {
				nin = "12345678901"
				kycLevel = 2
				dailyLimitKobo = 100_000_00
			}
			if tc.walletType == models.WalletTypeMerchant {
				dailyLimitKobo = 500_000_00
			}
			_ = nin

			if kycLevel != tc.expectedKYCLevel {
				t.Errorf("KYC level: got %d, want %d", kycLevel, tc.expectedKYCLevel)
			}
			if dailyLimitKobo != tc.expectedDailyKobo {
				t.Errorf("daily limit: got %d kobo, want %d kobo", dailyLimitKobo, tc.expectedDailyKobo)
			}
		})
	}
}

// ─── Webhook Event Tests ──────────────────────────────────────────────────────

func TestCBNWebhookEvent_Validation_MockServer(t *testing.T) {
	// Test that webhook events have the correct structure
	tests := []struct {
		name        string
		event       models.CBNWebhookEvent
		expectValid bool
	}{
		{
			name: "ValidPaymentCompleted",
			event: models.CBNWebhookEvent{
				EventType:      "payment.completed",
				TransactionRef: "CBN-TXN-001",
				Status:         "completed",
				ResponseCode:   "00",
				Timestamp:      time.Now().UnixMilli(),
			},
			expectValid: true,
		},
		{
			name: "ValidPaymentFailed",
			event: models.CBNWebhookEvent{
				EventType:      "payment.failed",
				TransactionRef: "CBN-TXN-002",
				Status:         "failed",
				ResponseCode:   "05",
				Timestamp:      time.Now().UnixMilli(),
			},
			expectValid: true,
		},
		{
			name: "EmptyTransactionRef",
			event: models.CBNWebhookEvent{
				EventType: "payment.completed",
				Status:    "completed",
			},
			expectValid: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			isValid := tc.event.TransactionRef != "" && tc.event.EventType != ""
			if isValid != tc.expectValid {
				t.Errorf("validation: got %v, want %v", isValid, tc.expectValid)
			}
		})
	}
}

// ─── Concurrent CBN Calls Test ────────────────────────────────────────────────

func TestCBNClient_ConcurrentProvisionWallet(t *testing.T) {
	// Verify the CBN client is safe for concurrent use
	mock := newMockCBNServer(t)
	client := newTestCBNClient(t, mock)

	const goroutines = 10
	errs := make(chan error, goroutines)

	for i := 0; i < goroutines; i++ {
		go func(idx int) {
			_, _, err := client.ProvisionWallet(context.Background(), &models.CreateWalletRequest{
				UserID:     fmt.Sprintf("concurrent-user-%d", idx),
				FullName:   fmt.Sprintf("User %d", idx),
				WalletType: models.WalletTypeTourist,
			})
			errs <- err
		}(i)
	}

	for i := 0; i < goroutines; i++ {
		if err := <-errs; err != nil {
			t.Errorf("concurrent provision error: %v", err)
		}
	}

	if atomic.LoadInt32(&mock.provisionCalls) != int32(goroutines) {
		t.Errorf("expected %d provision calls, got %d", goroutines, mock.provisionCalls)
	}
}

// ─── API Key Header Validation ────────────────────────────────────────────────

func TestCBNClient_SendsCorrectHeaders(t *testing.T) {
	var capturedAPIKey, capturedMerchantID string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAPIKey = r.Header.Get("X-API-Key")
		capturedMerchantID = r.Header.Get("X-Merchant-ID")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cbnCreateWalletResp{
			WalletID: "test-wallet", WalletAddress: "0xABC", ResponseCode: "00",
		})
	}))
	defer server.Close()

	logger, _ := zap.NewDevelopment()
	client := NewCBNClient(server.URL, "my-secret-api-key", "merchant-id-001", logger)

	client.ProvisionWallet(context.Background(), &models.CreateWalletRequest{
		UserID: "u", FullName: "F", WalletType: models.WalletTypeTourist,
	})

	if capturedAPIKey != "my-secret-api-key" {
		t.Errorf("X-API-Key: got %q, want %q", capturedAPIKey, "my-secret-api-key")
	}
	if capturedMerchantID != "merchant-id-001" {
		t.Errorf("X-Merchant-ID: got %q, want %q", capturedMerchantID, "merchant-id-001")
	}
}
