CREATE TYPE "public"."bis_risk_level" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."bis_status" AS ENUM('pending', 'processing', 'completed', 'flagged', 'failed');--> statement-breakpoint
CREATE TYPE "public"."bis_tier" AS ENUM('basic', 'standard', 'comprehensive');--> statement-breakpoint
CREATE TYPE "public"."establishment_type" AS ENUM('hotel', 'restaurant', 'concert_venue', 'safari_lodge', 'tour_operator', 'airline', 'car_rental', 'spa_wellness', 'museum', 'theme_park', 'beach_resort', 'conference_center', 'nightclub', 'sports_venue', 'travel_agency');--> statement-breakpoint
CREATE TYPE "public"."fraud_alert_severity" AS ENUM('info', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."fraud_alert_status" AS ENUM('open', 'investigating', 'resolved', 'false_positive');--> statement-breakpoint
CREATE TYPE "public"."kyb_status" AS ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."soc_alert_type" AS ENUM('intrusion', 'anomaly', 'policy_violation', 'threat_intel', 'compliance', 'data_exfiltration');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "bis_investigations" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference_id" varchar(20) NOT NULL,
	"establishment_id" integer,
	"requested_by" integer,
	"subject_full_name" varchar(255) NOT NULL,
	"subject_dob" varchar(20),
	"subject_nationality" varchar(100),
	"subject_nin" varchar(50),
	"subject_phone" varchar(30),
	"subject_email" varchar(320),
	"subject_role" varchar(100),
	"subject_country" varchar(2),
	"tier" "bis_tier" DEFAULT 'standard' NOT NULL,
	"status" "bis_status" DEFAULT 'pending' NOT NULL,
	"risk_level" "bis_risk_level",
	"risk_score" integer,
	"module_results" jsonb,
	"recommendations" jsonb DEFAULT '[]'::jsonb,
	"report_url" text,
	"consent_obtained" boolean DEFAULT false NOT NULL,
	"price_paid" numeric(10, 2),
	"currency" varchar(3) DEFAULT 'USD',
	"external_bis_ref" varchar(100),
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bis_investigations_reference_id_unique" UNIQUE("reference_id")
);
--> statement-breakpoint
CREATE TABLE "establishments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "establishment_type" NOT NULL,
	"country" varchar(2) NOT NULL,
	"city" varchar(100),
	"address" text,
	"registration_number" varchar(100),
	"tax_id" varchar(100),
	"contact_email" varchar(320),
	"contact_phone" varchar(30),
	"website" varchar(500),
	"kyb_status" "kyb_status" DEFAULT 'draft' NOT NULL,
	"kyb_score" integer,
	"kyb_notes" text,
	"owner_id" integer,
	"employee_count" integer,
	"annual_revenue" numeric(15, 2),
	"currency" varchar(3) DEFAULT 'USD',
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fraud_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"alert_id" varchar(30) NOT NULL,
	"transaction_id" varchar(100),
	"establishment_id" integer,
	"country" varchar(2),
	"severity" "fraud_alert_severity" NOT NULL,
	"status" "fraud_alert_status" DEFAULT 'open' NOT NULL,
	"rule_triggered" varchar(100),
	"description" text,
	"amount" numeric(15, 2),
	"currency" varchar(3),
	"gnn_score" numeric(5, 2),
	"metadata" jsonb,
	"resolved_by" integer,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fraud_alerts_alert_id_unique" UNIQUE("alert_id")
);
--> statement-breakpoint
CREATE TABLE "kyb_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"establishment_id" integer NOT NULL,
	"submitted_by" integer,
	"status" "kyb_status" DEFAULT 'draft' NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"total_steps" integer DEFAULT 5 NOT NULL,
	"documents_uploaded" jsonb DEFAULT '[]'::jsonb,
	"review_notes" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"compliance_score" integer,
	"risk_flags" jsonb DEFAULT '[]'::jsonb,
	"external_kyb_ref" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "soc_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"alert_id" varchar(30) NOT NULL,
	"type" "soc_alert_type" NOT NULL,
	"severity" "fraud_alert_severity" NOT NULL,
	"status" "fraud_alert_status" DEFAULT 'open' NOT NULL,
	"source" varchar(100),
	"title" varchar(255) NOT NULL,
	"description" text,
	"affected_system" varchar(100),
	"source_ip" varchar(45),
	"mitre_tactic" varchar(100),
	"mitre_id" varchar(20),
	"raw_payload" jsonb,
	"resolved_by" integer,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "soc_alerts_alert_id_unique" UNIQUE("alert_id")
);
--> statement-breakpoint
CREATE TABLE "tourism_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"country" varchar(2) NOT NULL,
	"city" varchar(100),
	"category" varchar(50),
	"expected_attendees" integer,
	"start_date" timestamp,
	"end_date" timestamp,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"open_id" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"login_method" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_signed_in" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_open_id_unique" UNIQUE("open_id")
);
--> statement-breakpoint
ALTER TABLE "bis_investigations" ADD CONSTRAINT "bis_investigations_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bis_investigations" ADD CONSTRAINT "bis_investigations_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "establishments" ADD CONSTRAINT "establishments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyb_applications" ADD CONSTRAINT "kyb_applications_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyb_applications" ADD CONSTRAINT "kyb_applications_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyb_applications" ADD CONSTRAINT "kyb_applications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soc_alerts" ADD CONSTRAINT "soc_alerts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bis_status_idx" ON "bis_investigations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bis_risk_idx" ON "bis_investigations" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX "bis_est_idx" ON "bis_investigations" USING btree ("establishment_id");--> statement-breakpoint
CREATE INDEX "bis_ref_idx" ON "bis_investigations" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "est_country_idx" ON "establishments" USING btree ("country");--> statement-breakpoint
CREATE INDEX "est_kyb_status_idx" ON "establishments" USING btree ("kyb_status");--> statement-breakpoint
CREATE INDEX "fraud_severity_idx" ON "fraud_alerts" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "fraud_status_idx" ON "fraud_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fraud_created_idx" ON "fraud_alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "kyb_est_idx" ON "kyb_applications" USING btree ("establishment_id");--> statement-breakpoint
CREATE INDEX "kyb_status_idx" ON "kyb_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "soc_severity_idx" ON "soc_alerts" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "soc_status_idx" ON "soc_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "soc_type_idx" ON "soc_alerts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "soc_created_idx" ON "soc_alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "event_country_idx" ON "tourism_events" USING btree ("country");--> statement-breakpoint
CREATE INDEX "event_category_idx" ON "tourism_events" USING btree ("category");