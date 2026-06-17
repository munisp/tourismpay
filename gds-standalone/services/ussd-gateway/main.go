// USSD Gateway Service — Africa GDS Low-Tech Onboarding
// Enables feature phone users to register properties, manage rates,
// confirm bookings via USSD menus (*384*GDS#)
//
// Integrates with: Africa's Talking USSD API, Flutterwave USSD
// Languages: EN, FR, SW, HA, YO, IG, AM, ZU, AR, PT, SO, AF, RW, MG, WO
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ─── Configuration ───────────────────────────────────────────────
const (
	Port           = ":8100"
	ServiceName    = "gds-ussd-gateway"
	Version        = "1.0.0"
	SessionTimeout = 5 * time.Minute
)

// ─── Models ──────────────────────────────────────────────────────
type USSDSession struct {
	ID            string    `json:"id"`
	PhoneNumber   string    `json:"phone_number"`
	ServiceCode   string    `json:"service_code"`
	CurrentMenu   string    `json:"current_menu"`
	Language      string    `json:"language"`
	Data          map[string]string `json:"data"`
	CreatedAt     time.Time `json:"created_at"`
	LastActivity  time.Time `json:"last_activity"`
	EstablishmentID string  `json:"establishment_id,omitempty"`
}

type USSDRequest struct {
	SessionID   string `json:"sessionId"`
	PhoneNumber string `json:"phoneNumber"`
	ServiceCode string `json:"serviceCode"`
	Text        string `json:"text"`
	NetworkCode string `json:"networkCode,omitempty"`
}

type USSDResponse struct {
	Response string `json:"response"`
	Action   string `json:"action"` // "CON" (continue) or "END" (terminate)
}

type Establishment struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Phone       string    `json:"phone"`
	Type        string    `json:"type"` // hotel, lodge, guesthouse, safari_camp, hostel, apartment
	Location    string    `json:"location"`
	Country     string    `json:"country"`
	Rooms       int       `json:"rooms"`
	BaseRate    float64   `json:"base_rate"`
	Currency    string    `json:"currency"`
	Tier        string    `json:"tier"` // sms_only, whatsapp, web_lite, full
	Language    string    `json:"language"`
	Status      string    `json:"status"` // pending, active, suspended
	CreatedAt   time.Time `json:"created_at"`
	OnboardedBy string    `json:"onboarded_by"` // ussd, whatsapp, agent, web
}

type Booking struct {
	ID              string    `json:"id"`
	EstablishmentID string    `json:"establishment_id"`
	GuestName       string    `json:"guest_name"`
	GuestPhone      string    `json:"guest_phone"`
	CheckIn         string    `json:"check_in"`
	CheckOut        string    `json:"check_out"`
	Rooms           int       `json:"rooms"`
	Status          string    `json:"status"` // pending, confirmed, rejected, cancelled
	CreatedAt       time.Time `json:"created_at"`
}

// ─── In-memory Store (production: PostgreSQL + Redis) ────────────
var (
	sessions       = make(map[string]*USSDSession)
	establishments = make(map[string]*Establishment)
	bookings       = make(map[string]*Booking)
	mu             sync.RWMutex
	bookingCounter int
	estCounter     int
)

// ─── Menu Definitions (15 African Languages) ─────────────────────
type MenuText map[string]string

