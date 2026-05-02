CREATE TABLE "wallet_spending_limits" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"currency" varchar(20) NOT NULL,
	"period" varchar(10) DEFAULT 'daily' NOT NULL,
	"limit_amount" numeric(20, 6) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL
);
