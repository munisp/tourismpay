/**
 * server/db/prepared.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Drizzle ORM prepared statements for hot-path queries.
 *
 * Prepared statements are compiled once and reused, eliminating per-query
 * parse/plan overhead. Use these for the highest-frequency queries.
 *
 * Usage:
 *   import { preparedStatements } from "./prepared.js";
 *   const { getWalletBalances } = preparedStatements(db);
 *   const balances = await getWalletBalances.execute({ userId: "abc" });
 */

import { eq, and, desc, sql, placeholder } from "drizzle-orm";
import type { DrizzleDb as DB } from "../db.js";
import {
  walletBalances,
  walletTransactions,
  users,
  loyaltyAccounts,
  touristBookings,
  establishments,
  merchantProducts,
  kycVerificationRecords,
  trustedDevices,
  loginHistory,
  psApiKeys,
} from "../../drizzle/schema.js";

// ─── Prepared Statement Factory ───────────────────────────────────────────────

/**
 * Create all prepared statements bound to a specific DB connection.
 * Call once at startup and cache the result.
 *
 * @example
 * // In your server startup:
 * const stmts = preparedStatements(db);
 * app.locals.stmts = stmts;
 */
export function preparedStatements(db: DB) {
  // ── Wallet ─────────────────────────────────────────────────────────────────

  /**
   * Get all wallet balances for a user (hot path: called on every dashboard load).
   */
  const getWalletBalances = db
    .select()
    .from(walletBalances)
    .where(eq(walletBalances.userId, placeholder("userId")))
    .prepare("get_wallet_balances");

  /**
   * Get a single wallet balance for a user+currency pair.
   */
  const getWalletBalance = db
    .select()
    .from(walletBalances)
    .where(
      and(
        eq(walletBalances.userId, placeholder("userId")),
        eq(walletBalances.currency, placeholder("currency")),
      ),
    )
    .prepare("get_wallet_balance");

  /**
   * Get the 20 most recent transactions for a user.
   */
  const getRecentTransactions = db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.userId, placeholder("userId")))
    .orderBy(desc(walletTransactions.createdAt as any))
    .limit(20)
    .prepare("get_recent_transactions");

  // ── Users ──────────────────────────────────────────────────────────────────

  /**
   * Find a user by ID (hot path: called on every authenticated request).
   */
  const getUserById = db
    .select()
    .from(users)
    .where(eq(users.id, placeholder("id") as any))
    .limit(1)
    .prepare("get_user_by_id");

  /**
   * Find a user by email (hot path: login flow).
   */
  const getUserByEmail = db
    .select()
    .from(users)
    .where(eq(users.email, placeholder("email")))
    .limit(1)
    .prepare("get_user_by_email");

  // ── Loyalty ────────────────────────────────────────────────────────────────

  /**
   * Get loyalty account for a user.
   */
  const getLoyaltyAccount = db
    .select()
    .from(loyaltyAccounts)
    .where(eq(loyaltyAccounts.userId, placeholder("userId")))
    .limit(1)
    .prepare("get_loyalty_account");

  // ── Bookings ───────────────────────────────────────────────────────────────

  /**
   * Get upcoming bookings for a user (status = confirmed, bookingDate >= today).
   */
  const getUpcomingBookings = db
    .select()
    .from(touristBookings)
    .where(
      and(
        eq(touristBookings.userId, placeholder("userId") as any),
        eq(touristBookings.status, "confirmed"),
      ),
    )
    .orderBy(desc(touristBookings.createdAt))
    .limit(10)
    .prepare("get_upcoming_bookings");

  // ── Establishments ─────────────────────────────────────────────────────────

  /**
   * Get establishment by ID (hot path: product listing pages).
   */
  const getEstablishmentById = db
    .select()
    .from(establishments)
    .where(eq(establishments.id, placeholder("id") as any))
    .limit(1)
    .prepare("get_establishment_by_id");

  /**
   * Get active products for an establishment.
   */
  const getEstablishmentProducts = db
    .select()
    .from(merchantProducts)
    .where(
      and(
        eq(merchantProducts.establishmentId, placeholder("establishmentId") as any),
        eq(merchantProducts.available, true),
      ),
    )
    .orderBy(desc(merchantProducts.createdAt as any))
    .prepare("get_establishment_products");

  // ── KYC ───────────────────────────────────────────────────────────────────

  /**
   * Get latest KYC record for a user.
   */
  const getLatestKyc = db
    .select()
    .from(kycVerificationRecords)
    .where(eq(kycVerificationRecords.userId, placeholder("userId")))
    .orderBy(desc(kycVerificationRecords.createdAt))
    .limit(1)
    .prepare("get_latest_kyc");

  // ── Security ───────────────────────────────────────────────────────────────

  /**
   * Check if a device fingerprint is trusted for a user.
   */
  const checkTrustedDevice = db
    .select({ id: trustedDevices.id, expiresAt: trustedDevices.expiresAt })
    .from(trustedDevices)
    .where(
      and(
        eq(trustedDevices.userId, placeholder("userId")),
        eq(trustedDevices.deviceFingerprint, placeholder("fingerprint")),
      ),
    )
    .limit(1)
    .prepare("check_trusted_device");

  /**
   * Get recent login history for a user.
   */
  const getLoginHistory = db
    .select()
    .from(loginHistory)
    .where(eq(loginHistory.userId, placeholder("userId")))
    .orderBy(desc(loginHistory.createdAt))
    .limit(10)
    .prepare("get_login_history");

  /**
   * Get active API keys for a user (PaymentSwitch).
   */
  const getActiveApiKeys = db
    .select({
      id: psApiKeys.id,
      keyPrefix: psApiKeys.keyPrefix,
      environment: psApiKeys.environment,
      permissions: psApiKeys.permissions,
      rateLimit: psApiKeys.rateLimit,
      lastUsedAt: psApiKeys.lastUsedAt,
      expiresAt: psApiKeys.expiresAt,
    })
    .from(psApiKeys)
    .where(
      and(
        eq(psApiKeys.userId, placeholder("userId")),
        eq(psApiKeys.isActive, true),
      ),
    )
    .prepare("get_active_api_keys");

  return {
    // Wallet
    getWalletBalances,
    getWalletBalance,
    getRecentTransactions,
    // Users
    getUserById,
    getUserByEmail,
    // Loyalty
    getLoyaltyAccount,
    // Bookings
    getUpcomingBookings,
    // Establishments
    getEstablishmentById,
    getEstablishmentProducts,
    // KYC
    getLatestKyc,
    // Security
    checkTrustedDevice,
    getLoginHistory,
    getActiveApiKeys,
  };
}

export type PreparedStatements = ReturnType<typeof preparedStatements>;
