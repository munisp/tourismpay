ALTER TABLE "bis_investigations" ADD COLUMN "subject_type" varchar(20) DEFAULT 'individual' NOT NULL;--> statement-breakpoint
ALTER TABLE "bis_investigations" ADD COLUMN "entity_registration_number" varchar(100);--> statement-breakpoint
ALTER TABLE "bis_investigations" ADD COLUMN "entity_type" varchar(50);--> statement-breakpoint
ALTER TABLE "bis_investigations" ADD COLUMN "entity_website" varchar(255);--> statement-breakpoint
ALTER TABLE "bis_investigations" ADD COLUMN "entity_year_founded" integer;