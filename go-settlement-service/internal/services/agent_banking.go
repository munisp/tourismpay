package services

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/tourismpay/settlement-service/internal/database"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// ─── Prometheus Metrics ──────────────────────────────────────────────────────

var (
	agentLoadsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "tourismpay_agent_loads_total",
		Help: "Total cash-to-wallet loads by agent status",
	}, []string{"status", "currency"})

	agentVolumeUSD = promauto.NewCounter(prometheus.CounterOpts{
		Name: "tourismpay_agent_volume_usd_total",
		Help: "Total agent banking volume in USD equivalent",
	})

	agentFloatBalance = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "tourismpay_agent_float_balance",
		Help: "Current agent float balance by currency",
	}, []string{"agent_id", "currency"})

	agentKYCVerifications = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "tourismpay_agent_kyc_verifications_total",
		Help: "KYC verifications performed at agent kiosks",
	}, []string{"tier", "result"})
)

// ─── Types ──────────────────────────────────────────────────────────────────

type AgentTier string

const (
	AgentTierKiosk     AgentTier = "airport_kiosk"
	AgentTierBDC       AgentTier = "bureau_de_change"
	AgentTierHotel     AgentTier = "hotel_concierge"
	AgentTierPartner   AgentTier = "partner_agent"
)

type Agent struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Tier          AgentTier `json:"tier"`
	Location      string    `json:"location"`
	Country       string    `json:"country"`
	LicenseNumber string    `json:"license_number"`
	Status        string    `json:"status"` // active, suspended, pending_review
	FloatBalances map[string]float64 `json:"float_balances"` // currency → available float
	DailyLimit    float64   `json:"daily_limit_usd"`
	DailyUsed     float64   `json:"daily_used_usd"`
	Commission    float64   `json:"commission_percent"`
	CreatedAt     time.Time `json:"created_at"`
}

type CashLoadOrder struct {
	ID              string    `json:"id"`
	AgentID         string    `json:"agent_id"`
	TouristUserID   string    `json:"tourist_user_id"`
	Status          string    `json:"status"` // pending_kyc, kyc_verified, loaded, failed, reversed
	CashCurrency    string    `json:"cash_currency"`
	CashAmount      float64   `json:"cash_amount"`
	WalletCurrency  string    `json:"wallet_currency"`
	WalletAmount    float64   `json:"wallet_amount"`
	ExchangeRate    float64   `json:"exchange_rate"`
	Fee             float64   `json:"fee"`
	AgentCommission float64   `json:"agent_commission"`
	PassportNumber  string    `json:"passport_number,omitempty"`
	PassportCountry string    `json:"passport_country,omitempty"`
	KYCTier         int       `json:"kyc_tier"`
	ReceiptCode     string    `json:"receipt_code"`
	CreatedAt       time.Time `json:"created_at"`
	CompletedAt     *time.Time `json:"completed_at,omitempty"`
}

type CashLoadQuote struct {
	CashCurrency    string  `json:"cash_currency"`
	CashAmount      float64 `json:"cash_amount"`
	WalletCurrency  string  `json:"wallet_currency"`
	WalletAmount    float64 `json:"wallet_amount"`
	ExchangeRate    float64 `json:"exchange_rate"`
	Fee             float64 `json:"fee"`
	FeePercent      float64 `json:"fee_percent"`
	AgentCommission float64 `json:"agent_commission"`
	KYCRequired     bool    `json:"kyc_required"`
	KYCTierNeeded   int     `json:"kyc_tier_needed"`
	DailyLimit      float64 `json:"daily_limit_remaining_usd"`
}

// ─── Fee Schedule ───────────────────────────────────────────────────────────

var agentFeeSchedule = map[string]float64{
	"USD": 1.5, "EUR": 1.5, "GBP": 1.5,
	"NGN": 1.0, "KES": 1.2, "GHS": 1.2, "ZAR": 1.2,
}

// KYC-tiered daily limits (USD equivalent)
var agentKYCLimits = map[int]float64{
	0: 0,     // unverified — no cash loading
	1: 500,   // passport scan only
	2: 2000,  // passport + selfie
	3: 10000, // full KYC (NIN/BVN for locals)
}

// ─── Service ────────────────────────────────────────────────────────────────

type AgentBankingService struct {
	mu     sync.RWMutex
	agents map[string]*Agent
	orders map[string]*CashLoadOrder
}

func NewAgentBankingService() *AgentBankingService {
	svc := &AgentBankingService{
		agents: make(map[string]*Agent),
		orders: make(map[string]*CashLoadOrder),
	}

	// Seed default agents (production: loaded from DB)
	svc.seedDefaultAgents()
	return svc
}

