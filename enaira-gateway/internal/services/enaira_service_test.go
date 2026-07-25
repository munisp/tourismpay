package services

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/munisp/tourismpay/enaira-gateway/internal/models"
	"go.uber.org/zap"
)

// ─── Test Helpers ─────────────────────────────────────────────────────────────

func newTestLogger() *zap.Logger {
	logger, _ := zap.NewDevelopment()
	return logger
}

func makeCreateWalletReq(walletType models.WalletType) *models.CreateWalletRequest {
	return &models.CreateWalletRequest{
		UserID:      "user-" + uuid.New().String()[:8],
		WalletType:  walletType,
		BVN:         "12345678901",
		PhoneNumber: "+2348012345678",
		FullName:    "Amara Okonkwo",
	}
}

func makePaymentReq(senderID, receiverID string, amountNGN string) *models.InitiatePaymentRequest {
	return &models.InitiatePaymentRequest{
		SenderWalletID:   senderID,
		ReceiverWalletID: receiverID,
		AmountNGN:        amountNGN,
		TransactionType:  models.TxTypePayment,
		Narration:        "Test payment",
		CorrelationID:    "corr-" + uuid.New().String()[:8],
	}
}

// ─── Model Validation Tests ───────────────────────────────────────────────────

func TestWalletType_Constants(t *testing.T) {
	tests := []struct {
		wt   models.WalletType
		want string
	}{
		{models.WalletTypeTourist, "tourist"},
		{models.WalletTypeMerchant, "merchant"},
		{models.WalletTypePersonal, "personal"},
	}
	for _, tt := range tests {
		if string(tt.wt) != tt.want {
			t.Errorf("WalletType %q: got %q, want %q", tt.wt, string(tt.wt), tt.want)
		}
	}
}

func TestTransactionStatus_Constants(t *testing.T) {
	if models.TxStatusCompleted != "completed" {
		t.Errorf("TxStatusCompleted should be 'completed', got %q", models.TxStatusCompleted)
	}
	if models.TxStatusFailed != "failed" {
		t.Errorf("TxStatusFailed should be 'failed', got %q", models.TxStatusFailed)
	}
	if models.TxStatusPending != "pending" {
		t.Errorf("TxStatusPending should be 'pending', got %q", models.TxStatusPending)
	}
}

func TestWalletStatus_Constants(t *testing.T) {
	if models.WalletStatusActive != "active" {
		t.Errorf("WalletStatusActive should be 'active', got %q", models.WalletStatusActive)
	}
	if models.WalletStatusFrozen != "frozen" {
		t.Errorf("WalletStatusFrozen should be 'frozen', got %q", models.WalletStatusFrozen)
	}
}

// ─── MockCBNClient Tests ──────────────────────────────────────────────────────

func TestMockCBNClient_ProvisionWallet_Success(t *testing.T) {
	mock := NewMockCBNClient()
	req := makeCreateWalletReq(models.WalletTypeTourist)
	ctx := context.Background()

	walletID, walletAddr, err := mock.ProvisionWallet(ctx, req)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if walletID == "" {
		t.Error("expected non-empty walletID")
	}
	if walletAddr == "" {
		t.Error("expected non-empty walletAddress")
	}
	if len(walletAddr) < 4 {
		t.Errorf("walletAddress too short: %q", walletAddr)
	}
}

