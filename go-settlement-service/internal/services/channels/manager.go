// Package channels implements the Channel Manager — a bidirectional sync engine
// that distributes TourismPay inventory, rates, and availability to external
// distribution platforms (GDS, OTAs, luxury channels) and receives inbound
// bookings from those channels.
//
// Supported channels:
//   - Sabre (GDS — SynXis hotel distribution)
//   - Amadeus (Self-Service APIs — hotels, tours & activities)
//   - Little Emperors (luxury hotel rate push)
//   - Expedia (Expedia Partner Central connectivity)
//   - Booking.com (Connectivity Partner API)
//   - Travelport (Universal API)
package channels

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ─── Types ────────────────────────────────────────────────────────────────────

// Channel represents a connected distribution platform.
type Channel struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`        // e.g., "sabre", "amadeus", "little_emperors", "expedia"
	DisplayName string         `json:"display_name"` // Human-readable name
	Status      string         `json:"status"`      // "active", "inactive", "error", "syncing"
	Config      ChannelConfig  `json:"config"`
	LastSyncAt  *time.Time     `json:"last_sync_at"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

// ChannelConfig holds authentication and endpoint configuration per channel.
type ChannelConfig struct {
	APIKey      string `json:"api_key,omitempty"`
	APISecret   string `json:"api_secret,omitempty"`
	PropertyID  string `json:"property_id,omitempty"`   // Channel-specific property/hotel ID
	Endpoint    string `json:"endpoint,omitempty"`      // Base API URL
	WebhookURL  string `json:"webhook_url,omitempty"`   // Inbound webhook for bookings
	Environment string `json:"environment,omitempty"`   // "production" or "sandbox"
	Extra       map[string]string `json:"extra,omitempty"` // Channel-specific overrides
}

// RateUpdate represents a rate/price push to a channel.
type RateUpdate struct {
	ChannelID      string    `json:"channel_id"`
	EstablishmentID int      `json:"establishment_id"`
	ProductID      int       `json:"product_id"`
	RoomTypeCode   string    `json:"room_type_code,omitempty"` // GDS room type code
	RatePlanCode   string    `json:"rate_plan_code,omitempty"`
	Date           string    `json:"date"`           // YYYY-MM-DD
	Price          float64   `json:"price"`
	Currency       string    `json:"currency"`
	MinStay        int       `json:"min_stay,omitempty"`
	MaxStay        int       `json:"max_stay,omitempty"`
	ClosedToArrival bool    `json:"closed_to_arrival,omitempty"`
	SentAt         time.Time `json:"sent_at"`
	Status         string    `json:"status"` // "pending", "sent", "confirmed", "failed"
}

// AvailabilityUpdate represents availability sync to a channel.
type AvailabilityUpdate struct {
	ChannelID      string `json:"channel_id"`
	EstablishmentID int   `json:"establishment_id"`
	ProductID      int    `json:"product_id"`
	Date           string `json:"date"`
	TotalSlots     int    `json:"total_slots"`
	AvailableSlots int    `json:"available_slots"`
	IsBlocked      bool   `json:"is_blocked"`
	Status         string `json:"status"`
}

// InboundBooking represents a booking received from an external channel.
type InboundBooking struct {
	ID                string    `json:"id"`
	ChannelID         string    `json:"channel_id"`
	ChannelBookingRef string    `json:"channel_booking_ref"`
	EstablishmentID   int       `json:"establishment_id"`
	ProductID         int       `json:"product_id"`
	GuestName         string    `json:"guest_name"`
	GuestEmail        string    `json:"guest_email"`
	GuestPhone        string    `json:"guest_phone,omitempty"`
	CheckIn           string    `json:"check_in"`
	CheckOut          string    `json:"check_out"`
	Nights            int       `json:"nights"`
	PartySize         int       `json:"party_size"`
	TotalPrice        float64   `json:"total_price"`
	Currency          string    `json:"currency"`
	Status            string    `json:"status"` // "confirmed", "cancelled", "modified"
	RawPayload        json.RawMessage `json:"raw_payload,omitempty"`
	ReceivedAt        time.Time `json:"received_at"`
	ProcessedAt       *time.Time `json:"processed_at"`
}

// SyncResult tracks the outcome of a sync operation.
type SyncResult struct {
	ChannelID    string    `json:"channel_id"`
	Operation    string    `json:"operation"` // "rate_push", "availability_push", "booking_pull"
	ItemsTotal   int       `json:"items_total"`
	ItemsSuccess int       `json:"items_success"`
	ItemsFailed  int       `json:"items_failed"`
	Errors       []string  `json:"errors,omitempty"`
	Duration     time.Duration `json:"duration"`
	Timestamp    time.Time `json:"timestamp"`
}

// ─── Channel Connector Interface ─────────────────────────────────────────────

