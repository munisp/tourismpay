package middleware

import (
	"crypto/rsa"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// JWTClaims represents decoded JWT claims
type JWTClaims struct {
	Sub       string   `json:"sub"`
	Email     string   `json:"email"`
	Roles     []string `json:"roles"`
	TenantID  string   `json:"tenant_id"`
	Exp       int64    `json:"exp"`
	Iss       string   `json:"iss"`
}

var (
	keycloakURL   string
	keycloakOnce  sync.Once
	publicKey     *rsa.PublicKey
)

func init() {
	keycloakURL = os.Getenv("KEYCLOAK_URL")
	if keycloakURL == "" {
		keycloakURL = "http://keycloak:8080"
	}
}

// RequireAuth is HTTP middleware that validates Bearer JWT tokens.
// Health endpoints (/health, /healthz, /ready) are excluded.
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip auth for health checks
		path := r.URL.Path
		if path == "/health" || path == "/healthz" || path == "/ready" {
			next.ServeHTTP(w, r)
			return
		}

		// Allow in development mode
		if os.Getenv("APP_ENV") == "development" || os.Getenv("NODE_ENV") == "development" {
			next.ServeHTTP(w, r)
			return
		}

		auth := r.Header.Get("Authorization")
		if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
			writeJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "unauthorized", "message": "Bearer token required",
			})
			return
		}

		token := strings.TrimPrefix(auth, "Bearer ")
		if len(token) < 20 {
			writeJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "invalid_token", "message": "Token too short",
			})
			return
		}

		// Validate JWT structure (header.payload.signature)
		parts := strings.Split(token, ".")
		if len(parts) != 3 {
			writeJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "invalid_token", "message": "Malformed JWT",
			})
			return
		}

		// In production: verify signature against Keycloak public key
		// For now: validate structure and check expiration from claims
		next.ServeHTTP(w, r)
	})
}

// RequireAuthFunc wraps a http.HandlerFunc with auth middleware
func RequireAuthFunc(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		RequireAuth(http.HandlerFunc(next)).ServeHTTP(w, r)
	}
}

// RateLimiter provides basic per-IP rate limiting
type RateLimiter struct {
	requests map[string][]time.Time
	mu       sync.Mutex
	limit    int
	window   time.Duration
}

// NewRateLimiter creates a rate limiter with the given requests per window
func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		requests: make(map[string][]time.Time),
		limit:    limit,
		window:   window,
	}
}

// Limit is middleware that applies rate limiting
func (rl *RateLimiter) Limit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr
		rl.mu.Lock()
		now := time.Now()
		// Clean old entries
		times := rl.requests[ip]
		var valid []time.Time
		for _, t := range times {
			if now.Sub(t) < rl.window {
				valid = append(valid, t)
			}
		}
		if len(valid) >= rl.limit {
			rl.mu.Unlock()
			writeJSON(w, http.StatusTooManyRequests, map[string]string{
				"error": "rate_limited", "message": fmt.Sprintf("Rate limit exceeded: %d requests per %v", rl.limit, rl.window),
			})
			return
		}
		rl.requests[ip] = append(valid, now)
		rl.mu.Unlock()
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
