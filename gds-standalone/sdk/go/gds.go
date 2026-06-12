// Package gds provides a Go client for the Africa-first Global Distribution System API.
//
// Usage:
//
//	client := gds.NewClient(gds.Config{
//	    BaseURL:  "https://gds.yourdomain.com",
//	    APIKey:   "gds_sandbox_abc123",
//	    TenantID: "your-tenant",
//	})
//
//	results, err := client.Search(ctx, gds.SearchParams{
//	    Destination: "Masai Mara",
//	    CheckIn:     "2025-06-01",
//	    CheckOut:    "2025-06-05",
//	})
package gds

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// Config holds the client configuration.
type Config struct {
	BaseURL     string
	APIKey      string
	BearerToken string
	TenantID    string
	Timeout     time.Duration
	Sandbox     bool
	MaxRetries  int
}

// Client is the GDS API client.
type Client struct {
	config Config
	http   *http.Client
}

// GDSError represents an API error response.
type GDSError struct {
	StatusCode int
	Message    string
	Details    map[string]interface{}
}

func (e *GDSError) Error() string {
	return fmt.Sprintf("GDS API Error %d: %s", e.StatusCode, e.Message)
}

// NewClient creates a new GDS API client.
func NewClient(cfg Config) *Client {
	if cfg.Timeout == 0 {
		cfg.Timeout = 30 * time.Second
	}
	if cfg.MaxRetries == 0 {
		cfg.MaxRetries = 3
	}
	return &Client{
		config: cfg,
		http:   &http.Client{Timeout: cfg.Timeout},
	}
}

func (c *Client) headers() http.Header {
	h := http.Header{}
	h.Set("Content-Type", "application/json")
	h.Set("Accept", "application/json")
	if c.config.APIKey != "" {
		h.Set("X-GDS-API-Key", c.config.APIKey)
	}
	if c.config.BearerToken != "" {
		h.Set("Authorization", "Bearer "+c.config.BearerToken)
	}
	if c.config.TenantID != "" {
		h.Set("X-GDS-Tenant-ID", c.config.TenantID)
	}
	if c.config.Sandbox {
		h.Set("X-GDS-Sandbox", "true")
	}
	return h
}

func (c *Client) doRequest(ctx context.Context, method, path string, params url.Values, body interface{}) (json.RawMessage, error) {
	u := c.config.BaseURL + path
	if params != nil && len(params) > 0 {
		u += "?" + params.Encode()
	}

	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal body: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	var lastErr error
	for attempt := 0; attempt < c.config.MaxRetries; attempt++ {
		req, err := http.NewRequestWithContext(ctx, method, u, bodyReader)
		if err != nil {
			return nil, fmt.Errorf("create request: %w", err)
		}
		for k, vv := range c.headers() {
			for _, v := range vv {
				req.Header.Add(k, v)
			}
		}

		resp, err := c.http.Do(req)
		if err != nil {
			lastErr = err
			time.Sleep(time.Duration(1<<attempt) * time.Second)
			continue
		}
		defer resp.Body.Close()

		respBody, _ := io.ReadAll(resp.Body)

		if resp.StatusCode == 429 {
			retryAfter := 5
			if ra := resp.Header.Get("Retry-After"); ra != "" {
				if v, err := strconv.Atoi(ra); err == nil {
					retryAfter = v
				}
			}
			time.Sleep(time.Duration(retryAfter) * time.Second)
			continue
		}

		if resp.StatusCode >= 400 {
			gdsErr := &GDSError{StatusCode: resp.StatusCode, Message: string(respBody)}
			var errResp map[string]interface{}
			if json.Unmarshal(respBody, &errResp) == nil {
				if msg, ok := errResp["error"].(string); ok {
					gdsErr.Message = msg
				}
				gdsErr.Details = errResp
			}
			return nil, gdsErr
		}

		return json.RawMessage(respBody), nil
	}
	if lastErr != nil {
		return nil, fmt.Errorf("max retries exceeded: %w", lastErr)
	}
	return nil, fmt.Errorf("max retries exceeded")
}

// ─── Types ────────────────────────────────────────────────────────

type SearchParams struct {
	Destination  string `json:"destination,omitempty"`
	Country      string `json:"country,omitempty"`
	CheckIn      string `json:"checkIn,omitempty"`
	CheckOut     string `json:"checkOut,omitempty"`
	Guests       int    `json:"guests,omitempty"`
	PropertyType string `json:"type,omitempty"`
	MinPrice     int    `json:"minPrice,omitempty"`
	MaxPrice     int    `json:"maxPrice,omitempty"`
	Page         int    `json:"page,omitempty"`
	Limit        int    `json:"limit,omitempty"`
}

