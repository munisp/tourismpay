CREATE TABLE "bis_directors" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_investigation_id" integer NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"role" varchar(100) DEFAULT 'Director' NOT NULL,
	"nationality" varchar(100),
	"nin" varchar(50),
	"email" varchar(320),
	"phone" varchar(30),
	"ownership_percent" integer,
	"linked_investigation_id" integer,
	"bundle_discount_percent" integer DEFAULT 20 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tourist_itineraries" ADD COLUMN "share_token" varchar(64);--> statement-breakpoint
ALTER TABLE "tourist_itineraries" ADD COLUMN "share_export_url" text;--> statement-breakpoint
ALTER TABLE "bis_directors" ADD CONSTRAINT "bis_directors_entity_investigation_id_bis_investigations_id_fk" FOREIGN KEY ("entity_investigation_id") REFERENCES "public"."bis_investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bis_directors" ADD CONSTRAINT "bis_directors_linked_investigation_id_bis_investigations_id_fk" FOREIGN KEY ("linked_investigation_id") REFERENCES "public"."bis_investigations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bis_directors_entity_idx" ON "bis_directors" USING btree ("entity_investigation_id");--> statement-breakpoint
ALTER TABLE "tourist_itineraries" ADD CONSTRAINT "tourist_itineraries_share_token_unique" UNIQUE("share_token");