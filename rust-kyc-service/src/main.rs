#[allow(dead_code)]
mod agent_kyc;
#[allow(dead_code)]
mod auth;
#[allow(dead_code)]
mod biometric_pay;
mod db;
#[allow(dead_code)]
mod gds_registry;
mod handlers;
mod lifecycle;
#[allow(dead_code)]
mod models;
#[allow(dead_code)]
mod permify;
#[allow(dead_code)]
mod verification;
#[allow(dead_code)]
mod nfc_payment;
#[allow(dead_code)]
mod travel_readiness;

use actix_web::{web, App, HttpServer, middleware::Logger};
use std::env;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt::init();

    // Initialize lifecycle: panic hooks, metrics, start time
    lifecycle::init_lifecycle();

    let port: u16 = env::var("KYC_PORT")
        .unwrap_or_else(|_| "8082".to_string())
        .parse()
        .expect("KYC_PORT must be a number");

    let database_url = env::var("KYC_DATABASE_URL")
        .or_else(|_| env::var("DATABASE_URL"))
        .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/tourismpay_kyc".to_string());

    let pool = db::create_pool(&database_url).await;
    db::run_migrations(&pool).await;

    tracing::info!("KYC service starting on port {}", port);

    let server = HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .app_data(web::Data::new(pool.clone()))
            // Lifecycle routes: /livez, /readyz, /metrics
            .configure(lifecycle::configure_lifecycle_routes)
            .route("/health", web::get().to(handlers::health))
            .service(
                web::scope("/api/v1/kyc")
                    .wrap(auth::JwtAuth)
                    .route("/verify/identity", web::post().to(handlers::submit_identity_verification))
                    .route("/verify/liveness", web::post().to(handlers::submit_liveness_check))
                    .route("/verify/document", web::post().to(handlers::submit_document_verification))
                    .route("/status/{user_id}", web::get().to(handlers::get_verification_status))
                    .route("/history/{user_id}", web::get().to(handlers::get_verification_history))
                    .route("/callback/result", web::post().to(handlers::verification_callback))
                    .route("/admin/pending", web::get().to(handlers::list_pending_verifications))
                    .route("/admin/review", web::post().to(handlers::admin_review))
                    .route("/sanctions/screen", web::post().to(handlers::sanctions_screening))
                    .route("/risk/score/{user_id}", web::get().to(handlers::get_risk_score))
            )
            .service(
                web::scope("/api/v1/agent-kyc")
                    .route("/verify", web::post().to(agent_kyc::verify_agent_kyc))
                    .route("/verify/nin", web::post().to(agent_kyc::verify_nin))
                    .route("/verify/bvn", web::post().to(agent_kyc::verify_bvn))
            )
            .configure(nfc_payment::configure_nfc_routes)
            .configure(travel_readiness::configure_travel_readiness_routes)
    })
    .bind(("0.0.0.0", port))?
    .run();

    // Mark as ready once server is bound
    lifecycle::set_ready(true);

    // Spawn graceful shutdown handler
    let server_handle = server.handle();
    tokio::spawn(lifecycle::graceful_shutdown(server_handle));

    server.await
}
