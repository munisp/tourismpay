// Package main — production handler tests for tigerbeetle-gateway.
// These tests exercise the REAL Server struct handlers (not the mock router),
// which is the root cause of the 0% coverage anomaly.
// The mock router in test_helpers_test.go bypasses main.go entirely.
// These tests use the real NewServer() + NewTBClient() to get real coverage.
package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
)

// newTestServer creates a real Server with a real TBClient (stub) and a nil store.
// The nil store is safe because RecordAccount/RecordTransfer check for nil.
func newTestServer(t *testing.T) *Server {
	t.Helper()
	tb, err := NewTBClient("3000", 0)
	if err != nil {
		t.Fatalf("NewTBClient: %v", err)
	}
	// Pass nil store — RecordAccount/RecordTransfer will no-op on nil
	srv := NewServer(tb, nil)
	return srv
}

// ─── Config & Helpers ─────────────────────────────────────────────────────────

func TestLoadConfig_Defaults(t *testing.T) {
	cfg := loadConfig()
	if cfg.TBAddress == "" {
		t.Error("TBAddress should have a default value")
	}
	if cfg.HTTPPort == "" {
		t.Error("HTTPPort should have a default value")
	}
}

func TestGetEnv_Fallback(t *testing.T) {
	val := getEnv("NONEXISTENT_ENV_VAR_XYZ", "fallback_value")
	if val != "fallback_value" {
		t.Errorf("getEnv fallback: got %q, want %q", val, "fallback_value")
	}
}

// ─── TBClient Tests ───────────────────────────────────────────────────────────

func TestNewTBClient_Success(t *testing.T) {
	client, err := NewTBClient("3000", 0)
	if err != nil {
		t.Fatalf("NewTBClient: unexpected error: %v", err)
	}
	if client == nil {
		t.Fatal("expected non-nil TBClient")
	}
	client.Close() // should not panic
}

func TestTBClient_CreateAccounts(t *testing.T) {
	client, _ := NewTBClient("3000", 0)
	accounts := []CreateAccountRequest{
		{ID: 1001, Ledger: 1, Code: 1},
		{ID: 1002, Ledger: 1, Code: 2},
	}
	results, err := client.CreateAccounts(accounts)
	if err != nil {
		t.Fatalf("CreateAccounts: unexpected error: %v", err)
	}
	if len(results) != len(accounts) {
		t.Errorf("CreateAccounts: got %d results, want %d", len(results), len(accounts))
	}
}

func TestTBClient_LookupAccounts(t *testing.T) {
	client, _ := NewTBClient("3000", 0)
	ids := []uint64{1001, 1002, 1003}
	balances, err := client.LookupAccounts(ids)
	if err != nil {
		t.Fatalf("LookupAccounts: unexpected error: %v", err)
	}
	if len(balances) != len(ids) {
		t.Errorf("LookupAccounts: got %d balances, want %d", len(balances), len(ids))
	}
	for i, b := range balances {
		if b.ID != ids[i] {
			t.Errorf("LookupAccounts[%d]: got ID %d, want %d", i, b.ID, ids[i])
		}
	}
}

func TestTBClient_CreateTransfers(t *testing.T) {
	client, _ := NewTBClient("3000", 0)
	transfers := []CreateTransferRequest{
		{ID: 5001, DebitAccountID: 1001, CreditAccountID: 1002, Amount: 1550000, Ledger: 1, Code: 1},
	}
	results, err := client.CreateTransfers(transfers)
	if err != nil {
		t.Fatalf("CreateTransfers: unexpected error: %v", err)
	}
	if len(results) != 1 {
		t.Errorf("CreateTransfers: got %d results, want 1", len(results))
	}
	if results[0] != 0 {
		t.Errorf("CreateTransfers: result[0] = %d (non-zero means error)", results[0])
	}
}

func TestTBClient_LookupTransfers(t *testing.T) {
	client, _ := NewTBClient("3000", 0)
	transfers, err := client.LookupTransfers([]uint64{5001})
	if err != nil {
		t.Fatalf("LookupTransfers: unexpected error: %v", err)
	}
	// Stub returns nil — this is expected
	_ = transfers
}

// ─── Server Handler Tests (Real Production Code) ──────────────────────────────

func TestServer_HandleHealth_RealCode(t *testing.T) {
	srv := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("handleHealth: got %d, want 200", w.Code)
	}
	var resp APIResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("handleHealth: decode error: %v", err)
	}
	if !resp.Success {
		t.Error("handleHealth: expected success=true")
	}
}

