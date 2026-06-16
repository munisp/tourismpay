use ring::digest;
use ring::rand::{SecureRandom, SystemRandom};

/// Hash a document number for storage (never store plaintext PII)
pub fn hash_document_number(doc_number: &str) -> String {
    let hash = digest::digest(&digest::SHA256, doc_number.as_bytes());
    hex::encode(hash.as_ref())
}

/// Compute liveness score based on challenge responses and anti-spoofing signals
pub fn compute_liveness_score(
    method: &str,
    anti_spoofing_score: f64,
    challenge_count: usize,
    successful_challenges: usize,
) -> (f64, bool) {
    let base_score = match method {
        "video_selfie" => 0.85,
        "active_challenge" => 0.80,
        "motion_detection" => 0.75,
        "passive_photo" => 0.60,
        _ => 0.50,
    };

    let challenge_factor = if challenge_count > 0 {
        successful_challenges as f64 / challenge_count as f64
    } else {
        1.0
    };

    let final_score = (base_score * 0.4) + (anti_spoofing_score * 0.4) + (challenge_factor * 0.2);
    let passed = final_score >= 0.70;

    (final_score, passed)
}

/// Compute document match score between selfie and ID photo
pub fn compute_document_match_score(
    selfie_embedding: &[f64],
    document_embedding: &[f64],
) -> f64 {
    if selfie_embedding.len() != document_embedding.len() || selfie_embedding.is_empty() {
        return 0.0;
    }

    // Cosine similarity
    let dot: f64 = selfie_embedding.iter().zip(document_embedding.iter()).map(|(a, b)| a * b).sum();
    let mag_a: f64 = selfie_embedding.iter().map(|x| x * x).sum::<f64>().sqrt();
    let mag_b: f64 = document_embedding.iter().map(|x| x * x).sum::<f64>().sqrt();

    if mag_a == 0.0 || mag_b == 0.0 {
        return 0.0;
    }

    (dot / (mag_a * mag_b)).max(0.0).min(1.0)
}

/// Compute overall risk score combining all verification signals
pub fn compute_risk_score(
    liveness_score: f64,
    document_match_score: f64,
    sanctions_clear: bool,
    pep_clear: bool,
    country_risk_level: &str,
) -> (f64, String) {
    let liveness_weight = 0.30;
    let doc_match_weight = 0.30;
    let sanctions_weight = 0.25;
    let country_weight = 0.15;

    let sanctions_score = if sanctions_clear && pep_clear {
        1.0
    } else if sanctions_clear {
        0.7
    } else {
        0.0
    };

    let country_score = match country_risk_level {
        "low" => 1.0,
        "medium" => 0.7,
        "high" => 0.3,
        "very_high" => 0.1,
        _ => 0.5,
    };

    let overall = (liveness_score * liveness_weight)
        + (document_match_score * doc_match_weight)
        + (sanctions_score * sanctions_weight)
        + (country_score * country_weight);

    let risk_level = if overall >= 0.80 {
        "low"
    } else if overall >= 0.60 {
        "medium"
    } else if overall >= 0.40 {
        "high"
    } else {
        "very_high"
    };

    (overall, risk_level.to_string())
}

/// Generate a cryptographically secure challenge nonce
pub fn generate_challenge_nonce() -> String {
    let rng = SystemRandom::new();
    let mut buf = [0u8; 32];
    rng.fill(&mut buf).expect("RNG failure");
    hex::encode(&buf)
}

// Re-export hex for document hashing
mod hex {
    pub fn encode(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{:02x}", b)).collect()
    }
}
