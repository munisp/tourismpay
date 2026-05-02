CREATE TYPE "public"."finance_request_status" AS ENUM('pending', 'under_review', 'approved', 'rejected', 'active', 'completed', 'quoted');--> statement-breakpoint
CREATE TYPE "public"."finance_request_type" AS ENUM('payout', 'loan', 'insurance');--> statement-breakpoint
CREATE TYPE "public"."loyalty_tier" AS ENUM('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');--> statement-breakpoint
CREATE TABLE "biometric_enrollments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"credential_id" varchar(500) NOT NULL,
	"public_key" text NOT NULL,
	"device_name" varchar(200),
	"aaguid" varchar(100),
	"sign_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" integer,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carbon_offsets" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"amount" numeric(10, 3) NOT NULL,
	"project_name" varchar(200) NOT NULL,
	"project_country" varchar(10),
	"cost_usd" numeric(10, 2) NOT NULL,
	"certificate_url" varchar(500),
	"vintage_year" integer,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "did_documents" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"did" varchar(500) NOT NULL,
	"did_document" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	CONSTRAINT "did_documents_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "did_documents_did_unique" UNIQUE("did")
);
--> statement-breakpoint
CREATE TABLE "finance_requests" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"type" "finance_request_type" NOT NULL,
	"amount" numeric(20, 6),
	"currency" varchar(20),
	"status" "finance_request_status" DEFAULT 'pending' NOT NULL,
	"description" text,
	"metadata" text,
	"admin_notes" text,
	"reviewed_by" varchar(36),
	"reviewed_at" integer,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_accounts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"points_balance" integer DEFAULT 0 NOT NULL,
	"tier" "loyalty_tier" DEFAULT 'BRONZE' NOT NULL,
	"lifetime_points" integer DEFAULT 0 NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	CONSTRAINT "loyalty_accounts_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "loyalty_rewards" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"points_cost" integer NOT NULL,
	"category" varchar(50),
	"image_url" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"stock" integer,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_transactions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"type" varchar(20) NOT NULL,
	"points" integer NOT NULL,
	"description" text,
	"partner" varchar(100),
	"reference_id" varchar(100),
	"created_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifiable_credentials" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"type" varchar(200) NOT NULL,
	"issuer" varchar(200) NOT NULL,
	"subject" varchar(500) NOT NULL,
	"credential_data" text NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"expires_at" integer,
	"revoked_at" integer,
	"created_at" integer NOT NULL
);
