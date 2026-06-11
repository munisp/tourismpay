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

// Agent Mobile App Backend — API for insurance agent field operations
// Business Rules:
// - Agent onboarding: Background check + NAICOM registration required
// - Offline mode: Queue policies/claims, sync when connected
// - Geofencing: Agent can only operate within assigned LGA
// - Commission: Real-time calculation and wallet credit
// - KPI tracking: Policies sold, renewals, claims filed, customer satisfaction


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
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "agent-mobile-app"})
	})
	r.Get("/api/v1/agent/{id}/dashboard", agentDashboard)
	r.Post("/api/v1/agent/{id}/checkin", agentCheckin)
	r.Get("/api/v1/agent/{id}/commission", agentCommission)

	port := os.Getenv("PORT")
	if port == "" { port = "8134" }
	log.Printf("Agent Mobile App starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func agentDashboard(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"agent_id": chi.URLParam(r, "id"), "today": map[string]interface{}{
			"policies_sold": 3, "renewals": 2, "claims_filed": 1,
			"premium_collected": 450000, "commission_earned": 45000,
		},
		"monthly_target": map[string]interface{}{"target": 50, "achieved": 35, "pct": 70},
		"wallet_balance": 125000, "rating": 4.5,
	})
}

func agentCheckin(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"agent_id": chi.URLParam(r, "id"), "checked_in": true,
		"location": "Lagos, Ikeja LGA", "within_geofence": true,
		"timestamp": time.Now().Format(time.RFC3339),
	})
}

func agentCommission(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"agent_id": chi.URLParam(r, "id"),
		"commissions": []map[string]interface{}{
			{"policy_id": "POL-001", "amount": 15000, "type": "new_business", "status": "credited"},
			{"policy_id": "POL-002", "amount": 8000, "type": "renewal", "status": "credited"},
			{"policy_id": "POL-003", "amount": 22000, "type": "new_business", "status": "pending"},
		},
		"total_pending": 22000, "total_credited": 23000,
	})
}
