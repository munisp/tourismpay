//! Permify Authorization Client for the Rust KYC Service
//!
//! Checks document access permissions via Permify's REST API.
//! Falls back to allowing access when Permify is unavailable.

use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::warn;

#[derive(Clone)]
pub struct PermifyClient {
    endpoint: String,
    tenant_id: String,
    api_key: Option<String>,
    http: Client,
}

#[derive(Serialize)]
struct CheckRequest {
    tenant_id: String,
    metadata: CheckMetadata,
    entity: Entity,
    permission: String,
    subject: Subject,
}

#[derive(Serialize)]
struct CheckMetadata {
    depth: i32,
}

#[derive(Serialize)]
struct Entity {
    #[serde(rename = "type")]
    entity_type: String,
    id: String,
}

#[derive(Serialize)]
struct Subject {
    #[serde(rename = "type")]
    subject_type: String,
    id: String,
}

#[derive(Deserialize)]
struct CheckResponse {
    can: String,
}

impl PermifyClient {
    pub fn new() -> Option<Self> {
        let endpoint = std::env::var("PERMIFY_ENDPOINT").ok()?;
        Some(Self {
            endpoint: endpoint.trim_end_matches('/').to_string(),
            tenant_id: std::env::var("PERMIFY_TENANT_ID").unwrap_or_else(|_| "tourismpay".into()),
            api_key: std::env::var("PERMIFY_API_KEY").ok(),
            http: Client::builder()
                .timeout(std::time::Duration::from_secs(5))
                .build()
                .ok()?,
        })
    }

    /// Check if a user has permission on a KYC document.
    pub async fn can_access_document(&self, user_id: &str, document_id: &str) -> bool {
        self.check_permission("document", document_id, "view", "user", user_id).await
    }

    /// Check if a user can perform KYC verification (must be admin or KYC operator).
    pub async fn can_verify_kyc(&self, user_id: &str) -> bool {
        // KYC verification is a global permission — check against the system entity
        self.check_permission("system", "kyc", "verify", "user", user_id).await
    }

    async fn check_permission(
        &self,
        entity_type: &str,
        entity_id: &str,
        permission: &str,
        subject_type: &str,
        subject_id: &str,
    ) -> bool {
        let url = format!(
            "{}/v1/tenants/{}/permissions/check",
            self.endpoint, self.tenant_id
        );

        let req = CheckRequest {
            tenant_id: self.tenant_id.clone(),
            metadata: CheckMetadata { depth: 5 },
            entity: Entity {
                entity_type: entity_type.to_string(),
                id: entity_id.to_string(),
            },
            permission: permission.to_string(),
            subject: Subject {
                subject_type: subject_type.to_string(),
                id: subject_id.to_string(),
            },
        };

        let mut request = self.http.post(&url).json(&req);
        if let Some(ref key) = self.api_key {
            request = request.header("Authorization", format!("Bearer {}", key));
        }

        match request.send().await {
            Ok(resp) => {
                if let Ok(body) = resp.json::<CheckResponse>().await {
                    body.can == "CHECK_RESULT_ALLOWED"
                } else {
                    true // Fallback: allow on parse failure
                }
            }
            Err(e) => {
                warn!("Permify check failed: {} — allowing access", e);
                true // Fallback: allow when Permify is unavailable
            }
        }
    }

    /// Write a relationship (e.g., user owns document).
    pub async fn write_relationship(
        &self,
        entity_type: &str,
        entity_id: &str,
        relation: &str,
        subject_type: &str,
        subject_id: &str,
    ) -> bool {
        let url = format!(
            "{}/v1/tenants/{}/relationships/write",
            self.endpoint, self.tenant_id
        );

        let body = serde_json::json!({
            "metadata": {},
            "tuples": [{
                "entity": { "type": entity_type, "id": entity_id },
                "relation": relation,
                "subject": { "type": subject_type, "id": subject_id }
            }]
        });

        let mut request = self.http.post(&url).json(&body);
        if let Some(ref key) = self.api_key {
            request = request.header("Authorization", format!("Bearer {}", key));
        }

        match request.send().await {
            Ok(resp) => resp.status().is_success(),
            Err(e) => {
                warn!("Permify write failed: {}", e);
                false
            }
        }
    }
}
