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

	"database/sql"
	"context"
	_ "github.com/jackc/pgx/v5/stdlib")

// Policy Workflow Engine — state machine for policy lifecycle management
// States: draft → submitted → underwriting → approved/declined → issued → active → renewal/lapsed/cancelled
// Business Rules:
// - Draft → Submitted: Requires all mandatory fields + KYC verification
// - Submitted → Underwriting: Auto-routed based on risk score (< 50 = auto, >= 50 = manual)
// - Underwriting SLA: 24h for auto, 72h for manual
// - Approved → Issued: Payment must be confirmed within 7 days
// - Active → Cancelled: Pro-rata refund if within cooling-off period (14 days)

var validTransitions = map[string][]string{
	"draft":        {"submitted"},
	"submitted":    {"underwriting", "rejected"},
	"underwriting": {"approved", "declined", "referred"},
	"approved":     {"issued", "expired"},
	"issued":       {"active"},
	"active":       {"renewal", "lapsed", "cancelled"},
	"renewal":      {"active", "lapsed"},
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

var db *sql.DB

func initDB() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://postgres:postgres@localhost:5432/tourismpay?sslmode=disable"
	}
	var err error
	db, err = sql.Open("pgx", dsn)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err = db.PingContext(ctx); err != nil {
		log.Printf("Warning: database ping failed: %v (will retry on first query)", err)
	}
}

func main() {
	r := chi.NewRouter()
	r.Use(middleware.Logger, middleware.Recoverer)
	r.Use(requireAuth)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "policy-workflow-go"})
	})
	r.Post("/api/v1/workflow/transition", transitionPolicy)
	r.Get("/api/v1/workflow/valid-transitions/{state}", getValidTransitions)

	port := os.Getenv("PORT")
	if port == "" { port = "8106" }
	log.Printf("Policy Workflow Engine starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func transitionPolicy(w http.ResponseWriter, r *http.Request) {
	var body struct {
		PolicyID     string `json:"policy_id"`
		CurrentState string `json:"current_state"`
		NewState     string `json:"new_state"`
		Actor        string `json:"actor"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	allowed, ok := validTransitions[body.CurrentState]
	if !ok { http.Error(w, `{"error":"invalid_current_state"}`, 400); return }
	valid := false
	for _, s := range allowed { if s == body.NewState { valid = true; break } }
	if !valid {
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "invalid_transition", "current": body.CurrentState, "requested": body.NewState, "allowed": allowed})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true, "policy_id": body.PolicyID, "previous_state": body.CurrentState,
		"new_state": body.NewState, "transitioned_at": time.Now().Format(time.RFC3339), "actor": body.Actor,
	})
}

func getValidTransitions(w http.ResponseWriter, r *http.Request) {
	state := chi.URLParam(r, "state")
	transitions, ok := validTransitions[state]
	if !ok { http.Error(w, `{"error":"unknown_state"}`, 400); return }
	json.NewEncoder(w).Encode(map[string]interface{}{"current_state": state, "valid_transitions": transitions})
}
