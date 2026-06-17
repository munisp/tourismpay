/// Travel Readiness Module
///
/// Provides fast-track KYC tier upgrade (selfie-based), offline payment token
/// renewal, and sanctions-aware country risk assessment for tourists.

use actix_web::{web, HttpRequest, HttpResponse};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::verification;

// ─── Fast-Track KYC Tier Upgrade ────────────────────────────────────────────

#[derive(Deserialize)]
pub struct FastTrackRequest {
    pub tourist_user_id: String,
    pub current_tier: u8,
    pub requested_tier: u8,
    pub selfie_url: Option<String>,
    pub selfie_liveness_score: Option<f64>,
    pub nin_number: Option<String>,
    pub bvn_number: Option<String>,
    pub nationality: String,
    pub passport_number: String,
    pub passport_expiry: String,
}

#[derive(Serialize)]
pub struct FastTrackResult {
    pub verification_id: String,
    pub tourist_user_id: String,
    pub previous_tier: u8,
    pub new_tier: u8,
    pub new_daily_limit_usd: f64,
    pub upgrade_reason: String,
    pub requirements_met: Vec<String>,
    pub requirements_missing: Vec<String>,
    pub verified_at: String,
    pub expires_at: String,
}

fn tier_daily_limit(tier: u8) -> f64 {
    match tier {
        0 => 0.0,
        1 => 500.0,
        2 => 2000.0,
        3 => 10000.0,
        _ => 0.0,
    }
}

pub async fn fast_track_kyc_upgrade(
    _req: HttpRequest,
    body: web::Json<FastTrackRequest>,
) -> HttpResponse {
    let verification_id = Uuid::new_v4().to_string();
    let mut new_tier = body.current_tier;
    let mut requirements_met = Vec::new();
    let mut requirements_missing = Vec::new();

    // Check sanctions
    let sanctioned_countries = ["KP", "IR", "SY", "CU"];
    if sanctioned_countries.contains(&body.nationality.as_str()) {
        return HttpResponse::Ok().json(FastTrackResult {
            verification_id,
            tourist_user_id: body.tourist_user_id.clone(),
            previous_tier: body.current_tier,
            new_tier: 0,
            new_daily_limit_usd: 0.0,
            upgrade_reason: "Upgrade rejected — sanctioned country".to_string(),
            requirements_met: vec![],
            requirements_missing: vec!["Country not sanctioned".to_string()],
            verified_at: Utc::now().to_rfc3339(),
            expires_at: Utc::now().to_rfc3339(),
        });
    }

    // Check passport expiry
    let passport_expired = crate::agent_kyc::is_passport_expired(&body.passport_expiry);
    if passport_expired {
        requirements_missing.push("Valid passport (not expired)".to_string());
    } else {
        requirements_met.push("Valid passport".to_string());
    }

    // Tier 1 → Tier 2: needs selfie with liveness > 0.75
    if body.requested_tier >= 2 && body.current_tier < 2 {
        if let Some(ref _selfie_url) = body.selfie_url {
            let liveness = body.selfie_liveness_score.unwrap_or(0.60);
            if liveness >= 0.75 {
                requirements_met.push(format!("Selfie liveness verified (score: {:.2})", liveness));
                if !passport_expired {
                    new_tier = new_tier.max(2);
                }
            } else {
                requirements_missing.push(format!("Selfie liveness score too low ({:.2} < 0.75)", liveness));
            }
        } else {
            requirements_missing.push("Selfie photo required for Tier 2".to_string());
        }
    }

    // Tier 2 → Tier 3: needs NIN or BVN
    if body.requested_tier >= 3 && new_tier >= 2 {
        let has_nin = body.nin_number.as_ref().map_or(false, |n| n.len() == 11);
        let has_bvn = body.bvn_number.as_ref().map_or(false, |n| n.len() == 11);

        if has_nin || has_bvn {
            if has_nin {
                requirements_met.push("NIN verified".to_string());
            }
            if has_bvn {
                requirements_met.push("BVN verified".to_string());
            }
            new_tier = new_tier.max(3);
        } else {
            requirements_missing.push("NIN (11 digits) or BVN (11 digits) required for Tier 3".to_string());
        }
    }

    let upgrade_reason = if new_tier > body.current_tier {
        format!("Upgraded from Tier {} to Tier {}", body.current_tier, new_tier)
    } else {
        "No upgrade — requirements not met".to_string()
    };

    let _doc_hash = verification::hash_document_number(&body.passport_number);

    HttpResponse::Ok().json(FastTrackResult {
        verification_id,
        tourist_user_id: body.tourist_user_id.clone(),
        previous_tier: body.current_tier,
        new_tier,
        new_daily_limit_usd: tier_daily_limit(new_tier),
        upgrade_reason,
        requirements_met,
        requirements_missing,
        verified_at: Utc::now().to_rfc3339(),
        expires_at: (Utc::now() + chrono::Duration::hours(24)).to_rfc3339(),
    })
}

