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

// ExpediaConnector implements the Connector interface for Expedia Partner Central (EPC).
// Uses Expedia's Rapid API and EPC Connectivity Partner API for:
//   - Rate plan distribution (per-day pricing with occupancy-based rates)
//   - Availability/inventory management
//   - Booking retrieval and confirmation
//   - Property content management
//
// API Reference: https://developers.expediagroup.com/supply/lodging
type ExpediaConnector struct {
	client  *http.Client
	baseURL string
}

func NewExpediaConnector() *ExpediaConnector {
	return &ExpediaConnector{
		client:  &http.Client{Timeout: 30 * time.Second},
		baseURL: "https://supply-api.expediapartnercentral.com/v3",
	}
}

func (e *ExpediaConnector) Name() string { return "expedia" }

// PushRates distributes rates to Expedia via their Rate Management API.
func (e *ExpediaConnector) PushRates(ctx context.Context, rates []RateUpdate) (*SyncResult, error) {
	start := time.Now()
	result := &SyncResult{
		ChannelID:  "expedia",
		Operation:  "rate_push",
		Timestamp:  start,
		ItemsTotal: len(rates),
	}

	// Expedia expects rates grouped by property and rate plan
	type ExpediaRate struct {
		DateStart       string  `json:"dateStart"`
		DateEnd         string  `json:"dateEnd"`
		Currency        string  `json:"currency"`
		PerDayRate      float64 `json:"perDayRate"`
		MinLOSArrival   int     `json:"minLOSArrival,omitempty"`
		MaxLOSArrival   int     `json:"maxLOSArrival,omitempty"`
		ClosedToArrival bool    `json:"closedToArrival,omitempty"`
	}

	type RatePayload struct {
		PropertyID   string         `json:"propertyId"`
		RoomTypeID   string         `json:"roomTypeId"`
		RatePlanID   string         `json:"ratePlanId"`
		Rates        []ExpediaRate  `json:"rates"`
	}

	// Group rates by property
	grouped := make(map[string]*RatePayload)
	for _, r := range rates {
		key := fmt.Sprintf("%d-%s", r.EstablishmentID, r.RatePlanCode)
		if _, ok := grouped[key]; !ok {
			grouped[key] = &RatePayload{
				PropertyID: fmt.Sprintf("TP%d", r.EstablishmentID),
				RoomTypeID: r.RoomTypeCode,
				RatePlanID: r.RatePlanCode,
			}
		}
		grouped[key].Rates = append(grouped[key].Rates, ExpediaRate{
			DateStart:       r.Date,
			DateEnd:         r.Date,
			Currency:        r.Currency,
			PerDayRate:      r.Price,
			MinLOSArrival:   r.MinStay,
			MaxLOSArrival:   r.MaxStay,
			ClosedToArrival: r.ClosedToArrival,
		})
	}

	// Send one request per property/rate-plan group
	successCount := 0
	failCount := 0
	var errors []string

	for _, payload := range grouped {
		body, _ := json.Marshal(payload)
		url := fmt.Sprintf("%s/properties/%s/roomTypes/%s/ratePlans/%s/rates",
			e.baseURL, payload.PropertyID, payload.RoomTypeID, payload.RatePlanID)

		req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(body))
		if err != nil {
			failCount += len(payload.Rates)
			errors = append(errors, err.Error())
			continue
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := e.client.Do(req)
		if err != nil {
			failCount += len(payload.Rates)
			errors = append(errors, err.Error())
			continue
		}

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			successCount += len(payload.Rates)
		} else {
			respBody, _ := io.ReadAll(resp.Body)
			failCount += len(payload.Rates)
			errors = append(errors, fmt.Sprintf("HTTP %d for %s: %s", resp.StatusCode, payload.PropertyID, string(respBody)))
		}
		resp.Body.Close()
	}

	result.ItemsSuccess = successCount
	result.ItemsFailed = failCount
	result.Errors = errors
	result.Duration = time.Since(start)
	return result, nil
}

// PushAvailability syncs inventory to Expedia.
func (e *ExpediaConnector) PushAvailability(ctx context.Context, updates []AvailabilityUpdate) (*SyncResult, error) {
	start := time.Now()
	result := &SyncResult{
		ChannelID:  "expedia",
		Operation:  "availability_push",
		Timestamp:  start,
		ItemsTotal: len(updates),
	}

	type ExpediaAvail struct {
		DateStart    string `json:"dateStart"`
		DateEnd      string `json:"dateEnd"`
		TotalCount   int    `json:"totalCount"`
		AvailCount   int    `json:"availCount"`
		ClosedStatus string `json:"closedStatus,omitempty"` // "OPEN" or "CLOSED"
	}

	// Group by establishment
	grouped := make(map[int][]ExpediaAvail)
	for _, u := range updates {
		status := "OPEN"
		if u.IsBlocked {
			status = "CLOSED"
		}
		grouped[u.EstablishmentID] = append(grouped[u.EstablishmentID], ExpediaAvail{
			DateStart:    u.Date,
			DateEnd:      u.Date,
			TotalCount:   u.TotalSlots,
			AvailCount:   u.AvailableSlots,
			ClosedStatus: status,
		})
	}

	successCount := 0
	failCount := 0

	for estID, avails := range grouped {
		payload := map[string]interface{}{
			"propertyId":   fmt.Sprintf("TP%d", estID),
			"availability": avails,
		}
		body, _ := json.Marshal(payload)
		url := fmt.Sprintf("%s/properties/TP%d/availability", e.baseURL, estID)

		req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(body))
		if err != nil {
			failCount += len(avails)
			continue
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := e.client.Do(req)
		if err != nil {
			failCount += len(avails)
			continue
		}
		resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			successCount += len(avails)
		} else {
			failCount += len(avails)
		}
	}

	result.ItemsSuccess = successCount
	result.ItemsFailed = failCount
	result.Duration = time.Since(start)
	return result, nil
}

