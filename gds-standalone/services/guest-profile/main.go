// Guest Profile CRM — Central guest management for Africa-first GDS.
// Preferences, stay history, corporate profiles, travel policies.
// Integrates with: PostgreSQL (store), Redis (cache), OpenSearch (search),
// Kafka (events), Permify (authz), Keycloak (identity linking).
package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// --- Domain Models ---

type GuestProfile struct {
	ID              string           `json:"id"`
	TenantID        string           `json:"tenantId"`
	ExternalIDs     map[string]string `json:"externalIds"` // keycloak_id, passport_no, loyalty_id
	Title           string           `json:"title"`
	FirstName       string           `json:"firstName"`
	LastName        string           `json:"lastName"`
	Email           string           `json:"email"`
	Phone           string           `json:"phone"`
	Nationality     string           `json:"nationality"`
	Language        string           `json:"language"`
	DateOfBirth     string           `json:"dateOfBirth,omitempty"`
	Gender          string           `json:"gender,omitempty"`
	Preferences     GuestPreferences `json:"preferences"`
	CorporateID     string           `json:"corporateId,omitempty"`
	LoyaltyTier     string           `json:"loyaltyTier"`
	LifetimeValue   float64          `json:"lifetimeValue"`
	TotalStays      int              `json:"totalStays"`
	TotalSpend      float64          `json:"totalSpend"`
	LastStay        *StayRecord      `json:"lastStay,omitempty"`
	Tags            []string         `json:"tags"`
	Notes           []ProfileNote    `json:"notes"`
	ConsentMarketing bool            `json:"consentMarketing"`
	ConsentData      bool            `json:"consentData"`
	CreatedAt       time.Time        `json:"createdAt"`
	UpdatedAt       time.Time        `json:"updatedAt"`
}

type GuestPreferences struct {
	RoomType        string   `json:"roomType"`        // king, twin, suite, accessible
	Floor           string   `json:"floor"`           // high, low, any
	BedType         string   `json:"bedType"`
	Pillow          string   `json:"pillow"`          // soft, firm, hypoallergenic
	Temperature     int      `json:"temperature"`     // room temp in Celsius
	Smoking         bool     `json:"smoking"`
	ViewPreference  string   `json:"viewPreference"`  // ocean, garden, city, pool
	DietaryNeeds    []string `json:"dietaryNeeds"`    // vegetarian, halal, kosher, gluten-free
	Allergies       []string `json:"allergies"`
	Amenities       []string `json:"amenities"`       // extra_towels, minibar, newspaper
	TransportPref   string   `json:"transportPref"`   // private_car, shuttle, self
	CheckInPref     string   `json:"checkInPref"`     // early, standard, late, express
	SpecialRequests []string `json:"specialRequests"`
}

type StayRecord struct {
	ID          string    `json:"id"`
	PropertyID  string    `json:"propertyId"`
	PropertyName string   `json:"propertyName"`
	CheckIn     string    `json:"checkIn"`
	CheckOut    string    `json:"checkOut"`
	RoomType    string    `json:"roomType"`
	RateAmount  float64   `json:"rateAmount"`
	Currency    string    `json:"currency"`
	Rating      int       `json:"rating"` // 1-5 guest rating
	PNRLocator  string    `json:"pnrLocator"`
	Country     string    `json:"country"`
	CreatedAt   time.Time `json:"createdAt"`
}

type ProfileNote struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"` // preference, complaint, vip, alert
	Text      string    `json:"text"`
	CreatedBy string    `json:"createdBy"`
	CreatedAt time.Time `json:"createdAt"`
}

type CorporateAccount struct {
	ID             string          `json:"id"`
	TenantID       string          `json:"tenantId"`
	CompanyName    string          `json:"companyName"`
	Industry       string          `json:"industry"`
	Country        string          `json:"country"`
	ContactEmail   string          `json:"contactEmail"`
	TravelPolicy   TravelPolicy    `json:"travelPolicy"`
	NegotiatedRates []NegotiatedRate `json:"negotiatedRates"`
	Travelers      int             `json:"travelers"`
	AnnualSpend    float64         `json:"annualSpend"`
	Status         string          `json:"status"`
	CreatedAt      time.Time       `json:"createdAt"`
}

type TravelPolicy struct {
	MaxRoomRate     float64  `json:"maxRoomRate"`
	Currency        string   `json:"currency"`
	AllowedClasses  []string `json:"allowedClasses"`  // standard, business, first
	RequireApproval float64  `json:"requireApproval"` // amount threshold
	AllowedCountries []string `json:"allowedCountries"`
	MealAllowance   float64  `json:"mealAllowance"`
	ApprovalChain   []string `json:"approvalChain"`   // manager, finance, cfo
}

type NegotiatedRate struct {
	PropertyID   string  `json:"propertyId"`
	PropertyName string  `json:"propertyName"`
	RoomType     string  `json:"roomType"`
	Rate         float64 `json:"rate"`
	Discount     float64 `json:"discount"` // percentage off BAR
	ValidFrom    string  `json:"validFrom"`
	ValidTo      string  `json:"validTo"`
}

// --- Store ---

type ProfileStore struct {
	mu         sync.RWMutex
	profiles   map[string]*GuestProfile
	corporates map[string]*CorporateAccount
}

var store = &ProfileStore{
	profiles:   make(map[string]*GuestProfile),
	corporates: make(map[string]*CorporateAccount),
}

// --- Handlers ---

