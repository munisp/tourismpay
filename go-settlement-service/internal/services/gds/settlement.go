// GDS Settlement Service — Commission calculation, agent payouts, property payments
// Integrates with TigerBeetle (ledger), Mojaloop (cross-border), Temporal (workflows)
package gds

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"
)

// ─── Settlement Types ────────────────────────────────────────────────────────

// SettlementBatch groups reservations for periodic settlement
type SettlementBatch struct {
	ID             string            `json:"id"`
	PropertyID     string            `json:"propertyId"`
	AgentID        string            `json:"agentId"`
	Period         string            `json:"period"` // daily, weekly, monthly
	Reservations   []string          `json:"reservations"`
	TotalGross     float64           `json:"totalGross"`
	TotalCommission float64          `json:"totalCommission"`
	TotalNet       float64           `json:"totalNet"`
	Currency       string            `json:"currency"`
	Status         SettlementStatus  `json:"status"`
	PayoutMethod   string            `json:"payoutMethod"` // bank, mobile_money, mojaloop
	PayoutRef      string            `json:"payoutRef,omitempty"`
	CreatedAt      time.Time         `json:"createdAt"`
	SettledAt      *time.Time        `json:"settledAt,omitempty"`
}

type SettlementStatus string

const (
	SettlementPending    SettlementStatus = "pending"
	SettlementProcessing SettlementStatus = "processing"
	SettlementCompleted  SettlementStatus = "completed"
	SettlementFailed     SettlementStatus = "failed"
)

// CommissionTier defines agent commission rates based on volume
type CommissionTier struct {
	Tier       string  `json:"tier"`
	MinBookings int    `json:"minBookings"`
	MaxBookings int    `json:"maxBookings"`
	Rate       float64 `json:"rate"` // percentage
}

// PayoutInstruction describes how to pay out to a property or agent
type PayoutInstruction struct {
	RecipientType string  `json:"recipientType"` // property, agent
	RecipientID   string  `json:"recipientId"`
	Amount        float64 `json:"amount"`
	Currency      string  `json:"currency"`
	Method        string  `json:"method"` // bank_transfer, mobile_money, mojaloop_instant
	BankAccount   string  `json:"bankAccount,omitempty"`
	MobileNumber  string  `json:"mobileNumber,omitempty"`
	MojaloopFSP   string  `json:"mojaloopFsp,omitempty"`
}

// ─── Settlement Engine ───────────────────────────────────────────────────────

// SettlementEngine manages GDS financial settlement
type SettlementEngine struct {
	mu          sync.RWMutex
	batches     map[string]*SettlementBatch
	tiers       []CommissionTier
	tigerbeetle TigerBeetleClient
	mojaloop    MojaloopClient
	temporal    TemporalClient
	kafka       KafkaClient
}

// NewSettlementEngine creates a settlement engine with middleware clients
func NewSettlementEngine() *SettlementEngine {
	return &SettlementEngine{
		batches: make(map[string]*SettlementBatch),
		tiers: []CommissionTier{
			{Tier: "bronze", MinBookings: 0, MaxBookings: 50, Rate: 10.0},
			{Tier: "silver", MinBookings: 51, MaxBookings: 200, Rate: 12.0},
			{Tier: "gold", MinBookings: 201, MaxBookings: 500, Rate: 15.0},
			{Tier: "platinum", MinBookings: 501, MaxBookings: 999999, Rate: 18.0},
		},
	}
}

// CalculateCommission determines the commission for a booking based on agent tier
func (se *SettlementEngine) CalculateCommission(totalAmount float64, agentTier string) (commission float64, netAmount float64) {
	rate := 10.0 // default
	for _, t := range se.tiers {
		if t.Tier == agentTier {
			rate = t.Rate
			break
		}
	}
	commission = totalAmount * (rate / 100)
	netAmount = totalAmount - commission
	return
}

