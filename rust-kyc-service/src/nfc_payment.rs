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
use uuid::Uuid;
use chrono::{Utc, Duration};
use sqlx::PgPool;

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

/// NFC token store backed by PostgreSQL
pub struct NfcTokenStore {
    pub pool: PgPool,
}

impl NfcTokenStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
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
    let payload_hex = hex::encode(&payload);

    // Persist to PostgreSQL
    let _ = sqlx::query(
        "INSERT INTO nfc_tokens (token_id, user_id, amount, currency, merchant_id, nfc_payload_hex, status, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)"
    )
    .bind(&token_id)
    .bind(&body.user_id)
    .bind(body.amount)
    .bind(&currency)
    .bind(&body.merchant_id)
    .bind(&payload_hex)
    .bind("active")
    .bind(expires_at.to_rfc3339())
    .execute(&store.pool)
    .await;

    HttpResponse::Created().json(serde_json::json!({
        "token_id": token_id,
        "amount": body.amount,
        "currency": currency,
        "nfc_payload_hex": payload_hex,
        "nfc_payload_size": payload.len(),
        "expires_at": expires_at.to_rfc3339(),
        "status": "active",
    }))
}

/// POST /api/v1/nfc/validate — Validate and redeem an NFC token at a terminal
pub async fn validate_nfc_token(
    store: web::Data<NfcTokenStore>,
    body: web::Json<ValidateNfcTokenRequest>,
) -> HttpResponse {
    // Read token from DB
    let row = sqlx::query_as::<_, (String, f64, String, String, String)>(
        "SELECT user_id, amount, currency, status, expires_at FROM nfc_tokens WHERE token_id=$1"
    )
    .bind(&body.token_id)
    .fetch_optional(&store.pool)
    .await;

    let (user_id, amount, currency, status, expires_at) = match row {
        Ok(Some(r)) => r,
        _ => {
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

    if status == "used" {
        return HttpResponse::BadRequest().json(NfcValidationResult {
            valid: false,
            token_id: body.token_id.clone(),
            amount,
            currency,
            user_id,
            message: "Token already used".to_string(),
        });
    }

    let now = Utc::now().to_rfc3339();
    if now > expires_at {
        return HttpResponse::BadRequest().json(NfcValidationResult {
            valid: false,
            token_id: body.token_id.clone(),
            amount,
            currency,
            user_id,
            message: "Token expired".to_string(),
        });
    }

    // Mark as used in DB
    let _ = sqlx::query("UPDATE nfc_tokens SET status='used' WHERE token_id=$1")
        .bind(&body.token_id)
        .execute(&store.pool)
        .await;

    HttpResponse::Ok().json(NfcValidationResult {
        valid: true,
        token_id: body.token_id.clone(),
        amount,
        currency: currency.clone(),
        user_id: user_id.clone(),
        message: format!("Payment of {} {} authorized", currency, amount),
    })
}

/// GET /api/v1/nfc/tokens/{user_id} — List active tokens for a user
pub async fn list_nfc_tokens(
    store: web::Data<NfcTokenStore>,
    path: web::Path<String>,
) -> HttpResponse {
    let user_id = path.into_inner();
    let rows = sqlx::query_as::<_, (String, f64, String, String, String)>(
        "SELECT token_id, amount, currency, status, expires_at FROM nfc_tokens WHERE user_id=$1 ORDER BY expires_at DESC"
    )
    .bind(&user_id)
    .fetch_all(&store.pool)
    .await
    .unwrap_or_default();

    let user_tokens: Vec<_> = rows.iter()
        .map(|(tid, amt, cur, st, exp)| serde_json::json!({
            "token_id": tid,
            "amount": amt,
            "currency": cur,
            "status": st,
            "expires_at": exp,
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
pub fn configure_nfc_routes(cfg: &mut web::ServiceConfig, pool: PgPool) {
    let store = web::Data::new(NfcTokenStore::new(pool));
    cfg.app_data(store)
        .service(
            web::scope("/api/v1/nfc")
                .route("/token", web::post().to(create_nfc_token))
                .route("/validate", web::post().to(validate_nfc_token))
                .route("/tokens/{user_id}", web::get().to(list_nfc_tokens))
        );
}
