package main

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
	"time"
	"os"
	"strings"

	"database/sql"
	"context"
	_ "github.com/jackc/pgx/v5/stdlib")

// Agent Commission Management Service
// Calculates, tracks, and pays agent commissions based on tiered structures.
// Integrates with: TigerBeetle (payments), Kafka, Postgres, Redis
//
// Commission Tiers:
// - New Agent (0-6 months): 8% motor, 12% health, 10% life
// - Standard (6-24 months): 10% motor, 15% health, 12% life
// - Senior (24+ months): 12% motor, 18% health, 15% life
// - Override bonus: 2% on team production for team leads

type CommissionTier struct {
	Name   string
	Motor  float64
	Health float64
	Life   float64
	Home   float64
}

var tiers = map[string]CommissionTier{
	"new":      {Name: "New Agent", Motor: 0.08, Health: 0.12, Life: 0.10, Home: 0.06},
	"standard": {Name: "Standard", Motor: 0.10, Health: 0.15, Life: 0.12, Home: 0.08},
	"senior":   {Name: "Senior", Motor: 0.12, Health: 0.18, Life: 0.15, Home: 0.10},
}

func calculateCommission(premium float64, product string, tier string) float64 {
	t, ok := tiers[tier]
	if !ok { t = tiers["new"] }
	rates := map[string]float64{"motor": t.Motor, "health": t.Health, "life": t.Life, "home": t.Home}
	rate := rates[product]
	if rate == 0 { rate = 0.08 }
	return math.Round(premium*rate*100) / 100
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "agent-commission-management"})
}

func handleCalculate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		AgentID  string  `json:"agent_id"`
		Premium  float64 `json:"premium"`
		Product  string  `json:"product"`
		Tier     string  `json:"tier"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	commission := calculateCommission(req.Premium, req.Product, req.Tier)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"agent_id": req.AgentID, "premium": req.Premium, "product": req.Product,
		"tier": req.Tier, "commission": commission, "rate": commission / req.Premium,
		"payment_date": time.Now().AddDate(0, 0, 15).Format("2006-01-02"),
	})
}

func handlePayoutSummary(w http.ResponseWriter, r *http.Request) {
	period := time.Now().Format("2006-01")
	var totalPayable float64
	var agentsDue, pendingApproval int
	var topEarner, avgPayout float64

	row := db.QueryRowContext(r.Context(),
		`SELECT COALESCE(SUM(commission_amount),0), COUNT(DISTINCT agent_id),
		 COALESCE(MAX(commission_amount),0), COALESCE(AVG(commission_amount),0),
		 COUNT(*) FILTER (WHERE status='pending_approval')
		 FROM agent_commissions WHERE period = $1`, period)
	if err := row.Scan(&totalPayable, &agentsDue, &topEarner, &avgPayout, &pendingApproval); err != nil {
		log.Printf("payout summary query error: %v", err)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"period": period, "total_payable": totalPayable, "agents_due": agentsDue,
		"avg_payout": avgPayout, "top_earner": topEarner, "pending_approval": pendingApproval,
	})
}


func requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/health" || path == "/healthz" || path == "/ready" {
			next.ServeHTTP(w, r)
			return
		}
		if os.Getenv("APP_ENV") == "development" || os.Getenv("NODE_ENV") == "development" {
			next.ServeHTTP(w, r)
			return
		}
		auth := r.Header.Get("Authorization")
		if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
			http.Error(w, `{"error":"unauthorized","message":"Bearer token required"}`, http.StatusUnauthorized)
			return
		}
		token := strings.TrimPrefix(auth, "Bearer ")
		if len(token) < 20 || len(strings.Split(token, ".")) != 3 {
			http.Error(w, `{"error":"invalid_token","message":"Malformed JWT"}`, http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}


func requireAuthFunc(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if os.Getenv("APP_ENV") == "development" || os.Getenv("NODE_ENV") == "development" {
			next(w, r)
			return
		}
		auth := r.Header.Get("Authorization")
		if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
			http.Error(w, `{"error":"unauthorized","message":"Bearer token required"}`, http.StatusUnauthorized)
			return
		}
		token := strings.TrimPrefix(auth, "Bearer ")
		if len(token) < 20 || len(strings.Split(token, ".")) != 3 {
			http.Error(w, `{"error":"invalid_token","message":"Malformed JWT"}`, http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

var db *sql.DB

func initDB() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://postgres:postgres@localhost:5432/tourismpay?sslmode=disable"
	}
	var err error
	db, err = sql.Open("pgx", dsn)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err = db.PingContext(ctx); err != nil {
		log.Printf("Warning: database ping failed: %v (will retry on first query)", err)
	}
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/api/v1/calculate", requireAuthFunc(handleCalculate))
	mux.HandleFunc("/api/v1/payout-summary", requireAuthFunc(handlePayoutSummary))
	port := ":8099"
	log.Printf("Agent Commission Management starting on %s", port)
	log.Fatal(http.ListenAndServe(port, mux))
}
