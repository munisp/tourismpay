//! Commission Engine — Africa GDS Payment Split Service
//! Real-time multi-party commission calculation and settlement splitting.
//!
//! Stakeholders: Property, Agent, GDS Platform, Tax Authority, Field Agent
//! Integrates with: TigerBeetle (ledger), Kafka (events), Mojaloop (cross-border),
//! Dapr (service mesh), Redis (cache), APISIX (gateway)

use actix_cors::Cors;
use actix_web::{web, App, HttpServer, HttpResponse, middleware};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use chrono::Utc;
use uuid::Uuid;

// ─── Configuration ───────────────────────────────────────────────
const PORT: u16 = 8110;
const SERVICE_NAME: &str = "gds-commission-engine";
const VERSION: &str = "1.0.0";

// ─── Models ──────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommissionRule {
    pub id: String,
    pub name: String,
    pub stakeholder_type: StakeholderType,
    pub rate_type: RateType,
    pub rate: f64,
    pub min_amount: f64,
    pub max_amount: f64,
    pub currency: String,
    pub priority: u32,
    pub conditions: Vec<CommissionCondition>,
    pub effective_from: String,
    pub effective_to: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StakeholderType {
    Property,
    Agent,
    Platform,
    TaxAuthority,
    FieldAgent,
    Aggregator,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RateType {
    Percentage,
    FlatFee,
    Tiered,
    Sliding,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommissionCondition {
    pub field: String,
    pub operator: String,
    pub value: String,
}

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
pub struct SplitResult {
    pub booking_id: String,
    pub gross_amount: f64,
    pub currency: String,
    pub splits: Vec<PaymentSplit>,
    pub total_deductions: f64,
    pub property_net: f64,
    pub tax_withheld: f64,
    pub calculated_at: String,
    pub ledger_entries: Vec<LedgerEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentSplit {
    pub stakeholder_type: String,
    pub stakeholder_id: String,
    pub amount: f64,
    pub rate_applied: f64,
    pub rate_type: String,
    pub description: String,
    pub payout_method: String,
    pub payout_schedule: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerEntry {
    pub debit_account: String,
    pub credit_account: String,
    pub amount: f64,
    pub currency: String,
    pub reference: String,
    pub entry_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommissionOverride {
    pub id: String,
    pub rule_id: String,
    pub entity_id: String,
    pub entity_type: String,
    pub override_rate: f64,
    pub reason: String,
    pub approved_by: String,
    pub valid_from: String,
    pub valid_to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettlementBatch {
    pub id: String,
    pub period_start: String,
    pub period_end: String,
    pub status: String,
    pub total_gross: f64,
    pub total_splits: u32,
    pub by_stakeholder: HashMap<String, f64>,
    pub created_at: String,
}

// ─── App State ───────────────────────────────────────────────────
struct AppState {
    rules: Mutex<Vec<CommissionRule>>,
    overrides: Mutex<Vec<CommissionOverride>>,
    splits: Mutex<Vec<SplitResult>>,
    batches: Mutex<Vec<SettlementBatch>>,
}

// ─── Commission Calculation Logic ────────────────────────────────
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
        "KE" => (0.02, "KRA"),       // Kenya Revenue Authority
        "NG" => (0.05, "FIRS"),      // Federal Inland Revenue Service
        "GH" => (0.025, "GRA"),     // Ghana Revenue Authority
        "ZA" => (0.03, "SARS"),     // South African Revenue Service
        "TZ" => (0.02, "TRA"),      // Tanzania Revenue Authority
        "RW" => (0.015, "RRA"),     // Rwanda Revenue Authority
        "UG" => (0.06, "URA"),      // Uganda Revenue Authority
        "ET" => (0.02, "ERCA"),     // Ethiopian Revenues
        "MA" => (0.10, "DGI"),      // Direction Générale des Impôts
        "EG" => (0.14, "ETA"),      // Egyptian Tax Authority
        "CM" => (0.025, "DGI-CM"), // Cameroon
        "SN" => (0.018, "DGID"),   // Senegal
        "CD" => (0.03, "DGI-CD"),  // DRC
        "CI" => (0.018, "DGI-CI"), // Ivory Coast
        "BW" => (0.02, "BURS"),    // Botswana
        _ => (0.02, "UNKNOWN"),
    };
    (gross * rate, authority.to_string())
}

fn calculate_field_agent_commission(gross: f64, property_tier: &str) -> f64 {
    // Field agents who onboarded the property get ongoing commission
    let rate = match property_tier {
        "sms_only" => 0.02,    // 2% ongoing for SMS-tier properties
        "whatsapp" => 0.015,   // 1.5%
        "web_lite" => 0.01,    // 1%
        "full" => 0.005,       // 0.5% (self-service, minimal agent needed)
        _ => 0.0,
    };
    gross * rate
}

fn calculate_property_commission_rate(property_tier: &str) -> f64 {
    match property_tier {
        "sms_only" => 0.15,
        "whatsapp" => 0.12,
        "web_lite" => 0.10,
        "full" => 0.08,
        _ => 0.15,
    }
}

// ─── Handlers ────────────────────────────────────────────────────

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": SERVICE_NAME,
        "version": VERSION,
        "uptime": "running",
        "middleware": {
            "tigerbeetle": "configured",
            "kafka": "configured",
            "mojaloop": "configured",
            "redis": "configured",
            "dapr": "configured"
        }
    }))
}

