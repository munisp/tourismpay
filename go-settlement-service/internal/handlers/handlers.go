package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/tourismpay/settlement-service/internal/models"
	"github.com/tourismpay/settlement-service/internal/services"
)

type Handlers struct {
	ledger     *services.TigerBeetleLedgerService
	mojaloop   *services.MojaloopDFSPService
	inventory  *services.InventorySyncService
	settlement *services.SettlementService
}

func NewHandlers(
	ledger *services.TigerBeetleLedgerService,
	mojaloop *services.MojaloopDFSPService,
	inventory *services.InventorySyncService,
	settlement *services.SettlementService,
) *Handlers {
	return &Handlers{
		ledger:     ledger,
		mojaloop:   mojaloop,
		inventory:  inventory,
		settlement: settlement,
	}
}

// TigerBeetle Ledger Handlers

type CreateAccountRequest struct {
	EntityType string `json:"entity_type" binding:"required"`
	EntityID   string `json:"entity_id" binding:"required"`
	Currency   string `json:"currency" binding:"required"`
	Flags      uint32 `json:"flags"`
}

func (h *Handlers) CreateAccount(c *gin.Context) {
	var req CreateAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	account := h.ledger.CreateAccount(req.EntityType, req.EntityID, req.Currency, models.AccountFlags(req.Flags))
	c.JSON(http.StatusCreated, account)
}

func (h *Handlers) GetAccount(c *gin.Context) {
	entityType := c.Query("entity_type")
	entityID := c.Query("entity_id")
	currency := c.Query("currency")

	if entityType == "" || entityID == "" || currency == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "entity_type, entity_id, and currency are required"})
		return
	}

	account := h.ledger.GetAccount(entityType, entityID, currency)
	if account == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Account not found"})
		return
	}

	c.JSON(http.StatusOK, account)
}

func (h *Handlers) GetAccountBalance(c *gin.Context) {
	entityType := c.Query("entity_type")
	entityID := c.Query("entity_id")
	currency := c.Query("currency")

	if entityType == "" || entityID == "" || currency == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "entity_type, entity_id, and currency are required"})
		return
	}

	balance := h.ledger.GetAccountBalance(entityType, entityID, currency)
	c.JSON(http.StatusOK, balance)
}

type CreateTransferRequest struct {
	FromType  string `json:"from_type" binding:"required"`
	FromID    string `json:"from_id" binding:"required"`
	ToType    string `json:"to_type" binding:"required"`
	ToID      string `json:"to_id" binding:"required"`
	Currency  string `json:"currency" binding:"required"`
	Amount    uint64 `json:"amount" binding:"required"`
	Pending   bool   `json:"pending"`
	Reference string `json:"reference"`
}

func (h *Handlers) CreateTransfer(c *gin.Context) {
	var req CreateTransferRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := h.ledger.CreateTransfer(
		req.FromType, req.FromID,
		req.ToType, req.ToID,
		req.Currency, req.Amount,
		req.Pending, req.Reference,
	)

	if !result.Success {
		c.JSON(http.StatusBadRequest, result)
		return
	}

	c.JSON(http.StatusCreated, result)
}

type PostTransferRequest struct {
	TransferID uint64 `json:"transfer_id" binding:"required"`
}

func (h *Handlers) PostPendingTransfer(c *gin.Context) {
	var req PostTransferRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := h.ledger.PostPendingTransfer(req.TransferID)
	if !result.Success {
		c.JSON(http.StatusBadRequest, result)
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *Handlers) VoidPendingTransfer(c *gin.Context) {
	var req PostTransferRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := h.ledger.VoidPendingTransfer(req.TransferID)
	if !result.Success {
		c.JSON(http.StatusBadRequest, result)
		return
	}

	c.JSON(http.StatusOK, result)
}

type LinkedTransfersRequest struct {
	Transfers []services.LinkedTransferRequest `json:"transfers" binding:"required"`
}

func (h *Handlers) CreateLinkedTransfers(c *gin.Context) {
	var req LinkedTransfersRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := h.ledger.CreateLinkedTransfers(req.Transfers)
	if !result.Success {
		c.JSON(http.StatusBadRequest, result)
		return
	}

	c.JSON(http.StatusCreated, result)
}

func (h *Handlers) GetLedgerStatus(c *gin.Context) {
	status := h.ledger.GetStatus()
	c.JSON(http.StatusOK, status)
}

// Mojaloop Handlers

func (h *Handlers) ListParticipants(c *gin.Context) {
	participants := h.mojaloop.ListParticipants()
	c.JSON(http.StatusOK, gin.H{"participants": participants})
}

func (h *Handlers) LookupParticipant(c *gin.Context) {
	identifierType := c.Query("identifier_type")
	identifier := c.Query("identifier")

	if identifier == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "identifier is required"})
		return
	}

	participant := h.mojaloop.LookupParticipant(identifierType, identifier)
	if participant == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Participant not found"})
		return
	}

	c.JSON(http.StatusOK, participant)
}

