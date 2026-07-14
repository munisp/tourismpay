/**
 * server/db/views.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * PostgreSQL views and materialized views for the TourismPay platform.
 *
 * Views defined here:
 *  1. vWalletSummary          — per-user wallet balance aggregation
 *  2. vTransactionStats       — daily transaction volume by currency
 *  3. vKycStatusSummary       — KYC funnel metrics
 *  4. vEstablishmentMetrics   — establishment performance dashboard
 *  5. vLoyaltyLeaderboard     — top loyalty earners
 *  6. vRemittanceCorridor     — remittance volume by corridor
 *  7. vSocAlertSummary        — open SOC alerts by severity
 *  8. vBookingOccupancy       — booking occupancy rate per product
 *
 * Materialized views (require periodic REFRESH):
 *  1. mvDailyRevenue          — daily revenue aggregation (refresh: hourly)
 *  2. mvUserActivityScore     — user engagement score (refresh: daily)
 */

import { sql } from "drizzle-orm";
import {
  pgView,
  pgMaterializedView,
  integer,
  text,
  numeric,
  timestamp,
  boolean,
  varchar,
} from "drizzle-orm/pg-core";
import type { DrizzleDb as DB } from "../db.js";

// ─── Regular Views ────────────────────────────────────────────────────────────

/**
 * vWalletSummary
 * Aggregates all wallet balances per user.
 */
export const vWalletSummary = pgView("v_wallet_summary", {
  userId: text("user_id").notNull(),
  currencyCount: integer("currency_count").notNull(),
  totalBalanceNative: numeric("total_balance_native"),
  lastUpdated: numeric("last_updated"),
}).as(sql`
  SELECT
    wb.user_id,
    COUNT(DISTINCT wb.currency)::int         AS currency_count,
    SUM(wb.balance::numeric)                 AS total_balance_native,
    MAX(wb.updated_at)                       AS last_updated
  FROM wallet_balances wb
  GROUP BY wb.user_id
`);

/**
 * vTransactionStats
 * Daily transaction volume and count by currency and type.
 */
export const vTransactionStats = pgView("v_transaction_stats", {
  txDate: text("tx_date"),
  currency: varchar("currency", { length: 10 }),
  type: text("type"),
  status: text("status"),
  txCount: integer("tx_count").notNull(),
  totalVolume: numeric("total_volume"),
  avgAmount: numeric("avg_amount"),
  maxAmount: numeric("max_amount"),
}).as(sql`
  SELECT
    DATE(to_timestamp(created_at))           AS tx_date,
    from_currency                            AS currency,
    type,
    status,
    COUNT(*)::int                            AS tx_count,
    SUM(amount::numeric)                     AS total_volume,
    AVG(amount::numeric)                     AS avg_amount,
    MAX(amount::numeric)                     AS max_amount
  FROM wallet_transactions
  WHERE status = 'completed'
  GROUP BY DATE(to_timestamp(created_at)), from_currency, type, status
`);

/**
 * vKycStatusSummary
 * KYC funnel: how many users are at each verification stage.
 */
export const vKycStatusSummary = pgView("v_kyc_status_summary", {
  status: text("status"),
  documentType: text("document_type"),
  recordCount: integer("record_count").notNull(),
  avgLivenessScore: numeric("avg_liveness_score"),
  avgDocMatchScore: numeric("avg_doc_match_score"),
  avgRiskScore: numeric("avg_risk_score"),
  earliest: timestamp("earliest"),
  latest: timestamp("latest"),
}).as(sql`
  SELECT
    status,
    document_type,
    COUNT(*)::int                            AS record_count,
    AVG(liveness_score::numeric)             AS avg_liveness_score,
    AVG(document_match_score::numeric)       AS avg_doc_match_score,
    AVG(risk_score::numeric)                 AS avg_risk_score,
    MIN(created_at)                          AS earliest,
    MAX(created_at)                          AS latest
  FROM kyc_verification_records
  GROUP BY status, document_type
`);

/**
 * vEstablishmentMetrics
 * Per-establishment performance: bookings, revenue, rating.
 */
