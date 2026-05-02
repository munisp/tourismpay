ALTER TABLE "tourist_bookings" ADD COLUMN "reminder_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tourist_bookings" ADD COLUMN "reminder_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "tourist_deals" ADD COLUMN "visibility_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tourist_deals" ADD COLUMN "boosted_until" timestamp;