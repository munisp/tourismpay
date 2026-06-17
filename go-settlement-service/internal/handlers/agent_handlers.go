package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/tourismpay/settlement-service/internal/services"
)

type AgentHandlers struct {
	svc *services.AgentBankingService
}

func NewAgentHandlers(svc *services.AgentBankingService) *AgentHandlers {
	return &AgentHandlers{svc: svc}
}

func (h *AgentHandlers) ListAgents(c *gin.Context) {
	country := c.Query("country")
	agents := h.svc.ListAgents(country)
	c.JSON(http.StatusOK, agents)
}

func (h *AgentHandlers) GetAgent(c *gin.Context) {
	agentID := c.Param("agent_id")
	agent, err := h.svc.GetAgent(agentID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, agent)
}

func (h *AgentHandlers) GetQuote(c *gin.Context) {
	var req struct {
		AgentID        string  `json:"agent_id" binding:"required"`
		CashCurrency   string  `json:"cash_currency" binding:"required"`
		WalletCurrency string  `json:"wallet_currency" binding:"required"`
		CashAmount     float64 `json:"cash_amount" binding:"required,gt=0"`
		CurrentKYCTier int     `json:"current_kyc_tier"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	quote, err := h.svc.GetQuote(req.AgentID, req.CashCurrency, req.WalletCurrency, req.CashAmount, req.CurrentKYCTier)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, quote)
}

func (h *AgentHandlers) ExecuteLoad(c *gin.Context) {
	var req struct {
		AgentID         string  `json:"agent_id" binding:"required"`
		TouristUserID   string  `json:"tourist_user_id" binding:"required"`
		CashCurrency    string  `json:"cash_currency" binding:"required"`
		WalletCurrency  string  `json:"wallet_currency" binding:"required"`
		CashAmount      float64 `json:"cash_amount" binding:"required,gt=0"`
		PassportNumber  string  `json:"passport_number"`
		PassportCountry string  `json:"passport_country"`
		KYCTier         int     `json:"kyc_tier" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	order, err := h.svc.ExecuteLoad(
		req.AgentID, req.TouristUserID, req.CashCurrency, req.WalletCurrency,
		req.PassportNumber, req.PassportCountry, req.CashAmount, req.KYCTier,
	)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, order)
}

func (h *AgentHandlers) GetOrder(c *gin.Context) {
	orderID := c.Param("order_id")
	order, err := h.svc.GetOrder(orderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, order)
}

func (h *AgentHandlers) ListOrders(c *gin.Context) {
	touristID := c.Param("tourist_id")
	orders := h.svc.ListOrders(touristID)
	c.JSON(http.StatusOK, orders)
}

func (h *AgentHandlers) RefundFloat(c *gin.Context) {
	orderID := c.Param("order_id")
	order, err := h.svc.RefundFloat(orderID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, order)
}
