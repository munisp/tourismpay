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
		CREATE TABLE IF NOT EXISTS direct_bookings (
			id VARCHAR(64) PRIMARY KEY, hotel_id VARCHAR(64) NOT NULL, hotel_slug VARCHAR(128),
			guest_name VARCHAR(255) NOT NULL, guest_email VARCHAR(320) NOT NULL,
			guest_phone VARCHAR(30), guest_passport VARCHAR(50), room_type VARCHAR(100),
			check_in TIMESTAMP NOT NULL, check_out TIMESTAMP NOT NULL, nights INT NOT NULL,
			rate_per_night DECIMAL(15,2) NOT NULL, total_amount DECIMAL(15,2) NOT NULL,
			deposit_amount DECIMAL(15,2), currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
			status VARCHAR(20) NOT NULL DEFAULT 'pending', confirmation_code VARCHAR(20),
			special_requests TEXT, source VARCHAR(20) DEFAULT 'direct',
			stripe_payment_intent_id VARCHAR(128), confirmed_at TIMESTAMP,
			created_at TIMESTAMP NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS direct_bookings_hotel_idx ON direct_bookings(hotel_id);
		CREATE INDEX IF NOT EXISTS direct_bookings_email_idx ON direct_bookings(guest_email);
		CREATE INDEX IF NOT EXISTS direct_bookings_code_idx ON direct_bookings(confirmation_code);
`)
	return err
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if err := s.db.PingContext(r.Context()); err != nil {
		writeJSON(w, 503, map[string]string{"status": "unhealthy", "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]string{"status": "healthy", "service": "direct-booking-engine", "version": "1.0.0"})
}


func (s *Server) createBooking(w http.ResponseWriter, r *http.Request) {
	var req struct {
		HotelID         string  `json:"hotel_id"`
		HotelSlug       string  `json:"hotel_slug"`
		GuestName       string  `json:"guest_name"`
		GuestEmail      string  `json:"guest_email"`
		GuestPhone      string  `json:"guest_phone"`
		GuestPassport   string  `json:"guest_passport"`
		RoomType        string  `json:"room_type"`
		CheckIn         string  `json:"check_in"`
		CheckOut        string  `json:"check_out"`
		Nights          int     `json:"nights"`
		RatePerNight    float64 `json:"rate_per_night"`
		TotalAmount     float64 `json:"total_amount"`
		Currency        string  `json:"currency"`
		SpecialRequests string  `json:"special_requests"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, 400, "invalid request body"); return
	}
	if req.GuestName == "" || req.GuestEmail == "" || req.HotelID == "" {
		writeError(w, 400, "guest_name, guest_email, and hotel_id are required"); return
	}
	if req.Currency == "" { req.Currency = "NGN" }
	bookingID := fmt.Sprintf("DB-%d", time.Now().UnixNano())
	confCode := fmt.Sprintf("%X", time.Now().UnixNano())[:8]
	depositAmount := req.TotalAmount * 0.30
	checkIn, _ := time.Parse("2006-01-02", req.CheckIn)
	checkOut, _ := time.Parse("2006-01-02", req.CheckOut)
	_, err := s.db.ExecContext(r.Context(),
		`INSERT INTO direct_bookings (id,hotel_id,hotel_slug,guest_name,guest_email,guest_phone,guest_passport,room_type,check_in,check_out,nights,rate_per_night,total_amount,deposit_amount,currency,status,confirmation_code,special_requests,source,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending',$16,$17,'direct',NOW())`,
		bookingID, req.HotelID, req.HotelSlug, req.GuestName, req.GuestEmail, req.GuestPhone, req.GuestPassport,
		req.RoomType, checkIn, checkOut, req.Nights, req.RatePerNight, req.TotalAmount, depositAmount,
		req.Currency, confCode, req.SpecialRequests,
	)
	if err != nil { writeError(w, 500, "failed to create booking"); return }
	writeJSON(w, 201, map[string]interface{}{
		"booking_id": bookingID, "confirmation_code": confCode,
		"deposit_amount": depositAmount, "currency": req.Currency,
		"message": fmt.Sprintf("Booking %s created. Deposit of %s %.2f required.", confCode, req.Currency, depositAmount),
	})
}

func (s *Server) confirmBooking(w http.ResponseWriter, r *http.Request) {
	bookingID := chi.URLParam(r, "bookingID")
	var req struct { StripePaymentIntentID string `json:"stripe_payment_intent_id"` }
	json.NewDecoder(r.Body).Decode(&req)
	result, err := s.db.ExecContext(r.Context(),
		`UPDATE direct_bookings SET status='confirmed', stripe_payment_intent_id=$1, confirmed_at=NOW() WHERE id=$2 AND status='pending'`,
		req.StripePaymentIntentID, bookingID)
	if err != nil { writeError(w, 500, "database error"); return }
	n, _ := result.RowsAffected()
	if n == 0 { writeError(w, 404, "booking not found or already confirmed"); return }
	writeJSON(w, 200, map[string]interface{}{"success": true, "message": "Booking confirmed"})
}

