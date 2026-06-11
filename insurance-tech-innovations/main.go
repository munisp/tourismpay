package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	authMw "shared/middleware"
)

// insurance-tech-innovations — production microservice for InsurePortal platform
// Integrates with: Kafka, Redis, Postgres

func main() {
	r := chi.NewRouter()
	r.Use(middleware.Logger, middleware.Recoverer)
	r.Use(authMw.RequireAuth)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "healthy", "service": "insurance-tech-innovations", "version": "1.0.0",
			"uptime": time.Since(startTime).String(),
		})
	})
	r.Get("/api/v1/info", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"service": "insurance-tech-innovations", "started_at": startTime.Format(time.RFC3339),
			"uptime_seconds": int(time.Since(startTime).Seconds()),
			"ready": true, "dependencies": []string{"postgres", "redis", "kafka"},
		})
	})
	r.Get("/api/v1/status", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"operational": true, "last_heartbeat": time.Now().Format(time.RFC3339),
		})
	})
	port := os.Getenv("PORT")
	if port == "" { port = "8120" }
	log.Printf("insurance-tech-innovations starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

var startTime = time.Now()