func (s *AgentBankingService) seedDefaultAgents() {
	defaults := []Agent{
		{ID: "AGT-MMIA-001", Name: "TourismPay Kiosk — MMIA Terminal 1", Tier: AgentTierKiosk, Location: "Murtala Muhammed International Airport, Lagos", Country: "NG", LicenseNumber: "CBN-BDC-2026-001", Status: "active", FloatBalances: map[string]float64{"NGN": 5000000, "USD": 10000, "EUR": 8000, "GBP": 6000}, DailyLimit: 50000, Commission: 0.3, CreatedAt: time.Now()},
		{ID: "AGT-MMIA-002", Name: "TourismPay Kiosk — MMIA Terminal 2", Tier: AgentTierKiosk, Location: "Murtala Muhammed International Airport, Lagos", Country: "NG", LicenseNumber: "CBN-BDC-2026-002", Status: "active", FloatBalances: map[string]float64{"NGN": 5000000, "USD": 10000, "EUR": 8000, "GBP": 6000}, DailyLimit: 50000, Commission: 0.3, CreatedAt: time.Now()},
		{ID: "AGT-NAI-001", Name: "TourismPay Kiosk — Nnamdi Azikiwe Airport", Tier: AgentTierKiosk, Location: "Nnamdi Azikiwe International Airport, Abuja", Country: "NG", LicenseNumber: "CBN-BDC-2026-003", Status: "active", FloatBalances: map[string]float64{"NGN": 3000000, "USD": 5000, "EUR": 4000}, DailyLimit: 30000, Commission: 0.3, CreatedAt: time.Now()},
		{ID: "AGT-CAL-001", Name: "Calabar Airport BDC", Tier: AgentTierBDC, Location: "Margaret Ekpo International Airport, Calabar", Country: "NG", LicenseNumber: "CBN-BDC-2026-004", Status: "active", FloatBalances: map[string]float64{"NGN": 2000000, "USD": 3000}, DailyLimit: 20000, Commission: 0.4, CreatedAt: time.Now()},
		{ID: "AGT-SER-001", Name: "Serena Safari Lodge Concierge", Tier: AgentTierHotel, Location: "Serena Safari Lodge, Nairobi", Country: "KE", LicenseNumber: "CBK-AGT-2026-001", Status: "active", FloatBalances: map[string]float64{"KES": 500000, "USD": 2000}, DailyLimit: 10000, Commission: 0.5, CreatedAt: time.Now()},
	}

	for i := range defaults {
		s.agents[defaults[i].ID] = &defaults[i]
	}
}

func generateReceiptCode() string {
	b := make([]byte, 6)
	rand.Read(b)
	return "TP-" + hex.EncodeToString(b)[:8]
}

// GetQuote returns a cash-to-wallet conversion quote
func (s *AgentBankingService) GetQuote(agentID, cashCurrency, walletCurrency string, cashAmount float64, currentKYCTier int) (*CashLoadQuote, error) {
	s.mu.RLock()
	agent, ok := s.agents[agentID]
	s.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("agent not found: %s", agentID)
	}
	if agent.Status != "active" {
		return nil, fmt.Errorf("agent %s is %s", agentID, agent.Status)
	}

	// Calculate USD equivalent for limit checks
	usdEquiv := cashAmount * getWireFXRate(cashCurrency, "USD")

	// Determine KYC tier needed
	kycNeeded := 1
	if usdEquiv > 500 {
		kycNeeded = 2
	}
	if usdEquiv > 2000 {
		kycNeeded = 3
	}

	// Check agent daily limit
	remaining := agent.DailyLimit - agent.DailyUsed

	// Fee calculation
	feePercent, ok := agentFeeSchedule[cashCurrency]
	if !ok {
		feePercent = 2.0 // default
	}
	fee := cashAmount * feePercent / 100
	agentComm := fee * agent.Commission / 100

	// FX conversion
	rate := getWireFXRate(cashCurrency, walletCurrency)
	if rate == 0 {
		return nil, fmt.Errorf("unsupported conversion: %s → %s", cashCurrency, walletCurrency)
	}
	walletAmount := (cashAmount - fee) * rate

	return &CashLoadQuote{
		CashCurrency:    cashCurrency,
		CashAmount:      cashAmount,
		WalletCurrency:  walletCurrency,
		WalletAmount:    walletAmount,
		ExchangeRate:    rate,
		Fee:             fee,
		FeePercent:      feePercent,
		AgentCommission: agentComm,
		KYCRequired:     currentKYCTier < kycNeeded,
		KYCTierNeeded:   kycNeeded,
		DailyLimit:      remaining,
	}, nil
}

