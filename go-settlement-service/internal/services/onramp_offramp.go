package services

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/tourismpay/settlement-service/internal/database"
)

// ─── Prometheus Metrics ────────────────────────────────────────────────────────

var (
	onrampOrdersTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "tourismpay_onramp_orders_total",
		Help: "Total on-ramp orders by status, rail, and stablecoin",
	}, []string{"status", "rail", "stablecoin"})

	offrampRequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "tourismpay_offramp_requests_total",
		Help: "Total off-ramp requests by status, rail, and currency",
	}, []string{"status", "rail", "currency"})

	onrampVolumeUSD = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "tourismpay_onramp_volume_usd_total",
		Help: "Total on-ramp volume in USD by rail",
	}, []string{"rail"})

	offrampVolumeUSD = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "tourismpay_offramp_volume_usd_total",
		Help: "Total off-ramp volume in USD by rail",
	}, []string{"rail"})

	rampLatency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "tourismpay_ramp_duration_seconds",
		Help:    "On/off-ramp processing duration",
		Buckets: []float64{0.1, 0.5, 1, 2, 5, 10, 30, 60, 300},
	}, []string{"direction", "rail"})

	rampFeeCollected = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "tourismpay_ramp_fees_usd_total",
		Help: "Total fees collected from on/off-ramp",
	}, []string{"direction", "rail"})

	velocityLimitHits = promauto.NewCounter(prometheus.CounterOpts{
		Name: "tourismpay_offramp_velocity_limit_hits_total",
		Help: "Number of times off-ramp velocity limit was hit",
	})

	yieldPositionsActive = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "tourismpay_yield_positions_active",
		Help: "Current number of active yield positions",
	})

	yieldTotalDeposited = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "tourismpay_yield_total_deposited_usd",
		Help: "Total USD deposited in yield positions",
	})
)

// ─── Types ─────────────────────────────────────────────────────────────────────

type PaymentRail string

const (
	RailStripeCard   PaymentRail = "stripe_card"
	RailBankTransfer PaymentRail = "bank_transfer"
	RailMpesa        PaymentRail = "mpesa"
	RailMTNMomo      PaymentRail = "mtn_momo"
	RailOrangeMoney  PaymentRail = "orange_money"
	RailAirtelMoney  PaymentRail = "airtel_money"
	RailVodacomMpesa PaymentRail = "vodacom_mpesa"
	RailOpay         PaymentRail = "opay"
	RailFlutterwave  PaymentRail = "flutterwave"
	RailChipperCash  PaymentRail = "chipper_cash"
	RailMojaloop     PaymentRail = "mojaloop"
	RailCBDCBridge   PaymentRail = "cbdc_bridge"
)

type OnrampOrder struct {
	ID               string      `json:"id"`
	UserID           string      `json:"user_id"`
	Status           string      `json:"status"`
	SourceCurrency   string      `json:"source_currency"`
	SourceAmount     float64     `json:"source_amount"`
	PaymentRail      PaymentRail `json:"payment_rail"`
	PaymentRef       string      `json:"payment_ref,omitempty"`
	TargetStablecoin string      `json:"target_stablecoin"`
	TargetAmount     float64     `json:"target_amount"`
	ExchangeRate     float64     `json:"exchange_rate"`
	Fee              float64     `json:"fee"`
	FeePercent       float64     `json:"fee_percent"`
	MintTxHash       string      `json:"mint_tx_hash,omitempty"`
	Country          string      `json:"country,omitempty"`
	MobileNumber     string      `json:"mobile_number,omitempty"`
	KYCVerified      bool        `json:"kyc_verified"`
	CreatedAt        time.Time   `json:"created_at"`
	CompletedAt      *time.Time  `json:"completed_at,omitempty"`
}

