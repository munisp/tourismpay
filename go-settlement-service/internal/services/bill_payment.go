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
	billPaymentsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "tourismpay_bill_payments_total",
		Help: "Total bill payments by category and status",
	}, []string{"category", "status"})

	billPaymentVolumeNGN = promauto.NewCounter(prometheus.CounterOpts{
		Name: "tourismpay_bill_payment_volume_ngn_total",
		Help: "Total bill payment volume in NGN",
	})
)

// ─── Types ──────────────────────────────────────────────────────────────────

type BillCategory string

const (
	BillCategoryAirtime     BillCategory = "airtime"
	BillCategoryData        BillCategory = "data"
	BillCategoryElectricity BillCategory = "electricity"
	BillCategoryCableTV     BillCategory = "cable_tv"
	BillCategoryWater       BillCategory = "water"
	BillCategoryInternet    BillCategory = "internet"
)

type BillProvider struct {
	ID          string       `json:"id"`
	Name        string       `json:"name"`
	Category    BillCategory `json:"category"`
	Country     string       `json:"country"`
	LogoURL     string       `json:"logo_url"`
	MinAmount   float64      `json:"min_amount"`
	MaxAmount   float64      `json:"max_amount"`
	Currency    string       `json:"currency"`
	Fee         float64      `json:"fee"`
	FeeType     string       `json:"fee_type"` // "flat" or "percent"
	IsActive    bool         `json:"is_active"`
	AccountType string       `json:"account_type"` // "phone", "meter", "smartcard", "account"
}

type BillPaymentRequest struct {
	ProviderID    string  `json:"provider_id"`
	AccountNumber string  `json:"account_number"`
	Amount        float64 `json:"amount"`
	Currency      string  `json:"currency"`
	UserID        string  `json:"user_id"`
	PhoneNumber   string  `json:"phone_number,omitempty"`
	DataPlanID    string  `json:"data_plan_id,omitempty"`
}

type BillPaymentResult struct {
	TransactionID   string    `json:"transaction_id"`
	ProviderID      string    `json:"provider_id"`
	ProviderName    string    `json:"provider_name"`
	Category        string    `json:"category"`
	AccountNumber   string    `json:"account_number"`
	Amount          float64   `json:"amount"`
	Fee             float64   `json:"fee"`
	TotalCharged    float64   `json:"total_charged"`
	Currency        string    `json:"currency"`
	Status          string    `json:"status"`
	Reference       string    `json:"reference"`
	Token           string    `json:"token,omitempty"` // For electricity prepaid
	Units           string    `json:"units,omitempty"` // e.g., "45.2 kWh"
	CustomerName    string    `json:"customer_name"`
	CreatedAt       time.Time `json:"created_at"`
}

type DataPlan struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	DataSize string  `json:"data_size"` // e.g., "1.5GB", "10GB"
	Validity string  `json:"validity"`  // e.g., "30 days", "7 days"
	Price    float64 `json:"price"`
	Currency string  `json:"currency"`
}

// ─── Service ─────────────────────────────────────────────────────────────────

type BillPaymentService struct {
	mu        sync.RWMutex
	providers []BillProvider
	dataPlans map[string][]DataPlan // providerID -> plans
}

func NewBillPaymentService() *BillPaymentService {
	svc := &BillPaymentService{
		providers: defaultBillProviders(),
		dataPlans: defaultDataPlans(),
	}
	return svc
}

func (s *BillPaymentService) ListProviders(category string, country string) []BillProvider {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []BillProvider
	for _, p := range s.providers {
		if !p.IsActive {
			continue
		}
		if category != "" && string(p.Category) != category {
			continue
		}
		if country != "" && p.Country != country {
			continue
		}
		result = append(result, p)
	}
	return result
}

func (s *BillPaymentService) GetDataPlans(providerID string) []DataPlan {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.dataPlans[providerID]
}

func (s *BillPaymentService) ValidateAccount(providerID string, accountNumber string) (*BillPaymentResult, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var provider *BillProvider
	for _, p := range s.providers {
		if p.ID == providerID {
			provider = &p
			break
		}
	}
	if provider == nil {
		return nil, fmt.Errorf("provider %s not found", providerID)
	}

	// Simulate account validation (in production: call Flutterwave/Paystack validate endpoint)
	customerName := "Customer " + accountNumber[len(accountNumber)-4:]
	if provider.Category == BillCategoryElectricity {
		customerName = "Meter " + accountNumber
	}

	return &BillPaymentResult{
		ProviderID:    providerID,
		ProviderName:  provider.Name,
		Category:      string(provider.Category),
		AccountNumber: accountNumber,
		CustomerName:  customerName,
		Status:        "validated",
	}, nil
}

