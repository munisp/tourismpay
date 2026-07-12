//! Queue System — High-throughput agent work queue for Africa-first GDS.
//! All data persisted to PostgreSQL.

use actix_web::{web, App, HttpServer, HttpResponse, middleware};
use deadpool_postgres::{Config, Pool, Runtime};
use serde::{Deserialize, Serialize};
use tokio_postgres::NoTls;
use uuid::Uuid;

const PORT: u16 = 8083;
const DEFAULT_TENANT: &str = "00000000-0000-0000-0000-000000000001";

#[derive(Debug, Serialize, Deserialize)]
pub struct QueueItem {
    pub pnr_locator: String,
    pub queue_type: String,
    pub priority: String,
    pub assigned_agent: Option<String>,
    pub description: String,
}

struct AppState {
    pool: Pool,
}

async fn health(data: web::Data<AppState>) -> HttpResponse {
    let db_status = match data.pool.get().await {
        Ok(client) => match client.query_one("SELECT 1", &[]).await {
            Ok(_) => "connected",
            Err(_) => "error",
        },
        Err(_) => "disconnected",
    };
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "gds-queue-system",
        "database": db_status
    }))
}

async fn add_to_queue(data: web::Data<AppState>, body: web::Json<QueueItem>) -> HttpResponse {
    let item = body.into_inner();
    let id = Uuid::new_v4().to_string();

    let client = match data.pool.get().await {
        Ok(c) => c,
        Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
    };

    match client.execute(
        "INSERT INTO gds_queue_items (id, tenant_id, pnr_locator, queue_type, priority, assigned_agent, description, status) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')",
        &[&id, &DEFAULT_TENANT, &item.pnr_locator, &item.queue_type, &item.priority,
          &item.assigned_agent, &item.description],
    ).await {
        Ok(_) => HttpResponse::Created().json(serde_json::json!({
            "id": id, "pnr_locator": item.pnr_locator,
            "queue_type": item.queue_type, "priority": item.priority, "status": "pending"
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
    }
}

async fn list_queue(data: web::Data<AppState>) -> HttpResponse {
    let client = match data.pool.get().await {
        Ok(c) => c,
        Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
    };

    let rows = match client.query(
        "SELECT id, pnr_locator, queue_type, priority, assigned_agent, description, status, created_at \
         FROM gds_queue_items WHERE tenant_id=$1 ORDER BY \
         CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, \
         created_at ASC LIMIT 100",
        &[&DEFAULT_TENANT],
    ).await {
        Ok(r) => r,
        Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
    };

    let items: Vec<serde_json::Value> = rows.iter().map(|row| {
        serde_json::json!({
            "id": row.get::<_, String>(0),
            "pnr_locator": row.get::<_, String>(1),
            "queue_type": row.get::<_, String>(2),
            "priority": row.get::<_, String>(3),
            "assigned_agent": row.get::<_, Option<String>>(4),
            "description": row.get::<_, String>(5),
            "status": row.get::<_, String>(6),
        })
    }).collect();

    HttpResponse::Ok().json(serde_json::json!({"items": items, "total": items.len()}))
}

async fn get_stats(data: web::Data<AppState>) -> HttpResponse {
    let client = match data.pool.get().await {
        Ok(c) => c,
        Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
    };

    let total: i64 = client.query_one(
        "SELECT COUNT(*) FROM gds_queue_items WHERE tenant_id=$1", &[&DEFAULT_TENANT]
    ).await.map(|r| r.get(0)).unwrap_or(0);

    let pending: i64 = client.query_one(
        "SELECT COUNT(*) FROM gds_queue_items WHERE tenant_id=$1 AND status='pending'", &[&DEFAULT_TENANT]
    ).await.map(|r| r.get(0)).unwrap_or(0);

    let urgent: i64 = client.query_one(
        "SELECT COUNT(*) FROM gds_queue_items WHERE tenant_id=$1 AND priority IN ('critical','high')", &[&DEFAULT_TENANT]
    ).await.map(|r| r.get(0)).unwrap_or(0);

    HttpResponse::Ok().json(serde_json::json!({
        "total": total, "pending": pending, "urgent": urgent,
        "completed": total - pending,
    }))
}

async fn assign_item(data: web::Data<AppState>, path: web::Path<String>, body: web::Json<serde_json::Value>) -> HttpResponse {
    let id = path.into_inner();
    let agent = body.get("agentId").and_then(|v| v.as_str()).unwrap_or("unassigned");

    let client = match data.pool.get().await {
        Ok(c) => c,
        Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
    };

    match client.execute(
        "UPDATE gds_queue_items SET assigned_agent=$1, status='assigned', updated_at=NOW() WHERE id=$2 AND tenant_id=$3",
        &[&agent.to_string(), &id, &DEFAULT_TENANT],
    ).await {
        Ok(n) if n > 0 => HttpResponse::Ok().json(serde_json::json!({"id": id, "assigned_agent": agent, "status": "assigned"})),
        Ok(_) => HttpResponse::NotFound().json(serde_json::json!({"error": "queue item not found"})),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
    }
}

async fn complete_item(data: web::Data<AppState>, path: web::Path<String>) -> HttpResponse {
    let id = path.into_inner();
    let client = match data.pool.get().await {
        Ok(c) => c,
        Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
    };

    match client.execute(
        "UPDATE gds_queue_items SET status='completed', updated_at=NOW() WHERE id=$1 AND tenant_id=$2",
        &[&id, &DEFAULT_TENANT],
    ).await {
        Ok(n) if n > 0 => HttpResponse::Ok().json(serde_json::json!({"id": id, "status": "completed"})),
        Ok(_) => HttpResponse::NotFound().json(serde_json::json!({"error": "queue item not found"})),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://postgres:postgres@localhost:5432/tourismpay".to_string());

    let mut cfg = Config::new();
    cfg.url = Some(database_url);
    let pool = cfg.create_pool(Some(Runtime::Tokio1), NoTls)
        .expect("Failed to create DB pool");

    match pool.get().await {
        Ok(client) => {
            client.query_one("SELECT 1", &[]).await.expect("DB ping failed");
            println!("[DB] PostgreSQL connected");
        }
        Err(e) => panic!("[DB] Connection failed: {}", e),
    }

    let state = web::Data::new(AppState { pool });

    println!("[Queue System] Starting on port {} with PostgreSQL", PORT);
    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .wrap(middleware::Logger::default())
            .route("/health", web::get().to(health))
            .route("/api/v1/queues", web::post().to(add_to_queue))
            .route("/api/v1/queues", web::get().to(list_queue))
            .route("/api/v1/queues/stats", web::get().to(get_stats))
            .route("/api/v1/queues/{id}/assign", web::post().to(assign_item))
            .route("/api/v1/queues/{id}/complete", web::post().to(complete_item))
    })
    .bind(format!("0.0.0.0:{}", PORT))?
    .run()
    .await
}
