CREATE TYPE "public"."notification_category" AS ENUM('kyb', 'bis', 'fraud', 'soc', 'system', 'report');--> statement-breakpoint
CREATE TABLE "user_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"category" "notification_category" DEFAULT 'system' NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"action_url" varchar(500),
	"action_label" varchar(100),
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notif_user_idx" ON "user_notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notif_read_idx" ON "user_notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "notif_created_idx" ON "user_notifications" USING btree ("created_at");