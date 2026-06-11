package services

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"github.com/tourismpay/settlement-service/internal/models"
)

type InventorySyncService struct {
	inventory    map[string]*models.InventoryItem
	reservations map[string]*models.InventoryReservation
	syncJobs     map[string]*models.SyncJob
	webhooks     map[string]string
	partnerAPIs  map[string]PartnerAPI
	syncErrors   []SyncError
	mu           sync.RWMutex
}

type PartnerAPI struct {
	URL  string `json:"url"`
	Auth string `json:"auth"`
}

type SyncError struct {
	PartnerID string    `json:"partner_id"`
	Error     string    `json:"error"`
	Timestamp time.Time `json:"timestamp"`
}

func NewInventorySyncService() *InventorySyncService {
	s := &InventorySyncService{
		inventory:    make(map[string]*models.InventoryItem),
		reservations: make(map[string]*models.InventoryReservation),
		syncJobs:     make(map[string]*models.SyncJob),
		webhooks:     make(map[string]string),
		partnerAPIs: map[string]PartnerAPI{
			"safari_lodge":     {URL: "https://api.safarilodge.tz/v1", Auth: "bearer"},
			"serengeti_tours":  {URL: "https://api.serengetitours.com/v2", Auth: "api_key"},
			"zanzibar_resorts": {URL: "https://booking.zanzibarresorts.com/api", Auth: "oauth2"},
			"tanapa":           {URL: "https://api.tanzaniaparks.go.tz/v1", Auth: "certificate"},
			"coastal_aviation": {URL: "https://api.coastal.co.tz/flights", Auth: "basic"},
		},
		syncErrors: make([]SyncError, 0),
	}
	s.initializeDemoInventory()
	return s
}

func (s *InventorySyncService) initializeDemoInventory() {
	demoItems := []models.InventoryItem{
		{ItemID: "SAF001", ProviderID: "serengeti_tours", ItemType: "safari", Name: "5-Day Serengeti Safari", AvailableQuantity: 20, ReservedQuantity: 3, Price: 2500, Currency: "USD", LastSynced: time.Now(), SyncSource: "api"},
		{ItemID: "SAF002", ProviderID: "serengeti_tours", ItemType: "safari", Name: "3-Day Ngorongoro Tour", AvailableQuantity: 15, ReservedQuantity: 2, Price: 1800, Currency: "USD", LastSynced: time.Now(), SyncSource: "api"},
		{ItemID: "HTL001", ProviderID: "safari_lodge", ItemType: "hotel", Name: "Serengeti Safari Lodge - Standard", AvailableQuantity: 50, ReservedQuantity: 8, Price: 250, Currency: "USD", LastSynced: time.Now(), SyncSource: "api"},
		{ItemID: "HTL002", ProviderID: "safari_lodge", ItemType: "hotel", Name: "Serengeti Safari Lodge - Deluxe", AvailableQuantity: 20, ReservedQuantity: 5, Price: 450, Currency: "USD", LastSynced: time.Now(), SyncSource: "api"},
		{ItemID: "HTL003", ProviderID: "zanzibar_resorts", ItemType: "hotel", Name: "Zanzibar Beach Resort - Ocean View", AvailableQuantity: 30, ReservedQuantity: 4, Price: 180, Currency: "USD", LastSynced: time.Now(), SyncSource: "api"},
		{ItemID: "PRK001", ProviderID: "tanapa", ItemType: "park", Name: "Serengeti Entry Permit", AvailableQuantity: 500, ReservedQuantity: 45, Price: 60, Currency: "USD", LastSynced: time.Now(), SyncSource: "api"},
		{ItemID: "PRK002", ProviderID: "tanapa", ItemType: "park", Name: "Ngorongoro Crater Entry", AvailableQuantity: 200, ReservedQuantity: 30, Price: 70, Currency: "USD", LastSynced: time.Now(), SyncSource: "api"},
		{ItemID: "FLT001", ProviderID: "coastal_aviation", ItemType: "flight", Name: "DAR-JRO Flight", AvailableQuantity: 40, ReservedQuantity: 12, Price: 250, Currency: "USD", LastSynced: time.Now(), SyncSource: "api"},
		{ItemID: "FLT002", ProviderID: "coastal_aviation", ItemType: "flight", Name: "DAR-ZNZ Ferry", AvailableQuantity: 100, ReservedQuantity: 25, Price: 70, Currency: "USD", LastSynced: time.Now(), SyncSource: "api"},
	}

	for i := range demoItems {
		s.inventory[demoItems[i].ItemID] = &demoItems[i]
	}
}

