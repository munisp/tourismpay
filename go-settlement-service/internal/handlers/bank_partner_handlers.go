package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/tourismpay/settlement-service/internal/services"
)

type BankPartnerHandlers struct {
	svc *services.BankPartnerService
}

func NewBankPartnerHandlers(svc *services.BankPartnerService) *BankPartnerHandlers {
	return &BankPartnerHandlers{svc: svc}
}

// ListProviders returns all bank partner configurations
func (h *BankPartnerHandlers) ListProviders(c *gin.Context) {
	providers := h.svc.ListProviders()
	c.JSON(http.StatusOK, gin.H{"providers": providers})
}

// GetProvider returns a specific provider's details
func (h *BankPartnerHandlers) GetProvider(c *gin.Context) {
	provider := services.BankPartnerProvider(c.Param("provider"))
	cfg, err := h.svc.GetProvider(provider)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cfg)
}

// GetQuote returns a SWIFT transfer quote via a specific bank partner
func (h *BankPartnerHandlers) GetQuote(c *gin.Context) {
	var req struct {
		Provider       string  `json:"provider" binding:"required"`
		SourceCurrency string  `json:"source_currency" binding:"required"`
		TargetCurrency string  `json:"target_currency" binding:"required"`
		Amount         float64 `json:"amount" binding:"required,gt=0"`
		UserID         string  `json:"user_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	quote, err := h.svc.GetQuote(services.BankPartnerProvider(req.Provider), req.SourceCurrency, req.TargetCurrency, req.Amount, req.UserID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, quote)
}

// CompareProviders returns quotes from all bank partners for the same transfer
func (h *BankPartnerHandlers) CompareProviders(c *gin.Context) {
	var req struct {
		SourceCurrency string  `json:"source_currency" binding:"required"`
		TargetCurrency string  `json:"target_currency" binding:"required"`
		Amount         float64 `json:"amount" binding:"required,gt=0"`
		UserID         string  `json:"user_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	quotes, err := h.svc.CompareProviders(req.SourceCurrency, req.TargetCurrency, req.Amount, req.UserID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"quotes": quotes})
}

// InitiateTransfer creates a bank partner SWIFT transfer
func (h *BankPartnerHandlers) InitiateTransfer(c *gin.Context) {
	var req struct {
		UserID     string                       `json:"user_id" binding:"required"`
		Quote      services.BankPartnerQuote     `json:"quote" binding:"required"`
		SenderName string                       `json:"sender_name" binding:"required"`
		TravelRule *services.TravelRulePayload  `json:"travel_rule"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	transfer, err := h.svc.InitiateTransfer(req.UserID, &req.Quote, req.SenderName, req.TravelRule)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, transfer)
}

// WebhookFundsReceived handles SWIFT arrival webhook from bank partner
func (h *BankPartnerHandlers) WebhookFundsReceived(c *gin.Context) {
	transferID := c.Param("transfer_id")
	var req struct {
		SWIFTRef string  `json:"swift_ref" binding:"required"`
		Amount   float64 `json:"amount" binding:"required,gt=0"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	transfer, err := h.svc.WebhookFundsReceived(transferID, req.SWIFTRef, req.Amount)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, transfer)
}

// CreditWallet credits tourist's wallet after funds received
func (h *BankPartnerHandlers) CreditWallet(c *gin.Context) {
	transferID := c.Param("transfer_id")

	transfer, err := h.svc.CreditWallet(transferID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, transfer)
}

// GetTransfer returns a specific transfer's status
func (h *BankPartnerHandlers) GetTransfer(c *gin.Context) {
	id := c.Param("transfer_id")
	transfer, err := h.svc.GetTransfer(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, transfer)
}

// ListTransfers returns all transfers for a user
func (h *BankPartnerHandlers) ListTransfers(c *gin.Context) {
	userID := c.Param("user_id")
	transfers := h.svc.ListTransfers(userID)
	c.JSON(http.StatusOK, gin.H{"transfers": transfers})
}