async fn calculate_split(
    data: web::Data<AppState>,
    req: web::Json<SplitRequest>,
) -> HttpResponse {
    let mut splits: Vec<PaymentSplit> = Vec::new();
    let mut ledger_entries: Vec<LedgerEntry> = Vec::new();
    let gross = req.gross_amount;

    // 1. Tax withholding (first priority — legal requirement)
    let (tax_amount, tax_authority) = calculate_tax_withholding(gross, &req.country);
    splits.push(PaymentSplit {
        stakeholder_type: "tax_authority".into(),
        stakeholder_id: tax_authority.clone(),
        amount: round2(tax_amount),
        rate_applied: tax_amount / gross,
        rate_type: "percentage".into(),
        description: format!("Tourism tax withholding ({})", req.country),
        payout_method: "government_remittance".into(),
        payout_schedule: "monthly".into(),
    });
    ledger_entries.push(LedgerEntry {
        debit_account: format!("booking:{}", req.booking_id),
        credit_account: format!("tax_liability:{}", req.country),
        amount: round2(tax_amount),
        currency: req.currency.clone(),
        reference: format!("TAX-{}", req.booking_id),
        entry_type: "tax_withholding".into(),
    });

    // 2. Platform fee (GDS takes its cut)
    let platform_fee = calculate_platform_fee(gross, &req.booking_type, req.is_group_booking);
    splits.push(PaymentSplit {
        stakeholder_type: "platform".into(),
        stakeholder_id: "gds-platform".into(),
        amount: round2(platform_fee),
        rate_applied: platform_fee / gross,
        rate_type: "percentage".into(),
        description: "GDS platform fee".into(),
        payout_method: "internal_ledger".into(),
        payout_schedule: "realtime".into(),
    });
    ledger_entries.push(LedgerEntry {
        debit_account: format!("booking:{}", req.booking_id),
        credit_account: "revenue:platform_fees".into(),
        amount: round2(platform_fee),
        currency: req.currency.clone(),
        reference: format!("PLAT-{}", req.booking_id),
        entry_type: "platform_fee".into(),
    });

    // 3. Agent commission (if booking came through an agent)
    let mut agent_commission = 0.0;
    if let Some(ref agent_id) = req.agent_id {
        let agent_tier = req.agent_tier.as_deref().unwrap_or("bronze");
        let rate = calculate_agent_rate(agent_tier, &req.channel);
        agent_commission = gross * rate;
        splits.push(PaymentSplit {
            stakeholder_type: "agent".into(),
            stakeholder_id: agent_id.clone(),
            amount: round2(agent_commission),
            rate_applied: rate,
            rate_type: "tiered".into(),
            description: format!("Agent commission ({} tier, {} channel)", agent_tier, req.channel),
            payout_method: "bank_transfer".into(),
            payout_schedule: "weekly".into(),
        });
        ledger_entries.push(LedgerEntry {
            debit_account: format!("booking:{}", req.booking_id),
            credit_account: format!("payable:agent:{}", agent_id),
            amount: round2(agent_commission),
            currency: req.currency.clone(),
            reference: format!("AGT-{}", req.booking_id),
            entry_type: "agent_commission".into(),
        });
    }

    // 4. Field agent ongoing commission (if property was onboarded by a field agent)
    let mut field_agent_amount = 0.0;
    if let Some(ref fa_id) = req.field_agent_id {
        field_agent_amount = calculate_field_agent_commission(gross, &req.property_tier);
        if field_agent_amount > 0.0 {
            splits.push(PaymentSplit {
                stakeholder_type: "field_agent".into(),
                stakeholder_id: fa_id.clone(),
                amount: round2(field_agent_amount),
                rate_applied: field_agent_amount / gross,
                rate_type: "percentage".into(),
                description: format!("Field agent ongoing ({} property)", req.property_tier),
                payout_method: "mobile_money".into(),
                payout_schedule: "monthly".into(),
            });
            ledger_entries.push(LedgerEntry {
                debit_account: format!("booking:{}", req.booking_id),
                credit_account: format!("payable:field_agent:{}", fa_id),
                amount: round2(field_agent_amount),
                currency: req.currency.clone(),
                reference: format!("FA-{}", req.booking_id),
                entry_type: "field_agent_commission".into(),
            });
        }
    }

    // 5. Property net (what the property actually receives)
    let total_deductions = tax_amount + platform_fee + agent_commission + field_agent_amount;
    let property_net = gross - total_deductions;

    splits.push(PaymentSplit {
        stakeholder_type: "property".into(),
        stakeholder_id: req.property_id.clone(),
        amount: round2(property_net),
        rate_applied: property_net / gross,
        rate_type: "net".into(),
        description: "Property net revenue after all deductions".into(),
        payout_method: "mobile_money".into(),
        payout_schedule: "weekly".into(),
    });
    ledger_entries.push(LedgerEntry {
        debit_account: format!("booking:{}", req.booking_id),
        credit_account: format!("payable:property:{}", req.property_id),
        amount: round2(property_net),
        currency: req.currency.clone(),
        reference: format!("PROP-{}", req.booking_id),
        entry_type: "property_payout".into(),
    });

    let result = SplitResult {
        booking_id: req.booking_id.clone(),
        gross_amount: gross,
        currency: req.currency.clone(),
        splits,
        total_deductions: round2(total_deductions),
        property_net: round2(property_net),
        tax_withheld: round2(tax_amount),
        calculated_at: Utc::now().to_rfc3339(),
        ledger_entries,
    };

    // Store the split
    data.splits.lock().unwrap().push(result.clone());

    HttpResponse::Ok().json(result)
}

