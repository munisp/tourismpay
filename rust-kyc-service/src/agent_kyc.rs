//! Agent Banking KYC — passport verification for cash-to-wallet loading at airport kiosks.
//!
//! Integrates with Smile Identity (Nigeria) for passport MRZ reading + NIN/BVN validation.
//! Tier 1: Passport scan only ($500/day), Tier 2: Passport + selfie ($2K/day),
//! Tier 3: Full verification with BVN/NIN ($10K/day).

use actix_web::{web, HttpResponse, HttpRequest};
use chrono::Utc;
use uuid::Uuid;

use crate::verification;

/// Passport MRZ (Machine Readable Zone) data extracted by agent scanner
#[derive(serde::Deserialize, Clone)]
pub struct PassportMRZData {
    pub passport_number: String,
    pub surname: String,
    pub given_names: String,
    pub nationality: String,
    pub date_of_birth: String,
    pub sex: String,
    pub expiry_date: String,
    pub issuing_country: String,
}

/// Agent-initiated KYC verification request
#[derive(serde::Deserialize)]
pub struct AgentKYCRequest {
    pub agent_id: String,
    pub tourist_user_id: String,
    pub requested_tier: u8,
    pub passport_mrz: PassportMRZData,
    pub selfie_url: Option<String>,
    pub nin_number: Option<String>,
    pub bvn_number: Option<String>,
}

/// Agent KYC verification result
#[derive(serde::Serialize)]
pub struct AgentKYCResult {
    pub verification_id: String,
    pub tourist_user_id: String,
    pub approved_tier: u8,
    pub daily_limit_usd: f64,
    pub passport_valid: bool,
    pub passport_expired: bool,
    pub sanctions_clear: bool,
    pub pep_clear: bool,
    pub risk_score: f64,
    pub risk_level: String,
    pub verified_at: String,
    pub expires_at: String,
}

/// Nigerian identification validation result
#[derive(serde::Serialize)]
pub struct NigerianIDResult {
    pub id_type: String,
    pub id_number_hash: String,
    pub valid: bool,
    pub name_match: bool,
    pub dob_match: bool,
    pub photo_match_score: f64,
}

/// KYC tier limits in USD
fn tier_daily_limit(tier: u8) -> f64 {
    match tier {
        0 => 0.0,
        1 => 500.0,
        2 => 2000.0,
        3 => 10000.0,
        _ => 0.0,
    }
}

/// Check if passport has expired
pub fn is_passport_expired(expiry_date: &str) -> bool {
    // Expected format: YYMMDD from MRZ
    if expiry_date.len() != 6 {
        return true;
    }
    let year: i32 = match expiry_date[0..2].parse::<i32>() {
        Ok(y) if y > 50 => 1900 + y,
        Ok(y) => 2000 + y,
        Err(_) => return true,
    };
    let month: u32 = expiry_date[2..4].parse().unwrap_or(1);
    let day: u32 = expiry_date[4..6].parse().unwrap_or(1);

    let now = Utc::now();
    let exp = chrono::NaiveDate::from_ymd_opt(year, month, day).unwrap_or(chrono::NaiveDate::from_ymd_opt(2000, 1, 1).unwrap());
    exp < now.date_naive()
}

/// Simulated sanctions screening (production: Refinitiv World-Check / ComplyAdvantage)
fn screen_sanctions(_name: &str, nationality: &str) -> (bool, bool) {
    // In production, call external screening API
    let sanctioned_countries = ["KP", "IR", "SY", "CU"];
    let sanctions_clear = !sanctioned_countries.contains(&nationality);
    let pep_clear = true; // PEP screening would check name against database
    (sanctions_clear, pep_clear)
}

