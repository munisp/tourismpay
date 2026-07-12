//go:build integration
// +build integration

// Integration tests for the eNaira gateway.
// Run with: go test -tags=integration -v ./tests/integration/...
// Requires: ENAIRA_GATEWAY_URL, POSTGRES_URL, REDIS_URL env vars.

package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/munisp/tourismpay/enaira-gateway/internal/models"
)

var baseURL string

func TestMain(m *testing.M) {
	baseURL = os.Getenv("ENAIRA_GATEWAY_URL")
	if baseURL == "" {
		baseURL = "http://localhost:8090"
	}
	// Wait for the gateway to be ready (up to 30s)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	for {
		resp, err := http.Get(baseURL + "/api/v1/enaira/health")
		if err == nil && resp.StatusCode == 200 {
			break
		}
		select {
		case <-ctx.Done():
			fmt.Println("eNaira gateway not ready, skipping integration tests")
			os.Exit(0)
		case <-time.After(1 * time.Second):
		}
	}
	os.Exit(m.Run())
}

func post(t *testing.T, path string, body interface{}) (*http.Response, []byte) {
	t.Helper()
	b, _ := json.Marshal(body)
	resp, err := http.Post(baseURL+path, "application/json", bytes.NewReader(b))
	if err != nil {
		t.Fatalf("POST %s failed: %v", path, err)
	}
	defer resp.Body.Close()
	var buf bytes.Buffer
	buf.ReadFrom(resp.Body)
	return resp, buf.Bytes()
}

func get(t *testing.T, path string) (*http.Response, []byte) {
	t.Helper()
	resp, err := http.Get(baseURL + path)
	if err != nil {
		t.Fatalf("GET %s failed: %v", path, err)
	}
	defer resp.Body.Close()
	var buf bytes.Buffer
	buf.ReadFrom(resp.Body)
	return resp, buf.Bytes()
}

// ─── Health ───────────────────────────────────────────────────────────────────

func TestIntegration_Health(t *testing.T) {
	resp, body := get(t, "/api/v1/enaira/health")
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, body)
	}
	var result map[string]string
	json.Unmarshal(body, &result)
	if result["status"] != "ok" {
		t.Errorf("expected status 'ok', got %q", result["status"])
	}
}

// ─── Full Tourist Wallet Lifecycle ────────────────────────────────────────────

func TestIntegration_TouristWalletLifecycle(t *testing.T) {
	userID := "integration-tourist-" + uuid.New().String()[:8]

	// Step 1: Provision wallet
	provReq := models.CreateWalletRequest{
		UserID:      userID,
		WalletType:  models.WalletTypeTourist,
		BVN:         "12345678901",
		PhoneNumber: "+2348012345678",
		FullName:    "Integration Test Tourist",
	}
	resp, body := post(t, "/api/v1/enaira/wallets", provReq)
	if resp.StatusCode != 201 {
		t.Fatalf("wallet provisioning failed: %d %s", resp.StatusCode, body)
	}
	var wallet models.ENairaWallet
	if err := json.Unmarshal(body, &wallet); err != nil {
		t.Fatalf("failed to parse wallet: %v", err)
	}
	if wallet.ID == "" {
		t.Fatal("wallet ID should not be empty")
	}
	t.Logf("Provisioned wallet: %s (CBN: %s)", wallet.ID, wallet.CBNWalletID)

	// Step 2: Check balance
	resp, body = get(t, "/api/v1/enaira/wallets/"+wallet.ID+"/balance")
	if resp.StatusCode != 200 {
		t.Fatalf("balance check failed: %d %s", resp.StatusCode, body)
	}
	var balance models.WalletBalanceResponse
	json.Unmarshal(body, &balance)
	if balance.Currency != "NGN" {
		t.Errorf("expected NGN, got %q", balance.Currency)
	}
	t.Logf("Balance: %s NGN", balance.BalanceNGN)

	// Step 3: Tourist load (USD → NGN)
	loadReq := models.TouristLoadRequest{
		TouristUserID:   userID,
		SourceCurrency:  "USD",
		SourceAmountStr: "50.00",
		FXRate:          "1550.00",
		CorrelationID:   "integ-load-" + uuid.New().String()[:8],
	}
	resp, body = post(t, "/api/v1/enaira/payments/tourist-load", loadReq)
	if resp.StatusCode != 201 {
		t.Fatalf("tourist load failed: %d %s", resp.StatusCode, body)
	}
	var loadTx models.ENairaTransaction
	json.Unmarshal(body, &loadTx)
	if loadTx.ID == "" {
		t.Error("load transaction ID should not be empty")
	}
	t.Logf("Tourist load transaction: %s (status: %s)", loadTx.ID, loadTx.Status)
}

// ─── Merchant Payment Flow ────────────────────────────────────────────────────

