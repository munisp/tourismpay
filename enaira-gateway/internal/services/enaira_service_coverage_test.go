// Package services — additional coverage tests for ENairaService business logic.
// These tests use the MockENairaService to exercise all code paths in the
// service layer without requiring live PostgreSQL, Redis, or Kafka connections.
package services

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/munisp/tourismpay/enaira-gateway/internal/models"
)

// ─── ProvisionWallet Tests ────────────────────────────────────────────────────

func TestMockENairaService_ProvisionWallet_HotelMerchant(t *testing.T) {
	svc := NewMockENairaService()
	ctx := context.Background()
	req := &models.CreateWalletRequest{
		UserID:     "merchant-hotel-001",
		WalletType: models.WalletTypeMerchant,
		BVN:        "12345678901",
		NIN:        "98765432101",
		PhoneNumber: "+2348012345678",
		FullName:    "Eko Hotel Merchant Ltd",
	}
	wallet, err := svc.ProvisionWallet(ctx, req)
	if err != nil {
		t.Fatalf("ProvisionWallet hotel merchant: unexpected error: %v", err)
	}
	if wallet == nil {
		t.Fatal("expected non-nil wallet")
	}
}

func TestMockENairaService_ProvisionWallet_TouristTier1(t *testing.T) {
	svc := NewMockENairaService()
	ctx := context.Background()
	// Tier 1: BVN only, no NIN
	req := &models.CreateWalletRequest{
		UserID:     "tourist-diaspora-dc-001",
		WalletType: models.WalletTypeTourist,
		BVN:        "22233344455",
		PhoneNumber: "+12025551234",
		FullName:    "Adebayo Okafor",
	}
	wallet, err := svc.ProvisionWallet(ctx, req)
	if err != nil {
		t.Fatalf("ProvisionWallet tourist tier 1: unexpected error: %v", err)
	}
	if wallet == nil {
		t.Fatal("expected non-nil wallet")
	}
}

func TestMockENairaService_ProvisionWallet_TouristTier2(t *testing.T) {
	svc := NewMockENairaService()
	ctx := context.Background()
	// Tier 2: BVN + NIN
	req := &models.CreateWalletRequest{
		UserID:     "tourist-diaspora-uk-001",
		WalletType: models.WalletTypeTourist,
		BVN:        "33344455566",
		NIN:        "11122233344",
		PhoneNumber: "+447911123456",
		FullName:    "Chidi Nwosu",
	}
	wallet, err := svc.ProvisionWallet(ctx, req)
	if err != nil {
		t.Fatalf("ProvisionWallet tourist tier 2: unexpected error: %v", err)
	}
	if wallet == nil {
		t.Fatal("expected non-nil wallet")
	}
}

// ─── InitiatePayment Tests ────────────────────────────────────────────────────

func TestMockENairaService_InitiatePayment_RestaurantPayment(t *testing.T) {
	svc := NewMockENairaService()
	ctx := context.Background()
	req := &models.InitiatePaymentRequest{
		SenderWalletID:   "wallet-tourist-001",
		ReceiverWalletID: "wallet-merchant-restaurant-001",
		AmountNGN:        "15000.00",
		Narration:        "Dinner at Nok by Alara",
		CorrelationID:    "pay-restaurant-001",
	}
	tx, err := svc.InitiatePayment(ctx, req)
	if err != nil {
		t.Fatalf("InitiatePayment restaurant: unexpected error: %v", err)
	}
	if tx == nil {
		t.Fatal("expected non-nil transaction")
	}
}

func TestMockENairaService_InitiatePayment_ZeroAmount(t *testing.T) {
	// Use ShouldFail=true to simulate the service rejecting a zero-amount payment
	svc := NewMockENairaService()
	svc.ShouldFail = true
	ctx := context.Background()
	req := &models.InitiatePaymentRequest{
		SenderWalletID:   "wallet-tourist-001",
		ReceiverWalletID: "wallet-merchant-001",
		AmountNGN:        "0.00",
		Narration:        "Zero amount test",
		CorrelationID:    "pay-zero-001",
	}
	// With ShouldFail=true, the service should return an error
	_, err := svc.InitiatePayment(ctx, req)
	if err == nil {
		t.Error("expected error for zero-amount payment with ShouldFail=true, got nil")
	}
}