type OfframpRequest struct {
	ID                string      `json:"id"`
	UserID            string      `json:"user_id"`
	Status            string      `json:"status"`
	SourceStablecoin  string      `json:"source_stablecoin"`
	SourceAmount      float64     `json:"source_amount"`
	BurnTxHash        string      `json:"burn_tx_hash,omitempty"`
	TargetCurrency    string      `json:"target_currency"`
	TargetAmount      float64     `json:"target_amount"`
	PayoutRail        PaymentRail `json:"payout_rail"`
	PayoutRef         string      `json:"payout_ref,omitempty"`
	RecipientName     string      `json:"recipient_name"`
	RecipientPhone    string      `json:"recipient_phone,omitempty"`
	RecipientBank     string      `json:"recipient_bank,omitempty"`
	RecipientAccount  string      `json:"recipient_account,omitempty"`
	RecipientCountry  string      `json:"recipient_country,omitempty"`
	ExchangeRate      float64     `json:"exchange_rate"`
	Fee               float64     `json:"fee"`
	FraudScore        float64     `json:"fraud_score"`
	VelocityPassed    bool        `json:"velocity_passed"`
	KYCVerified       bool        `json:"kyc_verified"`
	CreatedAt         time.Time   `json:"created_at"`
	CompletedAt       *time.Time  `json:"completed_at,omitempty"`
}

type RampQuote struct {
	Direction      string  `json:"direction"` // "onramp" or "offramp"
	SourceAmount   float64 `json:"source_amount"`
	SourceCurrency string  `json:"source_currency"`
	TargetAmount   float64 `json:"target_amount"`
	TargetCurrency string  `json:"target_currency"`
	ExchangeRate   float64 `json:"exchange_rate"`
	Fee            float64 `json:"fee"`
	FeePercent     float64 `json:"fee_percent"`
	Rail           string  `json:"rail"`
	EstimatedTime  string  `json:"estimated_time"`
	ExpiresAt      string  `json:"expires_at"`
}

// ─── Fee Schedule ──────────────────────────────────────────────────────────────

type FeeTier struct {
	Percent float64
	Min     float64
	Max     float64
}

var onrampFees = map[PaymentRail]FeeTier{
	RailStripeCard:   {2.5, 0.50, 50},
	RailBankTransfer: {0.5, 0.10, 25},
	RailMpesa:        {1.0, 0.05, 15},
	RailMTNMomo:      {1.0, 0.05, 15},
	RailOrangeMoney:  {1.2, 0.05, 15},
	RailAirtelMoney:  {1.0, 0.05, 15},
	RailVodacomMpesa: {1.0, 0.05, 15},
	RailOpay:         {0.8, 0.05, 20},
	RailFlutterwave:  {1.4, 0.10, 25},
	RailChipperCash:  {1.0, 0.05, 15},
	RailMojaloop:     {0.3, 0.02, 10},
	RailCBDCBridge:   {0.1, 0.01, 5},
}

var offrampFees = map[PaymentRail]FeeTier{
	RailBankTransfer: {0.8, 0.25, 30},
	RailMpesa:        {1.2, 0.10, 20},
	RailMTNMomo:      {1.2, 0.10, 20},
	RailOrangeMoney:  {1.5, 0.10, 20},
	RailAirtelMoney:  {1.2, 0.10, 20},
	RailVodacomMpesa: {1.2, 0.10, 20},
	RailOpay:         {1.0, 0.10, 25},
	RailFlutterwave:  {1.5, 0.15, 30},
	RailChipperCash:  {1.0, 0.10, 20},
	RailMojaloop:     {0.4, 0.05, 10},
	RailCBDCBridge:   {0.15, 0.02, 5},
	RailStripeCard:   {2.0, 0.50, 50},
}

// FX rates: currency → USD
var fiatToUSD = map[string]float64{
	"USD": 1.0, "EUR": 1.09, "GBP": 1.27,
	"NGN": 0.00065, "KES": 0.0077, "GHS": 0.067, "ZAR": 0.054,
	"TZS": 0.00039, "UGX": 0.00027, "XOF": 0.0016, "XAF": 0.0016,
	"USDC": 1.0, "USDT": 1.0, "DAI": 1.0,
	"CBDC-NG": 0.00065, "CBDC-KE": 0.0077, "CBDC-GH": 0.067,
}

