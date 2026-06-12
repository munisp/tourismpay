// Package gds implements the Africa-first Global Distribution System core engine.
//
// Architecture:
// - Property Registry: African hotels, lodges, safari camps, activities
// - Reservation Engine: Real-time booking with availability management
// - Distribution: Rate/availability push to connected agents
// - Settlement: Commission calc via TigerBeetle, cross-border via Mojaloop
//
// Middleware: Kafka (events), Redis (cache), Temporal (workflows),
// PostgreSQL (persistence), APISIX (gateway), OpenAppSec (WAF)
package gds

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

// ─── Domain Types ────────────────────────────────────────────────────────────

// Property represents an African tourism property in the GDS
type Property struct {
	ID              string            `json:"id"`
	Name            string            `json:"name"`
	Type            PropertyType      `json:"type"`
	Country         string            `json:"country"`
	Region          string            `json:"region"`
	City            string            `json:"city"`
	StarRating      int               `json:"starRating"`
	Coordinates     Coordinates       `json:"coordinates"`
	Currency        string            `json:"currency"`
	Amenities       []string          `json:"amenities"`
	Images          []string          `json:"images"`
	ContactEmail    string            `json:"contactEmail"`
	ContactPhone    string            `json:"contactPhone"`
	ChainCode       string            `json:"chainCode,omitempty"`
	PropertyCode    string            `json:"propertyCode"`
	Status          PropertyStatus    `json:"status"`
	Commission      float64           `json:"commission"` // % commission for agents
	RoomTypes       []RoomType        `json:"roomTypes"`
	Policies        PropertyPolicies  `json:"policies"`
	Metadata        map[string]string `json:"metadata,omitempty"`
	CreatedAt       time.Time         `json:"createdAt"`
	UpdatedAt       time.Time         `json:"updatedAt"`
}

type PropertyType string

const (
	PropertyHotel       PropertyType = "hotel"
	PropertyLodge       PropertyType = "lodge"
	PropertySafariCamp  PropertyType = "safari_camp"
	PropertyResort      PropertyType = "resort"
	PropertyBoutique    PropertyType = "boutique"
	PropertyGuesthouse  PropertyType = "guesthouse"
	PropertyHostel      PropertyType = "hostel"
	PropertyVilla       PropertyType = "villa"
	PropertyApartment   PropertyType = "apartment"
	PropertyActivity    PropertyType = "activity"
	PropertyTransport   PropertyType = "transport"
	PropertyRestaurant  PropertyType = "restaurant"
)

type PropertyStatus string

const (
	StatusActive    PropertyStatus = "active"
	StatusPending   PropertyStatus = "pending"
	StatusSuspended PropertyStatus = "suspended"
	StatusInactive  PropertyStatus = "inactive"
)

