ALTER TABLE "loyalty_transactions" ADD COLUMN "expires_at" integer;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD COLUMN "is_expired" boolean DEFAULT false NOT NULL;