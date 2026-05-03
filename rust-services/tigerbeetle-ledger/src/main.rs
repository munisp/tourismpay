use actix_cors::Cors;
use actix_web::{web, App, HttpServer, HttpResponse, middleware};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

// ─── Models ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Account {
    id: String,
    debits_pending: u64,
    debits_posted: u64,
    credits_pending: u64,
    credits_posted: u64,
    user_data_128: String,
    user_data_64: u64,
    user_data_32: u32,
    ledger: u32,
    code: u16,
    flags: u16,
    timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Transfer {
    id: String,
    debit_account_id: String,
    credit_account_id: String,
    amount: u64,
    pending_id: Option<String>,
    user_data_128: String,
    user_data_64: u64,
    user_data_32: u32,
    timeout: u32,
    ledger: u32,
    code: u16,
    flags: u16,
    timestamp: u64,
    status: String,
}

#[derive(Debug, Deserialize)]
struct CreateAccountRequest {
    id: Option<String>,
    ledger: u32,
    code: u16,
    user_data_128: Option<String>,
    #[serde(default)]
    flags: u16,
}

#[derive(Debug, Deserialize)]
struct CreateTransferRequest {
    id: Option<String>,
    debit_account_id: String,
    credit_account_id: String,
    amount: u64,
    ledger: u32,
    code: u16,
    #[serde(default)]
    flags: u16,
    timeout: Option<u32>,
    user_data_128: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LinkedTransferRequest {
    transfers: Vec<CreateTransferRequest>,
}

#[derive(Debug, Clone, Serialize)]
struct LedgerStats {
    total_accounts: usize,
    total_transfers: usize,
    total_pending: usize,
    total_posted: usize,
    total_voided: usize,
    ledgers: Vec<LedgerSummary>,
}

#[derive(Debug, Clone, Serialize)]
struct LedgerSummary {
    ledger: u32,
    name: String,
    accounts: usize,
    transfers: usize,
    total_volume: u64,
}

// ─── State ──────────────────────────────────────────────────────────────────

struct AppState {
    accounts: Mutex<HashMap<String, Account>>,
    transfers: Mutex<Vec<Transfer>>,
    seq: Mutex<u64>,
}

fn now_ts() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64
}

impl AppState {
    fn new() -> Self {
        let mut accounts = HashMap::new();
        let ledger_map: Vec<(u32, &str, &[(&str, &str)])> = vec![
            (1, "USD", &[
                ("acc-platform-usd", "TourismPay Platform USD"),
                ("acc-merchant-001-usd", "Safari Lodge USD"),
                ("acc-fees-usd", "Platform Fees USD"),
            ]),
            (2, "KES", &[
                ("acc-platform-kes", "TourismPay Platform KES"),
                ("acc-merchant-001-kes", "Safari Lodge KES"),
                ("acc-mpesa-kes", "M-Pesa Settlement KES"),
            ]),
            (3, "NGN", &[
                ("acc-platform-ngn", "TourismPay Platform NGN"),
                ("acc-flutterwave-ngn", "Flutterwave NGN"),
            ]),
        ];

        for (ledger, _currency, accs) in &ledger_map {
            for (id, name) in *accs {
                accounts.insert(id.to_string(), Account {
                    id: id.to_string(),
                    debits_pending: 0,
                    debits_posted: 0,
                    credits_pending: 0,
                    credits_posted: if id.contains("platform") { 1_000_000_00 } else { 0 },
                    user_data_128: name.to_string(),
                    user_data_64: 0,
                    user_data_32: 0,
                    ledger: *ledger,
                    code: 1,
                    flags: 0,
                    timestamp: now_ts(),
                });
            }
        }

        AppState {
            accounts: Mutex::new(accounts),
            transfers: Mutex::new(Vec::new()),
            seq: Mutex::new(0),
        }
    }

    fn next_id(&self) -> String {
        let mut seq = self.seq.lock().unwrap();
        *seq += 1;
        format!("tb-{:012}", *seq)
    }
}

// ─── Handlers ───────────────────────────────────────────────────────────────

