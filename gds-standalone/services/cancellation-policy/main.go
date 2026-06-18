// Cancellation Policy Service — Cancellation fee calculations and refund policies.
// All data persisted to PostgreSQL.
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"math"
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

func createPolicy(c *gin.Context) {
	var req struct {
		Name          string  `json:"name" binding:"required"`
		PropertyID    string  `json:"propertyId" binding:"required"`
		PolicyType    string  `json:"policyType" binding:"required"`
		DaysBefore    int     `json:"daysBefore"`
		PenaltyPct   float64 `json:"penaltyPct"`
		RefundPct    float64 `json:"refundPct"`
		Currency     string  `json:"currency"`
		GracePeriod  int     `json:"gracePeriodHours"`
		ForceMajeure bool    `json:"forceMajeureExempt"`
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
		`INSERT INTO gds_cancellation_policies (id, tenant_id, name, property_id, policy_type, days_before,
		 penalty_pct, refund_pct, currency, grace_period_hours, force_majeure_exempt, status)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active')
		 RETURNING id, tenant_id, name, property_id, policy_type, days_before, penalty_pct, refund_pct, currency,
		 grace_period_hours, force_majeure_exempt, status, created_at`,
		id, defaultTenant, req.Name, req.PropertyID, req.PolicyType, req.DaysBefore,
		req.PenaltyPct, req.RefundPct, currency, req.GracePeriod, req.ForceMajeure)

	var pid, tid, name, propID, pType, st, curr string
	var days, grace int
	var penalty, refund float64
	var fm bool
	var ca time.Time
	err := row.Scan(&pid, &tid, &name, &propID, &pType, &days, &penalty, &refund, &curr, &grace, &fm, &st, &ca)
	if err != nil {
		log.Printf("[DB] insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create policy"})
		return
	}
	publishEvent("cancellation.policy.created", defaultTenant, map[string]interface{}{"id": pid, "name": name})
	c.JSON(http.StatusCreated, gin.H{
		"id": pid, "name": name, "property_id": propID, "policy_type": pType,
		"days_before": days, "penalty_pct": penalty, "refund_pct": refund,
		"currency": curr, "grace_period_hours": grace, "force_majeure_exempt": fm, "status": st,
	})
}

func listPolicies(c *gin.Context) {
	rows, err := db.QueryContext(c.Request.Context(),
		`SELECT id, name, property_id, policy_type, days_before, penalty_pct, refund_pct, currency, status
		 FROM gds_cancellation_policies WHERE tenant_id=$1 ORDER BY days_before DESC`, defaultTenant)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var policies []map[string]interface{}
	for rows.Next() {
		var id, name, propID, pType, curr, st string
		var days int
		var penalty, refund float64
		rows.Scan(&id, &name, &propID, &pType, &days, &penalty, &refund, &curr, &st)
		policies = append(policies, map[string]interface{}{
			"id": id, "name": name, "property_id": propID, "policy_type": pType,
			"days_before": days, "penalty_pct": penalty, "refund_pct": refund, "currency": curr, "status": st,
		})
	}
	if policies == nil {
		policies = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"policies": policies, "total": len(policies)})
}

func calculateCancellation(c *gin.Context) {
	var req struct {
		BookingAmount  float64 `json:"bookingAmount" binding:"required"`
		Currency       string  `json:"currency"`
		DaysBeforeCI   int     `json:"daysBeforeCheckIn" binding:"required"`
		PolicyType     string  `json:"policyType"`
		ForceMajeure   bool    `json:"forceMajeure"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.ForceMajeure {
		c.JSON(http.StatusOK, gin.H{
			"booking_amount": req.BookingAmount, "fee": 0, "refund": req.BookingAmount,
			"reason": "force_majeure", "penalty_pct": 0,
		})
		return
	}

	policyType := req.PolicyType
	if policyType == "" {
		policyType = "moderate"
	}

	var penaltyPct float64
	switch policyType {
	case "flexible":
		if req.DaysBeforeCI >= 1 {
			penaltyPct = 0
		} else {
			penaltyPct = 100
		}
	case "moderate":
		if req.DaysBeforeCI >= 5 {
			penaltyPct = 0
		} else if req.DaysBeforeCI >= 3 {
			penaltyPct = 25
		} else if req.DaysBeforeCI >= 1 {
			penaltyPct = 50
		} else {
			penaltyPct = 100
		}
	case "strict":
		if req.DaysBeforeCI >= 14 {
			penaltyPct = 0
		} else if req.DaysBeforeCI >= 7 {
			penaltyPct = 50
		} else {
			penaltyPct = 100
		}
	default:
		penaltyPct = 50
	}

	fee := math.Round(req.BookingAmount*penaltyPct) / 100
	refund := req.BookingAmount - fee

	// Persist calculation
	db.ExecContext(c.Request.Context(),
		`INSERT INTO gds_cancellation_records (id, tenant_id, booking_amount, fee, refund_amount, policy_type, days_before, force_majeure)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		uuid.New().String(), defaultTenant, req.BookingAmount, fee, refund, policyType, req.DaysBeforeCI, false)

	publishEvent("cancellation.calculated", defaultTenant, map[string]interface{}{"fee": fee, "refund": refund, "policy": policyType})
	c.JSON(http.StatusOK, gin.H{
		"booking_amount": req.BookingAmount, "fee": fee, "refund": refund,
		"penalty_pct": penaltyPct, "policy_type": policyType, "days_before": req.DaysBeforeCI,
	})
}

func healthCheck(c *gin.Context) {
	dbStatus := "connected"
	if err := db.Ping(); err != nil {
		dbStatus = "error"
	}
	c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "cancellation-policy", "database": dbStatus})
}

func main() {
	initDB()
	defer db.Close()
	port := os.Getenv("PORT")
	if port == "" {
		port = "8112"
	}
	r := gin.Default()
	r.GET("/health", healthCheck)
	api := r.Group("/api/v1/cancellation")
	{
		api.POST("/policies", createPolicy)
		api.GET("/policies", listPolicies)
		api.POST("/calculate", calculateCancellation)
	}
	log.Printf("[Cancellation Policy] Starting on port %s with PostgreSQL", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start: %v", err)
	}
}
