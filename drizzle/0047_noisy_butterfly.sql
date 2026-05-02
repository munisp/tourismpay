CREATE TABLE "tourist_deal_wishlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"deal_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tourist_deals" ADD COLUMN "boost_budget_usd" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "tourist_deals" ADD COLUMN "boost_spent_usd" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "tourist_reviews" ADD COLUMN "merchant_response" text;--> statement-breakpoint
ALTER TABLE "tourist_reviews" ADD COLUMN "merchant_responded_at" timestamp;--> statement-breakpoint
ALTER TABLE "tourist_deal_wishlists" ADD CONSTRAINT "tourist_deal_wishlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_deal_wishlists" ADD CONSTRAINT "tourist_deal_wishlists_deal_id_tourist_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."tourist_deals"("id") ON DELETE cascade ON UPDATE no action;