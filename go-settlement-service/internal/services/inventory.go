package services

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"github.com/tourismpay/settlement-service/internal/database"
	"github.com/tourismpay/settlement-service/internal/models"
)

type InventorySyncService struct {
	// In-memory fallback when database is unavailable
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
	s.seedInventoryIfEmpty()
	return s
}

func (s *InventorySyncService) db() *sql.DB {
	return database.DB
}

func (s *InventorySyncService) hasDB() bool {
	return s.db() != nil
}

func (s *InventorySyncService) generateID(prefix string) string {
	b := make([]byte, 6)
	rand.Read(b)
	return fmt.Sprintf("%s-%s", prefix, hex.EncodeToString(b))
}

func (s *InventorySyncService) seedInventoryIfEmpty() {
	if s.hasDB() {
		var count int
		err := s.db().QueryRow("SELECT COUNT(*) FROM inventory_items").Scan(&count)
		if err == nil && count > 0 {
			return
		}
		demoItems := defaultDemoItems()
		for _, item := range demoItems {
			_, _ = s.db().Exec(
				`INSERT INTO inventory_items (item_id, provider_id, item_type, name, available_quantity, reserved_quantity, price, currency, last_synced, sync_source)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (item_id) DO NOTHING`,
				item.ItemID, item.ProviderID, item.ItemType, item.Name,
				item.AvailableQuantity, item.ReservedQuantity, item.Price, item.Currency,
				item.LastSynced, item.SyncSource,
			)
		}
		return
	}
	// Fallback: populate in-memory
	for _, item := range defaultDemoItems() {
		cp := item
		s.inventory[cp.ItemID] = &cp
	}
}

func defaultDemoItems() []models.InventoryItem {
	now := time.Now()
	return []models.InventoryItem{
		{ItemID: "SAF001", ProviderID: "serengeti_tours", ItemType: "safari", Name: "5-Day Serengeti Safari", AvailableQuantity: 20, ReservedQuantity: 3, Price: 2500, Currency: "USD", LastSynced: now, SyncSource: "api"},
		{ItemID: "SAF002", ProviderID: "serengeti_tours", ItemType: "safari", Name: "3-Day Ngorongoro Tour", AvailableQuantity: 15, ReservedQuantity: 2, Price: 1800, Currency: "USD", LastSynced: now, SyncSource: "api"},
		{ItemID: "HTL001", ProviderID: "safari_lodge", ItemType: "hotel", Name: "Serengeti Safari Lodge - Standard", AvailableQuantity: 50, ReservedQuantity: 8, Price: 250, Currency: "USD", LastSynced: now, SyncSource: "api"},
		{ItemID: "HTL002", ProviderID: "safari_lodge", ItemType: "hotel", Name: "Serengeti Safari Lodge - Deluxe", AvailableQuantity: 20, ReservedQuantity: 5, Price: 450, Currency: "USD", LastSynced: now, SyncSource: "api"},
		{ItemID: "HTL003", ProviderID: "zanzibar_resorts", ItemType: "hotel", Name: "Zanzibar Beach Resort - Ocean View", AvailableQuantity: 30, ReservedQuantity: 4, Price: 180, Currency: "USD", LastSynced: now, SyncSource: "api"},
		{ItemID: "PRK001", ProviderID: "tanapa", ItemType: "park", Name: "Serengeti Entry Permit", AvailableQuantity: 500, ReservedQuantity: 45, Price: 60, Currency: "USD", LastSynced: now, SyncSource: "api"},
		{ItemID: "PRK002", ProviderID: "tanapa", ItemType: "park", Name: "Ngorongoro Crater Entry", AvailableQuantity: 200, ReservedQuantity: 30, Price: 70, Currency: "USD", LastSynced: now, SyncSource: "api"},
		{ItemID: "FLT001", ProviderID: "coastal_aviation", ItemType: "flight", Name: "DAR-JRO Flight", AvailableQuantity: 40, ReservedQuantity: 12, Price: 250, Currency: "USD", LastSynced: now, SyncSource: "api"},
		{ItemID: "FLT002", ProviderID: "coastal_aviation", ItemType: "flight", Name: "DAR-ZNZ Ferry", AvailableQuantity: 100, ReservedQuantity: 25, Price: 70, Currency: "USD", LastSynced: now, SyncSource: "api"},
	}
}

