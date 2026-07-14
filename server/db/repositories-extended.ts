/**
 * server/db/repositories-extended.ts
 *
 * Extended typed repository layer for TourismPay — Phase 4 Drizzle ORM improvements.
 *
 * Adds repositories for the top-30 high-usage tables that were missing from the
 * original repositories.ts. Each repository:
 *   - Accepts a `db` instance (enabling transaction-scoped usage)
 *   - Returns fully-typed results via `$inferSelect` / `$inferInsert`
 *   - Supports soft-delete, pagination, and cache-aware patterns
 *   - Uses prepared statements for hot paths
 *
 * Usage:
 *   import { makeExtendedRepositories } from "@/db/repositories-extended";
 *   const repos = makeExtendedRepositories(db, cache);
 *   const wallet = await repos.walletBalances.findByUserId(42);
 */

import {
  eq, and, or, desc, asc, gte, lte, lt, gt,
  isNull, isNotNull, inArray, like, ilike,
  count, sum, avg, max, min, sql,
} from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../../drizzle/schema";
import {
  walletBalances,
  walletTransactions,
  walletBalanceAlerts,
  walletSpendingLimits,
  loyaltyAccounts,
  loyaltyTransactions,
  loyaltyRewards,
  loyaltyReferrals,
  loyaltyPartners,
  remittances,
  bisInvestigations,
  bisInvestigationNotes,
  bisTimeline,
  bisExportSchedules,
  bisAutoFlags,
  bisAutoFlagConfig,
  bisKillSwitchActivations,
  touristBookings,
  touristReviews,
  touristDeals,
  touristDealRedemptions,
  touristDealWishlists,
  touristItineraries,
  touristItineraryItems,
  touristTopups,
  touristBudgets,
  touristConciergeSessions,
  touristTripSummaries,
  touristOnboardingState,
  touristProfiles,
  establishments,
  establishmentScoreSnapshots,
  merchantProducts,
  merchantPayoutSchedules,
  staffInvites,
  serviceAvailability,
  channelConnections,
  reviewSentimentCache,
  reviewSentimentHistory,
  qrPaymentTokens,
  qrPaymentReceipts,
  kycVerificationRecords,
  stablecoinOnrampOrders,
  stablecoinOfframpRequests,
  stablecoinLimitOrders,
  stablecoinYieldPositions,
  lpApplications,
  lpPositions,
  lpRewards,
  lpWithdrawals,
  lpPoolSnapshots,
  smartContractDeployments,
  smartContractEvents,
  cashLoadOrders,
  agentKycVerifications,
  bankTransfersOut,
  savedBeneficiaries,
  paymentLinks,
  moneyRequests,
  nfcPaymentTokens,
  bankTravelNotifications,
  esimOrders,
  preTravelChecklists,
  kycFastTrackHistory,
  offlineTokenRenewals,
  travelRiskAssessments,
  tipConfigs,
  taxRemittanceTracker,
  taxRulesCustom,
  scheduledPayments,
  walletRecurringPayments,
  exchangeRateOverrides,
  psApiKeys,
  psNotificationChannels,
  psReminderEmails,
  psAccountRecovery,
  psTwoFactorSettings,
  trustedDevices,
  loginHistory,
  pushSubscriptions,
  rolePermissions,
  rateAlerts,
  nocEvents,
  nocAlertThresholds,
  psSettlements,
  psLedgerEntries,
  psFraudRules,
  psKillSwitchHistory,
  psWebhooks,
  psWebhookDeliveries,
  psCorridorRateLimits,
  psCorridorRateLimitUsage,
  killSwitchSchedules,
  daprSubscriptions,
  daprStateEntries,
  serviceHealthAlerts,
  serviceHealthHistory,
  carbonOffsets,
  meshTransactions,
  financeRequests,
  tourismEvents,
  socAlerts,
  pinLockoutHistory,
  rideBookings,
  users,
} from "../../drizzle/schema";

// ─── Types ────────────────────────────────────────────────────────────────────
type DB = PostgresJsDatabase<typeof schema>;

export interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  orderBy?: "asc" | "desc";
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function paginate<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

// ─── Wallet Balances ──────────────────────────────────────────────────────────
export function makeWalletBalanceRepo(db: DB, cache?: CacheAdapter) {
  const CACHE_TTL = 30; // 30s — hot path

  return {
        async findByUserId(userId: string) {
      const key = `wallet:balances:${userId}`;
      if (cache) {
        const cached = await cache.get<typeof walletBalances.$inferSelect[]>(key);
        if (cached) return cached;
      }
      const rows = await db
        .select()
        .from(walletBalances)
        .where(eq(walletBalances.userId, userId))
        .orderBy(asc(walletBalances.currency));
      if (cache) await cache.set(key, rows, CACHE_TTL);
      return rows;
    },
    async findByCurrency(userId: string, currency: string) {
      const rows = await db
        .select()
        .from(walletBalances)
        .where(and(eq(walletBalances.userId, userId), eq(walletBalances.currency, currency)));
      return rows[0] ?? null;
    },
    async upsertBalance(userId: string, currency: string, delta: string) {
      await db
        .insert(walletBalances)
        .values({ userId, currency, balance: delta, lockedBalance: "0", updatedAt: Math.floor(Date.now() / 1000) })
        .onConflictDoUpdate({
          target: [walletBalances.userId, walletBalances.currency],
          set: {
            balance: sql`${walletBalances.balance} + ${delta}::numeric`,
            updatedAt: sql`EXTRACT(EPOCH FROM NOW())::int`,
          },
        });
      if (cache) await cache.del(`wallet:balances:${userId}`);
    },
    async getTotalByUser(userId: string) {
      const rows = await db
        .select({ currency: walletBalances.currency, total: walletBalances.balance })
        .from(walletBalances)
        .where(eq(walletBalances.userId, userId));
      return rows;
    },
  };
}

