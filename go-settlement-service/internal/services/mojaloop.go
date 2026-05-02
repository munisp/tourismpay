package services

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/tourismpay/settlement-service/internal/models"
)

type MojaloopDFSPService struct {
	dfspID            string
	hubURL            string
	participants      map[string]*models.MojaloopParticipant
	quotes            map[string]*models.MojaloopQuote
	transfers         map[string]*models.MojaloopTransfer
	settlementWindows map[string]*models.SettlementWindow
	mu                sync.RWMutex
}

func NewMojaloopDFSPService(dfspID string) *MojaloopDFSPService {
	s := &MojaloopDFSPService{
		dfspID:            dfspID,
		hubURL:            "https://mojaloop-hub.example.com",
		participants:      make(map[string]*models.MojaloopParticipant),
		quotes:            make(map[string]*models.MojaloopQuote),
		transfers:         make(map[string]*models.MojaloopTransfer),
		settlementWindows: make(map[string]*models.SettlementWindow),
	}
	s.initializeParticipants()
	return s
}

func (s *MojaloopDFSPService) initializeParticipants() {
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

	for i := range participants {
		s.participants[participants[i].FSPID] = &participants[i]
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
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, p := range s.participants {
		if p.AccountID == identifier || p.FSPID == identifier {
			return p
		}
	}
	return nil
}

func (s *MojaloopDFSPService) ListParticipants() []*models.MojaloopParticipant {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*models.MojaloopParticipant, 0, len(s.participants))
	for _, p := range s.participants {
		result = append(result, p)
	}
	return result
}

func (s *MojaloopDFSPService) CreateQuote(payerFSP, payeeFSP string, amount float64, currency string) (*models.MojaloopQuote, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	quoteID := s.generateID("Q")
	transactionID := s.generateID("T")

	baseFee := amount * 0.005
	commission := 0.0
	if payeeFSP != s.dfspID {
		commission = amount * 0.002
	}

	condition := s.generateCondition()
	ilpPacket := s.generateILPPacket(amount, currency, payeeFSP)

	quote := &models.MojaloopQuote{
		QuoteID:       quoteID,
		TransactionID: transactionID,
		PayerFSP:      payerFSP,
		PayeeFSP:      payeeFSP,
		Amount:        amount,
		Currency:      currency,
		Fees:          baseFee,
		Commission:    commission,
		Expiration:    time.Now().Add(time.Hour),
		Condition:     condition,
		ILPPacket:     ilpPacket,
	}

	s.quotes[quoteID] = quote
	return quote, nil
}

func (s *MojaloopDFSPService) PrepareTransfer(quoteID string) (*models.MojaloopTransfer, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	quote, ok := s.quotes[quoteID]
	if !ok {
		return nil, fmt.Errorf("quote %s not found", quoteID)
	}

	if time.Now().After(quote.Expiration) {
		return nil, fmt.Errorf("quote has expired")
	}

	transferID := s.generateID("TR")

	transfer := &models.MojaloopTransfer{
		TransferID: transferID,
		QuoteID:    quoteID,
		PayerFSP:   quote.PayerFSP,
		PayeeFSP:   quote.PayeeFSP,
		Amount:     quote.Amount,
		Currency:   quote.Currency,
		State:      models.MojaloopStatePending,
	}

	s.transfers[transferID] = transfer
	return transfer, nil
}

func (s *MojaloopDFSPService) CommitTransfer(transferID string) (*models.MojaloopTransfer, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	transfer, ok := s.transfers[transferID]
	if !ok {
		return nil, fmt.Errorf("transfer %s not found", transferID)
	}

	quote, ok := s.quotes[transfer.QuoteID]
	if !ok {
		transfer.State = models.MojaloopStateAborted
		return transfer, nil
	}

	transfer.Fulfilment = s.generateFulfilment(quote.Condition)
	transfer.State = models.MojaloopStateCompleted
	now := time.Now()
	transfer.CompletedTimestamp = &now

	return transfer, nil
}

func (s *MojaloopDFSPService) AbortTransfer(transferID, reason string) (*models.MojaloopTransfer, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	transfer, ok := s.transfers[transferID]
	if !ok {
		return nil, fmt.Errorf("transfer %s not found", transferID)
	}

	transfer.State = models.MojaloopStateAborted
	return transfer, nil
}

func (s *MojaloopDFSPService) GetSettlementWindow(windowID string) *models.SettlementWindow {
	s.mu.Lock()
	defer s.mu.Unlock()

	if windowID == "" {
		windowID = time.Now().Format("20060102")
	}

	window, ok := s.settlementWindows[windowID]
	if !ok {
		window = &models.SettlementWindow{
			WindowID:       windowID,
			State:          "OPEN",
			CreatedAt:      time.Now(),
			Participants:   make(map[string]models.ParticipantPosition),
			TotalTransfers: 0,
			TotalAmount:    0,
		}
		s.settlementWindows[windowID] = window
	}

	return window
}

func (s *MojaloopDFSPService) CloseSettlementWindow(windowID string) *models.SettlementWindow {
	s.mu.Lock()
	defer s.mu.Unlock()

	window, ok := s.settlementWindows[windowID]
	if !ok {
		window = &models.SettlementWindow{
			WindowID:     windowID,
			State:        "OPEN",
			CreatedAt:    time.Now(),
			Participants: make(map[string]models.ParticipantPosition),
		}
		s.settlementWindows[windowID] = window
	}

	for _, transfer := range s.transfers {
		if transfer.State == models.MojaloopStateCompleted {
			payerPos := window.Participants[transfer.PayerFSP]
			payerPos.Debits += transfer.Amount
			window.Participants[transfer.PayerFSP] = payerPos

			payeePos := window.Participants[transfer.PayeeFSP]
			payeePos.Credits += transfer.Amount
			window.Participants[transfer.PayeeFSP] = payeePos

			window.TotalTransfers++
			window.TotalAmount += transfer.Amount
		}
	}

	window.State = "CLOSED"
	now := time.Now()
	window.ClosedAt = &now

	window.NetPositions = make(map[string]float64)
	for fspID, pos := range window.Participants {
		window.NetPositions[fspID] = pos.Credits - pos.Debits
	}

	return window
}

func (s *MojaloopDFSPService) ListSettlementWindows() []*models.SettlementWindow {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*models.SettlementWindow, 0, len(s.settlementWindows))
	for _, w := range s.settlementWindows {
		result = append(result, w)
	}
	return result
}

type MojaloopStatus struct {
	Service           string `json:"service"`
	Status            string `json:"status"`
	DFSPID            string `json:"dfsp_id"`
	HubURL            string `json:"hub_url"`
	TotalParticipants int    `json:"total_participants"`
	ActiveQuotes      int    `json:"active_quotes"`
	TotalTransfers    int    `json:"total_transfers"`
	SettlementWindows int    `json:"settlement_windows"`
}

func (s *MojaloopDFSPService) GetStatus() MojaloopStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return MojaloopStatus{
		Service:           "Mojaloop DFSP (Go)",
		Status:            "OPERATIONAL",
		DFSPID:            s.dfspID,
		HubURL:            s.hubURL,
		TotalParticipants: len(s.participants),
		ActiveQuotes:      len(s.quotes),
		TotalTransfers:    len(s.transfers),
		SettlementWindows: len(s.settlementWindows),
	}
}

func (s *MojaloopDFSPService) GetDFSPID() string {
	return s.dfspID
}
