package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/tourismpay/settlement-service/internal/services"
)

func setupTestRouter() (*gin.Engine, *Handlers) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	ledger := services.NewTigerBeetleLedgerService(0)
	mojaloop := services.NewMojaloopDFSPService("test-dfsp")
	inventory := services.NewInventorySyncService()
	settlement := services.NewSettlementService(ledger, mojaloop)
	h := NewHandlers(ledger, mojaloop, inventory, settlement)
	return r, h
}

func TestCreateAccount_Success(t *testing.T) {
	r, h := setupTestRouter()
	r.POST("/accounts", h.CreateAccount)

	body := CreateAccountRequest{
		EntityType: "merchant",
		EntityID:   "merch-001",
		Currency:   "KES",
	}
	b, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/accounts", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	// Account should have an id field
	if _, ok := resp["id"]; !ok {
		t.Errorf("response missing 'id' field")
	}
}

func TestCreateAccount_MissingFields(t *testing.T) {
	r, h := setupTestRouter()
	r.POST("/accounts", h.CreateAccount)

	body := map[string]string{"entity_type": "merchant"}
	b, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/accounts", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestGetAccountBalance(t *testing.T) {
	r, h := setupTestRouter()
	r.POST("/accounts", h.CreateAccount)
	r.GET("/balance", h.GetAccountBalance)

	// Create account first
	body := CreateAccountRequest{EntityType: "tourist", EntityID: "t-001", Currency: "USD"}
	b, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/accounts", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("setup: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	// Get balance via query params
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("GET", "/balance?entity_type=tourist&entity_id=t-001&currency=USD", nil)
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w2.Code, w2.Body.String())
	}
}

func TestCreateTransfer_ValidatesAccountExistence(t *testing.T) {
	r, h := setupTestRouter()
	r.POST("/transfers", h.CreateTransfer)

	// Transfer with non-existent accounts should fail
	transfer := map[string]interface{}{
		"from_type": "tourist",
		"from_id":   "nonexistent-sender",
		"to_type":   "merchant",
		"to_id":     "nonexistent-receiver",
		"amount":    1000,
		"currency":  "USD",
	}
	b, _ := json.Marshal(transfer)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/transfers", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing accounts, got %d", w.Code)
	}
}

func TestCreateTransfer_InsufficientFunds(t *testing.T) {
	r, h := setupTestRouter()
	r.POST("/accounts", h.CreateAccount)
	r.POST("/transfers", h.CreateTransfer)

	for _, acct := range []CreateAccountRequest{
		{EntityType: "tourist", EntityID: "sender-2", Currency: "USD"},
		{EntityType: "merchant", EntityID: "receiver-2", Currency: "USD"},
	} {
		b, _ := json.Marshal(acct)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/accounts", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)
	}

	// Non-pending transfer with no balance should fail
	transfer := map[string]interface{}{
		"from_type": "tourist",
		"from_id":   "sender-2",
		"to_type":   "merchant",
		"to_id":     "receiver-2",
		"amount":    5000,
		"currency":  "USD",
	}
	b, _ := json.Marshal(transfer)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/transfers", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for insufficient funds, got %d", w.Code)
	}
}

func TestCreateTransfer_MissingFields(t *testing.T) {
	r, h := setupTestRouter()
	r.POST("/transfers", h.CreateTransfer)

	transfer := map[string]interface{}{"amount": 5000}
	b, _ := json.Marshal(transfer)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/transfers", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestListInventory(t *testing.T) {
	r, h := setupTestRouter()
	r.GET("/inventory", h.ListInventory)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/inventory", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestGetLedgerStatus(t *testing.T) {
	r, h := setupTestRouter()
	r.GET("/status", h.GetLedgerStatus)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/status", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestGetMojaloopStatus(t *testing.T) {
	r, h := setupTestRouter()
	r.GET("/mojaloop/status", h.GetMojaloopStatus)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/mojaloop/status", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestGetSettlementStatus(t *testing.T) {
	r, h := setupTestRouter()
	r.GET("/settlement/status", h.GetSettlementStatus)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/settlement/status", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestGetInventoryStatus(t *testing.T) {
	r, h := setupTestRouter()
	r.GET("/inventory/status", h.GetInventoryStatus)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/inventory/status", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}