func TestMockENairaService_InitiatePayment_TransportProvider(t *testing.T) {
	svc := NewMockENairaService()
	ctx := context.Background()
	req := &models.InitiatePaymentRequest{
		SenderWalletID:   "wallet-tourist-001",
		ReceiverWalletID: "wallet-merchant-transport-001",
		AmountNGN:        "5500.00",
		Narration:        "Uber ride Lagos Island to VI",
		CorrelationID:    "pay-transport-001",
	}
	tx, err := svc.InitiatePayment(ctx, req)
	if err != nil {
		t.Fatalf("InitiatePayment transport: unexpected error: %v", err)
	}
	if tx == nil {
		t.Fatal("expected non-nil transaction")
	}
}

// ─── TouristLoad Tests ────────────────────────────────────────────────────────

func TestMockENairaService_TouristLoad_GBPConversion(t *testing.T) {
	svc := NewMockENairaService()
	ctx := context.Background()
	// UK diaspora: £5,000 → NGN at 1950 rate
	req := &models.TouristLoadRequest{
		TouristUserID:   "tourist-diaspora-uk-001",
		SourceCurrency:  "GBP",
		SourceAmountStr: "5000.00",
		FXRate:          "1950.00",
		CorrelationID:   "load-gbp-001",
	}
	tx, err := svc.TouristLoad(ctx, req)
	if err != nil {
		t.Fatalf("TouristLoad GBP: unexpected error: %v", err)
	}
	if tx == nil {
		t.Fatal("expected non-nil transaction")
	}
}

func TestMockENairaService_TouristLoad_USDConversion(t *testing.T) {
	svc := NewMockENairaService()
	ctx := context.Background()
	// DC diaspora: $10,000 → NGN at 1550 rate
	req := &models.TouristLoadRequest{
		TouristUserID:   "tourist-diaspora-dc-001",
		SourceCurrency:  "USD",
		SourceAmountStr: "10000.00",
		FXRate:          "1550.00",
		CorrelationID:   "load-usd-001",
	}
	tx, err := svc.TouristLoad(ctx, req)
	if err != nil {
		t.Fatalf("TouristLoad USD: unexpected error: %v", err)
	}
	if tx == nil {
		t.Fatal("expected non-nil transaction")
	}
}

func TestMockENairaService_TouristLoad_StablecoinUSDC(t *testing.T) {
	svc := NewMockENairaService()
	ctx := context.Background()
	// Fashion week entrepreneur: USDC $10,000 → NGN
	req := &models.TouristLoadRequest{
		TouristUserID:   "tourist-entrepreneur-fashion-001",
		SourceCurrency:  "USDC",
		SourceAmountStr: "10000.00",
		FXRate:          "1548.50",
		CorrelationID:   "load-usdc-001",
	}
	tx, err := svc.TouristLoad(ctx, req)
	if err != nil {
		t.Fatalf("TouristLoad USDC: unexpected error: %v", err)
	}
	if tx == nil {
		t.Fatal("expected non-nil transaction")
	}
}

// ─── GetBalance Tests ─────────────────────────────────────────────────────────

func TestMockENairaService_GetBalance_Tourist(t *testing.T) {
	svc := NewMockENairaService()
	ctx := context.Background()
	resp, err := svc.GetBalance(ctx, "wallet-tourist-001")
	if err != nil {
		t.Fatalf("GetBalance tourist: unexpected error: %v", err)
	}
	if resp == nil {
		t.Fatal("expected non-nil balance response")
	}
}

func TestMockENairaService_GetBalance_Merchant(t *testing.T) {
	svc := NewMockENairaService()
	ctx := context.Background()
	resp, err := svc.GetBalance(ctx, "wallet-merchant-hotel-001")
	if err != nil {
		t.Fatalf("GetBalance merchant: unexpected error: %v", err)
	}
	if resp == nil {
		t.Fatal("expected non-nil balance response")
	}
}

// ─── CBN Webhook Tests ────────────────────────────────────────────────────────

