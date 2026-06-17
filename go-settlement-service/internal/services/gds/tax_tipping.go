// GDS Tax & Tipping Integration — Applies per-jurisdiction taxes to bookings
// and enables post-checkout staff tipping through the GDS system.
// Integrates with TaxEngine (PR#15), TippingService (PR#15/16), and Remittance (PR#17)
package gds

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"sync"
	"time"
)

// ─── GDS Tax Types ───────────────────────────────────────────────────────────

// GDSTaxConfig holds tax rules for a jurisdiction applied to GDS bookings
type GDSTaxConfig struct {
	CountryCode    string        `json:"countryCode"`
	CountryName    string        `json:"countryName"`
	TaxRules       []GDSTaxRule  `json:"taxRules"`
	TourismLevy    float64       `json:"tourismLevy"`    // % tourism levy on accommodation
	ServiceCharge  float64       `json:"serviceCharge"`  // % mandatory service charge
	TotalEffective float64       `json:"totalEffective"` // combined effective tax rate
}

// GDSTaxRule defines a single tax component
type GDSTaxRule struct {
	Name           string  `json:"name"`
	Code           string  `json:"code"`
	Rate           float64 `json:"rate"`           // percentage
	AppliesTo      string  `json:"appliesTo"`      // accommodation, food, activity, all
	Compound       bool    `json:"compound"`       // applied on top of previous taxes
	Priority       int     `json:"priority"`       // calculation order
	Authority      string  `json:"authority"`      // tax authority name
	RemittanceCycle string `json:"remittanceCycle"` // monthly, quarterly
}

// GDSTaxBreakdown shows calculated taxes for a booking
type GDSTaxBreakdown struct {
	BookingAmount   float64         `json:"bookingAmount"`
	Currency        string          `json:"currency"`
	Components      []TaxComponent  `json:"components"`
	TotalTax        float64         `json:"totalTax"`
	GrandTotal      float64         `json:"grandTotal"`
	EffectiveRate   float64         `json:"effectiveRate"`
	Country         string          `json:"country"`
	RemittanceDue   string          `json:"remittanceDue"`
}

// TaxComponent is a single line in the tax breakdown
type TaxComponent struct {
	Name     string  `json:"name"`
	Code     string  `json:"code"`
	Rate     float64 `json:"rate"`
	Amount   float64 `json:"amount"`
	Basis    float64 `json:"basis"`    // amount tax was calculated on
	Authority string `json:"authority"`
}

// ─── GDS Tipping Types ───────────────────────────────────────────────────────

// GDSStaffRole represents a staff role at a property
type GDSStaffRole struct {
	Code          string  `json:"code"`
	Name          string  `json:"name"`
	SuggestedPct  float64 `json:"suggestedPct"`  // suggested tip percentage
	Category      string  `json:"category"`       // front_desk, housekeeping, concierge, etc.
}

// GDSTipRequest is a post-checkout tipping request
type GDSTipRequest struct {
	ReservationID string          `json:"reservationId"`
	PropertyID    string          `json:"propertyId"`
	GuestID       string          `json:"guestId"`
	TotalAmount   float64         `json:"totalAmount"`
	Currency      string          `json:"currency"`
	Recipients    []GDSTipRecipient `json:"recipients"`
	SplitMode     string          `json:"splitMode"` // equal, custom_amount, custom_percent
	Message       string          `json:"message,omitempty"`
}

// GDSTipRecipient is a single staff member receiving a tip
type GDSTipRecipient struct {
	StaffRole   string  `json:"staffRole"`
	StaffName   string  `json:"staffName,omitempty"`
	Amount      float64 `json:"amount"`
	Percentage  float64 `json:"percentage,omitempty"`
	WalletID    string  `json:"walletId,omitempty"`
}

// GDSTipResult is the outcome of a multi-recipient tip
type GDSTipResult struct {
	TipGroupID    string          `json:"tipGroupId"`
	ReservationID string          `json:"reservationId"`
	TotalTipped   float64         `json:"totalTipped"`
	Currency      string          `json:"currency"`
	Recipients    []GDSTipRecipient `json:"recipients"`
	Status        string          `json:"status"`
	ProcessedAt   time.Time       `json:"processedAt"`
}

