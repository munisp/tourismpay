use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

pub async fn create_pool(database_url: &str) -> PgPool {
    PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
        .expect("Failed to create database pool")
}

pub async fn run_migrations(pool: &PgPool) {
    let migrations = vec![
        r#"CREATE TABLE IF NOT EXISTS kyc_verifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id VARCHAR(128) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            document_type VARCHAR(32),
            document_country VARCHAR(3),
            document_number_hash VARCHAR(128),
            full_name VARCHAR(256),
            date_of_birth VARCHAR(16),
            nationality VARCHAR(3),
            liveness_score DOUBLE PRECISION,
            liveness_method VARCHAR(32),
            document_match_score DOUBLE PRECISION,
            risk_score DOUBLE PRECISION,
            sanctions_clear BOOLEAN,
            pep_clear BOOLEAN,
            reviewer_id VARCHAR(128),
            reviewer_notes TEXT,
            rejection_reason TEXT,
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"#,
        "CREATE INDEX IF NOT EXISTS idx_kyc_user ON kyc_verifications(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_verifications(status)",
        "CREATE INDEX IF NOT EXISTS idx_kyc_created ON kyc_verifications(created_at DESC)",
        r#"CREATE TABLE IF NOT EXISTS kyc_documents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            verification_id UUID NOT NULL REFERENCES kyc_verifications(id),
            document_type VARCHAR(32) NOT NULL,
            country VARCHAR(3) NOT NULL,
            front_image_url VARCHAR(512) NOT NULL,
            back_image_url VARCHAR(512),
            mrz_extracted TEXT,
            ocr_result JSONB,
            authenticity_score DOUBLE PRECISION,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"#,
        r#"CREATE TABLE IF NOT EXISTS liveness_checks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            verification_id UUID NOT NULL REFERENCES kyc_verifications(id),
            method VARCHAR(32) NOT NULL,
            score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            passed BOOLEAN NOT NULL DEFAULT false,
            challenge_data JSONB,
            video_url VARCHAR(512),
            photo_url VARCHAR(512),
            anti_spoofing_score DOUBLE PRECISION,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"#,
        r#"CREATE TABLE IF NOT EXISTS sanctions_screenings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            verification_id UUID REFERENCES kyc_verifications(id),
            full_name VARCHAR(256) NOT NULL,
            date_of_birth VARCHAR(16),
            nationality VARCHAR(3),
            passport_number_hash VARCHAR(128),
            matches_found INT NOT NULL DEFAULT 0,
            risk_level VARCHAR(16) NOT NULL DEFAULT 'low',
            lists_checked TEXT[] NOT NULL DEFAULT '{}',
            result JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"#,
        r#"CREATE TABLE IF NOT EXISTS biometric_templates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id VARCHAR(128) NOT NULL,
            template_type VARCHAR(32) NOT NULL,
            template_hash VARCHAR(256) NOT NULL,
            device_id VARCHAR(128) NOT NULL,
            confidence_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.95,
            enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"#,
        "CREATE INDEX IF NOT EXISTS idx_bio_user ON biometric_templates(user_id)",
        r#"CREATE TABLE IF NOT EXISTS biometric_auth_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id VARCHAR(128),
            merchant_id VARCHAR(128) NOT NULL,
            amount_cents BIGINT NOT NULL,
            currency VARCHAR(10) NOT NULL,
            auth_level VARCHAR(20) NOT NULL,
            authorized BOOLEAN NOT NULL DEFAULT false,
            confidence DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            transaction_token VARCHAR(128),
            device_id VARCHAR(128),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"#,
        r#"CREATE TABLE IF NOT EXISTS merchant_pos_devices (
            id VARCHAR(128) PRIMARY KEY,
            merchant_id VARCHAR(128) NOT NULL,
            location VARCHAR(256),
            capabilities TEXT[],
            max_offline_amount BIGINT NOT NULL DEFAULT 0,
            last_sync TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"#,
        r#"CREATE TABLE IF NOT EXISTS nfc_tokens (
            token_id VARCHAR(128) PRIMARY KEY,
            user_id VARCHAR(128) NOT NULL,
            amount DOUBLE PRECISION NOT NULL,
            currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
            merchant_id VARCHAR(128),
            nfc_payload_hex TEXT,
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            expires_at VARCHAR(64) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"#,
        "CREATE INDEX IF NOT EXISTS idx_nfc_tokens_user ON nfc_tokens(user_id)",
    ];

    for sql in migrations {
        sqlx::query(sql)
            .execute(pool)
            .await
            .unwrap_or_else(|e| panic!("Migration failed: {e}\nSQL: {}", &sql[..80.min(sql.len())]));
    }

    tracing::info!("Database migrations completed");
}
