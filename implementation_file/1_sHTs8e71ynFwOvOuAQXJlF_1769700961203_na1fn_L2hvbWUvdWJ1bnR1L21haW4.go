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
	daprg "github.com/dapr/go-sdk/service/grpc"
)

const (
	// Dapr Component Names
	PubSubName     = "kafka-pubsub"
	StateStoreName = "redis-state"
	SecretStoreName = "local-secret-store"

	// Application Specific
	TopicName       = "policy-updates"
	TargetServiceID = "risk-service" // Service to invoke
	ServicePort     = "50051"        // Dapr gRPC service port
)

// PolicyEvent represents the structure of a message from the Kafka topic
type PolicyEvent struct {
	PolicyID string `json:"policyId"`
	Status   string `json:"status"`
	UserID   string `json:"userId"`
}

// PolicyService encapsulates the Dapr client and business logic
type PolicyService struct {
	daprClient dapr.Client
}

func main() {
	// 1. Dapr client initialization
	client, err := dapr.NewClient()
	if err != nil {
		log.Fatalf("Error creating Dapr client: %v", err)
	}
	defer client.Close()

	ps := &PolicyService{daprClient: client}

	// Create a Dapr service
	s, err := daprg.NewService(":" + ServicePort)
	if err != nil {
		log.Fatalf("failed to start Dapr service: %v", err)
	}

	// 2. Pub/Sub integration - Subscribe to a topic
	log.Printf("Subscribing to topic %s on pubsub %s", TopicName, PubSubName)
	sub := &common.Subscription{
		PubsubName: PubSubName,
		Topic:      TopicName,
		Route:      "/policy-events",
	}
	if err := s.AddTopicEventHandler(sub, ps.policyEventHandler); err != nil {
		log.Fatalf("error adding topic event handler: %v", err)
	}

	// 3. Service-to-service invocation - Define a handler to trigger an invocation
	// This is a simple example of an internal endpoint that can be invoked by Dapr
	if err := s.AddServiceInvocationHandler("/process-policy", ps.processPolicyHandler); err != nil {
		log.Fatalf("error adding service invocation handler: %v", err)
	}

	// Start the Dapr service
	log.Printf("Policy Service listening on :%s", ServicePort)
	if err := s.Start(); err != nil {
		log.Fatalf("error starting Dapr service: %v", err)
	}
}

// policyEventHandler handles incoming messages from the "policy-updates" topic.
func (ps *PolicyService) policyEventHandler(ctx context.Context, e *common.TopicEvent) (retry bool, err error) {
	log.Printf("Received event from PubSub: %s, Topic: %s, ID: %s", e.PubsubName, e.Topic, e.ID)

	var event PolicyEvent
	if err := json.Unmarshal(e.Data, &event); err != nil {
		log.Printf("Error unmarshaling event data: %v. Data: %s", err, string(e.Data))
		// Do not retry on unmarshal error, as it's likely a permanent data format issue
		return false, nil
	}

	log.Printf("Processing Policy ID: %s, Status: %s, User ID: %s", event.PolicyID, event.Status, event.UserID)

	// 7. Proper error handling and retry logic
	// The Dapr sidecar handles retries for the subscription itself.
	// We return 'true' to signal a transient error and request a retry.
	if event.PolicyID == "FAIL_ME" {
		log.Println("Simulating transient error for Policy ID: FAIL_ME")
		return true, fmt.Errorf("simulated transient error for policy %s", event.PolicyID)
	}

	// Execute the core business logic
	if err := ps.executePolicyWorkflow(ctx, event); err != nil {
		log.Printf("Error executing policy workflow for %s: %v", event.PolicyID, err)
		// Decide if the error is transient (retry) or permanent (don't retry)
		// For simplicity, we'll treat all workflow errors as transient for now.
		return true, err
	}

	log.Printf("Successfully processed and updated policy %s", event.PolicyID)
	return false, nil // Success, do not retry
}

