package services

import (
	"fmt"
	"math"
	"sync"
	"time"
)

// ─── Tax Remittance Service ────────────────────────────────────────────────────
// Handles automated batch collection of taxes and remittance to government
// tax authorities (FIRS, KRA, GRA, SARS, TRA, RRA, ETA, DGI, URA, ERCA).

type TaxRemittanceService struct {
	mu      sync.RWMutex
	batches []RemittanceBatch
	ledger  []RemittancePayment
}

type RemittanceBatch struct {
	BatchID          string             `json:"batch_id"`
	JurisdictionCode string             `json:"jurisdiction_code"`
	TaxAuthority     string             `json:"tax_authority"`
	Period           string             `json:"period"`           // e.g., "2026-06"
	FilingDeadline   int64              `json:"filing_deadline"`  // Unix ms
	Status           string             `json:"status"`           // pending, processing, remitted, failed, reconciled
	TotalCollected   float64            `json:"total_collected"`
	TotalRemitted    float64            `json:"total_remitted"`
	Outstanding      float64            `json:"outstanding"`
	Currency         string             `json:"currency"`
	TransactionCount int                `json:"transaction_count"`
	TaxBreakdown     []TaxTypeBreakdown `json:"tax_breakdown"`
	GovtBankAccount  GovtBankAccount    `json:"govt_bank_account"`
	PaymentRef       string             `json:"payment_ref"`
	CreatedAt        int64              `json:"created_at"`
	ProcessedAt      int64              `json:"processed_at"`
	ConfirmedAt      int64              `json:"confirmed_at"`
}

type TaxTypeBreakdown struct {
	TaxType   string  `json:"tax_type"`
	Name      string  `json:"name"`
	Amount    float64 `json:"amount"`
	TxnCount  int     `json:"txn_count"`
	Rate      float64 `json:"rate"`
	Authority string  `json:"authority"` // Some taxes go to different authorities
}

type GovtBankAccount struct {
	BankName      string `json:"bank_name"`
	AccountNumber string `json:"account_number"`
	AccountName   string `json:"account_name"`
	BankCode      string `json:"bank_code"`
	SortCode      string `json:"sort_code"`
	SwiftCode     string `json:"swift_code"`
}

type RemittancePayment struct {
	PaymentID        string  `json:"payment_id"`
	BatchID          string  `json:"batch_id"`
	JurisdictionCode string  `json:"jurisdiction_code"`
	Amount           float64 `json:"amount"`
	Currency         string  `json:"currency"`
	Status           string  `json:"status"` // initiated, processing, confirmed, failed, reversed
	TransferMethod   string  `json:"transfer_method"` // bank_transfer, rtgs, eft, nip
	Reference        string  `json:"reference"`
	GovtReceipt      string  `json:"govt_receipt"`
	InitiatedAt      int64   `json:"initiated_at"`
	ConfirmedAt      int64   `json:"confirmed_at"`
	FailureReason    string  `json:"failure_reason,omitempty"`
}

type RemittanceSchedule struct {
	JurisdictionCode string `json:"jurisdiction_code"`
	Frequency        string `json:"frequency"` // monthly, bi-monthly, quarterly
	DayOfMonth       int    `json:"day_of_month"` // Filing deadline day
	GracePeriodDays  int    `json:"grace_period_days"`
	AutoRemit        bool   `json:"auto_remit"`
	MinBatchAmount   float64 `json:"min_batch_amount"`
}

type RemittanceSummary struct {
	JurisdictionCode string             `json:"jurisdiction_code"`
	TaxAuthority     string             `json:"tax_authority"`
	Currency         string             `json:"currency"`
	CurrentPeriod    string             `json:"current_period"`
	TotalCollected   float64            `json:"total_collected"`
	TotalRemitted    float64            `json:"total_remitted"`
	Outstanding      float64            `json:"outstanding"`
	NextDeadline     int64              `json:"next_deadline"`
	DaysUntilDue     int                `json:"days_until_due"`
	IsOverdue        bool               `json:"is_overdue"`
	Batches          []RemittanceBatch  `json:"batches"`
	Schedule         RemittanceSchedule `json:"schedule"`
	ComplianceScore  float64            `json:"compliance_score"` // 0-100
}

