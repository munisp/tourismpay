-- GDS Integration Tables — Tax, Tipping, Loyalty tracking for GDS bookings
-- Links to: tax_rules (0071), multi_tip_groups (0072), loyalty_accounts (existing)

-- GDS booking tax records (tracks taxes applied to each reservation)
CREATE TABLE IF NOT EXISTS "gds_booking_taxes" (
  "id" serial PRIMARY KEY,
  "reservation_id" varchar(64) NOT NULL,
  "property_id" varchar(64) NOT NULL,
  "country_code" varchar(2) NOT NULL,
  "booking_amount" numeric(12, 2) NOT NULL,
  "total_tax" numeric(12, 2) NOT NULL,
  "grand_total" numeric(12, 2) NOT NULL,
  "effective_rate" numeric(5, 2) NOT NULL,
  "currency" varchar(3) NOT NULL,
  "tax_components" jsonb NOT NULL DEFAULT '[]',
  "remittance_status" varchar(20) NOT NULL DEFAULT 'pending',
  "remittance_batch_id" varchar(64),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- GDS staff tips (tracks tips at GDS-booked properties)
CREATE TABLE IF NOT EXISTS "gds_staff_tips" (
  "id" serial PRIMARY KEY,
  "tip_group_id" varchar(64) NOT NULL UNIQUE,
  "reservation_id" varchar(64) NOT NULL,
  "property_id" varchar(64) NOT NULL,
  "property_type" varchar(32) NOT NULL,
  "guest_id" varchar(64) NOT NULL,
  "total_amount" numeric(12, 2) NOT NULL,
  "currency" varchar(3) NOT NULL,
  "split_mode" varchar(20) NOT NULL DEFAULT 'equal',
  "recipient_count" integer NOT NULL DEFAULT 1,
  "recipients" jsonb NOT NULL DEFAULT '[]',
  "status" varchar(20) NOT NULL DEFAULT 'processed',
  "message" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- GDS loyalty earnings (tracks points earned from GDS bookings)
CREATE TABLE IF NOT EXISTS "gds_loyalty_earnings" (
  "id" serial PRIMARY KEY,
  "booking_id" varchar(64) NOT NULL,
  "guest_id" varchar(64) NOT NULL,
  "base_points" integer NOT NULL DEFAULT 0,
  "bonus_points" integer NOT NULL DEFAULT 0,
  "total_points" integer NOT NULL DEFAULT 0,
  "multiplier" numeric(4, 2) NOT NULL DEFAULT 1.00,
  "property_type" varchar(32),
  "agent_tier" varchar(20),
  "booking_type" varchar(20) DEFAULT 'gds',
  "reason" text,
  "expires_at" date,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- GDS itinerary conversions (tracks trip planner → GDS booking conversions)
CREATE TABLE IF NOT EXISTS "gds_itinerary_conversions" (
  "id" serial PRIMARY KEY,
  "itinerary_id" varchar(64) NOT NULL,
  "guest_id" varchar(64) NOT NULL,
  "total_bookings" integer NOT NULL DEFAULT 0,
  "total_spend" numeric(12, 2) NOT NULL DEFAULT 0,
  "total_points_earned" integer NOT NULL DEFAULT 0,
  "status" varchar(20) NOT NULL DEFAULT 'confirmed',
  "booking_ids" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- GDS demand forecasts (stored forecasts for analytics)
CREATE TABLE IF NOT EXISTS "gds_demand_forecasts" (
  "id" serial PRIMARY KEY,
  "country_code" varchar(2) NOT NULL,
  "property_type" varchar(32) NOT NULL,
  "forecast_date" date NOT NULL,
  "predicted_occupancy" numeric(5, 3) NOT NULL,
  "actual_occupancy" numeric(5, 3),
  "confidence" numeric(4, 3) NOT NULL,
  "season" varchar(10) NOT NULL,
  "rate_multiplier" numeric(4, 2) NOT NULL DEFAULT 1.00,
  "model_version" varchar(32),
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Indices for GDS booking taxes
CREATE INDEX IF NOT EXISTS "idx_gds_booking_taxes_reservation" ON "gds_booking_taxes" ("reservation_id");
CREATE INDEX IF NOT EXISTS "idx_gds_booking_taxes_country" ON "gds_booking_taxes" ("country_code");
CREATE INDEX IF NOT EXISTS "idx_gds_booking_taxes_status" ON "gds_booking_taxes" ("remittance_status");
CREATE INDEX IF NOT EXISTS "idx_gds_booking_taxes_created" ON "gds_booking_taxes" ("created_at");

-- Indices for GDS staff tips
CREATE INDEX IF NOT EXISTS "idx_gds_staff_tips_reservation" ON "gds_staff_tips" ("reservation_id");
CREATE INDEX IF NOT EXISTS "idx_gds_staff_tips_property" ON "gds_staff_tips" ("property_id");
CREATE INDEX IF NOT EXISTS "idx_gds_staff_tips_guest" ON "gds_staff_tips" ("guest_id");
CREATE INDEX IF NOT EXISTS "idx_gds_staff_tips_created" ON "gds_staff_tips" ("created_at");

-- Indices for GDS loyalty earnings
CREATE INDEX IF NOT EXISTS "idx_gds_loyalty_earnings_booking" ON "gds_loyalty_earnings" ("booking_id");
CREATE INDEX IF NOT EXISTS "idx_gds_loyalty_earnings_guest" ON "gds_loyalty_earnings" ("guest_id");
CREATE INDEX IF NOT EXISTS "idx_gds_loyalty_earnings_expires" ON "gds_loyalty_earnings" ("expires_at");

-- Indices for GDS itinerary conversions
CREATE INDEX IF NOT EXISTS "idx_gds_itinerary_conversions_itinerary" ON "gds_itinerary_conversions" ("itinerary_id");
CREATE INDEX IF NOT EXISTS "idx_gds_itinerary_conversions_guest" ON "gds_itinerary_conversions" ("guest_id");

-- Indices for GDS demand forecasts
CREATE INDEX IF NOT EXISTS "idx_gds_demand_forecasts_country_date" ON "gds_demand_forecasts" ("country_code", "forecast_date");
CREATE INDEX IF NOT EXISTS "idx_gds_demand_forecasts_type" ON "gds_demand_forecasts" ("property_type");
