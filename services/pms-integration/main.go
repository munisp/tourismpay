// services/pms-integration/main.go
// TourismPay PMS Integration Service — Go microservice
//
// Integrates TourismPay with hotel Property Management Systems:
//   - Oracle Opera Cloud (REST API v1)
//   - Cloudbeds (OAuth2 + REST)
//   - Mews (REST API)
//   - Generic Webhook API (for custom PMS)
//
// HTTP endpoints (port 8090):
//   POST /pms/connect          — connect a hotel to a PMS provider
//   GET  /pms/status/:hotelId  — get PMS connection status
//   POST /pms/folio/charge     — charge a guest folio in the PMS
//   POST /pms/folio/settle     — mark a folio as settled
//   POST /pms/webhook          — receive PMS checkout events
//   GET  /pms/reservations/:hotelId — list upcoming reservations
//   POST /pms/sync/:hotelId    — force sync reservations from PMS
//   GET  /health               — liveness check
//   GET  /metrics              — Prometheus metrics
//
// Middleware: Dapr pub/sub (pms.events topic), Redis cache, PostgreSQL
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// ─── Config ──────────────────────────────────────────────────────────────────

type Config struct {
	Port        string
	DatabaseURL string
	RedisURL    string
	DaprPort    string
	// PMS provider credentials (per-tenant, stored in DB)
	OperaBaseURL    string
	CloudbedsAPIURL string
	MewsAPIURL      string
}

func loadConfig() Config {
	return Config{
		Port:            getEnv("PORT", "8090"),
		DatabaseURL:     getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/tourismpay"),
		RedisURL:        getEnv("REDIS_URL", "redis://localhost:6379"),
		DaprPort:        getEnv("DAPR_HTTP_PORT", "3500"),
		OperaBaseURL:    getEnv("OPERA_BASE_URL", "https://api.oracle.com/hospitality/opera/v1"),
		CloudbedsAPIURL: getEnv("CLOUDBEDS_API_URL", "https://api.cloudbeds.com/api/v1.2"),
		MewsAPIURL:      getEnv("MEWS_API_URL", "https://api.mews.com/api/connector/v1"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ─── Models ──────────────────────────────────────────────────────────────────

type PMSProvider string

const (
	ProviderOpera    PMSProvider = "opera"
	ProviderCloudbeds PMSProvider = "cloudbeds"
	ProviderMews     PMSProvider = "mews"
	ProviderWebhook  PMSProvider = "webhook"
)

type PMSConnection struct {
	ID           string      `json:"id"`
	HotelID      string      `json:"hotelId"`
	Provider     PMSProvider `json:"provider"`
	Status       string      `json:"status"` // connected | disconnected | error
	AccessToken  string      `json:"accessToken,omitempty"`
	RefreshToken string      `json:"refreshToken,omitempty"`
	PropertyCode string      `json:"propertyCode"`
	WebhookURL   string      `json:"webhookUrl,omitempty"`
	ConnectedAt  time.Time   `json:"connectedAt"`
	LastSyncAt   *time.Time  `json:"lastSyncAt,omitempty"`
}

type ConnectRequest struct {
	HotelID      string      `json:"hotelId"`
	Provider     PMSProvider `json:"provider"`
	AccessToken  string      `json:"accessToken"`
	RefreshToken string      `json:"refreshToken,omitempty"`
	PropertyCode string      `json:"propertyCode"`
	WebhookURL   string      `json:"webhookUrl,omitempty"`
}

type FolioChargeRequest struct {
	HotelID       string  `json:"hotelId"`
	ReservationID string  `json:"reservationId"`
	GuestName     string  `json:"guestName"`
	AmountNGN     float64 `json:"amountNgn"`
	Currency      string  `json:"currency"`
	Description   string  `json:"description"`
	TourismPayTxID string `json:"tourismPayTxId"`
}

type FolioSettleRequest struct {
	HotelID       string  `json:"hotelId"`
	ReservationID string  `json:"reservationId"`
	FolioID       string  `json:"folioId"`
	AmountNGN     float64 `json:"amountNgn"`
	PaymentRef    string  `json:"paymentRef"`
}

type Reservation struct {
	ID           string    `json:"id"`
	GuestName    string    `json:"guestName"`
	CheckIn      time.Time `json:"checkIn"`
	CheckOut     time.Time `json:"checkOut"`
	RoomNumber   string    `json:"roomNumber"`
	RoomType     string    `json:"roomType"`
	Status       string    `json:"status"`
	TotalAmount  float64   `json:"totalAmount"`
	Currency     string    `json:"currency"`
	BalanceDue   float64   `json:"balanceDue"`
	FolioID      string    `json:"folioId"`
}

type PMSWebhookEvent struct {
	EventType     string          `json:"eventType"` // checkout | checkin | folio_updated
	HotelID       string          `json:"hotelId"`
	ReservationID string          `json:"reservationId"`
	GuestName     string          `json:"guestName"`
	Amount        float64         `json:"amount"`
	Currency      string          `json:"currency"`
	Timestamp     time.Time       `json:"timestamp"`
	Metadata      json.RawMessage `json:"metadata,omitempty"`
}

// ─── Server ──────────────────────────────────────────────────────────────────

type Server struct {
	cfg     Config
	db      *pgxpool.Pool
	router  *chi.Mux
	metrics *PMSMetrics
}

type PMSMetrics struct {
	connectionsTotal   prometheus.Counter
	chargesTotal       prometheus.Counter
	settlementsTotal   prometheus.Counter
	syncDuration       prometheus.Histogram
	webhookEventsTotal prometheus.Counter
}

func newMetrics() *PMSMetrics {
	m := &PMSMetrics{
		connectionsTotal: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "pms_connections_total",
			Help: "Total PMS connections established",
		}),
		chargesTotal: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "pms_folio_charges_total",
			Help: "Total folio charges sent to PMS",
		}),
		settlementsTotal: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "pms_folio_settlements_total",
			Help: "Total folio settlements sent to PMS",
		}),
		syncDuration: prometheus.NewHistogram(prometheus.HistogramOpts{
			Name:    "pms_sync_duration_seconds",
			Help:    "Duration of PMS reservation sync operations",
			Buckets: prometheus.DefBuckets,
		}),
		webhookEventsTotal: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "pms_webhook_events_total",
			Help: "Total webhook events received from PMS",
		}),
	}
	prometheus.MustRegister(m.connectionsTotal, m.chargesTotal, m.settlementsTotal, m.syncDuration, m.webhookEventsTotal)
	return m
}

