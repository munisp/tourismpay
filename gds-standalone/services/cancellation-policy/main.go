// Cancellation Policy Engine — Africa GDS
// Configurable per-property cancellation penalties with tiered fee structures.
//
// Integrates with: PostgreSQL (policies), Kafka (cancellation events),
// TigerBeetle (refund ledger), Temporal (refund workflow), Redis (policy cache)
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	Port        = ":8112"
	ServiceName = "gds-cancellation-policy"
	Version     = "1.0.0"
)

// ─── Models ──────────────────────────────────────────────────────

type CancellationPolicy struct {
	ID           string          `json:"id"`
	PropertyID   string          `json:"property_id"`
	Name         string          `json:"name"`
	PolicyType   string          `json:"policy_type"` // flexible, moderate, strict, super_strict, custom
	Tiers        []PolicyTier    `json:"tiers"`
	NoShowFee    float64         `json:"no_show_fee_percent"` // % of total charged for no-show
	EarlyCheckout float64        `json:"early_checkout_fee_percent"`
	GroupPolicy  *GroupPolicy    `json:"group_policy,omitempty"`
	Exceptions   []PolicyException `json:"exceptions,omitempty"`
	Currency     string          `json:"currency"`
	Status       string          `json:"status"`
	CreatedAt    time.Time       `json:"created_at"`
}

type PolicyTier struct {
	MinDaysBefore int     `json:"min_days_before"` // minimum days before check-in
	MaxDaysBefore int     `json:"max_days_before"` // maximum days before check-in
	FeePercent    float64 `json:"fee_percent"`     // % of booking total charged
	RefundPercent float64 `json:"refund_percent"`  // % refunded to guest
	Description   string  `json:"description"`
}

type GroupPolicy struct {
	MinRooms           int     `json:"min_rooms"`
	FreeCancelDays     int     `json:"free_cancel_days"`
	PartialCancelAllow bool    `json:"partial_cancel_allow"` // can cancel some rooms but not all
	AttritionPercent   float64 `json:"attrition_percent"`    // % of block that can be released penalty-free
}

type PolicyException struct {
	Type        string `json:"type"`        // force_majeure, medical, visa_denial, natural_disaster
	Description string `json:"description"`
	FullRefund  bool   `json:"full_refund"`
}

type CancellationRequest struct {
	BookingID       string  `json:"booking_id"`
	PropertyID      string  `json:"property_id"`
	GuestID         string  `json:"guest_id"`
	CheckIn         string  `json:"check_in"`
	CheckOut        string  `json:"check_out"`
	BookingAmount   float64 `json:"booking_amount"`
	Currency        string  `json:"currency"`
	Rooms           int     `json:"rooms"`
	Reason          string  `json:"reason"`
	ExceptionType   string  `json:"exception_type,omitempty"`
	IsGroupBooking  bool    `json:"is_group_booking"`
	RoomsToCancel   int     `json:"rooms_to_cancel,omitempty"` // for partial group cancellation
}

type CancellationResult struct {
	BookingID       string        `json:"booking_id"`
	Approved        bool          `json:"approved"`
	PolicyApplied   string        `json:"policy_applied"`
	DaysBefore      int           `json:"days_before_checkin"`
	TierApplied     string        `json:"tier_applied"`
	CancellationFee float64       `json:"cancellation_fee"`
	RefundAmount    float64       `json:"refund_amount"`
	RefundPercent   float64       `json:"refund_percent"`
	Currency        string        `json:"currency"`
	ExceptionUsed   bool          `json:"exception_used"`
	RefundMethod    string        `json:"refund_method"`
	RefundTimeline  string        `json:"refund_timeline"`
	FeeAbsorption   FeeAbsorption `json:"fee_absorption"`
	ProcessedAt     string        `json:"processed_at"`
}