// Rail → supported countries
var railCountries = map[PaymentRail][]string{
	RailMpesa:        {"KE", "TZ"},
	RailMTNMomo:      {"GH", "UG", "CM", "CI", "RW"},
	RailOrangeMoney:  {"SN", "ML", "CI", "CM"},
	RailAirtelMoney:  {"ZM", "UG", "TZ", "KE"},
	RailVodacomMpesa: {"CD", "TZ", "MZ"},
	RailOpay:         {"NG"},
	RailFlutterwave:  {"NG", "KE", "GH", "ZA", "TZ", "UG"},
	RailChipperCash:  {"NG", "KE", "GH", "ZA", "TZ", "UG", "RW"},
	RailBankTransfer: {"NG", "KE", "GH", "ZA", "TZ", "UG", "US", "GB"},
	RailStripeCard:   {"US", "GB", "NG", "KE", "GH", "ZA"},
	RailMojaloop:     {"NG", "KE", "GH", "ZA", "TZ", "UG"},
	RailCBDCBridge:   {"NG", "GH"},
}

// ─── Service ───────────────────────────────────────────────────────────────────

type OnrampOfframpService struct {
	mu            sync.RWMutex
	dailyVolume   map[string]float64 // userID → USD volume today (resets daily)
	cryptoService *CryptoService
	cbdcBridge    *CBDCBridge
}

func NewOnrampOfframpService(crypto *CryptoService, cbdc *CBDCBridge) *OnrampOfframpService {
	return &OnrampOfframpService{
		dailyVolume:   make(map[string]float64),
		cryptoService: crypto,
		cbdcBridge:    cbdc,
	}
}

func (s *OnrampOfframpService) generateID(prefix string) string {
	b := make([]byte, 12)
	rand.Read(b)
	return fmt.Sprintf("%s-%s", prefix, hex.EncodeToString(b))
}

func calculateRampFee(amountUSD float64, rail PaymentRail, fees map[PaymentRail]FeeTier) (float64, float64) {
	tier, ok := fees[rail]
	if !ok {
		tier = FeeTier{2.0, 0.50, 50}
	}
	raw := amountUSD * (tier.Percent / 100)
	fee := math.Max(tier.Min, math.Min(raw, tier.Max))
	return fee, tier.Percent
}

func getRate(from, to string) float64 {
	fromUSD := fiatToUSD[from]
	toUSD := fiatToUSD[to]
	if fromUSD == 0 || toUSD == 0 {
		return 1.0
	}
	return fromUSD / toUSD
}

// ─── On-Ramp ───────────────────────────────────────────────────────────────────

type OnrampRequest struct {
	UserID           string      `json:"user_id" binding:"required"`
	SourceCurrency   string      `json:"source_currency" binding:"required"`
	SourceAmount     float64     `json:"source_amount" binding:"required"`
	TargetStablecoin string      `json:"target_stablecoin"`
	PaymentRail      PaymentRail `json:"payment_rail" binding:"required"`
	Country          string      `json:"country"`
	MobileNumber     string      `json:"mobile_number"`
}

func (s *OnrampOfframpService) GetOnrampQuote(req OnrampRequest) *RampQuote {
	if req.TargetStablecoin == "" {
		req.TargetStablecoin = "USDC"
	}

	rate := getRate(req.SourceCurrency, req.TargetStablecoin)
	amountUSD := req.SourceAmount * fiatToUSD[req.SourceCurrency]
	fee, feePct := calculateRampFee(amountUSD, req.PaymentRail, onrampFees)
	spread := 0.003
	effectiveRate := rate * (1 - spread)
	feeInSource := fee / fiatToUSD[req.SourceCurrency]
	targetAmount := (req.SourceAmount - feeInSource) * effectiveRate

	estimated := "~10 min"
	switch req.PaymentRail {
	case RailStripeCard:
		estimated = "~2 min"
	case RailMpesa, RailMTNMomo:
		estimated = "~5 min"
	case RailBankTransfer:
		estimated = "1-3 business days"
	case RailCBDCBridge:
		estimated = "~30 sec"
	}

	return &RampQuote{
		Direction:      "onramp",
		SourceAmount:   req.SourceAmount,
		SourceCurrency: req.SourceCurrency,
		TargetAmount:   math.Round(targetAmount*1e6) / 1e6,
		TargetCurrency: req.TargetStablecoin,
		ExchangeRate:   effectiveRate,
		Fee:            fee,
		FeePercent:     feePct,
		Rail:           string(req.PaymentRail),
		EstimatedTime:  estimated,
		ExpiresAt:      time.Now().Add(5 * time.Minute).Format(time.RFC3339),
	}
}

