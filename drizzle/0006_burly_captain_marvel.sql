CREATE TABLE "wallet_balance_alerts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"currency" varchar(20) NOT NULL,
	"threshold" numeric(20, 6) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL
);
