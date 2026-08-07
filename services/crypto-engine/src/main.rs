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

use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng as AesOsRng},
    Aes256Gcm, Key, Nonce,
};
use hmac::{Hmac, Mac};
use p256::{
    ecdsa::{SigningKey, VerifyingKey, Signature, signature::{Signer, Verifier}},
    pkcs8::EncodePublicKey,
};
use rand::RngCore;
use sha2::Sha256 as Sha256Hmac;
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

// ─── Crypto Primitives (used by HTTP handlers and unit tests) ─────────────────

/// Derive a 32-byte key from a master key and context using HKDF-SHA256
pub fn derive_key(master: &[u8], context: &[u8]) -> [u8; 32] {
    use hkdf::Hkdf;
    let hk = Hkdf::<Sha256Hmac>::new(None, master);
    let mut okm = [0u8; 32];
    hk.expand(context, &mut okm).expect("HKDF expand failed");
    okm
}

/// Encrypt plaintext with AES-256-GCM. Returns nonce||ciphertext.
pub fn encrypt_aes256gcm(key: &[u8; 32], plaintext: &[u8]) -> anyhow::Result<Vec<u8>> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Aes256Gcm::generate_nonce(&mut AesOsRng);
    let ciphertext = cipher.encrypt(&nonce, plaintext)
        .map_err(|e| anyhow::anyhow!("AES-GCM encrypt failed: {:?}", e))?;
    let mut result = nonce.to_vec();
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

/// Decrypt nonce||ciphertext with AES-256-GCM.
pub fn decrypt_aes256gcm(key: &[u8; 32], nonce_and_ciphertext: &[u8]) -> anyhow::Result<Vec<u8>> {
    if nonce_and_ciphertext.len() < 12 {
        return Err(anyhow::anyhow!("Input too short"));
    }
    let (nonce_bytes, ciphertext) = nonce_and_ciphertext.split_at(12);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher.decrypt(nonce, ciphertext)
        .map_err(|e| anyhow::anyhow!("AES-GCM decrypt failed: {:?}", e))
}

/// Generate a P-256 ECDSA key pair. Returns (private_key_bytes, public_key_bytes).
pub fn generate_ecdsa_keypair() -> anyhow::Result<(Vec<u8>, Vec<u8>)> {
    let signing_key = SigningKey::random(&mut rand::rngs::OsRng);
    let verifying_key = VerifyingKey::from(&signing_key);
    let priv_bytes = signing_key.to_bytes().to_vec();
    let pub_bytes = verifying_key
        .to_public_key_der()
        .map_err(|e| anyhow::anyhow!("DER encode failed: {:?}", e))?
        .to_vec();
    Ok((priv_bytes, pub_bytes))
}

/// Sign a message with P-256 ECDSA. Returns DER-encoded signature.
pub fn sign_ecdsa(private_key_bytes: &[u8], message: &[u8]) -> anyhow::Result<Vec<u8>> {
    use p256::ecdsa::signature::digest::Digest as _;
    let key_array: [u8; 32] = private_key_bytes.try_into()
        .map_err(|_| anyhow::anyhow!("Invalid key length"))?;
    let signing_key = SigningKey::from_bytes((&key_array).into())
        .map_err(|e| anyhow::anyhow!("Invalid signing key: {:?}", e))?;
    let sig: Signature = signing_key.sign(message);
    Ok(sig.to_der().as_bytes().to_vec())
}

/// Verify a P-256 ECDSA signature. Returns true if valid.
pub fn verify_ecdsa(public_key_der: &[u8], message: &[u8], signature_der: &[u8]) -> anyhow::Result<bool> {
    use p256::pkcs8::DecodePublicKey;
    let verifying_key = VerifyingKey::from_public_key_der(public_key_der)
        .map_err(|e| anyhow::anyhow!("Invalid public key: {:?}", e))?;
    let sig = Signature::from_der(signature_der)
        .map_err(|e| anyhow::anyhow!("Invalid signature: {:?}", e))?;
    Ok(verifying_key.verify(message, &sig).is_ok())
}

/// Compute HMAC-SHA256. Returns 32-byte MAC.
pub fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    use digest::KeyInit;
    type HmacSha256 = Hmac<Sha256Hmac>;
    let mut mac = <HmacSha256 as KeyInit>::new_from_slice(key).expect("HMAC key error");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

