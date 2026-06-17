-- Migration: Government Tax Remittance System
-- Adds tables for batch tracking, payment processing, audit trail,
-- and compliance reporting for 10 African jurisdictions.

-- ─── Remittance Batches ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_remittance_batches (
  id TEXT PRIMARY KEY,
  jurisdiction_code TEXT NOT NULL,
  tax_authority TEXT NOT NULL,
  period TEXT NOT NULL,
  filing_deadline BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_collected DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_remitted DECIMAL(18,2) NOT NULL DEFAULT 0,
  outstanding DECIMAL(18,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  tax_breakdown JSONB,
  govt_bank_account JSONB,
  payment_ref TEXT,
  created_at BIGINT NOT NULL,
  processed_at BIGINT,
  confirmed_at BIGINT,
  created_by TEXT
);

CREATE INDEX idx_remittance_batches_jurisdiction ON tax_remittance_batches(jurisdiction_code);
CREATE INDEX idx_remittance_batches_period ON tax_remittance_batches(period);
CREATE INDEX idx_remittance_batches_status ON tax_remittance_batches(status);
CREATE INDEX idx_remittance_batches_deadline ON tax_remittance_batches(filing_deadline);

-- ─── Remittance Payments ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_remittance_payments (
  id TEXT PRIMARY KEY,
  batch_id TEXT REFERENCES tax_remittance_batches(id),
  jurisdiction_code TEXT NOT NULL,
  period TEXT NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'initiated',
  transfer_method TEXT NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  govt_receipt TEXT,
  failure_reason TEXT,
  initiated_at BIGINT NOT NULL,
  confirmed_at BIGINT,
  reversed_at BIGINT,
  initiated_by TEXT
);

CREATE INDEX idx_remittance_payments_batch ON tax_remittance_payments(batch_id);
CREATE INDEX idx_remittance_payments_jurisdiction ON tax_remittance_payments(jurisdiction_code);
CREATE INDEX idx_remittance_payments_status ON tax_remittance_payments(status);
CREATE INDEX idx_remittance_payments_reference ON tax_remittance_payments(reference);
CREATE INDEX idx_remittance_payments_initiated ON tax_remittance_payments(initiated_at);

-- ─── Remittance Audit Log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_remittance_audit (
  id TEXT PRIMARY KEY,
  batch_id TEXT REFERENCES tax_remittance_batches(id),
  payment_id TEXT REFERENCES tax_remittance_payments(id),
  jurisdiction_code TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  details JSONB,
  created_at BIGINT NOT NULL
);

CREATE INDEX idx_remittance_audit_batch ON tax_remittance_audit(batch_id);
CREATE INDEX idx_remittance_audit_jurisdiction ON tax_remittance_audit(jurisdiction_code);
CREATE INDEX idx_remittance_audit_action ON tax_remittance_audit(action);
CREATE INDEX idx_remittance_audit_created ON tax_remittance_audit(created_at);

-- ─── Compliance Reports ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_compliance_reports (
  id TEXT PRIMARY KEY,
  jurisdiction_code TEXT NOT NULL,
  period TEXT NOT NULL,
  report_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generated',
  data JSONB,
  generated_at BIGINT NOT NULL,
  submitted_at BIGINT,
  acknowledged_at BIGINT,
  generated_by TEXT
);

CREATE INDEX idx_compliance_reports_jurisdiction ON tax_compliance_reports(jurisdiction_code);
CREATE INDEX idx_compliance_reports_period ON tax_compliance_reports(period);
CREATE INDEX idx_compliance_reports_type ON tax_compliance_reports(report_type);

-- ─── Filing Schedules (configurable per merchant/org) ───────────────────────
CREATE TABLE IF NOT EXISTS tax_filing_schedules (
  id TEXT PRIMARY KEY,
  jurisdiction_code TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  deadline_day INTEGER NOT NULL DEFAULT 21,
  grace_period_days INTEGER NOT NULL DEFAULT 7,
  auto_remit BOOLEAN NOT NULL DEFAULT true,
  min_batch_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at BIGINT NOT NULL,
  updated_at BIGINT
);

CREATE INDEX idx_filing_schedules_jurisdiction ON tax_filing_schedules(jurisdiction_code);
CREATE INDEX idx_filing_schedules_active ON tax_filing_schedules(is_active);