// ─── GDS Tax Engine ──────────────────────────────────────────────────────────

// GDSTaxEngine calculates jurisdiction-specific taxes for GDS bookings
type GDSTaxEngine struct {
	mu      sync.RWMutex
	configs map[string]*GDSTaxConfig // country code → config
}

// NewGDSTaxEngine creates a tax engine with all African jurisdiction configs
func NewGDSTaxEngine() *GDSTaxEngine {
	engine := &GDSTaxEngine{
		configs: make(map[string]*GDSTaxConfig),
	}
	engine.loadJurisdictions()
	return engine
}

func (te *GDSTaxEngine) loadJurisdictions() {
	te.configs["NG"] = &GDSTaxConfig{
		CountryCode: "NG", CountryName: "Nigeria",
		TourismLevy: 5.0, ServiceCharge: 5.0,
		TaxRules: []GDSTaxRule{
			{Name: "VAT", Code: "NG_VAT", Rate: 7.5, AppliesTo: "all", Priority: 1, Authority: "FIRS", RemittanceCycle: "monthly"},
			{Name: "Consumption Tax", Code: "NG_CT", Rate: 5.0, AppliesTo: "food", Priority: 2, Authority: "LIRS", RemittanceCycle: "monthly"},
			{Name: "Tourism Development Levy", Code: "NG_TDL", Rate: 5.0, AppliesTo: "accommodation", Priority: 3, Authority: "NTDC", RemittanceCycle: "quarterly"},
		},
		TotalEffective: 17.5,
	}
	te.configs["KE"] = &GDSTaxConfig{
		CountryCode: "KE", CountryName: "Kenya",
		TourismLevy: 2.0, ServiceCharge: 0.0,
		TaxRules: []GDSTaxRule{
			{Name: "VAT", Code: "KE_VAT", Rate: 16.0, AppliesTo: "all", Priority: 1, Authority: "KRA", RemittanceCycle: "monthly"},
			{Name: "Catering Levy", Code: "KE_CL", Rate: 2.0, AppliesTo: "food", Priority: 2, Authority: "KRA", RemittanceCycle: "monthly"},
			{Name: "Tourism Fund Levy", Code: "KE_TFL", Rate: 2.0, AppliesTo: "accommodation", Priority: 3, Authority: "Tourism Fund", RemittanceCycle: "quarterly"},
		},
		TotalEffective: 20.0,
	}
	te.configs["GH"] = &GDSTaxConfig{
		CountryCode: "GH", CountryName: "Ghana",
		TourismLevy: 1.0, ServiceCharge: 0.0,
		TaxRules: []GDSTaxRule{
			{Name: "VAT", Code: "GH_VAT", Rate: 15.0, AppliesTo: "all", Priority: 1, Authority: "GRA", RemittanceCycle: "monthly"},
			{Name: "NHIL", Code: "GH_NHIL", Rate: 2.5, AppliesTo: "all", Priority: 2, Authority: "GRA", RemittanceCycle: "monthly"},
			{Name: "GETFund Levy", Code: "GH_GET", Rate: 2.5, AppliesTo: "all", Priority: 3, Authority: "GRA", RemittanceCycle: "monthly"},
			{Name: "Tourism Levy", Code: "GH_TL", Rate: 1.0, AppliesTo: "accommodation", Priority: 4, Authority: "GTA", RemittanceCycle: "quarterly"},
		},
		TotalEffective: 21.0,
	}
	te.configs["ZA"] = &GDSTaxConfig{
		CountryCode: "ZA", CountryName: "South Africa",
		TourismLevy: 1.0, ServiceCharge: 0.0,
		TaxRules: []GDSTaxRule{
			{Name: "VAT", Code: "ZA_VAT", Rate: 15.0, AppliesTo: "all", Priority: 1, Authority: "SARS", RemittanceCycle: "monthly"},
			{Name: "Tourism Levy", Code: "ZA_TL", Rate: 1.0, AppliesTo: "accommodation", Priority: 2, Authority: "NDT", RemittanceCycle: "quarterly"},
		},
		TotalEffective: 16.0,
	}
	te.configs["TZ"] = &GDSTaxConfig{
		CountryCode: "TZ", CountryName: "Tanzania",
		TourismLevy: 0.0, ServiceCharge: 0.0,
		TaxRules: []GDSTaxRule{
			{Name: "VAT", Code: "TZ_VAT", Rate: 18.0, AppliesTo: "all", Priority: 1, Authority: "TRA", RemittanceCycle: "monthly"},
			{Name: "Skills Development Levy", Code: "TZ_SDL", Rate: 4.5, AppliesTo: "all", Priority: 2, Authority: "TRA", RemittanceCycle: "monthly"},
			{Name: "Service Levy", Code: "TZ_SL", Rate: 0.3, AppliesTo: "accommodation", Priority: 3, Authority: "LGA", RemittanceCycle: "quarterly"},
		},
		TotalEffective: 22.8,
	}
	te.configs["RW"] = &GDSTaxConfig{
		CountryCode: "RW", CountryName: "Rwanda",
		TourismLevy: 0.0, ServiceCharge: 0.0,
		TaxRules: []GDSTaxRule{
			{Name: "VAT", Code: "RW_VAT", Rate: 18.0, AppliesTo: "all", Priority: 1, Authority: "RRA", RemittanceCycle: "monthly"},
			{Name: "Infrastructure Levy", Code: "RW_IL", Rate: 1.5, AppliesTo: "accommodation", Priority: 2, Authority: "RDB", RemittanceCycle: "quarterly"},
		},
		TotalEffective: 19.5,
	}
	te.configs["EG"] = &GDSTaxConfig{
		CountryCode: "EG", CountryName: "Egypt",
		TourismLevy: 0.0, ServiceCharge: 12.0,
		TaxRules: []GDSTaxRule{
			{Name: "VAT", Code: "EG_VAT", Rate: 14.0, AppliesTo: "all", Priority: 1, Authority: "ETA", RemittanceCycle: "monthly"},
			{Name: "Service Charge", Code: "EG_SC", Rate: 12.0, AppliesTo: "all", Priority: 2, Authority: "ETA", RemittanceCycle: "monthly"},
			{Name: "Municipal Tax", Code: "EG_MT", Rate: 1.0, AppliesTo: "accommodation", Priority: 3, Authority: "Municipality", RemittanceCycle: "quarterly"},
		},
		TotalEffective: 27.0,
	}
	te.configs["MA"] = &GDSTaxConfig{
		CountryCode: "MA", CountryName: "Morocco",
		TourismLevy: 0.0, ServiceCharge: 0.0,
		TaxRules: []GDSTaxRule{
			{Name: "VAT (Hospitality)", Code: "MA_VAT", Rate: 10.0, AppliesTo: "accommodation", Priority: 1, Authority: "DGI", RemittanceCycle: "monthly"},
			{Name: "VAT (Food)", Code: "MA_VAT_F", Rate: 10.0, AppliesTo: "food", Priority: 1, Authority: "DGI", RemittanceCycle: "monthly"},
			{Name: "Tourism Tax", Code: "MA_TT", Rate: 0.0, AppliesTo: "accommodation", Priority: 2, Authority: "Municipality", RemittanceCycle: "quarterly"},
		},
		TotalEffective: 10.0,
	}
	te.configs["UG"] = &GDSTaxConfig{
		CountryCode: "UG", CountryName: "Uganda",
		TourismLevy: 0.0, ServiceCharge: 0.0,
		TaxRules: []GDSTaxRule{
			{Name: "VAT", Code: "UG_VAT", Rate: 18.0, AppliesTo: "all", Priority: 1, Authority: "URA", RemittanceCycle: "monthly"},
			{Name: "Tourism Levy", Code: "UG_TL", Rate: 1.5, AppliesTo: "accommodation", Priority: 2, Authority: "UTB", RemittanceCycle: "quarterly"},
		},
		TotalEffective: 19.5,
	}
	te.configs["ET"] = &GDSTaxConfig{
		CountryCode: "ET", CountryName: "Ethiopia",
		TourismLevy: 0.0, ServiceCharge: 10.0,
		TaxRules: []GDSTaxRule{
			{Name: "VAT", Code: "ET_VAT", Rate: 15.0, AppliesTo: "all", Priority: 1, Authority: "MoR", RemittanceCycle: "monthly"},
			{Name: "Service Charge", Code: "ET_SC", Rate: 10.0, AppliesTo: "food", Priority: 2, Authority: "MoR", RemittanceCycle: "monthly"},
			{Name: "TOT", Code: "ET_TOT", Rate: 2.0, AppliesTo: "all", Compound: true, Priority: 3, Authority: "MoR", RemittanceCycle: "monthly"},
		},
		TotalEffective: 27.0,
	}
	te.configs["BW"] = &GDSTaxConfig{
		CountryCode: "BW", CountryName: "Botswana",
		TourismLevy: 0.0, ServiceCharge: 0.0,
		TaxRules: []GDSTaxRule{
			{Name: "VAT", Code: "BW_VAT", Rate: 14.0, AppliesTo: "all", Priority: 1, Authority: "BURS", RemittanceCycle: "monthly"},
			{Name: "Tourism Levy", Code: "BW_TL", Rate: 1.0, AppliesTo: "accommodation", Priority: 2, Authority: "BTO", RemittanceCycle: "quarterly"},
		},
		TotalEffective: 15.0,
	}
	te.configs["NA"] = &GDSTaxConfig{
		CountryCode: "NA", CountryName: "Namibia",
		TourismLevy: 2.0, ServiceCharge: 0.0,
		TaxRules: []GDSTaxRule{
			{Name: "VAT", Code: "NA_VAT", Rate: 15.0, AppliesTo: "all", Priority: 1, Authority: "NamRA", RemittanceCycle: "monthly"},
			{Name: "Tourism Levy", Code: "NA_TL", Rate: 2.0, AppliesTo: "accommodation", Priority: 2, Authority: "NTB", RemittanceCycle: "quarterly"},
		},
		TotalEffective: 17.0,
	}
	te.configs["ZW"] = &GDSTaxConfig{
		CountryCode: "ZW", CountryName: "Zimbabwe",
		TourismLevy: 2.0, ServiceCharge: 0.0,
		TaxRules: []GDSTaxRule{
			{Name: "VAT", Code: "ZW_VAT", Rate: 15.0, AppliesTo: "all", Priority: 1, Authority: "ZIMRA", RemittanceCycle: "monthly"},
			{Name: "Tourism Levy", Code: "ZW_TL", Rate: 2.0, AppliesTo: "accommodation", Priority: 2, Authority: "ZTA", RemittanceCycle: "quarterly"},
		},
		TotalEffective: 17.0,
	}
	te.configs["MU"] = &GDSTaxConfig{
		CountryCode: "MU", CountryName: "Mauritius",
		TourismLevy: 0.0, ServiceCharge: 0.0,
		TaxRules: []GDSTaxRule{
			{Name: "VAT", Code: "MU_VAT", Rate: 15.0, AppliesTo: "all", Priority: 1, Authority: "MRA", RemittanceCycle: "monthly"},
			{Name: "Environment Fee", Code: "MU_EF", Rate: 0.85, AppliesTo: "accommodation", Priority: 2, Authority: "MRA", RemittanceCycle: "quarterly"},
		},
		TotalEffective: 15.85,
	}
	te.configs["MZ"] = &GDSTaxConfig{
		CountryCode: "MZ", CountryName: "Mozambique",
		TourismLevy: 0.0, ServiceCharge: 0.0,
		TaxRules: []GDSTaxRule{
			{Name: "IVA", Code: "MZ_IVA", Rate: 16.0, AppliesTo: "all", Priority: 1, Authority: "AT", RemittanceCycle: "monthly"},
			{Name: "Tourism Tax", Code: "MZ_TT", Rate: 3.0, AppliesTo: "accommodation", Priority: 2, Authority: "INATUR", RemittanceCycle: "quarterly"},
		},
		TotalEffective: 19.0,
	}
}

