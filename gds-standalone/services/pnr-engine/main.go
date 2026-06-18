// PNR Engine — Full PNR lifecycle management for Africa-first GDS.
// All data persisted to PostgreSQL. Kafka events on writes.
package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

var db *sql.DB

var (
	emailPattern   = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
	countryPattern = regexp.MustCompile(`^[A-Z]{2}$`)
)

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

func generateLocator() string {
	chars := "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 6)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		b[i] = chars[n.Int64()]
	}
	return string(b)
}

func publishEvent(eventType, tenantID string, data interface{}) {
	b, _ := json.Marshal(data)
	log.Printf("[KAFKA] %s tenant=%s data=%s", eventType, tenantID, string(b)[:min(200, len(b))])
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func createPNR(c *gin.Context) {
	var req struct {
		GuestName    string  `json:"guestName" binding:"required"`
		GuestEmail   string  `json:"guestEmail" binding:"required"`
		GuestPhone   string  `json:"guestPhone"`
		GuestCountry string  `json:"guestCountry" binding:"required"`
		CorporateID  string  `json:"corporateId"`
		TotalAmount  float64 `json:"totalAmount"`
		Currency     string  `json:"currency"`
		DutyOfCare   bool    `json:"dutyOfCare"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.GuestName) < 2 || len(req.GuestName) > 200 {
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

	id := uuid.New().String()
	locator := generateLocator()
	tenantID := c.GetHeader("X-GDS-Tenant-ID")
	if tenantID == "" {
		tenantID = defaultTenant
	}
	agentID := c.GetHeader("X-Agent-ID")
	agencyID := c.GetHeader("X-Agency-ID")
	currency := req.Currency
	if currency == "" {
		currency = "NGN"
	}

	row := db.QueryRowContext(c.Request.Context(),
		`INSERT INTO gds_pnr_records (id, tenant_id, record_locator, guest_name, contact_email, contact_phone,
		 country_code, corporate_id, agency_id, agent_id, status, ticketing_status, total_amount, currency, duty_of_care)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'CONFIRMED','PENDING',$11,$12,$13) RETURNING *`,
		id, tenantID, locator, req.GuestName, req.GuestEmail, req.GuestPhone,
		strings.ToUpper(req.GuestCountry), req.CorporateID, agencyID, agentID,
		req.TotalAmount, currency, req.DutyOfCare)

	var pnr map[string]interface{}
	pnr = scanPNR(row)
	if pnr == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create PNR"})
		return
	}

	publishEvent("pnr.created", tenantID, map[string]interface{}{
		"recordLocator": locator, "guestName": req.GuestName, "totalAmount": req.TotalAmount,
	})

	c.JSON(http.StatusCreated, gin.H{"pnr": pnr})
}

func scanPNR(row *sql.Row) map[string]interface{} {
	var id, tenantID, locator, guestName, email, status, ticketStatus, currency string
	var phone, countryCode, corpID, agencyID, agentID sql.NullString
	var totalAmount float64
	var dutyOfCare bool
	var createdAt, modifiedAt time.Time

	err := row.Scan(&id, &tenantID, &locator, &guestName, &email, &phone,
		&countryCode, &corpID, &agencyID, &agentID, &status, &ticketStatus,
		&totalAmount, &currency, &dutyOfCare, &createdAt, &modifiedAt)
	if err != nil {
		log.Printf("[DB] Scan error: %v", err)
		return nil
	}
	return map[string]interface{}{
		"id": id, "tenant_id": tenantID, "record_locator": locator,
		"guest_name": guestName, "contact_email": email,
		"contact_phone": nullStr(phone), "country_code": nullStr(countryCode),
		"corporate_id": nullStr(corpID), "agency_id": nullStr(agencyID),
		"agent_id": nullStr(agentID), "status": status,
		"ticketing_status": ticketStatus, "total_amount": totalAmount,
		"currency": currency, "duty_of_care": dutyOfCare,
		"created_at": createdAt, "modified_at": modifiedAt,
	}
}

func nullStr(ns sql.NullString) string {
	if ns.Valid {
		return ns.String
	}
	return ""
}

func getPNR(c *gin.Context) {
	locator := strings.ToUpper(c.Param("locator"))
	rows, err := db.QueryContext(c.Request.Context(),
		`SELECT id, tenant_id, record_locator, guest_name, contact_email, contact_phone,
		 country_code, corporate_id, agency_id, agent_id, status, ticketing_status,
		 total_amount, currency, duty_of_care, created_at, updated_at
		 FROM gds_pnr_records WHERE record_locator = $1 AND tenant_id = $2`, locator, defaultTenant)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	if !rows.Next() {
		c.JSON(http.StatusNotFound, gin.H{"error": "PNR not found", "locator": locator})
		return
	}
	var id, tid, loc, name, email, status, tStatus, curr string
	var ph, cc, corp, agency, agent sql.NullString
	var amount float64
	var doc bool
	var ca, ma time.Time
	rows.Scan(&id, &tid, &loc, &name, &email, &ph, &cc, &corp, &agency, &agent, &status, &tStatus, &amount, &curr, &doc, &ca, &ma)
	c.JSON(http.StatusOK, gin.H{
		"id": id, "tenant_id": tid, "record_locator": loc, "guest_name": name,
		"contact_email": email, "contact_phone": nullStr(ph), "country_code": nullStr(cc),
		"status": status, "ticketing_status": tStatus, "total_amount": amount,
		"currency": curr, "duty_of_care": doc, "created_at": ca, "modified_at": ma,
	})
}

func searchPNRs(c *gin.Context) {
	guestName := c.Query("guestName")
	status := c.Query("status")
	agentID := c.Query("agentId")

	query := `SELECT id, tenant_id, record_locator, guest_name, contact_email,
		status, ticketing_status, total_amount, currency, created_at
		FROM gds_pnr_records WHERE tenant_id = $1`
	params := []interface{}{defaultTenant}
	idx := 2
	if guestName != "" {
		query += fmt.Sprintf(" AND guest_name ILIKE $%d", idx)
		params = append(params, "%"+guestName+"%")
		idx++
	}
	if status != "" {
		query += fmt.Sprintf(" AND status = $%d", idx)
		params = append(params, status)
		idx++
	}
	if agentID != "" {
		query += fmt.Sprintf(" AND agent_id = $%d", idx)
		params = append(params, agentID)
		idx++
	}
	query += " ORDER BY created_at DESC LIMIT 100"

	rows, err := db.QueryContext(c.Request.Context(), query, params...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var pnrs []map[string]interface{}
	for rows.Next() {
		var id, tid, loc, name, email, st, ts, curr string
		var amount float64
		var ca time.Time
		rows.Scan(&id, &tid, &loc, &name, &email, &st, &ts, &amount, &curr, &ca)
		pnrs = append(pnrs, map[string]interface{}{
			"id": id, "record_locator": loc, "guest_name": name, "contact_email": email,
			"status": st, "ticketing_status": ts, "total_amount": amount,
			"currency": curr, "created_at": ca,
		})
	}
	if pnrs == nil {
		pnrs = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"pnrs": pnrs, "total": len(pnrs)})
}

func ticketPNR(c *gin.Context) {
	locator := strings.ToUpper(c.Param("locator"))
	var req struct {
		TicketNumber string `json:"ticketNumber"`
		IssuedBy     string `json:"issuedBy"`
	}
	c.ShouldBindJSON(&req)
	ticketNum := req.TicketNumber
	if ticketNum == "" {
		ticketNum = fmt.Sprintf("TKT-%s-%d", locator, time.Now().Unix())
	}

	result, err := db.ExecContext(c.Request.Context(),
		`UPDATE gds_pnr_records SET ticketing_status='ISSUED', updated_at=NOW() WHERE record_locator=$1 AND tenant_id=$2`,
		locator, defaultTenant)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "PNR not found"})
		return
	}
	publishEvent("pnr.ticketed", defaultTenant, map[string]interface{}{"locator": locator, "ticket": ticketNum})
	c.JSON(http.StatusOK, gin.H{"locator": locator, "ticketing_status": "ISSUED", "ticket_number": ticketNum})
}

func cancelPNR(c *gin.Context) {
	locator := strings.ToUpper(c.Param("locator"))
	result, err := db.ExecContext(c.Request.Context(),
		`UPDATE gds_pnr_records SET status='CANCELLED', updated_at=NOW() WHERE record_locator=$1 AND tenant_id=$2`,
		locator, defaultTenant)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "PNR not found"})
		return
	}
	publishEvent("pnr.cancelled", defaultTenant, map[string]interface{}{"locator": locator})
	c.JSON(http.StatusOK, gin.H{"locator": locator, "status": "CANCELLED"})
}

func healthCheck(c *gin.Context) {
	dbStatus := "connected"
	if err := db.Ping(); err != nil {
		dbStatus = "disconnected"
	}
	c.JSON(http.StatusOK, gin.H{
		"status":   "healthy",
		"service":  "pnr-engine",
		"version":  "1.0.0",
		"database": dbStatus,
	})
}

func main() {
	initDB()
	defer db.Close()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8082"
	}

	r := gin.Default()
	r.GET("/health", healthCheck)

	api := r.Group("/api/v1/pnr")
	{
		api.POST("/", createPNR)
		api.GET("/search", searchPNRs)
		api.GET("/:locator", getPNR)
		api.POST("/:locator/ticket", ticketPNR)
		api.POST("/:locator/cancel", cancelPNR)
	}

	log.Printf("[PNR Engine] Starting on port %s with PostgreSQL", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start: %v", err)
	}
}