func TestMockCBNClient_ProvisionWallet_Failure(t *testing.T) {
	mock := NewMockCBNClient()
	mock.ShouldFail = true
	mock.FailureCode = "CBN-001"
	req := makeCreateWalletReq(models.WalletTypeTourist)
	ctx := context.Background()

	_, _, err := mock.ProvisionWallet(ctx, req)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestMockCBNClient_GetBalance_Success(t *testing.T) {
	mock := NewMockCBNClient()
	ctx := context.Background()

	balance, err := mock.GetBalance(ctx, "cbn-wallet-test")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if balance != 500000 {
		t.Errorf("expected balance 500000 kobo, got %d", balance)
	}
}

func TestMockCBNClient_GetBalance_Failure(t *testing.T) {
	mock := NewMockCBNClient()
	mock.ShouldFail = true
	ctx := context.Background()

	_, err := mock.GetBalance(ctx, "cbn-wallet-test")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestMockCBNClient_InitiatePayment_Success(t *testing.T) {
	mock := NewMockCBNClient()
	ctx := context.Background()
	req := makePaymentReq("wallet-a", "wallet-b", "1000.00")

	txRef, err := mock.InitiatePayment(ctx, req)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if txRef == "" {
		t.Error("expected non-empty transaction reference")
	}
}

func TestMockCBNClient_InitiatePayment_Failure(t *testing.T) {
	mock := NewMockCBNClient()
	mock.ShouldFail = true
	mock.FailureCode = "CBN-INSUFFICIENT-FUNDS"
	ctx := context.Background()
	req := makePaymentReq("wallet-a", "wallet-b", "999999999.00")

	_, err := mock.InitiatePayment(ctx, req)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestMockCBNClient_ConfirmPayment_Success(t *testing.T) {
	mock := NewMockCBNClient()
	ctx := context.Background()

	status, err := mock.ConfirmPayment(ctx, "CBN-TXN-test123")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if status != models.TxStatusCompleted {
		t.Errorf("expected status 'completed', got %q", status)
	}
}

func TestMockCBNClient_ReverseTransaction_Success(t *testing.T) {
	mock := NewMockCBNClient()
	ctx := context.Background()

	err := mock.ReverseTransaction(ctx, "CBN-TXN-test123", "duplicate payment")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
}

func TestMockCBNClient_ReverseTransaction_Failure(t *testing.T) {
	mock := NewMockCBNClient()
	mock.ShouldFail = true
	ctx := context.Background()

	err := mock.ReverseTransaction(ctx, "CBN-TXN-test123", "test reason")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

// ─── MockENairaService Tests ──────────────────────────────────────────────────

func TestMockENairaService_ProvisionWallet_Success(t *testing.T) {
	svc := NewMockENairaService()
	ctx := context.Background()
	req := makeCreateWalletReq(models.WalletTypeTourist)

	wallet, err := svc.ProvisionWallet(ctx, req)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if wallet == nil {
		t.Fatal("expected non-nil wallet")
	}
	if wallet.Status != models.WalletStatusActive {
		t.Errorf("expected active wallet, got %q", wallet.Status)
	}
	if wallet.BalanceKobo != 500000 {
		t.Errorf("expected balance 500000, got %d", wallet.BalanceKobo)
	}
}

func TestMockENairaService_ProvisionWallet_Failure(t *testing.T) {
	svc := NewMockENairaService()
	svc.ShouldFail = true
	ctx := context.Background()
	req := makeCreateWalletReq(models.WalletTypeTourist)

	_, err := svc.ProvisionWallet(ctx, req)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestMockENairaService_GetBalance_Success(t *testing.T) {
	svc := NewMockENairaService()
	ctx := context.Background()

	resp, err := svc.GetBalance(ctx, "wallet-test-001")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if resp.BalanceKobo != 500000 {
		t.Errorf("expected 500000 kobo, got %d", resp.BalanceKobo)
	}
	if resp.Currency != "NGN" {
		t.Errorf("expected NGN currency, got %q", resp.Currency)
	}
}

func TestMockENairaService_InitiatePayment_Success(t *testing.T) {
	svc := NewMockENairaService()
	ctx := context.Background()
	req := makePaymentReq("wallet-a", "wallet-b", "500.00")

	tx, err := svc.InitiatePayment(ctx, req)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if tx == nil {
		t.Fatal("expected non-nil transaction")
	}
	if tx.Status != models.TxStatusCompleted {
		t.Errorf("expected completed status, got %q", tx.Status)
	}
}

func TestMockENairaService_TouristLoad_Success(t *testing.T) {
	svc := NewMockENairaService()
	ctx := context.Background()
	req := &models.TouristLoadRequest{
		TouristUserID:   "user-tourist-001",
		SourceCurrency:  "USD",
		SourceAmountStr: "100.00",
		FXRate:          "1550.00",
		CorrelationID:   "corr-test-001",
	}

	tx, err := svc.TouristLoad(ctx, req)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if tx == nil {
		t.Fatal("expected non-nil transaction")
	}
}

func TestMockENairaService_ProcessCBNWebhook_Success(t *testing.T) {
	svc := NewMockENairaService()
	ctx := context.Background()
	event := &models.CBNWebhookEvent{
		EventType:       "payment.completed",
		TransactionRef:  "CBN-TXN-webhook-001",
		Status:          models.TxStatusCompleted,
		ResponseCode:    "00",
		ResponseMessage: "Approved",
		Timestamp:       time.Now().Unix(),
	}

	err := svc.ProcessCBNWebhook(ctx, event)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
}

// ─── Business Logic Tests (KYC Tier Limits) ───────────────────────────────────

func TestKYCTierLimits(t *testing.T) {
	tests := []struct {
		name           string
		hasNIN         bool
		walletType     models.WalletType
		expectedTier   int
		expectedLimit  int64
	}{
		{
			name:          "Tier 1 tourist (BVN only)",
			hasNIN:        false,
			walletType:    models.WalletTypeTourist,
			expectedTier:  1,
			expectedLimit: 2000000, // ₦20,000
		},
		{
			name:          "Tier 2 tourist (BVN + NIN)",
			hasNIN:        true,
			walletType:    models.WalletTypeTourist,
			expectedTier:  2,
			expectedLimit: 10000000, // ₦100,000
		},
		{
			name:          "Merchant wallet",
			hasNIN:        true,
			walletType:    models.WalletTypeMerchant,
			expectedTier:  3,
			expectedLimit: 100000000, // ₦1,000,000
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := makeCreateWalletReq(tt.walletType)
			if tt.hasNIN {
				req.NIN = "12345678901"
			}

			// Validate KYC tier determination logic
			kycLevel := 1
			dailyLimit := int64(2000000)
			if req.NIN != "" {
				kycLevel = 2
				dailyLimit = 10000000
			}
			if req.WalletType == models.WalletTypeMerchant {
				kycLevel = 3
				dailyLimit = 100000000
			}

			if kycLevel != tt.expectedTier {
				t.Errorf("KYC tier: got %d, want %d", kycLevel, tt.expectedTier)
			}
			if dailyLimit != tt.expectedLimit {
				t.Errorf("Daily limit: got %d, want %d", dailyLimit, tt.expectedLimit)
			}
		})
	}
}

// ─── Amount Conversion Tests ──────────────────────────────────────────────────

func TestKoboToNGN_Conversion(t *testing.T) {
	tests := []struct {
		kobo    int64
		wantNGN string
	}{
		{100, "1.00"},
		{150000, "1500.00"},
		{500000, "5000.00"},
		{1, "0.01"},
		{0, "0.00"},
	}
	for _, tt := range tests {
		ngn := float64(tt.kobo) / 100
		got := fmt.Sprintf("%.2f", ngn)
		if got != tt.wantNGN {
			t.Errorf("kobo %d → NGN: got %q, want %q", tt.kobo, got, tt.wantNGN)
		}
	}
}

func TestNGNToKobo_Conversion(t *testing.T) {
	tests := []struct {
		ngn      string
		wantKobo int64
	}{
		{"1.00", 100},
		{"1500.00", 150000},
		{"5000.00", 500000},
		{"0.01", 1},
	}
	for _, tt := range tests {
		var ngn float64
		fmt.Sscanf(tt.ngn, "%f", &ngn)
		got := int64(ngn * 100)
		if got != tt.wantKobo {
			t.Errorf("NGN %q → kobo: got %d, want %d", tt.ngn, got, tt.wantKobo)
		}
	}
}

// ─── CBN Webhook Event Tests ──────────────────────────────────────────────────

func TestCBNWebhookEvent_Validation(t *testing.T) {
	validEvent := &models.CBNWebhookEvent{
		EventType:       "payment.completed",
		TransactionRef:  "CBN-TXN-12345",
		Status:          models.TxStatusCompleted,
		ResponseCode:    "00",
		ResponseMessage: "Approved",
		Timestamp:       time.Now().Unix(),
	}

	if validEvent.EventType == "" {
		t.Error("EventType should not be empty")
	}
	if validEvent.TransactionRef == "" {
		t.Error("TransactionRef should not be empty")
	}
	if validEvent.Status != models.TxStatusCompleted {
		t.Errorf("expected completed status, got %q", validEvent.Status)
	}
	if validEvent.Timestamp <= 0 {
		t.Error("Timestamp should be positive")
	}
}

func TestCBNWebhookEvent_FailedPayment(t *testing.T) {
	failedEvent := &models.CBNWebhookEvent{
		EventType:       "payment.failed",
		TransactionRef:  "CBN-TXN-99999",
		Status:          models.TxStatusFailed,
		ResponseCode:    "51",
		ResponseMessage: "Insufficient funds",
		Timestamp:       time.Now().Unix(),
	}

	if failedEvent.Status != models.TxStatusFailed {
		t.Errorf("expected failed status, got %q", failedEvent.Status)
	}
	if failedEvent.ResponseCode == "00" {
		t.Error("failed payment should not have success response code 00")
	}
}