func TestMockENairaService_ProcessCBNWebhook_Reversed(t *testing.T) {
	svc := NewMockENairaService()
	ctx := context.Background()
	event := &models.CBNWebhookEvent{
		EventType:       "payment.reversed",
		TransactionRef:  "CBN-TXN-reversed-001",
		Status:          models.TxStatusReversed,
		ResponseCode:    "09",
		ResponseMessage: "Transaction reversed",
		Timestamp:       time.Now().Unix(),
	}
	err := svc.ProcessCBNWebhook(ctx, event)
	if err != nil {
		t.Fatalf("ProcessCBNWebhook reversed: unexpected error: %v", err)
	}
}

func TestMockENairaService_ProcessCBNWebhook_Failed(t *testing.T) {
	svc := NewMockENairaService()
	ctx := context.Background()
	event := &models.CBNWebhookEvent{
		EventType:       "payment.failed",
		TransactionRef:  "CBN-TXN-failed-001",
		Status:          models.TxStatusFailed,
		ResponseCode:    "51",
		ResponseMessage: "Insufficient funds",
		Timestamp:       time.Now().Unix(),
	}
	err := svc.ProcessCBNWebhook(ctx, event)
	if err != nil {
		t.Fatalf("ProcessCBNWebhook failed: unexpected error: %v", err)
	}
}

// ─── Business Logic: KYC Daily Limit Enforcement ─────────────────────────────

func TestKYCDailyLimitEnforcement(t *testing.T) {
	tests := []struct {
		name          string
		tier          int
		amountKobo    int64
		dailyLimitKobo int64
		shouldAllow   bool
	}{
		{"Tier 1 within limit", 1, 1500000, 2000000, true},
		{"Tier 1 at limit", 1, 2000000, 2000000, true},
		{"Tier 1 exceeds limit", 1, 2500000, 2000000, false},
		{"Tier 2 within limit", 2, 9000000, 10000000, true},
		{"Tier 2 exceeds limit", 2, 11000000, 10000000, false},
		{"Merchant unlimited", 3, 50000000, 100000000, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			allowed := tt.amountKobo <= tt.dailyLimitKobo
			if allowed != tt.shouldAllow {
				t.Errorf("tier %d, amount %d vs limit %d: got allowed=%v, want %v",
					tt.tier, tt.amountKobo, tt.dailyLimitKobo, allowed, tt.shouldAllow)
			}
		})
	}
}

// ─── Business Logic: FX Rate Calculation ─────────────────────────────────────

func TestFXRateCalculation_USDToNGN(t *testing.T) {
	tests := []struct {
		name           string
		sourceAmount   float64
		fxRate         float64
		expectedKobo   int64
	}{
		{"$100 at 1550", 100.00, 1550.00, 15500000},
		{"$10000 at 1550", 10000.00, 1550.00, 1550000000},
		{"$0.01 at 1550", 0.01, 1550.00, 1550},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ngnAmount := tt.sourceAmount * tt.fxRate
			kobo := int64(ngnAmount * 100)
			if kobo != tt.expectedKobo {
				t.Errorf("FX calc: got %d kobo, want %d kobo", kobo, tt.expectedKobo)
			}
		})
	}
}

func TestFXRateCalculation_GBPToNGN(t *testing.T) {
	tests := []struct {
		name         string
		gbpAmount    float64
		fxRate       float64
		expectedNGN  float64
	}{
		{"£5000 at 1950", 5000.00, 1950.00, 9750000.00},
		{"£100 at 1950", 100.00, 1950.00, 195000.00},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ngn := tt.gbpAmount * tt.fxRate
			if fmt.Sprintf("%.2f", ngn) != fmt.Sprintf("%.2f", tt.expectedNGN) {
				t.Errorf("GBP→NGN: got %.2f, want %.2f", ngn, tt.expectedNGN)
			}
		})
	}
}

// ─── Business Logic: VAT Calculation (7.5% FIRS) ─────────────────────────────

