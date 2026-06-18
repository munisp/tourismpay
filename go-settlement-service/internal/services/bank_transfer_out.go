package services

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/tourismpay/settlement-service/internal/database"
)

// ─── Prometheus Metrics ──────────────────────────────────────────────────────

var (
	bankTransfersOutTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "tourismpay_bank_transfers_out_total",
		Help: "Total outbound bank transfers by rail and status",
	}, []string{"rail", "status"})

	bankTransferOutVolumeNGN = promauto.NewCounter(prometheus.CounterOpts{
		Name: "tourismpay_bank_transfer_out_volume_ngn_total",
		Help: "Total outbound bank transfer volume in NGN",
	})
)

// ─── Types ──────────────────────────────────────────────────────────────────

type NigerianBank struct {
	Code     string `json:"code"`
	Name     string `json:"name"`
	NIPCode  string `json:"nip_code"`
	IsActive bool   `json:"is_active"`
}

type BankTransferOutRequest struct {
	UserID          string  `json:"user_id"`
	BankCode        string  `json:"bank_code"`
	AccountNumber   string  `json:"account_number"`
	Amount          float64 `json:"amount"`
	Currency        string  `json:"currency"`
	Narration       string  `json:"narration"`
	BeneficiaryName string  `json:"beneficiary_name,omitempty"`
	SaveBeneficiary bool    `json:"save_beneficiary"`
}

type NameEnquiryResult struct {
	AccountNumber string `json:"account_number"`
	AccountName   string `json:"account_name"`
	BankCode      string `json:"bank_code"`
	BankName      string `json:"bank_name"`
	Currency      string `json:"currency"`
	IsValid       bool   `json:"is_valid"`
}

type BankTransferOutResult struct {
	TransactionID   string    `json:"transaction_id"`
	SessionID       string    `json:"session_id"` // NIBSS session ID
	BankCode        string    `json:"bank_code"`
	BankName        string    `json:"bank_name"`
	AccountNumber   string    `json:"account_number"`
	AccountName     string    `json:"account_name"`
	Amount          float64   `json:"amount"`
	Fee             float64   `json:"fee"`
	TotalDebited    float64   `json:"total_debited"`
	Currency        string    `json:"currency"`
	Status          string    `json:"status"` // pending, processing, completed, failed, reversed
	Rail            string    `json:"rail"`   // nip, neft
	Narration       string    `json:"narration"`
	Reference       string    `json:"reference"`
	EstimatedTime   string    `json:"estimated_time"`
	CreatedAt       time.Time `json:"created_at"`
	CompletedAt     *time.Time `json:"completed_at,omitempty"`
}

type SavedBeneficiary struct {
	ID            string `json:"id"`
	UserID        string `json:"user_id"`
	BankCode      string `json:"bank_code"`
	BankName      string `json:"bank_name"`
	AccountNumber string `json:"account_number"`
	AccountName   string `json:"account_name"`
	Nickname      string `json:"nickname,omitempty"`
}

// ─── Service ─────────────────────────────────────────────────────────────────

type BankTransferOutService struct {
	mu    sync.RWMutex
	banks []NigerianBank
}

func NewBankTransferOutService() *BankTransferOutService {
	return &BankTransferOutService{
		banks: defaultNigerianBanks(),
	}
}

func (s *BankTransferOutService) ListBanks() []NigerianBank {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []NigerianBank
	for _, b := range s.banks {
		if b.IsActive {
			result = append(result, b)
		}
	}
	return result
}

func (s *BankTransferOutService) NameEnquiry(bankCode string, accountNumber string) (*NameEnquiryResult, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var bank *NigerianBank
	for _, b := range s.banks {
		if b.Code == bankCode {
			bank = &b
			break
		}
	}
	if bank == nil {
		return nil, fmt.Errorf("bank %s not found", bankCode)
	}

	if len(accountNumber) != 10 {
		return nil, fmt.Errorf("account number must be 10 digits (NUBAN format)")
	}

	// Simulate NIBSS NIP name enquiry (in production: call NIBSS API)
	return &NameEnquiryResult{
		AccountNumber: accountNumber,
		AccountName:   fmt.Sprintf("Customer %s****%s", accountNumber[:3], accountNumber[7:]),
		BankCode:      bankCode,
		BankName:      bank.Name,
		Currency:      "NGN",
		IsValid:       true,
	}, nil
}

