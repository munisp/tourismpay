package services

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"github.com/tourismpay/settlement-service/internal/models"
)

type SettlementService struct {
	ledger                 *TigerBeetleLedgerService
	mojaloop               *MojaloopDFSPService
	settlementBatches      map[string]*models.SettlementBatch
	reconciliationReports  map[string]*models.ReconciliationReport
	pendingSettlements     map[string][]*models.PendingSettlement
	feeStructure           models.FeeStructure
	providerAccounts       map[string]models.ProviderAccount
	mu                     sync.RWMutex
}

func NewSettlementService(ledger *TigerBeetleLedgerService, mojaloop *MojaloopDFSPService) *SettlementService {
	return &SettlementService{
		ledger:                ledger,
		mojaloop:              mojaloop,
		settlementBatches:     make(map[string]*models.SettlementBatch),
		reconciliationReports: make(map[string]*models.ReconciliationReport),
		pendingSettlements:    make(map[string][]*models.PendingSettlement),
		feeStructure: models.FeeStructure{
			PlatformFeePercent:       3.0,
			PaymentProcessingPercent: 1.5,
			SettlementFeeFixed:       5.0,
			MinimumSettlement:        100.0,
		},
		providerAccounts: map[string]models.ProviderAccount{
			"safari_lodge":     {Bank: "crdb", Account: "1234567890"},
			"serengeti_tours":  {Bank: "nmb", Account: "0987654321"},
			"zanzibar_resorts": {Bank: "crdb", Account: "1122334455"},
			"tanapa":           {Bank: "nmb", Account: "5566778899"},
			"coastal_aviation": {Bank: "crdb", Account: "9988776655"},
		},
	}
}

func (s *SettlementService) generateID(prefix string) string {
	b := make([]byte, 8)
	rand.Read(b)
	return fmt.Sprintf("%s-%s", prefix, hex.EncodeToString(b))
}

type BookingPaymentResult struct {
	Success        bool                   `json:"success"`
	BookingID      string                 `json:"booking_id"`
	TotalAmount    float64                `json:"total_amount"`
	PlatformFee    float64                `json:"platform_fee"`
	ProcessingFee  float64                `json:"processing_fee"`
	ProviderAmount float64                `json:"provider_amount"`
	Currency       string                 `json:"currency"`
	LedgerTransfers []TransferResult      `json:"ledger_transfers,omitempty"`
	Error          string                 `json:"error,omitempty"`
}

func (s *SettlementService) RecordBookingPayment(
	bookingID, providerID string,
	amount float64,
	currency, touristWalletID string,
) BookingPaymentResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	platformFee := amount * (s.feeStructure.PlatformFeePercent / 100)
	processingFee := amount * (s.feeStructure.PaymentProcessingPercent / 100)
	providerAmount := amount - platformFee - processingFee

	transfers := []LinkedTransferRequest{
		{
			FromType:  "TOURIST",
			FromID:    touristWalletID,
			ToType:    "ESCROW",
			ToID:      "booking_escrow",
			Currency:  currency,
			Amount:    uint64(amount * 100),
			Pending:   true,
			Reference: fmt.Sprintf("BOOKING:%s", bookingID),
		},
		{
			FromType:  "ESCROW",
			FromID:    "booking_escrow",
			ToType:    "PLATFORM",
			ToID:      "platform_fees",
			Currency:  currency,
			Amount:    uint64(platformFee * 100),
			Pending:   true,
			Reference: fmt.Sprintf("FEE:%s", bookingID),
		},
	}

	result := s.ledger.CreateLinkedTransfers(transfers)

	if result.Success {
		transferIDs := make([]uint64, 0)
		for _, t := range result.Transfers {
			if t.Success {
				transferIDs = append(transferIDs, t.TransferID)
			}
		}

		pending := &models.PendingSettlement{
			BookingID:     bookingID,
			Amount:        providerAmount,
			Currency:      currency,
			PlatformFee:   platformFee,
			ProcessingFee: processingFee,
			TransferIDs:   transferIDs,
			RecordedAt:    time.Now(),
		}

		s.pendingSettlements[providerID] = append(s.pendingSettlements[providerID], pending)
	}

	return BookingPaymentResult{
		Success:         result.Success,
		BookingID:       bookingID,
		TotalAmount:     amount,
		PlatformFee:     platformFee,
		ProcessingFee:   processingFee,
		ProviderAmount:  providerAmount,
		Currency:        currency,
		LedgerTransfers: result.Transfers,
	}
}

