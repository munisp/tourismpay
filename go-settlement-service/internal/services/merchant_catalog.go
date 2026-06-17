package services

// MerchantCatalogService provides geo-indexed merchant search,
// product catalog retrieval, and pricing aggregation for the
// NL trip planner / AI itinerary builder.

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"net/http"
)

// ─── Types ──────────────────────────────────────────────────────────────────

type MerchantListing struct {
	ID                int      `json:"id"`
	Name              string   `json:"name"`
	Type              string   `json:"type"`
	Country           string   `json:"country"`
	City              string   `json:"city"`
	Address           string   `json:"address"`
	Latitude          float64  `json:"latitude"`
	Longitude         float64  `json:"longitude"`
	Rating            float64  `json:"rating"`
	ReviewCount       int      `json:"review_count"`
	PriceRange        string   `json:"price_range"` // $, $$, $$$
	AcceptsTourismPay bool     `json:"accepts_tourismpay"`
	KybStatus         string   `json:"kyb_status"`
	Categories        []string `json:"categories"`
	ImageURL          string   `json:"image_url,omitempty"`
	DistanceKm        float64  `json:"distance_km,omitempty"`
}

type ProductListing struct {
	ID              int     `json:"id"`
	EstablishmentID int     `json:"establishment_id"`
	MerchantName    string  `json:"merchant_name"`
	Name            string  `json:"name"`
	Description     string  `json:"description"`
	Category        string  `json:"category"`
	Price           float64 `json:"price"`
	Currency        string  `json:"currency"`
	PriceUSD        float64 `json:"price_usd"`
	Available       bool    `json:"available"`
	Featured        bool    `json:"featured"`
	ImageURL        string  `json:"image_url,omitempty"`
}

type MerchantSearchRequest struct {
	Country    string   `json:"country"`
	City       string   `json:"city,omitempty"`
	Types      []string `json:"types,omitempty"`
	Categories []string `json:"categories,omitempty"`
	Budget     string   `json:"budget,omitempty"` // budget, mid-range, luxury
	Latitude   float64  `json:"latitude,omitempty"`
	Longitude  float64  `json:"longitude,omitempty"`
	RadiusKm   float64  `json:"radius_km,omitempty"`
	Query      string   `json:"query,omitempty"`
	Limit      int      `json:"limit,omitempty"`
}

type ItineraryEstimate struct {
	Destination     string               `json:"destination"`
	Country         string               `json:"country"`
	Duration        int                  `json:"duration_days"`
	Budget          string               `json:"budget"`
	TotalEstimate   float64              `json:"total_estimate_usd"`
	DailyAverage    float64              `json:"daily_average_usd"`
	Categories      []CategoryBreakdown  `json:"categories"`
	TopMerchants    []MerchantListing    `json:"top_merchants"`
	TopProducts     []ProductListing     `json:"top_products"`
	CurrencyInfo    CurrencyContext      `json:"currency_info"`
	SeasonalTips    []string             `json:"seasonal_tips"`
}

type CategoryBreakdown struct {
	Category    string  `json:"category"`
	EstimateUSD float64 `json:"estimate_usd"`
	Percentage  float64 `json:"percentage"`
	ItemCount   int     `json:"item_count"`
}

type CurrencyContext struct {
	LocalCurrency string  `json:"local_currency"`
	ExchangeRate  float64 `json:"exchange_rate"` // 1 USD = X local
	Symbol        string  `json:"symbol"`
	TipPercent    float64 `json:"tip_percent"`
	CashPreferred bool    `json:"cash_preferred"`
}

// ─── Seed Data ──────────────────────────────────────────────────────────────

type MerchantCatalogService struct{}

func NewMerchantCatalogService() *MerchantCatalogService {
	return &MerchantCatalogService{}
}

