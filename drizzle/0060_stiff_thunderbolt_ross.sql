CREATE TABLE "establishment_score_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"establishment_id" integer NOT NULL,
	"composite_score" integer DEFAULT 0 NOT NULL,
	"booking_count" integer DEFAULT 0 NOT NULL,
	"avg_rating" numeric(3, 1) DEFAULT '0' NOT NULL,
	"response_rate" integer DEFAULT 0 NOT NULL,
	"snapshot_date" varchar(10) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "establishment_score_snapshots" ADD CONSTRAINT "establishment_score_snapshots_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "est_snapshot_est_idx" ON "establishment_score_snapshots" USING btree ("establishment_id");--> statement-breakpoint
CREATE INDEX "est_snapshot_date_idx" ON "establishment_score_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX "est_snapshot_unique" ON "establishment_score_snapshots" USING btree ("establishment_id","snapshot_date");