func TestServer_HandleCreateAccounts_Valid(t *testing.T) {
	srv := newTestServer(t)
	body := []CreateAccountRequest{
		{ID: generateAccountID("user-001", "NGN"), Ledger: 1, Code: 1},
	}
	data, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/accounts", bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Errorf("handleCreateAccounts: got %d, want 201; body: %s", w.Code, w.Body.String())
	}
}

func TestServer_HandleCreateAccounts_InvalidJSON(t *testing.T) {
	srv := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/accounts", bytes.NewBufferString("not-json"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("handleCreateAccounts invalid JSON: got %d, want 400", w.Code)
	}
}

func TestServer_HandleGetAccount_Valid(t *testing.T) {
	srv := newTestServer(t)
	accountID := generateAccountID("user-001", "NGN")
	req := httptest.NewRequest(http.MethodGet, "/accounts/"+uint64ToString(accountID), nil)
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	// LookupAccounts stub always returns a balance, so expect 200
	if w.Code != http.StatusOK {
		t.Errorf("handleGetAccount: got %d, want 200; body: %s", w.Code, w.Body.String())
	}
}

func TestServer_HandleGetAccount_InvalidID(t *testing.T) {
	srv := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/accounts/not-a-number", nil)
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("handleGetAccount invalid ID: got %d, want 400", w.Code)
	}
}

func TestServer_HandleCreateTransfers_Valid(t *testing.T) {
	srv := newTestServer(t)
	debitID := generateAccountID("tourist-001", "NGN")
	creditID := generateAccountID("merchant-hotel-001", "NGN")
	body := []CreateTransferRequest{
		{
			ID:              generateAccountID("tx-001", "NGN"),
			DebitAccountID:  debitID,
			CreditAccountID: creditID,
			Amount:          5000000, // ₦50,000 in kobo
			Ledger:          1,
			Code:            1,
		},
	}
	data, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/transfers", bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Errorf("handleCreateTransfers: got %d, want 201; body: %s", w.Code, w.Body.String())
	}
}

func TestServer_HandleCreateTransfers_InvalidJSON(t *testing.T) {
	srv := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/transfers", bytes.NewBufferString("{bad}"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("handleCreateTransfers invalid JSON: got %d, want 400", w.Code)
	}
}

func TestServer_HandleGetTransfer_InvalidID(t *testing.T) {
	srv := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/transfers/not-a-number", nil)
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("handleGetTransfer invalid ID: got %d, want 400", w.Code)
	}
}

func TestServer_HandleGetTransfer_NotFound(t *testing.T) {
	srv := newTestServer(t)
	// LookupTransfers stub returns nil/empty, so expect 404
	req := httptest.NewRequest(http.MethodGet, "/transfers/99999", nil)
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Errorf("handleGetTransfer not found: got %d, want 404", w.Code)
	}
}

func TestServer_HandleBatch_AccountsAndTransfers(t *testing.T) {
	srv := newTestServer(t)
	debitID := generateAccountID("batch-tourist-001", "NGN")
	creditID := generateAccountID("batch-merchant-001", "NGN")
	body := BatchRequest{
		Accounts: []CreateAccountRequest{
			{ID: debitID, Ledger: 1, Code: 1},
			{ID: creditID, Ledger: 1, Code: 2},
		},
		Transfers: []CreateTransferRequest{
			{
				ID:              generateAccountID("batch-tx-001", "NGN"),
				DebitAccountID:  debitID,
				CreditAccountID: creditID,
				Amount:          1000000,
				Ledger:          1,
				Code:            1,
			},
		},
	}
	data, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/batch", bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Errorf("handleBatch: got %d, want 201; body: %s", w.Code, w.Body.String())
	}
}

func TestServer_HandleBatch_InvalidJSON(t *testing.T) {
	srv := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/batch", bytes.NewBufferString("invalid"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("handleBatch invalid JSON: got %d, want 400", w.Code)
	}
}

func TestServer_HandleBatch_EmptyRequest(t *testing.T) {
	srv := newTestServer(t)
	body := BatchRequest{}
	data, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/batch", bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Errorf("handleBatch empty: got %d, want 201", w.Code)
	}
}

// ─── Respond Helper Test ──────────────────────────────────────────────────────

func TestRespond_SetsContentType(t *testing.T) {
	w := httptest.NewRecorder()
	respond(w, http.StatusOK, APIResponse{Success: true, Data: "test"})
	ct := w.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("respond: Content-Type = %q, want application/json", ct)
	}
	if w.Code != http.StatusOK {
		t.Errorf("respond: status = %d, want 200", w.Code)
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func uint64ToString(n uint64) string {
	return strconv.FormatUint(n, 10)
}
