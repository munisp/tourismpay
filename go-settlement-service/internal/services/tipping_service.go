package services

import (
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/tourismpay/settlement-service/internal/database"
)

// persistTip writes a tip calculation to PostgreSQL when available
func persistTip(result TipCalculationResult, jurisdictionCode string) {
	if database.DB == nil {
		return
	}
	id := fmt.Sprintf("TIP-%s-%d", strings.ToUpper(jurisdictionCode), time.Now().UnixNano()/1000000)
	database.DB.Exec(
		"INSERT INTO tip_transactions (id, transaction_id, payer_id, recipient_id, establishment_id, amount, currency, tip_type, distribution, jurisdiction_code, tax_amount, net_amount, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
		id, id, "system", "system", 0, result.TipAmount, result.Currency, string(result.TipType), string(result.Distribution), jurisdictionCode, result.TaxOnTip, result.NetTip, "completed",
	)
}

// TipType represents how the tip is structured
type TipType string

const (
	TipTypePercentage TipType = "PERCENTAGE"
	TipTypeFlat       TipType = "FLAT"
	TipTypeRoundUp    TipType = "ROUND_UP"
)

// TipDistribution defines how tips are split among staff
type TipDistribution string

const (
	TipDistributionDirect TipDistribution = "DIRECT"   // 100% to individual
	TipDistributionPool   TipDistribution = "POOL"     // Split among pool members
	TipDistributionCustom TipDistribution = "CUSTOM"   // Custom percentage splits
)

// TipConfig defines tipping configuration per merchant/jurisdiction
type TipConfig struct {
	ID                string          `json:"id"`
	EstablishmentID   int             `json:"establishment_id"`
	JurisdictionCode  string          `json:"jurisdiction_code"`
	DefaultPercentages []float64      `json:"default_percentages"`  // e.g., [10, 15, 20]
	MaxPercentage     float64         `json:"max_percentage"`
	MaxFlatAmount     float64         `json:"max_flat_amount"`
	Currency          string          `json:"currency"`
	Distribution      TipDistribution `json:"distribution"`
	PoolSplitRules    []PoolSplitRule `json:"pool_split_rules"`
	TaxOnTip          bool            `json:"tax_on_tip"`          // Whether tips are subject to tax
	TipTaxRate        float64         `json:"tip_tax_rate"`        // If taxed, what rate
	AllowCustomAmount bool            `json:"allow_custom_amount"`
	AllowRoundUp      bool            `json:"allow_round_up"`
	IsEnabled         bool            `json:"is_enabled"`
	SuggestedAmounts  []float64       `json:"suggested_amounts"`   // Flat suggestions (e.g., $2, $5, $10)
	CulturalNote      string          `json:"cultural_note"`       // Jurisdiction-specific tipping guidance
}

// PoolSplitRule defines how a tip pool is distributed
type PoolSplitRule struct {
	Role       string  `json:"role"`       // "server", "kitchen", "host", "busser"
	Percentage float64 `json:"percentage"` // Share of the tip pool
}

// TipTransaction records a tip payment
type TipTransaction struct {
	ID               string  `json:"id"`
	TransactionID    string  `json:"transaction_id"`    // Reference to parent payment
	PayerID          string  `json:"payer_id"`
	RecipientID      string  `json:"recipient_id"`      // Staff member or pool ID
	EstablishmentID  int     `json:"establishment_id"`
	Amount           float64 `json:"amount"`
	Currency         string  `json:"currency"`
	TipType          TipType `json:"tip_type"`
	Percentage       float64 `json:"percentage"`        // If percentage-based
	BaseAmount       float64 `json:"base_amount"`       // Original bill amount
	TaxOnTip         float64 `json:"tax_on_tip"`        // Tax collected on the tip
	NetTip           float64 `json:"net_tip"`           // Amount after tax (if applicable)
	Distribution     TipDistribution `json:"distribution"`
	DistributionLog  []TipSplit `json:"distribution_log"`
	Status           string  `json:"status"`            // "pending", "distributed", "settled"
	CreatedAt        int64   `json:"created_at"`
}

