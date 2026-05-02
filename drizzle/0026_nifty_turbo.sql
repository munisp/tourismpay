CREATE TYPE "public"."delivery_option" AS ENUM('bank_transfer', 'mobile_money', 'agent_cash', 'bill_payment', 'wallet');--> statement-breakpoint
CREATE TYPE "public"."noc_event_type" AS ENUM('kill_switch_activated', 'kill_switch_deactivated', 'participant_suspended', 'participant_restored', 'rate_limit_breach', 'fraud_alert', 'system_alert', 'settlement_failed', 'settlement_completed');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('active', 'suspended', 'pending', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."participant_type" AS ENUM('bank', 'fintech', 'mobile_money', 'agent_network', 'psp');--> statement-breakpoint
CREATE TYPE "public"."remittance_currency" AS ENUM('BTC', 'ETH', 'USDC', 'USDT', 'NGN', 'KES', 'GHS', 'TZS', 'UGX', 'ZAR', 'USD');--> statement-breakpoint
CREATE TYPE "public"."remittance_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'reversed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."settlement_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'disputed');--> statement-breakpoint
CREATE TABLE "noc_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "noc_event_type" NOT NULL,
	"severity" varchar(16) DEFAULT 'info' NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"actor_id" integer,
	"actor_name" varchar(255),
	"target_id" varchar(128),
	"target_type" varchar(64),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"resolved_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_kill_switch_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"activated_by" integer,
	"activated_by_name" varchar(255),
	"reason" text,
	"activated_at" bigint,
	"deactivated_at" bigint,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_participants" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "participant_type" NOT NULL,
	"status" "participant_status" DEFAULT 'active' NOT NULL,
	"country" varchar(2) DEFAULT 'NG' NOT NULL,
	"currency" varchar(8) DEFAULT 'NGN' NOT NULL,
	"tb_account_id" varchar(128),
	"mojaloop_fsp_id" varchar(64),
	"health_score" integer DEFAULT 100 NOT NULL,
	"last_health_check" bigint,
	"api_endpoint" varchar(512),
	"api_key_hash" varchar(128),
	"daily_limit" numeric(20, 2),
	"monthly_limit" numeric(20, 2),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_settlements" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"batch_id" varchar(64) NOT NULL,
	"participant_id" varchar(64) NOT NULL,
	"currency" varchar(8) NOT NULL,
	"total_amount" numeric(20, 2) NOT NULL,
	"transaction_count" integer DEFAULT 0 NOT NULL,
	"status" "settlement_status" DEFAULT 'pending' NOT NULL,
	"tb_batch_id" varchar(128),
	"mojaloop_window_id" varchar(64),
	"settled_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remittances" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"sender_currency" "remittance_currency" NOT NULL,
	"sender_amount" numeric(20, 8) NOT NULL,
	"recipient_currency" "remittance_currency" DEFAULT 'NGN' NOT NULL,
	"recipient_amount" numeric(20, 8),
	"exchange_rate" numeric(20, 8),
	"fee" numeric(20, 8) DEFAULT '0' NOT NULL,
	"status" "remittance_status" DEFAULT 'pending' NOT NULL,
	"delivery_option" "delivery_option" DEFAULT 'bank_transfer' NOT NULL,
	"recipient_phone" varchar(32),
	"recipient_name" varchar(255),
	"recipient_bank" varchar(64),
	"recipient_account" varchar(64),
	"tb_transfer_id" varchar(128),
	"mojaloop_ref" varchar(128),
	"external_ref" varchar(255),
	"error_code" varchar(64),
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"completed_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "noc_events_type_idx" ON "noc_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "noc_events_severity_idx" ON "noc_events" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "noc_events_created_idx" ON "noc_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ps_participants_status_idx" ON "ps_participants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ps_participants_country_idx" ON "ps_participants" USING btree ("country");--> statement-breakpoint
CREATE INDEX "ps_settlements_batch_idx" ON "ps_settlements" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "ps_settlements_participant_idx" ON "ps_settlements" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "ps_settlements_status_idx" ON "ps_settlements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ps_settlements_created_idx" ON "ps_settlements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "remittances_user_idx" ON "remittances" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "remittances_status_idx" ON "remittances" USING btree ("status");--> statement-breakpoint
CREATE INDEX "remittances_created_idx" ON "remittances" USING btree ("created_at");