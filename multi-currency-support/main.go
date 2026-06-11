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

// multi-currency-support — production microservice
// Integrates with: Kafka, Redis, Postgres, OpenSearch

func main() {
	r := chi.NewRouter()
	r.Use(middleware.Logger, middleware.Recoverer)
	r.Use(authMw.RequireAuth)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "multi-currency-support", "version": "1.0.0"})
	})
	r.Get("/api/v1/info", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"service": "multi-currency-support", "started_at": startTime.Format(time.RFC3339),
			"uptime_seconds": int(time.Since(startTime).Seconds()), "ready": true,
		})
	})
	port := os.Getenv("PORT")
	if port == "" { port = "8115" }
	log.Printf("multi-currency-support starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

var startTime = time.Now()
