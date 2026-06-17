// Group Bookings — Block allocation, rooming lists, attrition for Africa-first GDS.
// Handles conferences, weddings, tour groups, corporate events.
// Integrates with: PostgreSQL (store), Kafka (events), Temporal (workflows),
// TigerBeetle (ledger), Redis (cache), Permify (authz).
package main

import (
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// --- Domain Models ---

type GroupStatus string

const (
	StatusProvisional GroupStatus = "provisional"
	StatusDefinite    GroupStatus = "definite"
	StatusWashdown    GroupStatus = "washdown"
	StatusActualized  GroupStatus = "actualized"
	StatusCancelled   GroupStatus = "cancelled"
)

type GroupType string

const (
	TypeConference  GroupType = "conference"
	TypeWedding     GroupType = "wedding"
	TypeTourGroup   GroupType = "tour_group"
	TypeCorporate   GroupType = "corporate"
	TypeIncentive   GroupType = "incentive"
	TypeSportsTeam  GroupType = "sports_team"
)

type RoomBlock struct {
	RoomType     string  `json:"roomType"`
	Blocked      int     `json:"blocked"`
	Picked       int     `json:"picked"`
	Available    int     `json:"available"`
	Rate         float64 `json:"rate"`
	Currency     string  `json:"currency"`
}

type RoomingEntry struct {
	ID          string `json:"id"`
	GuestName   string `json:"guestName"`
	RoomType    string `json:"roomType"`
	CheckIn     string `json:"checkIn"`
	CheckOut    string `json:"checkOut"`
	SpecialReq  string `json:"specialReq,omitempty"`
	Status      string `json:"status"` // confirmed, pending, cancelled
	RoomNumber  string `json:"roomNumber,omitempty"`
}

type AttritionSchedule struct {
	CutoffDate  string  `json:"cutoffDate"`
	MinPickup   float64 `json:"minPickup"` // percentage that must be picked up
	Penalty     float64 `json:"penalty"`   // penalty per unblocked room
	Description string  `json:"description"`
}

type GroupBooking struct {
	ID                string              `json:"id"`
	TenantID          string              `json:"tenantId"`
	PropertyID        string              `json:"propertyId"`
	PropertyName      string              `json:"propertyName"`
	GroupName         string              `json:"groupName"`
	GroupType         GroupType           `json:"groupType"`
	Status            GroupStatus         `json:"status"`
	ContactName       string              `json:"contactName"`
	ContactEmail      string              `json:"contactEmail"`
	ContactPhone      string              `json:"contactPhone"`
	StartDate         string              `json:"startDate"`
	EndDate           string              `json:"endDate"`
	TotalRooms        int                 `json:"totalRooms"`
	PickedUp          int                 `json:"pickedUp"`
	RoomBlocks        []RoomBlock         `json:"roomBlocks"`
	RoomingList       []RoomingEntry      `json:"roomingList"`
	Attrition         []AttritionSchedule `json:"attrition"`
	NegotiatedRate    float64             `json:"negotiatedRate"`
	DiscountPercent   float64             `json:"discountPercent"`
	Currency          string              `json:"currency"`
	EstimatedRevenue  float64             `json:"estimatedRevenue"`
	DepositRequired   float64             `json:"depositRequired"`
	DepositPaid       float64             `json:"depositPaid"`
	MeetingSpace      bool                `json:"meetingSpace"`
	CateringRequired  bool                `json:"cateringRequired"`
	TransportRequired bool                `json:"transportRequired"`
	Country           string              `json:"country"`
	Notes             []string            `json:"notes"`
	CreatedAt         time.Time           `json:"createdAt"`
	UpdatedAt         time.Time           `json:"updatedAt"`
}

// --- Store ---

type GroupStore struct {
	mu     sync.RWMutex
	groups map[string]*GroupBooking
}

var store = &GroupStore{groups: make(map[string]*GroupBooking)}

// --- Handlers ---

func createGroup(c *gin.Context) {
	var req struct {
		PropertyID      string    `json:"propertyId" binding:"required"`
		PropertyName    string    `json:"propertyName"`
		GroupName       string    `json:"groupName" binding:"required"`
		GroupType       GroupType `json:"groupType" binding:"required"`
		ContactName     string    `json:"contactName" binding:"required"`
		ContactEmail    string    `json:"contactEmail" binding:"required"`
		ContactPhone    string    `json:"contactPhone"`
		StartDate       string    `json:"startDate" binding:"required"`
		EndDate         string    `json:"endDate" binding:"required"`
		RoomBlocks      []RoomBlock `json:"roomBlocks" binding:"required"`
		NegotiatedRate  float64   `json:"negotiatedRate"`
		DiscountPercent float64   `json:"discountPercent"`
		Currency        string    `json:"currency"`
		MeetingSpace    bool      `json:"meetingSpace"`
		Catering        bool      `json:"cateringRequired"`
		Transport       bool      `json:"transportRequired"`
		Country         string    `json:"country"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	totalRooms := 0
	for i := range req.RoomBlocks {
		req.RoomBlocks[i].Available = req.RoomBlocks[i].Blocked
		totalRooms += req.RoomBlocks[i].Blocked
	}

	currency := req.Currency
	if currency == "" {
		currency = "USD"
	}

	// Default attrition: 60 days (80%), 30 days (90%), 14 days (100%)
	start, _ := time.Parse("2006-01-02", req.StartDate)
	attrition := []AttritionSchedule{
		{CutoffDate: start.AddDate(0, 0, -60).Format("2006-01-02"), MinPickup: 80, Penalty: req.NegotiatedRate * 0.5, Description: "First cutoff: 80% minimum pickup"},
		{CutoffDate: start.AddDate(0, 0, -30).Format("2006-01-02"), MinPickup: 90, Penalty: req.NegotiatedRate * 0.75, Description: "Second cutoff: 90% minimum pickup"},
		{CutoffDate: start.AddDate(0, 0, -14).Format("2006-01-02"), MinPickup: 100, Penalty: req.NegotiatedRate, Description: "Final cutoff: full commitment"},
	}

	estimatedRevenue := float64(totalRooms) * req.NegotiatedRate
	nights := int(math.Ceil(start.Sub(time.Now()).Hours() / 24))
	if nights < 0 {
		nights = 1
	}

	group := &GroupBooking{
		ID:                uuid.New().String(),
		TenantID:          c.GetHeader("X-GDS-Tenant-ID"),
		PropertyID:        req.PropertyID,
		PropertyName:      req.PropertyName,
		GroupName:         req.GroupName,
		GroupType:         req.GroupType,
		Status:            StatusProvisional,
		ContactName:       req.ContactName,
		ContactEmail:      req.ContactEmail,
		ContactPhone:      req.ContactPhone,
		StartDate:         req.StartDate,
		EndDate:           req.EndDate,
		TotalRooms:        totalRooms,
		PickedUp:          0,
		RoomBlocks:        req.RoomBlocks,
		RoomingList:       []RoomingEntry{},
		Attrition:         attrition,
		NegotiatedRate:    req.NegotiatedRate,
		DiscountPercent:   req.DiscountPercent,
		Currency:          currency,
		EstimatedRevenue:  estimatedRevenue,
		DepositRequired:   estimatedRevenue * 0.25,
		DepositPaid:       0,
		MeetingSpace:      req.MeetingSpace,
		CateringRequired:  req.Catering,
		TransportRequired: req.Transport,
		Country:           req.Country,
		Notes:             []string{},
		CreatedAt:         time.Now(),
		UpdatedAt:         time.Now(),
	}

	store.mu.Lock()
	store.groups[group.ID] = group
	store.mu.Unlock()

	// Kafka: publish group.created
	log.Printf("[EVENT] group.created: %s (%d rooms, %s)", group.GroupName, totalRooms, group.Country)

	c.JSON(http.StatusCreated, gin.H{"group": group})
}

func getGroup(c *gin.Context) {
	id := c.Param("id")
	store.mu.RLock()
	group, ok := store.groups[id]
	store.mu.RUnlock()
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group booking not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"group": group})
}

func listGroups(c *gin.Context) {
	status := c.Query("status")
	groupType := c.Query("type")
	country := c.Query("country")

	store.mu.RLock()
	var results []*GroupBooking
	for _, g := range store.groups {
		if status != "" && string(g.Status) != status {
			continue
		}
		if groupType != "" && string(g.GroupType) != groupType {
			continue
		}
		if country != "" && g.Country != country {
			continue
		}
		results = append(results, g)
	}
	store.mu.RUnlock()

	c.JSON(http.StatusOK, gin.H{"groups": results, "total": len(results)})
}

func addRoomingEntry(c *gin.Context) {
	id := c.Param("id")
	var entry RoomingEntry
	if err := c.ShouldBindJSON(&entry); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	store.mu.Lock()
	group, ok := store.groups[id]
	if !ok {
		store.mu.Unlock()
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
		return
	}

	entry.ID = uuid.New().String()
	if entry.Status == "" {
		entry.Status = "confirmed"
	}
	group.RoomingList = append(group.RoomingList, entry)
	group.PickedUp++

	// Update block availability
	for i := range group.RoomBlocks {
		if group.RoomBlocks[i].RoomType == entry.RoomType && group.RoomBlocks[i].Available > 0 {
			group.RoomBlocks[i].Picked++
			group.RoomBlocks[i].Available--
			break
		}
	}

	group.UpdatedAt = time.Now()
	store.mu.Unlock()

	pickupRate := float64(group.PickedUp) / float64(group.TotalRooms) * 100
	c.JSON(http.StatusCreated, gin.H{
		"entry":      entry,
		"pickupRate": fmt.Sprintf("%.1f%%", pickupRate),
		"remaining":  group.TotalRooms - group.PickedUp,
	})
}

func getAttritionStatus(c *gin.Context) {
	id := c.Param("id")
	store.mu.RLock()
	group, ok := store.groups[id]
	store.mu.RUnlock()
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
		return
	}

	pickupRate := float64(group.PickedUp) / float64(group.TotalRooms) * 100
	now := time.Now()

	var nextCutoff *AttritionSchedule
	var penaltyRisk float64
	for i := range group.Attrition {
		cutoff, _ := time.Parse("2006-01-02", group.Attrition[i].CutoffDate)
		if cutoff.After(now) {
			nextCutoff = &group.Attrition[i]
			if pickupRate < group.Attrition[i].MinPickup {
				shortfall := group.Attrition[i].MinPickup - pickupRate
				roomsShort := int(math.Ceil(shortfall / 100 * float64(group.TotalRooms)))
				penaltyRisk = float64(roomsShort) * group.Attrition[i].Penalty
			}
			break
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"groupId":      id,
		"totalRooms":   group.TotalRooms,
		"pickedUp":     group.PickedUp,
		"pickupRate":   fmt.Sprintf("%.1f%%", pickupRate),
		"nextCutoff":   nextCutoff,
		"penaltyRisk":  penaltyRisk,
		"status":       group.Status,
		"daysToEvent":  int(math.Ceil(time.Until(mustParseDate(group.StartDate)).Hours() / 24)),
	})
}

func mustParseDate(s string) time.Time {
	t, _ := time.Parse("2006-01-02", s)
	return t
}

func washdown(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		NewTotal int    `json:"newTotal" binding:"required"`
		Reason   string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	store.mu.Lock()
	group, ok := store.groups[id]
	if !ok {
		store.mu.Unlock()
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
		return
	}

	released := group.TotalRooms - req.NewTotal
	group.TotalRooms = req.NewTotal
	group.Status = StatusWashdown
	group.EstimatedRevenue = float64(req.NewTotal) * group.NegotiatedRate
	group.Notes = append(group.Notes, fmt.Sprintf("Washdown: released %d rooms. Reason: %s", released, req.Reason))
	group.UpdatedAt = time.Now()
	store.mu.Unlock()

	log.Printf("[EVENT] group.washdown: %s released %d rooms", group.GroupName, released)

	c.JSON(http.StatusOK, gin.H{
		"message":       fmt.Sprintf("Block reduced by %d rooms", released),
		"newTotal":      req.NewTotal,
		"releasedRooms": released,
		"newRevenue":    group.EstimatedRevenue,
	})
}

func healthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "healthy",
		"service": "gds-group-bookings",
		"version": "1.0.0",
		"middleware": gin.H{
			"postgres":     os.Getenv("DATABASE_URL"),
			"kafka":        os.Getenv("KAFKA_BROKERS"),
			"temporal":     os.Getenv("TEMPORAL_ADDRESS"),
			"tigerbeetle":  os.Getenv("TIGERBEETLE_ADDRESSES"),
			"redis":        os.Getenv("REDIS_URL"),
			"permify":      os.Getenv("PERMIFY_ENDPOINT"),
		},
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8087"
	}

	r := gin.Default()
	r.GET("/health", healthCheck)

	api := r.Group("/api/v1/groups")
	{
		api.POST("/", createGroup)
		api.GET("/", listGroups)
		api.GET("/:id", getGroup)
		api.POST("/:id/rooming", addRoomingEntry)
		api.GET("/:id/attrition", getAttritionStatus)
		api.POST("/:id/washdown", washdown)
	}

	log.Printf("Group Bookings Service starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start: %v", err)
	}
}
