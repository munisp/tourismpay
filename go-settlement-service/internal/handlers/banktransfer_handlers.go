package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/tourismpay/settlement-service/internal/services"
)

type BankTransferOutHandlers struct {
	svc *services.BankTransferOutService
}

func NewBankTransferOutHandlers(svc *services.BankTransferOutService) *BankTransferOutHandlers {
	return &BankTransferOutHandlers{svc: svc}
}

func (h *BankTransferOutHandlers) ListBanks(c *gin.Context) {
	banks := h.svc.ListBanks()
	c.JSON(http.StatusOK, banks)
}

func (h *BankTransferOutHandlers) NameEnquiry(c *gin.Context) {
	var req struct {
		BankCode      string `json:"bank_code" binding:"required"`
		AccountNumber string `json:"account_number" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.svc.NameEnquiry(req.BankCode, req.AccountNumber)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *BankTransferOutHandlers) InitiateTransfer(c *gin.Context) {
	var req services.BankTransferOutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.svc.InitiateTransfer(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *BankTransferOutHandlers) GetBeneficiaries(c *gin.Context) {
	userID := c.Query("user_id")
	bens := h.svc.GetBeneficiaries(userID)
	if bens == nil {
		bens = []services.SavedBeneficiary{}
	}
	c.JSON(http.StatusOK, bens)
}

func (h *BankTransferOutHandlers) DeleteBeneficiary(c *gin.Context) {
	userID := c.Query("user_id")
	benID := c.Param("beneficiary_id")
	if err := h.svc.DeleteBeneficiary(userID, benID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
