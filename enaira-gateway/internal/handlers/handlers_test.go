package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/munisp/tourismpay/enaira-gateway/internal/models"
	"go.uber.org/zap"
)

// ─── ENairaServiceInterface ───────────────────────────────────────────────────
// Defines the interface that the handler depends on, enabling mock injection.

type ENairaServiceInterface interface {
	ProvisionWallet(ctx context.Context, req *models.CreateWalletRequest) (*models.ENairaWallet, error)
	GetBalance(ctx context.Context, walletID string) (*models.WalletBalanceResponse, error)
	InitiatePayment(ctx context.Context, req *models.InitiatePaymentRequest) (*models.ENairaTransaction, error)
	TouristLoad(ctx context.Context, req *models.TouristLoadRequest) (*models.ENairaTransaction, error)
	ProcessCBNWebhook(ctx context.Context, event *models.CBNWebhookEvent) error
}

// ─── Mock Service ─────────────────────────────────────────────────────────────

type mockSvc struct {
	shouldFail bool
	wallet     *models.ENairaWallet
	tx         *models.ENairaTransaction
	balance    int64
}

func newMockSvc() *mockSvc {
	return &mockSvc{
		wallet: &models.ENairaWallet{
			ID:             uuid.New().String(),
			UserID:         "user-test-001",
			CBNWalletID:    "cbn-wallet-abc",
			WalletAddress:  "eNGNabc123",
			WalletType:     models.WalletTypeTourist,
			Status:         models.WalletStatusActive,
			BalanceKobo:    500000,
			KYCLevel:       1,
			DailyLimitKobo: 2000000,
			CreatedAt:      time.Now(),
			UpdatedAt:      time.Now(),
		},
		tx: &models.ENairaTransaction{
			ID:              uuid.New().String(),
			CBNTxRef:        "CBN-TXN-test",
			AmountKobo:      100000,
			Status:          models.TxStatusCompleted,
			TransactionType: models.TxTypePayment,
			InitiatedAt:     time.Now(),
		},
		balance: 500000,
	}
}

func (m *mockSvc) ProvisionWallet(ctx context.Context, req *models.CreateWalletRequest) (*models.ENairaWallet, error) {
	if m.shouldFail {
		return nil, fmt.Errorf("service unavailable")
	}
	return m.wallet, nil
}

func (m *mockSvc) GetBalance(ctx context.Context, walletID string) (*models.WalletBalanceResponse, error) {
	if m.shouldFail {
		return nil, fmt.Errorf("service unavailable")
	}
	return &models.WalletBalanceResponse{
		WalletID:    walletID,
		BalanceKobo: m.balance,
		BalanceNGN:  fmt.Sprintf("%.2f", float64(m.balance)/100),
		Currency:    "NGN",
		AsOf:        time.Now().Format(time.RFC3339),
	}, nil
}

func (m *mockSvc) InitiatePayment(ctx context.Context, req *models.InitiatePaymentRequest) (*models.ENairaTransaction, error) {
	if m.shouldFail {
		return nil, fmt.Errorf("service unavailable")
	}
	return m.tx, nil
}

func (m *mockSvc) TouristLoad(ctx context.Context, req *models.TouristLoadRequest) (*models.ENairaTransaction, error) {
	if m.shouldFail {
		return nil, fmt.Errorf("service unavailable")
	}
	return m.tx, nil
}

func (m *mockSvc) ProcessCBNWebhook(ctx context.Context, event *models.CBNWebhookEvent) error {
	if m.shouldFail {
		return fmt.Errorf("service unavailable")
	}
	return nil
}

// ─── Test Router Setup ────────────────────────────────────────────────────────

func setupTestRouter(svc ENairaServiceInterface) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	logger, _ := zap.NewDevelopment()
	h := &Handler{svc: svc, logger: logger}
	h.RegisterRoutes(r)
	return r
}

// ─── Health Check Tests ───────────────────────────────────────────────────────

func TestHealth_ReturnsOK(t *testing.T) {
	r := setupTestRouter(newMockSvc())
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/enaira/health", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	if resp["status"] != "ok" {
		t.Errorf("expected status 'ok', got %q", resp["status"])
	}
	if resp["service"] != "enaira-gateway" {
		t.Errorf("expected service 'enaira-gateway', got %q", resp["service"])
	}
}

// ─── Wallet Provisioning Tests ────────────────────────────────────────────────

func TestProvisionWallet_Success(t *testing.T) {
	r := setupTestRouter(newMockSvc())
	body := models.CreateWalletRequest{
		UserID:      "user-001",
		WalletType:  models.WalletTypeTourist,
		BVN:         "12345678901",
		PhoneNumber: "+2348012345678",
		FullName:    "Amara Okonkwo",
	}
	b, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/v1/enaira/wallets", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var wallet models.ENairaWallet
	if err := json.Unmarshal(w.Body.Bytes(), &wallet); err != nil {
		t.Fatalf("failed to parse wallet: %v", err)
	}
	if wallet.ID == "" {
		t.Error("wallet ID should not be empty")
	}
	if wallet.Status != models.WalletStatusActive {
		t.Errorf("expected active wallet, got %q", wallet.Status)
	}
}