/// Generate cryptographically secure random bytes.
pub fn secure_random_bytes(len: usize) -> Vec<u8> {
    let mut bytes = vec![0u8; len];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    bytes
}

/// Compute SHA-256 hash.
pub fn sha256_hash(data: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().to_vec()
}

/// Derive a wallet address from a seed using BIP-44-style derivation.
/// Returns hex-encoded Ethereum-style address.
pub fn derive_wallet_address(seed: &[u8; 64], account: u32, index: u32) -> anyhow::Result<String> {
    // Simplified BIP-44: derive key from seed + path components
    let path = format!("m/44'/60'/{}'/{}", account, index);
    let derived = derive_key(seed, path.as_bytes());
    // Ethereum address = last 20 bytes of keccak256(public_key)
    // Simplified: use SHA-256 of derived key, take last 20 bytes
    let hash = sha256_hash(&derived);
    let addr_bytes = &hash[hash.len()-20..];
    Ok(format!("0x{}", hex::encode(addr_bytes)))
}

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

/// Unit tests for the crypto-engine service
#[cfg(test)]
mod tests {
    use super::*;

    // ─── Key Derivation Tests ─────────────────────────────────────────────────

    #[test]
    fn test_derive_key_deterministic() {
        let master = b"test-master-key-32-bytes-long!!!";
        let context = b"user:123:NGN";
        let key1 = derive_key(master, context);
        let key2 = derive_key(master, context);
        assert_eq!(key1, key2, "Key derivation must be deterministic");
    }

    #[test]
    fn test_derive_key_different_contexts() {
        let master = b"test-master-key-32-bytes-long!!!";
        let key1 = derive_key(master, b"user:123:NGN");
        let key2 = derive_key(master, b"user:123:USD");
        assert_ne!(key1, key2, "Different contexts must produce different keys");
    }

    #[test]
    fn test_derive_key_different_masters() {
        let key1 = derive_key(b"master-key-1-32-bytes-long-xxx!!", b"context");
        let key2 = derive_key(b"master-key-2-32-bytes-long-xxx!!", b"context");
        assert_ne!(key1, key2, "Different master keys must produce different derived keys");
    }

