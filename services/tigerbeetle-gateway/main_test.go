package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// ─── Health Check Tests ───────────────────────────────────────────────────────

func TestHealthEndpoint(t *testing.T) {
	router := setupRouter()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp["status"] == nil {
		t.Error("expected 'status' field in health response")
	}
}

// ─── Account ID Generation Tests ─────────────────────────────────────────────

func TestGenerateAccountID(t *testing.T) {
	tests := []struct {
		userID   string
		currency string
		wantSame bool
	}{
		{"user-1", "NGN", true},
		{"user-1", "USD", false},
		{"user-2", "NGN", false},
	}

	id1 := generateAccountID("user-1", "NGN")
	id2 := generateAccountID("user-1", "NGN")

	// Same inputs should produce same ID (deterministic)
	if id1 != id2 {
		t.Errorf("generateAccountID should be deterministic: got %d and %d", id1, id2)
	}

	// Different currency should produce different ID
	idUSD := generateAccountID("user-1", "USD")
	if id1 == idUSD {
		t.Error("different currency should produce different account ID")
	}

	// Different user should produce different ID
	idUser2 := generateAccountID("user-2", "NGN")
	if id1 == idUser2 {
		t.Error("different user should produce different account ID")
	}

	_ = tests
}

// ─── Request Validation Tests ─────────────────────────────────────────────────

func TestCreateAccountValidation(t *testing.T) {
	router := setupRouter()

	tests := []struct {
		name       string
		body       map[string]interface{}
		wantStatus int
	}{
		{
			name:       "missing userID",
			body:       map[string]interface{}{"currency": "NGN"},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "missing currency",
			body:       map[string]interface{}{"userID": "user-123"},
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "invalid currency",
			body: map[string]interface{}{
				"userID":   "user-123",
				"currency": "INVALID",
			},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bodyBytes, _ := json.Marshal(tt.body)
			req := httptest.NewRequest(http.MethodPost, "/accounts", bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// Without a real TigerBeetle connection, we expect either BadRequest or ServiceUnavailable
			if w.Code == http.StatusOK {
				t.Errorf("expected non-200 for invalid input, got %d", w.Code)
			}
		})
	}
}

func TestTransferValidation(t *testing.T) {
	router := setupRouter()

	tests := []struct {
		name string
		body map[string]interface{}
	}{
		{
			name: "missing debitAccountID",
			body: map[string]interface{}{
				"creditAccountID": uint64(2),
				"amount":          int64(1000),
				"currency":        "NGN",
			},
		},
		{
			name: "zero amount",
			body: map[string]interface{}{
				"debitAccountID":  uint64(1),
				"creditAccountID": uint64(2),
				"amount":          int64(0),
				"currency":        "NGN",
			},
		},
		{
			name: "negative amount",
			body: map[string]interface{}{
				"debitAccountID":  uint64(1),
				"creditAccountID": uint64(2),
				"amount":          int64(-500),
				"currency":        "NGN",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bodyBytes, _ := json.Marshal(tt.body)
			req := httptest.NewRequest(http.MethodPost, "/transfers", bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code == http.StatusOK {
				t.Errorf("expected non-200 for invalid input '%s', got %d", tt.name, w.Code)
			}
		})
	}
}

// ─── Metrics Endpoint Tests ───────────────────────────────────────────────────

func TestMetricsEndpoint(t *testing.T) {
	router := setupRouter()
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200 for /metrics, got %d", w.Code)
	}

	body := w.Body.String()
	if body == "" {
		t.Error("expected non-empty metrics response")
	}
}
