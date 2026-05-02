ALTER TABLE "establishments" ADD COLUMN "stripe_account_id" varchar(128);--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "stripe_connect_status" varchar(32) DEFAULT 'not_started';--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "stripe_payouts_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "stripe_details_submitted" boolean DEFAULT false;