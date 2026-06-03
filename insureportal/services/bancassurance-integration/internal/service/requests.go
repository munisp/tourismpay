package service

import (
	"time"

	"github.com/google/uuid"
)

type RegisterBankPartnerRequest struct {
	BankCode            string    `json:"bank_code"`
	BankName            string    `json:"bank_name"`
	CBNLicenseNumber    string    `json:"cbn_license_number"`
	ContactEmail        string    `json:"contact_email"`
	ContactPhone        string    `json:"contact_phone"`
	RelationshipManager string    `json:"relationship_manager"`
	APIEndpoint         string    `json:"api_endpoint"`
	WebhookURL          string    `json:"webhook_url"`
	CommissionRate      float64   `json:"commission_rate"`
	IntegrationType     string    `json:"integration_type"`
	AgreementStartDate  time.Time `json:"agreement_start_date"`
}

type GenerateOfferRequest struct {
	BankPartnerID    uuid.UUID `json:"bank_partner_id"`
	BankCustomerID   string    `json:"bank_customer_id"`
	AccountNumber    string    `json:"account_number"`
	BVN              string    `json:"bvn"`
	FirstName        string    `json:"first_name"`
	LastName         string    `json:"last_name"`
	Email            string    `json:"email"`
	Phone            string    `json:"phone"`
	OfferType        string    `json:"offer_type"`
	LoanAmount       float64   `json:"loan_amount"`
	InterestRate     float64   `json:"interest_rate"`
	TermMonths       int       `json:"term_months"`
	CoverTypes       []string  `json:"cover_types"`
	PremiumFrequency string    `json:"premium_frequency"`
}

type CreateMandateRequest struct {
	PolicyID      uuid.UUID `json:"policy_id"`
	AccountNumber string    `json:"account_number"`
	AccountName   string    `json:"account_name"`
	BankCode      string    `json:"bank_code"`
	Amount        float64   `json:"amount"`
	Frequency     string    `json:"frequency"`
}

type ProcessCollectionRequest struct {
	MandateID     uuid.UUID `json:"mandate_id"`
	Amount        float64   `json:"amount"`
	BankReference string    `json:"bank_reference"`
}
