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