async fn health(data: web::Data<AppState>) -> HttpResponse {
    let accounts = data.accounts.lock().unwrap();
    let transfers = data.transfers.lock().unwrap();
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "TourismPay TigerBeetle Ledger (Rust)",
        "version": "1.0.0",
        "accounts": accounts.len(),
        "transfers": transfers.len(),
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

async fn create_account(body: web::Json<CreateAccountRequest>, data: web::Data<AppState>) -> HttpResponse {
    let req = body.into_inner();
    let id = req.id.unwrap_or_else(|| data.next_id());

    let account = Account {
        id: id.clone(),
        debits_pending: 0,
        debits_posted: 0,
        credits_pending: 0,
        credits_posted: 0,
        user_data_128: req.user_data_128.unwrap_or_default(),
        user_data_64: 0,
        user_data_32: 0,
        ledger: req.ledger,
        code: req.code,
        flags: req.flags,
        timestamp: now_ts(),
    };

    let mut accounts = data.accounts.lock().unwrap();
    accounts.insert(id.clone(), account.clone());
    HttpResponse::Created().json(account)
}

async fn get_account(path: web::Path<String>, data: web::Data<AppState>) -> HttpResponse {
    let id = path.into_inner();
    let accounts = data.accounts.lock().unwrap();
    if let Some(acc) = accounts.get(&id) {
        let balance = (acc.credits_posted + acc.credits_pending) as i64
            - (acc.debits_posted + acc.debits_pending) as i64;
        HttpResponse::Ok().json(serde_json::json!({
            "account": acc,
            "balance": balance,
            "availableBalance": acc.credits_posted as i64 - acc.debits_posted as i64
        }))
    } else {
        HttpResponse::NotFound().json(serde_json::json!({"error": "account not found"}))
    }
}

async fn list_accounts(data: web::Data<AppState>) -> HttpResponse {
    let accounts = data.accounts.lock().unwrap();
    let accs: Vec<&Account> = accounts.values().collect();
    HttpResponse::Ok().json(serde_json::json!({"accounts": accs, "total": accs.len()}))
}

async fn create_transfer(body: web::Json<CreateTransferRequest>, data: web::Data<AppState>) -> HttpResponse {
    let req = body.into_inner();
    let id = req.id.unwrap_or_else(|| data.next_id());

    let mut accounts = data.accounts.lock().unwrap();

    // Validate accounts exist
    if !accounts.contains_key(&req.debit_account_id) {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "debit account not found"}));
    }
    if !accounts.contains_key(&req.credit_account_id) {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "credit account not found"}));
    }

    let is_pending = req.flags & 1 != 0; // pending flag
    let status = if is_pending { "pending" } else { "posted" };

    // Update account balances
    if is_pending {
        if let Some(debit_acc) = accounts.get_mut(&req.debit_account_id) {
            debit_acc.debits_pending += req.amount;
        }
        if let Some(credit_acc) = accounts.get_mut(&req.credit_account_id) {
            credit_acc.credits_pending += req.amount;
        }
    } else {
        if let Some(debit_acc) = accounts.get_mut(&req.debit_account_id) {
            debit_acc.debits_posted += req.amount;
        }
        if let Some(credit_acc) = accounts.get_mut(&req.credit_account_id) {
            credit_acc.credits_posted += req.amount;
        }
    }

    let transfer = Transfer {
        id: id.clone(),
        debit_account_id: req.debit_account_id,
        credit_account_id: req.credit_account_id,
        amount: req.amount,
        pending_id: None,
        user_data_128: req.user_data_128.unwrap_or_default(),
        user_data_64: 0,
        user_data_32: 0,
        timeout: req.timeout.unwrap_or(0),
        ledger: req.ledger,
        code: req.code,
        flags: req.flags,
        timestamp: now_ts(),
        status: status.to_string(),
    };

    let mut transfers = data.transfers.lock().unwrap();
    transfers.push(transfer.clone());

    HttpResponse::Created().json(transfer)
}

async fn post_pending(path: web::Path<String>, data: web::Data<AppState>) -> HttpResponse {
    let transfer_id = path.into_inner();
    let mut transfers = data.transfers.lock().unwrap();
    let mut accounts = data.accounts.lock().unwrap();

    for tx in transfers.iter_mut() {
        if tx.id == transfer_id && tx.status == "pending" {
            tx.status = "posted".to_string();

            // Move from pending to posted
            if let Some(debit_acc) = accounts.get_mut(&tx.debit_account_id) {
                debit_acc.debits_pending = debit_acc.debits_pending.saturating_sub(tx.amount);
                debit_acc.debits_posted += tx.amount;
            }
            if let Some(credit_acc) = accounts.get_mut(&tx.credit_account_id) {
                credit_acc.credits_pending = credit_acc.credits_pending.saturating_sub(tx.amount);
                credit_acc.credits_posted += tx.amount;
            }

            return HttpResponse::Ok().json(serde_json::json!({"status": "posted", "transferId": transfer_id}));
        }
    }
    HttpResponse::NotFound().json(serde_json::json!({"error": "pending transfer not found"}))
}

async fn void_pending(path: web::Path<String>, data: web::Data<AppState>) -> HttpResponse {
    let transfer_id = path.into_inner();
    let mut transfers = data.transfers.lock().unwrap();
    let mut accounts = data.accounts.lock().unwrap();

    for tx in transfers.iter_mut() {
        if tx.id == transfer_id && tx.status == "pending" {
            tx.status = "voided".to_string();

            if let Some(debit_acc) = accounts.get_mut(&tx.debit_account_id) {
                debit_acc.debits_pending = debit_acc.debits_pending.saturating_sub(tx.amount);
            }
            if let Some(credit_acc) = accounts.get_mut(&tx.credit_account_id) {
                credit_acc.credits_pending = credit_acc.credits_pending.saturating_sub(tx.amount);
            }

            return HttpResponse::Ok().json(serde_json::json!({"status": "voided", "transferId": transfer_id}));
        }
    }
    HttpResponse::NotFound().json(serde_json::json!({"error": "pending transfer not found"}))
}

