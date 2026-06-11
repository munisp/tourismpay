package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	authMw "shared/middleware"
)

func main() {
	r := chi.NewRouter()
	r.Use(middleware.Logger, middleware.Recoverer)
	r.Use(authMw.RequireAuth)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "erpnext-integration-service", "version": "1.0.0"})
	})
	r.Get("/api/v1/status", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{"service": "erpnext-integration-service", "uptime": time.Since(startTime).String(), "ready": true})
	})
	port := os.Getenv("PORT")
	if port == "" { port = "8110" }
	log.Printf("erpnext-integration-service starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

var startTime = time.Now()
