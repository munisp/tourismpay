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

// AmadeusConnector implements the Connector interface for Amadeus Self-Service APIs.
// Supports: Hotel Search & Booking, Tours & Activities, Rate Distribution.
// API Reference: https://developers.amadeus.com/self-service
type AmadeusConnector struct {
	client       *http.Client
	authURL      string
	baseURL      string
}

func NewAmadeusConnector() *AmadeusConnector {
	return &AmadeusConnector{
		client:  &http.Client{Timeout: 30 * time.Second},
		authURL: "https://api.amadeus.com/v1/security/oauth2/token",
		baseURL: "https://api.amadeus.com/v2",
	}
}

func (a *AmadeusConnector) Name() string { return "amadeus" }

// PushRates distributes rates to Amadeus Hotel Content API.
func (a *AmadeusConnector) PushRates(ctx context.Context, rates []RateUpdate) (*SyncResult, error) {
	start := time.Now()
	result := &SyncResult{
		ChannelID:  "amadeus",
		Operation:  "rate_push",
		Timestamp:  start,
		ItemsTotal: len(rates),
	}

	// Amadeus rate distribution uses the Hotel Booking API v2
	type RateOffer struct {
		OfferId      string  `json:"offerId"`
		RoomType     string  `json:"roomType"`
		CheckInDate  string  `json:"checkInDate"`
		CheckOutDate string  `json:"checkOutDate"`
		Price        float64 `json:"price"`
		Currency     string  `json:"currency"`
		BoardType    string  `json:"boardType"`
	}

	offers := make([]RateOffer, 0, len(rates))
	for _, r := range rates {
		offers = append(offers, RateOffer{
			OfferId:     fmt.Sprintf("TP-%d-%s", r.ProductID, r.Date),
			RoomType:    r.RoomTypeCode,
			CheckInDate: r.Date,
			Price:       r.Price,
			Currency:    r.Currency,
			BoardType:   "ROOM_ONLY",
		})
	}

	payload := map[string]interface{}{
		"data": map[string]interface{}{
			"type":   "hotel-rate-distribution",
			"offers": offers,
		},
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.baseURL+"/shopping/hotel-offers/distribution", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := a.client.Do(req)
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

// PushAvailability syncs availability to Amadeus.
func (a *AmadeusConnector) PushAvailability(ctx context.Context, updates []AvailabilityUpdate) (*SyncResult, error) {
	start := time.Now()
	result := &SyncResult{
		ChannelID:  "amadeus",
		Operation:  "availability_push",
		Timestamp:  start,
		ItemsTotal: len(updates),
	}

	type AvailData struct {
		HotelID   string `json:"hotelId"`
		RoomType  string `json:"roomType"`
		Date      string `json:"date"`
		Available int    `json:"available"`
		Status    string `json:"status"` // "AVAILABLE", "SOLD_OUT", "CLOSED"
	}

	data := make([]AvailData, 0, len(updates))
	for _, u := range updates {
		status := "AVAILABLE"
		if u.IsBlocked {
			status = "CLOSED"
		} else if u.AvailableSlots == 0 {
			status = "SOLD_OUT"
		}
		data = append(data, AvailData{
			HotelID:   fmt.Sprintf("TP%d", u.EstablishmentID),
			Date:      u.Date,
			Available: u.AvailableSlots,
			Status:    status,
		})
	}

	payload := map[string]interface{}{
		"data": map[string]interface{}{
			"type":         "hotel-availability-update",
			"availability": data,
		},
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, a.baseURL+"/shopping/hotel-offers/availability", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := a.client.Do(req)
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

// PullBookings retrieves bookings from Amadeus Hotel Booking API.
func (a *AmadeusConnector) PullBookings(ctx context.Context, since time.Time) ([]InboundBooking, error) {
	url := fmt.Sprintf("%s/booking/hotel-bookings?lastModified=%s", a.baseURL, since.Format("2006-01-02"))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("amadeus booking pull failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("amadeus booking pull: HTTP %d", resp.StatusCode)
	}

	var amadeusResp struct {
		Data []struct {
			Type string `json:"type"`
			ID   string `json:"id"`
			Guests []struct {
				Name  struct{ FirstName, LastName string } `json:"name"`
				Email string `json:"email"`
				Phone string `json:"phone"`
			} `json:"guests"`
			Hotel struct {
				HotelID  string `json:"hotelId"`
				CheckIn  string `json:"checkInDate"`
				CheckOut string `json:"checkOutDate"`
				RoomQuantity int `json:"roomQuantity"`
			} `json:"hotel"`
			Payment struct {
				Total    float64 `json:"total"`
				Currency string  `json:"currency"`
			} `json:"payment"`
			Status string `json:"status"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&amadeusResp); err != nil {
		return nil, fmt.Errorf("amadeus decode error: %w", err)
	}

	bookings := make([]InboundBooking, 0, len(amadeusResp.Data))
	for _, d := range amadeusResp.Data {
		guestName := ""
		guestEmail := ""
		guestPhone := ""
		if len(d.Guests) > 0 {
			guestName = d.Guests[0].Name.FirstName + " " + d.Guests[0].Name.LastName
			guestEmail = d.Guests[0].Email
			guestPhone = d.Guests[0].Phone
		}

		bookings = append(bookings, InboundBooking{
			ID:                generateID("bk"),
			ChannelID:         "amadeus",
			ChannelBookingRef: d.ID,
			GuestName:         guestName,
			GuestEmail:        guestEmail,
			GuestPhone:        guestPhone,
			CheckIn:           d.Hotel.CheckIn,
			CheckOut:          d.Hotel.CheckOut,
			PartySize:         d.Hotel.RoomQuantity,
			TotalPrice:        d.Payment.Total,
			Currency:          d.Payment.Currency,
			Status:            mapAmadeusStatus(d.Status),
			ReceivedAt:        time.Now(),
		})
	}

	return bookings, nil
}

func mapAmadeusStatus(s string) string {
	switch s {
	case "CONFIRMED":
		return "confirmed"
	case "CANCELLED":
		return "cancelled"
	default:
		return "confirmed"
	}
}

func (a *AmadeusConnector) ConfirmBooking(ctx context.Context, ref string) error {
	url := fmt.Sprintf("%s/booking/hotel-bookings/%s", a.baseURL, ref)
	payload, _ := json.Marshal(map[string]string{"status": "CONFIRMED"})
	req, _ := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp, err := a.client.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

func (a *AmadeusConnector) CancelBooking(ctx context.Context, ref string, reason string) error {
	url := fmt.Sprintf("%s/booking/hotel-bookings/%s", a.baseURL, ref)
	req, _ := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	resp, err := a.client.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

func (a *AmadeusConnector) ValidateConfig(cfg ChannelConfig) error {
	if cfg.APIKey == "" {
		return fmt.Errorf("Amadeus API key (client_id) is required")
	}
	if cfg.APISecret == "" {
		return fmt.Errorf("Amadeus API secret is required")
	}
	return nil
}

func (a *AmadeusConnector) HealthCheck(ctx context.Context) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.amadeus.com/v1/reference-data/locations?keyword=test&subType=CITY", nil)
	resp, err := a.client.Do(req)
	if err != nil {
		return fmt.Errorf("amadeus unreachable: %w", err)
	}
	resp.Body.Close()
	// 401 is expected without auth but means the server is reachable
	if resp.StatusCode >= 500 {
		return fmt.Errorf("amadeus unhealthy: HTTP %d", resp.StatusCode)
	}
	return nil
}
