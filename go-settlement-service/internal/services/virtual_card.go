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
	mu sync.RWMutex
}

func NewVirtualCardService() *VirtualCardService {
	return &VirtualCardService{}
}

func (s *VirtualCardService) IssueCard(req IssueCardRequest) (*VirtualCard, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Count existing active cards for user (max 5)
	var activeCount int
	if database.DB != nil {
		database.DB.QueryRow("SELECT COUNT(*) FROM virtual_cards WHERE user_id=$1 AND status='ACTIVE'", req.UserID).Scan(&activeCount)
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

	database.DB.Exec(
		"INSERT INTO virtual_cards (id, user_id, card_number, card_type, currency, balance, spending_limit, status, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
		cardID, req.UserID, pan, string(req.CardType), req.Currency, req.FundAmount, spendLimit, "ACTIVE", expiry,
	)

	virtualCardsIssued.WithLabelValues(string(req.CardType), req.Currency).Inc()
	virtualCardActiveGauge.Inc()

	return card, nil
}

func (s *VirtualCardService) ListCards(userID string) []*VirtualCard {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*VirtualCard
	if database.DB != nil {
		rows, err := database.DB.Query(
			"SELECT id, user_id, card_number, card_type, currency, balance, spending_limit, status, expires_at, created_at FROM virtual_cards WHERE user_id=$1 ORDER BY created_at DESC",
			userID,
		)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				c := &VirtualCard{}
				var cardType string
				var expiry time.Time
				rows.Scan(&c.ID, &c.UserID, &c.MaskedPAN, &cardType, &c.Currency, &c.Balance, &c.SpendLimit, &c.Status, &expiry, &c.CreatedAt)
				c.CardType = CardType(cardType)
				c.ExpiryMonth = int(expiry.Month())
				c.ExpiryYear = expiry.Year()
				result = append(result, c)
			}
		}
	}
	return result
}

func (s *VirtualCardService) GetCard(cardID string) (*VirtualCard, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if database.DB != nil {
		c := &VirtualCard{}
		var cardType string
		var expiry time.Time
		err := database.DB.QueryRow(
			"SELECT id, user_id, card_number, card_type, currency, balance, spending_limit, status, expires_at, created_at FROM virtual_cards WHERE id=$1",
			cardID,
		).Scan(&c.ID, &c.UserID, &c.MaskedPAN, &cardType, &c.Currency, &c.Balance, &c.SpendLimit, &c.Status, &expiry, &c.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("card %s not found", cardID)
		}
		c.CardType = CardType(cardType)
		c.ExpiryMonth = int(expiry.Month())
		c.ExpiryYear = expiry.Year()
		return c, nil
	}
	return nil, fmt.Errorf("database not available")
}

func (s *VirtualCardService) FundCard(req FundCardRequest) (*VirtualCard, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if database.DB != nil {
		var status string
		err := database.DB.QueryRow("SELECT status FROM virtual_cards WHERE id=$1", req.CardID).Scan(&status)
		if err != nil {
			return nil, fmt.Errorf("card %s not found", req.CardID)
		}
		if status != "ACTIVE" {
			return nil, fmt.Errorf("card is %s, cannot fund", status)
		}
		database.DB.Exec("UPDATE virtual_cards SET balance = balance + $1 WHERE id=$2", req.Amount, req.CardID)
	}

	card, err := s.GetCard(req.CardID)
	if err != nil {
		return nil, err
	}
	return card, nil
}

func (s *VirtualCardService) FreezeCard(cardID string) (*VirtualCard, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if database.DB != nil {
		result, err := database.DB.Exec("UPDATE virtual_cards SET status='FROZEN' WHERE id=$1 AND status='ACTIVE'", cardID)
		if err != nil {
			return nil, fmt.Errorf("card %s not found", cardID)
		}
		if rows, _ := result.RowsAffected(); rows == 0 {
			return nil, fmt.Errorf("card %s not found or not active", cardID)
		}
	}
	virtualCardActiveGauge.Dec()

	card, err := s.GetCard(cardID)
	if err != nil {
		return nil, err
	}
	return card, nil
}

func (s *VirtualCardService) UnfreezeCard(cardID string) (*VirtualCard, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if database.DB != nil {
		result, err := database.DB.Exec("UPDATE virtual_cards SET status='ACTIVE' WHERE id=$1 AND status='FROZEN'", cardID)
		if err != nil {
			return nil, fmt.Errorf("card %s not found", cardID)
		}
		if rows, _ := result.RowsAffected(); rows == 0 {
			return nil, fmt.Errorf("card %s not found or not frozen", cardID)
		}
	}
	virtualCardActiveGauge.Inc()

	card, err := s.GetCard(cardID)
	if err != nil {
		return nil, err
	}
	return card, nil
}

func (s *VirtualCardService) GetTransactions(cardID string) []CardTransaction {
	s.mu.RLock()
	defer s.mu.RUnlock()
	// Card transactions table not yet created; return empty for now
	return nil
}

func (s *VirtualCardService) UpdateControls(cardID string, allowATM, allowOnline, allowPOS, allowIntl bool, dailyLimit float64) (*VirtualCard, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if database.DB != nil {
		if dailyLimit > 0 {
			database.DB.Exec("UPDATE virtual_cards SET spending_limit=$1 WHERE id=$2", dailyLimit, cardID)
		}
	}

	card, err := s.GetCard(cardID)
	if err != nil {
		return nil, err
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
