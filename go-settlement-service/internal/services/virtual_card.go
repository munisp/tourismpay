package services

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// ─── Prometheus Metrics ──────────────────────────────────────────────────────

var (
	virtualCardsIssued = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "tourismpay_virtual_cards_issued_total",
		Help: "Total virtual cards issued by type and currency",
	}, []string{"card_type", "currency"})

	virtualCardTxVolume = promauto.NewCounter(prometheus.CounterOpts{
		Name: "tourismpay_virtual_card_tx_volume_usd_total",
		Help: "Total virtual card transaction volume in USD",
	})

	virtualCardActiveGauge = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "tourismpay_virtual_cards_active",
		Help: "Currently active virtual cards",
	})
)

// ─── Types ──────────────────────────────────────────────────────────────────

type CardType string

const (
	CardTypeVisa       CardType = "visa"
	CardTypeMastercard CardType = "mastercard"
	CardTypeVerve      CardType = "verve" // Nigeria local
)

type VirtualCard struct {
	ID              string    `json:"id"`
	UserID          string    `json:"user_id"`
	CardType        CardType  `json:"card_type"`
	MaskedPAN       string    `json:"masked_pan"` // "4242 **** **** 1234"
	ExpiryMonth     int       `json:"expiry_month"`
	ExpiryYear      int       `json:"expiry_year"`
	Currency        string    `json:"currency"`
	Balance         float64   `json:"balance"`
	SpendLimit      float64   `json:"spend_limit"`
	DailyLimit      float64   `json:"daily_limit"`
	DailySpent      float64   `json:"daily_spent"`
	Status          string    `json:"status"` // active, frozen, expired, cancelled
	Label           string    `json:"label"`  // user-defined label
	IsContactless   bool      `json:"is_contactless"`
	ThreeDSEnabled  bool      `json:"three_ds_enabled"`
	AllowATM        bool      `json:"allow_atm"`
	AllowOnline     bool      `json:"allow_online"`
	AllowPOS        bool      `json:"allow_pos"`
	AllowIntl       bool      `json:"allow_international"`
	CreatedAt       time.Time `json:"created_at"`
	LastUsedAt      *time.Time `json:"last_used_at,omitempty"`
}

type CardTransaction struct {
	ID            string    `json:"id"`
	CardID        string    `json:"card_id"`
	MerchantName  string    `json:"merchant_name"`
	MerchantCity  string    `json:"merchant_city"`
	MerchantMCC   string    `json:"merchant_mcc"` // Merchant Category Code
	Amount        float64   `json:"amount"`
	Currency      string    `json:"currency"`
	Status        string    `json:"status"` // approved, declined, reversed, pending
	DeclineReason string    `json:"decline_reason,omitempty"`
	IsOnline      bool      `json:"is_online"`
	CreatedAt     time.Time `json:"created_at"`
}

type IssueCardRequest struct {
	UserID      string   `json:"user_id"`
	CardType    CardType `json:"card_type"`
	Currency    string   `json:"currency"`
	FundAmount  float64  `json:"fund_amount"`
	SpendLimit  float64  `json:"spend_limit"`
	DailyLimit  float64  `json:"daily_limit"`
	Label       string   `json:"label"`
	AllowATM    bool     `json:"allow_atm"`
	AllowOnline bool     `json:"allow_online"`
	AllowPOS    bool     `json:"allow_pos"`
	AllowIntl   bool     `json:"allow_international"`
}

type FundCardRequest struct {
	CardID   string  `json:"card_id"`
	Amount   float64 `json:"amount"`
	Currency string  `json:"currency"`
}

// ─── Service ─────────────────────────────────────────────────────────────────

type VirtualCardService struct {
	mu    sync.RWMutex
	cards map[string]*VirtualCard // id -> card
	txns  map[string][]CardTransaction // cardID -> transactions
}

func NewVirtualCardService() *VirtualCardService {
	return &VirtualCardService{
		cards: make(map[string]*VirtualCard),
		txns:  make(map[string][]CardTransaction),
	}
}