func TestIntegration_MerchantPaymentFlow(t *testing.T) {
	merchantID := "integration-merchant-" + uuid.New().String()[:8]
	touristID := "integration-tourist-" + uuid.New().String()[:8]

	// Provision merchant wallet
	merchantReq := models.CreateWalletRequest{
		UserID:      merchantID,
		WalletType:  models.WalletTypeMerchant,
		BVN:         "98765432101",
		NIN:         "12345678901",
		PhoneNumber: "+2348087654321",
		FullName:    "Integration Test Merchant Ltd",
	}
	resp, body := post(t, "/api/v1/enaira/wallets", merchantReq)
	if resp.StatusCode != 201 {
		t.Fatalf("merchant wallet provisioning failed: %d %s", resp.StatusCode, body)
	}
	var merchantWallet models.ENairaWallet
	json.Unmarshal(body, &merchantWallet)
	t.Logf("Merchant wallet: %s", merchantWallet.ID)

	// Provision tourist wallet
	touristReq := models.CreateWalletRequest{
		UserID:      touristID,
		WalletType:  models.WalletTypeTourist,
		BVN:         "11122233344",
		PhoneNumber: "+2348011223344",
		FullName:    "Integration Test Tourist",
	}
	resp, body = post(t, "/api/v1/enaira/wallets", touristReq)
	if resp.StatusCode != 201 {
		t.Fatalf("tourist wallet provisioning failed: %d %s", resp.StatusCode, body)
	}
	var touristWallet models.ENairaWallet
	json.Unmarshal(body, &touristWallet)
	t.Logf("Tourist wallet: %s", touristWallet.ID)

	// Initiate payment tourist → merchant
	payReq := models.InitiatePaymentRequest{
		SenderWalletID:   touristWallet.ID,
		ReceiverWalletID: merchantWallet.ID,
		AmountNGN:        "2500.00",
		TransactionType:  models.TxTypePayment,
		Narration:        "Safari experience payment",
		CorrelationID:    "integ-pay-" + uuid.New().String()[:8],
	}
	resp, body = post(t, "/api/v1/enaira/payments/initiate", payReq)
	if resp.StatusCode != 201 {
		t.Fatalf("payment initiation failed: %d %s", resp.StatusCode, body)
	}
	var tx models.ENairaTransaction
	json.Unmarshal(body, &tx)
	if tx.ID == "" {
		t.Error("transaction ID should not be empty")
	}
	t.Logf("Payment transaction: %s (status: %s, CBN ref: %s)", tx.ID, tx.Status, tx.CBNTxRef)
}

// ─── CBN Webhook Processing ───────────────────────────────────────────────────

func TestIntegration_CBNWebhook_Completed(t *testing.T) {
	event := models.CBNWebhookEvent{
		EventType:       "payment.completed",
		TransactionRef:  "CBN-TXN-integ-" + uuid.New().String()[:8],
		Status:          models.TxStatusCompleted,
		ResponseCode:    "00",
		ResponseMessage: "Approved",
		Timestamp:       time.Now().Unix(),
	}
	resp, body := post(t, "/api/v1/enaira/webhooks/cbn", event)
	if resp.StatusCode != 200 {
		t.Fatalf("webhook processing failed: %d %s", resp.StatusCode, body)
	}
}

func TestIntegration_CBNWebhook_Reversed(t *testing.T) {
	event := models.CBNWebhookEvent{
		EventType:       "payment.reversed",
		TransactionRef:  "CBN-TXN-rev-" + uuid.New().String()[:8],
		Status:          models.TxStatusReversed,
		ResponseCode:    "00",
		ResponseMessage: "Reversal approved",
		Timestamp:       time.Now().Unix(),
	}
	resp, body := post(t, "/api/v1/enaira/webhooks/cbn", event)
	if resp.StatusCode != 200 {
		t.Fatalf("reversal webhook failed: %d %s", resp.StatusCode, body)
	}
}

// ─── Duplicate Wallet Prevention ─────────────────────────────────────────────

func TestIntegration_DuplicateWallet_Rejected(t *testing.T) {
	userID := "integration-dup-" + uuid.New().String()[:8]
	req := models.CreateWalletRequest{
		UserID:      userID,
		WalletType:  models.WalletTypeTourist,
		BVN:         "55566677788",
		PhoneNumber: "+2348055667788",
		FullName:    "Duplicate Test User",
	}

	// First creation should succeed
	resp, body := post(t, "/api/v1/enaira/wallets", req)
	if resp.StatusCode != 201 {
		t.Fatalf("first wallet creation failed: %d %s", resp.StatusCode, body)
	}

	// Second creation for same user+type should be rejected
	resp, body = post(t, "/api/v1/enaira/wallets", req)
	if resp.StatusCode == 201 {
		t.Error("duplicate wallet should have been rejected")
	}
	t.Logf("Duplicate rejection status: %d", resp.StatusCode)
}

// ─── Invalid Amount Validation ────────────────────────────────────────────────

func TestIntegration_Payment_InvalidAmount(t *testing.T) {
	tests := []struct {
		name   string
		amount string
	}{
		{"negative amount", "-100.00"},
		{"zero amount", "0.00"},
		{"non-numeric", "abc"},
		{"empty string", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := models.InitiatePaymentRequest{
				SenderWalletID:   "wallet-sender",
				ReceiverWalletID: "wallet-receiver",
				AmountNGN:        tt.amount,
				TransactionType:  models.TxTypePayment,
				CorrelationID:    "corr-invalid-" + uuid.New().String()[:8],
			}
			resp, _ := post(t, "/api/v1/enaira/payments/initiate", req)
			if resp.StatusCode == 201 {
				t.Errorf("invalid amount %q should have been rejected", tt.amount)
			}
		})
	}
}
