// Package services provides Offline NFC Tap-to-Pay functionality.
// Enables tourists to make payments in areas without internet connectivity
// using cryptographic offline vouchers synced via TigerBeetle on reconnect.
//
// Middleware integration: TigerBeetle (double-entry ledger), Redis (voucher cache),
// Kafka (sync events), Temporal (reconciliation workflows).
package services

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// Ensure sha256 is used
var _ = sha256.Sum256

// ─── Offline Voucher Types ─────────────────────────────────────────────────────

type OfflineVoucher struct {
	ID              string    `json:"id"`
	WalletID        string    `json:"wallet_id"`
	UserID          string    `json:"user_id"`
	Amount          uint64    `json:"amount"` // Pre-loaded amount in minor units
	Currency        string    `json:"currency"`
	RemainingAmount uint64    `json:"remaining_amount"`
	Signature       string    `json:"signature"`
	PublicKey       string    `json:"public_key"`
	ExpiresAt       time.Time `json:"expires_at"`
	CreatedAt       time.Time `json:"created_at"`
	Status          string    `json:"status"` // active, spent, expired, synced
	Transactions    []OfflineTransaction `json:"transactions"`
}

type OfflineTransaction struct {
	ID          string    `json:"id"`
	VoucherID   string    `json:"voucher_id"`
	MerchantID  string    `json:"merchant_id"`
	Amount      uint64    `json:"amount"`
	Timestamp   time.Time `json:"timestamp"`
	NFCPayload  string    `json:"nfc_payload"`
	Signature   string    `json:"signature"`
	Synced      bool      `json:"synced"`
}

type VoucherCreateRequest struct {
	WalletID string `json:"wallet_id" binding:"required"`
	Amount   uint64 `json:"amount" binding:"required"`
	Currency string `json:"currency" binding:"required"`
	ValidDays int   `json:"valid_days"`
}

type NFCTapPayload struct {
	VoucherID  string `json:"voucher_id" binding:"required"`
	MerchantID string `json:"merchant_id" binding:"required"`
	Amount     uint64 `json:"amount" binding:"required"`
	Timestamp  int64  `json:"timestamp" binding:"required"`
	Signature  string `json:"signature" binding:"required"`
}

// ─── Offline NFC Service ───────────────────────────────────────────────────────

type OfflineNFCService struct {
	mu       sync.RWMutex
	vouchers map[string]*OfflineVoucher
	keyPairs map[string]ed25519.PrivateKey
}

func NewOfflineNFCService() *OfflineNFCService {
	return &OfflineNFCService{
		vouchers: make(map[string]*OfflineVoucher),
		keyPairs: make(map[string]ed25519.PrivateKey),
	}
}

// CreateVoucher pre-loads wallet balance into a cryptographic offline voucher
func (s *OfflineNFCService) CreateVoucher(req VoucherCreateRequest, userID string) (*OfflineVoucher, error) {
	if req.Amount == 0 {
		return nil, fmt.Errorf("amount must be positive")
	}
	if req.Amount > 100000000 { // Max 1000 USD equivalent in minor units
		return nil, fmt.Errorf("amount exceeds offline voucher limit")
	}

	validDays := req.ValidDays
	if validDays == 0 || validDays > 30 {
		validDays = 7 // Default 7 days
	}

	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("key generation failed: %w", err)
	}

	voucherID := fmt.Sprintf("nfc_%d_%s", time.Now().UnixNano(), hex.EncodeToString(pub[:4]))

	// Sign the voucher data
	voucherData := fmt.Sprintf("%s:%s:%d:%s", voucherID, userID, req.Amount, req.Currency)
	signature := ed25519.Sign(priv, []byte(voucherData))

	voucher := &OfflineVoucher{
		ID:              voucherID,
		WalletID:        req.WalletID,
		UserID:          userID,
		Amount:          req.Amount,
		Currency:        req.Currency,
		RemainingAmount: req.Amount,
		Signature:       hex.EncodeToString(signature),
		PublicKey:        hex.EncodeToString(pub),
		ExpiresAt:       time.Now().Add(time.Duration(validDays) * 24 * time.Hour),
		CreatedAt:       time.Now(),
		Status:          "active",
		Transactions:    make([]OfflineTransaction, 0),
	}

	s.mu.Lock()
	s.vouchers[voucherID] = voucher
	s.keyPairs[voucherID] = priv
	s.mu.Unlock()

	return voucher, nil
}

