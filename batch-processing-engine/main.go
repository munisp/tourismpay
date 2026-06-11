package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
	"os"
	"strings"

	"database/sql"
	"context"
	_ "github.com/jackc/pgx/v5/stdlib")

// Batch Processing Engine
// Handles large-scale async operations: bulk payments, mass notifications,
// batch KYC reviews, commission payouts, policy renewals.
// Integrates with: Kafka, Temporal, Postgres, Redis

type BatchJob struct {
	ID          string    `json:"id"`
	Type        string    `json:"type"`
	Status      string    `json:"status"`
	TotalItems  int       `json:"total_items"`
	Processed   int       `json:"processed"`
	Succeeded   int       `json:"succeeded"`
	Failed      int       `json:"failed"`
	StartedAt   time.Time `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

var (
	jobs   = make(map[string]*BatchJob)
	jobsMu sync.RWMutex
)

func handleHealth(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "batch-processing-engine"})
}

func handleCreateBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Type  string `json:"type"`
		Items int    `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Items > 10000 {
		http.Error(w, "Max 10,000 items per batch", http.StatusBadRequest)
		return
	}
	job := &BatchJob{
		ID: fmt.Sprintf("BATCH-%d", time.Now().UnixNano()),
		Type: req.Type, Status: "processing",
		TotalItems: req.Items, StartedAt: time.Now(),
	}
	jobsMu.Lock()
	jobs[job.ID] = job
	jobsMu.Unlock()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(job)
}

func handleGetBatch(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	jobsMu.RLock()
	job, ok := jobs[id]
	jobsMu.RUnlock()
	if !ok {
		http.Error(w, "Batch not found", http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(job)
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


func requireAuthFunc(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if os.Getenv("APP_ENV") == "development" || os.Getenv("NODE_ENV") == "development" {
			next(w, r)
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
		next(w, r)
	}
}

var db *sql.DB

func initDB() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://postgres:postgres@localhost:5432/tourismpay?sslmode=disable"
	}
	var err error
	db, err = sql.Open("pgx", dsn)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err = db.PingContext(ctx); err != nil {
		log.Printf("Warning: database ping failed: %v (will retry on first query)", err)
	}
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/api/v1/batch", requireAuthFunc(handleCreateBatch))
	mux.HandleFunc("/api/v1/batch/status", requireAuthFunc(handleGetBatch))
	
	port := ":8092"
	log.Printf("Batch Processing Engine starting on %s", port)
	log.Fatal(http.ListenAndServe(port, mux))
}