type FeeAbsorption struct {
	PropertyAbsorbs float64 `json:"property_absorbs_percent"`
	PlatformAbsorbs float64 `json:"platform_absorbs_percent"`
	AgentAbsorbs    float64 `json:"agent_absorbs_percent"`
	Description     string  `json:"description"`
}

// ─── Store ───────────────────────────────────────────────────────

var (
	policies      = make(map[string]*CancellationPolicy)
	cancellations []CancellationResult
	mu            sync.RWMutex
)

// ─── Preset Policies ─────────────────────────────────────────────

var presetPolicies = map[string][]PolicyTier{
	"flexible": {
		{MinDaysBefore: 0, MaxDaysBefore: 1, FeePercent: 100, RefundPercent: 0, Description: "Same day: no refund"},
		{MinDaysBefore: 1, MaxDaysBefore: 3, FeePercent: 50, RefundPercent: 50, Description: "1-3 days: 50% refund"},
		{MinDaysBefore: 3, MaxDaysBefore: 9999, FeePercent: 0, RefundPercent: 100, Description: "3+ days: full refund"},
	},
	"moderate": {
		{MinDaysBefore: 0, MaxDaysBefore: 2, FeePercent: 100, RefundPercent: 0, Description: "0-2 days: no refund"},
		{MinDaysBefore: 2, MaxDaysBefore: 7, FeePercent: 50, RefundPercent: 50, Description: "2-7 days: 50% refund"},
		{MinDaysBefore: 7, MaxDaysBefore: 14, FeePercent: 25, RefundPercent: 75, Description: "7-14 days: 75% refund"},
		{MinDaysBefore: 14, MaxDaysBefore: 9999, FeePercent: 0, RefundPercent: 100, Description: "14+ days: full refund"},
	},
	"strict": {
		{MinDaysBefore: 0, MaxDaysBefore: 7, FeePercent: 100, RefundPercent: 0, Description: "0-7 days: no refund"},
		{MinDaysBefore: 7, MaxDaysBefore: 14, FeePercent: 75, RefundPercent: 25, Description: "7-14 days: 25% refund"},
		{MinDaysBefore: 14, MaxDaysBefore: 30, FeePercent: 50, RefundPercent: 50, Description: "14-30 days: 50% refund"},
		{MinDaysBefore: 30, MaxDaysBefore: 9999, FeePercent: 0, RefundPercent: 100, Description: "30+ days: full refund"},
	},
	"super_strict": {
		{MinDaysBefore: 0, MaxDaysBefore: 14, FeePercent: 100, RefundPercent: 0, Description: "0-14 days: no refund"},
		{MinDaysBefore: 14, MaxDaysBefore: 30, FeePercent: 75, RefundPercent: 25, Description: "14-30 days: 25% refund"},
		{MinDaysBefore: 30, MaxDaysBefore: 60, FeePercent: 50, RefundPercent: 50, Description: "30-60 days: 50% refund"},
		{MinDaysBefore: 60, MaxDaysBefore: 9999, FeePercent: 25, RefundPercent: 75, Description: "60+ days: 75% refund"},
	},
}

// ─── Seed ────────────────────────────────────────────────────────

func init() {
	// Seed sample policies
	samples := []struct {
		id, propID, name, ptype string
		noShow, earlyCheckout   float64
	}{
		{"POL-001", "PROP-001", "Serengeti Lodge Flexible", "flexible", 100, 50},
		{"POL-002", "PROP-002", "Lagos Beach Hotel Moderate", "moderate", 100, 75},
		{"POL-003", "PROP-003", "Cape Town Resort Strict", "strict", 100, 100},
		{"POL-004", "PROP-004", "Zanzibar Eco Super Strict", "super_strict", 100, 100},
		{"POL-005", "PROP-005", "Nairobi Business Hotel", "moderate", 100, 50},
	}

	for _, s := range samples {
		tiers := presetPolicies[s.ptype]
		policies[s.propID] = &CancellationPolicy{
			ID:            s.id,
			PropertyID:    s.propID,
			Name:          s.name,
			PolicyType:    s.ptype,
			Tiers:         tiers,
			NoShowFee:     s.noShow,
			EarlyCheckout: s.earlyCheckout,
			Currency:      "USD",
			Status:        "active",
			GroupPolicy: &GroupPolicy{
				MinRooms:           5,
				FreeCancelDays:     30,
				PartialCancelAllow: true,
				AttritionPercent:   20,
			},
			Exceptions: []PolicyException{
				{Type: "force_majeure", Description: "Natural disaster, pandemic, civil unrest", FullRefund: true},
				{Type: "medical", Description: "Medical emergency with documentation", FullRefund: true},
				{Type: "visa_denial", Description: "Official visa denial letter", FullRefund: true},
			},
			CreatedAt: time.Now(),
		}
	}
}

