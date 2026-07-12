-- Migration: 0076_enaira_cbdc_fluvio
-- Adds eNaira/CBDC wallet tables, Fluvio consumer offset tracking,
-- and APISIX route registry for full middleware integration.

-- ─── eNaira / CBDC Wallets ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enaira_wallets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address        VARCHAR(128) NOT NULL UNIQUE,
  cbn_wallet_id         VARCHAR(256),
  balance_kobo          BIGINT NOT NULL DEFAULT 0,
  currency              VARCHAR(8) NOT NULL DEFAULT 'eNGN',
  status                VARCHAR(32) NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'frozen', 'suspended', 'closed')),
  kyc_tier              SMALLINT NOT NULL DEFAULT 1 CHECK (kyc_tier BETWEEN 1 AND 3),
  daily_limit_kobo      BIGINT NOT NULL DEFAULT 20000000,   -- ₦200,000 default
  transaction_limit_kobo BIGINT NOT NULL DEFAULT 5000000,  -- ₦50,000 per txn
  last_sync_at          TIMESTAMPTZ,
  metadata              JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enaira_wallets_user_id ON enaira_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_enaira_wallets_status ON enaira_wallets(status);

-- ─── eNaira Transactions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enaira_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enaira_wallet_id      UUID NOT NULL REFERENCES enaira_wallets(id),
  cbn_transaction_ref   VARCHAR(256) UNIQUE,
  transaction_type      VARCHAR(32) NOT NULL
                          CHECK (transaction_type IN ('load', 'pay', 'transfer', 'refund', 'fee')),
  amount_kobo           BIGINT NOT NULL,
  fee_kobo              BIGINT NOT NULL DEFAULT 0,
  counterparty_address  VARCHAR(128),
  counterparty_name     VARCHAR(256),
  narration             TEXT,
  status                VARCHAR(32) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'reversed')),
  cbn_response          JSONB DEFAULT '{}',
  ledger_transfer_id    BIGINT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enaira_txns_wallet ON enaira_transactions(enaira_wallet_id);
CREATE INDEX IF NOT EXISTS idx_enaira_txns_status ON enaira_transactions(status);
CREATE INDEX IF NOT EXISTS idx_enaira_txns_cbn_ref ON enaira_transactions(cbn_transaction_ref);

-- ─── CBN Speed Wallet Merchant Registrations ─────────────────────────────────
CREATE TABLE IF NOT EXISTS cbn_merchant_registrations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id      UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  cbn_merchant_id       VARCHAR(256) NOT NULL UNIQUE,
  cbn_terminal_id       VARCHAR(128),
  merchant_category_code VARCHAR(8),
  registration_status   VARCHAR(32) NOT NULL DEFAULT 'pending'
                          CHECK (registration_status IN ('pending', 'active', 'suspended', 'deregistered')),
  registered_at         TIMESTAMPTZ,
  metadata              JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cbn_merchant_establishment ON cbn_merchant_registrations(establishment_id);

-- ─── Fluvio Consumer Offset Tracking ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fluvio_consumer_offsets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_group        VARCHAR(128) NOT NULL,
  topic                 VARCHAR(256) NOT NULL,
  partition             INTEGER NOT NULL DEFAULT 0,
  last_offset           BIGINT NOT NULL DEFAULT 0,
  last_processed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumer_host         VARCHAR(256),
  UNIQUE (consumer_group, topic, partition)
);

CREATE INDEX IF NOT EXISTS idx_fluvio_offsets_group_topic
  ON fluvio_consumer_offsets(consumer_group, topic);

-- ─── APISIX Route Registry ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS apisix_route_registry (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id              VARCHAR(128) NOT NULL UNIQUE,
  route_name            VARCHAR(256) NOT NULL,
  upstream_service      VARCHAR(128) NOT NULL,
  path_prefix           VARCHAR(512) NOT NULL,
  methods               TEXT[] NOT NULL DEFAULT ARRAY['GET', 'POST'],
  plugins               JSONB DEFAULT '{}',
  auth_required         BOOLEAN NOT NULL DEFAULT TRUE,
  rate_limit_rps        INTEGER,
  waf_enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  status                VARCHAR(16) NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'inactive', 'draft')),
  synced_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial APISIX route registry entries
INSERT INTO apisix_route_registry (route_id, route_name, upstream_service, path_prefix, methods, auth_required, rate_limit_rps, waf_enabled)
VALUES
  ('route-server-api',       'TypeScript API',         'tourismpay-server',    '/api',          ARRAY['GET','POST','PUT','DELETE','PATCH'], true,  100, true),
  ('route-enaira-gateway',   'eNaira Gateway',         'enaira-gateway',       '/enaira',       ARRAY['GET','POST'],                        true,  20,  true),
  ('route-settlement',       'Settlement Service',     'tourismpay-settlement','/settlement',   ARRAY['GET','POST'],                        true,  50,  true),
  ('route-kyc',              'KYC Service',            'tourismpay-kyc',       '/kyc',          ARRAY['GET','POST'],                        true,  30,  true),
  ('route-python-ml',        'Python ML Service',      'tourismpay-python-ml', '/ml',           ARRAY['GET','POST'],                        true,  10,  true),
  ('route-temporal-ui',      'Temporal UI',            'temporal-ui',          '/temporal',     ARRAY['GET'],                               true,  5,   false),
  ('route-apisix-dashboard', 'APISIX Dashboard',       'apisix-dashboard',     '/apisix-dash',  ARRAY['GET','POST'],                        true,  5,   false)
ON CONFLICT (route_id) DO NOTHING;

-- ─── Dapr Sidecar Health Tracking ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dapr_sidecar_health (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name          VARCHAR(128) NOT NULL,
  app_id                VARCHAR(128) NOT NULL UNIQUE,
  app_port              INTEGER NOT NULL,
  dapr_http_port        INTEGER NOT NULL DEFAULT 3500,
  dapr_grpc_port        INTEGER NOT NULL DEFAULT 50001,
  last_health_check     TIMESTAMPTZ,
  is_healthy            BOOLEAN NOT NULL DEFAULT FALSE,
  components_loaded     TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO dapr_sidecar_health (service_name, app_id, app_port)
VALUES
  ('tourismpay-server',     'tourismpay-server',     3000),
  ('tourismpay-settlement', 'tourismpay-settlement', 8081),
  ('tourismpay-enaira',     'tourismpay-enaira',     8095)
ON CONFLICT (app_id) DO NOTHING;
