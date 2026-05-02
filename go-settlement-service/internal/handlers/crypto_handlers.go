package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/tourismpay/settlement-service/internal/services"
)

type CryptoHandlers struct {
	crypto *services.CryptoService
}

func NewCryptoHandlers(crypto *services.CryptoService) *CryptoHandlers {
	return &CryptoHandlers{crypto: crypto}
}

// Wallet Management

type CreateWalletRequest struct {
	UserID string `json:"user_id" binding:"required"`
}

func (h *CryptoHandlers) CreateWallet(c *gin.Context) {
	var req CreateWalletRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	wallet := h.crypto.CreateWallet(req.UserID)
	c.JSON(http.StatusCreated, wallet)
}

func (h *CryptoHandlers) GetWallet(c *gin.Context) {
	walletID := c.Param("wallet_id")
	wallet := h.crypto.GetWallet(walletID)
	if wallet == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "wallet not found"})
		return
	}
	c.JSON(http.StatusOK, wallet)
}

func (h *CryptoHandlers) GetWalletByUser(c *gin.Context) {
	userID := c.Param("user_id")
	wallet := h.crypto.GetWalletByUser(userID)
	if wallet == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "wallet not found"})
		return
	}
	c.JSON(http.StatusOK, wallet)
}

func (h *CryptoHandlers) GetDepositAddress(c *gin.Context) {
	walletID := c.Param("wallet_id")
	coin := c.Param("coin")

	address, err := h.crypto.GetDepositAddress(walletID, coin)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"wallet_id": walletID,
		"coin":      coin,
		"address":   address,
	})
}

// Deposits and Withdrawals

type DepositRequest struct {
	WalletID string  `json:"wallet_id" binding:"required"`
	Coin     string  `json:"coin" binding:"required"`
	Amount   float64 `json:"amount" binding:"required"`
}

func (h *CryptoHandlers) SimulateDeposit(c *gin.Context) {
	var req DepositRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := h.crypto.SimulateDeposit(req.WalletID, req.Coin, req.Amount)
	if !result.Success {
		c.JSON(http.StatusBadRequest, result)
		return
	}

	c.JSON(http.StatusCreated, result)
}

type WithdrawRequest struct {
	WalletID  string  `json:"wallet_id" binding:"required"`
	Coin      string  `json:"coin" binding:"required"`
	ToAddress string  `json:"to_address" binding:"required"`
	Amount    float64 `json:"amount" binding:"required"`
}

func (h *CryptoHandlers) Withdraw(c *gin.Context) {
	var req WithdrawRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := h.crypto.Withdraw(req.WalletID, req.Coin, req.ToAddress, req.Amount)
	if !result.Success {
		c.JSON(http.StatusBadRequest, result)
		return
	}

	c.JSON(http.StatusOK, result)
}

// Swaps and Exchange

func (h *CryptoHandlers) GetExchangeRate(c *gin.Context) {
	fromCoin := c.Query("from")
	toCoin := c.Query("to")

	if fromCoin == "" || toCoin == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "from and to query params required"})
		return
	}

	rate, err := h.crypto.GetExchangeRate(fromCoin, toCoin)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"from_coin":     fromCoin,
		"to_coin":       toCoin,
		"exchange_rate": rate,
	})
}

func (h *CryptoHandlers) GetAllExchangeRates(c *gin.Context) {
	rates := h.crypto.GetAllExchangeRates()
	c.JSON(http.StatusOK, gin.H{"rates": rates})
}

type SwapRequest struct {
	WalletID   string  `json:"wallet_id" binding:"required"`
	FromCoin   string  `json:"from_coin" binding:"required"`
	ToCoin     string  `json:"to_coin" binding:"required"`
	FromAmount float64 `json:"from_amount" binding:"required"`
}

func (h *CryptoHandlers) Swap(c *gin.Context) {
	var req SwapRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := h.crypto.Swap(req.WalletID, req.FromCoin, req.ToCoin, req.FromAmount)
	if !result.Success {
		c.JSON(http.StatusBadRequest, result)
		return
	}

	c.JSON(http.StatusOK, result)
}

// Crypto Payments

type PaymentQuoteRequest struct {
	Coin         string  `json:"coin" binding:"required"`
	FiatAmount   float64 `json:"fiat_amount" binding:"required"`
	FiatCurrency string  `json:"fiat_currency" binding:"required"`
}

func (h *CryptoHandlers) GetPaymentQuote(c *gin.Context) {
	var req PaymentQuoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	quote, err := h.crypto.GetPaymentQuote(req.Coin, req.FiatAmount, req.FiatCurrency)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, quote)
}

type CryptoPaymentRequest struct {
	WalletID     string  `json:"wallet_id" binding:"required"`
	BookingID    string  `json:"booking_id" binding:"required"`
	Coin         string  `json:"coin" binding:"required"`
	FiatAmount   float64 `json:"fiat_amount" binding:"required"`
	FiatCurrency string  `json:"fiat_currency" binding:"required"`
}

func (h *CryptoHandlers) PayWithCrypto(c *gin.Context) {
	var req CryptoPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := h.crypto.PayWithCrypto(req.WalletID, req.BookingID, req.Coin, req.FiatAmount, req.FiatCurrency)
	if !result.Success {
		c.JSON(http.StatusBadRequest, result)
		return
	}

	c.JSON(http.StatusOK, result)
}

// Transaction History

func (h *CryptoHandlers) GetTransactions(c *gin.Context) {
	walletID := c.Param("wallet_id")
	transactions := h.crypto.GetTransactions(walletID)
	c.JSON(http.StatusOK, gin.H{"transactions": transactions})
}

// Info and Status

func (h *CryptoHandlers) GetSupportedCoins(c *gin.Context) {
	coins := h.crypto.GetSupportedCoins()
	c.JSON(http.StatusOK, gin.H{"coins": coins})
}

func (h *CryptoHandlers) GetCryptoStatus(c *gin.Context) {
	status := h.crypto.GetStatus()
	c.JSON(http.StatusOK, status)
}
