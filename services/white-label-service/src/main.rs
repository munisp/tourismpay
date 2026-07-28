use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{delete, get, post, put},
    Router,
};
use serde::{Deserialize, Serialize};
use sqlx::{postgres::PgPoolOptions, PgPool, Row};
use std::{collections::HashMap, env, net::SocketAddr};

#[derive(Clone)]
pub struct AppState { pub db: PgPool }

async fn health(State(s): State<AppState>) -> Json<serde_json::Value> {
    match sqlx::query("SELECT 1").fetch_one(&s.db).await {
        Ok(_) => Json(serde_json::json!({"status":"healthy","service":"white-label-service","version":"1.0.0"})),
        Err(e) => Json(serde_json::json!({"status":"unhealthy","error":e.to_string()})),
    }
}

async fn create_tenant(State(s): State<AppState>, Json(body): Json<serde_json::Value>) -> (StatusCode, Json<serde_json::Value>) {
    let name = body["name"].as_str().unwrap_or("").to_string();
    let slug = body["slug"].as_str().unwrap_or("").to_string();
    let country = body["country"].as_str().unwrap_or("NG").to_string();
    let primary_color = body["primary_color"].as_str().unwrap_or("#1a56db").to_string();
    let logo_url = body["logo_url"].as_str().unwrap_or("").to_string();
    let contact_email = body["contact_email"].as_str().unwrap_or("").to_string();
    let plan = body["plan"].as_str().unwrap_or("starter").to_string();
    if name.is_empty() || slug.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"name and slug are required"})));
    }
    let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    let tenant_id = format!("TENANT-{:010X}", ts % 0xFFFFFFFFFF);
    let api_key = format!("tp_live_{:032X}", ts % 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF_u128);
    let res = sqlx::query(
        "INSERT INTO white_label_tenants (id,name,slug,country,primary_color,logo_url,contact_email,plan,api_key,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',NOW())"
    ).bind(&tenant_id).bind(&name).bind(&slug).bind(&country).bind(&primary_color)
     .bind(&logo_url).bind(&contact_email).bind(&plan).bind(&api_key)
     .execute(&s.db).await;
    match res {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::json!({"tenant_id":tenant_id,"slug":slug,"api_key":api_key,"message":format!("Tenant {} created. API key issued.",name)}))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":e.to_string()}))),
    }
}

async fn get_tenant(State(s): State<AppState>, Path(id): Path<String>) -> (StatusCode, Json<serde_json::Value>) {
    match sqlx::query("SELECT id,name,slug,country,primary_color,logo_url,contact_email,plan,status,created_at::text FROM white_label_tenants WHERE id=$1")
        .bind(&id).fetch_optional(&s.db).await {
        Ok(Some(r)) => (StatusCode::OK, Json(serde_json::json!({"id":r.get::<String,_>("id"),"name":r.get::<String,_>("name"),"slug":r.get::<String,_>("slug"),"country":r.get::<String,_>("country"),"primary_color":r.get::<String,_>("primary_color"),"logo_url":r.get::<String,_>("logo_url"),"contact_email":r.get::<String,_>("contact_email"),"plan":r.get::<String,_>("plan"),"status":r.get::<String,_>("status"),"created_at":r.get::<String,_>("created_at")}))),
        Ok(None) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Tenant not found"}))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":e.to_string()}))),
    }
}

async fn list_tenants(State(s): State<AppState>, Query(p): Query<HashMap<String,String>>) -> (StatusCode, Json<serde_json::Value>) {
    let status = p.get("status").cloned().unwrap_or_else(|| "active".to_string());
    match sqlx::query("SELECT id,name,slug,country,plan,status,created_at::text FROM white_label_tenants WHERE status=$1 ORDER BY created_at DESC LIMIT 100")
        .bind(&status).fetch_all(&s.db).await {
        Ok(rows) => {
            let v: Vec<serde_json::Value> = rows.iter().map(|r| serde_json::json!({"id":r.get::<String,_>("id"),"name":r.get::<String,_>("name"),"slug":r.get::<String,_>("slug"),"country":r.get::<String,_>("country"),"plan":r.get::<String,_>("plan"),"status":r.get::<String,_>("status"),"created_at":r.get::<String,_>("created_at")})).collect();
            (StatusCode::OK, Json(serde_json::json!(v)))
        },
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":e.to_string()}))),
    }
}