func (s *OnrampOfframpService) ExecuteOnramp(req OnrampRequest) (*OnrampOrder, error) {
	start := time.Now()
	defer func() {
		rampLatency.WithLabelValues("onramp", string(req.PaymentRail)).Observe(time.Since(start).Seconds())
	}()

	if req.TargetStablecoin == "" {
		req.TargetStablecoin = "USDC"
	}
	if req.SourceAmount <= 0 || req.SourceAmount > 50000 {
		return nil, fmt.Errorf("amount must be between 0 and 50,000")
	}

	rate := getRate(req.SourceCurrency, req.TargetStablecoin)
	amountUSD := req.SourceAmount * fiatToUSD[req.SourceCurrency]
	fee, feePct := calculateRampFee(amountUSD, req.PaymentRail, onrampFees)
	effectiveRate := rate * 0.997
	feeInSource := fee / fiatToUSD[req.SourceCurrency]
	targetAmount := (req.SourceAmount - feeInSource) * effectiveRate

	// Generate mint transaction hash
	txData := fmt.Sprintf("mint:%s:%s:%f:%d", req.UserID, req.TargetStablecoin, targetAmount, time.Now().UnixNano())
	txHash := sha256.Sum256([]byte(txData))
	mintTxHash := "0x" + hex.EncodeToString(txHash[:])

	s.mu.Lock()
	order := &OnrampOrder{
		ID:               s.generateID("ONR"),
		UserID:           req.UserID,
		Status:           "completed",
		SourceCurrency:   req.SourceCurrency,
		SourceAmount:     req.SourceAmount,
		PaymentRail:      req.PaymentRail,
		PaymentRef:       fmt.Sprintf("PAY-%s", hex.EncodeToString(txHash[:8])),
		TargetStablecoin: req.TargetStablecoin,
		TargetAmount:     math.Round(targetAmount*1e6) / 1e6,
		ExchangeRate:     effectiveRate,
		Fee:              fee,
		FeePercent:       feePct,
		MintTxHash:       mintTxHash,
		Country:          req.Country,
		MobileNumber:     req.MobileNumber,
		KYCVerified:      true,
		CreatedAt:        time.Now(),
	}
	now := time.Now()
	order.CompletedAt = &now
	s.mu.Unlock()

	// Persist to PostgreSQL
	database.DB.Exec(
		"INSERT INTO onramp_offramp_transactions (id, user_id, direction, rail, fiat_amount, fiat_currency, crypto_amount, crypto_token, fee, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
		order.ID, req.UserID, "onramp", string(req.PaymentRail), req.SourceAmount, req.SourceCurrency, targetAmount, req.TargetStablecoin, fee, "completed",
	)

	// Credit stablecoin to user's crypto wallet
	wallet := s.cryptoService.GetWalletByUser(req.UserID)
	if wallet == nil {
		wallet = s.cryptoService.CreateWallet(req.UserID)
	}
	s.cryptoService.SimulateDeposit(wallet.WalletID, req.TargetStablecoin, targetAmount)

	// Prometheus metrics
	onrampOrdersTotal.WithLabelValues("completed", string(req.PaymentRail), req.TargetStablecoin).Inc()
	onrampVolumeUSD.WithLabelValues(string(req.PaymentRail)).Add(amountUSD)
	rampFeeCollected.WithLabelValues("onramp", string(req.PaymentRail)).Add(fee)

	return order, nil
}

