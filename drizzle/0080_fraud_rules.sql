-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0080: Add missing fraud_rules table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fraud_rules (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  rule_type VARCHAR(50) NOT NULL,
  conditions JSONB NOT NULL,
  action VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_rules_type ON fraud_rules (rule_type);
CREATE INDEX IF NOT EXISTS idx_fraud_rules_active ON fraud_rules (is_active);

-- ─────────────────────────────────────────────────────────────────────────────
-- AI Conversations table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  session_id VARCHAR(200) NOT NULL,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  context VARCHAR(50) DEFAULT 'general',
  model_used VARCHAR(100),
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_session ON ai_conversations (session_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_created ON ai_conversations (created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- SLA definitions and breaches
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sla_definitions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200),
  target_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sla_breaches (
  id SERIAL PRIMARY KEY,
  definition_id INTEGER,
  actual_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
