use actix_cors::Cors;
use actix_web::{web, App, HttpServer, HttpRequest, HttpResponse, middleware, dev::ServiceRequest, dev::ServiceResponse, Error};
use actix_web::middleware::from_fn;
use chrono::Utc;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

async fn auth_middleware(
    req: ServiceRequest,
    next: actix_web::middleware::Next<impl actix_web::body::MessageBody>,
) -> Result<ServiceResponse<impl actix_web::body::MessageBody>, Error> {
    if req.path() == "/health" {
        return next.call(req).await;
    }
    let has_bearer = req.headers().get("Authorization")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.starts_with("Bearer "))
        .unwrap_or(false);
    let service_key = std::env::var("INTERNAL_SERVICE_KEY").unwrap_or_default();
    let has_service_key = req.headers().get("X-Service-Key")
        .and_then(|v| v.to_str().ok())
        .map(|v| !service_key.is_empty() && v == service_key)
        .unwrap_or(false);
    if !has_bearer && !has_service_key {
        return Ok(req.into_response(
            HttpResponse::Unauthorized().json(serde_json::json!({"error": "missing authorization"}))
        ).map_into_right_body());
    }
    next.call(req).await.map(|res| res.map_into_left_body())
}

mod policy;
mod evaluator;

// ─── Models ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Policy {
    pub id: String,
    pub name: String,
    pub description: String,
    pub effect: PolicyEffect,
    pub subjects: Vec<SubjectMatcher>,
    pub resources: Vec<String>,
    pub actions: Vec<String>,
    pub conditions: Vec<Condition>,
    pub priority: i32,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PolicyEffect {
    Allow,
    Deny,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubjectMatcher {
    #[serde(rename = "type")]
    pub subject_type: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Condition {
    pub field: String,
    pub operator: ConditionOp,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ConditionOp {
    Equals,
    NotEquals,
    GreaterThan,
    LessThan,
    In,
    NotIn,
    Contains,
    StartsWith,
    IpRange,
    TimeRange,
    GeoFence,
}

#[derive(Debug, Deserialize)]
pub struct AccessRequest {
    pub subject: Subject,
    pub resource: String,
    pub action: String,
    pub context: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct Subject {
    pub id: String,
    pub roles: Vec<String>,
    pub attributes: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct AccessDecision {
    pub allowed: bool,
    pub reason: String,
    pub matched_policy: Option<String>,
    pub evaluated_policies: usize,
    pub evaluation_time_us: u128,
    pub audit_id: String,
}

#[derive(Debug, Serialize)]
pub struct AuditEntry {
    pub id: String,
    pub timestamp: String,
    pub subject_id: String,
    pub resource: String,
    pub action: String,
    pub decision: bool,
    pub matched_policy: Option<String>,
    pub ip_address: Option<String>,
}

pub struct AppState {
    pub policies: DashMap<String, Policy>,
    pub audit_log: DashMap<String, AuditEntry>,
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "pbac-engine",
        "version": "1.0.0",
        "timestamp": Utc::now().to_rfc3339(),
    }))
}

async fn check_access(
    state: web::Data<Arc<AppState>>,
    req: HttpRequest,
    body: web::Json<AccessRequest>,
) -> HttpResponse {
    let start = std::time::Instant::now();
    let access_req = body.into_inner();

    let policies: Vec<Policy> = state.policies.iter()
        .filter(|p| p.enabled)
        .map(|p| p.value().clone())
        .collect();

    let (allowed, reason, matched) = evaluator::evaluate(&access_req, &policies);
    let elapsed = start.elapsed().as_micros();

    let audit_id = Uuid::new_v4().to_string();
    let ip = req.peer_addr().map(|a| a.ip().to_string());

    state.audit_log.insert(audit_id.clone(), AuditEntry {
        id: audit_id.clone(),
        timestamp: Utc::now().to_rfc3339(),
        subject_id: access_req.subject.id.clone(),
        resource: access_req.resource.clone(),
        action: access_req.action.clone(),
        decision: allowed,
        matched_policy: matched.clone(),
        ip_address: ip,
    });

    HttpResponse::Ok().json(AccessDecision {
        allowed,
        reason,
        matched_policy: matched,
        evaluated_policies: policies.len(),
        evaluation_time_us: elapsed,
        audit_id,
    })
}

async fn list_policies(state: web::Data<Arc<AppState>>) -> HttpResponse {
    let policies: Vec<Policy> = state.policies.iter()
        .map(|p| p.value().clone())
        .collect();
    HttpResponse::Ok().json(serde_json::json!({ "policies": policies, "total": policies.len() }))
}

async fn create_policy(
    state: web::Data<Arc<AppState>>,
    body: web::Json<Policy>,
) -> HttpResponse {
    let mut policy = body.into_inner();
    if policy.id.is_empty() {
        policy.id = Uuid::new_v4().to_string();
    }
    policy.created_at = Utc::now().to_rfc3339();
    policy.updated_at = policy.created_at.clone();
    let id = policy.id.clone();
    state.policies.insert(id.clone(), policy.clone());
    HttpResponse::Created().json(policy)
}

async fn update_policy(
    state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    body: web::Json<Policy>,
) -> HttpResponse {
    let id = path.into_inner();
    if !state.policies.contains_key(&id) {
        return HttpResponse::NotFound().json(serde_json::json!({"error": "Policy not found"}));
    }
    let mut policy = body.into_inner();
    policy.id = id.clone();
    policy.updated_at = Utc::now().to_rfc3339();
    state.policies.insert(id, policy.clone());
    HttpResponse::Ok().json(policy)
}

async fn delete_policy(
    state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
) -> HttpResponse {
    let id = path.into_inner();
    state.policies.remove(&id);
    HttpResponse::Ok().json(serde_json::json!({"success": true}))
}

async fn get_audit_log(state: web::Data<Arc<AppState>>) -> HttpResponse {
    let entries: Vec<AuditEntry> = state.audit_log.iter()
        .map(|e| AuditEntry {
            id: e.id.clone(),
            timestamp: e.timestamp.clone(),
            subject_id: e.subject_id.clone(),
            resource: e.resource.clone(),
            action: e.action.clone(),
            decision: e.decision,
            matched_policy: e.matched_policy.clone(),
            ip_address: e.ip_address.clone(),
        })
        .collect();
    HttpResponse::Ok().json(serde_json::json!({ "entries": entries, "total": entries.len() }))
}

async fn seed_default_policies(state: web::Data<Arc<AppState>>) -> HttpResponse {
    let defaults = policy::default_tourism_policies();
    let count = defaults.len();
    for p in defaults {
        state.policies.insert(p.id.clone(), p);
    }
    HttpResponse::Ok().json(serde_json::json!({ "seeded": count }))
}

// ─── Main ────────────────────────────────────────────────────────────────────

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt::init();

    let port: u16 = std::env::var("PORT").unwrap_or_else(|_| "8090".to_string())
        .parse().unwrap_or(8090);

    let state = Arc::new(AppState {
        policies: DashMap::new(),
        audit_log: DashMap::new(),
    });

    // Seed default policies on startup
    let defaults = policy::default_tourism_policies();
    for p in defaults {
        state.policies.insert(p.id.clone(), p);
    }
    tracing::info!("PBAC engine starting on port {port} with {} default policies", state.policies.len());

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(state.clone()))
            .wrap(Cors::permissive())
            .wrap(from_fn(auth_middleware))
            .route("/health", web::get().to(health))
            .route("/api/v1/access/check", web::post().to(check_access))
            .route("/api/v1/policies", web::get().to(list_policies))
            .route("/api/v1/policies", web::post().to(create_policy))
            .route("/api/v1/policies/{id}", web::put().to(update_policy))
            .route("/api/v1/policies/{id}", web::delete().to(delete_policy))
            .route("/api/v1/audit", web::get().to(get_audit_log))
            .route("/api/v1/seed", web::post().to(seed_default_policies))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