export const vEstablishmentMetrics = pgView("v_establishment_metrics", {
  establishmentId: integer("establishment_id").notNull(),
  establishmentName: varchar("establishment_name", { length: 255 }),
  establishmentType: text("establishment_type"),
  country: varchar("country", { length: 100 }),
  totalBookings: integer("total_bookings").notNull(),
  completedBookings: integer("completed_bookings").notNull(),
  cancelledBookings: integer("cancelled_bookings").notNull(),
  totalRevenueUsd: numeric("total_revenue_usd"),
  avgBookingValue: numeric("avg_booking_value"),
  totalReviews: integer("total_reviews").notNull(),
  avgRating: numeric("avg_rating"),
}).as(sql`
  SELECT
    e.id                                     AS establishment_id,
    e.name                                   AS establishment_name,
    e.type                                   AS establishment_type,
    e.country,
    COUNT(DISTINCT tb.id)::int               AS total_bookings,
    COUNT(DISTINCT CASE WHEN tb.status = 'completed' THEN tb.id END)::int AS completed_bookings,
    COUNT(DISTINCT CASE WHEN tb.status = 'cancelled' THEN tb.id END)::int AS cancelled_bookings,
    SUM(CASE WHEN tb.status = 'completed' THEN tb.price_usd::numeric ELSE 0 END) AS total_revenue_usd,
    AVG(CASE WHEN tb.status = 'completed' THEN tb.price_usd::numeric END) AS avg_booking_value,
    COUNT(DISTINCT tr.id)::int               AS total_reviews,
    AVG(tr.overall_rating::numeric)          AS avg_rating
  FROM establishments e
  LEFT JOIN tourist_bookings tb ON tb.establishment_id = e.id
  LEFT JOIN tourist_reviews tr ON tr.establishment_id = e.id
  GROUP BY e.id, e.name, e.type, e.country
`);

/**
 * vLoyaltyLeaderboard
 * Top loyalty earners with tier and lifetime points.
 */
export const vLoyaltyLeaderboard = pgView("v_loyalty_leaderboard", {
  userId: text("user_id").notNull(),
  email: varchar("email", { length: 255 }),
  tier: text("tier"),
  pointsBalance: integer("points_balance"),
  lifetimePoints: integer("lifetime_points"),
  rank: integer("rank"),
  tierRank: integer("tier_rank"),
}).as(sql`
  SELECT
    la.user_id,
    u.email,
    la.tier,
    la.points_balance,
    la.lifetime_points,
    RANK() OVER (ORDER BY la.lifetime_points DESC)::int AS rank,
    RANK() OVER (PARTITION BY la.tier ORDER BY la.lifetime_points DESC)::int AS tier_rank
  FROM loyalty_accounts la
  JOIN users u ON u.id::text = la.user_id
  WHERE la.leaderboard_opt_out = false
`);

/**
 * vRemittanceCorridor
 * Remittance volume aggregated by sender/recipient currency pair.
 */
export const vRemittanceCorridor = pgView("v_remittance_corridor", {
  senderCurrency: varchar("sender_currency", { length: 10 }),
  recipientCurrency: varchar("recipient_currency", { length: 10 }),
  transferCount: integer("transfer_count").notNull(),
  totalSenderVolume: numeric("total_sender_volume"),
  totalRecipientVolume: numeric("total_recipient_volume"),
  avgExchangeRate: numeric("avg_exchange_rate"),
  avgFee: numeric("avg_fee"),
  firstTransfer: timestamp("first_transfer"),
  lastTransfer: timestamp("last_transfer"),
}).as(sql`
  SELECT
    sender_currency,
    recipient_currency,
    COUNT(*)::int                            AS transfer_count,
    SUM(sender_amount::numeric)              AS total_sender_volume,
    SUM(recipient_amount::numeric)           AS total_recipient_volume,
    AVG(exchange_rate::numeric)              AS avg_exchange_rate,
    AVG(fee::numeric)                        AS avg_fee,
    MIN(created_at)                          AS first_transfer,
    MAX(created_at)                          AS last_transfer
  FROM remittances
  WHERE status = 'completed'
  GROUP BY sender_currency, recipient_currency
  ORDER BY transfer_count DESC
`);

/**
 * vSocAlertSummary
 * Open SOC alerts grouped by severity for the NOC dashboard.
 */
export const vSocAlertSummary = pgView("v_soc_alert_summary", {
  severity: text("severity"),
  type: text("type"),
  alertCount: integer("alert_count").notNull(),
  oldestAlert: timestamp("oldest_alert"),
  newestAlert: timestamp("newest_alert"),
}).as(sql`
  SELECT
    severity,
    type,
    COUNT(*)::int                            AS alert_count,
    MIN(created_at)                          AS oldest_alert,
    MAX(created_at)                          AS newest_alert
  FROM soc_alerts
  WHERE status = 'open'
  GROUP BY severity, type
  ORDER BY
    CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
    alert_count DESC
`);

/**
 * vBookingOccupancy
 * Booking occupancy rate per product/service for a rolling 30-day window.
 */
