CREATE TYPE "public"."itinerary_collaborator_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TABLE "itinerary_changelog" (
	"id" serial PRIMARY KEY NOT NULL,
	"itinerary_id" integer NOT NULL,
	"user_id" integer,
	"action" varchar(64) NOT NULL,
	"item_id" integer,
	"diff" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itinerary_collaborators" (
	"id" serial PRIMARY KEY NOT NULL,
	"itinerary_id" integer NOT NULL,
	"user_id" integer,
	"role" "itinerary_collaborator_role" DEFAULT 'editor' NOT NULL,
	"invite_token" varchar(64),
	"invite_email" varchar(320),
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "itinerary_collaborators_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint
ALTER TABLE "itinerary_changelog" ADD CONSTRAINT "itinerary_changelog_itinerary_id_tourist_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."tourist_itineraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_changelog" ADD CONSTRAINT "itinerary_changelog_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_collaborators" ADD CONSTRAINT "itinerary_collaborators_itinerary_id_tourist_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."tourist_itineraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_collaborators" ADD CONSTRAINT "itinerary_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;