func createProfile(c *gin.Context) {
	var req struct {
		FirstName    string           `json:"firstName" binding:"required"`
		LastName     string           `json:"lastName" binding:"required"`
		Email        string           `json:"email" binding:"required"`
		Phone        string           `json:"phone"`
		Nationality  string           `json:"nationality" binding:"required"`
		Language     string           `json:"language"`
		CorporateID  string           `json:"corporateId"`
		Preferences  GuestPreferences `json:"preferences"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	profile := &GuestProfile{
		ID:           uuid.New().String(),
		TenantID:     c.GetHeader("X-GDS-Tenant-ID"),
		ExternalIDs:  make(map[string]string),
		FirstName:    req.FirstName,
		LastName:     req.LastName,
		Email:        req.Email,
		Phone:        req.Phone,
		Nationality:  req.Nationality,
		Language:     req.Language,
		CorporateID:  req.CorporateID,
		Preferences:  req.Preferences,
		LoyaltyTier:  "Bronze",
		Tags:         []string{},
		Notes:        []ProfileNote{},
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	store.mu.Lock()
	store.profiles[profile.ID] = profile
	store.mu.Unlock()

	// Kafka: publish profile.created
	log.Printf("[EVENT] guest.profile.created: %s %s (%s)", profile.FirstName, profile.LastName, profile.ID)

	c.JSON(http.StatusCreated, gin.H{"profile": profile})
}

func getProfile(c *gin.Context) {
	id := c.Param("id")
	store.mu.RLock()
	profile, ok := store.profiles[id]
	store.mu.RUnlock()
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "Profile not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"profile": profile})
}

func updatePreferences(c *gin.Context) {
	id := c.Param("id")
	var prefs GuestPreferences
	if err := c.ShouldBindJSON(&prefs); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	store.mu.Lock()
	profile, ok := store.profiles[id]
	if !ok {
		store.mu.Unlock()
		c.JSON(http.StatusNotFound, gin.H{"error": "Profile not found"})
		return
	}
	profile.Preferences = prefs
	profile.UpdatedAt = time.Now()
	store.mu.Unlock()

	c.JSON(http.StatusOK, gin.H{"preferences": prefs, "message": "Preferences updated"})
}

func addStay(c *gin.Context) {
	id := c.Param("id")
	var stay StayRecord
	if err := c.ShouldBindJSON(&stay); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	store.mu.Lock()
	profile, ok := store.profiles[id]
	if !ok {
		store.mu.Unlock()
		c.JSON(http.StatusNotFound, gin.H{"error": "Profile not found"})
		return
	}
	stay.ID = uuid.New().String()
	stay.CreatedAt = time.Now()
	profile.LastStay = &stay
	profile.TotalStays++
	profile.TotalSpend += stay.RateAmount
	profile.LifetimeValue = profile.TotalSpend * 1.2 // LTV factor
	profile.UpdatedAt = time.Now()
	store.mu.Unlock()

	c.JSON(http.StatusCreated, gin.H{"stay": stay, "totalStays": profile.TotalStays})
}

func searchProfiles(c *gin.Context) {
	query := strings.ToLower(c.Query("q"))
	nationality := c.Query("nationality")
	tier := c.Query("tier")

	store.mu.RLock()
	var results []*GuestProfile
	for _, p := range store.profiles {
		if query != "" {
			name := strings.ToLower(p.FirstName + " " + p.LastName)
			if !strings.Contains(name, query) && !strings.Contains(strings.ToLower(p.Email), query) {
				continue
			}
		}
		if nationality != "" && p.Nationality != nationality {
			continue
		}
		if tier != "" && p.LoyaltyTier != tier {
			continue
		}
		results = append(results, p)
	}
	store.mu.RUnlock()

	c.JSON(http.StatusOK, gin.H{"profiles": results, "total": len(results)})
}

func createCorporate(c *gin.Context) {
	var acct CorporateAccount
	if err := c.ShouldBindJSON(&acct); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	acct.ID = uuid.New().String()
	acct.TenantID = c.GetHeader("X-GDS-Tenant-ID")
	acct.Status = "active"
	acct.CreatedAt = time.Now()

	store.mu.Lock()
	store.corporates[acct.ID] = &acct
	store.mu.Unlock()

	c.JSON(http.StatusCreated, gin.H{"corporate": acct})
}

func getCorporates(c *gin.Context) {
	store.mu.RLock()
	var results []*CorporateAccount
	for _, ca := range store.corporates {
		results = append(results, ca)
	}
	store.mu.RUnlock()

	c.JSON(http.StatusOK, gin.H{"corporates": results, "total": len(results)})
}

func healthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "healthy",
		"service": "guest-profile-crm",
		"version": "1.0.0",
		"middleware": gin.H{
			"postgres":   os.Getenv("DATABASE_URL"),
			"redis":      os.Getenv("REDIS_URL"),
			"opensearch": os.Getenv("OPENSEARCH_URL"),
			"kafka":      os.Getenv("KAFKA_BROKERS"),
			"keycloak":   os.Getenv("KEYCLOAK_URL"),
		},
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8084"
	}

	r := gin.Default()
	r.GET("/health", healthCheck)

	api := r.Group("/api/v1/guests")
	{
		api.POST("/", createProfile)
		api.GET("/search", searchProfiles)
		api.GET("/:id", getProfile)
		api.PUT("/:id/preferences", updatePreferences)
		api.POST("/:id/stays", addStay)
	}

	corp := r.Group("/api/v1/corporates")
	{
		corp.POST("/", createCorporate)
		corp.GET("/", getCorporates)
	}

	log.Printf("Guest Profile CRM starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start: %v", err)
	}
}
