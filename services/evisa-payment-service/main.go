package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
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
		CREATE TABLE IF NOT EXISTS evisa_payments (
			id VARCHAR(64) PRIMARY KEY, tourist_id VARCHAR(64) NOT NULL,
			passport_number VARCHAR(50) NOT NULL, nationality VARCHAR(2) NOT NULL,
			visa_type VARCHAR(20) NOT NULL, duration_days INT NOT NULL,
			fee_amount DECIMAL(10,2) NOT NULL, currency VARCHAR(3) NOT NULL DEFAULT 'USD',
			status VARCHAR(20) NOT NULL DEFAULT 'initiated',
			idempotency_key VARCHAR(128) UNIQUE, wallet_transaction_id VARCHAR(128),
			nis_reference_id VARCHAR(64), processed_at TIMESTAMP,
			created_at TIMESTAMP NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS evisa_tourist_idx ON evisa_payments(tourist_id);
		CREATE INDEX IF NOT EXISTS evisa_idempotency_idx ON evisa_payments(idempotency_key);
`)
	return err
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if err := s.db.PingContext(r.Context()); err != nil {
		writeJSON(w, 503, map[string]string{"status": "unhealthy", "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]string{"status": "healthy", "service": "evisa-payment-service", "version": "1.0.0"})
}


var visaFees = map[string]map[string]float64{
	"tourist":  {"default": 100, "US": 160, "GB": 120, "CA": 120, "AU": 120, "IN": 50, "NG": 0},
	"business": {"default": 150, "US": 200, "GB": 180, "CA": 180, "AU": 180, "IN": 80, "NG": 0},
	"transit":  {"default": 50},
}

func (s *Server) getVisaFee(w http.ResponseWriter, r *http.Request) {
	nationality := r.URL.Query().Get("nationality")
	visaType := r.URL.Query().Get("visa_type")
	if visaType == "" { visaType = "tourist" }
	feeMap, ok := visaFees[visaType]
	if !ok { feeMap = visaFees["tourist"] }
	feeUsd, ok := feeMap[nationality]
	if !ok { feeUsd = feeMap["default"] }
	processingDays := 3
	if visaType == "transit" { processingDays = 1 }
	writeJSON(w, 200, map[string]interface{}{
		"nationality": nationality, "visa_type": visaType,
		"fee_usd": feeUsd, "currency": "USD", "processing_days": processingDays,
	})
}

func (s *Server) initiatePayment(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TouristID       string  `json:"tourist_id"`
		PassportNumber  string  `json:"passport_number"`
		Nationality     string  `json:"nationality"`
		VisaType        string  `json:"visa_type"`
		DurationDays    int     `json:"duration_days"`
		FeeAmount       float64 `json:"fee_amount"`
		Currency        string  `json:"currency"`
		IdempotencyKey  string  `json:"idempotency_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil { writeError(w, 400, "invalid request body"); return }
	if req.Currency == "" { req.Currency = "USD" }
	if req.IdempotencyKey == "" { req.IdempotencyKey = fmt.Sprintf("evisa-%s-%s-%d", req.TouristID, req.PassportNumber, time.Now().UnixNano()) }
	// Check idempotency
	var existingID string
	err := s.db.QueryRowContext(r.Context(), `SELECT id FROM evisa_payments WHERE idempotency_key=$1 LIMIT 1`, req.IdempotencyKey).Scan(&existingID)
	if err == nil { writeJSON(w, 200, map[string]interface{}{"payment_id": existingID, "status": "existing"}); return }
	paymentID := fmt.Sprintf("EVISA-%d", time.Now().UnixNano())
	_, err = s.db.ExecContext(r.Context(),
		`INSERT INTO evisa_payments (id,tourist_id,passport_number,nationality,visa_type,duration_days,fee_amount,currency,status,idempotency_key,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'initiated',$9,NOW())`,
		paymentID, req.TouristID, req.PassportNumber, req.Nationality, req.VisaType, req.DurationDays, req.FeeAmount, req.Currency, req.IdempotencyKey,
	)
	if err != nil { writeError(w, 500, "failed to initiate payment"); return }
	writeJSON(w, 201, map[string]interface{}{
		"payment_id": paymentID, "status": "initiated",
		"message": "e-Visa payment initiated. Complete payment to proceed with application.",
	})
}

