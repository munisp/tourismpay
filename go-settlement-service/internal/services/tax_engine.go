package services

import (
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/tourismpay/settlement-service/internal/database"
)

// TaxType represents the category of tax applied
type TaxType string

const (
	TaxTypeVAT              TaxType = "VAT"
	TaxTypeTourismLevy      TaxType = "TOURISM_LEVY"
	TaxTypeWithholding      TaxType = "WITHHOLDING"
	TaxTypeServiceCharge    TaxType = "SERVICE_CHARGE"
	TaxTypeDigitalService   TaxType = "DIGITAL_SERVICE"
	TaxTypeEnvironmental    TaxType = "ENVIRONMENTAL"
	TaxTypeCityTax          TaxType = "CITY_TAX"
	TaxTypeExcise           TaxType = "EXCISE"
)

// TaxRule defines a single tax rule for a jurisdiction
type TaxRule struct {
	ID              string    `json:"id"`
	JurisdictionCode string  `json:"jurisdiction_code"` // ISO 3166-1 alpha-2 (NG, KE, GH, ZA, TZ, etc.)
	TaxType         TaxType  `json:"tax_type"`
	Name            string   `json:"name"`
	Rate            float64  `json:"rate"`           // Percentage (e.g., 7.5 for 7.5%)
	FlatAmount      float64  `json:"flat_amount"`    // Fixed amount (if applicable)
	Currency        string   `json:"currency"`
	AppliesToCategory string `json:"applies_to_category"` // "all", "accommodation", "food", "transport", "experience"
	MinAmount       float64  `json:"min_amount"`     // Minimum transaction amount for this tax to apply
	MaxAmount       float64  `json:"max_amount"`     // Cap on taxable amount (0 = no cap)
	IsCompound      bool    `json:"is_compound"`     // If true, applies on top of other taxes
	Priority        int     `json:"priority"`        // Order of application (lower = first)
	EffectiveFrom   int64   `json:"effective_from"`  // Unix timestamp
	EffectiveUntil  int64   `json:"effective_until"` // 0 = no end date
	ExemptCategories []string `json:"exempt_categories"`
	IsActive        bool    `json:"is_active"`
}

// TaxCalculation represents the result of calculating taxes for a transaction
type TaxCalculation struct {
	SubTotal       float64             `json:"sub_total"`
	TotalTax       float64             `json:"total_tax"`
	GrandTotal     float64             `json:"grand_total"`
	Breakdown      []TaxLineItem       `json:"breakdown"`
	Jurisdiction   string              `json:"jurisdiction"`
	Currency       string              `json:"currency"`
	CalculatedAt   int64               `json:"calculated_at"`
	ReceiptNumber  string              `json:"receipt_number"`
}

// TaxLineItem is a single line item in the tax breakdown
type TaxLineItem struct {
	TaxType     TaxType `json:"tax_type"`
	Name        string  `json:"name"`
	Rate        float64 `json:"rate"`
	TaxableBase float64 `json:"taxable_base"`
	Amount      float64 `json:"amount"`
	IsCompound  bool    `json:"is_compound"`
}

// TaxRemittance tracks tax collected for remittance to authorities
type TaxRemittance struct {
	ID               string  `json:"id"`
	JurisdictionCode string  `json:"jurisdiction_code"`
	TaxType          TaxType `json:"tax_type"`
	Period           string  `json:"period"`        // "2025-Q1", "2025-01"
	TotalCollected   float64 `json:"total_collected"`
	TotalRemitted    float64 `json:"total_remitted"`
	Currency         string  `json:"currency"`
	Status           string  `json:"status"` // "pending", "filed", "remitted", "overdue"
	DueDate          int64   `json:"due_date"`
	TransactionCount int     `json:"transaction_count"`
}

// TaxEngineService handles multi-jurisdiction tax calculation
type TaxEngineService struct {
	rules map[string][]TaxRule // jurisdiction_code -> rules
}

// NewTaxEngineService creates the tax engine with default jurisdiction rules
func NewTaxEngineService() *TaxEngineService {
	svc := &TaxEngineService{
		rules: make(map[string][]TaxRule),
	}
	svc.loadDefaultRules()
	return svc
}