type PropertyFilter struct {
	Country    string `json:"country,omitempty"`
	Type       string `json:"type,omitempty"`
	StarRating int    `json:"starRating,omitempty"`
	Page       int    `json:"page,omitempty"`
	Limit      int    `json:"limit,omitempty"`
}

type ReservationParams struct {
	PropertyID      string `json:"propertyId"`
	RoomTypeCode    string `json:"roomTypeCode"`
	CheckIn         string `json:"checkIn"`
	CheckOut        string `json:"checkOut"`
	Guests          int    `json:"guests"`
	GuestName       string `json:"guestName"`
	GuestEmail      string `json:"guestEmail"`
	GuestCountry    string `json:"guestCountry,omitempty"`
	SpecialRequests string `json:"specialRequests,omitempty"`
}

type AgentRegistration struct {
	AgencyName string `json:"agencyName"`
	AgentName  string `json:"agentName"`
	Email      string `json:"email"`
	Country    string `json:"country"`
}

type WebhookRegistration struct {
	URL    string   `json:"url"`
	Events []string `json:"events"`
}

type PayoutRequest struct {
	Amount   float64 `json:"amount"`
	Currency string  `json:"currency"`
	Method   string  `json:"method"`
}

type AvailabilityCheck struct {
	PropertyID string `json:"propertyId"`
	RoomType   string `json:"roomType"`
	CheckIn    string `json:"checkIn"`
	CheckOut   string `json:"checkOut"`
	Rooms      int    `json:"rooms"`
}

// ─── API Methods ──────────────────────────────────────────────────

// Health returns the API health status.
func (c *Client) Health(ctx context.Context) (json.RawMessage, error) {
	return c.doRequest(ctx, "GET", "/health", nil, nil)
}

// Search performs a full-text property search.
func (c *Client) Search(ctx context.Context, p SearchParams) (json.RawMessage, error) {
	params := url.Values{}
	if p.Destination != "" {
		params.Set("destination", p.Destination)
	}
	if p.Country != "" {
		params.Set("country", p.Country)
	}
	if p.CheckIn != "" {
		params.Set("checkIn", p.CheckIn)
	}
	if p.CheckOut != "" {
		params.Set("checkOut", p.CheckOut)
	}
	if p.Guests > 0 {
		params.Set("guests", strconv.Itoa(p.Guests))
	}
	if p.PropertyType != "" {
		params.Set("type", p.PropertyType)
	}
	if p.Page > 0 {
		params.Set("page", strconv.Itoa(p.Page))
	}
	if p.Limit > 0 {
		params.Set("limit", strconv.Itoa(p.Limit))
	}
	return c.doRequest(ctx, "GET", "/api/v1/gds/search", params, nil)
}

// Suggest returns autocomplete suggestions.
func (c *Client) Suggest(ctx context.Context, query string, limit int) (json.RawMessage, error) {
	params := url.Values{"q": {query}}
	if limit > 0 {
		params.Set("limit", strconv.Itoa(limit))
	}
	return c.doRequest(ctx, "GET", "/api/v1/gds/search/suggest", params, nil)
}

// Trending returns trending destinations.
func (c *Client) Trending(ctx context.Context) (json.RawMessage, error) {
	return c.doRequest(ctx, "GET", "/api/v1/gds/search/trending", nil, nil)
}

// ListProperties returns properties matching filters.
func (c *Client) ListProperties(ctx context.Context, f PropertyFilter) (json.RawMessage, error) {
	params := url.Values{}
	if f.Country != "" {
		params.Set("country", f.Country)
	}
	if f.Type != "" {
		params.Set("type", f.Type)
	}
	if f.StarRating > 0 {
		params.Set("starRating", strconv.Itoa(f.StarRating))
	}
	if f.Page > 0 {
		params.Set("page", strconv.Itoa(f.Page))
	}
	if f.Limit > 0 {
		params.Set("limit", strconv.Itoa(f.Limit))
	}
	return c.doRequest(ctx, "GET", "/api/v1/gds/properties", params, nil)
}

// GetProperty returns a single property.
func (c *Client) GetProperty(ctx context.Context, id string) (json.RawMessage, error) {
	return c.doRequest(ctx, "GET", "/api/v1/gds/properties/"+id, nil, nil)
}

// RegisterProperty registers a new property.
func (c *Client) RegisterProperty(ctx context.Context, data map[string]interface{}) (json.RawMessage, error) {
	return c.doRequest(ctx, "POST", "/api/v1/gds/properties", nil, data)
}

// CheckAvailability checks room availability.
func (c *Client) CheckAvailability(ctx context.Context, p AvailabilityCheck) (json.RawMessage, error) {
	params := url.Values{
		"propertyId": {p.PropertyID},
		"roomType":   {p.RoomType},
		"checkIn":    {p.CheckIn},
		"checkOut":   {p.CheckOut},
		"rooms":      {strconv.Itoa(p.Rooms)},
	}
	return c.doRequest(ctx, "GET", "/api/v1/gds/availability/check", params, nil)
}

