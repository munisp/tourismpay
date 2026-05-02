CREATE TABLE "review_sentiment_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"establishment_id" integer NOT NULL,
	"positive_percent" integer NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"snapshot_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "review_sentiment_history_establishment_id_snapshot_date_unique" UNIQUE("establishment_id","snapshot_date")
);
--> statement-breakpoint
ALTER TABLE "review_sentiment_history" ADD CONSTRAINT "review_sentiment_history_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;