// ─── Off-Ramp ──────────────────────────────────────────────────────────────────

type OfframpReq struct {
	UserID           string      `json:"user_id" binding:"required"`
	SourceStablecoin string      `json:"source_stablecoin"`
	SourceAmount     float64     `json:"source_amount" binding:"required"`
	TargetCurrency   string      `json:"target_currency" binding:"required"`
	PayoutRail       PaymentRail `json:"payout_rail" binding:"required"`
	RecipientName    string      `json:"recipient_name" binding:"required"`
	RecipientPhone   string      `json:"recipient_phone"`
	RecipientBank    string      `json:"recipient_bank"`
	RecipientAccount string      `json:"recipient_account"`
	RecipientCountry string      `json:"recipient_country"`
}

func (s *OnrampOfframpService) GetOfframpQuote(req OfframpReq) *RampQuote {
	if req.SourceStablecoin == "" {
		req.SourceStablecoin = "USDC"
	}

	rate := getRate(req.SourceStablecoin, req.TargetCurrency)
	amountUSD := req.SourceAmount * fiatToUSD[req.SourceStablecoin]
	fee, feePct := calculateRampFee(amountUSD, req.PayoutRail, offrampFees)
	spread := 0.004
	effectiveRate := rate * (1 - spread)
	feeInStable := fee / fiatToUSD[req.SourceStablecoin]
	targetAmount := (req.SourceAmount - feeInStable) * effectiveRate

	estimated := "~15 min"
	switch req.PayoutRail {
	case RailMpesa, RailMTNMomo:
		estimated = "~5 min"
	case RailBankTransfer:
		estimated = "1-3 business days"
	case RailCBDCBridge:
		estimated = "~30 sec"
	}

	return &RampQuote{
		Direction:      "offramp",
		SourceAmount:   req.SourceAmount,
		SourceCurrency: req.SourceStablecoin,
		TargetAmount:   math.Round(targetAmount*100) / 100,
		TargetCurrency: req.TargetCurrency,
		ExchangeRate:   effectiveRate,
		Fee:            fee,
		FeePercent:     feePct,
		Rail:           string(req.PayoutRail),
		EstimatedTime:  estimated,
		ExpiresAt:      time.Now().Add(5 * time.Minute).Format(time.RFC3339),
	}
}

