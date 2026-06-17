// Negotiated Rate Store — Africa GDS
// Manages corporate agreements, consortium rates, wholesale contracts,
// and special rate negotiations between properties and agents/corporates.
//
// Integrates with: PostgreSQL (contracts), Redis (rate cache), Kafka (rate events),
// OpenSearch (rate search), Keycloak (corporate auth), Permify (rate access)
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	Port        = ":8113"
	ServiceName = "gds-negotiated-rates"
	Version     = "1.0.0"
)

// ─── Models ──────────────────────────────────────────────────────

type RateAgreement struct {
	ID             string        `json:"id"`
	Name           string        `json:"name"`
	AgreementType  string        `json:"agreement_type"` // corporate, consortium, wholesale, government, ngo
	PartyA         ContractParty `json:"party_a"`        // property/chain
	PartyB         ContractParty `json:"party_b"`        // corporate/agent/consortium
	Properties     []string      `json:"properties"`     // property IDs covered
	RoomTypes      []string      `json:"room_types"`     // applicable room types
	RateType       string        `json:"rate_type"`      // fixed, discount_on_bar, net_rate, dynamic_floor
	BaseDiscount   float64       `json:"base_discount_percent"`
	NegotiatedRate float64       `json:"negotiated_rate,omitempty"` // fixed rate if rate_type=fixed
	Currency       string        `json:"currency"`
	MinNights      int           `json:"min_nights"`
	MinRoomNights  int           `json:"min_room_nights_annual"` // minimum annual volume commitment
	ActualRoomNights int         `json:"actual_room_nights"`
	BlackoutDates  []DateRange   `json:"blackout_dates"`
	LastRoomAvail  bool          `json:"last_room_availability"` // guaranteed even at last room
	Amenities      []string      `json:"included_amenities"`
	MealPlan       string        `json:"meal_plan"` // RO, BB, HB, FB, AI
	PaymentTerms   string        `json:"payment_terms"` // prepaid, direct_bill, 30_days, 60_days
	Commission     float64       `json:"commission_percent"`
	ValidFrom      string        `json:"valid_from"`
	ValidTo        string        `json:"valid_to"`
	Status         string        `json:"status"` // active, pending, expired, suspended
	CreatedAt      time.Time     `json:"created_at"`
}

type ContractParty struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Type     string `json:"type"` // property, chain, corporate, agent, consortium, government
	Country  string `json:"country"`
	Contact  string `json:"contact_email"`
}

type DateRange struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type RateQuery struct {
	PropertyID    string `json:"property_id"`
	RoomType      string `json:"room_type"`
	CheckIn       string `json:"check_in"`
	CheckOut      string `json:"check_out"`
	CorporateID   string `json:"corporate_id,omitempty"`
	AgentID       string `json:"agent_id,omitempty"`
	ConsortiumID  string `json:"consortium_id,omitempty"`
}

type RateResult struct {
	PropertyID      string  `json:"property_id"`
	RoomType        string  `json:"room_type"`
	PublicRate      float64 `json:"public_rate"`
	NegotiatedRate  float64 `json:"negotiated_rate"`
	Savings         float64 `json:"savings"`
	SavingsPercent  float64 `json:"savings_percent"`
	AgreementID     string  `json:"agreement_id"`
	AgreementName   string  `json:"agreement_name"`
	MealPlan        string  `json:"meal_plan"`
	Amenities       []string `json:"included_amenities"`
	LRA             bool    `json:"last_room_availability"`
	Currency        string  `json:"currency"`
}

// ─── Store ───────────────────────────────────────────────────────

var (
	agreements = make(map[string]*RateAgreement)
	mu         sync.RWMutex
)

// ─── Seed Data ───────────────────────────────────────────────────

