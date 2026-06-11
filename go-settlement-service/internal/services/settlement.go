package services

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"time"

	"github.com/lib/pq"
	"github.com/tourismpay/settlement-service/internal/db"
	"github.com/tourismpay/settlement-service/internal/models"
)

type SettlementService struct {
	ledger           *TigerBeetleLedgerService
	mojaloop         *MojaloopDFSPService
	conn             *sql.DB
	feeStructure     models.FeeStructure
	providerAccounts map[string]models.ProviderAccount
}

func NewSettlementService(ledger *TigerBeetleLedgerService, mojaloop *MojaloopDFSPService) *SettlementService {
	conn, err := db.GetDB()
	if err != nil {
		log.Printf("[settlement] DB unavailable: %v", err)
	}
	return &SettlementService{
		ledger:   ledger,
		mojaloop: mojaloop,
		conn:     conn,
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

func (s *SettlementService) getConn() *sql.DB {
	if s.conn != nil {
		return s.conn
	}
	conn, err := db.GetDB()
	if err != nil {
		return nil
	}
	s.conn = conn
	return conn
}

func (s *SettlementService) generateID(prefix string) string {
	b := make([]byte, 8)
	rand.Read(b)
	return fmt.Sprintf("%s-%s", prefix, hex.EncodeToString(b))
}

type BookingPaymentResult struct {
	Success         bool             `json:"success"`
	BookingID       string           `json:"booking_id"`
	TotalAmount     float64          `json:"total_amount"`
	PlatformFee     float64          `json:"platform_fee"`
	ProcessingFee   float64          `json:"processing_fee"`
	ProviderAmount  float64          `json:"provider_amount"`
	Currency        string           `json:"currency"`
	LedgerTransfers []TransferResult `json:"ledger_transfers,omitempty"`
	Error           string           `json:"error,omitempty"`
}

func (s *SettlementService) RecordBookingPayment(
	bookingID, providerID string,
	amount float64,
	currency, touristWalletID string,
) BookingPaymentResult {
	platformFee := amount * (s.feeStructure.PlatformFeePercent / 100)
	processingFee := amount * (s.feeStructure.PaymentProcessingPercent / 100)
	providerAmount := amount - platformFee - processingFee

	transfers := []LinkedTransferRequest{
		{FromType: "TOURIST", FromID: touristWalletID, ToType: "ESCROW", ToID: "booking_escrow", Currency: currency, Amount: uint64(amount * 100), Pending: true, Reference: fmt.Sprintf("BOOKING:%s", bookingID)},
		{FromType: "ESCROW", FromID: "booking_escrow", ToType: "PLATFORM", ToID: "platform_fees", Currency: currency, Amount: uint64(platformFee * 100), Pending: true, Reference: fmt.Sprintf("FEE:%s", bookingID)},
	}

	result := s.ledger.CreateLinkedTransfers(transfers)

	if result.Success {
		conn := s.getConn()
		if conn != nil {
			_, _ = conn.Exec(`INSERT INTO pending_settlements (provider_id, booking_id, amount, currency, platform_fee, processing_fee)
				VALUES ($1,$2,$3,$4,$5,$6)`, providerID, bookingID, providerAmount, currency, platformFee, processingFee)
		}
	}

	return BookingPaymentResult{
		Success: result.Success, BookingID: bookingID, TotalAmount: amount,
		PlatformFee: platformFee, ProcessingFee: processingFee, ProviderAmount: providerAmount,
		Currency: currency, LedgerTransfers: result.Transfers,
	}
}

func (s *SettlementService) CreateSettlementBatch(providerID, settlementDate string) (*models.SettlementBatch, error) {
	conn := s.getConn()
	if conn == nil {
		return nil, fmt.Errorf("database unavailable")
	}
	if settlementDate == "" {
		settlementDate = time.Now().Format("2006-01-02")
	}

	rows, err := conn.Query(`SELECT booking_id, amount, currency FROM pending_settlements WHERE provider_id=$1`, providerID)
	if err != nil {
		return nil, fmt.Errorf("query pending: %w", err)
	}
	defer rows.Close()

	var totalAmount float64
	currency := "USD"
	var transactions []string
	for rows.Next() {
		var bid, cur string
		var amt float64
		if err := rows.Scan(&bid, &amt, &cur); err == nil {
			totalAmount += amt
			currency = cur
			transactions = append(transactions, bid)
		}
	}
	if len(transactions) == 0 {
		return nil, fmt.Errorf("no pending settlements for provider %s", providerID)
	}
	if totalAmount < s.feeStructure.MinimumSettlement {
		return nil, fmt.Errorf("settlement amount %.2f below minimum %.2f", totalAmount, s.feeStructure.MinimumSettlement)
	}

	settlementFee := s.feeStructure.SettlementFeeFixed
	netAmount := totalAmount - settlementFee
	batchID := s.generateID("BATCH")

	batch := &models.SettlementBatch{
		BatchID:        batchID,
		ProviderID:     providerID,
		SettlementDate: settlementDate,
		TotalAmount:    totalAmount,
		SettlementFee:  settlementFee,
		NetAmount:      netAmount,
		Currency:       currency,
		Transactions:   transactions,
		Status:         "pending",
		CreatedAt:      time.Now(),
	}

	_, err = conn.Exec(`INSERT INTO settlement_batches (batch_id, provider_id, settlement_date, total_amount, settlement_fee, net_amount, currency, status, transactions)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		batchID, providerID, settlementDate, totalAmount, settlementFee, netAmount, currency, "pending", pq.Array(transactions))
	if err != nil {
		return nil, fmt.Errorf("insert batch: %w", err)
	}

	_, _ = conn.Exec(`DELETE FROM pending_settlements WHERE provider_id=$1`, providerID)
	return batch, nil
}

func (s *SettlementService) ProcessSettlementBatch(batchID string) (*models.SettlementBatch, error) {
	conn := s.getConn()
	if conn == nil {
		return nil, fmt.Errorf("database unavailable")
	}

	batch := s.GetSettlementBatch(batchID)
	if batch == nil {
		return nil, fmt.Errorf("batch %s not found", batchID)
	}
	if batch.Status != "pending" {
		return nil, fmt.Errorf("batch already %s", batch.Status)
	}

	_, _ = conn.Exec(`UPDATE settlement_batches SET status='processing' WHERE batch_id=$1`, batchID)

	transferResult := s.ledger.CreateTransfer("SETTLEMENT", "holding_account", "PROVIDER", batch.ProviderID, batch.Currency, uint64(batch.NetAmount*100), false, fmt.Sprintf("SETTLE:%s", batchID))

	if transferResult.Success {
		_, _ = conn.Exec(`UPDATE settlement_batches SET status='completed', processed_at=NOW() WHERE batch_id=$1`, batchID)
		batch.Status = "completed"
		now := time.Now()
		batch.ProcessedAt = &now
	} else {
		_, _ = conn.Exec(`UPDATE settlement_batches SET status='failed' WHERE batch_id=$1`, batchID)
		batch.Status = "failed"
		return batch, fmt.Errorf("ledger transfer failed: %s", transferResult.Error)
	}

	return batch, nil
}

func (s *SettlementService) ListSettlementBatches() []*models.SettlementBatch {
	conn := s.getConn()
	if conn == nil {
		return nil
	}
	rows, err := conn.Query(`SELECT batch_id, provider_id, settlement_date, total_amount, settlement_fee, net_amount, currency, status, transactions, created_at, processed_at
		FROM settlement_batches ORDER BY created_at DESC LIMIT 50`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var result []*models.SettlementBatch
	for rows.Next() {
		var b models.SettlementBatch
		var processed sql.NullTime
		if err := rows.Scan(&b.BatchID, &b.ProviderID, &b.SettlementDate, &b.TotalAmount, &b.SettlementFee, &b.NetAmount, &b.Currency, &b.Status, pq.Array(&b.Transactions), &b.CreatedAt, &processed); err == nil {
			if processed.Valid {
				b.ProcessedAt = &processed.Time
			}
			result = append(result, &b)
		}
	}
	return result
}

func (s *SettlementService) GetSettlementBatch(batchID string) *models.SettlementBatch {
	conn := s.getConn()
	if conn == nil {
		return nil
	}
	var b models.SettlementBatch
	var processed sql.NullTime
	err := conn.QueryRow(`SELECT batch_id, provider_id, settlement_date, total_amount, settlement_fee, net_amount, currency, status, transactions, created_at, processed_at
		FROM settlement_batches WHERE batch_id=$1`, batchID).
		Scan(&b.BatchID, &b.ProviderID, &b.SettlementDate, &b.TotalAmount, &b.SettlementFee, &b.NetAmount, &b.Currency, &b.Status, pq.Array(&b.Transactions), &b.CreatedAt, &processed)
	if err != nil {
		return nil
	}
	if processed.Valid {
		b.ProcessedAt = &processed.Time
	}
	return &b
}

func (s *SettlementService) RunDailySettlements() map[string]interface{} {
	result := map[string]interface{}{"date": time.Now().Format("2006-01-02")}
	var processed []string
	var errors []string

	for providerID := range s.providerAccounts {
		batch, err := s.CreateSettlementBatch(providerID, "")
		if err != nil {
			continue
		}
		if _, err := s.ProcessSettlementBatch(batch.BatchID); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %v", providerID, err))
		} else {
			processed = append(processed, providerID)
		}
	}

	result["processed"] = processed
	result["errors"] = errors
	return result
}

func (s *SettlementService) GetProviderBalance(providerID string) map[string]interface{} {
	balance := s.ledger.GetAccountBalance("PROVIDER", providerID, "USD")
	return map[string]interface{}{
		"provider_id": providerID,
		"balance":     balance,
		"bank":        s.providerAccounts[providerID].Bank,
		"account":     s.providerAccounts[providerID].Account,
	}
}

type PendingSettlementSummary struct {
	ProviderID   string  `json:"provider_id"`
	BookingCount int     `json:"booking_count"`
	TotalAmount  float64 `json:"total_amount"`
	Currency     string  `json:"currency"`
}

func (s *SettlementService) ListPendingSettlements() []PendingSettlementSummary {
	conn := s.getConn()
	if conn == nil {
		return nil
	}
	rows, err := conn.Query(`SELECT provider_id, COUNT(*), SUM(amount), MIN(currency) FROM pending_settlements GROUP BY provider_id`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var result []PendingSettlementSummary
	for rows.Next() {
		var p PendingSettlementSummary
		if err := rows.Scan(&p.ProviderID, &p.BookingCount, &p.TotalAmount, &p.Currency); err == nil {
			result = append(result, p)
		}
	}
	return result
}

func (s *SettlementService) GenerateReconciliationReport(providerID string, periodStart, periodEnd time.Time) (*models.ReconciliationReport, error) {
	conn := s.getConn()
	if conn == nil {
		return nil, fmt.Errorf("database unavailable")
	}

	reportID := s.generateID("RECON")
	var totalBookings, totalSettled float64

	_ = conn.QueryRow(`SELECT COALESCE(SUM(amount),0) FROM pending_settlements WHERE provider_id=$1 AND recorded_at BETWEEN $2 AND $3`,
		providerID, periodStart, periodEnd).Scan(&totalBookings)
	_ = conn.QueryRow(`SELECT COALESCE(SUM(net_amount),0) FROM settlement_batches WHERE provider_id=$1 AND status='completed' AND created_at BETWEEN $2 AND $3`,
		providerID, periodStart, periodEnd).Scan(&totalSettled)

	report := &models.ReconciliationReport{
		ReportID:      reportID,
		ProviderID:    providerID,
		PeriodStart:   periodStart,
		PeriodEnd:     periodEnd,
		TotalBookings: totalBookings,
		TotalSettled:  totalSettled,
		Discrepancy:   totalBookings - totalSettled,
		Status:        "generated",
	}

	_, err := conn.Exec(`INSERT INTO reconciliation_reports (report_id, provider_id, period_start, period_end, total_bookings, total_settled, discrepancy, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		reportID, providerID, periodStart, periodEnd, totalBookings, totalSettled, report.Discrepancy, "generated")
	if err != nil {
		return nil, fmt.Errorf("insert report: %w", err)
	}

	return report, nil
}

func (s *SettlementService) ListReconciliationReports() []*models.ReconciliationReport {
	conn := s.getConn()
	if conn == nil {
		return nil
	}
	rows, err := conn.Query(`SELECT report_id, provider_id, period_start, period_end, total_bookings, total_settled, discrepancy, status FROM reconciliation_reports ORDER BY created_at DESC LIMIT 50`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var result []*models.ReconciliationReport
	for rows.Next() {
		var r models.ReconciliationReport
		if err := rows.Scan(&r.ReportID, &r.ProviderID, &r.PeriodStart, &r.PeriodEnd, &r.TotalBookings, &r.TotalSettled, &r.Discrepancy, &r.Status); err == nil {
			result = append(result, &r)
		}
	}
	return result
}

func (s *SettlementService) GetReconciliationReport(reportID string) *models.ReconciliationReport {
	conn := s.getConn()
	if conn == nil {
		return nil
	}
	var r models.ReconciliationReport
	err := conn.QueryRow(`SELECT report_id, provider_id, period_start, period_end, total_bookings, total_settled, discrepancy, status FROM reconciliation_reports WHERE report_id=$1`, reportID).
		Scan(&r.ReportID, &r.ProviderID, &r.PeriodStart, &r.PeriodEnd, &r.TotalBookings, &r.TotalSettled, &r.Discrepancy, &r.Status)
	if err != nil {
		return nil
	}
	return &r
}

func (s *SettlementService) GetStatus() map[string]interface{} {
	conn := s.getConn()
	status := map[string]interface{}{"connected": conn != nil}
	if conn != nil {
		var batchCount, pendingCount int
		_ = conn.QueryRow(`SELECT COUNT(*) FROM settlement_batches`).Scan(&batchCount)
		_ = conn.QueryRow(`SELECT COUNT(*) FROM pending_settlements`).Scan(&pendingCount)
		status["batches"] = batchCount
		status["pending_settlements"] = pendingCount
		status["providers"] = len(s.providerAccounts)
	}
	return status
}