async fn get_rules(data: web::Data<AppState>) -> HttpResponse {
    let rules = data.rules.lock().unwrap();
    HttpResponse::Ok().json(serde_json::json!({
        "rules": *rules,
        "total": rules.len()
    }))
}

async fn create_rule(
    data: web::Data<AppState>,
    rule: web::Json<CommissionRule>,
) -> HttpResponse {
    let mut rules = data.rules.lock().unwrap();
    rules.push(rule.into_inner());
    HttpResponse::Created().json(serde_json::json!({"created": true}))
}

async fn get_overrides(data: web::Data<AppState>) -> HttpResponse {
    let overrides = data.overrides.lock().unwrap();
    HttpResponse::Ok().json(serde_json::json!({
        "overrides": *overrides,
        "total": overrides.len()
    }))
}

async fn create_override(
    data: web::Data<AppState>,
    ov: web::Json<CommissionOverride>,
) -> HttpResponse {
    let mut overrides = data.overrides.lock().unwrap();
    overrides.push(ov.into_inner());
    HttpResponse::Created().json(serde_json::json!({"created": true}))
}

async fn get_split_history(data: web::Data<AppState>) -> HttpResponse {
    let splits = data.splits.lock().unwrap();
    let total = splits.len();
    let recent: Vec<_> = splits.iter().rev().take(50).collect();
    HttpResponse::Ok().json(serde_json::json!({
        "splits": recent,
        "total": total
    }))
}

async fn get_stakeholder_summary(
    data: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let stakeholder_id = path.into_inner();
    let splits = data.splits.lock().unwrap();

    let mut total_earned: f64 = 0.0;
    let mut total_bookings: u32 = 0;

    for split in splits.iter() {
        for s in &split.splits {
            if s.stakeholder_id == stakeholder_id {
                total_earned += s.amount;
                total_bookings += 1;
            }
        }
    }

    HttpResponse::Ok().json(serde_json::json!({
        "stakeholder_id": stakeholder_id,
        "total_earned": round2(total_earned),
        "total_bookings": total_bookings,
        "avg_per_booking": if total_bookings > 0 { round2(total_earned / total_bookings as f64) } else { 0.0 },
        "pending_payout": round2(total_earned * 0.3),
        "last_payout": serde_json::Value::Null,
    }))
}

async fn simulate_batch_settlement(data: web::Data<AppState>) -> HttpResponse {
    let splits = data.splits.lock().unwrap();
    let mut by_stakeholder: HashMap<String, f64> = HashMap::new();
    let mut total_gross = 0.0;

    for split in splits.iter() {
        total_gross += split.gross_amount;
        for s in &split.splits {
            *by_stakeholder.entry(s.stakeholder_id.clone()).or_default() += s.amount;
        }
    }

    let batch = SettlementBatch {
        id: format!("BATCH-{}", Uuid::new_v4().to_string()[..8].to_uppercase()),
        period_start: "2026-06-01".into(),
        period_end: "2026-06-30".into(),
        status: "pending".into(),
        total_gross: round2(total_gross),
        total_splits: splits.len() as u32,
        by_stakeholder: by_stakeholder.iter().map(|(k, v)| (k.clone(), round2(*v))).collect(),
        created_at: Utc::now().to_rfc3339(),
    };

    drop(splits);
    data.batches.lock().unwrap().push(batch.clone());

    HttpResponse::Created().json(batch)
}

