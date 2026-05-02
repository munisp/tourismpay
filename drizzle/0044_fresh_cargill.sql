CREATE TABLE "tourist_deal_redemptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"deal_id" integer NOT NULL,
	"establishment_id" integer,
	"redemption_code" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'redeemed' NOT NULL,
	"redeemed_at" timestamp DEFAULT now() NOT NULL,
	"confirmed_at" timestamp,
	"confirmed_by" integer,
	"notes" text,
	CONSTRAINT "tourist_deal_redemptions_redemption_code_unique" UNIQUE("redemption_code")
);
--> statement-breakpoint
ALTER TABLE "tourist_deal_redemptions" ADD CONSTRAINT "tourist_deal_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_deal_redemptions" ADD CONSTRAINT "tourist_deal_redemptions_deal_id_tourist_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."tourist_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_deal_redemptions" ADD CONSTRAINT "tourist_deal_redemptions_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE set null ON UPDATE no action;