// Connector defines the interface that each channel adapter must implement.
type Connector interface {
	// Name returns the channel identifier (e.g., "sabre", "amadeus").
	Name() string
	// PushRates sends rate updates to the channel.
	PushRates(ctx context.Context, rates []RateUpdate) (*SyncResult, error)
	// PushAvailability sends availability updates to the channel.
	PushAvailability(ctx context.Context, updates []AvailabilityUpdate) (*SyncResult, error)
	// PullBookings retrieves new bookings from the channel since lastSync.
	PullBookings(ctx context.Context, since time.Time) ([]InboundBooking, error)
	// ConfirmBooking acknowledges a booking to the channel.
	ConfirmBooking(ctx context.Context, channelBookingRef string) error
	// CancelBooking notifies the channel of a cancellation.
	CancelBooking(ctx context.Context, channelBookingRef string, reason string) error
	// ValidateConfig checks whether the channel configuration is valid.
	ValidateConfig(cfg ChannelConfig) error
	// HealthCheck verifies connectivity to the channel.
	HealthCheck(ctx context.Context) error
}

// ─── Channel Manager Service ─────────────────────────────────────────────────

// Manager orchestrates all channel connectors and sync operations.
type Manager struct {
	db         *sql.DB
	connectors map[string]Connector
	channels   map[string]*Channel
	mu         sync.RWMutex
	syncTicker *time.Ticker
	stopCh     chan struct{}
}

// NewManager creates a new Channel Manager instance.
func NewManager(db *sql.DB) *Manager {
	m := &Manager{
		db:         db,
		connectors: make(map[string]Connector),
		channels:   make(map[string]*Channel),
		stopCh:     make(chan struct{}),
	}

	// Register built-in connectors
	m.RegisterConnector(NewSabreConnector())
	m.RegisterConnector(NewAmadeusConnector())
	m.RegisterConnector(NewLittleEmperorsConnector())
	m.RegisterConnector(NewExpediaConnector())
	m.RegisterConnector(NewBookingComConnector())
	m.RegisterConnector(NewTravelportConnector())

	return m
}

// RegisterConnector adds a channel connector to the manager.
func (m *Manager) RegisterConnector(c Connector) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.connectors[c.Name()] = c
}

// Start begins the periodic sync loop.
func (m *Manager) Start(interval time.Duration) {
	m.syncTicker = time.NewTicker(interval)
	go func() {
		for {
			select {
			case <-m.syncTicker.C:
				m.syncAll()
			case <-m.stopCh:
				m.syncTicker.Stop()
				return
			}
		}
	}()
	log.Printf("[ChannelManager] Started with sync interval %v", interval)
}

// Stop halts the sync loop.
func (m *Manager) Stop() {
	close(m.stopCh)
	log.Println("[ChannelManager] Stopped")
}

// syncAll runs a full sync across all active channels.
func (m *Manager) syncAll() {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for id, ch := range m.channels {
		if ch.Status != "active" {
			continue
		}
		connector, ok := m.connectors[ch.Name]
		if !ok {
			log.Printf("[ChannelManager] No connector for channel %s (%s)", id, ch.Name)
			continue
		}

		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)

		// Push rates
		rates := m.getPendingRates(id)
		if len(rates) > 0 {
			result, err := connector.PushRates(ctx, rates)
			if err != nil {
				log.Printf("[ChannelManager] Rate push failed for %s: %v", id, err)
			} else {
				m.recordSyncResult(result)
			}
		}

		// Push availability
		avail := m.getPendingAvailability(id)
		if len(avail) > 0 {
			result, err := connector.PushAvailability(ctx, avail)
			if err != nil {
				log.Printf("[ChannelManager] Availability push failed for %s: %v", id, err)
			} else {
				m.recordSyncResult(result)
			}
		}

		// Pull bookings
		since := time.Now().Add(-24 * time.Hour)
		if ch.LastSyncAt != nil {
			since = *ch.LastSyncAt
		}
		bookings, err := connector.PullBookings(ctx, since)
		if err != nil {
			log.Printf("[ChannelManager] Booking pull failed for %s: %v", id, err)
		} else if len(bookings) > 0 {
			m.processInboundBookings(bookings)
		}

		// Update last sync timestamp
		now := time.Now()
		ch.LastSyncAt = &now
		cancel()
	}
}

func (m *Manager) getPendingRates(channelID string) []RateUpdate {
	if m.db == nil {
		return nil
	}
	rows, err := m.db.Query(`
		SELECT channel_id, establishment_id, product_id, date, price, currency, status
		FROM channel_rate_updates
		WHERE channel_id = $1 AND status = 'pending'
		ORDER BY date ASC LIMIT 500
	`, channelID)
	if err != nil {
		log.Printf("[ChannelManager] Failed to query pending rates: %v", err)
		return nil
	}
	defer rows.Close()

	var rates []RateUpdate
	for rows.Next() {
		var r RateUpdate
		if err := rows.Scan(&r.ChannelID, &r.EstablishmentID, &r.ProductID, &r.Date, &r.Price, &r.Currency, &r.Status); err == nil {
			rates = append(rates, r)
		}
	}
	return rates
}

