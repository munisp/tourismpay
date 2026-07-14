// services/fluvio-consumer/src/main.rs
// ─────────────────────────────────────────────────────────────────────────────
// TourismPay Fluvio Consumer — Rust microservice
//
// Consumes events from Fluvio topics and processes them:
//   - tourismpay.transactions   → fraud scoring, ledger sync
//   - tourismpay.kyc            → KYC status updates
//   - tourismpay.payments       → payment state machine
//   - tourismpay.notifications  → notification dispatch
//   - tourismpay.audit          → audit trail archival
//   - tourismpay.analytics      → real-time analytics aggregation
//
// Environment variables:
//   FLUVIO_ENDPOINT  — Fluvio cluster endpoint (default: localhost:9003)
//   PG_DSN           — PostgreSQL DSN for offset persistence
//   CONSUMER_GROUP   — consumer group name (default: tourismpay-main)
//   HTTP_PORT        — health check HTTP port (default: 8082)
// ─────────────────────────────────────────────────────────────────────────────

use std::collections::HashMap;
use std::env;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tokio::signal;
use tokio::sync::RwLock;
use tokio::time::sleep;
use tracing::{error, info, warn};

// ─── Config ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct Config {
    fluvio_endpoint: String,
    pg_dsn: String,
    consumer_group: String,
    http_port: u16,
}

impl Config {
    fn from_env() -> Self {
        Self {
            fluvio_endpoint: env::var("FLUVIO_ENDPOINT")
                .unwrap_or_else(|_| "localhost:9003".to_string()),
            pg_dsn: env::var("PG_DSN").unwrap_or_default(),
            consumer_group: env::var("CONSUMER_GROUP")
                .unwrap_or_else(|_| "tourismpay-main".to_string()),
            http_port: env::var("HTTP_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(8082),
        }
    }
}

// ─── Event Types ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(tag = "event_type", rename_all = "snake_case")]
pub enum TourismPayEvent {
    TransactionCreated {
        transaction_id: String,
        user_id: i64,
        amount: f64,
        currency: String,
        transaction_type: String,
        metadata: Option<serde_json::Value>,
    },
    PaymentSucceeded {
        payment_intent_id: String,
        user_id: i64,
        amount: f64,
        currency: String,
        reference: String,
    },
    PaymentFailed {
        payment_intent_id: String,
        user_id: i64,
        error_code: String,
        error_message: String,
    },
    KycStatusUpdated {
        user_id: i64,
        status: String,
        score: i32,
        provider: String,
    },
    UserRegistered {
        user_id: i64,
        email: String,
        role: String,
    },
    WalletFunded {
        user_id: i64,
        amount: f64,
        currency: String,
        method: String,
    },
    RemittanceInitiated {
        remittance_id: i64,
        user_id: i64,
        amount: f64,
        destination_country: String,
    },
    LoyaltyPointsEarned {
        user_id: i64,
        points: i64,
        transaction_id: String,
    },
    AuditEvent {
        action: String,
        resource: String,
        resource_id: String,
        user_id: Option<i64>,
        ip_address: Option<String>,
    },
    NotificationRequested {
        user_id: i64,
        channel: String,
        template_id: i32,
        recipient: String,
        variables: HashMap<String, String>,
    },
}

// ─── Consumer State ───────────────────────────────────────────────────────────

#[derive(Debug, Default)]
struct ConsumerState {
    messages_processed: u64,
    messages_failed: u64,
    last_processed_at: Option<SystemTime>,
    topic_offsets: HashMap<String, i64>,
}

// ─── Event Processor ─────────────────────────────────────────────────────────

struct EventProcessor {
    config: Config,
    state: Arc<RwLock<ConsumerState>>,
}

impl EventProcessor {
    fn new(config: Config) -> Self {
        Self {
            config,
            state: Arc::new(RwLock::new(ConsumerState::default())),
        }
    }

