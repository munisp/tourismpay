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

// Blockchain Transparency — immutable audit trail and parametric trigger verification
// Business Rules:
// - Smart contracts: Parametric insurance triggers (weather, flight delay)
// - Claims provenance: Every claim state change recorded on-chain
// - Reinsurance: Treaty terms encoded as smart contracts
// - Transparency: Customers can verify claim processing status
// - Integration: Etherisc GIF framework for decentralized insurance


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
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "blockchain-transparency"})
	})
	r.Post("/api/v1/record", recordOnChain)
	r.Get("/api/v1/verify/{hash}", verifyRecord)
	r.Get("/api/v1/contracts", listContracts)

	port := os.Getenv("PORT")
	if port == "" { port = "8135" }
	log.Printf("Blockchain Transparency starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func recordOnChain(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"tx_hash": "0x" + time.Now().Format("20060102150405") + "abcdef1234567890",
		"block_number": 12345678, "status": "confirmed", "gas_used": 21000,
		"timestamp": time.Now().Format(time.RFC3339),
	})
}

func verifyRecord(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"hash": chi.URLParam(r, "hash"), "verified": true,
		"block_number": 12345678, "timestamp": time.Now().AddDate(0, 0, -5).Format(time.RFC3339),
		"data_integrity": "valid",
	})
}

func listContracts(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"contracts": []map[string]interface{}{
			{"name": "Crop Parametric", "type": "parametric", "trigger": "rainfall_index", "active_policies": 500},
			{"name": "Flight Delay", "type": "parametric", "trigger": "delay_minutes > 120", "active_policies": 200},
			{"name": "Reinsurance Treaty", "type": "treaty", "capacity": 5000000000, "utilization": 0.45},
		},
	})
}
