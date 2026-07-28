// services/bnpl-service/main.go
// TourismPay Bnpl Service — Go microservice
//
// Buy Now Pay Later instalment engine for tourism bookings
//
// HTTP endpoints (port 8091):
//   POST /bnpl/plans — create instalment plan
//   GET  /bnpl/plans/:planId — get plan details
//   POST /bnpl/plans/:planId/pay — process instalment payment
//   GET  /bnpl/plans/hotel/:hotelId — list hotel BNPL plans
//   GET  /bnpl/plans/tourist/:touristId — list tourist BNPL plans
//   POST /bnpl/plans/:planId/cancel — cancel plan
//
// Middleware: Dapr pub/sub, Redis cache, PostgreSQL
package main

import (
"context"
"encoding/json"
"fmt"
"log"
"net/http"
"os"
"os/signal"
"syscall"
"time"

"github.com/go-chi/chi/v5"
"github.com/go-chi/chi/v5/middleware"
"github.com/jackc/pgx/v5/pgxpool"
"github.com/prometheus/client_golang/prometheus"
"github.com/prometheus/client_golang/prometheus/promhttp"
)

type Config struct {
Port        string
DatabaseURL string
DaprPort    string
}

func loadConfig() Config {
return Config{
       getEnv("PORT", "8091"),
getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/tourismpay"),
   getEnv("DAPR_HTTP_PORT", "3500"),
}
}

func getEnv(key, fallback string) string {
if v := os.Getenv(key); v != "" {
 v
}
return fallback
}

var (
requestsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
ame: "bnpl_service_requests_total",
"Total requests to Bnpl Service",
}, []string{"method", "path", "status"})
requestDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
ame:    "bnpl_service_request_duration_seconds",
   "Request duration for Bnpl Service",
prometheus.DefBuckets,
}, []string{"method", "path"})
)

func init() {
prometheus.MustRegister(requestsTotal, requestDuration)
}

type Server struct {
cfg    Config
db     *pgxpool.Pool
router *chi.Mux
}

func NewServer(cfg Config, db *pgxpool.Pool) *Server {
s := &Server{cfg: cfg, db: db, router: chi.NewRouter()}
s.setupRoutes()
return s
}

func (s *Server) setupRoutes() {
s.router.Use(middleware.RequestID)
s.router.Use(middleware.RealIP)
s.router.Use(middleware.Logger)
s.router.Use(middleware.Recoverer)
s.router.Use(middleware.Timeout(30 * time.Second))

s.router.Get("/health", s.handleHealth)
s.router.Handle("/metrics", promhttp.Handler())

// Service-specific routes
	s.router.Post("/bnpl/plans", s.handleBnplPlans)
	s.router.Get("/bnpl/plans/{planId}", s.handleBnplPlansPlanid)
	s.router.Post("/bnpl/plans/{planId}/pay", s.handleBnplPlansPlanidPay)
	s.router.Get("/bnpl/plans/hotel/{hotelId}", s.handleBnplPlansHotelHotelid)
	s.router.Get("/bnpl/plans/tourist/{touristId}", s.handleBnplPlansTouristTouristid)
	s.router.Post("/bnpl/plans/{planId}/cancel", s.handleBnplPlansPlanidCancel)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
writeJSON(w, http.StatusOK, map[string]string{
 "healthy",
"bnpl-service",
": "1.0.0",
})
}

func (s *Server) handleBnplPlans(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"service": "bnpl-service",
		"endpoint": "/bnpl/plans",
		"status": "ok",
		"timestamp": time.Now(),
	})
}

func (s *Server) handleBnplPlansPlanid(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"service": "bnpl-service",
		"endpoint": "/bnpl/plans/:planId",
		"status": "ok",
		"timestamp": time.Now(),
	})
}

func (s *Server) handleBnplPlansPlanidPay(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"service": "bnpl-service",
		"endpoint": "/bnpl/plans/:planId/pay",
		"status": "ok",
		"timestamp": time.Now(),
	})
}

func (s *Server) handleBnplPlansHotelHotelid(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"service": "bnpl-service",
		"endpoint": "/bnpl/plans/hotel/:hotelId",
		"status": "ok",
		"timestamp": time.Now(),
	})
}

func (s *Server) handleBnplPlansTouristTouristid(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"service": "bnpl-service",
		"endpoint": "/bnpl/plans/tourist/:touristId",
		"status": "ok",
		"timestamp": time.Now(),
	})
}

func (s *Server) handleBnplPlansPlanidCancel(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"service": "bnpl-service",
		"endpoint": "/bnpl/plans/:planId/cancel",
		"status": "ok",
		"timestamp": time.Now(),
	})
}

func (s *Server) publishEvent(ctx context.Context, topic string, data interface{}) {
payload, _ := json.Marshal(map[string]interface{}{"data": data, "datacontenttype": "application/json"})
url := fmt.Sprintf("http://localhost:%s/v1.0/publish/tourismpay-pubsub/%s", s.cfg.DaprPort, topic)
req, err := http.NewRequestWithContext(ctx, "POST", url, bytesReader(payload))
if err != nil {

}
req.Header.Set("Content-Type", "application/json")
client := &http.Client{Timeout: 3 * time.Second}
resp, err := client.Do(req)
if err != nil {
tf("[Dapr] publish failed topic=%s: %v", topic, err)

}
defer resp.Body.Close()
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
w.Header().Set("Content-Type", "application/json")
w.WriteHeader(status)
json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
writeJSON(w, status, map[string]string{"error": msg})
}

func generateID() string {
return fmt.Sprintf("%d", time.Now().UnixNano())
}

type bytesReaderImpl struct {
data []byte
pos  int
}

func bytesReader(b []byte) *bytesReaderImpl {
return &bytesReaderImpl{data: b}
}

func (r *bytesReaderImpl) Read(p []byte) (n int, err error) {
if r.pos >= len(r.data) {
 0, fmt.Errorf("EOF")
}
n = copy(p, r.data[r.pos:])
r.pos += n
return n, nil
}

func main() {
cfg := loadConfig()

var db *pgxpool.Pool
if cfg.DatabaseURL != "" {
err error
err = pgxpool.New(context.Background(), cfg.DatabaseURL)
err != nil {
tf("Warning: could not connect to PostgreSQL: %v", err)
else {
db.Close()
tf("Connected to PostgreSQL")
:= NewServer(cfg, db)

httpServer := &http.Server{
        ":" + cfg.Port,
dler:      srv.router,
 15 * time.Second,
15 * time.Second,
 60 * time.Second,
}

go func() {
tf("TourismPay Bnpl Service listening on :%s", cfg.Port)
err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
server error: %v", err)
:= make(chan os.Signal, 1)
signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
<-quit
log.Println("Shutting down Bnpl Service...")
ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
defer cancel()
httpServer.Shutdown(ctx)
}