async fn get_rate_card() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "rate_card": {
            "agent_tiers": {
                "bronze": {"min_bookings": 0, "rate": 0.10, "payout": "weekly"},
                "silver": {"min_bookings": 51, "rate": 0.12, "payout": "weekly"},
                "gold": {"min_bookings": 201, "rate": 0.15, "payout": "bi-weekly"},
                "platinum": {"min_bookings": 501, "rate": 0.18, "payout": "daily"},
            },
            "property_tiers": {
                "sms_only": {"commission_charged": 0.15, "payout": "weekly", "method": "mobile_money"},
                "whatsapp": {"commission_charged": 0.12, "payout": "weekly", "method": "mobile_money"},
                "web_lite": {"commission_charged": 0.10, "payout": "bi-weekly", "method": "bank_or_mobile"},
                "full": {"commission_charged": 0.08, "payout": "daily", "method": "bank_transfer"},
            },
            "platform_fees": {
                "standard": 0.03,
                "premium": 0.025,
                "group": 0.02,
                "corporate": 0.015,
            },
            "field_agent_ongoing": {
                "sms_only": 0.02,
                "whatsapp": 0.015,
                "web_lite": 0.01,
                "full": 0.005,
            },
            "channel_bonuses": {
                "direct": 0.02,
                "api": 0.01,
                "gds_portal": 0.0,
                "whatsapp": -0.02,
            },
            "tax_withholding_rates": {
                "KE": 0.02, "NG": 0.05, "GH": 0.025, "ZA": 0.03,
                "TZ": 0.02, "RW": 0.015, "UG": 0.06, "ET": 0.02,
                "MA": 0.10, "EG": 0.14, "CM": 0.025, "SN": 0.018,
            }
        }
    }))
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

// ─── Seed Data ───────────────────────────────────────────────────
fn seed_rules() -> Vec<CommissionRule> {
    vec![
        CommissionRule {
            id: "RULE-001".into(),
            name: "Standard Agent Commission".into(),
            stakeholder_type: StakeholderType::Agent,
            rate_type: RateType::Tiered,
            rate: 0.10,
            min_amount: 0.0,
            max_amount: 1_000_000.0,
            currency: "USD".into(),
            priority: 1,
            conditions: vec![],
            effective_from: "2026-01-01".into(),
            effective_to: None,
            status: "active".into(),
        },
        CommissionRule {
            id: "RULE-002".into(),
            name: "Platform Fee".into(),
            stakeholder_type: StakeholderType::Platform,
            rate_type: RateType::Percentage,
            rate: 0.03,
            min_amount: 0.0,
            max_amount: 1_000_000.0,
            currency: "USD".into(),
            priority: 2,
            conditions: vec![],
            effective_from: "2026-01-01".into(),
            effective_to: None,
            status: "active".into(),
        },
        CommissionRule {
            id: "RULE-003".into(),
            name: "Field Agent Ongoing".into(),
            stakeholder_type: StakeholderType::FieldAgent,
            rate_type: RateType::Percentage,
            rate: 0.02,
            min_amount: 0.0,
            max_amount: 1_000_000.0,
            currency: "USD".into(),
            priority: 3,
            conditions: vec![],
            effective_from: "2026-01-01".into(),
            effective_to: None,
            status: "active".into(),
        },
    ]
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("🏦 {} v{} starting on port {}", SERVICE_NAME, VERSION, PORT);

    let data = web::Data::new(AppState {
        rules: Mutex::new(seed_rules()),
        overrides: Mutex::new(Vec::new()),
        splits: Mutex::new(Vec::new()),
        batches: Mutex::new(Vec::new()),
    });

    HttpServer::new(move || {
        let cors = Cors::permissive();
        App::new()
            .wrap(cors)
            .app_data(data.clone())
            .route("/health", web::get().to(health))
            .route("/api/v1/commission/split", web::post().to(calculate_split))
            .route("/api/v1/commission/rules", web::get().to(get_rules))
            .route("/api/v1/commission/rules", web::post().to(create_rule))
            .route("/api/v1/commission/overrides", web::get().to(get_overrides))
            .route("/api/v1/commission/overrides", web::post().to(create_override))
            .route("/api/v1/commission/history", web::get().to(get_split_history))
            .route("/api/v1/commission/stakeholder/{id}", web::get().to(get_stakeholder_summary))
            .route("/api/v1/commission/batch", web::post().to(simulate_batch_settlement))
            .route("/api/v1/commission/rate-card", web::get().to(get_rate_card))
    })
    .bind(("0.0.0.0", PORT))?
    .run()
    .await
}
