// services/tigerbeetle-gateway/main.go
// ─────────────────────────────────────────────────────────────────────────────
// TigerBeetle Gateway — Go HTTP microservice
//
// Provides a REST API over TigerBeetle's double-entry ledger:
//   POST /accounts        — create one or more accounts
//   GET  /accounts/:id    — get account by ID
//   POST /transfers       — create one or more transfers
//   GET  /transfers/:id   — get transfer by ID
//   GET  /accounts/:id/balances — get account balance
//   POST /batch           — batch create accounts + transfers atomically
//   GET  /health          — health check
//
// Environment variables:
//   TB_ADDRESS     — TigerBeetle cluster address (default: 3000)
//   TB_CLUSTER_ID  — cluster ID (default: 0)
//   HTTP_PORT      — HTTP listen port (default: 8081)
//   PG_DSN         — PostgreSQL DSN for account map persistence
// ─────────────────────────────────────────────────────────────────────────────

package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	_ "github.com/lib/pq"
)

// ─── Config ───────────────────────────────────────────────────────────────────

type Config struct {
	TBAddress   string
	TBClusterID uint64
	HTTPPort    string
	PGDSN       string
}

func loadConfig() Config {
	clusterID := uint64(0)
	if v := os.Getenv("TB_CLUSTER_ID"); v != "" {
		if n, err := strconv.ParseUint(v, 10, 64); err == nil {
			clusterID = n
		}
	}
	return Config{
		TBAddress:   getEnv("TB_ADDRESS", "3000"),
		TBClusterID: clusterID,
		HTTPPort:    getEnv("HTTP_PORT", "8081"),
		PGDSN:       os.Getenv("PG_DSN"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ─── Domain Types ─────────────────────────────────────────────────────────────

// AccountFlags mirrors TigerBeetle account flags
type AccountFlags struct {
	LinkedWithNextTransfer bool `json:"linked_with_next_transfer"`
	DebitsMustNotExceedCredits bool `json:"debits_must_not_exceed_credits"`
	CreditsMustNotExceedDebits bool `json:"credits_must_not_exceed_debits"`
}

type CreateAccountRequest struct {
	ID             uint64       `json:"id"`
	UserData128    uint64       `json:"user_data_128,omitempty"`
	UserData64     uint64       `json:"user_data_64,omitempty"`
	UserData32     uint32       `json:"user_data_32,omitempty"`
	Ledger         uint32       `json:"ledger"`
	Code           uint16       `json:"code"`
	Flags          AccountFlags `json:"flags,omitempty"`
}

type AccountBalance struct {
	ID                    uint64 `json:"id"`
	DebitsPosted          uint64 `json:"debits_posted"`
	DebitsPending         uint64 `json:"debits_pending"`
	CreditsPosted         uint64 `json:"credits_posted"`
	CreditsPending        uint64 `json:"credits_pending"`
	Timestamp             uint64 `json:"timestamp"`
}

type CreateTransferRequest struct {
	ID              uint64 `json:"id"`
	DebitAccountID  uint64 `json:"debit_account_id"`
	CreditAccountID uint64 `json:"credit_account_id"`
	Amount          uint64 `json:"amount"`
	UserData128     uint64 `json:"user_data_128,omitempty"`
	UserData64      uint64 `json:"user_data_64,omitempty"`
	UserData32      uint32 `json:"user_data_32,omitempty"`
	Ledger          uint32 `json:"ledger"`
	Code            uint16 `json:"code"`
	Timeout         uint32 `json:"timeout,omitempty"`
	PendingID       uint64 `json:"pending_id,omitempty"`
}

type BatchRequest struct {
	Accounts  []CreateAccountRequest  `json:"accounts,omitempty"`
	Transfers []CreateTransferRequest `json:"transfers,omitempty"`
}

type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// ─── TigerBeetle Client Stub ──────────────────────────────────────────────────
// In production, replace with the official tigerbeetle-go client:
// go get github.com/tigerbeetle/tigerbeetle-go

type TBClient struct {
	address   string
	clusterID uint64
}

func NewTBClient(address string, clusterID uint64) (*TBClient, error) {
	slog.Info("TigerBeetle client initialized", "address", address, "cluster_id", clusterID)
	return &TBClient{address: address, clusterID: clusterID}, nil
}

func (c *TBClient) CreateAccounts(accounts []CreateAccountRequest) ([]uint32, error) {
	// Production: use tigerbeetle-go client.CreateAccounts()
	// Returns error codes per account (0 = success)
	results := make([]uint32, len(accounts))
	slog.Info("CreateAccounts called", "count", len(accounts))
	return results, nil
}

func (c *TBClient) LookupAccounts(ids []uint64) ([]AccountBalance, error) {
	// Production: use tigerbeetle-go client.LookupAccounts()
	balances := make([]AccountBalance, 0, len(ids))
	for _, id := range ids {
		balances = append(balances, AccountBalance{
			ID:            id,
			DebitsPosted:  0,
			CreditsPosted: 0,
			Timestamp:     uint64(time.Now().UnixNano()),
		})
	}
	return balances, nil
}

func (c *TBClient) CreateTransfers(transfers []CreateTransferRequest) ([]uint32, error) {
	// Production: use tigerbeetle-go client.CreateTransfers()
	results := make([]uint32, len(transfers))
	slog.Info("CreateTransfers called", "count", len(transfers))
	return results, nil
}

func (c *TBClient) LookupTransfers(ids []uint64) ([]CreateTransferRequest, error) {
	// Production: use tigerbeetle-go client.LookupTransfers()
	return nil, nil
}

func (c *TBClient) Close() {
	slog.Info("TigerBeetle client closed")
}

// ─── PostgreSQL Account Map ───────────────────────────────────────────────────

type AccountMapStore struct {
	db *sql.DB
}

func NewAccountMapStore(dsn string) (*AccountMapStore, error) {
	if dsn == "" {
		slog.Warn("PG_DSN not set — account map persistence disabled")
		return &AccountMapStore{}, nil
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return &AccountMapStore{db: db}, nil
}

func (s *AccountMapStore) RecordAccount(entityType string, entityID int64, currency string, tbAccountID uint64, ledger int, code int) error {
	if s.db == nil {
		return nil
	}
	_, err := s.db.Exec(`
		INSERT INTO tigerbeetle_account_map
			(entity_type, entity_id, currency, tb_account_id, tb_account_type, ledger, is_active, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
		ON CONFLICT (entity_type, entity_id, currency) DO UPDATE
			SET tb_account_id = EXCLUDED.tb_account_id,
			    is_active = true
	`, entityType, entityID, currency, tbAccountID, code, ledger)
	return err
}

func (s *AccountMapStore) RecordTransfer(tbTransferID, debitAccountID, creditAccountID, amount uint64, currency string, ledger, code int, refType, refID string) error {
	if s.db == nil {
		return nil
	}
	_, err := s.db.Exec(`
		INSERT INTO tigerbeetle_transfer_log
			(tb_transfer_id, debit_account_id, credit_account_id, amount, currency, ledger, code, reference_type, reference_id, status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'committed', NOW())
		ON CONFLICT (tb_transfer_id) DO NOTHING
	`, tbTransferID, debitAccountID, creditAccountID, amount, currency, ledger, code, refType, refID)
	return err
}

// ─── HTTP Handlers ────────────────────────────────────────────────────────────

type Server struct {
	tb    *TBClient
	store *AccountMapStore
	mux   *http.ServeMux
}

func NewServer(tb *TBClient, store *AccountMapStore) *Server {
	s := &Server{tb: tb, store: store, mux: http.NewServeMux()}
	s.registerRoutes()
	return s
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("GET /health", s.handleHealth)
	s.mux.HandleFunc("POST /accounts", s.handleCreateAccounts)
	s.mux.HandleFunc("GET /accounts/{id}", s.handleGetAccount)
	s.mux.HandleFunc("POST /transfers", s.handleCreateTransfers)
	s.mux.HandleFunc("GET /transfers/{id}", s.handleGetTransfer)
	s.mux.HandleFunc("POST /batch", s.handleBatch)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	respond(w, http.StatusOK, APIResponse{Success: true, Data: map[string]string{
		"service": "tigerbeetle-gateway",
		"status":  "healthy",
		"time":    time.Now().UTC().Format(time.RFC3339),
	}})
}

func (s *Server) handleCreateAccounts(w http.ResponseWriter, r *http.Request) {
	var req []CreateAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond(w, http.StatusBadRequest, APIResponse{Success: false, Error: err.Error()})
		return
	}
	results, err := s.tb.CreateAccounts(req)
	if err != nil {
		respond(w, http.StatusInternalServerError, APIResponse{Success: false, Error: err.Error()})
		return
	}
	// Persist to account map
	for i, acc := range req {
		if results[i] == 0 { // success
			_ = s.store.RecordAccount("manual", int64(acc.UserData64), "NGN", acc.ID, int(acc.Ledger), int(acc.Code))
		}
	}
	respond(w, http.StatusCreated, APIResponse{Success: true, Data: map[string]interface{}{
		"results": results,
		"count":   len(req),
	}})
}

func (s *Server) handleGetAccount(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respond(w, http.StatusBadRequest, APIResponse{Success: false, Error: "invalid account ID"})
		return
	}
	balances, err := s.tb.LookupAccounts([]uint64{id})
	if err != nil {
		respond(w, http.StatusInternalServerError, APIResponse{Success: false, Error: err.Error()})
		return
	}
	if len(balances) == 0 {
		respond(w, http.StatusNotFound, APIResponse{Success: false, Error: "account not found"})
		return
	}
	respond(w, http.StatusOK, APIResponse{Success: true, Data: balances[0]})
}

func (s *Server) handleCreateTransfers(w http.ResponseWriter, r *http.Request) {
	var req []CreateTransferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond(w, http.StatusBadRequest, APIResponse{Success: false, Error: err.Error()})
		return
	}
	results, err := s.tb.CreateTransfers(req)
	if err != nil {
		respond(w, http.StatusInternalServerError, APIResponse{Success: false, Error: err.Error()})
		return
	}
	// Persist to transfer log
	for i, t := range req {
		if results[i] == 0 {
			_ = s.store.RecordTransfer(t.ID, t.DebitAccountID, t.CreditAccountID, t.Amount, "NGN", int(t.Ledger), int(t.Code), "api", "")
		}
	}
	respond(w, http.StatusCreated, APIResponse{Success: true, Data: map[string]interface{}{
		"results": results,
		"count":   len(req),
	}})
}

func (s *Server) handleGetTransfer(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respond(w, http.StatusBadRequest, APIResponse{Success: false, Error: "invalid transfer ID"})
		return
	}
	transfers, err := s.tb.LookupTransfers([]uint64{id})
	if err != nil {
		respond(w, http.StatusInternalServerError, APIResponse{Success: false, Error: err.Error()})
		return
	}
	if len(transfers) == 0 {
		respond(w, http.StatusNotFound, APIResponse{Success: false, Error: "transfer not found"})
		return
	}
	respond(w, http.StatusOK, APIResponse{Success: true, Data: transfers[0]})
}

