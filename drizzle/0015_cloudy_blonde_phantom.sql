CREATE TABLE "bis_timeline" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"investigation_id" integer NOT NULL,
	"actor_id" varchar(36),
	"actor_name" varchar(255),
	"event_type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"metadata" jsonb,
	"severity" varchar(20) DEFAULT 'info' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bis_timeline" ADD CONSTRAINT "bis_timeline_investigation_id_bis_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."bis_investigations"("id") ON DELETE cascade ON UPDATE no action;