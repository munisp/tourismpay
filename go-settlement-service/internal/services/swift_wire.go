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
	swiftTransfersTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "tourismpay_swift_transfers_total",
		Help: "Total SWIFT/SEPA/ACH wire transfers by status and rail",
	}, []string{"status", "rail"})

	swiftVolumeUSD = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "tourismpay_swift_volume_usd_total",
		Help: "Total SWIFT wire volume in USD by rail",
	}, []string{"rail"})

	swiftLatency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "tourismpay_swift_duration_seconds",
		Help:    "Wire transfer processing duration",
		Buckets: []float64{1, 5, 30, 60, 300, 600, 3600, 86400},
	}, []string{"rail"})

	swiftFeesCollected = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "tourismpay_swift_fees_usd_total",
		Help: "Total fees collected from wire transfers",
	}, []string{"rail"})
)

// ─── Types ──────────────────────────────────────────────────────────────────

type WireRail string

const (
	WireRailSWIFT        WireRail = "swift_gpi"
	WireRailSEPA         WireRail = "sepa_instant"
	WireRailACH          WireRail = "ach_us"
	WireRailFasterPayUK  WireRail = "faster_pay_uk"
	WireRailIMTO         WireRail = "imto_partner"
)

type WireTransferOrder struct {
	ID                string    `json:"id"`
	UserID            string    `json:"user_id"`
	Status            string    `json:"status"` // pending_collection, collecting, settled, credited, failed, expired
	SourceCurrency    string    `json:"source_currency"`
	SourceAmount      float64   `json:"source_amount"`
	TargetCurrency    string    `json:"target_currency"`
	TargetAmount      float64   `json:"target_amount"`
	WireRail          WireRail  `json:"wire_rail"`
	CollectionRef     string    `json:"collection_ref"`
	SWIFTRef          string    `json:"swift_ref,omitempty"`
	SenderName        string    `json:"sender_name"`
	SenderIBAN        string    `json:"sender_iban,omitempty"`
	SenderBIC         string    `json:"sender_bic,omitempty"`
	SenderRoutingNum  string    `json:"sender_routing_number,omitempty"`
	SenderAccountNum  string    `json:"sender_account_number,omitempty"`
	SenderCountry     string    `json:"sender_country"`
	RecipientWalletID string    `json:"recipient_wallet_id"`
	ExchangeRate      float64   `json:"exchange_rate"`
	Fee               float64   `json:"fee"`
	FeePercent        float64   `json:"fee_percent"`
	TravelRuleData    *TravelRulePayload `json:"travel_rule_data,omitempty"`
	KYCTier           int       `json:"kyc_tier"`
	FraudScore        float64   `json:"fraud_score"`
	CreatedAt         time.Time `json:"created_at"`
	SettledAt         *time.Time `json:"settled_at,omitempty"`
	CreditedAt        *time.Time `json:"credited_at,omitempty"`
	ExpiresAt         time.Time `json:"expires_at"`
}

type TravelRulePayload struct {
	OriginatorName     string `json:"originator_name"`
	OriginatorAccount  string `json:"originator_account"`
	OriginatorAddress  string `json:"originator_address,omitempty"`
	OriginatorCountry  string `json:"originator_country"`
	BeneficiaryName    string `json:"beneficiary_name"`
	BeneficiaryAccount string `json:"beneficiary_account"`
	Purpose            string `json:"purpose"`
}

type WireQuote struct {
	SourceCurrency string   `json:"source_currency"`
	SourceAmount   float64  `json:"source_amount"`
	TargetCurrency string   `json:"target_currency"`
	TargetAmount   float64  `json:"target_amount"`
	ExchangeRate   float64  `json:"exchange_rate"`
	Fee            float64  `json:"fee"`
	FeePercent     float64  `json:"fee_percent"`
	Rail           WireRail `json:"rail"`
	EstimatedTime  string   `json:"estimated_time"`
	CollectionInstructions CollectionInstructions `json:"collection_instructions"`
	ExpiresAt      string   `json:"expires_at"`
}

type CollectionInstructions struct {
	Method        string `json:"method"` // "iban", "account_routing", "sort_code"
	BankName      string `json:"bank_name"`
	AccountName   string `json:"account_name"`
	IBAN          string `json:"iban,omitempty"`
	BIC           string `json:"bic,omitempty"`
	AccountNumber string `json:"account_number,omitempty"`
	RoutingNumber string `json:"routing_number,omitempty"`
	SortCode      string `json:"sort_code,omitempty"`
	Reference     string `json:"reference"`
	Memo          string `json:"memo,omitempty"`
}

// ─── Fee Schedule ──────────────────────────────────────────────────────────

type WireFeeTier struct {
	Percent float64
	Min     float64
	Max     float64
	Flat    float64 // flat fee component (SWIFT has flat fees)
}

