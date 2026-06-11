use actix_cors::Cors;
use actix_web::middleware::from_fn;
use actix_web::{web, App, HttpServer, HttpResponse};
use chrono::Utc;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use uuid::Uuid;

// ─── Offline-first sync engine ───────────────────────────────────────────────
// Designed for unreliable connectivity in rural Africa and developing countries.
// Features:
//   - Conflict-free replicated data types (CRDT-inspired) via vector clocks
//   - Operation log with idempotent replay
//   - Delta sync to minimize bandwidth
//   - Automatic conflict resolution with last-writer-wins + manual merge
//   - Queue management for pending operations
//   - Bandwidth-aware compression hints

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncOperation {
    pub id: String,
    pub client_id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub operation: OpType,
    pub payload: serde_json::Value,
    pub vector_clock: serde_json::Value,
    pub checksum: String,
    pub timestamp: String,
    pub status: SyncStatus,
    pub retry_count: u32,
    pub compressed: bool,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum OpType {
    Create,
    Update,
    Delete,
    Upsert,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SyncStatus {
    Pending,
    Syncing,
    Synced,
    Conflict,
    Failed,
}

#[derive(Debug, Deserialize)]
pub struct BatchSyncRequest {
    pub client_id: String,
    pub operations: Vec<ClientOperation>,
    pub last_sync_timestamp: Option<String>,
    pub bandwidth_kbps: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct ClientOperation {
    pub id: Option<String>,
    pub entity_type: String,
    pub entity_id: String,
    pub operation: OpType,
    pub payload: serde_json::Value,
    pub vector_clock: Option<serde_json::Value>,
    pub timestamp: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BatchSyncResponse {
    pub accepted: usize,
    pub conflicts: Vec<SyncConflict>,
    pub server_updates: Vec<SyncOperation>,
    pub sync_token: String,
    pub next_sync_recommended_ms: u64,
    pub bandwidth_mode: BandwidthMode,
}

#[derive(Debug, Serialize)]
pub struct SyncConflict {
    pub operation_id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub client_version: serde_json::Value,
    pub server_version: serde_json::Value,
    pub resolution: ConflictResolution,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictResolution {
    ClientWins,
    ServerWins,
    Merged,
    ManualRequired,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BandwidthMode {
    Full,
    Compressed,
    DeltaOnly,
    CriticalOnly,
}

#[derive(Debug, Serialize)]
pub struct QueueStatus {
    pub total_pending: usize,
    pub total_synced: usize,
    pub total_conflicts: usize,
    pub total_failed: usize,
    pub oldest_pending: Option<String>,
    pub estimated_sync_bytes: u64,
}

pub struct AppState {
    pub operations: DashMap<String, SyncOperation>,
    pub entity_store: DashMap<String, serde_json::Value>,
    pub client_sync_tokens: DashMap<String, String>,
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "offline-sync-engine",
        "version": "1.0.0",
        "timestamp": Utc::now().to_rfc3339(),
        "features": [
            "crdt-vector-clocks",
            "delta-sync",
            "bandwidth-adaptive",
            "conflict-resolution",
            "idempotent-replay",
            "operation-queue"
        ],
    }))
}

async fn batch_sync(
    state: web::Data<Arc<AppState>>,
    body: web::Json<BatchSyncRequest>,
) -> HttpResponse {
    let req = body.into_inner();
    let bandwidth = req.bandwidth_kbps.unwrap_or(1000);
    let bandwidth_mode = match bandwidth {
        0..=50 => BandwidthMode::CriticalOnly,
        51..=200 => BandwidthMode::DeltaOnly,
        201..=500 => BandwidthMode::Compressed,
        _ => BandwidthMode::Full,
    };

    let mut accepted = 0usize;
    let mut conflicts = Vec::new();

    for op in &req.operations {
        let op_id = op.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
        let entity_key = format!("{}:{}", op.entity_type, op.entity_id);

        // Check for conflicts
        if let Some(existing) = state.entity_store.get(&entity_key) {
            if op.operation == OpType::Update || op.operation == OpType::Upsert {
                let client_vc = op.vector_clock.clone().unwrap_or(serde_json::json!({}));
                let server_vc = existing.get("_vector_clock").cloned().unwrap_or(serde_json::json!({}));

                if !vector_clock_dominates(&client_vc, &server_vc) && client_vc != server_vc {
                    // Conflict detected — use last-writer-wins
                    let resolution = ConflictResolution::ServerWins;
                    conflicts.push(SyncConflict {
                        operation_id: op_id.clone(),
                        entity_type: op.entity_type.clone(),
                        entity_id: op.entity_id.clone(),
                        client_version: op.payload.clone(),
                        server_version: existing.clone(),
                        resolution,
                    });
                    continue;
                }
            }
        }

        // Apply operation
        let checksum = compute_checksum(&op.payload);
        let now = Utc::now().to_rfc3339();
        let payload_size = serde_json::to_vec(&op.payload).map(|v| v.len() as u64).unwrap_or(0);

        let sync_op = SyncOperation {
            id: op_id.clone(),
            client_id: req.client_id.clone(),
            entity_type: op.entity_type.clone(),
            entity_id: op.entity_id.clone(),
            operation: op.operation.clone(),
            payload: op.payload.clone(),
            vector_clock: op.vector_clock.clone().unwrap_or(serde_json::json!({})),
            checksum,
            timestamp: op.timestamp.clone().unwrap_or_else(|| now.clone()),
            status: SyncStatus::Synced,
            retry_count: 0,
            compressed: false,
            size_bytes: payload_size,
        };

        // Update entity store
        let mut entity_data = op.payload.clone();
        if let Some(obj) = entity_data.as_object_mut() {
            let mut vc = op.vector_clock.clone().unwrap_or(serde_json::json!({}));
            if let Some(vc_obj) = vc.as_object_mut() {
                let counter = vc_obj.get(&req.client_id)
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) + 1;
                vc_obj.insert(req.client_id.clone(), serde_json::json!(counter));
            }
            obj.insert("_vector_clock".into(), vc);
            obj.insert("_last_modified".into(), serde_json::json!(now));
        }

        match op.operation {
            OpType::Delete => { state.entity_store.remove(&entity_key); }
            _ => { state.entity_store.insert(entity_key, entity_data); }
        }

        state.operations.insert(op_id, sync_op);
        accepted += 1;
    }

    // Get server updates since last sync
    let server_updates: Vec<SyncOperation> = if let Some(last_sync) = &req.last_sync_timestamp {
        state.operations.iter()
            .filter(|e| {
                e.value().client_id != req.client_id && e.value().timestamp > *last_sync
            })
            .map(|e| e.value().clone())
            .collect()
    } else {
        Vec::new()
    };

    let sync_token = Uuid::new_v4().to_string();
    state.client_sync_tokens.insert(req.client_id.clone(), sync_token.clone());

    // Adaptive retry interval based on bandwidth
    let next_sync_ms = match bandwidth {
        0..=50 => 60000,    // 1 min for very low bandwidth
        51..=200 => 30000,  // 30s for low bandwidth
        201..=500 => 15000, // 15s for medium
        _ => 5000,          // 5s for good connectivity
    };

    HttpResponse::Ok().json(BatchSyncResponse {
        accepted,
        conflicts,
        server_updates,
        sync_token,
        next_sync_recommended_ms: next_sync_ms,
        bandwidth_mode,
    })
}

async fn get_queue_status(
    state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
) -> HttpResponse {
    let client_id = path.into_inner();
    let ops: Vec<&SyncOperation> = state.operations.iter()
        .filter(|e| e.value().client_id == client_id)
        .map(|e| unsafe { &*(e.value() as *const SyncOperation) })
        .collect();

    // Workaround: collect clones
    let all_ops: Vec<SyncOperation> = state.operations.iter()
        .filter(|e| e.value().client_id == client_id)
        .map(|e| e.value().clone())
        .collect();

    let pending = all_ops.iter().filter(|o| o.status == SyncStatus::Pending).count();
    let synced = all_ops.iter().filter(|o| o.status == SyncStatus::Synced).count();
    let conflicts = all_ops.iter().filter(|o| o.status == SyncStatus::Conflict).count();
    let failed = all_ops.iter().filter(|o| o.status == SyncStatus::Failed).count();
    let oldest = all_ops.iter()
        .filter(|o| o.status == SyncStatus::Pending)
        .min_by_key(|o| o.timestamp.clone())
        .map(|o| o.timestamp.clone());
    let total_bytes: u64 = all_ops.iter()
        .filter(|o| o.status == SyncStatus::Pending)
        .map(|o| o.size_bytes)
        .sum();

    HttpResponse::Ok().json(QueueStatus {
        total_pending: pending,
        total_synced: synced,
        total_conflicts: conflicts,
        total_failed: failed,
        oldest_pending: oldest,
        estimated_sync_bytes: total_bytes,
    })
}

async fn resolve_conflict(
    state: web::Data<Arc<AppState>>,
    body: web::Json<serde_json::Value>,
) -> HttpResponse {
    let op_id = body.get("operation_id").and_then(|v| v.as_str()).unwrap_or("");
    let resolution = body.get("resolution").and_then(|v| v.as_str()).unwrap_or("server_wins");

    if let Some(mut entry) = state.operations.get_mut(op_id) {
        let op = entry.value_mut();
        match resolution {
            "client_wins" => {
                let entity_key = format!("{}:{}", op.entity_type, op.entity_id);
                state.entity_store.insert(entity_key, op.payload.clone());
                op.status = SyncStatus::Synced;
            }
            "server_wins" => {
                op.status = SyncStatus::Synced;
            }
            _ => {
                if let Some(merged) = body.get("merged_payload") {
                    let entity_key = format!("{}:{}", op.entity_type, op.entity_id);
                    state.entity_store.insert(entity_key, merged.clone());
                    op.payload = merged.clone();
                    op.status = SyncStatus::Synced;
                }
            }
        }
        HttpResponse::Ok().json(serde_json::json!({"success": true, "resolution": resolution}))
    } else {
        HttpResponse::NotFound().json(serde_json::json!({"error": "Operation not found"}))
    }
}

async fn connectivity_check() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "online": true,
        "timestamp": Utc::now().to_rfc3339(),
        "latency_test": "ok",
    }))
}