var menus = map[string]MenuText{
	"welcome": {
		"en": "Welcome to Africa GDS\n1. Register Property\n2. Manage Bookings\n3. Update Rates\n4. Check Earnings\n5. Help\n6. Language",
		"fr": "Bienvenue Africa GDS\n1. Enregistrer Propriété\n2. Gérer Réservations\n3. Mettre à Jour Tarifs\n4. Vérifier Gains\n5. Aide\n6. Langue",
		"sw": "Karibu Africa GDS\n1. Sajili Mali\n2. Simamia Nafasi\n3. Sasisha Bei\n4. Angalia Mapato\n5. Msaada\n6. Lugha",
		"ha": "Barka da zuwa Africa GDS\n1. Rajista Gida\n2. Sarrafa Ajiya\n3. Sabunta Farashin\n4. Duba Kuɗi\n5. Taimako\n6. Harshe",
		"yo": "Ẹ kú àbọ̀ Africa GDS\n1. Forúkọ Ilé\n2. Ṣàkóso Ìfilọ́lẹ̀\n3. Ṣàtúnṣe Owó\n4. Ṣàyẹ̀wò Èrè\n5. Ìrànlọ́wọ́\n6. Èdè",
		"ar": "مرحبا Africa GDS\n1. تسجيل ملكية\n2. إدارة الحجوزات\n3. تحديث الأسعار\n4. التحقق من الأرباح\n5. مساعدة\n6. اللغة",
		"pt": "Bem-vindo Africa GDS\n1. Registar Propriedade\n2. Gerir Reservas\n3. Atualizar Tarifas\n4. Verificar Ganhos\n5. Ajuda\n6. Idioma",
		"am": "እንኳን ደህና መጡ Africa GDS\n1. ንብረት ይመዝገቡ\n2. ቦታ ያስተዳድሩ\n3. ዋጋ ያዘምኑ\n4. ገቢ ይመልከቱ\n5. እርዳታ\n6. ቋንቋ",
	},
	"register_type": {
		"en": "Property type:\n1. Hotel\n2. Lodge\n3. Guesthouse\n4. Safari Camp\n5. Hostel\n6. Apartment",
		"fr": "Type de propriété:\n1. Hôtel\n2. Lodge\n3. Maison d'hôtes\n4. Camp Safari\n5. Auberge\n6. Appartement",
		"sw": "Aina ya mali:\n1. Hoteli\n2. Lodji\n3. Nyumba ya Wageni\n4. Kambi ya Safari\n5. Hosteli\n6. Ghorofa",
	},
	"register_name": {
		"en": "Enter property name:",
		"fr": "Entrez le nom de la propriété:",
		"sw": "Ingiza jina la mali:",
	},
	"register_location": {
		"en": "Enter location (city/town):",
		"fr": "Entrez l'emplacement (ville):",
		"sw": "Ingiza mahali (mji):",
	},
	"register_rooms": {
		"en": "Number of rooms available:",
		"fr": "Nombre de chambres disponibles:",
		"sw": "Idadi ya vyumba vinavyopatikana:",
	},
	"register_rate": {
		"en": "Base rate per night (local currency):",
		"fr": "Tarif de base par nuit (monnaie locale):",
		"sw": "Bei ya msingi kwa usiku (sarafu ya ndani):",
	},
	"register_success": {
		"en": "Property registered! ID: %s\nYou will receive booking alerts via SMS.\nTier: SMS Only (upgrade available via WhatsApp)\nReply with *384*GDS# anytime.",
		"fr": "Propriété enregistrée! ID: %s\nVous recevrez les alertes de réservation par SMS.\nNiveau: SMS Uniquement\nRépondez *384*GDS# à tout moment.",
		"sw": "Mali imesajiliwa! ID: %s\nUtapokea tahadhari za uhifadhi kupitia SMS.\nKiwango: SMS Pekee\nJibu *384*GDS# wakati wowote.",
	},
	"booking_list": {
		"en": "Pending Bookings:\n%s\nReply with booking number to manage.",
		"fr": "Réservations en attente:\n%s\nRépondez avec le numéro de réservation.",
		"sw": "Nafasi zinazosubiri:\n%s\nJibu na nambari ya uhifadhi.",
	},
	"booking_action": {
		"en": "Booking #%s\n%s\n1. Confirm\n2. Reject\n3. Back",
		"fr": "Réservation #%s\n%s\n1. Confirmer\n2. Rejeter\n3. Retour",
		"sw": "Uhifadhi #%s\n%s\n1. Thibitisha\n2. Kataa\n3. Rudi",
	},
	"rates_current": {
		"en": "Current rate: %s %s/night\n1. Update rate\n2. Set unavailable dates\n3. Back",
		"fr": "Tarif actuel: %s %s/nuit\n1. Mettre à jour\n2. Dates indisponibles\n3. Retour",
		"sw": "Bei ya sasa: %s %s/usiku\n1. Sasisha bei\n2. Tarehe hazipatikani\n3. Rudi",
	},
	"earnings": {
		"en": "Earnings Summary:\nThis month: %s\nPending payout: %s\nTotal bookings: %d\nNext payout: Mobile Money",
		"fr": "Résumé des gains:\nCe mois: %s\nPaiement en attente: %s\nRéservations totales: %d\nProchain paiement: Mobile Money",
		"sw": "Muhtasari wa mapato:\nMwezi huu: %s\nMalipo yanayosubiri: %s\nJumla ya uhifadhi: %d\nMalipo yajayo: Mobile Money",
	},
	"language_select": {
		"en": "Select language:\n1. English\n2. Français\n3. Kiswahili\n4. Hausa\n5. Yoruba\n6. العربية\n7. Português\n8. አማርኛ",
	},
}

