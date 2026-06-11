package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"strings"
)

// Multi-Language Service — i18n for Nigerian languages + Pan-African markets
// Supported: English, Yoruba, Igbo, Hausa, Pidgin, French (West Africa)
// Business Rules:
// - Default: English, auto-detect from browser/device locale
// - Insurance terms: Professionally translated, NAICOM-approved terminology
// - SMS/USSD: Must support local language for rural agents
// - Fallback: English if translation unavailable

var translations = map[string]map[string]string{
	"en": {"welcome": "Welcome to InsurePortal", "policy": "Insurance Policy", "claim": "File a Claim", "premium": "Premium Payment"},
	"yo": {"welcome": "E kaabo si InsurePortal", "policy": "Iwe Adehun Insora", "claim": "Fi Ejo Sile", "premium": "Owo Isanwo"},
	"ig": {"welcome": "Nnoo na InsurePortal", "policy": "Akwukwo Insora", "claim": "Tinye Ariro", "premium": "Ugwo Insora"},
	"ha": {"welcome": "Barka da zuwa InsurePortal", "policy": "Takaddama Insora", "claim": "Shigar da Kara", "premium": "Biyan Insora"},
	"pcm": {"welcome": "You don reach InsurePortal", "policy": "Insurance Paper", "claim": "Make Claim", "premium": "Pay Premium"},
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

func main() {
	r := chi.NewRouter()
	r.Use(middleware.Logger, middleware.Recoverer)
	r.Use(requireAuth)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "multi-language-service"})
	})
	r.Get("/api/v1/languages", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"languages": []map[string]string{
				{"code": "en", "name": "English", "status": "complete"},
				{"code": "yo", "name": "Yoruba", "status": "complete"},
				{"code": "ig", "name": "Igbo", "status": "complete"},
				{"code": "ha", "name": "Hausa", "status": "complete"},
				{"code": "pcm", "name": "Pidgin", "status": "partial"},
				{"code": "fr", "name": "French", "status": "partial"},
			},
		})
	})
	r.Get("/api/v1/translate/{lang}", func(w http.ResponseWriter, r *http.Request) {
		lang := chi.URLParam(r, "lang")
		t, ok := translations[lang]
		if !ok { t = translations["en"] }
		json.NewEncoder(w).Encode(map[string]interface{}{"language": lang, "translations": t})
	})
	port := os.Getenv("PORT")
	if port == "" { port = "8137" }
	log.Printf("Multi-Language Service starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
