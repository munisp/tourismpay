package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ─── Configuration ──────────────────────────────────────────────────────────

type Config struct {
	Port       string
	BrokerURL  string
	GroupID    string
	Topics     []string
}

func loadConfig() Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8100"
	}
	broker := os.Getenv("KAFKA_BROKER_URL")
	if broker == "" {
		broker = "localhost:9092"
	}
	return Config{
		Port:      port,
		BrokerURL: broker,
		GroupID:   "tourismpay-processor",
		Topics: []string{
			"transaction.created",
			"transaction.completed",
			"transaction.failed",
			"kyb.submitted",
			"kyb.approved",
			"kyb.rejected",
			"user.registered",
			"user.verified",
			"payment.initiated",
			"payment.settled",
			"fraud.alert",
			"compliance.check",
			"settlement.cycle",
		},
	}
}

// ─── Event Models ───────────────────────────────────────────────────────────

type CloudEvent struct {
	SpecVersion string          `json:"specversion"`
	Type        string          `json:"type"`
	Source      string          `json:"source"`
	ID          string          `json:"id"`
	Time        string          `json:"time"`
	DataSchema  string          `json:"datacontenttype"`
	Data        json.RawMessage `json:"data"`
}

type EventStats struct {
	TotalReceived    int64            `json:"totalReceived"`
	TotalProcessed   int64            `json:"totalProcessed"`
	TotalFailed      int64            `json:"totalFailed"`
	TopicCounts      map[string]int64 `json:"topicCounts"`
	LastProcessed    string           `json:"lastProcessed"`
	ProcessingRate   float64          `json:"processingRatePerSec"`
	ConsumerLag      int64            `json:"consumerLag"`
	PartitionOffsets map[string]int64 `json:"partitionOffsets"`
}

type TopicConfig struct {
	Name              string `json:"name"`
	Partitions        int    `json:"partitions"`
	ReplicationFactor int    `json:"replicationFactor"`
	RetentionMs       int64  `json:"retentionMs"`
	CleanupPolicy     string `json:"cleanupPolicy"`
}

type ProducerMessage struct {
	Topic   string          `json:"topic"`
	Key     string          `json:"key"`
	Value   json.RawMessage `json:"value"`
	Headers map[string]string `json:"headers,omitempty"`
}

type DeadLetterEntry struct {
	ID        string          `json:"id"`
	Topic     string          `json:"topic"`
	Key       string          `json:"key"`
	Value     json.RawMessage `json:"value"`
	Error     string          `json:"error"`
	Timestamp string          `json:"timestamp"`
	Retries   int             `json:"retries"`
}

// ─── In-memory state ────────────────────────────────────────────────────────

var (
	stats = EventStats{
		TopicCounts:      make(map[string]int64),
		PartitionOffsets: make(map[string]int64),
	}
	deadLetterQueue []DeadLetterEntry
	eventLog        []CloudEvent
	mu              sync.RWMutex
	startTime       = time.Now()
)

// ─── Event Processing Pipeline ──────────────────────────────────────────────

type EventHandler func(event CloudEvent) error

var handlers = map[string]EventHandler{
	"transaction.created":   handleTransactionCreated,
	"transaction.completed": handleTransactionCompleted,
	"transaction.failed":    handleTransactionFailed,
	"kyb.submitted":         handleKybSubmitted,
	"kyb.approved":          handleKybApproved,
	"kyb.rejected":          handleKybRejected,
	"user.registered":       handleUserRegistered,
	"user.verified":         handleUserVerified,
	"payment.initiated":     handlePaymentInitiated,
	"payment.settled":       handlePaymentSettled,
	"fraud.alert":           handleFraudAlert,
	"compliance.check":      handleComplianceCheck,
	"settlement.cycle":      handleSettlementCycle,
}

func processEvent(event CloudEvent) error {
	mu.Lock()
	stats.TotalReceived++
	stats.TopicCounts[event.Type]++
	mu.Unlock()

	handler, ok := handlers[event.Type]
	if !ok {
		mu.Lock()
		stats.TotalFailed++
		mu.Unlock()
		return fmt.Errorf("no handler for event type: %s", event.Type)
	}

	if err := handler(event); err != nil {
		mu.Lock()
		stats.TotalFailed++
		deadLetterQueue = append(deadLetterQueue, DeadLetterEntry{
			ID:        event.ID,
			Topic:     event.Type,
			Key:       event.ID,
			Value:     event.Data,
			Error:     err.Error(),
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Retries:   0,
		})
		mu.Unlock()
		return err
	}

	mu.Lock()
	stats.TotalProcessed++
	stats.LastProcessed = time.Now().UTC().Format(time.RFC3339)
	elapsed := time.Since(startTime).Seconds()
	if elapsed > 0 {
		stats.ProcessingRate = float64(stats.TotalProcessed) / elapsed
	}
	eventLog = append(eventLog, event)
	if len(eventLog) > 1000 {
		eventLog = eventLog[len(eventLog)-1000:]
	}
	mu.Unlock()

	return nil
}

