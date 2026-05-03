package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ─── Models ─────────────────────────────────────────────────────────────────

type DaprApp struct {
	AppID   string `json:"appId"`
	AppPort int    `json:"appPort"`
	Status  string `json:"status"`
}

type PubSubMessage struct {
	Topic   string          `json:"topic" binding:"required"`
	Data    json.RawMessage `json:"data" binding:"required"`
	PubSub  string          `json:"pubsubName"`
}

type StateEntry struct {
	Key   string          `json:"key"`
	Value json.RawMessage `json:"value"`
	ETag  string          `json:"etag,omitempty"`
}

type BindingRequest struct {
	Name      string          `json:"name" binding:"required"`
	Operation string          `json:"operation" binding:"required"`
	Data      json.RawMessage `json:"data"`
	Metadata  map[string]string `json:"metadata,omitempty"`
}

type InvokeRequest struct {
	AppID   string          `json:"appId" binding:"required"`
	Method  string          `json:"method" binding:"required"`
	Data    json.RawMessage `json:"data,omitempty"`
}

type SecretEntry struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// ─── State ──────────────────────────────────────────────────────────────────

var (
	stateStore     = make(map[string]map[string]json.RawMessage) // storeName -> key -> value
	pubsubMessages []PubSubMessage
	subscriptions  = map[string][]string{
		"kafka-pubsub": {
			"transaction.created", "transaction.completed", "transaction.failed",
			"kyb.submitted", "kyb.approved", "user.registered",
			"payment.initiated", "payment.settled", "fraud.alert",
		},
		"redis-pubsub": {
			"cache.invalidation", "session.expired", "rate.limit.exceeded",
		},
	}
	registeredApps = []DaprApp{
		{AppID: "tourismpay-pwa", AppPort: 3000, Status: "running"},
		{AppID: "kafka-processor", AppPort: 8100, Status: "running"},
		{AppID: "temporal-worker", AppPort: 8101, Status: "running"},
		{AppID: "go-settlement", AppPort: 8081, Status: "running"},
		{AppID: "python-ml", AppPort: 8001, Status: "running"},
		{AppID: "pbac-engine", AppPort: 8090, Status: "running"},
	}
	bindings = map[string]string{
		"kafka-binding":   "kafka",
		"redis-binding":   "redis",
		"cron-settlement": "cron",
		"email-binding":   "smtp",
		"s3-binding":      "aws.s3",
	}
	secretStores = map[string]map[string]string{
		"local-secrets": {
			"jwt-secret":      "placeholder",
			"stripe-key":      "placeholder",
			"db-password":     "placeholder",
			"redis-password":  "placeholder",
			"kafka-password":  "placeholder",
		},
	}
	daprStats = struct {
		TotalInvocations  int64 `json:"totalInvocations"`
		TotalPubSub       int64 `json:"totalPubSub"`
		TotalStateOps     int64 `json:"totalStateOps"`
		TotalBindingOps   int64 `json:"totalBindingOps"`
		TotalSecretReads  int64 `json:"totalSecretReads"`
	}{}
	mu sync.RWMutex
)

func init() {
	stateStore["statestore"] = make(map[string]json.RawMessage)
	stateStore["session-store"] = make(map[string]json.RawMessage)
}

