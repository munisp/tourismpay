//! KYC AI Engine Client
//!
//! Calls the Python KYC AI Engine service for:
//! - PaddleOCR document extraction
//! - Florence-2 VLM fraud analysis
//! - MediaPipe + MiniFAS liveness detection
//! - InsightFace ArcFace face matching
//! - Docling business document parsing
//!
//! Falls back to rule-based scoring when the AI engine is unavailable.

use serde::{Deserialize, Serialize};
use std::env;

const DEFAULT_AI_ENGINE_URL: &str = "http://localhost:8100";

fn ai_engine_url() -> String {
    env::var("KYC_AI_ENGINE_URL").unwrap_or_else(|_| DEFAULT_AI_ENGINE_URL.to_string())
}

// ─── Response Types ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCRField {
    pub key: String,
    pub value: String,
    pub confidence: f64,
    #[serde(default)]
    pub bbox: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MRZResult {
    pub valid: bool,
    pub document_number: Option<String>,
    pub surname: Option<String>,
    pub given_names: Option<String>,
    pub nationality: Option<String>,
    pub date_of_birth: Option<String>,
    pub expiry_date: Option<String>,
    pub check_digits_valid: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCRResponse {
    pub success: bool,
    pub document_type: String,
    pub fields: Vec<OCRField>,
    pub mrz: Option<MRZResult>,
    pub overall_confidence: f64,
    pub raw_text: String,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FraudAnalysisResult {
    pub is_authentic: bool,
    pub authenticity_score: f64,
    pub signals: Vec<String>,
    pub recommendations: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityResult {
    pub overall_score: f64,
    pub sharpness: f64,
    pub lighting: f64,
    pub glare: f64,
    pub occlusion: f64,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VLMResponse {
    pub success: bool,
    pub classification: serde_json::Value,
    pub fraud_analysis: FraudAnalysisResult,
    pub quality: QualityResult,
    pub model_used: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LivenessResponse {
    pub success: bool,
    pub is_live: bool,
    pub overall_score: f64,
    pub anti_spoof: serde_json::Value,
    pub depth: Option<serde_json::Value>,
    pub texture: serde_json::Value,
    #[serde(default)]
    pub challenges: Vec<serde_json::Value>,
    pub landmarks_detected: bool,
    pub face_quality: f64,
    pub method: String,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FaceMatchResponse {
    pub success: bool,
    pub is_match: bool,
    pub similarity: f64,
    pub threshold: f64,
    pub confidence_level: String,
    pub method: String,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FullKYCResponse {
    pub success: bool,
    pub decision: String,
    pub overall_score: f64,
    pub risk_level: String,
    pub scores: serde_json::Value,
    pub ocr: serde_json::Value,
    pub vlm: serde_json::Value,
    pub face_match: serde_json::Value,
    pub liveness: serde_json::Value,
    pub cross_validation: serde_json::Value,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KYBAIResponse {
    pub success: bool,
    pub decision: String,
    pub overall_score: f64,
    pub docling: serde_json::Value,
    pub vlm: serde_json::Value,
    pub validation: serde_json::Value,
    #[serde(default)]
    pub warnings: Vec<String>,
}

// ─── Client Functions ───────────────────────────────────────────────────────

pub async fn call_ai_ocr(
    image_url: &str,
    document_type: &str,
    country: &str,
) -> Result<OCRResponse, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/v1/ocr/extract", ai_engine_url());

    // Download image and send as multipart
    let image_bytes = download_file(image_url).await?;
    let part = reqwest::multipart::Part::bytes(image_bytes)
        .file_name("document.jpg")
        .mime_str("image/jpeg")
        .map_err(|e| e.to_string())?;

    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("document_type", document_type.to_string())
        .text("country", country.to_string());

    let resp = client.post(&url).multipart(form).send().await.map_err(|e| format!("AI engine OCR call failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("AI engine OCR returned {}", resp.status()));
    }

    resp.json::<OCRResponse>().await.map_err(|e| format!("AI engine OCR parse error: {}", e))
}

pub async fn call_ai_vlm(
    image_url: &str,
    expected_type: Option<&str>,
) -> Result<VLMResponse, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/v1/vlm/analyze", ai_engine_url());

    let image_bytes = download_file(image_url).await?;
    let part = reqwest::multipart::Part::bytes(image_bytes)
        .file_name("document.jpg")
        .mime_str("image/jpeg")
        .map_err(|e| e.to_string())?;

    let mut form = reqwest::multipart::Form::new().part("file", part);
    if let Some(et) = expected_type {
        form = form.text("expected_type", et.to_string());
    }

    let resp = client.post(&url).multipart(form).send().await.map_err(|e| format!("AI engine VLM call failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("AI engine VLM returned {}", resp.status()));
    }

    resp.json::<VLMResponse>().await.map_err(|e| format!("AI engine VLM parse error: {}", e))
}

pub async fn call_ai_liveness(
    image_url: &str,
    challenges: Option<&str>,
) -> Result<LivenessResponse, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/v1/liveness/detect", ai_engine_url());

    let image_bytes = download_file(image_url).await?;
    let part = reqwest::multipart::Part::bytes(image_bytes)
        .file_name("selfie.jpg")
        .mime_str("image/jpeg")
        .map_err(|e| e.to_string())?;

    let mut form = reqwest::multipart::Form::new().part("file", part);
    if let Some(ch) = challenges {
        form = form.text("challenges", ch.to_string());
    }

    let resp = client.post(&url).multipart(form).send().await.map_err(|e| format!("AI engine liveness call failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("AI engine liveness returned {}", resp.status()));
    }

    resp.json::<LivenessResponse>().await.map_err(|e| format!("AI engine liveness parse error: {}", e))
}

pub async fn call_ai_face_match(
    selfie_url: &str,
    document_url: &str,
    threshold: f64,
) -> Result<FaceMatchResponse, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/v1/face/match", ai_engine_url());

    let selfie_bytes = download_file(selfie_url).await?;
    let doc_bytes = download_file(document_url).await?;

    let selfie_part = reqwest::multipart::Part::bytes(selfie_bytes)
        .file_name("selfie.jpg")
        .mime_str("image/jpeg")
        .map_err(|e| e.to_string())?;
    let doc_part = reqwest::multipart::Part::bytes(doc_bytes)
        .file_name("document.jpg")
        .mime_str("image/jpeg")
        .map_err(|e| e.to_string())?;

    let form = reqwest::multipart::Form::new()
        .part("selfie", selfie_part)
        .part("document", doc_part)
        .text("threshold", threshold.to_string());

    let resp = client.post(&url).multipart(form).send().await.map_err(|e| format!("AI engine face match call failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("AI engine face match returned {}", resp.status()));
    }

    resp.json::<FaceMatchResponse>().await.map_err(|e| format!("AI engine face match parse error: {}", e))
}

pub async fn call_ai_full_kyc(
    document_front_url: &str,
    selfie_url: &str,
    document_back_url: Option<&str>,
    document_type: &str,
    country: &str,
    full_name: &str,
    date_of_birth: &str,
    document_number: &str,
) -> Result<FullKYCResponse, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/v1/kyc/verify-full", ai_engine_url());

    let front_bytes = download_file(document_front_url).await?;
    let selfie_bytes = download_file(selfie_url).await?;

    let front_part = reqwest::multipart::Part::bytes(front_bytes)
        .file_name("document_front.jpg")
        .mime_str("image/jpeg")
        .map_err(|e| e.to_string())?;
    let selfie_part = reqwest::multipart::Part::bytes(selfie_bytes)
        .file_name("selfie.jpg")
        .mime_str("image/jpeg")
        .map_err(|e| e.to_string())?;

    let mut form = reqwest::multipart::Form::new()
        .part("document_front", front_part)
        .part("selfie", selfie_part)
        .text("document_type", document_type.to_string())
        .text("country", country.to_string())
        .text("full_name", full_name.to_string())
        .text("date_of_birth", date_of_birth.to_string())
        .text("document_number", document_number.to_string());

    if let Some(back_url) = document_back_url {
        let back_bytes = download_file(back_url).await?;
        let back_part = reqwest::multipart::Part::bytes(back_bytes)
            .file_name("document_back.jpg")
            .mime_str("image/jpeg")
            .map_err(|e| e.to_string())?;
        form = form.part("document_back", back_part);
    }

    let resp = client.post(&url).multipart(form).send().await.map_err(|e| format!("AI engine full KYC call failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("AI engine full KYC returned {}", resp.status()));
    }

    resp.json::<FullKYCResponse>().await.map_err(|e| format!("AI engine full KYC parse error: {}", e))
}

pub async fn call_ai_kyb_verify(
    file_url: &str,
    expected_type: Option<&str>,
    company_name: Option<&str>,
    rc_number: Option<&str>,
    tin_number: Option<&str>,
) -> Result<KYBAIResponse, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/v1/kyb/verify-document", ai_engine_url());

    let file_bytes = download_file(file_url).await?;
    let file_part = reqwest::multipart::Part::bytes(file_bytes)
        .file_name("document.pdf")
        .mime_str("application/pdf")
        .map_err(|e| e.to_string())?;

    let mut form = reqwest::multipart::Form::new().part("file", file_part);
    if let Some(et) = expected_type {
        form = form.text("expected_type", et.to_string());
    }
    if let Some(cn) = company_name {
        form = form.text("company_name", cn.to_string());
    }
    if let Some(rc) = rc_number {
        form = form.text("rc_number", rc.to_string());
    }
    if let Some(tn) = tin_number {
        form = form.text("tin_number", tn.to_string());
    }

    let resp = client.post(&url).multipart(form).send().await.map_err(|e| format!("AI engine KYB call failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("AI engine KYB returned {}", resp.status()));
    }

    resp.json::<KYBAIResponse>().await.map_err(|e| format!("AI engine KYB parse error: {}", e))
}

async fn download_file(url: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::new();
    let resp = client.get(url).send().await.map_err(|e| format!("Download failed: {}", e))?;
    resp.bytes().await.map(|b| b.to_vec()).map_err(|e| format!("Read bytes failed: {}", e))
}

/// Check if the AI engine is available
pub async fn is_ai_engine_available() -> bool {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .unwrap_or_default();
    let url = format!("{}/health", ai_engine_url());
    client.get(&url).send().await.is_ok()
}
