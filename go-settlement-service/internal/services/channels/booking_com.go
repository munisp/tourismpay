package channels

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// BookingComConnector implements the Connector interface for Booking.com.
// Uses the Connectivity Partner API for XML/JSON-based rate and availability management.
// API: https://connect.booking.com/json/
type BookingComConnector struct {
	client  *http.Client
	baseURL string
}

func NewBookingComConnector() *BookingComConnector {
	return &BookingComConnector{
		client:  &http.Client{Timeout: 30 * time.Second},
		baseURL: "https://supply-xml.booking.com/hotels/json",
	}
}

func (bc *BookingComConnector) Name() string { return "booking_com" }

func (bc *BookingComConnector) PushRates(ctx context.Context, rates []RateUpdate) (*SyncResult, error) {
	start := time.Now()
	result := &SyncResult{
		ChannelID:  "booking_com",
		Operation:  "rate_push",
		Timestamp:  start,
		ItemsTotal: len(rates),
	}

	type BCRate struct {
		HotelID  int     `json:"hotel_id"`
		RoomID   string  `json:"room_id"`
		Date     string  `json:"date"`
		Price    float64 `json:"price"`
		Currency string  `json:"currency"`
	}

	bcRates := make([]BCRate, 0, len(rates))
	for _, r := range rates {
		bcRates = append(bcRates, BCRate{
			HotelID:  r.EstablishmentID,
			RoomID:   r.RoomTypeCode,
			Date:     r.Date,
			Price:    r.Price,
			Currency: r.Currency,
		})
	}

	payload := map[string]interface{}{"rates": bcRates}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, bc.baseURL+"/setRates", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := bc.client.Do(req)
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
		result.ItemsFailed = len(rates)
	}

	result.Duration = time.Since(start)
	return result, nil
}

func (bc *BookingComConnector) PushAvailability(ctx context.Context, updates []AvailabilityUpdate) (*SyncResult, error) {
	start := time.Now()
	result := &SyncResult{
		ChannelID:  "booking_com",
		Operation:  "availability_push",
		Timestamp:  start,
		ItemsTotal: len(updates),
	}

	type BCAvail struct {
		HotelID    int    `json:"hotel_id"`
		RoomID     string `json:"room_id"`
		Date       string `json:"date"`
		Rooms      int    `json:"rooms"`
		ClosedTo   string `json:"closed,omitempty"` // "arrival", "departure", or ""
	}

	avails := make([]BCAvail, 0, len(updates))
	for _, u := range updates {
		closed := ""
		if u.IsBlocked {
			closed = "arrival"
		}
		avails = append(avails, BCAvail{
			HotelID: u.EstablishmentID,
			Date:    u.Date,
			Rooms:   u.AvailableSlots,
			ClosedTo: closed,
		})
	}

	payload := map[string]interface{}{"availability": avails}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, bc.baseURL+"/setAvailability", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := bc.client.Do(req)
	if err != nil {
		result.ItemsFailed = len(updates)
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

func (bc *BookingComConnector) PullBookings(ctx context.Context, since time.Time) ([]InboundBooking, error) {
	url := fmt.Sprintf("%s/getReservations?last_change=%s", bc.baseURL, since.Format("2006-01-02"))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := bc.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("booking.com pull failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("booking.com pull: HTTP %d", resp.StatusCode)
	}

	var bcResp struct {
		Reservations []struct {
			ID        string `json:"id"`
			GuestName string `json:"guest_name"`
			Email     string `json:"email"`
			Phone     string `json:"phone"`
			Checkin   string `json:"checkin"`
			Checkout  string `json:"checkout"`
			Rooms     int    `json:"rooms"`
			TotalPrice float64 `json:"total_price"`
			Currency  string `json:"currency_code"`
			Status    string `json:"status"`
		} `json:"reservations"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&bcResp); err != nil {
		return nil, err
	}

	bookings := make([]InboundBooking, 0, len(bcResp.Reservations))
	for _, r := range bcResp.Reservations {
		bookings = append(bookings, InboundBooking{
			ID:                generateID("bk"),
			ChannelID:         "booking_com",
			ChannelBookingRef: r.ID,
			GuestName:         r.GuestName,
			GuestEmail:        r.Email,
			GuestPhone:        r.Phone,
			CheckIn:           r.Checkin,
			CheckOut:          r.Checkout,
			PartySize:         r.Rooms,
			TotalPrice:        r.TotalPrice,
			Currency:          r.Currency,
			Status:            r.Status,
			ReceivedAt:        time.Now(),
		})
	}

	return bookings, nil
}

func (bc *BookingComConnector) ConfirmBooking(ctx context.Context, ref string) error {
	url := fmt.Sprintf("%s/confirmReservation?reservation_id=%s", bc.baseURL, ref)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	resp, err := bc.client.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

func (bc *BookingComConnector) CancelBooking(ctx context.Context, ref string, reason string) error {
	payload, _ := json.Marshal(map[string]string{"reservation_id": ref, "reason": reason})
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, bc.baseURL+"/cancelReservation", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp, err := bc.client.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

func (bc *BookingComConnector) ValidateConfig(cfg ChannelConfig) error {
	if cfg.APIKey == "" {
		return fmt.Errorf("Booking.com hotel_id is required")
	}
	if cfg.APISecret == "" {
		return fmt.Errorf("Booking.com connectivity partner credentials required")
	}
	return nil
}

func (bc *BookingComConnector) HealthCheck(ctx context.Context) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, bc.baseURL+"/getHotelStatus", nil)
	resp, err := bc.client.Do(req)
	if err != nil {
		return fmt.Errorf("booking.com unreachable: %w", err)
	}
	resp.Body.Close()
	if resp.StatusCode >= 500 {
		return fmt.Errorf("booking.com unhealthy: HTTP %d", resp.StatusCode)
	}
	return nil
}
