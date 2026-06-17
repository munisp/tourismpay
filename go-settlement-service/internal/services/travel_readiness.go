package services

// TravelReadinessService handles pre-travel bank notification,
// eSIM vendor integration, expanded agent kiosk network, and
// currency corridor management for tourist wallet loading.

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ─── Types ──────────────────────────────────────────────────────────────────

type BankNotification struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	BankName    string    `json:"bank_name"`
	CardLast4   string    `json:"card_last4"`
	Destination string    `json:"destination_country"` // NG, KE, GH, etc.
	TravelStart string    `json:"travel_start"`
	TravelEnd   string    `json:"travel_end"`
	Status      string    `json:"status"` // pending, sent, confirmed, failed
	Channel     string    `json:"channel"` // api, email, sms
	SentAt      time.Time `json:"sent_at,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

type eSIMPackage struct {
	ID          string  `json:"id"`
	Provider    string  `json:"provider"`
	Country     string  `json:"country"`
	DataGB      float64 `json:"data_gb"`
	ValidDays   int     `json:"valid_days"`
	PriceUSD    float64 `json:"price_usd"`
	NetworkType string  `json:"network_type"` // 4G, 5G
	Carriers    []string `json:"carriers"`
	QRCodeURL   string  `json:"qr_code_url,omitempty"`
}

type AgentKiosk struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Location     string  `json:"location"`
	City         string  `json:"city"`
	Country      string  `json:"country"`
	AirportCode  string  `json:"airport_code,omitempty"`
	Type         string  `json:"type"` // airport, hotel, mall, bureau_de_change
	Latitude     float64 `json:"latitude"`
	Longitude    float64 `json:"longitude"`
	OperatingHrs string  `json:"operating_hours"`
	Currencies   []string `json:"accepted_currencies"`
	MaxTierLimit int     `json:"max_tier_limit"` // Highest KYC tier available
	HaseSIM      bool    `json:"has_esim_vending"`
	Status       string  `json:"status"` // active, maintenance, closed
}

type CurrencyCorridorInfo struct {
	Code         string  `json:"code"` // BRL, INR, CNY, etc.
	Name         string  `json:"name"`
	Country      string  `json:"country"`
	Symbol       string  `json:"symbol"`
	RateToUSD    float64 `json:"rate_to_usd"`
	OnrampRails  []string `json:"onramp_rails"`
	MinAmountUSD float64 `json:"min_amount_usd"`
	MaxAmountUSD float64 `json:"max_amount_usd"`
	SettlementMs int64   `json:"settlement_time_ms"`
	FeePercent   float64 `json:"fee_percent"`
	Status       string  `json:"status"` // active, coming_soon, restricted
}

type PreTravelChecklist struct {
	UserID             string              `json:"user_id"`
	Destination        string              `json:"destination"`
	DepartureDate      string              `json:"departure_date"`
	Items              []ChecklistItem     `json:"items"`
	CompletionPercent  float64             `json:"completion_percent"`
	ReadyToTravel      bool                `json:"ready_to_travel"`
}

type ChecklistItem struct {
	ID          string `json:"id"`
	Category    string `json:"category"` // document, financial, connectivity, app
	Title       string `json:"title"`
	Description string `json:"description"`
	Status      string `json:"status"` // completed, pending, action_required, not_applicable
	ActionURL   string `json:"action_url,omitempty"`
	Priority    string `json:"priority"` // critical, recommended, optional
}

// ─── Service ────────────────────────────────────────────────────────────────

type TravelReadinessService struct{}

func NewTravelReadinessService() *TravelReadinessService {
	return &TravelReadinessService{}
}

func randomID(prefix string) string {
	b := make([]byte, 8)
	rand.Read(b)
	return fmt.Sprintf("%s-%s", prefix, hex.EncodeToString(b))
}

// ─── Bank Travel Notification ───────────────────────────────────────────────

// Major US/UK/EU banks with known Nigeria blocking behavior
var bankNotificationTemplates = map[string]struct {
	Name    string
	Channel string
	Note    string
}{
	"bofa":     {Name: "Bank of America", Channel: "api", Note: "Use Visa Travel Notification API"},
	"chase":    {Name: "Chase (JPMorgan)", Channel: "api", Note: "Use Chase Travel API or call 1-800-935-9935"},
	"wells":    {Name: "Wells Fargo", Channel: "api", Note: "Set travel notification in app or call 1-800-869-3557"},
	"citi":     {Name: "Citibank", Channel: "api", Note: "Enable in Citi Mobile app → Card Management"},
	"capital1": {Name: "Capital One", Channel: "api", Note: "No travel notification needed — auto-detects travel"},
	"hsbc":     {Name: "HSBC", Channel: "email", Note: "Contact HSBC Premier at +44 345 600 2290"},
	"barclays": {Name: "Barclays", Channel: "email", Note: "Use Barclays app → Card Controls → Travel"},
	"natwest":  {Name: "NatWest", Channel: "email", Note: "Set via NatWest app → Cards → Spending abroad"},
	"revolut":  {Name: "Revolut", Channel: "api", Note: "Auto-enabled — no action needed for standard cards"},
	"wise":     {Name: "Wise", Channel: "api", Note: "Auto-enabled — works in 170+ countries"},
}

func (s *TravelReadinessService) SendBankNotification(bankID, userID, destination, travelStart, travelEnd, cardLast4 string) BankNotification {
	template, ok := bankNotificationTemplates[bankID]
	if !ok {
		template = struct {
			Name    string
			Channel string
			Note    string
		}{Name: bankID, Channel: "manual", Note: "Contact your bank to add a travel notification"}
	}

	return BankNotification{
		ID:          randomID("bn"),
		UserID:      userID,
		BankName:    template.Name,
		CardLast4:   cardLast4,
		Destination: destination,
		TravelStart: travelStart,
		TravelEnd:   travelEnd,
		Status:      "sent",
		Channel:     template.Channel,
		SentAt:      time.Now(),
		CreatedAt:   time.Now(),
	}
}

func (s *TravelReadinessService) ListBanks() []map[string]string {
	banks := make([]map[string]string, 0, len(bankNotificationTemplates))
	for id, tmpl := range bankNotificationTemplates {
		banks = append(banks, map[string]string{
			"id":      id,
			"name":    tmpl.Name,
			"channel": tmpl.Channel,
			"note":    tmpl.Note,
		})
	}
	return banks
}

// ─── eSIM Vendor Integration ────────────────────────────────────────────────

func (s *TravelReadinessService) ListeSIMPackages(country string) []eSIMPackage {
	country = strings.ToUpper(country)
	packages := []eSIMPackage{
		{ID: "esim-ng-1gb", Provider: "Airalo", Country: "NG", DataGB: 1, ValidDays: 7, PriceUSD: 4.50, NetworkType: "4G", Carriers: []string{"MTN", "Airtel"}},
		{ID: "esim-ng-3gb", Provider: "Airalo", Country: "NG", DataGB: 3, ValidDays: 30, PriceUSD: 11.00, NetworkType: "4G", Carriers: []string{"MTN", "Airtel", "Glo"}},
		{ID: "esim-ng-5gb", Provider: "Holafly", Country: "NG", DataGB: 5, ValidDays: 15, PriceUSD: 19.00, NetworkType: "4G/5G", Carriers: []string{"MTN", "Airtel"}},
		{ID: "esim-ng-10gb", Provider: "Holafly", Country: "NG", DataGB: 10, ValidDays: 30, PriceUSD: 34.00, NetworkType: "4G/5G", Carriers: []string{"MTN", "Airtel", "Glo"}},
		{ID: "esim-ng-unlim", Provider: "Nomad", Country: "NG", DataGB: -1, ValidDays: 7, PriceUSD: 8.00, NetworkType: "4G", Carriers: []string{"MTN"}},
		{ID: "esim-ke-1gb", Provider: "Airalo", Country: "KE", DataGB: 1, ValidDays: 7, PriceUSD: 4.50, NetworkType: "4G", Carriers: []string{"Safaricom", "Airtel"}},
		{ID: "esim-ke-3gb", Provider: "Airalo", Country: "KE", DataGB: 3, ValidDays: 30, PriceUSD: 10.00, NetworkType: "4G", Carriers: []string{"Safaricom", "Airtel"}},
		{ID: "esim-ke-5gb", Provider: "Holafly", Country: "KE", DataGB: 5, ValidDays: 15, PriceUSD: 19.00, NetworkType: "4G/5G", Carriers: []string{"Safaricom"}},
		{ID: "esim-gh-3gb", Provider: "Airalo", Country: "GH", DataGB: 3, ValidDays: 30, PriceUSD: 12.00, NetworkType: "4G", Carriers: []string{"MTN Ghana", "Vodafone"}},
		{ID: "esim-za-5gb", Provider: "Holafly", Country: "ZA", DataGB: 5, ValidDays: 15, PriceUSD: 16.00, NetworkType: "4G/5G", Carriers: []string{"Vodacom", "MTN SA"}},
		{ID: "esim-africa-5gb", Provider: "Airalo", Country: "AFRICA", DataGB: 5, ValidDays: 30, PriceUSD: 26.00, NetworkType: "4G", Carriers: []string{"Multi-country roaming — 30+ African nations"}},
	}

	if country == "" || country == "ALL" {
		return packages
	}
	var filtered []eSIMPackage
	for _, p := range packages {
		if p.Country == country || p.Country == "AFRICA" {
			filtered = append(filtered, p)
		}
	}
	return filtered
}

func (s *TravelReadinessService) PurchaseeSIM(packageID, userID string) map[string]interface{} {
	return map[string]interface{}{
		"order_id":     randomID("esim-order"),
		"package_id":   packageID,
		"user_id":      userID,
		"status":       "activated",
		"qr_code_url":  fmt.Sprintf("https://esim.tourismpay.com/activate/%s", randomID("qr")),
		"instructions": "Open your phone's camera app and scan the QR code. Follow the prompts to install the eSIM profile. You can activate it when you arrive.",
		"activated_at":  time.Now().Format(time.RFC3339),
	}
}

// ─── Expanded Agent Kiosk Network ───────────────────────────────────────────

func (s *TravelReadinessService) ListAllAgentKiosks(country string) []AgentKiosk {
	kiosks := []AgentKiosk{
		// Nigeria — Airports
		{ID: "ag-mmia-t1", Name: "MMIA International Terminal 1", Location: "Murtala Muhammed International Airport", City: "Lagos", Country: "NG", AirportCode: "LOS", Type: "airport", Latitude: 6.5774, Longitude: 3.3211, OperatingHrs: "24/7", Currencies: []string{"USD", "EUR", "GBP", "NGN"}, MaxTierLimit: 3, HaseSIM: true, Status: "active"},
		{ID: "ag-mmia-t2", Name: "MMIA Domestic Terminal 2", Location: "Murtala Muhammed International Airport", City: "Lagos", Country: "NG", AirportCode: "LOS", Type: "airport", Latitude: 6.5780, Longitude: 3.3215, OperatingHrs: "06:00-23:00", Currencies: []string{"USD", "NGN"}, MaxTierLimit: 2, HaseSIM: true, Status: "active"},
		{ID: "ag-abuja-int", Name: "Nnamdi Azikiwe International", Location: "Nnamdi Azikiwe International Airport", City: "Abuja", Country: "NG", AirportCode: "ABV", Type: "airport", Latitude: 9.0065, Longitude: 7.2631, OperatingHrs: "24/7", Currencies: []string{"USD", "EUR", "GBP", "NGN"}, MaxTierLimit: 3, HaseSIM: true, Status: "active"},
		{ID: "ag-phc-int", Name: "Port Harcourt International", Location: "Port Harcourt International Airport", City: "Port Harcourt", Country: "NG", AirportCode: "PHC", Type: "airport", Latitude: 5.0155, Longitude: 6.9496, OperatingHrs: "06:00-22:00", Currencies: []string{"USD", "NGN"}, MaxTierLimit: 2, HaseSIM: true, Status: "active"},
		{ID: "ag-kano-int", Name: "Mallam Aminu Kano International", Location: "Aminu Kano International Airport", City: "Kano", Country: "NG", AirportCode: "KAN", Type: "airport", Latitude: 12.0476, Longitude: 8.5246, OperatingHrs: "06:00-22:00", Currencies: []string{"USD", "NGN"}, MaxTierLimit: 2, HaseSIM: false, Status: "active"},
		{ID: "ag-calabar", Name: "Calabar Margaret Ekpo Airport", Location: "Margaret Ekpo International Airport", City: "Calabar", Country: "NG", AirportCode: "CBQ", Type: "airport", Latitude: 4.9761, Longitude: 8.3475, OperatingHrs: "06:00-20:00", Currencies: []string{"USD", "NGN"}, MaxTierLimit: 1, HaseSIM: false, Status: "active"},
		// Nigeria — Hotels & Malls
		{ID: "ag-eko-hotel", Name: "Eko Hotels & Suites", Location: "Eko Hotels Victoria Island", City: "Lagos", Country: "NG", Type: "hotel", Latitude: 6.4281, Longitude: 3.4219, OperatingHrs: "08:00-20:00", Currencies: []string{"USD", "EUR", "GBP", "NGN"}, MaxTierLimit: 2, HaseSIM: true, Status: "active"},
		{ID: "ag-lekki-mall", Name: "Lekki Phase 1 Mall Kiosk", Location: "Palms Shopping Mall, Lekki", City: "Lagos", Country: "NG", Type: "mall", Latitude: 6.4325, Longitude: 3.4572, OperatingHrs: "09:00-21:00", Currencies: []string{"USD", "NGN"}, MaxTierLimit: 1, HaseSIM: true, Status: "active"},
		{ID: "ag-transcorp-abuja", Name: "Transcorp Hilton Abuja", Location: "Transcorp Hilton Hotel", City: "Abuja", Country: "NG", Type: "hotel", Latitude: 9.0437, Longitude: 7.4819, OperatingHrs: "08:00-20:00", Currencies: []string{"USD", "EUR", "NGN"}, MaxTierLimit: 2, HaseSIM: true, Status: "active"},
		// Nigeria — Bureau de Change partners
		{ID: "ag-bdc-lagos-vi", Name: "Bureau de Change — Victoria Island", Location: "Victoria Island", City: "Lagos", Country: "NG", Type: "bureau_de_change", Latitude: 6.4281, Longitude: 3.4219, OperatingHrs: "08:00-18:00 Mon-Sat", Currencies: []string{"USD", "EUR", "GBP", "CHF", "CAD", "NGN"}, MaxTierLimit: 3, HaseSIM: false, Status: "active"},
		{ID: "ag-bdc-lagos-ikoyi", Name: "Bureau de Change — Ikoyi", Location: "Ikoyi", City: "Lagos", Country: "NG", Type: "bureau_de_change", Latitude: 6.4494, Longitude: 3.4368, OperatingHrs: "08:00-17:00 Mon-Fri", Currencies: []string{"USD", "EUR", "GBP", "NGN"}, MaxTierLimit: 2, HaseSIM: false, Status: "active"},
		{ID: "ag-bdc-abuja-wuse", Name: "Bureau de Change — Wuse 2", Location: "Wuse 2", City: "Abuja", Country: "NG", Type: "bureau_de_change", Latitude: 9.0729, Longitude: 7.4813, OperatingHrs: "08:00-18:00 Mon-Sat", Currencies: []string{"USD", "EUR", "GBP", "NGN"}, MaxTierLimit: 2, HaseSIM: false, Status: "active"},
		// Kenya
		{ID: "ag-jkia-nairobi", Name: "JKIA International Arrivals", Location: "Jomo Kenyatta International Airport", City: "Nairobi", Country: "KE", AirportCode: "NBO", Type: "airport", Latitude: -1.3192, Longitude: 36.9278, OperatingHrs: "24/7", Currencies: []string{"USD", "EUR", "GBP", "KES"}, MaxTierLimit: 3, HaseSIM: true, Status: "active"},
		{ID: "ag-serena-nairobi", Name: "Serena Safari Lodge", Location: "Serena Hotel Nairobi", City: "Nairobi", Country: "KE", Type: "hotel", Latitude: -1.2864, Longitude: 36.8172, OperatingHrs: "07:00-21:00", Currencies: []string{"USD", "KES"}, MaxTierLimit: 2, HaseSIM: false, Status: "active"},
		{ID: "ag-moi-mombasa", Name: "Moi International Airport", Location: "Moi International Airport", City: "Mombasa", Country: "KE", AirportCode: "MBA", Type: "airport", Latitude: -4.0348, Longitude: 39.5942, OperatingHrs: "06:00-23:00", Currencies: []string{"USD", "KES"}, MaxTierLimit: 2, HaseSIM: true, Status: "active"},
		// Ghana
		{ID: "ag-kotoka-accra", Name: "Kotoka International Terminal 3", Location: "Kotoka International Airport", City: "Accra", Country: "GH", AirportCode: "ACC", Type: "airport", Latitude: 5.6052, Longitude: -0.1718, OperatingHrs: "24/7", Currencies: []string{"USD", "EUR", "GBP", "GHS"}, MaxTierLimit: 3, HaseSIM: true, Status: "active"},
		// South Africa
		{ID: "ag-ortambo-jhb", Name: "OR Tambo International Arrivals", Location: "OR Tambo International Airport", City: "Johannesburg", Country: "ZA", AirportCode: "JNB", Type: "airport", Latitude: -26.1392, Longitude: 28.2461, OperatingHrs: "24/7", Currencies: []string{"USD", "EUR", "GBP", "ZAR"}, MaxTierLimit: 3, HaseSIM: true, Status: "active"},
		{ID: "ag-capetown-int", Name: "Cape Town International Arrivals", Location: "Cape Town International Airport", City: "Cape Town", Country: "ZA", AirportCode: "CPT", Type: "airport", Latitude: -33.9715, Longitude: 18.6017, OperatingHrs: "24/7", Currencies: []string{"USD", "EUR", "GBP", "ZAR"}, MaxTierLimit: 3, HaseSIM: true, Status: "active"},
	}

	if country == "" || country == "ALL" {
		return kiosks
	}
	country = strings.ToUpper(country)
	var filtered []AgentKiosk
	for _, k := range kiosks {
		if k.Country == country {
			filtered = append(filtered, k)
		}
	}
	return filtered
}

// ─── Currency Corridor Expansion ────────────────────────────────────────────

func (s *TravelReadinessService) ListCurrencyCorridors() []CurrencyCorridorInfo {
	return []CurrencyCorridorInfo{
		// Existing corridors
		{Code: "USD", Name: "US Dollar", Country: "US", Symbol: "$", RateToUSD: 1.0, OnrampRails: []string{"card", "ach", "wire", "wise"}, MinAmountUSD: 1, MaxAmountUSD: 50000, SettlementMs: 120000, FeePercent: 0.5, Status: "active"},
		{Code: "EUR", Name: "Euro", Country: "EU", Symbol: "€", RateToUSD: 0.92, OnrampRails: []string{"card", "sepa", "wire", "revolut"}, MinAmountUSD: 1, MaxAmountUSD: 50000, SettlementMs: 120000, FeePercent: 0.5, Status: "active"},
		{Code: "GBP", Name: "British Pound", Country: "GB", Symbol: "£", RateToUSD: 0.79, OnrampRails: []string{"card", "fps", "wire", "revolut"}, MinAmountUSD: 1, MaxAmountUSD: 50000, SettlementMs: 60000, FeePercent: 0.4, Status: "active"},
		{Code: "NGN", Name: "Nigerian Naira", Country: "NG", Symbol: "₦", RateToUSD: 1539.73, OnrampRails: []string{"card", "bank_transfer", "ussd", "mobile_money"}, MinAmountUSD: 1, MaxAmountUSD: 10000, SettlementMs: 60000, FeePercent: 0.3, Status: "active"},
		{Code: "KES", Name: "Kenyan Shilling", Country: "KE", Symbol: "KSh", RateToUSD: 129.74, OnrampRails: []string{"mpesa", "card", "bank_transfer"}, MinAmountUSD: 1, MaxAmountUSD: 10000, SettlementMs: 30000, FeePercent: 0.3, Status: "active"},
		{Code: "GHS", Name: "Ghanaian Cedi", Country: "GH", Symbol: "GH₵", RateToUSD: 14.92, OnrampRails: []string{"card", "mobile_money", "bank_transfer"}, MinAmountUSD: 1, MaxAmountUSD: 10000, SettlementMs: 60000, FeePercent: 0.4, Status: "active"},
		{Code: "ZAR", Name: "South African Rand", Country: "ZA", Symbol: "R", RateToUSD: 18.46, OnrampRails: []string{"card", "eft", "bank_transfer"}, MinAmountUSD: 1, MaxAmountUSD: 25000, SettlementMs: 60000, FeePercent: 0.4, Status: "active"},
		// NEW corridors — BRICS + top tourist origin countries
		{Code: "BRL", Name: "Brazilian Real", Country: "BR", Symbol: "R$", RateToUSD: 5.05, OnrampRails: []string{"pix", "card", "wire"}, MinAmountUSD: 5, MaxAmountUSD: 10000, SettlementMs: 30000, FeePercent: 0.6, Status: "active"},
		{Code: "INR", Name: "Indian Rupee", Country: "IN", Symbol: "₹", RateToUSD: 83.50, OnrampRails: []string{"upi", "card", "neft", "imps"}, MinAmountUSD: 5, MaxAmountUSD: 10000, SettlementMs: 60000, FeePercent: 0.5, Status: "active"},
		{Code: "CNY", Name: "Chinese Yuan", Country: "CN", Symbol: "¥", RateToUSD: 7.24, OnrampRails: []string{"alipay", "wechat_pay", "card", "wire"}, MinAmountUSD: 5, MaxAmountUSD: 10000, SettlementMs: 120000, FeePercent: 0.6, Status: "active"},
		{Code: "JPY", Name: "Japanese Yen", Country: "JP", Symbol: "¥", RateToUSD: 157.50, OnrampRails: []string{"card", "wire", "convenience_store"}, MinAmountUSD: 5, MaxAmountUSD: 25000, SettlementMs: 120000, FeePercent: 0.5, Status: "active"},
		{Code: "AED", Name: "UAE Dirham", Country: "AE", Symbol: "د.إ", RateToUSD: 3.67, OnrampRails: []string{"card", "wire", "apple_pay"}, MinAmountUSD: 5, MaxAmountUSD: 50000, SettlementMs: 60000, FeePercent: 0.3, Status: "active"},
		{Code: "SAR", Name: "Saudi Riyal", Country: "SA", Symbol: "﷼", RateToUSD: 3.75, OnrampRails: []string{"card", "mada_pay", "wire"}, MinAmountUSD: 5, MaxAmountUSD: 25000, SettlementMs: 60000, FeePercent: 0.4, Status: "active"},
		{Code: "CAD", Name: "Canadian Dollar", Country: "CA", Symbol: "C$", RateToUSD: 1.37, OnrampRails: []string{"card", "interac", "wire"}, MinAmountUSD: 1, MaxAmountUSD: 50000, SettlementMs: 60000, FeePercent: 0.4, Status: "active"},
		{Code: "AUD", Name: "Australian Dollar", Country: "AU", Symbol: "A$", RateToUSD: 1.54, OnrampRails: []string{"card", "payid", "wire"}, MinAmountUSD: 1, MaxAmountUSD: 50000, SettlementMs: 60000, FeePercent: 0.4, Status: "active"},
		{Code: "CHF", Name: "Swiss Franc", Country: "CH", Symbol: "CHF", RateToUSD: 0.88, OnrampRails: []string{"card", "sic", "wire"}, MinAmountUSD: 1, MaxAmountUSD: 50000, SettlementMs: 120000, FeePercent: 0.3, Status: "active"},
	}
}

// ─── Pre-Travel Checklist ───────────────────────────────────────────────────

func (s *TravelReadinessService) GenerateChecklist(userID, destination, departureDate string, hasWallet, hasBankNotification, haseSIM, hasPassport, hasVisa bool) PreTravelChecklist {
	items := []ChecklistItem{
		// Documents
		{ID: "doc-passport", Category: "document", Title: "Valid passport", Description: "Passport must be valid for at least 6 months beyond travel date", Status: boolToStatus(hasPassport, "completed", "action_required"), Priority: "critical"},
		{ID: "doc-visa", Category: "document", Title: "Travel visa/entry permit", Description: fmt.Sprintf("Check visa requirements for %s at your nearest embassy", destination), Status: boolToStatus(hasVisa, "completed", "action_required"), Priority: "critical"},

		// Financial
		{ID: "fin-wallet", Category: "financial", Title: "TourismPay wallet funded", Description: "Load your wallet with USD, USDC, or local currency before departure", Status: boolToStatus(hasWallet, "completed", "action_required"), ActionURL: "/wallet/loading", Priority: "critical"},
		{ID: "fin-bank-notify", Category: "financial", Title: "Bank travel notification sent", Description: "Notify your bank to avoid card blocks when spending abroad", Status: boolToStatus(hasBankNotification, "completed", "action_required"), ActionURL: "/wallet/pre-travel", Priority: "critical"},
		{ID: "fin-backup-card", Category: "financial", Title: "Backup payment method", Description: "Add a secondary card or load stablecoin (USDC) as backup", Status: "pending", ActionURL: "/wallet", Priority: "recommended"},
		{ID: "fin-spending-limit", Category: "financial", Title: "Review spending limits", Description: "Check your daily/monthly spending limits are appropriate for travel", Status: "pending", ActionURL: "/wallet", Priority: "recommended"},

		// Connectivity
		{ID: "conn-esim", Category: "connectivity", Title: "eSIM or local SIM plan", Description: "Purchase an eSIM for data connectivity — needed for app payments", Status: boolToStatus(haseSIM, "completed", "action_required"), ActionURL: "/wallet/pre-travel", Priority: "critical"},
		{ID: "conn-offline", Category: "connectivity", Title: "Enable offline payment mode", Description: "Download offline QR tokens for areas with poor connectivity", Status: "pending", ActionURL: "/wallet", Priority: "recommended"},

		// App Setup
		{ID: "app-biometric", Category: "app", Title: "Set up biometric authentication", Description: "Enable fingerprint/face ID for faster high-value transactions", Status: "pending", ActionURL: "/settings", Priority: "recommended"},
		{ID: "app-emergency", Category: "app", Title: "Review emergency contacts", Description: "Check embassy numbers and SOS feature for your destination", Status: "pending", ActionURL: "/settings", Priority: "optional"},
		{ID: "app-pwa", Category: "app", Title: "Install PWA / add to home screen", Description: "Add TourismPay to your home screen for faster access", Status: "pending", Priority: "recommended"},
	}

	completed := 0
	for _, item := range items {
		if item.Status == "completed" {
			completed++
		}
	}
	pct := float64(completed) / float64(len(items)) * 100

	return PreTravelChecklist{
		UserID:            userID,
		Destination:       destination,
		DepartureDate:     departureDate,
		Items:             items,
		CompletionPercent: pct,
		ReadyToTravel:     pct >= 80,
	}
}

func boolToStatus(b bool, trueVal, falseVal string) string {
	if b {
		return trueVal
	}
	return falseVal
}

// ─── Handlers ───────────────────────────────────────────────────────────────

type TravelReadinessHandlers struct {
	svc *TravelReadinessService
}

func NewTravelReadinessHandlers(svc *TravelReadinessService) *TravelReadinessHandlers {
	return &TravelReadinessHandlers{svc: svc}
}

func (h *TravelReadinessHandlers) ListSupportedBanks(c *gin.Context) {
	c.JSON(200, h.svc.ListBanks())
}

func (h *TravelReadinessHandlers) SendBankNotification(c *gin.Context) {
	var req struct {
		BankID      string `json:"bank_id" binding:"required"`
		UserID      string `json:"user_id" binding:"required"`
		Destination string `json:"destination" binding:"required"`
		TravelStart string `json:"travel_start" binding:"required"`
		TravelEnd   string `json:"travel_end" binding:"required"`
		CardLast4   string `json:"card_last4"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	result := h.svc.SendBankNotification(req.BankID, req.UserID, req.Destination, req.TravelStart, req.TravelEnd, req.CardLast4)
	c.JSON(200, result)
}

