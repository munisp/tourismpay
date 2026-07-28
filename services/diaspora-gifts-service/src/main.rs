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

async fn health(State(s): State<AppState>) -> Json<serde_json::Value> {
    match sqlx::query("SELECT 1").fetch_one(&s.db).await {
        Ok(_) => Json(serde_json::json!({"status":"healthy","service":"diaspora-gifts-service","version":"1.0.0"})),
        Err(e) => Json(serde_json::json!({"status":"unhealthy","error":e.to_string()})),
    }
}

async fn create_gift(State(s): State<AppState>, Json(body): Json<serde_json::Value>) -> (StatusCode, Json<serde_json::Value>) {
    let sender_id = body["sender_id"].as_str().unwrap_or("").to_string();
    let recipient_name = body["recipient_name"].as_str().unwrap_or("").to_string();
    let recipient_email = body["recipient_email"].as_str().unwrap_or("").to_string();
    let hotel_id = body["hotel_id"].as_str().unwrap_or("").to_string();
    let gift_type = body["gift_type"].as_str().unwrap_or("hotel_credit").to_string();
    let amount: f64 = body["amount"].as_f64().unwrap_or(0.0);
    let currency = body["currency"].as_str().unwrap_or("USD").to_string();
    let message = body["message"].as_str().unwrap_or("").to_string();
    let occasion = body["occasion"].as_str().unwrap_or("general").to_string();
    if sender_id.is_empty() || recipient_email.is_empty() || amount <= 0.0 {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"sender_id, recipient_email, and amount are required"})));
    }
    let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    let gift_id = format!("GIFT-{:012X}", ts % 0xFFFFFFFFFFFF);
    let redemption_code = format!("{:08X}", (ts % 0xFFFFFFFF) as u32);
    let res = sqlx::query(
        "INSERT INTO diaspora_gifts (id,sender_id,recipient_name,recipient_email,hotel_id,gift_type,amount,currency,message,occasion,status,redemption_code,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,NOW())"
    ).bind(&gift_id).bind(&sender_id).bind(&recipient_name).bind(&recipient_email)
     .bind(&hotel_id).bind(&gift_type).bind(amount).bind(&currency)
     .bind(&message).bind(&occasion).bind(&redemption_code)
     .execute(&s.db).await;
    match res {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::json!({"gift_id":gift_id,"redemption_code":redemption_code,"amount":amount,"currency":currency,"message":format!("Gift {} created. Redemption code: {}",gift_id,redemption_code)}))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":e.to_string()}))),
    }
}

async fn redeem_gift(State(s): State<AppState>, Path(code): Path<String>, Json(body): Json<serde_json::Value>) -> (StatusCode, Json<serde_json::Value>) {
    let tourist_id = body["tourist_id"].as_str().unwrap_or("").to_string();
    let row = sqlx::query("SELECT id,amount,currency,gift_type,hotel_id,status FROM diaspora_gifts WHERE redemption_code=$1 LIMIT 1")
        .bind(&code).fetch_optional(&s.db).await;
    match row {
        Ok(Some(r)) => {
            let status: String = r.get("status");
            if status != "pending" {
                return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"Gift already redeemed or expired"})));
            }
            let gift_id: String = r.get("id");
            let amount: f64 = r.get("amount");
            let currency: String = r.get("currency");
            let _ = sqlx::query("UPDATE diaspora_gifts SET status='redeemed', redeemed_by=$1, redeemed_at=NOW() WHERE id=$2")
                .bind(&tourist_id).bind(&gift_id).execute(&s.db).await;
            (StatusCode::OK, Json(serde_json::json!({"success":true,"gift_id":gift_id,"amount":amount,"currency":currency,"message":format!("{} {} credited to your wallet",currency,amount)})))
        },
        Ok(None) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Gift not found"}))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":e.to_string()}))),
    }
}

