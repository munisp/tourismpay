package services

import (
	"fmt"
	"math"
	"strings"
	"time"
)

// ─── Multi-Recipient Tipping ─────────────────────────────────────────────────
// Supports tipping multiple individuals with custom per-recipient amounts,
// equal splits, or percentage-based allocation from a total tip.

// MultiTipRecipient represents a single recipient in a multi-tip transaction
type MultiTipRecipient struct {
	RecipientID   string  `json:"recipient_id"`
	RecipientName string  `json:"recipient_name"`
	Role          string  `json:"role"` // server, chef, guide, driver, etc.
	Amount        float64 `json:"amount"`
	Percentage    float64 `json:"percentage"`   // % of total tip this person gets
	WalletID      string  `json:"wallet_id"`    // Direct wallet credit target
	Message       string  `json:"message"`      // Optional personal message
}

// MultiTipRequest is the input for calculating/distributing a multi-recipient tip
type MultiTipRequest struct {
	Jurisdiction   string               `json:"jurisdiction"`
	BillAmount     float64              `json:"bill_amount"`
	TotalTipAmount float64              `json:"total_tip_amount"` // 0 = calculate from tip_type/tip_value
	TipType        string               `json:"tip_type"`         // percentage, flat, round_up
	TipValue       float64              `json:"tip_value"`        // If total_tip_amount is 0
	SplitMode      string               `json:"split_mode"`       // "equal", "custom_amount", "custom_percent"
	Recipients     []MultiTipRecipient  `json:"recipients"`
	PayerID        string               `json:"payer_id"`
	Currency       string               `json:"currency"`
	TransactionRef string               `json:"transaction_ref"`  // Optional link to a payment
}

// MultiTipResult is the computed result of a multi-recipient tip
type MultiTipResult struct {
	GroupID        string              `json:"group_id"`
	TotalTip       float64             `json:"total_tip"`
	TaxOnTip       float64             `json:"tax_on_tip"`
	NetTip         float64             `json:"net_tip"`
	GrandTotal     float64             `json:"grand_total"` // bill + total tip
	Currency       string              `json:"currency"`
	SplitMode      string              `json:"split_mode"`
	RecipientCount int                 `json:"recipient_count"`
	Distributions  []MultiTipRecipient `json:"distributions"`
	Receipt        string              `json:"receipt"`
	CreatedAt      int64               `json:"created_at"`
}

// MultiTipService handles multi-recipient tip calculations and distributions
type MultiTipService struct {
	tipping *TippingService
}

// NewMultiTipService creates a new multi-tip service
func NewMultiTipService(tipping *TippingService) *MultiTipService {
	return &MultiTipService{tipping: tipping}
}

// CalculateMultiTip computes per-recipient amounts for a multi-tip
func (s *MultiTipService) CalculateMultiTip(req MultiTipRequest) MultiTipResult {
	jurisdiction := strings.ToUpper(req.Jurisdiction)
	config := s.tipping.GetConfig(jurisdiction)

	// Determine total tip amount
	totalTip := req.TotalTipAmount
	if totalTip <= 0 {
		var tipType TipType
		switch req.TipType {
		case "percentage":
			tipType = TipTypePercentage
		case "flat":
			tipType = TipTypeFlat
		case "round_up":
			tipType = TipTypeRoundUp
		default:
			tipType = TipTypePercentage
		}
		calc := s.tipping.CalculateTip(jurisdiction, req.BillAmount, tipType, req.TipValue)
		totalTip = calc.TipAmount
	}

	totalTip = math.Round(totalTip*100) / 100

	// Calculate tax on tip
	var taxOnTip float64
	if config.TaxOnTip && config.TipTaxRate > 0 {
		taxOnTip = math.Round(totalTip*config.TipTaxRate) / 100.0
	}
	netTip := totalTip - taxOnTip

	// Determine currency
	currency := req.Currency
	if currency == "" {
		currency = config.Currency
	}

	// Distribute among recipients
	recipientCount := len(req.Recipients)
	if recipientCount == 0 {
		// No recipients specified — return undistributed
		return MultiTipResult{
			GroupID:        generateMultiTipGroupID(jurisdiction),
			TotalTip:       totalTip,
			TaxOnTip:       taxOnTip,
			NetTip:         netTip,
			GrandTotal:     req.BillAmount + totalTip,
			Currency:       currency,
			SplitMode:      req.SplitMode,
			RecipientCount: 0,
			Distributions:  []MultiTipRecipient{},
			Receipt:        generateMultiTipReceipt(jurisdiction),
			CreatedAt:      time.Now().UnixMilli(),
		}
	}

	distributions := s.calculateDistributions(req.SplitMode, netTip, req.Recipients)

	return MultiTipResult{
		GroupID:        generateMultiTipGroupID(jurisdiction),
		TotalTip:       totalTip,
		TaxOnTip:       taxOnTip,
		NetTip:         netTip,
		GrandTotal:     req.BillAmount + totalTip,
		Currency:       currency,
		SplitMode:      req.SplitMode,
		RecipientCount: recipientCount,
		Distributions:  distributions,
		Receipt:        generateMultiTipReceipt(jurisdiction),
		CreatedAt:      time.Now().UnixMilli(),
	}
}