// CalculateTax computes the full tax breakdown for a GDS booking
func (te *GDSTaxEngine) CalculateTax(ctx context.Context, countryCode string, amount float64, currency string, bookingType string) (*GDSTaxBreakdown, error) {
	te.mu.RLock()
	config, ok := te.configs[countryCode]
	te.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("no tax config for country: %s", countryCode)
	}

	breakdown := &GDSTaxBreakdown{
		BookingAmount: amount,
		Currency:      currency,
		Country:       config.CountryName,
	}

	runningBasis := amount
	var totalTax float64

	for _, rule := range config.TaxRules {
		if rule.AppliesTo != "all" && rule.AppliesTo != bookingType {
			continue
		}

		basis := runningBasis
		if rule.Compound {
			basis = amount + totalTax
		}

		taxAmount := math.Round(basis*rule.Rate) / 100

		breakdown.Components = append(breakdown.Components, TaxComponent{
			Name:      rule.Name,
			Code:      rule.Code,
			Rate:      rule.Rate,
			Amount:    taxAmount,
			Basis:     basis,
			Authority: rule.Authority,
		})

		totalTax += taxAmount
	}

	breakdown.TotalTax = math.Round(totalTax*100) / 100
	breakdown.GrandTotal = math.Round((amount+totalTax)*100) / 100
	breakdown.EffectiveRate = math.Round(totalTax/amount*10000) / 100

	// Calculate next remittance due date
	now := time.Now()
	nextMonth := time.Date(now.Year(), now.Month()+1, 21, 0, 0, 0, 0, time.UTC)
	breakdown.RemittanceDue = nextMonth.Format("2006-01-02")

	log.Printf("[GDS-Tax] %s booking %s %.2f: tax %.2f (%.1f%%), grand total %.2f",
		countryCode, currency, amount, totalTax, breakdown.EffectiveRate, breakdown.GrandTotal)

	return breakdown, nil
}

