// Package services provides the CBN eNaira Speed Wallet SDK client.
// This client wraps the CBN REST API for the eNaira CBDC-NG platform.
// In production, replace sandbox URLs with the live CBN endpoint.
package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"go.uber.org/zap"

	"github.com/munisp/tourismpay/enaira-gateway/internal/models"
)

// CBNClient wraps the CBN eNaira REST API.
type CBNClient struct {
	baseURL    string
	apiKey     string
	merchantID string
	httpClient *http.Client
	logger     *zap.Logger
}

// NewCBNClient creates a new CBN eNaira API client.
func NewCBNClient(baseURL, apiKey, merchantID string, logger *zap.Logger) *CBNClient {
	return &CBNClient{
		baseURL:    baseURL,
		apiKey:     apiKey,
		merchantID: merchantID,
		httpClient: &http.Client{Timeout: 30 * time.Second},
		logger:     logger,
	}
}

// ─── CBN API Request/Response Shapes ─────────────────────────────────────────

type cbnCreateWalletReq struct {
	MerchantID  string `json:"merchant_id"`
	BVN         string `json:"bvn"`
	NIN         string `json:"nin,omitempty"`
	PhoneNumber string `json:"phone_number"`
	FullName    string `json:"full_name"`
	WalletType  string `json:"wallet_type"`
	RequestRef  string `json:"request_ref"`
}

type cbnCreateWalletResp struct {
	Status       string `json:"status"`
	WalletID     string `json:"wallet_id"`
	WalletAddress string `json:"wallet_address"`
	ResponseCode string `json:"response_code"`
	Message      string `json:"message"`
}

type cbnInitiatePaymentReq struct {
	MerchantID      string `json:"merchant_id"`
	SenderWallet    string `json:"sender_wallet_id"`
	ReceiverWallet  string `json:"receiver_wallet_id"`
	AmountKobo      int64  `json:"amount_kobo"`
	TransactionType string `json:"transaction_type"`
	Narration       string `json:"narration"`
	RequestRef      string `json:"request_ref"`
	Timestamp       int64  `json:"timestamp"`
}

type cbnInitiatePaymentResp struct {
	Status         string `json:"status"`
	TransactionRef string `json:"transaction_ref"`
	ResponseCode   string `json:"response_code"`
	Message        string `json:"message"`
}

type cbnBalanceResp struct {
	WalletID    string `json:"wallet_id"`
	BalanceKobo int64  `json:"balance_kobo"`
	Currency    string `json:"currency"`
	AsOf        int64  `json:"as_of"`
}

// ─── CBN API Methods ──────────────────────────────────────────────────────────

// ProvisionWallet registers a new eNaira wallet with the CBN.
func (c *CBNClient) ProvisionWallet(ctx context.Context, req *models.CreateWalletRequest) (walletID, walletAddress string, err error) {
	body := cbnCreateWalletReq{
		MerchantID:  c.merchantID,
		BVN:         req.BVN,
		NIN:         req.NIN,
		PhoneNumber: req.PhoneNumber,
		FullName:    req.FullName,
		WalletType:  string(req.WalletType),
		RequestRef:  uuid.NewString(),
	}

	var resp cbnCreateWalletResp
	if err = c.post(ctx, "/wallets/provision", body, &resp); err != nil {
		return "", "", fmt.Errorf("CBN ProvisionWallet: %w", err)
	}
	if resp.ResponseCode != "00" {
		return "", "", fmt.Errorf("CBN ProvisionWallet rejected: code=%s msg=%s", resp.ResponseCode, resp.Message)
	}
	return resp.WalletID, resp.WalletAddress, nil
}

// InitiatePayment sends a payment instruction to the CBN eNaira network.
func (c *CBNClient) InitiatePayment(ctx context.Context, req *models.InitiatePaymentRequest) (cbnRef string, err error) {
	amountDec, err := decimal.NewFromString(req.AmountNGN)
	if err != nil {
		return "", fmt.Errorf("invalid amount %q: %w", req.AmountNGN, err)
	}
	// Convert NGN to kobo (multiply by 100)
	amountKobo := amountDec.Mul(decimal.NewFromInt(100)).IntPart()

	body := cbnInitiatePaymentReq{
		MerchantID:      c.merchantID,
		SenderWallet:    req.SenderWalletID,
		ReceiverWallet:  req.ReceiverWalletID,
		AmountKobo:      amountKobo,
		TransactionType: string(req.TransactionType),
		Narration:       req.Narration,
		RequestRef:      req.CorrelationID,
		Timestamp:       time.Now().UnixMilli(),
	}

	var resp cbnInitiatePaymentResp
	if err = c.post(ctx, "/transactions/initiate", body, &resp); err != nil {
		return "", fmt.Errorf("CBN InitiatePayment: %w", err)
	}
	if resp.ResponseCode != "00" && resp.ResponseCode != "09" { // 09 = pending
		return "", fmt.Errorf("CBN InitiatePayment rejected: code=%s msg=%s", resp.ResponseCode, resp.Message)
	}
	return resp.TransactionRef, nil
}

// GetBalance retrieves the current balance of an eNaira wallet.
func (c *CBNClient) GetBalance(ctx context.Context, walletID string) (int64, error) {
	var resp cbnBalanceResp
	if err := c.get(ctx, fmt.Sprintf("/wallets/%s/balance", walletID), &resp); err != nil {
		return 0, fmt.Errorf("CBN GetBalance: %w", err)
	}
	return resp.BalanceKobo, nil
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

func (c *CBNClient) post(ctx context.Context, path string, body, out interface{}) error {
	data, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", c.apiKey)
	req.Header.Set("X-Merchant-ID", c.merchantID)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("CBN API error %d: %s", resp.StatusCode, string(respBody))
	}
	return json.Unmarshal(respBody, out)
}

func (c *CBNClient) get(ctx context.Context, path string, out interface{}) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-API-Key", c.apiKey)
	req.Header.Set("X-Merchant-ID", c.merchantID)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("CBN API error %d: %s", resp.StatusCode, string(respBody))
	}
	return json.Unmarshal(respBody, out)
}