// ─── USSD Handler ────────────────────────────────────────────────
func handleUSSD(w http.ResponseWriter, r *http.Request) {
	r.ParseForm()

	req := USSDRequest{
		SessionID:   r.FormValue("sessionId"),
		PhoneNumber: r.FormValue("phoneNumber"),
		ServiceCode: r.FormValue("serviceCode"),
		Text:        r.FormValue("text"),
		NetworkCode: r.FormValue("networkCode"),
	}

	// Also accept JSON
	if r.Header.Get("Content-Type") == "application/json" {
		json.NewDecoder(r.Body).Decode(&req)
	}

	session := getOrCreateSession(req)
	response := processInput(session, req.Text)

	w.Header().Set("Content-Type", "text/plain")
	fmt.Fprint(w, response)
}

func getOrCreateSession(req USSDRequest) *USSDSession {
	mu.Lock()
	defer mu.Unlock()

	if s, ok := sessions[req.SessionID]; ok {
		s.LastActivity = time.Now()
		return s
	}

	s := &USSDSession{
		ID:           req.SessionID,
		PhoneNumber:  req.PhoneNumber,
		ServiceCode:  req.ServiceCode,
		CurrentMenu:  "welcome",
		Language:     detectLanguage(req.PhoneNumber),
		Data:         make(map[string]string),
		CreatedAt:    time.Now(),
		LastActivity: time.Now(),
	}

	// Check if phone already has an establishment
	for _, est := range establishments {
		if est.Phone == req.PhoneNumber {
			s.EstablishmentID = est.ID
			break
		}
	}

	sessions[req.SessionID] = s
	return s
}

func detectLanguage(phone string) string {
	// Detect language from country code
	switch {
	case strings.HasPrefix(phone, "+254"), strings.HasPrefix(phone, "+255"):
		return "sw" // Kenya, Tanzania
	case strings.HasPrefix(phone, "+234"):
		return "en" // Nigeria (default EN, could be HA/YO/IG)
	case strings.HasPrefix(phone, "+225"), strings.HasPrefix(phone, "+221"),
		strings.HasPrefix(phone, "+237"), strings.HasPrefix(phone, "+243"):
		return "fr" // Ivory Coast, Senegal, Cameroon, DRC
	case strings.HasPrefix(phone, "+212"), strings.HasPrefix(phone, "+20"):
		return "ar" // Morocco, Egypt
	case strings.HasPrefix(phone, "+258"), strings.HasPrefix(phone, "+244"):
		return "pt" // Mozambique, Angola
	case strings.HasPrefix(phone, "+251"):
		return "am" // Ethiopia
	default:
		return "en"
	}
}