async fn list_transfers(data: web::Data<AppState>) -> HttpResponse {
    let transfers = data.transfers.lock().unwrap();
    let recent: Vec<&Transfer> = transfers.iter().rev().take(100).collect();
    HttpResponse::Ok().json(serde_json::json!({"transfers": recent, "total": transfers.len()}))
}

async fn get_transfer(path: web::Path<String>, data: web::Data<AppState>) -> HttpResponse {
    let id = path.into_inner();
    let transfers = data.transfers.lock().unwrap();
    for tx in transfers.iter() {
        if tx.id == id {
            return HttpResponse::Ok().json(tx);
        }
    }
    HttpResponse::NotFound().json(serde_json::json!({"error": "transfer not found"}))
}

async fn linked_transfers(body: web::Json<LinkedTransferRequest>, data: web::Data<AppState>) -> HttpResponse {
    let reqs = body.into_inner().transfers;
    let mut results = Vec::new();

    for req in reqs {
        let id = req.id.unwrap_or_else(|| data.next_id());
        let mut accounts = data.accounts.lock().unwrap();

        if let Some(debit_acc) = accounts.get_mut(&req.debit_account_id) {
            debit_acc.debits_posted += req.amount;
        }
        if let Some(credit_acc) = accounts.get_mut(&req.credit_account_id) {
            credit_acc.credits_posted += req.amount;
        }

        let transfer = Transfer {
            id: id.clone(),
            debit_account_id: req.debit_account_id,
            credit_account_id: req.credit_account_id,
            amount: req.amount,
            pending_id: None,
            user_data_128: req.user_data_128.unwrap_or_default(),
            user_data_64: 0,
            user_data_32: 0,
            timeout: req.timeout.unwrap_or(0),
            ledger: req.ledger,
            code: req.code,
            flags: req.flags | 2, // linked flag
            timestamp: now_ts(),
            status: "posted".to_string(),
        };

        let mut transfers = data.transfers.lock().unwrap();
        transfers.push(transfer.clone());
        results.push(transfer);
    }

    HttpResponse::Created().json(serde_json::json!({"transfers": results, "total": results.len()}))
}

async fn ledger_stats(data: web::Data<AppState>) -> HttpResponse {
    let accounts = data.accounts.lock().unwrap();
    let transfers = data.transfers.lock().unwrap();

    let mut ledger_map: HashMap<u32, (String, usize, usize, u64)> = HashMap::new();
    let ledger_names: HashMap<u32, &str> = vec![(1, "USD"), (2, "KES"), (3, "NGN")]
        .into_iter().collect();

    for acc in accounts.values() {
        let entry = ledger_map.entry(acc.ledger).or_insert_with(|| {
            (ledger_names.get(&acc.ledger).unwrap_or(&"Unknown").to_string(), 0, 0, 0)
        });
        entry.1 += 1;
    }

    for tx in transfers.iter() {
        let entry = ledger_map.entry(tx.ledger).or_insert_with(|| {
            (ledger_names.get(&tx.ledger).unwrap_or(&"Unknown").to_string(), 0, 0, 0)
        });
        entry.2 += 1;
        entry.3 += tx.amount;
    }

    let ledgers: Vec<LedgerSummary> = ledger_map.iter()
        .map(|(ledger, (name, accs, txs, vol))| LedgerSummary {
            ledger: *ledger,
            name: name.clone(),
            accounts: *accs,
            transfers: *txs,
            total_volume: *vol,
        })
        .collect();

    let pending = transfers.iter().filter(|t| t.status == "pending").count();
    let posted = transfers.iter().filter(|t| t.status == "posted").count();
    let voided = transfers.iter().filter(|t| t.status == "voided").count();

    HttpResponse::Ok().json(LedgerStats {
        total_accounts: accounts.len(),
        total_transfers: transfers.len(),
        total_pending: pending,
        total_posted: posted,
        total_voided: voided,
        ledgers,
    })
}

// ─── Main ───────────────────────────────────────────────────────────────────

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8111".to_string())
        .parse()
        .unwrap_or(8111);

    let state = web::Data::new(AppState::new());

    log::info!("TigerBeetle Ledger service starting on port {}", port);

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
                    .route("/accounts", web::post().to(create_account))
                    .route("/accounts", web::get().to(list_accounts))
                    .route("/accounts/{id}", web::get().to(get_account))
                    .route("/transfers", web::post().to(create_transfer))
                    .route("/transfers", web::get().to(list_transfers))
                    .route("/transfers/{id}", web::get().to(get_transfer))
                    .route("/transfers/{id}/post", web::post().to(post_pending))
                    .route("/transfers/{id}/void", web::post().to(void_pending))
                    .route("/transfers/linked", web::post().to(linked_transfers))
                    .route("/stats", web::get().to(ledger_stats))
            )
    })
    .bind(format!("0.0.0.0:{}", port))?
    .run()
    .await
}