var wireFeeSchedule = map[WireRail]WireFeeTier{
	WireRailSWIFT:       {Percent: 0.5, Min: 15.0, Max: 75.0, Flat: 15.0},
	WireRailSEPA:        {Percent: 0.3, Min: 1.0, Max: 25.0, Flat: 0.0},
	WireRailACH:         {Percent: 0.4, Min: 2.0, Max: 35.0, Flat: 0.0},
	WireRailFasterPayUK: {Percent: 0.35, Min: 1.5, Max: 30.0, Flat: 0.0},
	WireRailIMTO:        {Percent: 0.8, Min: 3.0, Max: 40.0, Flat: 0.0},
}

// Country → optimal wire rail mapping
var countryWireRails = map[string]WireRail{
	"US": WireRailACH,
	"GB": WireRailFasterPayUK,
	"DE": WireRailSEPA, "FR": WireRailSEPA, "NL": WireRailSEPA,
	"IT": WireRailSEPA, "ES": WireRailSEPA, "BE": WireRailSEPA,
	"AT": WireRailSEPA, "IE": WireRailSEPA, "PT": WireRailSEPA,
	"FI": WireRailSEPA, "LU": WireRailSEPA, "GR": WireRailSEPA,
}

// ─── Collection Account Details (IMTO Partner) ──────────────────────────────

var collectionAccounts = map[WireRail]CollectionInstructions{
	WireRailSEPA: {
		Method:      "iban",
		BankName:    "Flutterwave International (EU)",
		AccountName: "TourismPay Ltd — Tourist Collections",
		IBAN:        "PLACEHOLDER_SEPA_IBAN",
		BIC:         "PLACEHOLDER_BIC",
	},
	WireRailACH: {
		Method:        "account_routing",
		BankName:      "Flutterwave International (US)",
		AccountName:   "TourismPay Ltd — Tourist Collections",
		AccountNumber: "PLACEHOLDER_ACH_ACCOUNT",
		RoutingNumber: "PLACEHOLDER_ACH_ROUTING",
	},
	WireRailFasterPayUK: {
		Method:        "sort_code",
		BankName:      "Flutterwave International (UK)",
		AccountName:   "TourismPay Ltd — Tourist Collections",
		AccountNumber: "PLACEHOLDER_UK_ACCOUNT",
		SortCode:      "PLACEHOLDER_SORT_CODE",
	},
	WireRailSWIFT: {
		Method:      "iban",
		BankName:    "GTBank Nigeria (Correspondent)",
		AccountName: "TourismPay Ltd — SWIFT Collections",
		IBAN:        "PLACEHOLDER_SWIFT_IBAN",
		BIC:         "PLACEHOLDER_SWIFT_BIC",
	},
}

// Estimated settlement times per rail
var wireEstimatedTimes = map[WireRail]string{
	WireRailSWIFT:       "1-3 business days",
	WireRailSEPA:        "~10 seconds (SEPA Instant) / 1 day (regular)",
	WireRailACH:         "1-2 business days",
	WireRailFasterPayUK: "~2 hours",
	WireRailIMTO:        "~30 minutes",
}

// ─── Service ────────────────────────────────────────────────────────────────

type SWIFTWireService struct {
	mu     sync.RWMutex
	orders map[string]*WireTransferOrder
	crypto *CryptoService
	cbdc   *CBDCBridge
}

func NewSWIFTWireService(crypto *CryptoService, cbdc *CBDCBridge) *SWIFTWireService {
	return &SWIFTWireService{
		orders: make(map[string]*WireTransferOrder),
		crypto: crypto,
		cbdc:   cbdc,
	}
}

func generateWireRef() string {
	b := make([]byte, 12)
	rand.Read(b)
	return "TPWIRE-" + hex.EncodeToString(b)[:16]
}

// GetQuote returns a wire transfer quote with collection instructions
func (s *SWIFTWireService) GetQuote(sourceCurrency, targetCurrency, senderCountry string, amount float64) (*WireQuote, error) {
	// Determine best rail for sender's country
	rail, ok := countryWireRails[senderCountry]
	if !ok {
		rail = WireRailSWIFT // Default to SWIFT for unlisted countries
	}

	// FX rate (USD-based, expand as needed)
	rate := getWireFXRate(sourceCurrency, targetCurrency)
	if rate == 0 {
		return nil, fmt.Errorf("unsupported currency pair: %s → %s", sourceCurrency, targetCurrency)
	}

	// Calculate fees
	feeTier := wireFeeSchedule[rail]
	fee := amount*feeTier.Percent/100 + feeTier.Flat
	if fee < feeTier.Min {
		fee = feeTier.Min
	}
	if fee > feeTier.Max {
		fee = feeTier.Max
	}

	netAmount := amount - fee
	targetAmount := netAmount * rate

	// Build collection instructions
	instructions := collectionAccounts[rail]
	instructions.Reference = generateWireRef()
	instructions.Memo = fmt.Sprintf("TourismPay wallet load — %s %.2f", targetCurrency, targetAmount)

	return &WireQuote{
		SourceCurrency: sourceCurrency,
		SourceAmount:   amount,
		TargetCurrency: targetCurrency,
		TargetAmount:   targetAmount,
		ExchangeRate:   rate,
		Fee:            fee,
		FeePercent:     feeTier.Percent,
		Rail:           rail,
		EstimatedTime:  wireEstimatedTimes[rail],
		CollectionInstructions: instructions,
		ExpiresAt:      time.Now().Add(30 * time.Minute).UTC().Format(time.RFC3339),
	}, nil
}