// ─── Offline Token Renewal ──────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct TokenRenewalRequest {
    pub user_id: String,
    pub expired_token_id: String,
    pub amount_usd: f64,
    pub currency: String,
    pub merchant_id: Option<String>,
}

#[derive(Serialize)]
pub struct TokenRenewalResult {
    pub new_token_id: String,
    pub user_id: String,
    pub amount_usd: f64,
    pub currency: String,
    pub valid_minutes: i64,
    pub qr_payload: String,
    pub renewed_from: String,
    pub created_at: String,
    pub expires_at: String,
}

pub async fn renew_offline_token(
    _req: HttpRequest,
    body: web::Json<TokenRenewalRequest>,
) -> HttpResponse {
    let new_token_id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let valid_minutes: i64 = 30;
    let expires_at = now + chrono::Duration::minutes(valid_minutes);

    // QR payload: compact token for offline merchant scanning
    let qr_payload = format!(
        "TP:OFL:{}:{}:{:.2}:{}:{}",
        new_token_id,
        body.user_id,
        body.amount_usd,
        body.currency,
        expires_at.timestamp()
    );

    HttpResponse::Ok().json(TokenRenewalResult {
        new_token_id,
        user_id: body.user_id.clone(),
        amount_usd: body.amount_usd,
        currency: body.currency.clone(),
        valid_minutes,
        qr_payload,
        renewed_from: body.expired_token_id.clone(),
        created_at: now.to_rfc3339(),
        expires_at: expires_at.to_rfc3339(),
    })
}

// ─── Country Risk Assessment ────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CountryRiskRequest {
    pub country_code: String,
    pub purpose: Option<String>,
}

#[derive(Serialize)]
pub struct CountryRiskResult {
    pub country_code: String,
    pub country_name: String,
    pub risk_level: String,
    pub sanctions_status: String,
    pub travel_advisory: String,
    pub max_kyc_tier: u8,
    pub daily_limit_usd: f64,
    pub requires_enhanced_due_diligence: bool,
    pub available_payment_rails: Vec<String>,
    pub restrictions: Vec<String>,
}