func (s *SettlementService) CreateSettlementBatch(providerID, settlementDate string) (*models.SettlementBatch, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if settlementDate == "" {
		settlementDate = time.Now().Format("2006-01-02")
	}

	pending := s.pendingSettlements[providerID]
	if len(pending) == 0 {
		return nil, fmt.Errorf("no pending settlements for provider %s", providerID)
	}

	var totalAmount float64
	currency := "USD"
	transactions := make([]string, 0)

	for _, p := range pending {
		totalAmount += p.Amount
		currency = p.Currency
		transactions = append(transactions, p.BookingID)
	}

	if totalAmount < s.feeStructure.MinimumSettlement {
		return nil, fmt.Errorf("settlement amount %.2f below minimum %.2f", totalAmount, s.feeStructure.MinimumSettlement)
	}

	settlementFee := s.feeStructure.SettlementFeeFixed
	netAmount := totalAmount - settlementFee

	batchID := s.generateID("STL")

	batch := &models.SettlementBatch{
		BatchID:          batchID,
		SettlementDate:   settlementDate,
		Status:           models.SettlementPending,
		ProviderID:       providerID,
		TotalAmount:      totalAmount,
		Currency:         currency,
		TransactionCount: len(pending),
		FeesDeducted:     settlementFee,
		NetAmount:        netAmount,
		CreatedAt:        time.Now(),
		Transactions:     transactions,
	}

	s.settlementBatches[batchID] = batch
	return batch, nil
}

type ProcessBatchResult struct {
	Success            bool    `json:"success"`
	BatchID            string  `json:"batch_id"`
	Status             string  `json:"status"`
	MojaloopTransferID string  `json:"mojaloop_transfer_id,omitempty"`
	NetAmount          float64 `json:"net_amount,omitempty"`
	Currency           string  `json:"currency,omitempty"`
	Error              string  `json:"error,omitempty"`
}

func (s *SettlementService) ProcessSettlementBatch(batchID string) ProcessBatchResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	batch, ok := s.settlementBatches[batchID]
	if !ok {
		return ProcessBatchResult{Success: false, Error: "Batch not found"}
	}

	batch.Status = models.SettlementProcessing

	providerBank := "crdb"
	if account, ok := s.providerAccounts[batch.ProviderID]; ok {
		providerBank = account.Bank
	}

	quote, err := s.mojaloop.CreateQuote(
		s.mojaloop.GetDFSPID(),
		providerBank,
		batch.NetAmount,
		batch.Currency,
	)
	if err != nil {
		batch.Status = models.SettlementFailed
		return ProcessBatchResult{Success: false, BatchID: batchID, Status: "FAILED", Error: err.Error()}
	}

	transfer, err := s.mojaloop.PrepareTransfer(quote.QuoteID)
	if err != nil {
		batch.Status = models.SettlementFailed
		return ProcessBatchResult{Success: false, BatchID: batchID, Status: "FAILED", Error: err.Error()}
	}

	completedTransfer, err := s.mojaloop.CommitTransfer(transfer.TransferID)
	if err != nil {
		batch.Status = models.SettlementFailed
		return ProcessBatchResult{Success: false, BatchID: batchID, Status: "FAILED", Error: err.Error()}
	}

	if completedTransfer.State == models.MojaloopStateCompleted {
		batch.Status = models.SettlementCompleted
		now := time.Now()
		batch.CompletedAt = &now
		batch.MojaloopTransferID = transfer.TransferID

		for _, pending := range s.pendingSettlements[batch.ProviderID] {
			for _, tid := range pending.TransferIDs {
				s.ledger.PostPendingTransfer(tid)
			}
		}

		s.pendingSettlements[batch.ProviderID] = nil

		return ProcessBatchResult{
			Success:            true,
			BatchID:            batchID,
			Status:             "COMPLETED",
			MojaloopTransferID: transfer.TransferID,
			NetAmount:          batch.NetAmount,
			Currency:           batch.Currency,
		}
	}

	batch.Status = models.SettlementFailed
	return ProcessBatchResult{
		Success: false,
		BatchID: batchID,
		Status:  "FAILED",
		Error:   "Mojaloop transfer failed",
	}
}

