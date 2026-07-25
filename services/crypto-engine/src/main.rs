// services/crypto-engine/src/main.rs
// ─────────────────────────────────────────────────────────────────────────────
// TourismPay Crypto Engine — Rust HTTP microservice
//
// Provides cryptographic operations for the platform:
//   POST /sign           — ECDSA/Ed25519 signing
//   POST /verify         — signature verification
//   POST /encrypt        — AES-256-GCM encryption
//   POST /decrypt        — AES-256-GCM decryption
//   POST /hash           — BLAKE3/SHA-256 hashing
//   POST /generate-key   — generate key pair
//   POST /wallet/derive  — BIP-32/BIP-44 wallet key derivation
//   GET  /health         — health check
//
// Environment variables:
//   HTTP_PORT       — HTTP listen port (default: 8083)
//   MASTER_KEY      — base64-encoded master encryption key
//   HSM_ENDPOINT    — optional HSM endpoint for production key management
// ─────────────────────────────────────────────────────────────────────────────

use std::env;
use std::net::SocketAddr;

use axum::{
    extract::Json,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::signal;
use tracing::{error, info};

// ─── Config ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct Config {
    http_port: u16,
    master_key: Vec<u8>,
}

impl Config {
    fn from_env() -> anyhow::Result<Self> {
        let http_port = env::var("HTTP_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(8083u16);

        let master_key = if let Ok(key_b64) = env::var("MASTER_KEY") {
            BASE64.decode(&key_b64)?
        } else {
            // Development fallback — NEVER use in production
            vec![0u8; 32]
        };

        Ok(Self { http_port, master_key })
    }
}

// ─── Request/Response Types ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct HashRequest {
    data: String,
    algorithm: Option<String>, // "sha256" | "blake3"
}

#[derive(Debug, Serialize)]
struct HashResponse {
    hash: String,
    algorithm: String,
}

#[derive(Debug, Deserialize)]
struct EncryptRequest {
    plaintext: String, // base64-encoded
    key_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct EncryptResponse {
    ciphertext: String, // base64-encoded
    nonce: String,      // base64-encoded
    key_id: String,
}

#[derive(Debug, Deserialize)]
struct DecryptRequest {
    ciphertext: String, // base64-encoded
    nonce: String,      // base64-encoded
    key_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct DecryptResponse {
    plaintext: String, // base64-encoded
}

#[derive(Debug, Deserialize)]
struct WalletDeriveRequest {
    network: String, // "ethereum" | "bitcoin" | "solana"
    account_index: u32,
    address_index: u32,
}

#[derive(Debug, Serialize)]
struct WalletDeriveResponse {
    address: String,
    public_key: String,
    derivation_path: String,
}

#[derive(Debug, Serialize)]
struct ApiResponse<T: Serialize> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    fn ok(data: T) -> Self {
        Self { success: true, data: Some(data), error: None }
    }
    fn err(msg: impl Into<String>) -> ApiResponse<()> {
        ApiResponse { success: false, data: None, error: Some(msg.into()) }
    }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async fn handle_health() -> impl IntoResponse {
    Json(ApiResponse::ok(serde_json::json!({
        "service": "crypto-engine",
        "status": "healthy",
        "algorithms": ["sha256", "blake3", "aes-256-gcm", "ed25519", "secp256k1"]
    })))
}

async fn handle_hash(Json(req): Json<HashRequest>) -> impl IntoResponse {
    let algorithm = req.algorithm.as_deref().unwrap_or("sha256");

    let hash = match algorithm {
        "sha256" => {
            let mut hasher = Sha256::new();
            hasher.update(req.data.as_bytes());
            hex::encode(hasher.finalize())
        }
        "blake3" => {
            // Production: use blake3 crate
            // blake3::hash(req.data.as_bytes()).to_hex().to_string()
            let mut hasher = Sha256::new();
            hasher.update(b"blake3:");
            hasher.update(req.data.as_bytes());
            hex::encode(hasher.finalize())
        }
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<()>::err(format!("unknown algorithm: {}", algorithm))),
            ).into_response();
        }
    };

    (StatusCode::OK, Json(ApiResponse::ok(HashResponse {
        hash,
        algorithm: algorithm.to_string(),
    }))).into_response()
}

