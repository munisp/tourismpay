package main

import (
"context"
"database/sql"
"encoding/json"
"fmt"
"log"
"math"
"net/http"
"os"
"strconv"
"time"

"github.com/go-chi/chi/v5"
"github.com/go-chi/chi/v5/middleware"
_ "github.com/lib/pq"
)

type BNPLPlan struct {
ID               string    `json:"id"`
TouristID        string    `json:"tourist_id"`
HotelID          string    `json:"hotel_id"`
TotalAmount      float64   `json:"total_amount"`
Currency         string    `json:"currency"`
Instalments      int       `json:"instalments"`
InstalmentAmount float64   `json:"instalment_amount"`
PaidCount        int       `json:"paid_count"`
Status           string    `json:"status"`
RiskPremiumPct   float64   `json:"risk_premium_pct"`
NextDueDate      time.Time `json:"next_due_date"`
CreatedAt        time.Time `json:"created_at"`
}

type BNPLInstalment struct {
ID         string     `json:"id"`
PlanID     string     `json:"plan_id"`
Number     int        `json:"number"`
Amount     float64    `json:"amount"`
Currency   string     `json:"currency"`
DueDate    time.Time  `json:"due_date"`
Status     string     `json:"status"`
PaidAt     *time.Time `json:"paid_at,omitempty"`
PaymentRef string     `json:"payment_ref,omitempty"`
}

type Server struct{ db *sql.DB }

func NewServer() (*Server, error) {
dbURL := getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/tourismpay?sslmode=disable")
db, err := sql.Open("postgres", dbURL)
if err != nil {
 nil, err
}
db.SetMaxOpenConns(25)
db.SetMaxIdleConns(5)
db.SetConnMaxLifetime(5 * time.Minute)
if err := ensureTables(db); err != nil {
tf("WARN: ensure tables: %v", err)
}
return &Server{db: db}, nil
}

func ensureTables(db *sql.DB) error {
_, err := db.Exec(`
TABLE IF NOT EXISTS bnpl_plans (
VARCHAR(64) PRIMARY KEY, tourist_id VARCHAR(64) NOT NULL, hotel_id VARCHAR(64) NOT NULL,
t DECIMAL(15,2) NOT NULL, currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
stalments INT NOT NULL, instalment_amount DECIMAL(15,2) NOT NULL,
t INT NOT NULL DEFAULT 0, status VARCHAR(20) NOT NULL DEFAULT 'active',
DECIMAL(5,2) NOT NULL DEFAULT 2.0, next_due_date TIMESTAMP,
TIMESTAMP NOT NULL DEFAULT NOW()
TABLE IF NOT EXISTS bnpl_instalments (
VARCHAR(64) PRIMARY KEY, plan_id VARCHAR(64) NOT NULL REFERENCES bnpl_plans(id),
umber INT NOT NULL, amount DECIMAL(15,2) NOT NULL, currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
TIMESTAMP NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending',
TIMESTAMP, payment_ref VARCHAR(128), created_at TIMESTAMP NOT NULL DEFAULT NOW()
INDEX IF NOT EXISTS bnpl_plans_tourist_idx ON bnpl_plans(tourist_id);
INDEX IF NOT EXISTS bnpl_instalments_plan_idx ON bnpl_instalments(plan_id);
INDEX IF NOT EXISTS bnpl_instalments_due_idx ON bnpl_instalments(due_date, status);
`)
return err
}

func (s *Server) createPlan(w http.ResponseWriter, r *http.Request) {
var req struct {
  string  `json:"tourist_id"`
    string  `json:"hotel_id"`
t float64 `json:"total_amount"`
cy    string  `json:"currency"`
stalments int     `json:"instalments"`
}
if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
400, "invalid request body")

}
valid := map[int]bool{2: true, 3: true, 4: true, 6: true, 12: true}
if !valid[req.Instalments] {
400, "instalments must be 2, 3, 4, 6, or 12")

}
if req.TotalAmount < 10000 || req.TotalAmount > 50000000 {
400, "amount must be between 10,000 and 50,000,000 NGN")

}
if req.Currency == "" {
cy = "NGN"
}
riskPremium := 2.0
totalWithPremium := req.TotalAmount * (1 + riskPremium/100)
instalmentAmount := math.Round((totalWithPremium/float64(req.Instalments))*100) / 100
planID := fmt.Sprintf("BNPL-%d", time.Now().UnixNano())
now := time.Now()
firstDue := now.AddDate(0, 1, 0)

tx, err := s.db.BeginTx(r.Context(), nil)
if err != nil {
500, "database error")

}
defer tx.Rollback()

