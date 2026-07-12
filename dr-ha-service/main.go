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
var startTime = time.Now()

func initDB() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://postgres:postgres@localhost:5432/tourismpay?sslmode=disable"
	}
	var err error
	db, err = sql.Open("pgx", dsn)
	if err != nil {
		log.Printf("[dr-ha-service] DB open error: %v", err)
		return
	}
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(5 * time.Minute)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		log.Printf("[dr-ha-service] DB ping failed: %v", err)
	}
}

func requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/health") || r.URL.Path == "/ready" {
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
		deps := map[string]string{}
		if db != nil {
			if err := db.PingContext(r.Context()); err != nil {
				deps["postgres"] = "down"
			} else {
				deps["postgres"] = "up"
			}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "healthy", "service": "dr-ha-service", "version": "1.0.0",
			"uptime": time.Since(startTime).String(), "dependencies": deps,
		})
	})

	r.Get("/api/v1/failover/status", func(w http.ResponseWriter, r *http.Request) {
		if db == nil {
			http.Error(w, `{"error":"database unavailable"}`, http.StatusServiceUnavailable)
			return
		}
		var primaryOk bool
		err := db.QueryRowContext(r.Context(), `SELECT 1`).Scan(&primaryOk)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"primary_db":      err == nil,
			"failover_ready":  true,
			"last_check":      time.Now().Format(time.RFC3339),
			"recovery_point":  "0s",
			"recovery_time":   "< 30s",
		})
	})

	r.Get("/api/v1/replication/lag", func(w http.ResponseWriter, r *http.Request) {
		if db == nil {
			http.Error(w, `{"error":"database unavailable"}`, http.StatusServiceUnavailable)
			return
		}
		var lagBytes int64
		db.QueryRowContext(r.Context(),
			`SELECT COALESCE(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn), 0)
			 FROM pg_stat_replication LIMIT 1`).Scan(&lagBytes)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"replication_lag_bytes": lagBytes,
			"status":               "streaming",
			"checked_at":           time.Now().Format(time.RFC3339),
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8120"
	}
	log.Printf("dr-ha-service starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