// InitiateTransfer creates a wire transfer order after the tourist initiates
func (s *SWIFTWireService) InitiateTransfer(userID string, quote *WireQuote, senderName, senderCountry string, travelRule *TravelRulePayload, kycTier int) (*WireTransferOrder, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	orderID := generateWireRef()
	now := time.Now().UTC()

	order := &WireTransferOrder{
		ID:                orderID,
		UserID:            userID,
		Status:            "pending_collection",
		SourceCurrency:    quote.SourceCurrency,
		SourceAmount:      quote.SourceAmount,
		TargetCurrency:    quote.TargetCurrency,
		TargetAmount:      quote.TargetAmount,
		WireRail:          quote.Rail,
		CollectionRef:     quote.CollectionInstructions.Reference,
		SenderName:        senderName,
		SenderCountry:     senderCountry,
		RecipientWalletID: fmt.Sprintf("tp_wallet_%s", userID),
		ExchangeRate:      quote.ExchangeRate,
		Fee:               quote.Fee,
		FeePercent:        quote.FeePercent,
		TravelRuleData:    travelRule,
		KYCTier:           kycTier,
		CreatedAt:         now,
		ExpiresAt:         now.Add(72 * time.Hour),
	}

	s.orders[orderID] = order

	swiftTransfersTotal.WithLabelValues("pending_collection", string(quote.Rail)).Inc()
	swiftVolumeUSD.WithLabelValues(string(quote.Rail)).Add(quote.SourceAmount)

	return order, nil
}

// ConfirmSettlement is called when IMTO partner webhook confirms funds received
func (s *SWIFTWireService) ConfirmSettlement(orderID, swiftRef string) (*WireTransferOrder, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	order, ok := s.orders[orderID]
	if !ok {
		return nil, fmt.Errorf("wire order not found: %s", orderID)
	}

	now := time.Now().UTC()
	order.Status = "settled"
	order.SWIFTRef = swiftRef
	order.SettledAt = &now

	swiftTransfersTotal.WithLabelValues("settled", string(order.WireRail)).Inc()
	swiftLatency.WithLabelValues(string(order.WireRail)).Observe(now.Sub(order.CreatedAt).Seconds())

	return order, nil
}

// CreditWallet is called after settlement to credit the tourist's wallet
func (s *SWIFTWireService) CreditWallet(orderID string) (*WireTransferOrder, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	order, ok := s.orders[orderID]
	if !ok {
		return nil, fmt.Errorf("wire order not found: %s", orderID)
	}
	if order.Status != "settled" {
		return nil, fmt.Errorf("order not settled yet (current: %s)", order.Status)
	}

	now := time.Now().UTC()
	order.Status = "credited"
	order.CreditedAt = &now

	swiftTransfersTotal.WithLabelValues("credited", string(order.WireRail)).Inc()
	swiftFeesCollected.WithLabelValues(string(order.WireRail)).Add(order.Fee)

	return order, nil
}

// GetOrder returns a wire transfer order by ID
func (s *SWIFTWireService) GetOrder(orderID string) (*WireTransferOrder, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	order, ok := s.orders[orderID]
	if !ok {
		return nil, fmt.Errorf("wire order not found: %s", orderID)
	}
	return order, nil
}

// ListOrders returns all wire transfer orders for a user
func (s *SWIFTWireService) ListOrders(userID string) []*WireTransferOrder {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*WireTransferOrder
	for _, order := range s.orders {
		if order.UserID == userID {
			result = append(result, order)
		}
	}
	return result
}

// ─── FX Rate Helper ─────────────────────────────────────────────────────────

func getWireFXRate(from, to string) float64 {
	// Base rates vs USD
	usdRates := map[string]float64{
		"USD": 1.0, "EUR": 1.08, "GBP": 1.27, "CHF": 1.12, "JPY": 0.0067,
		"CAD": 0.74, "AUD": 0.65, "NZD": 0.61, "SGD": 0.74, "HKD": 0.128,
		"NGN": 0.000625, "KES": 0.0077, "GHS": 0.067, "ZAR": 0.054,
		"USDC": 1.0, "USDT": 1.0, "DAI": 1.0,
		"CBDC-NG": 0.000625, "CBDC-KE": 0.0077, "CBDC-GH": 0.067,
	}

	fromRate, ok1 := usdRates[from]
	toRate, ok2 := usdRates[to]
	if !ok1 || !ok2 {
		return 0
	}
	return fromRate / toRate
}
