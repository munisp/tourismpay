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

// LittleEmperorsConnector implements the Connector interface for Little Emperors (LE).
// Little Emperors is a luxury hotel flash sale platform operating on an invitation-only
// model. Integration is via their Partner REST API for rate/availability push and
// booking notifications via webhooks.
//
// Key differences from GDS:
//   - Rates are "members-only" discounted rates (typically 40-70% off rack)
//   - Properties must be luxury (4-5 star minimum)
//   - Availability windows are typically 3-14 day flash sales
//   - Bookings are prepaid; LE handles payment collection
type LittleEmperorsConnector struct {
	client  *http.Client
	baseURL string
}

func NewLittleEmperorsConnector() *LittleEmperorsConnector {
	return &LittleEmperorsConnector{
		client:  &http.Client{Timeout: 30 * time.Second},
		baseURL: "https://api.littleemperors.com/v1",
	}
}

func (le *LittleEmperorsConnector) Name() string { return "little_emperors" }

// PushRates sends discounted flash-sale rates to Little Emperors.
func (le *LittleEmperorsConnector) PushRates(ctx context.Context, rates []RateUpdate) (*SyncResult, error) {
	start := time.Now()
	result := &SyncResult{
		ChannelID:  "little_emperors",
		Operation:  "rate_push",
		Timestamp:  start,
		ItemsTotal: len(rates),
	}

	// LE expects rates as "deals" with sale windows
	type LEDeal struct {
		PropertyCode string  `json:"property_code"`
		RoomType     string  `json:"room_type"`
		StartDate    string  `json:"start_date"`
		EndDate      string  `json:"end_date"`
		MemberRate   float64 `json:"member_rate"` // Discounted rate for LE members
		RackRate     float64 `json:"rack_rate"`   // Original rate (for "XX% off" display)
		Currency     string  `json:"currency"`
		Inclusions   string  `json:"inclusions,omitempty"` // "Breakfast, Spa Credit"
		MinNights    int     `json:"min_nights,omitempty"`
	}

	deals := make([]LEDeal, 0, len(rates))
	for _, r := range rates {
		deals = append(deals, LEDeal{
			PropertyCode: fmt.Sprintf("TP-%d", r.EstablishmentID),
			RoomType:     r.RoomTypeCode,
			StartDate:    r.Date,
			EndDate:      r.Date,
			MemberRate:   r.Price,
			RackRate:     r.Price * 1.5, // Default: 33% discount shown
			Currency:     r.Currency,
			MinNights:    r.MinStay,
		})
	}

	payload := map[string]interface{}{
		"deals": deals,
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, le.baseURL+"/deals/push", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := le.client.Do(req)
	if err != nil {
		result.ItemsFailed = len(rates)
		result.Errors = []string{err.Error()}
		result.Duration = time.Since(start)
		return result, nil
	}
	defer resp.Body.Close()

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

// PushAvailability syncs room availability to Little Emperors.
func (le *LittleEmperorsConnector) PushAvailability(ctx context.Context, updates []AvailabilityUpdate) (*SyncResult, error) {
	start := time.Now()
	result := &SyncResult{
		ChannelID:  "little_emperors",
		Operation:  "availability_push",
		Timestamp:  start,
		ItemsTotal: len(updates),
	}

	type LEAvail struct {
		PropertyCode string `json:"property_code"`
		RoomType     string `json:"room_type"`
		Date         string `json:"date"`
		Rooms        int    `json:"rooms"` // Available rooms for LE allocation
		Status       string `json:"status"` // "open", "closed", "on_request"
	}

	avails := make([]LEAvail, 0, len(updates))
	for _, u := range updates {
		status := "open"
		if u.IsBlocked {
			status = "closed"
		} else if u.AvailableSlots <= 0 {
			status = "closed"
		} else if u.AvailableSlots == 1 {
			status = "on_request" // Last room: confirm manually
		}
		avails = append(avails, LEAvail{
			PropertyCode: fmt.Sprintf("TP-%d", u.EstablishmentID),
			Date:         u.Date,
			Rooms:        u.AvailableSlots,
			Status:       status,
		})
	}

	payload := map[string]interface{}{"availability": avails}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, le.baseURL+"/availability", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := le.client.Do(req)
	if err != nil {
		result.ItemsFailed = len(updates)
		result.Errors = []string{err.Error()}
		result.Duration = time.Since(start)
		return result, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		result.ItemsSuccess = len(updates)
	} else {
		result.ItemsFailed = len(updates)
	}

	result.Duration = time.Since(start)
	return result, nil
}

// PullBookings retrieves bookings from LE (typically delivered via webhook,
// but this endpoint checks for any unprocessed bookings).
func (le *LittleEmperorsConnector) PullBookings(ctx context.Context, since time.Time) ([]InboundBooking, error) {
	url := fmt.Sprintf("%s/bookings?since=%s&status=confirmed", le.baseURL, since.Format("2006-01-02"))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := le.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("little emperors booking pull failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("LE booking pull: HTTP %d", resp.StatusCode)
	}

	var leResp struct {
		Bookings []struct {
			BookingRef   string  `json:"booking_ref"`
			PropertyCode string  `json:"property_code"`
			GuestName    string  `json:"guest_name"`
			GuestEmail   string  `json:"guest_email"`
			CheckIn      string  `json:"check_in"`
			CheckOut     string  `json:"check_out"`
			Nights       int     `json:"nights"`
			Guests       int     `json:"guests"`
			TotalPaid    float64 `json:"total_paid"`
			Currency     string  `json:"currency"`
			Status       string  `json:"status"`
		} `json:"bookings"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&leResp); err != nil {
		return nil, err
	}

	bookings := make([]InboundBooking, 0, len(leResp.Bookings))
	for _, b := range leResp.Bookings {
		bookings = append(bookings, InboundBooking{
			ID:                generateID("bk"),
			ChannelID:         "little_emperors",
			ChannelBookingRef: b.BookingRef,
			GuestName:         b.GuestName,
			GuestEmail:        b.GuestEmail,
			CheckIn:           b.CheckIn,
			CheckOut:          b.CheckOut,
			Nights:            b.Nights,
			PartySize:         b.Guests,
			TotalPrice:        b.TotalPaid,
			Currency:          b.Currency,
			Status:            b.Status,
			ReceivedAt:        time.Now(),
		})
	}

	return bookings, nil
}

func (le *LittleEmperorsConnector) ConfirmBooking(ctx context.Context, ref string) error {
	url := fmt.Sprintf("%s/bookings/%s/confirm", le.baseURL, ref)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	resp, err := le.client.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

func (le *LittleEmperorsConnector) CancelBooking(ctx context.Context, ref string, reason string) error {
	payload, _ := json.Marshal(map[string]string{"reason": reason})
	url := fmt.Sprintf("%s/bookings/%s/cancel", le.baseURL, ref)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp, err := le.client.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

func (le *LittleEmperorsConnector) ValidateConfig(cfg ChannelConfig) error {
	if cfg.APIKey == "" {
		return fmt.Errorf("Little Emperors partner API key is required")
	}
	if cfg.PropertyID == "" {
		return fmt.Errorf("Little Emperors property code is required")
	}
	return nil
}

func (le *LittleEmperorsConnector) HealthCheck(ctx context.Context) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, le.baseURL+"/health", nil)
	resp, err := le.client.Do(req)
	if err != nil {
		return fmt.Errorf("LE unreachable: %w", err)
	}
	resp.Body.Close()
	if resp.StatusCode >= 500 {
		return fmt.Errorf("LE unhealthy: HTTP %d", resp.StatusCode)
	}
	return nil
}