type DailySettlementResult struct {
	SettlementDate     string               `json:"settlement_date"`
	ProvidersProcessed int                  `json:"providers_processed"`
	Successful         int                  `json:"successful"`
	Failed             int                  `json:"failed"`
	Results            []ProcessBatchResult `json:"results"`
}

func (s *SettlementService) RunDailySettlements() DailySettlementResult {
	settlementDate := time.Now().Format("2006-01-02")
	results := make([]ProcessBatchResult, 0)

	providers := make([]string, 0)
	s.mu.RLock()
	for providerID := range s.pendingSettlements {
		providers = append(providers, providerID)
	}
	s.mu.RUnlock()

	for _, providerID := range providers {
		batch, err := s.CreateSettlementBatch(providerID, settlementDate)
		if err != nil {
			results = append(results, ProcessBatchResult{
				Success: false,
				Error:   err.Error(),
			})
			continue
		}

		result := s.ProcessSettlementBatch(batch.BatchID)
		results = append(results, result)
	}

	successful := 0
	failed := 0
	for _, r := range results {
		if r.Success {
			successful++
		} else {
			failed++
		}
	}

	return DailySettlementResult{
		SettlementDate:     settlementDate,
		ProvidersProcessed: len(results),
		Successful:         successful,
		Failed:             failed,
		Results:            results,
	}
}

func (s *SettlementService) ListSettlementBatches(providerID, status string) []*models.SettlementBatch {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*models.SettlementBatch, 0)
	for _, batch := range s.settlementBatches {
		if providerID != "" && batch.ProviderID != providerID {
			continue
		}
		if status != "" && string(batch.Status) != status {
			continue
		}
		result = append(result, batch)
	}
	return result
}

func (s *SettlementService) GetSettlementBatch(batchID string) *models.SettlementBatch {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.settlementBatches[batchID]
}

type ProviderBalance struct {
	ProviderID          string  `json:"provider_id"`
	PendingAmount       float64 `json:"pending_amount"`
	PendingTransactions int     `json:"pending_transactions"`
	TotalSettled        float64 `json:"total_settled"`
	Currency            string  `json:"currency"`
}

func (s *SettlementService) GetProviderBalance(providerID string) ProviderBalance {
	s.mu.RLock()
	defer s.mu.RUnlock()

	pending := s.pendingSettlements[providerID]
	var pendingAmount float64
	for _, p := range pending {
		pendingAmount += p.Amount
	}

	var settledAmount float64
	for _, batch := range s.settlementBatches {
		if batch.ProviderID == providerID && batch.Status == models.SettlementCompleted {
			settledAmount += batch.NetAmount
		}
	}

	return ProviderBalance{
		ProviderID:          providerID,
		PendingAmount:       pendingAmount,
		PendingTransactions: len(pending),
		TotalSettled:        settledAmount,
		Currency:            "USD",
	}
}

type PendingSettlementSummary struct {
	Count       int     `json:"count"`
	TotalAmount float64 `json:"total_amount"`
	Currency    string  `json:"currency"`
}