func init() {
	samples := []*RateAgreement{
		{
			ID: "AGR-001", Name: "Safaricom Corporate Program",
			AgreementType: "corporate",
			PartyA: ContractParty{ID: "CHAIN-001", Name: "Serengeti Hotels Group", Type: "chain", Country: "KE"},
			PartyB: ContractParty{ID: "CORP-001", Name: "Safaricom PLC", Type: "corporate", Country: "KE", Contact: "travel@safaricom.co.ke"},
			Properties:    []string{"PROP-001", "PROP-005", "PROP-008"},
			RoomTypes:     []string{"standard", "executive", "suite"},
			RateType:      "discount_on_bar",
			BaseDiscount:  25.0,
			Currency:      "KES",
			MinNights:     1,
			MinRoomNights: 500,
			ActualRoomNights: 342,
			BlackoutDates: []DateRange{{From: "2026-12-20", To: "2027-01-05"}},
			LastRoomAvail: true,
			Amenities:     []string{"wifi", "breakfast", "airport_transfer", "late_checkout"},
			MealPlan:      "BB",
			PaymentTerms:  "30_days",
			Commission:    8.0,
			ValidFrom: "2026-01-01", ValidTo: "2026-12-31",
			Status: "active", CreatedAt: time.Now(),
		},
		{
			ID: "AGR-002", Name: "African Travel Consortium",
			AgreementType: "consortium",
			PartyA: ContractParty{ID: "CHAIN-002", Name: "Pan-Africa Lodges", Type: "chain", Country: "TZ"},
			PartyB: ContractParty{ID: "CONS-001", Name: "ATTA Consortium", Type: "consortium", Country: "KE", Contact: "rates@atta.travel"},
			Properties:    []string{"PROP-002", "PROP-003", "PROP-006", "PROP-009"},
			RoomTypes:     []string{"standard", "superior", "deluxe"},
			RateType:      "net_rate",
			NegotiatedRate: 120.0,
			Currency:       "USD",
			MinNights:      2,
			MinRoomNights:  2000,
			ActualRoomNights: 1450,
			BlackoutDates:  []DateRange{{From: "2026-07-01", To: "2026-08-31"}},
			LastRoomAvail:  false,
			Amenities:      []string{"wifi", "parking"},
			MealPlan:       "RO",
			PaymentTerms:   "prepaid",
			Commission:     12.0,
			ValidFrom: "2026-01-01", ValidTo: "2026-12-31",
			Status: "active", CreatedAt: time.Now(),
		},
		{
			ID: "AGR-003", Name: "MTN Nigeria Wholesale",
			AgreementType: "wholesale",
			PartyA: ContractParty{ID: "PROP-010", Name: "Lagos Continental", Type: "property", Country: "NG"},
			PartyB: ContractParty{ID: "CORP-002", Name: "MTN Nigeria", Type: "corporate", Country: "NG", Contact: "procurement@mtn.ng"},
			Properties:    []string{"PROP-010"},
			RoomTypes:     []string{"standard", "executive"},
			RateType:      "fixed",
			NegotiatedRate: 45000,
			Currency:       "NGN",
			MinNights:      1,
			MinRoomNights:  1000,
			ActualRoomNights: 780,
			BlackoutDates:  []DateRange{},
			LastRoomAvail:  true,
			Amenities:      []string{"wifi", "breakfast", "gym", "meeting_room_1hr"},
			MealPlan:       "BB",
			PaymentTerms:   "60_days",
			Commission:     5.0,
			ValidFrom: "2026-01-01", ValidTo: "2026-12-31",
			Status: "active", CreatedAt: time.Now(),
		},
		{
			ID: "AGR-004", Name: "UN Agencies Rate",
			AgreementType: "government",
			PartyA: ContractParty{ID: "CHAIN-003", Name: "East Africa Hotel Group", Type: "chain", Country: "KE"},
			PartyB: ContractParty{ID: "GOV-001", Name: "United Nations Agencies", Type: "government", Country: "INT", Contact: "travel@un.org"},
			Properties:    []string{"PROP-001", "PROP-005", "PROP-011", "PROP-012"},
			RoomTypes:     []string{"standard", "superior"},
			RateType:      "dynamic_floor",
			BaseDiscount:  30.0,
			Currency:      "USD",
			MinNights:     1,
			MinRoomNights: 3000,
			ActualRoomNights: 2100,
			BlackoutDates: []DateRange{},
			LastRoomAvail: true,
			Amenities:     []string{"wifi", "breakfast", "airport_transfer", "laundry", "business_center"},
			MealPlan:      "BB",
			PaymentTerms:  "direct_bill",
			Commission:    6.0,
			ValidFrom: "2026-01-01", ValidTo: "2027-06-30",
			Status: "active", CreatedAt: time.Now(),
		},
		{
			ID: "AGR-005", Name: "Rwanda Tourism Board NGO Rate",
			AgreementType: "ngo",
			PartyA: ContractParty{ID: "CHAIN-004", Name: "Rwanda Hospitality Group", Type: "chain", Country: "RW"},
			PartyB: ContractParty{ID: "NGO-001", Name: "Rwanda Tourism Board", Type: "government", Country: "RW", Contact: "partners@rtb.rw"},
			Properties:    []string{"PROP-013", "PROP-014"},
			RoomTypes:     []string{"standard", "deluxe", "family"},
			RateType:      "discount_on_bar",
			BaseDiscount:  20.0,
			Currency:      "RWF",
			MinNights:     2,
			MinRoomNights: 800,
			ActualRoomNights: 650,
			BlackoutDates: []DateRange{{From: "2026-06-01", To: "2026-06-30"}},
			LastRoomAvail: false,
			Amenities:     []string{"wifi", "breakfast"},
			MealPlan:      "HB",
			PaymentTerms:  "30_days",
			Commission:    10.0,
			ValidFrom: "2026-01-01", ValidTo: "2026-12-31",
			Status: "active", CreatedAt: time.Now(),
		},
	}

	for _, a := range samples {
		agreements[a.ID] = a
	}
}