// calculateDistributions computes per-recipient amounts based on split mode
func (s *MultiTipService) calculateDistributions(splitMode string, netTip float64, recipients []MultiTipRecipient) []MultiTipRecipient {
	result := make([]MultiTipRecipient, len(recipients))
	copy(result, recipients)

	switch splitMode {
	case "equal":
		// Split equally among all recipients
		perPerson := math.Round(netTip/float64(len(recipients))*100) / 100
		remainder := math.Round((netTip-perPerson*float64(len(recipients)))*100) / 100
		for i := range result {
			result[i].Amount = perPerson
			result[i].Percentage = math.Round(100.0/float64(len(recipients))*10) / 10
			// Give remainder to first recipient
			if i == 0 && remainder != 0 {
				result[i].Amount = math.Round((perPerson+remainder)*100) / 100
			}
		}

	case "custom_percent":
		// Each recipient has a custom percentage of the total
		totalPct := 0.0
		for _, r := range recipients {
			totalPct += r.Percentage
		}
		// Normalize if percentages don't sum to 100
		for i := range result {
			normalizedPct := result[i].Percentage
			if totalPct > 0 && totalPct != 100 {
				normalizedPct = result[i].Percentage / totalPct * 100
			}
			result[i].Amount = math.Round(netTip*normalizedPct/100*100) / 100
			result[i].Percentage = math.Round(normalizedPct*10) / 10
		}
		// Fix rounding error — adjust last recipient
		var sumAmounts float64
		for _, r := range result[:len(result)-1] {
			sumAmounts += r.Amount
		}
		result[len(result)-1].Amount = math.Round((netTip-sumAmounts)*100) / 100

	case "custom_amount":
		// Each recipient has a pre-defined custom amount — validate total
		var sumCustom float64
		for _, r := range recipients {
			sumCustom += r.Amount
		}
		// If custom amounts don't match netTip, scale proportionally
		if sumCustom > 0 && math.Abs(sumCustom-netTip) > 0.01 {
			scale := netTip / sumCustom
			for i := range result {
				result[i].Amount = math.Round(recipients[i].Amount*scale*100) / 100
				result[i].Percentage = math.Round(result[i].Amount/netTip*100*10) / 10
			}
		} else {
			for i := range result {
				result[i].Amount = math.Round(recipients[i].Amount*100) / 100
				if netTip > 0 {
					result[i].Percentage = math.Round(result[i].Amount/netTip*100*10) / 10
				}
			}
		}

	default:
		// Fallback to equal split
		perPerson := math.Round(netTip/float64(len(recipients))*100) / 100
		for i := range result {
			result[i].Amount = perPerson
			result[i].Percentage = math.Round(100.0/float64(len(recipients))*10) / 10
		}
	}

	return result
}

// ValidateMultiTip checks if a multi-tip request is valid
func (s *MultiTipService) ValidateMultiTip(req MultiTipRequest) error {
	if len(req.Recipients) == 0 {
		return fmt.Errorf("at least one recipient is required")
	}
	if len(req.Recipients) > 20 {
		return fmt.Errorf("maximum 20 recipients per multi-tip")
	}
	if req.BillAmount < 0 {
		return fmt.Errorf("bill amount must be non-negative")
	}
	if req.TotalTipAmount < 0 {
		return fmt.Errorf("total tip amount must be non-negative")
	}
	if req.TotalTipAmount == 0 && req.TipValue <= 0 {
		return fmt.Errorf("either total_tip_amount or tip_value must be positive")
	}

	// Validate split mode
	validModes := map[string]bool{"equal": true, "custom_amount": true, "custom_percent": true}
	if !validModes[req.SplitMode] {
		return fmt.Errorf("invalid split_mode: %s (valid: equal, custom_amount, custom_percent)", req.SplitMode)
	}

	// Validate custom_percent sums to roughly 100
	if req.SplitMode == "custom_percent" {
		var totalPct float64
		for _, r := range req.Recipients {
			if r.Percentage <= 0 {
				return fmt.Errorf("each recipient must have a positive percentage in custom_percent mode")
			}
			totalPct += r.Percentage
		}
		if math.Abs(totalPct-100) > 1.0 {
			return fmt.Errorf("recipient percentages must sum to 100 (got %.1f)", totalPct)
		}
	}

	// Validate custom_amount has positive amounts
	if req.SplitMode == "custom_amount" {
		for _, r := range req.Recipients {
			if r.Amount <= 0 {
				return fmt.Errorf("each recipient must have a positive amount in custom_amount mode")
			}
		}
	}

	// Check for duplicate recipient IDs
	seen := make(map[string]bool)
	for _, r := range req.Recipients {
		if r.RecipientID == "" {
			return fmt.Errorf("each recipient must have a recipient_id")
		}
		if seen[r.RecipientID] {
			return fmt.Errorf("duplicate recipient_id: %s", r.RecipientID)
		}
		seen[r.RecipientID] = true
	}

	return nil
}