// GetJurisdictionConfig returns tax config for a country
func (te *GDSTaxEngine) GetJurisdictionConfig(countryCode string) (*GDSTaxConfig, error) {
	te.mu.RLock()
	defer te.mu.RUnlock()

	config, ok := te.configs[countryCode]
	if !ok {
		return nil, fmt.Errorf("no tax config for country: %s", countryCode)
	}
	return config, nil
}

// ListJurisdictions returns all configured tax jurisdictions
func (te *GDSTaxEngine) ListJurisdictions() []*GDSTaxConfig {
	te.mu.RLock()
	defer te.mu.RUnlock()

	var configs []*GDSTaxConfig
	for _, c := range te.configs {
		configs = append(configs, c)
	}
	return configs
}

// ─── GDS Tipping Engine ──────────────────────────────────────────────────────

// GDSTippingEngine handles post-checkout tipping at GDS properties
type GDSTippingEngine struct {
	mu        sync.RWMutex
	tipGroups map[string]*GDSTipResult
	staffRoles map[string][]GDSStaffRole // property type → roles
}

// NewGDSTippingEngine creates a tipping engine with role templates
func NewGDSTippingEngine() *GDSTippingEngine {
	engine := &GDSTippingEngine{
		tipGroups:  make(map[string]*GDSTipResult),
		staffRoles: make(map[string][]GDSStaffRole),
	}
	engine.loadStaffRoles()
	return engine
}

