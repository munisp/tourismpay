//! Commission Engine — Africa GDS Payment Split Service
//! Real-time multi-party commission calculation and settlement splitting.
//! All data persisted to PostgreSQL.

use actix_cors::Cors;
use actix_web::{web, App, HttpServer, HttpResponse, middleware};
use deadpool_postgres::{Config, Pool, Runtime};
use serde::{Deserialize, Serialize};
use tokio_postgres::NoTls;
use uuid::Uuid;

const PORT: u16 = 8110;
const SERVICE_NAME: &str = "gds-commission-engine";
const DEFAULT_TENANT: &str = "00000000-0000-0000-0000-000000000001";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplitRequest {
    pub booking_id: String,
    pub property_id: String,
    pub agent_id: Option<String>,
    pub field_agent_id: Option<String>,
    pub gross_amount: f64,
    pub currency: String,
    pub country: String,
    pub booking_type: String,
    pub room_nights: u32,
    pub property_tier: String,
    pub agent_tier: Option<String>,
    pub is_group_booking: bool,
    pub channel: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplitResponse {
    pub id: String,
    pub booking_id: String,
    pub gross_amount: f64,
    pub currency: String,
    pub tax_amount: f64,
    pub tax_authority: String,
    pub platform_fee: f64,
    pub agent_commission: f64,
    pub field_agent_commission: f64,
    pub property_net: f64,
    pub country: String,
}

struct AppState {
    pool: Pool,
}

fn calculate_agent_rate(agent_tier: &str, channel: &str) -> f64 {
    let base: f64 = match agent_tier {
        "bronze" => 0.10,
        "silver" => 0.12,
        "gold" => 0.15,
        "platinum" => 0.18,
        _ => 0.10,
    };
    let channel_bonus: f64 = match channel {
        "direct" => 0.02,
        "api" => 0.01,
        "gds_portal" => 0.0,
        "whatsapp" => -0.02,
        _ => 0.0,
    };
    (base + channel_bonus).max(0.05).min(0.25)
}

fn calculate_platform_fee(gross: f64, booking_type: &str, is_group: bool) -> f64 {
    let base_rate: f64 = match booking_type {
        "standard" => 0.03,
        "premium" => 0.025,
        "group" => 0.02,
        "corporate" => 0.015,
        _ => 0.03,
    };
    let group_discount: f64 = if is_group { 0.005 } else { 0.0 };
    gross * (base_rate - group_discount).max(0.01)
}

fn calculate_tax_withholding(gross: f64, country: &str) -> (f64, String) {
    let (rate, authority) = match country {
        "KE" => (0.02, "KRA"),
        "NG" => (0.05, "FIRS"),
        "GH" => (0.025, "GRA"),
        "ZA" => (0.03, "SARS"),
        "TZ" => (0.02, "TRA"),
        "RW" => (0.015, "RRA"),
        "UG" => (0.06, "URA"),
        _ => (0.02, "UNKNOWN"),
    };
    (gross * rate, authority.to_string())
}

fn calculate_field_agent_commission(gross: f64, property_tier: &str) -> f64 {
    let rate = match property_tier {
        "sms_only" => 0.02,
        "whatsapp" => 0.015,
        "web_lite" => 0.01,
        "full" => 0.005,
        _ => 0.0,
    };
    gross * rate
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
        "service": SERVICE_NAME,
        "database": db_status
    }))
}

async fn calculate_split(data: web::Data<AppState>, body: web::Json<SplitRequest>) -> HttpResponse {
    let req = body.into_inner();
    let id = Uuid::new_v4().to_string();

    let (tax_amount, tax_authority) = calculate_tax_withholding(req.gross_amount, &req.country);
    let platform_fee = calculate_platform_fee(req.gross_amount, &req.booking_type, req.is_group_booking);
    let agent_tier = req.agent_tier.as_deref().unwrap_or("bronze");
    let agent_rate = calculate_agent_rate(agent_tier, &req.channel);
    let agent_commission = req.gross_amount * agent_rate;
    let field_commission = calculate_field_agent_commission(req.gross_amount, &req.property_tier);
    let property_net = req.gross_amount - tax_amount - platform_fee - agent_commission - field_commission;

    // Persist to DB
    if let Ok(client) = data.pool.get().await {
        let _ = client.execute(
            "INSERT INTO gds_commission_splits (id, tenant_id, booking_id, property_id, gross_amount, currency, \
             tax_amount, tax_authority, platform_fee, agent_commission, field_agent_commission, property_net, country, status) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'completed')",
            &[&id, &DEFAULT_TENANT, &req.booking_id, &req.property_id, &req.gross_amount,
              &req.currency, &tax_amount, &tax_authority, &platform_fee, &agent_commission,
              &field_commission, &property_net, &req.country],
        ).await;
    }

    let response = SplitResponse {
        id,
        booking_id: req.booking_id,
        gross_amount: req.gross_amount,
        currency: req.currency,
        tax_amount,
        tax_authority,
        platform_fee,
        agent_commission,
        field_agent_commission: field_commission,
        property_net,
        country: req.country,
    };

    HttpResponse::Ok().json(serde_json::json!({"split": response}))
}

