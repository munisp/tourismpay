CREATE TABLE "ps_fraud_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"rule_type" varchar(50) DEFAULT 'threshold' NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb,
	"action" varchar(50) DEFAULT 'flag' NOT NULL,
	"severity" "fraud_alert_severity" DEFAULT 'medium' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "ps_fraud_rules_rule_id_unique" UNIQUE("rule_id")
);
--> statement-breakpoint
CREATE TABLE "ps_ledger_entries" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"account_id" varchar(64) NOT NULL,
	"participant_id" varchar(64) NOT NULL,
	"ledger" integer DEFAULT 1 NOT NULL,
	"code" integer DEFAULT 1 NOT NULL,
	"debit_amount" numeric(20, 2) DEFAULT '0' NOT NULL,
	"credit_amount" numeric(20, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(8) NOT NULL,
	"transfer_id" varchar(64),
	"remittance_id" varchar(64),
	"settlement_id" varchar(64),
	"tb_transfer_id" varchar(128),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ps_fraud_rules" ADD CONSTRAINT "ps_fraud_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ps_fraud_rules_type_idx" ON "ps_fraud_rules" USING btree ("rule_type");--> statement-breakpoint
CREATE INDEX "ps_fraud_rules_active_idx" ON "ps_fraud_rules" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "ps_fraud_rules_severity_idx" ON "ps_fraud_rules" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "ps_ledger_account_idx" ON "ps_ledger_entries" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "ps_ledger_participant_idx" ON "ps_ledger_entries" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "ps_ledger_transfer_idx" ON "ps_ledger_entries" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "ps_ledger_created_idx" ON "ps_ledger_entries" USING btree ("created_at");