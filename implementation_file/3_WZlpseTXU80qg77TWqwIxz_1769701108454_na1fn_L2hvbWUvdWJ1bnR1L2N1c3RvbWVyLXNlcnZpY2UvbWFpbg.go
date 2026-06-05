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
	pubsubName  = "pubsub"
	stateStore  = "statestore"
	secretStore = "secretstore"

	// Topics and service names
	topicName = "new-customer"
	targetApp = "order-service" // Target for service invocation
	port      = ":50001"
)

// Customer represents the data structure for a customer
type Customer struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

// Global Dapr client
var client dapr.Client

func main() {
	// 1. Dapr client initialization
	var err error
	client, err = dapr.NewClient()
	if err != nil {
		log.Fatalf("Error creating Dapr client: %v", err)
	}
	defer client.Close()

	// 2. Setup Dapr service
	s := daprd.NewService(port)

	// 3. Register Pub/Sub handler
	if err := s.AddTopicEventHandler(&common.Subscription{
		PubsubName: pubsubName,
		Topic:      topicName,
		Route:      "/new-customer-handler",
	}, newCustomerHandler); err != nil {
		log.Fatalf("Error adding topic handler: %v", err)
	}

	// 4. Register HTTP endpoints for demonstration
	if err := s.AddServiceInvocationHandler("/register-customer", registerCustomerHandler); err != nil {
		log.Fatalf("Error adding invocation handler: %v", err)
	}
	if err := s.AddServiceInvocationHandler("/get-customer", getCustomerHandler); err != nil {
		log.Fatalf("Error adding invocation handler: %v", err)
	}
	if err := s.AddServiceInvocationHandler("/invoke-order-service", invokeOrderServiceHandler); err != nil {
		log.Fatalf("Error adding invocation handler: %v", err)
	}
	if err := s.AddServiceInvocationHandler("/get-secret", getSecretHandler); err != nil {
		log.Fatalf("Error adding invocation handler: %v", err)
	}

	// 5. Start the service
	log.Printf("Customer Service listening on %s", port)
	if err := s.Start(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Error starting server: %v", err)
	}
}

// newCustomerHandler handles incoming 'new-customer' events from Dapr Pub/Sub
func newCustomerHandler(ctx context.Context, e *common.TopicEvent) (retry bool, err error) {
	log.Printf("Event received: PubsubName: %s, Topic: %s, ID: %s, Data: %s", e.PubsubName, e.Topic, e.ID, string(e.Data))

	var customer Customer
	if err := json.Unmarshal(e.Data, &customer); err != nil {
		log.Printf("Error unmarshalling event data: %v", err)
		return false, nil // Don't retry on bad data
	}

	// 4. State management: Save the new customer to the state store
	item := &dapr.SetStateItem{
		Key:   customer.ID,
		Value: e.Data,
		Options: &dapr.StateOptions{
			Concurrency: dapr.StateConcurrencyFirstWrite,
			Consistency: dapr.StateConsistencyStrong,
		},
	}

	// 7. Proper error handling and retry logic for state save
	for i := 0; i < 3; i++ {
		if err := client.SaveState(ctx, stateStore, item); err != nil {
			log.Printf("Attempt %d: Error saving state: %v", i+1, err)
			time.Sleep(time.Second * time.Duration(i+1))
			continue
		}
		log.Printf("Successfully saved customer %s to state store.", customer.ID)
		return false, nil // Success, no retry
	}

	log.Printf("Failed to save customer %s after multiple retries.", customer.ID)
	return true, fmt.Errorf("failed to save state for customer %s", customer.ID) // Retry the event
}

// registerCustomerHandler is a service invocation handler to register a new customer and publish an event
func registerCustomerHandler(ctx context.Context, in *common.InvocationEvent) (out *common.Content, err error) {
	log.Printf("Invocation received: Method: %s, Data: %s", in.Method, string(in.Data))

	var customer Customer
	if err := json.Unmarshal(in.Data, &customer); err != nil {
		return &common.Content{
			ContentType: "application/json",
			Data:        []byte(fmt.Sprintf(`{"error": "Invalid request body: %v"}`, err)),
		}, nil
	}

	// 3. Pub/Sub integration: Publish the new customer event
	data, _ := json.Marshal(customer)
	
	// 7. Proper error handling and retry logic for pub/sub publish
	for i := 0; i < 3; i++ {
		if err := client.PublishEvent(ctx, pubsubName, topicName, data); err != nil {
			log.Printf("Attempt %d: Error publishing event: %v", i+1, err)
			time.Sleep(time.Second * time.Duration(i+1))
			continue
		}
		log.Printf("Successfully published new customer event for %s", customer.ID)
		return &common.Content{
			ContentType: "application/json",
			Data:        []byte(fmt.Sprintf(`{"status": "Customer %s registered and event published"}`, customer.ID)),
		}, nil
	}

	return nil, fmt.Errorf("failed to publish event for customer %s after multiple retries", customer.ID)
}

