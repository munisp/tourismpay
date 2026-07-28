// services/direct-booking-engine/main.go
// TourismPay Direct Booking Engine — Go microservice
//
// White-label hotel direct booking page engine
//
// HTTP endpoints (port 8092):
//   GET  /booking/:hotelSlug — public booking page data
//   GET  /booking/:hotelSlug/availability — check room availability
//   POST /booking/:hotelSlug/reserve — create reservation
//   GET  /booking/confirmation/:bookingId — get booking confirmation
//   POST /booking/:hotelSlug/payment — process direct booking payment
//   GET  /booking/manage/:bookingRef — guest booking management
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
       getEnv("PORT", "8092"),
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
ame: "direct_booking_engine_requests_total",
"Total requests to Direct Booking Engine",
}, []string{"method", "path", "status"})
requestDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
ame:    "direct_booking_engine_request_duration_seconds",
   "Request duration for Direct Booking Engine",
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
	s.router.Get("/booking/{hotelSlug}", s.handleBookingHotelslug)
	s.router.Get("/booking/{hotelSlug}/availability", s.handleBookingHotelslugAvailability)
	s.router.Post("/booking/{hotelSlug}/reserve", s.handleBookingHotelslugReserve)
	s.router.Get("/booking/confirmation/{bookingId}", s.handleBookingConfirmationBookingid)
	s.router.Post("/booking/{hotelSlug}/payment", s.handleBookingHotelslugPayment)
	s.router.Get("/booking/manage/{bookingRef}", s.handleBookingManageBookingref)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
writeJSON(w, http.StatusOK, map[string]string{
 "healthy",
"direct-booking-engine",
": "1.0.0",
})
}

func (s *Server) handleBookingHotelslug(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"service": "direct-booking-engine",
		"endpoint": "/booking/:hotelSlug",
		"status": "ok",
		"timestamp": time.Now(),
	})
}

func (s *Server) handleBookingHotelslugAvailability(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"service": "direct-booking-engine",
		"endpoint": "/booking/:hotelSlug/availability",
		"status": "ok",
		"timestamp": time.Now(),
	})
}

func (s *Server) handleBookingHotelslugReserve(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"service": "direct-booking-engine",
		"endpoint": "/booking/:hotelSlug/reserve",
		"status": "ok",
		"timestamp": time.Now(),
	})
}

func (s *Server) handleBookingConfirmationBookingid(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"service": "direct-booking-engine",
		"endpoint": "/booking/confirmation/:bookingId",
		"status": "ok",
		"timestamp": time.Now(),
	})
}

func (s *Server) handleBookingHotelslugPayment(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"service": "direct-booking-engine",
		"endpoint": "/booking/:hotelSlug/payment",
		"status": "ok",
		"timestamp": time.Now(),
	})
}

func (s *Server) handleBookingManageBookingref(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"service": "direct-booking-engine",
		"endpoint": "/booking/manage/:bookingRef",
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
tf("TourismPay Direct Booking Engine listening on :%s", cfg.Port)
err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
server error: %v", err)
:= make(chan os.Signal, 1)
signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
<-quit
log.Println("Shutting down Direct Booking Engine...")
ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
defer cancel()
httpServer.Shutdown(ctx)
}