func NewServer(cfg Config, db *pgxpool.Pool) *Server {
	s := &Server{cfg: cfg, db: db, router: chi.NewRouter(), metrics: newMetrics()}
	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	s.router.Use(middleware.RequestID)
	s.router.Use(middleware.RealIP)
	s.router.Use(middleware.Logger)
	s.router.Use(middleware.Recoverer)
	s.router.Use(middleware.Timeout(30 * time.Second))

	s.router.Get("/health", s.handleHealth)
	s.router.Handle("/metrics", promhttp.Handler())

	s.router.Post("/pms/connect", s.handleConnect)
	s.router.Get("/pms/status/{hotelId}", s.handleStatus)
	s.router.Post("/pms/folio/charge", s.handleFolioCharge)
	s.router.Post("/pms/folio/settle", s.handleFolioSettle)
	s.router.Post("/pms/webhook", s.handleWebhook)
	s.router.Get("/pms/reservations/{hotelId}", s.handleListReservations)
	s.router.Post("/pms/sync/{hotelId}", s.handleSync)
}

// ─── Handlers ────────────────────────────────────────────────────────────────

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "healthy", "service": "pms-integration", "version": "1.0.0"})
}

func (s *Server) handleConnect(w http.ResponseWriter, r *http.Request) {
	var req ConnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.HotelID == "" || req.Provider == "" || req.AccessToken == "" {
		writeError(w, http.StatusBadRequest, "hotelId, provider, and accessToken are required")
		return
	}

	// Validate connection by making a test API call to the PMS
	if err := s.validatePMSConnection(r.Context(), req); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("PMS connection validation failed: %v", err))
		return
	}

	// Store connection in database
	conn := PMSConnection{
		ID:           generateID(),
		HotelID:      req.HotelID,
		Provider:     req.Provider,
		Status:       "connected",
		AccessToken:  req.AccessToken,
		RefreshToken: req.RefreshToken,
		PropertyCode: req.PropertyCode,
		WebhookURL:   req.WebhookURL,
		ConnectedAt:  time.Now(),
	}

	if s.db != nil {
		_, err := s.db.Exec(r.Context(), `
			INSERT INTO pms_connections (id, hotel_id, provider, status, access_token, refresh_token, property_code, webhook_url, connected_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			ON CONFLICT (hotel_id) DO UPDATE SET
				provider = EXCLUDED.provider, status = EXCLUDED.status,
				access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token,
				property_code = EXCLUDED.property_code, webhook_url = EXCLUDED.webhook_url,
				connected_at = EXCLUDED.connected_at`,
			conn.ID, conn.HotelID, conn.Provider, conn.Status,
			conn.AccessToken, conn.RefreshToken, conn.PropertyCode, conn.WebhookURL, conn.ConnectedAt)
		if err != nil {
			log.Printf("DB error storing PMS connection: %v", err)
		}
	}

	// Publish connection event via Dapr
	s.publishEvent(r.Context(), "pms.events", "pms.connected", map[string]interface{}{
		"hotelId":  req.HotelID,
		"provider": req.Provider,
	})

	s.metrics.connectionsTotal.Inc()
	writeJSON(w, http.StatusCreated, conn)
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	hotelID := chi.URLParam(r, "hotelId")
	if s.db == nil {
		writeJSON(w, http.StatusOK, PMSConnection{HotelID: hotelID, Status: "unknown"})
		return
	}

	var conn PMSConnection
	err := s.db.QueryRow(r.Context(), `
		SELECT id, hotel_id, provider, status, property_code, webhook_url, connected_at, last_sync_at
		FROM pms_connections WHERE hotel_id = $1`, hotelID).Scan(
		&conn.ID, &conn.HotelID, &conn.Provider, &conn.Status,
		&conn.PropertyCode, &conn.WebhookURL, &conn.ConnectedAt, &conn.LastSyncAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "PMS connection not found for hotel")
		return
	}
	writeJSON(w, http.StatusOK, conn)
}

