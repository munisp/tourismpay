CREATE TYPE "public"."kyb_document_status" AS ENUM('pending', 'verified', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."kyb_document_type" AS ENUM('certificate_of_incorporation', 'business_license', 'tax_certificate', 'director_id', 'proof_of_address', 'bank_statement', 'audited_accounts', 'ownership_structure', 'regulatory_approval', 'other');--> statement-breakpoint
CREATE TABLE "bis_report_exports" (
	"id" serial PRIMARY KEY NOT NULL,
	"investigation_id" integer NOT NULL,
	"generated_by" integer,
	"file_key" varchar(500) NOT NULL,
	"file_url" text NOT NULL,
	"file_size_bytes" integer,
	"llm_summary" text,
	"export_format" varchar(10) DEFAULT 'pdf' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyb_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"establishment_id" integer NOT NULL,
	"uploaded_by" integer,
	"document_type" "kyb_document_type" NOT NULL,
	"status" "kyb_document_status" DEFAULT 'pending' NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_key" varchar(500) NOT NULL,
	"file_url" text NOT NULL,
	"mime_type" varchar(100),
	"file_size_bytes" integer,
	"review_notes" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bis_report_exports" ADD CONSTRAINT "bis_report_exports_investigation_id_bis_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."bis_investigations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bis_report_exports" ADD CONSTRAINT "bis_report_exports_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyb_documents" ADD CONSTRAINT "kyb_documents_application_id_kyb_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."kyb_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyb_documents" ADD CONSTRAINT "kyb_documents_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyb_documents" ADD CONSTRAINT "kyb_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyb_documents" ADD CONSTRAINT "kyb_documents_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bis_export_inv_idx" ON "bis_report_exports" USING btree ("investigation_id");--> statement-breakpoint
CREATE INDEX "kyb_doc_app_idx" ON "kyb_documents" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "kyb_doc_est_idx" ON "kyb_documents" USING btree ("establishment_id");--> statement-breakpoint
CREATE INDEX "kyb_doc_type_idx" ON "kyb_documents" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "kyb_doc_status_idx" ON "kyb_documents" USING btree ("status");