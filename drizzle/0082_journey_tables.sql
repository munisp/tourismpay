-- Journey Tables Migration
-- Covers all 20 new tourist journey scenarios

CREATE TABLE IF NOT EXISTS itineraries (
  id TEXT PRIMARY KEY,
  tourist_profile_id TEXT,
  user_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  destination TEXT DEFAULT 'Lagos, Nigeria',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  total_days INTEGER NOT NULL,
  total_budget_ngn REAL,
  spent_ngn REAL DEFAULT 0,
  currency TEXT DEFAULT 'NGN',
  status TEXT DEFAULT 'draft',
  ai_generated BOOLEAN DEFAULT FALSE,
  ai_prompt TEXT,
  journey_type TEXT,
  tags JSONB DEFAULT '[]',
  is_shared BOOLEAN DEFAULT FALSE,
  share_code TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS itinerary_days (
  id TEXT PRIMARY KEY,
  itinerary_id TEXT NOT NULL,
  day_number INTEGER NOT NULL,
  date TEXT NOT NULL,
  title TEXT,
  theme TEXT,
  notes TEXT,
  total_cost_ngn REAL DEFAULT 0,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS itinerary_items (
  id TEXT PRIMARY KEY,
  itinerary_id TEXT NOT NULL,
  day_id TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  item_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  merchant_id TEXT,
  merchant_name TEXT,
  location TEXT,
  latitude REAL,
  longitude REAL,
  start_time TEXT,
  end_time TEXT,
  duration_minutes INTEGER,
  estimated_cost_ngn REAL DEFAULT 0,
  actual_cost_ngn REAL,
  status TEXT DEFAULT 'planned',
  booking_reference_id TEXT,
  booking_type TEXT,
  payment_transaction_id TEXT,
  notes TEXT,
  ai_suggested BOOLEAN DEFAULT FALSE,
  ai_reason TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS itinerary_collaborators (
  id TEXT PRIMARY KEY,
  itinerary_id TEXT NOT NULL,
  user_id INTEGER,
  email TEXT,
  role TEXT DEFAULT 'viewer',
  invited_at INTEGER,
  accepted_at INTEGER
);

CREATE TABLE IF NOT EXISTS airport_transfers (
  id TEXT PRIMARY KEY,
  tourist_profile_id TEXT,
  transport_booking_id TEXT,
  flight_number TEXT,
  arrival_airport TEXT DEFAULT 'MMIA',
  arrival_date_time INTEGER,
  pickup_sign_name TEXT,
  meeting_point TEXT,
  status TEXT DEFAULT 'scheduled',
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS sim_card_orders (
  id TEXT PRIMARY KEY,
  tourist_profile_id TEXT,
  provider TEXT NOT NULL,
  plan_type TEXT NOT NULL,
  data_gb REAL,
  validity_days INTEGER,
  price_ngn REAL NOT NULL,
  phone_number TEXT,
  delivery_method TEXT DEFAULT 'airport_pickup',
  status TEXT DEFAULT 'pending',
  payment_transaction_id TEXT,
  activated_at INTEGER,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS expense_reports (
  id TEXT PRIMARY KEY,
  tourist_profile_id TEXT,
  user_id INTEGER,
  title TEXT NOT NULL,
  trip_name TEXT,
  start_date TEXT,
  end_date TEXT,
  currency TEXT DEFAULT 'NGN',
  total_amount_ngn REAL DEFAULT 0,
  approved_amount_ngn REAL,
  status TEXT DEFAULT 'draft',
  submitted_at INTEGER,
  approved_at INTEGER,
  approved_by TEXT,
  notes TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS expense_items (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  merchant_name TEXT,
  amount_ngn REAL NOT NULL,
  original_currency TEXT DEFAULT 'NGN',
  original_amount REAL,
  fx_rate REAL DEFAULT 1,
  receipt_url TEXT,
  payment_transaction_id TEXT,
  date TEXT NOT NULL,
  is_reimbursable BOOLEAN DEFAULT TRUE,
  vat_amount_ngn REAL DEFAULT 0,
  notes TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id TEXT PRIMARY KEY,
  tourist_profile_id TEXT NOT NULL,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  country TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS sos_alerts (
  id TEXT PRIMARY KEY,
  tourist_profile_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  address TEXT,
  description TEXT,
  status TEXT DEFAULT 'active',
  responded_by TEXT,
  resolved_at INTEGER,
  notified_contacts JSONB DEFAULT '[]',
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS safety_checkins (
  id TEXT PRIMARY KEY,
  tourist_profile_id TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  address TEXT,
  status TEXT DEFAULT 'safe',
  message TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS tourist_attractions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  address TEXT NOT NULL,
  lga TEXT,
  state TEXT DEFAULT 'Lagos',
  latitude REAL,
  longitude REAL,
  opening_hours JSONB DEFAULT '{}',
  entry_fee_ngn REAL DEFAULT 0,
  entry_fee_foreign REAL,
  rating REAL DEFAULT 4.0,
  review_count INTEGER DEFAULT 0,
  images JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT TRUE,
  merchant_id TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS attraction_visits (
  id TEXT PRIMARY KEY,
  attraction_id TEXT NOT NULL,
  tourist_profile_id TEXT,
  visit_date TEXT NOT NULL,
  adults INTEGER DEFAULT 1,
  children INTEGER DEFAULT 0,
  total_amount_ngn REAL DEFAULT 0,
  payment_transaction_id TEXT,
  rating REAL,
  review TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS group_bookings (
  id TEXT PRIMARY KEY,
  organizer_tourist_profile_id TEXT NOT NULL,
  booking_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  group_name TEXT,
  total_participants INTEGER NOT NULL,
  total_amount_ngn REAL NOT NULL,
  split_method TEXT DEFAULT 'equal',
  status TEXT DEFAULT 'pending',
  share_code TEXT NOT NULL,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS group_booking_participants (
  id TEXT PRIMARY KEY,
  group_booking_id TEXT NOT NULL,
  tourist_profile_id TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  share_amount_ngn REAL NOT NULL,
  paid_amount_ngn REAL DEFAULT 0,
  payment_status TEXT DEFAULT 'pending',
  payment_transaction_id TEXT,
  joined_at INTEGER,
  paid_at INTEGER
);

CREATE TABLE IF NOT EXISTS visa_applications (
  id TEXT PRIMARY KEY,
  tourist_profile_id TEXT NOT NULL,
  visa_type TEXT NOT NULL,
  current_visa_expiry TEXT,
  requested_extension_days INTEGER,
  application_date TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  documents JSONB DEFAULT '[]',
  processing_fee_ngn REAL,
  payment_transaction_id TEXT,
  approved_until TEXT,
  notes TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS room_service_orders (
  id TEXT PRIMARY KEY,
  hotel_booking_id TEXT NOT NULL,
  room_id TEXT,
  tourist_profile_id TEXT,
  order_type TEXT DEFAULT 'food',
  items JSONB NOT NULL DEFAULT '[]',
  subtotal_ngn REAL NOT NULL,
  service_charge_ngn REAL DEFAULT 0,
  vat_amount_ngn REAL DEFAULT 0,
  total_amount_ngn REAL NOT NULL,
  delivery_time TEXT,
  status TEXT DEFAULT 'pending',
  payment_status TEXT DEFAULT 'pending',
  payment_transaction_id TEXT,
  notes TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS concierge_requests (
  id TEXT PRIMARY KEY,
  hotel_booking_id TEXT,
  tourist_profile_id TEXT NOT NULL,
  request_type TEXT NOT NULL,
  description TEXT NOT NULL,
  preferred_date TEXT,
  preferred_time TEXT,
  budget_ngn REAL,
  status TEXT DEFAULT 'pending',
  assigned_to TEXT,
  resolution TEXT,
  itinerary_item_id TEXT,
  created_at INTEGER,
  resolved_at INTEGER
);

CREATE TABLE IF NOT EXISTS spa_bookings (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  tourist_profile_id TEXT,
  hotel_booking_id TEXT,
  treatment_type TEXT NOT NULL,
  treatment_name TEXT NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  price_ngn REAL NOT NULL,
  vat_amount_ngn REAL DEFAULT 0,
  total_amount_ngn REAL NOT NULL,
  appointment_date TEXT NOT NULL,
  appointment_time TEXT NOT NULL,
  therapist_name TEXT,
  status TEXT DEFAULT 'booked',
  payment_status TEXT DEFAULT 'pending',
  payment_transaction_id TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS sports_events (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  home_team TEXT,
  away_team TEXT,
  venue TEXT NOT NULL,
  event_date INTEGER NOT NULL,
  status TEXT DEFAULT 'upcoming',
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS merchandise_orders (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  tourist_profile_id TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  subtotal_ngn REAL NOT NULL,
  vat_amount_ngn REAL DEFAULT 0,
  total_amount_ngn REAL NOT NULL,
  delivery_method TEXT DEFAULT 'pickup',
  delivery_address TEXT,
  status TEXT DEFAULT 'pending',
  payment_status TEXT DEFAULT 'pending',
  payment_transaction_id TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS private_chef_bookings (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  tourist_profile_id TEXT,
  chef_name TEXT,
  event_type TEXT DEFAULT 'dinner',
  guest_count INTEGER NOT NULL,
  cuisine_type TEXT DEFAULT 'nigerian',
  menu_items JSONB DEFAULT '[]',
  location TEXT NOT NULL,
  event_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  duration_hours REAL DEFAULT 3,
  chef_fee_ngn REAL NOT NULL,
  ingredient_cost_ngn REAL DEFAULT 0,
  service_charge_ngn REAL DEFAULT 0,
  vat_amount_ngn REAL DEFAULT 0,
  total_amount_ngn REAL NOT NULL,
  deposit_amount_ngn REAL DEFAULT 0,
  deposit_paid BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'pending',
  payment_status TEXT DEFAULT 'pending',
  payment_transaction_id TEXT,
  special_requests TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS consolidated_statements (
  id TEXT PRIMARY KEY,
  tourist_profile_id TEXT NOT NULL,
  user_id INTEGER,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  currencies JSONB DEFAULT '[]',
  total_spend_ngn REAL DEFAULT 0,
  total_topups_ngn REAL DEFAULT 0,
  total_fx_fees_ngn REAL DEFAULT 0,
  total_vat_ngn REAL DEFAULT 0,
  total_tips_ngn REAL DEFAULT 0,
  total_loyalty_points INTEGER DEFAULT 0,
  breakdown_by_category JSONB DEFAULT '{}',
  breakdown_by_currency JSONB DEFAULT '{}',
  generated_at INTEGER
);

CREATE TABLE IF NOT EXISTS ai_concierge_sessions (
  id TEXT PRIMARY KEY,
  tourist_profile_id TEXT,
  user_id INTEGER,
  session_type TEXT DEFAULT 'general',
  context JSONB DEFAULT '{}',
  total_messages INTEGER DEFAULT 0,
  actions_executed JSONB DEFAULT '[]',
  itinerary_created TEXT,
  bookings_made JSONB DEFAULT '[]',
  total_spend_ngn REAL DEFAULT 0,
  satisfaction_score INTEGER,
  status TEXT DEFAULT 'active',
  created_at INTEGER,
  ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS high_value_transaction_reviews (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  tourist_profile_id TEXT,
  amount_ngn REAL NOT NULL,
  threshold REAL NOT NULL,
  review_type TEXT NOT NULL,
  risk_score REAL,
  status TEXT DEFAULT 'pending',
  reviewed_by TEXT,
  review_notes TEXT,
  biometric_verified BOOLEAN DEFAULT FALSE,
  created_at INTEGER,
  resolved_at INTEGER
);

CREATE TABLE IF NOT EXISTS refund_requests (
  id TEXT PRIMARY KEY,
  tourist_profile_id TEXT NOT NULL,
  original_transaction_id TEXT NOT NULL,
  booking_type TEXT,
  booking_reference_id TEXT,
  merchant_id TEXT,
  requested_amount_ngn REAL NOT NULL,
  approved_amount_ngn REAL,
  reason TEXT NOT NULL,
  description TEXT,
  evidence_urls JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending',
  reviewed_by TEXT,
  review_notes TEXT,
  refund_transaction_id TEXT,
  processed_at INTEGER,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS qr_payment_sessions (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  table_id TEXT,
  qr_code TEXT NOT NULL,
  amount_ngn REAL,
  is_dynamic BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'active',
  expires_at INTEGER,
  payment_transaction_id TEXT,
  tourist_profile_id TEXT,
  created_at INTEGER,
  paid_at INTEGER
);

CREATE TABLE IF NOT EXISTS offline_payment_queue (
  id TEXT PRIMARY KEY,
  tourist_profile_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  amount_ngn REAL NOT NULL,
  description TEXT,
  queued_at INTEGER NOT NULL,
  synced_at INTEGER,
  status TEXT DEFAULT 'queued',
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  payment_transaction_id TEXT
);

-- Indexes for journey tables
CREATE INDEX IF NOT EXISTS idx_itineraries_user_id ON itineraries(user_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_tourist_profile_id ON itineraries(tourist_profile_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_days_itinerary_id ON itinerary_days(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_items_day_id ON itinerary_items(day_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_items_itinerary_id ON itinerary_items(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_group_bookings_organizer ON group_bookings(organizer_tourist_profile_id);
CREATE INDEX IF NOT EXISTS idx_group_booking_participants_group_id ON group_booking_participants(group_booking_id);
CREATE INDEX IF NOT EXISTS idx_sos_alerts_tourist_profile_id ON sos_alerts(tourist_profile_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_tourist_profile_id ON refund_requests(tourist_profile_id);
CREATE INDEX IF NOT EXISTS idx_high_value_reviews_transaction_id ON high_value_transaction_reviews(transaction_id);
CREATE INDEX IF NOT EXISTS idx_concierge_requests_tourist_profile_id ON concierge_requests(tourist_profile_id);
CREATE INDEX IF NOT EXISTS idx_ai_concierge_sessions_user_id ON ai_concierge_sessions(user_id);
