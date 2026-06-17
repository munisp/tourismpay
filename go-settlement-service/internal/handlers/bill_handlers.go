package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/tourismpay/settlement-service/internal/services"
)

type BillHandlers struct {
	svc *services.BillPaymentService
}

func NewBillHandlers(svc *services.BillPaymentService) *BillHandlers {
	return &BillHandlers{svc: svc}
}

func (h *BillHandlers) ListProviders(c *gin.Context) {
	category := c.Query("category")
	country := c.DefaultQuery("country", "NG")
	providers := h.svc.ListProviders(category, country)
	c.JSON(http.StatusOK, providers)
}

func (h *BillHandlers) GetDataPlans(c *gin.Context) {
	providerID := c.Param("provider_id")
	plans := h.svc.GetDataPlans(providerID)
	if plans == nil {
		plans = []services.DataPlan{}
	}
	c.JSON(http.StatusOK, plans)
}

func (h *BillHandlers) ValidateAccount(c *gin.Context) {
	var req struct {
		ProviderID    string `json:"provider_id" binding:"required"`
		AccountNumber string `json:"account_number" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.svc.ValidateAccount(req.ProviderID, req.AccountNumber)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *BillHandlers) ProcessPayment(c *gin.Context) {
	var req services.BillPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.svc.ProcessPayment(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *BillHandlers) GetHistory(c *gin.Context) {
	userID := c.Query("user_id")
	history := h.svc.GetHistory(userID)
	c.JSON(http.StatusOK, history)
}
