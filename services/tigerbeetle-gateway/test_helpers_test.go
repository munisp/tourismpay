package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// setupRouter returns an http.Handler so tests can call ServeHTTP directly.
// Uses mock handlers that don't require a live TigerBeetle connection.
func setupRouter() http.Handler {
	mux := http.NewServeMux()

	// Health endpoint — always returns 200
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, `{"status":"ok","service":"tigerbeetle-gateway","version":"1.0.0"}`)
	})

	// Metrics endpoint — returns Prometheus-style text
	mux.HandleFunc("GET /metrics", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, "# HELP tb_requests_total Total TigerBeetle requests\n# TYPE tb_requests_total counter\ntb_requests_total 0\n")
	})

	// Create accounts — validates required fields
	mux.HandleFunc("POST /accounts", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"error":"invalid_json"}`, http.StatusBadRequest)
			return
		}
		userID, hasUserID := body["userID"].(string)
		currency, hasCurrency := body["currency"].(string)
		if !hasUserID || userID == "" {
			http.Error(w, `{"error":"userID required"}`, http.StatusBadRequest)
			return
		}
		if !hasCurrency || currency == "" {
			http.Error(w, `{"error":"currency required"}`, http.StatusBadRequest)
			return
		}
		validCurrencies := map[string]bool{
			"NGN": true, "USD": true, "GBP": true, "EUR": true,
			"KES": true, "GHS": true, "ZAR": true, "XOF": true,
		}
		if !validCurrencies[currency] {
			http.Error(w, `{"error":"unsupported currency"}`, http.StatusBadRequest)
			return
		}
		id := generateAccountID(userID, currency)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		fmt.Fprintf(w, `{"id":%d,"user_id":%q,"currency":%q,"ledger":1,"code":1}`, id, userID, currency)
	})

	// Get account by ID
	mux.HandleFunc("GET /accounts/{id}", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, `{"id":%s,"credits_posted":0,"debits_posted":0,"credits_pending":0,"debits_pending":0}`, id)
	})

	// Create transfers — validates required fields
	mux.HandleFunc("POST /transfers", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"error":"invalid_json"}`, http.StatusBadRequest)
			return
		}
		if _, ok := body["debitAccountID"]; !ok {
			http.Error(w, `{"error":"debitAccountID required"}`, http.StatusBadRequest)
			return
		}
		amount, ok := body["amount"].(float64)
		if !ok {
			http.Error(w, `{"error":"amount required"}`, http.StatusBadRequest)
			return
		}
		if amount <= 0 {
			http.Error(w, `{"error":"amount must be positive"}`, http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		fmt.Fprintf(w, `{"id":%d,"amount":%d,"status":"posted"}`, generateAccountID("tx", "NGN"), int64(amount))
	})

	// Get transfer by ID
	mux.HandleFunc("GET /transfers/{id}", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, `{"id":%s,"amount":0,"debit_account_id":1,"credit_account_id":2,"status":"posted"}`, id)
	})

	// Batch endpoint
	mux.HandleFunc("POST /batch", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		fmt.Fprintf(w, `{"accounts_created":1,"transfers_created":1}`)
	})

	return mux
}

// generateAccountID produces a deterministic uint64 account ID from userID + currency.
// Uses FNV-1a 64-bit hash — deterministic, no Math.random, safe for concurrent use.
func generateAccountID(userID, currency string) uint64 {
	key := userID + ":" + currency
	const (
		fnvOffset uint64 = 14695981039346656037
		fnvPrime  uint64 = 1099511628211
	)
	h := fnvOffset
	for i := 0; i < len(key); i++ {
		h ^= uint64(key[i])
		h *= fnvPrime
	}
	// Ensure non-zero (TigerBeetle requires non-zero IDs)
	if h == 0 {
		h = 1
	}
	// Use lower 63 bits to avoid overflow issues
	return h & 0x7FFFFFFFFFFFFFFF
}
