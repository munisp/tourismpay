package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/tourismpay/settlement-service/internal/services"
)

type WireHandlers struct {
	svc *services.SWIFTWireService
}

func NewWireHandlers(svc *services.SWIFTWireService) *WireHandlers {
	return &WireHandlers{svc: svc}
}

func (h *WireHandlers) GetQuote(c *gin.Context) {
	var req struct {
		SourceCurrency string  `json:"source_currency" binding:"required"`
		TargetCurrency string  `json:"target_currency" binding:"required"`
		SenderCountry  string  `json:"sender_country" binding:"required"`
		Amount         float64 `json:"amount" binding:"required,gt=0"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	quote, err := h.svc.GetQuote(req.SourceCurrency, req.TargetCurrency, req.SenderCountry, req.Amount)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, quote)
}

func (h *WireHandlers) InitiateTransfer(c *gin.Context) {
	var req struct {
		UserID        string                       `json:"user_id" binding:"required"`
		Quote         services.WireQuote            `json:"quote" binding:"required"`
		SenderName    string                       `json:"sender_name" binding:"required"`
		SenderCountry string                       `json:"sender_country" binding:"required"`
		TravelRule    *services.TravelRulePayload  `json:"travel_rule"`
		KYCTier       int                          `json:"kyc_tier"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	order, err := h.svc.InitiateTransfer(req.UserID, &req.Quote, req.SenderName, req.SenderCountry, req.TravelRule, req.KYCTier)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, order)
}

func (h *WireHandlers) ConfirmSettlement(c *gin.Context) {
	orderID := c.Param("order_id")
	var req struct {
		SWIFTRef string `json:"swift_ref" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	order, err := h.svc.ConfirmSettlement(orderID, req.SWIFTRef)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, order)
}

func (h *WireHandlers) CreditWallet(c *gin.Context) {
	orderID := c.Param("order_id")

	order, err := h.svc.CreditWallet(orderID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, order)
}

func (h *WireHandlers) GetOrder(c *gin.Context) {
	orderID := c.Param("order_id")

	order, err := h.svc.GetOrder(orderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, order)
}

func (h *WireHandlers) ListOrders(c *gin.Context) {
	userID := c.Param("user_id")
	orders := h.svc.ListOrders(userID)
	c.JSON(http.StatusOK, orders)
}
