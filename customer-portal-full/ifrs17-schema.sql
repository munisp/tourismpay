-- IFRS 17 Production-Grade Schema + Seed Data

-- Discount rate curves (yield curves from CBN)
CREATE TABLE IF NOT EXISTS ifrs17_discount_curves (
  id SERIAL PRIMARY KEY,
  curve_name VARCHAR(100) NOT NULL,
  currency VARCHAR(3) DEFAULT 'NGN',
  effective_date DATE NOT NULL,
  term_months INT NOT NULL,
  spot_rate DECIMAL(8,6) NOT NULL,
  forward_rate DECIMAL(8,6),
  source VARCHAR(50) DEFAULT 'CBN',
  created_at TIMESTAMP DEFAULT NOW()
);

-- IFRS 17 contract groups (expanded with VFA/GMM/PAA)
CREATE TABLE IF NOT EXISTS ifrs17_contract_groups (
  id SERIAL PRIMARY KEY,
  group_code VARCHAR(20) UNIQUE NOT NULL,
  group_name VARCHAR(100) NOT NULL,
  measurement_model VARCHAR(10) NOT NULL CHECK (measurement_model IN ('PAA','GMM','VFA')),
  portfolio VARCHAR(50) NOT NULL,
  cohort_year INT NOT NULL,
  is_onerous BOOLEAN DEFAULT FALSE,
  transition_approach VARCHAR(30) DEFAULT 'full_retrospective',
  inception_date DATE NOT NULL,
  coverage_period_months INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- CSM Rollforward periods (the heart of IFRS 17 reporting)
CREATE TABLE IF NOT EXISTS ifrs17_csm_rollforward (
  id SERIAL PRIMARY KEY,
  group_code VARCHAR(20) REFERENCES ifrs17_contract_groups(group_code),
  reporting_period VARCHAR(10) NOT NULL,
  opening_csm DECIMAL(18,2) NOT NULL,
  new_contracts DECIMAL(18,2) DEFAULT 0,
  interest_accretion DECIMAL(18,2) DEFAULT 0,
  changes_in_estimates DECIMAL(18,2) DEFAULT 0,
  experience_adjustments DECIMAL(18,2) DEFAULT 0,
  fx_movements DECIMAL(18,2) DEFAULT 0,
  csm_release DECIMAL(18,2) DEFAULT 0,
  closing_csm DECIMAL(18,2) NOT NULL,
  loss_component DECIMAL(18,2) DEFAULT 0,
  coverage_units_total INT DEFAULT 0,
  coverage_units_recognized INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Probability-weighted cashflow scenarios
CREATE TABLE IF NOT EXISTS ifrs17_cashflow_scenarios (
  id SERIAL PRIMARY KEY,
  group_code VARCHAR(20) REFERENCES ifrs17_contract_groups(group_code),
  scenario_name VARCHAR(50) NOT NULL,
  probability_weight DECIMAL(5,4) NOT NULL,
  premium_inflows DECIMAL(18,2) NOT NULL,
  claims_outflows DECIMAL(18,2) NOT NULL,
  expense_outflows DECIMAL(18,2) NOT NULL,
  investment_income DECIMAL(18,2) DEFAULT 0,
  discount_rate DECIMAL(8,6) NOT NULL,
  present_value DECIMAL(18,2) NOT NULL,
  reporting_period VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Reinsurance held contracts (IFRS 17 Part B)
CREATE TABLE IF NOT EXISTS ifrs17_reinsurance_held (
  id SERIAL PRIMARY KEY,
  group_code VARCHAR(20) REFERENCES ifrs17_contract_groups(group_code),
  reinsurer VARCHAR(100) NOT NULL,
  treaty_type VARCHAR(30) NOT NULL,
  cession_percentage DECIMAL(5,2),
  csm_reinsurance DECIMAL(18,2) DEFAULT 0,
  loss_recovery DECIMAL(18,2) DEFAULT 0,
  premium_ceded DECIMAL(18,2) DEFAULT 0,
  claims_recovered DECIMAL(18,2) DEFAULT 0,
  reporting_period VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Transition adjustments (IFRS 4 -> IFRS 17)
CREATE TABLE IF NOT EXISTS ifrs17_transition (
  id SERIAL PRIMARY KEY,
  group_code VARCHAR(20) REFERENCES ifrs17_contract_groups(group_code),
  approach VARCHAR(30) NOT NULL CHECK (approach IN ('full_retrospective','modified_retrospective','fair_value')),
  ifrs4_liability DECIMAL(18,2) NOT NULL,
  ifrs17_liability DECIMAL(18,2) NOT NULL,
  transition_adjustment DECIMAL(18,2) NOT NULL,
  equity_impact DECIMAL(18,2) NOT NULL,
  effective_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insurance Service Result (P&L) per period
CREATE TABLE IF NOT EXISTS ifrs17_pnl (
  id SERIAL PRIMARY KEY,
  group_code VARCHAR(20) REFERENCES ifrs17_contract_groups(group_code),
  reporting_period VARCHAR(10) NOT NULL,
  insurance_revenue DECIMAL(18,2) NOT NULL,
  insurance_service_expense DECIMAL(18,2) NOT NULL,
  insurance_service_result DECIMAL(18,2) NOT NULL,
  investment_income DECIMAL(18,2) DEFAULT 0,
  insurance_finance_expense DECIMAL(18,2) DEFAULT 0,
  net_financial_result DECIMAL(18,2) DEFAULT 0,
  loss_component_release DECIMAL(18,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════

-- CBN Yield Curve (Nigerian Government Bond rates as of 2026-Q2)
INSERT INTO ifrs17_discount_curves (curve_name, currency, effective_date, term_months, spot_rate, forward_rate, source) VALUES
  ('NGN Risk-Free', 'NGN', '2026-01-01', 3, 0.1450, 0.1480, 'CBN'),
  ('NGN Risk-Free', 'NGN', '2026-01-01', 6, 0.1520, 0.1590, 'CBN'),
  ('NGN Risk-Free', 'NGN', '2026-01-01', 12, 0.1580, 0.1640, 'CBN'),
  ('NGN Risk-Free', 'NGN', '2026-01-01', 24, 0.1620, 0.1680, 'CBN'),
  ('NGN Risk-Free', 'NGN', '2026-01-01', 36, 0.1650, 0.1710, 'CBN'),
  ('NGN Risk-Free', 'NGN', '2026-01-01', 60, 0.1680, 0.1740, 'CBN'),
  ('NGN Risk-Free', 'NGN', '2026-01-01', 120, 0.1720, 0.1780, 'CBN'),
  ('NGN Risk-Free', 'NGN', '2026-04-01', 3, 0.1420, 0.1450, 'CBN'),
  ('NGN Risk-Free', 'NGN', '2026-04-01', 6, 0.1490, 0.1560, 'CBN'),
  ('NGN Risk-Free', 'NGN', '2026-04-01', 12, 0.1550, 0.1610, 'CBN'),
  ('NGN Risk-Free', 'NGN', '2026-04-01', 24, 0.1590, 0.1650, 'CBN'),
  ('NGN Risk-Free', 'NGN', '2026-04-01', 36, 0.1620, 0.1680, 'CBN'),
  ('NGN Risk-Free', 'NGN', '2026-04-01', 60, 0.1660, 0.1720, 'CBN'),
  ('NGN Risk-Free', 'NGN', '2026-04-01', 120, 0.1700, 0.1760, 'CBN'),
  -- Illiquidity premium curve (for insurance liabilities)
  ('NGN Illiquidity', 'NGN', '2026-04-01', 12, 0.0080, NULL, 'Internal'),
  ('NGN Illiquidity', 'NGN', '2026-04-01', 24, 0.0100, NULL, 'Internal'),
  ('NGN Illiquidity', 'NGN', '2026-04-01', 36, 0.0120, NULL, 'Internal'),
  ('NGN Illiquidity', 'NGN', '2026-04-01', 60, 0.0140, NULL, 'Internal'),
  ('NGN Illiquidity', 'NGN', '2026-04-01', 120, 0.0160, NULL, 'Internal')
ON CONFLICT DO NOTHING;

-- Contract Groups (8 groups across 3 measurement models)
INSERT INTO ifrs17_contract_groups (group_code, group_name, measurement_model, portfolio, cohort_year, is_onerous, transition_approach, inception_date, coverage_period_months) VALUES
  ('MOT-IND-2025', 'Motor Individual 2025', 'PAA', 'Motor', 2025, FALSE, 'full_retrospective', '2025-01-01', 12),
  ('MOT-COM-2025', 'Motor Commercial 2025', 'PAA', 'Motor', 2025, FALSE, 'full_retrospective', '2025-01-01', 12),
  ('HLT-GRP-2025', 'Health Group 2025', 'GMM', 'Health', 2025, FALSE, 'modified_retrospective', '2025-01-01', 36),
  ('LIF-TRM-2025', 'Life Term 2025', 'VFA', 'Life', 2025, FALSE, 'fair_value', '2025-01-01', 240),
  ('LIF-END-2025', 'Life Endowment 2025', 'VFA', 'Life', 2025, FALSE, 'fair_value', '2025-01-01', 180),
  ('PRP-COM-2025', 'Property Commercial 2025', 'PAA', 'Property', 2025, FALSE, 'full_retrospective', '2025-01-01', 12),
  ('MAR-CRG-2025', 'Marine Cargo 2025', 'GMM', 'Marine', 2025, TRUE, 'modified_retrospective', '2025-01-01', 6),
  ('CYB-ENT-2026', 'Cyber Enterprise 2026', 'PAA', 'Cyber', 2026, FALSE, 'full_retrospective', '2026-01-01', 12)
ON CONFLICT (group_code) DO NOTHING;

-- CSM Rollforward (4 quarters: Q3-2025, Q4-2025, Q1-2026, Q2-2026)
INSERT INTO ifrs17_csm_rollforward (group_code, reporting_period, opening_csm, new_contracts, interest_accretion, changes_in_estimates, experience_adjustments, fx_movements, csm_release, closing_csm, loss_component, coverage_units_total, coverage_units_recognized) VALUES
  -- Motor Individual
  ('MOT-IND-2025', '2025-Q3', 0, 850000000, 12750000, 0, -25000000, 0, -85000000, 752750000, 0, 18000, 4500),
  ('MOT-IND-2025', '2025-Q4', 752750000, 120000000, 12294250, -45000000, -18000000, 0, -95000000, 727044250, 0, 18000, 4500),
  ('MOT-IND-2025', '2026-Q1', 727044250, 95000000, 11877722, -28000000, 15000000, 0, -92000000, 728921972, 0, 18000, 4500),
  ('MOT-IND-2025', '2026-Q2', 728921972, 110000000, 11902458, -32000000, -22000000, 0, -98000000, 698824430, 0, 18000, 4500),
  -- Health Group (GMM)
  ('HLT-GRP-2025', '2025-Q3', 0, 420000000, 6300000, 0, -35000000, 0, -14000000, 377300000, 0, 5000, 417),
  ('HLT-GRP-2025', '2025-Q4', 377300000, 55000000, 6107400, -62000000, -28000000, 0, -14500000, 333907400, 0, 5000, 417),
  ('HLT-GRP-2025', '2026-Q1', 333907400, 40000000, 5406300, -18000000, 12000000, 0, -15000000, 358313700, 0, 5000, 417),
  ('HLT-GRP-2025', '2026-Q2', 358313700, 48000000, 5804742, -25000000, -8000000, 0, -15500000, 363618442, 0, 5000, 417),
  -- Life Term (VFA)
  ('LIF-TRM-2025', '2025-Q3', 0, 1200000000, 18000000, 0, -15000000, 0, -5000000, 1198000000, 0, 3000, 38),
  ('LIF-TRM-2025', '2025-Q4', 1198000000, 180000000, 19468000, -85000000, -42000000, 0, -5500000, 1264968000, 0, 3000, 38),
  ('LIF-TRM-2025', '2026-Q1', 1264968000, 150000000, 20572980, -45000000, 28000000, 0, -6000000, 1412540980, 0, 3000, 38),
  ('LIF-TRM-2025', '2026-Q2', 1412540980, 165000000, 22984167, -52000000, -18000000, 0, -6500000, 1524025147, 0, 3000, 38),
  -- Marine Cargo (ONEROUS)
  ('MAR-CRG-2025', '2025-Q3', 0, -45000000, 0, 0, -12000000, 0, 0, -57000000, 57000000, 8000, 4000),
  ('MAR-CRG-2025', '2025-Q4', -57000000, -15000000, 0, -28000000, -8000000, 0, 12000000, -96000000, 96000000, 8000, 4000),
  ('MAR-CRG-2025', '2026-Q1', -96000000, 0, 0, 35000000, 18000000, 0, 8000000, -35000000, 35000000, 8000, 4000),
  ('MAR-CRG-2025', '2026-Q2', -35000000, -8000000, 0, 15000000, 5000000, 0, 6000000, -17000000, 17000000, 8000, 4000),
  -- Property Commercial
  ('PRP-COM-2025', '2026-Q1', 0, 680000000, 10200000, 0, -22000000, 0, -68000000, 600200000, 0, 12000, 3000),
  ('PRP-COM-2025', '2026-Q2', 600200000, 95000000, 9783260, -18000000, -12000000, 0, -72000000, 602983260, 0, 12000, 3000)
ON CONFLICT DO NOTHING;

-- Probability-Weighted Cashflow Scenarios
INSERT INTO ifrs17_cashflow_scenarios (group_code, scenario_name, probability_weight, premium_inflows, claims_outflows, expense_outflows, investment_income, discount_rate, present_value, reporting_period) VALUES
  -- Motor Individual scenarios
  ('MOT-IND-2025', 'Base Case', 0.5000, 2800000000, 1680000000, 336000000, 126000000, 0.1580, 2365000000, '2026-Q2'),
  ('MOT-IND-2025', 'Adverse (High Claims)', 0.2500, 2800000000, 2240000000, 392000000, 126000000, 0.1580, 1825000000, '2026-Q2'),
  ('MOT-IND-2025', 'Favourable (Low Claims)', 0.2000, 2800000000, 1260000000, 280000000, 126000000, 0.1580, 2750000000, '2026-Q2'),
  ('MOT-IND-2025', 'Catastrophe', 0.0500, 2800000000, 3500000000, 504000000, 126000000, 0.1580, 980000000, '2026-Q2'),
  -- Health Group scenarios
  ('HLT-GRP-2025', 'Base Case', 0.5000, 1800000000, 1350000000, 270000000, 81000000, 0.1620, 1520000000, '2026-Q2'),
  ('HLT-GRP-2025', 'Pandemic Stress', 0.1500, 1800000000, 2700000000, 450000000, 81000000, 0.1620, 650000000, '2026-Q2'),
  ('HLT-GRP-2025', 'Favourable', 0.2500, 1800000000, 1080000000, 216000000, 81000000, 0.1620, 1890000000, '2026-Q2'),
  ('HLT-GRP-2025', 'Medical Inflation', 0.1000, 1800000000, 1800000000, 360000000, 81000000, 0.1620, 1150000000, '2026-Q2'),
  -- Life Term (VFA) scenarios
  ('LIF-TRM-2025', 'Base Case', 0.5500, 5500000000, 825000000, 550000000, 742500000, 0.1700, 6200000000, '2026-Q2'),
  ('LIF-TRM-2025', 'Mortality Shock', 0.1500, 5500000000, 1650000000, 660000000, 742500000, 0.1700, 5100000000, '2026-Q2'),
  ('LIF-TRM-2025', 'Lapse Stress', 0.2000, 3850000000, 577500000, 385000000, 519750000, 0.1700, 4500000000, '2026-Q2'),
  ('LIF-TRM-2025', 'Interest Rate Rise', 0.1000, 5500000000, 825000000, 550000000, 990000000, 0.1900, 6800000000, '2026-Q2')
ON CONFLICT DO NOTHING;

-- Reinsurance Held Contracts
INSERT INTO ifrs17_reinsurance_held (group_code, reinsurer, treaty_type, cession_percentage, csm_reinsurance, loss_recovery, premium_ceded, claims_recovered, reporting_period) VALUES
  ('MOT-IND-2025', 'Africa Re', 'Quota Share', 25.00, 174706108, 0, 700000000, 420000000, '2026-Q2'),
  ('MOT-IND-2025', 'Continental Re', 'Excess of Loss', NULL, 45000000, 0, 85000000, 120000000, '2026-Q2'),
  ('HLT-GRP-2025', 'Swiss Re', 'Quota Share', 30.00, 109085533, 0, 540000000, 405000000, '2026-Q2'),
  ('LIF-TRM-2025', 'Munich Re', 'Surplus Share', 20.00, 304805029, 0, 1100000000, 165000000, '2026-Q2'),
  ('MAR-CRG-2025', 'Lloyds Syndicate', 'Facultative', 40.00, 0, 22800000, 320000000, 480000000, '2026-Q2'),
  ('PRP-COM-2025', 'Africa Re', 'Quota Share', 20.00, 120596652, 0, 380000000, 180000000, '2026-Q2')
ON CONFLICT DO NOTHING;

-- Transition Adjustments (IFRS 4 -> IFRS 17)
INSERT INTO ifrs17_transition (group_code, approach, ifrs4_liability, ifrs17_liability, transition_adjustment, equity_impact, effective_date) VALUES
  ('MOT-IND-2025', 'full_retrospective', 1850000000, 2150000000, 300000000, -225000000, '2025-01-01'),
  ('HLT-GRP-2025', 'modified_retrospective', 980000000, 1250000000, 270000000, -202500000, '2025-01-01'),
  ('LIF-TRM-2025', 'fair_value', 3200000000, 4100000000, 900000000, -675000000, '2025-01-01'),
  ('LIF-END-2025', 'fair_value', 2800000000, 3500000000, 700000000, -525000000, '2025-01-01'),
  ('PRP-COM-2025', 'full_retrospective', 1200000000, 1450000000, 250000000, -187500000, '2025-01-01'),
  ('MAR-CRG-2025', 'modified_retrospective', 450000000, 620000000, 170000000, -127500000, '2025-01-01')
ON CONFLICT DO NOTHING;

-- P&L by period
INSERT INTO ifrs17_pnl (group_code, reporting_period, insurance_revenue, insurance_service_expense, insurance_service_result, investment_income, insurance_finance_expense, net_financial_result, loss_component_release) VALUES
  ('MOT-IND-2025', '2025-Q3', 700000000, 504000000, 196000000, 31500000, 28000000, 3500000, 0),
  ('MOT-IND-2025', '2025-Q4', 720000000, 540000000, 180000000, 32400000, 29000000, 3400000, 0),
  ('MOT-IND-2025', '2026-Q1', 690000000, 483000000, 207000000, 31050000, 27000000, 4050000, 0),
  ('MOT-IND-2025', '2026-Q2', 710000000, 497000000, 213000000, 31950000, 28500000, 3450000, 0),
  ('HLT-GRP-2025', '2025-Q3', 450000000, 378000000, 72000000, 20250000, 18000000, 2250000, 0),
  ('HLT-GRP-2025', '2025-Q4', 480000000, 432000000, 48000000, 21600000, 19500000, 2100000, 0),
  ('HLT-GRP-2025', '2026-Q1', 460000000, 391000000, 69000000, 20700000, 18500000, 2200000, 0),
  ('HLT-GRP-2025', '2026-Q2', 470000000, 399500000, 70500000, 21150000, 19000000, 2150000, 0),
  ('LIF-TRM-2025', '2025-Q3', 280000000, 168000000, 112000000, 67500000, 54000000, 13500000, 0),
  ('LIF-TRM-2025', '2025-Q4', 295000000, 177000000, 118000000, 71250000, 57000000, 14250000, 0),
  ('LIF-TRM-2025', '2026-Q1', 290000000, 174000000, 116000000, 70000000, 56000000, 14000000, 0),
  ('LIF-TRM-2025', '2026-Q2', 300000000, 180000000, 120000000, 72500000, 58000000, 14500000, 0),
  ('MAR-CRG-2025', '2025-Q3', 200000000, 280000000, -80000000, 9000000, 8000000, 1000000, 12000000),
  ('MAR-CRG-2025', '2025-Q4', 180000000, 252000000, -72000000, 8100000, 7200000, 900000, 8000000),
  ('MAR-CRG-2025', '2026-Q1', 190000000, 209000000, -19000000, 8550000, 7600000, 950000, 6000000),
  ('MAR-CRG-2025', '2026-Q2', 195000000, 214500000, -19500000, 8775000, 7800000, 975000, 6000000),
  ('PRP-COM-2025', '2026-Q1', 520000000, 364000000, 156000000, 23400000, 20800000, 2600000, 0),
  ('PRP-COM-2025', '2026-Q2', 540000000, 378000000, 162000000, 24300000, 21600000, 2700000, 0)
ON CONFLICT DO NOTHING;