func TestProvisionWallet_MissingBVN(t *testing.T) {
	r := setupTestRouter(newMockSvc())
	body := map[string]string{
		"user_id":      "user-001",
		"wallet_type":  "tourist",
		"phone_number": "+2348012345678",
		"full_name":    "Amara Okonkwo",
		// BVN intentionally omitted
	}
	b, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/v1/enaira/wallets", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing BVN, got %d", w.Code)
	}
}

func TestProvisionWallet_MissingUserID(t *testing.T) {
	r := setupTestRouter(newMockSvc())
	body := map[string]string{
		"wallet_type":  "tourist",
		"bvn":          "12345678901",
		"phone_number": "+2348012345678",
		"full_name":    "Amara Okonkwo",
		// user_id intentionally omitted
	}
	b, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/v1/enaira/wallets", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing user_id, got %d", w.Code)
	}
}

func TestProvisionWallet_ServiceError(t *testing.T) {
	svc := newMockSvc()
	svc.shouldFail = true
	r := setupTestRouter(svc)
	body := models.CreateWalletRequest{
		UserID:      "user-001",
		WalletType:  models.WalletTypeTourist,
		BVN:         "12345678901",
		PhoneNumber: "+2348012345678",
		FullName:    "Amara Okonkwo",
	}
	b, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/v1/enaira/wallets", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 on service error, got %d", w.Code)
	}
}

func TestProvisionWallet_MerchantType(t *testing.T) {
	r := setupTestRouter(newMockSvc())
	body := models.CreateWalletRequest{
		UserID:      "merchant-001",
		WalletType:  models.WalletTypeMerchant,
		BVN:         "98765432101",
		NIN:         "12345678901",
		PhoneNumber: "+2348087654321",
		FullName:    "Kofi Mensah Enterprises",
	}
	b, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/v1/enaira/wallets", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 for merchant wallet, got %d: %s", w.Code, w.Body.String())
	}
}

// ─── Balance Tests ────────────────────────────────────────────────────────────

func TestGetBalance_Success(t *testing.T) {
	r := setupTestRouter(newMockSvc())
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/enaira/wallets/wallet-test-001/balance", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp models.WalletBalanceResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse balance response: %v", err)
	}
	if resp.BalanceKobo <= 0 {
		t.Error("balance should be positive")
	}
	if resp.Currency != "NGN" {
		t.Errorf("expected NGN currency, got %q", resp.Currency)
	}
	if resp.AsOf == "" {
		t.Error("AsOf timestamp should not be empty")
	}
}

func TestGetBalance_ServiceError(t *testing.T) {
	svc := newMockSvc()
	svc.shouldFail = true
	r := setupTestRouter(svc)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/enaira/wallets/wallet-test-001/balance", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 on service error, got %d", w.Code)
	}
}

// ─── Payment Initiation Tests ─────────────────────────────────────────────────

func TestInitiatePayment_Success(t *testing.T) {
	r := setupTestRouter(newMockSvc())
	body := models.InitiatePaymentRequest{
		SenderWalletID:   "wallet-sender-001",
		ReceiverWalletID: "wallet-receiver-001",
		AmountNGN:        "1500.00",
		TransactionType:  models.TxTypePayment,
		Narration:        "Safari booking payment",
		CorrelationID:    "corr-" + uuid.New().String()[:8],
	}
	b, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/v1/enaira/payments/initiate", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var tx models.ENairaTransaction
	if err := json.Unmarshal(w.Body.Bytes(), &tx); err != nil {
		t.Fatalf("failed to parse transaction: %v", err)
	}
	if tx.ID == "" {
		t.Error("transaction ID should not be empty")
	}
	if tx.Status != models.TxStatusCompleted {
		t.Errorf("expected completed status, got %q", tx.Status)
	}
}

func TestInitiatePayment_MissingSenderWallet(t *testing.T) {
	r := setupTestRouter(newMockSvc())
	body := map[string]string{
		"receiver_wallet_id": "wallet-receiver-001",
		"amount_ngn":         "1500.00",
		"transaction_type":   "payment",
		"correlation_id":     "corr-001",
		// sender_wallet_id intentionally omitted
	}
	b, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/v1/enaira/payments/initiate", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing sender wallet, got %d", w.Code)
	}
}

func TestInitiatePayment_ZeroAmount(t *testing.T) {
	r := setupTestRouter(newMockSvc())
	body := models.InitiatePaymentRequest{
		SenderWalletID:   "wallet-sender-001",
		ReceiverWalletID: "wallet-receiver-001",
		AmountNGN:        "0.00",
		TransactionType:  models.TxTypePayment,
		CorrelationID:    "corr-zero-001",
	}
	b, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/v1/enaira/payments/initiate", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	// Zero amount should be rejected
	if w.Code == http.StatusCreated {
		t.Error("zero amount payment should not succeed")
	}
}

