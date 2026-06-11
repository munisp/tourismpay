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
	return &Handlers{ledger: ledger, mojaloop: mojaloop, inventory: inventory, settlement: settlement}
}

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

func (h *Handlers) GetAccountBalance(c *gin.Context) {
	entityType := c.Param("entity_type")
	entityID := c.Param("entity_id")
	currency := c.Param("currency")
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
	result := h.ledger.CreateTransfer(req.FromType, req.FromID, req.ToType, req.ToID, req.Currency, req.Amount, req.Pending, req.Reference)
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
	c.JSON(http.StatusOK, h.ledger.GetStatus())
}

func (h *Handlers) ListParticipants(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"participants": h.mojaloop.ListParticipants()})
}

func (h *Handlers) LookupParticipant(c *gin.Context) {
	identifier := c.Param("identifier")
	p := h.mojaloop.LookupParticipant("", identifier)
	if p == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Participant not found"})
		return
	}
	c.JSON(http.StatusOK, p)
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

func (h *Handlers) CommitTransfer(c *gin.Context) {
	transferID := c.Param("transfer_id")
	transfer, err := h.mojaloop.CommitTransfer(transferID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, transfer)
}

func (h *Handlers) ListSettlementWindows(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"windows": h.mojaloop.ListSettlementWindows()})
}

func (h *Handlers) CloseSettlementWindow(c *gin.Context) {
	windowID := c.Param("window_id")
	window, err := h.mojaloop.CloseSettlementWindow(windowID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, window)
}

func (h *Handlers) GetMojaloopStatus(c *gin.Context) {
	c.JSON(http.StatusOK, h.mojaloop.GetStatus())
}

func (h *Handlers) ListInventory(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"items": h.inventory.ListInventory()})
}

func (h *Handlers) GetInventoryItem(c *gin.Context) {
	item := h.inventory.GetInventoryItem(c.Param("item_id"))
	if item == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item not found"})
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *Handlers) CheckAvailability(c *gin.Context) {
	itemID := c.Param("item_id")
	quantity := 1
	if q, err := strconv.Atoi(c.Query("quantity")); err == nil {
		quantity = q
	}
	c.JSON(http.StatusOK, h.inventory.CheckAvailability(itemID, quantity, c.Query("date")))
}

type ReserveInventoryRequest struct {
	ItemID     string `json:"item_id" binding:"required"`
	TouristID  string `json:"tourist_id"`
	Quantity   int    `json:"quantity" binding:"required"`
	BookingRef string `json:"booking_ref" binding:"required"`
}

func (h *Handlers) ReserveInventory(c *gin.Context) {
	var req ReserveInventoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result := h.inventory.ReserveInventory(req.ItemID, req.TouristID, req.Quantity, req.BookingRef)
	if !result.Success {
		c.JSON(http.StatusBadRequest, result)
		return
	}
	c.JSON(http.StatusCreated, result)
}

func (h *Handlers) ConfirmReservation(c *gin.Context) {
	reservationID := c.Param("reservation_id")
	result := h.inventory.ConfirmReservation(reservationID)
	if !result.Success {
		c.JSON(http.StatusBadRequest, result)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *Handlers) ReleaseReservation(c *gin.Context) {
	reservationID := c.Param("reservation_id")
	result := h.inventory.ReleaseReservation(reservationID)
	if !result.Success {
		c.JSON(http.StatusBadRequest, result)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *Handlers) SyncPartnerInventory(c *gin.Context) {
	result := h.inventory.SyncPartnerInventory(c.Param("partner_id"))
	if !result.Success {
		c.JSON(http.StatusBadRequest, result)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *Handlers) ListSyncJobs(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"jobs": h.inventory.ListSyncJobs()})
}

type RegisterWebhookRequest struct {
	WebhookURL string `json:"webhook_url" binding:"required"`
}

func (h *Handlers) RegisterWebhook(c *gin.Context) {
	var req RegisterWebhookRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id := h.inventory.RegisterWebhook(req.WebhookURL)
	c.JSON(http.StatusCreated, gin.H{"webhook_id": id})
}

func (h *Handlers) GetInventoryStatus(c *gin.Context) {
	c.JSON(http.StatusOK, h.inventory.GetStatus())
}

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
	result := h.settlement.RecordBookingPayment(req.BookingID, req.ProviderID, req.Amount, req.Currency, req.TouristWalletID)
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
	batch, err := h.settlement.ProcessSettlementBatch(batchID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, batch)
}

func (h *Handlers) RunDailySettlements(c *gin.Context) {
	c.JSON(http.StatusOK, h.settlement.RunDailySettlements())
}

func (h *Handlers) ListSettlementBatches(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"batches": h.settlement.ListSettlementBatches()})
}

func (h *Handlers) GetSettlementBatch(c *gin.Context) {
	batch := h.settlement.GetSettlementBatch(c.Param("batch_id"))
	if batch == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Batch not found"})
		return
	}
	c.JSON(http.StatusOK, batch)
}

func (h *Handlers) GetProviderBalance(c *gin.Context) {
	c.JSON(http.StatusOK, h.settlement.GetProviderBalance(c.Param("provider_id")))
}

func (h *Handlers) ListPendingSettlements(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"pending": h.settlement.ListPendingSettlements()})
}

type GenerateReportRequest struct {
	ProviderID  string `json:"provider_id" binding:"required"`
	PeriodStart string `json:"period_start" binding:"required"`
	PeriodEnd   string `json:"period_end" binding:"required"`
}

func (h *Handlers) GenerateReconciliationReport(c *gin.Context) {
	var req GenerateReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	start, err := time.Parse("2006-01-02", req.PeriodStart)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid period_start format"})
		return
	}
	end, err := time.Parse("2006-01-02", req.PeriodEnd)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid period_end format"})
		return
	}
	report, err := h.settlement.GenerateReconciliationReport(req.ProviderID, start, end)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, report)
}

func (h *Handlers) ListReconciliationReports(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"reports": h.settlement.ListReconciliationReports()})
}

func (h *Handlers) GetReconciliationReport(c *gin.Context) {
	report := h.settlement.GetReconciliationReport(c.Param("report_id"))
	if report == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Report not found"})
		return
	}
	c.JSON(http.StatusOK, report)
}

func (h *Handlers) GetSettlementStatus(c *gin.Context) {
	c.JSON(http.StatusOK, h.settlement.GetStatus())
}

func (h *Handlers) GetInfrastructureStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"service":   "TourismPay Settlement Service (Go)",
		"version":   "2.0.0",
		"status":    "OPERATIONAL",
		"timestamp": time.Now().Format(time.RFC3339),
		"components": gin.H{
			"tigerbeetle": h.ledger.GetStatus(),
			"mojaloop":    h.mojaloop.GetStatus(),
			"inventory":   h.inventory.GetStatus(),
			"settlement":  h.settlement.GetStatus(),
		},
	})
}