// CreateReservation creates a new booking.
func (c *Client) CreateReservation(ctx context.Context, p ReservationParams) (json.RawMessage, error) {
	return c.doRequest(ctx, "POST", "/api/v1/gds/reservations", nil, p)
}

// GetReservation gets reservation details.
func (c *Client) GetReservation(ctx context.Context, id string) (json.RawMessage, error) {
	return c.doRequest(ctx, "GET", "/api/v1/gds/reservations/"+id, nil, nil)
}

// CancelReservation cancels a reservation.
func (c *Client) CancelReservation(ctx context.Context, id, reason string) (json.RawMessage, error) {
	return c.doRequest(ctx, "POST", "/api/v1/gds/reservations/"+id+"/cancel", nil, map[string]string{"reason": reason})
}

// RegisterAgent registers a new travel agent.
func (c *Client) RegisterAgent(ctx context.Context, p AgentRegistration) (json.RawMessage, error) {
	return c.doRequest(ctx, "POST", "/api/v1/gds/agents/register", nil, p)
}

// GetProfile returns the current agent profile.
func (c *Client) GetProfile(ctx context.Context) (json.RawMessage, error) {
	return c.doRequest(ctx, "GET", "/api/v1/gds/agents/me", nil, nil)
}

// GetCommission returns commission summary.
func (c *Client) GetCommission(ctx context.Context) (json.RawMessage, error) {
	return c.doRequest(ctx, "GET", "/api/v1/gds/agents/commission", nil, nil)
}

// RequestPayout requests a commission payout.
func (c *Client) RequestPayout(ctx context.Context, p PayoutRequest) (json.RawMessage, error) {
	return c.doRequest(ctx, "POST", "/api/v1/gds/agents/payout", nil, p)
}

// GetRates returns rates for a property.
func (c *Client) GetRates(ctx context.Context, propertyID, dateFrom, dateTo string) (json.RawMessage, error) {
	params := url.Values{"propertyId": {propertyID}}
	if dateFrom != "" {
		params.Set("dateFrom", dateFrom)
	}
	if dateTo != "" {
		params.Set("dateTo", dateTo)
	}
	return c.doRequest(ctx, "GET", "/api/v1/gds/rates", params, nil)
}

// GetDynamicPrice returns ML-adjusted dynamic pricing.
func (c *Client) GetDynamicPrice(ctx context.Context, propertyID, roomType, checkIn, checkOut string) (json.RawMessage, error) {
	params := url.Values{
		"propertyId": {propertyID},
		"roomType":   {roomType},
		"checkIn":    {checkIn},
		"checkOut":   {checkOut},
	}
	return c.doRequest(ctx, "GET", "/api/v1/gds/rates/dynamic", params, nil)
}

// RegisterWebhook registers a webhook for events.
func (c *Client) RegisterWebhook(ctx context.Context, p WebhookRegistration) (json.RawMessage, error) {
	return c.doRequest(ctx, "POST", "/api/v1/gds/distribution/webhooks", nil, p)
}

// ListWebhooks returns registered webhooks.
func (c *Client) ListWebhooks(ctx context.Context) (json.RawMessage, error) {
	return c.doRequest(ctx, "GET", "/api/v1/gds/distribution/webhooks", nil, nil)
}

// GetBookingMetrics returns booking analytics.
func (c *Client) GetBookingMetrics(ctx context.Context, period, dateFrom, dateTo string) (json.RawMessage, error) {
	params := url.Values{}
	if period != "" {
		params.Set("period", period)
	}
	if dateFrom != "" {
		params.Set("dateFrom", dateFrom)
	}
	if dateTo != "" {
		params.Set("dateTo", dateTo)
	}
	return c.doRequest(ctx, "GET", "/api/v1/gds/analytics/bookings", params, nil)
}

// GetMarketIntelligence returns market data.
func (c *Client) GetMarketIntelligence(ctx context.Context, country string) (json.RawMessage, error) {
	params := url.Values{}
	if country != "" {
		params.Set("country", country)
	}
	return c.doRequest(ctx, "GET", "/api/v1/gds/analytics/market", params, nil)
}

// GetMeteredUsage returns server-side metered token usage.
func (c *Client) GetMeteredUsage(ctx context.Context) (json.RawMessage, error) {
	return c.doRequest(ctx, "GET", "/api/v1/gds/metering/usage", nil, nil)
}

// GetQuota returns current quota and remaining tokens.
func (c *Client) GetQuota(ctx context.Context) (json.RawMessage, error) {
	return c.doRequest(ctx, "GET", "/api/v1/gds/metering/quota", nil, nil)
}
