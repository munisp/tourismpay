package service

import (
	"time"

	"github.com/google/uuid"
)

type CreateSchemeRequest struct {
	EmployerName  string    `json:"employer_name"`
	EmployerCode  string    `json:"employer_code"`
	Industry      string    `json:"industry"`
	ContactPerson string    `json:"contact_person"`
	ContactEmail  string    `json:"contact_email"`
	ContactPhone  string    `json:"contact_phone"`
	Address       string    `json:"address"`
	State         string    `json:"state"`
	InceptionDate time.Time `json:"inception_date"`
}

type AddMemberRequest struct {
	SchemeID        uuid.UUID `json:"scheme_id"`
	EmployeeID      string    `json:"employee_id"`
	FirstName       string    `json:"first_name"`
	LastName        string    `json:"last_name"`
	DateOfBirth     time.Time `json:"date_of_birth"`
	Gender          string    `json:"gender"`
	Designation     string    `json:"designation"`
	Salary          float64   `json:"salary"`
	BenefitMultiple float64   `json:"benefit_multiple"`
}

type AddBeneficiaryRequest struct {
	MemberID      uuid.UUID `json:"member_id"`
	FullName      string    `json:"full_name"`
	Relationship  string    `json:"relationship"`
	DateOfBirth   time.Time `json:"date_of_birth"`
	Phone         string    `json:"phone"`
	SharePercent  float64   `json:"share_percent"`
	BankName      string    `json:"bank_name"`
	AccountNumber string    `json:"account_number"`
}

type SubmitClaimRequest struct {
	MemberID      uuid.UUID `json:"member_id"`
	ClaimType     string    `json:"claim_type"`
	EventDate     time.Time `json:"event_date"`
	CauseOfEvent  string    `json:"cause_of_event"`
	MedicalReport string    `json:"medical_report"`
	DeathCertRef  string    `json:"death_cert_ref"`
}

type EndorsementRequest struct {
	SchemeID        uuid.UUID `json:"scheme_id"`
	EndorsementType string    `json:"endorsement_type"`
	Description     string    `json:"description"`
	EffectiveDate   time.Time `json:"effective_date"`
	PremiumImpact   float64   `json:"premium_impact"`
}
