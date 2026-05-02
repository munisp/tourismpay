CREATE TYPE "public"."rate_alert_status" AS ENUM('active', 'triggered', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."rate_condition" AS ENUM('above', 'below', 'exact');--> statement-breakpoint
CREATE TABLE "login_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"device_fingerprint" varchar(255),
	"country" varchar(100),
	"city" varchar(100),
	"login_method" varchar(64),
	"success" boolean DEFAULT true NOT NULL,
	"is_suspicious" boolean DEFAULT false NOT NULL,
	"is_trusted_device" boolean DEFAULT false NOT NULL,
	"session_id" varchar(128),
	"session_active" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_account_recovery" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"method" varchar(32) NOT NULL,
	"token" varchar(255) NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"expires_at" bigint NOT NULL,
	"completed_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_api_keys" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"key_hash" varchar(255) NOT NULL,
	"key_prefix" varchar(16) NOT NULL,
	"environment" varchar(16) DEFAULT 'sandbox' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" bigint,
	"expires_at" bigint,
	"rate_limit" integer DEFAULT 1000,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_notification_channels" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"type" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_tested_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_reminder_emails" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"type" varchar(64) NOT NULL,
	"subject" varchar(512) NOT NULL,
	"body" text NOT NULL,
	"scheduled_at" bigint NOT NULL,
	"sent_at" bigint,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_two_factor_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"method" varchar(16),
	"secret" varchar(255),
	"backup_codes" jsonb DEFAULT '[]'::jsonb,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "ps_two_factor_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "rate_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"base_currency" varchar(10) NOT NULL,
	"target_currency" varchar(10) NOT NULL,
	"target_rate" numeric(18, 8) NOT NULL,
	"condition" "rate_condition" DEFAULT 'above' NOT NULL,
	"status" "rate_alert_status" DEFAULT 'active' NOT NULL,
	"notify_email" boolean DEFAULT true NOT NULL,
	"notify_sms" boolean DEFAULT false NOT NULL,
	"triggered_at" bigint,
	"expires_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trusted_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"device_fingerprint" varchar(255) NOT NULL,
	"device_name" varchar(255),
	"device_type" varchar(100),
	"last_used_at" bigint NOT NULL,
	"expires_at" bigint,
	"created_at" bigint NOT NULL
);