type CreateQuoteRequest struct {
	PayerFSP string  `json:"payer_fsp" binding:"required"`
	PayeeFSP string  `json:"payee_fsp" binding:"required"`
	Amount   float64 `json:"amount" binding:"required"`
	Currency string  `json:"currency" binding:"required"`
}

func (h *Handlers) CreateQuote(c *gin.Context) {
	var req CreateQuoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	quote, err := h.mojaloop.CreateQuote(req.PayerFSP, req.PayeeFSP, req.Amount, req.Currency)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, quote)
}

type PrepareTransferRequest struct {
	QuoteID string `json:"quote_id" binding:"required"`
}

func (h *Handlers) PrepareTransfer(c *gin.Context) {
	var req PrepareTransferRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	transfer, err := h.mojaloop.PrepareTransfer(req.QuoteID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, transfer)
}

type CommitTransferRequest struct {
	TransferID string `json:"transfer_id" binding:"required"`
}

func (h *Handlers) CommitTransfer(c *gin.Context) {
	var req CommitTransferRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	transfer, err := h.mojaloop.CommitTransfer(req.TransferID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, transfer)
}

func (h *Handlers) GetSettlementWindow(c *gin.Context) {
	windowID := c.Query("window_id")
	window := h.mojaloop.GetSettlementWindow(windowID)
	c.JSON(http.StatusOK, window)
}

type CloseWindowRequest struct {
	WindowID string `json:"window_id" binding:"required"`
}

func (h *Handlers) CloseSettlementWindow(c *gin.Context) {
	var req CloseWindowRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	window := h.mojaloop.CloseSettlementWindow(req.WindowID)
	c.JSON(http.StatusOK, window)
}

func (h *Handlers) ListSettlementWindows(c *gin.Context) {
	windows := h.mojaloop.ListSettlementWindows()
	c.JSON(http.StatusOK, gin.H{"windows": windows})
}

func (h *Handlers) GetMojaloopStatus(c *gin.Context) {
	status := h.mojaloop.GetStatus()
	c.JSON(http.StatusOK, status)
}

// Inventory Handlers

