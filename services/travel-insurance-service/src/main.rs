use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use sqlx::{postgres::PgPoolOptions, PgPool, Row};
use std::{collections::HashMap, env, net::SocketAddr};

#[derive(Clone)]
pub struct AppState { pub db: PgPool }

fn calculate_premium(policy_type: &str, duration_days: i32, country: &str, trip_cost: f64) -> (f64, f64) {
    let base_daily = match policy_type {
        "comprehensive" => 8.50, "medical" => 4.00, "baggage" => 1.50, _ => 5.00,
    };
    let country_mult = match country {
        "US" | "CA" => 1.8, "GB" | "DE" | "FR" => 1.3, "NG" | "GH" | "KE" => 1.2, _ => 1.0,
    };
    let premium = if policy_type == "cancellation" {
        trip_cost * 0.06 * country_mult
    } else {
        base_daily * duration_days as f64 * country_mult
    };
    let coverage = match policy_type {
        "comprehensive" => 500_000.0, "medical" => 250_000.0,
        "cancellation" => trip_cost, "baggage" => 5_000.0, _ => 100_000.0,
    };
    ((premium * 100.0).round() / 100.0, (coverage * 100.0).round() / 100.0)
}

async fn health(State(s): State<AppState>) -> Json<serde_json::Value> {
    match sqlx::query("SELECT 1").fetch_one(&s.db).await {
        Ok(_) => Json(serde_json::json!({"status":"healthy","service":"travel-insurance-service","version":"1.0.0"})),
        Err(e) => Json(serde_json::json!({"status":"unhealthy","error":e.to_string()})),
    }
}

async fn get_quote(Query(p): Query<HashMap<String,String>>) -> Json<serde_json::Value> {
    let pt = p.get("policy_type").map(|s| s.as_str()).unwrap_or("comprehensive");
    let days: i32 = p.get("trip_duration_days").and_then(|s| s.parse().ok()).unwrap_or(7);
    let country = p.get("destination_country").map(|s| s.as_str()).unwrap_or("NG");
    let cost: f64 = p.get("trip_cost").and_then(|s| s.parse().ok()).unwrap_or(500_000.0);
    let (premium, coverage) = calculate_premium(pt, days, country, cost);
    Json(serde_json::json!({"policy_type":pt,"trip_duration_days":days,"destination_country":country,"premium_amount":premium,"coverage_amount":coverage,"currency":"USD","quote_valid_minutes":30}))
}

async fn create_policy(State(s): State<AppState>, Json(body): Json<serde_json::Value>) -> (StatusCode, Json<serde_json::Value>) {
    let tourist_id = body["tourist_id"].as_str().unwrap_or("").to_string();
    let policy_type = body["policy_type"].as_str().unwrap_or("comprehensive").to_string();
    let duration: i32 = body["trip_duration_days"].as_i64().unwrap_or(7) as i32;
    let country = body["destination_country"].as_str().unwrap_or("NG").to_string();
    let trip_cost: f64 = body["trip_cost"].as_f64().unwrap_or(500_000.0);
    let start_date = body["start_date"].as_str().unwrap_or("2026-01-01").to_string();
    let end_date = body["end_date"].as_str().unwrap_or("2026-01-08").to_string();
    let currency = body["currency"].as_str().unwrap_or("USD").to_string();
    let (premium, coverage) = calculate_premium(&policy_type, duration, &country, trip_cost);
    let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    let policy_id = format!("INS-{:012X}", ts % 0xFFFFFFFFFFFF);
    let policy_number = format!("TP{:06}", ts % 1_000_000);
    let provider = "TourismPay Insurance Partners";
    let res = sqlx::query(
        "INSERT INTO insurance_policies (id,tourist_id,policy_type,coverage_amount,premium_amount,currency,start_date,end_date,destination_country,status,provider,policy_number,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8::date,$9,'active',$10,$11,NOW())"
    ).bind(&policy_id).bind(&tourist_id).bind(&policy_type).bind(coverage).bind(premium).bind(&currency)
     .bind(&start_date).bind(&end_date).bind(&country).bind(provider).bind(&policy_number)
     .execute(&s.db).await;
    match res {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::json!({"policy_id":policy_id,"policy_number":policy_number,"premium_amount":premium,"coverage_amount":coverage,"currency":currency,"message":format!("Policy {} created",policy_number)}))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":e.to_string()}))),
    }
}