// TipSplit records how a single tip was distributed
type TipSplit struct {
	RecipientID string  `json:"recipient_id"`
	RecipientName string `json:"recipient_name"`
	Role        string  `json:"role"`
	Amount      float64 `json:"amount"`
	Percentage  float64 `json:"percentage"`
}

// TipSummary provides aggregated tip data for a merchant
type TipSummary struct {
	EstablishmentID  int     `json:"establishment_id"`
	Period           string  `json:"period"`
	TotalTips        float64 `json:"total_tips"`
	TotalTransactions int    `json:"total_transactions"`
	AverageTip       float64 `json:"average_tip"`
	AveragePercent   float64 `json:"average_percent"`
	Currency         string  `json:"currency"`
	ByStaff          []StaffTipSummary `json:"by_staff"`
}

// StaffTipSummary shows per-staff tip totals
type StaffTipSummary struct {
	StaffID   string  `json:"staff_id"`
	StaffName string  `json:"staff_name"`
	Role      string  `json:"role"`
	Total     float64 `json:"total"`
	Count     int     `json:"count"`
}

// TippingService handles all tip-related operations
type TippingService struct {
	configs map[string]TipConfig // jurisdiction -> default config
}

// NewTippingService creates the tipping service with jurisdiction defaults
func NewTippingService() *TippingService {
	svc := &TippingService{
		configs: make(map[string]TipConfig),
	}
	svc.loadJurisdictionDefaults()
	svc.persistConfigsToDB()
	return svc
}

func (s *TippingService) persistConfigsToDB() {
	if database.DB == nil {
		return
	}
	for code, config := range s.configs {
		database.DB.Exec(
			"INSERT INTO tip_configs (jurisdiction_code, currency, max_percentage, max_flat_amount, distribution, tax_on_tip, cultural_note, is_enabled) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (jurisdiction_code) DO NOTHING",
			code, config.Currency, config.MaxPercentage, config.MaxFlatAmount, string(config.Distribution), config.TaxOnTip, config.CulturalNote, config.IsEnabled,
		)
	}
}

