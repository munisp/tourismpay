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
	bankPartnerTransfersTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "tourismpay_bank_partner_transfers_total",
		Help: "Total bank partner SWIFT transfers by provider and status",
	}, []string{"provider", "status"})

	bankPartnerVolumeUSD = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "tourismpay_bank_partner_volume_usd_total",
		Help: "Total bank partner volume in USD by provider",
	}, []string{"provider"})

	bankPartnerLatency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "tourismpay_bank_partner_duration_seconds",
		Help:    "Bank partner transfer processing duration",
		Buckets: []float64{1, 5, 30, 60, 300, 600, 3600, 86400},
	}, []string{"provider"})
)

// ─── Types ──────────────────────────────────────────────────────────────────

type BankPartnerProvider string

const (
	ProviderGTBank        BankPartnerProvider = "gtbank"
	ProviderAccessBank    BankPartnerProvider = "access_bank"
	ProviderCurrencyCloud BankPartnerProvider = "currencycloud"
	ProviderBankingCircle BankPartnerProvider = "banking_circle"
)

type BankPartnerConfig struct {
	Provider    BankPartnerProvider `json:"provider"`
	Name        string              `json:"name"`
	SWIFTCode   string              `json:"swift_code"`
	IsMember    bool                `json:"is_swift_member"`
	Countries   []string            `json:"supported_countries"`
	Currencies  []string            `json:"supported_currencies"`
	FeePercent  float64             `json:"fee_percent"`
	FlatFee     float64             `json:"flat_fee"`
	MinAmount   float64             `json:"min_amount"`
	MaxAmount   float64             `json:"max_amount"`
	SettleTime  string              `json:"settlement_time"`
	APIBase     string              `json:"api_base"`
	HasWebhook  bool                `json:"has_webhook"`
	RequiresKYB bool                `json:"requires_kyb"`
	Status      string              `json:"status"` // active, sandbox, pending
}

type VirtualIBAN struct {
	ID            string              `json:"id"`
	Provider      BankPartnerProvider `json:"provider"`
	IBAN          string              `json:"iban"`
	BIC           string              `json:"bic"`
	AccountName   string              `json:"account_name"`
	AccountNumber string              `json:"account_number,omitempty"`
	SortCode      string              `json:"sort_code,omitempty"`
	RoutingNumber string              `json:"routing_number,omitempty"`
	Currency      string              `json:"currency"`
	UserID        string              `json:"user_id"`
	Reference     string              `json:"reference"`
	CreatedAt     time.Time           `json:"created_at"`
	Active        bool                `json:"active"`
}

type BankPartnerTransfer struct {
	ID               string              `json:"id"`
	Provider         BankPartnerProvider `json:"provider"`
	UserID           string              `json:"user_id"`
	VirtualIBANID    string              `json:"virtual_iban_id"`
	Status           string              `json:"status"` // awaiting_funds, funds_received, converting, credited, failed
	SourceCurrency   string              `json:"source_currency"`
	SourceAmount     float64             `json:"source_amount"`
	TargetCurrency   string              `json:"target_currency"`
	TargetAmount     float64             `json:"target_amount"`
	ExchangeRate     float64             `json:"exchange_rate"`
	Fee              float64             `json:"fee"`
	SWIFTRef         string              `json:"swift_ref,omitempty"`
	SenderName       string              `json:"sender_name"`
	SenderBankBIC    string              `json:"sender_bank_bic,omitempty"`
	TravelRuleData   *TravelRulePayload  `json:"travel_rule_data,omitempty"`
	WebhookReceived  bool                `json:"webhook_received"`
	CreatedAt        time.Time           `json:"created_at"`
	FundsReceivedAt  *time.Time          `json:"funds_received_at,omitempty"`
	CreditedAt       *time.Time          `json:"credited_at,omitempty"`
}

type BankPartnerQuote struct {
	Provider       BankPartnerProvider    `json:"provider"`
	ProviderName   string                 `json:"provider_name"`
	SourceCurrency string                 `json:"source_currency"`
	SourceAmount   float64                `json:"source_amount"`
	TargetCurrency string                 `json:"target_currency"`
	TargetAmount   float64                `json:"target_amount"`
	ExchangeRate   float64                `json:"exchange_rate"`
	Fee            float64                `json:"fee"`
	FeePercent     float64                `json:"fee_percent"`
	SettleTime     string                 `json:"settlement_time"`
	VirtualIBAN    *VirtualIBAN           `json:"virtual_iban"`
	IsSWIFTDirect  bool                   `json:"is_swift_direct"`
	ExpiresAt      string                 `json:"expires_at"`
}

