// Guest Profile CRM — Guest lifecycle management for Africa-first GDS.
// All data persisted to PostgreSQL.
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

var db *sql.DB

const defaultTenant = "00000000-0000-0000-0000-000000000001"

func initDB() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgresql://postgres:postgres@localhost:5432/tourismpay?sslmode=disable"
	}
	var err error
	db, err = sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("[DB] Failed to connect: %v", err)
	}
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err = db.PingContext(ctx); err != nil {
		log.Fatalf("[DB] Ping failed: %v", err)
	}
	log.Println("[DB] PostgreSQL connected")
}

func publishEvent(eventType, tenantID string, data interface{}) {
	b, _ := json.Marshal(data)
	log.Printf("[KAFKA] %s tenant=%s data=%s", eventType, tenantID, string(b))
}

func createGuest(c *gin.Context) {
	var req struct {
		FirstName   string `json:"firstName" binding:"required"`
		LastName    string `json:"lastName" binding:"required"`
		Email       string `json:"email" binding:"required"`
		Phone       string `json:"phone"`
		Country     string `json:"country"`
		LoyaltyTier string `json:"loyaltyTier"`
		Preferences string `json:"preferences"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id := uuid.New().String()
	tier := req.LoyaltyTier
	if tier == "" {
		tier = "bronze"
	}
	row := db.QueryRowContext(c.Request.Context(),
		`INSERT INTO gds_guest_profiles (id, tenant_id, first_name, last_name, email, phone, country, loyalty_tier, preferences, total_stays, total_spend, loyalty_points)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,0,0) RETURNING id, tenant_id, first_name, last_name, email, phone, country, loyalty_tier, preferences, total_stays, total_spend, loyalty_points, created_at, updated_at`,
		id, defaultTenant, req.FirstName, req.LastName, req.Email, req.Phone, req.Country, tier, req.Preferences)

	guest := scanGuest(row)
	if guest == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create guest"})
		return
	}
	publishEvent("guest.created", defaultTenant, map[string]interface{}{"id": id, "email": req.Email})
	c.JSON(http.StatusCreated, gin.H{"guest": guest})
}

func scanGuest(row *sql.Row) map[string]interface{} {
	var id, tid, first, last, email string
	var phone, country, tier, prefs sql.NullString
	var stays int
	var spend float64
	var points int
	var ca, ua time.Time
	err := row.Scan(&id, &tid, &first, &last, &email, &phone, &country, &tier, &prefs, &stays, &spend, &points, &ca, &ua)
	if err != nil {
		log.Printf("[DB] scan error: %v", err)
		return nil
	}
	return map[string]interface{}{
		"id": id, "first_name": first, "last_name": last, "email": email,
		"phone": ns(phone), "country": ns(country), "loyalty_tier": ns(tier),
		"preferences": ns(prefs), "total_stays": stays, "total_spend": spend,
		"loyalty_points": points, "created_at": ca, "updated_at": ua,
	}
}

func ns(s sql.NullString) string {
	if s.Valid {
		return s.String
	}
	return ""
}

func getGuest(c *gin.Context) {
	id := c.Param("id")
	row := db.QueryRowContext(c.Request.Context(),
		`SELECT id, tenant_id, first_name, last_name, email, phone, country, loyalty_tier, preferences, total_stays, total_spend, loyalty_points, created_at, updated_at
		 FROM gds_guest_profiles WHERE id=$1 AND tenant_id=$2`, id, defaultTenant)
	guest := scanGuest(row)
	if guest == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "guest not found"})
		return
	}
	c.JSON(http.StatusOK, guest)
}

func listGuests(c *gin.Context) {
	tier := c.Query("tier")
	query := `SELECT id, tenant_id, first_name, last_name, email, phone, country, loyalty_tier, preferences, total_stays, total_spend, loyalty_points, created_at, updated_at
		FROM gds_guest_profiles WHERE tenant_id=$1`
	params := []interface{}{defaultTenant}
	if tier != "" {
		query += " AND loyalty_tier=$2"
		params = append(params, tier)
	}
	query += " ORDER BY created_at DESC LIMIT 100"

	rows, err := db.QueryContext(c.Request.Context(), query, params...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var guests []map[string]interface{}
	for rows.Next() {
		var id, tid, first, last, email string
		var phone, country, tier, prefs sql.NullString
		var stays int
		var spend float64
		var points int
		var ca, ua time.Time
		rows.Scan(&id, &tid, &first, &last, &email, &phone, &country, &tier, &prefs, &stays, &spend, &points, &ca, &ua)
		guests = append(guests, map[string]interface{}{
			"id": id, "first_name": first, "last_name": last, "email": email,
			"phone": ns(phone), "country": ns(country), "loyalty_tier": ns(tier),
			"total_stays": stays, "total_spend": spend, "loyalty_points": points,
		})
	}
	if guests == nil {
		guests = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"guests": guests, "total": len(guests)})
}

func updateGuest(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		LoyaltyTier string  `json:"loyaltyTier"`
		Phone       string  `json:"phone"`
		TotalStays  int     `json:"totalStays"`
		TotalSpend  float64 `json:"totalSpend"`
		Points      int     `json:"loyaltyPoints"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := db.ExecContext(c.Request.Context(),
		`UPDATE gds_guest_profiles SET loyalty_tier=COALESCE(NULLIF($1,''),loyalty_tier),
		 phone=COALESCE(NULLIF($2,''),phone), total_stays=$3, total_spend=$4, loyalty_points=$5, updated_at=NOW()
		 WHERE id=$6 AND tenant_id=$7`,
		req.LoyaltyTier, req.Phone, req.TotalStays, req.TotalSpend, req.Points, id, defaultTenant)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "guest not found"})
		return
	}
	publishEvent("guest.updated", defaultTenant, map[string]interface{}{"id": id})
	c.JSON(http.StatusOK, gin.H{"id": id, "updated": true})
}

func deleteGuest(c *gin.Context) {
	id := c.Param("id")
	result, err := db.ExecContext(c.Request.Context(),
		`DELETE FROM gds_guest_profiles WHERE id=$1 AND tenant_id=$2`, id, defaultTenant)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "guest not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

func healthCheck(c *gin.Context) {
	dbStatus := "connected"
	if err := db.Ping(); err != nil {
		dbStatus = fmt.Sprintf("error: %v", err)
	}
	c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "guest-profile", "database": dbStatus})
}

func main() {
	initDB()
	defer db.Close()
	port := os.Getenv("PORT")
	if port == "" {
		port = "8084"
	}
	r := gin.Default()
	r.GET("/health", healthCheck)
	api := r.Group("/api/v1/guests")
	{
		api.POST("/", createGuest)
		api.GET("/", listGuests)
		api.GET("/:id", getGuest)
		api.PUT("/:id", updateGuest)
		api.DELETE("/:id", deleteGuest)
	}
	log.Printf("[Guest Profile] Starting on port %s with PostgreSQL", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start: %v", err)
	}
}
