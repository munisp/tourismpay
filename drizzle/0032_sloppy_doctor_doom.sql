CREATE TABLE "bis_auto_flag_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"currency" varchar(20) NOT NULL,
	"threshold_usd" numeric(18, 4) DEFAULT '5000' NOT NULL,
	"velocity_count" integer DEFAULT 10 NOT NULL,
	"bis_tier" varchar(20) DEFAULT 'standard' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by" varchar(64),
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "bis_auto_flag_config_currency_unique" UNIQUE("currency")
);
--> statement-breakpoint
CREATE TABLE "bis_auto_flags" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_tx_id" varchar(64) NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"currency" varchar(20) NOT NULL,
	"amount_usd" numeric(18, 4) NOT NULL,
	"trigger_reason" varchar(64) NOT NULL,
	"threshold_usd" numeric(18, 4),
	"bis_investigation_id" integer,
	"bis_reference_id" varchar(20),
	"status" varchar(32) DEFAULT 'created' NOT NULL,
	"error_message" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bis_kill_switch_activations" (
	"id" serial PRIMARY KEY NOT NULL,
	"bis_investigation_id" integer NOT NULL,
	"bis_reference_id" varchar(20) NOT NULL,
	"subject_full_name" varchar(255) NOT NULL,
	"risk_level" varchar(16) NOT NULL,
	"risk_score" integer,
	"corridor" varchar(32) NOT NULL,
	"reason" text NOT NULL,
	"activated_by" varchar(64) DEFAULT 'BIS_AUTO' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bis_auto_flags_user_idx" ON "bis_auto_flags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bis_auto_flags_tx_idx" ON "bis_auto_flags" USING btree ("wallet_tx_id");--> statement-breakpoint
CREATE INDEX "bis_auto_flags_created_idx" ON "bis_auto_flags" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bis_ks_act_inv_idx" ON "bis_kill_switch_activations" USING btree ("bis_investigation_id");--> statement-breakpoint
CREATE INDEX "bis_ks_act_corridor_idx" ON "bis_kill_switch_activations" USING btree ("corridor");--> statement-breakpoint
CREATE INDEX "bis_ks_act_created_idx" ON "bis_kill_switch_activations" USING btree ("created_at");