type RemitRequest struct {
	JurisdictionCode string  `json:"jurisdiction_code"`
	Period           string  `json:"period"`
	Amount           float64 `json:"amount"`
	TransferMethod   string  `json:"transfer_method"`
}

type RemitResult struct {
	PaymentID   string  `json:"payment_id"`
	BatchID     string  `json:"batch_id"`
	Amount      float64 `json:"amount"`
	Currency    string  `json:"currency"`
	Status      string  `json:"status"`
	Reference   string  `json:"reference"`
	EstimatedAt int64   `json:"estimated_confirmation_at"`
}

// ─── Government Bank Accounts (per jurisdiction) ─────────────────────────────

var govtBankAccounts = map[string]GovtBankAccount{
	"NG": {BankName: "Central Bank of Nigeria", AccountNumber: "0000000001", AccountName: "FIRS VAT Collection", BankCode: "000", SortCode: "000001", SwiftCode: "ABORNGLA"},
	"KE": {BankName: "Central Bank of Kenya", AccountNumber: "1000200030", AccountName: "KRA Revenue Account", BankCode: "001", SortCode: "001000", SwiftCode: "CBKEKENA"},
	"GH": {BankName: "Bank of Ghana", AccountNumber: "GH0101001", AccountName: "GRA Domestic Revenue", BankCode: "BOG", SortCode: "300001", SwiftCode: "BAABORGH"},
	"ZA": {BankName: "South African Reserve Bank", AccountNumber: "4001234567", AccountName: "SARS Revenue Account", BankCode: "SARB", SortCode: "000100", SwiftCode: "RESRZAJJ"},
	"TZ": {BankName: "Bank of Tanzania", AccountNumber: "TZ21001000", AccountName: "TRA Revenue Collection", BankCode: "BOT", SortCode: "100001", SwiftCode: "BCTZTZTX"},
	"RW": {BankName: "National Bank of Rwanda", AccountNumber: "RW10020003", AccountName: "RRA Tax Collection", BankCode: "BNR", SortCode: "200001", SwiftCode: "ABORWKGL"},
	"EG": {BankName: "Central Bank of Egypt", AccountNumber: "EG01000002", AccountName: "ETA Revenue Account", BankCode: "CBE", SortCode: "010001", SwiftCode: "CBEGEGCA"},
	"MA": {BankName: "Bank Al-Maghrib", AccountNumber: "MA20100003", AccountName: "DGI Tresor Public", BankCode: "BAM", SortCode: "001010", SwiftCode: "BKAMMAMA"},
	"UG": {BankName: "Bank of Uganda", AccountNumber: "UG30001000", AccountName: "URA Revenue Account", BankCode: "BOU", SortCode: "010010", SwiftCode: "BABORUGK"},
	"ET": {BankName: "National Bank of Ethiopia", AccountNumber: "ET10001000", AccountName: "ERCA Revenue Account", BankCode: "NBE", SortCode: "001001", SwiftCode: "NBETETET"},
}

// ─── Filing Schedules ────────────────────────────────────────────────────────