func (s *TippingService) loadJurisdictionDefaults() {
	// Nigeria — tipping is customary (10-15% at restaurants)
	s.configs["NG"] = TipConfig{
		JurisdictionCode:   "NG",
		DefaultPercentages: []float64{10, 15, 20},
		MaxPercentage:      30,
		MaxFlatAmount:      50000, // ₦50,000
		Currency:           "NGN",
		Distribution:       TipDistributionPool,
		PoolSplitRules: []PoolSplitRule{
			{Role: "server", Percentage: 60},
			{Role: "kitchen", Percentage: 25},
			{Role: "support", Percentage: 15},
		},
		TaxOnTip:          false,
		AllowCustomAmount: true,
		AllowRoundUp:      true,
		SuggestedAmounts:  []float64{500, 1000, 2000, 5000},
		CulturalNote:      "Tipping is appreciated in Nigeria. 10-15% is standard at restaurants. Service charge may already be included.",
		IsEnabled:         true,
	}

	// Kenya — tipping is expected (10-15%)
	s.configs["KE"] = TipConfig{
		JurisdictionCode:   "KE",
		DefaultPercentages: []float64{10, 15, 20},
		MaxPercentage:      30,
		MaxFlatAmount:      10000, // KES 10,000
		Currency:           "KES",
		Distribution:       TipDistributionPool,
		PoolSplitRules: []PoolSplitRule{
			{Role: "server", Percentage: 55},
			{Role: "kitchen", Percentage: 30},
			{Role: "support", Percentage: 15},
		},
		TaxOnTip:          false,
		AllowCustomAmount: true,
		AllowRoundUp:      true,
		SuggestedAmounts:  []float64{100, 200, 500, 1000},
		CulturalNote:      "Tipping is expected in Kenya. 10% is standard. Safari guides typically receive $10-20 USD per day.",
		IsEnabled:         true,
	}

	// South Africa — tipping is expected (10-20%)
	s.configs["ZA"] = TipConfig{
		JurisdictionCode:   "ZA",
		DefaultPercentages: []float64{10, 15, 20},
		MaxPercentage:      30,
		MaxFlatAmount:      5000, // ZAR 5,000
		Currency:           "ZAR",
		Distribution:       TipDistributionDirect,
		TaxOnTip:           false,
		AllowCustomAmount:  true,
		AllowRoundUp:       true,
		SuggestedAmounts:   []float64{20, 50, 100, 200},
		CulturalNote:       "Tipping is part of South African culture. 10-15% at restaurants, R20-50 for car guards, 10% for tour guides.",
		IsEnabled:          true,
	}

	// Ghana — tipping appreciated (5-10%)
	s.configs["GH"] = TipConfig{
		JurisdictionCode:   "GH",
		DefaultPercentages: []float64{5, 10, 15},
		MaxPercentage:      25,
		MaxFlatAmount:      500, // GHS 500
		Currency:           "GHS",
		Distribution:       TipDistributionPool,
		PoolSplitRules: []PoolSplitRule{
			{Role: "server", Percentage: 65},
			{Role: "kitchen", Percentage: 20},
			{Role: "support", Percentage: 15},
		},
		TaxOnTip:          false,
		AllowCustomAmount: true,
		AllowRoundUp:      true,
		SuggestedAmounts:  []float64{5, 10, 20, 50},
		CulturalNote:      "Tipping is appreciated but not mandatory in Ghana. 5-10% at restaurants is generous.",
		IsEnabled:         true,
	}

	// Tanzania — tipping expected especially for safari/tourism
	s.configs["TZ"] = TipConfig{
		JurisdictionCode:   "TZ",
		DefaultPercentages: []float64{10, 15, 20},
		MaxPercentage:      30,
		MaxFlatAmount:      100000, // TZS 100,000
		Currency:           "TZS",
		Distribution:       TipDistributionDirect,
		TaxOnTip:           false,
		AllowCustomAmount:  true,
		AllowRoundUp:       true,
		SuggestedAmounts:   []float64{5000, 10000, 20000, 50000},
		CulturalNote:       "Tipping is customary in Tanzania, especially for safari guides ($15-20/day) and porters on Kilimanjaro ($8-10/day).",
		IsEnabled:          true,
	}

	// Morocco — tipping customary (10%)
	s.configs["MA"] = TipConfig{
		JurisdictionCode:   "MA",
		DefaultPercentages: []float64{10, 15, 20},
		MaxPercentage:      25,
		MaxFlatAmount:      500, // MAD 500
		Currency:           "MAD",
		Distribution:       TipDistributionDirect,
		TaxOnTip:           false,
		AllowCustomAmount:  true,
		AllowRoundUp:       true,
		SuggestedAmounts:   []float64{10, 20, 50, 100},
		CulturalNote:       "Tipping (pourboire) is expected in Morocco. 10% at restaurants, 10-20 MAD for small services, rounding up taxi fares.",
		IsEnabled:          true,
	}

	// Egypt — tipping essential (baksheesh culture)
	s.configs["EG"] = TipConfig{
		JurisdictionCode:   "EG",
		DefaultPercentages: []float64{10, 15, 20},
		MaxPercentage:      30,
		MaxFlatAmount:      2000, // EGP 2,000
		Currency:           "EGP",
		Distribution:       TipDistributionDirect,
		TaxOnTip:           false,
		AllowCustomAmount:  true,
		AllowRoundUp:       true,
		SuggestedAmounts:   []float64{20, 50, 100, 200},
		CulturalNote:       "Baksheesh (tipping) is deeply ingrained in Egyptian culture. 10-15% at restaurants, EGP 20-50 for small services.",
		IsEnabled:          true,
	}

	// Rwanda — tipping moderate (10%)
	s.configs["RW"] = TipConfig{
		JurisdictionCode:   "RW",
		DefaultPercentages: []float64{10, 15, 20},
		MaxPercentage:      25,
		MaxFlatAmount:      50000, // RWF 50,000
		Currency:           "RWF",
		Distribution:       TipDistributionPool,
		PoolSplitRules: []PoolSplitRule{
			{Role: "server", Percentage: 60},
			{Role: "kitchen", Percentage: 25},
			{Role: "support", Percentage: 15},
		},
		TaxOnTip:          false,
		AllowCustomAmount: true,
		AllowRoundUp:      true,
		SuggestedAmounts:  []float64{1000, 2000, 5000, 10000},
		CulturalNote:      "Tipping is appreciated in Rwanda. 10% at restaurants. Gorilla trek guides: $10-20 per person.",
		IsEnabled:         true,
	}

	// Uganda
	s.configs["UG"] = TipConfig{
		JurisdictionCode:   "UG",
		DefaultPercentages: []float64{10, 15, 20},
		MaxPercentage:      25,
		MaxFlatAmount:      200000, // UGX 200,000
		Currency:           "UGX",
		Distribution:       TipDistributionDirect,
		TaxOnTip:           false,
		AllowCustomAmount:  true,
		AllowRoundUp:       true,
		SuggestedAmounts:   []float64{5000, 10000, 20000, 50000},
		CulturalNote:       "Tipping is not mandatory in Uganda but appreciated. 10% at restaurants. Safari guides: $10-15 per day.",
		IsEnabled:          true,
	}

	// Ethiopia
	s.configs["ET"] = TipConfig{
		JurisdictionCode:   "ET",
		DefaultPercentages: []float64{10, 15, 20},
		MaxPercentage:      25,
		MaxFlatAmount:      5000, // ETB 5,000
		Currency:           "ETB",
		Distribution:       TipDistributionDirect,
		TaxOnTip:           false,
		AllowCustomAmount:  true,
		AllowRoundUp:       true,
		SuggestedAmounts:   []float64{50, 100, 200, 500},
		CulturalNote:       "Tipping is customary in Ethiopia. 10% at restaurants. Guides: 200-500 ETB per day.",
		IsEnabled:          true,
	}
}

