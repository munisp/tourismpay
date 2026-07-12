package services

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/munisp/tourismpay/enaira-gateway/internal/models"
)

// MockCBNClient is an in-memory implementation of the CBN API for unit tests.
// It simulates success and failure paths without network calls.
type MockCBNClient struct {
	// ShouldFail controls whether all calls return errors
	ShouldFail bool
	// FailureCode is the CBN error code to return when ShouldFail=true
	FailureCode string
	// ProvisionedWallets tracks wallets created during tests
	ProvisionedWallets map[string]*models.ENairaWallet
	// Transactions tracks initiated transactions
	Transactions map[string]*models.ENairaTransaction
}

// NewMockCBNClient creates a fresh mock with empty state.
func NewMockCBNClient() *MockCBNClient {
	return &MockCBNClient{
		ProvisionedWallets: make(map[string]*models.ENairaWallet),
		Transactions:       make(map[string]*models.ENairaTransaction),
	}
}

// ProvisionWallet simulates CBN wallet creation.
func (m *MockCBNClient) ProvisionWallet(ctx context.Context, req *models.CreateWalletRequest) (walletID, walletAddress string, err error) {
	if m.ShouldFail {
		return "", "", fmt.Errorf("CBN error %s: provisioning failed", m.FailureCode)
	}
	walletID = "cbn-wallet-" + uuid.New().String()[:8]
	walletAddress = "eNGN" + uuid.New().String()[:12]
	return walletID, walletAddress, nil
}

// GetBalance simulates CBN balance retrieval.
func (m *MockCBNClient) GetBalance(ctx context.Context, cbnWalletID string) (int64, error) {
	if m.ShouldFail {
		return 0, fmt.Errorf("CBN error %s: balance fetch failed", m.FailureCode)
	}
	// Return a fixed test balance of ₦5,000 (500000 kobo)
	return 500000, nil
}

// InitiatePayment simulates a CBN payment initiation.
func (m *MockCBNClient) InitiatePayment(ctx context.Context, req *models.InitiatePaymentRequest) (txRef string, err error) {
	if m.ShouldFail {
		return "", fmt.Errorf("CBN error %s: payment failed", m.FailureCode)
	}
	txRef = "CBN-TXN-" + uuid.New().String()[:12]
	return txRef, nil
}

// ConfirmPayment simulates CBN payment status confirmation.
func (m *MockCBNClient) ConfirmPayment(ctx context.Context, txRef string) (models.TransactionStatus, error) {
	if m.ShouldFail {
		return models.TxStatusFailed, fmt.Errorf("CBN error %s: confirmation failed", m.FailureCode)
	}
	return models.TxStatusCompleted, nil
}

// ReverseTransaction simulates a CBN transaction reversal.
func (m *MockCBNClient) ReverseTransaction(ctx context.Context, txRef, reason string) error {
	if m.ShouldFail {
		return fmt.Errorf("CBN error %s: reversal failed", m.FailureCode)
	}
	return nil
}

// ─── Mock ENairaService for handler tests ────────────────────────────────────

// MockENairaService is a lightweight mock of ENairaService for handler-layer tests.
type MockENairaService struct {
	ShouldFail      bool
	WalletToReturn  *models.ENairaWallet
	TxToReturn      *models.ENairaTransaction
	BalanceToReturn int64
}

func NewMockENairaService() *MockENairaService {
	return &MockENairaService{
		WalletToReturn: &models.ENairaWallet{
			ID:            uuid.New().String(),
			UserID:        "user-test-001",
			CBNWalletID:   "cbn-wallet-abc123",
			WalletAddress: "eNGNabc123def456",
			WalletType:    models.WalletTypeTourist,
			Status:        models.WalletStatusActive,
			BalanceKobo:   500000,
			KYCLevel:      1,
			DailyLimitKobo: 2000000,
			CreatedAt:     time.Now(),
			UpdatedAt:     time.Now(),
		},
		TxToReturn: &models.ENairaTransaction{
			ID:            uuid.New().String(),
			CBNTxRef:      "CBN-TXN-test123",
			AmountKobo:    100000,
			Status:        models.TxStatusCompleted,
			TransactionType: models.TxTypePayment,
			InitiatedAt:   time.Now(),
		},
		BalanceToReturn: 500000,
	}
}

func (m *MockENairaService) ProvisionWallet(ctx context.Context, req *models.CreateWalletRequest) (*models.ENairaWallet, error) {
	if m.ShouldFail {
		return nil, fmt.Errorf("service error: wallet provisioning failed")
	}
	return m.WalletToReturn, nil
}

func (m *MockENairaService) GetBalance(ctx context.Context, walletID string) (*models.WalletBalanceResponse, error) {
	if m.ShouldFail {
		return nil, fmt.Errorf("service error: balance fetch failed")
	}
	return &models.WalletBalanceResponse{
		WalletID:    walletID,
		BalanceKobo: m.BalanceToReturn,
		BalanceNGN:  fmt.Sprintf("%.2f", float64(m.BalanceToReturn)/100),
		Currency:    "NGN",
		AsOf:        time.Now().Format(time.RFC3339),
	}, nil
}

func (m *MockENairaService) InitiatePayment(ctx context.Context, req *models.InitiatePaymentRequest) (*models.ENairaTransaction, error) {
	if m.ShouldFail {
		return nil, fmt.Errorf("service error: payment initiation failed")
	}
	return m.TxToReturn, nil
}

func (m *MockENairaService) TouristLoad(ctx context.Context, req *models.TouristLoadRequest) (*models.ENairaTransaction, error) {
	if m.ShouldFail {
		return nil, fmt.Errorf("service error: tourist load failed")
	}
	return m.TxToReturn, nil
}

func (m *MockENairaService) ProcessCBNWebhook(ctx context.Context, event *models.CBNWebhookEvent) error {
	if m.ShouldFail {
		return fmt.Errorf("service error: webhook processing failed")
	}
	return nil
}