func (s *OnrampOfframpService) ExecuteOfframp(req OfframpReq) (*OfframpRequest, error) {
	start := time.Now()
	defer func() {
		rampLatency.WithLabelValues("offramp", string(req.PayoutRail)).Observe(time.Since(start).Seconds())
	}()

	if req.SourceStablecoin == "" {
		req.SourceStablecoin = "USDC"
	}
	if req.SourceAmount <= 0 || req.SourceAmount > 50000 {
		return nil, fmt.Errorf("amount must be between 0 and 50,000")
	}

	amountUSD := req.SourceAmount * fiatToUSD[req.SourceStablecoin]

	// Velocity check: max $5000 per day per user
	s.mu.RLock()
	dailyVol := s.dailyVolume[req.UserID]
	s.mu.RUnlock()
	if dailyVol+amountUSD > 5000 {
		velocityLimitHits.Inc()
		offrampRequestsTotal.WithLabelValues("rejected_velocity", string(req.PayoutRail), req.TargetCurrency).Inc()
		return nil, fmt.Errorf("daily off-ramp limit exceeded: used $%.2f of $5,000", dailyVol)
	}

	// Check stablecoin balance
	wallet := s.cryptoService.GetWalletByUser(req.UserID)
	if wallet == nil {
		return nil, fmt.Errorf("wallet not found for user %s", req.UserID)
	}
	if wallet.Balances[req.SourceStablecoin] < req.SourceAmount {
		return nil, fmt.Errorf("insufficient %s balance: have %.2f, need %.2f",
			req.SourceStablecoin, wallet.Balances[req.SourceStablecoin], req.SourceAmount)
	}

	rate := getRate(req.SourceStablecoin, req.TargetCurrency)
	fee, _ := calculateRampFee(amountUSD, req.PayoutRail, offrampFees)
	effectiveRate := rate * 0.996
	feeInStable := fee / fiatToUSD[req.SourceStablecoin]
	targetAmount := math.Round((req.SourceAmount-feeInStable)*effectiveRate*100) / 100

	// Burn stablecoin
	burnResult := s.cryptoService.Withdraw(wallet.WalletID, req.SourceStablecoin,
		"0x0000000000000000000000000000000000000000", req.SourceAmount-fiatToUSD[req.SourceStablecoin]*fee)

	burnTxHash := "0x0"
	if burnResult.Success {
		burnTxHash = burnResult.BlockchainTxn
	}

	s.mu.Lock()
	offramp := &OfframpRequest{
		ID:               s.generateID("OFR"),
		UserID:           req.UserID,
		Status:           "completed",
		SourceStablecoin: req.SourceStablecoin,
		SourceAmount:     req.SourceAmount,
		BurnTxHash:       burnTxHash,
		TargetCurrency:   req.TargetCurrency,
		TargetAmount:     targetAmount,
		PayoutRail:       req.PayoutRail,
		PayoutRef:        fmt.Sprintf("PAYOUT-%s", s.generateID("P")),
		RecipientName:    req.RecipientName,
		RecipientPhone:   req.RecipientPhone,
		RecipientBank:    req.RecipientBank,
		RecipientAccount: req.RecipientAccount,
		RecipientCountry: req.RecipientCountry,
		ExchangeRate:     effectiveRate,
		Fee:              fee,
		FraudScore:       0.12,
		VelocityPassed:   true,
		KYCVerified:      true,
		CreatedAt:        time.Now(),
	}
	now := time.Now()
	offramp.CompletedAt = &now
	// Persist to PostgreSQL
	database.DB.Exec(
		"INSERT INTO onramp_offramp_transactions (id, user_id, direction, rail, fiat_amount, fiat_currency, crypto_amount, crypto_token, fee, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
		offramp.ID, req.UserID, "offramp", string(req.PayoutRail), targetAmount, req.TargetCurrency, req.SourceAmount, req.SourceStablecoin, fee, "completed",
	)
	s.dailyVolume[req.UserID] += amountUSD
	s.mu.Unlock()

	// Prometheus metrics
	offrampRequestsTotal.WithLabelValues("completed", string(req.PayoutRail), req.TargetCurrency).Inc()
	offrampVolumeUSD.WithLabelValues(string(req.PayoutRail)).Add(amountUSD)
	rampFeeCollected.WithLabelValues("offramp", string(req.PayoutRail)).Add(fee)

	return offramp, nil
}

// ─── Rate Routing ──────────────────────────────────────────────────────────────

type RailOption struct {
	Rail       PaymentRail `json:"rail"`
	Fee        float64     `json:"fee"`
	FeePercent float64     `json:"fee_percent"`
	Countries  []string    `json:"countries"`
}

func (s *OnrampOfframpService) FindBestRail(country string, amountUSD float64, direction string) []RailOption {
	fees := onrampFees
	if direction == "offramp" {
		fees = offrampFees
	}

	var options []RailOption
	for rail, countries := range railCountries {
		for _, c := range countries {
			if c == country {
				fee, feePct := calculateRampFee(amountUSD, rail, fees)
				options = append(options, RailOption{
					Rail:       rail,
					Fee:        fee,
					FeePercent: feePct,
					Countries:  countries,
				})
				break
			}
		}
	}

	// Sort by fee (ascending)
	for i := 0; i < len(options); i++ {
		for j := i + 1; j < len(options); j++ {
			if options[j].Fee < options[i].Fee {
				options[i], options[j] = options[j], options[i]
			}
		}
	}
	return options
}

// ─── Status ────────────────────────────────────────────────────────────────────