func (s *TaxEngineService) loadDefaultRules() {
	now := time.Now().Unix()

	// Nigeria
	s.rules["NG"] = []TaxRule{
		{ID: "ng-vat", JurisdictionCode: "NG", TaxType: TaxTypeVAT, Name: "Nigeria VAT", Rate: 7.5, Currency: "NGN", AppliesToCategory: "all", Priority: 1, EffectiveFrom: now, IsActive: true},
		{ID: "ng-tourism-levy", JurisdictionCode: "NG", TaxType: TaxTypeTourismLevy, Name: "Tourism Development Levy", Rate: 5.0, Currency: "NGN", AppliesToCategory: "accommodation", Priority: 2, EffectiveFrom: now, IsActive: true},
		{ID: "ng-service-charge", JurisdictionCode: "NG", TaxType: TaxTypeServiceCharge, Name: "Service Charge", Rate: 5.0, Currency: "NGN", AppliesToCategory: "accommodation", Priority: 3, EffectiveFrom: now, IsActive: true},
		{ID: "ng-withholding", JurisdictionCode: "NG", TaxType: TaxTypeWithholding, Name: "Withholding Tax (Cross-border)", Rate: 10.0, Currency: "NGN", AppliesToCategory: "all", MinAmount: 50000, Priority: 10, EffectiveFrom: now, IsActive: true},
		{ID: "ng-digital-service", JurisdictionCode: "NG", TaxType: TaxTypeDigitalService, Name: "Digital Services Tax", Rate: 6.0, Currency: "NGN", AppliesToCategory: "all", MinAmount: 25000000, Priority: 5, EffectiveFrom: now, IsActive: true, ExemptCategories: []string{"transport", "accommodation"}},
	}

	// Kenya
	s.rules["KE"] = []TaxRule{
		{ID: "ke-vat", JurisdictionCode: "KE", TaxType: TaxTypeVAT, Name: "Kenya VAT", Rate: 16.0, Currency: "KES", AppliesToCategory: "all", Priority: 1, EffectiveFrom: now, IsActive: true},
		{ID: "ke-tourism-levy", JurisdictionCode: "KE", TaxType: TaxTypeTourismLevy, Name: "Tourism Fund Levy", Rate: 2.0, Currency: "KES", AppliesToCategory: "accommodation", Priority: 2, EffectiveFrom: now, IsActive: true},
		{ID: "ke-catering-levy", JurisdictionCode: "KE", TaxType: TaxTypeServiceCharge, Name: "Catering Training Levy", Rate: 2.0, Currency: "KES", AppliesToCategory: "food", Priority: 3, EffectiveFrom: now, IsActive: true},
		{ID: "ke-excise-alcohol", JurisdictionCode: "KE", TaxType: TaxTypeExcise, Name: "Excise Duty (Alcohol)", Rate: 20.0, Currency: "KES", AppliesToCategory: "food", MinAmount: 500, Priority: 4, EffectiveFrom: now, IsActive: true},
		{ID: "ke-digital-service", JurisdictionCode: "KE", TaxType: TaxTypeDigitalService, Name: "Digital Service Tax", Rate: 1.5, Currency: "KES", AppliesToCategory: "all", Priority: 5, EffectiveFrom: now, IsActive: true},
	}

	// Ghana
	s.rules["GH"] = []TaxRule{
		{ID: "gh-vat", JurisdictionCode: "GH", TaxType: TaxTypeVAT, Name: "Ghana VAT", Rate: 15.0, Currency: "GHS", AppliesToCategory: "all", Priority: 1, EffectiveFrom: now, IsActive: true},
		{ID: "gh-nhil", JurisdictionCode: "GH", TaxType: TaxTypeServiceCharge, Name: "NHIL (Health Insurance)", Rate: 2.5, Currency: "GHS", AppliesToCategory: "all", Priority: 2, EffectiveFrom: now, IsActive: true},
		{ID: "gh-getfund", JurisdictionCode: "GH", TaxType: TaxTypeServiceCharge, Name: "GETFund Levy", Rate: 2.5, Currency: "GHS", AppliesToCategory: "all", Priority: 3, EffectiveFrom: now, IsActive: true},
		{ID: "gh-covid-levy", JurisdictionCode: "GH", TaxType: TaxTypeServiceCharge, Name: "COVID-19 Health Levy", Rate: 1.0, Currency: "GHS", AppliesToCategory: "all", Priority: 4, EffectiveFrom: now, IsActive: true},
		{ID: "gh-tourism-levy", JurisdictionCode: "GH", TaxType: TaxTypeTourismLevy, Name: "Tourism Development Levy", Rate: 1.0, Currency: "GHS", AppliesToCategory: "accommodation", Priority: 5, EffectiveFrom: now, IsActive: true},
	}

	// South Africa
	s.rules["ZA"] = []TaxRule{
		{ID: "za-vat", JurisdictionCode: "ZA", TaxType: TaxTypeVAT, Name: "South Africa VAT", Rate: 15.0, Currency: "ZAR", AppliesToCategory: "all", Priority: 1, EffectiveFrom: now, IsActive: true},
		{ID: "za-tourism-levy", JurisdictionCode: "ZA", TaxType: TaxTypeTourismLevy, Name: "Tourism Marketing Levy", Rate: 1.0, Currency: "ZAR", AppliesToCategory: "accommodation", Priority: 2, EffectiveFrom: now, IsActive: true},
		{ID: "za-environmental", JurisdictionCode: "ZA", TaxType: TaxTypeEnvironmental, Name: "Environmental Levy", Rate: 0.5, Currency: "ZAR", AppliesToCategory: "experience", Priority: 3, EffectiveFrom: now, IsActive: true, ExemptCategories: []string{"food", "transport"}},
	}

	// Tanzania
	s.rules["TZ"] = []TaxRule{
		{ID: "tz-vat", JurisdictionCode: "TZ", TaxType: TaxTypeVAT, Name: "Tanzania VAT", Rate: 18.0, Currency: "TZS", AppliesToCategory: "all", Priority: 1, EffectiveFrom: now, IsActive: true},
		{ID: "tz-tourism-levy", JurisdictionCode: "TZ", TaxType: TaxTypeTourismLevy, Name: "Tourism Development Levy", Rate: 1.5, Currency: "TZS", AppliesToCategory: "all", Priority: 2, EffectiveFrom: now, IsActive: true},
		{ID: "tz-skills-levy", JurisdictionCode: "TZ", TaxType: TaxTypeServiceCharge, Name: "Skills & Development Levy", Rate: 4.5, Currency: "TZS", AppliesToCategory: "all", Priority: 3, EffectiveFrom: now, IsActive: true},
	}

	// Rwanda
	s.rules["RW"] = []TaxRule{
		{ID: "rw-vat", JurisdictionCode: "RW", TaxType: TaxTypeVAT, Name: "Rwanda VAT", Rate: 18.0, Currency: "RWF", AppliesToCategory: "all", Priority: 1, EffectiveFrom: now, IsActive: true},
		{ID: "rw-tourism-levy", JurisdictionCode: "RW", TaxType: TaxTypeTourismLevy, Name: "Rwanda Tourism Revenue Share", Rate: 5.0, Currency: "RWF", AppliesToCategory: "experience", Priority: 2, EffectiveFrom: now, IsActive: true},
	}

	// Ethiopia
	s.rules["ET"] = []TaxRule{
		{ID: "et-vat", JurisdictionCode: "ET", TaxType: TaxTypeVAT, Name: "Ethiopia VAT", Rate: 15.0, Currency: "ETB", AppliesToCategory: "all", Priority: 1, EffectiveFrom: now, IsActive: true},
		{ID: "et-turnover-tax", JurisdictionCode: "ET", TaxType: TaxTypeServiceCharge, Name: "Turnover Tax", Rate: 2.0, Currency: "ETB", AppliesToCategory: "all", Priority: 2, EffectiveFrom: now, IsActive: true},
	}

	// Morocco
	s.rules["MA"] = []TaxRule{
		{ID: "ma-vat", JurisdictionCode: "MA", TaxType: TaxTypeVAT, Name: "Morocco TVA", Rate: 20.0, Currency: "MAD", AppliesToCategory: "all", Priority: 1, EffectiveFrom: now, IsActive: true},
		{ID: "ma-city-tax", JurisdictionCode: "MA", TaxType: TaxTypeCityTax, Name: "City Tax (Taxe de Séjour)", FlatAmount: 25, Currency: "MAD", AppliesToCategory: "accommodation", Priority: 2, EffectiveFrom: now, IsActive: true},
		{ID: "ma-tourism-promotion", JurisdictionCode: "MA", TaxType: TaxTypeTourismLevy, Name: "Tourism Promotion Tax", Rate: 2.0, Currency: "MAD", AppliesToCategory: "accommodation", Priority: 3, EffectiveFrom: now, IsActive: true},
	}

	// Egypt
	s.rules["EG"] = []TaxRule{
		{ID: "eg-vat", JurisdictionCode: "EG", TaxType: TaxTypeVAT, Name: "Egypt VAT", Rate: 14.0, Currency: "EGP", AppliesToCategory: "all", Priority: 1, EffectiveFrom: now, IsActive: true},
		{ID: "eg-service-tax", JurisdictionCode: "EG", TaxType: TaxTypeServiceCharge, Name: "Service Tax", Rate: 12.0, Currency: "EGP", AppliesToCategory: "accommodation", Priority: 2, EffectiveFrom: now, IsActive: true},
	}

	// Uganda
	s.rules["UG"] = []TaxRule{
		{ID: "ug-vat", JurisdictionCode: "UG", TaxType: TaxTypeVAT, Name: "Uganda VAT", Rate: 18.0, Currency: "UGX", AppliesToCategory: "all", Priority: 1, EffectiveFrom: now, IsActive: true},
		{ID: "ug-tourism-levy", JurisdictionCode: "UG", TaxType: TaxTypeTourismLevy, Name: "Tourism Levy", Rate: 1.5, Currency: "UGX", AppliesToCategory: "accommodation", Priority: 2, EffectiveFrom: now, IsActive: true},
	}
}

