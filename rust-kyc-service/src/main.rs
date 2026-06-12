mod auth;
mod biometric_pay;
mod db;
mod handlers;
mod models;
mod permify;
mod verification;

use actix_web::{web, App, HttpServer, middleware::Logger};
use std::env;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt::init();

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

    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .app_data(web::Data::new(pool.clone()))
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
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