var filingSchedules = map[string]RemittanceSchedule{
	"NG": {JurisdictionCode: "NG", Frequency: "monthly", DayOfMonth: 21, GracePeriodDays: 7, AutoRemit: true, MinBatchAmount: 10000},
	"KE": {JurisdictionCode: "KE", Frequency: "monthly", DayOfMonth: 20, GracePeriodDays: 5, AutoRemit: true, MinBatchAmount: 5000},
	"GH": {JurisdictionCode: "GH", Frequency: "monthly", DayOfMonth: 15, GracePeriodDays: 5, AutoRemit: true, MinBatchAmount: 500},
	"ZA": {JurisdictionCode: "ZA", Frequency: "bi-monthly", DayOfMonth: 25, GracePeriodDays: 7, AutoRemit: true, MinBatchAmount: 10000},
	"TZ": {JurisdictionCode: "TZ", Frequency: "monthly", DayOfMonth: 20, GracePeriodDays: 7, AutoRemit: true, MinBatchAmount: 50000},
	"RW": {JurisdictionCode: "RW", Frequency: "monthly", DayOfMonth: 15, GracePeriodDays: 5, AutoRemit: true, MinBatchAmount: 100000},
	"EG": {JurisdictionCode: "EG", Frequency: "monthly", DayOfMonth: 15, GracePeriodDays: 10, AutoRemit: true, MinBatchAmount: 5000},
	"MA": {JurisdictionCode: "MA", Frequency: "quarterly", DayOfMonth: 20, GracePeriodDays: 10, AutoRemit: false, MinBatchAmount: 5000},
	"UG": {JurisdictionCode: "UG", Frequency: "monthly", DayOfMonth: 15, GracePeriodDays: 5, AutoRemit: true, MinBatchAmount: 500000},
	"ET": {JurisdictionCode: "ET", Frequency: "monthly", DayOfMonth: 20, GracePeriodDays: 7, AutoRemit: true, MinBatchAmount: 10000},
}

// ─── Transfer Methods ────────────────────────────────────────────────────────

var transferMethods = map[string]string{
	"NG": "nip",          // NIBSS Instant Payment
	"KE": "rtgs",         // Real Time Gross Settlement
	"GH": "ghipss",       // Ghana Interbank Payment & Settlement
	"ZA": "eft",          // Electronic Fund Transfer
	"TZ": "tiss",         // Tanzania Interbank Settlement System
	"RW": "ripps",        // Rwanda Integrated Payment Processing System
	"EG": "rtgs",         // Real Time Gross Settlement
	"MA": "swift",        // SWIFT transfer
	"UG": "eft",          // Electronic Fund Transfer
	"ET": "rtgs",         // Real Time Gross Settlement
}

func NewTaxRemittanceService() *TaxRemittanceService {
	svc := &TaxRemittanceService{
		batches: make([]RemittanceBatch, 0),
		ledger:  make([]RemittancePayment, 0),
	}
	svc.seedDemoBatches()
	return svc
}

// GetRemittanceSummary returns the full remittance overview for a jurisdiction
func (s *TaxRemittanceService) GetRemittanceSummary(jurisdictionCode string) *RemittanceSummary {
	s.mu.RLock()
	defer s.mu.RUnlock()

	schedule, ok := filingSchedules[jurisdictionCode]
	if !ok {
		return nil
	}

	batches := make([]RemittanceBatch, 0)
	var totalCollected, totalRemitted float64
	for _, b := range s.batches {
		if b.JurisdictionCode == jurisdictionCode {
			batches = append(batches, b)
			totalCollected += b.TotalCollected
			totalRemitted += b.TotalRemitted
		}
	}

	now := time.Now()
	nextDeadline := s.computeNextDeadline(jurisdictionCode, now)
	daysUntilDue := int(time.Until(time.UnixMilli(nextDeadline)).Hours() / 24)
	isOverdue := daysUntilDue < 0

	complianceScore := 100.0
	if totalCollected > 0 {
		ratio := totalRemitted / totalCollected
		complianceScore = math.Min(ratio*100, 100)
	}
	if isOverdue {
		complianceScore = math.Max(complianceScore-20, 0)
	}

	govtAcct := govtBankAccounts[jurisdictionCode]
	taxAuthority := ""
	switch jurisdictionCode {
	case "NG":
		taxAuthority = "Federal Inland Revenue Service (FIRS)"
	case "KE":
		taxAuthority = "Kenya Revenue Authority (KRA)"
	case "GH":
		taxAuthority = "Ghana Revenue Authority (GRA)"
	case "ZA":
		taxAuthority = "South African Revenue Service (SARS)"
	case "TZ":
		taxAuthority = "Tanzania Revenue Authority (TRA)"
	case "RW":
		taxAuthority = "Rwanda Revenue Authority (RRA)"
	case "EG":
		taxAuthority = "Egyptian Tax Authority (ETA)"
	case "MA":
		taxAuthority = "Direction Générale des Impôts (DGI)"
	case "UG":
		taxAuthority = "Uganda Revenue Authority (URA)"
	case "ET":
		taxAuthority = "Ethiopian Revenues and Customs Authority (ERCA)"
	}

	currency := ""
	switch jurisdictionCode {
	case "NG":
		currency = "NGN"
	case "KE":
		currency = "KES"
	case "GH":
		currency = "GHS"
	case "ZA":
		currency = "ZAR"
	case "TZ":
		currency = "TZS"
	case "RW":
		currency = "RWF"
	case "EG":
		currency = "EGP"
	case "MA":
		currency = "MAD"
	case "UG":
		currency = "UGX"
	case "ET":
		currency = "ETB"
	}

	_ = govtAcct
	return &RemittanceSummary{
		JurisdictionCode: jurisdictionCode,
		TaxAuthority:     taxAuthority,
		Currency:         currency,
		CurrentPeriod:    now.Format("2006-01"),
		TotalCollected:   math.Round(totalCollected*100) / 100,
		TotalRemitted:    math.Round(totalRemitted*100) / 100,
		Outstanding:      math.Round((totalCollected-totalRemitted)*100) / 100,
		NextDeadline:     nextDeadline,
		DaysUntilDue:     daysUntilDue,
		IsOverdue:        isOverdue,
		Batches:          batches,
		Schedule:         schedule,
		ComplianceScore:  math.Round(complianceScore*10) / 10,
	}
}