// CalculateTax computes all applicable taxes for a transaction in a given jurisdiction
func (s *TaxEngineService) CalculateTax(jurisdictionCode, category, currency string, subTotal float64) TaxCalculation {
	now := time.Now().Unix()
	jurisdictionCode = strings.ToUpper(jurisdictionCode)
	category = strings.ToLower(category)

	rules, exists := s.rules[jurisdictionCode]
	if !exists {
		return TaxCalculation{
			SubTotal:     subTotal,
			TotalTax:     0,
			GrandTotal:   subTotal,
			Breakdown:    []TaxLineItem{},
			Jurisdiction: jurisdictionCode,
			Currency:     currency,
			CalculatedAt: now,
			ReceiptNumber: generateTaxReceipt(jurisdictionCode),
		}
	}

	var applicableRules []TaxRule
	for _, rule := range rules {
		if !rule.IsActive {
			continue
		}
		if rule.EffectiveFrom > now {
			continue
		}
		if rule.EffectiveUntil > 0 && rule.EffectiveUntil < now {
			continue
		}
		if rule.MinAmount > 0 && subTotal < rule.MinAmount {
			continue
		}
		if rule.AppliesToCategory != "all" && rule.AppliesToCategory != category {
			continue
		}
		if isExempt(category, rule.ExemptCategories) {
			continue
		}
		applicableRules = append(applicableRules, rule)
	}

	// Sort by priority
	for i := 0; i < len(applicableRules)-1; i++ {
		for j := i + 1; j < len(applicableRules); j++ {
			if applicableRules[j].Priority < applicableRules[i].Priority {
				applicableRules[i], applicableRules[j] = applicableRules[j], applicableRules[i]
			}
		}
	}

	var breakdown []TaxLineItem
	totalTax := 0.0
	runningBase := subTotal

	for _, rule := range applicableRules {
		taxableBase := runningBase
		if rule.MaxAmount > 0 && taxableBase > rule.MaxAmount {
			taxableBase = rule.MaxAmount
		}

		var taxAmount float64
		if rule.FlatAmount > 0 {
			taxAmount = rule.FlatAmount
		} else {
			taxAmount = roundTo2(taxableBase * rule.Rate / 100.0)
		}

		breakdown = append(breakdown, TaxLineItem{
			TaxType:     rule.TaxType,
			Name:        rule.Name,
			Rate:        rule.Rate,
			TaxableBase: taxableBase,
			Amount:      taxAmount,
			IsCompound:  rule.IsCompound,
		})

		totalTax += taxAmount
		if rule.IsCompound {
			runningBase += taxAmount
		}
	}

	result := TaxCalculation{
		SubTotal:      subTotal,
		TotalTax:      roundTo2(totalTax),
		GrandTotal:    roundTo2(subTotal + totalTax),
		Breakdown:     breakdown,
		Jurisdiction:  jurisdictionCode,
		Currency:      currency,
		CalculatedAt:  now,
		ReceiptNumber: generateTaxReceipt(jurisdictionCode),
	}

	// Persist to PostgreSQL
	if database.DB != nil {
		database.DB.Exec(
			"INSERT INTO tax_calculations (id, jurisdiction, category, subtotal, tax_total, currency, receipt_number) VALUES ($1,$2,$3,$4,$5,$6,$7)",
			result.ReceiptNumber, jurisdictionCode, category, subTotal, result.TotalTax, currency, result.ReceiptNumber,
		)
	}

	return result
}