async fn get_policy(State(s): State<AppState>, Path(id): Path<String>) -> (StatusCode, Json<serde_json::Value>) {
    match sqlx::query("SELECT id,tourist_id,policy_type,coverage_amount,premium_amount,currency,start_date::text,end_date::text,destination_country,status,provider,policy_number,created_at::text FROM insurance_policies WHERE id=$1")
        .bind(&id).fetch_optional(&s.db).await {
        Ok(Some(r)) => (StatusCode::OK, Json(serde_json::json!({"id":r.get::<String,_>("id"),"tourist_id":r.get::<String,_>("tourist_id"),"policy_type":r.get::<String,_>("policy_type"),"coverage_amount":r.get::<f64,_>("coverage_amount"),"premium_amount":r.get::<f64,_>("premium_amount"),"currency":r.get::<String,_>("currency"),"start_date":r.get::<String,_>("start_date"),"end_date":r.get::<String,_>("end_date"),"destination_country":r.get::<String,_>("destination_country"),"status":r.get::<String,_>("status"),"provider":r.get::<String,_>("provider"),"policy_number":r.get::<String,_>("policy_number"),"created_at":r.get::<String,_>("created_at")}))),
        Ok(None) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Policy not found"}))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":e.to_string()}))),
    }
}

async fn list_policies(State(s): State<AppState>, Query(p): Query<HashMap<String,String>>) -> (StatusCode, Json<serde_json::Value>) {
    let tourist_id = p.get("tourist_id").cloned().unwrap_or_default();
    match sqlx::query("SELECT id,policy_type,coverage_amount,premium_amount,currency,start_date::text,end_date::text,destination_country,status,policy_number,created_at::text FROM insurance_policies WHERE tourist_id=$1 ORDER BY created_at DESC LIMIT 20")
        .bind(&tourist_id).fetch_all(&s.db).await {
        Ok(rows) => {
            let v: Vec<serde_json::Value> = rows.iter().map(|r| serde_json::json!({"id":r.get::<String,_>("id"),"policy_type":r.get::<String,_>("policy_type"),"coverage_amount":r.get::<f64,_>("coverage_amount"),"premium_amount":r.get::<f64,_>("premium_amount"),"currency":r.get::<String,_>("currency"),"start_date":r.get::<String,_>("start_date"),"end_date":r.get::<String,_>("end_date"),"destination_country":r.get::<String,_>("destination_country"),"status":r.get::<String,_>("status"),"policy_number":r.get::<String,_>("policy_number"),"created_at":r.get::<String,_>("created_at")})).collect();
            (StatusCode::OK, Json(serde_json::json!(v)))
        },
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":e.to_string()}))),
    }
}

async fn create_claim(State(s): State<AppState>, Json(body): Json<serde_json::Value>) -> (StatusCode, Json<serde_json::Value>) {
    let policy_id = body["policy_id"].as_str().unwrap_or("").to_string();
    let tourist_id = body["tourist_id"].as_str().unwrap_or("").to_string();
    let claim_type = body["claim_type"].as_str().unwrap_or("general").to_string();
    let amount: f64 = body["amount_claimed"].as_f64().unwrap_or(0.0);
    let description = body["description"].as_str().unwrap_or("").to_string();
    let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    let claim_id = format!("CLM-{:012X}", ts % 0xFFFFFFFFFFFF);
    let res = sqlx::query(
        "INSERT INTO insurance_claims (id,policy_id,tourist_id,claim_type,amount_claimed,currency,description,status,created_at) VALUES ($1,$2,$3,$4,$5,'USD',$6,'submitted',NOW())"
    ).bind(&claim_id).bind(&policy_id).bind(&tourist_id).bind(&claim_type).bind(amount).bind(&description)
     .execute(&s.db).await;
    match res {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::json!({"claim_id":claim_id,"status":"submitted","message":format!("Claim {} submitted. Processing: 5-7 business days.",claim_id)}))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":e.to_string()}))),
    }
}