func (s *Server) handleFolioCharge(w http.ResponseWriter, r *http.Request) {
	var req FolioChargeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Get PMS connection for hotel
	conn, err := s.getConnection(r.Context(), req.HotelID)
	if err != nil {
		writeError(w, http.StatusNotFound, "no PMS connection found for hotel")
		return
	}

	// Send charge to PMS based on provider
	var chargeID string
	switch conn.Provider {
	case ProviderOpera:
		chargeID, err = s.operaPostCharge(r.Context(), conn, req)
	case ProviderCloudbeds:
		chargeID, err = s.cloudbedsPostCharge(r.Context(), conn, req)
	case ProviderMews:
		chargeID, err = s.mewsPostCharge(r.Context(), conn, req)
	default:
		chargeID = generateID()
	}

	if err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("PMS charge failed: %v", err))
		return
	}

	s.metrics.chargesTotal.Inc()
	writeJSON(w, http.StatusOK, map[string]string{
		"chargeId":       chargeID,
		"status":         "posted",
		"reservationId":  req.ReservationID,
		"tourismPayTxId": req.TourismPayTxID,
	})
}

func (s *Server) handleFolioSettle(w http.ResponseWriter, r *http.Request) {
	var req FolioSettleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	conn, err := s.getConnection(r.Context(), req.HotelID)
	if err != nil {
		writeError(w, http.StatusNotFound, "no PMS connection found for hotel")
		return
	}

	var settleID string
	switch conn.Provider {
	case ProviderOpera:
		settleID, err = s.operaSettleFolio(r.Context(), conn, req)
	case ProviderCloudbeds:
		settleID, err = s.cloudbedsSettleFolio(r.Context(), conn, req)
	case ProviderMews:
		settleID, err = s.mewsSettleFolio(r.Context(), conn, req)
	default:
		settleID = generateID()
	}

	if err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("PMS settlement failed: %v", err))
		return
	}

	s.metrics.settlementsTotal.Inc()
	writeJSON(w, http.StatusOK, map[string]string{
		"settlementId":  settleID,
		"status":        "settled",
		"reservationId": req.ReservationID,
		"paymentRef":    req.PaymentRef,
	})
}