func (tip *GDSTippingEngine) loadStaffRoles() {
	tip.staffRoles["hotel"] = []GDSStaffRole{
		{Code: "front_desk", Name: "Front Desk", SuggestedPct: 5.0, Category: "reception"},
		{Code: "housekeeping", Name: "Housekeeping", SuggestedPct: 10.0, Category: "housekeeping"},
		{Code: "concierge", Name: "Concierge", SuggestedPct: 8.0, Category: "concierge"},
		{Code: "bellhop", Name: "Bellhop/Porter", SuggestedPct: 5.0, Category: "porter"},
		{Code: "room_service", Name: "Room Service", SuggestedPct: 7.0, Category: "food"},
		{Code: "valet", Name: "Valet Parking", SuggestedPct: 3.0, Category: "transport"},
	}
	tip.staffRoles["lodge"] = []GDSStaffRole{
		{Code: "guide", Name: "Safari Guide", SuggestedPct: 15.0, Category: "guide"},
		{Code: "tracker", Name: "Tracker", SuggestedPct: 10.0, Category: "guide"},
		{Code: "camp_manager", Name: "Camp Manager", SuggestedPct: 8.0, Category: "management"},
		{Code: "housekeeping", Name: "Housekeeping", SuggestedPct: 7.0, Category: "housekeeping"},
		{Code: "chef", Name: "Chef", SuggestedPct: 5.0, Category: "food"},
	}
	tip.staffRoles["safari_camp"] = []GDSStaffRole{
		{Code: "lead_guide", Name: "Lead Guide", SuggestedPct: 20.0, Category: "guide"},
		{Code: "tracker", Name: "Tracker", SuggestedPct: 12.0, Category: "guide"},
		{Code: "driver", Name: "Driver", SuggestedPct: 10.0, Category: "transport"},
		{Code: "camp_staff", Name: "Camp Staff", SuggestedPct: 8.0, Category: "general"},
	}
	tip.staffRoles["resort"] = []GDSStaffRole{
		{Code: "front_desk", Name: "Front Desk", SuggestedPct: 5.0, Category: "reception"},
		{Code: "housekeeping", Name: "Housekeeping", SuggestedPct: 8.0, Category: "housekeeping"},
		{Code: "spa_therapist", Name: "Spa Therapist", SuggestedPct: 15.0, Category: "wellness"},
		{Code: "waiter", Name: "Restaurant Staff", SuggestedPct: 10.0, Category: "food"},
		{Code: "pool_attendant", Name: "Pool Attendant", SuggestedPct: 5.0, Category: "leisure"},
	}
	tip.staffRoles["guesthouse"] = []GDSStaffRole{
		{Code: "host", Name: "Host/Owner", SuggestedPct: 10.0, Category: "management"},
		{Code: "cleaner", Name: "Cleaning Staff", SuggestedPct: 8.0, Category: "housekeeping"},
		{Code: "cook", Name: "Cook", SuggestedPct: 7.0, Category: "food"},
	}
	tip.staffRoles["activity"] = []GDSStaffRole{
		{Code: "guide", Name: "Activity Guide", SuggestedPct: 15.0, Category: "guide"},
		{Code: "instructor", Name: "Instructor", SuggestedPct: 12.0, Category: "instruction"},
		{Code: "driver", Name: "Driver", SuggestedPct: 8.0, Category: "transport"},
		{Code: "assistant", Name: "Assistant", SuggestedPct: 5.0, Category: "general"},
	}
}

