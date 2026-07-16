package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"strings"

	"database/sql"
	"context"
	_ "github.com/jackc/pgx/v5/stdlib")

// Customer 360 View — unified customer profile aggregating all touchpoints
// Business Rules:
// - Data sources: KYC, transactions, claims, policies, interactions, social
// - Profile completeness score: 0-100 (minimum 60 for premium services)
// - NDPR compliance: Customer can request full data export (30-day SLA)
// - Segmentation: High-value (>₦5M), Standard, New, Dormant (90 days inactive)
// - Cross-sell scoring: Based on product gaps and life events

type CustomerProfile struct {
	ID               string  `json:"id"`
	Name             string  `json:"name"`
	Segment          string  `json:"segment"`
	CompletenessScore int    `json:"completeness_score"`
	TotalPolicies    int     `json:"total_policies"`
	TotalPremium     float64 `json:"total_premium_naira"`
	ClaimsCount      int     `json:"claims_count"`
	LifetimeValue    float64 `json:"lifetime_value"`
	RiskScore        int     `json:"risk_score"`
	CrossSellScore   int     `json:"cross_sell_score"`
	LastInteraction  string  `json:"last_interaction"`
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
	r := chi.NewRouter()
	r.Use(middleware.Logger, middleware.Recoverer)
	r.Use(requireAuth)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "customer-360-view"})
	})
	r.Get("/api/v1/customers/{id}/360", getCustomer360)
	r.Get("/api/v1/customers/{id}/cross-sell", getCrossSell)
	r.Get("/api/v1/segments", getSegments)

	port := os.Getenv("PORT")
	if port == "" { port = "8103" }
	log.Printf("Customer 360 View starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func getCustomer360(w http.ResponseWriter, r *http.Request) {
	custID := chi.URLParam(r, "id")
	var profile CustomerProfile
	err := db.QueryRowContext(r.Context(),
		`SELECT c.id, c.name, c.segment, c.completeness_score,
		 COUNT(DISTINCT p.id) AS total_policies,
		 COALESCE(SUM(p.premium_amount),0) AS total_premium,
		 COUNT(DISTINCT cl.id) AS claims_count,
		 COALESCE(c.lifetime_value,0), COALESCE(c.risk_score,0),
		 COALESCE(c.cross_sell_score,0),
		 COALESCE(c.last_interaction, NOW())
		 FROM customers c
		 LEFT JOIN policies p ON p.customer_id = c.id
		 LEFT JOIN claims cl ON cl.customer_id = c.id
		 WHERE c.id = $1
		 GROUP BY c.id`, custID).Scan(
		&profile.ID, &profile.Name, &profile.Segment, &profile.CompletenessScore,
		&profile.TotalPolicies, &profile.TotalPremium, &profile.ClaimsCount,
		&profile.LifetimeValue, &profile.RiskScore, &profile.CrossSellScore,
		&profile.LastInteraction)
	if err != nil {
		http.Error(w, `{"error":"customer not found"}`, http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(profile)
}

func getCrossSell(w http.ResponseWriter, r *http.Request) {
	custID := chi.URLParam(r, "id")
	rows, err := db.QueryContext(r.Context(),
		`SELECT product, score, reason FROM cross_sell_recommendations
		 WHERE customer_id = $1 ORDER BY score DESC LIMIT 5`, custID)
	if err != nil {
		http.Error(w, `{"error":"query failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	var recs []map[string]interface{}
	for rows.Next() {
		var product, reason string
		var score int
		if err := rows.Scan(&product, &score, &reason); err == nil {
			recs = append(recs, map[string]interface{}{"product": product, "score": score, "reason": reason})
		}
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"customer_id": custID, "recommendations": recs})
}

func getSegments(w http.ResponseWriter, r *http.Request) {
	rows, err := db.QueryContext(r.Context(),
		`SELECT name, criteria, COUNT(*) AS customer_count
		 FROM customer_segments cs
		 JOIN customers c ON c.segment = cs.name
		 GROUP BY cs.name, cs.criteria ORDER BY customer_count DESC`)
	if err != nil {
		http.Error(w, `{"error":"query failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	var segments []map[string]interface{}
	for rows.Next() {
		var name, criteria string
		var count int
		if err := rows.Scan(&name, &criteria, &count); err == nil {
			segments = append(segments, map[string]interface{}{"name": name, "criteria": criteria, "count": count})
		}
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"segments": segments})
}
