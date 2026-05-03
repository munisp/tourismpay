package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ─── Workflow Definitions ───────────────────────────────────────────────────

type WorkflowType string

const (
	KybOnboarding      WorkflowType = "kyb-onboarding"
	SettlementCycle     WorkflowType = "settlement-cycle"
	RemittanceTransfer  WorkflowType = "remittance-transfer"
	FraudInvestigation  WorkflowType = "fraud-investigation"
	MerchantOnboarding  WorkflowType = "merchant-onboarding"
)

type WorkflowStatus string

const (
	Running    WorkflowStatus = "RUNNING"
	Completed  WorkflowStatus = "COMPLETED"
	Failed     WorkflowStatus = "FAILED"
	Cancelled  WorkflowStatus = "CANCELLED"
	TimedOut   WorkflowStatus = "TIMED_OUT"
	Paused     WorkflowStatus = "PAUSED"
)

type WorkflowExecution struct {
	WorkflowID  string            `json:"workflowId"`
	RunID       string            `json:"runId"`
	Type        WorkflowType      `json:"type"`
	Status      WorkflowStatus    `json:"status"`
	Input       json.RawMessage   `json:"input"`
	Output      json.RawMessage   `json:"output,omitempty"`
	StartedAt   string            `json:"startedAt"`
	CompletedAt string            `json:"completedAt,omitempty"`
	TaskQueue   string            `json:"taskQueue"`
	Activities  []ActivityExec    `json:"activities"`
	Signals     []WorkflowSignal  `json:"signals"`
	Memo        map[string]string `json:"memo,omitempty"`
}

type ActivityExec struct {
	Name      string         `json:"name"`
	Status    WorkflowStatus `json:"status"`
	Input     json.RawMessage `json:"input,omitempty"`
	Output    json.RawMessage `json:"output,omitempty"`
	StartedAt string         `json:"startedAt"`
	Duration  string         `json:"duration,omitempty"`
	Attempt   int            `json:"attempt"`
}

type WorkflowSignal struct {
	Name      string          `json:"name"`
	Data      json.RawMessage `json:"data,omitempty"`
	Timestamp string          `json:"timestamp"`
}

type StartWorkflowRequest struct {
	WorkflowID string          `json:"workflowId"`
	Type       WorkflowType    `json:"type" binding:"required"`
	Input      json.RawMessage `json:"input" binding:"required"`
	TaskQueue  string          `json:"taskQueue,omitempty"`
	Memo       map[string]string `json:"memo,omitempty"`
}

type SignalRequest struct {
	Name string          `json:"name" binding:"required"`
	Data json.RawMessage `json:"data,omitempty"`
}

type QueryRequest struct {
	QueryType string          `json:"queryType" binding:"required"`
	Args      json.RawMessage `json:"args,omitempty"`
}

// ─── Workflow Activities ────────────────────────────────────────────────────

var workflowActivities = map[WorkflowType][]string{
	KybOnboarding: {
		"ValidateDocuments",
		"RunAMLScreening",
		"VerifyBusinessRegistration",
		"CheckSanctionsList",
		"AssignComplianceOfficer",
		"CreateMerchantAccount",
		"ProvisionPaymentCapabilities",
		"SendApprovalNotification",
	},
	SettlementCycle: {
		"CollectPendingTransactions",
		"CalculateNetPositions",
		"ValidateSettlementAmounts",
		"CreateTigerBeetleTransfers",
		"ExecuteBatchTransfers",
		"GenerateSettlementReport",
		"NotifyMerchants",
		"ArchiveSettlementData",
	},
	RemittanceTransfer: {
		"ValidateSenderKYC",
		"CheckComplianceLimits",
		"GetExchangeRate",
		"CreateDebitEntry",
		"InitiateMojaloopTransfer",
		"WaitForFulfillment",
		"CreateCreditEntry",
		"SendConfirmation",
	},
	FraudInvestigation: {
		"GatherTransactionEvidence",
		"RunMLFraudScoring",
		"CheckHistoricalPatterns",
		"AssessRiskLevel",
		"FreezeAccountIfNeeded",
		"CreateInvestigationCase",
		"AssignInvestigator",
		"MonitorOngoingActivity",
	},
	MerchantOnboarding: {
		"CollectBusinessInfo",
		"VerifyOwnerIdentity",
		"ValidateBankDetails",
		"SetupStripeConnect",
		"CreateTigerBeetleAccounts",
		"ConfigurePaymentMethods",
		"GenerateQRCodes",
		"ActivateMerchant",
	},
}

