CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'cancelled', 'completed', 'no_show');--> statement-breakpoint
CREATE TABLE "tourist_bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"establishment_id" integer NOT NULL,
	"service_type" varchar(64) DEFAULT 'general' NOT NULL,
	"service_name" text NOT NULL,
	"booking_date" timestamp NOT NULL,
	"party_size" integer DEFAULT 1 NOT NULL,
	"price_usd" numeric(18, 6) DEFAULT '0' NOT NULL,
	"currency" varchar(10) DEFAULT 'USDC' NOT NULL,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"confirmation_code" varchar(32),
	"wallet_tx_id" varchar(128),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tourist_budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"daily_limit_usd" numeric(18, 6) DEFAULT '100' NOT NULL,
	"weekly_limit_usd" numeric(18, 6) DEFAULT '500' NOT NULL,
	"trip_limit_usd" numeric(18, 6),
	"alert_at_80_percent" boolean DEFAULT true NOT NULL,
	"alert_at_100_percent" boolean DEFAULT true NOT NULL,
	"categories" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tourist_budgets_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "tourist_concierge_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tourist_deals" (
	"id" serial PRIMARY KEY NOT NULL,
	"establishment_id" integer NOT NULL,
	"title" varchar(128) NOT NULL,
	"description" text,
	"discount_percent" integer DEFAULT 0 NOT NULL,
	"discount_amount_usd" numeric(18, 6),
	"promo_code" varchar(32),
	"category" varchar(64) DEFAULT 'general' NOT NULL,
	"image_url" text,
	"valid_from" timestamp NOT NULL,
	"valid_to" timestamp NOT NULL,
	"max_redemptions" integer,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tourist_itineraries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" varchar(128) NOT NULL,
	"destination" varchar(128),
	"start_date" timestamp,
	"end_date" timestamp,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"budget_usd" numeric(18, 6),
	"is_public" boolean DEFAULT false NOT NULL,
	"cover_image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tourist_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"establishment_id" integer NOT NULL,
	"booking_id" integer,
	"rating" integer NOT NULL,
	"title" varchar(128),
	"body" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"helpful_votes" integer DEFAULT 0 NOT NULL,
	"is_verified_purchase" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tourist_topups" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount_usd" numeric(18, 6) NOT NULL,
	"target_currency" varchar(10) DEFAULT 'USDC' NOT NULL,
	"fx_rate" numeric(18, 8) DEFAULT '1' NOT NULL,
	"credited_amount" numeric(18, 6),
	"stripe_payment_intent_id" varchar(128),
	"stripe_session_id" varchar(128),
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme" varchar(16) DEFAULT 'dark';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_language" varchar(8) DEFAULT 'en';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_currency" varchar(8) DEFAULT 'USDC';--> statement-breakpoint
ALTER TABLE "tourist_bookings" ADD CONSTRAINT "tourist_bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_bookings" ADD CONSTRAINT "tourist_bookings_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_budgets" ADD CONSTRAINT "tourist_budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_concierge_sessions" ADD CONSTRAINT "tourist_concierge_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_deals" ADD CONSTRAINT "tourist_deals_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_itineraries" ADD CONSTRAINT "tourist_itineraries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_reviews" ADD CONSTRAINT "tourist_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_reviews" ADD CONSTRAINT "tourist_reviews_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_reviews" ADD CONSTRAINT "tourist_reviews_booking_id_tourist_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."tourist_bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_topups" ADD CONSTRAINT "tourist_topups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;