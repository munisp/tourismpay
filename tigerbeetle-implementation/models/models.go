package models

import (
	"database/sql"
	"time"
)

// PolicyType represents the type of insurance policy.
type PolicyType string

const (
	PolicyTypeLife     PolicyType = "LIFE"
	PolicyTypeHealth   PolicyType = "HEALTH"
	PolicyTypeMotor    PolicyType = "MOTOR"
	PolicyTypeProperty PolicyType = "PROPERTY"
	PolicyTypeTravel   PolicyType = "TRAVEL"
)

// PolicyStatus represents the current status of a policy.
type PolicyStatus string

const (
	PolicyStatusPending   PolicyStatus = "PENDING"
	PolicyStatusActive    PolicyStatus = "ACTIVE"
	PolicyStatusSuspended PolicyStatus = "SUSPENDED"
	PolicyStatusCancelled PolicyStatus = "CANCELLED"
	PolicyStatusExpired   PolicyStatus = "EXPIRED"
)

// PremiumFrequency represents how often premiums are paid.
type PremiumFrequency string

const (
	PremiumFrequencyDaily     PremiumFrequency = "DAILY"
	PremiumFrequencyWeekly    PremiumFrequency = "WEEKLY"
	PremiumFrequencyMonthly   PremiumFrequency = "MONTHLY"
	PremiumFrequencyQuarterly PremiumFrequency = "QUARTERLY"
	PremiumFrequencyAnnually  PremiumFrequency = "ANNUALLY"
)

// Policy represents an insurance policy.
type Policy struct {
	ID               string           `json:"id" db:"id"`
	PolicyNumber     string           `json:"policy_number" db:"policy_number"`
	CustomerID       string           `json:"customer_id" db:"customer_id"`
	PolicyType       PolicyType       `json:"policy_type" db:"policy_type"`
	SumAssured       float64          `json:"sum_assured" db:"sum_assured"`
	Premium          float64          `json:"premium" db:"premium"`
	PremiumFrequency PremiumFrequency `json:"premium_frequency" db:"premium_frequency"`
	DurationMonths   int              `json:"duration_months" db:"duration_months"`
	StartDate        time.Time        `json:"start_date" db:"start_date"`
	EndDate          time.Time        `json:"end_date" db:"end_date"`
	Status           PolicyStatus     `json:"status" db:"status"`
	AgentID          sql.NullString   `json:"agent_id,omitempty" db:"agent_id"`
	CreatedAt        time.Time        `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time        `json:"updated_at" db:"updated_at"`
}

// PaymentStatus represents the status of a payment transaction.
type PaymentStatus string

const (
	PaymentStatusPending   PaymentStatus = "PENDING"
	PaymentStatusCompleted PaymentStatus = "COMPLETED"
	PaymentStatusFailed    PaymentStatus = "FAILED"
	PaymentStatusRefunded  PaymentStatus = "REFUNDED"
)

// PaymentType represents the type of payment.
type PaymentType string

const (
	PaymentTypePremium    PaymentType = "PREMIUM"
	PaymentTypeRefund     PaymentType = "REFUND"
	PaymentTypeClaim      PaymentType = "CLAIM"
	PaymentTypeCommission PaymentType = "COMMISSION"
)

// PaymentMethod represents the method used for payment.
type PaymentMethod string

const (
	PaymentMethodCard         PaymentMethod = "CARD"
	PaymentMethodBankTransfer PaymentMethod = "BANK_TRANSFER"
	PaymentMethodUSSD         PaymentMethod = "USSD"
	PaymentMethodMobileMoney  PaymentMethod = "MOBILE_MONEY"
)

// Payment represents a payment transaction.
type Payment struct {
	ID                int64          `json:"id" db:"id"`
	TransactionID     string         `json:"transaction_id" db:"transaction_id"`
	PolicyID          string         `json:"policy_id" db:"policy_id"`
	CustomerID        string         `json:"customer_id" db:"customer_id"`
	Amount            float64        `json:"amount" db:"amount"`
	Currency          string         `json:"currency" db:"currency"`
	PaymentType       PaymentType    `json:"payment_type" db:"payment_type"`
	PaymentMethod     PaymentMethod  `json:"payment_method" db:"payment_method"`
	Status            PaymentStatus  `json:"status" db:"status"`
	OriginalPaymentID sql.NullInt64  `json:"original_payment_id,omitempty" db:"original_payment_id"`
	RefundReason      sql.NullString `json:"refund_reason,omitempty" db:"refund_reason"`
	ProcessedAt       time.Time      `json:"processed_at" db:"processed_at"`
	CreatedAt         time.Time      `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time      `json:"updated_at" db:"updated_at"`
}

