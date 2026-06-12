package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/tourismpay/settlement-service/internal/database"
	"github.com/tourismpay/settlement-service/internal/handlers"
	"github.com/tourismpay/settlement-service/internal/middleware"
	"github.com/tourismpay/settlement-service/internal/services"
	"github.com/tourismpay/settlement-service/internal/services/channels"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	// Connect to PostgreSQL (graceful fallback to in-memory if DB unavailable)
	if err := database.Connect(); err != nil {
		log.Printf("[WARN] Database connection failed, falling back to in-memory: %v", err)
	} else {
		log.Println("[INFO] Connected to PostgreSQL")
		defer database.Close()
	}

	ledgerService := services.NewTigerBeetleLedgerService(0)
	mojaloopService := services.NewMojaloopDFSPService("tourismpay")
	inventoryService := services.NewInventorySyncService()
	settlementService := services.NewSettlementService(ledgerService, mojaloopService)
	cryptoService := services.NewCryptoService()
	nfcService := services.NewOfflineNFCService()
	cbdcBridge := services.NewCBDCBridge()

	h := handlers.NewHandlers(ledgerService, mojaloopService, inventoryService, settlementService)
	cryptoHandlers := handlers.NewCryptoHandlers(cryptoService)
	nfcHandlers := services.NewNFCHandlers(nfcService)
	cbdcHandlers := services.NewCBDCHandlers(cbdcBridge)

	router := gin.Default()

	// CORS middleware — restrict to known origins in production
	allowedOrigin := os.Getenv("CORS_ORIGIN")
	if allowedOrigin == "" {
		allowedOrigin = "http://localhost:5173"
	}
	router.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", allowedOrigin)
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")
		c.Header("Access-Control-Allow-Credentials", "true")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusOK)
			return
		}
		c.Next()
	})

	// Health endpoint (unauthenticated)
	router.GET("/health", func(c *gin.Context) {
		dbStatus := "connected"
		if database.DB == nil {
			dbStatus = "in-memory-fallback"
		}
		c.JSON(http.StatusOK, gin.H{
			"status":    "healthy",
			"service":   "TourismPay Settlement Service (Go)",
			"version":   "3.0.0",
			"database":  dbStatus,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})

	// All API routes require authentication
	api := router.Group("/api/v1")
	api.Use(middleware.AuthMiddleware())
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
			settlement.POST("/run-daily", middleware.AdminMiddleware(), h.RunDailySettlements)
			settlement.GET("/providers/:provider_id/balance", h.GetProviderBalance)
			settlement.GET("/pending", h.ListPendingSettlements)
			settlement.GET("/status", h.GetSettlementStatus)
		}

		reconciliation := api.Group("/reconciliation")
		reconciliation.Use(middleware.AdminMiddleware())
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
			crypto.GET("/health", cryptoHandlers.GetCryptoStatus)
		}

		// Offline NFC Payments (4.1)
		nfc := api.Group("/nfc")
		{
			nfc.POST("/vouchers", nfcHandlers.CreateVoucherHandler)
			nfc.POST("/tap", nfcHandlers.ProcessTapHandler)
			nfc.POST("/sync", nfcHandlers.SyncVoucherHandler)
		}

		// CBDC Bridge (4.5) — eNaira, eCedi, South African Digital Rand
		cbdc := api.Group("/cbdc")
		{
			cbdc.POST("/wallets", cbdcHandlers.CreateWalletHandler)
			cbdc.POST("/swap/quote", cbdcHandlers.GetSwapQuoteHandler)
			cbdc.POST("/swap/execute", cbdcHandlers.ExecuteSwapHandler)
		}
	}

	// ─── Channel Manager (GDS/OTA distribution) ─────────────────────────────
	channelManager := channels.NewManager(database.DB)
	if database.DB != nil {
		if err := channels.RunMigrations(database.DB); err != nil {
			log.Printf("[WARN] Channel manager migrations failed: %v", err)
		}
	}
	channelManager.Start(5 * time.Minute) // Sync every 5 minutes
	defer channelManager.Stop()

	channelAPI := api.Group("/channels")
	{
		channelAPI.GET("", channelManager.ListChannelsHandler)
		channelAPI.POST("/connect", channelManager.ConnectChannelHandler)
		channelAPI.DELETE("/:channelId", channelManager.DisconnectChannelHandler)
		channelAPI.POST("/:channelId/sync", channelManager.SyncChannelHandler)
		channelAPI.GET("/stats", channelManager.ChannelStatsHandler)
		channelAPI.POST("/webhooks/:channel", channelManager.WebhookHandler)
	}

	log.Printf("[INFO] Settlement service starting on :%s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}