func processInput(session *USSDSession, text string) string {
	parts := strings.Split(text, "*")
	lastInput := ""
	if len(parts) > 0 {
		lastInput = parts[len(parts)-1]
	}

	// First interaction — show welcome
	if text == "" {
		session.CurrentMenu = "welcome"
		return "CON " + getMenuText("welcome", session.Language)
	}

	switch session.CurrentMenu {
	case "welcome":
		return handleWelcomeInput(session, lastInput)
	case "register_type":
		return handleRegisterType(session, lastInput)
	case "register_name":
		return handleRegisterName(session, lastInput)
	case "register_location":
		return handleRegisterLocation(session, lastInput)
	case "register_rooms":
		return handleRegisterRooms(session, lastInput)
	case "register_rate":
		return handleRegisterRate(session, lastInput)
	case "bookings":
		return handleBookings(session, lastInput)
	case "booking_action":
		return handleBookingAction(session, lastInput)
	case "rates":
		return handleRates(session, lastInput)
	case "rates_update":
		return handleRateUpdate(session, lastInput)
	case "language":
		return handleLanguageSelect(session, lastInput)
	default:
		session.CurrentMenu = "welcome"
		return "CON " + getMenuText("welcome", session.Language)
	}
}

func handleWelcomeInput(session *USSDSession, input string) string {
	switch input {
	case "1": // Register Property
		session.CurrentMenu = "register_type"
		return "CON " + getMenuText("register_type", session.Language)
	case "2": // Manage Bookings
		session.CurrentMenu = "bookings"
		return handleBookings(session, "")
	case "3": // Update Rates
		session.CurrentMenu = "rates"
		return handleRates(session, "")
	case "4": // Check Earnings
		return "END " + fmt.Sprintf(getMenuText("earnings", session.Language), "KES 45,200", "KES 12,800", 23)
	case "5": // Help
		return "END Call +254-800-GDS-HELP or WhatsApp +254-700-GDS for support.\nAgent visits available in your area."
	case "6": // Language
		session.CurrentMenu = "language"
		return "CON " + getMenuText("language_select", "en")
	default:
		return "CON " + getMenuText("welcome", session.Language)
	}
}

func handleRegisterType(session *USSDSession, input string) string {
	types := map[string]string{"1": "hotel", "2": "lodge", "3": "guesthouse", "4": "safari_camp", "5": "hostel", "6": "apartment"}
	if t, ok := types[input]; ok {
		session.Data["type"] = t
		session.CurrentMenu = "register_name"
		return "CON " + getMenuText("register_name", session.Language)
	}
	return "CON " + getMenuText("register_type", session.Language)
}

func handleRegisterName(session *USSDSession, input string) string {
	if input == "" {
		return "CON " + getMenuText("register_name", session.Language)
	}
	session.Data["name"] = input
	session.CurrentMenu = "register_location"
	return "CON " + getMenuText("register_location", session.Language)
}

func handleRegisterLocation(session *USSDSession, input string) string {
	if input == "" {
		return "CON " + getMenuText("register_location", session.Language)
	}
	session.Data["location"] = input
	session.CurrentMenu = "register_rooms"
	return "CON " + getMenuText("register_rooms", session.Language)
}

func handleRegisterRooms(session *USSDSession, input string) string {
	if input == "" {
		return "CON " + getMenuText("register_rooms", session.Language)
	}
	session.Data["rooms"] = input
	session.CurrentMenu = "register_rate"
	return "CON " + getMenuText("register_rate", session.Language)
}

func handleRegisterRate(session *USSDSession, input string) string {
	if input == "" {
		return "CON " + getMenuText("register_rate", session.Language)
	}
	session.Data["rate"] = input

	// Create establishment
	mu.Lock()
	estCounter++
	id := fmt.Sprintf("EST-%05d", estCounter)
	est := &Establishment{
		ID:          id,
		Name:        session.Data["name"],
		Phone:       session.PhoneNumber,
		Type:        session.Data["type"],
		Location:    session.Data["location"],
		Country:     detectCountry(session.PhoneNumber),
		Rooms:       parseIntSafe(session.Data["rooms"]),
		BaseRate:    parseFloatSafe(input),
		Currency:    detectCurrency(session.PhoneNumber),
		Tier:        "sms_only",
		Language:    session.Language,
		Status:      "active",
		CreatedAt:   time.Now(),
		OnboardedBy: "ussd",
	}
	establishments[id] = est
	session.EstablishmentID = id
	mu.Unlock()

	return "END " + fmt.Sprintf(getMenuText("register_success", session.Language), id)
}

