package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	dapr "github.com/dapr/go-sdk/client"
	"github.com/dapr/go-sdk/service/common"
	daprd "github.com/dapr/go-sdk/service/http"
)

const (
	// Dapr components
	stateStoreName  = "statestore"
	pubsubName      = "pubsub"
	secretStoreName = "secretstore"

	// Topics and services
	topicOrders        = "orders"
	topicPaymentEvents = "payment-events"
	targetService      = "order-service"

	// Service configuration
	servicePort = ":8080"
)

// Payment represents a payment transaction state.
type Payment struct {
	ID     string  `json:"id"`
	Amount float64 `json:"amount"`
	Status string  `json:"status"`
}

// SecretResponse represents the structure of a secret retrieved from Dapr.
type SecretResponse struct {
	APIKey string `json:"api-key"`
}

var sub = &common.Subscription{
	PubsubName: pubsubName,
	Topic:      topicOrders,
	Route:      "/orders/process",
}

func main() {
	// 1. Dapr client initialization
	client, err := dapr.NewClient()
	if err != nil {
		log.Fatalf("Failed to create Dapr client: %v", err)
	}
	defer client.Close()

	// Create a Dapr service
	s := daprd.NewService(servicePort)

	// Register the Pub/Sub handler
	if err := s.AddTopicEventHandler(sub, handleOrderEvent(client)); err != nil {
		log.Fatalf("error adding topic subscription: %v", err)
	}

	// Register the Service Invocation handler (e.g., for health check or direct invocation)
	if err := s.AddServiceInvocationHandler("/health", handleHealthCheck); err != nil {
		log.Fatalf("error adding invocation handler: %v", err)
	}

	// Example: Run a background task to demonstrate other Dapr features
	go func() {
		// Wait for the service to start
		time.Sleep(5 * time.Second)
		log.Println("Starting background Dapr feature demonstration...")

		// 3. State management demonstration
		paymentID := "txn-12345"
		if err := savePaymentState(client, paymentID, 100.50); err != nil {
			log.Printf("State management save failed: %v", err)
		}
		if err := getPaymentState(client, paymentID); err != nil {
			log.Printf("State management get failed: %v", err)
		}

		// 4. Secrets management demonstration
		if err := getAPISecret(client); err != nil {
			log.Printf("Secrets management failed: %v", err)
		}

		// 2. Service-to-service invocation demonstration
		if err := invokeOrderService(client); err != nil {
			log.Printf("Service invocation failed: %v", err)
		}

		// 2. Pub/Sub publish demonstration
		if err := publishPaymentProcessed(client, paymentID); err != nil {
			log.Printf("Pub/Sub publish failed: %v", err)
		}
	}()

	// Start the service
	log.Printf("Payment Service listening on %s", servicePort)
	if err := s.Start(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("error starting server: %v", err)
	}
}

// handleOrderEvent is the handler for the "orders" topic.
// 2. Pub/Sub integration using Dapr for Kafka events
func handleOrderEvent(client dapr.Client) common.TopicEventHandler {
	return func(ctx context.Context, e *common.TopicEvent) (retry bool, err error) {
		log.Printf("Received order event from topic %s: %s", e.Topic, string(e.Data))

		// Simulate processing the order and saving state
		var order map[string]interface{}
		if err := json.Unmarshal(e.Data, &order); err != nil {
			log.Printf("Error unmarshalling event data: %v", err)
			return false, err // Do not retry on bad data format
		}

		paymentID := fmt.Sprintf("txn-%v", order["orderId"])
		amount := order["amount"].(float64)

		if err := savePaymentState(client, paymentID, amount); err != nil {
			log.Printf("Error saving state for order %s: %v", paymentID, err)
			return true, nil // Retry on state save failure
		}

		// Simulate successful payment and publish event
		if err := publishPaymentProcessed(client, paymentID); err != nil {
			log.Printf("Error publishing payment processed event: %v", err)
			return true, nil // Retry on publish failure
		}

		log.Printf("Successfully processed order %s and published payment event.", paymentID)
		return false, nil
	}
}