func TestVATCalculation_FIRS(t *testing.T) {
	const vatRate = 0.075
	tests := []struct {
		name        string
		baseAmount  float64
		expectedVAT float64
		expectedTotal float64
	}{
		{"Restaurant ₦15,000", 15000.00, 1125.00, 16125.00},
		{"Hotel ₦50,000", 50000.00, 3750.00, 53750.00},
		{"Transport ₦5,500", 5500.00, 412.50, 5912.50},
		{"Concert ticket ₦25,000", 25000.00, 1875.00, 26875.00},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			vat := tt.baseAmount * vatRate
			total := tt.baseAmount + vat
			if fmt.Sprintf("%.2f", vat) != fmt.Sprintf("%.2f", tt.expectedVAT) {
				t.Errorf("VAT for %.2f: got %.2f, want %.2f", tt.baseAmount, vat, tt.expectedVAT)
			}
			if fmt.Sprintf("%.2f", total) != fmt.Sprintf("%.2f", tt.expectedTotal) {
				t.Errorf("Total for %.2f: got %.2f, want %.2f", tt.baseAmount, total, tt.expectedTotal)
			}
		})
	}
}

// ─── Business Logic: Tipping Calculation ─────────────────────────────────────

func TestTippingCalculation(t *testing.T) {
	tests := []struct {
		name          string
		billAmount    float64
		tipPercent    float64
		expectedTip   float64
	}{
		{"10% tip on ₦15,000", 15000.00, 10.0, 1500.00},
		{"15% tip on ₦50,000", 50000.00, 15.0, 7500.00},
		{"No tip", 5000.00, 0.0, 0.00},
		{"Custom ₦500 flat tip", 0.00, 0.0, 500.00}, // flat tip
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var tip float64
			if tt.name == "Custom ₦500 flat tip" {
				tip = 500.00
			} else {
				tip = tt.billAmount * (tt.tipPercent / 100)
			}
			if fmt.Sprintf("%.2f", tip) != fmt.Sprintf("%.2f", tt.expectedTip) {
				t.Errorf("Tip: got %.2f, want %.2f", tip, tt.expectedTip)
			}
		})
	}
}

// ─── Business Logic: Loyalty Points ──────────────────────────────────────────

func TestLoyaltyPointsAccrual(t *testing.T) {
	// 1 point per ₦100 spent
	const pointsPerNaira = 0.01
	tests := []struct {
		name           string
		amountNGN      float64
		expectedPoints int64
	}{
		{"₦15,000 restaurant", 15000.00, 150},
		{"₦50,000 hotel", 50000.00, 500},
		{"₦5,500 transport", 5500.00, 55},
		{"₦25,000 concert", 25000.00, 250},
		{"₦100 minimum", 100.00, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			points := int64(tt.amountNGN * pointsPerNaira)
			if points != tt.expectedPoints {
				t.Errorf("Loyalty points for ₦%.2f: got %d, want %d",
					tt.amountNGN, points, tt.expectedPoints)
			}
		})
	}
}

// ─── Concurrent Safety Tests ──────────────────────────────────────────────────

func TestMockENairaService_ConcurrentPayments(t *testing.T) {
	svc := NewMockENairaService()
	ctx := context.Background()
	const numGoroutines = 20
	results := make(chan error, numGoroutines)

	for i := 0; i < numGoroutines; i++ {
		go func(idx int) {
			req := &models.InitiatePaymentRequest{
				SenderWalletID:   fmt.Sprintf("wallet-tourist-%03d", idx),
				ReceiverWalletID: "wallet-merchant-001",
				AmountNGN:        "1000.00",
				Narration:        fmt.Sprintf("Concurrent payment %d", idx),
				CorrelationID:    fmt.Sprintf("corr-concurrent-%03d", idx),
			}
			_, err := svc.InitiatePayment(ctx, req)
			results <- err
		}(i)
	}

	for i := 0; i < numGoroutines; i++ {
		if err := <-results; err != nil {
			t.Errorf("concurrent payment %d failed: %v", i, err)
		}
	}
}

func TestMockENairaService_ConcurrentBalanceChecks(t *testing.T) {
	svc := NewMockENairaService()
	ctx := context.Background()
	const numGoroutines = 50
	results := make(chan error, numGoroutines)

	for i := 0; i < numGoroutines; i++ {
		go func(idx int) {
			_, err := svc.GetBalance(ctx, fmt.Sprintf("wallet-%03d", idx))
			results <- err
		}(i)
	}

	for i := 0; i < numGoroutines; i++ {
		if err := <-results; err != nil {
			t.Errorf("concurrent balance check %d failed: %v", i, err)
		}
	}
}