// PaymentRequest represents a request to process a payment.
type PaymentRequest struct {
	PolicyID      string        `json:"policy_id"`
	CustomerID    string        `json:"customer_id"`
	Amount        float64       `json:"amount"`
	Currency      string        `json:"currency"`
	PaymentMethod PaymentMethod `json:"payment_method"`
}

// PaymentResponse represents the response from a payment operation.
type PaymentResponse struct {
	Status        PaymentStatus `json:"status"`
	TransactionID string        `json:"transaction_id,omitempty"`
	PaymentID     int64         `json:"payment_id,omitempty"`
	FailureReason string        `json:"failure_reason,omitempty"`
	Warning       string        `json:"warning,omitempty"`
}

// PaymentResult represents the result of a payment activity in a workflow.
type PaymentResult struct {
	Status        PaymentStatus `json:"status"`
	TransactionID string        `json:"transaction_id,omitempty"`
	PaymentID     int64         `json:"payment_id,omitempty"`
	FailureReason string        `json:"failure_reason,omitempty"`
	ProcessedAt   time.Time     `json:"processed_at"`
}

// RefundRequest represents a request to process a refund.
type RefundRequest struct {
	PaymentID int64   `json:"payment_id"`
	Amount    float64 `json:"amount"`
	Reason    string  `json:"reason"`
}

// CommissionPaymentRequest represents a request to pay commission to an agent.
type CommissionPaymentRequest struct {
	AgentID  uint64  `json:"agent_id"`
	PolicyID string  `json:"policy_id"`
	Amount   float64 `json:"amount"`
}

// PremiumDetails represents the calculated premium details for a policy.
type PremiumDetails struct {
	Amount             float64          `json:"amount"`
	AnnualAmount       float64          `json:"annual_amount"`
	RiskScore          float64          `json:"risk_score"`
	BasePremium        float64          `json:"base_premium"`
	RiskMultiplier     float64          `json:"risk_multiplier"`
	DurationMultiplier float64          `json:"duration_multiplier"`
	Frequency          PremiumFrequency `json:"frequency"`
	Currency           string           `json:"currency"`
}

// VerificationResult represents the result of a NIN verification.
type VerificationResult struct {
	Success       bool      `json:"success"`
	NIN           string    `json:"nin,omitempty"`
	FirstName     string    `json:"first_name,omitempty"`
	LastName      string    `json:"last_name,omitempty"`
	DateOfBirth   string    `json:"date_of_birth,omitempty"`
	PhoneNumber   string    `json:"phone_number,omitempty"`
	FailureReason string    `json:"failure_reason,omitempty"`
	Details       string    `json:"details,omitempty"`
	VerifiedAt    time.Time `json:"verified_at"`
}

// NotificationRequest represents a request to send a notification.
type NotificationRequest struct {
	CustomerID  string `json:"customer_id"`
	PolicyID    string `json:"policy_id"`
	DocumentURL string `json:"document_url"`
	Message     string `json:"message,omitempty"`
}

// PaymentEvent represents an event published to Kafka after a payment operation.
type PaymentEvent struct {
	EventType     string    `json:"event_type"`
	TransactionID string    `json:"transaction_id"`
	PaymentID     int64     `json:"payment_id"`
	PolicyID      string    `json:"policy_id"`
	CustomerID    string    `json:"customer_id"`
	Amount        float64   `json:"amount"`
	Currency      string    `json:"currency"`
	PaymentType   string    `json:"payment_type"`
	Timestamp     time.Time `json:"timestamp"`
}