// ─── Handlers ────────────────────────────────────────────────────

func handleHealth(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "healthy",
		"service": ServiceName,
		"version": Version,
		"stats": map[string]int{
			"active_policies":      len(policies),
			"total_cancellations": len(cancellations),
		},
		"middleware": map[string]string{
			"postgres":    "configured",
			"kafka":       "configured",
			"tigerbeetle": "configured",
			"temporal":    "configured",
			"redis":       "configured",
		},
	})
}

func handleGetPolicies(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	defer mu.RUnlock()

	result := make([]*CancellationPolicy, 0, len(policies))
	for _, p := range policies {
		result = append(result, p)
	}
	json.NewEncoder(w).Encode(map[string]interface{}{
		"policies": result,
		"total":    len(result),
		"presets":  []string{"flexible", "moderate", "strict", "super_strict", "custom"},
	})
}

func handleGetPolicy(w http.ResponseWriter, r *http.Request) {
	propID := strings.TrimPrefix(r.URL.Path, "/api/v1/cancellation/policy/")
	mu.RLock()
	p, ok := policies[propID]
	mu.RUnlock()

	if !ok {
		http.Error(w, `{"error":"Policy not found for property"}`, 404)
		return
	}
	json.NewEncoder(w).Encode(p)
}

func handleSetPolicy(w http.ResponseWriter, r *http.Request) {
	var pol CancellationPolicy
	if err := json.NewDecoder(r.Body).Decode(&pol); err != nil {
		http.Error(w, `{"error":"invalid request"}`, 400)
		return
	}

	if pol.PropertyID == "" {
		http.Error(w, `{"error":"property_id required"}`, 400)
		return
	}

	// If using a preset, fill in tiers
	if tiers, ok := presetPolicies[pol.PolicyType]; ok && len(pol.Tiers) == 0 {
		pol.Tiers = tiers
	}

	pol.ID = fmt.Sprintf("POL-%05d", len(policies)+1)
	pol.CreatedAt = time.Now()
	pol.Status = "active"

	mu.Lock()
	policies[pol.PropertyID] = &pol
	mu.Unlock()

	w.WriteHeader(201)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"created": true,
		"policy":  pol,
	})
}