type RampStatus struct {
	Service        string   `json:"service"`
	Status         string   `json:"status"`
	OnrampCount    int      `json:"onramp_count"`
	OfframpCount   int      `json:"offramp_count"`
	SupportedRails []string `json:"supported_rails"`
	SupportedCoins []string `json:"supported_stablecoins"`
}

func (s *OnrampOfframpService) GetStatus() RampStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rails := make([]string, 0, len(railCountries))
	for r := range railCountries {
		rails = append(rails, string(r))
	}

	return RampStatus{
		Service:        "Stablecoin On-Ramp/Off-Ramp Service (Go)",
		Status:         "OPERATIONAL",
		OnrampCount:    s.countRampTxns("onramp"),
		OfframpCount:   s.countRampTxns("offramp"),
		SupportedRails: rails,
		SupportedCoins: []string{"USDC", "USDT", "DAI", "CBDC-NG", "CBDC-KE", "CBDC-GH"},
	}
}

func (s *OnrampOfframpService) countRampTxns(direction string) int {
	if database.DB == nil {
		return 0
	}
	var count int
	database.DB.QueryRow("SELECT COUNT(*) FROM onramp_offramp_transactions WHERE direction=$1", direction).Scan(&count)
	return count
}

func (s *OnrampOfframpService) GetOnrampOrder(id string) *OnrampOrder {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if database.DB != nil {
		o := &OnrampOrder{}
		err := database.DB.QueryRow(
			"SELECT id, user_id, fiat_amount, fiat_currency, crypto_amount, crypto_token, fee, status, created_at FROM onramp_offramp_transactions WHERE id=$1 AND direction='onramp'",
			id,
		).Scan(&o.ID, &o.UserID, &o.SourceAmount, &o.SourceCurrency, &o.TargetAmount, &o.TargetStablecoin, &o.Fee, &o.Status, &o.CreatedAt)
		if err == nil {
			return o
		}
	}
	return nil
}

func (s *OnrampOfframpService) GetOfframpRequest(id string) *OfframpRequest {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if database.DB != nil {
		o := &OfframpRequest{}
		err := database.DB.QueryRow(
			"SELECT id, user_id, crypto_amount, crypto_token, fiat_amount, fiat_currency, fee, status, created_at FROM onramp_offramp_transactions WHERE id=$1 AND direction='offramp'",
			id,
		).Scan(&o.ID, &o.UserID, &o.SourceAmount, &o.SourceStablecoin, &o.TargetAmount, &o.TargetCurrency, &o.Fee, &o.Status, &o.CreatedAt)
		if err == nil {
			return o
		}
	}
	return nil
}

func (s *OnrampOfframpService) ListOnrampOrders(userID string) []*OnrampOrder {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*OnrampOrder
	if database.DB != nil {
		rows, err := database.DB.Query(
			"SELECT id, user_id, fiat_amount, fiat_currency, crypto_amount, crypto_token, fee, status, created_at FROM onramp_offramp_transactions WHERE user_id=$1 AND direction='onramp' ORDER BY created_at DESC",
			userID,
		)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				o := &OnrampOrder{}
				rows.Scan(&o.ID, &o.UserID, &o.SourceAmount, &o.SourceCurrency, &o.TargetAmount, &o.TargetStablecoin, &o.Fee, &o.Status, &o.CreatedAt)
				result = append(result, o)
			}
		}
	}
	return result
}

func (s *OnrampOfframpService) ListOfframpRequests(userID string) []*OfframpRequest {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*OfframpRequest
	if database.DB != nil {
		rows, err := database.DB.Query(
			"SELECT id, user_id, crypto_amount, crypto_token, fiat_amount, fiat_currency, fee, status, created_at FROM onramp_offramp_transactions WHERE user_id=$1 AND direction='offramp' ORDER BY created_at DESC",
			userID,
		)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				o := &OfframpRequest{}
				rows.Scan(&o.ID, &o.UserID, &o.SourceAmount, &o.SourceStablecoin, &o.TargetAmount, &o.TargetCurrency, &o.Fee, &o.Status, &o.CreatedAt)
				result = append(result, o)
			}
		}
	}
	return result
}
