package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"strings"
)

// Etherisc GIF Integration — decentralized insurance protocol connector
// Business Rules:
// - Products: Parametric crop insurance, flight delay, weather index
// - Oracle: External data feeds trigger automatic payouts
// - Pool: Shared capital pool for risk diversification
// - Transparency: All policy data on-chain, verifiable by customers


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
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "etherisc-gif-integration"})
	})
	r.Get("/api/v1/products", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"products": []map[string]interface{}{
				{"name": "Crop Parametric (Corn)", "trigger": "rainfall < 60mm/month", "payout": "automatic", "pool_size": 50000000},
				{"name": "Flight Delay", "trigger": "delay > 120 minutes", "payout": "automatic", "pool_size": 20000000},
			},
		})
	})
	port := os.Getenv("PORT")
	if port == "" { port = "8099" }
	log.Printf("Etherisc GIF Integration starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
