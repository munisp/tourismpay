CREATE TABLE "exchange_rate_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"base_currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"target_currency" varchar(10) NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"reason" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" bigint,
	"created_by_user_id" integer,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exchange_rate_overrides" ADD CONSTRAINT "exchange_rate_overrides_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ero_currencies_idx" ON "exchange_rate_overrides" USING btree ("base_currency","target_currency");--> statement-breakpoint
CREATE INDEX "ero_active_idx" ON "exchange_rate_overrides" USING btree ("is_active");