async fn list_sent_gifts(State(s): State<AppState>, Query(p): Query<HashMap<String,String>>) -> (StatusCode, Json<serde_json::Value>) {
    let sender_id = p.get("sender_id").cloned().unwrap_or_default();
    match sqlx::query("SELECT id,recipient_name,recipient_email,gift_type,amount,currency,occasion,status,redemption_code,created_at::text FROM diaspora_gifts WHERE sender_id=$1 ORDER BY created_at DESC LIMIT 50")
        .bind(&sender_id).fetch_all(&s.db).await {
        Ok(rows) => {
            let v: Vec<serde_json::Value> = rows.iter().map(|r| serde_json::json!({"id":r.get::<String,_>("id"),"recipient_name":r.get::<String,_>("recipient_name"),"recipient_email":r.get::<String,_>("recipient_email"),"gift_type":r.get::<String,_>("gift_type"),"amount":r.get::<f64,_>("amount"),"currency":r.get::<String,_>("currency"),"occasion":r.get::<String,_>("occasion"),"status":r.get::<String,_>("status"),"redemption_code":r.get::<String,_>("redemption_code"),"created_at":r.get::<String,_>("created_at")})).collect();
            (StatusCode::OK, Json(serde_json::json!(v)))
        },
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":e.to_string()}))),
    }
}

async fn gift_stats(State(s): State<AppState>, Query(p): Query<HashMap<String,String>>) -> (StatusCode, Json<serde_json::Value>) {
    let sender_id = p.get("sender_id").cloned().unwrap_or_default();
    let row = sqlx::query("SELECT COUNT(*) as total, SUM(CASE WHEN status='redeemed' THEN 1 ELSE 0 END) as redeemed, SUM(amount) as total_value FROM diaspora_gifts WHERE sender_id=$1")
        .bind(&sender_id).fetch_one(&s.db).await;
    match row {
        Ok(r) => {
            let total: i64 = r.get("total");
            let redeemed: i64 = r.try_get("redeemed").unwrap_or(0);
            let total_value: f64 = r.try_get("total_value").unwrap_or(0.0);
            (StatusCode::OK, Json(serde_json::json!({"total_gifts":total,"redeemed":redeemed,"pending":total-redeemed,"total_value_usd":total_value})))
        },
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":e.to_string()}))),
    }
}

async fn ensure_tables(pool: &PgPool) {
    let _ = sqlx::query("CREATE TABLE IF NOT EXISTS diaspora_gifts (id VARCHAR(64) PRIMARY KEY, sender_id VARCHAR(64) NOT NULL, recipient_name VARCHAR(255), recipient_email VARCHAR(320) NOT NULL, hotel_id VARCHAR(64), gift_type VARCHAR(30) NOT NULL DEFAULT 'hotel_credit', amount DECIMAL(15,2) NOT NULL, currency VARCHAR(3) NOT NULL DEFAULT 'USD', message TEXT, occasion VARCHAR(50) DEFAULT 'general', status VARCHAR(20) NOT NULL DEFAULT 'pending', redemption_code VARCHAR(20) NOT NULL UNIQUE, redeemed_by VARCHAR(64), redeemed_at TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT NOW()); CREATE INDEX IF NOT EXISTS diaspora_gifts_sender_idx ON diaspora_gifts(sender_id); CREATE INDEX IF NOT EXISTS diaspora_gifts_code_idx ON diaspora_gifts(redemption_code);").execute(pool).await;
}

#[tokio::main]
async fn main() {
    let db_url = env::var("DATABASE_URL").unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/tourismpay".to_string());
    let pool = PgPoolOptions::new().max_connections(10).connect(&db_url).await.expect("DB connect failed");
    ensure_tables(&pool).await;
    let state = AppState { db: pool };
    let app = Router::new()
        .route("/health", get(health))
        .route("/gifts", post(create_gift))
        .route("/gifts", get(list_sent_gifts))
        .route("/gifts/redeem/:code", post(redeem_gift))
        .route("/gifts/stats", get(gift_stats))
        .with_state(state);
    let port = env::var("PORT").unwrap_or_else(|_| "8098".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    println!("Diaspora Gifts Service starting on :{}", port);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
