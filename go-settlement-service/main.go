package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/tourismpay/settlement-service/internal/database"
	"github.com/tourismpay/settlement-service/internal/handlers"
	"github.com/tourismpay/settlement-service/internal/lifecycle"
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
	}

	ledgerService := services.NewTigerBeetleLedgerService(0)
	mojaloopService := services.NewMojaloopDFSPService("tourismpay")
	inventoryService := services.NewInventorySyncService()
	settlementService := services.NewSettlementService(ledgerService, mojaloopService)
	cryptoService := services.NewCryptoService()
	nfcService := services.NewOfflineNFCService()
	cbdcBridge := services.NewCBDCBridge()
	rampService := services.NewOnrampOfframpService(cryptoService, cbdcBridge)
	wireService := services.NewSWIFTWireService(cryptoService, cbdcBridge)
	agentService := services.NewAgentBankingService()
	ussdService := services.NewUSSDService()
	bankPartnerService := services.NewBankPartnerService(cryptoService, cbdcBridge)
	billPaymentService := services.NewBillPaymentService()
	virtualCardService := services.NewVirtualCardService()
	bankTransferOutService := services.NewBankTransferOutService()
	travelReadinessService := services.NewTravelReadinessService()
	merchantCatalogService := services.NewMerchantCatalogService()

	h := handlers.NewHandlers(ledgerService, mojaloopService, inventoryService, settlementService)
	cryptoHandlers := handlers.NewCryptoHandlers(cryptoService)
	nfcHandlers := services.NewNFCHandlers(nfcService)
	cbdcHandlers := services.NewCBDCHandlers(cbdcBridge)
	rampHandlers := handlers.NewRampHandlers(rampService)
	wireHandlers := handlers.NewWireHandlers(wireService)
	agentHandlers := handlers.NewAgentHandlers(agentService)
	ussdHandlers := handlers.NewUSSDHandlers(ussdService)
	bankPartnerHandlers := handlers.NewBankPartnerHandlers(bankPartnerService)
	billHandlers := handlers.NewBillHandlers(billPaymentService)
	virtualCardHandlers := handlers.NewVirtualCardHandlers(virtualCardService)
	bankTransferOutHandlers := handlers.NewBankTransferOutHandlers(bankTransferOutService)
	travelReadinessHandlers := services.NewTravelReadinessHandlers(travelReadinessService)
	merchantCatalogHandlers := services.NewMerchantCatalogHandlers(merchantCatalogService)

	router := gin.New()

	// Middleware stack (order matters):
	// 1. Panic recovery — catches panics, logs stack, increments counter, returns 500
	// 2. Request tracking — counts in-flight requests, records latency metrics
	// 3. Gin logger — HTTP access logging
	router.Use(lifecycle.PanicRecoveryMiddleware())
	router.Use(lifecycle.RequestTrackingMiddleware())
	router.Use(gin.Logger())

	// CORS middleware
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

	// ─── Health / Lifecycle Probes (unauthenticated) ──────────────────────────
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
	router.GET("/livez", lifecycle.LivezHandler)
	router.GET("/readyz", lifecycle.ReadyzHandler)
	router.GET("/metrics", lifecycle.MetricsHandler)

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

		// Offline NFC Payments
		nfc := api.Group("/nfc")
		{
			nfc.POST("/vouchers", nfcHandlers.CreateVoucherHandler)
			nfc.POST("/tap", nfcHandlers.ProcessTapHandler)
			nfc.POST("/sync", nfcHandlers.SyncVoucherHandler)
		}

		// CBDC Bridge
		cbdc := api.Group("/cbdc")
		{
			cbdc.POST("/wallets", cbdcHandlers.CreateWalletHandler)
			cbdc.POST("/swap/quote", cbdcHandlers.GetSwapQuoteHandler)
			cbdc.POST("/swap/execute", cbdcHandlers.ExecuteSwapHandler)
		}

		// Stablecoin On-Ramp / Off-Ramp
		ramp := api.Group("/ramp")
		{
			ramp.POST("/onramp/quote", rampHandlers.OnrampQuote)
			ramp.POST("/onramp/execute", rampHandlers.OnrampExecute)
			ramp.GET("/onramp/:order_id", rampHandlers.GetOnrampOrder)
			ramp.GET("/onramp/history/:user_id", rampHandlers.OnrampHistory)
			ramp.POST("/offramp/quote", rampHandlers.OfframpQuote)
			ramp.POST("/offramp/execute", rampHandlers.OfframpExecute)
			ramp.GET("/offramp/:request_id", rampHandlers.GetOfframpRequest)
			ramp.GET("/offramp/history/:user_id", rampHandlers.OfframpHistory)
			ramp.GET("/best-rail", rampHandlers.BestRail)
			ramp.GET("/status", rampHandlers.GetStatus)
		}

		// SWIFT / SEPA / ACH Wire Transfer
		wire := api.Group("/wire")
		{
			wire.POST("/quote", wireHandlers.GetQuote)
			wire.POST("/initiate", wireHandlers.InitiateTransfer)
			wire.POST("/:order_id/settle", wireHandlers.ConfirmSettlement)
			wire.POST("/:order_id/credit", wireHandlers.CreditWallet)
			wire.GET("/:order_id", wireHandlers.GetOrder)
			wire.GET("/history/:user_id", wireHandlers.ListOrders)
		}

		// Agent Banking / Airport Kiosk
		agent := api.Group("/agent")
		{
			agent.GET("/agents", agentHandlers.ListAgents)
			agent.GET("/agents/:agent_id", agentHandlers.GetAgent)
			agent.POST("/quote", agentHandlers.GetQuote)
			agent.POST("/load", agentHandlers.ExecuteLoad)
			agent.GET("/orders/:order_id", agentHandlers.GetOrder)
			agent.GET("/orders/tourist/:tourist_id", agentHandlers.ListOrders)
			agent.POST("/orders/:order_id/refund", agentHandlers.RefundFloat)
		}

		// Bank Partner SWIFT (Direct Bank, CurrencyCloud, Banking Circle)
		bankPartner := api.Group("/bank-partner")
		{
			bankPartner.GET("/providers", bankPartnerHandlers.ListProviders)
			bankPartner.GET("/providers/:provider", bankPartnerHandlers.GetProvider)
			bankPartner.POST("/quote", bankPartnerHandlers.GetQuote)
			bankPartner.POST("/compare", bankPartnerHandlers.CompareProviders)
			bankPartner.POST("/initiate", bankPartnerHandlers.InitiateTransfer)
			bankPartner.POST("/:transfer_id/webhook", bankPartnerHandlers.WebhookFundsReceived)
			bankPartner.POST("/:transfer_id/credit", bankPartnerHandlers.CreditWallet)
			bankPartner.GET("/:transfer_id", bankPartnerHandlers.GetTransfer)
			bankPartner.GET("/history/:user_id", bankPartnerHandlers.ListTransfers)
		}

		// USSD Menu Service
		ussd := api.Group("/ussd")
		{
			ussd.POST("/callback", ussdHandlers.ProcessUSSD)
			ussd.POST("/callback/form", ussdHandlers.ProcessUSSDForm)
		}

		// Bill Payment Service
		bill := api.Group("/bill")
		{
			bill.GET("/providers", billHandlers.ListProviders)
			bill.GET("/providers/:provider_id/plans", billHandlers.GetDataPlans)
			bill.POST("/validate", billHandlers.ValidateAccount)
			bill.POST("/pay", billHandlers.ProcessPayment)
			bill.GET("/history", billHandlers.GetHistory)
		}

		// Virtual Card Service
		vc := api.Group("/virtual-card")
		{
			vc.POST("/issue", virtualCardHandlers.IssueCard)
			vc.GET("/cards", virtualCardHandlers.ListCards)
			vc.GET("/cards/:card_id", virtualCardHandlers.GetCard)
			vc.POST("/cards/:card_id/fund", virtualCardHandlers.FundCard)
			vc.POST("/cards/:card_id/freeze", virtualCardHandlers.FreezeCard)
			vc.POST("/cards/:card_id/unfreeze", virtualCardHandlers.UnfreezeCard)
			vc.GET("/cards/:card_id/transactions", virtualCardHandlers.GetTransactions)
			vc.PUT("/cards/:card_id/controls", virtualCardHandlers.UpdateControls)
		}

		// Bank Transfer Out (NIBSS NIP)
		bankOut := api.Group("/bank-transfer")
		{
			bankOut.GET("/banks", bankTransferOutHandlers.ListBanks)
			bankOut.POST("/name-enquiry", bankTransferOutHandlers.NameEnquiry)
			bankOut.POST("/initiate", bankTransferOutHandlers.InitiateTransfer)
			bankOut.GET("/beneficiaries", bankTransferOutHandlers.GetBeneficiaries)
			bankOut.DELETE("/beneficiaries/:beneficiary_id", bankTransferOutHandlers.DeleteBeneficiary)
		}

		// Travel Readiness (Pre-travel checklist, bank notifications, eSIM, agent network, corridors)
		travel := api.Group("/travel")
		{
			travel.GET("/banks", travelReadinessHandlers.ListSupportedBanks)
			travel.POST("/bank-notify", travelReadinessHandlers.SendBankNotification)
			travel.GET("/esim", travelReadinessHandlers.ListeSIMPackages)
			travel.POST("/esim/purchase", travelReadinessHandlers.PurchaseeSIM)
			travel.GET("/kiosks", travelReadinessHandlers.ListAgentKiosks)
			travel.GET("/corridors", travelReadinessHandlers.ListCurrencyCorridors)
			travel.POST("/checklist", travelReadinessHandlers.GenerateChecklist)
		}

		// Merchant Catalog (geo-indexed search, pricing, itinerary estimates)
		catalog := api.Group("/catalog")
		{
			catalog.POST("/search", merchantCatalogHandlers.SearchMerchants)
			catalog.GET("/search", merchantCatalogHandlers.SearchMerchants)
			catalog.GET("/products", merchantCatalogHandlers.GetProducts)
			catalog.GET("/estimate", merchantCatalogHandlers.GetItineraryEstimate)
			catalog.GET("/context", merchantCatalogHandlers.GetMerchantContext)
		}
	}

	// ─── Tax Engine & Tipping ──────────────────────────────────────────────────
	taxEngine := services.NewTaxEngineService()
	tippingService := services.NewTippingService()

	taxAPI := api.Group("/tax")
	{
		taxAPI.GET("/jurisdictions", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"jurisdictions": taxEngine.GetSupportedJurisdictions()})
		})
		taxAPI.GET("/rules/:jurisdiction", func(c *gin.Context) {
			code := c.Param("jurisdiction")
			rules := taxEngine.GetRules(code)
			c.JSON(http.StatusOK, gin.H{"jurisdiction": code, "rules": rules, "count": len(rules)})
		})
		taxAPI.POST("/calculate", func(c *gin.Context) {
			var req struct {
				Jurisdiction string  `json:"jurisdiction"`
				Category     string  `json:"category"`
				SubTotal     float64 `json:"sub_total"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			result := taxEngine.CalculateTax(req.Jurisdiction, req.Category, req.Jurisdiction, req.SubTotal)
			c.JSON(http.StatusOK, result)
		})
		taxAPI.GET("/remittance/:jurisdiction", func(c *gin.Context) {
			code := c.Param("jurisdiction")
			summary := taxEngine.GetRemittanceSummary(code)
			c.JSON(http.StatusOK, gin.H{"jurisdiction": code, "remittances": summary})
		})
	}

	tipAPI := api.Group("/tipping")
	{
		tipAPI.GET("/jurisdictions", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"jurisdictions": tippingService.GetSupportedJurisdictions()})
		})
		tipAPI.GET("/config/:jurisdiction", func(c *gin.Context) {
			code := c.Param("jurisdiction")
			config := tippingService.GetConfig(code)
			c.JSON(http.StatusOK, config)
		})
		tipAPI.POST("/calculate", func(c *gin.Context) {
			var req struct {
				Jurisdiction string  `json:"jurisdiction"`
				BillAmount   float64 `json:"bill_amount"`
				TipType      string  `json:"tip_type"`
				TipValue     float64 `json:"tip_value"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			var tipType services.TipType
			switch req.TipType {
			case "percentage":
				tipType = services.TipTypePercentage
			case "flat":
				tipType = services.TipTypeFlat
			case "round_up":
				tipType = services.TipTypeRoundUp
			default:
				tipType = services.TipTypePercentage
			}
			result := tippingService.CalculateTip(req.Jurisdiction, req.BillAmount, tipType, req.TipValue)
			c.JSON(http.StatusOK, result)
		})

		// ─── Multi-Recipient Tipping ──────────────────────────────────────────
		multiTipService := services.NewMultiTipService(tippingService)

		tipAPI.POST("/multi/calculate", func(c *gin.Context) {
			var req services.MultiTipRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			if err := multiTipService.ValidateMultiTip(req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			result := multiTipService.CalculateMultiTip(req)
			c.JSON(http.StatusOK, result)
		})

		tipAPI.POST("/multi/send", func(c *gin.Context) {
			var req services.MultiTipRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			if err := multiTipService.ValidateMultiTip(req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			result := multiTipService.CalculateMultiTip(req)
			// In production: debit payer wallet, credit each recipient wallet
			c.JSON(http.StatusOK, gin.H{
				"status":  "distributed",
				"group":   result,
				"message": fmt.Sprintf("Multi-tip of %.2f %s distributed to %d recipients", result.TotalTip, result.Currency, result.RecipientCount),
			})
		})

		tipAPI.GET("/multi/suggested-recipients", func(c *gin.Context) {
			jurisdiction := c.Query("jurisdiction")
			serviceType := c.Query("service_type")
			if jurisdiction == "" {
				jurisdiction = "NG"
			}
			if serviceType == "" {
				serviceType = "restaurant"
			}
			recipients := multiTipService.GetSuggestedRecipients(jurisdiction, serviceType)
			c.JSON(http.StatusOK, gin.H{
				"jurisdiction": jurisdiction,
				"service_type": serviceType,
				"recipients":   recipients,
			})
		})
	}

	// ─── Government Tax Remittance ──────────────────────────────────────────────
	taxRemittanceService := services.NewTaxRemittanceService()

	remitAPI := api.Group("/tax/remittance")
	{
		remitAPI.GET("/summary/:jurisdiction", func(c *gin.Context) {
			code := c.Param("jurisdiction")
			summary := taxRemittanceService.GetRemittanceSummary(code)
			if summary == nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "jurisdiction not found"})
				return
			}
			c.JSON(http.StatusOK, summary)
		})

		remitAPI.GET("/batches", func(c *gin.Context) {
			status := c.Query("status")
			batches := taxRemittanceService.GetAllBatches(status)
			c.JSON(http.StatusOK, gin.H{"batches": batches, "count": len(batches)})
		})

		remitAPI.POST("/create-batch", func(c *gin.Context) {
			var req struct {
				JurisdictionCode string                       `json:"jurisdiction_code"`
				Period           string                       `json:"period"`
				TaxBreakdown     []services.TaxTypeBreakdown  `json:"tax_breakdown"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			batch := taxRemittanceService.CreateBatch(req.JurisdictionCode, req.Period, req.TaxBreakdown)
			c.JSON(http.StatusCreated, batch)
		})

		remitAPI.POST("/initiate", func(c *gin.Context) {
			var req services.RemitRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			result, err := taxRemittanceService.InitiateRemittance(req)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, result)
		})

		remitAPI.GET("/payments/:jurisdiction", func(c *gin.Context) {
			code := c.Param("jurisdiction")
			payments := taxRemittanceService.GetPaymentHistory(code)
			c.JSON(http.StatusOK, gin.H{"payments": payments, "count": len(payments)})
		})

		remitAPI.GET("/schedules", func(c *gin.Context) {
			schedules := taxRemittanceService.GetFilingSchedules()
			c.JSON(http.StatusOK, gin.H{"schedules": schedules, "count": len(schedules)})
		})

		remitAPI.GET("/govt-accounts", func(c *gin.Context) {
			accounts := taxRemittanceService.GetGovtBankAccounts()
			c.JSON(http.StatusOK, gin.H{"accounts": accounts})
		})
	}

	// ─── Channel Manager ────────────────────────────────────────────────────────
	channelManager := channels.NewManager(database.DB)
	if database.DB != nil {
		if err := channels.RunMigrations(database.DB); err != nil {
			log.Printf("[WARN] Channel manager migrations failed: %v", err)
		}
	}
	channelManager.Start(5 * time.Minute)

	channelAPI := api.Group("/channels")
	{
		channelAPI.GET("", channelManager.ListChannelsHandler)
		channelAPI.POST("/connect", channelManager.ConnectChannelHandler)
		channelAPI.DELETE("/:channelId", channelManager.DisconnectChannelHandler)
		channelAPI.POST("/:channelId/sync", channelManager.SyncChannelHandler)
		channelAPI.GET("/stats", channelManager.ChannelStatsHandler)
		channelAPI.POST("/webhooks/:channel", channelManager.WebhookHandler)
	}

	// ─── HTTP Server with Graceful Shutdown ──────────────────────────────────
	server := &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Mark as ready once server is configured
	lifecycle.SetReady()
	log.Printf("[INFO] Settlement service starting on :%s", port)

	// Start server in goroutine
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[FATAL] Server listen error: %v", err)
		}
	}()

	// Block until SIGTERM/SIGINT, then graceful shutdown
	lifecycle.GracefulShutdown(server, []lifecycle.ShutdownHook{
		{
			Name: "channel-manager",
			Fn: func(_ context.Context) error {
				channelManager.Stop()
				return nil
			},
		},
		{
			Name: "database",
			Fn: func(_ context.Context) error {
				if database.DB != nil {
					database.Close()
				}
				return nil
			},
		},
	})
}
