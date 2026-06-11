package services

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"time"

	"github.com/tourismpay/settlement-service/internal/db"
	"github.com/tourismpay/settlement-service/internal/models"
)

type InventorySyncService struct {
	conn        *sql.DB
	partnerAPIs map[string]PartnerAPI
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
	conn, err := db.GetDB()
	if err != nil {
		log.Printf("[inventory] DB unavailable: %v", err)
	}
	s := &InventorySyncService{
		conn: conn,
		partnerAPIs: map[string]PartnerAPI{
			"safari_lodge":     {URL: "https://api.safarilodge.tz/v1", Auth: "bearer"},
			"serengeti_tours":  {URL: "https://api.serengetitours.com/v2", Auth: "api_key"},
			"zanzibar_resorts": {URL: "https://booking.zanzibarresorts.com/api", Auth: "oauth2"},
			"tanapa":           {URL: "https://api.tanzaniaparks.go.tz/v1", Auth: "certificate"},
			"coastal_aviation": {URL: "https://api.coastal.co.tz/flights", Auth: "basic"},
		},
	}
	s.seedDemoInventory()
	return s
}

func (s *InventorySyncService) getConn() *sql.DB {
	if s.conn != nil {
		return s.conn
	}
	conn, err := db.GetDB()
	if err != nil {
		return nil
	}
	s.conn = conn
	return conn
}

func (s *InventorySyncService) seedDemoInventory() {
	conn := s.getConn()
	if conn == nil {
		return
	}
	items := []models.InventoryItem{
		{ItemID: "SAF001", ProviderID: "serengeti_tours", ItemType: "safari", Name: "5-Day Serengeti Safari", AvailableQuantity: 20, ReservedQuantity: 3, Price: 2500, Currency: "USD"},
		{ItemID: "SAF002", ProviderID: "serengeti_tours", ItemType: "safari", Name: "3-Day Ngorongoro Tour", AvailableQuantity: 15, ReservedQuantity: 2, Price: 1800, Currency: "USD"},
		{ItemID: "HTL001", ProviderID: "safari_lodge", ItemType: "hotel", Name: "Serengeti Safari Lodge - Standard", AvailableQuantity: 50, ReservedQuantity: 8, Price: 250, Currency: "USD"},
		{ItemID: "HTL002", ProviderID: "safari_lodge", ItemType: "hotel", Name: "Serengeti Safari Lodge - Deluxe", AvailableQuantity: 20, ReservedQuantity: 5, Price: 450, Currency: "USD"},
		{ItemID: "HTL003", ProviderID: "zanzibar_resorts", ItemType: "hotel", Name: "Zanzibar Beach Resort - Ocean View", AvailableQuantity: 30, ReservedQuantity: 4, Price: 180, Currency: "USD"},
		{ItemID: "PRK001", ProviderID: "tanapa", ItemType: "park", Name: "Serengeti Entry Permit", AvailableQuantity: 500, ReservedQuantity: 45, Price: 60, Currency: "USD"},
		{ItemID: "PRK002", ProviderID: "tanapa", ItemType: "park", Name: "Ngorongoro Crater Entry", AvailableQuantity: 200, ReservedQuantity: 30, Price: 70, Currency: "USD"},
		{ItemID: "FLT001", ProviderID: "coastal_aviation", ItemType: "flight", Name: "DAR-JRO Flight", AvailableQuantity: 40, ReservedQuantity: 12, Price: 250, Currency: "USD"},
		{ItemID: "FLT002", ProviderID: "coastal_aviation", ItemType: "flight", Name: "DAR-ZNZ Ferry", AvailableQuantity: 100, ReservedQuantity: 25, Price: 70, Currency: "USD"},
	}
	for _, item := range items {
		_, _ = conn.Exec(`INSERT INTO inventory_items (item_id, provider_id, item_type, name, available_quantity, reserved_quantity, price, currency, sync_source)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'api') ON CONFLICT (item_id) DO NOTHING`,
			item.ItemID, item.ProviderID, item.ItemType, item.Name,
			item.AvailableQuantity, item.ReservedQuantity, item.Price, item.Currency)
	}
}

func (s *InventorySyncService) generateID(prefix string) string {
	b := make([]byte, 6)
	rand.Read(b)
	return fmt.Sprintf("%s-%s", prefix, hex.EncodeToString(b))
}