// ─── HTTP API ───────────────────────────────────────────────────────────────

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8106"
	}

	daprPort := os.Getenv("DAPR_HTTP_PORT")
	if daprPort == "" {
		daprPort = "3500"
	}

	router := gin.Default()
	router.Use(corsMiddleware())

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "healthy",
			"service":   "TourismPay Dapr Gateway (Go)",
			"version":   "1.0.0",
			"daprPort":  daprPort,
			"apps":      len(registeredApps),
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})

	api := router.Group("/api/v1")
	{
		// Service invocation
		api.POST("/invoke", func(c *gin.Context) {
			var req InvokeRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			mu.Lock()
			daprStats.TotalInvocations++
			mu.Unlock()

			c.JSON(http.StatusOK, gin.H{
				"appId":   req.AppID,
				"method":  req.Method,
				"status":  "invoked",
				"result":  gin.H{"message": fmt.Sprintf("Successfully invoked %s.%s", req.AppID, req.Method)},
			})
		})

		// Pub/Sub
		api.POST("/publish", func(c *gin.Context) {
			var msg PubSubMessage
			if err := c.ShouldBindJSON(&msg); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			if msg.PubSub == "" {
				msg.PubSub = "kafka-pubsub"
			}

			mu.Lock()
			pubsubMessages = append(pubsubMessages, msg)
			daprStats.TotalPubSub++
			if len(pubsubMessages) > 500 {
				pubsubMessages = pubsubMessages[len(pubsubMessages)-500:]
			}
			mu.Unlock()

			c.JSON(http.StatusOK, gin.H{"status": "published", "topic": msg.Topic, "pubsub": msg.PubSub})
		})

		api.GET("/subscriptions", func(c *gin.Context) {
			c.JSON(http.StatusOK, subscriptions)
		})

		// State management
		api.POST("/state/:storeName", func(c *gin.Context) {
			storeName := c.Param("storeName")
			var entries []StateEntry
			if err := c.ShouldBindJSON(&entries); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			mu.Lock()
			store, ok := stateStore[storeName]
			if !ok {
				store = make(map[string]json.RawMessage)
				stateStore[storeName] = store
			}
			for _, e := range entries {
				store[e.Key] = e.Value
			}
			daprStats.TotalStateOps++
			mu.Unlock()

			c.JSON(http.StatusNoContent, nil)
		})

		api.GET("/state/:storeName/:key", func(c *gin.Context) {
			storeName := c.Param("storeName")
			key := c.Param("key")

			mu.RLock()
			store, ok := stateStore[storeName]
			if !ok {
				mu.RUnlock()
				c.JSON(http.StatusNotFound, gin.H{"error": "store not found"})
				return
			}
			value, ok := store[key]
			mu.RUnlock()

			if !ok {
				c.JSON(http.StatusNoContent, nil)
				return
			}

			mu.Lock()
			daprStats.TotalStateOps++
			mu.Unlock()

			c.Data(http.StatusOK, "application/json", value)
		})

		api.DELETE("/state/:storeName/:key", func(c *gin.Context) {
			storeName := c.Param("storeName")
			key := c.Param("key")

			mu.Lock()
			store, ok := stateStore[storeName]
			if ok {
				delete(store, key)
			}
			daprStats.TotalStateOps++
			mu.Unlock()

			c.JSON(http.StatusNoContent, nil)
		})

		// Bindings
		api.POST("/bindings/:name", func(c *gin.Context) {
			name := c.Param("name")
			var req BindingRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			req.Name = name

			mu.Lock()
			daprStats.TotalBindingOps++
			mu.Unlock()

			c.JSON(http.StatusOK, gin.H{
				"binding":   name,
				"operation": req.Operation,
				"status":    "executed",
			})
		})

		api.GET("/bindings", func(c *gin.Context) {
			c.JSON(http.StatusOK, bindings)
		})

		// Secrets
		api.GET("/secrets/:storeName/:key", func(c *gin.Context) {
			storeName := c.Param("storeName")
			key := c.Param("key")

			store, ok := secretStores[storeName]
			if !ok {
				c.JSON(http.StatusNotFound, gin.H{"error": "secret store not found"})
				return
			}
			value, ok := store[key]
			if !ok {
				c.JSON(http.StatusNotFound, gin.H{"error": "secret not found"})
				return
			}

			mu.Lock()
			daprStats.TotalSecretReads++
			mu.Unlock()

			c.JSON(http.StatusOK, gin.H{key: value})
		})

		// Registered apps
		api.GET("/apps", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"apps": registeredApps})
		})

		// Stats
		api.GET("/stats", func(c *gin.Context) {
			mu.RLock()
			defer mu.RUnlock()
			c.JSON(http.StatusOK, daprStats)
		})

		// Metadata
		api.GET("/metadata", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"id":       "tourismpay-dapr",
				"runtime":  "1.13",
				"components": []gin.H{
					{"name": "statestore", "type": "state.redis", "version": "v1"},
					{"name": "kafka-pubsub", "type": "pubsub.kafka", "version": "v1"},
					{"name": "redis-pubsub", "type": "pubsub.redis", "version": "v1"},
					{"name": "local-secrets", "type": "secretstores.local.file", "version": "v1"},
					{"name": "cron-settlement", "type": "bindings.cron", "version": "v1"},
				},
				"subscriptions": subscriptions,
			})
		})
	}

	log.Printf("[Dapr Gateway] Starting on port %s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start: %v", err)
	}
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id, dapr-app-id")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusOK)
			return
		}
		c.Next()
	}
}