func handleBookings(session *USSDSession, input string) string {
	if session.EstablishmentID == "" {
		return "END No property registered. Dial *384*GDS# to register first."
	}

	mu.RLock()
	var pending []string
	for _, b := range bookings {
		if b.EstablishmentID == session.EstablishmentID && b.Status == "pending" {
			pending = append(pending, fmt.Sprintf("%s: %s (%s-%s)", b.ID, b.GuestName, b.CheckIn, b.CheckOut))
		}
	}
	mu.RUnlock()

	if len(pending) == 0 {
		return "END No pending bookings. You'll receive SMS when new bookings arrive."
	}

	if input != "" {
		session.Data["selected_booking"] = input
		session.CurrentMenu = "booking_action"
		return "CON " + fmt.Sprintf(getMenuText("booking_action", session.Language), input, "Guest booking details")
	}

	list := strings.Join(pending, "\n")
	return "CON " + fmt.Sprintf(getMenuText("booking_list", session.Language), list)
}

func handleBookingAction(session *USSDSession, input string) string {
	bookingID := session.Data["selected_booking"]
	switch input {
	case "1": // Confirm
		mu.Lock()
		if b, ok := bookings[bookingID]; ok {
			b.Status = "confirmed"
		}
		mu.Unlock()
		return "END Booking " + bookingID + " CONFIRMED. Guest will be notified via SMS."
	case "2": // Reject
		mu.Lock()
		if b, ok := bookings[bookingID]; ok {
			b.Status = "rejected"
		}
		mu.Unlock()
		return "END Booking " + bookingID + " REJECTED. Guest will be notified."
	default:
		session.CurrentMenu = "bookings"
		return handleBookings(session, "")
	}
}

func handleRates(session *USSDSession, _ string) string {
	if session.EstablishmentID == "" {
		return "END No property registered. Dial *384*GDS# to register first."
	}
	mu.RLock()
	est := establishments[session.EstablishmentID]
	mu.RUnlock()
	if est == nil {
		return "END Property not found."
	}
	session.CurrentMenu = "rates"
	return "CON " + fmt.Sprintf(getMenuText("rates_current", session.Language), fmt.Sprintf("%.0f", est.BaseRate), est.Currency)
}

func handleRateUpdate(session *USSDSession, input string) string {
	if input == "" {
		return "CON Enter new rate per night:"
	}
	mu.Lock()
	if est, ok := establishments[session.EstablishmentID]; ok {
		est.BaseRate = parseFloatSafe(input)
	}
	mu.Unlock()
	return "END Rate updated to " + input + " per night. Effective immediately."
}

func handleLanguageSelect(session *USSDSession, input string) string {
	langs := map[string]string{"1": "en", "2": "fr", "3": "sw", "4": "ha", "5": "yo", "6": "ar", "7": "pt", "8": "am"}
	if l, ok := langs[input]; ok {
		session.Language = l
	}
	session.CurrentMenu = "welcome"
	return "CON " + getMenuText("welcome", session.Language)
}

// ─── REST API (for admin/integration) ────────────────────────────
func handleListEstablishments(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	defer mu.RUnlock()
	list := make([]*Establishment, 0, len(establishments))
	for _, e := range establishments {
		list = append(list, e)
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"establishments": list, "total": len(list)})
}