// GetSuggestedRecipients returns common recipient roles for a jurisdiction/service type
func (s *MultiTipService) GetSuggestedRecipients(jurisdiction string, serviceType string) []SuggestedRecipient {
	jurisdiction = strings.ToUpper(jurisdiction)

	// Common roles by service type
	rolesByService := map[string][]SuggestedRecipient{
		"restaurant": {
			{Role: "server", Label: "Server/Waiter", SuggestedPct: 50},
			{Role: "chef", Label: "Chef/Cook", SuggestedPct: 25},
			{Role: "bartender", Label: "Bartender", SuggestedPct: 15},
			{Role: "host", Label: "Host/Hostess", SuggestedPct: 10},
		},
		"hotel": {
			{Role: "concierge", Label: "Concierge", SuggestedPct: 30},
			{Role: "housekeeping", Label: "Housekeeping", SuggestedPct: 30},
			{Role: "bellhop", Label: "Bellhop/Porter", SuggestedPct: 20},
			{Role: "valet", Label: "Valet", SuggestedPct: 20},
		},
		"safari": {
			{Role: "guide", Label: "Safari Guide", SuggestedPct: 40},
			{Role: "driver", Label: "Driver", SuggestedPct: 25},
			{Role: "tracker", Label: "Tracker", SuggestedPct: 20},
			{Role: "camp_staff", Label: "Camp Staff", SuggestedPct: 15},
		},
		"tour": {
			{Role: "guide", Label: "Tour Guide", SuggestedPct: 50},
			{Role: "driver", Label: "Driver", SuggestedPct: 30},
			{Role: "assistant", Label: "Assistant", SuggestedPct: 20},
		},
		"spa": {
			{Role: "therapist", Label: "Therapist", SuggestedPct: 60},
			{Role: "attendant", Label: "Attendant", SuggestedPct: 25},
			{Role: "reception", Label: "Reception", SuggestedPct: 15},
		},
		"transport": {
			{Role: "driver", Label: "Driver", SuggestedPct: 70},
			{Role: "assistant", Label: "Assistant/Mate", SuggestedPct: 30},
		},
	}

	// Jurisdiction-specific overrides
	if jurisdiction == "TZ" && serviceType == "safari" {
		return []SuggestedRecipient{
			{Role: "guide", Label: "Safari Guide ($15-20/day)", SuggestedPct: 35},
			{Role: "driver", Label: "Driver ($10-15/day)", SuggestedPct: 25},
			{Role: "cook", Label: "Cook ($10/day)", SuggestedPct: 20},
			{Role: "porter", Label: "Porter ($8-10/day)", SuggestedPct: 20},
		}
	}
	if jurisdiction == "RW" && serviceType == "safari" {
		return []SuggestedRecipient{
			{Role: "guide", Label: "Gorilla Trek Guide ($10-20)", SuggestedPct: 40},
			{Role: "tracker", Label: "Tracker ($5-10)", SuggestedPct: 30},
			{Role: "porter", Label: "Porter ($5-10)", SuggestedPct: 30},
		}
	}
	if jurisdiction == "EG" && serviceType == "tour" {
		return []SuggestedRecipient{
			{Role: "guide", Label: "Egyptologist Guide", SuggestedPct: 50},
			{Role: "driver", Label: "Driver", SuggestedPct: 25},
			{Role: "guard", Label: "Site Guard (Baksheesh)", SuggestedPct: 15},
			{Role: "boatman", Label: "Felucca Boatman", SuggestedPct: 10},
		}
	}

	roles, exists := rolesByService[serviceType]
	if !exists {
		// Default roles
		return []SuggestedRecipient{
			{Role: "primary", Label: "Primary Service", SuggestedPct: 60},
			{Role: "support", Label: "Support Staff", SuggestedPct: 40},
		}
	}
	return roles
}

// SuggestedRecipient is a recommended role for multi-tipping
type SuggestedRecipient struct {
	Role         string  `json:"role"`
	Label        string  `json:"label"`
	SuggestedPct float64 `json:"suggested_pct"`
}

func generateMultiTipGroupID(jurisdiction string) string {
	ts := time.Now().UnixNano() / 1000000
	return fmt.Sprintf("MTIP-%s-%d", strings.ToUpper(jurisdiction), ts)
}

func generateMultiTipReceipt(jurisdiction string) string {
	ts := time.Now().UnixNano() / 1000000
	return fmt.Sprintf("RCPT-MTIP-%s-%d", strings.ToUpper(jurisdiction), ts)
}