func (m *Manager) getPendingAvailability(channelID string) []AvailabilityUpdate {
	if m.db == nil {
		return nil
	}
	rows, err := m.db.Query(`
		SELECT channel_id, establishment_id, product_id, date, total_slots, available_slots, is_blocked, status
		FROM channel_availability_updates
		WHERE channel_id = $1 AND status = 'pending'
		ORDER BY date ASC LIMIT 500
	`, channelID)
	if err != nil {
		log.Printf("[ChannelManager] Failed to query pending availability: %v", err)
		return nil
	}
	defer rows.Close()

	var updates []AvailabilityUpdate
	for rows.Next() {
		var u AvailabilityUpdate
		if err := rows.Scan(&u.ChannelID, &u.EstablishmentID, &u.ProductID, &u.Date, &u.TotalSlots, &u.AvailableSlots, &u.IsBlocked, &u.Status); err == nil {
			updates = append(updates, u)
		}
	}
	return updates
}

func (m *Manager) processInboundBookings(bookings []InboundBooking) {
	for _, b := range bookings {
		// Insert into inbound_bookings table for the TypeScript layer to process
		if m.db != nil {
			_, err := m.db.Exec(`
				INSERT INTO channel_inbound_bookings
					(id, channel_id, channel_booking_ref, establishment_id, product_id,
					 guest_name, guest_email, guest_phone, check_in, check_out,
					 nights, party_size, total_price, currency, status, received_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
				ON CONFLICT (channel_booking_ref) DO UPDATE SET status = EXCLUDED.status, received_at = EXCLUDED.received_at
			`, b.ID, b.ChannelID, b.ChannelBookingRef, b.EstablishmentID, b.ProductID,
				b.GuestName, b.GuestEmail, b.GuestPhone, b.CheckIn, b.CheckOut,
				b.Nights, b.PartySize, b.TotalPrice, b.Currency, b.Status, b.ReceivedAt)
			if err != nil {
				log.Printf("[ChannelManager] Failed to store inbound booking %s: %v", b.ChannelBookingRef, err)
			}
		}
	}
	log.Printf("[ChannelManager] Processed %d inbound bookings", len(bookings))
}