// handleHealthCheck is a simple service invocation handler.
func handleHealthCheck(ctx context.Context, in *common.InvocationEvent) (*common.InvocationResponse, error) {
	log.Printf("Received invocation: %s", in.Verb)
	return &common.InvocationResponse{
		Data:        []byte(`{"status": "ok"}`),
		ContentType: "application/json",
		StatusCode:  http.StatusOK,
	}, nil
}

// 2. Service-to-service invocation using Dapr
func invokeOrderService(client dapr.Client) error {
	log.Println("Invoking order-service to update status...")
	ctx := context.Background()

	// The Dapr client automatically handles distributed tracing context propagation.

	content := &dapr.DataContent{
		ContentType: "application/json",
		Data:        []byte(`{"paymentId": "txn-12345", "status": "completed"}`),
	}

	// Dapr client invocation with a timeout for basic retry/error handling
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	resp, err := client.InvokeMethodWithContent(ctx, targetService, "update-payment-status", http.MethodPost, content)
	if err != nil {
		return fmt.Errorf("failed to invoke %s: %w", targetService, err)
	}

	log.Printf("Service invocation successful. Status update response: %s", string(resp))
	return nil
}

// 4. State management using Dapr state store (Redis) - Save
func savePaymentState(client dapr.Client, id string, amount float64) error {
	log.Printf("Saving state for payment ID: %s", id)
	ctx := context.Background()

	payment := Payment{
		ID:     id,
		Amount: amount,
		Status: "processing",
	}

	data, err := json.Marshal(payment)
	if err != nil {
		return fmt.Errorf("failed to marshal payment: %w", err)
	}

	item := &dapr.SetStateItem{
		Key:   id,
		Value: data,
		Options: &dapr.StateOptions{
			Concurrency: dapr.StateConcurrencyFirstWrite,
			Consistency: dapr.StateConsistencyStrong,
		},
	}

	// Dapr client state save with basic error handling
	if err := client.SaveState(ctx, stateStoreName, item); err != nil {
		return fmt.Errorf("failed to save state: %w", err)
	}

	log.Printf("State saved successfully for %s", id)
	return nil
}

// 4. State management using Dapr state store (Redis) - Get
func getPaymentState(client dapr.Client, id string) error {
	log.Printf("Retrieving state for payment ID: %s", id)
	ctx := context.Background()

	// Dapr client state get with basic error handling
	item, err := client.GetState(ctx, stateStoreName, id)
	if err != nil {
		return fmt.Errorf("failed to get state: %w", err)
	}
	if item.Value == nil {
		return fmt.Errorf("state not found for key: %s", id)
	}

	var payment Payment
	if err := json.Unmarshal(item.Value, &payment); err != nil {
		return fmt.Errorf("failed to unmarshal state: %w", err)
	}

	log.Printf("State retrieved: %+v", payment)
	return nil
}

// 5. Secrets management using Dapr secrets API
func getAPISecret(client dapr.Client) error {
	log.Println("Retrieving API secret from Dapr secret store...")
	ctx := context.Background()

	// Dapr client secret retrieval with basic error handling
	secret, err := client.GetSecret(ctx, secretStoreName, "api-key", nil)
	if err != nil {
		return fmt.Errorf("failed to get secret: %w", err)
	}

	// Assuming the secret is stored as a key-value pair where the key is "api-key"
	apiKey, ok := secret["api-key"]
	if !ok {
		return fmt.Errorf("secret 'api-key' not found in response")
	}

	// In a real application, you would use the secret, not log it.
	log.Printf("Successfully retrieved secret. API Key (first 5 chars): %s...", apiKey[:5])
	return nil
}

// 2. Pub/Sub publish demonstration
func publishPaymentProcessed(client dapr.Client, paymentID string) error {
	log.Printf("Publishing 'payment-processed' event for ID: %s", paymentID)
	ctx := context.Background()

	event := map[string]string{
		"paymentId": paymentID,
		"status":    "completed",
		"timestamp": time.Now().Format(time.RFC3339),
	}

	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	// Dapr client publish with basic error handling
	if err := client.PublishEvent(ctx, pubsubName, topicPaymentEvents, data); err != nil {
		return fmt.Errorf("failed to publish event: %w", err)
	}

	log.Printf("Event published to topic %s successfully.", topicPaymentEvents)
	return nil
}