func (h *Handlers) ListInventory(c *gin.Context) {
	items := h.inventory.ListInventory()
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (h *Handlers) GetInventoryItem(c *gin.Context) {
	itemID := c.Param("item_id")
	item := h.inventory.GetInventoryItem(itemID)
	if item == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item not found"})
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *Handlers) CheckAvailability(c *gin.Context) {
	itemID := c.Param("item_id")
	quantityStr := c.Query("quantity")
	date := c.Query("date")

	quantity := 1
	if quantityStr != "" {
		if q, err := strconv.Atoi(quantityStr); err == nil {
			quantity = q
		}
	}

	result := h.inventory.CheckAvailability(itemID, quantity, date)
	c.JSON(http.StatusOK, result)
}

type ReserveInventoryRequest struct {
	ItemID     string `json:"item_id" binding:"required"`
	Quantity   int    `json:"quantity" binding:"required"`
	BookingRef string `json:"booking_ref" binding:"required"`
}

func (h *Handlers) ReserveInventory(c *gin.Context) {
	var req ReserveInventoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := h.inventory.ReserveInventory(req.ItemID, req.Quantity, req.BookingRef)
	if !result.Success {
		c.JSON(http.StatusBadRequest, result)
		return
	}

	c.JSON(http.StatusCreated, result)
}

type ConfirmReservationRequest struct {
	ReservationID string `json:"reservation_id" binding:"required"`
	ItemID        string `json:"item_id" binding:"required"`
	Quantity      int    `json:"quantity" binding:"required"`
}

func (h *Handlers) ConfirmReservation(c *gin.Context) {
	var req ConfirmReservationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := h.inventory.ConfirmReservation(req.ReservationID, req.ItemID, req.Quantity)
	if !result.Success {
		c.JSON(http.StatusBadRequest, result)
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *Handlers) ReleaseReservation(c *gin.Context) {
	var req ConfirmReservationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := h.inventory.ReleaseReservation(req.ReservationID, req.ItemID, req.Quantity)
	if !result.Success {
		c.JSON(http.StatusBadRequest, result)
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *Handlers) SyncPartnerInventory(c *gin.Context) {
	partnerID := c.Param("partner_id")

	result := h.inventory.SyncPartnerInventory(partnerID)
	if !result.Success {
		c.JSON(http.StatusBadRequest, result)
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *Handlers) ListSyncJobs(c *gin.Context) {
	jobs := h.inventory.ListSyncJobs()
	c.JSON(http.StatusOK, gin.H{"jobs": jobs})
}

type RegisterWebhookRequest struct {
	PartnerID  string `json:"partner_id" binding:"required"`
	WebhookURL string `json:"webhook_url" binding:"required"`
}

func (h *Handlers) RegisterWebhook(c *gin.Context) {
	var req RegisterWebhookRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := h.inventory.RegisterWebhook(req.PartnerID, req.WebhookURL)
	c.JSON(http.StatusCreated, result)
}

func (h *Handlers) GetInventoryStatus(c *gin.Context) {
	status := h.inventory.GetStatus()
	c.JSON(http.StatusOK, status)
}

// Settlement Handlers

type RecordBookingPaymentRequest struct {
	BookingID       string  `json:"booking_id" binding:"required"`
	ProviderID      string  `json:"provider_id" binding:"required"`
	Amount          float64 `json:"amount" binding:"required"`
	Currency        string  `json:"currency" binding:"required"`
	TouristWalletID string  `json:"tourist_wallet_id" binding:"required"`
}

func (h *Handlers) RecordBookingPayment(c *gin.Context) {
	var req RecordBookingPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := h.settlement.RecordBookingPayment(
		req.BookingID, req.ProviderID,
		req.Amount, req.Currency, req.TouristWalletID,
	)

	if !result.Success {
		c.JSON(http.StatusBadRequest, result)
		return
	}

	c.JSON(http.StatusCreated, result)
}

type CreateSettlementBatchRequest struct {
	ProviderID     string `json:"provider_id" binding:"required"`
	SettlementDate string `json:"settlement_date"`
}

func (h *Handlers) CreateSettlementBatch(c *gin.Context) {
	var req CreateSettlementBatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	batch, err := h.settlement.CreateSettlementBatch(req.ProviderID, req.SettlementDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, batch)
}

func (h *Handlers) ProcessSettlementBatch(c *gin.Context) {
	batchID := c.Param("batch_id")

	result := h.settlement.ProcessSettlementBatch(batchID)
	if !result.Success {
		c.JSON(http.StatusBadRequest, result)
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *Handlers) RunDailySettlements(c *gin.Context) {
	result := h.settlement.RunDailySettlements()
	c.JSON(http.StatusOK, result)
}

func (h *Handlers) ListSettlementBatches(c *gin.Context) {
	providerID := c.Query("provider_id")
	status := c.Query("status")

	batches := h.settlement.ListSettlementBatches(providerID, status)
	c.JSON(http.StatusOK, gin.H{"batches": batches})
}

func (h *Handlers) GetSettlementBatch(c *gin.Context) {
	batchID := c.Param("batch_id")
	batch := h.settlement.GetSettlementBatch(batchID)
	if batch == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Batch not found"})
		return
	}
	c.JSON(http.StatusOK, batch)
}

func (h *Handlers) GetProviderBalance(c *gin.Context) {
	providerID := c.Param("provider_id")
	balance := h.settlement.GetProviderBalance(providerID)
	c.JSON(http.StatusOK, balance)
}

func (h *Handlers) ListPendingSettlements(c *gin.Context) {
	pending := h.settlement.ListPendingSettlements()
	c.JSON(http.StatusOK, gin.H{"pending": pending})
}

// Reconciliation Handlers

type GenerateReportRequest struct {
	PeriodStart string `json:"period_start" binding:"required"`
	PeriodEnd   string `json:"period_end" binding:"required"`
}

func (h *Handlers) GenerateReconciliationReport(c *gin.Context) {
	var req GenerateReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	periodStart, err := time.Parse("2006-01-02", req.PeriodStart)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid period_start format, use YYYY-MM-DD"})
		return
	}

	periodEnd, err := time.Parse("2006-01-02", req.PeriodEnd)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid period_end format, use YYYY-MM-DD"})
		return
	}

	report := h.settlement.GenerateReconciliationReport(periodStart, periodEnd)
	c.JSON(http.StatusCreated, report)
}

func (h *Handlers) ListReconciliationReports(c *gin.Context) {
	reports := h.settlement.ListReconciliationReports()
	c.JSON(http.StatusOK, gin.H{"reports": reports})
}

func (h *Handlers) GetReconciliationReport(c *gin.Context) {
	reportID := c.Param("report_id")
	report := h.settlement.GetReconciliationReport(reportID)
	if report == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Report not found"})
		return
	}
	c.JSON(http.StatusOK, report)
}

func (h *Handlers) GetSettlementStatus(c *gin.Context) {
	status := h.settlement.GetStatus()
	c.JSON(http.StatusOK, status)
}

// Infrastructure Status Handler

func (h *Handlers) GetInfrastructureStatus(c *gin.Context) {
	ledgerStatus := h.ledger.GetStatus()
	mojaloopStatus := h.mojaloop.GetStatus()
	inventoryStatus := h.inventory.GetStatus()
	settlementStatus := h.settlement.GetStatus()

	c.JSON(http.StatusOK, gin.H{
		"service":    "TourismPay Settlement Service (Go)",
		"version":    "1.0.0",
		"status":     "OPERATIONAL",
		"timestamp":  time.Now().Format(time.RFC3339),
		"components": gin.H{
			"tigerbeetle": ledgerStatus,
			"mojaloop":    mojaloopStatus,
			"inventory":   inventoryStatus,
			"settlement":  settlementStatus,
		},
	})
}

// Health Check Handler

func (h *Handlers) HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "healthy",
		"service":   "settlement-service-go",
		"timestamp": time.Now().Format(time.RFC3339),
	})
}
