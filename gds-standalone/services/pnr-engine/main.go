// PNR Engine — Full PNR lifecycle management for Africa-first GDS.
// Handles segments, remarks, ticketing, queue placement, history log.
// Integrates with: Kafka (events), Temporal (workflows), TigerBeetle (ledger),
// PostgreSQL (persistence), Redis (cache), Permify (authz), Dapr (pub/sub).
package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// Input validation patterns
var (
	locatorPattern = regexp.MustCompile(`^[A-Z0-9]{5,8}$`)
	emailPattern   = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
	countryPattern = regexp.MustCompile(`^[A-Z]{2}$`)
)

// --- Domain Models ---

type SegmentType string

const (
	SegmentHotel      SegmentType = "hotel"
	SegmentTransfer   SegmentType = "transfer"
	SegmentActivity   SegmentType = "activity"
	SegmentFlight     SegmentType = "flight"
	SegmentInsurance  SegmentType = "insurance"
	SegmentPassive    SegmentType = "passive"
)

type SegmentStatus string

const (
	StatusConfirmed SegmentStatus = "HK" // Holding Confirmed
	StatusRequested SegmentStatus = "NN" // Need (requested)
	StatusWaitlist  SegmentStatus = "HL" // Waitlisted
	StatusCancelled SegmentStatus = "XX" // Cancelled
	StatusPending   SegmentStatus = "PE" // Pending
)

type Segment struct {
	ID            string        `json:"id"`
	SequenceNo    int           `json:"sequenceNo"`
	Type          SegmentType   `json:"type"`
	Status        SegmentStatus `json:"status"`
	PropertyID    string        `json:"propertyId,omitempty"`
	PropertyName  string        `json:"propertyName,omitempty"`
	ServiceCode   string        `json:"serviceCode"`
	StartDate     string        `json:"startDate"`
	EndDate       string        `json:"endDate"`
	Quantity      int           `json:"quantity"`
	GuestCount    int           `json:"guestCount"`
	RoomType      string        `json:"roomType,omitempty"`
	RatePlan      string        `json:"ratePlan,omitempty"`
	Amount        float64       `json:"amount"`
	Currency      string        `json:"currency"`
	Remarks       []string      `json:"remarks,omitempty"`
	SupplierRef   string        `json:"supplierRef,omitempty"`
	CreatedAt     time.Time     `json:"createdAt"`
	ModifiedAt    time.Time     `json:"modifiedAt"`
}

type Remark struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"` // general, corporate, itinerary, invoice, confidential
	Category  string    `json:"category"`
	Text      string    `json:"text"`
	CreatedBy string    `json:"createdBy"`
	CreatedAt time.Time `json:"createdAt"`
}

type TicketingInfo struct {
	Status      string    `json:"status"` // not_ticketed, ticketed, voided, refunded
	TicketNo    string    `json:"ticketNo,omitempty"`
	IssuedBy    string    `json:"issuedBy,omitempty"`
	IssuedAt    *time.Time `json:"issuedAt,omitempty"`
	TimeLimit   string    `json:"timeLimit,omitempty"`
	FareAmount  float64   `json:"fareAmount"`
	TaxAmount   float64   `json:"taxAmount"`
	TotalAmount float64   `json:"totalAmount"`
	Currency    string    `json:"currency"`
	PaymentForm string   `json:"paymentForm,omitempty"`
}

type HistoryEntry struct {
	ID        string    `json:"id"`
	Action    string    `json:"action"`
	Field     string    `json:"field,omitempty"`
	OldValue  string    `json:"oldValue,omitempty"`
	NewValue  string    `json:"newValue,omitempty"`
	Agent     string    `json:"agent"`
	Timestamp time.Time `json:"timestamp"`
	Source    string    `json:"source"` // agent, system, supplier, api
}

type QueueEntry struct {
	QueueID     string    `json:"queueId"`
	QueueName   string    `json:"queueName"`
	PlacedAt    time.Time `json:"placedAt"`
	PlacedBy    string    `json:"placedBy"`
	Reason      string    `json:"reason"`
	Priority    int       `json:"priority"`
}

