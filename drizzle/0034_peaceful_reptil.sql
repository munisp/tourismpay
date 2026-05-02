ALTER TYPE "public"."user_role" ADD VALUE 'tourist';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'merchant';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'compliance_officer';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'noc_operator';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'settlement_officer';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'bis_analyst';--> statement-breakpoint
CREATE TABLE "qr_payment_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(128) NOT NULL,
	"establishment_id" integer NOT NULL,
	"amount_usd" numeric(18, 6),
	"currency" varchar(10),
	"description" text,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"paid_at" timestamp,
	"paid_by_user_id" integer,
	"wallet_tx_id" varchar(128),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "qr_payment_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" "user_role" NOT NULL,
	"resource" varchar(128) NOT NULL,
	"action" varchar(64) NOT NULL,
	"granted" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tourist_onboarding_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"step" integer DEFAULT 1 NOT NULL,
	"completed_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tourist_onboarding_state_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "tourist_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"home_currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"home_country" varchar(3) DEFAULT 'US' NOT NULL,
	"preferred_language" varchar(10) DEFAULT 'en' NOT NULL,
	"linked_card_last4" varchar(4),
	"linked_card_brand" varchar(32),
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "qr_payment_tokens" ADD CONSTRAINT "qr_payment_tokens_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_onboarding_state" ADD CONSTRAINT "tourist_onboarding_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_profiles" ADD CONSTRAINT "tourist_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;