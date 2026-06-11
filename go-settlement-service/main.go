package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/tourismpay/settlement-service/internal/db"
	"github.com/tourismpay/settlement-service/internal/handlers"
	"github.com/tourismpay/settlement-service/internal/services"
)

func authMiddleware() gin.HandlerFunc {
	internalKey := os.Getenv("INTERNAL_SERVICE_KEY")
	return func(c *gin.Context) {
		if c.Request.URL.Path == "/health" {
			c.Next()
			return
		}
		serviceKey := c.GetHeader("X-Service-Key")
		if internalKey != "" && serviceKey == internalKey {
			c.Next()
			return
		}
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing authorization"})
			c.Abort()
			return
		}
		if !strings.HasPrefix(authHeader, "Bearer ") {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization format"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	if err := db.Migrate(); err != nil {
		log.Printf("[settlement] DB migration warning (non-fatal): %v", err)
	}

	ledgerService := services.NewTigerBeetleLedgerService(0)
	mojaloopService := services.NewMojaloopDFSPService("tourismpay")
	inventoryService := services.NewInventorySyncService()
	settlementService := services.NewSettlementService(ledgerService, mojaloopService)
	cryptoService := services.NewCryptoService()

	h := handlers.NewHandlers(ledgerService, mojaloopService, inventoryService, settlementService)
	cryptoHandlers := handlers.NewCryptoHandlers(cryptoService)

	router := gin.Default()

	router.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Service-Key")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusOK)
			return
		}
		c.Next()
	})

	router.Use(authMiddleware())

	router.GET("/health", func(c *gin.Context) {
		dbConn, dbErr := db.GetDB()
		dbStatus := "connected"
		if dbErr != nil || dbConn == nil {
			dbStatus = "unavailable"
		} else if dbConn.Ping() != nil {
			dbStatus = "unreachable"
		}
		c.JSON(http.StatusOK, gin.H{
			"status":    "healthy",
			"service":   "TourismPay Settlement Service (Go)",
			"version":   "2.0.0",
			"database":  dbStatus,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})

	api := router.Group("/api/v1")
	{
		ledger := api.Group("/ledger")
		{
			ledger.POST("/accounts", h.CreateAccount)
			ledger.GET("/accounts/:entity_type/:entity_id/:currency", h.GetAccountBalance)
			ledger.POST("/transfers", h.CreateTransfer)
			ledger.POST("/transfers/:transfer_id/post", h.PostPendingTransfer)
			ledger.POST("/transfers/:transfer_id/void", h.VoidPendingTransfer)
			ledger.POST("/transfers/linked", h.CreateLinkedTransfers)
			ledger.GET("/status", h.GetLedgerStatus)
		}

		mojaloop := api.Group("/mojaloop")
		{
			mojaloop.GET("/participants", h.ListParticipants)
			mojaloop.GET("/participants/:identifier", h.LookupParticipant)
			mojaloop.POST("/quotes", h.CreateQuote)
			mojaloop.POST("/transfers", h.PrepareTransfer)
			mojaloop.POST("/transfers/:transfer_id/commit", h.CommitTransfer)
			mojaloop.GET("/settlement-windows", h.ListSettlementWindows)
			mojaloop.POST("/settlement-windows/:window_id/close", h.CloseSettlementWindow)
			mojaloop.GET("/status", h.GetMojaloopStatus)
		}

		inventory := api.Group("/inventory")
		{
			inventory.GET("", h.ListInventory)
			inventory.GET("/:item_id", h.GetInventoryItem)
			inventory.GET("/:item_id/availability", h.CheckAvailability)
			inventory.POST("/reserve", h.ReserveInventory)
			inventory.POST("/reserve/:reservation_id/confirm", h.ConfirmReservation)
			inventory.POST("/reserve/:reservation_id/release", h.ReleaseReservation)
			inventory.POST("/sync/:partner_id", h.SyncPartnerInventory)
			inventory.GET("/sync/jobs", h.ListSyncJobs)
			inventory.POST("/webhooks", h.RegisterWebhook)
			inventory.GET("/status", h.GetInventoryStatus)
		}

		settlement := api.Group("/settlement")
		{
			settlement.POST("/record-payment", h.RecordBookingPayment)
			settlement.POST("/batches", h.CreateSettlementBatch)
			settlement.POST("/batches/:batch_id/process", h.ProcessSettlementBatch)
			settlement.GET("/batches", h.ListSettlementBatches)
			settlement.GET("/batches/:batch_id", h.GetSettlementBatch)
			settlement.POST("/run-daily", h.RunDailySettlements)
			settlement.GET("/providers/:provider_id/balance", h.GetProviderBalance)
			settlement.GET("/pending", h.ListPendingSettlements)
			settlement.GET("/status", h.GetSettlementStatus)
		}

		reconciliation := api.Group("/reconciliation")
		{
			reconciliation.POST("/reports", h.GenerateReconciliationReport)
			reconciliation.GET("/reports", h.ListReconciliationReports)
			reconciliation.GET("/reports/:report_id", h.GetReconciliationReport)
		}

		crypto := api.Group("/crypto")
		{
			crypto.POST("/wallets", cryptoHandlers.CreateWallet)
			crypto.GET("/wallets/:wallet_id", cryptoHandlers.GetWallet)
			crypto.GET("/wallets/user/:user_id", cryptoHandlers.GetWalletByUser)
			crypto.GET("/wallets/:wallet_id/address/:coin", cryptoHandlers.GetDepositAddress)
			crypto.GET("/wallets/:wallet_id/transactions", cryptoHandlers.GetTransactions)
			crypto.POST("/deposit", cryptoHandlers.SimulateDeposit)
			crypto.POST("/withdraw", cryptoHandlers.Withdraw)
			crypto.GET("/rates", cryptoHandlers.GetAllExchangeRates)
			crypto.GET("/rate", cryptoHandlers.GetExchangeRate)
			crypto.POST("/swap", cryptoHandlers.Swap)
			crypto.POST("/quote", cryptoHandlers.GetPaymentQuote)
			crypto.POST("/pay", cryptoHandlers.PayWithCrypto)
			crypto.GET("/coins", cryptoHandlers.GetSupportedCoins)
			crypto.GET("/status", cryptoHandlers.GetCryptoStatus)
		}

		api.GET("/infrastructure/status", h.GetInfrastructureStatus)
	}

	log.Printf("TourismPay Settlement Service (Go) starting on port %s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