if _, err = tx.ExecContext(r.Context(),
SERT INTO bnpl_plans (id,tourist_id,hotel_id,total_amount,currency,instalments,instalment_amount,paid_count,status,risk_premium_pct,next_due_date,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,0,'active',$8,$9,$10)`,
ID, req.TouristID, req.HotelID, req.TotalAmount, req.Currency, req.Instalments, instalmentAmount, riskPremium, firstDue, now,
); err != nil {
500, "failed to create plan")

}
for i := 1; i <= req.Instalments; i++ {
:= now.AddDate(0, i, 0)
stID := fmt.Sprintf("%s-I%02d", planID, i)
_, err = tx.ExecContext(r.Context(),
SERT INTO bnpl_instalments (id,plan_id,number,amount,currency,due_date,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,'pending',NOW())`,
stID, planID, i, instalmentAmount, req.Currency, dueDate,
err != nil {
500, "failed to create instalments")

err := tx.Commit(); err != nil {
500, "transaction failed")

}
writeJSON(w, 201, map[string]interface{}{
_id": planID, "instalment_amount": instalmentAmount,
firstDue, "currency": req.Currency,
fmt.Sprintf("BNPL plan created. %d instalments of %s %.2f each.", req.Instalments, req.Currency, instalmentAmount),
})
}