async fn list_claims(State(s): State<AppState>, Query(p): Query<HashMap<String,String>>) -> (StatusCode, Json<serde_json::Value>) {
    let tourist_id = p.get("tourist_id").cloned().unwrap_or_default();
    match sqlx::query("SELECT id,policy_id,claim_type,amount_claimed,COALESCE(amount_approved,0.0) as amount_approved,currency,description,status,created_at::text FROM insurance_claims WHERE tourist_id=$1 ORDER BY created_at DESC LIMIT 50")
        .bind(&tourist_id).fetch_all(&s.db).await {
        Ok(rows) => {
            let v: Vec<serde_json::Value> = rows.iter().map(|r| serde_json::json!({"id":r.get::<String,_>("id"),"policy_id":r.get::<String,_>("policy_id"),"claim_type":r.get::<String,_>("claim_type"),"amount_claimed":r.get::<f64,_>("amount_claimed"),"amount_approved":r.get::<f64,_>("amount_approved"),"currency":r.get::<String,_>("currency"),"description":r.get::<String,_>("description"),"status":r.get::<String,_>("status"),"created_at":r.get::<String,_>("created_at")})).collect();
            (StatusCode::OK, Json(serde_json::json!(v)))
        },
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":e.to_string()}))),
    }
}

async fn ensure_tables(pool: &PgPool) {
    let _ = sqlx::query("CREATE TABLE IF NOT EXISTS insurance_policies (id VARCHAR(64) PRIMARY KEY, tourist_id VARCHAR(64) NOT NULL, policy_type VARCHAR(30) NOT NULL, coverage_amount DECIMAL(15,2) NOT NULL, premium_amount DECIMAL(10,2) NOT NULL, currency VARCHAR(3) NOT NULL DEFAULT 'USD', start_date DATE NOT NULL, end_date DATE NOT NULL, destination_country VARCHAR(2) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'active', provider VARCHAR(128) NOT NULL, policy_number VARCHAR(20) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW()); CREATE INDEX IF NOT EXISTS ins_policies_tourist_idx ON insurance_policies(tourist_id); CREATE TABLE IF NOT EXISTS insurance_claims (id VARCHAR(64) PRIMARY KEY, policy_id VARCHAR(64) NOT NULL REFERENCES insurance_policies(id), tourist_id VARCHAR(64) NOT NULL, claim_type VARCHAR(50) NOT NULL, amount_claimed DECIMAL(15,2) NOT NULL, amount_approved DECIMAL(15,2), currency VARCHAR(3) NOT NULL DEFAULT 'USD', description TEXT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'submitted', created_at TIMESTAMP NOT NULL DEFAULT NOW(), resolved_at TIMESTAMP); CREATE INDEX IF NOT EXISTS ins_claims_tourist_idx ON insurance_claims(tourist_id);").execute(pool).await;
}

#[tokio::main]
async fn main() {
    let db_url = env::var("DATABASE_URL").unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/tourismpay".to_string());
    let pool = PgPoolOptions::new().max_connections(10).connect(&db_url).await.expect("DB connect failed");
    ensure_tables(&pool).await;
    let state = AppState { db: pool };
    let app = Router::new()
        .route("/health", get(health))
        .route("/quote", get(get_quote))
        .route("/policies", post(create_policy))
        .route("/policies", get(list_policies))
        .route("/policies/:id", get(get_policy))
        .route("/claims", post(create_claim))
        .route("/claims", get(list_claims))
        .with_state(state);
    let port = env::var("PORT").unwrap_or_else(|_| "8100".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    println!("Travel Insurance Service starting on :{}", port);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
