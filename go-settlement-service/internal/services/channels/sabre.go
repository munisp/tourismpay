package channels

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// SabreConnector implements the Connector interface for Sabre GDS (SynXis).
// Supports: Hotel inventory distribution, rate management, availability sync,
// and booking retrieval via Sabre Hospitality Solutions REST API.
type SabreConnector struct {
	client   *http.Client
	tokenURL string
	baseURL  string
}

// NewSabreConnector creates a new Sabre GDS connector.
func NewSabreConnector() *SabreConnector {
	return &SabreConnector{
		client:   &http.Client{Timeout: 30 * time.Second},
		tokenURL: "https://api.havail.sabre.com/v2/auth/token",
		baseURL:  "https://api.havail.sabre.com/v1",
	}
}

func (s *SabreConnector) Name() string { return "sabre" }

// PushRates sends rate updates to Sabre via the OTA_HotelRatePlanNotifRQ message.
func (s *SabreConnector) PushRates(ctx context.Context, rates []RateUpdate) (*SyncResult, error) {
	start := time.Now()
	result := &SyncResult{
		ChannelID: "sabre",
		Operation: "rate_push",
		Timestamp: start,
	}

	// Build Sabre rate plan notification payload
	type RatePlan struct {
		RatePlanCode string  `json:"RatePlanCode"`
		Start        string  `json:"Start"`
		End          string  `json:"End"`
		AmountAfterTax float64 `json:"AmountAfterTax"`
		CurrencyCode string  `json:"CurrencyCode"`
		MinLOS       int     `json:"MinLOS,omitempty"`
		MaxLOS       int     `json:"MaxLOS,omitempty"`
	}

	plans := make([]RatePlan, 0, len(rates))
	for _, r := range rates {
		plans = append(plans, RatePlan{
			RatePlanCode:   r.RatePlanCode,
			Start:          r.Date,
			End:            r.Date,
			AmountAfterTax: r.Price,
			CurrencyCode:   r.Currency,
			MinLOS:         r.MinStay,
			MaxLOS:         r.MaxStay,
		})
	}

	payload := map[string]interface{}{
		"OTA_HotelRatePlanNotifRQ": map[string]interface{}{
			"RatePlans": map[string]interface{}{
				"RatePlan": plans,
			},
		},
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+"/hotel/rateplans", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("sabre rate push request creation failed: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		result.ItemsTotal = len(rates)
		result.ItemsFailed = len(rates)
		result.Errors = []string{err.Error()}
		result.Duration = time.Since(start)
		return result, fmt.Errorf("sabre rate push failed: %w", err)
	}
	defer resp.Body.Close()

	result.ItemsTotal = len(rates)
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		result.ItemsSuccess = len(rates)
	} else {
		respBody, _ := io.ReadAll(resp.Body)
		result.ItemsFailed = len(rates)
		result.Errors = []string{fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(respBody))}
	}

	result.Duration = time.Since(start)
	return result, nil
}

// PushAvailability sends availability to Sabre via OTA_HotelAvailNotifRQ.
func (s *SabreConnector) PushAvailability(ctx context.Context, updates []AvailabilityUpdate) (*SyncResult, error) {
	start := time.Now()
	result := &SyncResult{
		ChannelID: "sabre",
		Operation: "availability_push",
		Timestamp: start,
	}

	type AvailStatus struct {
		Start          string `json:"Start"`
		End            string `json:"End"`
		BookingLimit   int    `json:"BookingLimit"`
		RestrictionStatus string `json:"RestrictionStatus,omitempty"` // "Close" or "Open"
	}

	statuses := make([]AvailStatus, 0, len(updates))
	for _, u := range updates {
		status := "Open"
		if u.IsBlocked {
			status = "Close"
		}
		statuses = append(statuses, AvailStatus{
			Start:             u.Date,
			End:               u.Date,
			BookingLimit:      u.AvailableSlots,
			RestrictionStatus: status,
		})
	}

	payload := map[string]interface{}{
		"OTA_HotelAvailNotifRQ": map[string]interface{}{
			"AvailStatusMessages": map[string]interface{}{
				"AvailStatusMessage": statuses,
			},
		},
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+"/hotel/availability", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("sabre avail push request creation failed: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		result.ItemsTotal = len(updates)
		result.ItemsFailed = len(updates)
		result.Errors = []string{err.Error()}
		result.Duration = time.Since(start)
		return result, nil
	}
	defer resp.Body.Close()

	result.ItemsTotal = len(updates)
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		result.ItemsSuccess = len(updates)
	} else {
		result.ItemsFailed = len(updates)
	}

	result.Duration = time.Since(start)
	return result, nil
}

