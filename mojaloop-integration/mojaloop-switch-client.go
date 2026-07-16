package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
)

type MojaloopClient struct {
	baseURL    string
	httpClient *http.Client
	fspiID     string
	apiKey     string
}

type Party struct {
	PartyIdType string `json:"partyIdType"`
	PartyIdentifier string `json:"partyIdentifier"`
	PartySubIdOrType string `json:"partySubIdOrType,omitempty"`
	FspId string `json:"fspId,omitempty"`
}

type Money struct {
	Currency string `json:"currency"`
	Amount   string `json:"amount"`
}

type TransferRequest struct {
	TransferID      string    `json:"transferId"`
	PayerFSP        string    `json:"payerFsp"`
	PayeeFSP        string    `json:"payeeFsp"`
	Amount          Money     `json:"amount"`
	ILPPacket       string    `json:"ilpPacket"`
	Condition       string    `json:"condition"`
	Expiration      time.Time `json:"expiration"`
}

type TransferResponse struct {
	TransferID      string    `json:"transferId"`
	TransferState   string    `json:"transferState"`
	CompletedTimestamp time.Time `json:"completedTimestamp,omitempty"`
	Fulfilment      string    `json:"fulfilment,omitempty"`
}

type QuoteRequest struct {
	QuoteID         string    `json:"quoteId"`
	TransactionID   string    `json:"transactionId"`
	Payer           Party     `json:"payer"`
	Payee           Party     `json:"payee"`
	AmountType      string    `json:"amountType"`
	Amount          Money     `json:"amount"`
	TransactionType TransactionType `json:"transactionType"`
	Note            string    `json:"note,omitempty"`
	Expiration      time.Time `json:"expiration"`
}

type QuoteResponse struct {
	QuoteID         string    `json:"quoteId"`
	TransferAmount  Money     `json:"transferAmount"`
	PayeeReceiveAmount Money  `json:"payeeReceiveAmount,omitempty"`
	PayeeFspFee     Money     `json:"payeeFspFee,omitempty"`
	PayeeFspCommission Money  `json:"payeeFspCommission,omitempty"`
	Expiration      time.Time `json:"expiration"`
	ILPPacket       string    `json:"ilpPacket"`
	Condition       string    `json:"condition"`
}

type TransactionType struct {
	Scenario        string `json:"scenario"`
	SubScenario     string `json:"subScenario,omitempty"`
	Initiator       string `json:"initiator"`
	InitiatorType   string `json:"initiatorType"`
	RefundInfo      *RefundInfo `json:"refundInfo,omitempty"`
}

type RefundInfo struct {
	OriginalTransactionId string `json:"originalTransactionId"`
	RefundReason          string `json:"refundReason,omitempty"`
}

type PartyLookupRequest struct {
	PartyIdType      string `json:"partyIdType"`
	PartyIdentifier  string `json:"partyIdentifier"`
	PartySubIdOrType string `json:"partySubIdOrType,omitempty"`
}

type PartyLookupResponse struct {
	Party Party `json:"party"`
}

type ErrorInformation struct {
	ErrorCode        string `json:"errorCode"`
	ErrorDescription string `json:"errorDescription"`
}

func NewMojaloopClient(baseURL, fspiID, apiKey string) *MojaloopClient {
	return &MojaloopClient{
		baseURL: baseURL,
		fspiID:  fspiID,
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{
					MinVersion: tls.VersionTLS12,
				},
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 10,
				IdleConnTimeout:     90 * time.Second,
			},
		},
	}
}

func (c *MojaloopClient) LookupParty(ctx context.Context, req PartyLookupRequest) (*PartyLookupResponse, error) {
	url := fmt.Sprintf("%s/parties/%s/%s", c.baseURL, req.PartyIdType, req.PartyIdentifier)
	if req.PartySubIdOrType != "" {
		url = fmt.Sprintf("%s/%s", url, req.PartySubIdOrType)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(httpReq)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, c.handleErrorResponse(resp)
	}

	var partyResp PartyLookupResponse
	if err := json.NewDecoder(resp.Body).Decode(&partyResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &partyResp, nil
}

func (c *MojaloopClient) RequestQuote(ctx context.Context, req QuoteRequest) (*QuoteResponse, error) {
	url := fmt.Sprintf("%s/quotes", c.baseURL)

	reqBody, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(httpReq)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted && resp.StatusCode != http.StatusOK {
		return nil, c.handleErrorResponse(resp)
	}

	var quoteResp QuoteResponse
	if err := json.NewDecoder(resp.Body).Decode(&quoteResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &quoteResp, nil
}

func (c *MojaloopClient) PrepareTransfer(ctx context.Context, req TransferRequest) (*TransferResponse, error) {
	url := fmt.Sprintf("%s/transfers", c.baseURL)

	reqBody, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(httpReq)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted && resp.StatusCode != http.StatusOK {
		return nil, c.handleErrorResponse(resp)
	}

	var transferResp TransferResponse
	if err := json.NewDecoder(resp.Body).Decode(&transferResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &transferResp, nil
}

func (c *MojaloopClient) FulfillTransfer(ctx context.Context, transferID, fulfilment string) error {
	url := fmt.Sprintf("%s/transfers/%s", c.baseURL, transferID)

	reqBody := map[string]string{
		"fulfilment": fulfilment,
		"transferState": "COMMITTED",
		"completedTimestamp": time.Now().UTC().Format(time.RFC3339),
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(httpReq)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return c.handleErrorResponse(resp)
	}

	return nil
}

func (c *MojaloopClient) GetTransferStatus(ctx context.Context, transferID string) (*TransferResponse, error) {
	url := fmt.Sprintf("%s/transfers/%s", c.baseURL, transferID)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(httpReq)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, c.handleErrorResponse(resp)
	}

	var transferResp TransferResponse
	if err := json.NewDecoder(resp.Body).Decode(&transferResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &transferResp, nil
}

func (c *MojaloopClient) setHeaders(req *http.Request) {
	req.Header.Set("Content-Type", "application/vnd.interoperability.transfers+json;version=1.1")
	req.Header.Set("Accept", "application/vnd.interoperability.transfers+json;version=1.1")
	req.Header.Set("Date", time.Now().UTC().Format(time.RFC1123))
	req.Header.Set("FSPIOP-Source", c.fspiID)
	req.Header.Set("FSPIOP-Destination", "")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.apiKey))
	req.Header.Set("X-Request-ID", uuid.New().String())
}

func (c *MojaloopClient) handleErrorResponse(resp *http.Response) error {
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("request failed with status %d: %s", resp.StatusCode, err)
	}

	var errorInfo ErrorInformation
	if err := json.Unmarshal(body, &errorInfo); err != nil {
		return fmt.Errorf("request failed with status %d: %s", resp.StatusCode, string(body))
	}

	return fmt.Errorf("mojaloop error %s: %s", errorInfo.ErrorCode, errorInfo.ErrorDescription)
}

func GenerateILPPacket(amount Money, payee Party, transactionID string) string {
	return fmt.Sprintf("ilp_packet_%s_%s_%s", amount.Amount, payee.PartyIdentifier, transactionID)
}

func GenerateCondition(ilpPacket string) string {
	return fmt.Sprintf("condition_%s", ilpPacket)
}

func GenerateFulfilment(condition string) string {
	return fmt.Sprintf("fulfilment_%s", condition)
}
