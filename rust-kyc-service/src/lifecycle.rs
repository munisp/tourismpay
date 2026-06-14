//! Process lifecycle management for the Rust KYC service.
//!
//! Provides:
//! - Graceful shutdown via SIGTERM/SIGINT (tokio::signal)
//! - Panic hook that logs stack traces as structured JSON for OpenSearch
//! - Liveness probe (`/livez`) — process is alive, not deadlocked
//! - Readiness probe (`/readyz`) — ready to accept traffic
//! - Prometheus metrics endpoint (`/metrics`)
//! - In-flight request tracking for graceful drain

use actix_web::{web, HttpRequest, HttpResponse};
use serde_json::json;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

// ─── Global State ─────────────────────────────────────────────────────────────

static READY: AtomicBool = AtomicBool::new(false);
static ALIVE: AtomicBool = AtomicBool::new(true);
static IN_FLIGHT: AtomicI64 = AtomicI64::new(0);
static START_TIME: AtomicU64 = AtomicU64::new(0);

// Metrics
static HTTP_REQUESTS_TOTAL: AtomicU64 = AtomicU64::new(0);
static HTTP_ERRORS_TOTAL: AtomicU64 = AtomicU64::new(0);
static PANICS_RECOVERED: AtomicU64 = AtomicU64::new(0);
static SHUTDOWNS_TOTAL: AtomicU64 = AtomicU64::new(0);

struct RequestDurations {
    durations: Mutex<Vec<f64>>,
}

impl RequestDurations {
    fn observe(&self, duration_secs: f64) {
        if let Ok(mut d) = self.durations.lock() {
            d.push(duration_secs);
            if d.len() > 10000 {
                d.drain(..5000);
            }
        }
    }
    fn snapshot(&self) -> Vec<f64> {
        self.durations.lock().map(|d| d.clone()).unwrap_or_default()
    }
}

static REQUEST_DURATIONS: std::sync::LazyLock<RequestDurations> =
    std::sync::LazyLock::new(|| RequestDurations {
        durations: Mutex::new(Vec::new()),
    });

// ─── Init ─────────────────────────────────────────────────────────────────────

pub fn init_lifecycle() {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    START_TIME.store(now, Ordering::Relaxed);

    // Install panic hook that emits structured JSON to stderr
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        PANICS_RECOVERED.fetch_add(1, Ordering::Relaxed);

        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "unknown panic".to_string()
        };

        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".to_string());

        let event = json!({
            "level": "CRITICAL",
            "event": "panic_recovered",
            "service": "kyc-service",
            "error": payload,
            "location": location,
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "pod_name": std::env::var("POD_NAME").unwrap_or_default(),
        });
        eprintln!("{}", event);

        default_hook(info);
    }));

    tracing::info!("[LIFECYCLE] Panic hook installed, metrics initialized");
}

pub fn set_ready(val: bool) {
    READY.store(val, Ordering::SeqCst);
}

#[allow(dead_code)]
pub fn is_ready() -> bool {
    READY.load(Ordering::SeqCst)
}

// ─── Request Tracking ─────────────────────────────────────────────────────────

#[allow(dead_code)]
pub fn track_request_start() {
    IN_FLIGHT.fetch_add(1, Ordering::Relaxed);
    HTTP_REQUESTS_TOTAL.fetch_add(1, Ordering::Relaxed);
}

#[allow(dead_code)]
pub fn track_request_end(duration_secs: f64, is_error: bool) {
    IN_FLIGHT.fetch_sub(1, Ordering::Relaxed);
    REQUEST_DURATIONS.observe(duration_secs);
    if is_error {
        HTTP_ERRORS_TOTAL.fetch_add(1, Ordering::Relaxed);
    }
}

// ─── Probe Handlers ───────────────────────────────────────────────────────────

