package main

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
	"os"
	"time"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"strings"

	"database/sql"
	"context"
	_ "github.com/jackc/pgx/v5/stdlib")

// Microinsurance Engine — affordable insurance products for low-income Nigerians
// Business Rules:
// - Premium range: ₦100 - ₦5,000/month
// - Products: Crop (₦500/season), Health (₦200/month), Life (₦100/month), Device (₦300/month)
// - Distribution: USSD, agent network, mobile money deduction
// - Claims: Simplified process, max 3 documents, settlement within 48h
// - Auto-enrollment: Via mobile money operators (opt-out)
// - Parametric triggers: Weather index for crop, hospitalization for health

type MicroProduct struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Premium     float64 `json:"premium_naira"`
	Coverage    float64 `json:"coverage_naira"`
	Duration    string  `json:"duration"`
	ClaimSLA    string  `json:"claim_sla"`
}

var microProducts = []MicroProduct{
	{ID: "MIC-CROP", Name: "Crop Protection", Premium: 500, Coverage: 50000, Duration: "per_season", ClaimSLA: "48h"},
	{ID: "MIC-HEALTH", Name: "Basic Health", Premium: 200, Coverage: 100000, Duration: "monthly", ClaimSLA: "24h"},
	{ID: "MIC-LIFE", Name: "Term Life", Premium: 100, Coverage: 200000, Duration: "monthly", ClaimSLA: "72h"},
	{ID: "MIC-DEVICE", Name: "Device Protection", Premium: 300, Coverage: 75000, Duration: "monthly", ClaimSLA: "48h"},
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
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "microinsurance-engine"})
	})
	r.Get("/api/v1/products", listProducts)
	r.Post("/api/v1/enroll", enroll)
	r.Post("/api/v1/claim", fileClaim)
	r.Get("/api/v1/stats", getStats)

	port := os.Getenv("PORT")
	if port == "" { port = "8124" }
	log.Printf("Microinsurance Engine starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func listProducts(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{"products": microProducts, "total": len(microProducts)})
}

func enroll(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CustomerID string `json:"customer_id"`
		ProductID  string `json:"product_id"`
		Channel    string `json:"channel"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	w.WriteHeader(201)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"enrollment_id": "ENR-" + time.Now().Format("20060102150405"),
		"product_id": body.ProductID, "status": "active", "channel": body.Channel,
		"next_premium_due": time.Now().AddDate(0, 1, 0).Format("2006-01-02"),
	})
}

func fileClaim(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"claim_id": "MCL-" + time.Now().Format("20060102150405"),
		"status": "approved", "settlement_amount": 50000,
		"expected_payment": time.Now().Add(48 * time.Hour).Format(time.RFC3339),
		"documents_required": 3, "simplified_process": true,
	})
}

func getStats(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"total_enrolled": 125000, "active_policies": 98000, "claims_this_month": 450,
		"avg_premium": 275, "loss_ratio": 0.45, "penetration_rate_pct": 8.5,
	})
}

func init() { _ = math.Pi }