// SuggestStaffRoles returns suggested tip recipients for a property type
func (tip *GDSTippingEngine) SuggestStaffRoles(propertyType string) []GDSStaffRole {
	tip.mu.RLock()
	defer tip.mu.RUnlock()

	roles, ok := tip.staffRoles[propertyType]
	if !ok {
		return tip.staffRoles["hotel"]
	}
	return roles
}

// ProcessTip processes a multi-recipient tip for a GDS reservation
func (tip *GDSTippingEngine) ProcessTip(ctx context.Context, req *GDSTipRequest) (*GDSTipResult, error) {
	if len(req.Recipients) == 0 {
		return nil, fmt.Errorf("at least one recipient required")
	}
	if len(req.Recipients) > 20 {
		return nil, fmt.Errorf("maximum 20 recipients per tip")
	}
	if req.TotalAmount <= 0 {
		return nil, fmt.Errorf("tip amount must be positive")
	}

	tip.mu.Lock()
	defer tip.mu.Unlock()

	// Distribute based on split mode
	switch req.SplitMode {
	case "equal":
		perPerson := math.Round(req.TotalAmount/float64(len(req.Recipients))*100) / 100
		for i := range req.Recipients {
			req.Recipients[i].Amount = perPerson
		}
	case "custom_percent":
		var totalPct float64
		for _, r := range req.Recipients {
			totalPct += r.Percentage
		}
		if math.Abs(totalPct-100.0) > 0.01 {
			return nil, fmt.Errorf("percentages must sum to 100%%, got %.2f%%", totalPct)
		}
		for i, r := range req.Recipients {
			req.Recipients[i].Amount = math.Round(req.TotalAmount*r.Percentage) / 100
		}
	case "custom_amount":
		var totalAlloc float64
		for _, r := range req.Recipients {
			totalAlloc += r.Amount
		}
		if math.Abs(totalAlloc-req.TotalAmount) > 0.01 {
			return nil, fmt.Errorf("amounts must sum to %.2f, got %.2f", req.TotalAmount, totalAlloc)
		}
	default:
		return nil, fmt.Errorf("invalid split mode: %s", req.SplitMode)
	}

	result := &GDSTipResult{
		TipGroupID:    generateID("gdstip"),
		ReservationID: req.ReservationID,
		TotalTipped:   req.TotalAmount,
		Currency:      req.Currency,
		Recipients:    req.Recipients,
		Status:        "processed",
		ProcessedAt:   time.Now(),
	}

	tip.tipGroups[result.TipGroupID] = result

	log.Printf("[GDS-Tip] Processed tip %s: %.2f %s to %d recipients for reservation %s",
		result.TipGroupID, req.TotalAmount, req.Currency, len(req.Recipients), req.ReservationID)

	return result, nil
}

