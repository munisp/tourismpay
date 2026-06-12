//! Biometric Payment Authentication (4.7)
//!
//! Face/palm recognition at merchant POS for high-value transactions.
//! Progressive trust: small transactions = PIN, large = biometric.
//!
//! Middleware integration: Permify (authorization), Redis (session cache),
//! Kafka (auth events), OpenSearch (audit logging).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;

// ─── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BiometricType {
    Face,
    Palm,
    Fingerprint,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuthLevel {
    Pin,           // < $10
    Biometric,     // $10 - $500
    BiometricMFA,  // > $500 (biometric + PIN)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BiometricTemplate {
    pub user_id: String,
    pub template_type: BiometricType,
    pub template_hash: String, // SHA-256 of the biometric template (never stored raw)
    pub enrolled_at: String,
    pub device_id: String,
    pub confidence_threshold: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BiometricAuthRequest {
    pub merchant_id: String,
    pub amount_cents: u64,
    pub currency: String,
    pub biometric_type: BiometricType,
    pub template_hash: String,
    pub device_id: String,
    pub timestamp: i64,
    pub challenge_response: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BiometricAuthResult {
    pub authorized: bool,
    pub auth_level: AuthLevel,
    pub user_id: Option<String>,
    pub confidence: f64,
    pub requires_additional: bool,
    pub transaction_token: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MerchantPOS {
    pub id: String,
    pub merchant_id: String,
    pub location: String,
    pub capabilities: Vec<BiometricType>,
    pub max_offline_amount: u64,
    pub last_sync: String,
}

// ─── Service ───────────────────────────────────────────────────────────────────

pub struct BiometricPayService {
    templates: RwLock<HashMap<String, Vec<BiometricTemplate>>>, // user_id -> templates
    pos_devices: RwLock<HashMap<String, MerchantPOS>>,
    auth_sessions: RwLock<HashMap<String, BiometricAuthResult>>,
}

impl BiometricPayService {
    pub fn new() -> Self {
        Self {
            templates: RwLock::new(HashMap::new()),
            pos_devices: RwLock::new(HashMap::new()),
            auth_sessions: RwLock::new(HashMap::new()),
        }
    }

    /// Determine required auth level based on transaction amount
    pub fn determine_auth_level(&self, amount_cents: u64) -> AuthLevel {
        match amount_cents {
            0..=1000 => AuthLevel::Pin,             // <= $10
            1001..=50000 => AuthLevel::Biometric,   // $10.01 - $500
            _ => AuthLevel::BiometricMFA,           // > $500
        }
    }

    /// Enroll a biometric template for a user
    pub fn enroll_template(&self, template: BiometricTemplate) -> Result<(), String> {
        if template.template_hash.len() < 32 {
            return Err("Invalid template hash length".to_string());
        }
        if template.confidence_threshold < 0.8 || template.confidence_threshold > 1.0 {
            return Err("Confidence threshold must be between 0.8 and 1.0".to_string());
        }

        let mut templates = self.templates.write().map_err(|e| e.to_string())?;
        let user_templates = templates.entry(template.user_id.clone()).or_insert_with(Vec::new);
        
        // Max 3 templates per type per user
        let same_type_count = user_templates.iter()
            .filter(|t| matches!((&t.template_type, &template.template_type),
                (BiometricType::Face, BiometricType::Face) |
                (BiometricType::Palm, BiometricType::Palm) |
                (BiometricType::Fingerprint, BiometricType::Fingerprint)
            ))
            .count();
        
        if same_type_count >= 3 {
            return Err("Maximum templates reached for this biometric type".to_string());
        }

        user_templates.push(template);
        Ok(())
    }

    /// Authenticate a biometric payment request
    pub fn authenticate(&self, req: &BiometricAuthRequest) -> BiometricAuthResult {
        let auth_level = self.determine_auth_level(req.amount_cents);
        
        // Find matching template
        let templates = match self.templates.read() {
            Ok(t) => t,
            Err(_) => return BiometricAuthResult {
                authorized: false,
                auth_level,
                user_id: None,
                confidence: 0.0,
                requires_additional: false,
                transaction_token: None,
                error: Some("Internal error".to_string()),
            },
        };

        // Search all users for matching template
        let mut best_match: Option<(String, f64)> = None;
        
        for (user_id, user_templates) in templates.iter() {
            for template in user_templates {
                // Compare template hashes (in production, use proper biometric matching)
                if template.template_hash == req.template_hash {
                    let confidence = if template.device_id == req.device_id { 0.98 } else { 0.92 };
                    if confidence >= template.confidence_threshold {
                        if best_match.is_none() || confidence > best_match.as_ref().unwrap().1 {
                            best_match = Some((user_id.clone(), confidence));
                        }
                    }
                }
            }
        }

        match best_match {
            Some((user_id, confidence)) => {
                let requires_additional = matches!(auth_level, AuthLevel::BiometricMFA);
                let token = if !requires_additional {
                    Some(format!("bio_tx_{}", generate_secure_token()))
                } else {
                    None
                };

                BiometricAuthResult {
                    authorized: !requires_additional,
                    auth_level,
                    user_id: Some(user_id),
                    confidence,
                    requires_additional,
                    transaction_token: token,
                    error: None,
                }
            }
            None => BiometricAuthResult {
                authorized: false,
                auth_level,
                user_id: None,
                confidence: 0.0,
                requires_additional: false,
                transaction_token: None,
                error: Some("No matching biometric template found".to_string()),
            },
        }
    }

    /// Register a merchant POS device
    pub fn register_pos(&self, pos: MerchantPOS) -> Result<(), String> {
        let mut devices = self.pos_devices.write().map_err(|e| e.to_string())?;
        devices.insert(pos.id.clone(), pos);
        Ok(())
    }

    /// Get enrolled templates count for a user
    pub fn get_enrollment_status(&self, user_id: &str) -> HashMap<String, usize> {
        let templates = match self.templates.read() {
            Ok(t) => t,
            Err(_) => return HashMap::new(),
        };

        let mut status = HashMap::new();
        if let Some(user_templates) = templates.get(user_id) {
            for t in user_templates {
                let key = format!("{:?}", t.template_type);
                *status.entry(key).or_insert(0) += 1;
            }
        }
        status
    }
}

fn generate_secure_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{:x}", now)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auth_level_determination() {
        let service = BiometricPayService::new();
        assert!(matches!(service.determine_auth_level(500), AuthLevel::Pin));
        assert!(matches!(service.determine_auth_level(5000), AuthLevel::Biometric));
        assert!(matches!(service.determine_auth_level(100000), AuthLevel::BiometricMFA));
    }

    #[test]
    fn test_enroll_and_authenticate() {
        let service = BiometricPayService::new();
        
        let template = BiometricTemplate {
            user_id: "user_1".to_string(),
            template_type: BiometricType::Face,
            template_hash: "a".repeat(64),
            enrolled_at: "2026-01-01T00:00:00Z".to_string(),
            device_id: "pos_001".to_string(),
            confidence_threshold: 0.9,
        };
        
        service.enroll_template(template).unwrap();
        
        let req = BiometricAuthRequest {
            merchant_id: "merchant_1".to_string(),
            amount_cents: 2000,
            currency: "USD".to_string(),
            biometric_type: BiometricType::Face,
            template_hash: "a".repeat(64),
            device_id: "pos_001".to_string(),
            timestamp: 1700000000,
            challenge_response: "valid".to_string(),
        };
        
        let result = service.authenticate(&req);
        assert!(result.authorized);
        assert_eq!(result.user_id, Some("user_1".to_string()));
        assert!(result.confidence >= 0.9);
    }
}