// ─── Event Handlers ─────────────────────────────────────────────────────────

func handleTransactionCreated(event CloudEvent) error {
	log.Printf("[Kafka] Processing transaction.created: %s", event.ID)
	// Validate transaction data, enrich with merchant info, forward to settlement
	return nil
}

func handleTransactionCompleted(event CloudEvent) error {
	log.Printf("[Kafka] Processing transaction.completed: %s", event.ID)
	// Update ledger, trigger settlement batch, notify merchant
	return nil
}

func handleTransactionFailed(event CloudEvent) error {
	log.Printf("[Kafka] Processing transaction.failed: %s", event.ID)
	// Initiate refund flow, alert fraud service, log for audit
	return nil
}

func handleKybSubmitted(event CloudEvent) error {
	log.Printf("[Kafka] Processing kyb.submitted: %s", event.ID)
	// Queue for compliance review, run AML checks, notify compliance officers
	return nil
}

func handleKybApproved(event CloudEvent) error {
	log.Printf("[Kafka] Processing kyb.approved: %s", event.ID)
	// Activate merchant, create TigerBeetle accounts, enable payment processing
	return nil
}

func handleKybRejected(event CloudEvent) error {
	log.Printf("[Kafka] Processing kyb.rejected: %s", event.ID)
	// Notify merchant, log rejection reason, schedule re-review if applicable
	return nil
}

func handleUserRegistered(event CloudEvent) error {
	log.Printf("[Kafka] Processing user.registered: %s", event.ID)
	// Create Keycloak user, initialize wallet, send welcome notification
	return nil
}

func handleUserVerified(event CloudEvent) error {
	log.Printf("[Kafka] Processing user.verified: %s", event.ID)
	// Update KYC status, enable full features, create loyalty profile
	return nil
}

func handlePaymentInitiated(event CloudEvent) error {
	log.Printf("[Kafka] Processing payment.initiated: %s", event.ID)
	// Validate payment, check fraud score, create pending ledger entry
	return nil
}

func handlePaymentSettled(event CloudEvent) error {
	log.Printf("[Kafka] Processing payment.settled: %s", event.ID)
	// Finalize ledger entry, calculate merchant payout, update analytics
	return nil
}

func handleFraudAlert(event CloudEvent) error {
	log.Printf("[Kafka] Processing fraud.alert: %s", event.ID)
	// Escalate to compliance, freeze account if severe, log evidence
	return nil
}

func handleComplianceCheck(event CloudEvent) error {
	log.Printf("[Kafka] Processing compliance.check: %s", event.ID)
	// Run sanctions screening, check PEP lists, generate compliance report
	return nil
}

func handleSettlementCycle(event CloudEvent) error {
	log.Printf("[Kafka] Processing settlement.cycle: %s", event.ID)
	// Calculate net positions, initiate batch transfers, generate settlement report
	return nil
}

// ─── HTTP API ───────────────────────────────────────────────────────────────

