package services

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/tourismpay/settlement-service/internal/db"
	"github.com/tourismpay/settlement-service/internal/models"
)

type MojaloopDFSPService struct {
	dfspID string
	hubURL string
	conn   *sql.DB
}

func NewMojaloopDFSPService(dfspID string) *MojaloopDFSPService {
	conn, err := db.GetDB()
	if err != nil {
		log.Printf("[mojaloop] DB unavailable: %v", err)
	}
	s := &MojaloopDFSPService{dfspID: dfspID, hubURL: "https://mojaloop-hub.example.com", conn: conn}
	s.seedParticipants()
	return s
}

func (s *MojaloopDFSPService) getConn() *sql.DB {
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

func (s *MojaloopDFSPService) seedParticipants() {
	conn := s.getConn()
	if conn == nil {
		return
	}
	participants := []models.MojaloopParticipant{
		{FSPID: "tourismpay", Name: "TourismPay", Currency: "TZS", AccountID: "TP001", IsActive: true},
		{FSPID: "crdb", Name: "CRDB Bank", Currency: "TZS", AccountID: "CRDB001", IsActive: true},
		{FSPID: "nmb", Name: "NMB Bank", Currency: "TZS", AccountID: "NMB001", IsActive: true},
		{FSPID: "vodacom_mpesa", Name: "Vodacom M-Pesa", Currency: "TZS", AccountID: "MPESA001", IsActive: true},
		{FSPID: "tigo_pesa", Name: "Tigo Pesa", Currency: "TZS", AccountID: "TIGO001", IsActive: true},
		{FSPID: "airtel_money", Name: "Airtel Money", Currency: "TZS", AccountID: "AIRTEL001", IsActive: true},
		{FSPID: "safari_lodge", Name: "Safari Lodge Ltd", Currency: "USD", AccountID: "SL001", IsActive: true},
		{FSPID: "serengeti_tours", Name: "Serengeti Tours", Currency: "USD", AccountID: "ST001", IsActive: true},
		{FSPID: "zanzibar_resorts", Name: "Zanzibar Resorts", Currency: "USD", AccountID: "ZR001", IsActive: true},
	}
	for _, p := range participants {
		_, _ = conn.Exec(`INSERT INTO mojaloop_participants (fsp_id, name, currency, account_id, is_active) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (fsp_id) DO NOTHING`,
			p.FSPID, p.Name, p.Currency, p.AccountID, p.IsActive)
	}
}

func (s *MojaloopDFSPService) generateCondition() string {
	preimage := make([]byte, 32)
	rand.Read(preimage)
	hash := sha256.Sum256(preimage)
	return hex.EncodeToString(hash[:])
}

func (s *MojaloopDFSPService) generateFulfilment(condition string) string {
	hash := sha256.Sum256([]byte(condition))
	return hex.EncodeToString(hash[:])[:64]
}

func (s *MojaloopDFSPService) generateILPPacket(amount float64, currency, destination string) string {
	packetData := map[string]interface{}{
		"amount":      fmt.Sprintf("%.0f", amount*100),
		"currency":    currency,
		"destination": destination,
		"data":        map[string]string{"transactionType": "TRANSFER"},
	}
	jsonData, _ := json.Marshal(packetData)
	hash := sha256.Sum256(jsonData)
	return hex.EncodeToString(hash[:])
}

func (s *MojaloopDFSPService) generateID(prefix string) string {
	b := make([]byte, 8)
	rand.Read(b)
	return fmt.Sprintf("%s%s", prefix, hex.EncodeToString(b))
}

func (s *MojaloopDFSPService) LookupParticipant(identifierType, identifier string) *models.MojaloopParticipant {
	conn := s.getConn()
	if conn == nil {
		return nil
	}
	var p models.MojaloopParticipant
	err := conn.QueryRow(`SELECT fsp_id, name, currency, account_id, is_active FROM mojaloop_participants WHERE fsp_id=$1 OR account_id=$1`, identifier).
		Scan(&p.FSPID, &p.Name, &p.Currency, &p.AccountID, &p.IsActive)
	if err != nil {
		return nil
	}
	return &p
}

func (s *MojaloopDFSPService) ListParticipants() []*models.MojaloopParticipant {
	conn := s.getConn()
	if conn == nil {
		return nil
	}
	rows, err := conn.Query(`SELECT fsp_id, name, currency, account_id, is_active FROM mojaloop_participants ORDER BY fsp_id`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var result []*models.MojaloopParticipant
	for rows.Next() {
		var p models.MojaloopParticipant
		if err := rows.Scan(&p.FSPID, &p.Name, &p.Currency, &p.AccountID, &p.IsActive); err == nil {
			result = append(result, &p)
		}
	}
	return result
}

func (s *MojaloopDFSPService) CreateQuote(payerFSP, payeeFSP string, amount float64, currency string) (*models.MojaloopQuote, error) {
	conn := s.getConn()
	if conn == nil {
		return nil, fmt.Errorf("database unavailable")
	}

	quoteID := s.generateID("Q")
	transactionID := s.generateID("T")
	baseFee := amount * 0.005
	commission := 0.0
	if payeeFSP != s.dfspID {
		commission = amount * 0.002
	}

	condition := s.generateCondition()
	ilpPacket := s.generateILPPacket(amount, currency, payeeFSP)
	expiration := time.Now().Add(time.Hour)

	quote := &models.MojaloopQuote{
		QuoteID: quoteID, TransactionID: transactionID,
		PayerFSP: payerFSP, PayeeFSP: payeeFSP,
		Amount: amount, Currency: currency,
		Fees: baseFee, Commission: commission,
		Expiration: expiration, Condition: condition, ILPPacket: ilpPacket,
	}

	_, err := conn.Exec(`INSERT INTO mojaloop_quotes (quote_id, transaction_id, payer_fsp, payee_fsp, amount, currency, fees, commission, expiration, condition, ilp_packet)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		quoteID, transactionID, payerFSP, payeeFSP, amount, currency, baseFee, commission, expiration, condition, ilpPacket)
	if err != nil {
		return nil, fmt.Errorf("insert quote: %w", err)
	}
	return quote, nil
}

func (s *MojaloopDFSPService) PrepareTransfer(quoteID string) (*models.MojaloopTransfer, error) {
	conn := s.getConn()
	if conn == nil {
		return nil, fmt.Errorf("database unavailable")
	}

	var q models.MojaloopQuote
	err := conn.QueryRow(`SELECT quote_id, transaction_id, payer_fsp, payee_fsp, amount, currency, condition, ilp_packet, expiration
		FROM mojaloop_quotes WHERE quote_id=$1`, quoteID).
		Scan(&q.QuoteID, &q.TransactionID, &q.PayerFSP, &q.PayeeFSP, &q.Amount, &q.Currency, &q.Condition, &q.ILPPacket, &q.Expiration)
	if err != nil {
		return nil, fmt.Errorf("quote %s not found", quoteID)
	}
	if time.Now().After(q.Expiration) {
		return nil, fmt.Errorf("quote has expired")
	}

	transferID := s.generateID("TR")
	transfer := &models.MojaloopTransfer{
		TransferID: transferID, QuoteID: quoteID,
		PayerFSP: q.PayerFSP, PayeeFSP: q.PayeeFSP,
		Amount: q.Amount, Currency: q.Currency, State: models.MojaloopStatePending,
	}

	_, err = conn.Exec(`INSERT INTO mojaloop_transfers (transfer_id, quote_id, payer_fsp, payee_fsp, amount, currency, status, condition, ilp_packet)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		transferID, quoteID, q.PayerFSP, q.PayeeFSP, q.Amount, q.Currency, "RESERVED", q.Condition, q.ILPPacket)
	if err != nil {
		return nil, fmt.Errorf("insert transfer: %w", err)
	}
	return transfer, nil
}

func (s *MojaloopDFSPService) CommitTransfer(transferID string) (*models.MojaloopTransfer, error) {
	conn := s.getConn()
	if conn == nil {
		return nil, fmt.Errorf("database unavailable")
	}

	var t models.MojaloopTransfer
	var condition string
	err := conn.QueryRow(`SELECT transfer_id, quote_id, payer_fsp, payee_fsp, amount, currency, status, condition
		FROM mojaloop_transfers WHERE transfer_id=$1`, transferID).
		Scan(&t.TransferID, &t.QuoteID, &t.PayerFSP, &t.PayeeFSP, &t.Amount, &t.Currency, &t.State, &condition)
	if err != nil {
		return nil, fmt.Errorf("transfer %s not found", transferID)
	}
	if string(t.State) != "RESERVED" {
		return nil, fmt.Errorf("transfer not in RESERVED state")
	}

	fulfilment := s.generateFulfilment(condition)
	now := time.Now()
	t.State = models.MojaloopStateCompleted
	t.Fulfilment = fulfilment
	t.CompletedTimestamp = &now

	_, _ = conn.Exec(`UPDATE mojaloop_transfers SET status='COMMITTED', fulfilment=$1, committed_at=$2 WHERE transfer_id=$3`,
		fulfilment, now, transferID)

	return &t, nil
}

func (s *MojaloopDFSPService) ListSettlementWindows() []*models.SettlementWindow {
	conn := s.getConn()
	if conn == nil {
		return nil
	}
	rows, err := conn.Query(`SELECT window_id, state, open_time, close_time, total_value, transfer_count FROM settlement_windows ORDER BY open_time DESC LIMIT 20`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var result []*models.SettlementWindow
	for rows.Next() {
		var w models.SettlementWindow
		var closeTime sql.NullTime
		if err := rows.Scan(&w.WindowID, &w.State, &w.OpenTime, &closeTime, &w.TotalValue, &w.TransferCount); err == nil {
			if closeTime.Valid {
				w.CloseTime = &closeTime.Time
			}
			result = append(result, &w)
		}
	}
	return result
}

func (s *MojaloopDFSPService) CloseSettlementWindow(windowID string) (*models.SettlementWindow, error) {
	conn := s.getConn()
	if conn == nil {
		return nil, fmt.Errorf("database unavailable")
	}
	now := time.Now()
	res, err := conn.Exec(`UPDATE settlement_windows SET state='CLOSED', close_time=$1 WHERE window_id=$2 AND state='OPEN'`, now, windowID)
	if err != nil {
		return nil, fmt.Errorf("close window: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, fmt.Errorf("window %s not found or already closed", windowID)
	}
	var w models.SettlementWindow
	var closeTime sql.NullTime
	_ = conn.QueryRow(`SELECT window_id, state, open_time, close_time, total_value, transfer_count FROM settlement_windows WHERE window_id=$1`, windowID).
		Scan(&w.WindowID, &w.State, &w.OpenTime, &closeTime, &w.TotalValue, &w.TransferCount)
	if closeTime.Valid {
		w.CloseTime = &closeTime.Time
	}
	return &w, nil
}

func (s *MojaloopDFSPService) GetStatus() map[string]interface{} {
	conn := s.getConn()
	status := map[string]interface{}{"dfsp_id": s.dfspID, "hub_url": s.hubURL, "connected": conn != nil}
	if conn != nil {
		var pCount, qCount, tCount int
		_ = conn.QueryRow(`SELECT COUNT(*) FROM mojaloop_participants`).Scan(&pCount)
		_ = conn.QueryRow(`SELECT COUNT(*) FROM mojaloop_quotes`).Scan(&qCount)
		_ = conn.QueryRow(`SELECT COUNT(*) FROM mojaloop_transfers`).Scan(&tCount)
		status["participants"] = pCount
		status["quotes"] = qCount
		status["transfers"] = tCount
	}
	return status
}
