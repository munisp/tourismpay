package service

import (
	"time"

	"github.com/google/uuid"
)

type CreateTreatyRequest struct {
	TreatyName        string    `json:"treaty_name"`
	TreatyType        string    `json:"treaty_type"`
	LineOfBusiness    string    `json:"line_of_business"`
	LeadReinsurer     string    `json:"lead_reinsurer"`
	EffectiveDate     time.Time `json:"effective_date"`
	ExpiryDate        time.Time `json:"expiry_date"`
	RetentionLimit    float64   `json:"retention_limit"`
	CessionPercentage float64   `json:"cession_percentage"`
	CommissionRate    float64   `json:"commission_rate"`
	ProfitCommission  float64   `json:"profit_commission"`
}

type AddParticipationRequest struct {
	TreatyID        uuid.UUID `json:"treaty_id"`
	ReinsurerName   string    `json:"reinsurer_name"`
	ReinsurerCode   string    `json:"reinsurer_code"`
	SharePercentage float64   `json:"share_percentage"`
	CreditRating    string    `json:"credit_rating"`
	Country         string    `json:"country"`
	ContactEmail    string    `json:"contact_email"`
	IsLeader        bool      `json:"is_leader"`
}

type CessionRequest struct {
	TreatyID      uuid.UUID `json:"treaty_id"`
	PolicyID      string    `json:"policy_id"`
	PolicyNumber  string    `json:"policy_number"`
	SumInsured    float64   `json:"sum_insured"`
	GrossPremium  float64   `json:"gross_premium"`
	NumberOfLines int       `json:"number_of_lines"`
	EffectiveDate time.Time `json:"effective_date"`
	ExpiryDate    time.Time `json:"expiry_date"`
}

type FacultativeRequest struct {
	PolicyID        string                 `json:"policy_id"`
	InsuredName     string                 `json:"insured_name"`
	RiskDescription string                 `json:"risk_description"`
	LineOfBusiness  string                 `json:"line_of_business"`
	SumInsured      float64                `json:"sum_insured"`
	RetainedAmount  float64                `json:"retained_amount"`
	Premium         float64                `json:"premium"`
	CommissionRate  float64                `json:"commission_rate"`
	RiskDetails     map[string]interface{} `json:"risk_details"`
}

type ClaimRecoveryRequest struct {
	ClaimID          string    `json:"claim_id"`
	TreatyID         uuid.UUID `json:"treaty_id"`
	PolicyID         string    `json:"policy_id"`
	GrossClaimAmount float64   `json:"gross_claim_amount"`
}
