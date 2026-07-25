// Package handlers provides the HTTP handler layer for the eNaira gateway.
package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/munisp/tourismpay/enaira-gateway/internal/models"
	"github.com/munisp/tourismpay/enaira-gateway/internal/services"
)

// Handler holds all HTTP handlers for the eNaira gateway.
type Handler struct {
	svc    *services.ENairaService
	logger *zap.Logger
}

// New creates a new Handler.
func New(svc *services.ENairaService, logger *zap.Logger) *Handler {
	return &Handler{svc: svc, logger: logger}
}

// RegisterRoutes registers all HTTP routes on the given Gin engine.
func (h *Handler) RegisterRoutes(r *gin.Engine) {
	v1 := r.Group("/api/v1/enaira")
	{
		v1.GET("/health", h.Health)

		// Wallet management
		v1.POST("/wallets", h.ProvisionWallet)
		v1.GET("/wallets/:wallet_id/balance", h.GetBalance)

		// Payments
		v1.POST("/payments/initiate", h.InitiatePayment)
		v1.POST("/payments/tourist-load", h.TouristLoad)

		// CBN webhook (called by CBN eNaira network)
		v1.POST("/webhooks/cbn", h.CBNWebhook)
	}
}

// Health godoc
// @Summary Health check
// @Tags system
// @Success 200 {object} map[string]string
func (h *Handler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "enaira-gateway"})
}

// ProvisionWallet godoc
// @Summary Provision a new eNaira wallet for a TourismPay user
// @Tags wallets
// @Accept json
// @Produce json
// @Param body body models.CreateWalletRequest true "Wallet creation request"
// @Success 201 {object} models.ENairaWallet
func (h *Handler) ProvisionWallet(c *gin.Context) {
	var req models.CreateWalletRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	wallet, err := h.svc.ProvisionWallet(c.Request.Context(), &req)
	if err != nil {
		h.logger.Error("ProvisionWallet failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, wallet)
}

// GetBalance godoc
// @Summary Get eNaira wallet balance
// @Tags wallets
// @Produce json
// @Param wallet_id path string true "Wallet ID"
// @Success 200 {object} models.WalletBalanceResponse
func (h *Handler) GetBalance(c *gin.Context) {
	walletID := c.Param("wallet_id")
	if walletID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "wallet_id is required"})
		return
	}

	resp, err := h.svc.GetWalletBalance(c.Request.Context(), walletID)
	if err != nil {
		h.logger.Error("GetBalance failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// InitiatePayment godoc
// @Summary Initiate an eNaira payment
// @Tags payments
// @Accept json
// @Produce json
// @Param body body models.InitiatePaymentRequest true "Payment request"
// @Success 202 {object} models.ENairaTransaction
func (h *Handler) InitiatePayment(c *gin.Context) {
	var req models.InitiatePaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tx, err := h.svc.InitiatePayment(c.Request.Context(), &req)
	if err != nil {
		h.logger.Error("InitiatePayment failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusAccepted, tx)
}

// TouristLoad godoc
// @Summary Load a foreign tourist's eNaira speed wallet from foreign currency
// @Tags payments
// @Accept json
// @Produce json
// @Param body body models.TouristLoadRequest true "Tourist load request"
// @Success 202 {object} models.ENairaTransaction
func (h *Handler) TouristLoad(c *gin.Context) {
	var req models.TouristLoadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tx, err := h.svc.LoadTouristWallet(c.Request.Context(), &req)
	if err != nil {
		h.logger.Error("TouristLoad failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusAccepted, tx)
}

// CBNWebhook godoc
// @Summary Receive CBN eNaira webhook event
// @Tags webhooks
// @Accept json
// @Produce json
// @Param body body models.CBNWebhookEvent true "CBN webhook event"
// @Success 200 {object} map[string]string
func (h *Handler) CBNWebhook(c *gin.Context) {
	var event models.CBNWebhookEvent
	if err := c.ShouldBindJSON(&event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.svc.HandleCBNWebhook(c.Request.Context(), &event); err != nil {
		h.logger.Error("CBNWebhook processing failed", zap.Error(err))
		// Return 200 to CBN to prevent retries for non-retryable errors
		c.JSON(http.StatusOK, gin.H{"status": "error", "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "processed"})
}
