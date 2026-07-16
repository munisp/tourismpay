package service

import "time"

type RegisterSubjectRequest struct {
	SubjectRef     string `json:"subject_ref"`
	SubjectType    string `json:"subject_type"`
	FirstName      string `json:"first_name"`
	LastName       string `json:"last_name"`
	Email          string `json:"email"`
	Phone          string `json:"phone"`
	Country        string `json:"country"`
	DataCategories string `json:"data_categories"`
}

type ConsentRequest struct {
	SubjectRef string `json:"subject_ref"`
	Purpose    string `json:"purpose"`
	LegalBasis string `json:"legal_basis"`
	Granted    bool   `json:"granted"`
	IPAddress  string `json:"ip_address"`
	Channel    string `json:"channel"`
	Version    string `json:"version"`
	ExpiryDays int    `json:"expiry_days"`
}

type AccessRequestInput struct {
	SubjectRef  string `json:"subject_ref"`
	RequestType string `json:"request_type"`
	Reason      string `json:"reason"`
}

type ProcessingActivityRequest struct {
	ProcessingName    string `json:"processing_name"`
	Purpose           string `json:"purpose"`
	LegalBasis        string `json:"legal_basis"`
	DataCategories    string `json:"data_categories"`
	SubjectCategories string `json:"subject_categories"`
	Recipients        string `json:"recipients"`
	ThirdCountries    string `json:"third_countries"`
	RetentionPeriod   string `json:"retention_period"`
	TechnicalMeasures string `json:"technical_measures"`
	DPIARequired      bool   `json:"dpia_required"`
}

type BreachReportRequest struct {
	Description    string    `json:"description"`
	Severity       string    `json:"severity"`
	DataCategories string    `json:"data_categories"`
	AffectedCount  int       `json:"affected_count"`
	DetectedAt     time.Time `json:"detected_at"`
	Measures       string    `json:"measures_taken"`
}
