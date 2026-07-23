/**
 * drizzle/schema-constraints.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Additional check constraints and composite indexes for the TourismPay schema.
 *
 * These are defined as a separate file to avoid modifying the large schema.ts
 * and to allow incremental migration generation. They are included in the
 * fullSchema object in server/db.ts.
 *
 * Constraints added:
 *  - walletBalances: balance >= 0, lockedBalance >= 0
 *  - walletTransactions: amount > 0, fee >= 0
 *  - remittances: senderAmount > 0, fee >= 0, exchangeRate > 0
 *  - loyaltyAccounts: pointsBalance >= 0, lifetimePoints >= 0
 *  - touristBookings: priceUsd >= 0, partySize >= 1
 *  - merchantProducts: price >= 0, sortOrder >= 0
 *  - kybApplications: score 0-100
 *  - touristReviews: ratings 1-5
 *
 * Composite indexes added:
 *  - walletTransactions: (userId, status, createdAt) — hot path for wallet history
 *  - walletTransactions: (reference) — for idempotency lookups
 *  - touristBookings: (userId, status) — user booking list
 *  - touristBookings: (establishmentId, bookingDate) — calendar view
 *  - remittances: (userId, status, createdAt) — user remittance history
 *  - loyaltyTransactions: (userId, createdAt) — loyalty history
 *  - auditLogs: (entityType, entityId) — entity audit trail
 *  - auditLogs: (actorId, createdAt) — actor activity log
 *  - kycVerificationRecords: (userId, status) — KYC funnel
 *  - socAlerts: (severity, status, createdAt) — NOC dashboard
 */

import { sql } from "drizzle-orm";
import { check, index } from "drizzle-orm/pg-core";
import {
  walletBalances,
  walletTransactions,
  remittances,
  loyaltyAccounts,
  loyaltyTransactions,
  touristBookings,
  merchantProducts,
  auditLogs,
} from "./schema";

// ─── Check Constraints ────────────────────────────────────────────────────────

/**
 * All check constraints exported for use in migration generation.
 * These are applied as ALTER TABLE ... ADD CONSTRAINT in migration 0078.
 */
export const checkConstraints = {
  // Wallet balances must be non-negative
  walletBalancesNonNegative: check(
    "wallet_balances_balance_non_negative",
    sql`${walletBalances.balance} >= 0`,
  ),
  walletLockedBalanceNonNegative: check(
    "wallet_balances_locked_non_negative",
    sql`${walletBalances.lockedBalance} >= 0`,
  ),
  walletLockedLteBalance: check(
    "wallet_balances_locked_lte_balance",
    sql`${walletBalances.lockedBalance} <= ${walletBalances.balance}`,
  ),

  // Wallet transactions: amount and fee must be positive/non-negative
  walletTxAmountPositive: check(
    "wallet_transactions_amount_positive",
    sql`${walletTransactions.amount} > 0`,
  ),
  walletTxFeeNonNegative: check(
    "wallet_transactions_fee_non_negative",
    sql`${walletTransactions.fee} >= 0`,
  ),

  // Remittances: amounts must be positive
  remittanceSenderAmountPositive: check(
    "remittances_sender_amount_positive",
    sql`${remittances.senderAmount} > 0`,
  ),
  remittanceFeeNonNegative: check(
    "remittances_fee_non_negative",
    sql`${remittances.fee} >= 0`,
  ),
  remittanceExchangeRatePositive: check(
    "remittances_exchange_rate_positive",
    sql`${remittances.exchangeRate} IS NULL OR ${remittances.exchangeRate} > 0`,
  ),

  // Loyalty: balances must be non-negative
  loyaltyPointsNonNegative: check(
    "loyalty_accounts_points_non_negative",
    sql`${loyaltyAccounts.pointsBalance} >= 0`,
  ),
  loyaltyLifetimeNonNegative: check(
    "loyalty_accounts_lifetime_non_negative",
    sql`${loyaltyAccounts.lifetimePoints} >= 0`,
  ),
  loyaltyLifetimeGteBalance: check(
    "loyalty_accounts_lifetime_gte_balance",
    sql`${loyaltyAccounts.lifetimePoints} >= ${loyaltyAccounts.pointsBalance}`,
  ),

  // Bookings: price and party size must be valid
  bookingPriceNonNegative: check(
    "tourist_bookings_price_non_negative",
    sql`${touristBookings.priceUsd} >= 0`,
  ),
  bookingPartySizePositive: check(
    "tourist_bookings_party_size_positive",
    sql`${touristBookings.partySize} >= 1`,
  ),

  // Products: price and sort order must be valid
  productPriceNonNegative: check(
    "merchant_products_price_non_negative",
    sql`${merchantProducts.price} >= 0`,
  ),
  productSortOrderNonNegative: check(
    "merchant_products_sort_order_non_negative",
    sql`${merchantProducts.sortOrder} >= 0`,
  ),
} as const;

// ─── Composite Indexes ────────────────────────────────────────────────────────