func (s *Server) processPayment(w http.ResponseWriter, r *http.Request) {
	paymentID := chi.URLParam(r, "paymentID")
	var req struct { WalletTransactionID string `json:"wallet_transaction_id"` }
	json.NewDecoder(r.Body).Decode(&req)
	nisRef := fmt.Sprintf("NIS-%d", time.Now().UnixNano())
	result, _ := s.db.ExecContext(r.Context(),
		`UPDATE evisa_payments SET status='processing', wallet_transaction_id=$1, nis_reference_id=$2, processed_at=NOW() WHERE id=$3 AND status='initiated'`,
		req.WalletTransactionID, nisRef, paymentID)
	n, _ := result.RowsAffected()
	if n == 0 { writeError(w, 404, "payment not found or not in initiated state"); return }
	writeJSON(w, 200, map[string]interface{}{
		"success": true, "nis_reference_id": nisRef,
		"message": "Payment processed. e-Visa application submitted to Nigeria Immigration Service.",
	})
}

func (s *Server) getPaymentStatus(w http.ResponseWriter, r *http.Request) {
	paymentID := chi.URLParam(r, "paymentID")
	row := s.db.QueryRowContext(r.Context(), `SELECT id,tourist_id,passport_number,nationality,visa_type,duration_days,fee_amount,currency,status,COALESCE(nis_reference_id,''),created_at FROM evisa_payments WHERE id=$1 LIMIT 1`, paymentID)
	var p struct {
		ID string `json:"id"`; TouristID string `json:"tourist_id"`; PassportNumber string `json:"passport_number"`
		Nationality string `json:"nationality"`; VisaType string `json:"visa_type"`; DurationDays int `json:"duration_days"`
		FeeAmount float64 `json:"fee_amount"`; Currency string `json:"currency"`; Status string `json:"status"`
		NISRef string `json:"nis_reference_id"`; CreatedAt time.Time `json:"created_at"`
	}
	if err := row.Scan(&p.ID, &p.TouristID, &p.PassportNumber, &p.Nationality, &p.VisaType, &p.DurationDays, &p.FeeAmount, &p.Currency, &p.Status, &p.NISRef, &p.CreatedAt); err == sql.ErrNoRows {
		writeError(w, 404, "payment not found"); return
	}
	writeJSON(w, 200, p)
}

func (s *Server) myPayments(w http.ResponseWriter, r *http.Request) {
	touristID := r.URL.Query().Get("tourist_id")
	rows, err := s.db.QueryContext(r.Context(), `SELECT id,passport_number,nationality,visa_type,fee_amount,currency,status,COALESCE(nis_reference_id,''),created_at FROM evisa_payments WHERE tourist_id=$1 ORDER BY created_at DESC LIMIT 20`, touristID)
	if err != nil { writeError(w, 500, "database error"); return }
	defer rows.Close()
	type Row struct {
		ID string `json:"id"`; PassportNumber string `json:"passport_number"`; Nationality string `json:"nationality"`
		VisaType string `json:"visa_type"`; FeeAmount float64 `json:"fee_amount"`; Currency string `json:"currency"`
		Status string `json:"status"`; NISRef string `json:"nis_reference_id"`; CreatedAt time.Time `json:"created_at"`
	}
	var results []Row
	for rows.Next() {
		var row Row
		rows.Scan(&row.ID, &row.PassportNumber, &row.Nationality, &row.VisaType, &row.FeeAmount, &row.Currency, &row.Status, &row.NISRef, &row.CreatedAt)
		results = append(results, row)
	}
	if results == nil { results = []Row{} }
	writeJSON(w, 200, results)
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

	r.Get("/visa-fee", srv.getVisaFee)
	r.Post("/payments", srv.initiatePayment)
	r.Post("/payments/{paymentID}/process", srv.processPayment)
	r.Get("/payments/{paymentID}", srv.getPaymentStatus)
	r.Get("/payments", srv.myPayments)


	port := getEnv("PORT", "8094")
	log.Printf("e-Visa Payment Service starting on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