func main() {
	cfg := loadConfig()
	router := gin.Default()

	router.Use(corsMiddleware())

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "healthy",
			"service":   "TourismPay Kafka Processor (Go)",
			"version":   "1.0.0",
			"broker":    cfg.BrokerURL,
			"topics":    cfg.Topics,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})

	api := router.Group("/api/v1")
	{
		// Event publishing
		api.POST("/publish", func(c *gin.Context) {
			var msg ProducerMessage
			if err := c.ShouldBindJSON(&msg); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			event := CloudEvent{
				SpecVersion: "1.0",
				Type:        msg.Topic,
				Source:      "tourismpay/api",
				ID:          fmt.Sprintf("evt_%d", time.Now().UnixNano()),
				Time:        time.Now().UTC().Format(time.RFC3339),
				DataSchema:  "application/json",
				Data:        msg.Value,
			}

			if err := processEvent(event); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}

			c.JSON(http.StatusAccepted, gin.H{
				"eventId": event.ID,
				"topic":   msg.Topic,
				"status":  "accepted",
			})
		})

		// Batch publish
		api.POST("/publish/batch", func(c *gin.Context) {
			var messages []ProducerMessage
			if err := c.ShouldBindJSON(&messages); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			results := make([]gin.H, len(messages))
			for i, msg := range messages {
				event := CloudEvent{
					SpecVersion: "1.0",
					Type:        msg.Topic,
					Source:      "tourismpay/api",
					ID:          fmt.Sprintf("evt_%d_%d", time.Now().UnixNano(), i),
					Time:        time.Now().UTC().Format(time.RFC3339),
					DataSchema:  "application/json",
					Data:        msg.Value,
				}

				err := processEvent(event)
				status := "accepted"
				if err != nil {
					status = "failed"
				}
				results[i] = gin.H{
					"eventId": event.ID,
					"topic":   msg.Topic,
					"status":  status,
				}
			}

			c.JSON(http.StatusAccepted, gin.H{
				"results": results,
				"total":   len(messages),
			})
		})

		// Consumer stats
		api.GET("/stats", func(c *gin.Context) {
			mu.RLock()
			defer mu.RUnlock()
			c.JSON(http.StatusOK, stats)
		})

		// Topic management
		api.GET("/topics", func(c *gin.Context) {
			topics := make([]TopicConfig, len(cfg.Topics))
			for i, t := range cfg.Topics {
				topics[i] = TopicConfig{
					Name:              t,
					Partitions:        3,
					ReplicationFactor: 1,
					RetentionMs:       604800000, // 7 days
					CleanupPolicy:     "delete",
				}
			}
			c.JSON(http.StatusOK, gin.H{"topics": topics})
		})

		api.POST("/topics", func(c *gin.Context) {
			var topic TopicConfig
			if err := c.ShouldBindJSON(&topic); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			cfg.Topics = append(cfg.Topics, topic.Name)
			c.JSON(http.StatusCreated, gin.H{
				"topic":  topic.Name,
				"status": "created",
			})
		})

		// Consumer groups
		api.GET("/consumer-groups", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"groups": []gin.H{
					{
						"groupId":    cfg.GroupID,
						"state":      "stable",
						"members":    1,
						"topics":     cfg.Topics,
						"lag":        stats.ConsumerLag,
						"coordinator": cfg.BrokerURL,
					},
				},
			})
		})

		// Dead letter queue
		api.GET("/dlq", func(c *gin.Context) {
			mu.RLock()
			defer mu.RUnlock()
			c.JSON(http.StatusOK, gin.H{
				"entries": deadLetterQueue,
				"total":   len(deadLetterQueue),
			})
		})

		api.POST("/dlq/:id/retry", func(c *gin.Context) {
			id := c.Param("id")
			mu.Lock()
			for i, entry := range deadLetterQueue {
				if entry.ID == id {
					event := CloudEvent{
						SpecVersion: "1.0",
						Type:        entry.Topic,
						Source:      "tourismpay/dlq-retry",
						ID:          entry.ID,
						Time:        time.Now().UTC().Format(time.RFC3339),
						DataSchema:  "application/json",
						Data:        entry.Value,
					}
					deadLetterQueue[i].Retries++
					mu.Unlock()

					if err := processEvent(event); err != nil {
						c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
						return
					}

					mu.Lock()
					deadLetterQueue = append(deadLetterQueue[:i], deadLetterQueue[i+1:]...)
					mu.Unlock()

					c.JSON(http.StatusOK, gin.H{"status": "retried", "eventId": id})
					return
				}
			}
			mu.Unlock()
			c.JSON(http.StatusNotFound, gin.H{"error": "DLQ entry not found"})
		})

		// Recent events
		api.GET("/events", func(c *gin.Context) {
			mu.RLock()
			defer mu.RUnlock()
			limit := 50
			start := 0
			if len(eventLog) > limit {
				start = len(eventLog) - limit
			}
			c.JSON(http.StatusOK, gin.H{
				"events": eventLog[start:],
				"total":  len(eventLog),
			})
		})

		// Schema registry (simplified)
		api.GET("/schemas", func(c *gin.Context) {
			schemas := map[string]interface{}{
				"transaction.created": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"transactionId": map[string]string{"type": "string"},
						"amount":        map[string]string{"type": "number"},
						"currency":      map[string]string{"type": "string"},
						"merchantId":    map[string]string{"type": "string"},
						"touristId":     map[string]string{"type": "string"},
						"paymentMethod": map[string]string{"type": "string"},
					},
				},
				"kyb.submitted": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"applicationId": map[string]string{"type": "string"},
						"merchantName":  map[string]string{"type": "string"},
						"country":       map[string]string{"type": "string"},
						"businessType":  map[string]string{"type": "string"},
					},
				},
				"fraud.alert": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"alertId":       map[string]string{"type": "string"},
						"severity":      map[string]string{"type": "string"},
						"transactionId": map[string]string{"type": "string"},
						"riskScore":     map[string]string{"type": "number"},
						"indicators":    map[string]string{"type": "array"},
					},
				},
			}
			c.JSON(http.StatusOK, gin.H{"schemas": schemas})
		})
	}

	// Background consumer simulation
	go func() {
		for {
			time.Sleep(5 * time.Second)
			mu.Lock()
			stats.ConsumerLag = stats.TotalReceived - stats.TotalProcessed
			mu.Unlock()
		}
	}()

	log.Printf("[Kafka Processor] Starting on port %s, broker: %s", cfg.Port, cfg.BrokerURL)
	if err := router.Run(":" + cfg.Port); err != nil {
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

func init() {
	_ = context.Background() // Ensure context package is used
}
