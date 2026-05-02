ALTER TABLE "tourist_bookings" ADD COLUMN "product_id" integer;--> statement-breakpoint
ALTER TABLE "tourist_bookings" ADD COLUMN "booking_date_str" varchar(10);--> statement-breakpoint
ALTER TABLE "tourist_bookings" ADD CONSTRAINT "tourist_bookings_product_id_merchant_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."merchant_products"("id") ON DELETE set null ON UPDATE no action;