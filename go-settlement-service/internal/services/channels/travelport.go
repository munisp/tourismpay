package channels

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// TravelportConnector implements the Connector interface for Travelport (Galileo/Apollo/Worldspan).
// Uses Travelport Universal API (UAPI) for GDS distribution.
// API: https://developer.travelport.com/
type TravelportConnector struct {
	client  *http.Client
	baseURL string
}

func NewTravelportConnector() *TravelportConnector {
	return &TravelportConnector{
		client:  &http.Client{Timeout: 30 * time.Second},
		baseURL: "https://api.travelport.com/v2",
	}
}

func (t *TravelportConnector) Name() string { return "travelport" }

func (t *TravelportConnector) PushRates(ctx context.Context, rates []RateUpdate) (*SyncResult, error) {
	start := time.Now()
	result := &SyncResult{
		ChannelID:  "travelport",
		Operation:  "rate_push",
		Timestamp:  start,
		ItemsTotal: len(rates),
	}

	type TPRate struct {
		PropertyCode string  `json:"propertyCode"`
		RateCode     string  `json:"rateCode"`
		RoomCode     string  `json:"roomCode"`
		StartDate    string  `json:"startDate"`
		EndDate      string  `json:"endDate"`
		Amount       float64 `json:"amount"`
		Currency     string  `json:"currencyCode"`
	}

	tpRates := make([]TPRate, 0, len(rates))
	for _, r := range rates {
		tpRates = append(tpRates, TPRate{
			PropertyCode: fmt.Sprintf("TP%d", r.EstablishmentID),
			RateCode:     r.RatePlanCode,
			RoomCode:     r.RoomTypeCode,
			StartDate:    r.Date,
			EndDate:      r.Date,
			Amount:       r.Price,
			Currency:     r.Currency,
		})
	}

	payload := map[string]interface{}{
		"HotelRateDistribution": map[string]interface{}{
			"Rates": tpRates,
		},
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, t.baseURL+"/hotel/rates", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := t.client.Do(req)
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

func (t *TravelportConnector) PushAvailability(ctx context.Context, updates []AvailabilityUpdate) (*SyncResult, error) {
	start := time.Now()
	result := &SyncResult{
		ChannelID:  "travelport",
		Operation:  "availability_push",
		Timestamp:  start,
		ItemsTotal: len(updates),
	}

	type TPAvail struct {
		PropertyCode string `json:"propertyCode"`
		Date         string `json:"date"`
		Available    int    `json:"availableRooms"`
		Restriction  string `json:"restriction,omitempty"` // "OPEN", "CLOSED"
	}

	avails := make([]TPAvail, 0, len(updates))
	for _, u := range updates {
		restriction := "OPEN"
		if u.IsBlocked {
			restriction = "CLOSED"
		}
		avails = append(avails, TPAvail{
			PropertyCode: fmt.Sprintf("TP%d", u.EstablishmentID),
			Date:         u.Date,
			Available:    u.AvailableSlots,
			Restriction:  restriction,
		})
	}

	payload := map[string]interface{}{"availability": avails}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, t.baseURL+"/hotel/availability", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := t.client.Do(req)
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

func (t *TravelportConnector) PullBookings(ctx context.Context, since time.Time) ([]InboundBooking, error) {
	url := fmt.Sprintf("%s/hotel/reservations?modifiedSince=%s", t.baseURL, since.Format(time.RFC3339))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := t.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("travelport booking pull failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("travelport: HTTP %d", resp.StatusCode)
	}

	var tpResp struct {
		Reservations []struct {
			LocatorCode string  `json:"locatorCode"`
			GuestName   string  `json:"guestName"`
			GuestEmail  string  `json:"guestEmail"`
			CheckIn     string  `json:"checkIn"`
			CheckOut    string  `json:"checkOut"`
			RoomCount   int     `json:"roomCount"`
			TotalFare   float64 `json:"totalFare"`
			Currency    string  `json:"currency"`
			Status      string  `json:"status"`
		} `json:"reservations"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&tpResp); err != nil {
		return nil, err
	}

	bookings := make([]InboundBooking, 0, len(tpResp.Reservations))
	for _, r := range tpResp.Reservations {
		bookings = append(bookings, InboundBooking{
			ID:                generateID("bk"),
			ChannelID:         "travelport",
			ChannelBookingRef: r.LocatorCode,
			GuestName:         r.GuestName,
			GuestEmail:        r.GuestEmail,
			CheckIn:           r.CheckIn,
			CheckOut:          r.CheckOut,
			PartySize:         r.RoomCount,
			TotalPrice:        r.TotalFare,
			Currency:          r.Currency,
			Status:            r.Status,
			ReceivedAt:        time.Now(),
		})
	}

	return bookings, nil
}

func (t *TravelportConnector) ConfirmBooking(ctx context.Context, ref string) error {
	url := fmt.Sprintf("%s/hotel/reservations/%s/confirm", t.baseURL, ref)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	resp, err := t.client.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

func (t *TravelportConnector) CancelBooking(ctx context.Context, ref string, reason string) error {
	payload, _ := json.Marshal(map[string]string{"reason": reason})
	url := fmt.Sprintf("%s/hotel/reservations/%s/cancel", t.baseURL, ref)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp, err := t.client.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

func (t *TravelportConnector) ValidateConfig(cfg ChannelConfig) error {
	if cfg.APIKey == "" {
		return fmt.Errorf("Travelport UAPI credentials required")
	}
	if cfg.PropertyID == "" {
		return fmt.Errorf("Travelport property chain code required")
	}
	return nil
}

func (t *TravelportConnector) HealthCheck(ctx context.Context) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, t.baseURL+"/system/ping", nil)
	resp, err := t.client.Do(req)
	if err != nil {
		return fmt.Errorf("travelport unreachable: %w", err)
	}
	resp.Body.Close()
	if resp.StatusCode >= 500 {
		return fmt.Errorf("travelport unhealthy: HTTP %d", resp.StatusCode)
	}
	return nil
}