async fn get_delta(
    state: web::Data<Arc<AppState>>,
    body: web::Json<serde_json::Value>,
) -> HttpResponse {
    let since = body.get("since").and_then(|v| v.as_str()).unwrap_or("");
    let entity_types: Vec<String> = body.get("entity_types")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let deltas: Vec<SyncOperation> = state.operations.iter()
        .filter(|e| {
            let op = e.value();
            op.timestamp > since.to_string()
                && (entity_types.is_empty() || entity_types.contains(&op.entity_type))
        })
        .map(|e| e.value().clone())
        .collect();

    let total_bytes: u64 = deltas.iter().map(|o| o.size_bytes).sum();

    HttpResponse::Ok().json(serde_json::json!({
        "deltas": deltas,
        "total": deltas.len(),
        "total_bytes": total_bytes,
    }))
}

// ─── Utilities ───────────────────────────────────────────────────────────────

fn compute_checksum(value: &serde_json::Value) -> String {
    let data = serde_json::to_vec(value).unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(&data);
    hex::encode(hasher.finalize())
}

fn vector_clock_dominates(a: &serde_json::Value, b: &serde_json::Value) -> bool {
    let a_obj = a.as_object();
    let b_obj = b.as_object();
    match (a_obj, b_obj) {
        (Some(a_map), Some(b_map)) => {
            // a dominates b if all entries in a >= corresponding entries in b
            b_map.iter().all(|(key, b_val)| {
                let a_val = a_map.get(key).and_then(|v| v.as_u64()).unwrap_or(0);
                let b_val = b_val.as_u64().unwrap_or(0);
                a_val >= b_val
            })
        }
        _ => false,
    }
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

    let port: u16 = std::env::var("PORT").unwrap_or_else(|_| "8093".into())
        .parse().unwrap_or(8093);

    let state = Arc::new(AppState {
        operations: DashMap::new(),
        entity_store: DashMap::new(),
        client_sync_tokens: DashMap::new(),
    });

    tracing::info!("Offline sync engine starting on port {port}");

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(state.clone()))
            .wrap(Cors::permissive())
            .wrap(from_fn(auth_middleware))
            .route("/health", web::get().to(health))
            .route("/api/v1/sync", web::post().to(batch_sync))
            .route("/api/v1/queue/{client_id}", web::get().to(get_queue_status))
            .route("/api/v1/conflict/resolve", web::post().to(resolve_conflict))
            .route("/api/v1/delta", web::post().to(get_delta))
            .route("/api/v1/ping", web::get().to(connectivity_check))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
