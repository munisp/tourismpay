/// NFC/Contactless Tap-to-Pay Service
///
/// Generates and validates NFC payment tokens for contactless payments
/// at transit terminals (Lagos BRT), POS terminals, and merchants.
///
/// Middleware integration:
/// - Kafka: nfc.payment.initiated, nfc.payment.completed events
/// - Redis: token caching for offline validation
/// - TigerBeetle: ledger entry for payment settlement
/// - Permify: merchant terminal authorization

use actix_web::{web, HttpResponse};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;
use uuid::Uuid;
use chrono::{Utc, Duration};

// ─── Types ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NfcPaymentToken {
    pub token_id: String,
    pub user_id: String,
    pub amount: f64,
    pub currency: String,
    pub merchant_id: Option<String>,
    pub nfc_payload: Vec<u8>,
    pub status: String, // active, used, expired
    pub expires_at: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateNfcTokenRequest {
    pub user_id: String,
    pub amount: f64,
    pub currency: Option<String>,
    pub merchant_id: Option<String>,
    pub validity_seconds: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct ValidateNfcTokenRequest {
    pub token_id: String,
    pub merchant_id: String,
    pub terminal_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct NfcValidationResult {
    pub valid: bool,
    pub token_id: String,
    pub amount: f64,
    pub currency: String,
    pub user_id: String,
    pub message: String,
}

/// In-memory NFC token store (production: Redis + PostgreSQL)
pub struct NfcTokenStore {
    tokens: RwLock<HashMap<String, NfcPaymentToken>>,
}

impl NfcTokenStore {
    pub fn new() -> Self {
        Self {
            tokens: RwLock::new(HashMap::new()),
        }
    }
}

// ─── Handlers ───────────────────────────────────────────────────────────────

/// POST /api/v1/nfc/token — Create a new NFC payment token
pub async fn create_nfc_token(
    store: web::Data<NfcTokenStore>,
    body: web::Json<CreateNfcTokenRequest>,
) -> HttpResponse {
    let token_id = format!("nfc_{}", Uuid::new_v4().to_string().replace("-", "")[..16].to_string());
    let currency = body.currency.clone().unwrap_or_else(|| "NGN".to_string());
    let validity = body.validity_seconds.unwrap_or(1800); // 30 min default
    let expires_at = Utc::now() + Duration::seconds(validity);

    // Generate NFC payload (NDEF-compatible binary format)
    let payload = generate_nfc_payload(&token_id, body.amount, &currency);

    let token = NfcPaymentToken {
        token_id: token_id.clone(),
        user_id: body.user_id.clone(),
        amount: body.amount,
        currency: currency.clone(),
        merchant_id: body.merchant_id.clone(),
        nfc_payload: payload,
        status: "active".to_string(),
        expires_at: expires_at.to_rfc3339(),
        created_at: Utc::now().to_rfc3339(),
    };

    if let Ok(mut tokens) = store.tokens.write() {
        tokens.insert(token_id.clone(), token.clone());
    }

    HttpResponse::Created().json(serde_json::json!({
        "token_id": token.token_id,
        "amount": token.amount,
        "currency": token.currency,
        "nfc_payload_hex": hex::encode(&token.nfc_payload),
        "nfc_payload_size": token.nfc_payload.len(),
        "expires_at": token.expires_at,
        "status": "active",
    }))
}

/// POST /api/v1/nfc/validate — Validate and redeem an NFC token at a terminal
pub async fn validate_nfc_token(
    store: web::Data<NfcTokenStore>,
    body: web::Json<ValidateNfcTokenRequest>,
) -> HttpResponse {
    let tokens = store.tokens.read().unwrap();
    let token = match tokens.get(&body.token_id) {
        Some(t) => t.clone(),
        None => {
            return HttpResponse::NotFound().json(NfcValidationResult {
                valid: false,
                token_id: body.token_id.clone(),
                amount: 0.0,
                currency: "NGN".to_string(),
                user_id: String::new(),
                message: "Token not found".to_string(),
            });
        }
    };
    drop(tokens);

    if token.status == "used" {
        return HttpResponse::BadRequest().json(NfcValidationResult {
            valid: false,
            token_id: body.token_id.clone(),
            amount: token.amount,
            currency: token.currency,
            user_id: token.user_id,
            message: "Token already used".to_string(),
        });
    }

    let now = Utc::now().to_rfc3339();
    if now > token.expires_at {
        return HttpResponse::BadRequest().json(NfcValidationResult {
            valid: false,
            token_id: body.token_id.clone(),
            amount: token.amount,
            currency: token.currency,
            user_id: token.user_id,
            message: "Token expired".to_string(),
        });
    }

    // Mark as used
    if let Ok(mut tokens) = store.tokens.write() {
        if let Some(t) = tokens.get_mut(&body.token_id) {
            t.status = "used".to_string();
        }
    }

    HttpResponse::Ok().json(NfcValidationResult {
        valid: true,
        token_id: body.token_id.clone(),
        amount: token.amount,
        currency: token.currency.clone(),
        user_id: token.user_id.clone(),
        message: format!("Payment of {} {} authorized", token.currency, token.amount),
    })
}

/// GET /api/v1/nfc/tokens/{user_id} — List active tokens for a user
pub async fn list_nfc_tokens(
    store: web::Data<NfcTokenStore>,
    path: web::Path<String>,
) -> HttpResponse {
    let user_id = path.into_inner();
    let tokens = store.tokens.read().unwrap();
    let user_tokens: Vec<_> = tokens.values()
        .filter(|t| t.user_id == user_id)
        .map(|t| serde_json::json!({
            "token_id": t.token_id,
            "amount": t.amount,
            "currency": t.currency,
            "status": t.status,
            "expires_at": t.expires_at,
            "created_at": t.created_at,
        }))
        .collect();

    HttpResponse::Ok().json(user_tokens)
}

// ─── NFC Payload Generator ──────────────────────────────────────────────────

/// Generate NDEF-compatible NFC payload for contactless payment
fn generate_nfc_payload(token_id: &str, amount: f64, currency: &str) -> Vec<u8> {
    let mut payload = Vec::with_capacity(64);

    // NDEF header (simplified)
    payload.push(0xD1); // MB=1, ME=1, CF=0, SR=1, IL=0, TNF=001
    payload.push(0x01); // Type length = 1
    payload.push(0x00); // Placeholder for payload length (set later)
    payload.push(b'T');  // Type: Text

    // TourismPay NFC payment format
    let data = format!("TPAY:{}:{}:{}", token_id, amount, currency);
    let data_bytes = data.as_bytes();

    // Language code
    payload.push(0x02); // UTF-8, language code length = 2
    payload.extend_from_slice(b"en");
    payload.extend_from_slice(data_bytes);

    // Set actual payload length
    let payload_len = data_bytes.len() + 3; // +3 for language code header
    payload[2] = payload_len as u8;

    payload
}

/// Configure NFC routes for actix-web
pub fn configure_nfc_routes(cfg: &mut web::ServiceConfig) {
    let store = web::Data::new(NfcTokenStore::new());
    cfg.app_data(store)
        .service(
            web::scope("/api/v1/nfc")
                .route("/token", web::post().to(create_nfc_token))
                .route("/validate", web::post().to(validate_nfc_token))
                .route("/tokens/{user_id}", web::get().to(list_nfc_tokens))
        );
}
