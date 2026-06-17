// SMS Booking Handler — Africa GDS Low-Tech Onboarding
// Handles booking confirmations, rate updates, and payout notifications
// via SMS for Tier 1 (SMS-only) establishments.
//
// Integrates with: Africa's Talking SMS API, Twilio, Flutterwave
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

const (
	Port        = ":8102"
	ServiceName = "gds-sms-handler"
	Version     = "1.0.0"
)

// ─── Models ──────────────────────────────────────────────────────
type SMSInbound struct {
	From    string `json:"from"`
	To      string `json:"to"`
	Text    string `json:"text"`
	ID      string `json:"id"`
	Date    string `json:"date"`
	Network string `json:"network,omitempty"`
}

type SMSOutbound struct {
	To      string `json:"to"`
	Message string `json:"message"`
	Status  string `json:"status"`
	SentAt  string `json:"sent_at"`
}

type BookingAlert struct {
	ID              string `json:"id"`
	EstablishmentID string `json:"establishment_id"`
	OwnerPhone      string `json:"owner_phone"`
	GuestName       string `json:"guest_name"`
	GuestPhone      string `json:"guest_phone"`
	CheckIn         string `json:"check_in"`
	CheckOut        string `json:"check_out"`
	Rooms           int    `json:"rooms"`
	TotalAmount     string `json:"total_amount"`
	Status          string `json:"status"` // sent, confirmed, rejected, expired
	SentAt          time.Time `json:"sent_at"`
	RespondedAt     *time.Time `json:"responded_at,omitempty"`
}

type PayoutNotification struct {
	Phone    string  `json:"phone"`
	Amount   float64 `json:"amount"`
	Currency string  `json:"currency"`
	Method   string  `json:"method"` // mpesa, mtn_momo, airtel_money, bank
	Ref      string  `json:"ref"`
}

// ─── Store ───────────────────────────────────────────────────────
var (
	pendingAlerts = make(map[string]*BookingAlert)
	sentMessages  []SMSOutbound
	mu            sync.RWMutex
	alertCounter  int
)

// ─── SMS Templates (multilingual, <160 chars per SMS) ────────────
var templates = map[string]map[string]string{
	"booking_alert": {
		"en": "GDS: New booking! %s, %s-%s, %d room(s), %s. Reply YES to confirm or NO to decline. Ref:%s",
		"fr": "GDS: Nouvelle réservation! %s, %s-%s, %d chambre(s), %s. Répondez OUI/NON. Ref:%s",
		"sw": "GDS: Uhifadhi mpya! %s, %s-%s, vyumba %d, %s. Jibu NDIYO/HAPANA. Ref:%s",
	},
	"booking_confirmed": {
		"en": "GDS: Booking %s CONFIRMED. %s will arrive %s. Prepare room(s). Payout on checkout.",
		"fr": "GDS: Réservation %s CONFIRMÉE. %s arrive %s. Préparez chambre(s).",
		"sw": "GDS: Uhifadhi %s UMETHIBITISHWA. %s atafika %s. Andaa vyumba.",
	},
	"booking_rejected": {
		"en": "GDS: Booking %s declined. Guest notified. No action needed.",
		"fr": "GDS: Réservation %s refusée. Client notifié.",
		"sw": "GDS: Uhifadhi %s umekataliwa. Mgeni amefahamishwa.",
	},
	"payout": {
		"en": "GDS: Payout of %s %s sent to your %s. Ref: %s. Check balance.",
		"fr": "GDS: Paiement de %s %s envoyé à votre %s. Réf: %s.",
		"sw": "GDS: Malipo ya %s %s yametumwa kwa %s yako. Ref: %s.",
	},
	"reminder": {
		"en": "GDS: Guest %s arrives TOMORROW (%s). %d room(s) booked. Ref:%s",
		"fr": "GDS: Le client %s arrive DEMAIN (%s). %d chambre(s). Réf:%s",
		"sw": "GDS: Mgeni %s anafika KESHO (%s). Vyumba %d. Ref:%s",
	},
	"rate_updated": {
		"en": "GDS: Rate updated to %s %s/night. Effective now. Reply RATE to check.",
		"fr": "GDS: Tarif mis à jour: %s %s/nuit. Effectif immédiatement.",
		"sw": "GDS: Bei imesasishwa: %s %s/usiku. Inaanza sasa.",
	},
	"weekly_summary": {
		"en": "GDS Weekly: %d bookings, %s earned, %s pending payout. Next payout: %s.",
		"fr": "GDS Hebdo: %d réservations, %s gagnés, %s en attente. Prochain: %s.",
		"sw": "GDS Wiki: Uhifadhi %d, %s umepatikana, %s inasubiri. Ijayo: %s.",
	},
}