func (s *InventorySyncService) generateID(prefix string) string {
	b := make([]byte, 6)
	rand.Read(b)
	return fmt.Sprintf("%s-%s", prefix, hex.EncodeToString(b))
}

func (s *InventorySyncService) ListInventory() []*models.InventoryItem {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*models.InventoryItem, 0, len(s.inventory))
	for _, item := range s.inventory {
		result = append(result, item)
	}
	return result
}

func (s *InventorySyncService) GetInventoryItem(itemID string) *models.InventoryItem {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.inventory[itemID]
}

type AvailabilityResult struct {
	Available         bool    `json:"available"`
	ItemID            string  `json:"item_id"`
	RequestedQuantity int     `json:"requested_quantity"`
	AvailableQuantity int     `json:"available_quantity"`
	PricePerUnit      float64 `json:"price_per_unit"`
	Currency          string  `json:"currency"`
	TotalPrice        float64 `json:"total_price"`
	LastSynced        string  `json:"last_synced"`
	Error             string  `json:"error,omitempty"`
}

func (s *InventorySyncService) CheckAvailability(itemID string, quantity int, date string) AvailabilityResult {
	s.mu.RLock()
	defer s.mu.RUnlock()

	item, ok := s.inventory[itemID]
	if !ok {
		return AvailabilityResult{Available: false, Error: "Item not found"}
	}

	available := item.AvailableQuantity - item.ReservedQuantity

	return AvailabilityResult{
		Available:         available >= quantity,
		ItemID:            itemID,
		RequestedQuantity: quantity,
		AvailableQuantity: available,
		PricePerUnit:      item.Price,
		Currency:          item.Currency,
		TotalPrice:        item.Price * float64(quantity),
		LastSynced:        item.LastSynced.Format(time.RFC3339),
	}
}

type ReservationResult struct {
	Success       bool   `json:"success"`
	ReservationID string `json:"reservation_id,omitempty"`
	ItemID        string `json:"item_id"`
	Quantity      int    `json:"quantity"`
	BookingRef    string `json:"booking_ref,omitempty"`
	ExpiresAt     string `json:"expires_at,omitempty"`
	Error         string `json:"error,omitempty"`
	Available     int    `json:"available,omitempty"`
	Requested     int    `json:"requested,omitempty"`
}

func (s *InventorySyncService) ReserveInventory(itemID string, quantity int, bookingRef string) ReservationResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	item, ok := s.inventory[itemID]
	if !ok {
		return ReservationResult{Success: false, Error: "Item not found"}
	}

	available := item.AvailableQuantity - item.ReservedQuantity
	if available < quantity {
		return ReservationResult{
			Success:   false,
			Error:     "INSUFFICIENT_INVENTORY",
			Available: available,
			Requested: quantity,
		}
	}

	item.ReservedQuantity += quantity

	reservationID := s.generateID("RES")
	expiresAt := time.Now().Add(30 * time.Minute)

	s.reservations[reservationID] = &models.InventoryReservation{
		ReservationID: reservationID,
		ItemID:        itemID,
		Quantity:      quantity,
		BookingRef:    bookingRef,
		ExpiresAt:     expiresAt,
		Status:        "PENDING",
	}

	return ReservationResult{
		Success:       true,
		ReservationID: reservationID,
		ItemID:        itemID,
		Quantity:      quantity,
		BookingRef:    bookingRef,
		ExpiresAt:     expiresAt.Format(time.RFC3339),
	}
}

type ConfirmResult struct {
	Success       bool   `json:"success"`
	ReservationID string `json:"reservation_id"`
	Status        string `json:"status"`
	ConfirmedAt   string `json:"confirmed_at,omitempty"`
	ReleasedAt    string `json:"released_at,omitempty"`
	Error         string `json:"error,omitempty"`
}

func (s *InventorySyncService) ConfirmReservation(reservationID, itemID string, quantity int) ConfirmResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	item, ok := s.inventory[itemID]
	if !ok {
		return ConfirmResult{Success: false, Error: "Item not found"}
	}

	item.AvailableQuantity -= quantity
	item.ReservedQuantity -= quantity

	if res, ok := s.reservations[reservationID]; ok {
		res.Status = "CONFIRMED"
	}

	return ConfirmResult{
		Success:       true,
		ReservationID: reservationID,
		Status:        "CONFIRMED",
		ConfirmedAt:   time.Now().Format(time.RFC3339),
	}
}

