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

// Mobile Money Service — integration with Nigerian mobile money operators
// Operators: OPay, PalmPay, Paga, Moniepoint, Kuda
// Business Rules:
// - Premium collection via mobile money deduction (auto-debit with consent)
// - Claim payout to mobile wallets (instant, max ₦5M per transaction)
// - KYC tier determines transaction limits
// - Mojaloop integration for interoperability
// - Settlement: T+0 for wallet-to-wallet, T+1 for wallet-to-bank


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
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "mobile-money-service"})
	})
	r.Post("/api/v1/collect", collectPremium)
	r.Post("/api/v1/disburse", disburseToClaim)
	r.Get("/api/v1/operators", listOperators)
	r.Get("/api/v1/balance/{walletId}", walletBalance)

	port := os.Getenv("PORT")
	if port == "" { port = "8127" }
	log.Printf("Mobile Money Service starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func collectPremium(w http.ResponseWriter, r *http.Request) {
	var body struct {
		WalletID string  `json:"wallet_id"`
		Amount   float64 `json:"amount"`
		Operator string  `json:"operator"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"transaction_id": "MMT-" + time.Now().Format("20060102150405"),
		"amount": body.Amount, "operator": body.Operator, "status": "successful",
		"settlement": "T+0", "reference": body.WalletID,
	})
}

func disburseToClaim(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"payout_id": "MMP-" + time.Now().Format("20060102150405"),
		"status": "completed", "channel": "mobile_wallet", "settlement": "instant",
	})
}

func listOperators(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"operators": []map[string]interface{}{
			{"name": "OPay", "code": "OPAY", "active": true, "max_transaction": 5000000},
			{"name": "PalmPay", "code": "PALMPAY", "active": true, "max_transaction": 5000000},
			{"name": "Paga", "code": "PAGA", "active": true, "max_transaction": 3000000},
			{"name": "Moniepoint", "code": "MONIE", "active": true, "max_transaction": 5000000},
			{"name": "Kuda", "code": "KUDA", "active": true, "max_transaction": 5000000},
		},
	})
}

func walletBalance(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"wallet_id": chi.URLParam(r, "walletId"), "balance": 450000,
		"currency": "NGN", "last_transaction": time.Now().Add(-2 * time.Hour).Format(time.RFC3339),
	})
}
