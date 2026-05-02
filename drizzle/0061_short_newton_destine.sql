CREATE TABLE "service_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"establishment_id" integer NOT NULL,
	"date" varchar(10) NOT NULL,
	"total_slots" integer DEFAULT 0 NOT NULL,
	"booked_slots" integer DEFAULT 0 NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_availability" ADD CONSTRAINT "service_availability_product_id_merchant_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."merchant_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_availability" ADD CONSTRAINT "service_availability_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sav_product_idx" ON "service_availability" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sav_est_idx" ON "service_availability" USING btree ("establishment_id");--> statement-breakpoint
CREATE INDEX "sav_date_idx" ON "service_availability" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "sav_product_date_unique" ON "service_availability" USING btree ("product_id","date");