func (s *InventorySyncService) ListInventory() []*models.InventoryItem {
	if s.hasDB() {
		rows, err := s.db().Query("SELECT item_id, provider_id, item_type, name, available_quantity, reserved_quantity, price, currency, last_synced, sync_source FROM inventory_items ORDER BY item_id")
		if err == nil {
			defer rows.Close()
			result := make([]*models.InventoryItem, 0)
			for rows.Next() {
				item := &models.InventoryItem{}
				if err := rows.Scan(&item.ItemID, &item.ProviderID, &item.ItemType, &item.Name, &item.AvailableQuantity, &item.ReservedQuantity, &item.Price, &item.Currency, &item.LastSynced, &item.SyncSource); err == nil {
					result = append(result, item)
				}
			}
			return result
		}
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]*models.InventoryItem, 0, len(s.inventory))
	for _, item := range s.inventory {
		result = append(result, item)
	}
	return result
}

func (s *InventorySyncService) GetInventoryItem(itemID string) *models.InventoryItem {
	if s.hasDB() {
		item := &models.InventoryItem{}
		err := s.db().QueryRow(
			"SELECT item_id, provider_id, item_type, name, available_quantity, reserved_quantity, price, currency, last_synced, sync_source FROM inventory_items WHERE item_id=$1", itemID,
		).Scan(&item.ItemID, &item.ProviderID, &item.ItemType, &item.Name, &item.AvailableQuantity, &item.ReservedQuantity, &item.Price, &item.Currency, &item.LastSynced, &item.SyncSource)
		if err == nil {
			return item
		}
	}
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
	item := s.GetInventoryItem(itemID)
	if item == nil {
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
	if s.hasDB() {
		return s.reserveInventoryDB(itemID, quantity, bookingRef)
	}
	return s.reserveInventoryMem(itemID, quantity, bookingRef)
}

func (s *InventorySyncService) reserveInventoryDB(itemID string, quantity int, bookingRef string) ReservationResult {
	ctx := context.Background()
	tx, err := s.db().BeginTx(ctx, nil)
	if err != nil {
		return s.reserveInventoryMem(itemID, quantity, bookingRef)
	}
	defer tx.Rollback()

	var avail, reserved int
	err = tx.QueryRow("SELECT available_quantity, reserved_quantity FROM inventory_items WHERE item_id=$1 FOR UPDATE", itemID).Scan(&avail, &reserved)
	if err != nil {
		return ReservationResult{Success: false, Error: "Item not found"}
	}
	netAvail := avail - reserved
	if netAvail < quantity {
		return ReservationResult{Success: false, Error: "INSUFFICIENT_INVENTORY", Available: netAvail, Requested: quantity}
	}

	_, err = tx.Exec("UPDATE inventory_items SET reserved_quantity = reserved_quantity + $1 WHERE item_id=$2", quantity, itemID)
	if err != nil {
		return ReservationResult{Success: false, Error: err.Error()}
	}

	reservationID := s.generateID("RES")
	expiresAt := time.Now().Add(30 * time.Minute)
	_, err = tx.Exec(
		"INSERT INTO inventory_reservations (reservation_id, item_id, quantity, booking_ref, status, expires_at) VALUES ($1,$2,$3,$4,$5,$6)",
		reservationID, itemID, quantity, bookingRef, "PENDING", expiresAt,
	)
	if err != nil {
		return ReservationResult{Success: false, Error: err.Error()}
	}

	if err := tx.Commit(); err != nil {
		return ReservationResult{Success: false, Error: err.Error()}
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

func (s *InventorySyncService) reserveInventoryMem(itemID string, quantity int, bookingRef string) ReservationResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	item, ok := s.inventory[itemID]
	if !ok {
		return ReservationResult{Success: false, Error: "Item not found"}
	}
	available := item.AvailableQuantity - item.ReservedQuantity
	if available < quantity {
		return ReservationResult{Success: false, Error: "INSUFFICIENT_INVENTORY", Available: available, Requested: quantity}
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
	if s.hasDB() {
		_, err := s.db().Exec("UPDATE inventory_items SET available_quantity = available_quantity - $1, reserved_quantity = reserved_quantity - $1 WHERE item_id=$2", quantity, itemID)
		if err == nil {
			s.db().Exec("UPDATE inventory_reservations SET status='CONFIRMED' WHERE reservation_id=$1", reservationID)
			return ConfirmResult{Success: true, ReservationID: reservationID, Status: "CONFIRMED", ConfirmedAt: time.Now().Format(time.RFC3339)}
		}
	}
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
	return ConfirmResult{Success: true, ReservationID: reservationID, Status: "CONFIRMED", ConfirmedAt: time.Now().Format(time.RFC3339)}
}

func (s *InventorySyncService) ReleaseReservation(reservationID, itemID string, quantity int) ConfirmResult {
	if s.hasDB() {
		_, err := s.db().Exec("UPDATE inventory_items SET reserved_quantity = GREATEST(0, reserved_quantity - $1) WHERE item_id=$2", quantity, itemID)
		if err == nil {
			s.db().Exec("UPDATE inventory_reservations SET status='RELEASED' WHERE reservation_id=$1", reservationID)
			return ConfirmResult{Success: true, ReservationID: reservationID, Status: "RELEASED", ReleasedAt: time.Now().Format(time.RFC3339)}
		}
	}
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
	return ConfirmResult{Success: true, ReservationID: reservationID, Status: "RELEASED", ReleasedAt: time.Now().Format(time.RFC3339)}
}

type SyncResult struct {
	Success     bool   `json:"success"`
	JobID       string `json:"job_id,omitempty"`
	PartnerID   string `json:"partner_id"`
	ItemsSynced int    `json:"items_synced,omitempty"`
	Error       string `json:"error,omitempty"`
}

func (s *InventorySyncService) SyncPartnerInventory(partnerID string) SyncResult {
	if _, ok := s.partnerAPIs[partnerID]; !ok {
		return SyncResult{Success: false, PartnerID: partnerID, Error: fmt.Sprintf("Unknown partner: %s", partnerID)}
	}

	jobID := s.generateID("SYNC")

	if s.hasDB() {
		s.db().Exec("INSERT INTO sync_jobs (job_id, partner_id, status, started_at) VALUES ($1,$2,'RUNNING',NOW())", jobID, partnerID)
		res, err := s.db().Exec("UPDATE inventory_items SET last_synced=NOW() WHERE provider_id=$1", partnerID)
		syncedCount := 0
		if err == nil {
			n, _ := res.RowsAffected()
			syncedCount = int(n)
		}
		s.db().Exec("UPDATE sync_jobs SET status='COMPLETED', items_synced=$1, completed_at=NOW() WHERE job_id=$2", syncedCount, jobID)
		return SyncResult{Success: true, JobID: jobID, PartnerID: partnerID, ItemsSynced: syncedCount}
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.syncJobs[jobID] = &models.SyncJob{JobID: jobID, PartnerID: partnerID, Status: "RUNNING", StartedAt: time.Now(), Errors: make([]string, 0)}
	syncedCount := 0
	for _, item := range s.inventory {
		if item.ProviderID == partnerID {
			item.LastSynced = time.Now()
			syncedCount++
		}
	}
	s.syncJobs[jobID].Status = "COMPLETED"
	s.syncJobs[jobID].CompletedAt = time.Now()
	s.syncJobs[jobID].ItemsSynced = syncedCount
	return SyncResult{Success: true, JobID: jobID, PartnerID: partnerID, ItemsSynced: syncedCount}
}

func (s *InventorySyncService) ListSyncJobs() []*models.SyncJob {
	if s.hasDB() {
		rows, err := s.db().Query("SELECT job_id, partner_id, status, items_synced, started_at, completed_at FROM sync_jobs ORDER BY started_at DESC LIMIT 50")
		if err == nil {
			defer rows.Close()
			result := make([]*models.SyncJob, 0)
			for rows.Next() {
				job := &models.SyncJob{}
				var completedAt sql.NullTime
				if err := rows.Scan(&job.JobID, &job.PartnerID, &job.Status, &job.ItemsSynced, &job.StartedAt, &completedAt); err == nil {
					if completedAt.Valid {
						job.CompletedAt = completedAt.Time
					}
					job.Errors = make([]string, 0)
					result = append(result, job)
				}
			}
			return result
		}
	}
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
	if s.hasDB() {
		_, err := s.db().Exec(
			"INSERT INTO partner_webhooks (partner_id, webhook_url, registered_at) VALUES ($1,$2,NOW()) ON CONFLICT (partner_id) DO UPDATE SET webhook_url=$2, registered_at=NOW()",
			partnerID, webhookURL,
		)
		if err == nil {
			return WebhookResult{Success: true, PartnerID: partnerID, WebhookURL: webhookURL, RegisteredAt: time.Now().Format(time.RFC3339)}
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.webhooks[partnerID] = webhookURL
	return WebhookResult{Success: true, PartnerID: partnerID, WebhookURL: webhookURL, RegisteredAt: time.Now().Format(time.RFC3339)}
}

type InventoryStatus struct {
	Service            string   `json:"service"`
	Status             string   `json:"status"`
	TotalItems         int      `json:"total_items"`
	Partners           []string `json:"partners"`
	ActiveWebhooks     int      `json:"active_webhooks"`
	SyncJobsCompleted  int      `json:"sync_jobs_completed"`
	SyncErrors         int      `json:"sync_errors"`
	DatabaseConnected  bool     `json:"database_connected"`
}

func (s *InventorySyncService) GetStatus() InventoryStatus {
	partners := make([]string, 0, len(s.partnerAPIs))
	for p := range s.partnerAPIs {
		partners = append(partners, p)
	}

	if s.hasDB() {
		var totalItems, webhookCount, completedJobs int
		s.db().QueryRow("SELECT COUNT(*) FROM inventory_items").Scan(&totalItems)
		s.db().QueryRow("SELECT COUNT(*) FROM partner_webhooks").Scan(&webhookCount)
		s.db().QueryRow("SELECT COUNT(*) FROM sync_jobs WHERE status='COMPLETED'").Scan(&completedJobs)
		return InventoryStatus{
			Service:           "Inventory Sync (Go+PostgreSQL)",
			Status:            "OPERATIONAL",
			TotalItems:        totalItems,
			Partners:          partners,
			ActiveWebhooks:    webhookCount,
			SyncJobsCompleted: completedJobs,
			SyncErrors:        0,
			DatabaseConnected: true,
		}
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	completedJobs := 0
	for _, job := range s.syncJobs {
		if job.Status == "COMPLETED" {
			completedJobs++
		}
	}
	return InventoryStatus{
		Service:           "Inventory Sync (Go+In-Memory Fallback)",
		Status:            "OPERATIONAL",
		TotalItems:        len(s.inventory),
		Partners:          partners,
		ActiveWebhooks:    len(s.webhooks),
		SyncJobsCompleted: completedJobs,
		SyncErrors:        len(s.syncErrors),
		DatabaseConnected: false,
	}
}