// ExecuteLoad processes a cash-to-wallet load after KYC verification
func (s *AgentBankingService) ExecuteLoad(agentID, touristUserID, cashCurrency, walletCurrency, passportNumber, passportCountry string, cashAmount float64, kycTier int) (*CashLoadOrder, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	agent, ok := s.agents[agentID]
	if !ok {
		return nil, fmt.Errorf("agent not found: %s", agentID)
	}

	// Check daily limits
	usdEquiv := cashAmount * getWireFXRate(cashCurrency, "USD")
	maxAllowed := agentKYCLimits[kycTier]
	if usdEquiv > maxAllowed {
		return nil, fmt.Errorf("amount $%.2f exceeds KYC tier %d limit $%.2f", usdEquiv, kycTier, maxAllowed)
	}
	if agent.DailyUsed+usdEquiv > agent.DailyLimit {
		return nil, fmt.Errorf("agent daily limit exceeded (used: $%.2f, limit: $%.2f)", agent.DailyUsed, agent.DailyLimit)
	}

	// Check agent float
	if agent.FloatBalances[cashCurrency] < cashAmount {
		return nil, fmt.Errorf("insufficient agent float for %s (available: %.2f, needed: %.2f)", cashCurrency, agent.FloatBalances[cashCurrency], cashAmount)
	}

	// Calculate wallet credit
	feePercent, _ := agentFeeSchedule[cashCurrency]
	if feePercent == 0 {
		feePercent = 2.0
	}
	fee := cashAmount * feePercent / 100
	agentComm := fee * agent.Commission / 100
	rate := getWireFXRate(cashCurrency, walletCurrency)
	walletAmount := (cashAmount - fee) * rate

	orderID := generateReceiptCode()
	now := time.Now().UTC()

	order := &CashLoadOrder{
		ID:              orderID,
		AgentID:         agentID,
		TouristUserID:   touristUserID,
		Status:          "loaded",
		CashCurrency:    cashCurrency,
		CashAmount:      cashAmount,
		WalletCurrency:  walletCurrency,
		WalletAmount:    walletAmount,
		ExchangeRate:    rate,
		Fee:             fee,
		AgentCommission: agentComm,
		PassportNumber:  passportNumber,
		PassportCountry: passportCountry,
		KYCTier:         kycTier,
		ReceiptCode:     orderID,
		CreatedAt:       now,
		CompletedAt:     &now,
	}

	s.orders[orderID] = order

	// Persist to PostgreSQL
	if database.DB != nil {
		database.DB.Exec(
			"INSERT INTO agent_transactions (id, agent_id, customer_id, transaction_type, amount, currency, commission, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
			orderID, agentID, touristUserID, "cash_load", cashAmount, cashCurrency, agentComm, "completed",
		)
	}

	// Deduct from agent float
	agent.FloatBalances[cashCurrency] -= cashAmount
	agent.DailyUsed += usdEquiv

	// Update metrics
	agentLoadsTotal.WithLabelValues("loaded", cashCurrency).Inc()
	agentVolumeUSD.Add(usdEquiv)
	agentFloatBalance.WithLabelValues(agentID, cashCurrency).Set(agent.FloatBalances[cashCurrency])
	agentKYCVerifications.WithLabelValues(fmt.Sprintf("tier_%d", kycTier), "verified").Inc()

	return order, nil
}

// ListAgents returns all agents, optionally filtered by country
func (s *AgentBankingService) ListAgents(country string) []*Agent {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*Agent
	for _, a := range s.agents {
		if country == "" || a.Country == country {
			result = append(result, a)
		}
	}
	return result
}

// GetAgent returns an agent by ID
func (s *AgentBankingService) GetAgent(agentID string) (*Agent, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	agent, ok := s.agents[agentID]
	if !ok {
		return nil, fmt.Errorf("agent not found: %s", agentID)
	}
	return agent, nil
}

// GetOrder returns a cash load order by ID
func (s *AgentBankingService) GetOrder(orderID string) (*CashLoadOrder, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	order, ok := s.orders[orderID]
	if !ok {
		return nil, fmt.Errorf("order not found: %s", orderID)
	}
	return order, nil
}

// ListOrders returns all orders for a tourist
func (s *AgentBankingService) ListOrders(touristUserID string) []*CashLoadOrder {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*CashLoadOrder
	for _, o := range s.orders {
		if o.TouristUserID == touristUserID {
			result = append(result, o)
		}
	}
	return result
}

// RefundFloat refunds agent float when an order is reversed
func (s *AgentBankingService) RefundFloat(orderID string) (*CashLoadOrder, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	order, ok := s.orders[orderID]
	if !ok {
		return nil, fmt.Errorf("order not found: %s", orderID)
	}
	if order.Status != "loaded" {
		return nil, fmt.Errorf("order cannot be reversed (current: %s)", order.Status)
	}

	agent, ok := s.agents[order.AgentID]
	if ok {
		agent.FloatBalances[order.CashCurrency] += order.CashAmount
		usdEquiv := order.CashAmount * getWireFXRate(order.CashCurrency, "USD")
		agent.DailyUsed -= usdEquiv
	}

	order.Status = "reversed"
	agentLoadsTotal.WithLabelValues("reversed", order.CashCurrency).Inc()

	return order, nil
}
