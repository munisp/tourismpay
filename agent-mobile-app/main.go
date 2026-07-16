package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	_ "github.com/jackc/pgx/v5/stdlib"
)

var db *sql.DB

func initDB() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://postgres:postgres@localhost:5432/tourismpay?sslmode=disable"
	}
	var err error
	db, err = sql.Open("pgx", dsn)
	if err != nil {
		log.Printf("[agent-mobile-app] DB open error: %v", err)
		return
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		log.Printf("[agent-mobile-app] DB ping failed: %v", err)
	}
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

func main() {
	initDB()
	r := chi.NewRouter()
	r.Use(middleware.Logger, middleware.Recoverer)
	r.Use(requireAuth)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		status := "healthy"
		if db != nil {
			if err := db.PingContext(r.Context()); err != nil {
				status = "degraded"
			}
		}
		json.NewEncoder(w).Encode(map[string]string{"status": status, "service": "agent-mobile-app"})
	})

	r.Get("/api/v1/agent/{id}/dashboard", func(w http.ResponseWriter, r *http.Request) {
		agentID := chi.URLParam(r, "id")
		if db == nil {
			http.Error(w, `{"error":"database unavailable"}`, http.StatusServiceUnavailable)
			return
		}
		var policiesSold, renewals, claimsFiled int
		var premiumCollected, commissionEarned float64
		db.QueryRowContext(r.Context(),
			`SELECT COUNT(*) FILTER (WHERE type = 'new_business'),
			        COUNT(*) FILTER (WHERE type = 'renewal'),
			        0,
			        COALESCE(SUM(amount),0),
			        COALESCE(SUM(commission_amount),0)
			 FROM transactions WHERE agent_id = $1::int AND created_at > NOW() - INTERVAL '1 day'`, agentID).
			Scan(&policiesSold, &renewals, &claimsFiled, &premiumCollected, &commissionEarned)
		var walletBalance float64
		db.QueryRowContext(r.Context(),
			`SELECT COALESCE(balance,0) FROM float_accounts WHERE agent_id = $1::int LIMIT 1`, agentID).
			Scan(&walletBalance)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"agent_id": agentID,
			"today": map[string]interface{}{
				"policies_sold": policiesSold, "renewals": renewals, "claims_filed": claimsFiled,
				"premium_collected": premiumCollected, "commission_earned": commissionEarned,
			},
			"wallet_balance": walletBalance,
		})
	})

	r.Post("/api/v1/agent/{id}/checkin", func(w http.ResponseWriter, r *http.Request) {
		agentID := chi.URLParam(r, "id")
		var req struct {
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		if db != nil {
			db.ExecContext(r.Context(),
				`INSERT INTO audit_log (action, resource, "resourceId", metadata, "createdAt")
				 VALUES ('agent_checkin', 'agent', $1, $2, NOW())`,
				agentID, `{"lat":`+strings.TrimRight(strings.TrimRight(json.Number(strings.Repeat("0", 0)).String(), "0"), ".")+`}`)
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"agent_id": agentID, "checked_in": true,
			"timestamp": time.Now().Format(time.RFC3339),
		})
	})

	r.Get("/api/v1/agent/{id}/commission", func(w http.ResponseWriter, r *http.Request) {
		agentID := chi.URLParam(r, "id")
		if db == nil {
			http.Error(w, `{"error":"database unavailable"}`, http.StatusServiceUnavailable)
			return
		}
		rows, err := db.QueryContext(r.Context(),
			`SELECT id, amount, type, status FROM commissions WHERE agent_id = $1::int ORDER BY created_at DESC LIMIT 20`, agentID)
		if err != nil {
			http.Error(w, `{"error":"query failed"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		var commissions []map[string]interface{}
		var totalPending, totalCredited float64
		for rows.Next() {
			var id int
			var amount float64
			var cType, status string
			if err := rows.Scan(&id, &amount, &cType, &status); err != nil {
				continue
			}
			commissions = append(commissions, map[string]interface{}{
				"id": id, "amount": amount, "type": cType, "status": status,
			})
			if status == "pending" {
				totalPending += amount
			} else {
				totalCredited += amount
			}
		}
		if commissions == nil {
			commissions = []map[string]interface{}{}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"agent_id": agentID, "commissions": commissions,
			"total_pending": totalPending, "total_credited": totalCredited,
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8134"
	}
	log.Printf("Agent Mobile App starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