async fn update_tenant(State(s): State<AppState>, Path(id): Path<String>, Json(body): Json<serde_json::Value>) -> (StatusCode, Json<serde_json::Value>) {
    let primary_color = body["primary_color"].as_str().unwrap_or("#1a56db");
    let logo_url = body["logo_url"].as_str().unwrap_or("");
    let plan = body["plan"].as_str().unwrap_or("starter");
    let status = body["status"].as_str().unwrap_or("active");
    let res = sqlx::query("UPDATE white_label_tenants SET primary_color=$1,logo_url=$2,plan=$3,status=$4 WHERE id=$5")
        .bind(primary_color).bind(logo_url).bind(plan).bind(status).bind(&id).execute(&s.db).await;
    match res {
        Ok(r) if r.rows_affected() > 0 => (StatusCode::OK, Json(serde_json::json!({"success":true,"message":"Tenant updated"}))),
        Ok(_) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Tenant not found"}))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":e.to_string()}))),
    }
}

async fn rotate_api_key(State(s): State<AppState>, Path(id): Path<String>) -> (StatusCode, Json<serde_json::Value>) {
    let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    let new_key = format!("tp_live_{:032X}", ts % 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF_u128);
    let res = sqlx::query("UPDATE white_label_tenants SET api_key=$1 WHERE id=$2")
        .bind(&new_key).bind(&id).execute(&s.db).await;
    match res {
        Ok(r) if r.rows_affected() > 0 => (StatusCode::OK, Json(serde_json::json!({"api_key":new_key,"message":"API key rotated successfully"}))),
        Ok(_) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Tenant not found"}))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":e.to_string()}))),
    }
}

async fn ensure_tables(pool: &PgPool) {
    let _ = sqlx::query("CREATE TABLE IF NOT EXISTS white_label_tenants (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255) NOT NULL, slug VARCHAR(128) NOT NULL UNIQUE, country VARCHAR(2) NOT NULL DEFAULT 'NG', primary_color VARCHAR(20) NOT NULL DEFAULT '#1a56db', logo_url VARCHAR(512), contact_email VARCHAR(320), plan VARCHAR(20) NOT NULL DEFAULT 'starter', api_key VARCHAR(128) NOT NULL UNIQUE, status VARCHAR(20) NOT NULL DEFAULT 'active', created_at TIMESTAMP NOT NULL DEFAULT NOW()); CREATE INDEX IF NOT EXISTS wl_tenants_slug_idx ON white_label_tenants(slug); CREATE INDEX IF NOT EXISTS wl_tenants_status_idx ON white_label_tenants(status);").execute(pool).await;
}

#[tokio::main]
async fn main() {
    let db_url = env::var("DATABASE_URL").unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/tourismpay".to_string());
    let pool = PgPoolOptions::new().max_connections(10).connect(&db_url).await.expect("DB connect failed");
    ensure_tables(&pool).await;
    let state = AppState { db: pool };
    let app = Router::new()
        .route("/health", get(health))
        .route("/tenants", post(create_tenant))
        .route("/tenants", get(list_tenants))
        .route("/tenants/:id", get(get_tenant))
        .route("/tenants/:id", put(update_tenant))
        .route("/tenants/:id/rotate-key", post(rotate_api_key))
        .with_state(state);
    let port = env::var("PORT").unwrap_or_else(|_| "8099".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    println!("White Label Service starting on :{}", port);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
