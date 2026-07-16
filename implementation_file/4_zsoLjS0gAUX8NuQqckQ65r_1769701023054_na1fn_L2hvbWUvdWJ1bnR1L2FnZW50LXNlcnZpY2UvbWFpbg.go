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

var (
	// Dapr components names
	pubsubName  = "kafka-pubsub"
	topicName   = "orders"
	stateStore  = "statestore"
	secretStore = "local-secrets"
	// Service invocation target
	targetAppID = "other-service"
)

// Order represents a simple data structure for Pub/Sub and State management
type Order struct {
	OrderID string `json:"orderId"`
	Item    string `json:"item"`
	Amount  int    `json:"amount"`
}

func main() {
	// 1. Dapr client initialization
	client, err := dapr.NewClient()
	if err != nil {
		log.Fatalf("Failed to create Dapr client: %v", err)
	}
	defer client.Close()

	// 2. Pub/Sub integration
	s := daprd.NewService(":8080")
	if err := s.AddTopic(
		&common.Subscription{
			PubsubName: pubsubName,
			Topic:      topicName,
			Route:      fmt.Sprintf("/%s-handler", topicName),
		},
		eventHandler,
	); err != nil {
		log.Fatalf("Failed to add topic subscription: %v", err)
	}

	// Add HTTP endpoints for demonstration
	if err := s.AddServiceInvocationHandler("/invoke-other-service", invokeHandler(client)); err != nil {
		log.Fatalf("Failed to add service invocation handler: %v", err)
	}
	if err := s.AddServiceInvocationHandler("/state", stateHandler(client)); err != nil {
		log.Fatalf("Failed to add state handler: %v", err)
	}
	if err := s.AddServiceInvocationHandler("/secret", secretHandler(client)); err != nil {
		log.Fatalf("Failed to add secret handler: %v", err)
	}
	if err := s.AddServiceInvocationHandler("/publish", publishHandler(client)); err != nil {
		log.Fatalf("Failed to add publish handler: %v", err)
	}

	// Start the Dapr service
	log.Printf("Agent Service listening on :8080")
	if err := s.Start(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Error starting Dapr service: %v", err)
	}
}

// 2. Pub/Sub event handler
func eventHandler(ctx context.Context, e *common.TopicEvent) (retry bool, err error) {
	log.Printf("Event received from PubSub: %s, Topic: %s, ID: %s", e.PubsubName, e.Topic, e.ID)

	var order Order
	if err := json.Unmarshal(e.Data, &order); err != nil {
		log.Printf("Error unmarshalling event data: %v. Data: %s", err, string(e.Data))
		// Do not retry on unmarshalling error, as it's likely a permanent data format issue
		return false, nil
	}

	log.Printf("Processing Order ID: %s, Item: %s, Amount: %d", order.OrderID, order.Item, order.Amount)

	// Simulate processing and potential transient error for retry logic
	if order.OrderID == "FAIL-TRANSIENT" {
		log.Println("Simulating transient error for retry")
		return true, fmt.Errorf("transient error, please retry")
	}

	// Simulate successful processing
	log.Println("Order processed successfully.")
	return false, nil
}

// 3. Service-to-service invocation handler
func invokeHandler(client dapr.Client) common.ServiceInvocationHandler {
	return func(ctx context.Context, in *common.InvocationEvent) (out *common.Content, err error) {
		log.Printf("Service invocation received: %s", in.Verb)

		// Example: Invoke a method on another service
		methodName := "process-request"
		data := []byte(`{"message": "Hello from agent-service"}`)

		// Implement retry logic for service invocation
		const maxRetries = 3
		for i := 0; i < maxRetries; i++ {
			log.Printf("Attempt %d: Invoking %s on %s", i+1, methodName, targetAppID)
			resp, invokeErr := client.InvokeMethodWithContent(ctx, targetAppID, methodName, in.Verb, &dapr.Content{
				ContentType: "application/json",
				Data:        data,
			})

			if invokeErr == nil {
				log.Printf("Invocation successful. Status: %s", resp.ContentType)
				return &common.Content{
					ContentType: "application/json",
					Data:        []byte(fmt.Sprintf(`{"status": "success", "response": "%s"}`, string(resp.Data))),
				}, nil
			}

			log.Printf("Invocation failed (attempt %d): %v. Retrying in 1 second...", i+1, invokeErr)
			time.Sleep(1 * time.Second)
		}

		// If all retries fail
		return nil, fmt.Errorf("failed to invoke service %s after %d retries: %w", targetAppID, maxRetries, err)
	}
}

