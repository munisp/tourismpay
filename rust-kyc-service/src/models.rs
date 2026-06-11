use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "kyc_status", rename_all = "snake_case")]
pub enum KycStatus {
    Pending,
    InProgress,
    Approved,
    Rejected,
    Expired,
    ManualReview,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "doc_type", rename_all = "snake_case")]
pub enum DocumentType {
    Passport,
    NationalId,
    DriversLicense,
    ResidencePermit,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "liveness_method", rename_all = "snake_case")]
pub enum LivenessMethod {
    PassivePhoto,
    ActiveChallenge,
    VideoSelfie,
    MotionDetection,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct KycVerification {
    pub id: Uuid,
    pub user_id: String,
    pub status: String,
    pub document_type: Option<String>,
    pub document_country: Option<String>,
    pub document_number_hash: Option<String>,
    pub full_name: Option<String>,
    pub date_of_birth: Option<String>,
    pub nationality: Option<String>,
    pub liveness_score: Option<f64>,
    pub liveness_method: Option<String>,
    pub document_match_score: Option<f64>,
    pub risk_score: Option<f64>,
    pub sanctions_clear: Option<bool>,
    pub pep_clear: Option<bool>,
    pub reviewer_id: Option<String>,
    pub reviewer_notes: Option<String>,
    pub rejection_reason: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct IdentityVerificationRequest {
    pub document_type: String,
    pub document_country: String,
    pub document_number: String,
    pub full_name: String,
    pub date_of_birth: String,
    pub nationality: String,
    pub document_front_url: String,
    pub document_back_url: Option<String>,
    pub selfie_url: String,
}

#[derive(Debug, Deserialize)]
pub struct LivenessCheckRequest {
    pub method: String,
    pub video_url: Option<String>,
    pub photo_url: Option<String>,
    pub challenge_responses: Option<Vec<ChallengeResponse>>,
}

#[derive(Debug, Deserialize)]
pub struct ChallengeResponse {
    pub challenge_type: String,
    pub response_value: String,
    pub timestamp_ms: i64,
}

#[derive(Debug, Deserialize)]
pub struct DocumentVerificationRequest {
    pub document_type: String,
    pub country: String,
    pub front_image_url: String,
    pub back_image_url: Option<String>,
    pub mrz_data: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SanctionsScreenRequest {
    pub full_name: String,
    pub date_of_birth: Option<String>,
    pub nationality: Option<String>,
    pub passport_number: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AdminReviewRequest {
    pub verification_id: Uuid,
    pub decision: String,
    pub notes: Option<String>,
    pub rejection_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct VerificationCallbackRequest {
    pub verification_id: Uuid,
    pub provider: String,
    pub status: String,
    pub score: Option<f64>,
    pub details: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct VerificationResponse {
    pub verification_id: Uuid,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct RiskScoreResponse {
    pub user_id: String,
    pub overall_score: f64,
    pub identity_score: f64,
    pub liveness_score: f64,
    pub document_score: f64,
    pub sanctions_clear: bool,
    pub pep_clear: bool,
    pub risk_level: String,
}

#[derive(Debug, Serialize)]
pub struct SanctionsResult {
    pub screened: bool,
    pub matches_found: u32,
    pub risk_level: String,
    pub lists_checked: Vec<String>,
    pub potential_matches: Vec<SanctionsMatch>,
}

#[derive(Debug, Serialize)]
pub struct SanctionsMatch {
    pub list_name: String,
    pub match_score: f64,
    pub matched_name: String,
    pub entry_type: String,
}