// ─── Provider Configurations ────────────────────────────────────────────────

var bankPartnerConfigs = map[BankPartnerProvider]*BankPartnerConfig{
	ProviderGTBank: {
		Provider:    ProviderGTBank,
		Name:        "Guaranty Trust Bank (GTBank)",
		SWIFTCode:   "GTBINGLA",
		IsMember:    true,
		Countries:   []string{"US", "GB", "DE", "FR", "NL", "CA", "AU", "AE", "CN", "JP", "ZA", "KE", "GH"},
		Currencies:  []string{"USD", "EUR", "GBP", "NGN"},
		FeePercent:  0.25,
		FlatFee:     10.0,
		MinAmount:   50.0,
		MaxAmount:   100000.0,
		SettleTime:  "1-2 business days",
		APIBase:     "https://api.gtbank.com/v1",
		HasWebhook:  true,
		RequiresKYB: true,
		Status:      "sandbox",
	},
	ProviderAccessBank: {
		Provider:    ProviderAccessBank,
		Name:        "Access Bank Plc",
		SWIFTCode:   "ABORNGLA",
		IsMember:    true,
		Countries:   []string{"US", "GB", "DE", "FR", "NL", "CA", "AU", "AE", "ZA", "KE", "GH", "TZ", "UG"},
		Currencies:  []string{"USD", "EUR", "GBP", "NGN", "KES", "GHS", "ZAR"},
		FeePercent:  0.30,
		FlatFee:     12.0,
		MinAmount:   50.0,
		MaxAmount:   75000.0,
		SettleTime:  "1-2 business days",
		APIBase:     "https://api.accessbankplc.com/v2",
		HasWebhook:  true,
		RequiresKYB: true,
		Status:      "sandbox",
	},
	ProviderCurrencyCloud: {
		Provider:    ProviderCurrencyCloud,
		Name:        "CurrencyCloud (Visa)",
		SWIFTCode:   "CABORB22",
		IsMember:    true,
		Countries:   []string{"US", "GB", "DE", "FR", "NL", "IT", "ES", "CA", "AU", "JP", "SG", "HK", "AE", "ZA", "KE", "GH", "NG"},
		Currencies:  []string{"USD", "EUR", "GBP", "CHF", "CAD", "AUD", "SGD", "HKD", "NGN", "KES", "GHS", "ZAR"},
		FeePercent:  0.15,
		FlatFee:     5.0,
		MinAmount:   10.0,
		MaxAmount:   250000.0,
		SettleTime:  "Same-day (T+0) to T+1",
		APIBase:     "https://devapi.currencycloud.com/v2",
		HasWebhook:  true,
		RequiresKYB: true,
		Status:      "sandbox",
	},
	ProviderBankingCircle: {
		Provider:    ProviderBankingCircle,
		Name:        "Banking Circle",
		SWIFTCode:   "BKCHDKKK",
		IsMember:    true,
		Countries:   []string{"US", "GB", "DE", "FR", "NL", "IT", "ES", "DK", "SE", "NO", "CH", "CA", "AU", "SG", "HK"},
		Currencies:  []string{"USD", "EUR", "GBP", "CHF", "DKK", "SEK", "NOK", "CAD", "AUD", "SGD", "HKD"},
		FeePercent:  0.10,
		FlatFee:     3.0,
		MinAmount:   10.0,
		MaxAmount:   500000.0,
		SettleTime:  "Same-day (SEPA Instant) / T+1 (SWIFT)",
		APIBase:     "https://sandbox.bankingcircle.com/api/v1",
		HasWebhook:  true,
		RequiresKYB: true,
		Status:      "sandbox",
	},
}

// ─── Service ────────────────────────────────────────────────────────────────

type BankPartnerService struct {
	mu         sync.RWMutex
	ibans      map[string]*VirtualIBAN
	transfers  map[string]*BankPartnerTransfer
	crypto     *CryptoService
	cbdc       *CBDCBridge
}

func NewBankPartnerService(crypto *CryptoService, cbdc *CBDCBridge) *BankPartnerService {
	return &BankPartnerService{
		ibans:     make(map[string]*VirtualIBAN),
		transfers: make(map[string]*BankPartnerTransfer),
		crypto:    crypto,
		cbdc:      cbdc,
	}
}

