//! services/diaspora-gift-service/src/main.rs
//! TourismPay Diaspora Gift Service — Rust/Axum microservice
//!
//! Gift tourism and pre-paid booking service for diaspora
//!
//! HTTP endpoints (port 8101):
//!   POST /gifts/create — Create gift booking/card
//!   GET /gifts/{gift_id} — Get gift details
//!   POST /gifts/{gift_id}/redeem — Redeem gift at establishment
//!   GET /gifts/sender/{sender_id} — List gifts sent by user
//!   GET /gifts/recipient/{recipient_id} — List gifts received
//!   POST /gifts/{gift_id}/notify — Send gift notification
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
        service: "diaspora-gift-service".to_string(),
        version: "1.0.0".to_string(),
        timestamp: Utc::now().to_rfc3339(),
    })
}

// ─── Route Handlers ───────────────────────────────────────────────────────────
async fn handle_create_gift(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "diaspora-gift-service",
        "/gifts/create",
        serde_json::json!({ "message": "Create gift booking/card", "id": Uuid::new_v4().to_string() }),
    ))
}

async fn handle_get_gift(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "diaspora-gift-service",
        "/gifts/{gift_id}",
        serde_json::json!({ "message": "Get gift details", "id": Uuid::new_v4().to_string() }),
    ))
}

async fn handle_redeem_gift(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "diaspora-gift-service",
        "/gifts/{gift_id}/redeem",
        serde_json::json!({ "message": "Redeem gift at establishment", "id": Uuid::new_v4().to_string() }),
    ))
}

async fn handle_sender_gifts(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "diaspora-gift-service",
        "/gifts/sender/{sender_id}",
        serde_json::json!({ "message": "List gifts sent by user", "id": Uuid::new_v4().to_string() }),
    ))
}

async fn handle_recipient_gifts(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "diaspora-gift-service",
        "/gifts/recipient/{recipient_id}",
        serde_json::json!({ "message": "List gifts received", "id": Uuid::new_v4().to_string() }),
    ))
}

async fn handle_notify(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "diaspora-gift-service",
        "/gifts/{gift_id}/notify",
        serde_json::json!({ "message": "Send gift notification", "id": Uuid::new_v4().to_string() }),
    ))
}


// ─── Router ───────────────────────────────────────────────────────────────────

fn build_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(handle_health))
        .route("/gifts/create", post(handle_create_gift))
        .route("/gifts/{gift_id}", get(handle_get_gift))
        .route("/gifts/{gift_id}/redeem", post(handle_redeem_gift))
        .route("/gifts/sender/{sender_id}", get(handle_sender_gifts))
        .route("/gifts/recipient/{recipient_id}", get(handle_recipient_gifts))
        .route("/gifts/{gift_id}/notify", post(handle_notify))
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
        .unwrap_or_else(|_| "8101".to_string())
        .parse()
        .unwrap_or(8101);

    let state = Arc::new(AppState::new());
    let app = build_router(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("TourismPay Diaspora Gift Service listening on {}", addr);

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
    info!("Shutting down Diaspora Gift Service...");
}