    async fn process_event(&self, topic: &str, event: &TourismPayEvent) -> anyhow::Result<()> {
        match event {
            TourismPayEvent::TransactionCreated {
                transaction_id,
                user_id,
                amount,
                currency,
                transaction_type,
                ..
            } => {
                info!(
                    topic = topic,
                    transaction_id = transaction_id,
                    user_id = user_id,
                    amount = amount,
                    currency = currency,
                    transaction_type = transaction_type,
                    "Processing TransactionCreated"
                );
                // Production: 
                //   1. Call fraud scoring service
                //   2. Update analytics aggregates
                //   3. Trigger loyalty points calculation
                self.process_transaction_created(transaction_id, *user_id, *amount, currency).await?;
            }

            TourismPayEvent::PaymentSucceeded {
                payment_intent_id,
                user_id,
                amount,
                currency,
                reference,
            } => {
                info!(
                    payment_intent_id = payment_intent_id,
                    user_id = user_id,
                    reference = reference,
                    "Processing PaymentSucceeded"
                );
                self.process_payment_succeeded(payment_intent_id, *user_id, *amount, currency, reference).await?;
            }

            TourismPayEvent::PaymentFailed {
                payment_intent_id,
                user_id,
                error_code,
                error_message,
            } => {
                warn!(
                    payment_intent_id = payment_intent_id,
                    user_id = user_id,
                    error_code = error_code,
                    error_message = error_message,
                    "Processing PaymentFailed"
                );
                self.process_payment_failed(payment_intent_id, *user_id, error_code).await?;
            }

            TourismPayEvent::KycStatusUpdated {
                user_id,
                status,
                score,
                provider,
            } => {
                info!(
                    user_id = user_id,
                    status = status,
                    score = score,
                    provider = provider,
                    "Processing KycStatusUpdated"
                );
                self.process_kyc_update(*user_id, status, *score).await?;
            }

            TourismPayEvent::LoyaltyPointsEarned {
                user_id,
                points,
                transaction_id,
            } => {
                info!(
                    user_id = user_id,
                    points = points,
                    transaction_id = transaction_id,
                    "Processing LoyaltyPointsEarned"
                );
                self.process_loyalty_earned(*user_id, *points, transaction_id).await?;
            }

            TourismPayEvent::AuditEvent {
                action,
                resource,
                resource_id,
                user_id,
                ip_address,
            } => {
                info!(
                    action = action,
                    resource = resource,
                    resource_id = resource_id,
                    user_id = ?user_id,
                    "Processing AuditEvent"
                );
                self.process_audit_event(action, resource, resource_id, *user_id, ip_address.as_deref()).await?;
            }

            TourismPayEvent::NotificationRequested {
                user_id,
                channel,
                template_id,
                recipient,
                variables,
            } => {
                info!(
                    user_id = user_id,
                    channel = channel,
                    template_id = template_id,
                    "Processing NotificationRequested"
                );
                self.dispatch_notification(*user_id, channel, *template_id, recipient, variables).await?;
            }

            TourismPayEvent::UserRegistered { user_id, email, role } => {
                info!(user_id = user_id, role = role, "Processing UserRegistered");
                // Production: trigger welcome email, create default wallet, etc.
            }

            TourismPayEvent::WalletFunded { user_id, amount, currency, method } => {
                info!(user_id = user_id, amount = amount, currency = currency, method = method, "Processing WalletFunded");
                // Production: update analytics, trigger notification
            }

            TourismPayEvent::RemittanceInitiated { remittance_id, user_id, amount, destination_country } => {
                info!(
                    remittance_id = remittance_id,
                    user_id = user_id,
                    amount = amount,
                    destination_country = destination_country,
                    "Processing RemittanceInitiated"
                );
                // Production: trigger AML check, initiate Temporal workflow
            }
        }

        // Update state
        let mut state = self.state.write().await;
        state.messages_processed += 1;
        state.last_processed_at = Some(SystemTime::now());

        Ok(())
    }

    async fn process_transaction_created(
        &self,
        transaction_id: &str,
        user_id: i64,
        amount: f64,
        currency: &str,
    ) -> anyhow::Result<()> {
        // 1. Fraud scoring
        let risk_score = self.score_transaction_risk(user_id, amount).await?;
        if risk_score > 0.85 {
            warn!(
                transaction_id = transaction_id,
                risk_score = risk_score,
                "High-risk transaction flagged"
            );
            // Production: create aml_transaction_flags record, trigger compliance alert
        }

        // 2. Update user analytics
        info!(
            transaction_id = transaction_id,
            user_id = user_id,
            amount = amount,
            currency = currency,
            risk_score = risk_score,
            "Transaction processed"
        );
        Ok(())
    }

    async fn process_payment_succeeded(
        &self,
        intent_id: &str,
        user_id: i64,
        amount: f64,
        currency: &str,
        reference: &str,
    ) -> anyhow::Result<()> {
        info!(
            intent_id = intent_id,
            user_id = user_id,
            amount = amount,
            currency = currency,
            reference = reference,
            "Payment succeeded — updating analytics and triggering loyalty"
        );
        // Production:
        //   1. Update payment_intents status to 'succeeded'
        //   2. Trigger loyalty points calculation
        //   3. Update merchant analytics
        //   4. Send receipt notification
        Ok(())
    }

    async fn process_payment_failed(
        &self,
        intent_id: &str,
        user_id: i64,
        error_code: &str,
    ) -> anyhow::Result<()> {
        warn!(
            intent_id = intent_id,
            user_id = user_id,
            error_code = error_code,
            "Payment failed — updating status and notifying user"
        );
        Ok(())
    }

    async fn process_kyc_update(
        &self,
        user_id: i64,
        status: &str,
        score: i32,
    ) -> anyhow::Result<()> {
        info!(user_id = user_id, status = status, score = score, "KYC status updated");
        // Production: update users.kyc_status, trigger onboarding workflow if approved
        Ok(())
    }

