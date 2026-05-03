use actix_cors::Cors;
use actix_web::{web, App, HttpServer, HttpResponse, middleware};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

// ─── Models ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Topic {
    name: String,
    partitions: u32,
    replication_factor: u32,
    retention_secs: u64,
    compression: String,
    status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Record {
    offset: u64,
    key: Option<String>,
    value: serde_json::Value,
    timestamp: u64,
    headers: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct ProduceRequest {
    topic: String,
    key: Option<String>,
    value: serde_json::Value,
    #[serde(default)]
    headers: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct BatchProduceRequest {
    topic: String,
    records: Vec<ProduceRecord>,
}

#[derive(Debug, Deserialize)]
struct ProduceRecord {
    key: Option<String>,
    value: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SmartModule {
    name: String,
    kind: String, // filter, map, filter-map, aggregate, join
    input_topic: String,
    output_topic: Option<String>,
    wasm_size: usize,
    status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Connector {
    name: String,
    connector_type: String, // source, sink
    config: HashMap<String, String>,
    status: String,
    records_processed: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MaterializedView {
    name: String,
    source_topic: String,
    aggregation: String,
    data: serde_json::Value,
    updated_at: String,
}

// ─── State ──────────────────────────────────────────────────────────────────

struct AppState {
    topics: Mutex<HashMap<String, Topic>>,
    records: Mutex<HashMap<String, Vec<Record>>>,
    smart_modules: Mutex<Vec<SmartModule>>,
    connectors: Mutex<Vec<Connector>>,
    materialized_views: Mutex<Vec<MaterializedView>>,
    offsets: Mutex<HashMap<String, u64>>,
    stats: Mutex<StreamStats>,
    start_time: Instant,
}

#[derive(Debug, Clone, Serialize)]
struct StreamStats {
    total_topics: usize,
    total_records: u64,
    total_produced: u64,
    total_consumed: u64,
    bytes_in: u64,
    bytes_out: u64,
    smart_modules_active: usize,
    connectors_active: usize,
}

fn now_ts() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

impl AppState {
    fn new() -> Self {
        let mut topics = HashMap::new();
        let mut records: HashMap<String, Vec<Record>> = HashMap::new();

        let topic_defs = vec![
            ("transactions", 6, 86400),
            ("payments", 3, 604800),
            ("kyb-events", 3, 2592000),
            ("fraud-signals", 6, 604800),
            ("user-activity", 3, 86400),
            ("settlement-batches", 3, 2592000),
            ("audit-trail", 6, 31536000),
            ("analytics-events", 3, 86400),
            ("notifications", 3, 86400),
        ];

        for (name, partitions, retention) in topic_defs {
            topics.insert(name.to_string(), Topic {
                name: name.to_string(),
                partitions,
                replication_factor: 1,
                retention_secs: retention,
                compression: "lz4".to_string(),
                status: "active".to_string(),
            });
            records.insert(name.to_string(), Vec::new());
        }

        let smart_modules = vec![
            SmartModule { name: "fraud-filter".into(), kind: "filter".into(), input_topic: "transactions".into(), output_topic: Some("fraud-signals".into()), wasm_size: 45_000, status: "active".into() },
            SmartModule { name: "payment-enricher".into(), kind: "map".into(), input_topic: "payments".into(), output_topic: Some("analytics-events".into()), wasm_size: 32_000, status: "active".into() },
            SmartModule { name: "kyb-aggregator".into(), kind: "aggregate".into(), input_topic: "kyb-events".into(), output_topic: None, wasm_size: 28_000, status: "active".into() },
            SmartModule { name: "settlement-joiner".into(), kind: "join".into(), input_topic: "settlement-batches".into(), output_topic: Some("audit-trail".into()), wasm_size: 51_000, status: "active".into() },
        ];

        let connectors = vec![
            Connector { name: "postgres-source".into(), connector_type: "source".into(), config: vec![("url".into(), "postgresql://localhost:5432/ndsep_db".into())].into_iter().collect(), status: "active".into(), records_processed: 0 },
            Connector { name: "opensearch-sink".into(), connector_type: "sink".into(), config: vec![("url".into(), "http://localhost:9200".into())].into_iter().collect(), status: "active".into(), records_processed: 0 },
            Connector { name: "lakehouse-sink".into(), connector_type: "sink".into(), config: vec![("path".into(), "/data/lakehouse".into())].into_iter().collect(), status: "active".into(), records_processed: 0 },
        ];

        let materialized_views = vec![
            MaterializedView {
                name: "daily-transaction-volume".into(),
                source_topic: "transactions".into(),
                aggregation: "SUM(amount) GROUP BY date, currency".into(),
                data: serde_json::json!({"2026-05-01": {"USD": 15000, "KES": 1200000, "NGN": 8500000}}),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
            MaterializedView {
                name: "merchant-revenue".into(),
                source_topic: "payments".into(),
                aggregation: "SUM(amount) GROUP BY merchant_id".into(),
                data: serde_json::json!({"merchant-001": 5200, "merchant-002": 3100}),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
            MaterializedView {
                name: "fraud-risk-scores".into(),
                source_topic: "fraud-signals".into(),
                aggregation: "AVG(risk_score) GROUP BY country".into(),
                data: serde_json::json!({"KE": 0.12, "NG": 0.18, "GH": 0.09, "TZ": 0.11}),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
            MaterializedView {
                name: "active-users".into(),
                source_topic: "user-activity".into(),
                aggregation: "COUNT(DISTINCT user_id) WHERE timestamp > NOW() - 24h".into(),
                data: serde_json::json!({"total": 1247, "tourists": 890, "merchants": 357}),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
        ];

        let offsets: HashMap<String, u64> = HashMap::new();

        AppState {
            topics: Mutex::new(topics),
            records: Mutex::new(records),
            smart_modules: Mutex::new(smart_modules),
            connectors: Mutex::new(connectors),
            materialized_views: Mutex::new(materialized_views),
            offsets: Mutex::new(offsets),
            stats: Mutex::new(StreamStats {
                total_topics: 9,
                total_records: 0,
                total_produced: 0,
                total_consumed: 0,
                bytes_in: 0,
                bytes_out: 0,
                smart_modules_active: 4,
                connectors_active: 3,
            }),
            start_time: Instant::now(),
        }
    }
}

// ─── Handlers ───────────────────────────────────────────────────────────────

async fn health(data: web::Data<AppState>) -> HttpResponse {
    let topics = data.topics.lock().unwrap();
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "TourismPay Fluvio Stream (Rust)",
        "version": "1.0.0",
        "topics": topics.len(),
        "uptimeSeconds": data.start_time.elapsed().as_secs(),
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

async fn produce(body: web::Json<ProduceRequest>, data: web::Data<AppState>) -> HttpResponse {
    let req = body.into_inner();
    let mut records = data.records.lock().unwrap();
    let mut offsets = data.offsets.lock().unwrap();
    let mut stats = data.stats.lock().unwrap();

    let topic_records = records.entry(req.topic.clone()).or_insert_with(Vec::new);
    let offset = offsets.entry(req.topic.clone()).or_insert(0);
    *offset += 1;

    let value_size = serde_json::to_string(&req.value).unwrap_or_default().len();

    topic_records.push(Record {
        offset: *offset,
        key: req.key,
        value: req.value,
        timestamp: now_ts(),
        headers: req.headers,
    });

    if topic_records.len() > 10000 {
        topic_records.drain(..topic_records.len() - 10000);
    }

    stats.total_produced += 1;
    stats.total_records += 1;
    stats.bytes_in += value_size as u64;

    HttpResponse::Created().json(serde_json::json!({
        "topic": req.topic,
        "offset": *offset,
        "status": "produced"
    }))
}

async fn batch_produce(body: web::Json<BatchProduceRequest>, data: web::Data<AppState>) -> HttpResponse {
    let req = body.into_inner();
    let mut records = data.records.lock().unwrap();
    let mut offsets = data.offsets.lock().unwrap();
    let mut stats = data.stats.lock().unwrap();

    let topic_records = records.entry(req.topic.clone()).or_insert_with(Vec::new);
    let offset = offsets.entry(req.topic.clone()).or_insert(0);
    let start_offset = *offset + 1;

    for record in &req.records {
        *offset += 1;
        topic_records.push(Record {
            offset: *offset,
            key: record.key.clone(),
            value: record.value.clone(),
            timestamp: now_ts(),
            headers: HashMap::new(),
        });
    }

    stats.total_produced += req.records.len() as u64;
    stats.total_records += req.records.len() as u64;

    HttpResponse::Created().json(serde_json::json!({
        "topic": req.topic,
        "startOffset": start_offset,
        "endOffset": *offset,
        "count": req.records.len()
    }))
}

async fn consume(path: web::Path<String>, query: web::Query<HashMap<String, String>>, data: web::Data<AppState>) -> HttpResponse {
    let topic = path.into_inner();
    let records = data.records.lock().unwrap();
    let mut stats = data.stats.lock().unwrap();

    let from_offset: u64 = query.get("from").and_then(|s| s.parse().ok()).unwrap_or(0);
    let limit: usize = query.get("limit").and_then(|s| s.parse().ok()).unwrap_or(50);

    if let Some(topic_records) = records.get(&topic) {
        let filtered: Vec<&Record> = topic_records.iter()
            .filter(|r| r.offset >= from_offset)
            .take(limit)
            .collect();

        stats.total_consumed += filtered.len() as u64;

        HttpResponse::Ok().json(serde_json::json!({
            "topic": topic,
            "records": filtered,
            "count": filtered.len(),
            "nextOffset": filtered.last().map(|r| r.offset + 1).unwrap_or(from_offset)
        }))
    } else {
        HttpResponse::NotFound().json(serde_json::json!({"error": "topic not found"}))
    }
}

async fn list_topics(data: web::Data<AppState>) -> HttpResponse {
    let topics = data.topics.lock().unwrap();
    let records = data.records.lock().unwrap();

    let result: Vec<serde_json::Value> = topics.values()
        .map(|t| {
            let count = records.get(&t.name).map(|r| r.len()).unwrap_or(0);
            serde_json::json!({
                "name": t.name,
                "partitions": t.partitions,
                "replicationFactor": t.replication_factor,
                "retentionSecs": t.retention_secs,
                "compression": t.compression,
                "status": t.status,
                "recordCount": count
            })
        })
        .collect();

    HttpResponse::Ok().json(serde_json::json!({"topics": result, "total": result.len()}))
}

async fn create_topic(body: web::Json<Topic>, data: web::Data<AppState>) -> HttpResponse {
    let topic = body.into_inner();
    let mut topics = data.topics.lock().unwrap();
    let mut records = data.records.lock().unwrap();

    topics.insert(topic.name.clone(), topic.clone());
    records.insert(topic.name.clone(), Vec::new());

    HttpResponse::Created().json(topic)
}

async fn list_smart_modules(data: web::Data<AppState>) -> HttpResponse {
    let modules = data.smart_modules.lock().unwrap();
    HttpResponse::Ok().json(serde_json::json!({"smartModules": *modules, "total": modules.len()}))
}

async fn list_connectors(data: web::Data<AppState>) -> HttpResponse {
    let connectors = data.connectors.lock().unwrap();
    HttpResponse::Ok().json(serde_json::json!({"connectors": *connectors, "total": connectors.len()}))
}

async fn list_views(data: web::Data<AppState>) -> HttpResponse {
    let views = data.materialized_views.lock().unwrap();
    HttpResponse::Ok().json(serde_json::json!({"materializedViews": *views, "total": views.len()}))
}

async fn get_view(path: web::Path<String>, data: web::Data<AppState>) -> HttpResponse {
    let name = path.into_inner();
    let views = data.materialized_views.lock().unwrap();
    for view in views.iter() {
        if view.name == name {
            return HttpResponse::Ok().json(view);
        }
    }
    HttpResponse::NotFound().json(serde_json::json!({"error": "view not found"}))
}

async fn stream_stats(data: web::Data<AppState>) -> HttpResponse {
    let stats = data.stats.lock().unwrap();
    HttpResponse::Ok().json(serde_json::json!({
        "stats": *stats,
        "uptimeSeconds": data.start_time.elapsed().as_secs()
    }))
}

// ─── Main ───────────────────────────────────────────────────────────────────

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8112".to_string())
        .parse()
        .unwrap_or(8112);

    let state = web::Data::new(AppState::new());

    log::info!("Fluvio Stream service starting on port {}", port);

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
                    .route("/produce", web::post().to(produce))
                    .route("/produce/batch", web::post().to(batch_produce))
                    .route("/consume/{topic}", web::get().to(consume))
                    .route("/topics", web::get().to(list_topics))
                    .route("/topics", web::post().to(create_topic))
                    .route("/smart-modules", web::get().to(list_smart_modules))
                    .route("/connectors", web::get().to(list_connectors))
                    .route("/views", web::get().to(list_views))
                    .route("/views/{name}", web::get().to(get_view))
                    .route("/stats", web::get().to(stream_stats))
            )
    })
    .bind(format!("0.0.0.0:{}", port))?
    .run()
    .await
}