// GetRules returns all rules for a jurisdiction
func (s *TaxEngineService) GetRules(jurisdictionCode string) []TaxRule {
	jurisdictionCode = strings.ToUpper(jurisdictionCode)
	rules, exists := s.rules[jurisdictionCode]
	if !exists {
		return []TaxRule{}
	}
	return rules
}

// GetSupportedJurisdictions returns all configured jurisdiction codes
func (s *TaxEngineService) GetSupportedJurisdictions() []JurisdictionInfo {
	var result []JurisdictionInfo
	names := map[string]string{
		"NG": "Nigeria", "KE": "Kenya", "GH": "Ghana", "ZA": "South Africa",
		"TZ": "Tanzania", "RW": "Rwanda", "ET": "Ethiopia", "MA": "Morocco",
		"EG": "Egypt", "UG": "Uganda",
	}
	currencies := map[string]string{
		"NG": "NGN", "KE": "KES", "GH": "GHS", "ZA": "ZAR",
		"TZ": "TZS", "RW": "RWF", "ET": "ETB", "MA": "MAD",
		"EG": "EGP", "UG": "UGX",
	}
	for code, rules := range s.rules {
		name := names[code]
		if name == "" {
			name = code
		}
		currency := currencies[code]
		if currency == "" {
			currency = "USD"
		}
		totalVAT := 0.0
		for _, r := range rules {
			if r.TaxType == TaxTypeVAT {
				totalVAT = r.Rate
				break
			}
		}
		result = append(result, JurisdictionInfo{
			Code:       code,
			Name:       name,
			Currency:   currency,
			VATRate:    totalVAT,
			RuleCount:  len(rules),
		})
	}
	return result
}

