package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/tourismpay/settlement-service/internal/models"
)

// MojaloopFSPIOPClient implements the Mojaloop FSPIOP (Financial Services Provider Interoperability Protocol)
// for real interoperability with a Mojaloop Switch Hub.
// When MOJALOOP_HUB_URL is configured, all participant, quote, and transfer operations
// go through the actual FSPIOP API. Otherwise falls back to the PostgreSQL simulation.

type MojaloopFSPIOPClient struct {
	hubURL     string
	dfspID     string
	httpClient *http.Client
}

func NewMojaloopFSPIOPClient(hubURL, dfspID string) *MojaloopFSPIOPClient {
	return &MojaloopFSPIOPClient{
		hubURL: hubURL,
		dfspID: dfspID,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (c *MojaloopFSPIOPClient) IsConfigured() bool {
	return c.hubURL != ""
}

// ─── FSPIOP Headers ──────────────────────────────────────────────────────────

func (c *MojaloopFSPIOPClient) fspiopHeaders() map[string]string {
	return map[string]string{
		"Content-Type":    "application/vnd.interoperability.participants+json;version=1.1",
		"Accept":          "application/vnd.interoperability.participants+json;version=1.1",
		"FSPIOP-Source":   c.dfspID,
		"Date":            time.Now().UTC().Format(http.TimeFormat),
	}
}

func (c *MojaloopFSPIOPClient) doRequest(method, path string, body interface{}) (*http.Response, error) {
	var reqBody io.Reader
	if body != nil {
		jsonBytes, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("mojaloop: marshal error: %w", err)
		}
		reqBody = bytes.NewReader(jsonBytes)
	}

	req, err := http.NewRequest(method, c.hubURL+path, reqBody)
	if err != nil {
		return nil, fmt.Errorf("mojaloop: request error: %w", err)
	}

	for k, v := range c.fspiopHeaders() {
		req.Header.Set(k, v)
	}

	return c.httpClient.Do(req)
}

// ─── Participants ────────────────────────────────────────────────────────────

type ParticipantRequest struct {
	FspID    string `json:"fspId"`
	Currency string `json:"currency"`
}

func (c *MojaloopFSPIOPClient) RegisterParticipant(fspID, currency string) error {
	if !c.IsConfigured() {
		return fmt.Errorf("mojaloop: hub not configured")
	}
	resp, err := c.doRequest("POST", "/participants", &ParticipantRequest{
		FspID:    fspID,
		Currency: currency,
	})
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("mojaloop: register participant failed (%d): %s", resp.StatusCode, string(body))
	}
	return nil
}

func (c *MojaloopFSPIOPClient) LookupParticipant(partyIdType, partyIdentifier string) (*models.MojaloopParticipant, error) {
	if !c.IsConfigured() {
		return nil, fmt.Errorf("mojaloop: hub not configured")
	}
	path := fmt.Sprintf("/participants/%s/%s", partyIdType, partyIdentifier)
	resp, err := c.doRequest("GET", path, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 404 {
		return nil, nil
	}
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("mojaloop: lookup failed (%d): %s", resp.StatusCode, string(body))
	}
	var participant models.MojaloopParticipant
	if err := json.NewDecoder(resp.Body).Decode(&participant); err != nil {
		return nil, fmt.Errorf("mojaloop: decode error: %w", err)
	}
	return &participant, nil
}

// ─── Quotes ──────────────────────────────────────────────────────────────────

type QuoteRequest struct {
	QuoteID        string      `json:"quoteId"`
	TransactionID  string      `json:"transactionId"`
	Payer          FSPIOPParty `json:"payer"`
	Payee          FSPIOPParty `json:"payee"`
	AmountType     string      `json:"amountType"`
	Amount         FSPIOPMoney `json:"amount"`
	TransactionType struct {
		Scenario    string `json:"scenario"`
		Initiator   string `json:"initiator"`
		InitiatorType string `json:"initiatorType"`
	} `json:"transactionType"`
}

type FSPIOPParty struct {
	PartyIdInfo struct {
		PartyIdType       string `json:"partyIdType"`
		PartyIdentifier   string `json:"partyIdentifier"`
		FspID             string `json:"fspId"`
	} `json:"partyIdInfo"`
}