pub async fn assess_country_risk(
    _req: HttpRequest,
    body: web::Json<CountryRiskRequest>,
) -> HttpResponse {
    let code = body.country_code.to_uppercase();

    let (name, risk, sanctions, advisory, max_tier, edd, rails, restrictions) = match code.as_str() {
        "US" => ("United States", "low", "clear", "No advisory", 3, false,
                 vec!["card", "ach", "wire", "wise", "revolut"],
                 vec![]),
        "GB" => ("United Kingdom", "low", "clear", "No advisory", 3, false,
                 vec!["card", "fps", "wire", "revolut", "wise"],
                 vec![]),
        "DE" | "FR" | "NL" | "IT" | "ES" => ("EU Country", "low", "clear", "No advisory", 3, false,
                 vec!["card", "sepa", "wire", "revolut", "wise"],
                 vec![]),
        "JP" | "CA" | "AU" | "NZ" | "SG" | "CH" => ("Low-Risk Country", "low", "clear", "No advisory", 3, false,
                 vec!["card", "wire"],
                 vec![]),
        "BR" => ("Brazil", "low", "clear", "No advisory", 3, false,
                 vec!["card", "pix", "wire"],
                 vec!["Pix transfers limited to $10,000/day".to_string()]),
        "IN" => ("India", "low", "clear", "No advisory", 3, false,
                 vec!["card", "upi", "neft", "imps"],
                 vec!["LRS limit $250,000/year per RBI regulation".to_string()]),
        "CN" => ("China", "medium", "clear", "Standard advisory", 2, true,
                 vec!["card", "alipay", "wechat_pay"],
                 vec!["SAFE annual FX quota $50,000/person".to_string(), "Enhanced due diligence required".to_string()]),
        "NG" => ("Nigeria", "medium", "clear", "Standard advisory", 3, false,
                 vec!["card", "bank_transfer", "ussd", "mobile_money", "agent_banking"],
                 vec![]),
        "KE" => ("Kenya", "medium", "clear", "Standard advisory", 3, false,
                 vec!["card", "mpesa", "bank_transfer", "agent_banking"],
                 vec![]),
        "GH" => ("Ghana", "medium", "clear", "Standard advisory", 3, false,
                 vec!["card", "mobile_money", "bank_transfer"],
                 vec![]),
        "ZA" => ("South Africa", "medium", "clear", "Standard advisory", 3, false,
                 vec!["card", "eft", "bank_transfer"],
                 vec!["SARB single discretionary allowance R1M/year".to_string()]),
        "RU" => ("Russia", "very_high", "restricted", "Do not travel", 0, true,
                 vec![],
                 vec!["All payment rails suspended due to sanctions".to_string(), "No wallet operations permitted".to_string()]),
        "KP" => ("North Korea", "very_high", "sanctioned", "Do not travel", 0, true,
                 vec![],
                 vec!["OFAC comprehensive sanctions — all transactions blocked".to_string()]),
        "IR" => ("Iran", "very_high", "sanctioned", "Do not travel", 0, true,
                 vec![],
                 vec!["OFAC comprehensive sanctions — all transactions blocked".to_string()]),
        "SY" => ("Syria", "very_high", "sanctioned", "Do not travel", 0, true,
                 vec![],
                 vec!["OFAC comprehensive sanctions — all transactions blocked".to_string()]),
        "CU" => ("Cuba", "very_high", "sanctioned", "Do not travel — limited exceptions", 0, true,
                 vec![],
                 vec!["OFAC sanctions — limited authorized transactions only".to_string()]),
        _ => ("Unknown Country", "medium", "clear", "Check local advisory", 2, false,
              vec!["card", "wire"],
              vec!["Limited payment rails — contact support for additional options".to_string()]),
    };

    HttpResponse::Ok().json(CountryRiskResult {
        country_code: code,
        country_name: name.to_string(),
        risk_level: risk.to_string(),
        sanctions_status: sanctions.to_string(),
        travel_advisory: advisory.to_string(),
        max_kyc_tier: max_tier,
        daily_limit_usd: tier_daily_limit(max_tier),
        requires_enhanced_due_diligence: edd,
        available_payment_rails: rails.iter().map(|s| s.to_string()).collect(),
        restrictions: restrictions,
    })
}

// ─── Route Configuration ────────────────────────────────────────────────────

pub fn configure_travel_readiness_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/v1/travel-readiness")
            .route("/fast-track-kyc", web::post().to(fast_track_kyc_upgrade))
            .route("/renew-offline-token", web::post().to(renew_offline_token))
            .route("/country-risk", web::post().to(assess_country_risk))
    );
}
