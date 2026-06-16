package services

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"github.com/tourismpay/settlement-service/internal/database"
	"github.com/tourismpay/settlement-service/internal/models"
)

type SettlementService struct {
	ledger                 *TigerBeetleLedgerService
	mojaloop               *MojaloopDFSPService
	// In-memory fallback
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

func (s *SettlementService) db() *sql.DB {
	return database.DB
}

func (s *SettlementService) hasDB() bool {
	return s.db() != nil
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

		if s.hasDB() {
			s.db().Exec(
				"INSERT INTO pending_settlements (provider_id, booking_id, amount, platform_fee, processing_fee, currency) VALUES ($1,$2,$3,$4,$5,$6)",
				providerID, bookingID, providerAmount, platformFee, processingFee, currency,
			)
		} else {
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

	if s.hasDB() {
		return s.createBatchDB(providerID, settlementDate)
	}
	return s.createBatchMem(providerID, settlementDate)
}

func (s *SettlementService) createBatchDB(providerID, settlementDate string) (*models.SettlementBatch, error) {
	var count int
	var totalAmount float64
	s.db().QueryRow("SELECT COUNT(*), COALESCE(SUM(amount),0) FROM pending_settlements WHERE provider_id=$1 AND status='pending'", providerID).Scan(&count, &totalAmount)
	if count == 0 {
		return nil, fmt.Errorf("no pending settlements for provider %s", providerID)
	}
	if totalAmount < s.feeStructure.MinimumSettlement {
		return nil, fmt.Errorf("settlement amount %.2f below minimum %.2f", totalAmount, s.feeStructure.MinimumSettlement)
	}

	settlementFee := s.feeStructure.SettlementFeeFixed
	netAmount := totalAmount - settlementFee
	batchID := s.generateID("STL")

	s.db().Exec(
		"INSERT INTO settlement_batches (id, provider_id, total_amount, net_amount, fee_amount, currency, transaction_count, status, settlement_date) VALUES ($1,$2,$3,$4,$5,'USD',$6,'pending',$7)",
		batchID, providerID, totalAmount, netAmount, settlementFee, count, settlementDate,
	)
	s.db().Exec("UPDATE pending_settlements SET batch_id=$1, status='batched' WHERE provider_id=$2 AND status='pending'", batchID, providerID)

	return &models.SettlementBatch{
		BatchID:          batchID,
		SettlementDate:   settlementDate,
		Status:           models.SettlementPending,
		ProviderID:       providerID,
		TotalAmount:      totalAmount,
		Currency:         "USD",
		TransactionCount: count,
		FeesDeducted:     settlementFee,
		NetAmount:        netAmount,
		CreatedAt:        time.Now(),
	}, nil
}

func (s *SettlementService) createBatchMem(providerID, settlementDate string) (*models.SettlementBatch, error) {
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

	var batch *models.SettlementBatch
	if s.hasDB() {
		batch = s.loadBatchFromDB(batchID)
	}
	if batch == nil {
		var ok bool
		batch, ok = s.settlementBatches[batchID]
		if !ok {
			return ProcessBatchResult{Success: false, Error: "Batch not found"}
		}
	}

	batch.Status = models.SettlementProcessing
	if s.hasDB() {
		s.db().Exec("UPDATE settlement_batches SET status='processing' WHERE id=$1", batchID)
	}

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
		if s.hasDB() {
			s.db().Exec("UPDATE settlement_batches SET status='failed' WHERE id=$1", batchID)
		}
		return ProcessBatchResult{Success: false, BatchID: batchID, Status: "FAILED", Error: err.Error()}
	}

	transfer, err := s.mojaloop.PrepareTransfer(quote.QuoteID)
	if err != nil {
		batch.Status = models.SettlementFailed
		if s.hasDB() {
			s.db().Exec("UPDATE settlement_batches SET status='failed' WHERE id=$1", batchID)
		}
		return ProcessBatchResult{Success: false, BatchID: batchID, Status: "FAILED", Error: err.Error()}
	}

	completedTransfer, err := s.mojaloop.CommitTransfer(transfer.TransferID)
	if err != nil {
		batch.Status = models.SettlementFailed
		if s.hasDB() {
			s.db().Exec("UPDATE settlement_batches SET status='failed' WHERE id=$1", batchID)
		}
		return ProcessBatchResult{Success: false, BatchID: batchID, Status: "FAILED", Error: err.Error()}
	}

	if completedTransfer.State == models.MojaloopStateCompleted {
		batch.Status = models.SettlementCompleted
		now := time.Now()
		batch.CompletedAt = &now
		batch.MojaloopTransferID = transfer.TransferID

		if s.hasDB() {
			s.db().Exec("UPDATE settlement_batches SET status='completed', processed_at=NOW() WHERE id=$1", batchID)
			s.db().Exec("UPDATE pending_settlements SET status='settled', settled_at=NOW() WHERE batch_id=$1", batchID)
		} else {
			for _, pending := range s.pendingSettlements[batch.ProviderID] {
				for _, tid := range pending.TransferIDs {
					s.ledger.PostPendingTransfer(tid)
				}
			}
			s.pendingSettlements[batch.ProviderID] = nil
		}

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
	if s.hasDB() {
		s.db().Exec("UPDATE settlement_batches SET status='failed' WHERE id=$1", batchID)
	}
	return ProcessBatchResult{
		Success: false,
		BatchID: batchID,
		Status:  "FAILED",
		Error:   "Mojaloop transfer failed",
	}
}

func (s *SettlementService) loadBatchFromDB(batchID string) *models.SettlementBatch {
	if !s.hasDB() {
		return nil
	}
	batch := &models.SettlementBatch{}
	var status string
	err := s.db().QueryRow(
		"SELECT id, provider_id, total_amount, net_amount, fee_amount, currency, transaction_count, status, settlement_date, created_at FROM settlement_batches WHERE id=$1",
		batchID,
	).Scan(&batch.BatchID, &batch.ProviderID, &batch.TotalAmount, &batch.NetAmount, &batch.FeesDeducted, &batch.Currency, &batch.TransactionCount, &status, &batch.SettlementDate, &batch.CreatedAt)
	if err != nil {
		return nil
	}
	batch.Status = models.SettlementStatus(status)
	return batch
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

	var providers []string
	if s.hasDB() {
		rows, err := s.db().Query("SELECT DISTINCT provider_id FROM pending_settlements WHERE status='pending'")
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var p string
				if rows.Scan(&p) == nil {
					providers = append(providers, p)
				}
			}
		}
	} else {
		s.mu.RLock()
		for providerID := range s.pendingSettlements {
			providers = append(providers, providerID)
		}
		s.mu.RUnlock()
	}

	for _, providerID := range providers {
		batch, err := s.CreateSettlementBatch(providerID, settlementDate)
		if err != nil {
			results = append(results, ProcessBatchResult{Success: false, Error: err.Error()})
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
	if s.hasDB() {
		query := "SELECT id, provider_id, total_amount, net_amount, fee_amount, currency, transaction_count, status, settlement_date, created_at FROM settlement_batches WHERE 1=1"
		args := make([]interface{}, 0)
		argIdx := 1
		if providerID != "" {
			query += fmt.Sprintf(" AND provider_id=$%d", argIdx)
			args = append(args, providerID)
			argIdx++
		}
		if status != "" {
			query += fmt.Sprintf(" AND status=$%d", argIdx)
			args = append(args, status)
		}
		query += " ORDER BY created_at DESC"
		rows, err := s.db().Query(query, args...)
		if err == nil {
			defer rows.Close()
			result := make([]*models.SettlementBatch, 0)
			for rows.Next() {
				batch := &models.SettlementBatch{}
				var st string
				if rows.Scan(&batch.BatchID, &batch.ProviderID, &batch.TotalAmount, &batch.NetAmount, &batch.FeesDeducted, &batch.Currency, &batch.TransactionCount, &st, &batch.SettlementDate, &batch.CreatedAt) == nil {
					batch.Status = models.SettlementStatus(st)
					result = append(result, batch)
				}
			}
			return result
		}
	}

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
	if s.hasDB() {
		if batch := s.loadBatchFromDB(batchID); batch != nil {
			return batch
		}
	}
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
	if s.hasDB() {
		var pendingAmount float64
		var pendingCount int
		var settledAmount float64
		s.db().QueryRow("SELECT COUNT(*), COALESCE(SUM(amount),0) FROM pending_settlements WHERE provider_id=$1 AND status='pending'", providerID).Scan(&pendingCount, &pendingAmount)
		s.db().QueryRow("SELECT COALESCE(SUM(net_amount),0) FROM settlement_batches WHERE provider_id=$1 AND status='completed'", providerID).Scan(&settledAmount)
		return ProviderBalance{
			ProviderID:          providerID,
			PendingAmount:       pendingAmount,
			PendingTransactions: pendingCount,
			TotalSettled:        settledAmount,
			Currency:            "USD",
		}
	}

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
	if s.hasDB() {
		rows, err := s.db().Query("SELECT provider_id, COUNT(*), COALESCE(SUM(amount),0) FROM pending_settlements WHERE status='pending' GROUP BY provider_id")
		if err == nil {
			defer rows.Close()
			result := make(map[string]PendingSettlementSummary)
			for rows.Next() {
				var pid string
				var count int
				var total float64
				if rows.Scan(&pid, &count, &total) == nil {
					result[pid] = PendingSettlementSummary{Count: count, TotalAmount: total, Currency: "USD"}
				}
			}
			return result
		}
	}

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
		result[providerID] = PendingSettlementSummary{Count: len(settlements), TotalAmount: totalAmount, Currency: currency}
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

	batches := s.ListSettlementBatches("", "")
	for _, batch := range batches {
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
	DatabaseConnected      bool                   `json:"database_connected"`
}

func (s *SettlementService) GetStatus() SettlementStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ledgerStatus := s.ledger.GetStatus()
	mojaloopStatus := s.mojaloop.GetStatus()

	batchCount := len(s.settlementBatches)
	pendingCount := len(s.pendingSettlements)
	dbConnected := s.hasDB()

	if dbConnected {
		s.db().QueryRow("SELECT COUNT(*) FROM settlement_batches").Scan(&batchCount)
		s.db().QueryRow("SELECT COUNT(DISTINCT provider_id) FROM pending_settlements WHERE status='pending'").Scan(&pendingCount)
	}

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
		SettlementBatches:     batchCount,
		PendingProviders:      pendingCount,
		ReconciliationReports: len(s.reconciliationReports),
		FeeStructure:          s.feeStructure,
		DatabaseConnected:     dbConnected,
	}
}
