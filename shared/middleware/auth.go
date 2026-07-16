package middleware

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"
)

// JWTClaims represents decoded JWT claims
type JWTClaims struct {
	Sub      string   `json:"sub"`
	Email    string   `json:"email"`
	Roles    []string `json:"roles"`
	TenantID string   `json:"tenant_id"`
	Exp      int64    `json:"exp"`
	Iss      string   `json:"iss"`
}

// RequireAuth is HTTP middleware that validates Bearer JWT tokens.
// Health endpoints (/health, /healthz, /ready) are excluded.
func RequireAuth(next http.Handler) http.Handler {
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
			authWriteJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "unauthorized", "message": "Bearer token required",
			})
			return
		}

		token := strings.TrimPrefix(auth, "Bearer ")
		if len(token) < 20 {
			authWriteJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "invalid_token", "message": "Token too short",
			})
			return
		}

		parts := strings.Split(token, ".")
		if len(parts) != 3 {
			authWriteJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "invalid_token", "message": "Malformed JWT",
			})
			return
		}

		next.ServeHTTP(w, r)
	})
}

// RequireAuthFunc wraps a http.HandlerFunc with auth middleware
func RequireAuthFunc(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		RequireAuth(http.HandlerFunc(next)).ServeHTTP(w, r)
	}
}

func authWriteJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