// CreateBatch creates a new remittance batch for a jurisdiction and period
func (s *TaxRemittanceService) CreateBatch(jurisdictionCode, period string, taxBreakdown []TaxTypeBreakdown) *RemittanceBatch {
	s.mu.Lock()
	defer s.mu.Unlock()

	var totalAmount float64
	var totalTxns int
	for _, t := range taxBreakdown {
		totalAmount += t.Amount
		totalTxns += t.TxnCount
	}

	batchID := fmt.Sprintf("RBATCH-%s-%s-%d", jurisdictionCode, period, time.Now().UnixMilli())
	deadline := s.computeNextDeadline(jurisdictionCode, time.Now())

	batch := RemittanceBatch{
		BatchID:          batchID,
		JurisdictionCode: jurisdictionCode,
		TaxAuthority:     s.getTaxAuthority(jurisdictionCode),
		Period:           period,
		FilingDeadline:   deadline,
		Status:           "pending",
		TotalCollected:   math.Round(totalAmount*100) / 100,
		TotalRemitted:    0,
		Outstanding:      math.Round(totalAmount*100) / 100,
		Currency:         s.getCurrency(jurisdictionCode),
		TransactionCount: totalTxns,
		TaxBreakdown:     taxBreakdown,
		GovtBankAccount:  govtBankAccounts[jurisdictionCode],
		PaymentRef:       "",
		CreatedAt:        time.Now().UnixMilli(),
		ProcessedAt:      0,
		ConfirmedAt:      0,
	}

	s.batches = append(s.batches, batch)
	return &batch
}

