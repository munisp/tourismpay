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
)

// native-mobile-ios — production microservice for InsurePortal platform
// Integrates with: Kafka, Redis, Postgres


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
	r := chi.NewRouter()
	r.Use(middleware.Logger, middleware.Recoverer)
	r.Use(requireAuth)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "healthy", "service": "native-mobile-ios", "version": "1.0.0",
			"uptime": time.Since(startTime).String(),
		})
	})
	r.Get("/api/v1/info", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"service": "native-mobile-ios", "started_at": startTime.Format(time.RFC3339),
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
	log.Printf("native-mobile-ios starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

var startTime = time.Now()
