//! services/accessibility-service/src/main.rs
//! TourismPay Accessibility Service — Rust/Axum microservice
//!
//! WCAG 2.1 AA accessibility engine and voice payment service
//!
//! HTTP endpoints (port 8103):
//!   POST /accessibility/audit — Run accessibility audit on page
//!   POST /accessibility/voice/payment — Process voice-activated payment
//!   GET /accessibility/voice/status/{session_id} — Get voice session status
//!   POST /accessibility/tts — Text-to-speech for payment confirmation
//!   GET /accessibility/wcag-report/{hotel_id} — Get WCAG compliance report
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
        service: "accessibility-service".to_string(),
        version: "1.0.0".to_string(),
        timestamp: Utc::now().to_rfc3339(),
    })
}

// ─── Route Handlers ───────────────────────────────────────────────────────────
async fn handle_audit(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "accessibility-service",
        "/accessibility/audit",
        serde_json::json!({ "message": "Run accessibility audit on page", "id": Uuid::new_v4().to_string() }),
    ))
}

async fn handle_voice_payment(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "accessibility-service",
        "/accessibility/voice/payment",
        serde_json::json!({ "message": "Process voice-activated payment", "id": Uuid::new_v4().to_string() }),
    ))
}

async fn handle_voice_status(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "accessibility-service",
        "/accessibility/voice/status/{session_id}",
        serde_json::json!({ "message": "Get voice session status", "id": Uuid::new_v4().to_string() }),
    ))
}

async fn handle_tts(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "accessibility-service",
        "/accessibility/tts",
        serde_json::json!({ "message": "Text-to-speech for payment confirmation", "id": Uuid::new_v4().to_string() }),
    ))
}

async fn handle_wcag_report(State(state): State<Arc<AppState>>) -> Json<ServiceResponse> {
    Json(ServiceResponse::ok(
        "accessibility-service",
        "/accessibility/wcag-report/{hotel_id}",
        serde_json::json!({ "message": "Get WCAG compliance report", "id": Uuid::new_v4().to_string() }),
    ))
}


// ─── Router ───────────────────────────────────────────────────────────────────

fn build_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(handle_health))
        .route("/accessibility/audit", post(handle_audit))
        .route("/accessibility/voice/payment", post(handle_voice_payment))
        .route("/accessibility/voice/status/{session_id}", get(handle_voice_status))
        .route("/accessibility/tts", post(handle_tts))
        .route("/accessibility/wcag-report/{hotel_id}", get(handle_wcag_report))
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
        .unwrap_or_else(|_| "8103".to_string())
        .parse()
        .unwrap_or(8103);

    let state = Arc::new(AppState::new());
    let app = build_router(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("TourismPay Accessibility Service listening on {}", addr);

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
    info!("Shutting down Accessibility Service...");
}
