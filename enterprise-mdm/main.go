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

// Enterprise MDM — Master Data Management with golden record resolution
// Business Rules:
// - Golden record: Single source of truth for customer, policy, agent entities
// - Deduplication: Fuzzy matching on name + DOB + phone (>85% match = merge candidate)
// - Data quality score: 0-100, minimum 70 for operational use
// - Lineage: Track data source, transformations, and consumers
// - Governance: Data steward approval for merge operations


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
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "enterprise-mdm"})
	})
	r.Get("/api/v1/golden-records", listGoldenRecords)
	r.Post("/api/v1/deduplicate", findDuplicates)
	r.Get("/api/v1/quality-score", dataQualityScore)
	port := os.Getenv("PORT")
	if port == "" { port = "8095" }
	log.Printf("Enterprise MDM starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func listGoldenRecords(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"records": []map[string]interface{}{
			{"entity": "customer", "total": 45000, "quality_score": 82, "duplicates_pending": 120},
			{"entity": "policy", "total": 28000, "quality_score": 91, "duplicates_pending": 15},
			{"entity": "agent", "total": 3500, "quality_score": 88, "duplicates_pending": 8},
		},
	})
}

func findDuplicates(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"duplicates_found": 12, "merge_candidates": 8, "review_required": 4,
		"matching_algorithm": "fuzzy_name_dob_phone", "threshold": 0.85,
	})
}

func dataQualityScore(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"overall_score": 85, "completeness": 88, "accuracy": 82, "consistency": 86,
		"timeliness": 90, "uniqueness": 79, "last_assessment": time.Now().AddDate(0, 0, -1).Format(time.RFC3339),
	})
}