// InitiateRemittance starts the payment process for a batch
func (s *TaxRemittanceService) InitiateRemittance(req RemitRequest) (*RemitResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Find or create the batch
	var targetBatch *RemittanceBatch
	for i := range s.batches {
		if s.batches[i].JurisdictionCode == req.JurisdictionCode && s.batches[i].Period == req.Period && s.batches[i].Status == "pending" {
			targetBatch = &s.batches[i]
			break
		}
	}

	if targetBatch == nil {
		return nil, fmt.Errorf("no pending batch found for %s period %s", req.JurisdictionCode, req.Period)
	}

	if req.Amount > targetBatch.Outstanding {
		return nil, fmt.Errorf("remittance amount %.2f exceeds outstanding %.2f", req.Amount, targetBatch.Outstanding)
	}

	method := transferMethods[req.JurisdictionCode]
	if req.TransferMethod != "" {
		method = req.TransferMethod
	}

	paymentID := fmt.Sprintf("RPAY-%s-%d", req.JurisdictionCode, time.Now().UnixMilli())
	reference := fmt.Sprintf("TAX-REMIT/%s/%s/%s", req.JurisdictionCode, req.Period, paymentID)

	payment := RemittancePayment{
		PaymentID:        paymentID,
		BatchID:          targetBatch.BatchID,
		JurisdictionCode: req.JurisdictionCode,
		Amount:           req.Amount,
		Currency:         targetBatch.Currency,
		Status:           "processing",
		TransferMethod:   method,
		Reference:        reference,
		GovtReceipt:      "",
		InitiatedAt:      time.Now().UnixMilli(),
		ConfirmedAt:      0,
	}

	s.ledger = append(s.ledger, payment)

	// Update batch status
	targetBatch.Status = "processing"
	targetBatch.TotalRemitted += req.Amount
	targetBatch.Outstanding -= req.Amount
	targetBatch.ProcessedAt = time.Now().UnixMilli()
	targetBatch.PaymentRef = reference

	if targetBatch.Outstanding <= 0 {
		targetBatch.Status = "remitted"
		targetBatch.Outstanding = 0
	}

	// Simulate confirmation (in production, this would be async via webhook)
	payment.Status = "confirmed"
	payment.ConfirmedAt = time.Now().UnixMilli() + 300000 // 5 min estimated
	payment.GovtReceipt = fmt.Sprintf("GOV-RCPT-%s-%d", req.JurisdictionCode, time.Now().UnixMilli())

	// Update ledger
	for i := range s.ledger {
		if s.ledger[i].PaymentID == paymentID {
			s.ledger[i] = payment
			break
		}
	}

	estimatedConfirmation := time.Now().Add(5 * time.Minute).UnixMilli()

	return &RemitResult{
		PaymentID:   paymentID,
		BatchID:     targetBatch.BatchID,
		Amount:      req.Amount,
		Currency:    targetBatch.Currency,
		Status:      "processing",
		Reference:   reference,
		EstimatedAt: estimatedConfirmation,
	}, nil
}

// GetPaymentHistory returns all payments for a jurisdiction
func (s *TaxRemittanceService) GetPaymentHistory(jurisdictionCode string) []RemittancePayment {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]RemittancePayment, 0)
	for _, p := range s.ledger {
		if p.JurisdictionCode == jurisdictionCode {
			result = append(result, p)
		}
	}
	return result
}

// GetAllBatches returns all batches, optionally filtered by status
func (s *TaxRemittanceService) GetAllBatches(status string) []RemittanceBatch {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if status == "" {
		return s.batches
	}

	result := make([]RemittanceBatch, 0)
	for _, b := range s.batches {
		if b.Status == status {
			result = append(result, b)
		}
	}
	return result
}

// GetFilingSchedules returns all jurisdiction filing schedules
func (s *TaxRemittanceService) GetFilingSchedules() []RemittanceSchedule {
	schedules := make([]RemittanceSchedule, 0, len(filingSchedules))
	for _, s := range filingSchedules {
		schedules = append(schedules, s)
	}
	return schedules
}