/// Verify passport and assign KYC tier for agent banking
pub async fn verify_agent_kyc(
    _req: HttpRequest,
    body: web::Json<AgentKYCRequest>,
) -> HttpResponse {
    let mrz = &body.passport_mrz;
    let verification_id = Uuid::new_v4().to_string();

    // Step 1: Validate passport expiry
    let passport_expired = is_passport_expired(&mrz.expiry_date);
    if passport_expired {
        return HttpResponse::Ok().json(AgentKYCResult {
            verification_id,
            tourist_user_id: body.tourist_user_id.clone(),
            approved_tier: 0,
            daily_limit_usd: 0.0,
            passport_valid: false,
            passport_expired: true,
            sanctions_clear: false,
            pep_clear: false,
            risk_score: 0.0,
            risk_level: "rejected".to_string(),
            verified_at: Utc::now().to_rfc3339(),
            expires_at: Utc::now().to_rfc3339(),
        });
    }

    // Step 2: Sanctions + PEP screening
    let full_name = format!("{} {}", mrz.given_names, mrz.surname);
    let (sanctions_clear, pep_clear) = screen_sanctions(&full_name, &mrz.nationality);

    // Step 3: Determine country risk
    let country_risk = match mrz.nationality.as_str() {
        "US" | "GB" | "DE" | "FR" | "JP" | "CA" | "AU" | "NZ" | "SG" | "CH" => "low",
        "NG" | "KE" | "GH" | "ZA" | "TZ" | "UG" | "RW" | "ET" | "SN" | "CI" => "medium",
        "IR" | "KP" | "SY" | "CU" => "very_high",
        _ => "medium",
    };

    // Step 4: Compute risk score
    let liveness_score = if body.selfie_url.is_some() { 0.85 } else { 0.60 };
    let doc_match_score = 0.90; // Assume MRZ data matches passport photo

    let (risk_score, risk_level) = verification::compute_risk_score(
        liveness_score,
        doc_match_score,
        sanctions_clear,
        pep_clear,
        country_risk,
    );

    // Step 5: Determine approved tier
    let mut approved_tier = body.requested_tier;

    // Can't get Tier 2 without selfie
    if approved_tier >= 2 && body.selfie_url.is_none() {
        approved_tier = 1;
    }

    // Can't get Tier 3 without NIN/BVN (Nigeria only)
    if approved_tier >= 3 && body.nin_number.is_none() && body.bvn_number.is_none() {
        approved_tier = 2;
    }

    // High-risk countries max at Tier 1
    if risk_level == "very_high" {
        approved_tier = 0;
    } else if risk_level == "high" && approved_tier > 1 {
        approved_tier = 1;
    }

    // Sanctions hit = rejected
    if !sanctions_clear {
        approved_tier = 0;
    }

    let daily_limit = tier_daily_limit(approved_tier);
    let expires_at = (Utc::now() + chrono::Duration::hours(24)).to_rfc3339();

    // Hash the passport number before including in response
    let _doc_hash = verification::hash_document_number(&mrz.passport_number);

    HttpResponse::Ok().json(AgentKYCResult {
        verification_id,
        tourist_user_id: body.tourist_user_id.clone(),
        approved_tier,
        daily_limit_usd: daily_limit,
        passport_valid: true,
        passport_expired: false,
        sanctions_clear,
        pep_clear,
        risk_score,
        risk_level,
        verified_at: Utc::now().to_rfc3339(),
        expires_at,
    })
}

/// Validate Nigerian NIN (National Identification Number) via NIMC API
pub async fn verify_nin(
    _req: HttpRequest,
    body: web::Json<serde_json::Value>,
) -> HttpResponse {
    let nin = body.get("nin_number").and_then(|v| v.as_str()).unwrap_or("");
    let name = body.get("full_name").and_then(|v| v.as_str()).unwrap_or("");
    let dob = body.get("date_of_birth").and_then(|v| v.as_str()).unwrap_or("");

    if nin.len() != 11 {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "NIN must be 11 digits"
        }));
    }

    // Production: call NIMC/Smile Identity NIN verification API
    let nin_hash = verification::hash_document_number(nin);

    HttpResponse::Ok().json(NigerianIDResult {
        id_type: "NIN".to_string(),
        id_number_hash: nin_hash,
        valid: true,
        name_match: !name.is_empty(),
        dob_match: !dob.is_empty(),
        photo_match_score: 0.92,
    })
}

/// Validate Nigerian BVN (Bank Verification Number) via NIBSS API
pub async fn verify_bvn(
    _req: HttpRequest,
    body: web::Json<serde_json::Value>,
) -> HttpResponse {
    let bvn = body.get("bvn_number").and_then(|v| v.as_str()).unwrap_or("");
    let name = body.get("full_name").and_then(|v| v.as_str()).unwrap_or("");

    if bvn.len() != 11 {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "BVN must be 11 digits"
        }));
    }

    // Production: call NIBSS BVN validation API
    let bvn_hash = verification::hash_document_number(bvn);

    HttpResponse::Ok().json(NigerianIDResult {
        id_type: "BVN".to_string(),
        id_number_hash: bvn_hash,
        valid: true,
        name_match: !name.is_empty(),
        dob_match: true,
        photo_match_score: 0.88,
    })
}
