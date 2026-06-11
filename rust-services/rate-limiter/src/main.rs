use actix_cors::Cors;
use actix_web::middleware::from_fn;
use actix_web::{web, App, HttpServer, HttpRequest, HttpResponse};
use chrono::Utc;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::Mutex;

// ─── Models ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitConfig {
    pub name: String,
    pub window_seconds: u64,
    pub max_requests: u64,
    pub burst_limit: Option<u64>,
    pub penalty_seconds: Option<u64>,
    pub enabled: bool,
}

#[derive(Debug)]
struct SlidingWindow {
    timestamps: VecDeque<u64>,
    penalty_until: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct RateLimitResult {
    pub allowed: bool,
    pub remaining: u64,
    pub limit: u64,
    pub reset_at: u64,
    pub retry_after: Option<u64>,
    pub window_seconds: u64,
}

#[derive(Debug, Deserialize)]
pub struct CheckRequest {
    pub key: String,
    pub endpoint: Option<String>,
    pub cost: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct RateLimitStats {
    pub total_keys: usize,
    pub total_requests: u64,
    pub blocked_requests: u64,
    pub configs: Vec<RateLimitConfig>,
}

pub struct AppState {
    pub windows: DashMap<String, Arc<Mutex<SlidingWindow>>>,
    pub configs: DashMap<String, RateLimitConfig>,
    pub stats: DashMap<String, (u64, u64)>, // (total, blocked)
}

// ─── Default configs ─────────────────────────────────────────────────────────

fn default_configs() -> Vec<RateLimitConfig> {
    vec![
        RateLimitConfig {
            name: "global".into(),
            window_seconds: 60,
            max_requests: 200,
            burst_limit: Some(50),
            penalty_seconds: Some(30),
            enabled: true,
        },
        RateLimitConfig {
            name: "auth".into(),
            window_seconds: 300,
            max_requests: 10,
            burst_limit: Some(5),
            penalty_seconds: Some(900),
            enabled: true,
        },
        RateLimitConfig {
            name: "payment".into(),
            window_seconds: 60,
            max_requests: 30,
            burst_limit: Some(10),
            penalty_seconds: Some(60),
            enabled: true,
        },
        RateLimitConfig {
            name: "wallet".into(),
            window_seconds: 60,
            max_requests: 50,
            burst_limit: Some(15),
            penalty_seconds: Some(30),
            enabled: true,
        },
        RateLimitConfig {
            name: "api".into(),
            window_seconds: 60,
            max_requests: 100,
            burst_limit: Some(30),
            penalty_seconds: Some(60),
            enabled: true,
        },
        RateLimitConfig {
            name: "export".into(),
            window_seconds: 3600,
            max_requests: 10,
            burst_limit: Some(3),
            penalty_seconds: Some(300),
            enabled: true,
        },
        RateLimitConfig {
            name: "webhook".into(),
            window_seconds: 60,
            max_requests: 500,
            burst_limit: Some(100),
            penalty_seconds: None,
            enabled: true,
        },
    ]
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "rate-limiter",
        "version": "1.0.0",
        "timestamp": Utc::now().to_rfc3339(),
    }))
}

async fn check_rate_limit(
    state: web::Data<Arc<AppState>>,
    body: web::Json<CheckRequest>,
) -> HttpResponse {
    let req = body.into_inner();
    let endpoint = req.endpoint.unwrap_or_else(|| "global".into());
    let cost = req.cost.unwrap_or(1);
    let compound_key = format!("{}:{}", endpoint, req.key);

    let config = state.configs.get(&endpoint)
        .or_else(|| state.configs.get("global"))
        .map(|c| c.value().clone())
        .unwrap_or(RateLimitConfig {
            name: "default".into(),
            window_seconds: 60,
            max_requests: 100,
            burst_limit: None,
            penalty_seconds: None,
            enabled: true,
        });

    if !config.enabled {
        return HttpResponse::Ok().json(RateLimitResult {
            allowed: true,
            remaining: config.max_requests,
            limit: config.max_requests,
            reset_at: now_secs() + config.window_seconds,
            retry_after: None,
            window_seconds: config.window_seconds,
        });
    }

    let window = state.windows
        .entry(compound_key.clone())
        .or_insert_with(|| Arc::new(Mutex::new(SlidingWindow {
            timestamps: VecDeque::new(),
            penalty_until: None,
        })))
        .clone();

    let mut w = window.lock().await;
    let now = now_secs();

    // Check penalty
    if let Some(until) = w.penalty_until {
        if now < until {
            update_stats(&state, &endpoint, false);
            return HttpResponse::TooManyRequests().json(RateLimitResult {
                allowed: false,
                remaining: 0,
                limit: config.max_requests,
                reset_at: until,
                retry_after: Some(until - now),
                window_seconds: config.window_seconds,
            });
        }
        w.penalty_until = None;
    }

    // Prune old entries
    let cutoff = now.saturating_sub(config.window_seconds);
    while w.timestamps.front().map_or(false, |&t| t < cutoff) {
        w.timestamps.pop_front();
    }

    let current_count = w.timestamps.len() as u64;

    // Check burst limit
    if let Some(burst) = config.burst_limit {
        let burst_window = now.saturating_sub(1);
        let burst_count = w.timestamps.iter().filter(|&&t| t >= burst_window).count() as u64;
        if burst_count + cost > burst {
            if let Some(penalty) = config.penalty_seconds {
                w.penalty_until = Some(now + penalty);
            }
            update_stats(&state, &endpoint, false);
            return HttpResponse::TooManyRequests().json(RateLimitResult {
                allowed: false,
                remaining: 0,
                limit: config.max_requests,
                reset_at: now + config.penalty_seconds.unwrap_or(config.window_seconds),
                retry_after: Some(config.penalty_seconds.unwrap_or(1)),
                window_seconds: config.window_seconds,
            });
        }
    }

    // Check window limit
    if current_count + cost > config.max_requests {
        if let Some(penalty) = config.penalty_seconds {
            w.penalty_until = Some(now + penalty);
        }
        update_stats(&state, &endpoint, false);
        let oldest = w.timestamps.front().copied().unwrap_or(now);
        return HttpResponse::TooManyRequests().json(RateLimitResult {
            allowed: false,
            remaining: 0,
            limit: config.max_requests,
            reset_at: oldest + config.window_seconds,
            retry_after: Some(oldest + config.window_seconds - now),
            window_seconds: config.window_seconds,
        });
    }

    // Allow
    for _ in 0..cost {
        w.timestamps.push_back(now);
    }
    update_stats(&state, &endpoint, true);

    HttpResponse::Ok().json(RateLimitResult {
        allowed: true,
        remaining: config.max_requests - (current_count + cost),
        limit: config.max_requests,
        reset_at: now + config.window_seconds,
        retry_after: None,
        window_seconds: config.window_seconds,
    })
}