// processPolicyHandler is a service invocation handler that triggers the policy workflow.
func (ps *PolicyService) processPolicyHandler(ctx context.Context, in *common.InvocationEvent) (*common.Content, error) {
	log.Printf("Received service invocation: %s", in.Verb)

	// Example: A simple invocation to trigger the workflow
	event := PolicyEvent{
		PolicyID: fmt.Sprintf("INVOKE-%d", time.Now().Unix()),
		Status:   "INVOKED",
		UserID:   "system-user",
	}

	if err := ps.executePolicyWorkflow(ctx, event); err != nil {
		return &common.Content{
			Data:        []byte(fmt.Sprintf("Error: %v", err)),
			ContentType: "text/plain",
			// Return a non-200 status code to signal an error to the invoker
			// Dapr sidecar will handle the actual HTTP status mapping
		}, err
	}

	return &common.Content{
		Data:        []byte(fmt.Sprintf("Policy %s processed successfully via invocation.", event.PolicyID)),
		ContentType: "text/plain",
	}, nil
}

// executePolicyWorkflow demonstrates state management, secrets management, and service invocation.
func (ps *PolicyService) executePolicyWorkflow(ctx context.Context, event PolicyEvent) error {
	// 5. Secrets management
	secretKey := "redis-password"
	secret, err := ps.daprClient.GetSecret(ctx, SecretStoreName, secretKey, nil)
	if err != nil {
		return fmt.Errorf("failed to get secret %s: %w", secretKey, err)
	}
	log.Printf("Successfully retrieved secret '%s' from store '%s'. Value length: %d", secretKey, SecretStoreName, len(secret[secretKey]))

	// 4. State management - Save the policy status
	stateKey := fmt.Sprintf("policy-%s", event.PolicyID)
	stateValue := []byte(event.Status)
	log.Printf("Saving state key: %s, value: %s to store: %s", stateKey, stateValue, StateStoreName)
	if err := ps.daprClient.SaveState(ctx, StateStoreName, stateKey, stateValue, nil); err != nil {
		return fmt.Errorf("failed to save state: %w", err)
	}

	// 4. State management - Get the state back (for verification)
	item, err := ps.daprClient.GetState(ctx, StateStoreName, stateKey, nil)
	if err != nil {
		return fmt.Errorf("failed to get state: %w", err)
	}
	if item.Value == nil {
		return fmt.Errorf("state item not found for key: %s", stateKey)
	}
	log.Printf("Retrieved state key: %s, value: %s", stateKey, string(item.Value))

	// 3. Service-to-service invocation
	// Call the "risk-service" to perform a risk assessment
	riskRequest := map[string]string{"policyId": event.PolicyID, "status": event.Status}
	riskRequestData, _ := json.Marshal(riskRequest)

	log.Printf("Invoking service %s method v1/assess-risk", TargetServiceID)
	// The Dapr client automatically handles the HTTP POST request to the sidecar,
	// which then handles the service discovery and invocation.
	// 6. Observability integration (distributed tracing) is automatically handled by the Dapr client
	// by propagating the context (ctx) and the sidecar.
	resp, err := ps.daprClient.InvokeMethodWithContent(ctx, TargetServiceID, "v1/assess-risk", http.MethodPost, &dapr.DataContent{
		ContentType: "application/json",
		Data:        riskRequestData,
	})
	if err != nil {
		return fmt.Errorf("failed to invoke %s: %w", TargetServiceID, err)
	}

	log.Printf("Service invocation to %s successful. Response: %s", TargetServiceID, string(resp))

	// 2. Pub/Sub integration - Publish a follow-up event
	followUpEvent := map[string]string{
		"policyId": event.PolicyID,
		"result":   "RISK_ASSESSED",
	}
	followUpData, _ := json.Marshal(followUpEvent)

	log.Printf("Publishing follow-up event for policy %s to topic 'policy-assessed'", event.PolicyID)
	if err := ps.daprClient.PublishEvent(ctx, PubSubName, "policy-assessed", followUpData); err != nil {
		return fmt.Errorf("failed to publish event: %w", err)
	}

	return nil
}

// Helper function to count lines of code
func countLines(path string) (int, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, err
	}
	lines := 0
	for _, b := range data {
		if b == '\n' {
			lines++
		}
	}
	// Add 1 for the last line if the file is not empty and doesn't end with a newline
	if len(data) > 0 && data[len(data)-1] != '\n' {
		lines++
	}
	return lines, nil
}
