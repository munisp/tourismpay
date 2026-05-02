CREATE TABLE "mesh_transactions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"corridor_id" varchar(50) NOT NULL,
	"from_currency" varchar(10) NOT NULL,
	"to_currency" varchar(10) NOT NULL,
	"amount" numeric(18, 6) NOT NULL,
	"converted_amount" numeric(18, 6) NOT NULL,
	"fee_amount" numeric(18, 6) NOT NULL,
	"exchange_rate" numeric(18, 8) NOT NULL,
	"recipient_address" varchar(500) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"tx_hash" varchar(200),
	"created_at" integer NOT NULL,
	"completed_at" integer
);
