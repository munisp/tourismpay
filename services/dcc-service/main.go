package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	_ "github.com/lib/pq"
)

type Server struct{ db *sql.DB }

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" { return v }
	return fallback
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func NewServer() (*Server, error) {
	dbURL := getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/tourismpay?sslmode=disable")
	db, err := sql.Open("postgres", dbURL)
	if err != nil { return nil, err }
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	if err := ensureTables(db); err != nil {
		log.Printf("WARN: ensure tables: %v", err)
	}
	return &Server{db: db}, nil
}

func ensureTables(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS dcc_transactions (
			id VARCHAR(64) PRIMARY KEY, merchant_id VARCHAR(64) NOT NULL,
			original_amount_ngn DECIMAL(15,2) NOT NULL, converted_amount DECIMAL(15,2) NOT NULL,
			home_currency VARCHAR(3) NOT NULL, exchange_rate DECIMAL(12,6) NOT NULL,
			spread_pct DECIMAL(5,2) NOT NULL DEFAULT 3.0, spread_revenue_ngn DECIMAL(15,2) NOT NULL,
			decision VARCHAR(10) NOT NULL, wallet_transaction_id VARCHAR(128),
			created_at TIMESTAMP NOT NULL DEFAULT NOW(), decided_at TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS dcc_merchant_idx ON dcc_transactions(merchant_id);
		CREATE INDEX IF NOT EXISTS dcc_created_idx ON dcc_transactions(created_at);
`)
	return err
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if err := s.db.PingContext(r.Context()); err != nil {
		writeJSON(w, 503, map[string]string{"status": "unhealthy", "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]string{"status": "healthy", "service": "dcc-service", "version": "1.0.0"})
}


const spreadPct = 3.0

var fallbackRates = map[string]float64{
	"USD": 0.00065, "GBP": 0.00051, "EUR": 0.00059, "CAD": 0.00088, "AUD": 0.00098,
	"JPY": 0.098, "CHF": 0.00058, "SEK": 0.0067, "NOK": 0.0069, "DKK": 0.0044,
}

func (s *Server) getQuote(w http.ResponseWriter, r *http.Request) {
	amountNgnStr := r.URL.Query().Get("amount_ngn")
	homeCurrency := r.URL.Query().Get("home_currency")
	var amountNgn float64
	fmt.Sscanf(amountNgnStr, "%f", &amountNgn)
	if amountNgn <= 0 { writeError(w, 400, "amount_ngn must be positive"); return }
	if len(homeCurrency) != 3 { writeError(w, 400, "home_currency must be 3-letter ISO code"); return }
	// Try to get live rate from DB
	var rate float64
	row := s.db.QueryRowContext(r.Context(), `SELECT rate FROM exchange_rate_overrides WHERE from_currency='NGN' AND to_currency=$1 AND is_active=true ORDER BY updated_at DESC LIMIT 1`, homeCurrency)
	row.Scan(&rate)
	if rate <= 0 {
		var ok bool
		rate, ok = fallbackRates[homeCurrency]
		if !ok { rate = 0.00065 }
	}
	spreadRate := rate * (1 - spreadPct/100)
	convertedAmount := amountNgn * spreadRate
	spreadRevenueNgn := amountNgn * (spreadPct / 100)
	writeJSON(w, 200, map[string]interface{}{
		"amount_ngn": amountNgn, "home_currency": homeCurrency,
		"converted_amount": math.Round(convertedAmount*100)/100,
		"exchange_rate": spreadRate, "market_rate": rate, "spread_pct": spreadPct,
		"spread_revenue_ngn": math.Round(spreadRevenueNgn*100)/100,
		"quote_expires_in": 60,
	})
}

func (s *Server) recordDecision(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MerchantID          string  `json:"merchant_id"`
		AmountNgn           float64 `json:"amount_ngn"`
		ConvertedAmount     float64 `json:"converted_amount"`
		HomeCurrency        string  `json:"home_currency"`
		ExchangeRate        float64 `json:"exchange_rate"`
		SpreadRevenueNgn    float64 `json:"spread_revenue_ngn"`
		Decision            string  `json:"decision"`
		WalletTransactionID string  `json:"wallet_transaction_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil { writeError(w, 400, "invalid request body"); return }
	if req.Decision != "accepted" && req.Decision != "declined" { writeError(w, 400, "decision must be accepted or declined"); return }
	txID := fmt.Sprintf("DCC-%d", time.Now().UnixNano())
	_, err := s.db.ExecContext(r.Context(),
		`INSERT INTO dcc_transactions (id,merchant_id,original_amount_ngn,converted_amount,home_currency,exchange_rate,spread_pct,spread_revenue_ngn,decision,wallet_transaction_id,created_at,decided_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())`,
		txID, req.MerchantID, req.AmountNgn, req.ConvertedAmount, req.HomeCurrency,
		req.ExchangeRate, spreadPct, req.SpreadRevenueNgn, req.Decision, req.WalletTransactionID,
	)
	if err != nil { writeError(w, 500, "failed to record decision"); return }
	msg := "Tourist chose to pay in NGN"
	if req.Decision == "accepted" { msg = fmt.Sprintf("Tourist charged %s %.2f", req.HomeCurrency, req.ConvertedAmount) }
	writeJSON(w, 201, map[string]interface{}{"transaction_id": txID, "decision": req.Decision, "message": msg})
}

func (s *Server) merchantAnalytics(w http.ResponseWriter, r *http.Request) {
	merchantID := chi.URLParam(r, "merchantID")
	daysStr := r.URL.Query().Get("days")
	days := 30
	fmt.Sscanf(daysStr, "%d", &days)
	rows, err := s.db.QueryContext(r.Context(),
		fmt.Sprintf(`SELECT COUNT(*) as total, SUM(CASE WHEN decision='accepted' THEN 1 ELSE 0 END) as accepted, SUM(CASE WHEN decision='accepted' THEN spread_revenue_ngn ELSE 0 END) as spread_revenue, home_currency, COUNT(*) as currency_count FROM dcc_transactions WHERE merchant_id=$1 AND created_at>NOW()-INTERVAL '%d days' GROUP BY home_currency ORDER BY currency_count DESC`, days),
		merchantID)
	if err != nil { writeError(w, 500, "database error"); return }
	defer rows.Close()
	type CurrencyRow struct { Currency string `json:"currency"`; Count int `json:"count"` }
	var total, accepted int
	var spreadRevenue float64
	var currencies []CurrencyRow
	for rows.Next() {
		var t, a, cc int
		var sr float64
		var currency string
		rows.Scan(&t, &a, &sr, &currency, &cc)
		total += t; accepted += a; spreadRevenue += sr
		currencies = append(currencies, CurrencyRow{currency, cc})
	}
	if currencies == nil { currencies = []CurrencyRow{} }
	acceptanceRate := 0
	if total > 0 { acceptanceRate = int(float64(accepted)/float64(total)*100) }
	writeJSON(w, 200, map[string]interface{}{
		"total_transactions": total, "acceptance_rate": acceptanceRate,
		"total_spread_revenue_ngn": math.Round(spreadRevenue*100)/100, "top_currencies": currencies,
	})
}


func main() {
	srv, err := NewServer()
	if err != nil { log.Fatalf("Failed to create server: %v", err) }
	defer srv.db.Close()

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Get("/health", srv.health)

	r.Get("/dcc/quote", srv.getQuote)
	r.Post("/dcc/decision", srv.recordDecision)
	r.Get("/dcc/analytics/{merchantID}", srv.merchantAnalytics)


	port := getEnv("PORT", "8095")
	log.Printf("DCC at POS Service starting on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