func (s *BankTransferOutService) InitiateTransfer(req BankTransferOutRequest) (*BankTransferOutResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var bank *NigerianBank
	for _, b := range s.banks {
		if b.Code == req.BankCode {
			bank = &b
			break
		}
	}
	if bank == nil {
		return nil, fmt.Errorf("bank %s not found", req.BankCode)
	}

	if req.Amount <= 0 {
		return nil, fmt.Errorf("amount must be positive")
	}

	// Fee structure: NIP transfers
	var fee float64
	var rail string
	var estimatedTime string
	if req.Amount <= 5000 {
		fee = 10.75 // ₦10.75 for <= ₦5,000
		rail = "nip"
		estimatedTime = "Instant (< 30 seconds)"
	} else if req.Amount <= 50000 {
		fee = 25.75
		rail = "nip"
		estimatedTime = "Instant (< 30 seconds)"
	} else {
		fee = 53.75 // ₦53.75 for > ₦50,000
		rail = "nip"
		estimatedTime = "Instant (< 1 minute)"
	}

	txID := generateBankTransferID()
	sessionID := generateNIBSSSessionID()
	ref := fmt.Sprintf("NIP-%s", txID[:12])

	result := &BankTransferOutResult{
		TransactionID: txID,
		SessionID:     sessionID,
		BankCode:      req.BankCode,
		BankName:      bank.Name,
		AccountNumber: req.AccountNumber,
		AccountName:   req.BeneficiaryName,
		Amount:        req.Amount,
		Fee:           fee,
		TotalDebited:  req.Amount + fee,
		Currency:      "NGN",
		Status:        "completed",
		Rail:          rail,
		Narration:     req.Narration,
		Reference:     ref,
		EstimatedTime: estimatedTime,
		CreatedAt:     time.Now(),
	}

	// Persist transfer to PostgreSQL
	database.DB.Exec(
		"INSERT INTO bank_transfers (id, user_id, beneficiary_name, bank_code, account_number, amount, currency, reference, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
		txID, req.UserID, req.BeneficiaryName, req.BankCode, req.AccountNumber, req.Amount, "NGN", ref, "completed",
	)

	// Save beneficiary if requested
	if req.SaveBeneficiary && req.BeneficiaryName != "" {
		benID := generateBeneficiaryID()
		database.DB.Exec(
			"INSERT INTO bank_transfers (id, user_id, beneficiary_name, bank_code, account_number, amount, currency, reference, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'beneficiary')",
			benID, req.UserID, req.BeneficiaryName, req.BankCode, req.AccountNumber, 0.0, "NGN", "beneficiary",
		)
	}

	bankTransfersOutTotal.WithLabelValues(rail, "completed").Inc()
	bankTransferOutVolumeNGN.Add(req.Amount)

	return result, nil
}

func (s *BankTransferOutService) GetBeneficiaries(userID string) []SavedBeneficiary {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []SavedBeneficiary
	if database.DB != nil {
		rows, err := database.DB.Query(
			"SELECT id, user_id, bank_code, beneficiary_name, account_number FROM bank_transfers WHERE user_id=$1 AND status='beneficiary' ORDER BY id",
			userID,
		)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var b SavedBeneficiary
				rows.Scan(&b.ID, &b.UserID, &b.BankCode, &b.AccountName, &b.AccountNumber)
				result = append(result, b)
			}
		}
	}
	return result
}

func (s *BankTransferOutService) DeleteBeneficiary(userID string, beneficiaryID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if database.DB != nil {
		result, err := database.DB.Exec("DELETE FROM bank_transfers WHERE id=$1 AND user_id=$2 AND status='beneficiary'", beneficiaryID, userID)
		if err != nil {
			return fmt.Errorf("beneficiary not found")
		}
		if rows, _ := result.RowsAffected(); rows == 0 {
			return fmt.Errorf("beneficiary not found")
		}
	}
	return nil
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func generateBankTransferID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func generateNIBSSSessionID() string {
	b := make([]byte, 12)
	rand.Read(b)
	return fmt.Sprintf("999%s%s", time.Now().Format("060102"), hex.EncodeToString(b)[:12])
}

func generateBeneficiaryID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return "ben_" + hex.EncodeToString(b)
}

// ─── Default Nigerian Banks ──────────────────────────────────────────────────

func defaultNigerianBanks() []NigerianBank {
	return []NigerianBank{
		{Code: "044", Name: "Access Bank", NIPCode: "000014", IsActive: true},
		{Code: "023", Name: "Citibank Nigeria", NIPCode: "000009", IsActive: true},
		{Code: "063", Name: "Diamond Bank (Access)", NIPCode: "000005", IsActive: true},
		{Code: "050", Name: "Ecobank Nigeria", NIPCode: "000010", IsActive: true},
		{Code: "070", Name: "Fidelity Bank", NIPCode: "000007", IsActive: true},
		{Code: "011", Name: "First Bank of Nigeria", NIPCode: "000016", IsActive: true},
		{Code: "214", Name: "First City Monument Bank", NIPCode: "000003", IsActive: true},
		{Code: "058", Name: "GTBank", NIPCode: "000013", IsActive: true},
		{Code: "030", Name: "Heritage Bank", NIPCode: "000020", IsActive: true},
		{Code: "301", Name: "Jaiz Bank", NIPCode: "000006", IsActive: true},
		{Code: "082", Name: "Keystone Bank", NIPCode: "000002", IsActive: true},
		{Code: "101", Name: "Kuda Microfinance Bank", NIPCode: "090267", IsActive: true},
		{Code: "999", Name: "OPay", NIPCode: "100004", IsActive: true},
		{Code: "998", Name: "PalmPay", NIPCode: "100033", IsActive: true},
		{Code: "526", Name: "Parallex Bank", NIPCode: "000030", IsActive: true},
		{Code: "076", Name: "Polaris Bank", NIPCode: "000008", IsActive: true},
		{Code: "039", Name: "Stanbic IBTC Bank", NIPCode: "000012", IsActive: true},
		{Code: "232", Name: "Sterling Bank", NIPCode: "000001", IsActive: true},
		{Code: "100", Name: "TAJ Bank", NIPCode: "000026", IsActive: true},
		{Code: "032", Name: "Union Bank of Nigeria", NIPCode: "000018", IsActive: true},
		{Code: "033", Name: "United Bank for Africa", NIPCode: "000004", IsActive: true},
		{Code: "215", Name: "Unity Bank", NIPCode: "000011", IsActive: true},
		{Code: "035", Name: "Wema Bank", NIPCode: "000017", IsActive: true},
		{Code: "057", Name: "Zenith Bank", NIPCode: "000015", IsActive: true},
	}
}