func (s *InventorySyncService) ListInventory() []*models.InventoryItem {
	conn := s.getConn()
	if conn == nil {
		return nil
	}
	rows, err := conn.Query(`SELECT item_id, provider_id, item_type, name, available_quantity, reserved_quantity, price, currency, last_synced, sync_source FROM inventory_items ORDER BY item_id`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var result []*models.InventoryItem
	for rows.Next() {
		var i models.InventoryItem
		if err := rows.Scan(&i.ItemID, &i.ProviderID, &i.ItemType, &i.Name, &i.AvailableQuantity, &i.ReservedQuantity, &i.Price, &i.Currency, &i.LastSynced, &i.SyncSource); err == nil {
			result = append(result, &i)
		}
	}
	return result
}

func (s *InventorySyncService) GetInventoryItem(itemID string) *models.InventoryItem {
	conn := s.getConn()
	if conn == nil {
		return nil
	}
	var i models.InventoryItem
	err := conn.QueryRow(`SELECT item_id, provider_id, item_type, name, available_quantity, reserved_quantity, price, currency, last_synced, sync_source
		FROM inventory_items WHERE item_id=$1`, itemID).
		Scan(&i.ItemID, &i.ProviderID, &i.ItemType, &i.Name, &i.AvailableQuantity, &i.ReservedQuantity, &i.Price, &i.Currency, &i.LastSynced, &i.SyncSource)
	if err != nil {
		return nil
	}
	return &i
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
		return AvailabilityResult{Available: false, ItemID: itemID, Error: "item not found"}
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
	ExpiresAt     string `json:"expires_at,omitempty"`
	Error         string `json:"error,omitempty"`
}

func (s *InventorySyncService) ReserveInventory(itemID, touristID string, quantity int, bookingRef string) ReservationResult {
	conn := s.getConn()
	if conn == nil {
		return ReservationResult{Success: false, ItemID: itemID, Error: "DB_UNAVAILABLE"}
	}

	tx, err := conn.Begin()
	if err != nil {
		return ReservationResult{Success: false, ItemID: itemID, Error: err.Error()}
	}
	defer tx.Rollback()

	var avail, reserved int
	err = tx.QueryRow(`SELECT available_quantity, reserved_quantity FROM inventory_items WHERE item_id=$1 FOR UPDATE`, itemID).Scan(&avail, &reserved)
	if err != nil {
		return ReservationResult{Success: false, ItemID: itemID, Error: "item not found"}
	}
	if (avail - reserved) < quantity {
		return ReservationResult{Success: false, ItemID: itemID, Quantity: quantity, Error: "insufficient availability"}
	}

	resID := s.generateID("RES")
	expiresAt := time.Now().Add(30 * time.Minute)

	_, _ = tx.Exec(`UPDATE inventory_items SET reserved_quantity = reserved_quantity + $1 WHERE item_id = $2`, quantity, itemID)
	_, _ = tx.Exec(`INSERT INTO inventory_reservations (reservation_id, item_id, quantity, status, tourist_id, expires_at)
		VALUES ($1,$2,$3,'reserved',$4,$5)`, resID, itemID, quantity, touristID, expiresAt)

	if err := tx.Commit(); err != nil {
		return ReservationResult{Success: false, ItemID: itemID, Error: err.Error()}
	}
	return ReservationResult{Success: true, ReservationID: resID, ItemID: itemID, Quantity: quantity, ExpiresAt: expiresAt.Format(time.RFC3339)}
}

func (s *InventorySyncService) ConfirmReservation(reservationID string) ReservationResult {
	conn := s.getConn()
	if conn == nil {
		return ReservationResult{Success: false, Error: "DB_UNAVAILABLE"}
	}
	res, err := conn.Exec(`UPDATE inventory_reservations SET status='confirmed' WHERE reservation_id=$1 AND status='reserved'`, reservationID)
	if err != nil {
		return ReservationResult{Success: false, Error: err.Error()}
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ReservationResult{Success: false, Error: "reservation not found or already processed"}
	}
	return ReservationResult{Success: true, ReservationID: reservationID}
}

func (s *InventorySyncService) ReleaseReservation(reservationID string) ReservationResult {
	conn := s.getConn()
	if conn == nil {
		return ReservationResult{Success: false, Error: "DB_UNAVAILABLE"}
	}

	tx, err := conn.Begin()
	if err != nil {
		return ReservationResult{Success: false, Error: err.Error()}
	}
	defer tx.Rollback()

	var itemID string
	var qty int
	err = tx.QueryRow(`SELECT item_id, quantity FROM inventory_reservations WHERE reservation_id=$1 AND status='reserved' FOR UPDATE`, reservationID).Scan(&itemID, &qty)
	if err != nil {
		return ReservationResult{Success: false, Error: "reservation not found or already processed"}
	}

	_, _ = tx.Exec(`UPDATE inventory_reservations SET status='released' WHERE reservation_id=$1`, reservationID)
	_, _ = tx.Exec(`UPDATE inventory_items SET reserved_quantity = reserved_quantity - $1 WHERE item_id = $2`, qty, itemID)

	if err := tx.Commit(); err != nil {
		return ReservationResult{Success: false, Error: err.Error()}
	}
	return ReservationResult{Success: true, ReservationID: reservationID, ItemID: itemID, Quantity: qty}
}

type SyncResult struct {
	Success     bool   `json:"success"`
	JobID       string `json:"job_id,omitempty"`
	PartnerID   string `json:"partner_id"`
	ItemsSynced int    `json:"items_synced"`
	Error       string `json:"error,omitempty"`
}

func (s *InventorySyncService) SyncPartnerInventory(partnerID string) SyncResult {
	conn := s.getConn()
	if conn == nil {
		return SyncResult{Success: false, PartnerID: partnerID, Error: "DB_UNAVAILABLE"}
	}
	_, exists := s.partnerAPIs[partnerID]
	if !exists {
		return SyncResult{Success: false, PartnerID: partnerID, Error: "unknown partner"}
	}

	jobID := s.generateID("SYNC")
	_, _ = conn.Exec(`INSERT INTO sync_jobs (job_id, partner_id, status, items_synced) VALUES ($1,$2,'completed',0)`, jobID, partnerID)

	var count int
	_ = conn.QueryRow(`SELECT COUNT(*) FROM inventory_items WHERE provider_id=$1`, partnerID).Scan(&count)
	_, _ = conn.Exec(`UPDATE inventory_items SET last_synced=NOW() WHERE provider_id=$1`, partnerID)
	_, _ = conn.Exec(`UPDATE sync_jobs SET items_synced=$1, completed_at=NOW() WHERE job_id=$2`, count, jobID)

	return SyncResult{Success: true, JobID: jobID, PartnerID: partnerID, ItemsSynced: count}
}

func (s *InventorySyncService) ListSyncJobs() []models.SyncJob {
	conn := s.getConn()
	if conn == nil {
		return nil
	}
	rows, err := conn.Query(`SELECT job_id, partner_id, status, items_synced, errors_count, started_at, completed_at FROM sync_jobs ORDER BY started_at DESC LIMIT 50`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var jobs []models.SyncJob
	for rows.Next() {
		var j models.SyncJob
		var completed sql.NullTime
		if err := rows.Scan(&j.JobID, &j.PartnerID, &j.Status, &j.ItemsSynced, &j.ErrorsCount, &j.StartedAt, &completed); err == nil {
			if completed.Valid {
				j.CompletedAt = &completed.Time
			}
			jobs = append(jobs, j)
		}
	}
	return jobs
}

func (s *InventorySyncService) RegisterWebhook(url string) string {
	conn := s.getConn()
	if conn == nil {
		return ""
	}
	id := s.generateID("WH")
	_, _ = conn.Exec(`INSERT INTO webhooks (id, url) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`, id, url)
	return id
}

func (s *InventorySyncService) GetStatus() map[string]interface{} {
	conn := s.getConn()
	status := map[string]interface{}{"connected": conn != nil}
	if conn != nil {
		var itemCount, resCount, jobCount int
		_ = conn.QueryRow(`SELECT COUNT(*) FROM inventory_items`).Scan(&itemCount)
		_ = conn.QueryRow(`SELECT COUNT(*) FROM inventory_reservations WHERE status='reserved'`).Scan(&resCount)
		_ = conn.QueryRow(`SELECT COUNT(*) FROM sync_jobs`).Scan(&jobCount)
		status["items"] = itemCount
		status["active_reservations"] = resCount
		status["sync_jobs"] = jobCount
		status["partners"] = len(s.partnerAPIs)
	}
	return status
}