// GetGovtBankAccounts returns government bank accounts for all jurisdictions
func (s *TaxRemittanceService) GetGovtBankAccounts() map[string]GovtBankAccount {
	return govtBankAccounts
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func (s *TaxRemittanceService) computeNextDeadline(jurisdictionCode string, from time.Time) int64 {
	schedule, ok := filingSchedules[jurisdictionCode]
	if !ok {
		return from.Add(30 * 24 * time.Hour).UnixMilli()
	}

	year, month, _ := from.Date()
	deadline := time.Date(year, month, schedule.DayOfMonth, 23, 59, 59, 0, time.UTC)

	switch schedule.Frequency {
	case "monthly":
		if from.After(deadline) {
			deadline = deadline.AddDate(0, 1, 0)
		}
	case "bi-monthly":
		if from.After(deadline) {
			deadline = deadline.AddDate(0, 2, 0)
		}
	case "quarterly":
		if from.After(deadline) {
			deadline = deadline.AddDate(0, 3, 0)
		}
	}

	// Add grace period
	deadline = deadline.Add(time.Duration(schedule.GracePeriodDays) * 24 * time.Hour)
	return deadline.UnixMilli()
}

func (s *TaxRemittanceService) getTaxAuthority(code string) string {
	authorities := map[string]string{
		"NG": "Federal Inland Revenue Service (FIRS)",
		"KE": "Kenya Revenue Authority (KRA)",
		"GH": "Ghana Revenue Authority (GRA)",
		"ZA": "South African Revenue Service (SARS)",
		"TZ": "Tanzania Revenue Authority (TRA)",
		"RW": "Rwanda Revenue Authority (RRA)",
		"EG": "Egyptian Tax Authority (ETA)",
		"MA": "Direction Générale des Impôts (DGI)",
		"UG": "Uganda Revenue Authority (URA)",
		"ET": "Ethiopian Revenues and Customs Authority (ERCA)",
	}
	return authorities[code]
}

func (s *TaxRemittanceService) getCurrency(code string) string {
	currencies := map[string]string{
		"NG": "NGN", "KE": "KES", "GH": "GHS", "ZA": "ZAR", "TZ": "TZS",
		"RW": "RWF", "EG": "EGP", "MA": "MAD", "UG": "UGX", "ET": "ETB",
	}
	return currencies[code]
}

func (s *TaxRemittanceService) seedDemoBatches() {
	now := time.Now()
	currentPeriod := now.Format("2006-01")
	prevPeriod := now.AddDate(0, -1, 0).Format("2006-01")

	// Nigeria: previous month remitted, current month pending
	s.batches = append(s.batches, RemittanceBatch{
		BatchID: "RBATCH-NG-PREV-001", JurisdictionCode: "NG", TaxAuthority: "FIRS",
		Period: prevPeriod, FilingDeadline: now.AddDate(0, -1, 21).UnixMilli(),
		Status: "remitted", TotalCollected: 2450000, TotalRemitted: 2450000, Outstanding: 0,
		Currency: "NGN", TransactionCount: 1847, PaymentRef: "TAX-REMIT/NG/PREV/RPAY-001",
		GovtBankAccount: govtBankAccounts["NG"],
		TaxBreakdown: []TaxTypeBreakdown{
			{TaxType: "VAT", Name: "Nigeria VAT", Amount: 1850000, TxnCount: 1847, Rate: 7.5, Authority: "FIRS"},
			{TaxType: "TOURISM_LEVY", Name: "Tourism Development Levy", Amount: 450000, TxnCount: 312, Rate: 5.0, Authority: "NTDC"},
			{TaxType: "SERVICE_CHARGE", Name: "Service Charge", Amount: 150000, TxnCount: 312, Rate: 5.0, Authority: "FIRS"},
		},
		CreatedAt: now.AddDate(0, -1, 1).UnixMilli(), ProcessedAt: now.AddDate(0, -1, 18).UnixMilli(), ConfirmedAt: now.AddDate(0, -1, 18).UnixMilli(),
	})

	s.batches = append(s.batches, RemittanceBatch{
		BatchID: "RBATCH-NG-CURR-001", JurisdictionCode: "NG", TaxAuthority: "FIRS",
		Period: currentPeriod, FilingDeadline: s.computeNextDeadline("NG", now),
		Status: "pending", TotalCollected: 1780000, TotalRemitted: 0, Outstanding: 1780000,
		Currency: "NGN", TransactionCount: 1203,
		GovtBankAccount: govtBankAccounts["NG"],
		TaxBreakdown: []TaxTypeBreakdown{
			{TaxType: "VAT", Name: "Nigeria VAT", Amount: 1350000, TxnCount: 1203, Rate: 7.5, Authority: "FIRS"},
			{TaxType: "TOURISM_LEVY", Name: "Tourism Development Levy", Amount: 320000, TxnCount: 198, Rate: 5.0, Authority: "NTDC"},
			{TaxType: "SERVICE_CHARGE", Name: "Service Charge", Amount: 110000, TxnCount: 198, Rate: 5.0, Authority: "FIRS"},
		},
		CreatedAt: now.AddDate(0, 0, 1).UnixMilli(),
	})

	// Kenya: current month pending
	s.batches = append(s.batches, RemittanceBatch{
		BatchID: "RBATCH-KE-CURR-001", JurisdictionCode: "KE", TaxAuthority: "KRA",
		Period: currentPeriod, FilingDeadline: s.computeNextDeadline("KE", now),
		Status: "pending", TotalCollected: 890000, TotalRemitted: 0, Outstanding: 890000,
		Currency: "KES", TransactionCount: 567,
		GovtBankAccount: govtBankAccounts["KE"],
		TaxBreakdown: []TaxTypeBreakdown{
			{TaxType: "VAT", Name: "Kenya VAT", Amount: 720000, TxnCount: 567, Rate: 16.0, Authority: "KRA"},
			{TaxType: "TOURISM_LEVY", Name: "Tourism Fund Levy", Amount: 120000, TxnCount: 89, Rate: 2.0, Authority: "Tourism Fund"},
			{TaxType: "SERVICE_CHARGE", Name: "Catering Training Levy", Amount: 50000, TxnCount: 234, Rate: 2.0, Authority: "NITA"},
		},
		CreatedAt: now.AddDate(0, 0, 1).UnixMilli(),
	})

	// Ghana: previous remitted
	s.batches = append(s.batches, RemittanceBatch{
		BatchID: "RBATCH-GH-PREV-001", JurisdictionCode: "GH", TaxAuthority: "GRA",
		Period: prevPeriod, FilingDeadline: now.AddDate(0, -1, 15).UnixMilli(),
		Status: "remitted", TotalCollected: 345000, TotalRemitted: 345000, Outstanding: 0,
		Currency: "GHS", TransactionCount: 289,
		GovtBankAccount: govtBankAccounts["GH"],
		TaxBreakdown: []TaxTypeBreakdown{
			{TaxType: "VAT", Name: "Ghana VAT", Amount: 210000, TxnCount: 289, Rate: 15.0, Authority: "GRA"},
			{TaxType: "SERVICE_CHARGE", Name: "NHIL", Amount: 65000, TxnCount: 289, Rate: 2.5, Authority: "NHIA"},
			{TaxType: "SERVICE_CHARGE", Name: "GETFund Levy", Amount: 55000, TxnCount: 289, Rate: 2.5, Authority: "GETFund"},
			{TaxType: "SERVICE_CHARGE", Name: "COVID-19 Health Levy", Amount: 15000, TxnCount: 289, Rate: 1.0, Authority: "GRA"},
		},
		CreatedAt: now.AddDate(0, -1, 1).UnixMilli(), ProcessedAt: now.AddDate(0, -1, 12).UnixMilli(), ConfirmedAt: now.AddDate(0, -1, 13).UnixMilli(),
	})

	// Add corresponding payment ledger entries for remitted batches
	s.ledger = append(s.ledger, RemittancePayment{
		PaymentID: "RPAY-NG-001", BatchID: "RBATCH-NG-PREV-001", JurisdictionCode: "NG",
		Amount: 2450000, Currency: "NGN", Status: "confirmed", TransferMethod: "nip",
		Reference: "TAX-REMIT/NG/" + prevPeriod + "/RPAY-NG-001",
		GovtReceipt: "GOV-RCPT-NG-" + prevPeriod, InitiatedAt: now.AddDate(0, -1, 18).UnixMilli(), ConfirmedAt: now.AddDate(0, -1, 18).UnixMilli(),
	})
	s.ledger = append(s.ledger, RemittancePayment{
		PaymentID: "RPAY-GH-001", BatchID: "RBATCH-GH-PREV-001", JurisdictionCode: "GH",
		Amount: 345000, Currency: "GHS", Status: "confirmed", TransferMethod: "ghipss",
		Reference: "TAX-REMIT/GH/" + prevPeriod + "/RPAY-GH-001",
		GovtReceipt: "GOV-RCPT-GH-" + prevPeriod, InitiatedAt: now.AddDate(0, -1, 12).UnixMilli(), ConfirmedAt: now.AddDate(0, -1, 13).UnixMilli(),
	})
}