func TestInitiatePayment_ServiceError(t *testing.T) {
	svc := newMockSvc()
	svc.shouldFail = true
	r := setupTestRouter(svc)
	body := models.InitiatePaymentRequest{
		SenderWalletID:   "wallet-sender-001",
		ReceiverWalletID: "wallet-receiver-001",
		AmountNGN:        "1500.00",
		TransactionType:  models.TxTypePayment,
		CorrelationID:    "corr-001",
	}
	b, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/v1/enaira/payments/initiate", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 on service error, got %d", w.Code)
	}
}

// ─── Tourist Load Tests ───────────────────────────────────────────────────────

func TestTouristLoad_Success(t *testing.T) {
	r := setupTestRouter(newMockSvc())
	body := models.TouristLoadRequest{
		TouristUserID:   "tourist-001",
		SourceCurrency:  "USD",
		SourceAmountStr: "100.00",
		FXRate:          "1550.00",
		CorrelationID:   "corr-load-001",
	}
	b, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/v1/enaira/payments/tourist-load", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
}

func TestTouristLoad_MissingFXRate(t *testing.T) {
	r := setupTestRouter(newMockSvc())
	body := map[string]string{
		"tourist_user_id": "tourist-001",
		"source_currency": "USD",
		"source_amount":   "100.00",
		"correlation_id":  "corr-load-001",
		// fx_rate intentionally omitted
	}
	b, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/v1/enaira/payments/tourist-load", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing fx_rate, got %d", w.Code)
	}
}

// ─── CBN Webhook Tests ────────────────────────────────────────────────────────

func TestCBNWebhook_PaymentCompleted(t *testing.T) {
	r := setupTestRouter(newMockSvc())
	event := models.CBNWebhookEvent{
		EventType:       "payment.completed",
		TransactionRef:  "CBN-TXN-webhook-001",
		Status:          models.TxStatusCompleted,
		ResponseCode:    "00",
		ResponseMessage: "Approved",
		Timestamp:       time.Now().Unix(),
	}
	b, _ := json.Marshal(event)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/v1/enaira/webhooks/cbn", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCBNWebhook_PaymentFailed(t *testing.T) {
	r := setupTestRouter(newMockSvc())
	event := models.CBNWebhookEvent{
		EventType:       "payment.failed",
		TransactionRef:  "CBN-TXN-webhook-002",
		Status:          models.TxStatusFailed,
		ResponseCode:    "51",
		ResponseMessage: "Insufficient funds",
		Timestamp:       time.Now().Unix(),
	}
	b, _ := json.Marshal(event)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/v1/enaira/webhooks/cbn", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 (webhook ack), got %d: %s", w.Code, w.Body.String())
	}
}

func TestCBNWebhook_ServiceError(t *testing.T) {
	svc := newMockSvc()
	svc.shouldFail = true
	r := setupTestRouter(svc)
	event := models.CBNWebhookEvent{
		EventType:      "payment.completed",
		TransactionRef: "CBN-TXN-webhook-003",
		Status:         models.TxStatusCompleted,
		ResponseCode:   "00",
		Timestamp:      time.Now().Unix(),
	}
	b, _ := json.Marshal(event)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/v1/enaira/webhooks/cbn", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 on service error, got %d", w.Code)
	}
}

func TestCBNWebhook_EmptyBody(t *testing.T) {
	r := setupTestRouter(newMockSvc())
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/v1/enaira/webhooks/cbn", bytes.NewReader([]byte{}))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty webhook body, got %d", w.Code)
	}
}

// ─── Content-Type Enforcement Tests ──────────────────────────────────────────

func TestProvisionWallet_WrongContentType(t *testing.T) {
	r := setupTestRouter(newMockSvc())
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/v1/enaira/wallets", bytes.NewReader([]byte("plain text")))
	req.Header.Set("Content-Type", "text/plain")
	r.ServeHTTP(w, req)

	// Gin will reject non-JSON content type for JSON binding
	if w.Code == http.StatusCreated {
		t.Error("should reject non-JSON content type")
	}
}

// ─── Route Registration Tests ─────────────────────────────────────────────────

func TestRoutes_AllEndpointsRegistered(t *testing.T) {
	r := setupTestRouter(newMockSvc())
	routes := r.Routes()
	routeMap := make(map[string]bool)
	for _, route := range routes {
		routeMap[route.Method+":"+route.Path] = true
	}

	expected := []string{
		"GET:/api/v1/enaira/health",
		"POST:/api/v1/enaira/wallets",
		"GET:/api/v1/enaira/wallets/:wallet_id/balance",
		"POST:/api/v1/enaira/payments/initiate",
		"POST:/api/v1/enaira/payments/tourist-load",
		"POST:/api/v1/enaira/webhooks/cbn",
	}

	for _, route := range expected {
		if !routeMap[route] {
			t.Errorf("expected route %q not registered", route)
		}
	}
}
