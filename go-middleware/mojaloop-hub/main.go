package main

import (
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ─── Models ─────────────────────────────────────────────────────────────────

type DFSP struct {
	ID       string `json:"fspId"`
	Name     string `json:"name"`
	Currency string `json:"currency"`
	Status   string `json:"status"`
	Country  string `json:"country"`
	PartyTypes []string `json:"partyIdTypes"`
}

type Party struct {
	PartyIdType string `json:"partyIdType"` // MSISDN, EMAIL, ACCOUNT_ID
	PartyID     string `json:"partyIdentifier"`
	FSPID       string `json:"fspId"`
	Name        string `json:"name"`
	Currency    string `json:"currency"`
}

type QuoteRequest struct {
	QuoteID       string `json:"quoteId"`
	TransactionID string `json:"transactionId"`
	Payer         Party  `json:"payer"`
	Payee         Party  `json:"payee"`
	Amount        Amount `json:"amount"`
	TransactionType TransType `json:"transactionType"`
}

type Amount struct {
	Amount   string `json:"amount"`
	Currency string `json:"currency"`
}

type TransType struct {
	Scenario    string `json:"scenario"`
	Initiator   string `json:"initiator"`
	InitiatorType string `json:"initiatorType"`
}

type Quote struct {
	QuoteID          string `json:"quoteId"`
	TransactionID    string `json:"transactionId"`
	TransferAmount   Amount `json:"transferAmount"`
	PayeeFSPFee      Amount `json:"payeeFspFee"`
	PayeeFSPCommission Amount `json:"payeeFspCommission"`
	Condition        string `json:"condition"`
	Expiration       string `json:"expiration"`
	Status           string `json:"status"`
}

type TransferRequest struct {
	TransferID string `json:"transferId"`
	QuoteID    string `json:"quoteId"`
	PayerFSP   string `json:"payerFsp"`
	PayeeFSP   string `json:"payeeFsp"`
	Amount     Amount `json:"amount"`
	Condition  string `json:"condition"`
	Expiration string `json:"expiration"`
}

type Transfer struct {
	TransferID    string `json:"transferId"`
	QuoteID       string `json:"quoteId"`
	PayerFSP      string `json:"payerFsp"`
	PayeeFSP      string `json:"payeeFsp"`
	Amount        Amount `json:"amount"`
	TransferState string `json:"transferState"` // RECEIVED, RESERVED, COMMITTED, ABORTED
	Fulfillment   string `json:"fulfilment,omitempty"`
	CompletedAt   string `json:"completedTimestamp,omitempty"`
}

type SettlementWindow struct {
	ID        int    `json:"settlementWindowId"`
	State     string `json:"state"` // OPEN, CLOSED, PENDING_SETTLEMENT, SETTLED
	CreatedAt string `json:"createdDate"`
	ClosedAt  string `json:"changedDate,omitempty"`
}

type Settlement struct {
	ID       int    `json:"id"`
	State    string `json:"state"`
	WindowID int    `json:"settlementWindowId"`
	Accounts []SettlementAccount `json:"accounts"`
}

type SettlementAccount struct {
	FSPID    string `json:"participantId"`
	Currency string `json:"currency"`
	NetAmount float64 `json:"netSettlementAmount"`
	State    string `json:"state"`
}

// ─── State ──────────────────────────────────────────────────────────────────

var (
	dfsps = []DFSP{
		{ID: "tourismpay", Name: "TourismPay", Currency: "USD", Status: "active", Country: "KE", PartyTypes: []string{"MSISDN", "EMAIL", "ACCOUNT_ID"}},
		{ID: "mpesa-ke", Name: "M-Pesa Kenya", Currency: "KES", Status: "active", Country: "KE", PartyTypes: []string{"MSISDN"}},
		{ID: "mtn-momo-ug", Name: "MTN MoMo Uganda", Currency: "UGX", Status: "active", Country: "UG", PartyTypes: []string{"MSISDN"}},
		{ID: "airtel-tz", Name: "Airtel Money Tanzania", Currency: "TZS", Status: "active", Country: "TZ", PartyTypes: []string{"MSISDN"}},
		{ID: "flutterwave", Name: "Flutterwave", Currency: "NGN", Status: "active", Country: "NG", PartyTypes: []string{"ACCOUNT_ID", "EMAIL"}},
		{ID: "chipper-cash", Name: "Chipper Cash", Currency: "USD", Status: "active", Country: "GH", PartyTypes: []string{"EMAIL", "MSISDN"}},
	}
	parties = []Party{
		{PartyIdType: "MSISDN", PartyID: "+254700000001", FSPID: "mpesa-ke", Name: "John Kamau", Currency: "KES"},
		{PartyIdType: "MSISDN", PartyID: "+256700000001", FSPID: "mtn-momo-ug", Name: "Grace Nakamya", Currency: "UGX"},
		{PartyIdType: "EMAIL", PartyID: "tourist@demo.com", FSPID: "tourismpay", Name: "Demo Tourist", Currency: "USD"},
		{PartyIdType: "ACCOUNT_ID", PartyID: "merchant-001", FSPID: "tourismpay", Name: "Safari Lodge", Currency: "KES"},
	}
	quotes    = make(map[string]*Quote)
	transfers = make(map[string]*Transfer)
	windows   = []SettlementWindow{
		{ID: 1, State: "CLOSED", CreatedAt: "2026-04-01T00:00:00Z", ClosedAt: "2026-04-02T00:00:00Z"},
		{ID: 2, State: "OPEN", CreatedAt: "2026-05-01T00:00:00Z"},
	}
	settlements []Settlement
	hubStats    = struct {
		TotalQuotes    int64 `json:"totalQuotes"`
		TotalTransfers int64 `json:"totalTransfers"`
		TotalSettled   int64 `json:"totalSettled"`
		ActiveDFSPs    int   `json:"activeDFSPs"`
	}{ActiveDFSPs: 6}
	mu      sync.RWMutex
	quoteSeq int
	txSeq    int
)

// ─── HTTP API ───────────────────────────────────────────────────────────────

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8107"
	}

	router := gin.Default()
	router.Use(corsMiddleware())

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "healthy",
			"service":   "TourismPay Mojaloop Hub (Go)",
			"version":   "1.0.0",
			"dfsps":     len(dfsps),
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})

	api := router.Group("/api/v1")
	{
		// Participant (DFSP) management
		api.GET("/participants", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"participants": dfsps, "total": len(dfsps)})
		})

		api.GET("/participants/:fspId", func(c *gin.Context) {
			fspId := c.Param("fspId")
			for _, d := range dfsps {
				if d.ID == fspId {
					c.JSON(http.StatusOK, d)
					return
				}
			}
			c.JSON(http.StatusNotFound, gin.H{"error": "DFSP not found"})
		})

		// Party lookup (account resolution)
		api.GET("/parties/:type/:id", func(c *gin.Context) {
			partyType := c.Param("type")
			partyId := c.Param("id")

			for _, p := range parties {
				if p.PartyIdType == partyType && p.PartyID == partyId {
					c.JSON(http.StatusOK, gin.H{"party": p})
					return
				}
			}
			c.JSON(http.StatusNotFound, gin.H{
				"errorInformation": gin.H{
					"errorCode":        "3204",
					"errorDescription": "Party not found",
				},
			})
		})

		// Quotes
		api.POST("/quotes", func(c *gin.Context) {
			var req QuoteRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			mu.Lock()
			quoteSeq++
			if req.QuoteID == "" {
				req.QuoteID = fmt.Sprintf("quote-%d", quoteSeq)
			}

			fee := float64(rand.Intn(200)+50) / 100.0
			quote := &Quote{
				QuoteID:        req.QuoteID,
				TransactionID:  req.TransactionID,
				TransferAmount: req.Amount,
				PayeeFSPFee:    Amount{Amount: fmt.Sprintf("%.2f", fee), Currency: req.Amount.Currency},
				PayeeFSPCommission: Amount{Amount: fmt.Sprintf("%.2f", fee*0.3), Currency: req.Amount.Currency},
				Condition:      fmt.Sprintf("cond_%d", time.Now().UnixNano()),
				Expiration:     time.Now().Add(30 * time.Minute).UTC().Format(time.RFC3339),
				Status:         "RECEIVED",
			}
			quotes[quote.QuoteID] = quote
			hubStats.TotalQuotes++
			mu.Unlock()

			c.JSON(http.StatusCreated, quote)
		})

		api.GET("/quotes/:id", func(c *gin.Context) {
			id := c.Param("id")
			mu.RLock()
			q, ok := quotes[id]
			mu.RUnlock()
			if !ok {
				c.JSON(http.StatusNotFound, gin.H{"error": "quote not found"})
				return
			}
			c.JSON(http.StatusOK, q)
		})

		// Transfers
		api.POST("/transfers", func(c *gin.Context) {
			var req TransferRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			mu.Lock()
			txSeq++
			if req.TransferID == "" {
				req.TransferID = fmt.Sprintf("tx-%d", txSeq)
			}

			transfer := &Transfer{
				TransferID:    req.TransferID,
				QuoteID:       req.QuoteID,
				PayerFSP:      req.PayerFSP,
				PayeeFSP:      req.PayeeFSP,
				Amount:        req.Amount,
				TransferState: "RESERVED",
			}
			transfers[transfer.TransferID] = transfer
			hubStats.TotalTransfers++
			mu.Unlock()

			c.JSON(http.StatusCreated, transfer)
		})

		api.PUT("/transfers/:id", func(c *gin.Context) {
			id := c.Param("id")
			mu.Lock()
			t, ok := transfers[id]
			if !ok {
				mu.Unlock()
				c.JSON(http.StatusNotFound, gin.H{"error": "transfer not found"})
				return
			}
			t.TransferState = "COMMITTED"
			t.Fulfillment = fmt.Sprintf("ful_%d", time.Now().UnixNano())
			t.CompletedAt = time.Now().UTC().Format(time.RFC3339)
			hubStats.TotalSettled++
			mu.Unlock()

			c.JSON(http.StatusOK, t)
		})

		api.GET("/transfers/:id", func(c *gin.Context) {
			id := c.Param("id")
			mu.RLock()
			t, ok := transfers[id]
			mu.RUnlock()
			if !ok {
				c.JSON(http.StatusNotFound, gin.H{"error": "transfer not found"})
				return
			}
			c.JSON(http.StatusOK, t)
		})

		// Settlement windows
		api.GET("/settlement-windows", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"windows": windows, "total": len(windows)})
		})

		api.POST("/settlement-windows/:id/close", func(c *gin.Context) {
			id := c.Param("id")
			for i, w := range windows {
				if fmt.Sprintf("%d", w.ID) == id && w.State == "OPEN" {
					windows[i].State = "CLOSED"
					windows[i].ClosedAt = time.Now().UTC().Format(time.RFC3339)
					c.JSON(http.StatusOK, windows[i])
					return
				}
			}
			c.JSON(http.StatusNotFound, gin.H{"error": "open window not found"})
		})

		// Settlements
		api.POST("/settlements", func(c *gin.Context) {
			var req struct {
				WindowID int `json:"settlementWindowId" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			settlement := Settlement{
				ID:       len(settlements) + 1,
				State:    "PENDING_SETTLEMENT",
				WindowID: req.WindowID,
				Accounts: []SettlementAccount{
					{FSPID: "tourismpay", Currency: "USD", NetAmount: 1250.00, State: "PENDING_SETTLEMENT"},
					{FSPID: "mpesa-ke", Currency: "KES", NetAmount: -150000.00, State: "PENDING_SETTLEMENT"},
				},
			}
			settlements = append(settlements, settlement)
			c.JSON(http.StatusCreated, settlement)
		})

		api.GET("/settlements", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"settlements": settlements, "total": len(settlements)})
		})

		// Hub stats
		api.GET("/stats", func(c *gin.Context) {
			mu.RLock()
			defer mu.RUnlock()
			c.JSON(http.StatusOK, hubStats)
		})
	}

	log.Printf("[Mojaloop Hub] Starting on port %s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start: %v", err)
	}
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id, FSPIOP-Source, FSPIOP-Destination")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusOK)
			return
		}
		c.Next()
	}
}