// ─── GDS Loyalty Integration ─────────────────────────────────────────────────

// GDSLoyaltyConfig defines how GDS bookings earn loyalty points
type GDSLoyaltyConfig struct {
	BasePointsPerUSD     float64              `json:"basePointsPerUsd"`     // points earned per USD spent
	TierMultipliers      map[string]float64   `json:"tierMultipliers"`      // agent tier → multiplier
	PropertyBonuses      map[string]float64   `json:"propertyBonuses"`      // property type → bonus multiplier
	BookingTypeMultiplier map[string]float64  `json:"bookingTypeMultiplier"` // direct/gds/package → multiplier
}

// GDSLoyaltyEarning represents points earned from a GDS booking
type GDSLoyaltyEarning struct {
	BookingID      string  `json:"bookingId"`
	GuestID        string  `json:"guestId"`
	BasePoints     int     `json:"basePoints"`
	BonusPoints    int     `json:"bonusPoints"`
	TotalPoints    int     `json:"totalPoints"`
	Multiplier     float64 `json:"multiplier"`
	Reason         string  `json:"reason"`
	ExpiresAt      string  `json:"expiresAt"`
}

// GDSLoyaltyEngine manages loyalty point earning for GDS bookings
type GDSLoyaltyEngine struct {
	config GDSLoyaltyConfig
}

// NewGDSLoyaltyEngine creates a loyalty engine with standard config
func NewGDSLoyaltyEngine() *GDSLoyaltyEngine {
	return &GDSLoyaltyEngine{
		config: GDSLoyaltyConfig{
			BasePointsPerUSD: 15, // 15 points per USD (higher than QR payment's 10)
			TierMultipliers: map[string]float64{
				"bronze":   1.0,
				"silver":   1.5,
				"gold":     2.0,
				"platinum": 3.0,
			},
			PropertyBonuses: map[string]float64{
				"hotel":       1.0,
				"lodge":       1.5,
				"safari_camp": 2.0,
				"resort":      1.5,
				"boutique":    1.2,
				"villa":       1.3,
				"activity":    1.8,
			},
			BookingTypeMultiplier: map[string]float64{
				"direct":  1.0,
				"gds":     1.2,
				"package": 1.5,
			},
		},
	}
}