export const vBookingOccupancy = pgView("v_booking_occupancy", {
  establishmentId: integer("establishment_id"),
  productId: integer("product_id"),
  date: text("date"),
  totalSlots: integer("total_slots"),
  bookedSlots: integer("booked_slots"),
  occupancyPct: numeric("occupancy_pct"),
  isBlocked: boolean("is_blocked"),
}).as(sql`
  SELECT
    sa.establishment_id,
    sa.product_id,
    sa.date,
    sa.total_slots,
    sa.booked_slots,
    CASE
      WHEN sa.total_slots > 0
      THEN ROUND((sa.booked_slots::numeric / sa.total_slots::numeric) * 100, 2)
      ELSE 0
    END                                      AS occupancy_pct,
    sa.is_blocked
  FROM service_availability sa
  WHERE sa.date >= CURRENT_DATE - INTERVAL '30 days'
    AND sa.date <= CURRENT_DATE + INTERVAL '30 days'
`);

// ─── Materialized Views ───────────────────────────────────────────────────────

/**
 * mvDailyRevenue
 * Daily revenue aggregation across all payment channels.
 * Refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_revenue;
 */
export const mvDailyRevenue = pgMaterializedView("mv_daily_revenue", {
  revenueDate: text("revenue_date"),
  currency: varchar("currency", { length: 10 }),
  paymentType: text("payment_type"),
  transactionCount: integer("transaction_count").notNull(),
  grossVolume: numeric("gross_volume"),
  totalFees: numeric("total_fees"),
  netVolume: numeric("net_volume"),
}).as(sql`
  SELECT
    DATE(to_timestamp(wt.created_at))        AS revenue_date,
    wt.from_currency                         AS currency,
    wt.type                                  AS payment_type,
    COUNT(*)::int                            AS transaction_count,
    SUM(wt.amount::numeric)                  AS gross_volume,
    SUM(wt.fee::numeric)                     AS total_fees,
    SUM(wt.amount::numeric) - SUM(wt.fee::numeric) AS net_volume
  FROM wallet_transactions wt
  WHERE wt.status = 'completed'
  GROUP BY DATE(to_timestamp(wt.created_at)), wt.from_currency, wt.type
`);

/**
 * mvUserActivityScore
 * Composite user engagement score. Refresh: daily at 02:00 UTC.
 */
export const mvUserActivityScore = pgMaterializedView("mv_user_activity_score", {
  userId: text("user_id").notNull(),
  email: varchar("email", { length: 255 }),
  txCount30d: integer("tx_count_30d").notNull(),
  txVolume30d: numeric("tx_volume_30d"),
  loyaltyPoints: integer("loyalty_points"),
  loyaltyTier: text("loyalty_tier"),
  bookingCount90d: integer("booking_count_90d").notNull(),
  activityScore: integer("activity_score").notNull(),
  computedAt: timestamp("computed_at"),
}).as(sql`
  SELECT
    u.id::text                               AS user_id,
    u.email,
    COALESCE(tx.tx_count_30d, 0)            AS tx_count_30d,
    COALESCE(tx.tx_volume_30d, 0)           AS tx_volume_30d,
    COALESCE(la.points_balance, 0)          AS loyalty_points,
    COALESCE(la.tier, 'bronze')             AS loyalty_tier,
    COALESCE(bk.booking_count_90d, 0)       AS booking_count_90d,
    LEAST(100, (
      COALESCE(tx.tx_count_30d, 0) * 2
      + LEAST(50, COALESCE(la.points_balance, 0) / 100)
      + COALESCE(bk.booking_count_90d, 0) * 5
    ))::int                                  AS activity_score,
    NOW()                                    AS computed_at
  FROM users u
  LEFT JOIN (
    SELECT
      user_id,
      COUNT(*)::int                          AS tx_count_30d,
      SUM(amount::numeric)                   AS tx_volume_30d
    FROM wallet_transactions
    WHERE status = 'completed'
      AND created_at >= EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days')::int
    GROUP BY user_id
  ) tx ON tx.user_id = u.id::text
  LEFT JOIN loyalty_accounts la ON la.user_id = u.id::text
  LEFT JOIN (
    SELECT
      user_id,
      COUNT(*)::int                          AS booking_count_90d
    FROM tourist_bookings
    WHERE status = 'completed'
      AND created_at >= NOW() - INTERVAL '90 days'
    GROUP BY user_id
  ) bk ON bk.user_id = u.id
`);

// ─── View Refresh Utilities ───────────────────────────────────────────────────

/**
 * Refresh a materialized view (optionally concurrently — requires unique index).
 */
export async function refreshMaterializedView(
  db: DB,
  viewName: "mv_daily_revenue" | "mv_user_activity_score",
  concurrently = false,
): Promise<void> {
  const keyword = concurrently ? "CONCURRENTLY " : "";
  await db.execute(sql.raw(`REFRESH MATERIALIZED VIEW ${keyword}${viewName}`));
}

/**
 * Refresh all materialized views in dependency order.
 */
export async function refreshAllMaterializedViews(db: DB): Promise<void> {
  await refreshMaterializedView(db, "mv_daily_revenue");
  await refreshMaterializedView(db, "mv_user_activity_score");
}