func (s *SettlementService) ListPendingSettlements() map[string]PendingSettlementSummary {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[string]PendingSettlementSummary)
	for providerID, settlements := range s.pendingSettlements {
		var totalAmount float64
		currency := "USD"
		for _, p := range settlements {
			totalAmount += p.Amount
			currency = p.Currency
		}
		result[providerID] = PendingSettlementSummary{
			Count:       len(settlements),
			TotalAmount: totalAmount,
			Currency:    currency,
		}
	}
	return result
}

func (s *SettlementService) GenerateReconciliationReport(periodStart, periodEnd time.Time) *models.ReconciliationReport {
	s.mu.Lock()
	defer s.mu.Unlock()

	reportID := s.generateID("REC")

	var totalBookings int
	var totalRevenue float64
	var totalSettlements float64
	discrepancies := make([]models.ReconciliationDiscrep, 0)

	for _, batch := range s.settlementBatches {
		batchDate, _ := time.Parse("2006-01-02", batch.SettlementDate)
		if batchDate.After(periodStart) && batchDate.Before(periodEnd) || batchDate.Equal(periodStart) || batchDate.Equal(periodEnd) {
			totalBookings += batch.TransactionCount
			totalRevenue += batch.TotalAmount
			if batch.Status == models.SettlementCompleted {
				totalSettlements += batch.NetAmount
			}
		}
	}

	expectedSettlements := totalRevenue * 0.955
	if diff := totalSettlements - expectedSettlements; diff > 1.0 || diff < -1.0 {
		discrepancies = append(discrepancies, models.ReconciliationDiscrep{
			Type:       "SETTLEMENT_MISMATCH",
			Expected:   expectedSettlements,
			Actual:     totalSettlements,
			Difference: diff,
		})
	}

	status := "CLEAN"
	if len(discrepancies) > 0 {
		status = "DISCREPANCIES_FOUND"
	}

	report := &models.ReconciliationReport{
		ReportID:         reportID,
		PeriodStart:      periodStart,
		PeriodEnd:        periodEnd,
		TotalBookings:    totalBookings,
		TotalRevenue:     totalRevenue,
		TotalSettlements: totalSettlements,
		Discrepancies:    discrepancies,
		Status:           status,
		GeneratedAt:      time.Now(),
	}

	s.reconciliationReports[reportID] = report
	return report
}

func (s *SettlementService) ListReconciliationReports() []*models.ReconciliationReport {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*models.ReconciliationReport, 0, len(s.reconciliationReports))
	for _, report := range s.reconciliationReports {
		result = append(result, report)
	}
	return result
}

func (s *SettlementService) GetReconciliationReport(reportID string) *models.ReconciliationReport {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.reconciliationReports[reportID]
}

type SettlementStatus struct {
	Service                string                 `json:"service"`
	Status                 string                 `json:"status"`
	TigerBeetle            map[string]interface{} `json:"tigerbeetle"`
	Mojaloop               map[string]interface{} `json:"mojaloop"`
	SettlementBatches      int                    `json:"settlement_batches"`
	PendingProviders       int                    `json:"pending_providers"`
	ReconciliationReports  int                    `json:"reconciliation_reports"`
	FeeStructure           models.FeeStructure    `json:"fee_structure"`
}

func (s *SettlementService) GetStatus() SettlementStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ledgerStatus := s.ledger.GetStatus()
	mojaloopStatus := s.mojaloop.GetStatus()

	return SettlementStatus{
		Service: "Settlement & Reconciliation (Go)",
		Status:  "OPERATIONAL",
		TigerBeetle: map[string]interface{}{
			"status":    ledgerStatus.Status,
			"accounts":  ledgerStatus.TotalAccounts,
			"transfers": ledgerStatus.TotalTransfers,
		},
		Mojaloop: map[string]interface{}{
			"status":       mojaloopStatus.Status,
			"dfsp_id":      mojaloopStatus.DFSPID,
			"participants": mojaloopStatus.TotalParticipants,
		},
		SettlementBatches:     len(s.settlementBatches),
		PendingProviders:      len(s.pendingSettlements),
		ReconciliationReports: len(s.reconciliationReports),
		FeeStructure:          s.feeStructure,
	}
}