func (s *Server) getBookingByCode(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	row := s.db.QueryRowContext(r.Context(), `SELECT id,hotel_id,guest_name,guest_email,room_type,check_in,check_out,nights,total_amount,currency,status,confirmation_code,created_at FROM direct_bookings WHERE confirmation_code=$1 LIMIT 1`, code)
	var b struct {
		ID string `json:"id"`; HotelID string `json:"hotel_id"`; GuestName string `json:"guest_name"`
		GuestEmail string `json:"guest_email"`; RoomType string `json:"room_type"`
		CheckIn time.Time `json:"check_in"`; CheckOut time.Time `json:"check_out"`
		Nights int `json:"nights"`; TotalAmount float64 `json:"total_amount"`
		Currency string `json:"currency"`; Status string `json:"status"`
		ConfirmationCode string `json:"confirmation_code"`; CreatedAt time.Time `json:"created_at"`
	}
	if err := row.Scan(&b.ID, &b.HotelID, &b.GuestName, &b.GuestEmail, &b.RoomType, &b.CheckIn, &b.CheckOut, &b.Nights, &b.TotalAmount, &b.Currency, &b.Status, &b.ConfirmationCode, &b.CreatedAt); err == sql.ErrNoRows {
		writeError(w, 404, "booking not found"); return
	}
	writeJSON(w, 200, b)
}

func (s *Server) listHotelBookings(w http.ResponseWriter, r *http.Request) {
	hotelID := chi.URLParam(r, "hotelID")
	status := r.URL.Query().Get("status")
	var rows *sql.Rows
	var err error
	if status != "" {
		rows, err = s.db.QueryContext(r.Context(), `SELECT id,hotel_id,guest_name,guest_email,room_type,check_in,check_out,nights,total_amount,currency,status,confirmation_code,created_at FROM direct_bookings WHERE hotel_id=$1 AND status=$2 ORDER BY check_in ASC LIMIT 100`, hotelID, status)
	} else {
		rows, err = s.db.QueryContext(r.Context(), `SELECT id,hotel_id,guest_name,guest_email,room_type,check_in,check_out,nights,total_amount,currency,status,confirmation_code,created_at FROM direct_bookings WHERE hotel_id=$1 ORDER BY check_in ASC LIMIT 100`, hotelID)
	}
	if err != nil { writeError(w, 500, "database error"); return }
	defer rows.Close()
	type Booking struct {
		ID string `json:"id"`; HotelID string `json:"hotel_id"`; GuestName string `json:"guest_name"`
		GuestEmail string `json:"guest_email"`; RoomType string `json:"room_type"`
		CheckIn time.Time `json:"check_in"`; CheckOut time.Time `json:"check_out"`
		Nights int `json:"nights"`; TotalAmount float64 `json:"total_amount"`
		Currency string `json:"currency"`; Status string `json:"status"`
		ConfirmationCode string `json:"confirmation_code"`; CreatedAt time.Time `json:"created_at"`
	}
	var bookings []Booking
	for rows.Next() {
		var b Booking
		rows.Scan(&b.ID, &b.HotelID, &b.GuestName, &b.GuestEmail, &b.RoomType, &b.CheckIn, &b.CheckOut, &b.Nights, &b.TotalAmount, &b.Currency, &b.Status, &b.ConfirmationCode, &b.CreatedAt)
		bookings = append(bookings, b)
	}
	if bookings == nil { bookings = []Booking{} }
	writeJSON(w, 200, bookings)
}

func (s *Server) cancelBooking(w http.ResponseWriter, r *http.Request) {
	bookingID := chi.URLParam(r, "bookingID")
	result, _ := s.db.ExecContext(r.Context(), `UPDATE direct_bookings SET status='cancelled' WHERE id=$1 AND status IN ('pending','confirmed')`, bookingID)
	n, _ := result.RowsAffected()
	if n == 0 { writeError(w, 404, "booking not found or not cancellable"); return }
	writeJSON(w, 200, map[string]interface{}{"success": true})
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

	r.Post("/bookings", srv.createBooking)
	r.Get("/bookings/confirm/{code}", srv.getBookingByCode)
	r.Post("/bookings/{bookingID}/confirm", srv.confirmBooking)
	r.Post("/bookings/{bookingID}/cancel", srv.cancelBooking)
	r.Get("/hotels/{hotelID}/bookings", srv.listHotelBookings)


	port := getEnv("PORT", "8092")
	log.Printf("Direct Booking Engine starting on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
