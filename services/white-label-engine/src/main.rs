//! services/white-label-engine/src/main.rs
//! TourismPay White Label Engine — Rust/Axum microservice
//!
//! White-label platform configuration and deployment engine
//!
//! HTTP endpoints (port 8102):
//!   POST /whitelabel/tenants — Create white-label tenant
//!   GET /whitelabel/tenants/{tenant_id} — Get tenant configuration
//!   PUT /whitelabel/tenants/{tenant_id}/branding — Update tenant branding
//!   PUT /whitelabel/tenants/{tenant_id}/corridors — Configure payment corridors
//!   POST /whitelabel/tenants/{tenant_id}/deploy — Deploy white-label instance
//!   GET /whitelabel/tenants/{tenant_id}/status — Get deployment status
//!
//! Middleware: Dapr pub/sub, PostgreSQL, Prometheus metrics

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    routing::{get, post, put},
    Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::{env, net::SocketAddr, sync::Arc};
use tokio::signal;
use tower_http::cors::CorsLayer;
use tracing::{info, warn};
use uuid::Uuid;

// ─── State ────────────────────────────────────────────────────────────────────

#[derive(Clone)]
struct AppState {
    dapr_port: String,
    db_url: String,
}

impl AppState {
    fn new() -> Self {
        Self {
            dapr_port: env::var("DAPR_HTTP_PORT").unwrap_or_else(|_| "3500".to_string()),
            db_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/tourismpay".to_string()),
        }
    }
}

// ─── Response Types ───────────────────────────────────────────────────────────

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    service: String,
    version: String,
    timestamp: String,
}

#[derive(Serialize)]
struct ServiceResponse {
    service: String,
    endpoint: String,
    status: String,
    timestamp: String,
    data: serde_json::Value,
}

impl ServiceResponse {
    fn ok(service: &str, endpoint: &str, data: serde_json::Value) -> Self {
        Self {
            service: service.to_string(),
            endpoint: endpoint.to_string(),
            status: "ok".to_string(),
            timestamp: Utc::now().to_rfc3339(),
            data,
        }
    }
}

// ─── Dapr pub/sub ─────────────────────────────────────────────────────────────

async fn publish_event(dapr_port: &str, topic: &str, data: serde_json::Value) {
    let url = format!("http://localhost:{}/v1.0/publish/tourismpay-pubsub/{}", dapr_port, topic);
    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "data": data,
        "datacontenttype": "application/json"
    });
    if let Err(e) = client.post(&url).json(&payload).send().await {
        warn!("Dapr publish failed topic={}: {}", topic, e);
    }
}

// ─── Health Handler ───────────────────────────────────────────────────────────

async fn handle_health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "healthy".to_string(),
        service: "white-label-engine".to_string(),
        version: "1.0.0".to_string(),
        timestamp: Utc::now().to_rfc3339(),
    })
}

// ─── Route Handlers ───────────────────────────────────────────────────────────
async fn handle_create_tenant(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "white-label-engine",
        "/whitelabel/tenants",
        serde_json::json!({ "message": "Create white-label tenant", "id": Uuid::new_v4().to_string() }),
    ))
}

async fn handle_get_tenant(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "white-label-engine",
        "/whitelabel/tenants/{tenant_id}",
        serde_json::json!({ "message": "Get tenant configuration", "id": Uuid::new_v4().to_string() }),
    ))
}

async fn handle_update_branding(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "white-label-engine",
        "/whitelabel/tenants/{tenant_id}/branding",
        serde_json::json!({ "message": "Update tenant branding", "id": Uuid::new_v4().to_string() }),
    ))
}

async fn handle_update_corridors(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "white-label-engine",
        "/whitelabel/tenants/{tenant_id}/corridors",
        serde_json::json!({ "message": "Configure payment corridors", "id": Uuid::new_v4().to_string() }),
    ))
}

async fn handle_deploy(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "white-label-engine",
        "/whitelabel/tenants/{tenant_id}/deploy",
        serde_json::json!({ "message": "Deploy white-label instance", "id": Uuid::new_v4().to_string() }),
    ))
}

async fn handle_status(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "white-label-engine",
        "/whitelabel/tenants/{tenant_id}/status",
        serde_json::json!({ "message": "Get deployment status", "id": Uuid::new_v4().to_string() }),
    ))
}


// ─── Router ───────────────────────────────────────────────────────────────────

fn build_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(handle_health))
        .route("/whitelabel/tenants", post(handle_create_tenant))
        .route("/whitelabel/tenants/{tenant_id}", get(handle_get_tenant))
        .route("/whitelabel/tenants/{tenant_id}/branding", put(handle_update_branding))
        .route("/whitelabel/tenants/{tenant_id}/corridors", put(handle_update_corridors))
        .route("/whitelabel/tenants/{tenant_id}/deploy", post(handle_deploy))
        .route("/whitelabel/tenants/{tenant_id}/status", get(handle_status))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let _ = dotenv::dotenv();
    let port: u16 = env::var("PORT")
        .unwrap_or_else(|_| "8102".to_string())
        .parse()
        .unwrap_or(8102);

    let state = Arc::new(AppState::new());
    let app = build_router(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("TourismPay White Label Engine listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c().await.expect("failed to install Ctrl+C handler");
    };
    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    info!("Shutting down White Label Engine...");
}
