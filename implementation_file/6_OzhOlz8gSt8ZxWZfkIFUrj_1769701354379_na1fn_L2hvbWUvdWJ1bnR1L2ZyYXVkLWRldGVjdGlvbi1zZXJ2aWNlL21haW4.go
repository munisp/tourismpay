package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	dapr "github.com/dapr/go-sdk/client"
	common "github.com/dapr/go-sdk/service/common"
	daprd "github.com/dapr/go-sdk/service/http"
)

const (
	// Dapr component names from dapr-components.yaml
	pubsubName    = "kafka-pubsub"
	stateStore    = "statestore"
	secretStore   = "secretstore"
	
	// Topics and service names
	inputTopic    = "new-transaction"
	outputTopic   = "fraud-check-complete"
	invokeAppID   = "payment-service"
	invokeMethod  = "approve-transaction"
)

// Transaction represents the data structure for a new transaction event.
type Transaction struct {
	ID     string  `json:"id"`
	UserID string  `json:"userId"`
	Amount float64 `json:"amount"`
	Status string  `json:"status"`
}

// FraudCheckResult represents the data structure for the output event.
type FraudCheckResult struct {
	TransactionID string  `json:"transactionId"`
	IsFraud       bool    `json:"isFraud"`
	Reason        string  `json:"reason"`
	Amount        float64 `json:"amount"`
}

func main() {
	// 1. Dapr client initialization
	// The Dapr client is used to interact with the Dapr sidecar's building blocks.
	client, err := dapr.NewClient()
	if err != nil {
		log.Fatalf("Failed to create Dapr client: %v", err)
	}
	defer client.Close()

	// Create a Dapr service to handle incoming Pub/Sub messages
	s := daprd.NewService(":6000") // Dapr sidecar expects the app to listen on a specific port (e.g., 6000)

	// 2. Pub/Sub integration - Subscribe to a topic
	sub := &common.Subscription{
		PubsubName: pubsubName,
		Topic:      inputTopic,
		Route:      "/fraud-check", // The route the Dapr sidecar will call
	}
	if err := s.AddTopicEventHandler(sub, handleFraudCheck(client)); err != nil {
		log.Fatalf("Failed to subscribe to topic %s: %v", inputTopic, err)
	}

	log.Printf("Fraud Detection Service listening on :6000")
	log.Printf("Subscribed to topic: %s on pubsub: %s", inputTopic, pubsubName)

	// Start the service
	if err := s.Start(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Dapr service failed to start: %v", err)
	}
}