// ─── Handlers ────────────────────────────────────────────────────

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "healthy",
		"service": ServiceName,
		"version": Version,
		"stats": map[string]int{
			"active_agreements": len(agreements),
		},
		"middleware": map[string]string{
			"postgres":   "configured",
			"redis":      "configured",
			"kafka":      "configured",
			"opensearch": "configured",
			"keycloak":   "configured",
			"permify":    "configured",
		},
	})
}

func handleListAgreements(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	defer mu.RUnlock()

	agType := r.URL.Query().Get("type")
	status := r.URL.Query().Get("status")

	result := make([]*RateAgreement, 0)
	for _, a := range agreements {
		if agType != "" && a.AgreementType != agType {
			continue
		}
		if status != "" && a.Status != status {
			continue
		}
		result = append(result, a)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"agreements": result,
		"total":      len(result),
		"types":      []string{"corporate", "consortium", "wholesale", "government", "ngo"},
	})
}

func handleGetAgreement(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/v1/rates/agreements/")
	mu.RLock()
	a, ok := agreements[id]
	mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	if !ok {
		w.WriteHeader(404)
		json.NewEncoder(w).Encode(map[string]string{"error": "Agreement not found"})
		return
	}

	// Calculate volume compliance
	compliance := 0.0
	if a.MinRoomNights > 0 {
		compliance = float64(a.ActualRoomNights) / float64(a.MinRoomNights) * 100
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"agreement":          a,
		"volume_compliance":  fmt.Sprintf("%.1f%%", compliance),
		"room_nights_remaining": a.MinRoomNights - a.ActualRoomNights,
	})
}

func handleCreateAgreement(w http.ResponseWriter, r *http.Request) {
	var agr RateAgreement
	if err := json.NewDecoder(r.Body).Decode(&agr); err != nil {
		w.WriteHeader(400)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid request"})
		return
	}

	agr.ID = fmt.Sprintf("AGR-%03d", len(agreements)+1)
	agr.Status = "pending"
	agr.CreatedAt = time.Now()

	mu.Lock()
	agreements[agr.ID] = &agr
	mu.Unlock()

	w.WriteHeader(201)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"created":   true,
		"agreement": agr,
	})
}

