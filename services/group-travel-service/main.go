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
		CREATE TABLE IF NOT EXISTS group_bookings (
			id VARCHAR(64) PRIMARY KEY, group_name VARCHAR(255) NOT NULL,
			organizer_id VARCHAR(64) NOT NULL, organizer_email VARCHAR(320),
			hotel_id VARCHAR(64) NOT NULL, event_type VARCHAR(50) NOT NULL,
			pax_count INT NOT NULL, rooms_required INT NOT NULL,
			check_in TIMESTAMP NOT NULL, check_out TIMESTAMP NOT NULL, nights INT NOT NULL,
			rate_per_room_per_night DECIMAL(15,2) NOT NULL, total_amount DECIMAL(15,2) NOT NULL,
			deposit_amount DECIMAL(15,2) NOT NULL, deposit_paid DECIMAL(15,2) NOT NULL DEFAULT 0,
			attrition_pct INT NOT NULL DEFAULT 20, currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
			status VARCHAR(20) NOT NULL DEFAULT 'draft', notes TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS group_bookings_organizer_idx ON group_bookings(organizer_id);
		CREATE INDEX IF NOT EXISTS group_bookings_hotel_idx ON group_bookings(hotel_id);
`)
	return err
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if err := s.db.PingContext(r.Context()); err != nil {
		writeJSON(w, 503, map[string]string{"status": "unhealthy", "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]string{"status": "healthy", "service": "group-travel-service", "version": "1.0.0"})
}


func (s *Server) createGroupBooking(w http.ResponseWriter, r *http.Request) {
	var req struct {
		GroupName          string  `json:"group_name"`
		OrganizerID        string  `json:"organizer_id"`
		OrganizerEmail     string  `json:"organizer_email"`
		HotelID            string  `json:"hotel_id"`
		EventType          string  `json:"event_type"`
		PaxCount           int     `json:"pax_count"`
		RoomsRequired      int     `json:"rooms_required"`
		CheckIn            string  `json:"check_in"`
		CheckOut           string  `json:"check_out"`
		Nights             int     `json:"nights"`
		RatePerRoomPerNight float64 `json:"rate_per_room_per_night"`
		Currency           string  `json:"currency"`
		AttritionPct       int     `json:"attrition_pct"`
		Notes              string  `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil { writeError(w, 400, "invalid request body"); return }
	if req.PaxCount < 10 { writeError(w, 400, "minimum 10 pax for group bookings"); return }
	if req.Currency == "" { req.Currency = "NGN" }
	if req.AttritionPct == 0 { req.AttritionPct = 20 }
	totalAmount := float64(req.RoomsRequired) * float64(req.Nights) * req.RatePerRoomPerNight
	depositAmount := totalAmount * 0.25
	bookingID := fmt.Sprintf("GRP-%d", time.Now().UnixNano())
	checkIn, _ := time.Parse("2006-01-02", req.CheckIn)
	checkOut, _ := time.Parse("2006-01-02", req.CheckOut)
	_, err := s.db.ExecContext(r.Context(),
		`INSERT INTO group_bookings (id,group_name,organizer_id,organizer_email,hotel_id,event_type,pax_count,rooms_required,check_in,check_out,nights,rate_per_room_per_night,total_amount,deposit_amount,deposit_paid,attrition_pct,currency,status,notes,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,0,$15,$16,'draft',$17,NOW())`,
		bookingID, req.GroupName, req.OrganizerID, req.OrganizerEmail, req.HotelID, req.EventType,
		req.PaxCount, req.RoomsRequired, checkIn, checkOut, req.Nights, req.RatePerRoomPerNight,
		totalAmount, depositAmount, req.AttritionPct, req.Currency, req.Notes,
	)
	if err != nil { writeError(w, 500, "failed to create group booking"); return }
	writeJSON(w, 201, map[string]interface{}{
		"booking_id": bookingID, "total_amount": totalAmount,
		"deposit_amount": depositAmount, "currency": req.Currency,
		"message": fmt.Sprintf("Group booking %s created. Deposit of %s %.2f required.", bookingID, req.Currency, depositAmount),
	})
}

func (s *Server) getGroupBooking(w http.ResponseWriter, r *http.Request) {
	bookingID := chi.URLParam(r, "bookingID")
	row := s.db.QueryRowContext(r.Context(), `SELECT id,group_name,organizer_id,hotel_id,event_type,pax_count,rooms_required,check_in,check_out,nights,rate_per_room_per_night,total_amount,deposit_amount,deposit_paid,attrition_pct,currency,status,notes,created_at FROM group_bookings WHERE id=$1`, bookingID)
	var b struct {
		ID string `json:"id"`; GroupName string `json:"group_name"`; OrganizerID string `json:"organizer_id"`
		HotelID string `json:"hotel_id"`; EventType string `json:"event_type"`; PaxCount int `json:"pax_count"`
		RoomsRequired int `json:"rooms_required"`; CheckIn time.Time `json:"check_in"`; CheckOut time.Time `json:"check_out"`
		Nights int `json:"nights"`; RatePerRoomPerNight float64 `json:"rate_per_room_per_night"`
		TotalAmount float64 `json:"total_amount"`; DepositAmount float64 `json:"deposit_amount"`
		DepositPaid float64 `json:"deposit_paid"`; AttritionPct int `json:"attrition_pct"`
		Currency string `json:"currency"`; Status string `json:"status"`; Notes string `json:"notes"`; CreatedAt time.Time `json:"created_at"`
	}
	if err := row.Scan(&b.ID, &b.GroupName, &b.OrganizerID, &b.HotelID, &b.EventType, &b.PaxCount, &b.RoomsRequired, &b.CheckIn, &b.CheckOut, &b.Nights, &b.RatePerRoomPerNight, &b.TotalAmount, &b.DepositAmount, &b.DepositPaid, &b.AttritionPct, &b.Currency, &b.Status, &b.Notes, &b.CreatedAt); err == sql.ErrNoRows {
		writeError(w, 404, "booking not found"); return
	}
	writeJSON(w, 200, b)
}