func (m *Manager) recordSyncResult(result *SyncResult) {
	if result == nil || m.db == nil {
		return
	}
	errJSON, _ := json.Marshal(result.Errors)
	m.db.Exec(`
		INSERT INTO channel_sync_log (channel_id, operation, items_total, items_success, items_failed, errors, duration_ms, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, result.ChannelID, result.Operation, result.ItemsTotal, result.ItemsSuccess, result.ItemsFailed, string(errJSON), result.Duration.Milliseconds(), result.Timestamp)
}

// generateID creates a unique identifier.
func generateID(prefix string) string {
	b := make([]byte, 12)
	rand.Read(b)
	return prefix + "_" + hex.EncodeToString(b)
}

// ─── HTTP Handlers (Gin) ─────────────────────────────────────────────────────

// ListChannelsHandler returns all configured channels.
func (m *Manager) ListChannelsHandler(c *gin.Context) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	channels := make([]*Channel, 0, len(m.channels))
	for _, ch := range m.channels {
		channels = append(channels, ch)
	}
	c.JSON(http.StatusOK, gin.H{"channels": channels, "total": len(channels)})
}

// ConnectChannelHandler adds a new channel connection.
func (m *Manager) ConnectChannelHandler(c *gin.Context) {
	var req struct {
		Name   string        `json:"name" binding:"required"`
		Config ChannelConfig `json:"config" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate connector exists
	m.mu.RLock()
	connector, ok := m.connectors[req.Name]
	m.mu.RUnlock()
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Unknown channel: %s. Supported: sabre, amadeus, little_emperors, expedia, booking_com, travelport", req.Name)})
		return
	}

	// Validate config
	if err := connector.ValidateConfig(req.Config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid config: %v", err)})
		return
	}

	displayNames := map[string]string{
		"sabre":           "Sabre GDS",
		"amadeus":         "Amadeus",
		"little_emperors": "Little Emperors",
		"expedia":         "Expedia Partner Central",
		"booking_com":     "Booking.com",
		"travelport":      "Travelport",
	}

	ch := &Channel{
		ID:          generateID("ch"),
		Name:        req.Name,
		DisplayName: displayNames[req.Name],
		Status:      "active",
		Config:      req.Config,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	m.mu.Lock()
	m.channels[ch.ID] = ch
	m.mu.Unlock()

	// Persist to DB
	if m.db != nil {
		cfgJSON, _ := json.Marshal(req.Config)
		m.db.Exec(`
			INSERT INTO channel_connections (id, name, display_name, status, config, created_at)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, ch.ID, ch.Name, ch.DisplayName, ch.Status, string(cfgJSON), ch.CreatedAt)
	}

	c.JSON(http.StatusCreated, ch)
}

// DisconnectChannelHandler removes a channel connection.
func (m *Manager) DisconnectChannelHandler(c *gin.Context) {
	channelID := c.Param("channelId")

	m.mu.Lock()
	ch, ok := m.channels[channelID]
	if ok {
		ch.Status = "inactive"
		ch.UpdatedAt = time.Now()
	}
	m.mu.Unlock()

	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "Channel not found"})
		return
	}

	if m.db != nil {
		m.db.Exec(`UPDATE channel_connections SET status = 'inactive', updated_at = NOW() WHERE id = $1`, channelID)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "channel_id": channelID})
}

// SyncChannelHandler triggers an immediate sync for a specific channel.
func (m *Manager) SyncChannelHandler(c *gin.Context) {
	channelID := c.Param("channelId")

	m.mu.RLock()
	ch, ok := m.channels[channelID]
	m.mu.RUnlock()
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "Channel not found"})
		return
	}

	connector, ok := m.connectors[ch.Name]
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No connector for channel"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()

	// Health check first
	if err := connector.HealthCheck(ctx); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": fmt.Sprintf("Channel unreachable: %v", err)})
		return
	}

	// Push rates
	rates := m.getPendingRates(channelID)
	var rateResult *SyncResult
	if len(rates) > 0 {
		var err error
		rateResult, err = connector.PushRates(ctx, rates)
		if err != nil {
			log.Printf("[ChannelManager] Sync rate push error for %s: %v", channelID, err)
		}
	}

	// Push availability
	avail := m.getPendingAvailability(channelID)
	var availResult *SyncResult
	if len(avail) > 0 {
		var err error
		availResult, err = connector.PushAvailability(ctx, avail)
		if err != nil {
			log.Printf("[ChannelManager] Sync avail push error for %s: %v", channelID, err)
		}
	}

	now := time.Now()
	m.mu.Lock()
	ch.LastSyncAt = &now
	ch.UpdatedAt = now
	m.mu.Unlock()

	c.JSON(http.StatusOK, gin.H{
		"channel_id":         channelID,
		"rates_synced":       rateResult,
		"availability_synced": availResult,
		"synced_at":          now,
	})
}

// WebhookHandler receives inbound booking notifications from channels.
func (m *Manager) WebhookHandler(c *gin.Context) {
	channelName := c.Param("channel")

	m.mu.RLock()
	connector, ok := m.connectors[channelName]
	m.mu.RUnlock()
	_ = connector // connector used for validation only
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unknown channel"})
		return
	}

	var payload json.RawMessage
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	// Store raw webhook for async processing
	if m.db != nil {
		webhookID := generateID("wh")
		m.db.Exec(`
			INSERT INTO channel_webhooks (id, channel_name, payload, status, received_at)
			VALUES ($1, $2, $3, 'pending', NOW())
		`, webhookID, channelName, string(payload))
	}

	c.JSON(http.StatusOK, gin.H{"received": true})
}

// ChannelStatsHandler returns sync statistics for all channels.
func (m *Manager) ChannelStatsHandler(c *gin.Context) {
	if m.db == nil {
		c.JSON(http.StatusOK, gin.H{"stats": []interface{}{}})
		return
	}

	rows, err := m.db.Query(`
		SELECT channel_id, operation, 
			   COUNT(*) as total_syncs,
			   SUM(items_success) as total_success,
			   SUM(items_failed) as total_failed,
			   AVG(duration_ms) as avg_duration_ms
		FROM channel_sync_log
		WHERE created_at > NOW() - INTERVAL '7 days'
		GROUP BY channel_id, operation
		ORDER BY channel_id, operation
	`)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"stats": []interface{}{}})
		return
	}
	defer rows.Close()

	type StatRow struct {
		ChannelID     string  `json:"channel_id"`
		Operation     string  `json:"operation"`
		TotalSyncs    int     `json:"total_syncs"`
		TotalSuccess  int     `json:"total_success"`
		TotalFailed   int     `json:"total_failed"`
		AvgDurationMs float64 `json:"avg_duration_ms"`
	}

	var stats []StatRow
	for rows.Next() {
		var s StatRow
		if err := rows.Scan(&s.ChannelID, &s.Operation, &s.TotalSyncs, &s.TotalSuccess, &s.TotalFailed, &s.AvgDurationMs); err == nil {
			stats = append(stats, s)
		}
	}

	c.JSON(http.StatusOK, gin.H{"stats": stats})
}