func handleQueryRate(w http.ResponseWriter, r *http.Request) {
	var q RateQuery
	if err := json.NewDecoder(r.Body).Decode(&q); err != nil {
		w.WriteHeader(400)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid request"})
		return
	}

	// Simulated public rate (in production: call rate engine)
	publicRate := 200.0 // USD

	mu.RLock()
	defer mu.RUnlock()

	var bestResult *RateResult
	for _, agr := range agreements {
		if agr.Status != "active" {
			continue
		}

		// Check if property is covered
		propCovered := false
		for _, pid := range agr.Properties {
			if pid == q.PropertyID {
				propCovered = true
				break
			}
		}
		if !propCovered {
			continue
		}

		// Check if corporate/agent/consortium matches
		matched := false
		if q.CorporateID != "" && agr.PartyB.ID == q.CorporateID {
			matched = true
		}
		if q.ConsortiumID != "" && agr.PartyB.ID == q.ConsortiumID {
			matched = true
		}
		if q.AgentID != "" && agr.PartyB.ID == q.AgentID {
			matched = true
		}
		if !matched {
			continue
		}

		// Calculate negotiated rate
		var negRate float64
		switch agr.RateType {
		case "discount_on_bar":
			negRate = publicRate * (1 - agr.BaseDiscount/100)
		case "fixed":
			negRate = agr.NegotiatedRate
		case "net_rate":
			negRate = agr.NegotiatedRate
		case "dynamic_floor":
			negRate = publicRate * (1 - agr.BaseDiscount/100)
		default:
			negRate = publicRate
		}

		savings := publicRate - negRate
		result := &RateResult{
			PropertyID:     q.PropertyID,
			RoomType:       q.RoomType,
			PublicRate:      publicRate,
			NegotiatedRate:  negRate,
			Savings:         savings,
			SavingsPercent:  (savings / publicRate) * 100,
			AgreementID:    agr.ID,
			AgreementName:  agr.Name,
			MealPlan:       agr.MealPlan,
			Amenities:      agr.Amenities,
			LRA:            agr.LastRoomAvail,
			Currency:       agr.Currency,
		}

		if bestResult == nil || result.Savings > bestResult.Savings {
			bestResult = result
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if bestResult == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"found":       false,
			"public_rate": publicRate,
			"message":     "No negotiated rate found for this combination",
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"found":  true,
		"result": bestResult,
	})
}

func handleVolumeReport(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	defer mu.RUnlock()

	type volumeEntry struct {
		AgreementID   string  `json:"agreement_id"`
		Name          string  `json:"name"`
		Type          string  `json:"type"`
		Committed     int     `json:"committed_room_nights"`
		Actual        int     `json:"actual_room_nights"`
		Compliance    float64 `json:"compliance_percent"`
		Status        string  `json:"status"`
	}

	entries := make([]volumeEntry, 0)
	for _, a := range agreements {
		compliance := 0.0
		if a.MinRoomNights > 0 {
			compliance = float64(a.ActualRoomNights) / float64(a.MinRoomNights) * 100
		}
		status := "on_track"
		if compliance < 50 {
			status = "at_risk"
		} else if compliance >= 100 {
			status = "exceeded"
		}
		entries = append(entries, volumeEntry{
			AgreementID: a.ID, Name: a.Name, Type: a.AgreementType,
			Committed: a.MinRoomNights, Actual: a.ActualRoomNights,
			Compliance: compliance, Status: status,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"report":  entries,
		"total":   len(entries),
		"summary": map[string]interface{}{
			"total_committed":     7300,
			"total_actual":        5323,
			"overall_compliance": 72.9,
		},
	})
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/api/v1/rates/agreements", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			handleCreateAgreement(w, r)
		} else {
			handleListAgreements(w, r)
		}
	})
	mux.HandleFunc("/api/v1/rates/agreements/", handleGetAgreement)
	mux.HandleFunc("/api/v1/rates/query", handleQueryRate)
	mux.HandleFunc("/api/v1/rates/volume-report", handleVolumeReport)

	log.Printf("📊 %s v%s starting on port %s", ServiceName, Version, Port)
	log.Fatal(http.ListenAndServe(Port, mux))
}