func (s *VirtualCardService) IssueCard(req IssueCardRequest) (*VirtualCard, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Count existing active cards for user (max 5)
	activeCount := 0
	for _, c := range s.cards {
		if c.UserID == req.UserID && c.Status == "active" {
			activeCount++
		}
	}
	if activeCount >= 5 {
		return nil, fmt.Errorf("maximum 5 active virtual cards per user")
	}

	cardID := generateCardID()
	pan := generateMaskedPAN(req.CardType)
	now := time.Now()
	expiry := now.AddDate(3, 0, 0) // 3 year expiry

	dailyLimit := req.DailyLimit
	if dailyLimit <= 0 {
		dailyLimit = 5000 // $5,000 default daily limit
	}
	spendLimit := req.SpendLimit
	if spendLimit <= 0 {
		spendLimit = 50000 // $50,000 total limit
	}

	card := &VirtualCard{
		ID:             cardID,
		UserID:         req.UserID,
		CardType:       req.CardType,
		MaskedPAN:      pan,
		ExpiryMonth:    int(expiry.Month()),
		ExpiryYear:     expiry.Year(),
		Currency:       req.Currency,
		Balance:        req.FundAmount,
		SpendLimit:     spendLimit,
		DailyLimit:     dailyLimit,
		DailySpent:     0,
		Status:         "active",
		Label:          req.Label,
		IsContactless:  true,
		ThreeDSEnabled: true,
		AllowATM:       req.AllowATM,
		AllowOnline:    req.AllowOnline,
		AllowPOS:       req.AllowPOS,
		AllowIntl:      req.AllowIntl,
		CreatedAt:      now,
	}

	s.cards[cardID] = card
	virtualCardsIssued.WithLabelValues(string(req.CardType), req.Currency).Inc()
	virtualCardActiveGauge.Inc()

	return card, nil
}

func (s *VirtualCardService) ListCards(userID string) []*VirtualCard {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*VirtualCard
	for _, c := range s.cards {
		if c.UserID == userID {
			result = append(result, c)
		}
	}
	return result
}

func (s *VirtualCardService) GetCard(cardID string) (*VirtualCard, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	card, ok := s.cards[cardID]
	if !ok {
		return nil, fmt.Errorf("card %s not found", cardID)
	}
	return card, nil
}

func (s *VirtualCardService) FundCard(req FundCardRequest) (*VirtualCard, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	card, ok := s.cards[req.CardID]
	if !ok {
		return nil, fmt.Errorf("card %s not found", req.CardID)
	}
	if card.Status != "active" {
		return nil, fmt.Errorf("card is %s, cannot fund", card.Status)
	}

	card.Balance += req.Amount
	return card, nil
}

func (s *VirtualCardService) FreezeCard(cardID string) (*VirtualCard, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	card, ok := s.cards[cardID]
	if !ok {
		return nil, fmt.Errorf("card %s not found", cardID)
	}
	card.Status = "frozen"
	virtualCardActiveGauge.Dec()
	return card, nil
}

func (s *VirtualCardService) UnfreezeCard(cardID string) (*VirtualCard, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	card, ok := s.cards[cardID]
	if !ok {
		return nil, fmt.Errorf("card %s not found", cardID)
	}
	if card.Status != "frozen" {
		return nil, fmt.Errorf("card is %s, not frozen", card.Status)
	}
	card.Status = "active"
	virtualCardActiveGauge.Inc()
	return card, nil
}

func (s *VirtualCardService) GetTransactions(cardID string) []CardTransaction {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.txns[cardID]
}

func (s *VirtualCardService) UpdateControls(cardID string, allowATM, allowOnline, allowPOS, allowIntl bool, dailyLimit float64) (*VirtualCard, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	card, ok := s.cards[cardID]
	if !ok {
		return nil, fmt.Errorf("card %s not found", cardID)
	}
	card.AllowATM = allowATM
	card.AllowOnline = allowOnline
	card.AllowPOS = allowPOS
	card.AllowIntl = allowIntl
	if dailyLimit > 0 {
		card.DailyLimit = dailyLimit
	}
	return card, nil
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func generateCardID() string {
	b := make([]byte, 12)
	rand.Read(b)
	return "vcard_" + hex.EncodeToString(b)
}

func generateMaskedPAN(ct CardType) string {
	b := make([]byte, 2)
	rand.Read(b)
	last4 := fmt.Sprintf("%04d", (int(b[0])<<8|int(b[1]))%10000)
	switch ct {
	case CardTypeVisa:
		return "4242 **** **** " + last4
	case CardTypeMastercard:
		return "5399 **** **** " + last4
	case CardTypeVerve:
		return "5061 **** **** " + last4
	default:
		return "4242 **** **** " + last4
	}
}
