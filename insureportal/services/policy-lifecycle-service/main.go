package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

// Policy Lifecycle Service
// Manages the full insurance policy lifecycle: quote → bind → issue → endorse → renew → cancel → lapse
// Integrates with: Postgres, Kafka, TigerBeetle, Temporal
//
// State Machine: draft → quoted → bound → active → endorsed → renewed | cancelled | lapsed | expired

type PolicyState string
const (
	StateDraft     PolicyState = "draft"
	StateQuoted    PolicyState = "quoted"
	StateBound     PolicyState = "bound"
	StateActive    PolicyState = "active"
	StateEndorsed  PolicyState = "endorsed"
	StateRenewed   PolicyState = "renewed"
	StateCancelled PolicyState = "cancelled"
	StateLapsed    PolicyState = "lapsed"
	StateExpired   PolicyState = "expired"
)

var validTransitions = map[PolicyState][]PolicyState{
	StateDraft:     {StateQuoted},
	StateQuoted:    {StateBound, StateDraft},
	StateBound:     {StateActive},
	StateActive:    {StateEndorsed, StateRenewed, StateCancelled, StateLapsed, StateExpired},
	StateEndorsed:  {StateActive, StateCancelled},
}

func isValidTransition(from, to PolicyState) bool {
	allowed, ok := validTransitions[from]
	if !ok { return false }
	for _, s := range allowed {
		if s == to { return true }
	}
	return false
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "policy-lifecycle-service"})
}

func handleTransition(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		PolicyID string `json:"policy_id"`
		FromState string `json:"from_state"`
		ToState   string `json:"to_state"`
		Reason    string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if !isValidTransition(PolicyState(req.FromState), PolicyState(req.ToState)) {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Invalid state transition",
			"allowed": "See /api/v1/transitions for valid transitions",
		})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{
		"policy_id": req.PolicyID, "previous_state": req.FromState,
		"current_state": req.ToState, "transitioned_at": time.Now().Format(time.RFC3339),
	})
}

func handleTransitions(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(validTransitions)
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/api/v1/transition", handleTransition)
	mux.HandleFunc("/api/v1/transitions", handleTransitions)
	port := ":8097"
	log.Printf("Policy Lifecycle Service starting on %s", port)
	log.Fatal(http.ListenAndServe(port, mux))
}