// ─── State ──────────────────────────────────────────────────────────────────

var (
	workflows = make(map[string]*WorkflowExecution)
	mu        sync.RWMutex
	workerStats = struct {
		TotalStarted   int64 `json:"totalStarted"`
		TotalCompleted int64 `json:"totalCompleted"`
		TotalFailed    int64 `json:"totalFailed"`
		ActiveWorkers  int   `json:"activeWorkers"`
	}{ActiveWorkers: 4}
)

func generateRunID() string {
	return fmt.Sprintf("run_%d_%d", time.Now().UnixNano(), rand.Intn(10000))
}

// ─── Workflow Engine ────────────────────────────────────────────────────────

func executeWorkflow(wf *WorkflowExecution) {
	activities, ok := workflowActivities[wf.Type]
	if !ok {
		mu.Lock()
		wf.Status = Failed
		wf.CompletedAt = time.Now().UTC().Format(time.RFC3339)
		workerStats.TotalFailed++
		mu.Unlock()
		return
	}

	for _, actName := range activities {
		mu.Lock()
		if wf.Status == Cancelled {
			mu.Unlock()
			return
		}

		activity := ActivityExec{
			Name:      actName,
			Status:    Running,
			StartedAt: time.Now().UTC().Format(time.RFC3339),
			Attempt:   1,
		}
		wf.Activities = append(wf.Activities, activity)
		mu.Unlock()

		// Simulate activity execution
		duration := time.Duration(100+rand.Intn(400)) * time.Millisecond
		time.Sleep(duration)

		mu.Lock()
		idx := len(wf.Activities) - 1
		wf.Activities[idx].Status = Completed
		wf.Activities[idx].Duration = duration.String()
		wf.Activities[idx].Output, _ = json.Marshal(map[string]interface{}{
			"result": "success",
			"activity": actName,
		})
		mu.Unlock()
	}

	mu.Lock()
	wf.Status = Completed
	wf.CompletedAt = time.Now().UTC().Format(time.RFC3339)
	wf.Output, _ = json.Marshal(map[string]interface{}{
		"result":     "workflow_completed",
		"activities": len(wf.Activities),
	})
	workerStats.TotalCompleted++
	mu.Unlock()
}