// AddRule adds a custom tax rule (for runtime jurisdiction configuration)
func (s *TaxEngineService) AddRule(rule TaxRule) {
	code := strings.ToUpper(rule.JurisdictionCode)
	s.rules[code] = append(s.rules[code], rule)
}

// GetRemittanceSummary computes what's owed per jurisdiction/period
func (s *TaxEngineService) GetRemittanceSummary(jurisdictionCode string) []TaxRemittance {
	jurisdictionCode = strings.ToUpper(jurisdictionCode)
	now := time.Now()
	currentPeriod := fmt.Sprintf("%d-Q%d", now.Year(), (now.Month()-1)/3+1)
	currentMonth := now.Format("2006-01")

	rules, exists := s.rules[jurisdictionCode]
	if !exists {
		return []TaxRemittance{}
	}

	var remittances []TaxRemittance
	seenTypes := make(map[TaxType]bool)
	for _, rule := range rules {
		if seenTypes[rule.TaxType] {
			continue
		}
		seenTypes[rule.TaxType] = true

		period := currentPeriod
		if rule.TaxType == TaxTypeVAT {
			period = currentMonth
		}

		remittances = append(remittances, TaxRemittance{
			ID:               fmt.Sprintf("rem-%s-%s-%s", jurisdictionCode, rule.TaxType, period),
			JurisdictionCode: jurisdictionCode,
			TaxType:          rule.TaxType,
			Period:           period,
			TotalCollected:   0,
			TotalRemitted:    0,
			Currency:         rule.Currency,
			Status:           "pending",
			DueDate:          getNextDueDate(rule.TaxType, now),
			TransactionCount: 0,
		})
	}
	return remittances
}

// JurisdictionInfo provides summary info about a supported jurisdiction
type JurisdictionInfo struct {
	Code      string  `json:"code"`
	Name      string  `json:"name"`
	Currency  string  `json:"currency"`
	VATRate   float64 `json:"vat_rate"`
	RuleCount int     `json:"rule_count"`
}

func isExempt(category string, exemptions []string) bool {
	for _, e := range exemptions {
		if strings.EqualFold(e, category) {
			return true
		}
	}
	return false
}

func roundTo2(v float64) float64 {
	return math.Round(v*100) / 100
}

func generateTaxReceipt(jurisdiction string) string {
	ts := time.Now().UnixNano() / 1000000
	return fmt.Sprintf("TAX-%s-%d", jurisdiction, ts)
}

func getNextDueDate(taxType TaxType, now time.Time) int64 {
	switch taxType {
	case TaxTypeVAT:
		// VAT due 21st of following month
		next := time.Date(now.Year(), now.Month()+1, 21, 0, 0, 0, 0, time.UTC)
		return next.Unix()
	case TaxTypeTourismLevy:
		// Tourism levy due end of quarter
		quarterEnd := time.Date(now.Year(), ((now.Month()-1)/3+1)*3+1, 1, 0, 0, 0, 0, time.UTC).Add(-24 * time.Hour)
		return quarterEnd.Add(30 * 24 * time.Hour).Unix()
	default:
		// Default: end of following month
		next := time.Date(now.Year(), now.Month()+2, 1, 0, 0, 0, 0, time.UTC).Add(-24 * time.Hour)
		return next.Unix()
	}
}
