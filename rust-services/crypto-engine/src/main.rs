use actix_cors::Cors;
use actix_web::{web, App, HttpServer, HttpResponse};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chrono::Utc;
use dashmap::DashMap;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256, Sha512};
use std::sync::Arc;
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;

// ─── Models ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyPair {
    pub id: String,
    pub name: String,
    pub algorithm: String,
    pub public_key: String,
    pub created_at: String,
    pub expires_at: Option<String>,
    pub active: bool,
}

#[derive(Debug, Deserialize)]
pub struct SignRequest {
    pub key_id: String,
    pub payload: String,
    pub algorithm: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SignResponse {
    pub signature: String,
    pub algorithm: String,
    pub key_id: String,
    pub timestamp: String,
}

#[derive(Debug, Deserialize)]
pub struct VerifyRequest {
    pub key_id: String,
    pub payload: String,
    pub signature: String,
}

#[derive(Debug, Deserialize)]
pub struct HashRequest {
    pub data: String,
    pub algorithm: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct EncryptRequest {
    pub plaintext: String,
    pub key_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct WebhookSignRequest {
    pub payload: String,
    pub secret: String,
    pub timestamp: Option<u64>,
}

pub struct AppState {
    pub keys: DashMap<String, (KeyPair, Vec<u8>)>,
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "crypto-engine",
        "version": "1.0.0",
        "timestamp": Utc::now().to_rfc3339(),
    }))
}

async fn generate_key(
    state: web::Data<Arc<AppState>>,
    body: web::Json<serde_json::Value>,
) -> HttpResponse {
    let name = body.get("name").and_then(|v| v.as_str()).unwrap_or("default");
    let algorithm = body.get("algorithm").and_then(|v| v.as_str()).unwrap_or("hmac-sha256");

    let secret = ring::rand::SystemRandom::new();
    let mut key_bytes = vec![0u8; 32];
    ring::rand::SecureRandom::fill(&secret, &mut key_bytes).unwrap();

    let id = format!("key-{}", Uuid::new_v4());
    let public_key = hex::encode(&key_bytes[..16]);

    let kp = KeyPair {
        id: id.clone(),
        name: name.to_string(),
        algorithm: algorithm.to_string(),
        public_key,
        created_at: Utc::now().to_rfc3339(),
        expires_at: None,
        active: true,
    };

    state.keys.insert(id.clone(), (kp.clone(), key_bytes));
    HttpResponse::Created().json(kp)
}

async fn list_keys(state: web::Data<Arc<AppState>>) -> HttpResponse {
    let keys: Vec<KeyPair> = state.keys.iter().map(|e| e.value().0.clone()).collect();
    HttpResponse::Ok().json(serde_json::json!({ "keys": keys, "total": keys.len() }))
}

async fn sign_payload(
    state: web::Data<Arc<AppState>>,
    body: web::Json<SignRequest>,
) -> HttpResponse {
    let req = body.into_inner();
    match state.keys.get(&req.key_id) {
        Some(entry) => {
            let (kp, secret) = entry.value();
            if !kp.active {
                return HttpResponse::BadRequest().json(serde_json::json!({"error": "Key is inactive"}));
            }
            let mut mac = HmacSha256::new_from_slice(secret).unwrap();
            mac.update(req.payload.as_bytes());
            let sig = hex::encode(mac.finalize().into_bytes());
            HttpResponse::Ok().json(SignResponse {
                signature: sig,
                algorithm: kp.algorithm.clone(),
                key_id: req.key_id,
                timestamp: Utc::now().to_rfc3339(),
            })
        }
        None => HttpResponse::NotFound().json(serde_json::json!({"error": "Key not found"})),
    }
}

async fn verify_signature(
    state: web::Data<Arc<AppState>>,
    body: web::Json<VerifyRequest>,
) -> HttpResponse {
    let req = body.into_inner();
    match state.keys.get(&req.key_id) {
        Some(entry) => {
            let (_, secret) = entry.value();
            let mut mac = HmacSha256::new_from_slice(secret).unwrap();
            mac.update(req.payload.as_bytes());
            let expected = hex::encode(mac.finalize().into_bytes());
            let valid = expected == req.signature;
            HttpResponse::Ok().json(serde_json::json!({
                "valid": valid,
                "key_id": req.key_id,
            }))
        }
        None => HttpResponse::NotFound().json(serde_json::json!({"error": "Key not found"})),
    }
}

async fn hash_data(body: web::Json<HashRequest>) -> HttpResponse {
    let algo = body.algorithm.as_deref().unwrap_or("sha256");
    let hash = match algo {
        "sha512" => {
            let mut hasher = Sha512::new();
            hasher.update(body.data.as_bytes());
            hex::encode(hasher.finalize())
        }
        _ => {
            let mut hasher = Sha256::new();
            hasher.update(body.data.as_bytes());
            hex::encode(hasher.finalize())
        }
    };
    HttpResponse::Ok().json(serde_json::json!({
        "hash": hash,
        "algorithm": algo,
    }))
}