func (s *InventorySyncService) ReleaseReservation(reservationID, itemID string, quantity int) ConfirmResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	item, ok := s.inventory[itemID]
	if !ok {
		return ConfirmResult{Success: false, Error: "Item not found"}
	}

	if item.ReservedQuantity >= quantity {
		item.ReservedQuantity -= quantity
	}

	if res, ok := s.reservations[reservationID]; ok {
		res.Status = "RELEASED"
	}

	return ConfirmResult{
		Success:       true,
		ReservationID: reservationID,
		Status:        "RELEASED",
		ReleasedAt:    time.Now().Format(time.RFC3339),
	}
}

type SyncResult struct {
	Success     bool   `json:"success"`
	JobID       string `json:"job_id,omitempty"`
	PartnerID   string `json:"partner_id"`
	ItemsSynced int    `json:"items_synced,omitempty"`
	Error       string `json:"error,omitempty"`
}

func (s *InventorySyncService) SyncPartnerInventory(partnerID string) SyncResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.partnerAPIs[partnerID]; !ok {
		return SyncResult{Success: false, PartnerID: partnerID, Error: fmt.Sprintf("Unknown partner: %s", partnerID)}
	}

	jobID := s.generateID("SYNC")

	s.syncJobs[jobID] = &models.SyncJob{
		JobID:     jobID,
		PartnerID: partnerID,
		Status:    "RUNNING",
		StartedAt: time.Now(),
		Errors:    make([]string, 0),
	}

	syncedCount := 0
	for _, item := range s.inventory {
		if item.ProviderID == partnerID {
			item.LastSynced = time.Now()
			hashVal := int(item.ItemID[len(item.ItemID)-1]) % 5
			item.AvailableQuantity = max(0, item.AvailableQuantity+hashVal-2)
			syncedCount++
		}
	}

	s.syncJobs[jobID].Status = "COMPLETED"
	s.syncJobs[jobID].CompletedAt = time.Now()
	s.syncJobs[jobID].ItemsSynced = syncedCount

	return SyncResult{
		Success:     true,
		JobID:       jobID,
		PartnerID:   partnerID,
		ItemsSynced: syncedCount,
	}
}

func (s *InventorySyncService) ListSyncJobs() []*models.SyncJob {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*models.SyncJob, 0, len(s.syncJobs))
	for _, job := range s.syncJobs {
		result = append(result, job)
	}
	return result
}

type WebhookResult struct {
	Success      bool   `json:"success"`
	PartnerID    string `json:"partner_id"`
	WebhookURL   string `json:"webhook_url"`
	RegisteredAt string `json:"registered_at"`
}

func (s *InventorySyncService) RegisterWebhook(partnerID, webhookURL string) WebhookResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.webhooks[partnerID] = webhookURL

	return WebhookResult{
		Success:      true,
		PartnerID:    partnerID,
		WebhookURL:   webhookURL,
		RegisteredAt: time.Now().Format(time.RFC3339),
	}
}

type InventoryStatus struct {
	Service            string   `json:"service"`
	Status             string   `json:"status"`
	TotalItems         int      `json:"total_items"`
	Partners           []string `json:"partners"`
	ActiveWebhooks     int      `json:"active_webhooks"`
	SyncJobsCompleted  int      `json:"sync_jobs_completed"`
	SyncErrors         int      `json:"sync_errors"`
}

func (s *InventorySyncService) GetStatus() InventoryStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	partners := make([]string, 0, len(s.partnerAPIs))
	for p := range s.partnerAPIs {
		partners = append(partners, p)
	}

	completedJobs := 0
	for _, job := range s.syncJobs {
		if job.Status == "COMPLETED" {
			completedJobs++
		}
	}

	return InventoryStatus{
		Service:           "Inventory Sync (Go)",
		Status:            "OPERATIONAL",
		TotalItems:        len(s.inventory),
		Partners:          partners,
		ActiveWebhooks:    len(s.webhooks),
		SyncJobsCompleted: completedJobs,
		SyncErrors:        len(s.syncErrors),
	}
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