var seedMerchants = []MerchantListing{
	// ─── Nigeria (Lagos) ─────────────────────────────────────────
	{ID: 1, Name: "Eko Hotels & Suites", Type: "hotel", Country: "NG", City: "Lagos", Address: "Plot 1415, Adetokunbo Ademola St, Victoria Island", Latitude: 6.4281, Longitude: 3.4219, Rating: 4.5, ReviewCount: 1240, PriceRange: "$$$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"accommodation", "restaurant", "spa"}},
	{ID: 2, Name: "The Yellow Chilli", Type: "restaurant", Country: "NG", City: "Lagos", Address: "27 Oju Olobun Close, Victoria Island", Latitude: 6.4310, Longitude: 3.4240, Rating: 4.3, ReviewCount: 890, PriceRange: "$$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"restaurant", "nigerian-cuisine"}},
	{ID: 3, Name: "Terra Kulture", Type: "restaurant", Country: "NG", City: "Lagos", Address: "1376 Tiamiyu Savage St, Victoria Island", Latitude: 6.4305, Longitude: 3.4228, Rating: 4.4, ReviewCount: 720, PriceRange: "$$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"restaurant", "cultural", "art-gallery"}},
	{ID: 4, Name: "Nike Art Gallery", Type: "museum", Country: "NG", City: "Lagos", Address: "2 Elegushi Beach Rd, Lekki", Latitude: 6.4290, Longitude: 3.4750, Rating: 4.7, ReviewCount: 2100, PriceRange: "$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"attraction", "art", "cultural"}},
	{ID: 5, Name: "Lekki Conservation Centre", Type: "tour_operator", Country: "NG", City: "Lagos", Address: "Km 19, Lagos-Epe Expressway, Lekki", Latitude: 6.4400, Longitude: 3.5350, Rating: 4.2, ReviewCount: 1560, PriceRange: "$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"attraction", "nature", "wildlife"}},
	{ID: 6, Name: "Radisson Blu Anchorage", Type: "hotel", Country: "NG", City: "Lagos", Address: "1A Ozumba Mbadiwe Ave, Victoria Island", Latitude: 6.4285, Longitude: 3.4200, Rating: 4.4, ReviewCount: 980, PriceRange: "$$$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"accommodation", "restaurant", "pool"}},
	{ID: 7, Name: "New Afrika Shrine", Type: "concert_venue", Country: "NG", City: "Lagos", Address: "1 NERDC Rd, Agidingbi, Ikeja", Latitude: 6.6185, Longitude: 3.3505, Rating: 4.6, ReviewCount: 3200, PriceRange: "$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"nightlife", "music", "cultural"}},
	{ID: 8, Name: "Uber Lagos", Type: "car_rental", Country: "NG", City: "Lagos", Address: "Lagos Metro Area", Latitude: 6.5244, Longitude: 3.3792, Rating: 4.0, ReviewCount: 15000, PriceRange: "$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"transport", "ride-hailing"}},
	{ID: 9, Name: "Tarkwa Bay Beach Tours", Type: "tour_operator", Country: "NG", City: "Lagos", Address: "Tarkwa Bay Island, Lagos", Latitude: 6.4100, Longitude: 3.3950, Rating: 4.3, ReviewCount: 680, PriceRange: "$$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"beach", "tour", "boat-ride"}},
	{ID: 10, Name: "Shiro Restaurant", Type: "restaurant", Country: "NG", City: "Lagos", Address: "Plot 999C Danmole St, Victoria Island", Latitude: 6.4315, Longitude: 3.4250, Rating: 4.5, ReviewCount: 450, PriceRange: "$$$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"restaurant", "asian-fusion", "fine-dining"}},
	{ID: 11, Name: "Coconut Grove Beach Resort", Type: "beach_resort", Country: "NG", City: "Lagos", Address: "Badagry Expressway, Lagos", Latitude: 6.4150, Longitude: 2.8890, Rating: 4.1, ReviewCount: 340, PriceRange: "$$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"accommodation", "beach", "resort"}},
	{ID: 12, Name: "Freedom Park Lagos", Type: "museum", Country: "NG", City: "Lagos", Address: "1 Hospital Rd, Lagos Island", Latitude: 6.4520, Longitude: 3.3940, Rating: 4.3, ReviewCount: 890, PriceRange: "$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"attraction", "historical", "cultural"}},

	// ─── Nigeria (Abuja) ─────────────────────────────────────────
	{ID: 13, Name: "Transcorp Hilton Abuja", Type: "hotel", Country: "NG", City: "Abuja", Address: "1 Aguiyi Ironsi St, Maitama", Latitude: 9.0580, Longitude: 7.4908, Rating: 4.6, ReviewCount: 2100, PriceRange: "$$$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"accommodation", "restaurant", "conference"}},
	{ID: 14, Name: "Jabi Lake Mall", Type: "theme_park", Country: "NG", City: "Abuja", Address: "Bala Sokoto Way, Jabi", Latitude: 9.0420, Longitude: 7.4156, Rating: 4.1, ReviewCount: 1800, PriceRange: "$$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"shopping", "entertainment", "food-court"}},
	{ID: 15, Name: "Zuma Rock Tours", Type: "tour_operator", Country: "NG", City: "Abuja", Address: "Suleja, Niger State", Latitude: 9.1140, Longitude: 7.2390, Rating: 4.4, ReviewCount: 520, PriceRange: "$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"tour", "nature", "landmark"}},

	// ─── Kenya (Nairobi) ─────────────────────────────────────────
	{ID: 16, Name: "Giraffe Centre", Type: "tour_operator", Country: "KE", City: "Nairobi", Address: "Duma Rd, Karen", Latitude: -1.3752, Longitude: 36.7478, Rating: 4.6, ReviewCount: 4500, PriceRange: "$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"attraction", "wildlife", "family"}},
	{ID: 17, Name: "Carnivore Restaurant", Type: "restaurant", Country: "KE", City: "Nairobi", Address: "Langata Rd, Nairobi", Latitude: -1.3370, Longitude: 36.7560, Rating: 4.5, ReviewCount: 3200, PriceRange: "$$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"restaurant", "bbq", "kenyan-cuisine"}},
	{ID: 18, Name: "Serena Safari Lodge", Type: "safari_lodge", Country: "KE", City: "Nairobi", Address: "Amboseli National Park", Latitude: -2.6527, Longitude: 37.2606, Rating: 4.8, ReviewCount: 1800, PriceRange: "$$$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"accommodation", "safari", "luxury"}},
	{ID: 19, Name: "David Sheldrick Wildlife Trust", Type: "tour_operator", Country: "KE", City: "Nairobi", Address: "Mbagathi Rd, Nairobi National Park", Latitude: -1.3689, Longitude: 36.7450, Rating: 4.9, ReviewCount: 5600, PriceRange: "$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"attraction", "wildlife", "conservation"}},
	{ID: 20, Name: "SafariLink Aviation", Type: "airline", Country: "KE", City: "Nairobi", Address: "Wilson Airport, Nairobi", Latitude: -1.3214, Longitude: 36.8145, Rating: 4.2, ReviewCount: 890, PriceRange: "$$$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"transport", "domestic-flight", "safari-transfer"}},

	// ─── Ghana (Accra) ───────────────────────────────────────────
	{ID: 21, Name: "Kempinski Hotel Gold Coast", Type: "hotel", Country: "GH", City: "Accra", Address: "Gamel Abdul Nasser Ave, Ridge", Latitude: 5.5750, Longitude: -0.1870, Rating: 4.7, ReviewCount: 1600, PriceRange: "$$$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"accommodation", "spa", "pool"}},
	{ID: 22, Name: "Kwame Nkrumah Memorial Park", Type: "museum", Country: "GH", City: "Accra", Address: "High Street, Central Accra", Latitude: 5.5480, Longitude: -0.2040, Rating: 4.3, ReviewCount: 2200, PriceRange: "$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"attraction", "historical", "cultural"}},
	{ID: 23, Name: "Cape Coast Castle Tours", Type: "tour_operator", Country: "GH", City: "Cape Coast", Address: "Victoria Rd, Cape Coast", Latitude: 5.1036, Longitude: -1.2413, Rating: 4.8, ReviewCount: 3400, PriceRange: "$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"tour", "historical", "UNESCO"}},
	{ID: 24, Name: "Buka Restaurant Accra", Type: "restaurant", Country: "GH", City: "Accra", Address: "15 Senchi Link, Airport Residential", Latitude: 5.5970, Longitude: -0.1680, Rating: 4.4, ReviewCount: 580, PriceRange: "$$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"restaurant", "ghanaian-cuisine", "seafood"}},

	// ─── South Africa (Cape Town / Johannesburg) ─────────────────
	{ID: 25, Name: "Table Mountain Cableway", Type: "tour_operator", Country: "ZA", City: "Cape Town", Address: "Tafelberg Rd, Table Mountain", Latitude: -33.9520, Longitude: 18.4030, Rating: 4.8, ReviewCount: 8900, PriceRange: "$$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"attraction", "nature", "scenic"}},
	{ID: 26, Name: "V&A Waterfront Hotel", Type: "hotel", Country: "ZA", City: "Cape Town", Address: "West Quay Rd, V&A Waterfront", Latitude: -33.9030, Longitude: 18.4210, Rating: 4.6, ReviewCount: 2800, PriceRange: "$$$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"accommodation", "shopping", "waterfront"}},
	{ID: 27, Name: "Apartheid Museum", Type: "museum", Country: "ZA", City: "Johannesburg", Address: "Northern Parkway & Gold Reef Rd, Ormonde", Latitude: -26.2380, Longitude: 28.0100, Rating: 4.7, ReviewCount: 4200, PriceRange: "$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"attraction", "historical", "museum"}},
	{ID: 28, Name: "Pilanesberg Game Reserve", Type: "safari_lodge", Country: "ZA", City: "Johannesburg", Address: "Pilanesberg National Park, North West", Latitude: -25.2890, Longitude: 27.1200, Rating: 4.5, ReviewCount: 1500, PriceRange: "$$$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"safari", "wildlife", "accommodation"}},

	// ─── Tanzania ─────────────────────────────────────────────────
	{ID: 29, Name: "Serengeti Balloon Safaris", Type: "tour_operator", Country: "TZ", City: "Arusha", Address: "Serengeti National Park", Latitude: -2.3333, Longitude: 34.8333, Rating: 4.9, ReviewCount: 2100, PriceRange: "$$$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"safari", "adventure", "luxury"}},
	{ID: 30, Name: "Zanzibar Spice Tour", Type: "tour_operator", Country: "TZ", City: "Zanzibar", Address: "Stone Town, Zanzibar", Latitude: -6.1622, Longitude: 39.1921, Rating: 4.4, ReviewCount: 1800, PriceRange: "$", AcceptsTourismPay: true, KybStatus: "approved", Categories: []string{"tour", "cultural", "food"}},
}

var seedProducts = []ProductListing{
	// Eko Hotels
	{ID: 1, EstablishmentID: 1, MerchantName: "Eko Hotels & Suites", Name: "Deluxe Room (1 Night)", Description: "Ocean-view room with breakfast", Category: "accommodation", Price: 180, Currency: "USD", PriceUSD: 180, Available: true, Featured: true},
	{ID: 2, EstablishmentID: 1, MerchantName: "Eko Hotels & Suites", Name: "Executive Suite (1 Night)", Description: "Premium suite with lounge access", Category: "accommodation", Price: 350, Currency: "USD", PriceUSD: 350, Available: true, Featured: false},
	{ID: 3, EstablishmentID: 1, MerchantName: "Eko Hotels & Suites", Name: "Spa Day Package", Description: "Full body massage + facial + pool", Category: "spa", Price: 95, Currency: "USD", PriceUSD: 95, Available: true, Featured: false},
	// Yellow Chilli
	{ID: 4, EstablishmentID: 2, MerchantName: "The Yellow Chilli", Name: "Jollof Rice & Suya Platter", Description: "Signature Nigerian dish with grilled suya", Category: "meal", Price: 25, Currency: "USD", PriceUSD: 25, Available: true, Featured: true},
	{ID: 5, EstablishmentID: 2, MerchantName: "The Yellow Chilli", Name: "Pepper Soup & Pounded Yam", Description: "Traditional goat pepper soup", Category: "meal", Price: 20, Currency: "USD", PriceUSD: 20, Available: true, Featured: false},
	// Terra Kulture
	{ID: 6, EstablishmentID: 3, MerchantName: "Terra Kulture", Name: "Nigerian Tasting Menu", Description: "5-course Nigerian culinary experience", Category: "meal", Price: 45, Currency: "USD", PriceUSD: 45, Available: true, Featured: true},
	{ID: 7, EstablishmentID: 3, MerchantName: "Terra Kulture", Name: "Art Gallery Tour + Lunch", Description: "Guided gallery tour with 3-course lunch", Category: "cultural", Price: 35, Currency: "USD", PriceUSD: 35, Available: true, Featured: false},
	// Nike Art Gallery
	{ID: 8, EstablishmentID: 4, MerchantName: "Nike Art Gallery", Name: "Gallery Admission", Description: "Full access to 4-floor gallery", Category: "attraction", Price: 10, Currency: "USD", PriceUSD: 10, Available: true, Featured: true},
	{ID: 9, EstablishmentID: 4, MerchantName: "Nike Art Gallery", Name: "Guided Art Tour (2 hrs)", Description: "Expert-led tour of Nigerian contemporary art", Category: "cultural", Price: 30, Currency: "USD", PriceUSD: 30, Available: true, Featured: false},
	// Lekki Conservation
	{ID: 10, EstablishmentID: 5, MerchantName: "Lekki Conservation Centre", Name: "Canopy Walk + Nature Trail", Description: "Africa's longest canopy walkway + 1hr trail", Category: "attraction", Price: 15, Currency: "USD", PriceUSD: 15, Available: true, Featured: true},
	// New Afrika Shrine
	{ID: 11, EstablishmentID: 7, MerchantName: "New Afrika Shrine", Name: "Live Afrobeats Night", Description: "Entry + first drink. Live band from 9pm", Category: "nightlife", Price: 15, Currency: "USD", PriceUSD: 15, Available: true, Featured: true},
	// Uber Lagos
	{ID: 12, EstablishmentID: 8, MerchantName: "Uber Lagos", Name: "Airport → Victoria Island", Description: "UberX ride, 45 min avg", Category: "transport", Price: 15, Currency: "USD", PriceUSD: 15, Available: true, Featured: true},
	{ID: 13, EstablishmentID: 8, MerchantName: "Uber Lagos", Name: "Victoria Island → Lekki", Description: "UberX ride, 30 min avg", Category: "transport", Price: 10, Currency: "USD", PriceUSD: 10, Available: true, Featured: false},
	// Tarkwa Bay
	{ID: 14, EstablishmentID: 9, MerchantName: "Tarkwa Bay Beach Tours", Name: "Beach Day + Boat Transfer", Description: "Return boat + beach access + snorkelling", Category: "tour", Price: 60, Currency: "USD", PriceUSD: 60, Available: true, Featured: true},
	// Shiro
	{ID: 15, EstablishmentID: 10, MerchantName: "Shiro Restaurant", Name: "Omakase Dinner (7 course)", Description: "Chef's tasting menu with sake pairing", Category: "meal", Price: 85, Currency: "USD", PriceUSD: 85, Available: true, Featured: true},
	// Freedom Park
	{ID: 16, EstablishmentID: 12, MerchantName: "Freedom Park Lagos", Name: "Historical Walking Tour", Description: "2-hour guided heritage walk", Category: "cultural", Price: 12, Currency: "USD", PriceUSD: 12, Available: true, Featured: true},

	// ─── Kenya Products ──────────────────────────────────────────
	{ID: 17, EstablishmentID: 16, MerchantName: "Giraffe Centre", Name: "Giraffe Feeding Experience", Description: "Hand-feed Rothschild giraffes", Category: "attraction", Price: 15, Currency: "USD", PriceUSD: 15, Available: true, Featured: true},
	{ID: 18, EstablishmentID: 17, MerchantName: "Carnivore Restaurant", Name: "All-You-Can-Eat Nyama Choma", Description: "Famous game meat BBQ experience", Category: "meal", Price: 35, Currency: "USD", PriceUSD: 35, Available: true, Featured: true},
	{ID: 19, EstablishmentID: 18, MerchantName: "Serena Safari Lodge", Name: "3-Night Safari Package", Description: "Full-board with 2 daily game drives", Category: "accommodation", Price: 850, Currency: "USD", PriceUSD: 850, Available: true, Featured: true},
	{ID: 20, EstablishmentID: 19, MerchantName: "David Sheldrick Wildlife Trust", Name: "Elephant Orphanage Visit", Description: "11am feeding + adoption certificate", Category: "attraction", Price: 8, Currency: "USD", PriceUSD: 8, Available: true, Featured: true},
	{ID: 21, EstablishmentID: 20, MerchantName: "SafariLink Aviation", Name: "Nairobi → Masai Mara Flight", Description: "50-min scenic flight to Mara", Category: "transport", Price: 220, Currency: "USD", PriceUSD: 220, Available: true, Featured: true},

	// ─── Ghana Products ──────────────────────────────────────────
	{ID: 22, EstablishmentID: 21, MerchantName: "Kempinski Hotel Gold Coast", Name: "Premium Room (1 Night)", Description: "City-view with breakfast buffet", Category: "accommodation", Price: 200, Currency: "USD", PriceUSD: 200, Available: true, Featured: true},
	{ID: 23, EstablishmentID: 22, MerchantName: "Kwame Nkrumah Memorial Park", Name: "Museum + Mausoleum Tour", Description: "Guided 1-hour heritage tour", Category: "cultural", Price: 8, Currency: "USD", PriceUSD: 8, Available: true, Featured: true},
	{ID: 24, EstablishmentID: 23, MerchantName: "Cape Coast Castle Tours", Name: "Full Castle & Dungeon Tour", Description: "3-hour UNESCO heritage guided tour", Category: "cultural", Price: 20, Currency: "USD", PriceUSD: 20, Available: true, Featured: true},
	{ID: 25, EstablishmentID: 24, MerchantName: "Buka Restaurant Accra", Name: "Jollof & Grilled Tilapia", Description: "Signature Ghanaian platter", Category: "meal", Price: 18, Currency: "USD", PriceUSD: 18, Available: true, Featured: true},

	// ─── South Africa Products ───────────────────────────────────
	{ID: 26, EstablishmentID: 25, MerchantName: "Table Mountain Cableway", Name: "Return Cable Car Ticket", Description: "360° rotating cable car to summit", Category: "attraction", Price: 25, Currency: "USD", PriceUSD: 25, Available: true, Featured: true},
	{ID: 27, EstablishmentID: 26, MerchantName: "V&A Waterfront Hotel", Name: "Harbour View Room (1 Night)", Description: "Waterfront views with breakfast", Category: "accommodation", Price: 220, Currency: "USD", PriceUSD: 220, Available: true, Featured: true},
	{ID: 28, EstablishmentID: 27, MerchantName: "Apartheid Museum", Name: "Full Museum Experience", Description: "Self-guided tour (2-3 hours)", Category: "cultural", Price: 12, Currency: "USD", PriceUSD: 12, Available: true, Featured: true},
	{ID: 29, EstablishmentID: 28, MerchantName: "Pilanesberg Game Reserve", Name: "2-Night Safari + Game Drives", Description: "Full-board lodge with daily drives", Category: "accommodation", Price: 600, Currency: "USD", PriceUSD: 600, Available: true, Featured: true},

	// ─── Tanzania Products ───────────────────────────────────────
	{ID: 30, EstablishmentID: 29, MerchantName: "Serengeti Balloon Safaris", Name: "Sunrise Balloon + Champagne", Description: "1-hour flight over Serengeti with breakfast", Category: "adventure", Price: 550, Currency: "USD", PriceUSD: 550, Available: true, Featured: true},
	{ID: 31, EstablishmentID: 30, MerchantName: "Zanzibar Spice Tour", Name: "Half-Day Spice Farm Tour", Description: "Farm visit + tasting + cooking demo", Category: "cultural", Price: 25, Currency: "USD", PriceUSD: 25, Available: true, Featured: true},
}

var currencyContexts = map[string]CurrencyContext{
	"NG": {LocalCurrency: "NGN", ExchangeRate: 1550, Symbol: "₦", TipPercent: 10, CashPreferred: true},
	"KE": {LocalCurrency: "KES", ExchangeRate: 155, Symbol: "KSh", TipPercent: 10, CashPreferred: false},
	"GH": {LocalCurrency: "GHS", ExchangeRate: 15.2, Symbol: "GH₵", TipPercent: 10, CashPreferred: true},
	"ZA": {LocalCurrency: "ZAR", ExchangeRate: 18.5, Symbol: "R", TipPercent: 15, CashPreferred: false},
	"TZ": {LocalCurrency: "TZS", ExchangeRate: 2650, Symbol: "TSh", TipPercent: 10, CashPreferred: true},
}

// ─── Service Methods ────────────────────────────────────────────────────────

func haversineKm(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func (s *MerchantCatalogService) SearchMerchants(req MerchantSearchRequest) []MerchantListing {
	var results []MerchantListing
	limit := req.Limit
	if limit <= 0 {
		limit = 20
	}

	for _, m := range seedMerchants {
		if req.Country != "" && !strings.EqualFold(m.Country, req.Country) {
			continue
		}
		if req.City != "" && !strings.EqualFold(m.City, req.City) {
			continue
		}
		if len(req.Types) > 0 {
			matched := false
			for _, t := range req.Types {
				if strings.EqualFold(m.Type, t) {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
		}
		if len(req.Categories) > 0 {
			matched := false
			for _, rc := range req.Categories {
				for _, mc := range m.Categories {
					if strings.EqualFold(mc, rc) {
						matched = true
						break
					}
				}
				if matched {
					break
				}
			}
			if !matched {
				continue
			}
		}
		if req.Budget != "" {
			switch req.Budget {
			case "budget":
				if m.PriceRange != "$" {
					continue
				}
			case "mid-range":
				if m.PriceRange != "$" && m.PriceRange != "$$" {
					continue
				}
			}
		}
		if req.Query != "" {
			q := strings.ToLower(req.Query)
			if !strings.Contains(strings.ToLower(m.Name), q) &&
				!strings.Contains(strings.ToLower(strings.Join(m.Categories, " ")), q) &&
				!strings.Contains(strings.ToLower(m.Type), q) {
				continue
			}
		}
		copy := m
		if req.Latitude != 0 && req.Longitude != 0 {
			copy.DistanceKm = math.Round(haversineKm(req.Latitude, req.Longitude, m.Latitude, m.Longitude)*10) / 10
			if req.RadiusKm > 0 && copy.DistanceKm > req.RadiusKm {
				continue
			}
		}
		results = append(results, copy)
	}

	if req.Latitude != 0 && req.Longitude != 0 {
		sort.Slice(results, func(i, j int) bool { return results[i].DistanceKm < results[j].DistanceKm })
	} else {
		sort.Slice(results, func(i, j int) bool { return results[i].Rating > results[j].Rating })
	}

	if len(results) > limit {
		results = results[:limit]
	}
	return results
}

func (s *MerchantCatalogService) GetProductsByCountry(country string, categories []string, budget string) []ProductListing {
	var results []ProductListing
	merchantIDs := map[int]bool{}
	for _, m := range seedMerchants {
		if strings.EqualFold(m.Country, country) {
			merchantIDs[m.ID] = true
		}
	}

	for _, p := range seedProducts {
		if !merchantIDs[p.EstablishmentID] {
			continue
		}
		if !p.Available {
			continue
		}
		if len(categories) > 0 {
			matched := false
			for _, c := range categories {
				if strings.EqualFold(p.Category, c) {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
		}
		if budget == "budget" && p.PriceUSD > 50 {
			continue
		}
		if budget == "mid-range" && p.PriceUSD > 200 {
			continue
		}
		results = append(results, p)
	}
	return results
}

func (s *MerchantCatalogService) GetItineraryEstimate(country, city string, durationDays int, budget string) ItineraryEstimate {
	merchants := s.SearchMerchants(MerchantSearchRequest{Country: country, City: city, Budget: budget, Limit: 30})
	products := s.GetProductsByCountry(country, nil, budget)

	var accommodationCost, mealCost, transportCost, activityCost float64
	var accommodationCount, mealCount, transportCount, activityCount int

	for _, p := range products {
		switch p.Category {
		case "accommodation":
			if accommodationCost == 0 || (budget == "budget" && p.PriceUSD < accommodationCost) || (budget != "budget" && p.PriceUSD > accommodationCost) {
				accommodationCost = p.PriceUSD
			}
			accommodationCount++
		case "meal", "restaurant":
			mealCost += p.PriceUSD
			mealCount++
		case "transport", "ride-hailing":
			transportCost += p.PriceUSD
			transportCount++
		default:
			activityCost += p.PriceUSD
			activityCount++
		}
	}

	if accommodationCost == 0 {
		accommodationCost = 100
	}
	avgMeal := 25.0
	if mealCount > 0 {
		avgMeal = mealCost / float64(mealCount)
	}
	avgTransport := 15.0
	if transportCount > 0 {
		avgTransport = transportCost / float64(transportCount)
	}
	avgActivity := 25.0
	if activityCount > 0 {
		avgActivity = activityCost / float64(activityCount)
	}

	dailyCost := accommodationCost + (avgMeal * 3) + avgTransport + avgActivity
	totalCost := math.Round(dailyCost*float64(durationDays)*100) / 100

	categories := []CategoryBreakdown{
		{Category: "Accommodation", EstimateUSD: math.Round(accommodationCost * float64(durationDays)), Percentage: math.Round(accommodationCost / dailyCost * 100), ItemCount: accommodationCount},
		{Category: "Food & Dining", EstimateUSD: math.Round(avgMeal * 3 * float64(durationDays)), Percentage: math.Round(avgMeal * 3 / dailyCost * 100), ItemCount: mealCount},
		{Category: "Transportation", EstimateUSD: math.Round(avgTransport * float64(durationDays)), Percentage: math.Round(avgTransport / dailyCost * 100), ItemCount: transportCount},
		{Category: "Activities & Tours", EstimateUSD: math.Round(avgActivity * float64(durationDays)), Percentage: math.Round(avgActivity / dailyCost * 100), ItemCount: activityCount},
	}

	currCtx := currencyContexts[strings.ToUpper(country)]
	if currCtx.LocalCurrency == "" {
		currCtx = CurrencyContext{LocalCurrency: "USD", ExchangeRate: 1, Symbol: "$", TipPercent: 15}
	}

	tips := generateSeasonalTips(country)
	topProducts := products
	if len(topProducts) > 10 {
		topProducts = topProducts[:10]
	}
	topMerch := merchants
	if len(topMerch) > 8 {
		topMerch = topMerch[:8]
	}

	return ItineraryEstimate{
		Destination:   city,
		Country:       country,
		Duration:      durationDays,
		Budget:        budget,
		TotalEstimate: totalCost,
		DailyAverage:  math.Round(dailyCost*100) / 100,
		Categories:    categories,
		TopMerchants:  topMerch,
		TopProducts:   topProducts,
		CurrencyInfo:  currCtx,
		SeasonalTips:  tips,
	}
}

func generateSeasonalTips(country string) []string {
	now := time.Now()
	month := now.Month()

	switch strings.ToUpper(country) {
	case "NG":
		if month >= 11 || month <= 2 {
			return []string{"Dry season (Nov-Feb) — ideal for travel", "Harmattan dust may reduce visibility", "Book Detty December events early", "Carry light layers for cooler evenings"}
		}
		return []string{"Rainy season — carry umbrella", "Lower hotel rates available", "Lagos flooding possible — allow extra travel time", "Good time for indoor cultural experiences"}
	case "KE":
		if month >= 7 && month <= 10 {
			return []string{"Great Migration season — book safari early", "Dry season ideal for game viewing", "Masai Mara accommodation at premium prices", "Carry warm layers for early morning drives"}
		}
		return []string{"Green season — lower safari prices", "Short rains (Oct-Nov) bring lush scenery", "Fewer tourists — more authentic experience", "Some roads may be muddy in parks"}
	case "GH":
		return []string{"Year of Return / diaspora tourism popular", "Accra nightlife peaks on weekends", "Cape Coast castle tours book up — reserve ahead", "Harmattan (Dec-Feb) brings dry, dusty air"}
	case "ZA":
		if month >= 6 && month <= 9 {
			return []string{"Winter — best for safari (animals near water holes)", "Cape Town can be rainy — pack waterproofs", "Whale watching season in Hermanus", "Lower accommodation rates outside Cape Town"}
		}
		return []string{"Summer — peak beach season", "Table Mountain visibility best in morning", "Book wine tours in advance", "Load shedding possible — carry power bank"}
	default:
		return []string{"Check visa requirements before travel", "Carry USD as backup currency", "Download offline maps for rural areas"}
	}
}

func (s *MerchantCatalogService) GetMerchantContext(country string) string {
	merchants := s.SearchMerchants(MerchantSearchRequest{Country: country, Limit: 30})
	products := s.GetProductsByCountry(country, nil, "")

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("=== TourismPay Verified Merchants in %s ===\n\n", country))

	for _, m := range merchants {
		sb.WriteString(fmt.Sprintf("MERCHANT #%d: %s\n", m.ID, m.Name))
		sb.WriteString(fmt.Sprintf("  Type: %s | City: %s | Rating: %.1f (%d reviews) | Price: %s\n", m.Type, m.City, m.Rating, m.ReviewCount, m.PriceRange))
		sb.WriteString(fmt.Sprintf("  Categories: %s\n", strings.Join(m.Categories, ", ")))
		sb.WriteString(fmt.Sprintf("  TourismPay: %v | KYB: %s\n", m.AcceptsTourismPay, m.KybStatus))

		var merchantProducts []ProductListing
		for _, p := range products {
			if p.EstablishmentID == m.ID {
				merchantProducts = append(merchantProducts, p)
			}
		}
		if len(merchantProducts) > 0 {
			sb.WriteString("  Products:\n")
			for _, p := range merchantProducts {
				sb.WriteString(fmt.Sprintf("    - %s: $%.2f (%s)\n", p.Name, p.PriceUSD, p.Description))
			}
		}
		sb.WriteString("\n")
	}

	ctx := currencyContexts[strings.ToUpper(country)]
	if ctx.LocalCurrency != "" {
		sb.WriteString(fmt.Sprintf("CURRENCY: %s (%s) — 1 USD = %.0f %s\n", ctx.LocalCurrency, ctx.Symbol, ctx.ExchangeRate, ctx.LocalCurrency))
		sb.WriteString(fmt.Sprintf("TIP: %.0f%% | Cash preferred: %v\n", ctx.TipPercent, ctx.CashPreferred))
	}

	tips := generateSeasonalTips(country)
	sb.WriteString("\nSEASONAL TIPS:\n")
	for _, t := range tips {
		sb.WriteString(fmt.Sprintf("  • %s\n", t))
	}

	return sb.String()
}

// ─── Handlers ───────────────────────────────────────────────────────────────

type MerchantCatalogHandlers struct {
	svc *MerchantCatalogService
}

func NewMerchantCatalogHandlers(svc *MerchantCatalogService) *MerchantCatalogHandlers {
	return &MerchantCatalogHandlers{svc: svc}
}

func (h *MerchantCatalogHandlers) SearchMerchants(c *gin.Context) {
	var req MerchantSearchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// Fall back to query params
		req.Country = c.Query("country")
		req.City = c.Query("city")
		req.Query = c.Query("q")
		req.Budget = c.Query("budget")
	}
	results := h.svc.SearchMerchants(req)
	c.JSON(http.StatusOK, gin.H{"merchants": results, "count": len(results)})
}

func (h *MerchantCatalogHandlers) GetProducts(c *gin.Context) {
	country := c.Query("country")
	if country == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "country is required"})
		return
	}
	budget := c.Query("budget")
	category := c.Query("category")
	var categories []string
	if category != "" {
		categories = strings.Split(category, ",")
	}
	results := h.svc.GetProductsByCountry(country, categories, budget)
	c.JSON(http.StatusOK, gin.H{"products": results, "count": len(results)})
}

func (h *MerchantCatalogHandlers) GetItineraryEstimate(c *gin.Context) {
	country := c.Query("country")
	city := c.Query("city")
	budget := c.DefaultQuery("budget", "mid-range")
	days := 5
	if d := c.Query("days"); d != "" {
		fmt.Sscanf(d, "%d", &days)
	}
	if country == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "country is required"})
		return
	}
	estimate := h.svc.GetItineraryEstimate(country, city, days, budget)
	c.JSON(http.StatusOK, estimate)
}

func (h *MerchantCatalogHandlers) GetMerchantContext(c *gin.Context) {
	country := c.Query("country")
	if country == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "country is required"})
		return
	}
	context := h.svc.GetMerchantContext(country)
	c.JSON(http.StatusOK, gin.H{"context": context, "country": country})
}