type PNR struct {
	ID              string         `json:"id"`
	RecordLocator   string         `json:"recordLocator"`
	TenantID        string         `json:"tenantId"`
	AgencyID        string         `json:"agencyId"`
	AgentID         string         `json:"agentId"`
	Status          string         `json:"status"` // active, cancelled, archived, ticketed
	GuestName       string         `json:"guestName"`
	GuestEmail      string         `json:"guestEmail"`
	GuestPhone      string         `json:"guestPhone"`
	GuestCountry    string         `json:"guestCountry"`
	CorporateID     string         `json:"corporateId,omitempty"`
	Segments        []Segment      `json:"segments"`
	Remarks         []Remark       `json:"remarks"`
	Ticketing       *TicketingInfo `json:"ticketing,omitempty"`
	History         []HistoryEntry `json:"history"`
	Queues          []QueueEntry   `json:"queues,omitempty"`
	TotalAmount     float64        `json:"totalAmount"`
	Currency        string         `json:"currency"`
	CreatedAt       time.Time      `json:"createdAt"`
	ModifiedAt      time.Time      `json:"modifiedAt"`
	DutyOfCare      bool           `json:"dutyOfCare"`
}

// --- In-Memory Store (PostgreSQL in production) ---

type PNRStore struct {
	mu   sync.RWMutex
	pnrs map[string]*PNR
}

var store = &PNRStore{pnrs: make(map[string]*PNR)}

func generateLocator() string {
	chars := "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 6)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		if err != nil {
			n = big.NewInt(int64(i)) // fallback
		}
		b[i] = chars[n.Int64()]
	}
	return string(b)
}

func validateLocator(locator string) bool {
	return locatorPattern.MatchString(locator)
}

// --- Kafka Event Publishing (Dapr sidecar in production) ---

type Event struct {
	ID        string      `json:"id"`
	Type      string      `json:"type"`
	Source    string      `json:"source"`
	TenantID  string      `json:"tenantId"`
	Data      interface{} `json:"data"`
	Timestamp time.Time   `json:"timestamp"`
}