// PullBookings retrieves new reservations from Sabre.
func (s *SabreConnector) PullBookings(ctx context.Context, since time.Time) ([]InboundBooking, error) {
	url := fmt.Sprintf("%s/hotel/reservations?modifiedSince=%s", s.baseURL, since.Format(time.RFC3339))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sabre booking pull failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("sabre booking pull: HTTP %d", resp.StatusCode)
	}

	var sabreResp struct {
		Reservations []struct {
			ConfirmationNumber string `json:"ConfirmationNumber"`
			GuestName          string `json:"GuestName"`
			GuestEmail         string `json:"GuestEmail"`
			CheckIn            string `json:"CheckIn"`
			CheckOut           string `json:"CheckOut"`
			RoomNights         int    `json:"RoomNights"`
			GuestCount         int    `json:"GuestCount"`
			TotalAmount        float64 `json:"TotalAmount"`
			CurrencyCode       string `json:"CurrencyCode"`
			Status             string `json:"Status"`
		} `json:"Reservations"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&sabreResp); err != nil {
		return nil, fmt.Errorf("sabre booking decode error: %w", err)
	}

	bookings := make([]InboundBooking, 0, len(sabreResp.Reservations))
	for _, r := range sabreResp.Reservations {
		bookings = append(bookings, InboundBooking{
			ID:                generateID("bk"),
			ChannelID:         "sabre",
			ChannelBookingRef: r.ConfirmationNumber,
			GuestName:         r.GuestName,
			GuestEmail:        r.GuestEmail,
			CheckIn:           r.CheckIn,
			CheckOut:          r.CheckOut,
			Nights:            r.RoomNights,
			PartySize:         r.GuestCount,
			TotalPrice:        r.TotalAmount,
			Currency:          r.CurrencyCode,
			Status:            mapSabreStatus(r.Status),
			ReceivedAt:        time.Now(),
		})
	}

	return bookings, nil
}

func mapSabreStatus(s string) string {
	switch s {
	case "Confirmed", "Reserved":
		return "confirmed"
	case "Cancelled":
		return "cancelled"
	case "Modified":
		return "modified"
	default:
		return "confirmed"
	}
}

func (s *SabreConnector) ConfirmBooking(ctx context.Context, ref string) error {
	url := fmt.Sprintf("%s/hotel/reservations/%s/confirm", s.baseURL, ref)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("sabre confirm failed: HTTP %d", resp.StatusCode)
	}
	return nil
}

func (s *SabreConnector) CancelBooking(ctx context.Context, ref string, reason string) error {
	payload, _ := json.Marshal(map[string]string{"reason": reason})
	url := fmt.Sprintf("%s/hotel/reservations/%s/cancel", s.baseURL, ref)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("sabre cancel failed: HTTP %d", resp.StatusCode)
	}
	return nil
}

func (s *SabreConnector) ValidateConfig(cfg ChannelConfig) error {
	if cfg.APIKey == "" {
		return fmt.Errorf("Sabre API key (client_id) is required")
	}
	if cfg.APISecret == "" {
		return fmt.Errorf("Sabre API secret (client_secret) is required")
	}
	if cfg.PropertyID == "" {
		return fmt.Errorf("Sabre property ID (SynXis hotel code) is required")
	}
	return nil
}

func (s *SabreConnector) HealthCheck(ctx context.Context) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, s.baseURL+"/health", nil)
	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("sabre health check failed: %w", err)
	}
	resp.Body.Close()
	if resp.StatusCode >= 500 {
		return fmt.Errorf("sabre unhealthy: HTTP %d", resp.StatusCode)
	}
	return nil
}