// getCustomerHandler retrieves a customer from the state store
func getCustomerHandler(ctx context.Context, in *common.InvocationEvent) (out *common.Content, err error) {
	log.Printf("Invocation received: Method: %s, Data: %s", in.Method, string(in.Data))

	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(in.Data, &req); err != nil {
		return &common.Content{
			ContentType: "application/json",
			Data:        []byte(fmt.Sprintf(`{"error": "Invalid request body: %v"}`, err)),
		}, nil
	}

	// 4. State management: Get the customer from the state store
	item, err := client.GetState(ctx, stateStore, req.ID, nil)
	if err != nil {
		return nil, fmt.Errorf("error getting state: %w", err)
	}

	if item.Value == nil {
		return &common.Content{
			ContentType: "application/json",
			Data:        []byte(fmt.Sprintf(`{"error": "Customer %s not found"}`, req.ID)),
		}, nil
	}

	return &common.Content{
		ContentType: "application/json",
		Data:        item.Value,
	}, nil
}

// invokeOrderServiceHandler demonstrates service-to-service invocation
func invokeOrderServiceHandler(ctx context.Context, in *common.InvocationEvent) (out *common.Content, err error) {
	log.Printf("Invocation received: Method: %s, Data: %s", in.Method, string(in.Data))

	// 3. Service-to-service invocation: Invoke a method on the targetApp (order-service)
	// We'll simulate creating an order for a customer
	method := "create-order"
	content := &dapr.DataContent{
		ContentType: "application/json",
		Data:        in.Data, // Pass the customer data as the order payload
	}

	// 7. Proper error handling and retry logic for service invocation
	for i := 0; i < 3; i++ {
		resp, err := client.InvokeMethodWithContent(ctx, targetApp, method, "post", content)
		if err != nil {
			log.Printf("Attempt %d: Error invoking %s/%s: %v", i+1, targetApp, method, err)
			time.Sleep(time.Second * time.Duration(i+1))
			continue
		}

		log.Printf("Successfully invoked %s/%s. Response: %s", targetApp, method, string(resp))
		return &common.Content{
			ContentType: "application/json",
			Data:        []byte(fmt.Sprintf(`{"status": "Order service invoked successfully", "response": %s}`, string(resp))),
		}, nil
	}

	return nil, fmt.Errorf("failed to invoke order service after multiple retries")
}

// getSecretHandler demonstrates secrets management
func getSecretHandler(ctx context.Context, in *common.InvocationEvent) (out *common.Content, err error) {
	log.Printf("Invocation received: Method: %s", in.Method)

	// 5. Secrets management: Retrieve a secret from the secret store
	secret, err := client.GetSecret(ctx, secretStore, "db-connection-string", nil)
	if err != nil {
		return nil, fmt.Errorf("error getting secret: %w", err)
	}

	// 7. Proper error handling: Check if the secret was found
	connStr, ok := secret["db-connection-string"]
	if !ok {
		return nil, fmt.Errorf("secret 'db-connection-string' not found")
	}

	// NOTE: In a real application, you would use the secret, not return it.
	// We return it here for demonstration purposes.
	response := fmt.Sprintf(`{"db_connection_string": "%s", "message": "Secret retrieved successfully (DO NOT expose in production!)"}`, connStr)

	return &common.Content{
		ContentType: "application/json",
		Data:        []byte(response),
	}, nil
}

// 6. Observability integration (distributed tracing) is handled by the Dapr sidecar
// The Dapr Go SDK automatically propagates the trace context (e.g., via the context.Context)
// when making Dapr API calls (e.g., client.PublishEvent, client.SaveState, client.InvokeMethodWithContent).
// No explicit code is needed in the application logic for basic tracing.
// The Dapr sidecar automatically injects tracing headers into HTTP requests and sends spans to a configured tracing backend.
// The Dapr service runtime (daprd) also automatically handles incoming trace headers for service invocation and pub/sub.
// The Go SDK's client and service methods are designed to work with Go's context.Context, which is where tracing spans are stored.
// For example, the `ctx` passed to `newCustomerHandler` and other handlers will contain the trace context.
// The `client` calls (e.g., `client.SaveState(ctx, ...)`) will use this context.
