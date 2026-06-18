// Negotiated Rates Service — Corporate rate agreements and lookups.
// All data persisted to PostgreSQL.
package main

import (
	"context"
	"database/sql"
	"encoding/json"
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

func createAgreement(c *gin.Context) {
	var req struct {
		CorporateName string  `json:"corporateName" binding:"required"`
		CorporateID   string  `json:"corporateId" binding:"required"`
		PropertyID    string  `json:"propertyId" binding:"required"`
		DiscountPct   float64 `json:"discountPct" binding:"required"`
		RoomTypes     string  `json:"roomTypes"`
		ValidFrom     string  `json:"validFrom" binding:"required"`
		ValidTo       string  `json:"validTo" binding:"required"`
		MinNights     int     `json:"minNights"`
		MinRooms      int     `json:"minRooms"`
		Currency      string  `json:"currency"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id := uuid.New().String()
	currency := req.Currency
	if currency == "" {
		currency = "NGN"
	}

	row := db.QueryRowContext(c.Request.Context(),
		`INSERT INTO gds_negotiated_rates (id, tenant_id, corporate_name, corporate_id, property_id,
		 discount_pct, room_types, valid_from, valid_to, min_nights, min_rooms, currency, status)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active')
		 RETURNING id, corporate_name, corporate_id, property_id, discount_pct, room_types,
		 valid_from, valid_to, min_nights, min_rooms, currency, status, created_at`,
		id, defaultTenant, req.CorporateName, req.CorporateID, req.PropertyID,
		req.DiscountPct, req.RoomTypes, req.ValidFrom, req.ValidTo, req.MinNights, req.MinRooms, currency)

	var rid, corpName, corpID, propID, roomTypes, validFrom, validTo, curr, st string
	var discPct float64
	var minN, minR int
	var ca time.Time
	err := row.Scan(&rid, &corpName, &corpID, &propID, &discPct, &roomTypes, &validFrom, &validTo, &minN, &minR, &curr, &st, &ca)
	if err != nil {
		log.Printf("[DB] insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create agreement"})
		return
	}
	publishEvent("rate.agreement.created", defaultTenant, map[string]interface{}{"id": rid, "corporate": corpName, "discount": discPct})
	c.JSON(http.StatusCreated, gin.H{
		"id": rid, "corporate_name": corpName, "corporate_id": corpID, "property_id": propID,
		"discount_pct": discPct, "room_types": roomTypes, "valid_from": validFrom,
		"valid_to": validTo, "min_nights": minN, "min_rooms": minR, "currency": curr, "status": st,
	})
}

func listAgreements(c *gin.Context) {
	rows, err := db.QueryContext(c.Request.Context(),
		`SELECT id, corporate_name, corporate_id, property_id, discount_pct, room_types,
		 valid_from, valid_to, min_nights, min_rooms, currency, status
		 FROM gds_negotiated_rates WHERE tenant_id=$1 ORDER BY created_at DESC`, defaultTenant)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var agreements []map[string]interface{}
	for rows.Next() {
		var id, corpName, corpID, propID, roomTypes, validFrom, validTo, curr, st string
		var discPct float64
		var minN, minR int
		rows.Scan(&id, &corpName, &corpID, &propID, &discPct, &roomTypes, &validFrom, &validTo, &minN, &minR, &curr, &st)
		agreements = append(agreements, map[string]interface{}{
			"id": id, "corporate_name": corpName, "corporate_id": corpID,
			"property_id": propID, "discount_pct": discPct, "valid_from": validFrom,
			"valid_to": validTo, "currency": curr, "status": st,
		})
	}
	if agreements == nil {
		agreements = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"agreements": agreements, "total": len(agreements)})
}

func lookupRate(c *gin.Context) {
	corpID := c.Query("corporateId")
	propID := c.Query("propertyId")
	if corpID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "corporateId required"})
		return
	}
	query := `SELECT id, corporate_name, discount_pct, room_types, valid_from, valid_to, currency
		FROM gds_negotiated_rates WHERE tenant_id=$1 AND corporate_id=$2 AND status='active'`
	params := []interface{}{defaultTenant, corpID}
	if propID != "" {
		query += " AND property_id=$3"
		params = append(params, propID)
	}
	query += " ORDER BY discount_pct DESC LIMIT 1"

	var id, name, roomTypes, validFrom, validTo, curr string
	var disc float64
	err := db.QueryRowContext(c.Request.Context(), query, params...).
		Scan(&id, &name, &disc, &roomTypes, &validFrom, &validTo, &curr)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no active agreement found", "corporateId": corpID})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id": id, "corporate_name": name, "discount_pct": disc,
		"room_types": roomTypes, "valid_from": validFrom, "valid_to": validTo, "currency": curr,
	})
}

func calculateNegotiatedRate(c *gin.Context) {
	var req struct {
		CorporateID string  `json:"corporateId" binding:"required"`
		PropertyID  string  `json:"propertyId"`
		BaseRate    float64 `json:"baseRate" binding:"required"`
		Currency    string  `json:"currency"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	query := `SELECT corporate_name, discount_pct FROM gds_negotiated_rates
		WHERE tenant_id=$1 AND corporate_id=$2 AND status='active'`
	params := []interface{}{defaultTenant, req.CorporateID}
	if req.PropertyID != "" {
		query += " AND property_id=$3"
		params = append(params, req.PropertyID)
	}
	query += " ORDER BY discount_pct DESC LIMIT 1"

	var corpName string
	var disc float64
	err := db.QueryRowContext(c.Request.Context(), query, params...).Scan(&corpName, &disc)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no active agreement", "corporateId": req.CorporateID})
		return
	}
	discount := req.BaseRate * disc / 100
	negotiatedRate := req.BaseRate - discount
	c.JSON(http.StatusOK, gin.H{
		"corporate_name": corpName, "base_rate": req.BaseRate,
		"discount_pct": disc, "discount_amount": discount,
		"negotiated_rate": negotiatedRate, "currency": req.Currency,
	})
}

func healthCheck(c *gin.Context) {
	dbStatus := "connected"
	if err := db.Ping(); err != nil {
		dbStatus = "error"
	}
	c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "negotiated-rates", "database": dbStatus})
}

func main() {
	initDB()
	defer db.Close()
	port := os.Getenv("PORT")
	if port == "" {
		port = "8113"
	}
	r := gin.Default()
	r.GET("/health", healthCheck)
	api := r.Group("/api/v1/negotiated-rates")
	{
		api.POST("/agreements", createAgreement)
		api.GET("/agreements", listAgreements)
		api.GET("/lookup", lookupRate)
		api.POST("/calculate", calculateNegotiatedRate)
	}
	log.Printf("[Negotiated Rates] Starting on port %s with PostgreSQL", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start: %v", err)
	}
}