// PullBookings retrieves reservations from Expedia's Booking API.
func (e *ExpediaConnector) PullBookings(ctx context.Context, since time.Time) ([]InboundBooking, error) {
	url := fmt.Sprintf("%s/bookings?status=confirmed&lastModified=%s", e.baseURL, since.Format(time.RFC3339))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := e.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("expedia booking pull failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("expedia booking pull: HTTP %d", resp.StatusCode)
	}

	var epcResp struct {
		Bookings []struct {
			BookingID     string `json:"bookingId"`
			ConfirmNumber string `json:"confirmNumber"`
			PropertyID    string `json:"propertyId"`
			RoomTypeID    string `json:"roomTypeId"`
			PrimaryGuest  struct {
				FirstName string `json:"firstName"`
				LastName  string `json:"lastName"`
				Email     string `json:"email"`
				Phone     string `json:"phone"`
			} `json:"primaryGuest"`
			CheckIn      string  `json:"checkIn"`
			CheckOut     string  `json:"checkOut"`
			NumberGuests int     `json:"numberGuests"`
			TotalAmount  float64 `json:"totalAmount"`
			Currency     string  `json:"currency"`
			Status       string  `json:"status"`
		} `json:"bookings"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&epcResp); err != nil {
		return nil, fmt.Errorf("expedia decode error: %w", err)
	}

	bookings := make([]InboundBooking, 0, len(epcResp.Bookings))
	for _, b := range epcResp.Bookings {
		bookings = append(bookings, InboundBooking{
			ID:                generateID("bk"),
			ChannelID:         "expedia",
			ChannelBookingRef: b.ConfirmNumber,
			GuestName:         b.PrimaryGuest.FirstName + " " + b.PrimaryGuest.LastName,
			GuestEmail:        b.PrimaryGuest.Email,
			GuestPhone:        b.PrimaryGuest.Phone,
			CheckIn:           b.CheckIn,
			CheckOut:          b.CheckOut,
			PartySize:         b.NumberGuests,
			TotalPrice:        b.TotalAmount,
			Currency:          b.Currency,
			Status:            mapExpediaStatus(b.Status),
			ReceivedAt:        time.Now(),
		})
	}

	return bookings, nil
}

func mapExpediaStatus(s string) string {
	switch s {
	case "confirmed", "booked":
		return "confirmed"
	case "cancelled":
		return "cancelled"
	case "modified":
		return "modified"
	default:
		return "confirmed"
	}
}

func (e *ExpediaConnector) ConfirmBooking(ctx context.Context, ref string) error {
	url := fmt.Sprintf("%s/bookings/%s/confirm", e.baseURL, ref)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	resp, err := e.client.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("expedia confirm failed: HTTP %d", resp.StatusCode)
	}
	return nil
}

func (e *ExpediaConnector) CancelBooking(ctx context.Context, ref string, reason string) error {
	payload, _ := json.Marshal(map[string]string{"reason": reason, "cancelledBy": "property"})
	url := fmt.Sprintf("%s/bookings/%s/cancel", e.baseURL, ref)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp, err := e.client.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

func (e *ExpediaConnector) ValidateConfig(cfg ChannelConfig) error {
	if cfg.APIKey == "" {
		return fmt.Errorf("Expedia EPC API key is required")
	}
	if cfg.APISecret == "" {
		return fmt.Errorf("Expedia EPC API secret is required")
	}
	if cfg.PropertyID == "" {
		return fmt.Errorf("Expedia property ID is required (from EPC dashboard)")
	}
	return nil
}

func (e *ExpediaConnector) HealthCheck(ctx context.Context) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, e.baseURL+"/properties/connectivity-status", nil)
	resp, err := e.client.Do(req)
	if err != nil {
		return fmt.Errorf("expedia unreachable: %w", err)
	}
	resp.Body.Close()
	if resp.StatusCode >= 500 {
		return fmt.Errorf("expedia unhealthy: HTTP %d", resp.StatusCode)
	}
	return nil
}
