CREATE TABLE "channel_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"establishment_id" integer NOT NULL,
	"channel_name" varchar(50) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyc_verification_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"document_type" varchar(32),
	"document_country" varchar(3),
	"document_number_hash" varchar(128),
	"full_name_encrypted" text,
	"date_of_birth" varchar(16),
	"nationality" varchar(3),
	"liveness_score" real,
	"document_match_score" real,
	"risk_score" real,
	"sanctions_clear" boolean,
	"pep_clear" boolean,
	"reviewer_id" varchar(128),
	"rejection_reason" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_conn_est_idx" ON "channel_connections" USING btree ("establishment_id");--> statement-breakpoint
CREATE INDEX "channel_conn_name_idx" ON "channel_connections" USING btree ("channel_name");--> statement-breakpoint
CREATE INDEX "kyc_user_idx" ON "kyc_verification_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "kyc_status_idx" ON "kyc_verification_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "kyc_doc_hash_idx" ON "kyc_verification_records" USING btree ("document_number_hash");