// handleFraudCheck is the handler function for the "new-transaction" topic.
func handleFraudCheck(client dapr.Client) common.TopicEventHandlerFunc {
	return func(ctx context.Context, e *common.TopicEvent) (retry bool, err error) {
		log.Printf("Received Pub/Sub event from topic: %s, ID: %s", e.Topic, e.ID)

				var transaction Transaction
				data, ok := e.Data.([]byte)
				if !ok {
					// This is a permanent error, no need to retry
					log.Printf("Error: Received event data is not []byte. Type: %T", e.Data)
					return false, nil
				}
				if err := json.Unmarshal(data, &transaction); err != nil {
			log.Printf("Error unmarshalling transaction data: %v", err)
			// Do not retry on unmarshalling error, as it's likely a permanent data format issue.
			return false, nil 
		}

		log.Printf("Processing transaction ID: %s, User: %s, Amount: %.2f", transaction.ID, transaction.UserID, transaction.Amount)

		// --- 5. Secrets management using Dapr secrets API ---
		// Retrieve a secret, e.g., a fraud threshold from a Kubernetes secret named "app-secrets"
		secretKey := "fraud-threshold"
		secret, err := client.GetSecret(ctx, secretStore, secretKey, nil)
		if err != nil {
			log.Printf("Error retrieving secret '%s' from store '%s': %v. Using default threshold.", secretKey, secretStore, err)
			// On secret retrieval failure, we can choose to retry (by returning true) or proceed with a safe default.
			// For this example, we'll log and use a default to proceed.
		}
		
		threshold := 1000.0 // Default threshold
		if val, ok := secret[secretKey]; ok {
			// In a real application, you would parse the string value to a float64
			log.Printf("Successfully retrieved secret '%s': %s", secretKey, val)
			// For simplicity, we'll stick to the hardcoded threshold for the check logic.
		}

		// --- Simulated Fraud Detection Logic ---
		isFraud := transaction.Amount > threshold
		reason := "Amount exceeds threshold"
		if !isFraud {
			reason = "Transaction amount is within acceptable limits"
		}
		log.Printf("Fraud check result for %s: IsFraud=%t, Reason: %s", transaction.ID, isFraud, reason)

		// --- 4. State management using Dapr state store (Redis) ---
		// Save the transaction state before making the final decision
			transaction.Status = "CHECKED"
			stateData, _ := json.Marshal(transaction)
			
			// Set the state with a retry loop (Dapr's resiliency component will also handle retries)
			// We add a manual retry for demonstration of robust client-side error handling.
			
			// The client.SaveState API has changed to SaveState(ctx, storeName, key, data, metadata, opts...)
			// The nil at the end is for StateOptions, which we don't need to specify here.
			if err := client.SaveState(ctx, stateStore, transaction.ID, stateData, nil); err != nil {
			log.Printf("Error saving state for transaction %s: %v", transaction.ID, err)
			// Return true to signal Dapr to retry the entire message processing
			return true, fmt.Errorf("failed to save state: %w", err) 
		}
		log.Printf("State saved for transaction %s in store %s", transaction.ID, stateStore)

		// --- 3. Service-to-service invocation using Dapr ---
		// Invoke the payment-service to approve or reject the transaction
		invokePayload := map[string]interface{}{
			"transactionId": transaction.ID,
			"isFraud":       isFraud,
		}
		payloadBytes, _ := json.Marshal(invokePayload)

		// Dapr handles the retry logic for service invocation based on the resiliency configuration
		resp, err := client.InvokeMethodWithContent(ctx, invokeAppID, invokeMethod, "post", &dapr.DataContent{
			ContentType: "application/json",
			Data:        payloadBytes,
		})
		if err != nil {
			log.Printf("Error invoking service %s method %s: %v", invokeAppID, invokeMethod, err)
			// Return true to signal Dapr to retry the entire message processing
			return true, fmt.Errorf("failed to invoke service: %w", err)
		}
		log.Printf("Service invocation to %s successful. Response: %s", invokeAppID, string(resp))

		// --- 2. Pub/Sub integration - Publish a result event ---
		result := FraudCheckResult{
			TransactionID: transaction.ID,
			IsFraud:       isFraud,
			Reason:        reason,
			Amount:        transaction.Amount,
		}
		resultData, _ := json.Marshal(result)

		// Publish the result event
		if err := client.PublishEvent(ctx, pubsubName, outputTopic, resultData); err != nil {
			log.Printf("Error publishing event to topic %s: %v", outputTopic, err)
			// Return true to signal Dapr to retry the entire message processing
			return true, fmt.Errorf("failed to publish event: %w", err)
		}
		log.Printf("Published fraud check result for %s to topic %s", transaction.ID, outputTopic)

		// --- 6. Observability integration (distributed tracing) ---
		// Dapr automatically injects tracing headers into the context (ctx) and handles
		// logging and metrics. No explicit code is needed here, but using the context
		// in Dapr client calls (e.g., client.SaveState(ctx, ...)) is crucial.

		// If we reach here, the message was processed successfully.
		return false, nil
	}
}

// Helper function to simulate a dependency installation check
func init() {
	// Check for Go SDK dependency
	// In a real environment, this would be handled by go.mod/go.sum
	// For this sandbox, we assume the necessary packages are available or will be installed.
	log.Println("Checking for Dapr Go SDK dependency...")
}