pub async fn livez_handler(_req: HttpRequest) -> HttpResponse {
    if !ALIVE.load(Ordering::SeqCst) {
        return HttpResponse::ServiceUnavailable().json(json!({"status": "dead"}));
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let uptime = now.saturating_sub(START_TIME.load(Ordering::Relaxed));
    HttpResponse::Ok().json(json!({
        "status": "alive",
        "uptime_seconds": uptime,
    }))
}

pub async fn readyz_handler(_req: HttpRequest) -> HttpResponse {
    if !READY.load(Ordering::SeqCst) {
        return HttpResponse::ServiceUnavailable().json(json!({
            "status": "not_ready",
            "reason": "service is starting up or shutting down",
            "in_flight": IN_FLIGHT.load(Ordering::Relaxed),
        }));
    }
    HttpResponse::Ok().json(json!({
        "status": "ready",
        "in_flight": IN_FLIGHT.load(Ordering::Relaxed),
    }))
}

// ─── Prometheus Metrics ───────────────────────────────────────────────────────

pub async fn metrics_handler(_req: HttpRequest) -> HttpResponse {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let uptime = now.saturating_sub(START_TIME.load(Ordering::Relaxed));

    let durations = REQUEST_DURATIONS.snapshot();
    let buckets: [f64; 11] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0];
    let sum: f64 = durations.iter().sum();
    let count = durations.len();

    let mut body = String::with_capacity(4096);

    body.push_str("# HELP kyc_process_uptime_seconds Process uptime\n");
    body.push_str("# TYPE kyc_process_uptime_seconds gauge\n");
    body.push_str(&format!("kyc_process_uptime_seconds {}\n", uptime));

    body.push_str("# HELP kyc_in_flight_requests Currently in-flight requests\n");
    body.push_str("# TYPE kyc_in_flight_requests gauge\n");
    body.push_str(&format!(
        "kyc_in_flight_requests {}\n",
        IN_FLIGHT.load(Ordering::Relaxed)
    ));

    body.push_str("# HELP kyc_http_requests_total Total HTTP requests\n");
    body.push_str("# TYPE kyc_http_requests_total counter\n");
    body.push_str(&format!(
        "kyc_http_requests_total {}\n",
        HTTP_REQUESTS_TOTAL.load(Ordering::Relaxed)
    ));

    body.push_str("# HELP kyc_http_errors_total Total HTTP errors (4xx/5xx)\n");
    body.push_str("# TYPE kyc_http_errors_total counter\n");
    body.push_str(&format!(
        "kyc_http_errors_total {}\n",
        HTTP_ERRORS_TOTAL.load(Ordering::Relaxed)
    ));

    body.push_str("# HELP kyc_panics_recovered_total Panics caught by hook\n");
    body.push_str("# TYPE kyc_panics_recovered_total counter\n");
    body.push_str(&format!(
        "kyc_panics_recovered_total {}\n",
        PANICS_RECOVERED.load(Ordering::Relaxed)
    ));

    body.push_str("# HELP kyc_shutdowns_total Graceful shutdowns\n");
    body.push_str("# TYPE kyc_shutdowns_total counter\n");
    body.push_str(&format!(
        "kyc_shutdowns_total {}\n",
        SHUTDOWNS_TOTAL.load(Ordering::Relaxed)
    ));

    body.push_str("# HELP kyc_http_request_duration_seconds Request duration\n");
    body.push_str("# TYPE kyc_http_request_duration_seconds histogram\n");
    for b in &buckets {
        let c = durations.iter().filter(|&&v| v <= *b).count();
        body.push_str(&format!(
            "kyc_http_request_duration_seconds_bucket{{le=\"{}\"}} {}\n",
            b, c
        ));
    }
    body.push_str(&format!(
        "kyc_http_request_duration_seconds_bucket{{le=\"+Inf\"}} {}\n",
        count
    ));
    body.push_str(&format!(
        "kyc_http_request_duration_seconds_sum {}\n",
        sum
    ));
    body.push_str(&format!(
        "kyc_http_request_duration_seconds_count {}\n",
        count
    ));

    HttpResponse::Ok()
        .content_type("text/plain; version=0.0.4; charset=utf-8")
        .body(body)
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

pub async fn graceful_shutdown(server: actix_web::dev::ServerHandle) {
    let mut sigterm =
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to register SIGTERM handler");
    let sigint = tokio::signal::ctrl_c();

    tokio::select! {
        _ = sigterm.recv() => {
            tracing::warn!("[LIFECYCLE] Received SIGTERM");
        }
        _ = sigint => {
            tracing::warn!("[LIFECYCLE] Received SIGINT");
        }
    }

    SHUTDOWNS_TOTAL.fetch_add(1, Ordering::Relaxed);

    let event = json!({
        "level": "WARN",
        "event": "graceful_shutdown_started",
        "service": "kyc-service",
        "in_flight": IN_FLIGHT.load(Ordering::Relaxed),
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "pod_name": std::env::var("POD_NAME").unwrap_or_default(),
    });
    eprintln!("{}", event);

    // Mark not ready — K8s stops sending traffic
    set_ready(false);

    // Wait for K8s endpoint propagation
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    // Stop accepting new connections, drain in-flight
    server.stop(true).await;
    // ServerHandle::stop returns (), not a future to await twice

    let event = json!({
        "level": "INFO",
        "event": "graceful_shutdown_completed",
        "service": "kyc-service",
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "pod_name": std::env::var("POD_NAME").unwrap_or_default(),
    });
    eprintln!("{}", event);

    tracing::info!("[LIFECYCLE] Shutdown complete");
}

// ─── Actix-web Configuration ──────────────────────────────────────────────────

pub fn configure_lifecycle_routes(cfg: &mut web::ServiceConfig) {
    cfg.route("/livez", web::get().to(livez_handler))
        .route("/readyz", web::get().to(readyz_handler))
        .route("/metrics", web::get().to(metrics_handler));
}
