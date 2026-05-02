CREATE TABLE "bis_investigation_notes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"investigation_id" varchar(36) NOT NULL,
	"author_id" varchar(36) NOT NULL,
	"author_name" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bis_notes_investigation_idx" ON "bis_investigation_notes" USING btree ("investigation_id");--> statement-breakpoint
CREATE INDEX "bis_notes_author_idx" ON "bis_investigation_notes" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "bis_notes_created_idx" ON "bis_investigation_notes" USING btree ("created_at");