// CreateBatch groups pending reservations into a settlement batch
func (se *SettlementEngine) CreateBatch(ctx context.Context, propertyID string, agentID string, reservationIDs []string, gross float64, commission float64, currency string) (*SettlementBatch, error) {
	se.mu.Lock()
	defer se.mu.Unlock()

	batch := &SettlementBatch{
		ID:              generateID("stl"),
		PropertyID:      propertyID,
		AgentID:         agentID,
		Period:          "daily",
		Reservations:    reservationIDs,
		TotalGross:      gross,
		TotalCommission: commission,
		TotalNet:        gross - commission,
		Currency:        currency,
		Status:          SettlementPending,
		CreatedAt:       time.Now(),
	}

	se.batches[batch.ID] = batch

	// Record in TigerBeetle ledger
	if se.tigerbeetle != nil {
		// Create pending transfer entries
		_ = se.tigerbeetle.CreateTransfer([16]byte{}, [16]byte{}, uint64(gross*100), 1)
	}

	// Publish event
	if se.kafka != nil {
		_ = se.kafka.Publish("gds.settlement.batch_created", batch.ID, []byte(batch.ID))
	}

	log.Printf("[GDS Settlement] Batch created: %s (property=%s, gross=%.2f %s)", batch.ID, propertyID, gross, currency)
	return batch, nil
}

// ProcessBatch executes the settlement payout
func (se *SettlementEngine) ProcessBatch(ctx context.Context, batchID string, instruction PayoutInstruction) error {
	se.mu.Lock()
	batch, ok := se.batches[batchID]
	if !ok {
		se.mu.Unlock()
		return fmt.Errorf("batch %s not found", batchID)
	}
	batch.Status = SettlementProcessing
	se.mu.Unlock()

	var payoutRef string
	var err error

	switch instruction.Method {
	case "mojaloop_instant":
		// Cross-border instant payment via Mojaloop
		if se.mojaloop != nil {
			payoutRef, err = se.mojaloop.InitiateTransfer(
				"tourismpay_fsp",
				instruction.MojaloopFSP,
				instruction.Amount,
				instruction.Currency,
			)
			if err != nil {
				se.mu.Lock()
				batch.Status = SettlementFailed
				se.mu.Unlock()
				return fmt.Errorf("mojaloop transfer failed: %w", err)
			}
		}

	case "mobile_money":
		// Mobile money payout (M-Pesa, MTN MoMo, etc.)
		payoutRef = generateID("momo")
		log.Printf("[GDS Settlement] Mobile money payout: %s to %s", payoutRef, instruction.MobileNumber)

	case "bank_transfer":
		// Traditional bank transfer
		payoutRef = generateID("bank")
		log.Printf("[GDS Settlement] Bank transfer: %s to %s", payoutRef, instruction.BankAccount)

	default:
		return fmt.Errorf("unsupported payout method: %s", instruction.Method)
	}

	se.mu.Lock()
	defer se.mu.Unlock()

	batch.Status = SettlementCompleted
	batch.PayoutMethod = instruction.Method
	batch.PayoutRef = payoutRef
	now := time.Now()
	batch.SettledAt = &now

	// Record completion in TigerBeetle
	if se.tigerbeetle != nil {
		_ = se.tigerbeetle.CreateTransfer([16]byte{}, [16]byte{}, uint64(batch.TotalNet*100), 1)
	}

	// Start reconciliation workflow
	if se.temporal != nil {
		_ = se.temporal.StartWorkflow(ctx, "reconcile-"+batchID, "GDSReconciliationWorkflow", map[string]string{
			"batchId": batchID, "payoutRef": payoutRef,
		})
	}

	log.Printf("[GDS Settlement] Batch %s settled: %.2f %s via %s (ref: %s)",
		batchID, batch.TotalNet, batch.Currency, instruction.Method, payoutRef)

	return err
}

// GetBatchesByProperty returns all settlement batches for a property
func (se *SettlementEngine) GetBatchesByProperty(propertyID string) []*SettlementBatch {
	se.mu.RLock()
	defer se.mu.RUnlock()

	var batches []*SettlementBatch
	for _, b := range se.batches {
		if b.PropertyID == propertyID {
			batches = append(batches, b)
		}
	}
	return batches
}

// GetPendingAmount returns total pending settlement amount across all properties
func (se *SettlementEngine) GetPendingAmount() (float64, int) {
	se.mu.RLock()
	defer se.mu.RUnlock()

	var total float64
	var count int
	for _, b := range se.batches {
		if b.Status == SettlementPending {
			total += b.TotalNet
			count++
		}
	}
	return total, count
}
