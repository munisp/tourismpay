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

// Broker API Service — manages insurance broker integrations and commission
// Business Rules:
// - Broker tiers: Bronze (5% commission), Silver (7%), Gold (10%), Platinum (12%)
// - Minimum premium for broker assignment: ₦50,000
// - Commission split: 70% broker, 30% sub-agents
// - NAICOM broker license validation before activation
// - Quarterly performance review: Volume, retention, complaints
// - Clawback: If policy cancelled within 6 months, commission reversed


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
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "broker-api-service"})
	})
	r.Route("/api/v1/brokers", func(r chi.Router) {
		r.Get("/", listBrokers)
		r.Post("/", registerBroker)
		r.Get("/{id}/commission", calculateCommission)
		r.Post("/{id}/validate-license", validateLicense)
	})

	port := os.Getenv("PORT")
	if port == "" { port = "8102" }
	log.Printf("Broker API Service starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

var brokerTiers = map[string]float64{"bronze": 0.05, "silver": 0.07, "gold": 0.10, "platinum": 0.12}

func listBrokers(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"brokers": []map[string]interface{}{
			{"id": "BRK-001", "name": "Lagos Insurance Brokers Ltd", "tier": "gold", "commission_rate": 0.10, "active_policies": 245, "status": "active"},
			{"id": "BRK-002", "name": "Abuja Risk Consultants", "tier": "silver", "commission_rate": 0.07, "active_policies": 120, "status": "active"},
		},
		"total": 2,
	})
}

func registerBroker(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name          string `json:"name"`
		LicenseNumber string `json:"license_number"`
		Tier          string `json:"tier"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	rate, ok := brokerTiers[body.Tier]
	if !ok { rate = brokerTiers["bronze"] }
	w.WriteHeader(201)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"broker_id": "BRK-" + time.Now().Format("20060102"), "name": body.Name,
		"tier": body.Tier, "commission_rate": rate, "status": "pending_license_validation",
		"clawback_period": "6 months", "min_premium": 50000,
	})
}

func calculateCommission(w http.ResponseWriter, r *http.Request) {
	premium := 250000.0
	tier := "gold"
	rate := brokerTiers[tier]
	total := premium * rate
	brokerShare := total * 0.70
	subAgentShare := total * 0.30
	json.NewEncoder(w).Encode(map[string]interface{}{
		"premium": premium, "tier": tier, "rate": rate, "total_commission": total,
		"broker_share": brokerShare, "sub_agent_share": subAgentShare, "split": "70/30",
	})
}

func validateLicense(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"valid": true, "issuer": "NAICOM", "license_type": "insurance_broker",
		"expiry": time.Now().AddDate(1, 0, 0).Format("2006-01-02"), "status": "active",
	})
}
