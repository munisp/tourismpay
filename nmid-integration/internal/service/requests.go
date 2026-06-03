package service

import "time"

type RegisterVehicleRequest struct {
	RegistrationNo string `json:"registration_no"`
	ChassisNo      string `json:"chassis_no"`
	EngineNo       string `json:"engine_no"`
	Make           string `json:"make"`
	Model          string `json:"model"`
	Year           int    `json:"year"`
	Color          string `json:"color"`
	VehicleType    string `json:"vehicle_type"`
	OwnerName      string `json:"owner_name"`
	OwnerPhone     string `json:"owner_phone"`
	OwnerAddress   string `json:"owner_address"`
	State          string `json:"state"`
	LGA            string `json:"lga"`
}

type RegisterPolicyRequest struct {
	InternalPolicyNo string    `json:"internal_policy_no"`
	RegistrationNo   string    `json:"registration_no"`
	InsurerCode      string    `json:"insurer_code"`
	InsurerName      string    `json:"insurer_name"`
	CoverType        string    `json:"cover_type"`
	SumInsured       float64   `json:"sum_insured"`
	InceptionDate    time.Time `json:"inception_date"`
	ExpiryDate       time.Time `json:"expiry_date"`
}

type RecordClaimRequest struct {
	RegistrationNo  string    `json:"registration_no"`
	PolicyRef       string    `json:"policy_ref"`
	ClaimType       string    `json:"claim_type"`
	ClaimAmount     float64   `json:"claim_amount"`
	AccidentDate    time.Time `json:"accident_date"`
	Description     string    `json:"description"`
	Location        string    `json:"location"`
	PoliceReportRef string    `json:"police_report_ref"`
}
