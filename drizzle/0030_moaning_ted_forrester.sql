CREATE TABLE "ps_corridor_rate_limit_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"corridor" varchar(16) NOT NULL,
	"window_start" bigint NOT NULL,
	"day_window_start" bigint NOT NULL,
	"tx_count" integer DEFAULT 0 NOT NULL,
	"volume_sum" bigint DEFAULT 0 NOT NULL,
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"last_updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_corridor_rate_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"corridor" varchar(16) NOT NULL,
	"max_tx_per_minute" integer DEFAULT 0 NOT NULL,
	"max_volume_per_day" bigint DEFAULT 0 NOT NULL,
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_by" varchar(128),
	"updated_by" varchar(128),
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "ps_corridor_rate_limits_corridor_unique" UNIQUE("corridor")
);
--> statement-breakpoint
CREATE INDEX "ps_corridor_rl_usage_corridor_idx" ON "ps_corridor_rate_limit_usage" USING btree ("corridor");--> statement-breakpoint
CREATE INDEX "ps_corridor_rl_usage_window_idx" ON "ps_corridor_rate_limit_usage" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "ps_corridor_rl_usage_day_idx" ON "ps_corridor_rate_limit_usage" USING btree ("day_window_start");--> statement-breakpoint
CREATE INDEX "ps_corridor_rl_corridor_idx" ON "ps_corridor_rate_limits" USING btree ("corridor");--> statement-breakpoint
CREATE INDEX "ps_corridor_rl_active_idx" ON "ps_corridor_rate_limits" USING btree ("is_active");