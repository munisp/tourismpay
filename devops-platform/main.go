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
		log.Printf("[devops-platform] DB open error: %v", err)
		return
	}
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(5 * time.Minute)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		log.Printf("[devops-platform] DB ping failed: %v", err)
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
		json.NewEncoder(w).Encode(map[string]string{"status": status, "service": "devops-platform"})
	})

	r.Get("/api/v1/deployments", func(w http.ResponseWriter, r *http.Request) {
		if db == nil {
			http.Error(w, `{"error":"database unavailable"}`, http.StatusServiceUnavailable)
			return
		}
		rows, err := db.QueryContext(r.Context(),
			`SELECT id, service_name, version, environment, status, deployed_at
			 FROM deployments ORDER BY deployed_at DESC LIMIT 20`)
		if err != nil {
			http.Error(w, `{"error":"query failed"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		var deployments []map[string]interface{}
		for rows.Next() {
			var id int
			var svc, version, env, status string
			var deployedAt time.Time
			if err := rows.Scan(&id, &svc, &version, &env, &status, &deployedAt); err != nil {
				continue
			}
			deployments = append(deployments, map[string]interface{}{
				"id": id, "service": svc, "version": version,
				"environment": env, "status": status,
				"deployed_at": deployedAt.Format(time.RFC3339),
			})
		}
		if deployments == nil {
			deployments = []map[string]interface{}{}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"deployments": deployments})
	})

	r.Post("/api/v1/deploy", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Service     string `json:"service"`
			Version     string `json:"version"`
			Environment string `json:"environment"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
			return
		}
		deploymentID := "DEP-" + time.Now().Format("20060102150405")
		if db != nil {
			db.ExecContext(r.Context(),
				`INSERT INTO deployments (service_name, version, environment, status, deployed_at)
				 VALUES ($1, $2, $3, 'in_progress', NOW())`,
				req.Service, req.Version, req.Environment)
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"deployment_id": deploymentID, "strategy": "blue_green",
			"canary_pct": 10, "auto_rollback": true, "status": "in_progress",
		})
	})

	r.Get("/api/v1/infrastructure", func(w http.ResponseWriter, r *http.Request) {
		if db == nil {
			http.Error(w, `{"error":"database unavailable"}`, http.StatusServiceUnavailable)
			return
		}
		var totalServices, healthyServices int
		db.QueryRowContext(r.Context(),
			`SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'healthy')
			 FROM deployments WHERE environment = 'production'`).
			Scan(&totalServices, &healthyServices)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"total_services":   totalServices,
			"healthy_services": healthyServices,
			"cluster":          "eks-tourismpay-prod",
			"availability_zones": []string{"af-south-1a", "af-south-1b", "af-south-1c"},
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8136"
	}
	log.Printf("DevOps Platform starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