// CalculateTip computes the tip amount based on configuration
func (s *TippingService) CalculateTip(jurisdictionCode string, baseAmount float64, tipType TipType, tipValue float64) TipCalculationResult {
	jurisdictionCode = strings.ToUpper(jurisdictionCode)
	config := s.GetConfig(jurisdictionCode)

	var tipAmount float64
	switch tipType {
	case TipTypePercentage:
		if tipValue > config.MaxPercentage {
			tipValue = config.MaxPercentage
		}
		tipAmount = math.Round(baseAmount*tipValue) / 100.0
	case TipTypeFlat:
		tipAmount = tipValue
		if tipAmount > config.MaxFlatAmount {
			tipAmount = config.MaxFlatAmount
		}
	case TipTypeRoundUp:
		// Round up to nearest significant unit
		unit := getRoundUpUnit(config.Currency)
		tipAmount = math.Ceil(baseAmount/unit)*unit - baseAmount
		if tipAmount <= 0 {
			tipAmount = unit
		}
	}

	tipAmount = math.Round(tipAmount*100) / 100

	// Calculate tax on tip if applicable
	var taxOnTip float64
	if config.TaxOnTip && config.TipTaxRate > 0 {
		taxOnTip = math.Round(tipAmount*config.TipTaxRate) / 100.0
	}
	netTip := tipAmount - taxOnTip

	// Calculate distribution
	var splits []TipSplit
	if config.Distribution == TipDistributionPool && len(config.PoolSplitRules) > 0 {
		for _, rule := range config.PoolSplitRules {
			splitAmount := math.Round(netTip*rule.Percentage) / 100.0
			splits = append(splits, TipSplit{
				Role:       rule.Role,
				Amount:     splitAmount,
				Percentage: rule.Percentage,
			})
		}
	} else {
		splits = append(splits, TipSplit{
			Role:       "recipient",
			Amount:     netTip,
			Percentage: 100,
		})
	}

	result := TipCalculationResult{
		BaseAmount:    baseAmount,
		TipAmount:     tipAmount,
		TaxOnTip:      taxOnTip,
		NetTip:        netTip,
		GrandTotal:    baseAmount + tipAmount,
		TipType:       tipType,
		Percentage:    tipValue,
		Currency:      config.Currency,
		Distribution:  config.Distribution,
		Splits:        splits,
		CulturalNote:  config.CulturalNote,
	}

	persistTip(result, jurisdictionCode)
	return result
}