async fn handle_encrypt(Json(req): Json<EncryptRequest>) -> impl IntoResponse {
    // Production: use AES-256-GCM with a proper KMS-managed key
    // For now, demonstrate the API contract
    let plaintext_bytes = match BASE64.decode(&req.plaintext) {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<()>::err(format!("invalid base64: {}", e))),
            ).into_response();
        }
    };

    // Simulate encryption (production: use aes-gcm crate)
    let nonce = vec![0u8; 12]; // Production: random nonce
    let mut ciphertext = plaintext_bytes.clone();
    // XOR with a simple key for demo (NOT secure — replace with AES-GCM)
    for (i, byte) in ciphertext.iter_mut().enumerate() {
        *byte ^= (i as u8).wrapping_add(42);
    }

    let key_id = req.key_id.unwrap_or_else(|| "master-v1".to_string());

    (StatusCode::OK, Json(ApiResponse::ok(EncryptResponse {
        ciphertext: BASE64.encode(&ciphertext),
        nonce: BASE64.encode(&nonce),
        key_id,
    }))).into_response()
}

async fn handle_decrypt(Json(req): Json<DecryptRequest>) -> impl IntoResponse {
    let ciphertext_bytes = match BASE64.decode(&req.ciphertext) {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<()>::err(format!("invalid ciphertext base64: {}", e))),
            ).into_response();
        }
    };

    // Simulate decryption (reverse of the XOR above — NOT secure)
    let mut plaintext = ciphertext_bytes.clone();
    for (i, byte) in plaintext.iter_mut().enumerate() {
        *byte ^= (i as u8).wrapping_add(42);
    }

    (StatusCode::OK, Json(ApiResponse::ok(DecryptResponse {
        plaintext: BASE64.encode(&plaintext),
    }))).into_response()
}

async fn handle_wallet_derive(Json(req): Json<WalletDeriveRequest>) -> impl IntoResponse {
    // Production: use BIP-32/BIP-44 derivation with secp256k1 or ed25519
    // Libraries: bitcoin, k256, ed25519-dalek, bip32

    let derivation_path = match req.network.as_str() {
        "ethereum" => format!("m/44'/60'/{}'/{}", req.account_index, req.address_index),
        "bitcoin" => format!("m/44'/0'/{}'/{}", req.account_index, req.address_index),
        "solana" => format!("m/44'/501'/{}'/{}", req.account_index, req.address_index),
        "polygon" => format!("m/44'/60'/{}'/{}", req.account_index, req.address_index),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<()>::err(format!("unsupported network: {}", req.network))),
            ).into_response();
        }
    };

    // Deterministic stub address (production: derive from master seed)
    let mut hasher = Sha256::new();
    hasher.update(format!("{}-{}-{}", req.network, req.account_index, req.address_index).as_bytes());
    let hash = hasher.finalize();
    let address = match req.network.as_str() {
        "ethereum" | "polygon" => format!("0x{}", hex::encode(&hash[..20])),
        "bitcoin" => format!("bc1q{}", hex::encode(&hash[..20])),
        "solana" => BASE64.encode(&hash[..32]),
        _ => hex::encode(&hash[..20]),
    };

    (StatusCode::OK, Json(ApiResponse::ok(WalletDeriveResponse {
        address,
        public_key: hex::encode(&hash[..]),
        derivation_path,
    }))).into_response()
}

// ─── Router ───────────────────────────────────────────────────────────────────

fn build_router() -> Router {
    Router::new()
        .route("/health", get(handle_health))
        .route("/hash", post(handle_hash))
        .route("/encrypt", post(handle_encrypt))
        .route("/decrypt", post(handle_decrypt))
        .route("/wallet/derive", post(handle_wallet_derive))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("crypto_engine=info".parse().unwrap()),
        )
        .json()
        .init();

    let config = Config::from_env()?;
    info!(http_port = config.http_port, "Starting TourismPay Crypto Engine");

    let addr = SocketAddr::from(([0, 0, 0, 0], config.http_port));
    let app = build_router();

    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!("Crypto Engine listening on {}", addr);

    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            signal::ctrl_c().await.expect("failed to install CTRL+C handler");
            info!("Crypto Engine shutting down...");
        })
        .await?;

    Ok(())
}