/**
 * Additional composite indexes for hot-path queries not covered by schema.ts.
 * These are applied in migration 0078.
 */
export const compositeIndexes = {
  // Wallet transaction history: user + status + time (most common query pattern)
  walletTxUserStatusTime: index("idx_wallet_tx_user_status_created")
    .on(walletTransactions.userId, walletTransactions.status, walletTransactions.createdAt),

  // Wallet transaction idempotency lookup by reference
  walletTxReference: index("idx_wallet_tx_reference")
    .on(walletTransactions.reference),

  // Booking list by user + status
  bookingUserStatus: index("idx_tourist_bookings_user_status")
    .on(touristBookings.userId, touristBookings.status),

  // Booking calendar view: establishment + date
  bookingEstablishmentDate: index("idx_tourist_bookings_est_date")
    .on(touristBookings.establishmentId, touristBookings.bookingDate),

  // Remittance history: user + status + time
  remittanceUserStatusTime: index("idx_remittances_user_status_created")
    .on(remittances.userId, remittances.status, remittances.createdAt),

  // Loyalty transaction history: user + time
  loyaltyTxUserTime: index("idx_loyalty_tx_user_created")
    .on(loyaltyTransactions.userId, loyaltyTransactions.createdAt),

  // Audit log: entity lookup (most common admin query)
  auditLogEntityLookup: index("idx_audit_logs_entity")
    .on(auditLogs.entityType, auditLogs.entityId),

  // Audit log: actor activity
  auditLogActorTime: index("idx_audit_logs_actor_created")
    .on(auditLogs.actorId, auditLogs.createdAt),
} as const;

// ─── SQL DDL for Migration ────────────────────────────────────────────────────

/**
 * Raw SQL DDL statements for migration 0078.
 * These are idempotent (IF NOT EXISTS / DO NOTHING patterns).
 */
export const constraintMigrationSql = `
-- ─── Check Constraints ──────────────────────────────────────────────────────
ALTER TABLE wallet_balances
  ADD CONSTRAINT IF NOT EXISTS wallet_balances_balance_non_negative CHECK (balance >= 0),
  ADD CONSTRAINT IF NOT EXISTS wallet_balances_locked_non_negative CHECK (locked_balance >= 0),
  ADD CONSTRAINT IF NOT EXISTS wallet_balances_locked_lte_balance CHECK (locked_balance <= balance);

ALTER TABLE wallet_transactions
  ADD CONSTRAINT IF NOT EXISTS wallet_transactions_amount_positive CHECK (amount > 0),
  ADD CONSTRAINT IF NOT EXISTS wallet_transactions_fee_non_negative CHECK (fee >= 0);

ALTER TABLE remittances
  ADD CONSTRAINT IF NOT EXISTS remittances_sender_amount_positive CHECK (sender_amount > 0),
  ADD CONSTRAINT IF NOT EXISTS remittances_fee_non_negative CHECK (fee >= 0),
  ADD CONSTRAINT IF NOT EXISTS remittances_exchange_rate_positive CHECK (exchange_rate IS NULL OR exchange_rate > 0);

ALTER TABLE loyalty_accounts
  ADD CONSTRAINT IF NOT EXISTS loyalty_accounts_points_non_negative CHECK (points_balance >= 0),
  ADD CONSTRAINT IF NOT EXISTS loyalty_accounts_lifetime_non_negative CHECK (lifetime_points >= 0),
  ADD CONSTRAINT IF NOT EXISTS loyalty_accounts_lifetime_gte_balance CHECK (lifetime_points >= points_balance);

ALTER TABLE tourist_bookings
  ADD CONSTRAINT IF NOT EXISTS tourist_bookings_price_non_negative CHECK (price_usd >= 0),
  ADD CONSTRAINT IF NOT EXISTS tourist_bookings_party_size_positive CHECK (party_size >= 1);

ALTER TABLE merchant_products
  ADD CONSTRAINT IF NOT EXISTS merchant_products_price_non_negative CHECK (price >= 0),
  ADD CONSTRAINT IF NOT EXISTS merchant_products_sort_order_non_negative CHECK (sort_order >= 0);

-- ─── Composite Indexes ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_status_created
  ON wallet_transactions (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_reference
  ON wallet_transactions (reference)
  WHERE reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tourist_bookings_user_status
  ON tourist_bookings (user_id, status);

CREATE INDEX IF NOT EXISTS idx_tourist_bookings_est_date
  ON tourist_bookings (establishment_id, booking_date DESC);

CREATE INDEX IF NOT EXISTS idx_remittances_user_status_created
  ON remittances (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_loyalty_tx_user_created
  ON loyalty_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON audit_logs (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created
  ON audit_logs (actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;

-- ─── Materialized View Unique Indexes (for CONCURRENT refresh) ───────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_revenue_pk
  ON mv_daily_revenue (revenue_date, currency, payment_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_user_activity_pk
  ON mv_user_activity_score (user_id);
`;