async fn list_splits(data: web::Data<AppState>) -> HttpResponse {
    let client = match data.pool.get().await {
        Ok(c) => c,
        Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
    };
    let rows = match client.query(
        "SELECT id, booking_id, property_id, gross_amount, currency, tax_amount, platform_fee, \
         agent_commission, field_agent_commission, property_net, country, status \
         FROM gds_commission_splits WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50",
        &[&DEFAULT_TENANT],
    ).await {
        Ok(r) => r,
        Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
    };

    let splits: Vec<serde_json::Value> = rows.iter().map(|row| {
        serde_json::json!({
            "id": row.get::<_, String>(0),
            "booking_id": row.get::<_, String>(1),
            "property_id": row.get::<_, String>(2),
            "gross_amount": row.get::<_, f64>(3),
            "currency": row.get::<_, String>(4),
            "tax_amount": row.get::<_, f64>(5),
            "platform_fee": row.get::<_, f64>(6),
            "agent_commission": row.get::<_, f64>(7),
            "field_agent_commission": row.get::<_, f64>(8),
            "property_net": row.get::<_, f64>(9),
            "country": row.get::<_, String>(10),
            "status": row.get::<_, String>(11),
        })
    }).collect();

    HttpResponse::Ok().json(serde_json::json!({"splits": splits, "total": splits.len()}))
}

async fn get_rules(data: web::Data<AppState>) -> HttpResponse {
    let client = match data.pool.get().await {
        Ok(c) => c,
        Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
    };
    let rows = match client.query(
        "SELECT id, name, stakeholder_type, rate_type, rate, min_amount, max_amount, currency, status \
         FROM gds_commission_rules WHERE tenant_id=$1",
        &[&DEFAULT_TENANT],
    ).await {
        Ok(r) => r,
        Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": e.to_string()})),
    };

    let rules: Vec<serde_json::Value> = rows.iter().map(|row| {
        serde_json::json!({
            "id": row.get::<_, String>(0),
            "name": row.get::<_, String>(1),
            "stakeholder_type": row.get::<_, String>(2),
            "rate_type": row.get::<_, String>(3),
            "rate": row.get::<_, f64>(4),
            "min_amount": row.get::<_, f64>(5),
            "max_amount": row.get::<_, f64>(6),
            "currency": row.get::<_, String>(7),
            "status": row.get::<_, String>(8),
        })
    }).collect();

    HttpResponse::Ok().json(serde_json::json!({"rules": rules, "total": rules.len()}))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://postgres:postgres@localhost:5432/tourismpay".to_string());

    let mut cfg = Config::new();
    cfg.url = Some(database_url);
    let pool = cfg.create_pool(Some(Runtime::Tokio1), NoTls)
        .expect("Failed to create DB pool");

    // Test connection
    match pool.get().await {
        Ok(client) => {
            client.query_one("SELECT 1", &[]).await.expect("DB ping failed");
            println!("[DB] PostgreSQL connected");
        }
        Err(e) => panic!("[DB] Connection failed: {}", e),
    }

    let state = web::Data::new(AppState { pool });

    println!("[Commission Engine] Starting on port {} with PostgreSQL", PORT);
    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .wrap(Cors::permissive())
            .wrap(middleware::Logger::default())
            .route("/health", web::get().to(health))
            .route("/api/v1/commission/split", web::post().to(calculate_split))
            .route("/api/v1/commission/splits", web::get().to(list_splits))
            .route("/api/v1/commission/rules", web::get().to(get_rules))
    })
    .bind(format!("0.0.0.0:{}", PORT))?
    .run()
    .await
}
