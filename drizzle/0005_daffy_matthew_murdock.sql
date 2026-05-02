CREATE TABLE "wallet_balances" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"currency" varchar(20) NOT NULL,
	"balance" numeric(20, 6) DEFAULT '0' NOT NULL,
	"locked_balance" numeric(20, 6) DEFAULT '0' NOT NULL,
	"wallet_address" varchar(100),
	"network" varchar(50),
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"type" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"from_currency" varchar(20) NOT NULL,
	"to_currency" varchar(20),
	"amount" numeric(20, 6) NOT NULL,
	"to_amount" numeric(20, 6),
	"fee" numeric(20, 6) DEFAULT '0' NOT NULL,
	"counterparty" varchar(200),
	"counterparty_address" varchar(100),
	"reference" varchar(100),
	"note" text,
	"tx_hash" varchar(100),
	"completed_at" integer,
	"created_at" integer NOT NULL
);