// GetConfig returns the tipping configuration for a jurisdiction
func (s *TippingService) GetConfig(jurisdictionCode string) TipConfig {
	jurisdictionCode = strings.ToUpper(jurisdictionCode)
	config, exists := s.configs[jurisdictionCode]
	if !exists {
		// Default conservative config for unknown jurisdictions
		return TipConfig{
			JurisdictionCode:   jurisdictionCode,
			DefaultPercentages: []float64{10, 15, 20},
			MaxPercentage:      25,
			MaxFlatAmount:      100, // USD default
			Currency:           "USD",
			Distribution:       TipDistributionDirect,
			TaxOnTip:           false,
			AllowCustomAmount:  true,
			AllowRoundUp:       true,
			SuggestedAmounts:   []float64{2, 5, 10, 20},
			CulturalNote:       "Tipping customs vary. Check local customs for appropriate amounts.",
			IsEnabled:          true,
		}
	}
	return config
}

// GetSupportedJurisdictions returns all jurisdictions with tipping configs
func (s *TippingService) GetSupportedJurisdictions() []TipJurisdictionInfo {
	var result []TipJurisdictionInfo
	names := map[string]string{
		"NG": "Nigeria", "KE": "Kenya", "GH": "Ghana", "ZA": "South Africa",
		"TZ": "Tanzania", "RW": "Rwanda", "ET": "Ethiopia", "MA": "Morocco",
		"EG": "Egypt", "UG": "Uganda",
	}
	for code, config := range s.configs {
		name := names[code]
		if name == "" {
			name = code
		}
		result = append(result, TipJurisdictionInfo{
			Code:               code,
			Name:               name,
			Currency:           config.Currency,
			DefaultPercentages: config.DefaultPercentages,
			CulturalNote:       config.CulturalNote,
			IsEnabled:          config.IsEnabled,
		})
	}
	return result
}

// TipCalculationResult is the result of calculating a tip
type TipCalculationResult struct {
	BaseAmount   float64         `json:"base_amount"`
	TipAmount    float64         `json:"tip_amount"`
	TaxOnTip     float64         `json:"tax_on_tip"`
	NetTip       float64         `json:"net_tip"`
	GrandTotal   float64         `json:"grand_total"`
	TipType      TipType         `json:"tip_type"`
	Percentage   float64         `json:"percentage"`
	Currency     string          `json:"currency"`
	Distribution TipDistribution `json:"distribution"`
	Splits       []TipSplit      `json:"splits"`
	CulturalNote string          `json:"cultural_note"`
}

// TipJurisdictionInfo is summary info about a tipping jurisdiction
type TipJurisdictionInfo struct {
	Code               string    `json:"code"`
	Name               string    `json:"name"`
	Currency           string    `json:"currency"`
	DefaultPercentages []float64 `json:"default_percentages"`
	CulturalNote       string    `json:"cultural_note"`
	IsEnabled          bool      `json:"is_enabled"`
}

func getRoundUpUnit(currency string) float64 {
	switch currency {
	case "NGN":
		return 100 // Round up to nearest ₦100
	case "KES":
		return 50 // Round up to nearest KES 50
	case "TZS", "UGX":
		return 1000 // Round up to nearest 1000
	case "RWF":
		return 500
	case "ZAR":
		return 10
	case "GHS":
		return 5
	case "MAD":
		return 10
	case "EGP":
		return 10
	case "ETB":
		return 10
	default:
		return 1 // Dollar/Euro round up to nearest unit
	}
}

// GenerateTipReceipt creates a receipt reference for a tip
func GenerateTipReceipt(jurisdictionCode string) string {
	ts := time.Now().UnixNano() / 1000000
	return fmt.Sprintf("TIP-%s-%d", strings.ToUpper(jurisdictionCode), ts)
}