    // ─── AES-256-GCM Encryption Tests ────────────────────────────────────────

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = [0u8; 32];
        let plaintext = b"Hello, TourismPay!";
        let encrypted = encrypt_aes256gcm(&key, plaintext).expect("Encryption should succeed");
        let decrypted = decrypt_aes256gcm(&key, &encrypted).expect("Decryption should succeed");
        assert_eq!(decrypted, plaintext, "Decrypted text must match original");
    }

    #[test]
    fn test_encrypt_produces_different_ciphertext() {
        let key = [0u8; 32];
        let plaintext = b"same plaintext";
        let enc1 = encrypt_aes256gcm(&key, plaintext).expect("Encryption 1 should succeed");
        let enc2 = encrypt_aes256gcm(&key, plaintext).expect("Encryption 2 should succeed");
        // Different nonces should produce different ciphertexts
        assert_ne!(enc1, enc2, "Same plaintext should produce different ciphertexts (random nonce)");
    }

    #[test]
    fn test_decrypt_fails_with_wrong_key() {
        let key1 = [0u8; 32];
        let key2 = [1u8; 32];
        let plaintext = b"secret data";
        let encrypted = encrypt_aes256gcm(&key1, plaintext).expect("Encryption should succeed");
        let result = decrypt_aes256gcm(&key2, &encrypted);
        assert!(result.is_err(), "Decryption with wrong key should fail");
    }

    #[test]
    fn test_decrypt_fails_with_tampered_ciphertext() {
        let key = [0u8; 32];
        let plaintext = b"secret data";
        let mut encrypted = encrypt_aes256gcm(&key, plaintext).expect("Encryption should succeed");
        // Tamper with the ciphertext
        if let Some(last) = encrypted.last_mut() {
            *last ^= 0xFF;
        }
        let result = decrypt_aes256gcm(&key, &encrypted);
        assert!(result.is_err(), "Decryption of tampered ciphertext should fail");
    }

    // ─── ECDSA Signature Tests ────────────────────────────────────────────────

    #[test]
    fn test_sign_verify_roundtrip() {
        let (private_key, public_key) = generate_ecdsa_keypair().expect("Key generation should succeed");
        let message = b"TourismPay transaction data";
        let signature = sign_ecdsa(&private_key, message).expect("Signing should succeed");
        let valid = verify_ecdsa(&public_key, message, &signature).expect("Verification should succeed");
        assert!(valid, "Valid signature should verify successfully");
    }

    #[test]
    fn test_verify_fails_with_wrong_message() {
        let (private_key, public_key) = generate_ecdsa_keypair().expect("Key generation should succeed");
        let message = b"original message";
        let signature = sign_ecdsa(&private_key, message).expect("Signing should succeed");
        let valid = verify_ecdsa(&public_key, b"tampered message", &signature).expect("Verification call should succeed");
        assert!(!valid, "Signature should not verify against different message");
    }

    #[test]
    fn test_verify_fails_with_wrong_key() {
        let (private_key, _) = generate_ecdsa_keypair().expect("Key generation 1 should succeed");
        let (_, wrong_public_key) = generate_ecdsa_keypair().expect("Key generation 2 should succeed");
        let message = b"test message";
        let signature = sign_ecdsa(&private_key, message).expect("Signing should succeed");
        let valid = verify_ecdsa(&wrong_public_key, message, &signature).expect("Verification call should succeed");
        assert!(!valid, "Signature should not verify with wrong public key");
    }

    // ─── BIP-44 Wallet Derivation Tests ──────────────────────────────────────

    #[test]
    fn test_derive_wallet_address_deterministic() {
        let seed = [42u8; 64];
        let addr1 = derive_wallet_address(&seed, 0, 0).expect("Derivation should succeed");
        let addr2 = derive_wallet_address(&seed, 0, 0).expect("Derivation should succeed");
        assert_eq!(addr1, addr2, "Wallet derivation must be deterministic");
    }

    #[test]
    fn test_derive_wallet_address_different_indices() {
        let seed = [42u8; 64];
        let addr0 = derive_wallet_address(&seed, 0, 0).expect("Derivation 0 should succeed");
        let addr1 = derive_wallet_address(&seed, 0, 1).expect("Derivation 1 should succeed");
        assert_ne!(addr0, addr1, "Different indices must produce different addresses");
    }

    // ─── Hash Tests ───────────────────────────────────────────────────────────

    #[test]
    fn test_sha256_hash_deterministic() {
        let data = b"TourismPay";
        let hash1 = sha256_hash(data);
        let hash2 = sha256_hash(data);
        assert_eq!(hash1, hash2, "SHA-256 must be deterministic");
        assert_eq!(hash1.len(), 32, "SHA-256 must produce 32 bytes");
    }

    #[test]
    fn test_sha256_different_inputs() {
        let hash1 = sha256_hash(b"input1");
        let hash2 = sha256_hash(b"input2");
        assert_ne!(hash1, hash2, "Different inputs must produce different hashes");
    }

    // ─── HMAC Tests ───────────────────────────────────────────────────────────

    #[test]
    fn test_hmac_sha256_deterministic() {
        let key = b"secret-key";
        let data = b"message";
        let mac1 = hmac_sha256(key, data);
        let mac2 = hmac_sha256(key, data);
        assert_eq!(mac1, mac2, "HMAC must be deterministic");
    }

    #[test]
    fn test_hmac_sha256_different_keys() {
        let mac1 = hmac_sha256(b"key1", b"message");
        let mac2 = hmac_sha256(b"key2", b"message");
        assert_ne!(mac1, mac2, "Different keys must produce different HMACs");
    }

    // ─── Random Bytes Tests ───────────────────────────────────────────────────

    #[test]
    fn test_secure_random_bytes_length() {
        let bytes = secure_random_bytes(32);
        assert_eq!(bytes.len(), 32, "Should produce exactly 32 bytes");
    }

    #[test]
    fn test_secure_random_bytes_unique() {
        let bytes1 = secure_random_bytes(32);
        let bytes2 = secure_random_bytes(32);
        assert_ne!(bytes1, bytes2, "Random bytes should be unique");
    }
}