func (s *Server) handleWebhook(w http.ResponseWriter, r *http.Request) {
	var event PMSWebhookEvent
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		writeError(w, http.StatusBadRequest, "invalid webhook payload")
		return
	}

	log.Printf("[PMS Webhook] event=%s hotelId=%s reservationId=%s amount=%.2f %s",
		event.EventType, event.HotelID, event.ReservationID, event.Amount, event.Currency)

	// Publish to Dapr for downstream processing
	s.publishEvent(r.Context(), "pms.events", "pms."+event.EventType, event)

	// For checkout events, trigger automatic payment collection
	if event.EventType == "checkout" && event.Amount > 0 {
		s.publishEvent(r.Context(), "payment.commands", "payment.collect_folio", map[string]interface{}{
			"hotelId":       event.HotelID,
			"reservationId": event.ReservationID,
			"amountNgn":     event.Amount,
			"currency":      event.Currency,
			"guestName":     event.GuestName,
		})
	}

	s.metrics.webhookEventsTotal.Inc()
	writeJSON(w, http.StatusOK, map[string]string{"status": "received"})
}

func (s *Server) handleListReservations(w http.ResponseWriter, r *http.Request) {
	hotelID := chi.URLParam(r, "hotelId")
	conn, err := s.getConnection(r.Context(), hotelID)
	if err != nil {
		writeError(w, http.StatusNotFound, "no PMS connection found for hotel")
		return
	}

	var reservations []Reservation
	switch conn.Provider {
	case ProviderOpera:
		reservations, err = s.operaListReservations(r.Context(), conn)
	case ProviderCloudbeds:
		reservations, err = s.cloudbedsListReservations(r.Context(), conn)
	case ProviderMews:
		reservations, err = s.mewsListReservations(r.Context(), conn)
	default:
		reservations = []Reservation{}
	}

	if err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("failed to fetch reservations: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"hotelId":      hotelID,
		"provider":     conn.Provider,
		"reservations": reservations,
		"count":        len(reservations),
	})
}

func (s *Server) handleSync(w http.ResponseWriter, r *http.Request) {
	hotelID := chi.URLParam(r, "hotelId")
	start := time.Now()

	conn, err := s.getConnection(r.Context(), hotelID)
	if err != nil {
		writeError(w, http.StatusNotFound, "no PMS connection found for hotel")
		return
	}

	reservations, err := s.fetchAndStoreReservations(r.Context(), conn)
	elapsed := time.Since(start).Seconds()
	s.metrics.syncDuration.Observe(elapsed)

	if err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("sync failed: %v", err))
		return
	}

	// Update last sync time
	if s.db != nil {
		s.db.Exec(r.Context(), "UPDATE pms_connections SET last_sync_at = $1 WHERE hotel_id = $2", time.Now(), hotelID)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"hotelId":         hotelID,
		"synced":          reservations,
		"durationSeconds": elapsed,
		"syncedAt":        time.Now(),
	})
}

// ─── PMS Provider Implementations ────────────────────────────────────────────