func publishEvent(eventType string, tenantID string, data interface{}) {
	event := Event{
		ID:        uuid.New().String(),
		Type:      eventType,
		Source:    "pnr-engine",
		TenantID:  tenantID,
		Data:      data,
		Timestamp: time.Now(),
	}
	// In production: publish to Kafka via Dapr sidecar
	// dapr.PublishEvent(ctx, "kafka-pubsub", "gds.pnr.events", event)
	b, _ := json.Marshal(event)
	log.Printf("[EVENT] %s: %s", eventType, string(b)[:min(200, len(b))])
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// --- Temporal Workflow Stubs ---

func startPNRWorkflow(ctx context.Context, pnr *PNR) {
	// In production: Temporal workflow for PNR lifecycle
	// - Auto-cancel if not ticketed within time limit
	// - Send reminders before time limit expiry
	// - Auto-queue on schedule changes
	log.Printf("[TEMPORAL] Started PNR workflow for %s", pnr.RecordLocator)
}

// --- API Handlers ---

func createPNR(c *gin.Context) {
	var req struct {
		GuestName    string    `json:"guestName" binding:"required"`
		GuestEmail   string    `json:"guestEmail" binding:"required"`
		GuestPhone   string    `json:"guestPhone"`
		GuestCountry string    `json:"guestCountry" binding:"required"`
		CorporateID  string    `json:"corporateId"`
		Segments     []Segment `json:"segments"`
		Remarks      []Remark  `json:"remarks"`
		DutyOfCare   bool      `json:"dutyOfCare"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Input validation
	if len(req.GuestName) > 200 || len(req.GuestName) < 2 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "guestName must be 2-200 chars"})
		return
	}
	if !emailPattern.MatchString(req.GuestEmail) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid email format"})
		return
	}
	if req.GuestCountry != "" && !countryPattern.MatchString(strings.ToUpper(req.GuestCountry)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "guestCountry must be ISO 3166-1 alpha-2"})
		return
	}
	if len(req.Segments) > 50 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "maximum 50 segments per PNR"})
		return
	}
	for _, seg := range req.Segments {
		if seg.Amount < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "segment amount cannot be negative"})
			return
		}
		if seg.Quantity < 0 || seg.GuestCount < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "segment quantity/guestCount cannot be negative"})
			return
		}
	}

	tenantID := c.GetHeader("X-GDS-Tenant-ID")
	agentID := c.GetHeader("X-Agent-ID")

	pnr := &PNR{
		ID:            uuid.New().String(),
		RecordLocator: generateLocator(),
		TenantID:      tenantID,
		AgencyID:      c.GetHeader("X-Agency-ID"),
		AgentID:       agentID,
		Status:        "active",
		GuestName:     req.GuestName,
		GuestEmail:    req.GuestEmail,
		GuestPhone:    req.GuestPhone,
		GuestCountry:  req.GuestCountry,
		CorporateID:   req.CorporateID,
		Segments:      req.Segments,
		Remarks:       req.Remarks,
		Currency:      "USD",
		CreatedAt:     time.Now(),
		ModifiedAt:    time.Now(),
		DutyOfCare:    req.DutyOfCare,
		History: []HistoryEntry{{
			ID:        uuid.New().String(),
			Action:    "created",
			Agent:     agentID,
			Timestamp: time.Now(),
			Source:    "agent",
		}},
	}

	// Calculate total
	var total float64
	for i := range pnr.Segments {
		pnr.Segments[i].ID = uuid.New().String()
		pnr.Segments[i].SequenceNo = i + 1
		pnr.Segments[i].CreatedAt = time.Now()
		pnr.Segments[i].ModifiedAt = time.Now()
		if pnr.Segments[i].Status == "" {
			pnr.Segments[i].Status = StatusConfirmed
		}
		total += pnr.Segments[i].Amount
	}
	pnr.TotalAmount = total

	store.mu.Lock()
	store.pnrs[pnr.RecordLocator] = pnr
	store.mu.Unlock()

	// Publish to Kafka
	publishEvent("pnr.created", tenantID, map[string]interface{}{
		"recordLocator": pnr.RecordLocator,
		"guestName":     pnr.GuestName,
		"segments":      len(pnr.Segments),
		"totalAmount":   pnr.TotalAmount,
	})

	// Start Temporal workflow
	go startPNRWorkflow(context.Background(), pnr)

	c.JSON(http.StatusCreated, gin.H{"pnr": pnr})
}

func getPNR(c *gin.Context) {
	locator := strings.ToUpper(c.Param("locator"))

	store.mu.RLock()
	pnr, ok := store.pnrs[locator]
	store.mu.RUnlock()

	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "PNR not found", "locator": locator})
		return
	}
	c.JSON(http.StatusOK, gin.H{"pnr": pnr})
}

func addSegment(c *gin.Context) {
	locator := strings.ToUpper(c.Param("locator"))

	var seg Segment
	if err := c.ShouldBindJSON(&seg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	store.mu.Lock()
	pnr, ok := store.pnrs[locator]
	if !ok {
		store.mu.Unlock()
		c.JSON(http.StatusNotFound, gin.H{"error": "PNR not found"})
		return
	}

	seg.ID = uuid.New().String()
	seg.SequenceNo = len(pnr.Segments) + 1
	seg.CreatedAt = time.Now()
	seg.ModifiedAt = time.Now()
	if seg.Status == "" {
		seg.Status = StatusConfirmed
	}

	pnr.Segments = append(pnr.Segments, seg)
	pnr.TotalAmount += seg.Amount
	pnr.ModifiedAt = time.Now()
	pnr.History = append(pnr.History, HistoryEntry{
		ID:        uuid.New().String(),
		Action:    "segment_added",
		Field:     "segments",
		NewValue:  fmt.Sprintf("%s %s %s-%s", seg.Type, seg.ServiceCode, seg.StartDate, seg.EndDate),
		Agent:     c.GetHeader("X-Agent-ID"),
		Timestamp: time.Now(),
		Source:    "agent",
	})
	store.mu.Unlock()

	publishEvent("pnr.segment.added", pnr.TenantID, map[string]interface{}{
		"recordLocator": locator,
		"segmentId":     seg.ID,
		"type":          seg.Type,
	})

	c.JSON(http.StatusCreated, gin.H{"segment": seg, "pnr": pnr})
}

func cancelSegment(c *gin.Context) {
	locator := strings.ToUpper(c.Param("locator"))
	segID := c.Param("segmentId")

	store.mu.Lock()
	pnr, ok := store.pnrs[locator]
	if !ok {
		store.mu.Unlock()
		c.JSON(http.StatusNotFound, gin.H{"error": "PNR not found"})
		return
	}

	found := false
	for i := range pnr.Segments {
		if pnr.Segments[i].ID == segID {
			pnr.Segments[i].Status = StatusCancelled
			pnr.Segments[i].ModifiedAt = time.Now()
			pnr.TotalAmount -= pnr.Segments[i].Amount
			found = true
			pnr.History = append(pnr.History, HistoryEntry{
				ID:        uuid.New().String(),
				Action:    "segment_cancelled",
				Field:     "segments",
				OldValue:  string(StatusConfirmed),
				NewValue:  string(StatusCancelled),
				Agent:     c.GetHeader("X-Agent-ID"),
				Timestamp: time.Now(),
				Source:    "agent",
			})
			break
		}
	}
	pnr.ModifiedAt = time.Now()
	store.mu.Unlock()

	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "Segment not found"})
		return
	}

	publishEvent("pnr.segment.cancelled", pnr.TenantID, map[string]interface{}{
		"recordLocator": locator,
		"segmentId":     segID,
	})

	c.JSON(http.StatusOK, gin.H{"message": "Segment cancelled", "pnr": pnr})
}

func addRemark(c *gin.Context) {
	locator := strings.ToUpper(c.Param("locator"))

	var remark Remark
	if err := c.ShouldBindJSON(&remark); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	store.mu.Lock()
	pnr, ok := store.pnrs[locator]
	if !ok {
		store.mu.Unlock()
		c.JSON(http.StatusNotFound, gin.H{"error": "PNR not found"})
		return
	}

	remark.ID = uuid.New().String()
	remark.CreatedBy = c.GetHeader("X-Agent-ID")
	remark.CreatedAt = time.Now()
	pnr.Remarks = append(pnr.Remarks, remark)
	pnr.ModifiedAt = time.Now()
	pnr.History = append(pnr.History, HistoryEntry{
		ID:        uuid.New().String(),
		Action:    "remark_added",
		Field:     "remarks",
		NewValue:  remark.Text,
		Agent:     remark.CreatedBy,
		Timestamp: time.Now(),
		Source:    "agent",
	})
	store.mu.Unlock()

	c.JSON(http.StatusCreated, gin.H{"remark": remark})
}

func ticketPNR(c *gin.Context) {
	locator := strings.ToUpper(c.Param("locator"))

	var req struct {
		PaymentForm string  `json:"paymentForm" binding:"required"`
		FareAmount  float64 `json:"fareAmount"`
		TaxAmount   float64 `json:"taxAmount"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	store.mu.Lock()
	pnr, ok := store.pnrs[locator]
	if !ok {
		store.mu.Unlock()
		c.JSON(http.StatusNotFound, gin.H{"error": "PNR not found"})
		return
	}

	now := time.Now()
	ticketNo := fmt.Sprintf("TKT%s%d", locator, now.UnixMilli()%100000)
	pnr.Ticketing = &TicketingInfo{
		Status:      "ticketed",
		TicketNo:    ticketNo,
		IssuedBy:    c.GetHeader("X-Agent-ID"),
		IssuedAt:    &now,
		FareAmount:  req.FareAmount,
		TaxAmount:   req.TaxAmount,
		TotalAmount: req.FareAmount + req.TaxAmount,
		Currency:    pnr.Currency,
		PaymentForm: req.PaymentForm,
	}
	pnr.Status = "ticketed"
	pnr.ModifiedAt = now
	pnr.History = append(pnr.History, HistoryEntry{
		ID:        uuid.New().String(),
		Action:    "ticketed",
		NewValue:  ticketNo,
		Agent:     c.GetHeader("X-Agent-ID"),
		Timestamp: now,
		Source:    "agent",
	})
	store.mu.Unlock()

	// TigerBeetle: record financial transaction
	publishEvent("pnr.ticketed", pnr.TenantID, map[string]interface{}{
		"recordLocator": locator,
		"ticketNo":      ticketNo,
		"totalAmount":   pnr.Ticketing.TotalAmount,
		"paymentForm":   req.PaymentForm,
	})

	c.JSON(http.StatusOK, gin.H{"ticketing": pnr.Ticketing, "pnr": pnr})
}

func queuePNR(c *gin.Context) {
	locator := strings.ToUpper(c.Param("locator"))

	var req struct {
		QueueName string `json:"queueName" binding:"required"`
		Reason    string `json:"reason"`
		Priority  int    `json:"priority"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	store.mu.Lock()
	pnr, ok := store.pnrs[locator]
	if !ok {
		store.mu.Unlock()
		c.JSON(http.StatusNotFound, gin.H{"error": "PNR not found"})
		return
	}

	entry := QueueEntry{
		QueueID:   uuid.New().String(),
		QueueName: req.QueueName,
		PlacedAt:  time.Now(),
		PlacedBy:  c.GetHeader("X-Agent-ID"),
		Reason:    req.Reason,
		Priority:  req.Priority,
	}
	pnr.Queues = append(pnr.Queues, entry)
	pnr.ModifiedAt = time.Now()
	store.mu.Unlock()

	publishEvent("pnr.queued", pnr.TenantID, map[string]interface{}{
		"recordLocator": locator,
		"queueName":     req.QueueName,
		"priority":      req.Priority,
	})

	c.JSON(http.StatusOK, gin.H{"queue": entry, "message": "PNR placed in queue"})
}

func getPNRHistory(c *gin.Context) {
	locator := strings.ToUpper(c.Param("locator"))

	store.mu.RLock()
	pnr, ok := store.pnrs[locator]
	store.mu.RUnlock()

	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "PNR not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"history": pnr.History, "total": len(pnr.History)})
}

func searchPNRs(c *gin.Context) {
	guestName := c.Query("guestName")
	status := c.Query("status")
	agentID := c.Query("agentId")

	store.mu.RLock()
	var results []*PNR
	for _, pnr := range store.pnrs {
		if guestName != "" && !strings.Contains(strings.ToLower(pnr.GuestName), strings.ToLower(guestName)) {
			continue
		}
		if status != "" && pnr.Status != status {
			continue
		}
		if agentID != "" && pnr.AgentID != agentID {
			continue
		}
		results = append(results, pnr)
	}
	store.mu.RUnlock()

	c.JSON(http.StatusOK, gin.H{"pnrs": results, "total": len(results)})
}

func healthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "healthy",
		"service": "pnr-engine",
		"version": "1.0.0",
		"middleware": gin.H{
			"kafka":       os.Getenv("KAFKA_BROKERS"),
			"temporal":    os.Getenv("TEMPORAL_ADDRESS"),
			"tigerbeetle": os.Getenv("TIGERBEETLE_ADDRESSES"),
			"redis":       os.Getenv("REDIS_URL"),
			"permify":     os.Getenv("PERMIFY_ENDPOINT"),
		},
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8082"
	}

	r := gin.Default()

	// Health
	r.GET("/health", healthCheck)

	// PNR CRUD
	api := r.Group("/api/v1/pnr")
	{
		api.POST("/", createPNR)
		api.GET("/search", searchPNRs)
		api.GET("/:locator", getPNR)
		api.POST("/:locator/segments", addSegment)
		api.DELETE("/:locator/segments/:segmentId", cancelSegment)
		api.POST("/:locator/remarks", addRemark)
		api.POST("/:locator/ticket", ticketPNR)
		api.POST("/:locator/queue", queuePNR)
		api.GET("/:locator/history", getPNRHistory)
	}

	log.Printf("PNR Engine starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start: %v", err)
	}
}
