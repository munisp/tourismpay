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
		log.Printf("[native-mobile-ios] DB open error: %v", err)
		return
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		log.Printf("[native-mobile-ios] DB ping failed: %v", err)
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
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": status, "service": "native-mobile-ios", "version": "1.0.0",
			"uptime": time.Since(startTime).String(),
		})
	})

	r.Get("/api/v1/notifications", func(w http.ResponseWriter, r *http.Request) {
		if db == nil {
			http.Error(w, `{"error":"database unavailable"}`, http.StatusServiceUnavailable)
			return
		}
		rows, err := db.QueryContext(r.Context(),
			`SELECT id, title, body, channel, status, created_at
			 FROM notification_log ORDER BY created_at DESC LIMIT 50`)
		if err != nil {
			http.Error(w, `{"error":"query failed"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		var notifications []map[string]interface{}
		for rows.Next() {
			var id int
			var title, body, channel, status string
			var createdAt time.Time
			if err := rows.Scan(&id, &title, &body, &channel, &status, &createdAt); err != nil {
				continue
			}
			notifications = append(notifications, map[string]interface{}{
				"id": id, "title": title, "body": body, "channel": channel,
				"status": status, "created_at": createdAt.Format(time.RFC3339),
			})
		}
		if notifications == nil {
			notifications = []map[string]interface{}{}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"notifications": notifications, "total": len(notifications)})
	})

	r.Get("/api/v1/agent/dashboard", func(w http.ResponseWriter, r *http.Request) {
		if db == nil {
			http.Error(w, `{"error":"database unavailable"}`, http.StatusServiceUnavailable)
			return
		}
		var totalTx int
		var totalVolume float64
		var activeAgents int
		db.QueryRowContext(r.Context(),
			`SELECT COUNT(*), COALESCE(SUM(amount),0) FROM transactions WHERE created_at > NOW() - INTERVAL '24 hours'`).
			Scan(&totalTx, &totalVolume)
		db.QueryRowContext(r.Context(),
			`SELECT COUNT(*) FROM agents WHERE status = 'active'`).Scan(&activeAgents)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"transactions_24h": totalTx,
			"volume_24h":       totalVolume,
			"active_agents":    activeAgents,
			"server_time":      time.Now().Format(time.RFC3339),
		})
	})

	r.Get("/api/v1/info", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"service": "native-mobile-ios", "started_at": startTime.Format(time.RFC3339),
			"uptime_seconds": int(time.Since(startTime).Seconds()),
			"ready": true, "dependencies": []string{"postgres", "redis", "kafka"},
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8120"
	}
	log.Printf("native-mobile-ios starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