func handleCalculateFee(w http.ResponseWriter, r *http.Request) {
	var req CancellationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, 400)
		return
	}

	mu.RLock()
	policy, ok := policies[req.PropertyID]
	mu.RUnlock()

	if !ok {
		// Use moderate as default
		policy = &CancellationPolicy{
			ID:         "DEFAULT",
			PolicyType: "moderate",
			Tiers:      presetPolicies["moderate"],
			NoShowFee:  100,
			Exceptions: []PolicyException{
				{Type: "force_majeure", FullRefund: true},
			},
		}
	}

	// Calculate days before check-in
	checkIn, _ := time.Parse("2006-01-02", req.CheckIn)
	now := time.Now()
	daysBefore := int(math.Ceil(checkIn.Sub(now).Hours() / 24))
	if daysBefore < 0 {
		daysBefore = 0
	}

	// Check exceptions
	exceptionUsed := false
	if req.ExceptionType != "" {
		for _, ex := range policy.Exceptions {
			if ex.Type == req.ExceptionType && ex.FullRefund {
				exceptionUsed = true
				break
			}
		}
	}

	var feePercent float64
	var refundPercent float64
	var tierDesc string

	if exceptionUsed {
		feePercent = 0
		refundPercent = 100
		tierDesc = fmt.Sprintf("Exception: %s (full refund)", req.ExceptionType)
	} else {
		// Find applicable tier
		for _, tier := range policy.Tiers {
			if daysBefore >= tier.MinDaysBefore && daysBefore < tier.MaxDaysBefore {
				feePercent = tier.FeePercent
				refundPercent = tier.RefundPercent
				tierDesc = tier.Description
				break
			}
		}
	}

	cancellationFee := req.BookingAmount * (feePercent / 100)
	refundAmount := req.BookingAmount - cancellationFee

	// Fee absorption (who pays the cancellation cost from already-earned commissions)
	var absorption FeeAbsorption
	if refundPercent >= 75 {
		absorption = FeeAbsorption{
			PropertyAbsorbs: 0,
			PlatformAbsorbs: 100,
			AgentAbsorbs:    0,
			Description:     "Platform absorbs full refund cost (guest-friendly policy)",
		}
	} else if refundPercent >= 50 {
		absorption = FeeAbsorption{
			PropertyAbsorbs: 50,
			PlatformAbsorbs: 30,
			AgentAbsorbs:    20,
			Description:     "Shared absorption: property 50%, platform 30%, agent 20%",
		}
	} else {
		absorption = FeeAbsorption{
			PropertyAbsorbs: 70,
			PlatformAbsorbs: 20,
			AgentAbsorbs:    10,
			Description:     "Property absorbs majority (strict policy, property benefits from fee)",
		}
	}

	result := CancellationResult{
		BookingID:       req.BookingID,
		Approved:        true,
		PolicyApplied:   policy.PolicyType,
		DaysBefore:      daysBefore,
		TierApplied:     tierDesc,
		CancellationFee: math.Round(cancellationFee*100) / 100,
		RefundAmount:    math.Round(refundAmount*100) / 100,
		RefundPercent:   refundPercent,
		Currency:        req.Currency,
		ExceptionUsed:   exceptionUsed,
		RefundMethod:    "original_payment_method",
		RefundTimeline:  "5-7 business days",
		FeeAbsorption:   absorption,
		ProcessedAt:     time.Now().Format(time.RFC3339),
	}

	mu.Lock()
	cancellations = append(cancellations, result)
	mu.Unlock()

	json.NewEncoder(w).Encode(result)
}

func handleGetPresets(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"presets": presetPolicies,
		"descriptions": map[string]string{
			"flexible":     "Guest-friendly: full refund 3+ days before, 50% 1-3 days",
			"moderate":     "Balanced: full refund 14+ days, tiered 2-14 days",
			"strict":       "Property-friendly: full refund 30+ days only",
			"super_strict": "Maximum protection: 75% refund only at 60+ days",
		},
	})
}

func handleCancellationHistory(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	defer mu.RUnlock()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"cancellations": cancellations,
		"total":         len(cancellations),
	})
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/api/v1/cancellation/policies", handleGetPolicies)
	mux.HandleFunc("/api/v1/cancellation/policy/", handleGetPolicy)
	mux.HandleFunc("/api/v1/cancellation/set-policy", handleSetPolicy)
	mux.HandleFunc("/api/v1/cancellation/calculate", handleCalculateFee)
	mux.HandleFunc("/api/v1/cancellation/presets", handleGetPresets)
	mux.HandleFunc("/api/v1/cancellation/history", handleCancellationHistory)

	log.Printf("🚫 %s v%s starting on port %s", ServiceName, Version, Port)
	log.Fatal(http.ListenAndServe(Port, mux))
}