func generateBankRef() string {
	b := make([]byte, 8)
	rand.Read(b)
	return "TPBNK-" + hex.EncodeToString(b)
}

// ListProviders returns all configured bank partner providers
func (s *BankPartnerService) ListProviders() []*BankPartnerConfig {
	providers := make([]*BankPartnerConfig, 0, len(bankPartnerConfigs))
	for _, cfg := range bankPartnerConfigs {
		providers = append(providers, cfg)
	}
	return providers
}

// GetProvider returns a specific provider's configuration
func (s *BankPartnerService) GetProvider(provider BankPartnerProvider) (*BankPartnerConfig, error) {
	cfg, ok := bankPartnerConfigs[provider]
	if !ok {
		return nil, fmt.Errorf("unknown bank partner provider: %s", provider)
	}
	return cfg, nil
}

// CreateVirtualIBAN allocates a virtual IBAN for a user with a specific provider
func (s *BankPartnerService) CreateVirtualIBAN(userID string, provider BankPartnerProvider, currency string) (*VirtualIBAN, error) {
	cfg, ok := bankPartnerConfigs[provider]
	if !ok {
		return nil, fmt.Errorf("unknown provider: %s", provider)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	ref := generateBankRef()
	iban := &VirtualIBAN{
		ID:          ref,
		Provider:    provider,
		Currency:    currency,
		UserID:      userID,
		AccountName: "TourismPay — " + userID[:8],
		BIC:         cfg.SWIFTCode,
		Reference:   ref,
		CreatedAt:   time.Now().UTC(),
		Active:      true,
	}

	// Generate provider-specific account details
	switch provider {
	case ProviderGTBank:
		iban.AccountNumber = fmt.Sprintf("07%08d%04d", time.Now().UnixNano()%100000000, len(s.ibans))
		iban.IBAN = "NG" + iban.AccountNumber
	case ProviderAccessBank:
		iban.AccountNumber = fmt.Sprintf("04%08d%04d", time.Now().UnixNano()%100000000, len(s.ibans))
		iban.IBAN = "NG" + iban.AccountNumber
	case ProviderCurrencyCloud:
		iban.IBAN = fmt.Sprintf("GB%02d%s%08d", 29+len(s.ibans)%70, "CABA", time.Now().UnixNano()%100000000)
		iban.SortCode = "23-14-70"
	case ProviderBankingCircle:
		iban.IBAN = fmt.Sprintf("DK%02d%s%010d", 50+len(s.ibans)%50, "0040", time.Now().UnixNano()%10000000000)
	}

	s.ibans[ref] = iban
	return iban, nil
}

// GetQuote returns a bank partner SWIFT quote (multi-provider comparison)
func (s *BankPartnerService) GetQuote(provider BankPartnerProvider, sourceCurrency, targetCurrency string, amount float64, userID string) (*BankPartnerQuote, error) {
	cfg, ok := bankPartnerConfigs[provider]
	if !ok {
		return nil, fmt.Errorf("unknown provider: %s", provider)
	}

	if amount < cfg.MinAmount || amount > cfg.MaxAmount {
		return nil, fmt.Errorf("amount %.2f outside range [%.2f, %.2f] for %s", amount, cfg.MinAmount, cfg.MaxAmount, cfg.Name)
	}

	rate := getWireFXRate(sourceCurrency, targetCurrency)
	if rate == 0 {
		return nil, fmt.Errorf("unsupported currency pair: %s → %s", sourceCurrency, targetCurrency)
	}

	fee := amount*cfg.FeePercent/100 + cfg.FlatFee
	netAmount := amount - fee
	targetAmount := netAmount * rate

	// Auto-create virtual IBAN for this user
	s.mu.RLock()
	var existingIBAN *VirtualIBAN
	for _, iban := range s.ibans {
		if iban.UserID == userID && iban.Provider == provider && iban.Active {
			existingIBAN = iban
			break
		}
	}
	s.mu.RUnlock()

	if existingIBAN == nil {
		var err error
		existingIBAN, err = s.CreateVirtualIBAN(userID, provider, sourceCurrency)
		if err != nil {
			return nil, err
		}
	}

	return &BankPartnerQuote{
		Provider:       provider,
		ProviderName:   cfg.Name,
		SourceCurrency: sourceCurrency,
		SourceAmount:   amount,
		TargetCurrency: targetCurrency,
		TargetAmount:   targetAmount,
		ExchangeRate:   rate,
		Fee:            fee,
		FeePercent:     cfg.FeePercent,
		SettleTime:     cfg.SettleTime,
		VirtualIBAN:    existingIBAN,
		IsSWIFTDirect:  cfg.IsMember,
		ExpiresAt:      time.Now().Add(30 * time.Minute).UTC().Format(time.RFC3339),
	}, nil
}

// CompareProviders returns quotes from all available providers for the same transfer
func (s *BankPartnerService) CompareProviders(sourceCurrency, targetCurrency string, amount float64, userID string) ([]*BankPartnerQuote, error) {
	var quotes []*BankPartnerQuote

	for provider := range bankPartnerConfigs {
		quote, err := s.GetQuote(provider, sourceCurrency, targetCurrency, amount, userID)
		if err != nil {
			continue // Skip providers that can't handle this request
		}
		quotes = append(quotes, quote)
	}

	if len(quotes) == 0 {
		return nil, fmt.Errorf("no bank partner can process %s → %s for %.2f", sourceCurrency, targetCurrency, amount)
	}

	return quotes, nil
}

// InitiateTransfer creates a new transfer via a bank partner
func (s *BankPartnerService) InitiateTransfer(userID string, quote *BankPartnerQuote, senderName string, travelRule *TravelRulePayload) (*BankPartnerTransfer, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	id := generateBankRef()
	now := time.Now().UTC()

	transfer := &BankPartnerTransfer{
		ID:              id,
		Provider:        quote.Provider,
		UserID:          userID,
		VirtualIBANID:   quote.VirtualIBAN.ID,
		Status:          "awaiting_funds",
		SourceCurrency:  quote.SourceCurrency,
		SourceAmount:    quote.SourceAmount,
		TargetCurrency:  quote.TargetCurrency,
		TargetAmount:    quote.TargetAmount,
		ExchangeRate:    quote.ExchangeRate,
		Fee:             quote.Fee,
		SenderName:      senderName,
		TravelRuleData:  travelRule,
		CreatedAt:       now,
	}

	s.transfers[id] = transfer

	bankPartnerTransfersTotal.WithLabelValues(string(quote.Provider), "awaiting_funds").Inc()
	bankPartnerVolumeUSD.WithLabelValues(string(quote.Provider)).Add(quote.SourceAmount)

	return transfer, nil
}

// WebhookFundsReceived handles the webhook from the bank partner when SWIFT funds arrive
func (s *BankPartnerService) WebhookFundsReceived(transferID, swiftRef string, amount float64) (*BankPartnerTransfer, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	transfer, ok := s.transfers[transferID]
	if !ok {
		return nil, fmt.Errorf("transfer not found: %s", transferID)
	}

	now := time.Now().UTC()
	transfer.Status = "funds_received"
	transfer.SWIFTRef = swiftRef
	transfer.WebhookReceived = true
	transfer.FundsReceivedAt = &now

	bankPartnerTransfersTotal.WithLabelValues(string(transfer.Provider), "funds_received").Inc()

	return transfer, nil
}

// CreditWallet converts and credits the tourist's wallet after funds arrive
func (s *BankPartnerService) CreditWallet(transferID string) (*BankPartnerTransfer, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	transfer, ok := s.transfers[transferID]
	if !ok {
		return nil, fmt.Errorf("transfer not found: %s", transferID)
	}
	if transfer.Status != "funds_received" {
		return nil, fmt.Errorf("transfer not in funds_received state: %s", transfer.Status)
	}

	now := time.Now().UTC()
	transfer.Status = "credited"
	transfer.CreditedAt = &now

	bankPartnerTransfersTotal.WithLabelValues(string(transfer.Provider), "credited").Inc()
	bankPartnerLatency.WithLabelValues(string(transfer.Provider)).Observe(now.Sub(transfer.CreatedAt).Seconds())

	return transfer, nil
}

// ListTransfers returns all bank partner transfers for a user
func (s *BankPartnerService) ListTransfers(userID string) []*BankPartnerTransfer {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*BankPartnerTransfer
	for _, t := range s.transfers {
		if t.UserID == userID {
			result = append(result, t)
		}
	}
	return result
}

// GetTransfer returns a specific transfer
func (s *BankPartnerService) GetTransfer(id string) (*BankPartnerTransfer, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	t, ok := s.transfers[id]
	if !ok {
		return nil, fmt.Errorf("transfer not found: %s", id)
	}
	return t, nil
}
