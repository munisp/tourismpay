package handlers

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/tourismpay/settlement-service/internal/services"
)

type RampHandlers struct {
	service *services.OnrampOfframpService
}

func NewRampHandlers(svc *services.OnrampOfframpService) *RampHandlers {
	return &RampHandlers{service: svc}
}

// POST /api/v1/ramp/onramp/quote
func (h *RampHandlers) OnrampQuote(c *gin.Context) {
	var req services.OnrampRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	quote := h.service.GetOnrampQuote(req)
	c.JSON(http.StatusOK, quote)
}

// POST /api/v1/ramp/onramp/execute
func (h *RampHandlers) OnrampExecute(c *gin.Context) {
	var req services.OnrampRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	order, err := h.service.ExecuteOnramp(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, order)
}

// POST /api/v1/ramp/offramp/quote
func (h *RampHandlers) OfframpQuote(c *gin.Context) {
	var req services.OfframpReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	quote := h.service.GetOfframpQuote(req)
	c.JSON(http.StatusOK, quote)
}

// POST /api/v1/ramp/offramp/execute
func (h *RampHandlers) OfframpExecute(c *gin.Context) {
	var req services.OfframpReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.service.ExecuteOfframp(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// GET /api/v1/ramp/best-rail?country=KE&amount=100&direction=onramp
func (h *RampHandlers) BestRail(c *gin.Context) {
	country := c.DefaultQuery("country", "KE")
	direction := c.DefaultQuery("direction", "onramp")
	amount := 100.0
	if a := c.Query("amount"); a != "" {
		if _, err := fmt.Sscanf(a, "%f", &amount); err != nil {
			amount = 100.0
		}
	}
	options := h.service.FindBestRail(country, amount, direction)
	c.JSON(http.StatusOK, gin.H{
		"country":   country,
		"direction": direction,
		"amount":    amount,
		"options":   options,
		"best":      options[0].Rail,
	})
}

// GET /api/v1/ramp/onramp/:order_id
func (h *RampHandlers) GetOnrampOrder(c *gin.Context) {
	id := c.Param("order_id")
	order := h.service.GetOnrampOrder(id)
	if order == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}
	c.JSON(http.StatusOK, order)
}

// GET /api/v1/ramp/offramp/:request_id
func (h *RampHandlers) GetOfframpRequest(c *gin.Context) {
	id := c.Param("request_id")
	req := h.service.GetOfframpRequest(id)
	if req == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "request not found"})
		return
	}
	c.JSON(http.StatusOK, req)
}

// GET /api/v1/ramp/onramp/history/:user_id
func (h *RampHandlers) OnrampHistory(c *gin.Context) {
	userID := c.Param("user_id")
	orders := h.service.ListOnrampOrders(userID)
	c.JSON(http.StatusOK, gin.H{"orders": orders, "count": len(orders)})
}

// GET /api/v1/ramp/offramp/history/:user_id
func (h *RampHandlers) OfframpHistory(c *gin.Context) {
	userID := c.Param("user_id")
	reqs := h.service.ListOfframpRequests(userID)
	c.JSON(http.StatusOK, gin.H{"requests": reqs, "count": len(reqs)})
}

// GET /api/v1/ramp/status
func (h *RampHandlers) GetStatus(c *gin.Context) {
	c.JSON(http.StatusOK, h.service.GetStatus())
}
