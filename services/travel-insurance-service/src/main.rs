//! services/travel-insurance-service/src/main.rs
//! TourismPay Travel Insurance Service — Rust/Axum microservice
//!
//! Embedded trip protection and travel insurance
//!
//! HTTP endpoints (port 8100):
//!   POST /insurance/quote — Get trip protection quote
//!   POST /insurance/purchase — Purchase travel insurance policy
//!   GET /insurance/policies/{policy_id} — Get policy details
//!   POST /insurance/claims — File insurance claim
//!   GET /insurance/claims/{claim_id} — Get claim status
//!   GET /insurance/products — List available insurance products
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
        service: "travel-insurance-service".to_string(),
        version: "1.0.0".to_string(),
        timestamp: Utc::now().to_rfc3339(),
    })
}

// ─── Route Handlers ───────────────────────────────────────────────────────────
async fn handle_quote(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "travel-insurance-service",
        "/insurance/quote",
        serde_json::json!({ "message": "Get trip protection quote", "id": Uuid::new_v4().to_string() }),
    ))
}

async fn handle_purchase(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "travel-insurance-service",
        "/insurance/purchase",
        serde_json::json!({ "message": "Purchase travel insurance policy", "id": Uuid::new_v4().to_string() }),
    ))
}

async fn handle_get_policy(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "travel-insurance-service",
        "/insurance/policies/{policy_id}",
        serde_json::json!({ "message": "Get policy details", "id": Uuid::new_v4().to_string() }),
    ))
}

async fn handle_file_claim(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "travel-insurance-service",
        "/insurance/claims",
        serde_json::json!({ "message": "File insurance claim", "id": Uuid::new_v4().to_string() }),
    ))
}

async fn handle_get_claim(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "travel-insurance-service",
        "/insurance/claims/{claim_id}",
        serde_json::json!({ "message": "Get claim status", "id": Uuid::new_v4().to_string() }),
    ))
}

async fn handle_products(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "travel-insurance-service",
        "/insurance/products",
        serde_json::json!({ "message": "List available insurance products", "id": Uuid::new_v4().to_string() }),
    ))
}


// ─── Router ───────────────────────────────────────────────────────────────────

fn build_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(handle_health))
        .route("/insurance/quote", post(handle_quote))
        .route("/insurance/purchase", post(handle_purchase))
        .route("/insurance/policies/{policy_id}", get(handle_get_policy))
        .route("/insurance/claims", post(handle_file_claim))
        .route("/insurance/claims/{claim_id}", get(handle_get_claim))
        .route("/insurance/products", get(handle_products))
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
        .unwrap_or_else(|_| "8100".to_string())
        .parse()
        .unwrap_or(8100);

    let state = Arc::new(AppState::new());
    let app = build_router(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("TourismPay Travel Insurance Service listening on {}", addr);

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
    info!("Shutting down Travel Insurance Service...");
}
