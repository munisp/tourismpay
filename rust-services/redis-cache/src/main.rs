use actix_cors::Cors;
use actix_web::{web, App, HttpServer, HttpResponse, middleware};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH, Duration, Instant};

// ─── Models ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CacheEntry {
    key: String,
    value: serde_json::Value,
    ttl_seconds: Option<u64>,
    created_at: u64,
    expires_at: Option<u64>,
    access_count: u64,
    size_bytes: usize,
}

#[derive(Debug, Deserialize)]
struct SetRequest {
    key: String,
    value: serde_json::Value,
    ttl_seconds: Option<u64>,
    #[serde(default)]
    nx: bool, // SET if Not eXists
}

#[derive(Debug, Deserialize)]
struct BatchGetRequest {
    keys: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct IncrRequest {
    key: String,
    #[serde(default = "default_incr")]
    by: i64,
}

fn default_incr() -> i64 { 1 }

#[derive(Debug, Deserialize)]
struct PubSubMessage {
    channel: String,
    message: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
struct ChannelMessage {
    channel: String,
    message: serde_json::Value,
    timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StreamEntry {
    id: String,
    fields: HashMap<String, String>,
    timestamp: u64,
}

#[derive(Debug, Deserialize)]
struct StreamAddRequest {
    stream: String,
    fields: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
struct CacheStats {
    total_keys: usize,
    total_memory_bytes: usize,
    hit_count: u64,
    miss_count: u64,
    hit_rate: f64,
    eviction_count: u64,
    expired_count: u64,
    ops_per_second: f64,
    connected_clients: u32,
    pub_sub_channels: usize,
    stream_count: usize,
    uptime_seconds: u64,
}

// ─── State ──────────────────────────────────────────────────────────────────

struct AppState {
    cache: Mutex<HashMap<String, CacheEntry>>,
    counters: Mutex<HashMap<String, i64>>,
    channels: Mutex<HashMap<String, Vec<ChannelMessage>>>,
    streams: Mutex<HashMap<String, Vec<StreamEntry>>>,
    stats: Mutex<CacheStatsInner>,
    start_time: Instant,
}

struct CacheStatsInner {
    hit_count: u64,
    miss_count: u64,
    eviction_count: u64,
    expired_count: u64,
    total_ops: u64,
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_secs()
}

impl AppState {
    fn new() -> Self {
        let mut cache = HashMap::new();
        // Seed session data
        let sessions = vec![
            ("session:admin-001", r#"{"userId":"admin-001","role":"admin","email":"admin@tourismpay.com"}"#),
            ("session:tourist-001", r#"{"userId":"tourist-001","role":"tourist","email":"tourist@demo.com"}"#),
            ("session:merchant-001", r#"{"userId":"merchant-001","role":"merchant","email":"merchant@demo.com"}"#),
        ];
        let now = now_secs();
        for (key, val) in sessions {
            cache.insert(key.to_string(), CacheEntry {
                key: key.to_string(),
                value: serde_json::from_str(val).unwrap_or(serde_json::Value::Null),
                ttl_seconds: Some(3600),
                created_at: now,
                expires_at: Some(now + 3600),
                access_count: 0,
                size_bytes: val.len(),
            });
        }

        // Seed rate limit counters
        let mut counters = HashMap::new();
        counters.insert("ratelimit:api:/api/demo-login".to_string(), 0i64);
        counters.insert("ratelimit:api:/api/auth".to_string(), 0i64);

        // Seed channels
        let mut channels: HashMap<String, Vec<ChannelMessage>> = HashMap::new();
        channels.insert("cache.invalidation".to_string(), Vec::new());
        channels.insert("session.expired".to_string(), Vec::new());
        channels.insert("rate.limit.exceeded".to_string(), Vec::new());

        AppState {
            cache: Mutex::new(cache),
            counters: Mutex::new(counters),
            channels: Mutex::new(channels),
            streams: Mutex::new(HashMap::new()),
            stats: Mutex::new(CacheStatsInner {
                hit_count: 0,
                miss_count: 0,
                eviction_count: 0,
                expired_count: 0,
                total_ops: 0,
            }),
            start_time: Instant::now(),
        }
    }

    fn is_expired(entry: &CacheEntry) -> bool {
        if let Some(exp) = entry.expires_at {
            now_secs() > exp
        } else {
            false
        }
    }
}

// ─── Handlers ───────────────────────────────────────────────────────────────

async fn health(data: web::Data<AppState>) -> HttpResponse {
    let cache = data.cache.lock().unwrap();
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "TourismPay Redis Cache (Rust)",
        "version": "1.0.0",
        "keys": cache.len(),
        "uptimeSeconds": data.start_time.elapsed().as_secs(),
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

async fn cache_get(path: web::Path<String>, data: web::Data<AppState>) -> HttpResponse {
    let key = path.into_inner();
    let mut cache = data.cache.lock().unwrap();
    let mut stats = data.stats.lock().unwrap();
    stats.total_ops += 1;

    if let Some(entry) = cache.get_mut(&key) {
        if AppState::is_expired(entry) {
            cache.remove(&key);
            stats.miss_count += 1;
            stats.expired_count += 1;
            return HttpResponse::NotFound().json(serde_json::json!({"error": "key expired"}));
        }
        entry.access_count += 1;
        stats.hit_count += 1;
        HttpResponse::Ok().json(serde_json::json!({
            "key": entry.key,
            "value": entry.value,
            "ttl": entry.expires_at.map(|e| e.saturating_sub(now_secs())),
            "accessCount": entry.access_count
        }))
    } else {
        stats.miss_count += 1;
        HttpResponse::NotFound().json(serde_json::json!({"error": "key not found"}))
    }
}

async fn cache_set(body: web::Json<SetRequest>, data: web::Data<AppState>) -> HttpResponse {
    let req = body.into_inner();
    let mut cache = data.cache.lock().unwrap();
    let mut stats = data.stats.lock().unwrap();
    stats.total_ops += 1;

    if req.nx && cache.contains_key(&req.key) {
        return HttpResponse::Conflict().json(serde_json::json!({"error": "key already exists"}));
    }

    let now = now_secs();
    let value_str = serde_json::to_string(&req.value).unwrap_or_default();
    let entry = CacheEntry {
        key: req.key.clone(),
        value: req.value,
        ttl_seconds: req.ttl_seconds,
        created_at: now,
        expires_at: req.ttl_seconds.map(|ttl| now + ttl),
        access_count: 0,
        size_bytes: value_str.len(),
    };
    cache.insert(req.key.clone(), entry);

    // Evict if over 10000 keys
    if cache.len() > 10000 {
        let oldest_key = cache.iter()
            .min_by_key(|(_, v)| v.access_count)
            .map(|(k, _)| k.clone());
        if let Some(key) = oldest_key {
            cache.remove(&key);
            stats.eviction_count += 1;
        }
    }

    HttpResponse::Created().json(serde_json::json!({"status": "ok", "key": req.key}))
}

async fn cache_delete(path: web::Path<String>, data: web::Data<AppState>) -> HttpResponse {
    let key = path.into_inner();
    let mut cache = data.cache.lock().unwrap();
    let mut stats = data.stats.lock().unwrap();
    stats.total_ops += 1;

    if cache.remove(&key).is_some() {
        HttpResponse::Ok().json(serde_json::json!({"status": "deleted", "key": key}))
    } else {
        HttpResponse::NotFound().json(serde_json::json!({"error": "key not found"}))
    }
}

async fn cache_batch_get(body: web::Json<BatchGetRequest>, data: web::Data<AppState>) -> HttpResponse {
    let keys = body.into_inner().keys;
    let cache = data.cache.lock().unwrap();
    let mut stats = data.stats.lock().unwrap();
    stats.total_ops += 1;

    let mut results: HashMap<String, Option<serde_json::Value>> = HashMap::new();
    for key in &keys {
        if let Some(entry) = cache.get(key) {
            if !AppState::is_expired(entry) {
                results.insert(key.clone(), Some(entry.value.clone()));
                stats.hit_count += 1;
                continue;
            }
        }
        results.insert(key.clone(), None);
        stats.miss_count += 1;
    }

    HttpResponse::Ok().json(serde_json::json!({"results": results}))
}

async fn cache_incr(body: web::Json<IncrRequest>, data: web::Data<AppState>) -> HttpResponse {
    let req = body.into_inner();
    let mut counters = data.counters.lock().unwrap();
    let mut stats = data.stats.lock().unwrap();
    stats.total_ops += 1;

    let counter = counters.entry(req.key.clone()).or_insert(0);
    *counter += req.by;

    HttpResponse::Ok().json(serde_json::json!({
        "key": req.key,
        "value": *counter
    }))
}

async fn cache_keys(query: web::Query<HashMap<String, String>>, data: web::Data<AppState>) -> HttpResponse {
    let cache = data.cache.lock().unwrap();
    let pattern = query.get("pattern").cloned().unwrap_or_else(|| "*".to_string());

    let keys: Vec<&String> = cache.keys()
        .filter(|k| {
            if pattern == "*" { return true; }
            let prefix = pattern.trim_end_matches('*');
            k.starts_with(prefix)
        })
        .collect();

    HttpResponse::Ok().json(serde_json::json!({"keys": keys, "total": keys.len()}))
}

// Pub/Sub
async fn publish(body: web::Json<PubSubMessage>, data: web::Data<AppState>) -> HttpResponse {
    let msg = body.into_inner();
    let mut channels = data.channels.lock().unwrap();

    let channel_msgs = channels.entry(msg.channel.clone()).or_insert_with(Vec::new);
    channel_msgs.push(ChannelMessage {
        channel: msg.channel.clone(),
        message: msg.message,
        timestamp: now_secs(),
    });
    if channel_msgs.len() > 100 {
        let drain_count = channel_msgs.len() - 100;
        channel_msgs.drain(..drain_count);
    }

    let subscribers = channel_msgs.len();
    HttpResponse::Ok().json(serde_json::json!({
        "status": "published",
        "channel": msg.channel,
        "subscribers": subscribers
    }))
}

async fn subscribe(path: web::Path<String>, data: web::Data<AppState>) -> HttpResponse {
    let channel = path.into_inner();
    let channels = data.channels.lock().unwrap();

    if let Some(msgs) = channels.get(&channel) {
        let recent: Vec<&ChannelMessage> = msgs.iter().rev().take(20).collect();
        HttpResponse::Ok().json(serde_json::json!({
            "channel": channel,
            "messages": recent,
            "total": msgs.len()
        }))
    } else {
        HttpResponse::Ok().json(serde_json::json!({
            "channel": channel,
            "messages": [],
            "total": 0
        }))
    }
}

async fn list_channels(data: web::Data<AppState>) -> HttpResponse {
    let channels = data.channels.lock().unwrap();
    let result: Vec<serde_json::Value> = channels.iter()
        .map(|(name, msgs)| serde_json::json!({
            "name": name,
            "messageCount": msgs.len()
        }))
        .collect();
    HttpResponse::Ok().json(serde_json::json!({"channels": result}))
}

// Streams
async fn stream_add(body: web::Json<StreamAddRequest>, data: web::Data<AppState>) -> HttpResponse {
    let req = body.into_inner();
    let mut streams = data.streams.lock().unwrap();

    let stream = streams.entry(req.stream.clone()).or_insert_with(Vec::new);
    let id = format!("{}-{}", now_secs(), stream.len());
    stream.push(StreamEntry {
        id: id.clone(),
        fields: req.fields,
        timestamp: now_secs(),
    });
    if stream.len() > 1000 {
        stream.drain(..stream.len() - 1000);
    }

    HttpResponse::Created().json(serde_json::json!({"id": id, "stream": req.stream}))
}

async fn stream_read(path: web::Path<String>, data: web::Data<AppState>) -> HttpResponse {
    let stream_name = path.into_inner();
    let streams = data.streams.lock().unwrap();

    if let Some(entries) = streams.get(&stream_name) {
        let recent: Vec<&StreamEntry> = entries.iter().rev().take(50).collect();
        HttpResponse::Ok().json(serde_json::json!({
            "stream": stream_name,
            "entries": recent,
            "total": entries.len()
        }))
    } else {
        HttpResponse::NotFound().json(serde_json::json!({"error": "stream not found"}))
    }
}

async fn list_streams(data: web::Data<AppState>) -> HttpResponse {
    let streams = data.streams.lock().unwrap();
    let result: Vec<serde_json::Value> = streams.iter()
        .map(|(name, entries)| serde_json::json!({
            "name": name,
            "length": entries.len()
        }))
        .collect();
    HttpResponse::Ok().json(serde_json::json!({"streams": result}))
}

// Stats
async fn cache_stats(data: web::Data<AppState>) -> HttpResponse {
    let cache = data.cache.lock().unwrap();
    let stats = data.stats.lock().unwrap();
    let channels = data.channels.lock().unwrap();
    let streams = data.streams.lock().unwrap();

    let total_memory: usize = cache.values().map(|e| e.size_bytes).sum();
    let total_ops = stats.hit_count + stats.miss_count;
    let hit_rate = if total_ops > 0 {
        stats.hit_count as f64 / total_ops as f64 * 100.0
    } else {
        0.0
    };
    let uptime = data.start_time.elapsed().as_secs();
    let ops_per_sec = if uptime > 0 {
        stats.total_ops as f64 / uptime as f64
    } else {
        0.0
    };

    HttpResponse::Ok().json(CacheStats {
        total_keys: cache.len(),
        total_memory_bytes: total_memory,
        hit_count: stats.hit_count,
        miss_count: stats.miss_count,
        hit_rate,
        eviction_count: stats.eviction_count,
        expired_count: stats.expired_count,
        ops_per_second: ops_per_sec,
        connected_clients: 1,
        pub_sub_channels: channels.len(),
        stream_count: streams.len(),
        uptime_seconds: uptime,
    })
}

async fn flush_all(data: web::Data<AppState>) -> HttpResponse {
    let mut cache = data.cache.lock().unwrap();
    let mut counters = data.counters.lock().unwrap();
    cache.clear();
    counters.clear();
    HttpResponse::Ok().json(serde_json::json!({"status": "flushed"}))
}

// ─── Main ───────────────────────────────────────────────────────────────────

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8110".to_string())
        .parse()
        .unwrap_or(8110);

    let state = web::Data::new(AppState::new());

    log::info!("Redis Cache service starting on port {}", port);

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header();

        App::new()
            .wrap(cors)
            .wrap(middleware::Logger::default())
            .app_data(state.clone())
            .route("/health", web::get().to(health))
            .service(
                web::scope("/api/v1")
                    .route("/cache/{key}", web::get().to(cache_get))
                    .route("/cache", web::post().to(cache_set))
                    .route("/cache/{key}", web::delete().to(cache_delete))
                    .route("/cache/batch", web::post().to(cache_batch_get))
                    .route("/cache/incr", web::post().to(cache_incr))
                    .route("/cache/keys", web::get().to(cache_keys))
                    .route("/cache/flush", web::post().to(flush_all))
                    .route("/pubsub/publish", web::post().to(publish))
                    .route("/pubsub/subscribe/{channel}", web::get().to(subscribe))
                    .route("/pubsub/channels", web::get().to(list_channels))
                    .route("/streams/add", web::post().to(stream_add))
                    .route("/streams/{name}", web::get().to(stream_read))
                    .route("/streams", web::get().to(list_streams))
                    .route("/stats", web::get().to(cache_stats))
            )
    })
    .bind(format!("0.0.0.0:{}", port))?
    .run()
    .await
}