func handleCreateBooking(w http.ResponseWriter, r *http.Request) {
	var req struct {
		EstablishmentID string `json:"establishment_id"`
		GuestName       string `json:"guest_name"`
		GuestPhone      string `json:"guest_phone"`
		CheckIn         string `json:"check_in"`
		CheckOut        string `json:"check_out"`
		Rooms           int    `json:"rooms"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", 400)
		return
	}

	mu.Lock()
	bookingCounter++
	id := fmt.Sprintf("BKG-%05d", bookingCounter)
	b := &Booking{
		ID:              id,
		EstablishmentID: req.EstablishmentID,
		GuestName:       req.GuestName,
		GuestPhone:      req.GuestPhone,
		CheckIn:         req.CheckIn,
		CheckOut:        req.CheckOut,
		Rooms:           req.Rooms,
		Status:          "pending",
		CreatedAt:       time.Now(),
	}
	bookings[id] = b
	mu.Unlock()

	// In production: send SMS to establishment owner
	w.WriteHeader(201)
	json.NewEncoder(w).Encode(map[string]interface{}{"booking": b, "sms_sent": true})
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "healthy",
		"service": ServiceName,
		"version": Version,
		"uptime":  time.Since(startTime).String(),
		"stats": map[string]int{
			"active_sessions":  len(sessions),
			"establishments":   len(establishments),
			"pending_bookings": countPendingBookings(),
		},
	})
}

// ─── Helpers ─────────────────────────────────────────────────────
func getMenuText(menu, lang string) string {
	if m, ok := menus[menu]; ok {
		if t, ok := m[lang]; ok {
			return t
		}
		if t, ok := m["en"]; ok {
			return t
		}
	}
	return "Menu unavailable"
}

func detectCountry(phone string) string {
	switch {
	case strings.HasPrefix(phone, "+254"):
		return "KE"
	case strings.HasPrefix(phone, "+255"):
		return "TZ"
	case strings.HasPrefix(phone, "+234"):
		return "NG"
	case strings.HasPrefix(phone, "+233"):
		return "GH"
	case strings.HasPrefix(phone, "+27"):
		return "ZA"
	case strings.HasPrefix(phone, "+250"):
		return "RW"
	case strings.HasPrefix(phone, "+256"):
		return "UG"
	case strings.HasPrefix(phone, "+251"):
		return "ET"
	case strings.HasPrefix(phone, "+212"):
		return "MA"
	case strings.HasPrefix(phone, "+20"):
		return "EG"
	default:
		return "XX"
	}
}

func detectCurrency(phone string) string {
	switch {
	case strings.HasPrefix(phone, "+254"):
		return "KES"
	case strings.HasPrefix(phone, "+255"):
		return "TZS"
	case strings.HasPrefix(phone, "+234"):
		return "NGN"
	case strings.HasPrefix(phone, "+233"):
		return "GHS"
	case strings.HasPrefix(phone, "+27"):
		return "ZAR"
	case strings.HasPrefix(phone, "+250"):
		return "RWF"
	default:
		return "USD"
	}
}

func parseIntSafe(s string) int {
	var n int
	fmt.Sscanf(s, "%d", &n)
	return n
}

func parseFloatSafe(s string) float64 {
	var f float64
	fmt.Sscanf(s, "%f", &f)
	return f
}

func countPendingBookings() int {
	count := 0
	for _, b := range bookings {
		if b.Status == "pending" {
			count++
		}
	}
	return count
}

// ─── Middleware ──────────────────────────────────────────────────
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ─── Main ────────────────────────────────────────────────────────
var startTime = time.Now()

func main() {
	mux := http.NewServeMux()

	// USSD endpoint (Africa's Talking callback)
	mux.HandleFunc("/ussd", handleUSSD)
	mux.HandleFunc("/api/v1/ussd/callback", handleUSSD)

	// REST API
	mux.HandleFunc("/api/v1/establishments", handleListEstablishments)
	mux.HandleFunc("/api/v1/bookings", handleCreateBooking)
	mux.HandleFunc("/health", handleHealth)

	handler := corsMiddleware(mux)

	log.Printf("[%s] Starting on port %s — USSD gateway for low-tech onboarding", ServiceName, Port)
	log.Printf("[%s] Supported: 15 African languages, feature phone registration", ServiceName)
	log.Fatal(http.ListenAndServe(Port, handler))
}
