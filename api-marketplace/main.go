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

// API Marketplace — developer portal for open insurance APIs
// Business Rules:
// - API tiers: Free (100 req/day), Standard (10K req/day), Enterprise (unlimited)
// - Monetization: Per-call billing via TigerBeetle, monthly invoicing
// - Sandbox: Full test environment with synthetic data
// - Rate limiting: Per-tier via APISIX
// - Documentation: OpenAPI 3.0 specs auto-generated
// - Partner onboarding: Self-service with API key generation


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
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "api-marketplace"})
	})
	r.Get("/api/v1/catalog", apiCatalog)
	r.Post("/api/v1/subscribe", subscribe)
	r.Get("/api/v1/usage/{apiKey}", getUsage)
	port := os.Getenv("PORT")
	if port == "" { port = "8098" }
	log.Printf("API Marketplace starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func apiCatalog(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"apis": []map[string]interface{}{
			{"name": "Policy API", "version": "v2", "endpoints": 12, "pricing": "₦5/call", "category": "core"},
			{"name": "Claims API", "version": "v1", "endpoints": 8, "pricing": "₦10/call", "category": "core"},
			{"name": "KYC Verification", "version": "v1", "endpoints": 5, "pricing": "₦25/call", "category": "identity"},
			{"name": "Risk Scoring", "version": "v1", "endpoints": 3, "pricing": "₦15/call", "category": "analytics"},
			{"name": "Agent Network", "version": "v1", "endpoints": 6, "pricing": "₦5/call", "category": "distribution"},
		},
		"total": 5, "sandbox_available": true,
	})
}

func subscribe(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(201)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"api_key": "ik_live_" + time.Now().Format("20060102150405"),
		"tier": "standard", "rate_limit": "10000/day",
		"sandbox_key": "ik_test_sandbox_" + time.Now().Format("150405"),
	})
}

func getUsage(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"api_key": chi.URLParam(r, "apiKey"),
		"period": "current_month", "calls": 4520, "limit": 10000,
		"cost_naira": 22600, "top_endpoint": "/api/v1/policies",
	})
}
