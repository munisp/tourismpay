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
	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

const (
	// Dapr component names
	pubsubName   = "pubsub-kafka"
	stateStore   = "statestore-redis"
	secretStore  = "local-secret-store"
	// Topics
	topicNewMessage = "new-message"
	// Service to invoke
	targetAppID = "user-profile-service"
)

// Message is the structure for our Pub/Sub and State data
type Message struct {
	ID        string    `json:"id"`
	Sender    string    `json:"sender"`
	Recipient string    `json:"recipient"`
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
}

// Service is the main struct for our application logic
type Service struct {
	daprClient dapr.Client
}

func main() {
	// 1. Dapr client initialization
	client, err := dapr.NewClient()
	if err != nil {
		log.Fatalf("Failed to create Dapr client: %v", err)
	}
	defer client.Close()

	// Initialize the service struct
	svc := &Service{
		daprClient: client,
	}

	// 6. Observability integration (Distributed Tracing) is handled by Dapr sidecar
	// We just need to ensure the Dapr sidecar is configured to send traces (e.g., to Zipkin/Jaeger)
	// and the client/server calls will automatically include trace headers.

	// Create a Dapr service
	s := daprd.NewService(":6000") // Dapr service listens on port 6000 by default

	// 2. Pub/Sub integration - Subscribe to a topic
	if err := s.AddTopicSubscription(&common.Subscription{
		PubsubName: pubsubName,
		Topic:      topicNewMessage,
		Route:      "/messages/new",
	}, svc.handleNewMessage); err != nil {
		log.Fatalf("Failed to add topic subscription: %v", err)
	}

	// Add HTTP routes for external calls (Publish, Invoke, State, Secrets)
	router := mux.NewRouter()
	router.HandleFunc("/publish", svc.publishHandler).Methods("POST")
	router.HandleFunc("/invoke", svc.invokeHandler).Methods("POST")
	router.HandleFunc("/state/{key}", svc.stateHandler).Methods("POST", "GET")
	router.HandleFunc("/secret/{key}", svc.secretHandler).Methods("GET")

	// Start the Dapr service with the custom router
	if err := s.StartWithMux(router); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Dapr service failed to start: %v", err)
	}
}

// handleNewMessage is the handler for the subscribed topic
func (s *Service) handleNewMessage(ctx context.Context, e *common.TopicEvent) (retry bool, err error) {
	log.Printf("Received message from PubSub: %s, Topic: %s, ID: %s", e.PubsubName, e.Topic, e.ID)

	var msg Message
	if err := json.Unmarshal(e.Data, &msg); err != nil {
		log.Printf("Error unmarshalling message: %v", err)
		return false, nil // Do not retry on unmarshalling error
	}

	log.Printf("Processing message: ID=%s, Sender=%s, Content=%s", msg.ID, msg.Sender, msg.Content)

	// 7. Proper error handling and retry logic for a critical operation
	// For this example, we'll simulate a critical operation (State Save) with a retry.
	// Dapr's Pub/Sub automatically handles retries based on the return value.
	// Returning 'true' for retry will tell Dapr to retry the message.

	// 4. State management - Save the message to state store
	key := fmt.Sprintf("message-%s", msg.ID)
	data, _ := json.Marshal(msg)
	
	// Example of retry logic for state save (though Dapr client has internal retries)
	maxRetries := 3
	for i := 0; i < maxRetries; i++ {
		err = s.daprClient.SaveState(ctx, stateStore, key, data, nil)
		if err == nil {
			log.Printf("Successfully saved state for key: %s", key)
			break
		}
		log.Printf("Attempt %d/%d: Failed to save state: %v. Retrying in 1s...", i+1, maxRetries, err)
		time.Sleep(1 * time.Second)
	}

	if err != nil {
		log.Printf("CRITICAL: Failed to save state after %d attempts. Returning retry=true to Dapr.", maxRetries)
		return true, fmt.Errorf("failed to save state: %w", err) // Return true to signal Dapr to retry
	}

	return false, nil // Success, no retry needed
}

// publishHandler handles an incoming HTTP request to publish a message
func (s *Service) publishHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var msg Message
	if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	msg.ID = uuid.New().String()
	msg.Timestamp = time.Now()
	data, _ := json.Marshal(msg)

	// 2. Pub/Sub integration - Publish a message
	// 7. Proper error handling and retry logic
	err := s.daprClient.PublishEvent(ctx, pubsubName, topicNewMessage, data)
	if err != nil {
		log.Printf("Error publishing event: %v", err)
		http.Error(w, fmt.Sprintf("Failed to publish event: %v", err), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "Message published successfully with ID: %s", msg.ID)
}

// invokeHandler handles an incoming HTTP request to invoke another service
func (s *Service) invokeHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	
	// 3. Service-to-service invocation
	// Example: Invoke a method "get-user-status" on the "user-profile-service" app
	method := "get-user-status"
	content := &dapr.DataContent{
		ContentType: "application/json",
		Data:        []byte(`{"user_id": "user123"}`),
	}

	// 7. Proper error handling and retry logic
	// Dapr client has internal retry mechanisms, but we can add external logic if needed.
	resp, err := s.daprClient.InvokeMethodWithContent(ctx, targetAppID, method, http.MethodPost, content)
	if err != nil {
		log.Printf("Error invoking service %s/%s: %v", targetAppID, method, err)
		http.Error(w, fmt.Sprintf("Failed to invoke service: %v", err), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "Service invocation successful. Response from %s/%s: %s", targetAppID, method, string(resp))
}

// stateHandler handles an incoming HTTP request to save or get state
func (s *Service) stateHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	key := vars["key"]

	switch r.Method {
	case http.MethodPost:
		var data map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		
		// 4. State management - Save state
		dataBytes, _ := json.Marshal(data)
		err := s.daprClient.SaveState(ctx, stateStore, key, dataBytes, nil)
		if err != nil {
			log.Printf("Error saving state: %v", err)
			http.Error(w, fmt.Sprintf("Failed to save state: %v", err), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, "State saved successfully for key: %s", key)

	case http.MethodGet:
		// 4. State management - Get state
		item, err := s.daprClient.GetState(ctx, stateStore, key, nil)
		if err != nil {
			log.Printf("Error getting state: %v", err)
			http.Error(w, fmt.Sprintf("Failed to get state: %v", err), http.StatusInternalServerError)
			return
		}
		if item.Value == nil {
			w.WriteHeader(http.StatusNotFound)
			fmt.Fprintf(w, "State not found for key: %s", key)
			return
		}
		
		w.WriteHeader(http.StatusOK)
		w.Header().Set("Content-Type", "application/json")
		w.Write(item.Value)
	}
}

// secretHandler handles an incoming HTTP request to retrieve a secret
func (s *Service) secretHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	vars := mux.Vars(r)
	key := vars["key"]

	// 5. Secrets management
	// The secret store component is configured to use the local-secret-store
	// The secret key is the key within the secrets.json file.
	secret, err := s.daprClient.GetSecret(ctx, secretStore, key, nil)
	if err != nil {
		log.Printf("Error getting secret: %v", err)
		http.Error(w, fmt.Sprintf("Failed to get secret: %v", err), http.StatusInternalServerError)
		return
	}

	// Secrets are returned as a map[string]string, where the key is the secret name
	// and the value is the secret value.
	if len(secret) == 0 {
		w.WriteHeader(http.StatusNotFound)
		fmt.Fprintf(w, "Secret not found for key: %s", key)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(secret)
}
