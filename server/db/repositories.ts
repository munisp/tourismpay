/**
 * server/db/repositories.ts
 *
 * Typed repository layer for TourismPay.
 *
 * Replaces scattered raw `sql` template literals with composable, type-safe
 * Drizzle query builders. Each repository:
 *   - Accepts a `db` instance (enabling transaction-scoped usage)
 *   - Returns fully-typed results via `$inferSelect` / `$inferInsert`
 *   - Uses `with` CTEs for complex aggregations instead of raw SQL
 *   - Supports Redis caching via an optional `cache` parameter
 *
 * Usage:
 *   import { makeUserRepo } from "@/db/repositories";
 *   const userRepo = makeUserRepo(db);
 *   const user = await userRepo.findByOpenId("sub_abc123");
 */

import { eq, and, or, desc, asc, gte, lte, lt, gt, isNull, isNotNull, inArray, notInArray, like, ilike, count, sum, avg, max, min, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../../drizzle/schema";
import {
  users,
  kybApplications,
  kybDocuments,
  bisInvestigations,
  fraudAlerts,
  auditLogs,
  userNotifications,
  enairaWallets,
  enairaTransactions,
  loyaltyAccounts,
  loyaltyTransactions,
  virtualCards,
  virtualCardTransactions,
  tripPlannerSessions,
  tripPlannerMessages,
  tripPlannerRecommendations,
  taxCollections,
  taxRemittanceTracker,
  tipTransactions,
  tipDistributionLog,
  temporalWorkflowExecutions,
  fluvioConsumerOffsets,
  lakehouseEtlRuns,
  openappsecWafEvents,
  keycloakSessionTokens,
  User,
  InsertUser,
} from "../../drizzle/schema";
import type {
  EnairaWallet,
  InsertEnairaWallet,
  EnairaTransaction,
  InsertEnairaTransaction,
  TripPlannerSession,
  InsertTripPlannerSession,
  TripPlannerMessage,
  InsertTripPlannerMessage,
  TaxCollection,
  InsertTaxCollection,
  TipTransaction,
  InsertTipTransaction,
  TemporalWorkflowExecution,
  InsertTemporalWorkflowExecution,
  FluvioConsumerOffset,
  InsertFluvioConsumerOffset,
  LakehouseEtlRun,
  InsertLakehouseEtlRun,
} from "../../drizzle/schema-improvements";

type DB = PostgresJsDatabase<typeof schema>;

// ─── Optional Redis cache interface ──────────────────────────────────────────
interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  delPattern(pattern: string): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// USER REPOSITORY
// ─────────────────────────────────────────────────────────────────────────────

export function makeUserRepo(db: DB, cache?: CacheAdapter) {
  return {
    async findById(id: number): Promise<User | undefined> {
      const cacheKey = `user:id:${id}`;
      if (cache) {
        const cached = await cache.get<User>(cacheKey);
        if (cached) return cached;
      }
      const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (cache && user) await cache.set(cacheKey, user, 300);
      return user;
    },

    async findByOpenId(openId: string): Promise<User | undefined> {
      const cacheKey = `user:openid:${openId}`;
      if (cache) {
        const cached = await cache.get<User>(cacheKey);
        if (cached) return cached;
      }
      const [user] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
      if (cache && user) await cache.set(cacheKey, user, 300);
      return user;
    },

    async findByEmail(email: string): Promise<User | undefined> {
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return user;
    },

    async upsert(data: InsertUser): Promise<User> {
      const [user] = await db
        .insert(users)
        .values(data)
        .onConflictDoUpdate({
          target: users.openId,
          set: {
            name: data.name,
            email: data.email,
            lastSignedIn: sql`NOW()`,
            loginCount: sql`${users.loginCount} + 1`,
            updatedAt: sql`NOW()`,
          },
        })
        .returning();
      if (cache) {
        await cache.del(`user:openid:${data.openId}`);
        await cache.del(`user:id:${user.id}`);
      }
      return user;
    },

    async updateRole(userId: number, role: User["role"]): Promise<void> {
      await db.update(users).set({ role, updatedAt: sql`NOW()` }).where(eq(users.id, userId));
      if (cache) await cache.del(`user:id:${userId}`);
    },

    async countByRole(): Promise<Array<{ role: string; count: number }>> {
      return db
        .select({ role: users.role, count: count() })
        .from(users)
        .groupBy(users.role);
    },

    async findRecentlyActive(hours: number = 24, limit: number = 100): Promise<User[]> {
      return db
        .select()
        .from(users)
        .where(gte(users.lastSignedIn, sql`NOW() - INTERVAL '${sql.raw(String(hours))} hours'`))
        .orderBy(desc(users.lastSignedIn))
        .limit(limit);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENAIRA WALLET REPOSITORY
// ─────────────────────────────────────────────────────────────────────────────

export function makeEnairaWalletRepo(db: DB, cache?: CacheAdapter) {
  return {
    async findByUserId(userId: string): Promise<EnairaWallet[]> {
      const cacheKey = `enaira:wallets:user:${userId}`;
      if (cache) {
        const cached = await cache.get<EnairaWallet[]>(cacheKey);
        if (cached) return cached;
      }
      const wallets = await db
        .select()
        .from(enairaWallets)
        .where(and(eq(enairaWallets.userId, userId), eq(enairaWallets.status, "active")))
        .orderBy(desc(enairaWallets.createdAt));
      if (cache) await cache.set(cacheKey, wallets, 60);
      return wallets;
    },

    async findByAddress(address: string): Promise<EnairaWallet | undefined> {
      const [wallet] = await db
        .select()
        .from(enairaWallets)
        .where(eq(enairaWallets.walletAddress, address))
        .limit(1);
      return wallet;
    },

    async findByCbnWalletId(cbnWalletId: string): Promise<EnairaWallet | undefined> {
      const [wallet] = await db
        .select()
        .from(enairaWallets)
        .where(eq(enairaWallets.cbnWalletId, cbnWalletId))
        .limit(1);
      return wallet;
    },

    async create(data: InsertEnairaWallet): Promise<EnairaWallet> {
      const [wallet] = await db.insert(enairaWallets).values(data).returning();
      if (cache) await cache.del(`enaira:wallets:user:${data.userId}`);
      return wallet;
    },

    async updateBalance(walletId: string, newBalanceKobo: number): Promise<void> {
      await db
        .update(enairaWallets)
        .set({ balanceKobo: newBalanceKobo, lastSyncAt: sql`NOW()`, updatedAt: sql`NOW()` })
        .where(eq(enairaWallets.id, walletId));
    },

    async updateStatus(walletId: string, status: EnairaWallet["status"]): Promise<void> {
      await db
        .update(enairaWallets)
        .set({ status, updatedAt: sql`NOW()` })
        .where(eq(enairaWallets.id, walletId));
    },

    async getTotalBalanceByStatus(): Promise<Array<{ status: string; totalKobo: string | null; walletCount: number }>> {
      return db
        .select({
          status: enairaWallets.status,
          totalKobo: sum(enairaWallets.balanceKobo),
          walletCount: count(),
        })
        .from(enairaWallets)
        .groupBy(enairaWallets.status);
    },

    async getWalletsByKycTier(tier: number): Promise<EnairaWallet[]> {
      return db
        .select()
        .from(enairaWallets)
        .where(and(eq(enairaWallets.kycTier, tier), eq(enairaWallets.status, "active")));
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENAIRA TRANSACTION REPOSITORY
// ─────────────────────────────────────────────────────────────────────────────

export function makeEnairaTransactionRepo(db: DB) {
  return {
    async findByWalletId(
      walletId: string,
      opts: { limit?: number; offset?: number; fromDate?: Date; toDate?: Date } = {}
    ): Promise<EnairaTransaction[]> {
      const conditions = [eq(enairaTransactions.enairaWalletId, walletId)];
      if (opts.fromDate) conditions.push(gte(enairaTransactions.createdAt, opts.fromDate));
      if (opts.toDate) conditions.push(lte(enairaTransactions.createdAt, opts.toDate));
      return db
        .select()
        .from(enairaTransactions)
        .where(and(...conditions))
        .orderBy(desc(enairaTransactions.createdAt))
        .limit(opts.limit ?? 50)
        .offset(opts.offset ?? 0);
    },

    async findByCbnRef(cbnRef: string): Promise<EnairaTransaction | undefined> {
      const [tx] = await db
        .select()
        .from(enairaTransactions)
        .where(eq(enairaTransactions.cbnTransactionRef, cbnRef))
        .limit(1);
      return tx;
    },

    async create(data: InsertEnairaTransaction): Promise<EnairaTransaction> {
      const [tx] = await db.insert(enairaTransactions).values(data).returning();
      return tx;
    },

    async updateStatus(txId: string, status: string): Promise<void> {
      await db
        .update(enairaTransactions)
        .set({ status, updatedAt: sql`NOW()` })
        .where(eq(enairaTransactions.id, txId));
    },

    async getDailyVolumeByType(
      walletId: string,
      date: Date
    ): Promise<Array<{ transactionType: string; totalKobo: string | null; txCount: number }>> {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      return db
        .select({
          transactionType: enairaTransactions.transactionType,
          totalKobo: sum(enairaTransactions.amountKobo),
          txCount: count(),
        })
        .from(enairaTransactions)
        .where(
          and(
            eq(enairaTransactions.enairaWalletId, walletId),
            gte(enairaTransactions.createdAt, startOfDay),
            lte(enairaTransactions.createdAt, endOfDay)
          )
        )
        .groupBy(enairaTransactions.transactionType);
    },

    async getPlatformStats(fromDate: Date): Promise<{
      totalTransactions: number;
      totalVolumeKobo: string;
      avgAmountKobo: string;
    }> {
      const [stats] = await db
        .select({
          totalTransactions: count(),
          totalVolumeKobo: sum(enairaTransactions.amountKobo),
          avgAmountKobo: avg(enairaTransactions.amountKobo),
        })
        .from(enairaTransactions)
        .where(gte(enairaTransactions.createdAt, fromDate));
      return stats as any;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TRIP PLANNER REPOSITORY
// ─────────────────────────────────────────────────────────────────────────────

export function makeTripPlannerRepo(db: DB, cache?: CacheAdapter) {
  return {
    async findSessionsByUser(userId: number, limit = 20): Promise<TripPlannerSession[]> {
      return db
        .select()
        .from(tripPlannerSessions)
        .where(eq(tripPlannerSessions.userId, userId as any))
        .orderBy(desc(tripPlannerSessions.updatedAt))
        .limit(limit);
    },

    async findSessionById(sessionId: string): Promise<TripPlannerSession | undefined> {
      const cacheKey = `trip:session:${sessionId}`;
      if (cache) {
        const cached = await cache.get<TripPlannerSession>(cacheKey);
        if (cached) return cached;
      }
      const [session] = await db
        .select()
        .from(tripPlannerSessions)
        .where(eq(tripPlannerSessions.id, sessionId))
        .limit(1);
      if (cache && session) await cache.set(cacheKey, session, 120);
      return session;
    },

    async createSession(data: InsertTripPlannerSession): Promise<TripPlannerSession> {
      const [session] = await db.insert(tripPlannerSessions).values(data).returning();
      return session;
    },

    async addMessage(data: InsertTripPlannerMessage): Promise<TripPlannerMessage> {
      const [msg] = await db.insert(tripPlannerMessages).values(data).returning();
      // Update session's updatedAt
      await db
        .update(tripPlannerSessions)
        .set({ updatedAt: sql`NOW()` })
        .where(eq(tripPlannerSessions.id, data.sessionId));
      if (cache) await cache.del(`trip:session:${data.sessionId}`);
      return msg;
    },

    async getConversationHistory(sessionId: string, limit = 50): Promise<TripPlannerMessage[]> {
      return db
        .select()
        .from(tripPlannerMessages)
        .where(eq(tripPlannerMessages.sessionId, sessionId))
        .orderBy(asc(tripPlannerMessages.createdAt))
        .limit(limit);
    },

    async getRecommendations(sessionId: string): Promise<typeof tripPlannerRecommendations.$inferSelect[]> {
      return db
        .select()
        .from(tripPlannerRecommendations)
        .where(eq(tripPlannerRecommendations.sessionId, sessionId))
        .orderBy(desc(tripPlannerRecommendations.score));
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TAX COLLECTION REPOSITORY
// ─────────────────────────────────────────────────────────────────────────────

export function makeTaxCollectionRepo(db: DB) {
  return {
    async findByUser(
      userId: number,
      opts: { status?: string; limit?: number; offset?: number } = {}
    ): Promise<TaxCollection[]> {
      const conditions = [eq(taxCollections.merchantId, userId as any)];
      if (opts.status) conditions.push(eq(taxCollections.status, opts.status as any));
      return db
        .select()
        .from(taxCollections)
        .where(and(...conditions))
        .orderBy(desc(taxCollections.createdAt))
        .limit(opts.limit ?? 50)
        .offset(opts.offset ?? 0);
    },

    async create(data: InsertTaxCollection): Promise<TaxCollection> {
      const [tc] = await db.insert(taxCollections).values(data).returning();
      return tc;
    },

    async updateStatus(id: string, status: string): Promise<void> {
      await db
        .update(taxCollections)
        .set({ status })
        .where(eq(taxCollections.id, id));
    },

    async getPendingRemittances(limit = 100): Promise<typeof taxRemittanceTracker.$inferSelect[]> {
      return db
        .select()
        .from(taxRemittanceTracker)
        .where(eq(taxRemittanceTracker.status, "pending"))
        .orderBy(asc(taxRemittanceTracker.remittedAt))
        .limit(limit);
    },

    async getRevenueByTaxType(fromDate: Date, toDate: Date): Promise<Array<{
      taxType: string;
      totalCollectedKobo: string;
      totalRemittedKobo: string;
      count: number;
    }>> {
      return db
        .select({
          taxType: taxCollections.taxType,
          totalCollectedKobo: sum(taxCollections.amount),
          count: count(),
        })
        .from(taxCollections)
        .where(
          and(
            gte(taxCollections.createdAt, fromDate),
            lte(taxCollections.createdAt, toDate),
            eq(taxCollections.status, "collected")
          )
        )
        .groupBy(taxCollections.taxType) as any;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TIP TRANSACTION REPOSITORY
// ─────────────────────────────────────────────────────────────────────────────

export function makeTipTransactionRepo(db: DB) {
  return {
    async findByRecipient(
      recipientId: number,
      opts: { limit?: number; offset?: number; fromDate?: Date } = {}
    ): Promise<TipTransaction[]> {
      const conditions = [eq(tipTransactions.recipientId, String(recipientId))];
      if (opts.fromDate) conditions.push(gte(tipTransactions.createdAt, opts.fromDate));
      return db
        .select()
        .from(tipTransactions)
        .where(and(...conditions))
        .orderBy(desc(tipTransactions.createdAt))
        .limit(opts.limit ?? 50)
        .offset(opts.offset ?? 0);
    },

    async create(data: InsertTipTransaction): Promise<TipTransaction> {
      const [tip] = await db.insert(tipTransactions).values(data as any).returning();
      return tip;
    },

    async getEarningsSummary(recipientId: number, days = 30): Promise<{
      totalKobo: string;
      tipCount: number;
      avgKobo: string;
    }> {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      const [summary] = await db
        .select({
          totalKobo: sum(tipTransactions.tipAmount),
          tipCount: count(),
          avgKobo: avg(tipTransactions.tipAmount),
        })
        .from(tipTransactions)
        .where(
          and(
            eq(tipTransactions.recipientId, String(recipientId)),
            gte(tipTransactions.createdAt, fromDate),
            eq(tipTransactions.status, "distributed")
          )
        );
      return summary as any;
    },

    async getTopRecipients(limit = 10, days = 7): Promise<Array<{
      recipientId: number;
      totalKobo: string;
      tipCount: number;
    }>> {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      return db
        .select({
          recipientId: tipTransactions.recipientId,
          totalKobo: sum(tipTransactions.tipAmount),
          tipCount: count(),
        })
        .from(tipTransactions)
        .where(
          and(
            gte(tipTransactions.createdAt, fromDate),
            eq(tipTransactions.status, "distributed")
          )
        )
        .groupBy(tipTransactions.recipientId)
        .orderBy(desc(sum(tipTransactions.tipAmount)))
        .limit(limit) as any;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPORAL WORKFLOW REPOSITORY
// ─────────────────────────────────────────────────────────────────────────────

export function makeTemporalWorkflowRepo(db: DB) {
  return {
    async upsert(data: InsertTemporalWorkflowExecution): Promise<TemporalWorkflowExecution> {
      const [wf] = await db
        .insert(temporalWorkflowExecutions)
        .values(data)
        .onConflictDoUpdate({
          target: temporalWorkflowExecutions.workflowId,
          set: {
            status: data.status,
            completedAt: data.completedAt,
            errorMessage: data.errorMessage,
          },
        })
        .returning();
      return wf;
    },

    async findByEntityId(entityId: string, entityType: string): Promise<TemporalWorkflowExecution[]> {
      return db
        .select()
        .from(temporalWorkflowExecutions)
        .where(
          and(
            eq(temporalWorkflowExecutions.workflowId, entityId),
            eq(temporalWorkflowExecutions.workflowType, entityType)
          )
        )
        .orderBy(desc(temporalWorkflowExecutions.startedAt));
    },

    async findRunning(workflowType?: string): Promise<TemporalWorkflowExecution[]> {
      const conditions = [eq(temporalWorkflowExecutions.status, "running")];
      if (workflowType) conditions.push(eq(temporalWorkflowExecutions.workflowType, workflowType));
      return db
        .select()
        .from(temporalWorkflowExecutions)
        .where(and(...conditions))
        .orderBy(desc(temporalWorkflowExecutions.startedAt));
    },

    async getStatusSummary(): Promise<Array<{ status: string; workflowType: string; count: number }>> {
      return db
        .select({
          status: temporalWorkflowExecutions.status,
          workflowType: temporalWorkflowExecutions.workflowType,
          count: count(),
        })
        .from(temporalWorkflowExecutions)
        .groupBy(temporalWorkflowExecutions.status, temporalWorkflowExecutions.workflowType);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FLUVIO CONSUMER OFFSET REPOSITORY
// ─────────────────────────────────────────────────────────────────────────────

export function makeFluvioOffsetRepo(db: DB) {
  return {
    async getOffset(topic: string, partitionId: number): Promise<FluvioConsumerOffset | undefined> {
      const [offset] = await db
        .select()
        .from(fluvioConsumerOffsets)
        .where(
          and(
            eq(fluvioConsumerOffsets.topic, topic),
            eq(fluvioConsumerOffsets.partition, partitionId)
          )
        )
        .limit(1);
      return offset;
    },

    async commitOffset(data: InsertFluvioConsumerOffset): Promise<FluvioConsumerOffset> {
      const [offset] = await db
        .insert(fluvioConsumerOffsets)
        .values(data)
        .onConflictDoUpdate({
          target: [fluvioConsumerOffsets.topic, fluvioConsumerOffsets.partition],
          set: {
            offset: data.offset,
            updatedAt: sql`NOW()`,
          },
        })
        .returning();
      return offset;
    },

    async getLaggingConsumers(lagThreshold = 1000): Promise<FluvioConsumerOffset[]> {
      return db
        .select()
        .from(fluvioConsumerOffsets)
        .where(gt(fluvioConsumerOffsets.offset, lagThreshold))
        .orderBy(desc(fluvioConsumerOffsets.offset));
    },

    async getAllOffsets(): Promise<FluvioConsumerOffset[]> {
      return db
        .select()
        .from(fluvioConsumerOffsets)
        .orderBy(asc(fluvioConsumerOffsets.topic), asc(fluvioConsumerOffsets.partition));
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAKEHOUSE ETL REPOSITORY
// ─────────────────────────────────────────────────────────────────────────────

export function makeLakehouseEtlRepo(db: DB) {
  return {
    async recordRun(data: InsertLakehouseEtlRun): Promise<LakehouseEtlRun> {
      const [run] = await db.insert(lakehouseEtlRuns).values(data).returning();
      return run;
    },

    async getLastSuccessfulRun(tableName: string): Promise<LakehouseEtlRun | undefined> {
      const [run] = await db
        .select()
        .from(lakehouseEtlRuns)
        .where(
          and(
            eq(lakehouseEtlRuns.jobName, tableName),
            eq(lakehouseEtlRuns.status, "success")
          )
        )
        .orderBy(desc(lakehouseEtlRuns.startedAt))
        .limit(1);
      return run;
    },

    async getRecentRuns(limit = 50): Promise<LakehouseEtlRun[]> {
      return db
        .select()
        .from(lakehouseEtlRuns)
        .orderBy(desc(lakehouseEtlRuns.startedAt))
        .limit(limit);
    },

    async getFailedRuns(hours = 24): Promise<LakehouseEtlRun[]> {
      return db
        .select()
        .from(lakehouseEtlRuns)
        .where(
          and(
            eq(lakehouseEtlRuns.status, "failed"),
            gte(lakehouseEtlRuns.startedAt, sql`NOW() - INTERVAL '${sql.raw(String(hours))} hours'`)
          )
        )
        .orderBy(desc(lakehouseEtlRuns.startedAt));
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// KYB APPLICATION REPOSITORY
// ─────────────────────────────────────────────────────────────────────────────

export function makeKybRepo(db: DB) {
  return {
    async findByEstablishment(establishmentId: string): Promise<typeof kybApplications.$inferSelect[]> {
      return db
        .select()
        .from(kybApplications)
        .where(eq(kybApplications.establishmentId, parseInt(establishmentId, 10)))
        .orderBy(desc(kybApplications.createdAt));
    },

    async findPendingReview(limit = 50): Promise<typeof kybApplications.$inferSelect[]> {
      return db
        .select()
        .from(kybApplications)
        .where(
          inArray(kybApplications.status, ["submitted", "under_review"])
        )
        .orderBy(asc(kybApplications.createdAt))
        .limit(limit);
    },

    async getDocuments(applicationId: string): Promise<typeof kybDocuments.$inferSelect[]> {
      return db
        .select()
        .from(kybDocuments)
        .where(eq(kybDocuments.applicationId, parseInt(applicationId, 10)))
        .orderBy(asc(kybDocuments.documentType));
    },

    async getStatusCounts(): Promise<Array<{ status: string; count: number }>> {
      return db
        .select({ status: kybApplications.status, count: count() })
        .from(kybApplications)
        .groupBy(kybApplications.status);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG REPOSITORY
// ─────────────────────────────────────────────────────────────────────────────

export function makeAuditLogRepo(db: DB) {
  return {
    async log(data: typeof auditLogs.$inferInsert): Promise<typeof auditLogs.$inferSelect> {
      const [entry] = await db.insert(auditLogs).values(data).returning();
      return entry;
    },

    async findByUser(
      userId: number,
      opts: { limit?: number; offset?: number; action?: string } = {}
    ): Promise<typeof auditLogs.$inferSelect[]> {
      const conditions = [eq(auditLogs.actorId, userId)];
      if (opts.action) conditions.push(eq(auditLogs.action, opts.action));
      return db
        .select()
        .from(auditLogs)
        .where(and(...conditions))
        .orderBy(desc(auditLogs.createdAt))
        .limit(opts.limit ?? 100)
        .offset(opts.offset ?? 0);
    },

    async findByEntity(
      entityType: string,
      entityId: string,
      limit = 50
    ): Promise<typeof auditLogs.$inferSelect[]> {
      return db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityType, entityType),
            eq(auditLogs.entityId, entityId)
          )
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit);
    },

    async getActionSummary(hours = 24): Promise<Array<{ action: string; count: number }>> {
      return db
        .select({ action: auditLogs.action, count: count() })
        .from(auditLogs)
        .where(gte(auditLogs.createdAt, sql`NOW() - INTERVAL '${sql.raw(String(hours))} hours'`))
        .groupBy(auditLogs.action)
        .orderBy(desc(count()));
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FRAUD ALERT REPOSITORY
// ─────────────────────────────────────────────────────────────────────────────

export function makeFraudAlertRepo(db: DB) {
  return {
    async findOpen(severity?: string, limit = 100): Promise<typeof fraudAlerts.$inferSelect[]> {
      const conditions = [
        inArray(fraudAlerts.status, ["open", "investigating"]),
      ];
      if (severity) conditions.push(eq(fraudAlerts.severity, severity as any));
      return db
        .select()
        .from(fraudAlerts)
        .where(and(...conditions))
        .orderBy(desc(fraudAlerts.createdAt))
        .limit(limit);
    },

    async create(data: typeof fraudAlerts.$inferInsert): Promise<typeof fraudAlerts.$inferSelect> {
      const [alert] = await db.insert(fraudAlerts).values(data as any).returning();
      return alert;
    },

    async updateStatus(id: string | number, status: string, resolvedBy?: number): Promise<void> {
      await db
        .update(fraudAlerts)
        .set({
          status: status as any,
          resolvedBy: resolvedBy ?? null,
          resolvedAt: status === "resolved" ? sql`NOW()` : null,
        })
        .where(eq(fraudAlerts.id, Number(id)));
    },

    async getSeverityBreakdown(): Promise<Array<{ severity: string; status: string; count: number }>> {
      return db
        .select({
          severity: fraudAlerts.severity,
          status: fraudAlerts.status,
          count: count(),
        })
        .from(fraudAlerts)
        .groupBy(fraudAlerts.severity, fraudAlerts.status);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// KEYCLOAK SESSION REPOSITORY
// ─────────────────────────────────────────────────────────────────────────────

export function makeKeycloakSessionRepo(db: DB, cache?: CacheAdapter) {
  return {
    async findActiveByUserId(userId: number): Promise<typeof keycloakSessionTokens.$inferSelect[]> {
      return db
        .select()
        .from(keycloakSessionTokens)
        .where(
          and(
            eq(keycloakSessionTokens.userId, userId as any),
            sql`${keycloakSessionTokens.expiresAt} > NOW()`,
            gt(keycloakSessionTokens.expiresAt, sql`NOW()`)
          )
        )
        .orderBy(desc(keycloakSessionTokens.createdAt));
    },

    async upsertSession(data: typeof keycloakSessionTokens.$inferInsert): Promise<typeof keycloakSessionTokens.$inferSelect> {
      // @ts-ignore Drizzle overload inference issue with onConflictDoUpdate on uuid columns
      const [session] = await db
        .insert(keycloakSessionTokens)
        .values(data as any)
        .onConflictDoUpdate({
          target: keycloakSessionTokens.keycloakSessionId,
          set: {
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            expiresAt: data.expiresAt,
            lastUsedAt: sql`NOW()`,
          },
        })
        .returning();
      return session;
    },

    async revokeSession(sessionId: string): Promise<void> {
      await db
        .update(keycloakSessionTokens)
        .set({ expiresAt: new Date(0), lastUsedAt: sql`NOW()` })
        .where(eq(keycloakSessionTokens.keycloakSessionId, sessionId));
    },

    async revokeAllForUser(userId: number): Promise<void> {
      await db
        .update(keycloakSessionTokens)
        .set({ expiresAt: new Date(0), lastUsedAt: sql`NOW()` })
        .where(eq(keycloakSessionTokens.userId, userId as any));
    },

    async cleanupExpired(): Promise<number> {
      const result = await db
        .delete(keycloakSessionTokens)
        .where(lt(keycloakSessionTokens.expiresAt, sql`NOW()`))
        .returning({ id: keycloakSessionTokens.id });
      return result.length;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REPOSITORY FACTORY
// Convenience function to create all repositories at once
// ─────────────────────────────────────────────────────────────────────────────

export function makeRepositories(db: DB, cache?: CacheAdapter) {
  return {
    users: makeUserRepo(db, cache),
    enairaWallets: makeEnairaWalletRepo(db, cache),
    enairaTransactions: makeEnairaTransactionRepo(db),
    tripPlanner: makeTripPlannerRepo(db, cache),
    taxCollections: makeTaxCollectionRepo(db),
    tipTransactions: makeTipTransactionRepo(db),
    temporalWorkflows: makeTemporalWorkflowRepo(db),
    fluvioOffsets: makeFluvioOffsetRepo(db),
    lakehouseEtl: makeLakehouseEtlRepo(db),
    kyb: makeKybRepo(db),
    auditLogs: makeAuditLogRepo(db),
    fraudAlerts: makeFraudAlertRepo(db),
    keycloakSessions: makeKeycloakSessionRepo(db, cache),
  };
}

export type Repositories = ReturnType<typeof makeRepositories>;