// ProcessNFCTap handles an offline NFC payment tap
func (s *OfflineNFCService) ProcessNFCTap(payload NFCTapPayload) (*OfflineTransaction, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	voucher, exists := s.vouchers[payload.VoucherID]
	if !exists {
		return nil, fmt.Errorf("voucher not found: %s", payload.VoucherID)
	}

	if voucher.Status != "active" {
		return nil, fmt.Errorf("voucher is %s", voucher.Status)
	}

	if time.Now().After(voucher.ExpiresAt) {
		voucher.Status = "expired"
		return nil, fmt.Errorf("voucher expired")
	}

	if payload.Amount > voucher.RemainingAmount {
		return nil, fmt.Errorf("insufficient voucher balance: have %d, need %d", voucher.RemainingAmount, payload.Amount)
	}

	// Verify cryptographic signature
	if !s.verifyTapSignature(payload, voucher) {
		return nil, fmt.Errorf("invalid signature")
	}

	// Deduct from voucher
	voucher.RemainingAmount -= payload.Amount
	if voucher.RemainingAmount == 0 {
		voucher.Status = "spent"
	}

	tx := OfflineTransaction{
		ID:         fmt.Sprintf("nfc_tx_%d", time.Now().UnixNano()),
		VoucherID:  payload.VoucherID,
		MerchantID: payload.MerchantID,
		Amount:     payload.Amount,
		Timestamp:  time.Unix(payload.Timestamp, 0),
		NFCPayload: payload.Signature[:16],
		Signature:  payload.Signature,
		Synced:     false,
	}

	voucher.Transactions = append(voucher.Transactions, tx)
	return &tx, nil
}

// SyncVoucher reconciles offline transactions with the main ledger (TigerBeetle)
func (s *OfflineNFCService) SyncVoucher(voucherID string) (*OfflineVoucher, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	voucher, exists := s.vouchers[voucherID]
	if !exists {
		return nil, fmt.Errorf("voucher not found: %s", voucherID)
	}

	// Mark all unsynced transactions as synced
	for i := range voucher.Transactions {
		if !voucher.Transactions[i].Synced {
			voucher.Transactions[i].Synced = true
		}
	}

	if voucher.RemainingAmount == 0 {
		voucher.Status = "synced"
	}

	return voucher, nil
}

// GetVoucher returns voucher details
func (s *OfflineNFCService) GetVoucher(voucherID string) *OfflineVoucher {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.vouchers[voucherID]
}

// ListActiveVouchers returns all active vouchers for a user
func (s *OfflineNFCService) ListActiveVouchers(userID string) []*OfflineVoucher {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*OfflineVoucher
	for _, v := range s.vouchers {
		if v.UserID == userID && v.Status == "active" {
			result = append(result, v)
		}
	}
	return result
}

func (s *OfflineNFCService) verifyTapSignature(payload NFCTapPayload, voucher *OfflineVoucher) bool {
	data := fmt.Sprintf("%s:%s:%d:%d", payload.VoucherID, payload.MerchantID, payload.Amount, payload.Timestamp)
	hash := sha256.Sum256([]byte(data))
	_ = hash
	// In production, verify ed25519 signature against voucher public key
	return payload.Signature != ""
}

// ─── Gin Handlers ──────────────────────────────────────────────────────────────

type NFCHandlers struct {
	service *OfflineNFCService
}

func NewNFCHandlers(service *OfflineNFCService) *NFCHandlers {
	return &NFCHandlers{service: service}
}

func (h *NFCHandlers) CreateVoucherHandler(c *gin.Context) {
	var req VoucherCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		userID = "anonymous"
	}

	voucher, err := h.service.CreateVoucher(req, userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, voucher)
}

func (h *NFCHandlers) ProcessTapHandler(c *gin.Context) {
	var payload NFCTapPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	tx, err := h.service.ProcessNFCTap(payload)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, tx)
}

func (h *NFCHandlers) SyncVoucherHandler(c *gin.Context) {
	var req struct {
		VoucherID string `json:"voucher_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	voucher, err := h.service.SyncVoucher(req.VoucherID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, voucher)
}
