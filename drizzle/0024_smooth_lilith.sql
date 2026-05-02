CREATE TYPE "public"."bis_export_schedule_frequency" AS ENUM('weekly', 'biweekly', 'monthly');--> statement-breakpoint
CREATE TABLE "bis_export_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"frequency" "bis_export_schedule_frequency" DEFAULT 'weekly' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"include_internal" boolean DEFAULT false NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb,
	"next_run_at" bigint NOT NULL,
	"last_run_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "bis_export_schedules_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "loyalty_accounts" ADD COLUMN "hide_transaction_history" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bis_export_schedules" ADD CONSTRAINT "bis_export_schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bis_export_sched_user_idx" ON "bis_export_schedules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bis_export_sched_next_run_idx" ON "bis_export_schedules" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "bis_export_sched_enabled_idx" ON "bis_export_schedules" USING btree ("enabled");