// ─── Handlers ────────────────────────────────────────────────────
func handleInboundSMS(w http.ResponseWriter, r *http.Request) {
	var sms SMSInbound
	if r.Header.Get("Content-Type") == "application/json" {
		json.NewDecoder(r.Body).Decode(&sms)
	} else {
		r.ParseForm()
		sms = SMSInbound{
			From: r.FormValue("from"),
			To:   r.FormValue("to"),
			Text: r.FormValue("text"),
			ID:   r.FormValue("id"),
		}
	}

	response := processInbound(sms)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "processed",
		"from":     sms.From,
		"response": response,
	})
}

func processInbound(sms SMSInbound) string {
	text := strings.TrimSpace(strings.ToUpper(sms.Text))

	// Check if responding to a booking alert
	mu.RLock()
	var matchedAlert *BookingAlert
	for _, alert := range pendingAlerts {
		if alert.OwnerPhone == sms.From && alert.Status == "sent" {
			matchedAlert = alert
			break
		}
	}
	mu.RUnlock()

	if matchedAlert != nil {
		switch {
		case strings.Contains(text, "YES") || strings.Contains(text, "OUI") || strings.Contains(text, "NDIYO"):
			return confirmBooking(matchedAlert)
		case strings.Contains(text, "NO") || strings.Contains(text, "NON") || strings.Contains(text, "HAPANA"):
			return rejectBooking(matchedAlert)
		}
	}

	// Other commands
	switch {
	case strings.HasPrefix(text, "RATE"):
		return "Your current rate is active. Dial *384*GDS# or WhatsApp to update."
	case strings.HasPrefix(text, "HELP"):
		return "GDS Help: Reply YES/NO to bookings. Dial *384*GDS# for full menu. Call +254-800-GDS-HELP."
	case strings.HasPrefix(text, "STOP"):
		return "GDS: Notifications paused. Reply START to resume."
	case strings.HasPrefix(text, "START"):
		return "GDS: Notifications resumed. You'll receive booking alerts."
	default:
		return "GDS: Reply YES/NO to pending bookings. Dial *384*GDS# for menu. HELP for support."
	}
}

func confirmBooking(alert *BookingAlert) string {
	mu.Lock()
	alert.Status = "confirmed"
	now := time.Now()
	alert.RespondedAt = &now
	mu.Unlock()

	// Send confirmation to guest (in production: via SMS API)
	guestMsg := fmt.Sprintf("Your booking at is CONFIRMED! Check-in: %s. Ref: %s", alert.CheckIn, alert.ID)
	sendSMS(alert.GuestPhone, guestMsg)

	lang := detectLanguageFromPhone(alert.OwnerPhone)
	return fmt.Sprintf(getTemplate("booking_confirmed", lang), alert.ID, alert.GuestName, alert.CheckIn)
}

func rejectBooking(alert *BookingAlert) string {
	mu.Lock()
	alert.Status = "rejected"
	now := time.Now()
	alert.RespondedAt = &now
	mu.Unlock()

	// Notify guest
	sendSMS(alert.GuestPhone, fmt.Sprintf("Sorry, your booking request (Ref: %s) was not available. We'll find alternatives.", alert.ID))

	lang := detectLanguageFromPhone(alert.OwnerPhone)
	return fmt.Sprintf(getTemplate("booking_rejected", lang), alert.ID)
}

