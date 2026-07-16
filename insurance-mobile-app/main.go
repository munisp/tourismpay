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
		log.Printf("[insurance-mobile-app] DB open error: %v", err)
		return
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		log.Printf("[insurance-mobile-app] DB ping failed: %v", err)
	}
}

func requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/health") {
			next.ServeHTTP(w, r)
			return
		}
		if os.Getenv("APP_ENV") == "development" {
			next.ServeHTTP(w, r)
			return
		}
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") || len(auth) < 20 {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
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
		json.NewEncoder(w).Encode(map[string]string{"status": status, "service": "insurance-mobile-app"})
	})

	r.Get("/api/v1/app/config", func(w http.ResponseWriter, r *http.Request) {
		var maintenanceMode bool
		var minVersion string
		if db != nil {
			row := db.QueryRowContext(r.Context(),
				`SELECT COALESCE(
					(SELECT value FROM platform_settings WHERE key = 'mobile_min_version'),
					'2.0.0'
				)`)
			row.Scan(&minVersion)
			row2 := db.QueryRowContext(r.Context(),
				`SELECT COALESCE(
					(SELECT value FROM platform_settings WHERE key = 'maintenance_mode'),
					'false'
				)`)
			var mm string
			row2.Scan(&mm)
			maintenanceMode = mm == "true"
		}
		if minVersion == "" {
			minVersion = "2.0.0"
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"min_version":      minVersion,
			"force_update_below": "1.5.0",
			"features":         []string{"biometric_login", "push_notifications", "offline_mode", "document_upload"},
			"maintenance_mode": maintenanceMode,
		})
	})

	r.Get("/api/v1/policies", func(w http.ResponseWriter, r *http.Request) {
		if db == nil {
			http.Error(w, `{"error":"database unavailable"}`, http.StatusServiceUnavailable)
			return
		}
		rows, err := db.QueryContext(r.Context(),
			`SELECT id, policy_number, customer_id, product_type, status, premium_amount, start_date, end_date
			 FROM policies WHERE status = 'active' ORDER BY created_at DESC LIMIT 50`)
		if err != nil {
			http.Error(w, `{"error":"query failed"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		var policies []map[string]interface{}
		for rows.Next() {
			var id int
			var policyNum, custID, productType, status string
			var premium float64
			var startDate, endDate time.Time
			if err := rows.Scan(&id, &policyNum, &custID, &productType, &status, &premium, &startDate, &endDate); err != nil {
				continue
			}
			policies = append(policies, map[string]interface{}{
				"id": id, "policy_number": policyNum, "customer_id": custID,
				"product_type": productType, "status": status, "premium_amount": premium,
				"start_date": startDate.Format(time.RFC3339), "end_date": endDate.Format(time.RFC3339),
			})
		}
		if policies == nil {
			policies = []map[string]interface{}{}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"policies": policies, "total": len(policies)})
	})

	r.Post("/api/v1/sync", func(w http.ResponseWriter, r *http.Request) {
		if db == nil {
			json.NewEncoder(w).Encode(map[string]interface{}{"synced": false, "error": "database unavailable"})
			return
		}
		var pending int
		db.QueryRowContext(r.Context(),
			`SELECT COUNT(*) FROM offline_sync_queue WHERE status = 'pending'`).Scan(&pending)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"synced":               true,
			"timestamp":            time.Now().Format(time.RFC3339),
			"pending_transactions": pending,
		})
	})

	r.Post("/api/v1/claims", func(w http.ResponseWriter, r *http.Request) {
		if db == nil {
			http.Error(w, `{"error":"database unavailable"}`, http.StatusServiceUnavailable)
			return
		}
		var req struct {
			PolicyID    int    `json:"policy_id"`
			ClaimType   string `json:"claim_type"`
			Description string `json:"description"`
			Amount      float64 `json:"amount"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
			return
		}
		var claimID int
		err := db.QueryRowContext(r.Context(),
			`INSERT INTO claims (policy_id, claim_type, description, amount, status, created_at)
			 VALUES ($1, $2, $3, $4, 'submitted', NOW()) RETURNING id`,
			req.PolicyID, req.ClaimType, req.Description, req.Amount).Scan(&claimID)
		if err != nil {
			http.Error(w, `{"error":"claim submission failed"}`, http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]interface{}{"claim_id": claimID, "status": "submitted"})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8113"
	}
	log.Printf("Insurance Mobile App Backend starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