async fn encrypt_data(
    state: web::Data<Arc<AppState>>,
    body: web::Json<EncryptRequest>,
) -> HttpResponse {
    // XOR-based symmetric encryption with key stretching (for demo; use AES-GCM in production)
    let key_id = body.key_id.clone().unwrap_or_else(|| {
        state.keys.iter().next().map(|e| e.key().clone()).unwrap_or_default()
    });
    match state.keys.get(&key_id) {
        Some(entry) => {
            let (_, secret) = entry.value();
            let plaintext = body.plaintext.as_bytes();
            let encrypted: Vec<u8> = plaintext.iter().enumerate()
                .map(|(i, b)| b ^ secret[i % secret.len()])
                .collect();
            HttpResponse::Ok().json(serde_json::json!({
                "ciphertext": B64.encode(&encrypted),
                "key_id": key_id,
                "algorithm": "xor-stream",
            }))
        }
        None => HttpResponse::NotFound().json(serde_json::json!({"error": "Key not found"})),
    }
}

async fn sign_webhook(body: web::Json<WebhookSignRequest>) -> HttpResponse {
    let timestamp = body.timestamp.unwrap_or_else(|| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    });
    let to_sign = format!("{}.{}", timestamp, body.payload);
    let mut mac = HmacSha256::new_from_slice(body.secret.as_bytes()).unwrap();
    mac.update(to_sign.as_bytes());
    let signature = B64.encode(mac.finalize().into_bytes());
    HttpResponse::Ok().json(serde_json::json!({
        "signature": format!("v1={}", signature),
        "timestamp": timestamp,
        "header": format!("t={},v1={}", timestamp, signature),
    }))
}

async fn rotate_key(
    state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
) -> HttpResponse {
    let old_id = path.into_inner();
    match state.keys.get(&old_id) {
        Some(entry) => {
            let (old_kp, _) = entry.value();
            let mut old_kp = old_kp.clone();
            old_kp.active = false;
            let old_secret = entry.value().1.clone();
            drop(entry);
            state.keys.insert(old_id.clone(), (old_kp.clone(), old_secret));

            // Generate new key
            let secret = ring::rand::SystemRandom::new();
            let mut key_bytes = vec![0u8; 32];
            ring::rand::SecureRandom::fill(&secret, &mut key_bytes).unwrap();

            let new_id = format!("key-{}", Uuid::new_v4());
            let new_kp = KeyPair {
                id: new_id.clone(),
                name: format!("{} (rotated)", old_kp.name),
                algorithm: old_kp.algorithm.clone(),
                public_key: hex::encode(&key_bytes[..16]),
                created_at: Utc::now().to_rfc3339(),
                expires_at: None,
                active: true,
            };
            state.keys.insert(new_id.clone(), (new_kp.clone(), key_bytes));

            HttpResponse::Ok().json(serde_json::json!({
                "old_key_id": old_id,
                "new_key": new_kp,
                "message": "Key rotated. Old key deactivated.",
            }))
        }
        None => HttpResponse::NotFound().json(serde_json::json!({"error": "Key not found"})),
    }
}

// ─── Main ────────────────────────────────────────────────────────────────────

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt::init();

    let port: u16 = std::env::var("PORT").unwrap_or_else(|_| "8092".into())
        .parse().unwrap_or(8092);

    let state = Arc::new(AppState {
        keys: DashMap::new(),
    });

    // Generate a default signing key
    let rng = ring::rand::SystemRandom::new();
    let mut default_key = vec![0u8; 32];
    ring::rand::SecureRandom::fill(&rng, &mut default_key).unwrap();
    state.keys.insert("key-default".into(), (KeyPair {
        id: "key-default".into(),
        name: "Platform Default Signing Key".into(),
        algorithm: "hmac-sha256".into(),
        public_key: hex::encode(&default_key[..16]),
        created_at: Utc::now().to_rfc3339(),
        expires_at: None,
        active: true,
    }, default_key));

    tracing::info!("Crypto engine starting on port {port}");

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(state.clone()))
            .wrap(Cors::permissive())
            .route("/health", web::get().to(health))
            .route("/api/v1/keys", web::get().to(list_keys))
            .route("/api/v1/keys/generate", web::post().to(generate_key))
            .route("/api/v1/keys/{id}/rotate", web::post().to(rotate_key))
            .route("/api/v1/sign", web::post().to(sign_payload))
            .route("/api/v1/verify", web::post().to(verify_signature))
            .route("/api/v1/hash", web::post().to(hash_data))
            .route("/api/v1/encrypt", web::post().to(encrypt_data))
            .route("/api/v1/webhook/sign", web::post().to(sign_webhook))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
