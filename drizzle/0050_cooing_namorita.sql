CREATE TABLE "review_sentiment_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"establishment_id" integer NOT NULL,
	"positive_percent" integer NOT NULL,
	"themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "review_sentiment_cache_establishment_id_unique" UNIQUE("establishment_id")
);
--> statement-breakpoint
ALTER TABLE "review_sentiment_cache" ADD CONSTRAINT "review_sentiment_cache_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;