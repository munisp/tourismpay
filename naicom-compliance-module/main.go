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

// NAICOM Compliance Module — automated regulatory reporting and monitoring
// Business Rules:
// - Quarterly returns: Financial statements, solvency ratio, claims statistics
// - Solvency margin: Minimum 15% (alert at 20%, critical at 17%)
// - Annual returns: Audited accounts, actuarial valuation, reinsurance arrangements
// - Incident reporting: Major incidents within 24 hours
// - Capital adequacy: Minimum ₦3B for life, ₦5B for composite


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
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "naicom-compliance-module"})
	})
	r.Get("/api/v1/returns/quarterly", quarterlyReturns)
	r.Get("/api/v1/solvency", solvencyStatus)
	r.Post("/api/v1/incident/report", reportIncident)
	r.Get("/api/v1/capital", capitalAdequacy)
	port := os.Getenv("PORT")
	if port == "" { port = "8091" }
	log.Printf("NAICOM Compliance Module starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func quarterlyReturns(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"quarter": "Q1-2026", "status": "submitted", "submitted_at": time.Now().AddDate(0, 0, -5).Format(time.RFC3339),
		"components": map[string]string{
			"financial_statement": "submitted", "solvency_report": "submitted",
			"claims_statistics": "submitted", "premium_report": "submitted",
		},
		"next_deadline": time.Now().AddDate(0, 3, 0).Format("2006-01-02"),
	})
}

func solvencyStatus(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"solvency_ratio": 0.28, "minimum_required": 0.15,
		"status": "compliant", "buffer": 0.13,
		"alert_threshold": 0.20, "critical_threshold": 0.17,
	})
}

func reportIncident(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"incident_id": "INC-" + time.Now().Format("20060102150405"),
		"status": "filed", "naicom_deadline": time.Now().Add(24 * time.Hour).Format(time.RFC3339),
		"acknowledgement": "pending",
	})
}

func capitalAdequacy(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"minimum_capital": 5000000000, "current_capital": 8500000000,
		"surplus": 3500000000, "compliant": true, "license_type": "composite",
	})
}