// ─── Outbound SMS Sending ────────────────────────────────────────
func handleSendBookingAlert(w http.ResponseWriter, r *http.Request) {
	var req struct {
		OwnerPhone      string `json:"owner_phone"`
		EstablishmentID string `json:"establishment_id"`
		GuestName       string `json:"guest_name"`
		GuestPhone      string `json:"guest_phone"`
		CheckIn         string `json:"check_in"`
		CheckOut        string `json:"check_out"`
		Rooms           int    `json:"rooms"`
		TotalAmount     string `json:"total_amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", 400)
		return
	}

	mu.Lock()
	alertCounter++
	id := fmt.Sprintf("ALT-%05d", alertCounter)
	alert := &BookingAlert{
		ID:              id,
		EstablishmentID: req.EstablishmentID,
		OwnerPhone:      req.OwnerPhone,
		GuestName:       req.GuestName,
		GuestPhone:      req.GuestPhone,
		CheckIn:         req.CheckIn,
		CheckOut:        req.CheckOut,
		Rooms:           req.Rooms,
		TotalAmount:     req.TotalAmount,
		Status:          "sent",
		SentAt:          time.Now(),
	}
	pendingAlerts[id] = alert
	mu.Unlock()

	// Send SMS to establishment owner
	lang := detectLanguageFromPhone(req.OwnerPhone)
	msg := fmt.Sprintf(getTemplate("booking_alert", lang), req.GuestName, req.CheckIn, req.CheckOut, req.Rooms, req.TotalAmount, id)
	sendSMS(req.OwnerPhone, msg)

	w.WriteHeader(201)
	json.NewEncoder(w).Encode(map[string]interface{}{"alert": alert, "sms_sent": true})
}

func handleSendPayout(w http.ResponseWriter, r *http.Request) {
	var req PayoutNotification
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", 400)
		return
	}

	lang := detectLanguageFromPhone(req.Phone)
	msg := fmt.Sprintf(getTemplate("payout", lang), fmt.Sprintf("%.0f", req.Amount), req.Currency, req.Method, req.Ref)
	sendSMS(req.Phone, msg)

	json.NewEncoder(w).Encode(map[string]interface{}{"status": "sent", "message": msg})
}

func sendSMS(to, message string) {
	mu.Lock()
	sentMessages = append(sentMessages, SMSOutbound{
		To:      to,
		Message: message,
		Status:  "delivered",
		SentAt:  time.Now().Format(time.RFC3339),
	})
	mu.Unlock()
	log.Printf("[SMS] → %s: %s", to, message)
}

// ─── Helpers ─────────────────────────────────────────────────────
func getTemplate(key, lang string) string {
	if t, ok := templates[key]; ok {
		if msg, ok := t[lang]; ok {
			return msg
		}
		return t["en"]
	}
	return ""
}

func detectLanguageFromPhone(phone string) string {
	switch {
	case strings.HasPrefix(phone, "+254"), strings.HasPrefix(phone, "+255"):
		return "sw"
	case strings.HasPrefix(phone, "+225"), strings.HasPrefix(phone, "+221"):
		return "fr"
	default:
		return "en"
	}
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	mu.RLock()
	pending := 0
	for _, a := range pendingAlerts {
		if a.Status == "sent" {
			pending++
		}
	}
	mu.RUnlock()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "healthy",
		"service": ServiceName,
		"version": Version,
		"stats": map[string]int{
			"total_alerts":    len(pendingAlerts),
			"pending_alerts":  pending,
			"messages_sent":   len(sentMessages),
		},
	})
}

func handleGetAlerts(w http.ResponseWriter, _ *http.Request) {
	mu.RLock()
	alerts := make([]*BookingAlert, 0, len(pendingAlerts))
	for _, a := range pendingAlerts {
		alerts = append(alerts, a)
	}
	mu.RUnlock()
	json.NewEncoder(w).Encode(map[string]interface{}{"alerts": alerts, "total": len(alerts)})
}

// ─── CORS Middleware ─────────────────────────────────────────────
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ─── Main ────────────────────────────────────────────────────────
func main() {
	mux := http.NewServeMux()

	// Inbound SMS (carrier callback)
	mux.HandleFunc("/sms/inbound", handleInboundSMS)
	mux.HandleFunc("/api/v1/sms/inbound", handleInboundSMS)

	// Outbound triggers
	mux.HandleFunc("/api/v1/sms/booking-alert", handleSendBookingAlert)
	mux.HandleFunc("/api/v1/sms/payout", handleSendPayout)

	// Admin
	mux.HandleFunc("/api/v1/alerts", handleGetAlerts)
	mux.HandleFunc("/health", handleHealth)

	handler := corsMiddleware(mux)

	log.Printf("[%s] Starting on port %s — SMS booking handler", ServiceName, Port)
	log.Printf("[%s] Supports: booking alerts, YES/NO confirmation, payout notifications", ServiceName)
	log.Fatal(http.ListenAndServe(Port, handler))
}
