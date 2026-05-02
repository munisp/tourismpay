CREATE TABLE "tourist_itinerary_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"itinerary_id" integer NOT NULL,
	"day_number" integer DEFAULT 1 NOT NULL,
	"order_in_day" integer DEFAULT 1 NOT NULL,
	"establishment_id" integer,
	"booking_id" integer,
	"deal_id" integer,
	"title" varchar(255) NOT NULL,
	"notes" text,
	"start_time" varchar(10),
	"end_time" varchar(10),
	"estimated_cost_usd" numeric(18, 2) DEFAULT '0',
	"item_type" varchar(32) DEFAULT 'activity' NOT NULL,
	"status" varchar(32) DEFAULT 'planned' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tourist_itinerary_items" ADD CONSTRAINT "tourist_itinerary_items_itinerary_id_tourist_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."tourist_itineraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_itinerary_items" ADD CONSTRAINT "tourist_itinerary_items_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_itinerary_items" ADD CONSTRAINT "tourist_itinerary_items_booking_id_tourist_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."tourist_bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_itinerary_items" ADD CONSTRAINT "tourist_itinerary_items_deal_id_tourist_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."tourist_deals"("id") ON DELETE set null ON UPDATE no action;