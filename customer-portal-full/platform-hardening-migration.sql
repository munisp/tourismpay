-- Platform Production Hardening Migration
-- Creates tables for all 133 hardcoded routes + seeds with realistic data

-- ═══════════════════════════════════════════════════════════════════════
-- 1. PARAMETRIC INSURANCE TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS parametric_triggers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  trigger_type VARCHAR(50) NOT NULL, -- rainfall, earthquake, flood, drought
  threshold NUMERIC(10,2) NOT NULL,
  unit VARCHAR(20) NOT NULL, -- mm, richter, meters, days
  region VARCHAR(100) NOT NULL,
  payout_amount NUMERIC(15,2) NOT NULL,
  policy_count INTEGER DEFAULT 0,
  last_triggered TIMESTAMP,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO parametric_triggers (name, trigger_type, threshold, unit, region, payout_amount, policy_count, last_triggered, status) VALUES
('Lagos Flood Index', 'rainfall', 150.00, 'mm/24h', 'Lagos', 5000000, 450, '2026-04-15 08:30:00', 'active'),
('Kano Drought Index', 'drought', 45.00, 'days', 'Kano', 3000000, 280, '2026-03-01 00:00:00', 'active'),
('Niger Delta Flood', 'flood', 2.50, 'meters', 'Rivers', 8000000, 120, NULL, 'active'),
('Abuja Earthquake Monitor', 'earthquake', 4.5, 'richter', 'Abuja', 15000000, 35, NULL, 'monitoring'),
('Benue Valley Rainfall', 'rainfall', 200.00, 'mm/24h', 'Benue', 4000000, 195, '2026-05-20 14:00:00', 'triggered'),
('Sokoto Heat Index', 'drought', 30.00, 'days_above_40C', 'Sokoto', 2500000, 340, '2026-04-28 00:00:00', 'active')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. HEALTH & WELLNESS PROGRAMS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS health_programs (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  frequency VARCHAR(30) NOT NULL,
  category VARCHAR(50) DEFAULT 'wellness',
  points_reward INTEGER DEFAULT 0,
  enrolled_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO health_programs (name, description, frequency, category, points_reward, enrolled_count) VALUES
('Annual Wellness Check', 'Comprehensive annual health screening with partner hospitals', 'yearly', 'preventive', 500, 3420),
('Fitness Rewards', 'Earn points for physical activity tracked via wearables', 'daily', 'fitness', 50, 8750),
('Mental Health Support', 'Counseling and therapy sessions with licensed professionals', 'on-demand', 'mental_health', 200, 1890),
('Chronic Disease Management', 'Ongoing monitoring and medication adherence for chronic conditions', 'monthly', 'chronic_care', 300, 2100),
('Prenatal Care Program', 'Regular checkups and nutritional guidance for expecting mothers', 'bi-weekly', 'maternal', 400, 680),
('Vision & Dental Checkup', 'Annual eye and dental examinations', 'yearly', 'preventive', 250, 4200),
('Nutrition Counseling', 'Personalized dietary plans from registered dietitians', 'weekly', 'nutrition', 150, 1560),
('Smoking Cessation Program', '12-week program with nicotine replacement therapy', 'weekly', 'behavioral', 1000, 340)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. CURRENCY EXCHANGE RATES
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS currency_rates (
  id SERIAL PRIMARY KEY,
  from_currency VARCHAR(5) NOT NULL,
  to_currency VARCHAR(5) NOT NULL,
  rate NUMERIC(12,8) NOT NULL,
  source VARCHAR(50) DEFAULT 'CBN',
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(from_currency, to_currency)
);

INSERT INTO currency_rates (from_currency, to_currency, rate, source) VALUES
('NGN', 'USD', 0.000625, 'CBN'),
('NGN', 'GBP', 0.000495, 'CBN'),
('NGN', 'EUR', 0.000575, 'CBN'),
('NGN', 'GHS', 0.0094, 'CBN'),
('NGN', 'KES', 0.0806, 'CBN'),
('NGN', 'ZAR', 0.0113, 'CBN'),
('USD', 'NGN', 1600.00, 'CBN'),
('GBP', 'NGN', 2020.00, 'CBN'),
('EUR', 'NGN', 1739.13, 'CBN')
ON CONFLICT (from_currency, to_currency) DO UPDATE SET rate = EXCLUDED.rate, last_updated = NOW();

-- ═══════════════════════════════════════════════════════════════════════
-- 4. AB TESTING EXPERIMENTS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ab_experiments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'active',
  variant_a VARCHAR(100) NOT NULL,
  variant_b VARCHAR(100) NOT NULL,
  winner VARCHAR(5), -- 'A', 'B', NULL
  traffic_split NUMERIC(3,2) DEFAULT 0.50,
  start_date DATE NOT NULL,
  end_date DATE,
  metric VARCHAR(100),
  variant_a_conversion NUMERIC(5,4),
  variant_b_conversion NUMERIC(5,4),
  sample_size INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO ab_experiments (name, description, status, variant_a, variant_b, winner, traffic_split, start_date, end_date, metric, variant_a_conversion, variant_b_conversion, sample_size) VALUES
('Premium Pricing Display', 'Testing dynamic vs flat pricing on quote page', 'active', 'Flat Rate Display', 'Dynamic Pricing Display', NULL, 0.50, '2026-05-01', '2026-06-30', 'conversion_rate', 0.0342, 0.0418, 15420),
('Claims UX Flow', 'Simplified vs wizard-based claims submission', 'completed', 'Multi-Step Wizard', 'Single Page Form', 'B', 0.50, '2026-03-01', '2026-04-30', 'completion_rate', 0.6200, 0.7800, 8900),
('Onboarding KYC Sequence', 'Testing KYC before vs after product selection', 'active', 'KYC First', 'Product First', NULL, 0.50, '2026-05-15', '2026-07-15', 'signup_completion', 0.4100, 0.4850, 4200),
('Mobile Premium Calculator', 'Step-by-step vs all-at-once premium calculator', 'active', 'Progressive Input', 'All Fields Visible', NULL, 0.50, '2026-05-20', '2026-07-20', 'quote_requests', 0.2890, 0.3150, 6800),
('Renewal Reminder Timing', 'Testing 30-day vs 14-day renewal reminders', 'completed', '30-Day Reminder', '14-Day Reminder', 'A', 0.50, '2026-02-01', '2026-03-31', 'renewal_rate', 0.7200, 0.6500, 12000)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. CLAIM ROUTING RULES
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS claim_routing_rules (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  condition_field VARCHAR(50) NOT NULL,
  operator VARCHAR(20) NOT NULL,
  threshold VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  target_team VARCHAR(100),
  priority INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO claim_routing_rules (name, condition_field, operator, threshold, action, target_team, priority) VALUES
('High Value Claims', 'amount', '>', '1000000', 'route_to_senior_adjuster', 'Senior Claims Team', 1),
('Motor Claims', 'type', '==', 'Motor', 'route_to_motor_team', 'Motor Claims Unit', 2),
('Fraud Alert', 'fraudScore', '>', '70', 'route_to_siu', 'Special Investigations Unit', 1),
('Health Emergency', 'type', '==', 'Health', 'fast_track', 'Health Claims Team', 1),
('Agricultural Claims', 'type', '==', 'Agricultural', 'route_to_agri_team', 'Agricultural Assessment', 2),
('VIP Customer', 'customerTier', '==', 'Platinum', 'priority_handling', 'VIP Services', 1),
('Group Life Death', 'subType', '==', 'death_benefit', 'immediate_review', 'Life Claims Senior', 1),
('Cyber Insurance', 'type', '==', 'Cyber', 'route_to_cyber_team', 'Cyber Risk Unit', 2)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. INSURANCE SCORE IMPROVEMENT SUGGESTIONS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS score_improvement_tips (
  id SERIAL PRIMARY KEY,
  suggestion TEXT NOT NULL,
  impact VARCHAR(30) NOT NULL,
  priority VARCHAR(10) NOT NULL,
  category VARCHAR(50),
  applicable_score_range INT4RANGE,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO score_improvement_tips (suggestion, impact, priority, category) VALUES
('Maintain continuous coverage without gaps', '+15 points', 'high', 'coverage'),
('Pay premiums on time every month', '+10 points', 'high', 'payment'),
('Reduce claim frequency (file only genuine claims)', '+8 points', 'medium', 'claims'),
('Bundle multiple policies (motor + health + property)', '+12 points', 'medium', 'diversity'),
('Install approved telematics device in vehicle', '+5 points', 'low', 'telematics'),
('Complete annual health wellness check', '+3 points', 'low', 'health'),
('Maintain no-claims bonus for 3+ years', '+20 points', 'high', 'claims'),
('Add family members to group coverage', '+7 points', 'medium', 'coverage')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. LOYALTY TIERS CONFIGURATION
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS loyalty_tiers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(30) NOT NULL UNIQUE,
  min_points INTEGER NOT NULL,
  discount_pct NUMERIC(4,2) DEFAULT 0,
  benefits TEXT[] NOT NULL,
  color VARCHAR(20),
  icon VARCHAR(50)
);

INSERT INTO loyalty_tiers (name, min_points, discount_pct, benefits, color, icon) VALUES
('Bronze', 0, 5.00, ARRAY['Basic support', '5% renewal discount', 'Birthday bonus points'], '#CD7F32', 'shield'),
('Silver', 5000, 10.00, ARRAY['Priority support', '10% renewal discount', 'Free roadside assistance', 'Quarterly bonus points'], '#C0C0C0', 'star'),
('Gold', 15000, 15.00, ARRAY['Dedicated agent', '15% discount', 'Free roadside', 'Annual health check', 'Priority claims'], '#FFD700', 'crown'),
('Platinum', 30000, 20.00, ARRAY['VIP support', '20% discount', 'All Gold benefits', 'Travel insurance', 'Family coverage add-on', 'Annual retreat'], '#E5E4E2', 'diamond')
ON CONFLICT (name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 8. REWARDS ACHIEVEMENTS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS achievements (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  points_reward INTEGER DEFAULT 0,
  icon VARCHAR(50),
  criteria_type VARCHAR(30),
  criteria_value INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  achievement_id INTEGER REFERENCES achievements(id),
  earned_at TIMESTAMP,
  progress INTEGER DEFAULT 0,
  target INTEGER DEFAULT 1,
  UNIQUE(user_id, achievement_id)
);

INSERT INTO achievements (name, description, category, points_reward, icon, criteria_type, criteria_value) VALUES
('First Policy', 'Purchased your first insurance policy', 'milestone', 500, 'badge', 'policy_count', 1),
('Claim-Free Year', 'No claims for 12 consecutive months', 'performance', 1000, 'star', 'claim_free_months', 12),
('Referral Champion', 'Referred 5 friends who signed up', 'social', 2000, 'users', 'referral_count', 5),
('Premium Pioneer', 'Paid premiums on time for 6 months', 'payment', 750, 'clock', 'on_time_payments', 6),
('Coverage Complete', 'Have 3 or more active policies', 'coverage', 1500, 'shield', 'active_policies', 3),
('Wellness Warrior', 'Completed 5 health program activities', 'health', 800, 'heart', 'wellness_activities', 5),
('Digital Native', 'Used all digital channels (web, mobile, USSD)', 'engagement', 600, 'smartphone', 'channel_count', 3),
('Loyalty Legend', 'Maintained Gold tier for 12 months', 'loyalty', 3000, 'crown', 'gold_months', 12)
ON CONFLICT DO NOTHING;

INSERT INTO user_achievements (user_id, achievement_id, earned_at, progress, target)
SELECT 1, id, CASE WHEN id <= 2 THEN '2026-01-15'::timestamp WHEN id = 5 THEN '2026-03-01'::timestamp ELSE NULL END, 
  CASE WHEN id <= 2 THEN achievements.criteria_value WHEN id = 3 THEN 3 WHEN id = 5 THEN 3 ELSE 0 END,
  achievements.criteria_value
FROM achievements
ON CONFLICT (user_id, achievement_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 9. COMMUNICATION PREFERENCES
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS communication_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) UNIQUE,
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT true,
  whatsapp_enabled BOOLEAN DEFAULT false,
  telegram_enabled BOOLEAN DEFAULT false,
  frequency VARCHAR(20) DEFAULT 'immediate',
  language VARCHAR(10) DEFAULT 'en',
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO communication_preferences (user_id, email_enabled, sms_enabled, push_enabled, whatsapp_enabled, frequency, language)
SELECT id, true, true, true, false, 'immediate', 'en' FROM users WHERE id <= 5
ON CONFLICT (user_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 10. GEOSPATIAL RISK ZONES
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS geospatial_zones (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  zone_type VARCHAR(30) NOT NULL, -- region, risk_zone, flood_zone
  risk_level VARCHAR(20),
  policy_count INTEGER DEFAULT 0,
  claims_count INTEGER DEFAULT 0,
  loss_ratio NUMERIC(5,2),
  latitude NUMERIC(10,6),
  longitude NUMERIC(10,6),
  polygon JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO geospatial_zones (name, zone_type, risk_level, policy_count, claims_count, loss_ratio, latitude, longitude, polygon) VALUES
('Lagos', 'region', 'medium', 8500, 1200, 42.0, 6.5244, 3.3792, '[[6.45,3.35],[6.55,3.35],[6.55,3.45],[6.45,3.45]]'),
('Abuja', 'region', 'low', 4200, 580, 38.0, 9.0579, 7.4951, '[[9.0,7.4],[9.1,7.4],[9.1,7.6],[9.0,7.6]]'),
('Kano', 'region', 'medium', 2800, 420, 45.0, 12.0022, 8.5920, '[[11.9,8.5],[12.1,8.5],[12.1,8.7],[11.9,8.7]]'),
('Port Harcourt', 'region', 'high', 3100, 680, 52.0, 4.8156, 7.0498, '[[4.7,6.9],[4.9,6.9],[4.9,7.1],[4.7,7.1]]'),
('Ibadan', 'region', 'low', 1950, 250, 35.0, 7.3775, 3.9470, '[[7.3,3.8],[7.5,3.8],[7.5,4.1],[7.3,4.1]]'),
('Lagos Flood Zone A', 'flood_zone', 'high', 350, 120, 85.0, 6.4531, 3.3958, '[[6.45,3.35],[6.50,3.35],[6.50,3.45],[6.45,3.45]]'),
('Niger Delta Erosion Zone', 'risk_zone', 'high', 120, 45, 92.0, 5.0527, 6.8561, '[[4.9,6.7],[5.2,6.7],[5.2,7.0],[4.9,7.0]]'),
('North Drought Belt', 'risk_zone', 'medium', 890, 210, 58.0, 12.5, 7.5, '[[12.0,7.0],[13.0,7.0],[13.0,8.0],[12.0,8.0]]')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 11. DISASTER RECOVERY STATUS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS disaster_recovery_config (
  id SERIAL PRIMARY KEY,
  component VARCHAR(100) NOT NULL UNIQUE,
  rto_hours NUMERIC(5,1) NOT NULL,
  rpo_hours NUMERIC(5,1) NOT NULL,
  replication_lag_seconds NUMERIC(6,2),
  last_test_date DATE,
  last_test_result VARCHAR(20),
  backup_location VARCHAR(200),
  failover_type VARCHAR(30),
  status VARCHAR(20) DEFAULT 'healthy',
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO disaster_recovery_config (component, rto_hours, rpo_hours, replication_lag_seconds, last_test_date, last_test_result, backup_location, failover_type, status) VALUES
('PostgreSQL Primary', 4.0, 1.0, 2.3, '2026-05-01', 'passed', 's3://insureportal-backups/pg/', 'streaming_replication', 'healthy'),
('Redis Cache', 0.5, 0.0, 0.1, '2026-05-15', 'passed', 's3://insureportal-backups/redis/', 'sentinel_failover', 'healthy'),
('Application Servers', 2.0, 0.0, NULL, '2026-05-10', 'passed', NULL, 'blue_green', 'healthy'),
('File Storage', 8.0, 4.0, 45.0, '2026-04-20', 'passed', 's3://insureportal-backups/files/', 'cross_region', 'healthy'),
('Kafka Cluster', 1.0, 0.5, 1.5, '2026-05-18', 'passed', NULL, 'multi_az', 'healthy'),
('ML Model Registry', 12.0, 8.0, NULL, '2026-04-01', 'passed', 's3://insureportal-backups/models/', 'cold_standby', 'healthy')
ON CONFLICT (component) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 12. MODEL SECURITY AUDITS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS model_security_audits (
  id SERIAL PRIMARY KEY,
  model_name VARCHAR(100) NOT NULL,
  audit_date DATE NOT NULL,
  overall_score INTEGER NOT NULL,
  vulnerabilities_found INTEGER DEFAULT 0,
  vulnerabilities_patched INTEGER DEFAULT 0,
  recommendations TEXT[],
  adversarial_tests_passed INTEGER,
  adversarial_tests_total INTEGER,
  data_leakage_risk VARCHAR(20),
  encryption_status VARCHAR(20),
  inference_logging BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO model_security_audits (model_name, audit_date, overall_score, vulnerabilities_found, vulnerabilities_patched, recommendations, adversarial_tests_passed, adversarial_tests_total, data_leakage_risk, encryption_status, inference_logging) VALUES
('fraud_detection_v2', '2026-05-25', 92, 1, 1, ARRAY['Rotate encryption keys quarterly'], 48, 50, 'low', 'AES-256', true),
('claims_adjudication_v2', '2026-05-25', 88, 2, 1, ARRAY['Update model weights encryption', 'Add differential privacy'], 45, 50, 'medium', 'AES-256', true),
('churn_prediction_v2', '2026-05-25', 95, 0, 0, ARRAY[]::text[], 50, 50, 'low', 'AES-256', true),
('anomaly_detection_v2', '2026-05-25', 85, 2, 2, ARRAY['Add inference rate limiting', 'Implement model watermarking'], 42, 50, 'low', 'AES-256', false)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 13. VOICE ASSISTANT CONFIGURATION
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS voice_config (
  id SERIAL PRIMARY KEY,
  language_code VARCHAR(10) NOT NULL UNIQUE,
  language_name VARCHAR(50) NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  tts_provider VARCHAR(50) DEFAULT 'google',
  stt_provider VARCHAR(50) DEFAULT 'google',
  greeting TEXT,
  capabilities TEXT[]
);

INSERT INTO voice_config (language_code, language_name, is_enabled, greeting, capabilities) VALUES
('en-NG', 'English (Nigeria)', true, 'Welcome to InsurePortal. How can I help you today?', ARRAY['policy_inquiry', 'claims_status', 'premium_payment', 'agent_connect', 'quote_request']),
('yo', 'Yoruba', true, 'E kaabo si InsurePortal. Bawo ni mo se le ran yin lowo?', ARRAY['policy_inquiry', 'claims_status', 'premium_payment']),
('ha', 'Hausa', true, 'Barka da zuwa InsurePortal. Yaya zan iya taimaka muku?', ARRAY['policy_inquiry', 'claims_status', 'premium_payment']),
('ig', 'Igbo', true, 'Nnọọ na InsurePortal. Kedu ka m ga-esi nyere gị aka?', ARRAY['policy_inquiry', 'claims_status'])
ON CONFLICT (language_code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 14. CHATBOT CONFIGURATION
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS chatbot_config (
  id SERIAL PRIMARY KEY,
  config_key VARCHAR(50) NOT NULL UNIQUE,
  config_value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO chatbot_config (config_key, config_value) VALUES
('general', '{"enabled": true, "greeting": "Hello! How can I help you with your insurance needs?", "fallbackMessage": "I''m not sure about that. Let me connect you to an agent.", "maxSessionMinutes": 30}'),
('languages', '["en", "yo", "ha", "ig", "pcm"]'),
('capabilities', '["policy_inquiry", "claims_status", "premium_calculator", "agent_connect", "quote_request", "document_upload", "complaint_filing"]'),
('ai_config', '{"model": "gpt-4", "temperature": 0.3, "maxTokens": 500, "systemPrompt": "You are InsurePortal assistant specializing in Nigerian insurance products."}')
ON CONFLICT (config_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 15. AGRICULTURAL SCHEMES (Federal/State Programs)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agricultural_schemes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  scheme_type VARCHAR(30) NOT NULL, -- federal, state, private
  coverage_type VARCHAR(50) NOT NULL, -- crop, livestock, aquaculture
  max_payout NUMERIC(15,2) NOT NULL,
  subsidy_pct NUMERIC(5,2) DEFAULT 0,
  administering_body VARCHAR(100),
  eligible_states TEXT[],
  enrollment_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO agricultural_schemes (name, scheme_type, coverage_type, max_payout, subsidy_pct, administering_body, eligible_states, enrollment_count) VALUES
('NIRSAL Agri-Insurance', 'federal', 'crop', 5000000, 50, 'Nigeria Incentive-Based Risk Sharing System', ARRAY['All States'], 45000),
('NAIC Livestock Protection', 'federal', 'livestock', 2000000, 40, 'National Agricultural Insurance Corporation', ARRAY['All States'], 28000),
('Lagos State Cassava Programme', 'state', 'crop', 1000000, 60, 'Lagos State Ministry of Agriculture', ARRAY['Lagos'], 3200),
('CBN Anchor Borrowers Scheme', 'federal', 'crop', 3000000, 50, 'Central Bank of Nigeria', ARRAY['All States'], 62000),
('Kaduna Rice Farmers Protection', 'state', 'crop', 1500000, 45, 'Kaduna State Government', ARRAY['Kaduna'], 8500),
('Niger Delta Aquaculture Cover', 'state', 'aquaculture', 2500000, 35, 'NDDC', ARRAY['Rivers', 'Bayelsa', 'Delta'], 1200)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 16. NDVI READINGS (Satellite Data)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ndvi_readings (
  id SERIAL PRIMARY KEY,
  region VARCHAR(100) NOT NULL,
  reading_date DATE NOT NULL,
  ndvi_value NUMERIC(4,3) NOT NULL,
  status VARCHAR(20) NOT NULL, -- healthy, moderate, watch, critical
  satellite VARCHAR(50) DEFAULT 'Sentinel-2',
  resolution_meters INTEGER DEFAULT 10,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO ndvi_readings (region, reading_date, ndvi_value, status) VALUES
('Kano - Zone A', '2026-05-01', 0.720, 'healthy'),
('Kano - Zone A', '2026-05-08', 0.680, 'moderate'),
('Kano - Zone A', '2026-05-15', 0.650, 'watch'),
('Kano - Zone A', '2026-05-22', 0.710, 'healthy'),
('Kaduna - Rice Belt', '2026-05-01', 0.750, 'healthy'),
('Kaduna - Rice Belt', '2026-05-08', 0.740, 'healthy'),
('Kaduna - Rice Belt', '2026-05-15', 0.620, 'watch'),
('Kaduna - Rice Belt', '2026-05-22', 0.580, 'critical'),
('Benue - Valley', '2026-05-01', 0.690, 'moderate'),
('Benue - Valley', '2026-05-08', 0.700, 'healthy'),
('Benue - Valley', '2026-05-15', 0.710, 'healthy'),
('Benue - Valley', '2026-05-22', 0.730, 'healthy')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 17. AGRICULTURAL TRIGGER EVENTS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agricultural_trigger_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  region VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  event_date DATE NOT NULL,
  affected_policies INTEGER DEFAULT 0,
  total_exposure NUMERIC(15,2) DEFAULT 0,
  payout_triggered BOOLEAN DEFAULT false,
  payout_amount NUMERIC(15,2),
  data_source VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO agricultural_trigger_events (event_type, region, severity, event_date, affected_policies, total_exposure, payout_triggered, payout_amount, data_source) VALUES
('drought', 'Kano', 'moderate', '2026-04-15', 450, 2250000000, true, 125000000, 'NIMET Satellite'),
('flood', 'Niger Delta', 'severe', '2026-03-20', 120, 960000000, true, 480000000, 'NIHSA River Gauge'),
('pest_infestation', 'Benue', 'mild', '2026-05-01', 85, 127500000, false, NULL, 'Extension Agent Report'),
('hail', 'Plateau', 'moderate', '2026-04-28', 35, 52500000, true, 26250000, 'Weather Station'),
('excess_rain', 'Lagos', 'severe', '2026-05-18', 200, 1000000000, true, 350000000, 'NIMET Radar')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 18. NIIRA COMPULSORY INSURANCE STATUS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS niira_registrations (
  id SERIAL PRIMARY KEY,
  registration_id VARCHAR(50) NOT NULL UNIQUE,
  company_name VARCHAR(200),
  compulsory_products INTEGER DEFAULT 0,
  registration_date DATE NOT NULL,
  renewal_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  compliance_score NUMERIC(5,2),
  classes TEXT[]
);

INSERT INTO niira_registrations (registration_id, company_name, compulsory_products, registration_date, renewal_date, status, compliance_score, classes) VALUES
('NIIRA-2026-001', 'InsurePortal Limited', 6, '2026-01-15', '2027-01-15', 'active', 98.5, ARRAY['Motor Third Party', 'Employers Liability', 'Builders Liability', 'Occupiers Liability', 'Healthcare Professional Indemnity', 'Marine Cargo'])
ON CONFLICT (registration_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS niira_insurance_classes (
  id SERIAL PRIMARY KEY,
  class_name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL,
  is_compulsory BOOLEAN DEFAULT false,
  naicom_code VARCHAR(20),
  minimum_premium NUMERIC(12,2),
  description TEXT,
  applicable_to TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO niira_insurance_classes (class_name, category, is_compulsory, naicom_code, minimum_premium, description, applicable_to) VALUES
('Motor Third Party Liability', 'Motor', true, 'NAICOM-MTP-01', 5000, 'Compulsory insurance for all motor vehicles on Nigerian roads', ARRAY['vehicle_owners', 'fleet_operators']),
('Employers Liability', 'Liability', true, 'NAICOM-EL-01', 50000, 'Covers employer obligations for workplace injuries', ARRAY['employers_10plus']),
('Builders Liability', 'Liability', true, 'NAICOM-BL-01', 100000, 'Required for all construction projects above ₦10M', ARRAY['construction_companies']),
('Occupiers Liability', 'Liability', true, 'NAICOM-OL-01', 25000, 'Required for commercial premises open to public', ARRAY['commercial_premises']),
('Healthcare Professional Indemnity', 'Professional', true, 'NAICOM-HPI-01', 75000, 'Required for all healthcare practitioners', ARRAY['doctors', 'nurses', 'hospitals']),
('Marine Cargo Insurance', 'Marine', true, 'NAICOM-MC-01', 15000, 'Required for all imported goods', ARRAY['importers', 'shipping_companies']),
('Group Life Assurance', 'Life', true, 'NAICOM-GL-01', 100000, 'Required for employers with 3+ employees under Pension Reform Act', ARRAY['employers_3plus']),
('Motor Comprehensive', 'Motor', false, 'NAICOM-MC-02', 25000, 'Full motor coverage including own damage and third party', ARRAY['vehicle_owners'])
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 19. PFA (Pension Fund Administrator) INTEGRATION
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pfa_integration (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  provider VARCHAR(100) NOT NULL,
  rsa_pin VARCHAR(20),
  total_contributions NUMERIC(15,2) DEFAULT 0,
  account_balance NUMERIC(15,2) DEFAULT 0,
  employer_contribution NUMERIC(15,2) DEFAULT 0,
  employee_contribution NUMERIC(15,2) DEFAULT 0,
  last_sync DATE,
  status VARCHAR(20) DEFAULT 'active'
);

INSERT INTO pfa_integration (user_id, provider, rsa_pin, total_contributions, account_balance, employer_contribution, employee_contribution, last_sync, status)
SELECT 1, 'ARM Pension Managers', 'PEN100234567890', 2500000, 3200000, 1500000, 1000000, CURRENT_DATE, 'active'
WHERE NOT EXISTS (SELECT 1 FROM pfa_integration WHERE user_id = 1);

-- ═══════════════════════════════════════════════════════════════════════
-- 20. INSURETECH INNOVATIONS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS insuretech_innovations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  status VARCHAR(20) DEFAULT 'active',
  adoption_pct NUMERIC(5,2) DEFAULT 0,
  launch_date DATE,
  technology_stack TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO insuretech_innovations (name, description, category, status, adoption_pct, launch_date, technology_stack) VALUES
('Usage-Based Insurance', 'Pay only for what you use with IoT telematics tracking', 'pricing', 'active', 35, '2025-06-01', ARRAY['IoT', 'Telematics', 'ML']),
('Parametric Insurance', 'Automatic payouts triggered by verifiable events (rainfall, earthquake)', 'product', 'active', 15, '2025-09-01', ARRAY['Satellite', 'Smart Contracts', 'IoT']),
('Peer-to-Peer Insurance', 'Group-based risk sharing with surplus returns', 'distribution', 'pilot', 5, '2026-01-15', ARRAY['Blockchain', 'Smart Contracts']),
('AI Underwriting', 'Instant decisions with ML risk scoring in < 3 seconds', 'underwriting', 'active', 60, '2025-03-01', ARRAY['PyTorch', 'FastAPI', 'Ray']),
('Embedded Insurance', 'Insurance bundled at point of sale in partner platforms', 'distribution', 'active', 25, '2025-08-01', ARRAY['API', 'SDK', 'Webhooks']),
('Micro-Insurance via USSD', 'Affordable coverage accessible via feature phones', 'distribution', 'active', 40, '2025-04-01', ARRAY['USSD', 'SMS', 'Mobile Money']),
('Blockchain Claims Transparency', 'Immutable audit trail for claims processing', 'claims', 'pilot', 8, '2026-02-01', ARRAY['Hyperledger', 'IPFS']),
('Voice-First Insurance', 'Policy management via voice commands in local languages', 'engagement', 'beta', 3, '2026-04-01', ARRAY['NLP', 'Speech-to-Text', 'TTS'])
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 21. TELCO CREDIT SCORING
-- ═══════════════════════════════════════════════════════════════════════
-- Already exists: telco_credit_scores — just seed if empty
INSERT INTO telco_credit_scores (customer_id, provider, score, factors, tier, last_updated)
SELECT 1, 'MTN Nigeria', 720, '["Data usage consistency", "Airtime purchase pattern", "Account tenure (5+ years)", "Recharge frequency", "VAS subscription stability"]'::jsonb, 'Good', NOW()
WHERE NOT EXISTS (SELECT 1 FROM telco_credit_scores WHERE customer_id = 1);

-- ═══════════════════════════════════════════════════════════════════════
-- 22. EMBEDDED DISTRIBUTION CHANNELS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS embedded_distribution (
  id SERIAL PRIMARY KEY,
  channel_name VARCHAR(100) NOT NULL,
  partner_name VARCHAR(100) NOT NULL,
  integration_type VARCHAR(30) NOT NULL,
  product_types TEXT[],
  monthly_policies INTEGER DEFAULT 0,
  monthly_premium NUMERIC(15,2) DEFAULT 0,
  commission_rate NUMERIC(4,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  api_version VARCHAR(10),
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO embedded_distribution (channel_name, partner_name, integration_type, product_types, monthly_policies, monthly_premium, commission_rate, status, api_version) VALUES
('E-commerce Checkout', 'Jumia Nigeria', 'API', ARRAY['gadget', 'shipping'], 2500, 12500000, 15.0, 'active', 'v2'),
('Ride-Hailing', 'Bolt Nigeria', 'SDK', ARRAY['motor_tpl', 'personal_accident'], 8000, 40000000, 12.0, 'active', 'v2'),
('Banking App', 'GTBank', 'API', ARRAY['health', 'life', 'savings'], 3200, 64000000, 8.0, 'active', 'v3'),
('Telecom Bundle', 'MTN Nigeria', 'USSD', ARRAY['micro_health', 'device_protection'], 15000, 37500000, 20.0, 'active', 'v1'),
('Travel Booking', 'Wakanow', 'API', ARRAY['travel', 'flight_delay'], 1800, 27000000, 18.0, 'active', 'v2'),
('Salary Advance', 'Piggyvest', 'SDK', ARRAY['credit_life', 'income_protection'], 950, 14250000, 10.0, 'pilot', 'v1')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 23. MCMC RISK SIMULATION RESULTS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS mcmc_simulations (
  id SERIAL PRIMARY KEY,
  simulation_id VARCHAR(50) NOT NULL UNIQUE,
  model_type VARCHAR(50) NOT NULL,
  iterations INTEGER NOT NULL,
  burn_in INTEGER NOT NULL,
  converged BOOLEAN DEFAULT false,
  r_hat NUMERIC(5,3),
  effective_sample_size INTEGER,
  posterior_means JSONB,
  credible_intervals JSONB,
  run_date TIMESTAMP DEFAULT NOW()
);

INSERT INTO mcmc_simulations (simulation_id, model_type, iterations, burn_in, converged, r_hat, effective_sample_size, posterior_means, credible_intervals) VALUES
('MCMC-2026-Q2-001', 'loss_ratio_prediction', 50000, 10000, true, 1.01, 4200, '{"lossRatio": 0.62, "severity": 250000, "frequency": 0.08, "tailParameter": 1.45}', '{"lossRatio": [0.55, 0.69], "severity": [180000, 320000], "frequency": [0.05, 0.11]}'),
('MCMC-2026-Q2-002', 'reserve_adequacy', 100000, 20000, true, 1.003, 8500, '{"ibnrReserve": 212500000, "caseReserve": 864000000, "developmentFactor": 1.35}', '{"ibnrReserve": [185000000, 240000000], "caseReserve": [780000000, 950000000]}'),
('MCMC-2026-Q2-003', 'catastrophe_model', 200000, 50000, true, 1.005, 12000, '{"annualLoss": 1500000000, "returnPeriod": 25, "peakExposure": 8500000000}', '{"annualLoss": [800000000, 2200000000], "returnPeriod": [15, 40]}')
ON CONFLICT (simulation_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 24. FINANCIAL DATA TABLES
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS financial_metrics (
  id SERIAL PRIMARY KEY,
  metric_name VARCHAR(100) NOT NULL,
  metric_type VARCHAR(30) NOT NULL, -- kpi, pnl, cashflow, collection, payout, reserve
  period VARCHAR(20) NOT NULL, -- 2026-Q2, 2026-05, etc.
  value NUMERIC(18,2) NOT NULL,
  previous_value NUMERIC(18,2),
  target_value NUMERIC(18,2),
  variance_pct NUMERIC(6,2),
  category VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO financial_metrics (metric_name, metric_type, period, value, previous_value, target_value, variance_pct, category) VALUES
-- KPIs
('Gross Written Premium', 'kpi', '2026-Q2', 665000000, 580000000, 700000000, 14.65, 'premium'),
('Net Earned Premium', 'kpi', '2026-Q2', 545000000, 470000000, 560000000, 15.96, 'premium'),
('Combined Ratio', 'kpi', '2026-Q2', 92.5, 98.2, 95.0, -5.80, 'ratio'),
('Loss Ratio', 'kpi', '2026-Q2', 62.2, 68.5, 65.0, -9.20, 'ratio'),
('Expense Ratio', 'kpi', '2026-Q2', 30.3, 29.7, 30.0, 2.02, 'ratio'),
('Solvency Margin', 'kpi', '2026-Q2', 185.0, 172.0, 150.0, 7.56, 'capital'),
-- P&L
('Insurance Revenue', 'pnl', '2026-Q2', 545000000, NULL, NULL, NULL, 'revenue'),
('Claims Incurred', 'pnl', '2026-Q2', -339000000, NULL, NULL, NULL, 'expense'),
('Operating Expenses', 'pnl', '2026-Q2', -165000000, NULL, NULL, NULL, 'expense'),
('Investment Income', 'pnl', '2026-Q2', 42000000, NULL, NULL, NULL, 'revenue'),
('Net Profit', 'pnl', '2026-Q2', 83000000, 52000000, 75000000, 59.62, 'bottom_line'),
-- Cash Flow
('Premium Collections', 'cashflow', '2026-05', 125000000, 118000000, 120000000, 5.93, 'inflow'),
('Claims Payouts', 'cashflow', '2026-05', -68000000, -72000000, -70000000, -5.56, 'outflow'),
('Operating Costs', 'cashflow', '2026-05', -35000000, -33000000, -34000000, 6.06, 'outflow'),
('Net Cash Position', 'cashflow', '2026-05', 22000000, 13000000, 16000000, 69.23, 'net'),
-- Reserves
('IBNR Reserve', 'reserve', '2026-Q2', 212500000, 195000000, NULL, 8.97, 'technical'),
('Outstanding Claims Reserve', 'reserve', '2026-Q2', 864000000, 820000000, NULL, 5.37, 'technical'),
('Unexpired Risk Reserve', 'reserve', '2026-Q2', 325000000, 310000000, NULL, 4.84, 'technical')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 25. DB SCALING METRICS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS db_scaling_metrics (
  id SERIAL PRIMARY KEY,
  metric_name VARCHAR(100) NOT NULL,
  current_value NUMERIC(15,2),
  threshold_value NUMERIC(15,2),
  recommendation TEXT,
  priority VARCHAR(10),
  category VARCHAR(30),
  measured_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO db_scaling_metrics (metric_name, current_value, threshold_value, recommendation, priority, category) VALUES
('Active Connections', 45, 100, 'Consider connection pooling with PgBouncer', 'medium', 'connections'),
('Query Latency p99 (ms)', 125, 200, 'Add indexes on frequently queried columns', 'low', 'performance'),
('Table Bloat %', 12.5, 20.0, 'Schedule regular VACUUM ANALYZE', 'low', 'maintenance'),
('WAL Generation (GB/h)', 2.3, 5.0, 'Current rate is healthy', 'info', 'replication'),
('Cache Hit Ratio %', 98.7, 95.0, 'Excellent cache utilization', 'info', 'performance'),
('Disk Usage %', 42.0, 80.0, 'Sufficient disk space available', 'info', 'storage'),
('Replication Lag (s)', 2.3, 10.0, 'Streaming replication is healthy', 'info', 'replication'),
('Long Running Queries', 2, 5, 'Monitor queries > 30s', 'low', 'performance')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 26. KNOWLEDGE GRAPH ENTITIES (for KnowledgeGraphExplorer)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS knowledge_entities (
  id SERIAL PRIMARY KEY,
  entity_name VARCHAR(150) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  properties JSONB,
  related_to INTEGER[],
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO knowledge_entities (entity_name, entity_type, properties) VALUES
('Motor Insurance', 'product_category', '{"policies": 8500, "avgPremium": 45000, "lossRatio": 0.42}'),
('Health Insurance', 'product_category', '{"policies": 6200, "avgPremium": 85000, "lossRatio": 0.55}'),
('Life Insurance', 'product_category', '{"policies": 4800, "avgPremium": 120000, "lossRatio": 0.35}'),
('Property Insurance', 'product_category', '{"policies": 2100, "avgPremium": 65000, "lossRatio": 0.38}'),
('NAICOM', 'regulator', '{"filings": 10, "complianceScore": 98.2}'),
('Underwriting Engine', 'system', '{"decisionsPerDay": 450, "avgLatency": "2.3s"}'),
('Fraud Detection', 'system', '{"accuracy": 0.9599, "alertsPerDay": 12}'),
('Claims Adjudication', 'system', '{"autoApprovalRate": 0.68, "avgProcessingHours": 4.2}')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 27. INSURANCE RADAR (Market Intelligence)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS insurance_radar_alerts (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  alert_type VARCHAR(30) NOT NULL, -- market, regulatory, competitor, product
  severity VARCHAR(20) DEFAULT 'info',
  source VARCHAR(100),
  published_date DATE,
  action_required BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO insurance_radar_alerts (title, description, alert_type, severity, source, published_date, action_required) VALUES
('Motor premium rates increasing 8% YoY', 'Industry-wide motor insurance rates up due to inflation and parts cost increases', 'market', 'warning', 'NAICOM Market Report', '2026-05-20', true),
('NAICOM circular on digital policy issuance', 'New requirements for electronic policy documents effective Q3 2026', 'regulatory', 'info', 'NAICOM Circular 2026/05', '2026-05-15', true),
('New microinsurance regulations', 'NAICOM introduces simplified licensing for microinsurance providers', 'regulatory', 'info', 'Insurance Act Amendment', '2026-05-10', false),
('Competitor launches embedded insurance API', 'AXA Mansard partners with Flutterwave for embedded insurance at checkout', 'competitor', 'warning', 'Industry News', '2026-05-18', true),
('Flood risk model update required', 'NIMET releases new flood probability maps for 2026 rainy season', 'market', 'critical', 'NIMET Advisory', '2026-05-22', true),
('Pension-linked insurance demand rising', 'Growing demand for annuity-linked products as RSA holders retire', 'market', 'info', 'PenCom Report', '2026-05-12', false)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 28. TECH INNOVATIONS GAMIFICATION
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gamification_levels (
  id SERIAL PRIMARY KEY,
  level_name VARCHAR(50) NOT NULL,
  level_number INTEGER NOT NULL UNIQUE,
  points_required INTEGER NOT NULL,
  badge_icon VARCHAR(50),
  perks TEXT[],
  description TEXT
);

INSERT INTO gamification_levels (level_name, level_number, points_required, badge_icon, perks, description) VALUES
('Insurance Newbie', 1, 0, 'seedling', ARRAY['Basic dashboard access'], 'Just getting started with insurance'),
('Policy Holder', 2, 1000, 'shield', ARRAY['5% renewal discount', 'Claims tracking'], 'Active policy holder'),
('Smart Buyer', 3, 3000, 'lightbulb', ARRAY['10% discount', 'Priority support'], 'Multiple policies, smart decisions'),
('Insurance Pro', 4, 8000, 'star', ARRAY['15% discount', 'Dedicated agent', 'Free add-ons'], 'Experienced insurance customer'),
('Insurance Master', 5, 20000, 'crown', ARRAY['20% discount', 'VIP lounge', 'Annual retreat', 'Family bonus'], 'Elite customer with comprehensive coverage')
ON CONFLICT (level_number) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 29. PERFORMANCE MONITORING METRICS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS performance_metrics (
  id SERIAL PRIMARY KEY,
  service_name VARCHAR(100) NOT NULL,
  metric_type VARCHAR(30) NOT NULL,
  value NUMERIC(10,3) NOT NULL,
  unit VARCHAR(20),
  threshold_warning NUMERIC(10,3),
  threshold_critical NUMERIC(10,3),
  measured_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO performance_metrics (service_name, metric_type, value, unit, threshold_warning, threshold_critical) VALUES
('api-gateway', 'response_time_p95', 45.2, 'ms', 100, 500),
('api-gateway', 'error_rate', 0.12, '%', 1.0, 5.0),
('api-gateway', 'requests_per_minute', 2850, 'rpm', NULL, NULL),
('database', 'query_latency_p95', 18.5, 'ms', 50, 200),
('database', 'connections_active', 45, 'count', 80, 95),
('cache', 'hit_ratio', 98.7, '%', 90, 80),
('cache', 'memory_usage', 256, 'MB', 400, 480),
('ml-inference', 'prediction_latency', 125, 'ms', 500, 2000),
('ml-inference', 'throughput', 45, 'req/s', NULL, NULL),
('payment-gateway', 'success_rate', 99.2, '%', 98, 95),
('payment-gateway', 'avg_settlement_time', 3.5, 'seconds', 10, 30)
ON CONFLICT DO NOTHING;

-- Done!
SELECT 'Migration complete: all tables created and seeded' as status;