async fn get_stats(state: web::Data<Arc<AppState>>) -> HttpResponse {
    let mut total_req = 0u64;
    let mut total_blocked = 0u64;
    state.stats.iter().for_each(|e| {
        total_req += e.value().0;
        total_blocked += e.value().1;
    });
    let configs: Vec<RateLimitConfig> = state.configs.iter().map(|c| c.value().clone()).collect();
    HttpResponse::Ok().json(RateLimitStats {
        total_keys: state.windows.len(),
        total_requests: total_req,
        blocked_requests: total_blocked,
        configs,
    })
}

async fn update_config(
    state: web::Data<Arc<AppState>>,
    body: web::Json<RateLimitConfig>,
) -> HttpResponse {
    let config = body.into_inner();
    state.configs.insert(config.name.clone(), config.clone());
    HttpResponse::Ok().json(config)
}

async fn reset_key(
    state: web::Data<Arc<AppState>>,
    body: web::Json<serde_json::Value>,
) -> HttpResponse {
    if let Some(key) = body.get("key").and_then(|k| k.as_str()) {
        let removed: Vec<String> = state.windows.iter()
            .filter(|e| e.key().contains(key))
            .map(|e| e.key().clone())
            .collect();
        for k in &removed {
            state.windows.remove(k);
        }
        HttpResponse::Ok().json(serde_json::json!({"removed": removed.len()}))
    } else {
        HttpResponse::BadRequest().json(serde_json::json!({"error": "key required"}))
    }
}

fn update_stats(state: &AppState, endpoint: &str, allowed: bool) {
    let mut entry = state.stats.entry(endpoint.to_string()).or_insert((0, 0));
    entry.0 += 1;
    if !allowed {
        entry.1 += 1;
    }
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

// ─── Main ────────────────────────────────────────────────────────────────────


async fn auth_middleware(
    req: actix_web::dev::ServiceRequest,
    next: actix_web::middleware::Next<impl actix_web::body::MessageBody>,
) -> Result<actix_web::dev::ServiceResponse<impl actix_web::body::MessageBody>, actix_web::Error> {
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
            actix_web::HttpResponse::Unauthorized().json(serde_json::json!({"error": "missing authorization"}))
        ).map_into_right_body());
    }
    next.call(req).await.map(|res| res.map_into_left_body())
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt::init();

    let port: u16 = std::env::var("PORT").unwrap_or_else(|_| "8091".into())
        .parse().unwrap_or(8091);

    let state = Arc::new(AppState {
        windows: DashMap::new(),
        configs: DashMap::new(),
        stats: DashMap::new(),
    });

    for cfg in default_configs() {
        state.configs.insert(cfg.name.clone(), cfg);
    }

    tracing::info!("Rate limiter starting on port {port}");

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(state.clone()))
            .wrap(Cors::permissive())
            .wrap(from_fn(auth_middleware))
            .route("/health", web::get().to(health))
            .route("/api/v1/check", web::post().to(check_rate_limit))
            .route("/api/v1/stats", web::get().to(get_stats))
            .route("/api/v1/config", web::post().to(update_config))
            .route("/api/v1/reset", web::post().to(reset_key))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