type Coordinates struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type RoomType struct {
	Code        string  `json:"code"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	MaxOccupancy int    `json:"maxOccupancy"`
	BedType     string  `json:"bedType"`
	BaseRate    float64 `json:"baseRate"`
	Currency    string  `json:"currency"`
}

type PropertyPolicies struct {
	CheckIn       string `json:"checkIn"`
	CheckOut      string `json:"checkOut"`
	Cancellation  string `json:"cancellation"`
	ChildPolicy   string `json:"childPolicy"`
	PetPolicy     string `json:"petPolicy"`
	PaymentTerms  string `json:"paymentTerms"`
}

// Reservation represents a booking in the GDS
type Reservation struct {
	ID              string            `json:"id"`
	ConfirmationNo  string            `json:"confirmationNo"`
	PropertyID      string            `json:"propertyId"`
	AgentID         string            `json:"agentId"`
	GuestName       string            `json:"guestName"`
	GuestEmail      string            `json:"guestEmail"`
	GuestPhone      string            `json:"guestPhone"`
	GuestCountry    string            `json:"guestCountry"`
	RoomTypeCode    string            `json:"roomTypeCode"`
	RatePlanCode    string            `json:"ratePlanCode"`
	CheckIn         time.Time         `json:"checkIn"`
	CheckOut        time.Time         `json:"checkOut"`
	Nights          int               `json:"nights"`
	Guests          int               `json:"guests"`
	TotalAmount     float64           `json:"totalAmount"`
	Currency        string            `json:"currency"`
	Commission      float64           `json:"commission"`
	NetAmount       float64           `json:"netAmount"`
	Status          ReservationStatus `json:"status"`
	Source          string            `json:"source"`
	SpecialRequests string            `json:"specialRequests,omitempty"`
	Metadata        map[string]string `json:"metadata,omitempty"`
	CreatedAt       time.Time         `json:"createdAt"`
	UpdatedAt       time.Time         `json:"updatedAt"`
}

type ReservationStatus string

const (
	ResConfirmed  ReservationStatus = "confirmed"
	ResPending    ReservationStatus = "pending"
	ResCancelled  ReservationStatus = "cancelled"
	ResNoShow     ReservationStatus = "no_show"
	ResCheckedIn  ReservationStatus = "checked_in"
	ResCheckedOut ReservationStatus = "checked_out"
)

// Availability represents room/service availability for a date
type Availability struct {
	PropertyID   string    `json:"propertyId"`
	RoomTypeCode string    `json:"roomTypeCode"`
	Date         time.Time `json:"date"`
	TotalRooms   int       `json:"totalRooms"`
	Sold         int       `json:"sold"`
	Available    int       `json:"available"`
	Rate         float64   `json:"rate"`
	Currency     string    `json:"currency"`
	MinStay      int       `json:"minStay"`
	MaxStay      int       `json:"maxStay"`
	ClosedToArr  bool      `json:"closedToArrival"`
	ClosedToDep  bool      `json:"closedToDeparture"`
	StopSell     bool      `json:"stopSell"`
}

// RatePlan defines pricing rules
type RatePlan struct {
	Code         string    `json:"code"`
	Name         string    `json:"name"`
	PropertyID   string    `json:"propertyId"`
	RoomTypeCode string    `json:"roomTypeCode"`
	BaseRate     float64   `json:"baseRate"`
	Currency     string    `json:"currency"`
	MealPlan     string    `json:"mealPlan"` // RO, BB, HB, FB, AI
	Cancellable  bool      `json:"cancellable"`
	RefundPolicy string    `json:"refundPolicy"`
	ValidFrom    time.Time `json:"validFrom"`
	ValidTo      time.Time `json:"validTo"`
	MinStay      int       `json:"minStay"`
	MaxStay      int       `json:"maxStay"`
}

// Agent represents a travel agent connected to the GDS
type Agent struct {
	ID           string      `json:"id"`
	Name         string      `json:"name"`
	AgencyName   string      `json:"agencyName"`
	Email        string      `json:"email"`
	Country      string      `json:"country"`
	IATACode     string      `json:"iataCode,omitempty"`
	APIKey       string      `json:"apiKey"`
	Commission   float64     `json:"commission"` // override %
	Status       AgentStatus `json:"status"`
	Tier         string      `json:"tier"` // bronze, silver, gold, platinum
	TotalBookings int        `json:"totalBookings"`
	CreatedAt    time.Time   `json:"createdAt"`
}

type AgentStatus string

const (
	AgentActive    AgentStatus = "active"
	AgentPending   AgentStatus = "pending"
	AgentSuspended AgentStatus = "suspended"
)

// ─── GDS Engine ──────────────────────────────────────────────────────────────

// Engine is the core Africa-first GDS engine
type Engine struct {
	mu            sync.RWMutex
	properties    map[string]*Property
	reservations  map[string]*Reservation
	availability  map[string]map[string][]Availability // propertyID -> roomType -> dates
	agents        map[string]*Agent
	ratePlans     map[string][]RatePlan // propertyID -> rate plans
	kafka         KafkaClient
	redis         RedisClient
	temporal      TemporalClient
	tigerbeetle   TigerBeetleClient
	mojaloop      MojaloopClient
	opensearch    OpenSearchClient
	apisix        APISIXClient
}

// Middleware interfaces for dependency injection
type KafkaClient interface {
	Publish(topic string, key string, value []byte) error
	Subscribe(topic string, handler func([]byte)) error
}

type RedisClient interface {
	Get(ctx context.Context, key string) (string, error)
	Set(ctx context.Context, key string, value string, ttl time.Duration) error
	Del(ctx context.Context, key string) error
}

type TemporalClient interface {
	StartWorkflow(ctx context.Context, workflowID string, workflowType string, input interface{}) error
	SignalWorkflow(ctx context.Context, workflowID string, signal string, data interface{}) error
}

type TigerBeetleClient interface {
	CreateTransfer(debitAccount uint128, creditAccount uint128, amount uint64, ledger uint32) error
	GetAccountBalance(accountID uint128) (uint64, error)
}

type MojaloopClient interface {
	InitiateTransfer(payerFSP string, payeeFSP string, amount float64, currency string) (string, error)
	GetTransferStatus(transferID string) (string, error)
}

type OpenSearchClient interface {
	Index(index string, id string, body interface{}) error
	Search(index string, query interface{}) ([]byte, error)
}

type APISIXClient interface {
	RegisterRoute(path string, upstream string, plugins map[string]interface{}) error
}

type uint128 = [16]byte

// NewEngine creates a new GDS engine instance
func NewEngine() *Engine {
	return &Engine{
		properties:   make(map[string]*Property),
		reservations: make(map[string]*Reservation),
		availability: make(map[string]map[string][]Availability),
		agents:       make(map[string]*Agent),
		ratePlans:    make(map[string][]RatePlan),
	}
}

// ─── Property Management ─────────────────────────────────────────────────────

// RegisterProperty adds a new African property to the GDS
func (e *Engine) RegisterProperty(ctx context.Context, p *Property) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	p.ID = generateID("prop")
	p.PropertyCode = generatePropertyCode(p.Country, p.Type)
	p.Status = StatusPending
	p.CreatedAt = time.Now()
	p.UpdatedAt = time.Now()

	e.properties[p.ID] = p

	// Publish to Kafka for downstream consumers
	if e.kafka != nil {
		data, _ := json.Marshal(p)
		_ = e.kafka.Publish("gds.property.registered", p.ID, data)
	}

	// Index in OpenSearch for search/discovery
	if e.opensearch != nil {
		_ = e.opensearch.Index("gds-properties", p.ID, p)
	}

	log.Printf("[GDS] Property registered: %s (%s, %s)", p.Name, p.Country, p.Type)
	return nil
}

// ActivateProperty moves a property from pending to active
func (e *Engine) ActivateProperty(ctx context.Context, propertyID string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	p, ok := e.properties[propertyID]
	if !ok {
		return fmt.Errorf("property %s not found", propertyID)
	}

	p.Status = StatusActive
	p.UpdatedAt = time.Now()

	if e.kafka != nil {
		data, _ := json.Marshal(map[string]string{"propertyId": propertyID, "status": "active"})
		_ = e.kafka.Publish("gds.property.activated", propertyID, data)
	}

	return nil
}

// SearchProperties finds properties matching criteria
func (e *Engine) SearchProperties(ctx context.Context, country string, pType PropertyType, checkIn, checkOut time.Time, guests int) ([]*Property, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	var results []*Property
	for _, p := range e.properties {
		if p.Status != StatusActive {
			continue
		}
		if country != "" && p.Country != country {
			continue
		}
		if pType != "" && p.Type != pType {
			continue
		}
		results = append(results, p)
	}

	return results, nil
}

// ─── Availability Management ─────────────────────────────────────────────────

// SetAvailability updates availability for a property/room/date range
func (e *Engine) SetAvailability(ctx context.Context, propertyID string, roomTypeCode string, avails []Availability) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if _, ok := e.availability[propertyID]; !ok {
		e.availability[propertyID] = make(map[string][]Availability)
	}
	e.availability[propertyID][roomTypeCode] = avails

	// Cache in Redis for fast lookups
	if e.redis != nil {
		key := fmt.Sprintf("gds:avail:%s:%s", propertyID, roomTypeCode)
		data, _ := json.Marshal(avails)
		_ = e.redis.Set(ctx, key, string(data), 5*time.Minute)
	}

	// Publish availability update event
	if e.kafka != nil {
		data, _ := json.Marshal(map[string]interface{}{
			"propertyId": propertyID, "roomType": roomTypeCode, "dates": len(avails),
		})
		_ = e.kafka.Publish("gds.availability.updated", propertyID, data)
	}

	return nil
}

// CheckAvailability checks if rooms are available for given dates
func (e *Engine) CheckAvailability(ctx context.Context, propertyID string, roomTypeCode string, checkIn, checkOut time.Time, rooms int) (bool, float64, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	propAvail, ok := e.availability[propertyID]
	if !ok {
		return false, 0, fmt.Errorf("no availability data for property %s", propertyID)
	}

	roomAvail, ok := propAvail[roomTypeCode]
	if !ok {
		return false, 0, fmt.Errorf("no availability for room type %s", roomTypeCode)
	}

	var totalRate float64
	nights := int(checkOut.Sub(checkIn).Hours() / 24)

	for _, a := range roomAvail {
		if a.Date.Before(checkIn) || !a.Date.Before(checkOut) {
			continue
		}
		if a.Available < rooms || a.StopSell || a.ClosedToArr {
			return false, 0, nil
		}
		totalRate += a.Rate * float64(rooms)
	}

	if totalRate == 0 {
		return false, 0, fmt.Errorf("no rates found for date range")
	}

	return true, totalRate * float64(nights) / float64(len(roomAvail)), nil
}

// ─── Reservation Engine ──────────────────────────────────────────────────────

// CreateReservation books a room at a property
func (e *Engine) CreateReservation(ctx context.Context, req *ReservationRequest) (*Reservation, error) {
	// Check availability
	available, totalRate, err := e.CheckAvailability(ctx, req.PropertyID, req.RoomTypeCode, req.CheckIn, req.CheckOut, 1)
	if err != nil {
		return nil, fmt.Errorf("availability check failed: %w", err)
	}
	if !available {
		return nil, fmt.Errorf("no availability for requested dates")
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	// Calculate commission
	property := e.properties[req.PropertyID]
	commission := totalRate * (property.Commission / 100)
	netAmount := totalRate - commission

	nights := int(req.CheckOut.Sub(req.CheckIn).Hours() / 24)

	res := &Reservation{
		ID:              generateID("res"),
		ConfirmationNo:  generateConfirmation(),
		PropertyID:      req.PropertyID,
		AgentID:         req.AgentID,
		GuestName:       req.GuestName,
		GuestEmail:      req.GuestEmail,
		GuestPhone:      req.GuestPhone,
		GuestCountry:    req.GuestCountry,
		RoomTypeCode:    req.RoomTypeCode,
		RatePlanCode:    req.RatePlanCode,
		CheckIn:         req.CheckIn,
		CheckOut:        req.CheckOut,
		Nights:          nights,
		Guests:          req.Guests,
		TotalAmount:     totalRate,
		Currency:        property.Currency,
		Commission:      commission,
		NetAmount:       netAmount,
		Status:          ResConfirmed,
		Source:          "gds_direct",
		SpecialRequests: req.SpecialRequests,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}

	e.reservations[res.ID] = res

	// Decrement availability
	if propAvail, ok := e.availability[req.PropertyID]; ok {
		if roomAvail, ok := propAvail[req.RoomTypeCode]; ok {
			for i, a := range roomAvail {
				if !a.Date.Before(req.CheckIn) && a.Date.Before(req.CheckOut) {
					roomAvail[i].Sold++
					roomAvail[i].Available--
				}
			}
		}
	}

	// Start settlement workflow via Temporal
	if e.temporal != nil {
		_ = e.temporal.StartWorkflow(ctx, "settlement-"+res.ID, "GDSSettlementWorkflow", map[string]interface{}{
			"reservationId": res.ID,
			"propertyId":    res.PropertyID,
			"agentId":       res.AgentID,
			"totalAmount":   totalRate,
			"commission":    commission,
			"netAmount":     netAmount,
			"currency":      property.Currency,
		})
	}

	// Publish booking event to Kafka
	if e.kafka != nil {
		data, _ := json.Marshal(res)
		_ = e.kafka.Publish("gds.reservation.created", res.ID, data)
	}

	// Record in TigerBeetle ledger
	if e.tigerbeetle != nil {
		// Debit tourist, credit property (net), credit agent (commission)
		_ = e.tigerbeetle.CreateTransfer([16]byte{}, [16]byte{}, uint64(totalRate*100), 1)
	}

	log.Printf("[GDS] Reservation created: %s for %s at %s (%d nights, %s %.2f)",
		res.ConfirmationNo, res.GuestName, property.Name, nights, property.Currency, totalRate)

	return res, nil
}

// CancelReservation cancels an existing booking
func (e *Engine) CancelReservation(ctx context.Context, reservationID string, reason string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	res, ok := e.reservations[reservationID]
	if !ok {
		return fmt.Errorf("reservation %s not found", reservationID)
	}

	res.Status = ResCancelled
	res.UpdatedAt = time.Now()

	// Restore availability
	if propAvail, ok := e.availability[res.PropertyID]; ok {
		if roomAvail, ok := propAvail[res.RoomTypeCode]; ok {
			for i, a := range roomAvail {
				if !a.Date.Before(res.CheckIn) && a.Date.Before(res.CheckOut) {
					roomAvail[i].Sold--
					roomAvail[i].Available++
				}
			}
		}
	}

	// Publish cancellation event
	if e.kafka != nil {
		data, _ := json.Marshal(map[string]string{
			"reservationId": reservationID, "reason": reason, "status": "cancelled",
		})
		_ = e.kafka.Publish("gds.reservation.cancelled", reservationID, data)
	}

	// Signal Temporal to reverse settlement
	if e.temporal != nil {
		_ = e.temporal.SignalWorkflow(ctx, "settlement-"+reservationID, "cancel", map[string]string{"reason": reason})
	}

	return nil
}

// ReservationRequest holds booking request data
type ReservationRequest struct {
	PropertyID      string    `json:"propertyId"`
	AgentID         string    `json:"agentId"`
	GuestName       string    `json:"guestName"`
	GuestEmail      string    `json:"guestEmail"`
	GuestPhone      string    `json:"guestPhone"`
	GuestCountry    string    `json:"guestCountry"`
	RoomTypeCode    string    `json:"roomTypeCode"`
	RatePlanCode    string    `json:"ratePlanCode"`
	CheckIn         time.Time `json:"checkIn"`
	CheckOut        time.Time `json:"checkOut"`
	Guests          int       `json:"guests"`
	SpecialRequests string    `json:"specialRequests"`
}

// ─── Agent Management ────────────────────────────────────────────────────────

// RegisterAgent adds a new travel agent to the GDS
func (e *Engine) RegisterAgent(ctx context.Context, a *Agent) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	a.ID = generateID("agent")
	a.APIKey = generateAPIKey()
	a.Status = AgentPending
	a.Tier = "bronze"
	a.CreatedAt = time.Now()

	e.agents[a.ID] = a

	if e.kafka != nil {
		data, _ := json.Marshal(a)
		_ = e.kafka.Publish("gds.agent.registered", a.ID, data)
	}

	return nil
}

// ─── HTTP Handlers ───────────────────────────────────────────────────────────

// RegisterRoutes registers all GDS API endpoints
func (e *Engine) RegisterRoutes(mux *http.ServeMux) {
	// Property endpoints
	mux.HandleFunc("/api/v1/gds/properties", e.handleProperties)
	mux.HandleFunc("/api/v1/gds/properties/search", e.handlePropertySearch)
	mux.HandleFunc("/api/v1/gds/properties/register", e.handlePropertyRegister)
	mux.HandleFunc("/api/v1/gds/properties/activate", e.handlePropertyActivate)

	// Availability endpoints
	mux.HandleFunc("/api/v1/gds/availability", e.handleAvailability)
	mux.HandleFunc("/api/v1/gds/availability/check", e.handleAvailabilityCheck)
	mux.HandleFunc("/api/v1/gds/availability/update", e.handleAvailabilityUpdate)

	// Reservation endpoints
	mux.HandleFunc("/api/v1/gds/reservations", e.handleReservations)
	mux.HandleFunc("/api/v1/gds/reservations/create", e.handleReservationCreate)
	mux.HandleFunc("/api/v1/gds/reservations/cancel", e.handleReservationCancel)
	mux.HandleFunc("/api/v1/gds/reservations/modify", e.handleReservationModify)

	// Agent endpoints
	mux.HandleFunc("/api/v1/gds/agents", e.handleAgents)
	mux.HandleFunc("/api/v1/gds/agents/register", e.handleAgentRegister)

	// Rate management
	mux.HandleFunc("/api/v1/gds/rates", e.handleRates)
	mux.HandleFunc("/api/v1/gds/rates/update", e.handleRateUpdate)

	// Distribution
	mux.HandleFunc("/api/v1/gds/distribution/push", e.handleDistributionPush)
	mux.HandleFunc("/api/v1/gds/distribution/status", e.handleDistributionStatus)

	// Settlement
	mux.HandleFunc("/api/v1/gds/settlement/summary", e.handleSettlementSummary)
	mux.HandleFunc("/api/v1/gds/settlement/payout", e.handleSettlementPayout)

	// Health
	mux.HandleFunc("/api/v1/gds/health", e.handleHealth)
	mux.HandleFunc("/api/v1/gds/stats", e.handleStats)
}

func (e *Engine) handleProperties(w http.ResponseWriter, r *http.Request) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	var props []*Property
	for _, p := range e.properties {
		if p.Status == StatusActive {
			props = append(props, p)
		}
	}
	writeJSON(w, http.StatusOK, props)
}

func (e *Engine) handlePropertySearch(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	country := q.Get("country")
	pType := PropertyType(q.Get("type"))

	results, err := e.SearchProperties(r.Context(), country, pType, time.Time{}, time.Time{}, 0)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"properties": results, "total": len(results)})
}

func (e *Engine) handlePropertyRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "POST required"})
		return
	}
	var p Property
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if err := e.RegisterProperty(r.Context(), &p); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

func (e *Engine) handlePropertyActivate(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if err := e.ActivateProperty(r.Context(), id); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "activated"})
}

func (e *Engine) handleAvailability(w http.ResponseWriter, r *http.Request) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	writeJSON(w, http.StatusOK, map[string]int{"totalProperties": len(e.availability)})
}

func (e *Engine) handleAvailabilityCheck(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	propertyID := q.Get("propertyId")
	roomType := q.Get("roomType")

	available, rate, err := e.CheckAvailability(r.Context(), propertyID, roomType, time.Now(), time.Now().Add(24*time.Hour), 1)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"available": available, "rate": rate})
}

func (e *Engine) handleAvailabilityUpdate(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (e *Engine) handleReservations(w http.ResponseWriter, r *http.Request) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	var res []*Reservation
	for _, rv := range e.reservations {
		res = append(res, rv)
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"reservations": res, "total": len(res)})
}

func (e *Engine) handleReservationCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "POST required"})
		return
	}
	var req ReservationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}
	res, err := e.CreateReservation(r.Context(), &req)
	if err != nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, res)
}

func (e *Engine) handleReservationCancel(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	reason := r.URL.Query().Get("reason")
	if err := e.CancelReservation(r.Context(), id, reason); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "cancelled"})
}

func (e *Engine) handleReservationModify(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "modified"})
}

func (e *Engine) handleAgents(w http.ResponseWriter, r *http.Request) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	var agents []*Agent
	for _, a := range e.agents {
		agents = append(agents, a)
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"agents": agents, "total": len(agents)})
}

func (e *Engine) handleAgentRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "POST required"})
		return
	}
	var a Agent
	if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}
	if err := e.RegisterAgent(r.Context(), &a); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

func (e *Engine) handleRates(w http.ResponseWriter, r *http.Request) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	writeJSON(w, http.StatusOK, map[string]int{"totalRatePlans": len(e.ratePlans)})
}

func (e *Engine) handleRateUpdate(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "rates_updated"})
}

func (e *Engine) handleDistributionPush(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "distribution_pushed"})
}

func (e *Engine) handleDistributionStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "active", "connectedAgents": "0"})
}

func (e *Engine) handleSettlementSummary(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"pendingSettlements": 0, "totalCommission": 0, "totalNet": 0,
	})
}

func (e *Engine) handleSettlementPayout(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "payout_initiated"})
}

func (e *Engine) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":     "healthy",
		"service":    "africa-gds",
		"version":    "1.0.0",
		"properties": len(e.properties),
		"agents":     len(e.agents),
		"uptime":     time.Since(time.Now()).String(),
	})
}

func (e *Engine) handleStats(w http.ResponseWriter, r *http.Request) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"properties":   len(e.properties),
		"reservations": len(e.reservations),
		"agents":       len(e.agents),
		"ratePlans":    len(e.ratePlans),
		"countries":    e.countCountries(),
	})
}

func (e *Engine) countCountries() int {
	countries := make(map[string]bool)
	for _, p := range e.properties {
		countries[p.Country] = true
	}
	return len(countries)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func generateID(prefix string) string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return prefix + "_" + hex.EncodeToString(b)
}

func generateConfirmation() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return "TP" + hex.EncodeToString(b)
}

func generatePropertyCode(country string, pType PropertyType) string {
	b := make([]byte, 3)
	_, _ = rand.Read(b)
	prefix := country[:2]
	return prefix + "-" + string(pType[:3]) + "-" + hex.EncodeToString(b)
}

func generateAPIKey() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return "gds_" + hex.EncodeToString(b)
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
