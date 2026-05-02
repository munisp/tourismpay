CREATE TABLE "pin_lockout_history" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"tier" integer DEFAULT 0 NOT NULL,
	"locked_at" integer NOT NULL,
	"unlocks_at" integer NOT NULL,
	"failed_attempts" integer DEFAULT 5 NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_health_alerts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"service_key" varchar(50) NOT NULL,
	"last_alert_at" integer NOT NULL,
	"last_status" varchar(20) DEFAULT 'unreachable' NOT NULL,
	"alert_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "service_health_alerts_service_key_unique" UNIQUE("service_key")
);
--> statement-breakpoint
CREATE TABLE "service_health_history" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"service_key" varchar(50) NOT NULL,
	"status" varchar(20) NOT NULL,
	"http_status" integer,
	"response_ms" integer,
	"checked_at" integer NOT NULL
);
