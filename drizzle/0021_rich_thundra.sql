CREATE TYPE "public"."recurring_payment_frequency" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TABLE "loyalty_referrals" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"referrer_id" varchar(36) NOT NULL,
	"referee_id" varchar(36),
	"code" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"referrer_points_awarded" integer DEFAULT 0 NOT NULL,
	"referee_points_awarded" integer DEFAULT 0 NOT NULL,
	"used_at" bigint,
	"created_at" bigint NOT NULL,
	CONSTRAINT "loyalty_referrals_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "wallet_recurring_payments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"currency" varchar(20) NOT NULL,
	"recipient_address" varchar(200) NOT NULL,
	"recipient_name" varchar(200),
	"amount" numeric(20, 6) NOT NULL,
	"note" text,
	"frequency" "recurring_payment_frequency" NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"next_run_at" bigint NOT NULL,
	"last_run_at" bigint,
	"run_count" integer DEFAULT 0 NOT NULL,
	"failure_reason" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "loyalty_referrals_referrer_idx" ON "loyalty_referrals" USING btree ("referrer_id");--> statement-breakpoint
CREATE INDEX "loyalty_referrals_code_idx" ON "loyalty_referrals" USING btree ("code");--> statement-breakpoint
CREATE INDEX "loyalty_referrals_referee_idx" ON "loyalty_referrals" USING btree ("referee_id");--> statement-breakpoint
CREATE INDEX "wallet_rec_pay_user_idx" ON "wallet_recurring_payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallet_rec_pay_status_idx" ON "wallet_recurring_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wallet_rec_pay_next_run_idx" ON "wallet_recurring_payments" USING btree ("next_run_at");