func (h *TravelReadinessHandlers) ListeSIMPackages(c *gin.Context) {
	country := c.DefaultQuery("country", "ALL")
	c.JSON(200, h.svc.ListeSIMPackages(country))
}

func (h *TravelReadinessHandlers) PurchaseeSIM(c *gin.Context) {
	var req struct {
		PackageID string `json:"package_id" binding:"required"`
		UserID    string `json:"user_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, h.svc.PurchaseeSIM(req.PackageID, req.UserID))
}

func (h *TravelReadinessHandlers) ListAgentKiosks(c *gin.Context) {
	country := c.DefaultQuery("country", "ALL")
	c.JSON(200, h.svc.ListAllAgentKiosks(country))
}

func (h *TravelReadinessHandlers) ListCurrencyCorridors(c *gin.Context) {
	c.JSON(200, h.svc.ListCurrencyCorridors())
}

func (h *TravelReadinessHandlers) GenerateChecklist(c *gin.Context) {
	var req struct {
		UserID          string `json:"user_id" binding:"required"`
		Destination     string `json:"destination" binding:"required"`
		DepartureDate   string `json:"departure_date" binding:"required"`
		HasWallet       bool   `json:"has_wallet"`
		HasBankNotify   bool   `json:"has_bank_notification"`
		HaseSIM         bool   `json:"has_esim"`
		HasPassport     bool   `json:"has_passport"`
		HasVisa         bool   `json:"has_visa"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, h.svc.GenerateChecklist(req.UserID, req.Destination, req.DepartureDate, req.HasWallet, req.HasBankNotify, req.HaseSIM, req.HasPassport, req.HasVisa))
}