func (s *BillPaymentService) ProcessPayment(req BillPaymentRequest) (*BillPaymentResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var provider *BillProvider
	for _, p := range s.providers {
		if p.ID == req.ProviderID {
			provider = &p
			break
		}
	}
	if provider == nil {
		return nil, fmt.Errorf("provider %s not found", req.ProviderID)
	}
	if !provider.IsActive {
		return nil, fmt.Errorf("provider %s is currently unavailable", provider.Name)
	}
	if req.Amount < provider.MinAmount || req.Amount > provider.MaxAmount {
		return nil, fmt.Errorf("amount must be between %.0f and %.0f %s",
			provider.MinAmount, provider.MaxAmount, provider.Currency)
	}

	// Calculate fee
	var fee float64
	if provider.FeeType == "percent" {
		fee = req.Amount * provider.Fee / 100
	} else {
		fee = provider.Fee
	}

	txID := generateBillTxID()
	ref := fmt.Sprintf("BILL-%s-%s", provider.Category, txID[:8])

	// Simulate processing (in production: call Flutterwave bills API or Paystack)
	result := &BillPaymentResult{
		TransactionID: txID,
		ProviderID:    req.ProviderID,
		ProviderName:  provider.Name,
		Category:      string(provider.Category),
		AccountNumber: req.AccountNumber,
		Amount:        req.Amount,
		Fee:           fee,
		TotalCharged:  req.Amount + fee,
		Currency:      provider.Currency,
		Status:        "completed",
		Reference:     ref,
		CustomerName:  "Customer " + req.AccountNumber[len(req.AccountNumber)-4:],
		CreatedAt:     time.Now(),
	}

	// Electricity prepaid: return token
	if provider.Category == BillCategoryElectricity {
		tokenBytes := make([]byte, 10)
		rand.Read(tokenBytes)
		result.Token = fmt.Sprintf("%04d-%04d-%04d-%04d-%04d",
			bytesToInt(tokenBytes[0:2])%10000,
			bytesToInt(tokenBytes[2:4])%10000,
			bytesToInt(tokenBytes[4:6])%10000,
			bytesToInt(tokenBytes[6:8])%10000,
			bytesToInt(tokenBytes[8:10])%10000)
		result.Units = fmt.Sprintf("%.1f kWh", req.Amount/66.0) // ~₦66/kWh avg
	}

	// Persist to PostgreSQL
	if database.DB != nil {
		database.DB.Exec(
			"INSERT INTO bill_payments (transaction_id, provider_id, category, account_number, amount, fee, total_charged, currency, status, reference, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
			txID, req.ProviderID, string(provider.Category), req.AccountNumber, req.Amount, fee, req.Amount+fee, provider.Currency, "completed", ref, time.Now(),
		)
	}

	billPaymentsTotal.WithLabelValues(string(provider.Category), "completed").Inc()
	billPaymentVolumeNGN.Add(req.Amount)

	return result, nil
}

func (s *BillPaymentService) GetHistory(userID string) []BillPaymentResult {
	if database.DB == nil {
		return []BillPaymentResult{}
	}
	rows, err := database.DB.Query(
		"SELECT transaction_id, provider_id, category, account_number, amount, fee, total_charged, currency, status, reference, created_at FROM bill_payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
		userID,
	)
	if err != nil {
		return []BillPaymentResult{}
	}
	defer rows.Close()
	var results []BillPaymentResult
	for rows.Next() {
		var r BillPaymentResult
		if err := rows.Scan(&r.TransactionID, &r.ProviderID, &r.Category, &r.AccountNumber, &r.Amount, &r.Fee, &r.TotalCharged, &r.Currency, &r.Status, &r.Reference, &r.CreatedAt); err == nil {
			results = append(results, r)
		}
	}
	return results
}

func bytesToInt(b []byte) int {
	if len(b) < 2 {
		return 0
	}
	return int(b[0])<<8 | int(b[1])
}

func generateBillTxID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// ─── Default Providers ──────────────────────────────────────────────────────

