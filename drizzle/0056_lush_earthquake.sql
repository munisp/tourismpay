ALTER TABLE "tourist_itineraries" ADD COLUMN "status" varchar(32) DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "tourist_itineraries" ADD COLUMN "currency" varchar(10) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "tourist_itineraries" ADD COLUMN "description" text;