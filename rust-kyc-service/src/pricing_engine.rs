use actix_web::{web, HttpResponse};
use chrono::Datelike;
use serde::{Deserialize, Serialize};

/// Real-time pricing aggregation and availability engine for trip planner.
/// Combines merchant pricing, FX rates, and seasonal multipliers to provide
/// accurate cost estimates for itinerary items.

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PricingRequest {
    pub country: String,
    pub items: Vec<PricingItem>,
    pub currency: Option<String>,
    pub travelers: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PricingItem {
    pub merchant_id: i32,
    pub product_id: Option<i32>,
    pub category: String,
    pub base_price_usd: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PricingResponse {
    pub items: Vec<PricedItem>,
    pub total_usd: f64,
    pub total_local: f64,
    pub local_currency: String,
    pub exchange_rate: f64,
    pub seasonal_multiplier: f64,
    pub savings_vs_walk_in: f64,
    pub tourismpay_discount: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PricedItem {
    pub merchant_id: i32,
    pub product_id: Option<i32>,
    pub category: String,
    pub base_price_usd: f64,
    pub final_price_usd: f64,
    pub final_price_local: f64,
    pub available: bool,
    pub seasonal_note: String,
    pub tourismpay_price: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AvailabilityCheck {
    pub country: String,
    pub merchant_ids: Vec<i32>,
    pub date: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AvailabilityResult {
    pub merchant_id: i32,
    pub available: bool,
    pub next_available: Option<String>,
    pub capacity_pct: f64,
    pub note: String,
}

// Exchange rates: 1 USD = X local
fn get_exchange_rate(country: &str) -> (f64, &'static str) {
    match country.to_uppercase().as_str() {
        "NG" => (1550.0, "NGN"),
        "KE" => (155.0, "KES"),
        "GH" => (15.2, "GHS"),
        "ZA" => (18.5, "ZAR"),
        "TZ" => (2650.0, "TZS"),
        "EG" => (48.5, "EGP"),
        "MA" => (10.0, "MAD"),
        "RW" => (1290.0, "RWF"),
        "SN" => (610.0, "XOF"),
        "ET" => (56.0, "ETB"),
        "UG" => (3750.0, "UGX"),
        _ => (1.0, "USD"),
    }
}

fn get_seasonal_multiplier(country: &str) -> (f64, &'static str) {
    let month = chrono::Utc::now().month();
    match country.to_uppercase().as_str() {
        "NG" => {
            if month == 12 {
                (1.35, "Detty December — peak pricing")
            } else if month >= 11 || month <= 2 {
                (1.15, "Dry season — moderate premium")
            } else {
                (0.90, "Rainy season — lower rates available")
            }
        }
        "KE" => {
            if (7..=10).contains(&month) {
                (1.40, "Great Migration — peak safari season")
            } else if (3..=5).contains(&month) {
                (0.80, "Long rains — green season discounts")
            } else {
                (1.0, "Standard season")
            }
        }
        "ZA" => {
            if (12..=12).contains(&month) || (1..=2).contains(&month) {
                (1.25, "Summer peak — holiday season")
            } else if (6..=8).contains(&month) {
                (0.85, "Winter — off-peak for Cape Town, peak for safaris")
            } else {
                (1.0, "Shoulder season")
            }
        }
        _ => (1.0, "Standard pricing"),
    }
}

pub async fn calculate_pricing(body: web::Json<PricingRequest>) -> HttpResponse {
    let (rate, currency) = get_exchange_rate(&body.country);
    let (seasonal, seasonal_note) = get_seasonal_multiplier(&body.country);
    let travelers = body.travelers.unwrap_or(1).max(1);

    let tourismpay_discount_pct = 0.05; // 5% TourismPay partner discount
    let mut total_usd = 0.0;
    let mut walk_in_total = 0.0;
    let mut items: Vec<PricedItem> = Vec::new();

    for item in &body.items {
        let walk_in_price = item.base_price_usd * seasonal;
        let tp_price = walk_in_price * (1.0 - tourismpay_discount_pct);
        let per_person = if item.category == "accommodation" || item.category == "transport" {
            tp_price // shared cost
        } else {
            tp_price * travelers as f64
        };

        total_usd += per_person;
        walk_in_total += walk_in_price * if item.category == "accommodation" || item.category == "transport" { 1.0 } else { travelers as f64 };

        items.push(PricedItem {
            merchant_id: item.merchant_id,
            product_id: item.product_id,
            category: item.category.clone(),
            base_price_usd: item.base_price_usd,
            final_price_usd: (per_person * 100.0).round() / 100.0,
            final_price_local: (per_person * rate * 100.0).round() / 100.0,
            available: true,
            seasonal_note: seasonal_note.to_string(),
            tourismpay_price: true,
        });
    }

    let savings = walk_in_total - total_usd;

    HttpResponse::Ok().json(PricingResponse {
        items,
        total_usd: (total_usd * 100.0).round() / 100.0,
        total_local: (total_usd * rate * 100.0).round() / 100.0,
        local_currency: currency.to_string(),
        exchange_rate: rate,
        seasonal_multiplier: seasonal,
        savings_vs_walk_in: (savings * 100.0).round() / 100.0,
        tourismpay_discount: tourismpay_discount_pct * 100.0,
    })
}

pub async fn check_availability(body: web::Json<AvailabilityCheck>) -> HttpResponse {
    let results: Vec<AvailabilityResult> = body.merchant_ids.iter().map(|&id| {
        // Simulate availability check — in production this queries merchant inventory
        let hash = (id as u64).wrapping_mul(31) % 100;
        let available = hash < 85; // 85% availability rate
        let capacity = 40.0 + (hash as f64 * 0.6);

        AvailabilityResult {
            merchant_id: id,
            available,
            next_available: if available { None } else { Some("2026-06-15".to_string()) },
            capacity_pct: capacity,
            note: if available {
                "Available — book now for best rates".to_string()
            } else {
                "Fully booked — check alternative dates".to_string()
            },
        }
    }).collect();

    HttpResponse::Ok().json(serde_json::json!({
        "results": results,
        "date": body.date,
        "country": body.country,
    }))
}

pub fn configure_pricing_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/v1/pricing")
            .route("/calculate", web::post().to(calculate_pricing))
            .route("/availability", web::post().to(check_availability))
    );
}