func (s *Server) getPlan(w http.ResponseWriter, r *http.Request) {
planID := chi.URLParam(r, "planID")
var p BNPLPlan
err := s.db.QueryRowContext(r.Context(),
id,tourist_id,hotel_id,total_amount,currency,instalments,instalment_amount,paid_count,status,risk_premium_pct,COALESCE(next_due_date,NOW()),created_at FROM bnpl_plans WHERE id=$1`, planID,
).Scan(&p.ID, &p.TouristID, &p.HotelID, &p.TotalAmount, &p.Currency, &p.Instalments, &p.InstalmentAmount, &p.PaidCount, &p.Status, &p.RiskPremiumPct, &p.NextDueDate, &p.CreatedAt)
if err == sql.ErrNoRows {
404, "plan not found")

}
if err != nil {
500, "database error")

}
rows, _ := s.db.QueryContext(r.Context(), `SELECT id,plan_id,number,amount,currency,due_date,status,paid_at,COALESCE(payment_ref,'') FROM bnpl_instalments WHERE plan_id=$1 ORDER BY number`, planID)
defer rows.Close()
var insts []BNPLInstalment
for rows.Next() {
i BNPLInstalment
(&i.ID, &i.PlanID, &i.Number, &i.Amount, &i.Currency, &i.DueDate, &i.Status, &i.PaidAt, &i.PaymentRef)
sts = append(insts, i)
}
if insts == nil {
sts = []BNPLInstalment{}
}
writeJSON(w, 200, map[string]interface{}{"plan": p, "instalments": insts})
}

func (s *Server) listPlans(w http.ResponseWriter, r *http.Request) {
touristID := r.URL.Query().Get("tourist_id")
hotelID := r.URL.Query().Get("hotel_id")
var rows *sql.Rows
var err error
if touristID != "" {
err = s.db.QueryContext(r.Context(), `SELECT id,tourist_id,hotel_id,total_amount,currency,instalments,instalment_amount,paid_count,status,risk_premium_pct,COALESCE(next_due_date,NOW()),created_at FROM bnpl_plans WHERE tourist_id=$1 ORDER BY created_at DESC LIMIT 50`, touristID)
} else if hotelID != "" {
err = s.db.QueryContext(r.Context(), `SELECT id,tourist_id,hotel_id,total_amount,currency,instalments,instalment_amount,paid_count,status,risk_premium_pct,COALESCE(next_due_date,NOW()),created_at FROM bnpl_plans WHERE hotel_id=$1 ORDER BY created_at DESC LIMIT 100`, hotelID)
} else {
400, "tourist_id or hotel_id required")

}
if err != nil {
500, "database error")

}
defer rows.Close()
var plans []BNPLPlan
for rows.Next() {
p BNPLPlan
(&p.ID, &p.TouristID, &p.HotelID, &p.TotalAmount, &p.Currency, &p.Instalments, &p.InstalmentAmount, &p.PaidCount, &p.Status, &p.RiskPremiumPct, &p.NextDueDate, &p.CreatedAt)
s = append(plans, p)
}
if plans == nil {
s = []BNPLPlan{}
}
writeJSON(w, 200, plans)
}

func (s *Server) payInstalment(w http.ResponseWriter, r *http.Request) {
planID := chi.URLParam(r, "planID")
var req struct {
stalmentID string `json:"instalment_id"`
mentRef   string `json:"payment_ref"`
}
if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
400, "invalid request body")

}
tx, err := s.db.BeginTx(r.Context(), nil)
if err != nil {
500, "database error")

}
defer tx.Rollback()
now := time.Now()
result, err := tx.ExecContext(r.Context(), `UPDATE bnpl_instalments SET status='paid',paid_at=$1,payment_ref=$2 WHERE id=$3 AND plan_id=$4 AND status IN ('pending','overdue')`, now, req.PaymentRef, req.InstalmentID, planID)
if err != nil {
500, "failed to update instalment")

}
n, _ := result.RowsAffected()
if n == 0 {
404, "instalment not found or already paid")

}
tx.ExecContext(r.Context(), `UPDATE bnpl_plans SET paid_count=paid_count+1, status=CASE WHEN paid_count+1>=instalments THEN 'completed' ELSE 'active' END, next_due_date=(SELECT MIN(due_date) FROM bnpl_instalments WHERE plan_id=$1 AND status IN ('pending','overdue')) WHERE id=$1`, planID)
tx.Commit()
writeJSON(w, 200, map[string]interface{}{"success": true, "message": "Instalment paid successfully"})
}

func (s *Server) cancelPlan(w http.ResponseWriter, r *http.Request) {
planID := chi.URLParam(r, "planID")
touristID := r.URL.Query().Get("tourist_id")
tx, _ := s.db.BeginTx(r.Context(), nil)
defer tx.Rollback()
result, _ := tx.ExecContext(r.Context(), `UPDATE bnpl_plans SET status='cancelled' WHERE id=$1 AND tourist_id=$2 AND status='active'`, planID, touristID)
n, _ := result.RowsAffected()
if n == 0 {
404, "plan not found or not cancellable")

}
tx.ExecContext(r.Context(), `UPDATE bnpl_instalments SET status='cancelled' WHERE plan_id=$1 AND status='pending'`, planID)
tx.Commit()
writeJSON(w, 200, map[string]interface{}{"success": true})
}

func (s *Server) markOverdue(w http.ResponseWriter, r *http.Request) {
result, _ := s.db.ExecContext(r.Context(), `UPDATE bnpl_instalments SET status='overdue' WHERE status='pending' AND due_date<NOW()`)
n, _ := result.RowsAffected()
s.db.ExecContext(r.Context(), `UPDATE bnpl_plans SET status='defaulted' WHERE status='active' AND id IN (SELECT DISTINCT plan_id FROM bnpl_instalments WHERE status='overdue' AND due_date<NOW()-INTERVAL '30 days')`)
writeJSON(w, 200, map[string]interface{}{"marked_overdue": n, "timestamp": time.Now().Unix()})
}

func (s *Server) overdueInstalments(w http.ResponseWriter, r *http.Request) {
limit := 100
if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 500 {
= l
}
rows, err := s.db.QueryContext(r.Context(), `SELECT i.id,i.plan_id,i.number,i.amount,i.currency,i.due_date,i.status,p.tourist_id,p.hotel_id FROM bnpl_instalments i JOIN bnpl_plans p ON p.id=i.plan_id WHERE i.status='overdue' ORDER BY i.due_date ASC LIMIT $1`, limit)
if err != nil {
500, "database error")

}
defer rows.Close()
type Row struct {
       string    `json:"id"`
ID    string    `json:"plan_id"`
umber    int       `json:"number"`
t    float64   `json:"amount"`
cy  string    `json:"currency"`
  time.Time `json:"due_date"`
   string    `json:"status"`
string    `json:"tourist_id"`
  string    `json:"hotel_id"`
}
var results []Row
for rows.Next() {
row Row
(&row.ID, &row.PlanID, &row.Number, &row.Amount, &row.Currency, &row.DueDate, &row.Status, &row.TouristID, &row.HotelID)
= append(results, row)
}
if results == nil {
= []Row{}
}
writeJSON(w, 200, results)
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
if err := s.db.PingContext(r.Context()); err != nil {
(w, 503, map[string]string{"status": "unhealthy", "error": err.Error()})

}
writeJSON(w, 200, map[string]string{"status": "healthy", "service": "bnpl-service", "version": "1.0.0"})
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
w.Header().Set("Content-Type", "application/json")
w.WriteHeader(status)
json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
writeJSON(w, status, map[string]string{"error": msg})
}

func getEnv(key, fallback string) string {
if v := os.Getenv(key); v != "" {
 v
}
return fallback
}

func main() {
srv, err := NewServer()
if err != nil {
to create server: %v", err)
}
defer srv.db.Close()

r := chi.NewRouter()
r.Use(middleware.Logger)
r.Use(middleware.Recoverer)
r.Use(middleware.RequestID)

r.Get("/health", srv.health)
r.Post("/bnpl/plans", srv.createPlan)
r.Get("/bnpl/plans", srv.listPlans)
r.Get("/bnpl/plans/{planID}", srv.getPlan)
r.Post("/bnpl/plans/{planID}/pay", srv.payInstalment)
r.Post("/bnpl/plans/{planID}/cancel", srv.cancelPlan)
r.Post("/admin/mark-overdue", srv.markOverdue)
r.Get("/admin/overdue", srv.overdueInstalments)

port := getEnv("PORT", "8091")
log.Printf("BNPL Service starting on :%s", port)
if err := http.ListenAndServe(":"+port, r); err != nil {
failed: %v", err)
}
}