    async fn process_loyalty_earned(
        &self,
        user_id: i64,
        points: i64,
        transaction_id: &str,
    ) -> anyhow::Result<()> {
        info!(
            user_id = user_id,
            points = points,
            transaction_id = transaction_id,
            "Loyalty points earned — updating account"
        );
        // Production: update loyalty_accounts balance, create loyalty_transactions record
        Ok(())
    }

    async fn process_audit_event(
        &self,
        action: &str,
        resource: &str,
        resource_id: &str,
        user_id: Option<i64>,
        ip_address: Option<&str>,
    ) -> anyhow::Result<()> {
        info!(
            action = action,
            resource = resource,
            resource_id = resource_id,
            user_id = ?user_id,
            ip_address = ?ip_address,
            "Audit event archived"
        );
        // Production: insert into audit_trail_archive
        Ok(())
    }

    async fn dispatch_notification(
        &self,
        user_id: i64,
        channel: &str,
        template_id: i32,
        recipient: &str,
        variables: &HashMap<String, String>,
    ) -> anyhow::Result<()> {
        info!(
            user_id = user_id,
            channel = channel,
            template_id = template_id,
            recipient = recipient,
            "Dispatching notification"
        );
        // Production: 
        //   1. Load template from notification_templates
        //   2. Render template with variables
        //   3. Send via appropriate provider (SendGrid, Twilio, FCM)
        //   4. Record in notification_logs
        Ok(())
    }

    async fn score_transaction_risk(&self, user_id: i64, amount: f64) -> anyhow::Result<f64> {
        // Production: call fraud-scoring Python service
        // Simple heuristic for now
        let risk = if amount > 1_000_000.0 {
            0.9
        } else if amount > 100_000.0 {
            0.4
        } else {
            0.05
        };
        Ok(risk)
    }
}

// ─── Fluvio Consumer Stub ─────────────────────────────────────────────────────

struct FluvioConsumerStub {
    endpoint: String,
    consumer_group: String,
    topics: Vec<String>,
    processor: Arc<EventProcessor>,
}

impl FluvioConsumerStub {
    fn new(config: &Config, processor: Arc<EventProcessor>) -> Self {
        Self {
            endpoint: config.fluvio_endpoint.clone(),
            consumer_group: config.consumer_group.clone(),
            topics: vec![
                "tourismpay.transactions".to_string(),
                "tourismpay.payments".to_string(),
                "tourismpay.kyc".to_string(),
                "tourismpay.notifications".to_string(),
                "tourismpay.audit".to_string(),
                "tourismpay.analytics".to_string(),
            ],
            processor,
        }
    }

    async fn run(&self) -> anyhow::Result<()> {
        info!(
            endpoint = self.endpoint,
            consumer_group = self.consumer_group,
            topics = ?self.topics,
            "Fluvio consumer started"
        );

        // Production: use fluvio crate
        // let fluvio = Fluvio::connect().await?;
        // let consumer = fluvio.partition_consumer("tourismpay.transactions", 0).await?;
        // let mut stream = consumer.stream(Offset::from_end(0)).await?;
        // while let Some(Ok(record)) = stream.next().await {
        //     let event: TourismPayEvent = serde_json::from_slice(record.value())?;
        //     processor.process_event(&topic, &event).await?;
        // }

        // Simulate consuming events
        let mut tick = 0u64;
        loop {
            sleep(Duration::from_secs(5)).await;
            tick += 1;
            info!(tick = tick, "Fluvio consumer heartbeat — waiting for events");
        }
    }
}

// ─── Health Check Server ──────────────────────────────────────────────────────

async fn health_server(port: u16, state: Arc<RwLock<ConsumerState>>) {
    use std::net::SocketAddr;

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("Health check server listening on {}", addr);

    // Production: use axum or warp for proper HTTP server
    // For now, just log the health status periodically
    loop {
        sleep(Duration::from_secs(30)).await;
        let s = state.read().await;
        let uptime = s.last_processed_at
            .map(|t| t.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs())
            .unwrap_or(0);
        info!(
            messages_processed = s.messages_processed,
            messages_failed = s.messages_failed,
            last_processed_at = uptime,
            "Consumer health status"
        );
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize structured logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("fluvio_consumer=info".parse().unwrap()),
        )
        .json()
        .init();

    let config = Config::from_env();
    info!(
        fluvio_endpoint = config.fluvio_endpoint,
        consumer_group = config.consumer_group,
        http_port = config.http_port,
        "Starting TourismPay Fluvio Consumer"
    );

    let processor = Arc::new(EventProcessor::new(config.clone()));
    let consumer = FluvioConsumerStub::new(&config, processor.clone());

    // Start health server
    let state_clone = processor.state.clone();
    let http_port = config.http_port;
    tokio::spawn(async move {
        health_server(http_port, state_clone).await;
    });

    // Start consumer in background
    tokio::spawn(async move {
        if let Err(e) = consumer.run().await {
            error!(error = %e, "Fluvio consumer error");
        }
    });

    // Wait for shutdown signal
    signal::ctrl_c().await?;
    info!("Shutting down Fluvio consumer...");

    Ok(())
}
