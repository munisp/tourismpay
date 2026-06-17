package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/tourismpay/settlement-service/internal/services"
)

type VirtualCardHandlers struct {
	svc *services.VirtualCardService
}

func NewVirtualCardHandlers(svc *services.VirtualCardService) *VirtualCardHandlers {
	return &VirtualCardHandlers{svc: svc}
}

func (h *VirtualCardHandlers) IssueCard(c *gin.Context) {
	var req services.IssueCardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	card, err := h.svc.IssueCard(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, card)
}

func (h *VirtualCardHandlers) ListCards(c *gin.Context) {
	userID := c.Query("user_id")
	cards := h.svc.ListCards(userID)
	if cards == nil {
		cards = []*services.VirtualCard{}
	}
	c.JSON(http.StatusOK, cards)
}

func (h *VirtualCardHandlers) GetCard(c *gin.Context) {
	cardID := c.Param("card_id")
	card, err := h.svc.GetCard(cardID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, card)
}

func (h *VirtualCardHandlers) FundCard(c *gin.Context) {
	var req services.FundCardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.CardID = c.Param("card_id")

	card, err := h.svc.FundCard(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, card)
}

func (h *VirtualCardHandlers) FreezeCard(c *gin.Context) {
	cardID := c.Param("card_id")
	card, err := h.svc.FreezeCard(cardID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, card)
}

func (h *VirtualCardHandlers) UnfreezeCard(c *gin.Context) {
	cardID := c.Param("card_id")
	card, err := h.svc.UnfreezeCard(cardID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, card)
}

func (h *VirtualCardHandlers) GetTransactions(c *gin.Context) {
	cardID := c.Param("card_id")
	txns := h.svc.GetTransactions(cardID)
	if txns == nil {
		txns = []services.CardTransaction{}
	}
	c.JSON(http.StatusOK, txns)
}

func (h *VirtualCardHandlers) UpdateControls(c *gin.Context) {
	cardID := c.Param("card_id")
	var req struct {
		AllowATM    bool    `json:"allow_atm"`
		AllowOnline bool    `json:"allow_online"`
		AllowPOS    bool    `json:"allow_pos"`
		AllowIntl   bool    `json:"allow_international"`
		DailyLimit  float64 `json:"daily_limit"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	card, err := h.svc.UpdateControls(cardID, req.AllowATM, req.AllowOnline, req.AllowPOS, req.AllowIntl, req.DailyLimit)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, card)
}
