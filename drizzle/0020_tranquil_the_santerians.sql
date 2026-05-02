CREATE TABLE "loyalty_partners" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"logo_url" text,
	"description" text,
	"bonus_multiplier" numeric(5, 2) DEFAULT '1.00' NOT NULL,
	"category" varchar(50) DEFAULT 'general' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "loyalty_partners_active_idx" ON "loyalty_partners" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "loyalty_partners_category_idx" ON "loyalty_partners" USING btree ("category");