// 4. State management handler
func stateHandler(client dapr.Client) common.ServiceInvocationHandler {
	return func(ctx context.Context, in *common.InvocationEvent) (out *common.Content, err error) {
		log.Printf("State management invocation received: %s", in.Verb)

		// Save state
		key := "last-order"
		order := Order{OrderID: "12345", Item: "Widget", Amount: 99}
		data, _ := json.Marshal(order)

		if err := client.SaveState(ctx, stateStore, key, data, nil); err != nil {
			return nil, fmt.Errorf("failed to save state: %w", err)
		}
		log.Printf("State saved: %s", key)

		// Get state
		item, err := client.GetState(ctx, stateStore, key, nil)
		if err != nil {
			return nil, fmt.Errorf("failed to get state: %w", err)
		}
		if item.Value == nil {
			return nil, fmt.Errorf("state key %s not found", key)
		}

		var retrievedOrder Order
		if err := json.Unmarshal(item.Value, &retrievedOrder); err != nil {
			return nil, fmt.Errorf("failed to unmarshal state: %w", err)
		}

		log.Printf("State retrieved: %+v", retrievedOrder)

		return &common.Content{
			ContentType: "application/json",
			Data:        []byte(fmt.Sprintf(`{"status": "success", "saved_order": "%+v"}`, retrievedOrder)),
		}, nil
	}
}

// 5. Secrets management handler
func secretHandler(client dapr.Client) common.ServiceInvocationHandler {
	return func(ctx context.Context, in *common.InvocationEvent) (out *common.Content, err error) {
		log.Printf("Secrets management invocation received: %s", in.Verb)

		// Get a secret
		secret, err := client.GetSecret(ctx, secretStore, "api-key", nil)
		if err != nil {
			return nil, fmt.Errorf("failed to get secret: %w", err)
		}

		apiKey := secret["api-key"]
		log.Printf("Successfully retrieved secret 'api-key'. Length: %d", len(apiKey))

		// IMPORTANT: In a real application, DO NOT log the secret value.
		// We log the length here for demonstration purposes.

		return &common.Content{
			ContentType: "application/json",
			Data:        []byte(fmt.Sprintf(`{"status": "success", "secret_key_length": %d}`, len(apiKey))),
		}, nil
	}
}

// Helper handler to publish a message for testing
func publishHandler(client dapr.Client) common.ServiceInvocationHandler {
	return func(ctx context.Context, in *common.InvocationEvent) (out *common.Content, err error) {
		log.Printf("Publish invocation received: %s", in.Verb)

		order := Order{OrderID: fmt.Sprintf("ORD-%d", time.Now().Unix()), Item: "TestItem", Amount: 100}
		data, _ := json.Marshal(order)

		// Publish the event
		if err := client.PublishEvent(ctx, pubsubName, topicName, data); err != nil {
			return nil, fmt.Errorf("failed to publish event: %w", err)
		}

		log.Printf("Published event to %s/%s: %+v", pubsubName, topicName, order)

		return &common.Content{
			ContentType: "application/json",
			Data:        []byte(`{"status": "success", "message": "Event published"}`),
		}, nil
	}
}

// 6. Observability integration (distributed tracing)
// Dapr Go SDK automatically integrates with Dapr's sidecar for tracing.
// The client and service calls above will automatically be traced if the Dapr sidecar is configured for tracing.
// No explicit code is needed in the application for basic tracing.

// 7. Proper error handling and retry logic
// Error handling is implemented in each handler.
// Retry logic is explicitly implemented in invokeHandler and implicitly handled by Dapr for Pub/Sub (eventHandler return value).
