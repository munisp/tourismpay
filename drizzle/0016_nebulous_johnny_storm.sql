CREATE TYPE "public"."scheduled_payment_recurrence" AS ENUM('once', 'daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."scheduled_payment_status" AS ENUM('active', 'paused', 'cancelled', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "scheduled_payments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"to_address" varchar(255) NOT NULL,
	"counterparty_name" varchar(255),
	"amount" numeric(20, 8) NOT NULL,
	"currency" varchar(20) NOT NULL,
	"recurrence" "scheduled_payment_recurrence" DEFAULT 'once' NOT NULL,
	"note" varchar(500),
	"reference" varchar(100),
	"status" "scheduled_payment_status" DEFAULT 'active' NOT NULL,
	"scheduled_at" bigint NOT NULL,
	"last_run_at" bigint,
	"next_run_at" bigint,
	"run_count" integer DEFAULT 0 NOT NULL,
	"failure_reason" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bis_investigations" ADD COLUMN "assigned_to_id" integer;--> statement-breakpoint
ALTER TABLE "bis_investigations" ADD COLUMN "assigned_to_name" varchar(255);--> statement-breakpoint
ALTER TABLE "bis_investigations" ADD COLUMN "assigned_at" timestamp;--> statement-breakpoint
CREATE INDEX "sched_pay_user_idx" ON "scheduled_payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sched_pay_status_idx" ON "scheduled_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sched_pay_next_run_idx" ON "scheduled_payments" USING btree ("next_run_at");--> statement-breakpoint
ALTER TABLE "bis_investigations" ADD CONSTRAINT "bis_investigations_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;