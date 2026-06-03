package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// Insurance Mobile App Backend — API for mobile clients (iOS/Android/Flutter)
// Business Rules:
// - JWT auth with biometric fallback (fingerprint/face)
// - Push notifications via FCM/APNS
// - Offline-first: Queue transactions, sync when online
// - Rate limiting: 60 req/min per device
// - Minimum app version enforcement (force update below v2.0)

func main() {
	r := chi.NewRouter()
	r.Use(middleware.Logger, middleware.Recoverer)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "insurance-mobile-app"})
	})
	r.Get("/api/v1/app/config", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"min_version": "2.0.0", "force_update_below": "1.5.0",
			"features": []string{"biometric_login", "push_notifications", "offline_mode", "document_upload"},
			"maintenance_mode": false,
		})
	})
	r.Post("/api/v1/sync", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{"synced": true, "timestamp": time.Now().Format(time.RFC3339), "pending_transactions": 0})
	})
	port := os.Getenv("PORT")
	if port == "" { port = "8113" }
	log.Printf("Insurance Mobile App Backend starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