// CalculateEarning computes loyalty points for a GDS booking
func (le *GDSLoyaltyEngine) CalculateEarning(bookingID string, guestID string, amountUSD float64, agentTier string, propertyType string, bookingType string) *GDSLoyaltyEarning {
	basePoints := int(amountUSD * le.config.BasePointsPerUSD)

	tierMult := le.config.TierMultipliers[agentTier]
	if tierMult == 0 {
		tierMult = 1.0
	}

	propBonus := le.config.PropertyBonuses[propertyType]
	if propBonus == 0 {
		propBonus = 1.0
	}

	bookingMult := le.config.BookingTypeMultiplier[bookingType]
	if bookingMult == 0 {
		bookingMult = 1.0
	}

	totalMultiplier := tierMult * propBonus * bookingMult
	bonusPoints := int(float64(basePoints) * (totalMultiplier - 1.0))
	totalPoints := basePoints + bonusPoints

	expiresAt := time.Now().AddDate(1, 0, 0).Format("2006-01-02")

	return &GDSLoyaltyEarning{
		BookingID:   bookingID,
		GuestID:     guestID,
		BasePoints:  basePoints,
		BonusPoints: bonusPoints,
		TotalPoints: totalPoints,
		Multiplier:  totalMultiplier,
		Reason:      fmt.Sprintf("GDS booking at %s (tier: %s, type: %s)", propertyType, agentTier, bookingType),
		ExpiresAt:   expiresAt,
	}
}

// ─── HTTP Handlers for Tax/Tipping/Loyalty ───────────────────────────────────

// RegisterTaxTipRoutes adds tax, tipping, and loyalty endpoints to the GDS API
func RegisterTaxTipRoutes(mux *http.ServeMux, taxEngine *GDSTaxEngine, tipEngine *GDSTippingEngine, loyaltyEngine *GDSLoyaltyEngine) {
	// Tax endpoints
	mux.HandleFunc("/api/v1/gds/tax/calculate", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		country := q.Get("country")
		amount := parseFloat(q.Get("amount"))
		currency := q.Get("currency")
		bookingType := q.Get("type")
		if bookingType == "" {
			bookingType = "accommodation"
		}

		breakdown, err := taxEngine.CalculateTax(r.Context(), country, amount, currency, bookingType)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, breakdown)
	})

	mux.HandleFunc("/api/v1/gds/tax/jurisdictions", func(w http.ResponseWriter, r *http.Request) {
		configs := taxEngine.ListJurisdictions()
		writeJSON(w, http.StatusOK, map[string]interface{}{"jurisdictions": configs, "total": len(configs)})
	})

	mux.HandleFunc("/api/v1/gds/tax/config", func(w http.ResponseWriter, r *http.Request) {
		country := r.URL.Query().Get("country")
		config, err := taxEngine.GetJurisdictionConfig(country)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, config)
	})

	// Tipping endpoints
	mux.HandleFunc("/api/v1/gds/tipping/roles", func(w http.ResponseWriter, r *http.Request) {
		propertyType := r.URL.Query().Get("propertyType")
		if propertyType == "" {
			propertyType = "hotel"
		}
		roles := tipEngine.SuggestStaffRoles(propertyType)
		writeJSON(w, http.StatusOK, map[string]interface{}{"roles": roles, "propertyType": propertyType})
	})

	mux.HandleFunc("/api/v1/gds/tipping/process", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "POST required"})
			return
		}
		var req GDSTipRequest
		if err := decodeJSON(r, &req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
			return
		}
		result, err := tipEngine.ProcessTip(r.Context(), &req)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, result)
	})

	// Loyalty endpoints
	mux.HandleFunc("/api/v1/gds/loyalty/calculate", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		bookingID := q.Get("bookingId")
		guestID := q.Get("guestId")
		amount := parseFloat(q.Get("amount"))
		tier := q.Get("tier")
		propertyType := q.Get("propertyType")
		bookingType := q.Get("bookingType")
		if tier == "" {
			tier = "bronze"
		}
		if bookingType == "" {
			bookingType = "gds"
		}

		earning := loyaltyEngine.CalculateEarning(bookingID, guestID, amount, tier, propertyType, bookingType)
		writeJSON(w, http.StatusOK, earning)
	})

	mux.HandleFunc("/api/v1/gds/loyalty/config", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, loyaltyEngine.config)
	})
}

func parseFloat(s string) float64 {
	var f float64
	fmt.Sscanf(s, "%f", &f)
	return f
}

func decodeJSON(r *http.Request, v interface{}) error {
	return json.NewDecoder(r.Body).Decode(v)
}