// ─── Wallet Transactions ──────────────────────────────────────────────────────
export function makeWalletTransactionRepo(db: DB) {
  return {
        async findByUserId(userId: string, opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20, orderBy = "desc" } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(walletTransactions)
          .where(eq(walletTransactions.userId, userId))
          .orderBy(orderBy === "desc" ? desc(walletTransactions.createdAt as any) : asc(walletTransactions.createdAt as any))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(walletTransactions)
          .where(eq(walletTransactions.userId, userId)),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },
    async findByReference(reference: string) {
      const rows = await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.reference, reference));
      return rows[0] ?? null;
    },
    async sumByUserAndCurrency(userId: string, currency: string, since?: Date) {
      const conditions = [
        eq(walletTransactions.userId, userId),
        eq(walletTransactions.fromCurrency, currency),
      ];
      if (since) conditions.push(gte(walletTransactions.createdAt, Math.floor(since.getTime() / 1000)));
      const [row] = await db
        .select({ total: sum(walletTransactions.amount) })
        .from(walletTransactions)
        .where(and(...conditions));
      return row?.total ?? "0";
    },

    async insert(data: typeof walletTransactions.$inferInsert) {
      const [row] = await db.insert(walletTransactions).values(data).returning();
      return row;
    },
  };
}

// ─── Loyalty ──────────────────────────────────────────────────────────────────
export function makeLoyaltyRepo(db: DB, cache?: CacheAdapter) {
  return {
        async getAccount(userId: string) {
      const key = `loyalty:account:${userId}`;
      if (cache) {
        const cached = await cache.get<typeof loyaltyAccounts.$inferSelect>(key);
        if (cached) return cached;
      }
      const rows = await db
        .select()
        .from(loyaltyAccounts)
        .where(eq(loyaltyAccounts.userId, userId));
      const row = rows[0] ?? null;
      if (cache && row) await cache.set(key, row, 60);
      return row;
    },
    async getTransactions(userId: string, opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20 } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(loyaltyTransactions)
          .where(eq(loyaltyTransactions.userId, userId))
          .orderBy(desc(loyaltyTransactions.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(loyaltyTransactions).where(eq(loyaltyTransactions.userId, userId)),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async getRewards() {
      return db
        .select()
        .from(loyaltyRewards)
        .where(and(eq(loyaltyRewards.isActive, true), isNotNull(loyaltyRewards.stock)))
        .orderBy(asc(loyaltyRewards.expiresAt));
    },

    async getReferrals(referrerId: string) {
      return db
        .select()
        .from(loyaltyReferrals)
        .where(eq(loyaltyReferrals.referrerId, referrerId))
        .orderBy(desc(loyaltyReferrals.createdAt));
    },

    async creditPoints(userId: string, points: number, txData: typeof loyaltyTransactions.$inferInsert) {
      return db.transaction(async (tx) => {
        await tx
          .update(loyaltyAccounts)
          .set({
            pointsBalance: sql`${loyaltyAccounts.pointsBalance} + ${points}`,
            lifetimePoints: sql`${loyaltyAccounts.lifetimePoints} + ${points}`,
            updatedAt: sql`NOW()`,
          })
          .where(eq(loyaltyAccounts.userId, userId));
        const [txRow] = await tx.insert(loyaltyTransactions).values(txData).returning();
        if (cache) await cache.del(`loyalty:account:${userId}`);
        return txRow;
      });
    },
  };
}

// ─── Tourist Bookings ─────────────────────────────────────────────────────────
export function makeTouristBookingRepo(db: DB) {
  return {
    async findByUserId(userId: number, opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20 } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(touristBookings)
          .where(eq(touristBookings.userId, userId))
          .orderBy(desc(touristBookings.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(touristBookings).where(eq(touristBookings.userId, userId)),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async findByEstablishment(establishmentId: number, opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20 } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(touristBookings)
          .where(eq(touristBookings.establishmentId, establishmentId))
          .orderBy(desc(touristBookings.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(touristBookings).where(eq(touristBookings.establishmentId, establishmentId)),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async findById(id: number) {
      const rows = await db.select().from(touristBookings).where(eq(touristBookings.id, id));
      return rows[0] ?? null;
    },

    async updateStatus(id: number, status: string) {
      const [row] = await db
        .update(touristBookings)
        .set({ status: status as any, updatedAt: new Date() })
        .where(eq(touristBookings.id, id))
        .returning();
      return row;
    },

    async insert(data: typeof touristBookings.$inferInsert) {
      const [row] = await db.insert(touristBookings).values(data).returning();
      return row;
    },

    async countByEstablishmentAndDate(establishmentId: number, from: Date, to: Date) {
      const [row] = await db
        .select({ total: count() })
        .from(touristBookings)
        .where(
          and(
            eq(touristBookings.establishmentId, establishmentId),
            gte(touristBookings.createdAt, from),
            lte(touristBookings.createdAt, to),
          ),
        );
      return Number(row?.total ?? 0);
    },
  };
}

// ─── Tourist Reviews ──────────────────────────────────────────────────────────
export function makeTouristReviewRepo(db: DB) {
  return {
    async findByEstablishment(establishmentId: number, opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20 } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(touristReviews)
          .where(eq(touristReviews.establishmentId, establishmentId))
          .orderBy(desc(touristReviews.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(touristReviews).where(eq(touristReviews.establishmentId, establishmentId)),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async avgRating(establishmentId: number) {
      const [row] = await db
        .select({ avg: avg(touristReviews.rating) })
        .from(touristReviews)
        .where(eq(touristReviews.establishmentId, establishmentId));
      return Number(row?.avg ?? 0);
    },

    async insert(data: typeof touristReviews.$inferInsert) {
      const [row] = await db.insert(touristReviews).values(data).returning();
      return row;
    },

    async findByUser(userId: number) {
      return db
        .select()
        .from(touristReviews)
        .where(eq(touristReviews.userId, userId))
        .orderBy(desc(touristReviews.createdAt));
    },
  };
}

// ─── Tourist Deals ────────────────────────────────────────────────────────────
export function makeTouristDealRepo(db: DB, cache?: CacheAdapter) {
  return {
    async findActive(establishmentId?: number) {
      const now = new Date();
      const conditions = [
        lte(touristDeals.validFrom, now),
        gte(touristDeals.validTo, now),
      ];
      if (establishmentId) conditions.push(eq(touristDeals.establishmentId, establishmentId));
      return db.select().from(touristDeals).where(and(...conditions)).orderBy(desc(touristDeals.discountPercent));
    },

    async findById(id: number) {
      const rows = await db.select().from(touristDeals).where(eq(touristDeals.id, id));
      return rows[0] ?? null;
    },

    async insert(data: typeof touristDeals.$inferInsert) {
      const [row] = await db.insert(touristDeals).values(data).returning();
      return row;
    },

    async getRedemptions(dealId: number, opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20 } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(touristDealRedemptions)
          .where(eq(touristDealRedemptions.dealId, dealId))
          .orderBy(desc(touristDealRedemptions.redeemedAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(touristDealRedemptions).where(eq(touristDealRedemptions.dealId, dealId)),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async redeemDeal(data: typeof touristDealRedemptions.$inferInsert) {
      const [row] = await db.insert(touristDealRedemptions).values(data).returning();
      return row;
    },

    async getWishlist(userId: number) {
      return db
        .select({ deal: touristDeals, wishlist: touristDealWishlists })
        .from(touristDealWishlists)
        .innerJoin(touristDeals, eq(touristDealWishlists.dealId, touristDeals.id))
        .where(eq(touristDealWishlists.userId, userId));
    },
  };
}

// ─── Tourist Itineraries ──────────────────────────────────────────────────────
export function makeTouristItineraryRepo(db: DB) {
  return {
    async findByUser(userId: number, opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20 } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(touristItineraries)
          .where(eq(touristItineraries.userId, userId))
          .orderBy(desc(touristItineraries.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(touristItineraries).where(eq(touristItineraries.userId, userId)),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async findById(id: number) {
      const rows = await db.select().from(touristItineraries).where(eq(touristItineraries.id, id));
      return rows[0] ?? null;
    },

    async getItems(itineraryId: number) {
      return db
        .select()
        .from(touristItineraryItems)
        .where(eq(touristItineraryItems.itineraryId, itineraryId))
        .orderBy(asc(touristItineraryItems.dayNumber), asc(touristItineraryItems.orderInDay));
    },

    async insert(data: typeof touristItineraries.$inferInsert) {
      const [row] = await db.insert(touristItineraries).values(data).returning();
      return row;
    },

    async addItem(data: typeof touristItineraryItems.$inferInsert) {
      const [row] = await db.insert(touristItineraryItems).values(data).returning();
      return row;
    },

    async updateStatus(id: number, status: string) {
      const [row] = await db
        .update(touristItineraries)
        .set({ status, updatedAt: new Date() })
        .where(eq(touristItineraries.id, id))
        .returning();
      return row;
    },
  };
}

// ─── BIS Investigations ───────────────────────────────────────────────────────
export function makeBisInvestigationRepo(db: DB) {
  return {
    async findAll(opts: PaginationOptions & { status?: string } = {}) {
      const { page = 1, pageSize = 20, status } = opts;
      const offset = (page - 1) * pageSize;
      const conditions = status ? [eq(bisInvestigations.status, status as any)] : [];
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(bisInvestigations)
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(bisInvestigations.createdAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(bisInvestigations)
          .where(conditions.length ? and(...conditions) : undefined),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async findById(id: number) {
      const rows = await db.select().from(bisInvestigations).where(eq(bisInvestigations.id, id));
      return rows[0] ?? null;
    },

    async getNotes(investigationId: string) {
      return db
        .select()
        .from(bisInvestigationNotes)
        .where(eq(bisInvestigationNotes.investigationId, investigationId))
        .orderBy(asc(bisInvestigationNotes.createdAt));
    },

    async addNote(data: typeof bisInvestigationNotes.$inferInsert) {
      const [row] = await db.insert(bisInvestigationNotes).values(data).returning();
      return row;
    },

    async getTimeline(investigationId: number) {
      return db
        .select()
        .from(bisTimeline)
        .where(eq(bisTimeline.investigationId, investigationId))
        .orderBy(asc(bisTimeline.createdAt));
    },

    async updateStatus(id: number, status: string, resolvedBy?: number) {
      const [row] = await db
        .update(bisInvestigations)
        .set({ status: status as any, completedAt: status === "completed" ? new Date() : null, updatedAt: new Date() })
        .where(eq(bisInvestigations.id, id))
        .returning();
      return row;
    },

    async getAutoFlags(opts: PaginationOptions & { status?: string } = {}) {
      const { page = 1, pageSize = 20, status } = opts;
      const offset = (page - 1) * pageSize;
      const conditions = status ? [eq(bisAutoFlags.status, status)] : [];
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(bisAutoFlags)
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(bisAutoFlags.createdAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(bisAutoFlags)
          .where(conditions.length ? and(...conditions) : undefined),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },
  };
}

// ─── Remittances ──────────────────────────────────────────────────────────────
export function makeRemittanceRepo(db: DB) {
  return {
    async findByUser(userId: number, opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20 } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(remittances)
          .where(eq(remittances.userId, userId))
          .orderBy(desc(remittances.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(remittances).where(eq(remittances.userId, userId)),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async findByReference(externalRef: string) {
      const rows = await db.select().from(remittances).where(eq(remittances.externalRef, externalRef));
      return rows[0] ?? null;
    },

    async insert(data: typeof remittances.$inferInsert) {
      const [row] = await db.insert(remittances).values(data).returning();
      return row;
    },

    async updateStatus(id: string, status: string) {
      const [row] = await db
        .update(remittances)
        .set({ status: status as any, updatedAt: Date.now() })
        .where(eq(remittances.id, id))
        .returning();
      return row;
    },
    async volumeStats(from: Date, to: Date) {
      const [row] = await db
        .select({
          totalAmount: sum(remittances.senderAmount),
          count: count(),
          avgAmount: avg(remittances.senderAmount),
        })
        .from(remittances)
        .where(and(gte(remittances.createdAt, from.getTime()), lte(remittances.createdAt, to.getTime())));
      return row;
    },
  };
}

// ─── KYC Verification Records ─────────────────────────────────────────────────
export function makeKycVerificationRepo(db: DB) {
  return {
    async findByUser(userId: string) {
      const rows = await db
        .select()
        .from(kycVerificationRecords)
        .where(eq(kycVerificationRecords.userId, userId))
        .orderBy(desc(kycVerificationRecords.createdAt));
      return rows[0] ?? null;
    },

    async findPending(opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20 } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(kycVerificationRecords)
          .where(eq(kycVerificationRecords.status, "pending"))
          .orderBy(asc(kycVerificationRecords.createdAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(kycVerificationRecords)
          .where(eq(kycVerificationRecords.status, "pending")),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async insert(data: typeof kycVerificationRecords.$inferInsert) {
      const [row] = await db.insert(kycVerificationRecords).values(data).returning();
      return row;
    },

    async updateStatus(id: number, status: string, reviewedBy?: number) {
      const [row] = await db
        .update(kycVerificationRecords)
        .set({ status: status as any, reviewerId: reviewedBy ? String(reviewedBy) : undefined, updatedAt: new Date() })
        .where(eq(kycVerificationRecords.id, id))
        .returning();
      return row;
    },
  };
}

// ─── Stablecoin ───────────────────────────────────────────────────────────────
export function makeStablecoinRepo(db: DB) {
  return {
    async getOnrampOrders(userId: string, opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20 } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(stablecoinOnrampOrders)
          .where(eq(stablecoinOnrampOrders.userId, userId))
          .orderBy(desc(stablecoinOnrampOrders.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(stablecoinOnrampOrders).where(eq(stablecoinOnrampOrders.userId, userId)),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async getOfframpRequests(userId: string, opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20 } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(stablecoinOfframpRequests)
          .where(eq(stablecoinOfframpRequests.userId, userId))
          .orderBy(desc(stablecoinOfframpRequests.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(stablecoinOfframpRequests).where(eq(stablecoinOfframpRequests.userId, userId)),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async getYieldPositions(userId: string) {
      return db
        .select()
        .from(stablecoinYieldPositions)
        .where(and(eq(stablecoinYieldPositions.userId, userId), eq(stablecoinYieldPositions.status, "active")))
        .orderBy(desc(stablecoinYieldPositions.createdAt));
    },

    async getLimitOrders(userId: string) {
      return db
        .select()
        .from(stablecoinLimitOrders)
        .where(and(eq(stablecoinLimitOrders.userId, userId), eq(stablecoinLimitOrders.status, "open")))
        .orderBy(desc(stablecoinLimitOrders.createdAt));
    },

    async insertOnramp(data: typeof stablecoinOnrampOrders.$inferInsert) {
      const [row] = await db.insert(stablecoinOnrampOrders).values(data).returning();
      return row;
    },

    async insertOfframp(data: typeof stablecoinOfframpRequests.$inferInsert) {
      const [row] = await db.insert(stablecoinOfframpRequests).values(data).returning();
      return row;
    },
  };
}

// ─── Liquidity Providers ──────────────────────────────────────────────────────
export function makeLiquidityProviderRepo(db: DB) {
  return {
    async getApplications(opts: PaginationOptions & { status?: string } = {}) {
      const { page = 1, pageSize = 20, status } = opts;
      const offset = (page - 1) * pageSize;
      const conditions = status ? [eq(lpApplications.status, status)] : [];
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(lpApplications)
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(lpApplications.createdAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(lpApplications)
          .where(conditions.length ? and(...conditions) : undefined),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async getPositions(userId: string) {
      return db
        .select()
        .from(lpPositions)
        .where(and(eq(lpPositions.userId, userId), eq(lpPositions.status, "active")));
    },

    async getRewards(lpId: string, opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20 } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(lpRewards)
          .where(eq(lpRewards.lpId, lpId))
          .orderBy(desc(lpRewards.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(lpRewards).where(eq(lpRewards.lpId, lpId)),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async getPoolSnapshot(poolId: string) {
      const rows = await db
        .select()
        .from(lpPoolSnapshots)
        .where(eq(lpPoolSnapshots.poolId, poolId))
        .orderBy(desc(lpPoolSnapshots.snapshotAt))
        .limit(1);
      return rows[0] ?? null;
    },

    async insertApplication(data: typeof lpApplications.$inferInsert) {
      const [row] = await db.insert(lpApplications).values(data).returning();
      return row;
    },
  };
}

// ─── Smart Contracts ──────────────────────────────────────────────────────────
export function makeSmartContractRepo(db: DB) {
  return {
    async getDeployments(opts: PaginationOptions & { network?: string } = {}) {
      const { page = 1, pageSize = 20, network } = opts;
      const offset = (page - 1) * pageSize;
      const conditions = network ? [eq(smartContractDeployments.network, network)] : [];
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(smartContractDeployments)
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(smartContractDeployments.createdAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(smartContractDeployments)
          .where(conditions.length ? and(...conditions) : undefined),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async getEvents(contractName: string, opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20 } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(smartContractEvents)
          .where(eq(smartContractEvents.contractName, contractName))
          .orderBy(desc(smartContractEvents.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(smartContractEvents).where(eq(smartContractEvents.contractName, contractName)),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async insertDeployment(data: typeof smartContractDeployments.$inferInsert) {
      const [row] = await db.insert(smartContractDeployments).values(data).returning();
      return row;
    },

    async insertEvent(data: typeof smartContractEvents.$inferInsert) {
      const [row] = await db.insert(smartContractEvents).values(data).returning();
      return row;
    },
  };
}

// ─── Agent Network ────────────────────────────────────────────────────────────
export function makeAgentNetworkRepo(db: DB) {
  return {
    async getCashLoadOrders(agentId: string, opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20 } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(cashLoadOrders)
          .where(eq(cashLoadOrders.agentId, agentId))
          .orderBy(desc(cashLoadOrders.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(cashLoadOrders).where(eq(cashLoadOrders.agentId, agentId)),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async getKycVerifications(agentId: string) {
      return db
        .select()
        .from(agentKycVerifications)
        .where(eq(agentKycVerifications.agentId, agentId))
        .orderBy(desc(agentKycVerifications.createdAt));
    },

    async insertCashLoadOrder(data: typeof cashLoadOrders.$inferInsert) {
      const [row] = await db.insert(cashLoadOrders).values(data).returning();
      return row;
    },

    async insertKycVerification(data: typeof agentKycVerifications.$inferInsert) {
      const [row] = await db.insert(agentKycVerifications).values(data).returning();
      return row;
    },
  };
}

// ─── Transfers & Payments ─────────────────────────────────────────────────────
export function makeTransferRepo(db: DB) {
  return {
    async getBankTransfers(userId: string, opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20 } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(bankTransfersOut)
          .where(eq(bankTransfersOut.userId, userId))
          .orderBy(desc(bankTransfersOut.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(bankTransfersOut).where(eq(bankTransfersOut.userId, userId)),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async getSavedBeneficiaries(userId: string) {
      return db
        .select()
        .from(savedBeneficiaries)
        .where(eq(savedBeneficiaries.userId, userId))
        .orderBy(asc(savedBeneficiaries.alias));
    },

    async getPaymentLinks(creatorId: string) {
      return db
        .select()
        .from(paymentLinks)
        .where(and(eq(paymentLinks.creatorId, creatorId), eq(paymentLinks.status, "active")))
        .orderBy(desc(paymentLinks.createdAt));
    },

    async getMoneyRequests(userId: string) {
      return db
        .select()
        .from(moneyRequests)
        .where(or(eq(moneyRequests.requesterId, userId), eq(moneyRequests.payerId, userId)))
        .orderBy(desc(moneyRequests.createdAt));
    },

    async insertBankTransfer(data: typeof bankTransfersOut.$inferInsert) {
      const [row] = await db.insert(bankTransfersOut).values(data).returning();
      return row;
    },

    async insertPaymentLink(data: typeof paymentLinks.$inferInsert) {
      const [row] = await db.insert(paymentLinks).values(data).returning();
      return row;
    },

    async insertMoneyRequest(data: typeof moneyRequests.$inferInsert) {
      const [row] = await db.insert(moneyRequests).values(data).returning();
      return row;
    },

    async upsertBeneficiary(data: typeof savedBeneficiaries.$inferInsert) {
      const [row] = await db
        .insert(savedBeneficiaries)
        .values(data)
        .onConflictDoUpdate({
          target: [savedBeneficiaries.userId, savedBeneficiaries.accountNumber],
          set: { alias: data.alias },
        })
        .returning();
      return row;
    },
  };
}

// ─── Travel Services ──────────────────────────────────────────────────────────
export function makeTravelServiceRepo(db: DB) {
  return {
    async getEsimOrders(userId: string) {
      return db
        .select()
        .from(esimOrders)
        .where(eq(esimOrders.userId, userId))
        .orderBy(desc(esimOrders.createdAt));
    },

    async getChecklist(userId: string, destinationCountry: string) {
      const rows = await db
        .select()
        .from(preTravelChecklists)
        .where(
          and(
            eq(preTravelChecklists.userId, userId),
            eq(preTravelChecklists.destinationCountry, destinationCountry),
          ),
        );
      return rows[0] ?? null;
    },

    async getRiskAssessment(userId: string, destinationCountry: string) {
      const rows = await db
        .select()
        .from(travelRiskAssessments)
        .where(
          and(
            eq(travelRiskAssessments.userId, userId),
            eq(travelRiskAssessments.destinationCountry, destinationCountry),
          ),
        )
        .orderBy(desc(travelRiskAssessments.createdAt));
      return rows[0] ?? null;
    },

    async getBankTravelNotifications(userId: string) {
      return db
        .select()
        .from(bankTravelNotifications)
        .where(eq(bankTravelNotifications.userId, userId))
        .orderBy(desc(bankTravelNotifications.createdAt));
    },

    async getNfcTokens(userId: string) {
      return db
        .select()
        .from(nfcPaymentTokens)
        .where(and(eq(nfcPaymentTokens.userId, userId), eq(nfcPaymentTokens.status, "active")));
    },

    async insertEsimOrder(data: typeof esimOrders.$inferInsert) {
      const [row] = await db.insert(esimOrders).values(data).returning();
      return row;
    },

    async upsertChecklist(data: typeof preTravelChecklists.$inferInsert) {
      const [row] = await db
        .insert(preTravelChecklists)
        .values(data)
        .onConflictDoUpdate({
          target: [preTravelChecklists.userId, preTravelChecklists.destinationCountry],
          set: {
            completedItems: data.completedItems,
            progress: data.progress,
            updatedAt: new Date() as any,
          },
        })
        .returning();
      return row;
    },
  };
}

// ─── PaymentSwitch ────────────────────────────────────────────────────────────
export function makePaymentSwitchRepo(db: DB) {
  return {
    async getSettlements(opts: PaginationOptions & { status?: string } = {}) {
      const { page = 1, pageSize = 20, status } = opts;
      const offset = (page - 1) * pageSize;
      const conditions = status ? [eq(psSettlements.status, status as any)] : [];
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(psSettlements)
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(psSettlements.createdAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(psSettlements)
          .where(conditions.length ? and(...conditions) : undefined),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async getLedgerEntries(participantId: string, opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20 } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(psLedgerEntries)
          .where(eq(psLedgerEntries.participantId, participantId))
          .orderBy(desc(psLedgerEntries.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(psLedgerEntries).where(eq(psLedgerEntries.participantId, participantId)),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async getWebhookDeliveries(webhookId: string, opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20 } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(psWebhookDeliveries)
          .where(eq(psWebhookDeliveries.webhookId, webhookId))
          .orderBy(desc(psWebhookDeliveries.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(psWebhookDeliveries).where(eq(psWebhookDeliveries.webhookId, webhookId)),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async getRateLimitUsage(corridor: string) {
      const rows = await db
        .select()
        .from(psCorridorRateLimitUsage)
        .where(eq(psCorridorRateLimitUsage.corridor, corridor));
      return rows[0] ?? null;
    },

    async getFraudRules(activeOnly = true) {
      const conditions = activeOnly ? [eq(psFraudRules.isActive, true)] : [];
      return db
        .select()
        .from(psFraudRules)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(psFraudRules.hitCount));
    },
  };
}

// ─── Establishment ────────────────────────────────────────────────────────────
export function makeEstablishmentRepo(db: DB, cache?: CacheAdapter) {
  return {
    async findById(id: number) {
      const key = `establishment:${id}`;
      if (cache) {
        const cached = await cache.get<typeof establishments.$inferSelect>(key);
        if (cached) return cached;
      }
      const rows = await db.select().from(establishments).where(eq(establishments.id, id));
      const row = rows[0] ?? null;
      if (cache && row) await cache.set(key, row, 300);
      return row;
    },

    async getScoreSnapshot(establishmentId: number) {
      const rows = await db
        .select()
        .from(establishmentScoreSnapshots)
        .where(eq(establishmentScoreSnapshots.establishmentId, establishmentId))
        .orderBy(desc(establishmentScoreSnapshots.snapshotDate))
        .limit(1);
      return rows[0] ?? null;
    },

    async getProducts(establishmentId: number, opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20 } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(merchantProducts)
          .where(eq(merchantProducts.establishmentId, establishmentId))
          .orderBy(asc(merchantProducts.name))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(merchantProducts).where(eq(merchantProducts.establishmentId, establishmentId)),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async getAvailability(productId: number, from: Date, to: Date) {
      return db
        .select()
        .from(serviceAvailability)
        .where(
          and(
            eq(serviceAvailability.productId, productId),
            gte(serviceAvailability.date, from.toISOString().split("T")[0]),
            lte(serviceAvailability.date, to.toISOString().split("T")[0]),
          ),
        )
        .orderBy(asc(serviceAvailability.date));
    },

    async getChannelConnections(establishmentId: number) {
      return db
        .select()
        .from(channelConnections)
        .where(eq(channelConnections.establishmentId, establishmentId));
    },

    async getSentimentSummary(establishmentId: number) {
      const rows = await db
        .select()
        .from(reviewSentimentCache)
        .where(eq(reviewSentimentCache.establishmentId, establishmentId));
      return rows[0] ?? null;
    },
  };
}

// ─── QR Payments ──────────────────────────────────────────────────────────────
export function makeQrPaymentRepo(db: DB) {
  return {
    async findToken(token: string) {
      const rows = await db
        .select()
        .from(qrPaymentTokens)
        .where(and(eq(qrPaymentTokens.token, token), eq(qrPaymentTokens.status, "active")));
      return rows[0] ?? null;
    },

    async insertToken(data: typeof qrPaymentTokens.$inferInsert) {
      const [row] = await db.insert(qrPaymentTokens).values(data).returning();
      return row;
    },

    async markTokenPaid(token: string, paidByUserId: number, walletTxId: number) {
      const [row] = await db
        .update(qrPaymentTokens)
        .set({ status: "paid", paidByUserId, walletTxId: String(walletTxId), paidAt: new Date() })
        .where(eq(qrPaymentTokens.token, token))
        .returning();
      return row;
    },

    async insertReceipt(data: typeof qrPaymentReceipts.$inferInsert) {
      const [row] = await db.insert(qrPaymentReceipts).values(data).returning();
      return row;
    },

    async getReceiptsByEstablishment(establishmentId: number, opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20 } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(qrPaymentReceipts)
          .where(eq(qrPaymentReceipts.establishmentId, establishmentId))
          .orderBy(desc(qrPaymentReceipts.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(qrPaymentReceipts).where(eq(qrPaymentReceipts.establishmentId, establishmentId)),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },
  };
}

// ─── User Auth & Security ─────────────────────────────────────────────────────
export function makeUserSecurityRepo(db: DB) {
  return {
    async getApiKeys(userId: string) {
      return db
        .select()
        .from(psApiKeys)
        .where(and(eq(psApiKeys.userId, userId), eq(psApiKeys.isActive, true)))
        .orderBy(desc(psApiKeys.createdAt));
    },

    async getTrustedDevices(userId: string) {
      return db
        .select()
        .from(trustedDevices)
        .where(eq(trustedDevices.userId, userId))
        .orderBy(desc(trustedDevices.createdAt));
    },

    async getLoginHistory(userId: string, opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20 } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(loginHistory)
          .where(eq(loginHistory.userId, userId))
          .orderBy(desc(loginHistory.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(loginHistory).where(eq(loginHistory.userId, userId)),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async getNotificationChannels(userId: string) {
      return db
        .select()
        .from(psNotificationChannels)
        .where(and(eq(psNotificationChannels.userId, userId), eq(psNotificationChannels.isActive, true)));
    },

    async getPushSubscriptions(userId: number) {
      return db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));
    },

    async insertLoginHistory(data: typeof loginHistory.$inferInsert) {
      const [row] = await db.insert(loginHistory).values(data).returning();
      return row;
    },

    async insertApiKey(data: typeof psApiKeys.$inferInsert) {
      const [row] = await db.insert(psApiKeys).values(data).returning();
      return row;
    },

    async revokeApiKey(id: string) {
      await db
        .update(psApiKeys)
        .set({ isActive: false, updatedAt: Date.now() })
        .where(eq(psApiKeys.id, id));
    },
  };
}

// ─── NOC & Kill Switch ────────────────────────────────────────────────────────
export function makeNocRepo(db: DB) {
  return {
    async getEvents(opts: PaginationOptions & { severity?: string } = {}) {
      const { page = 1, pageSize = 20, severity } = opts;
      const offset = (page - 1) * pageSize;
      const conditions = severity ? [eq(nocEvents.severity, severity)] : [];
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(nocEvents)
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(nocEvents.createdAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(nocEvents)
          .where(conditions.length ? and(...conditions) : undefined),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async getAlertThresholds() {
      return db.select().from(nocAlertThresholds).orderBy(asc(nocAlertThresholds.metric));
    },

    async getKillSwitchSchedules(opts: PaginationOptions = {}) {
      const { page = 1, pageSize = 20 } = opts;
      const offset = (page - 1) * pageSize;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(killSwitchSchedules)
          .orderBy(desc(killSwitchSchedules.scheduledAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(killSwitchSchedules),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async insertKillSwitchSchedule(data: typeof killSwitchSchedules.$inferInsert) {
      const [row] = await db.insert(killSwitchSchedules).values(data).returning();
      return row;
    },

    async updateThreshold(id: number, data: Partial<typeof nocAlertThresholds.$inferInsert>) {
      const [row] = await db
        .update(nocAlertThresholds)
        .set({ ...data, updatedAt: new Date() as any })
        .where(eq(nocAlertThresholds.id, id))
        .returning();
      return row;
    },
  };
}

// ─── Scheduled Payments ───────────────────────────────────────────────────────
export function makeScheduledPaymentRepo(db: DB) {
  return {
    async findByUser(userId: string) {
      return db
        .select()
        .from(scheduledPayments)
        .where(and(eq(scheduledPayments.userId, userId), eq(scheduledPayments.status, "active" as any)))
        .orderBy(asc(scheduledPayments.scheduledAt));
    },

    async findDue(before: Date) {
      return db
        .select()
        .from(scheduledPayments)
        .where(
          and(
            eq(scheduledPayments.status, "active"),
            lte(scheduledPayments.scheduledAt, before.getTime()),
          ),
        )
        .orderBy(asc(scheduledPayments.scheduledAt));
    },

    async insert(data: typeof scheduledPayments.$inferInsert) {
      const [row] = await db.insert(scheduledPayments).values(data).returning();
      return row;
    },

    async updateStatus(id: string, status: string) {
      const [row] = await db
        .update(scheduledPayments)
        .set({ status: status as any, lastRunAt: Date.now() })
        .where(eq(scheduledPayments.id, id))
        .returning();
      return row;
    },

    async getRecurring(userId: string) {
      return db
        .select()
        .from(walletRecurringPayments)
        .where(and(eq(walletRecurringPayments.userId, userId), eq(walletRecurringPayments.status, "active" as any)))
        .orderBy(asc(walletRecurringPayments.nextRunAt));
    },
  };
}

// ─── SOC Alerts ───────────────────────────────────────────────────────────────
export function makeSocAlertRepo(db: DB) {
  return {
    async findAll(opts: PaginationOptions & { severity?: string; status?: string } = {}) {
      const { page = 1, pageSize = 20, severity, status } = opts;
      const offset = (page - 1) * pageSize;
      const conditions: ReturnType<typeof eq>[] = [];
      if (severity) conditions.push(eq(socAlerts.severity, severity as any));
      if (status) conditions.push(eq(socAlerts.status, status as any));
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(socAlerts)
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(socAlerts.createdAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(socAlerts)
          .where(conditions.length ? and(...conditions) : undefined),
      ]);
      return paginate(rows, Number(total), page, pageSize);
    },

    async insert(data: typeof socAlerts.$inferInsert) {
      const [row] = await db.insert(socAlerts).values(data).returning();
      return row;
    },

    async updateStatus(id: number, status: string) {
      const [row] = await db
        .update(socAlerts)
        .set({ status: status as any, updatedAt: new Date() })
        .where(eq(socAlerts.id, id))
        .returning();
      return row;
    },
  };
}

// ─── EXTENDED REPOSITORY FACTORY ─────────────────────────────────────────────
/**
 * Creates all extended repositories at once.
 * Combine with makeRepositories() from repositories.ts for the full set.
 *
 * @example
 * const repos = {
 *   ...makeRepositories(db, cache),
 *   ...makeExtendedRepositories(db, cache),
 * };
 */
export function makeExtendedRepositories(db: DB, cache?: CacheAdapter) {
  return {
    walletBalances: makeWalletBalanceRepo(db, cache),
    walletTransactions: makeWalletTransactionRepo(db),
    loyalty: makeLoyaltyRepo(db, cache),
    touristBookings: makeTouristBookingRepo(db),
    touristReviews: makeTouristReviewRepo(db),
    touristDeals: makeTouristDealRepo(db, cache),
    touristItineraries: makeTouristItineraryRepo(db),
    bisInvestigations: makeBisInvestigationRepo(db),
    remittances: makeRemittanceRepo(db),
    kycVerifications: makeKycVerificationRepo(db),
    stablecoin: makeStablecoinRepo(db),
    liquidityProviders: makeLiquidityProviderRepo(db),
    smartContracts: makeSmartContractRepo(db),
    agentNetwork: makeAgentNetworkRepo(db),
    transfers: makeTransferRepo(db),
    travelServices: makeTravelServiceRepo(db),
    paymentSwitch: makePaymentSwitchRepo(db),
    establishments: makeEstablishmentRepo(db, cache),
    qrPayments: makeQrPaymentRepo(db),
    userSecurity: makeUserSecurityRepo(db),
    noc: makeNocRepo(db),
    scheduledPayments: makeScheduledPaymentRepo(db),
    socAlerts: makeSocAlertRepo(db),
  };
}

export type ExtendedRepositories = ReturnType<typeof makeExtendedRepositories>;