func (s *Server) listGroupBookings(w http.ResponseWriter, r *http.Request) {
	organizerID := r.URL.Query().Get("organizer_id")
	hotelID := r.URL.Query().Get("hotel_id")
	var rows *sql.Rows
	var err error
	if organizerID != "" {
		rows, err = s.db.QueryContext(r.Context(), `SELECT id,group_name,hotel_id,event_type,pax_count,total_amount,currency,status,created_at FROM group_bookings WHERE organizer_id=$1 ORDER BY created_at DESC LIMIT 50`, organizerID)
	} else if hotelID != "" {
		rows, err = s.db.QueryContext(r.Context(), `SELECT id,group_name,hotel_id,event_type,pax_count,total_amount,currency,status,created_at FROM group_bookings WHERE hotel_id=$1 ORDER BY check_in ASC LIMIT 100`, hotelID)
	} else {
		writeError(w, 400, "organizer_id or hotel_id required"); return
	}
	if err != nil { writeError(w, 500, "database error"); return }
	defer rows.Close()
	type Row struct {
		ID string `json:"id"`; GroupName string `json:"group_name"`; HotelID string `json:"hotel_id"`
		EventType string `json:"event_type"`; PaxCount int `json:"pax_count"`
		TotalAmount float64 `json:"total_amount"`; Currency string `json:"currency"`
		Status string `json:"status"`; CreatedAt time.Time `json:"created_at"`
	}
	var results []Row
	for rows.Next() {
		var row Row
		rows.Scan(&row.ID, &row.GroupName, &row.HotelID, &row.EventType, &row.PaxCount, &row.TotalAmount, &row.Currency, &row.Status, &row.CreatedAt)
		results = append(results, row)
	}
	if results == nil { results = []Row{} }
	writeJSON(w, 200, results)
}

func (s *Server) payDeposit(w http.ResponseWriter, r *http.Request) {
	bookingID := chi.URLParam(r, "bookingID")
	var req struct { Amount float64 `json:"amount"`; PaymentRef string `json:"payment_ref"` }
	json.NewDecoder(r.Body).Decode(&req)
	_, err := s.db.ExecContext(r.Context(),
		`UPDATE group_bookings SET deposit_paid=deposit_paid+$1, status=CASE WHEN deposit_paid+$1>=deposit_amount THEN 'confirmed' ELSE status END WHERE id=$2`,
		req.Amount, bookingID)
	if err != nil { writeError(w, 500, "database error"); return }
	writeJSON(w, 200, map[string]interface{}{"success": true, "message": "Deposit payment recorded"})
}

func (s *Server) calculateAttrition(w http.ResponseWriter, r *http.Request) {
	bookingID := chi.URLParam(r, "bookingID")
	actualRoomsStr := r.URL.Query().Get("actual_rooms")
	actualRooms := 0
	fmt.Sscanf(actualRoomsStr, "%d", &actualRooms)
	row := s.db.QueryRowContext(r.Context(), `SELECT rooms_required,attrition_pct,rate_per_room_per_night,nights,currency FROM group_bookings WHERE id=$1`, bookingID)
	var contractedRooms, attritionPct, nights int
	var ratePerRoom float64
	var currency string
	if err := row.Scan(&contractedRooms, &attritionPct, &ratePerRoom, &nights, &currency); err == sql.ErrNoRows {
		writeError(w, 404, "booking not found"); return
	}
	minRooms := int(float64(contractedRooms) * float64(100-attritionPct) / 100)
	shortfall := contractedRooms - actualRooms
	if shortfall < 0 { shortfall = 0 }
	chargePerRoom := ratePerRoom * float64(nights) * 0.5
	attritionCharge := float64(shortfall) * chargePerRoom
	writeJSON(w, 200, map[string]interface{}{
		"contracted_rooms": contractedRooms, "actual_rooms_used": actualRooms,
		"min_rooms": minRooms, "shortfall": shortfall,
		"attrition_charge": attritionCharge, "currency": currency,
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

	r.Post("/group-bookings", srv.createGroupBooking)
	r.Get("/group-bookings", srv.listGroupBookings)
	r.Get("/group-bookings/{bookingID}", srv.getGroupBooking)
	r.Post("/group-bookings/{bookingID}/deposit", srv.payDeposit)
	r.Get("/group-bookings/{bookingID}/attrition", srv.calculateAttrition)


	port := getEnv("PORT", "8093")
	log.Printf("Group Travel & MICE Service starting on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
