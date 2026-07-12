-- Migration: 0075_middleware_observability.sql
-- Middleware observability tables for Temporal, Dapr, Fluvio, Lakehouse, OpenAppSec, Keycloak

CREATE TABLE IF NOT EXISTS temporal_workflow_executions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL UNIQUE,
  workflow_type TEXT NOT NULL,
  task_queue TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  input JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  error_message TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  correlation_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_temporal_workflow_executions_workflow_id ON temporal_workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_temporal_workflow_executions_status ON temporal_workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_temporal_workflow_executions_workflow_type ON temporal_workflow_executions(workflow_type);

CREATE TABLE IF NOT EXISTS dapr_subscriptions (
  id TEXT PRIMARY KEY,
  pubsub_name TEXT NOT NULL,
  topic TEXT NOT NULL,
  route TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dapr_subscriptions_topic ON dapr_subscriptions(topic);

CREATE TABLE IF NOT EXISTS dapr_state_entries (
  id TEXT PRIMARY KEY,
  store_name TEXT NOT NULL,
  state_key TEXT NOT NULL,
  state_value JSONB NOT NULL DEFAULT '{}',
  etag TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dapr_state_entries_store_key ON dapr_state_entries(store_name, state_key);

CREATE TABLE IF NOT EXISTS fluvio_consumer_offsets (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  partition INTEGER NOT NULL DEFAULT 0,
  consumer_group TEXT NOT NULL,
  offset BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(topic, partition, consumer_group)
);
CREATE INDEX IF NOT EXISTS idx_fluvio_consumer_offsets_topic ON fluvio_consumer_offsets(topic);

CREATE TABLE IF NOT EXISTS lakehouse_etl_runs (
  id TEXT PRIMARY KEY,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  rows_processed BIGINT DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_lakehouse_etl_runs_job_name ON lakehouse_etl_runs(job_name);
CREATE INDEX IF NOT EXISTS idx_lakehouse_etl_runs_status ON lakehouse_etl_runs(status);

CREATE TABLE IF NOT EXISTS openappsec_waf_events (
  id TEXT PRIMARY KEY,
  route_id TEXT,
  rule_name TEXT NOT NULL,
  severity TEXT NOT NULL,
  action TEXT NOT NULL,
  request_ip TEXT,
  request_path TEXT,
  request_body JSONB,
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_openappsec_waf_events_rule_name ON openappsec_waf_events(rule_name);
CREATE INDEX IF NOT EXISTS idx_openappsec_waf_events_severity ON openappsec_waf_events(severity);
CREATE INDEX IF NOT EXISTS idx_openappsec_waf_events_blocked ON openappsec_waf_events(blocked);

CREATE TABLE IF NOT EXISTS keycloak_session_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  keycloak_session_id TEXT NOT NULL UNIQUE,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_keycloak_session_tokens_user_id ON keycloak_session_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_keycloak_session_tokens_keycloak_session_id ON keycloak_session_tokens(keycloak_session_id);
