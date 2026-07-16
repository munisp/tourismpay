-- Production-Grade Upgrades for NAICOM, Reinsurance, USSD Engines

-- ═══════════════════════════════════════
-- NAICOM Extensions
-- ═══════════════════════════════════════

-- Reporting schedule (replaces hardcoded array)
CREATE TABLE IF NOT EXISTS naicom_reporting_schedule (
  id SERIAL PRIMARY KEY,
  report_type VARCHAR(100) NOT NULL,
  frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('Monthly','Quarterly','Semi-Annual','Annual')),
  due_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('upcoming','overdue','submitted','acknowledged')),
  penalty_amount DECIMAL(18,2) DEFAULT 0,
  naicom_ref VARCHAR(50),
  circular_ref VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- NAICOM bidirectional data exchange log
CREATE TABLE IF NOT EXISTS naicom_data_exchange (
  id SERIAL PRIMARY KEY,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('outbound','inbound')),
  data_type VARCHAR(50) NOT NULL,
  payload JSONB,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','sent','received','acknowledged','failed')),
  naicom_ref VARCHAR(50),
  error_message TEXT,
  sent_at TIMESTAMP,
  acknowledged_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- NAICOM compliance penalties
CREATE TABLE IF NOT EXISTS naicom_penalties (
  id SERIAL PRIMARY KEY,
  report_type VARCHAR(100) NOT NULL,
  period VARCHAR(20) NOT NULL,
  penalty_type VARCHAR(50) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'outstanding' CHECK (status IN ('outstanding','paid','waived','disputed')),
  due_date DATE NOT NULL,
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- REINSURANCE Extensions
-- ═══════════════════════════════════════

-- Bordereaux (monthly statements to reinsurers)
CREATE TABLE IF NOT EXISTS reinsurance_bordereaux (
  id SERIAL PRIMARY KEY,
  treaty_id INT REFERENCES reinsurance_treaties(id),
  period VARCHAR(20) NOT NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN ('premium','claims','settlement')),
  total_amount DECIMAL(18,2) NOT NULL,
  line_items INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','sent','acknowledged','reconciled')),
  sent_at TIMESTAMP,
  acknowledged_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Reinsurance claims recovery
CREATE TABLE IF NOT EXISTS reinsurance_claims_recovery (
  id SERIAL PRIMARY KEY,
  cession_id INT,
  treaty_id INT REFERENCES reinsurance_treaties(id),
  claim_id INT,
  claim_amount DECIMAL(18,2) NOT NULL,
  recoverable_amount DECIMAL(18,2) NOT NULL,
  recovered_amount DECIMAL(18,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','notified','approved','paid','disputed')),
  recovery_ref VARCHAR(50),
  notified_at TIMESTAMP,
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Reinsurance cash calls / settlements
CREATE TABLE IF NOT EXISTS reinsurance_settlements (
  id SERIAL PRIMARY KEY,
  treaty_id INT REFERENCES reinsurance_treaties(id),
  settlement_type VARCHAR(30) NOT NULL CHECK (settlement_type IN ('premium_cession','claims_recovery','commission','profit_commission','cash_call')),
  period VARCHAR(20) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'NGN',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','invoiced','paid','overdue')),
  due_date DATE,
  paid_at TIMESTAMP,
  reference VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Facultative placements (individual risk placements)
CREATE TABLE IF NOT EXISTS reinsurance_facultative (
  id SERIAL PRIMARY KEY,
  policy_id INT,
  sum_assured DECIMAL(18,2) NOT NULL,
  risk_description TEXT,
  placement_status VARCHAR(20) DEFAULT 'open' CHECK (placement_status IN ('open','placed','declined','expired')),
  placed_with VARCHAR(100),
  placement_percentage DECIMAL(5,2),
  premium_rate DECIMAL(8,6),
  premium_amount DECIMAL(18,2),
  valid_from DATE,
  valid_to DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- USSD Extensions
-- ═══════════════════════════════════════

-- USSD session tracking (proper schema)
CREATE TABLE IF NOT EXISTS ussd_session_log (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(50) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  menu_level INT DEFAULT 0,
  user_input TEXT,
  response TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','completed','timeout','error')),
  pin_verified BOOLEAN DEFAULT FALSE,
  transaction_ref VARCHAR(50),
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- USSD PIN verification
CREATE TABLE IF NOT EXISTS ussd_pins (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  pin_hash VARCHAR(100) NOT NULL,
  attempts INT DEFAULT 0,
  locked_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- USSD analytics
CREATE TABLE IF NOT EXISTS ussd_analytics (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  total_sessions INT DEFAULT 0,
  completed_sessions INT DEFAULT 0,
  timeout_sessions INT DEFAULT 0,
  policy_lookups INT DEFAULT 0,
  claims_filed INT DEFAULT 0,
  payments_initiated INT DEFAULT 0,
  quotes_requested INT DEFAULT 0,
  avg_session_duration_seconds INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════

-- NAICOM Reporting Schedule
INSERT INTO naicom_reporting_schedule (report_type, frequency, due_date, status, penalty_amount, circular_ref) VALUES
  ('Quarterly Returns (Q1)', 'Quarterly', '2026-04-30', 'submitted', 0, 'NIC/DIR/CIR/25/001'),
  ('Quarterly Returns (Q2)', 'Quarterly', '2026-07-31', 'upcoming', 0, 'NIC/DIR/CIR/25/001'),
  ('Quarterly Returns (Q3)', 'Quarterly', '2026-10-31', 'upcoming', 0, 'NIC/DIR/CIR/25/001'),
  ('Annual Statement 2025', 'Annual', '2027-03-31', 'upcoming', 0, 'NIC/DIR/CIR/25/002'),
  ('Solvency Report (Q2)', 'Quarterly', '2026-07-31', 'upcoming', 0, 'NIC/DIR/CIR/25/003'),
  ('Risk-Based Capital (Q2)', 'Quarterly', '2026-07-31', 'upcoming', 0, 'NIC/DIR/CIR/25/004'),
  ('Investment Report (May)', 'Monthly', '2026-06-15', 'overdue', 500000, 'NIC/DIR/CIR/25/005'),
  ('Investment Report (Jun)', 'Monthly', '2026-07-15', 'upcoming', 0, 'NIC/DIR/CIR/25/005'),
  ('Motor Third Party Report (May)', 'Monthly', '2026-06-15', 'overdue', 250000, 'NIC/DIR/CIR/25/006'),
  ('Motor Third Party Report (Jun)', 'Monthly', '2026-07-15', 'upcoming', 0, 'NIC/DIR/CIR/25/006'),
  ('IFRS 17 Transition Report', 'Annual', '2026-12-31', 'upcoming', 0, 'NIC/DIR/CIR/25/007'),
  ('Reinsurance Arrangement Report', 'Semi-Annual', '2026-06-30', 'overdue', 750000, 'NIC/DIR/CIR/25/008')
ON CONFLICT DO NOTHING;

-- NAICOM Data Exchange Log
INSERT INTO naicom_data_exchange (direction, data_type, payload, status, naicom_ref, sent_at, acknowledged_at) VALUES
  ('outbound', 'quarterly_returns', '{"period":"2026-Q1","grossPremium":2800000000,"netPremium":2380000000}', 'acknowledged', 'NAICOM-ACK-2026-Q1-001', '2026-04-28', '2026-04-29'),
  ('outbound', 'solvency_report', '{"solvencyRatio":1.85,"capitalAdequacy":0.80}', 'acknowledged', 'NAICOM-ACK-2026-Q1-002', '2026-04-28', '2026-04-30'),
  ('inbound', 'compliance_notice', '{"type":"reminder","report":"Investment Report","deadline":"2026-06-15"}', 'received', 'NAICOM-IN-2026-001', NULL, '2026-06-01'),
  ('inbound', 'penalty_notice', '{"type":"penalty","amount":500000,"reason":"Late submission of Investment Report"}', 'received', 'NAICOM-IN-2026-002', NULL, '2026-06-16'),
  ('outbound', 'claims_report', '{"totalClaims":142,"totalAmount":485000000,"avgSettlement":28}', 'sent', NULL, '2026-06-01', NULL),
  ('inbound', 'circular', '{"ref":"NIC/DIR/CIR/25/009","subject":"Updated IFRS 17 Disclosure Requirements","effectiveDate":"2026-07-01"}', 'received', 'NAICOM-CIR-2026-009', NULL, '2026-05-15'),
  ('outbound', 'reinsurance_arrangement', '{"treaties":5,"totalCeded":3125000000,"retentionRatio":0.35}', 'acknowledged', 'NAICOM-ACK-2026-RI-001', '2026-03-31', '2026-04-02'),
  ('inbound', 'market_conduct_inquiry', '{"caseRef":"MCE/2026/012","subject":"Customer complaint escalation","deadline":"2026-06-30"}', 'received', 'NAICOM-MCE-2026-012', NULL, '2026-06-10')
ON CONFLICT DO NOTHING;

-- NAICOM Penalties
INSERT INTO naicom_penalties (report_type, period, penalty_type, amount, reason, status, due_date) VALUES
  ('Investment Report', '2026-May', 'Late Submission', 500000, 'Report not submitted by 15 June 2026 deadline', 'outstanding', '2026-07-15'),
  ('Motor Third Party Report', '2026-May', 'Late Submission', 250000, 'Report not submitted by 15 June 2026 deadline', 'outstanding', '2026-07-15'),
  ('Reinsurance Arrangement', '2026-H1', 'Late Submission', 750000, 'Semi-annual report not submitted by 30 June 2026', 'outstanding', '2026-07-30')
ON CONFLICT DO NOTHING;

-- Reinsurance Bordereaux
INSERT INTO reinsurance_bordereaux (treaty_id, period, type, total_amount, line_items, status, sent_at, acknowledged_at) VALUES
  (1, '2026-Q1', 'premium', 185000000, 342, 'reconciled', '2026-04-05', '2026-04-08'),
  (1, '2026-Q1', 'claims', 95000000, 28, 'reconciled', '2026-04-05', '2026-04-08'),
  (2, '2026-Q1', 'premium', 120000000, 156, 'acknowledged', '2026-04-10', '2026-04-12'),
  (1, '2026-Q2', 'premium', 210000000, 398, 'sent', '2026-07-02', NULL),
  (1, '2026-Q2', 'claims', 108000000, 35, 'sent', '2026-07-02', NULL),
  (2, '2026-Q2', 'premium', 145000000, 189, 'draft', NULL, NULL),
  (3, '2026-Q2', 'premium', 85000000, 78, 'draft', NULL, NULL)
ON CONFLICT DO NOTHING;

-- Reinsurance Claims Recovery
INSERT INTO reinsurance_claims_recovery (treaty_id, claim_id, claim_amount, recoverable_amount, recovered_amount, status, recovery_ref, notified_at, paid_at) VALUES
  (1, 1, 12500000, 9375000, 9375000, 'paid', 'REC-2026-001', '2026-03-15', '2026-04-20'),
  (1, 3, 8200000, 6150000, 6150000, 'paid', 'REC-2026-002', '2026-04-01', '2026-05-10'),
  (2, 5, 45000000, 35000000, 0, 'approved', 'REC-2026-003', '2026-05-20', NULL),
  (1, 7, 15800000, 11850000, 0, 'notified', 'REC-2026-004', '2026-06-01', NULL),
  (3, 9, 28000000, 22400000, 0, 'pending', NULL, NULL, NULL)
ON CONFLICT DO NOTHING;

-- Reinsurance Settlements
INSERT INTO reinsurance_settlements (treaty_id, settlement_type, period, amount, status, due_date, paid_at, reference) VALUES
  (1, 'premium_cession', '2026-Q1', 185000000, 'paid', '2026-04-30', '2026-04-28', 'SET-PC-2026-Q1-001'),
  (1, 'claims_recovery', '2026-Q1', 95000000, 'paid', '2026-05-15', '2026-05-12', 'SET-CR-2026-Q1-001'),
  (1, 'commission', '2026-Q1', 46250000, 'paid', '2026-04-30', '2026-04-28', 'SET-CM-2026-Q1-001'),
  (2, 'premium_cession', '2026-Q1', 120000000, 'paid', '2026-04-30', '2026-04-25', 'SET-PC-2026-Q1-002'),
  (1, 'premium_cession', '2026-Q2', 210000000, 'invoiced', '2026-07-31', NULL, 'SET-PC-2026-Q2-001'),
  (1, 'claims_recovery', '2026-Q2', 108000000, 'pending', '2026-08-15', NULL, NULL),
  (2, 'premium_cession', '2026-Q2', 145000000, 'pending', '2026-07-31', NULL, NULL),
  (1, 'cash_call', '2026-Q2', 25000000, 'overdue', '2026-06-15', NULL, 'CC-2026-001')
ON CONFLICT DO NOTHING;

-- Facultative Placements
INSERT INTO reinsurance_facultative (policy_id, sum_assured, risk_description, placement_status, placed_with, placement_percentage, premium_rate, premium_amount, valid_from, valid_to) VALUES
  (1, 500000000, 'Large commercial property — Lagos Island warehouse complex', 'placed', 'Lloyd''s Syndicate 2987', 60.00, 0.0085, 2550000, '2026-01-01', '2026-12-31'),
  (3, 250000000, 'Marine cargo — bulk petroleum shipment Lagos-Rotterdam', 'placed', 'Swiss Re Corporate Solutions', 70.00, 0.0120, 2100000, '2026-03-01', '2026-09-01'),
  (5, 180000000, 'Directors & Officers liability — listed company', 'placed', 'AIG Europe', 50.00, 0.0045, 405000, '2026-02-01', '2027-01-31'),
  (8, 750000000, 'Offshore oil platform — Nigeria EEZ', 'open', NULL, NULL, NULL, NULL, '2026-07-01', '2027-06-30'),
  (12, 120000000, 'Cyber insurance — fintech company (high exposure)', 'declined', 'Munich Re', NULL, NULL, NULL, NULL, NULL)
ON CONFLICT DO NOTHING;

-- USSD Session Log (sample sessions)
INSERT INTO ussd_session_log (session_id, phone, menu_level, user_input, response, status, pin_verified, expires_at) VALUES
  ('USSD-1717500000', '08012345678', 0, '*919#', 'Welcome to InsurePortal\n1. Check Policy\n2. File Claim\n3. Pay Premium\n4. Get Quote\n5. My Account\n6. Agent', 'completed', false, '2026-06-04 10:03:00'),
  ('USSD-1717500001', '08098765432', 1, 'POL-001', 'Policy: POL-001\nType: Motor\nStatus: Active\nPremium: ₦45000', 'completed', false, '2026-06-04 10:05:00'),
  ('USSD-1717500002', '07033344455', 3, '25000', 'Payment of ₦25,000 initiated. Enter PIN to confirm.', 'completed', true, '2026-06-04 11:02:00'),
  ('USSD-1717500003', '09011223344', 0, '*919#', 'Welcome to InsurePortal', 'timeout', false, '2026-06-04 12:00:00'),
  ('USSD-1717500004', '08055667788', 4, '1', 'Motor Comprehensive - ₦25,000/yr\nCoverage: Up to ₦50M', 'completed', false, '2026-06-04 14:30:00')
ON CONFLICT DO NOTHING;

-- USSD PINs (sample — hashed)
INSERT INTO ussd_pins (phone, pin_hash) VALUES
  ('08012345678', '$2b$12$LJ3m0xV8Q7Y5K9Z2W1a4YOR6JK8VN5XHGFDSAQWERTYU12345'),
  ('08098765432', '$2b$12$ABC123DEF456GHI789JKL0MNO1PQR2STU3VWX4YZ567890ABCDE'),
  ('07033344455', '$2b$12$XYZ789ABC123DEF456GHI0JKL1MNO2PQR3STU4VWX5YZ67890AB')
ON CONFLICT (phone) DO NOTHING;

-- USSD Analytics (last 7 days)
INSERT INTO ussd_analytics (date, total_sessions, completed_sessions, timeout_sessions, policy_lookups, claims_filed, payments_initiated, quotes_requested, avg_session_duration_seconds) VALUES
  ('2026-06-04', 342, 298, 44, 125, 18, 45, 67, 45),
  ('2026-06-03', 318, 276, 42, 112, 15, 38, 58, 42),
  ('2026-06-02', 295, 258, 37, 98, 12, 42, 55, 48),
  ('2026-06-01', 278, 241, 37, 92, 14, 35, 52, 41),
  ('2026-05-31', 256, 222, 34, 85, 11, 32, 48, 44),
  ('2026-05-30', 310, 270, 40, 108, 16, 40, 62, 46),
  ('2026-05-29', 289, 252, 37, 95, 13, 37, 54, 43)
ON CONFLICT DO NOTHING;
