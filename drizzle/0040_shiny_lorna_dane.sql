CREATE TYPE "public"."staff_invite_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('cashier', 'manager', 'supervisor');--> statement-breakpoint
CREATE TABLE "qr_payment_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(128) NOT NULL,
	"tourist_user_id" integer,
	"establishment_id" integer,
	"merchant_name" varchar(255),
	"amount_usd" numeric(12, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"line_items" jsonb,
	"status" varchar(50) DEFAULT 'completed' NOT NULL,
	"pdf_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "qr_payment_receipts_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "staff_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(128) NOT NULL,
	"establishment_id" integer NOT NULL,
	"inviter_user_id" integer NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" "staff_role" DEFAULT 'cashier' NOT NULL,
	"status" "staff_invite_status" DEFAULT 'pending' NOT NULL,
	"accepted_by_user_id" integer,
	"accepted_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staff_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "qr_payment_receipts" ADD CONSTRAINT "qr_payment_receipts_tourist_user_id_users_id_fk" FOREIGN KEY ("tourist_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_payment_receipts" ADD CONSTRAINT "qr_payment_receipts_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_inviter_user_id_users_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qpr_token_idx" ON "qr_payment_receipts" USING btree ("token");--> statement-breakpoint
CREATE INDEX "qpr_tourist_idx" ON "qr_payment_receipts" USING btree ("tourist_user_id");--> statement-breakpoint
CREATE INDEX "qpr_est_idx" ON "qr_payment_receipts" USING btree ("establishment_id");--> statement-breakpoint
CREATE INDEX "si_est_idx" ON "staff_invites" USING btree ("establishment_id");--> statement-breakpoint
CREATE INDEX "si_token_idx" ON "staff_invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "si_email_idx" ON "staff_invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "si_status_idx" ON "staff_invites" USING btree ("status");