func defaultBillProviders() []BillProvider {
	return []BillProvider{
		// Airtime - Nigeria
		{ID: "mtn-ng-airtime", Name: "MTN Nigeria", Category: BillCategoryAirtime, Country: "NG", MinAmount: 50, MaxAmount: 50000, Currency: "NGN", Fee: 0, FeeType: "flat", IsActive: true, AccountType: "phone"},
		{ID: "airtel-ng-airtime", Name: "Airtel Nigeria", Category: BillCategoryAirtime, Country: "NG", MinAmount: 50, MaxAmount: 50000, Currency: "NGN", Fee: 0, FeeType: "flat", IsActive: true, AccountType: "phone"},
		{ID: "glo-ng-airtime", Name: "Glo Nigeria", Category: BillCategoryAirtime, Country: "NG", MinAmount: 50, MaxAmount: 50000, Currency: "NGN", Fee: 0, FeeType: "flat", IsActive: true, AccountType: "phone"},
		{ID: "9mobile-ng-airtime", Name: "9mobile Nigeria", Category: BillCategoryAirtime, Country: "NG", MinAmount: 50, MaxAmount: 50000, Currency: "NGN", Fee: 0, FeeType: "flat", IsActive: true, AccountType: "phone"},
		// Airtime - Kenya
		{ID: "safaricom-ke-airtime", Name: "Safaricom", Category: BillCategoryAirtime, Country: "KE", MinAmount: 10, MaxAmount: 10000, Currency: "KES", Fee: 0, FeeType: "flat", IsActive: true, AccountType: "phone"},
		{ID: "airtel-ke-airtime", Name: "Airtel Kenya", Category: BillCategoryAirtime, Country: "KE", MinAmount: 10, MaxAmount: 10000, Currency: "KES", Fee: 0, FeeType: "flat", IsActive: true, AccountType: "phone"},
		// Data - Nigeria
		{ID: "mtn-ng-data", Name: "MTN Nigeria Data", Category: BillCategoryData, Country: "NG", MinAmount: 100, MaxAmount: 50000, Currency: "NGN", Fee: 0, FeeType: "flat", IsActive: true, AccountType: "phone"},
		{ID: "airtel-ng-data", Name: "Airtel Nigeria Data", Category: BillCategoryData, Country: "NG", MinAmount: 100, MaxAmount: 50000, Currency: "NGN", Fee: 0, FeeType: "flat", IsActive: true, AccountType: "phone"},
		{ID: "glo-ng-data", Name: "Glo Nigeria Data", Category: BillCategoryData, Country: "NG", MinAmount: 100, MaxAmount: 50000, Currency: "NGN", Fee: 0, FeeType: "flat", IsActive: true, AccountType: "phone"},
		// Electricity - Nigeria
		{ID: "ekedc-prepaid", Name: "EKEDC (Eko)", Category: BillCategoryElectricity, Country: "NG", MinAmount: 500, MaxAmount: 500000, Currency: "NGN", Fee: 100, FeeType: "flat", IsActive: true, AccountType: "meter"},
		{ID: "ikedc-prepaid", Name: "IKEDC (Ikeja)", Category: BillCategoryElectricity, Country: "NG", MinAmount: 500, MaxAmount: 500000, Currency: "NGN", Fee: 100, FeeType: "flat", IsActive: true, AccountType: "meter"},
		{ID: "aedc-prepaid", Name: "AEDC (Abuja)", Category: BillCategoryElectricity, Country: "NG", MinAmount: 500, MaxAmount: 500000, Currency: "NGN", Fee: 100, FeeType: "flat", IsActive: true, AccountType: "meter"},
		{ID: "phed-prepaid", Name: "PHED (Port Harcourt)", Category: BillCategoryElectricity, Country: "NG", MinAmount: 500, MaxAmount: 500000, Currency: "NGN", Fee: 100, FeeType: "flat", IsActive: true, AccountType: "meter"},
		{ID: "ibedc-prepaid", Name: "IBEDC (Ibadan)", Category: BillCategoryElectricity, Country: "NG", MinAmount: 500, MaxAmount: 500000, Currency: "NGN", Fee: 100, FeeType: "flat", IsActive: true, AccountType: "meter"},
		// Cable TV - Nigeria
		{ID: "dstv-ng", Name: "DStv Nigeria", Category: BillCategoryCableTV, Country: "NG", MinAmount: 2500, MaxAmount: 50000, Currency: "NGN", Fee: 100, FeeType: "flat", IsActive: true, AccountType: "smartcard"},
		{ID: "gotv-ng", Name: "GOtv Nigeria", Category: BillCategoryCableTV, Country: "NG", MinAmount: 1300, MaxAmount: 15000, Currency: "NGN", Fee: 100, FeeType: "flat", IsActive: true, AccountType: "smartcard"},
		{ID: "startimes-ng", Name: "StarTimes Nigeria", Category: BillCategoryCableTV, Country: "NG", MinAmount: 900, MaxAmount: 10000, Currency: "NGN", Fee: 50, FeeType: "flat", IsActive: true, AccountType: "smartcard"},
		// Electricity - Kenya
		{ID: "kplc-prepaid", Name: "Kenya Power (Prepaid)", Category: BillCategoryElectricity, Country: "KE", MinAmount: 50, MaxAmount: 35000, Currency: "KES", Fee: 0, FeeType: "flat", IsActive: true, AccountType: "meter"},
		// Water - Nigeria
		{ID: "lswc-ng", Name: "Lagos Water Corp", Category: BillCategoryWater, Country: "NG", MinAmount: 500, MaxAmount: 100000, Currency: "NGN", Fee: 100, FeeType: "flat", IsActive: true, AccountType: "account"},
		// Internet - Nigeria
		{ID: "spectranet-ng", Name: "Spectranet", Category: BillCategoryInternet, Country: "NG", MinAmount: 2000, MaxAmount: 50000, Currency: "NGN", Fee: 0, FeeType: "flat", IsActive: true, AccountType: "account"},
		{ID: "smile-ng", Name: "Smile Communications", Category: BillCategoryInternet, Country: "NG", MinAmount: 1000, MaxAmount: 50000, Currency: "NGN", Fee: 0, FeeType: "flat", IsActive: true, AccountType: "account"},
	}
}