// ─── HTTP API ───────────────────────────────────────────────────────────────

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8101"
	}

	router := gin.Default()
	router.Use(corsMiddleware())

	router.GET("/health", func(c *gin.Context) {
		mu.RLock()
		active := 0
		for _, wf := range workflows {
			if wf.Status == Running {
				active++
			}
		}
		mu.RUnlock()

		c.JSON(http.StatusOK, gin.H{
			"status":          "healthy",
			"service":         "TourismPay Temporal Worker (Go)",
			"version":         "1.0.0",
			"activeWorkflows": active,
			"timestamp":       time.Now().UTC().Format(time.RFC3339),
		})
	})

	api := router.Group("/api/v1")
	{
		// Start workflow
		api.POST("/workflows", func(c *gin.Context) {
			var req StartWorkflowRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			if req.WorkflowID == "" {
				req.WorkflowID = fmt.Sprintf("wf_%s_%d", req.Type, time.Now().UnixNano())
			}
			if req.TaskQueue == "" {
				req.TaskQueue = fmt.Sprintf("tourismpay-%s", req.Type)
			}

			wf := &WorkflowExecution{
				WorkflowID: req.WorkflowID,
				RunID:      generateRunID(),
				Type:       req.Type,
				Status:     Running,
				Input:      req.Input,
				StartedAt:  time.Now().UTC().Format(time.RFC3339),
				TaskQueue:  req.TaskQueue,
				Activities: []ActivityExec{},
				Signals:    []WorkflowSignal{},
				Memo:       req.Memo,
			}

			mu.Lock()
			workflows[req.WorkflowID] = wf
			workerStats.TotalStarted++
			mu.Unlock()

			go executeWorkflow(wf)

			c.JSON(http.StatusCreated, gin.H{
				"workflowId": wf.WorkflowID,
				"runId":      wf.RunID,
				"status":     wf.Status,
			})
		})

		// Get workflow
		api.GET("/workflows/:id", func(c *gin.Context) {
			id := c.Param("id")
			mu.RLock()
			wf, ok := workflows[id]
			mu.RUnlock()
			if !ok {
				c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
				return
			}
			c.JSON(http.StatusOK, wf)
		})

		// List workflows
		api.GET("/workflows", func(c *gin.Context) {
			typeFilter := c.Query("type")
			statusFilter := c.Query("status")

			mu.RLock()
			var result []*WorkflowExecution
			for _, wf := range workflows {
				if typeFilter != "" && string(wf.Type) != typeFilter {
					continue
				}
				if statusFilter != "" && string(wf.Status) != statusFilter {
					continue
				}
				result = append(result, wf)
			}
			mu.RUnlock()

			c.JSON(http.StatusOK, gin.H{
				"workflows": result,
				"total":     len(result),
			})
		})

		// Signal workflow
		api.POST("/workflows/:id/signal", func(c *gin.Context) {
			id := c.Param("id")
			var req SignalRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			mu.Lock()
			wf, ok := workflows[id]
			if !ok {
				mu.Unlock()
				c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
				return
			}
			wf.Signals = append(wf.Signals, WorkflowSignal{
				Name:      req.Name,
				Data:      req.Data,
				Timestamp: time.Now().UTC().Format(time.RFC3339),
			})
			mu.Unlock()

			c.JSON(http.StatusOK, gin.H{"status": "signaled"})
		})

		// Query workflow
		api.POST("/workflows/:id/query", func(c *gin.Context) {
			id := c.Param("id")
			var req QueryRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			mu.RLock()
			wf, ok := workflows[id]
			mu.RUnlock()
			if !ok {
				c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
				return
			}

			switch req.QueryType {
			case "status":
				c.JSON(http.StatusOK, gin.H{
					"status":     wf.Status,
					"activities": len(wf.Activities),
				})
			case "progress":
				total := len(workflowActivities[wf.Type])
				completed := 0
				for _, a := range wf.Activities {
					if a.Status == Completed {
						completed++
					}
				}
				c.JSON(http.StatusOK, gin.H{
					"total":     total,
					"completed": completed,
					"percent":   float64(completed) / float64(total) * 100,
				})
			default:
				c.JSON(http.StatusBadRequest, gin.H{"error": "unknown query type"})
			}
		})

		// Cancel workflow
		api.POST("/workflows/:id/cancel", func(c *gin.Context) {
			id := c.Param("id")
			mu.Lock()
			wf, ok := workflows[id]
			if !ok {
				mu.Unlock()
				c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
				return
			}
			wf.Status = Cancelled
			wf.CompletedAt = time.Now().UTC().Format(time.RFC3339)
			mu.Unlock()

			c.JSON(http.StatusOK, gin.H{"status": "cancelled"})
		})

		// Worker stats
		api.GET("/workers", func(c *gin.Context) {
			mu.RLock()
			defer mu.RUnlock()
			c.JSON(http.StatusOK, workerStats)
		})

		// Task queues
		api.GET("/task-queues", func(c *gin.Context) {
			queues := make([]gin.H, 0, len(workflowActivities))
			for wfType, activities := range workflowActivities {
				queues = append(queues, gin.H{
					"name":       fmt.Sprintf("tourismpay-%s", wfType),
					"type":       wfType,
					"activities": activities,
					"pollers":    1,
				})
			}
			c.JSON(http.StatusOK, gin.H{"taskQueues": queues})
		})

		// Workflow history
		api.GET("/workflows/:id/history", func(c *gin.Context) {
			id := c.Param("id")
			mu.RLock()
			wf, ok := workflows[id]
			mu.RUnlock()
			if !ok {
				c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
				return
			}

			events := make([]gin.H, 0)
			events = append(events, gin.H{
				"eventType": "WorkflowExecutionStarted",
				"timestamp": wf.StartedAt,
				"details":   gin.H{"type": wf.Type, "taskQueue": wf.TaskQueue},
			})
			for _, a := range wf.Activities {
				events = append(events, gin.H{
					"eventType": "ActivityTaskScheduled",
					"timestamp": a.StartedAt,
					"details":   gin.H{"activity": a.Name, "attempt": a.Attempt},
				})
				if a.Status == Completed {
					events = append(events, gin.H{
						"eventType": "ActivityTaskCompleted",
						"timestamp": a.StartedAt,
						"details":   gin.H{"activity": a.Name, "duration": a.Duration},
					})
				}
			}
			if wf.CompletedAt != "" {
				events = append(events, gin.H{
					"eventType": fmt.Sprintf("WorkflowExecution%s", wf.Status),
					"timestamp": wf.CompletedAt,
				})
			}

			c.JSON(http.StatusOK, gin.H{"events": events, "total": len(events)})
		})
	}

	log.Printf("[Temporal Worker] Starting on port %s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start: %v", err)
	}
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusOK)
			return
		}
		c.Next()
	}
}
