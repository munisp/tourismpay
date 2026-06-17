//! GDS Queue System — High-throughput agent work queues with priority, auto-assignment, SLA timers.
//! Integrates with: Kafka (events), Redis (state), Fluvio (real-time streams), Permify (authz).
//!
//! Queue Types:
//! - Ticketing: PNRs awaiting payment/issuance
//! - Schedule Change: Supplier-initiated modifications
//! - Waitlist: Confirmed-on-availability segments
//! - Cancellation: Refund processing
//! - Quality Control: Random audit sampling
//! - Urgent: SLA breach escalations

use actix_web::{web, App, HttpServer, HttpResponse, middleware};
use chrono::{DateTime, Utc, Duration};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

// --- Domain Models ---

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum QueueType {
    Ticketing,
    ScheduleChange,
    Waitlist,
    Cancellation,
    QualityControl,
    Urgent,
    General,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum Priority {
    Low = 1,
    Normal = 2,
    High = 3,
    Critical = 4,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueItem {
    pub id: String,
    pub queue_type: QueueType,
    pub priority: Priority,
    pub pnr_locator: String,
    pub tenant_id: String,
    pub agency_id: String,
    pub assigned_agent: Option<String>,
    pub status: String, // pending, assigned, in_progress, completed, escalated
    pub title: String,
    pub description: String,
    pub sla_deadline: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub assigned_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub escalation_count: u32,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatus {
    pub agent_id: String,
    pub tenant_id: String,
    pub agency_id: String,
    pub name: String,
    pub status: String, // available, busy, away, offline
    pub current_items: u32,
    pub max_capacity: u32,
    pub specializations: Vec<QueueType>,
    pub last_activity: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueStats {
    pub queue_type: QueueType,
    pub pending: u64,
    pub assigned: u64,
    pub completed_today: u64,
    pub avg_resolution_mins: f64,
    pub sla_breaches: u64,
    pub oldest_item_mins: f64,
}

// --- Application State ---

pub struct AppState {
    pub items: DashMap<String, QueueItem>,
    pub agents: DashMap<String, AgentStatus>,
}

impl AppState {
    fn new() -> Self {
        Self {
            items: DashMap::new(),
            agents: DashMap::new(),
        }
    }
}

// --- SLA Configuration ---

fn get_sla_duration(queue_type: &QueueType, priority: &Priority) -> Duration {
    match (queue_type, priority) {
        (QueueType::Urgent, _) => Duration::minutes(15),
        (QueueType::Ticketing, Priority::Critical) => Duration::minutes(30),
        (QueueType::Ticketing, Priority::High) => Duration::hours(1),
        (QueueType::Ticketing, _) => Duration::hours(4),
        (QueueType::ScheduleChange, Priority::Critical) => Duration::hours(1),
        (QueueType::ScheduleChange, _) => Duration::hours(8),
        (QueueType::Cancellation, _) => Duration::hours(2),
        (QueueType::Waitlist, _) => Duration::hours(24),
        (QueueType::QualityControl, _) => Duration::hours(48),
        (QueueType::General, Priority::Critical) => Duration::hours(2),
        (QueueType::General, _) => Duration::hours(12),
    }
}

// --- Handlers ---

#[derive(Deserialize)]
pub struct CreateItemReq {
    pub queue_type: QueueType,
    pub priority: Priority,
    pub pnr_locator: String,
    pub tenant_id: String,
    pub agency_id: String,
    pub title: String,
    pub description: String,
    pub metadata: Option<serde_json::Value>,
}

async fn create_item(
    state: web::Data<Arc<AppState>>,
    body: web::Json<CreateItemReq>,
) -> HttpResponse {
    let sla = get_sla_duration(&body.queue_type, &body.priority);
    let now = Utc::now();

    let item = QueueItem {
        id: Uuid::new_v4().to_string(),
        queue_type: body.queue_type.clone(),
        priority: body.priority.clone(),
        pnr_locator: body.pnr_locator.clone(),
        tenant_id: body.tenant_id.clone(),
        agency_id: body.agency_id.clone(),
        assigned_agent: None,
        status: "pending".to_string(),
        title: body.title.clone(),
        description: body.description.clone(),
        sla_deadline: now + sla,
        created_at: now,
        assigned_at: None,
        completed_at: None,
        escalation_count: 0,
        metadata: body.metadata.clone().unwrap_or(serde_json::Value::Null),
    };

    let id = item.id.clone();
    state.items.insert(id.clone(), item.clone());

    // In production: publish to Kafka + Fluvio stream
    // kafka.produce("gds.queue.items", &item).await;
    // fluvio.produce("queue-priority-stream", &item).await;

    HttpResponse::Created().json(serde_json::json!({
        "item": item,
        "sla_minutes": sla.num_minutes(),
    }))
}

async fn get_queue(
    state: web::Data<Arc<AppState>>,
    query: web::Query<GetQueueQuery>,
) -> HttpResponse {
    let items: Vec<QueueItem> = state.items.iter()
        .filter(|entry| {
            let item = entry.value();
            if let Some(ref qt) = query.queue_type {
                if &item.queue_type != qt { return false; }
            }
            if let Some(ref status) = query.status {
                if &item.status != status { return false; }
            }
            if let Some(ref tenant) = query.tenant_id {
                if &item.tenant_id != tenant { return false; }
            }
            true
        })
        .map(|entry| entry.value().clone())
        .collect();

    let total = items.len();
    HttpResponse::Ok().json(serde_json::json!({
        "items": items,
        "total": total,
    }))
}

#[derive(Deserialize)]
pub struct GetQueueQuery {
    pub queue_type: Option<QueueType>,
    pub status: Option<String>,
    pub tenant_id: Option<String>,
}

async fn assign_item(
    state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
    body: web::Json<AssignReq>,
) -> HttpResponse {
    let item_id = path.into_inner();

    if let Some(mut item) = state.items.get_mut(&item_id) {
        item.assigned_agent = Some(body.agent_id.clone());
        item.status = "assigned".to_string();
        item.assigned_at = Some(Utc::now());
        return HttpResponse::Ok().json(serde_json::json!({
            "message": "Item assigned",
            "item": item.clone(),
        }));
    }

    HttpResponse::NotFound().json(serde_json::json!({"error": "Item not found"}))
}

#[derive(Deserialize)]
pub struct AssignReq {
    pub agent_id: String,
}

async fn complete_item(
    state: web::Data<Arc<AppState>>,
    path: web::Path<String>,
) -> HttpResponse {
    let item_id = path.into_inner();

    if let Some(mut item) = state.items.get_mut(&item_id) {
        item.status = "completed".to_string();
        item.completed_at = Some(Utc::now());

        let sla_met = item.completed_at.unwrap() <= item.sla_deadline;
        return HttpResponse::Ok().json(serde_json::json!({
            "message": "Item completed",
            "sla_met": sla_met,
            "resolution_mins": (Utc::now() - item.created_at).num_minutes(),
        }));
    }

    HttpResponse::NotFound().json(serde_json::json!({"error": "Item not found"}))
}

async fn auto_assign(
    state: web::Data<Arc<AppState>>,
    body: web::Json<AutoAssignReq>,
) -> HttpResponse {
    // Round-robin assignment to available agents with capacity
    let available_agents: Vec<AgentStatus> = state.agents.iter()
        .filter(|entry| {
            let agent = entry.value();
            agent.status == "available"
                && agent.current_items < agent.max_capacity
                && agent.tenant_id == body.tenant_id
        })
        .map(|entry| entry.value().clone())
        .collect();

    if available_agents.is_empty() {
        return HttpResponse::Ok().json(serde_json::json!({
            "message": "No available agents",
            "assigned": 0,
        }));
    }

    let pending_items: Vec<String> = state.items.iter()
        .filter(|entry| {
            let item = entry.value();
            item.status == "pending" && item.tenant_id == body.tenant_id
        })
        .map(|entry| entry.key().clone())
        .collect();

    let mut assigned_count = 0;
    for (i, item_id) in pending_items.iter().enumerate() {
        let agent = &available_agents[i % available_agents.len()];
        if let Some(mut item) = state.items.get_mut(item_id) {
            item.assigned_agent = Some(agent.agent_id.clone());
            item.status = "assigned".to_string();
            item.assigned_at = Some(Utc::now());
            assigned_count += 1;
        }
    }

    HttpResponse::Ok().json(serde_json::json!({
        "message": format!("Auto-assigned {} items to {} agents", assigned_count, available_agents.len()),
        "assigned": assigned_count,
        "agents_used": available_agents.len(),
    }))
}

#[derive(Deserialize)]
pub struct AutoAssignReq {
    pub tenant_id: String,
}

async fn register_agent(
    state: web::Data<Arc<AppState>>,
    body: web::Json<AgentStatus>,
) -> HttpResponse {
    let agent_id = body.agent_id.clone();
    state.agents.insert(agent_id.clone(), body.into_inner());
    HttpResponse::Created().json(serde_json::json!({"message": "Agent registered", "agent_id": agent_id}))
}

async fn get_stats(
    state: web::Data<Arc<AppState>>,
) -> HttpResponse {
    let queue_types = vec![
        QueueType::Ticketing, QueueType::ScheduleChange, QueueType::Waitlist,
        QueueType::Cancellation, QueueType::QualityControl, QueueType::Urgent, QueueType::General,
    ];

    let stats: Vec<QueueStats> = queue_types.iter().map(|qt| {
        let items: Vec<QueueItem> = state.items.iter()
            .filter(|e| &e.value().queue_type == qt)
            .map(|e| e.value().clone())
            .collect();

        let pending = items.iter().filter(|i| i.status == "pending").count() as u64;
        let assigned = items.iter().filter(|i| i.status == "assigned").count() as u64;
        let completed: Vec<&QueueItem> = items.iter().filter(|i| i.status == "completed").collect();
        let breaches = items.iter().filter(|i| Utc::now() > i.sla_deadline && i.status != "completed").count() as u64;

        let oldest_mins = items.iter()
            .filter(|i| i.status == "pending")
            .map(|i| (Utc::now() - i.created_at).num_minutes() as f64)
            .fold(0.0_f64, f64::max);

        let avg_resolution = if completed.is_empty() {
            0.0
        } else {
            completed.iter()
                .filter_map(|i| i.completed_at.map(|c| (c - i.created_at).num_minutes() as f64))
                .sum::<f64>() / completed.len() as f64
        };

        QueueStats {
            queue_type: qt.clone(),
            pending,
            assigned,
            completed_today: completed.len() as u64,
            avg_resolution_mins: avg_resolution,
            sla_breaches: breaches,
            oldest_item_mins: oldest_mins,
        }
    }).collect();

    HttpResponse::Ok().json(serde_json::json!({
        "stats": stats,
        "total_agents": state.agents.len(),
        "available_agents": state.agents.iter().filter(|e| e.value().status == "available").count(),
    }))
}

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "gds-queue-system",
        "version": "1.0.0",
        "middleware": {
            "kafka": std::env::var("KAFKA_BROKERS").unwrap_or_default(),
            "fluvio": std::env::var("FLUVIO_ENDPOINT").unwrap_or_default(),
            "redis": std::env::var("REDIS_URL").unwrap_or_default(),
            "permify": std::env::var("PERMIFY_ENDPOINT").unwrap_or_default(),
        }
    }))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8083".to_string())
        .parse()
        .unwrap_or(8083);

    let state = Arc::new(AppState::new());

    println!("GDS Queue System starting on port {}", port);

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(state.clone()))
            .route("/health", web::get().to(health))
            .service(
                web::scope("/api/v1/queues")
                    .route("", web::post().to(create_item))
                    .route("", web::get().to(get_queue))
                    .route("/stats", web::get().to(get_stats))
                    .route("/auto-assign", web::post().to(auto_assign))
                    .route("/agents", web::post().to(register_agent))
                    .route("/{id}/assign", web::post().to(assign_item))
                    .route("/{id}/complete", web::post().to(complete_item))
            )
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