type FSPIOPMoney struct {
	Amount   string `json:"amount"`
	Currency string `json:"currency"`
}

func (c *MojaloopFSPIOPClient) RequestQuote(quote *models.MojaloopQuote) (*models.MojaloopQuote, error) {
	if !c.IsConfigured() {
		return nil, fmt.Errorf("mojaloop: hub not configured")
	}

	req := QuoteRequest{
		QuoteID:       quote.QuoteID,
		TransactionID: quote.TransactionID,
		AmountType:    "SEND",
		Amount:        FSPIOPMoney{Amount: fmt.Sprintf("%.2f", quote.Amount), Currency: quote.Currency},
	}
	req.Payer.PartyIdInfo.PartyIdType = "MSISDN"
	req.Payer.PartyIdInfo.PartyIdentifier = quote.PayerFSP
	req.Payer.PartyIdInfo.FspID = c.dfspID
	req.Payee.PartyIdInfo.PartyIdType = "MSISDN"
	req.Payee.PartyIdInfo.PartyIdentifier = quote.PayeeFSP
	req.TransactionType.Scenario = "TRANSFER"
	req.TransactionType.Initiator = "PAYER"
	req.TransactionType.InitiatorType = "CONSUMER"

	resp, err := c.doRequest("POST", "/quotes", &req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("mojaloop: quote request failed (%d): %s", resp.StatusCode, string(body))
	}

	// Quote accepted by hub
	return quote, nil
}

// ─── Transfers ───────────────────────────────────────────────────────────────

type TransferRequest struct {
	TransferID string      `json:"transferId"`
	PayerFSP   string      `json:"payerFsp"`
	PayeeFSP   string      `json:"payeeFsp"`
	Amount     FSPIOPMoney `json:"amount"`
	IlpPacket  string      `json:"ilpPacket"`
	Condition  string      `json:"condition"`
	Expiration string      `json:"expiration"`
}

func (c *MojaloopFSPIOPClient) ExecuteTransfer(transfer *models.MojaloopTransfer) error {
	if !c.IsConfigured() {
		return fmt.Errorf("mojaloop: hub not configured")
	}

	req := TransferRequest{
		TransferID: transfer.TransferID,
		PayerFSP:   transfer.PayerFSP,
		PayeeFSP:   transfer.PayeeFSP,
		Amount:     FSPIOPMoney{Amount: fmt.Sprintf("%.2f", transfer.Amount), Currency: transfer.Currency},
		Expiration: time.Now().Add(30 * time.Second).UTC().Format(time.RFC3339),
	}

	resp, err := c.doRequest("POST", "/transfers", &req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("mojaloop: transfer failed (%d): %s", resp.StatusCode, string(body))
	}

	transfer.State = models.MojaloopStateCompleted
	return nil
}

// ─── Settlement Windows ──────────────────────────────────────────────────────

func (c *MojaloopFSPIOPClient) GetSettlementWindows(state string) ([]models.SettlementWindow, error) {
	if !c.IsConfigured() {
		return nil, fmt.Errorf("mojaloop: hub not configured")
	}

	path := "/settlementWindows"
	if state != "" {
		path += "?state=" + state
	}
	resp, err := c.doRequest("GET", path, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("mojaloop: settlement windows query failed: %d", resp.StatusCode)
	}

	var windows []models.SettlementWindow
	if err := json.NewDecoder(resp.Body).Decode(&windows); err != nil {
		return nil, fmt.Errorf("mojaloop: decode error: %w", err)
	}
	return windows, nil
}

func (c *MojaloopFSPIOPClient) CloseSettlementWindow(windowID string) error {
	if !c.IsConfigured() {
		return fmt.Errorf("mojaloop: hub not configured")
	}

	path := fmt.Sprintf("/settlementWindows/%s", windowID)
	resp, err := c.doRequest("POST", path, map[string]string{
		"state":  "CLOSED",
		"reason": "Automated settlement by TourismPay",
	})
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("mojaloop: close window failed (%d): %s", resp.StatusCode, string(body))
	}
	return nil
}