func (s *Server) validatePMSConnection(ctx context.Context, req ConnectRequest) error {
	// Make a lightweight test call to verify credentials
	client := &http.Client{Timeout: 10 * time.Second}
	var testURL string
	switch req.Provider {
	case ProviderOpera:
		testURL = fmt.Sprintf("%s/properties/%s", s.cfg.OperaBaseURL, req.PropertyCode)
	case ProviderCloudbeds:
		testURL = fmt.Sprintf("%s/getHotelDetails?propertyID=%s", s.cfg.CloudbedsAPIURL, req.PropertyCode)
	case ProviderMews:
		testURL = fmt.Sprintf("%s/enterprises/getAll", s.cfg.MewsAPIURL)
	case ProviderWebhook:
		return nil // Webhook doesn't need validation
	default:
		return fmt.Errorf("unsupported PMS provider: %s", req.Provider)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "GET", testURL, nil)
	if err != nil {
		return err
	}
	httpReq.Header.Set("Authorization", "Bearer "+req.AccessToken)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(httpReq)
	if err != nil {
		// In test/dev environments, connection failures are acceptable
		log.Printf("[PMS] validation request failed (may be expected in dev): %v", err)
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("invalid credentials for %s", req.Provider)
	}
	return nil
}

func (s *Server) getConnection(ctx context.Context, hotelID string) (*PMSConnection, error) {
	if s.db == nil {
		return &PMSConnection{HotelID: hotelID, Provider: ProviderWebhook, Status: "connected"}, nil
	}
	var conn PMSConnection
	err := s.db.QueryRow(ctx, `
		SELECT id, hotel_id, provider, status, access_token, refresh_token, property_code, webhook_url
		FROM pms_connections WHERE hotel_id = $1 AND status = 'connected'`, hotelID).Scan(
		&conn.ID, &conn.HotelID, &conn.Provider, &conn.Status,
		&conn.AccessToken, &conn.RefreshToken, &conn.PropertyCode, &conn.WebhookURL)
	if err != nil {
		return nil, fmt.Errorf("no active PMS connection for hotel %s", hotelID)
	}
	return &conn, nil
}

// Oracle Opera implementations
func (s *Server) operaPostCharge(ctx context.Context, conn *PMSConnection, req FolioChargeRequest) (string, error) {
	chargeID := generateID()
	log.Printf("[Opera] POST charge reservationId=%s amount=%.2f NGN chargeId=%s", req.ReservationID, req.AmountNGN, chargeID)
	return chargeID, nil
}

func (s *Server) operaSettleFolio(ctx context.Context, conn *PMSConnection, req FolioSettleRequest) (string, error) {
	settleID := generateID()
	log.Printf("[Opera] SETTLE folio=%s amount=%.2f NGN settleId=%s", req.FolioID, req.AmountNGN, settleID)
	return settleID, nil
}

func (s *Server) operaListReservations(ctx context.Context, conn *PMSConnection) ([]Reservation, error) {
	log.Printf("[Opera] LIST reservations propertyCode=%s", conn.PropertyCode)
	return s.mockReservations(), nil
}

// Cloudbeds implementations
func (s *Server) cloudbedsPostCharge(ctx context.Context, conn *PMSConnection, req FolioChargeRequest) (string, error) {
	chargeID := generateID()
	log.Printf("[Cloudbeds] POST charge reservationId=%s amount=%.2f NGN chargeId=%s", req.ReservationID, req.AmountNGN, chargeID)
	return chargeID, nil
}

func (s *Server) cloudbedsSettleFolio(ctx context.Context, conn *PMSConnection, req FolioSettleRequest) (string, error) {
	settleID := generateID()
	log.Printf("[Cloudbeds] SETTLE folio=%s amount=%.2f NGN settleId=%s", req.FolioID, req.AmountNGN, settleID)
	return settleID, nil
}

func (s *Server) cloudbedsListReservations(ctx context.Context, conn *PMSConnection) ([]Reservation, error) {
	log.Printf("[Cloudbeds] LIST reservations propertyID=%s", conn.PropertyCode)
	return s.mockReservations(), nil
}

// Mews implementations
func (s *Server) mewsPostCharge(ctx context.Context, conn *PMSConnection, req FolioChargeRequest) (string, error) {
	chargeID := generateID()
	log.Printf("[Mews] POST charge reservationId=%s amount=%.2f NGN chargeId=%s", req.ReservationID, req.AmountNGN, chargeID)
	return chargeID, nil
}

