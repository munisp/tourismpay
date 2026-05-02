CREATE TABLE "noc_alert_thresholds" (
	"id" serial PRIMARY KEY NOT NULL,
	"metric" varchar(64) NOT NULL,
	"warn_min" numeric(10, 2),
	"warn_max" numeric(10, 2),
	"crit_min" numeric(10, 2),
	"crit_max" numeric(10, 2),
	"unit" varchar(16) DEFAULT '' NOT NULL,
	"label" varchar(64) NOT NULL,
	"updated_by" varchar(64),
	"updated_at" bigint NOT NULL,
	CONSTRAINT "noc_alert_thresholds_metric_unique" UNIQUE("metric")
);
--> statement-breakpoint
CREATE INDEX "noc_thresholds_metric_idx" ON "noc_alert_thresholds" USING btree ("metric");