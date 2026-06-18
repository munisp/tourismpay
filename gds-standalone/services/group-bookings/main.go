// Group Bookings Service — Multi-room group reservation management.
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

func createGroup(c *gin.Context) {
	var req struct {
		GroupName    string  `json:"groupName" binding:"required"`
		Organizer    string  `json:"organizer" binding:"required"`
		PropertyID   string  `json:"propertyId" binding:"required"`
		CheckIn      string  `json:"checkIn" binding:"required"`
		CheckOut     string  `json:"checkOut" binding:"required"`
		RoomsBlocked int     `json:"roomsBlocked" binding:"required"`
		RatePerNight float64 `json:"ratePerNight" binding:"required"`
		Currency     string  `json:"currency"`
		GroupType    string  `json:"groupType"`
		AttritionPct float64 `json:"attritionPct"`
		CutoffDate   string  `json:"cutoffDate"`
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
	groupType := req.GroupType
	if groupType == "" {
		groupType = "corporate"
	}
	attrition := req.AttritionPct
	if attrition == 0 {
		attrition = 20.0
	}

	row := db.QueryRowContext(c.Request.Context(),
		`INSERT INTO gds_group_bookings (id, tenant_id, group_name, organizer, property_id, check_in, check_out,
		 rooms_blocked, rate_per_night, currency, group_type, attrition_pct, cutoff_date, status, rooms_picked_up)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'tentative',0)
		 RETURNING id, tenant_id, group_name, organizer, property_id, check_in, check_out, rooms_blocked,
		 rate_per_night, currency, group_type, attrition_pct, cutoff_date, status, rooms_picked_up, created_at, updated_at`,
		id, defaultTenant, req.GroupName, req.Organizer, req.PropertyID, req.CheckIn, req.CheckOut,
		req.RoomsBlocked, req.RatePerNight, currency, groupType, attrition, req.CutoffDate)

	var gid, tid, gname, org, pid, cin, cout, curr, gt, st string
	var cutoff sql.NullString
	var rooms, pickup int
	var rate, att float64
	var ca, ua time.Time
	err := row.Scan(&gid, &tid, &gname, &org, &pid, &cin, &cout, &rooms, &rate, &curr, &gt, &att, &cutoff, &st, &pickup, &ca, &ua)
	if err != nil {
		log.Printf("[DB] insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create group booking"})
		return
	}

	publishEvent("group.created", defaultTenant, map[string]interface{}{"id": gid, "groupName": gname, "rooms": rooms})
	c.JSON(http.StatusCreated, gin.H{
		"id": gid, "group_name": gname, "organizer": org, "property_id": pid,
		"check_in": cin, "check_out": cout, "rooms_blocked": rooms,
		"rate_per_night": rate, "currency": curr, "group_type": gt,
		"attrition_pct": att, "status": st, "rooms_picked_up": pickup,
		"created_at": ca,
	})
}

func listGroups(c *gin.Context) {
	rows, err := db.QueryContext(c.Request.Context(),
		`SELECT id, group_name, organizer, property_id, check_in, check_out, rooms_blocked,
		 rate_per_night, currency, group_type, attrition_pct, status, rooms_picked_up, created_at
		 FROM gds_group_bookings WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50`, defaultTenant)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var groups []map[string]interface{}
	for rows.Next() {
		var id, name, org, pid, cin, cout, curr, gt, st string
		var rooms, pickup int
		var rate, att float64
		var ca time.Time
		rows.Scan(&id, &name, &org, &pid, &cin, &cout, &rooms, &rate, &curr, &gt, &att, &st, &pickup, &ca)
		groups = append(groups, map[string]interface{}{
			"id": id, "group_name": name, "organizer": org, "property_id": pid,
			"check_in": cin, "check_out": cout, "rooms_blocked": rooms,
			"rate_per_night": rate, "currency": curr, "group_type": gt,
			"attrition_pct": att, "status": st, "rooms_picked_up": pickup,
		})
	}
	if groups == nil {
		groups = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"groups": groups, "total": len(groups)})
}

func getGroup(c *gin.Context) {
	id := c.Param("id")
	var gname, org, pid, cin, cout, curr, gt, st string
	var rooms, pickup int
	var rate, att float64
	var ca time.Time
	err := db.QueryRowContext(c.Request.Context(),
		`SELECT group_name, organizer, property_id, check_in, check_out, rooms_blocked,
		 rate_per_night, currency, group_type, attrition_pct, status, rooms_picked_up, created_at
		 FROM gds_group_bookings WHERE id=$1 AND tenant_id=$2`, id, defaultTenant).
		Scan(&gname, &org, &pid, &cin, &cout, &rooms, &rate, &curr, &gt, &att, &st, &pickup, &ca)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "group booking not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id": id, "group_name": gname, "organizer": org, "property_id": pid,
		"check_in": cin, "check_out": cout, "rooms_blocked": rooms,
		"rate_per_night": rate, "currency": curr, "group_type": gt,
		"attrition_pct": att, "status": st, "rooms_picked_up": pickup,
	})
}

func confirmGroup(c *gin.Context) {
	id := c.Param("id")
	result, err := db.ExecContext(c.Request.Context(),
		`UPDATE gds_group_bookings SET status='confirmed', updated_at=NOW() WHERE id=$1 AND tenant_id=$2`, id, defaultTenant)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "group not found"})
		return
	}
	publishEvent("group.confirmed", defaultTenant, map[string]interface{}{"id": id})
	c.JSON(http.StatusOK, gin.H{"id": id, "status": "confirmed"})
}

func healthCheck(c *gin.Context) {
	dbStatus := "connected"
	if err := db.Ping(); err != nil {
		dbStatus = "error"
	}
	c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "group-bookings", "database": dbStatus})
}

func main() {
	initDB()
	defer db.Close()
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
		api.POST("/:id/confirm", confirmGroup)
	}
	log.Printf("[Group Bookings] Starting on port %s with PostgreSQL", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start: %v", err)
	}
}
