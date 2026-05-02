CREATE TYPE "public"."ps_webhook_delivery_status" AS ENUM('pending', 'success', 'failed', 'retrying', 'exhausted');--> statement-breakpoint
CREATE TABLE "ps_kill_switch_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"corridor" varchar(32) NOT NULL,
	"action" varchar(16) NOT NULL,
	"actor_id" integer,
	"actor_name" varchar(255),
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_kill_switches" (
	"id" serial PRIMARY KEY NOT NULL,
	"corridor" varchar(32) NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"activated_by" integer,
	"activated_by_name" varchar(255),
	"reason" text,
	"activated_at" bigint,
	"deactivated_at" bigint,
	"deactivated_by" integer,
	"deactivated_by_name" varchar(255),
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "ps_kill_switches_corridor_unique" UNIQUE("corridor")
);
--> statement-breakpoint
CREATE TABLE "ps_webhook_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"delivery_id" varchar(64) NOT NULL,
	"webhook_id" varchar(64) NOT NULL,
	"event" varchar(64) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "ps_webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_retry_at" bigint,
	"last_attempt_at" bigint,
	"response_code" integer,
	"response_body" text,
	"response_time_ms" integer,
	"error_message" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "ps_webhook_deliveries_delivery_id_unique" UNIQUE("delivery_id")
);
--> statement-breakpoint
CREATE TABLE "ps_webhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"webhook_id" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"endpoint" varchar(2048) NOT NULL,
	"events" text DEFAULT 'remittance.completed' NOT NULL,
	"secret" varchar(128) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"participant_id" varchar(64),
	"created_by" integer,
	"created_by_name" varchar(255),
	"last_delivery_at" bigint,
	"last_delivery_status" varchar(16),
	"total_deliveries" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "ps_webhooks_webhook_id_unique" UNIQUE("webhook_id")
);
--> statement-breakpoint
CREATE INDEX "ps_kill_switch_history_corridor_idx" ON "ps_kill_switch_history" USING btree ("corridor");--> statement-breakpoint
CREATE INDEX "ps_kill_switch_history_created_idx" ON "ps_kill_switch_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ps_kill_switches_corridor_idx" ON "ps_kill_switches" USING btree ("corridor");--> statement-breakpoint
CREATE INDEX "ps_kill_switches_active_idx" ON "ps_kill_switches" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "ps_webhook_deliveries_webhook_idx" ON "ps_webhook_deliveries" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "ps_webhook_deliveries_status_idx" ON "ps_webhook_deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ps_webhook_deliveries_event_idx" ON "ps_webhook_deliveries" USING btree ("event");--> statement-breakpoint
CREATE INDEX "ps_webhook_deliveries_retry_idx" ON "ps_webhook_deliveries" USING btree ("next_retry_at");--> statement-breakpoint
CREATE INDEX "ps_webhook_deliveries_created_idx" ON "ps_webhook_deliveries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ps_webhooks_participant_idx" ON "ps_webhooks" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "ps_webhooks_active_idx" ON "ps_webhooks" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "ps_webhooks_created_idx" ON "ps_webhooks" USING btree ("created_at");