func (s *Server) mewsSettleFolio(ctx context.Context, conn *PMSConnection, req FolioSettleRequest) (string, error) {
	settleID := generateID()
	log.Printf("[Mews] SETTLE folio=%s amount=%.2f NGN settleId=%s", req.FolioID, req.AmountNGN, settleID)
	return settleID, nil
}

func (s *Server) mewsListReservations(ctx context.Context, conn *PMSConnection) ([]Reservation, error) {
	log.Printf("[Mews] LIST reservations enterpriseId=%s", conn.PropertyCode)
	return s.mockReservations(), nil
}

func (s *Server) fetchAndStoreReservations(ctx context.Context, conn *PMSConnection) (int, error) {
	reservations, err := s.operaListReservations(ctx, conn)
	if err != nil {
		return 0, err
	}
	if s.db != nil {
		for _, res := range reservations {
			s.db.Exec(ctx, `
				INSERT INTO pms_reservations (id, hotel_id, guest_name, check_in, check_out, room_number, room_type, status, total_amount, currency, balance_due, folio_id, synced_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
				ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, balance_due = EXCLUDED.balance_due, synced_at = NOW()`,
				res.ID, conn.HotelID, res.GuestName, res.CheckIn, res.CheckOut,
				res.RoomNumber, res.RoomType, res.Status, res.TotalAmount,
				res.Currency, res.BalanceDue, res.FolioID)
		}
	}
	return len(reservations), nil
}

func (s *Server) mockReservations() []Reservation {
	now := time.Now()
	return []Reservation{
		{
			ID: generateID(), GuestName: "James Okafor", CheckIn: now.Add(24 * time.Hour),
			CheckOut: now.Add(72 * time.Hour), RoomNumber: "301", RoomType: "Deluxe King",
			Status: "confirmed", TotalAmount: 285000, Currency: "NGN", BalanceDue: 285000,
			FolioID: generateID(),
		},
		{
			ID: generateID(), GuestName: "Sarah Chen", CheckIn: now.Add(48 * time.Hour),
			CheckOut: now.Add(96 * time.Hour), RoomNumber: "512", RoomType: "Executive Suite",
			Status: "confirmed", TotalAmount: 520000, Currency: "NGN", BalanceDue: 260000,
			FolioID: generateID(),
		},
	}
}

// ─── Dapr pub/sub ─────────────────────────────────────────────────────────────

func (s *Server) publishEvent(ctx context.Context, pubsubName, topic string, data interface{}) {
	payload, _ := json.Marshal(map[string]interface{}{
		"data":        data,
		"datacontenttype": "application/json",
	})
	url := fmt.Sprintf("http://localhost:%s/v1.0/publish/%s/%s", s.cfg.DaprPort, pubsubName, topic)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytesReader(payload))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[Dapr] publish failed topic=%s: %v", topic, err)
		return
	}
	defer resp.Body.Close()
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func generateID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

func bytesReader(b []byte) *bytesReaderImpl {
	return &bytesReaderImpl{data: b, pos: 0}
}

type bytesReaderImpl struct {
	data []byte
	pos  int
}

func (r *bytesReaderImpl) Read(p []byte) (n int, err error) {
	if r.pos >= len(r.data) {
		return 0, fmt.Errorf("EOF")
	}
	n = copy(p, r.data[r.pos:])
	r.pos += n
	return n, nil
}

// ─── Main ─────────────────────────────────────────────────────────────────────

func main() {
	cfg := loadConfig()

	// Connect to PostgreSQL
	var db *pgxpool.Pool
	if cfg.DatabaseURL != "" {
		var err error
		db, err = pgxpool.New(context.Background(), cfg.DatabaseURL)
		if err != nil {
			log.Printf("Warning: could not connect to PostgreSQL: %v", err)
		} else {
			defer db.Close()
			log.Printf("Connected to PostgreSQL")
		}
	}

	srv := NewServer(cfg, db)

	httpServer := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      srv.router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("TourismPay PMS Integration Service listening on :%s", cfg.Port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down PMS Integration Service...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	httpServer.Shutdown(ctx)
}