func defaultDataPlans() map[string][]DataPlan {
	return map[string][]DataPlan{
		"mtn-ng-data": {
			{ID: "mtn-500mb-1d", Name: "500MB", DataSize: "500MB", Validity: "1 day", Price: 150, Currency: "NGN"},
			{ID: "mtn-1gb-1d", Name: "1GB", DataSize: "1GB", Validity: "1 day", Price: 300, Currency: "NGN"},
			{ID: "mtn-2gb-30d", Name: "2GB", DataSize: "2GB", Validity: "30 days", Price: 1200, Currency: "NGN"},
			{ID: "mtn-5gb-30d", Name: "5GB", DataSize: "5GB", Validity: "30 days", Price: 2500, Currency: "NGN"},
			{ID: "mtn-10gb-30d", Name: "10GB", DataSize: "10GB", Validity: "30 days", Price: 3500, Currency: "NGN"},
			{ID: "mtn-25gb-30d", Name: "25GB", DataSize: "25GB", Validity: "30 days", Price: 6000, Currency: "NGN"},
			{ID: "mtn-75gb-30d", Name: "75GB (SME)", DataSize: "75GB", Validity: "30 days", Price: 15000, Currency: "NGN"},
		},
		"airtel-ng-data": {
			{ID: "airtel-750mb-14d", Name: "750MB", DataSize: "750MB", Validity: "14 days", Price: 500, Currency: "NGN"},
			{ID: "airtel-1.5gb-30d", Name: "1.5GB", DataSize: "1.5GB", Validity: "30 days", Price: 1000, Currency: "NGN"},
			{ID: "airtel-3gb-30d", Name: "3GB", DataSize: "3GB", Validity: "30 days", Price: 1500, Currency: "NGN"},
			{ID: "airtel-10gb-30d", Name: "10GB", DataSize: "10GB", Validity: "30 days", Price: 3000, Currency: "NGN"},
		},
		"glo-ng-data": {
			{ID: "glo-1.35gb-14d", Name: "1.35GB", DataSize: "1.35GB", Validity: "14 days", Price: 500, Currency: "NGN"},
			{ID: "glo-2.9gb-30d", Name: "2.9GB", DataSize: "2.9GB", Validity: "30 days", Price: 1000, Currency: "NGN"},
			{ID: "glo-5.8gb-30d", Name: "5.8GB", DataSize: "5.8GB", Validity: "30 days", Price: 2000, Currency: "NGN"},
			{ID: "glo-7.7gb-30d", Name: "7.7GB", DataSize: "7.7GB", Validity: "30 days", Price: 2500, Currency: "NGN"},
		},
	}
}