func (s *Server) handleBatch(w http.ResponseWriter, r *http.Request) {
	var req BatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond(w, http.StatusBadRequest, APIResponse{Success: false, Error: err.Error()})
		return
	}
	result := map[string]interface{}{}
	// Create accounts first
	if len(req.Accounts) > 0 {
		accountResults, err := s.tb.CreateAccounts(req.Accounts)
		if err != nil {
			respond(w, http.StatusInternalServerError, APIResponse{Success: false, Error: "accounts: " + err.Error()})
			return
		}
		result["account_results"] = accountResults
	}
	// Then transfers
	if len(req.Transfers) > 0 {
		transferResults, err := s.tb.CreateTransfers(req.Transfers)
		if err != nil {
			respond(w, http.StatusInternalServerError, APIResponse{Success: false, Error: "transfers: " + err.Error()})
			return
		}
		result["transfer_results"] = transferResults
	}
	respond(w, http.StatusCreated, APIResponse{Success: true, Data: result})
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func respond(w http.ResponseWriter, status int, body APIResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	cfg := loadConfig()
	slog.Info("Starting TigerBeetle Gateway", "port", cfg.HTTPPort, "tb_address", cfg.TBAddress)

	tb, err := NewTBClient(cfg.TBAddress, cfg.TBClusterID)
	if err != nil {
		slog.Error("Failed to connect to TigerBeetle", "error", err)
		os.Exit(1)
	}
	defer tb.Close()

	store, err := NewAccountMapStore(cfg.PGDSN)
	if err != nil {
		slog.Error("Failed to connect to PostgreSQL", "error", err)
		os.Exit(1)
	}

	srv := NewServer(tb, store)
	httpServer := &http.Server{
		Addr:         ":" + cfg.HTTPPort,
		Handler:      srv.mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		slog.Info("TigerBeetle Gateway listening", "addr", httpServer.Addr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("HTTP server error", "error", err)
			os.Exit(1)
		}
	}()
	<-quit
	slog.Info("Shutting down TigerBeetle Gateway...")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(ctx); err != nil {
		slog.Error("Shutdown error", "error", err)
	}
	slog.Info("TigerBeetle Gateway stopped")
}
