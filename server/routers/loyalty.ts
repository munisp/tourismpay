import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb, createUserNotification, createAuditLog } from "../db";
import { TRPCError } from "@trpc/server";
import { sql, eq, and, desc } from "drizzle-orm";
import { loyaltyPartners, loyaltyAccounts, loyaltyTransactions, loyaltyReferrals } from "../../drizzle/schema";
import { generateImage } from "../_core/imageGeneration";
import { cacheGet, cacheSet } from "../_core/redis";

const TIER_BENEFITS: Record<string, string> = {
  SILVER: "You now enjoy 1.5x points multiplier, priority customer support, and exclusive Silver member discounts.",
  GOLD: "You now enjoy 2x points multiplier, dedicated account manager, complimentary lounge access, and Gold-exclusive offers.",
  PLATINUM: "You now enjoy 3x points multiplier, personal concierge service, unlimited lounge access, and Platinum VIP benefits.",
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const GRACE_PERIOD_MS = 90 * 24 * 60 * 60 * 1000; // 90-day tier downgrade grace period
// Tier order for downgrade detection
const TIER_ORDER = ["BRONZE", "SILVER", "GOLD", "PLATINUM"];

// Default rewards catalog (used when DB is unavailable)
const DEFAULT_REWARDS = [
  { id: "r1", name: "Free Hotel Night", description: "One complimentary night at a partner hotel", pointsCost: 5000, partner: "Sheraton Lagos", category: "accommodation", isActive: true, stock: 50, expiresAt: null, expiringSoon: false },
  { id: "r2", name: "Airport Transfer", description: "Round-trip airport transfer service", pointsCost: 1200, partner: "Lagos Rides", category: "transport", isActive: true, stock: 100, expiresAt: null, expiringSoon: false },
  { id: "r3", name: "Safari Discount 20%", description: "20% off any safari booking", pointsCost: 3000, partner: "Nairobi Safari Co.", category: "experience", isActive: true, stock: 30, expiresAt: null, expiringSoon: false },
  { id: "r4", name: "Restaurant Voucher", description: "$25 dining credit at partner restaurants", pointsCost: 800, partner: "Accra Kitchen", category: "dining", isActive: true, stock: 200, expiresAt: null, expiringSoon: false },
  { id: "r5", name: "Spa Day Pass", description: "Full day access to luxury spa facilities", pointsCost: 2500, partner: "Cape Town Wellness", category: "wellness", isActive: true, stock: 20, expiresAt: null, expiringSoon: false },
  { id: "r6", name: "Museum Entry x2", description: "Two tickets to any partner museum", pointsCost: 600, partner: "Cairo Heritage", category: "culture", isActive: true, stock: 500, expiresAt: null, expiringSoon: false },
];

async function ensureAccount(userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const userIdStr = String(userId);
  const existing = await db.execute(
    sql`SELECT * FROM loyalty_accounts WHERE user_id = ${userIdStr} LIMIT 1`
  );
  if ((existing as any[]).length === 0) {
    await db.execute(
      sql`INSERT INTO loyalty_accounts (id, user_id, points_balance, tier, lifetime_points, created_at, updated_at)
          VALUES (gen_random_uuid()::text, ${userIdStr}, 0, 'BRONZE', 0, ${Date.now()}, ${Date.now()})`
    );
    return { pointsBalance: 0, tier: "BRONZE" as string, lifetimePoints: 0, tierProtectedUntil: null as number | null };
  }
  const row = (existing as any[])[0];
  return {
    pointsBalance: Number(row.points_balance),
    tier: row.tier as string,
    lifetimePoints: Number(row.lifetime_points),
    tierProtectedUntil: row.tier_protected_until != null ? Number(row.tier_protected_until) : null,
  };
}

function getTierFromPoints(lifetime: number): string {
  if (lifetime >= 50000) return "PLATINUM";
  if (lifetime >= 20000) return "GOLD";
  if (lifetime >= 5000) return "SILVER";
  return "BRONZE";
}

function mapRewardRow(r: any, nowMs: number) {
  const expiresAt = r.expires_at != null ? Number(r.expires_at) : null;
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    pointsCost: Number(r.points_cost),
    partner: r.partner ?? null,
    category: r.category ?? null,
    isActive: r.is_active,
    stock: r.stock != null ? Number(r.stock) : null,
    expiresAt,
    expiringSoon: expiresAt != null && expiresAt > nowMs && expiresAt - nowMs < SEVEN_DAYS_MS,
    expired: expiresAt != null && expiresAt <= nowMs,
  };
}

export const loyaltyRouter = router({
  // Get current user's loyalty account (includes grace period info)
  account: protectedProcedure.query(async ({ ctx }) => {
    const acct = await ensureAccount(ctx.user.id);
    const nowMs = Date.now();
    const isInGracePeriod = acct.tierProtectedUntil != null && acct.tierProtectedUntil > nowMs;
    const gracePeriodDaysLeft = isInGracePeriod
      ? Math.ceil((acct.tierProtectedUntil! - nowMs) / (24 * 60 * 60 * 1000))
      : null;
    // The tier the user would fall to based on lifetime points (without grace protection)
    const naturalTier = getTierFromPoints(acct.lifetimePoints);
    return {
      ...acct,
      isInGracePeriod,
      gracePeriodDaysLeft,
      naturalTier,
    };
  }),

  // Get transaction history
  transactions: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20), offset: z.number().default(0) }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;
      const userIdStr = String(ctx.user.id);
      const rows = await db.execute(
        sql`SELECT * FROM loyalty_transactions WHERE user_id = ${userIdStr}
            ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
      );
      const countResult = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM loyalty_transactions WHERE user_id = ${userIdStr}`
      );
      return {
        items: (rows as any[]).map(r => ({
          id: r.id,
          type: r.type,
          points: Number(r.points),
          description: r.description,
          partner: r.partner,
          referenceId: r.reference_id,
          createdAt: Number(r.created_at),
        })),
        total: Number((countResult as any[])[0]?.cnt ?? 0),
      };
    }),

  // Get available rewards catalog (excludes expired rewards, adds expiringSoon badge)
  rewards: protectedProcedure.query(async () => {
    const cached = await cacheGet<unknown[]>("loyalty:rewards");
    if (cached) return cached;
    const db = await getDb();
    if (!db) return DEFAULT_REWARDS;
    try {
      const nowMs = Date.now();
      const rows = await db.execute(
        sql`SELECT * FROM loyalty_rewards
            WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at > ${nowMs})
            ORDER BY points_cost ASC`
      );
      if ((rows as any[]).length === 0) return DEFAULT_REWARDS;
      const result = (rows as any[]).map(r => mapRewardRow(r, nowMs));
      await cacheSet("loyalty:rewards", result, 60);
      return result;
    } catch {
      return DEFAULT_REWARDS;
    }
  }),

  // Admin: list all rewards including expired ones
  adminRewards: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    try {
      const nowMs = Date.now();
      const rows = await db.execute(
        sql`SELECT * FROM loyalty_rewards ORDER BY created_at DESC`
      );
      return (rows as any[]).map(r => mapRewardRow(r, nowMs));
    } catch {
      return [];
    }
  }),

  // Admin: set or clear expiry on a reward
  setRewardExpiry: adminProcedure
    .input(z.object({
      rewardId: z.string(),
      expiresAt: z.number().nullable(), // Unix ms, null = never expires
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.execute(
        sql`UPDATE loyalty_rewards SET expires_at = ${input.expiresAt} WHERE id = ${input.rewardId}`
      );
      return { success: true };
    }),

  // Admin: deactivate all expired rewards (manual trigger; also run by background job)
  expireRewards: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const nowMs = Date.now();
    // Fetch the rewards that are about to be deactivated (for notification content)
    const toExpire = await db.execute(
      sql`SELECT id, name, partner, points_cost FROM loyalty_rewards
          WHERE is_active = TRUE AND expires_at IS NOT NULL AND expires_at <= ${nowMs}`
    ) as any;
    const expiredRows: Array<{ id: string; name: string; partner: string; points_cost: number }> =
      Array.isArray(toExpire) ? toExpire : (toExpire.rows ?? []);
    // Deactivate them
    const result = await db.execute(
      sql`UPDATE loyalty_rewards SET is_active = FALSE
          WHERE is_active = TRUE AND expires_at IS NOT NULL AND expires_at <= ${nowMs}`
    );
    const deactivatedCount = (result as any).rowCount ?? expiredRows.length;
    // Notify the platform owner with a summary of what was expired
    if (deactivatedCount > 0) {
      const { notifyOwner } = await import("../_core/notification");
      const rewardList = expiredRows
        .slice(0, 20)
        .map((r) => `\u2022 ${r.name} (${r.partner ?? "N/A"}) \u2014 ${r.points_cost} pts`)
        .join("\n");
      const moreCount = expiredRows.length > 20 ? expiredRows.length - 20 : 0;
      await notifyOwner({
        title: `Loyalty Rewards Expired \u2014 ${deactivatedCount} reward(s) deactivated`,
        content: `${deactivatedCount} loyalty reward(s) have been automatically deactivated because they passed their expiry date.\n\nDeactivated rewards:\n${rewardList}${moreCount > 0 ? `\n... and ${moreCount} more` : ""}\n\nPlease review the Loyalty Rewards admin panel to update or remove these entries.`,
      }).catch(() => {});
      // Notify all active loyalty account holders that some rewards have expired
      const loyaltyUsers = await db.execute(
        sql`SELECT DISTINCT user_id FROM loyalty_accounts WHERE points_balance > 0`
      ) as any;
      const userIds: string[] = (Array.isArray(loyaltyUsers) ? loyaltyUsers : (loyaltyUsers.rows ?? []))
        .map((r: any) => String(r.user_id));
      const rewardNames = expiredRows.slice(0, 5).map((r) => r.name).join(", ");
      const moreLabel = expiredRows.length > 5 ? ` and ${expiredRows.length - 5} more` : "";
      for (const userId of userIds.slice(0, 500)) {
        createUserNotification({
          userId: Number(userId),
          category: "system",
          title: `${deactivatedCount} Loyalty Reward(s) Have Expired`,
          content: `The following rewards are no longer available: ${rewardNames}${moreLabel}. Browse the Loyalty & Rewards section to discover new offers and redeem your points before they expire.`,
          actionUrl: "/loyalty",
          actionLabel: "View Rewards",
        }).catch(() => {});
      }
    }
    return {
      deactivated: deactivatedCount,
      rewards: expiredRows.map((r) => ({ id: r.id, name: r.name, partner: r.partner ?? null, pointsCost: Number(r.points_cost) })),
    };
  }),

  // Redeem a reward
  redeem: protectedProcedure
    .input(z.object({
      rewardId: z.string(),
      rewardName: z.string(),
      pointsCost: z.number().positive(),
      partner: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const account = await ensureAccount(ctx.user.id);
      if (account.pointsBalance < input.pointsCost) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Insufficient points. You have ${account.pointsBalance} but need ${input.pointsCost}.` });
      }
      // Check and decrement stock if the reward exists in the DB
      const { loyaltyRewards } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [dbReward] = await db
        .select({ id: loyaltyRewards.id, stock: loyaltyRewards.stock, isActive: loyaltyRewards.isActive })
        .from(loyaltyRewards)
        .where(eq(loyaltyRewards.id, input.rewardId))
        .limit(1);
      if (dbReward) {
        if (!dbReward.isActive) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This reward is no longer available." });
        }
        if (dbReward.stock !== null && dbReward.stock <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This reward is out of stock." });
        }
        if (dbReward.stock !== null) {
          // Atomic stock decrement with race condition protection via RETURNING
          const updated = await db.execute(
            sql`UPDATE loyalty_rewards SET stock = stock - 1, updated_at = ${Date.now()} WHERE id = ${input.rewardId} AND stock > 0 RETURNING stock`
          );
          const updatedRows = updated as any[];
          if (!updatedRows.length) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "This reward just went out of stock." });
          }
          const newStock = Number(updatedRows[0].stock);
          if (newStock === 0) {
            // Mark reward as out-of-stock (deactivate)
            await db.execute(
              sql`UPDATE loyalty_rewards SET is_active = false, updated_at = ${Date.now()} WHERE id = ${input.rewardId}`
            );
            // Notify admin owner (fire-and-forget)
            const { notifyOwner } = await import("../_core/notification");
            notifyOwner({
              title: `Loyalty Reward Out of Stock: ${input.rewardName}`,
              content: `The reward "${input.rewardName}" (Partner: ${input.partner}, ID: ${input.rewardId}) has reached 0 stock after a redemption by user ${ctx.user.id}. It has been automatically deactivated. Please restock or remove it from the catalog.`,
            }).catch(() => {});
          }
        }
      }
      // Deduct points
      await db.execute(
        sql`UPDATE loyalty_accounts SET points_balance = points_balance - ${input.pointsCost}, updated_at = ${Date.now()} WHERE user_id = ${String(ctx.user.id)}`
      );
      // Tier downgrade protection: check if the new balance would normally drop the tier.
      // If so, set tierProtectedUntil = now + 90 days and notify the user.
      const newBalance = account.pointsBalance - input.pointsCost;
      const currentTier = account.tier;
      const naturalTierAfterRedeem = getTierFromPoints(account.lifetimePoints); // lifetime points don't change on redeem
      // Check if points_balance drop would cause a tier downgrade (compare balance-based tier vs current tier)
      // We use balance for downgrade detection: if balance drops below the current tier threshold, trigger grace period
      const currentTierIdx = TIER_ORDER.indexOf(currentTier);
      const balanceTierAfterRedeem = (() => {
        // Determine tier based on current points_balance (not lifetime)
        if (newBalance >= 50000) return "PLATINUM";
        if (newBalance >= 20000) return "GOLD";
        if (newBalance >= 5000) return "SILVER";
        return "BRONZE";
      })();
      const balanceTierIdx = TIER_ORDER.indexOf(balanceTierAfterRedeem);
      const nowMs2 = Date.now();
      const isProtected = account.tierProtectedUntil != null && account.tierProtectedUntil > nowMs2;
      if (balanceTierIdx < currentTierIdx && !isProtected) {
        // Points balance dropped below current tier threshold — start 90-day grace period
        const graceEndsAt = nowMs2 + GRACE_PERIOD_MS;
        await db.execute(
          sql`UPDATE loyalty_accounts SET tier_protected_until = ${graceEndsAt}, updated_at = ${nowMs2} WHERE user_id = ${String(ctx.user.id)}`
        );
        // Notify the user about the grace period
        await createUserNotification({
          userId: ctx.user.id,
          category: "system",
          title: `Your ${currentTier} tier is protected for 90 days`,
          content: `Your points balance has dropped below the ${currentTier} tier threshold, but your tier is protected for 90 days (until ${new Date(graceEndsAt).toLocaleDateString()}). Earn more points to maintain your ${currentTier} status permanently.`,
          actionUrl: "/loyalty",
          actionLabel: "Earn Points",
        }).catch(() => null);
      }
      // Record transaction
      await db.execute(
        sql`INSERT INTO loyalty_transactions (id, user_id, type, points, description, partner, reference_id, created_at)
            VALUES (gen_random_uuid()::text, ${String(ctx.user.id)}, 'redemption', ${-input.pointsCost}, ${`Redeemed: ${input.rewardName}`}, ${input.partner}, ${input.rewardId}, ${Date.now()})`
      );
      const graceStarted = balanceTierIdx < currentTierIdx && !(account.tierProtectedUntil != null && account.tierProtectedUntil > Date.now());
      return { success: true, remainingBalance: newBalance, graceStarted };
    }),

  // Earn points (e.g., from a transaction or activity)
  earn: protectedProcedure
    .input(z.object({
      points: z.number().positive(),
      description: z.string(),
      partner: z.string().optional(),
      referenceId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const previousAccount = await ensureAccount(ctx.user.id);
      const previousTier = previousAccount.tier;
      // Add points
      await db.execute(
        sql`UPDATE loyalty_accounts SET points_balance = points_balance + ${input.points}, lifetime_points = lifetime_points + ${input.points}, updated_at = ${Date.now()} WHERE user_id = ${String(ctx.user.id)}`
      );
      // Update tier
      const updated = await db.execute(sql`SELECT lifetime_points FROM loyalty_accounts WHERE user_id = ${String(ctx.user.id)}`);
      const newLifetime = Number((updated as any[])[0]?.lifetime_points ?? 0);
      const newTier = getTierFromPoints(newLifetime);
      await db.execute(sql`UPDATE loyalty_accounts SET tier = ${newTier} WHERE user_id = ${String(ctx.user.id)}`);
      // Send tier upgrade notification if tier changed
      if (newTier !== previousTier && TIER_BENEFITS[newTier]) {
        await createUserNotification({
          userId: ctx.user.id,
          category: "system",
          title: `Congratulations! You've reached ${newTier} tier!`,
          content: `You've been upgraded from ${previousTier} to ${newTier}! ${TIER_BENEFITS[newTier]}`,
          actionUrl: "/loyalty",
          actionLabel: "View Rewards",
        }).catch(() => null);
        // Also notify the owner about the tier upgrade
        const { notifyOwner } = await import("../_core/notification");
        await notifyOwner({
          title: `Loyalty Tier Upgrade: ${ctx.user.name ?? ctx.user.email ?? `User #${ctx.user.id}`} → ${newTier}`,
          content: `User ${ctx.user.name ?? ctx.user.email ?? `#${ctx.user.id}`} has been upgraded from ${previousTier} to ${newTier} tier.\n\nLifetime points: ${newLifetime.toLocaleString()}\nPoints earned this transaction: ${input.points}\nDescription: ${input.description}`,
        }).catch(() => null);
      }
      // Record transaction with 12-month expiry
      const nowSec = Math.floor(Date.now() / 1000);
      const TWELVE_MONTHS_SEC = 365 * 24 * 60 * 60;
      const txExpiresAt = nowSec + TWELVE_MONTHS_SEC;
      await db.execute(
        sql`INSERT INTO loyalty_transactions (id, user_id, type, points, description, partner, reference_id, expires_at, is_expired, created_at)
            VALUES (gen_random_uuid()::text, ${String(ctx.user.id)}, 'earn', ${input.points}, ${input.description}, ${input.partner ?? null}, ${input.referenceId ?? null}, ${txExpiresAt}, false, ${nowSec})`
      );
      return { success: true, pointsEarned: input.points, newTier, tierUpgraded: newTier !== previousTier };
    }),

  // Restock a reward (admin only): set new stock value and reactivate if it was deactivated
  restockReward: adminProcedure
    .input(z.object({
      rewardId: z.string().min(1),
      newStock: z.number().int().min(1).max(100000),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Fetch the reward first to validate it exists
      const existing = await db.execute(
        sql`SELECT id, name, stock, is_active FROM loyalty_rewards WHERE id = ${input.rewardId} LIMIT 1`
      ) as any[];
      const reward = Array.isArray(existing) ? existing[0] : (existing as any).rows?.[0];
      if (!reward) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Reward not found" });
      }
      const previousStock = Number(reward.stock ?? 0);
      const wasInactive = !reward.is_active;
      // Update stock and reactivate
      await db.execute(
        sql`UPDATE loyalty_rewards SET stock = ${input.newStock}, is_active = true, updated_at = ${Date.now()} WHERE id = ${input.rewardId}`
      );
      // Notify owner about the restock
      const { notifyOwner } = await import("../_core/notification");
      await notifyOwner({
        title: `Loyalty Reward Restocked: ${reward.name}`,
        content: `Reward "${reward.name}" (ID: ${input.rewardId}) has been restocked.\n` +
          `Previous stock: ${previousStock}\n` +
          `New stock: ${input.newStock}\n` +
          (wasInactive ? `Status: Reactivated (was inactive/out-of-stock)` : `Status: Active`),
      }).catch(() => null);
      return {
        success: true,
        rewardId: input.rewardId,
        rewardName: reward.name,
        previousStock,
        newStock: input.newStock,
        reactivated: wasInactive,
      };
    }),

  // ─── Reward Analytics ─────────────────────────────────────────────────────
  /** Per-reward redemption counts, total points spent, and top redeemers (admin only) */
  rewardAnalytics: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(10),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rewards: [], totalRedemptions: 0, totalPointsSpent: 0 };
      const limit = input?.limit ?? 10;
      // Per-reward redemption stats
      const rewardStats = await db.execute(
        sql`
          SELECT
            lt.reference_id AS reward_id,
            lr.name AS reward_name,
            lr.category,
            lr.points_cost,
            lr.is_active,
            lr.stock,
            COUNT(lt.id)::int AS redemption_count,
            ABS(SUM(lt.points))::int AS total_points_spent
          FROM loyalty_transactions lt
          LEFT JOIN loyalty_rewards lr ON lr.id = lt.reference_id
          WHERE lt.type = 'redemption' AND lt.reference_id IS NOT NULL
          GROUP BY lt.reference_id, lr.name, lr.category, lr.points_cost, lr.is_active, lr.stock
          ORDER BY redemption_count DESC
          LIMIT ${limit}
        `
      );
      // Top redeemers overall
      const topRedeemers = await db.execute(
        sql`
          SELECT
            lt.user_id,
            u.name AS user_name,
            COUNT(lt.id)::int AS redemption_count,
            ABS(SUM(lt.points))::int AS total_points_spent
          FROM loyalty_transactions lt
          LEFT JOIN users u ON u.id::text = lt.user_id
          WHERE lt.type = 'redemption'
          GROUP BY lt.user_id, u.name
          ORDER BY redemption_count DESC
          LIMIT 5
        `
      );
      // Overall totals
      const totals = await db.execute(
        sql`
          SELECT
            COUNT(id)::int AS total_redemptions,
            ABS(SUM(points))::int AS total_points_spent
          FROM loyalty_transactions
          WHERE type = 'redemption'
        `
      );
      const totalsRow = (totals as any).rows?.[0] ?? (totals as any)[0] ?? {};
      return {
        rewards: ((rewardStats as any).rows ?? (rewardStats as any)).map((r: any) => ({
          rewardId: r.reward_id,
          rewardName: r.reward_name ?? "Unknown Reward",
          category: r.category ?? "general",
          pointsCost: Number(r.points_cost ?? 0),
          isActive: r.is_active ?? false,
          stock: r.stock != null ? Number(r.stock) : null,
          redemptionCount: Number(r.redemption_count ?? 0),
          totalPointsSpent: Number(r.total_points_spent ?? 0),
        })),
        topRedeemers: ((topRedeemers as any).rows ?? (topRedeemers as any)).map((r: any) => ({
          userId: r.user_id,
          userName: r.user_name ?? "Unknown User",
          redemptionCount: Number(r.redemption_count ?? 0),
          totalPointsSpent: Number(r.total_points_spent ?? 0),
        })),
        totalRedemptions: Number(totalsRow.total_redemptions ?? 0),
        totalPointsSpent: Number(totalsRow.total_points_spent ?? 0),
      };
    }),

  // Get rewards expiring within 30 days (user-facing)
  getExpiringRewards: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(30) }).optional())
    .query(async () => {
      const db = await getDb();
      if (!db) return { rewards: [], count: 0 };
      try {
        const nowMs = Date.now();
        const days = 30;
        const cutoffMs = nowMs + days * 24 * 60 * 60 * 1000;
        const rows = await db.execute(
          sql`SELECT * FROM loyalty_rewards
              WHERE is_active = TRUE
                AND expires_at IS NOT NULL
                AND expires_at > ${nowMs}
                AND expires_at <= ${cutoffMs}
              ORDER BY expires_at ASC`
        );
        const rewards = (rows as any[]).map(r => {
          const expiresAt = r.expires_at ? Number(r.expires_at) : null;
          const daysLeft = expiresAt ? Math.ceil((expiresAt - nowMs) / (24 * 60 * 60 * 1000)) : null;
          return {
            id: r.id,
            name: r.name,
            description: r.description,
            pointsCost: Number(r.points_cost),
            partner: r.partner ?? null,
            category: r.category ?? null,
            stock: r.stock != null ? Number(r.stock) : null,
            expiresAt,
            daysLeft,
            isUrgent: daysLeft != null && daysLeft <= 7,
          };
        });
        return { rewards, count: rewards.length };
      } catch {
        return { rewards: [], count: 0 };
      }
    }),

  // Get tier downgrade protection status for the current user
  getTierDowngradeStatus: protectedProcedure.query(async ({ ctx }) => {
    const acct = await ensureAccount(ctx.user.id);
    const nowMs = Date.now();
    const isInGracePeriod = acct.tierProtectedUntil != null && acct.tierProtectedUntil > nowMs;
    const gracePeriodDaysLeft = isInGracePeriod
      ? Math.ceil((acct.tierProtectedUntil! - nowMs) / (24 * 60 * 60 * 1000))
      : null;
    const naturalTier = getTierFromPoints(acct.lifetimePoints);
    const currentTier = acct.tier;
    const wouldDowngradeTo = isInGracePeriod ? naturalTier : null;
    const currentTierIdx = TIER_ORDER.indexOf(currentTier);
    const naturalTierIdx = TIER_ORDER.indexOf(naturalTier);
    return {
      currentTier,
      naturalTier,
      isInGracePeriod,
      gracePeriodDaysLeft,
      gracePeriodEndsAt: acct.tierProtectedUntil,
      wouldDowngradeTo: naturalTierIdx < currentTierIdx ? naturalTier : null,
      pointsBalance: acct.pointsBalance,
      lifetimePoints: acct.lifetimePoints,
    };
  }),

  // Admin: process expired grace periods — downgrades tiers for users whose grace period has ended
  processExpiredGracePeriods: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const nowMs = Date.now();
    // Find all accounts where grace period has expired
    const expired = await db.execute(
      sql`SELECT user_id, tier, lifetime_points, tier_protected_until
          FROM loyalty_accounts
          WHERE tier_protected_until IS NOT NULL AND tier_protected_until <= ${nowMs}`
    ) as any[];
    let downgradedCount = 0;
    const downgrades: Array<{ userId: string; from: string; to: string }> = [];
    for (const row of expired) {
      const userId = String(row.user_id);
      const currentTier = row.tier as string;
      const lifetimePoints = Number(row.lifetime_points);
      const naturalTier = getTierFromPoints(lifetimePoints);
      const currentTierIdx = TIER_ORDER.indexOf(currentTier);
      const naturalTierIdx = TIER_ORDER.indexOf(naturalTier);
      if (naturalTierIdx < currentTierIdx) {
        // Downgrade the tier and clear the grace period
        await db.execute(
          sql`UPDATE loyalty_accounts SET tier = ${naturalTier}, tier_protected_until = NULL, updated_at = ${nowMs} WHERE user_id = ${userId}`
        );
        // Notify the user about the downgrade
        await createUserNotification({
          userId: Number(userId),
          category: "system",
          title: `Your tier has been updated to ${naturalTier}`,
          content: `Your 90-day tier protection period has ended. Your tier has been updated from ${currentTier} to ${naturalTier} based on your current points balance. Earn more points to advance your tier again!`,
          actionUrl: "/loyalty",
          actionLabel: "Earn Points",
        }).catch(() => null);
        downgrades.push({ userId, from: currentTier, to: naturalTier });
        downgradedCount++;
      } else {
        // Grace period expired but no downgrade needed — just clear the protection flag
        await db.execute(
          sql`UPDATE loyalty_accounts SET tier_protected_until = NULL, updated_at = ${nowMs} WHERE user_id = ${userId}`
        );
      }
    }
    if (downgradedCount > 0) {
      const { notifyOwner } = await import("../_core/notification");
      await notifyOwner({
        title: `Loyalty Tier Downgrades Processed: ${downgradedCount} user(s)`,
        content: `${downgradedCount} user(s) had their loyalty tier downgraded after their 90-day grace period expired:\n\n${downgrades.map(d => `\u2022 User #${d.userId}: ${d.from} \u2192 ${d.to}`).join("\n")}`,
      }).catch(() => null);
    }
    return { processed: expired.length, downgradedCount, downgrades };
  }),

  // Get points expiring within the next 30 days for the current user
  getExpiringPoints: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { expiringSoon: [], totalExpiringSoon: 0 };
    const nowSec = Math.floor(Date.now() / 1000);
    const thirtyDaysSec = 30 * 24 * 60 * 60;
    const cutoff = nowSec + thirtyDaysSec;
    const rows = await db.execute(
      sql`SELECT id, points, description, partner, expires_at, created_at
          FROM loyalty_transactions
          WHERE user_id = ${String(ctx.user.id)}
            AND type = 'earn'
            AND is_expired = false
            AND expires_at IS NOT NULL
            AND expires_at > ${nowSec}
            AND expires_at <= ${cutoff}
          ORDER BY expires_at ASC`
    );
    const items = (rows as any[]).map(r => ({
      id: r.id,
      points: Number(r.points),
      description: r.description,
      partner: r.partner,
      expiresAt: Number(r.expires_at),
      daysLeft: Math.ceil((Number(r.expires_at) - nowSec) / 86400),
      createdAt: Number(r.created_at),
    }));
    return {
      expiringSoon: items,
      totalExpiringSoon: items.reduce((sum, r) => sum + r.points, 0),
    };
  }),

  // Admin: expire points past their TTL and deduct from balances
  processExpiredPoints: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const nowSec = Math.floor(Date.now() / 1000);
    // Find all earn transactions that have passed their expiry and are not yet marked expired
    const expired = await db.execute(
      sql`SELECT id, user_id, points FROM loyalty_transactions
          WHERE type = 'earn' AND is_expired = false AND expires_at IS NOT NULL AND expires_at <= ${nowSec}`
    ) as any[];
    if (!expired.length) return { processed: 0, usersAffected: 0 };
    // Group by user
    const byUser: Record<string, number> = {};
    const txIds: string[] = [];
    for (const row of expired) {
      const uid = String(row.user_id);
      byUser[uid] = (byUser[uid] ?? 0) + Number(row.points);
      txIds.push(row.id);
    }
    // Mark transactions as expired
    await db.execute(
      sql`UPDATE loyalty_transactions SET is_expired = true WHERE id = ANY(${txIds}::text[])`
    );
    // Deduct points from each user's balance and record expiry transactions
    let usersAffected = 0;
    for (const [userId, pointsToExpire] of Object.entries(byUser)) {
      await db.execute(
        sql`UPDATE loyalty_accounts SET points_balance = GREATEST(0, points_balance - ${pointsToExpire}), updated_at = ${nowSec * 1000} WHERE user_id = ${userId}`
      );
      // Record expiry transaction
      await db.execute(
        sql`INSERT INTO loyalty_transactions (id, user_id, type, points, description, is_expired, created_at)
            VALUES (gen_random_uuid()::text, ${userId}, 'expiry', ${-pointsToExpire}, 'Points expired (12-month TTL)', true, ${nowSec})`
      );
      // Notify the user
      await createUserNotification({
        userId: Number(userId),
        category: "system",
        title: `${pointsToExpire.toLocaleString()} loyalty points have expired`,
        content: `${pointsToExpire.toLocaleString()} of your loyalty points have expired after 12 months. Keep earning points on your next trip to maintain your balance!`,
        actionUrl: "/loyalty",
        actionLabel: "Earn Points",
      }).catch(() => null);
      usersAffected++;
    }
    // Notify owner
    const { notifyOwner } = await import("../_core/notification");
    await notifyOwner({
      title: `Loyalty Points Expiry: ${expired.length} transaction(s) expired`,
      content: `${expired.length} earn transaction(s) expired, affecting ${usersAffected} user(s). Total points deducted: ${Object.values(byUser).reduce((a, b) => a + b, 0).toLocaleString()}.`,
    }).catch(() => null);
    return { processed: expired.length, usersAffected };
  }),

  // Send 30-day expiry warnings to users with points expiring soon
  // ─── Partner Integration ────────────────────────────────────────────────────

  getPartners: protectedProcedure
    .input(z.object({ category: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { partners: [] };
      const conditions: any[] = [eq(loyaltyPartners.isActive, true)];
      if (input?.category) conditions.push(eq(loyaltyPartners.category, input.category));
      const rows = await db
        .select()
        .from(loyaltyPartners)
        .where(and(...conditions))
        .orderBy(desc(loyaltyPartners.bonusMultiplier));
      return {
        partners: rows.map((p) => ({
          ...p,
          bonusMultiplier: parseFloat(p.bonusMultiplier as unknown as string),
        })),
      };
    }),

  earnWithPartner: protectedProcedure
    .input(
      z.object({
        partnerId: z.string(),
        basePoints: z.number().int().min(1),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const userId = String(ctx.user.id);

      // Fetch partner
      const [partner] = await db.select().from(loyaltyPartners).where(
        and(eq(loyaltyPartners.id, input.partnerId), eq(loyaltyPartners.isActive, true))
      );
      if (!partner) throw new TRPCError({ code: "NOT_FOUND", message: "Partner not found or inactive" });

      const multiplier = parseFloat(partner.bonusMultiplier as unknown as string);
      const finalPoints = Math.round(input.basePoints * multiplier);
      const bonusPoints = finalPoints - input.basePoints;

      // Ensure account exists
      const existing = await db.select().from(loyaltyAccounts).where(eq(loyaltyAccounts.userId, userId));
      if (existing.length === 0) {
        await db.insert(loyaltyAccounts).values({
          userId,
          tier: "BRONZE",
          pointsBalance: 0,
          lifetimePoints: 0,
        });
      }

      // Compute expiry (12 months from now)
      const expiresAt = Math.floor((Date.now() + 365 * 24 * 60 * 60 * 1000) / 1000);

      // Insert earn transaction
      const txRef = `PARTNER-${partner.name.replace(/\s+/g, "-").toUpperCase()}-${Date.now()}`;
      await db.insert(loyaltyTransactions).values({
        userId,
        type: "earn",
        points: finalPoints,
        description: input.description ?? `Earned via ${partner.name} (${multiplier}x multiplier)`,
        referenceId: txRef,
        expiresAt,
        isExpired: false,
      });

      // Update account balance
      await db.execute(
        sql`UPDATE loyalty_accounts
            SET points_balance = points_balance + ${finalPoints},
                lifetime_points = lifetime_points + ${finalPoints},
                updated_at = ${Math.floor(Date.now() / 1000)}
            WHERE user_id = ${userId}`
      );

      // Check for tier upgrade
      const [account] = await db.select().from(loyaltyAccounts).where(eq(loyaltyAccounts.userId, userId));
      const newLifetime = account ? account.lifetimePoints + finalPoints : finalPoints;
      let newTier = account?.tier ?? "BRONZE";
      if (newLifetime >= 50000) newTier = "PLATINUM";
      else if (newLifetime >= 20000) newTier = "GOLD";
      else if (newLifetime >= 5000) newTier = "SILVER";
      if (newTier !== account?.tier) {
        await db.execute(
          sql`UPDATE loyalty_accounts SET tier = ${newTier}, updated_at = ${Math.floor(Date.now() / 1000)} WHERE user_id = ${userId}`
        );
        await createUserNotification({
          userId: Number(ctx.user.id),
          category: "system",
          title: `🎉 Tier Upgrade: ${newTier}!`,
          content: TIER_BENEFITS[newTier] ?? `You have been upgraded to ${newTier} tier.`,
          actionUrl: "/loyalty",
          actionLabel: "View Benefits",
        }).catch(() => null);
      }

      return {
        basePoints: input.basePoints,
        bonusPoints,
        finalPoints,
        multiplier,
        partnerName: partner.name,
        referenceId: txRef,
        newTier: newTier !== account?.tier ? newTier : null,
      };
    }),

  createPartner: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        logoUrl: z.string().url().optional(),
        description: z.string().optional(),
        bonusMultiplier: z.number().min(1).max(10).default(1),
        category: z.string().default("general"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [partner] = await db.insert(loyaltyPartners).values({
        name: input.name,
        logoUrl: input.logoUrl ?? null,
        description: input.description ?? null,
        bonusMultiplier: String(input.bonusMultiplier),
        category: input.category,
        isActive: true,
      }).returning();
      return { partner: { ...partner, bonusMultiplier: parseFloat(partner.bonusMultiplier as unknown as string) } };
    }),

  updatePartner: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        logoUrl: z.string().url().optional().nullable(),
        description: z.string().optional().nullable(),
        bonusMultiplier: z.number().min(1).max(10).optional(),
        category: z.string().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { id, ...rest } = input;
      const updates: Record<string, any> = { ...rest, updatedAt: Date.now() };
      if (rest.bonusMultiplier !== undefined) updates.bonusMultiplier = String(rest.bonusMultiplier);
      const [updated] = await db.update(loyaltyPartners).set(updates).where(eq(loyaltyPartners.id, id)).returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Partner not found" });
      return { partner: { ...updated, bonusMultiplier: parseFloat(updated.bonusMultiplier as unknown as string) } };
    }),

  sendExpiryWarnings: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const nowSec = Math.floor(Date.now() / 1000);
    const thirtyDaysSec = 30 * 24 * 60 * 60;
    const cutoff = nowSec + thirtyDaysSec;
    // Find users with points expiring in the next 30 days
    const rows = await db.execute(
      sql`SELECT user_id, SUM(points) as total_expiring
          FROM loyalty_transactions
          WHERE type = 'earn' AND is_expired = false AND expires_at IS NOT NULL
            AND expires_at > ${nowSec} AND expires_at <= ${cutoff}
          GROUP BY user_id`
    ) as any[];
    let warned = 0;
    for (const row of rows) {
      const total = Number(row.total_expiring);
      await createUserNotification({
        userId: Number(row.user_id),
        category: "system",
        title: `⚠️ ${total.toLocaleString()} loyalty points expiring within 30 days`,
        content: `You have ${total.toLocaleString()} loyalty points expiring within the next 30 days. Redeem them for rewards before they expire!`,
        actionUrl: "/loyalty",
        actionLabel: "Redeem Now",
      }).catch(() => null);
      warned++;
    }
    return { warned };
  }),

  // ── Referral Program ──────────────────────────────────────────────────────────

  // Generate or retrieve existing referral code for the current user
  createReferralCode: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    // Check if user already has a pending referral code
    const [existing] = await db
      .select()
      .from(loyaltyReferrals)
      .where(and(eq(loyaltyReferrals.referrerId, String(ctx.user.id)), eq(loyaltyReferrals.status, "pending")))
      .limit(1);
    if (existing) return { code: existing.code, referralId: existing.id };
    // Generate a unique 8-char alphanumeric code
    const code = `TP${crypto.randomUUID().replace(/-/g, "").substring(0, 6).toUpperCase()}`;
    const [created] = await db
      .insert(loyaltyReferrals)
      .values({
        referrerId: String(ctx.user.id),
        code,
        status: "pending",
      })
      .returning({ id: loyaltyReferrals.id, code: loyaltyReferrals.code });
    return { code: created.code, referralId: created.id };
  }),

  // Apply a referral code (called by the referee after signing up)
  applyReferral: protectedProcedure
    .input(z.object({ code: z.string().min(1).max(20) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Find the referral record
      const [referral] = await db
        .select()
        .from(loyaltyReferrals)
        .where(and(eq(loyaltyReferrals.code, input.code), eq(loyaltyReferrals.status, "pending")))
        .limit(1);
      if (!referral) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or already used referral code." });
      if (referral.referrerId === String(ctx.user.id)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot use your own referral code." });
      }
      // Check referee hasn't already used a referral code
      const [alreadyUsed] = await db
        .select({ id: loyaltyReferrals.id })
        .from(loyaltyReferrals)
        .where(and(eq(loyaltyReferrals.refereeId, String(ctx.user.id)), eq(loyaltyReferrals.status, "completed")))
        .limit(1);
      if (alreadyUsed) throw new TRPCError({ code: "BAD_REQUEST", message: "You have already used a referral code." });

      const REFERRER_BONUS = 500;
      const REFEREE_BONUS = 250;
      const nowMs = Date.now();

      // Mark referral as completed
      await db
        .update(loyaltyReferrals)
        .set({ refereeId: String(ctx.user.id), status: "completed", referrerPointsAwarded: REFERRER_BONUS, refereePointsAwarded: REFEREE_BONUS, usedAt: nowMs })
        .where(eq(loyaltyReferrals.id, referral.id));

      // Award points to referrer
      const referrerId = Number(referral.referrerId);
      await ensureAccount(referrerId);
      await db.execute(
        sql`UPDATE loyalty_accounts SET points_balance = points_balance + ${REFERRER_BONUS}, lifetime_points = lifetime_points + ${REFERRER_BONUS}, updated_at = ${nowMs} WHERE user_id = ${referrerId}`
      );
      await db.execute(
        sql`INSERT INTO loyalty_transactions (id, user_id, type, points, description, partner, reference_id, created_at)
            VALUES (gen_random_uuid()::text, ${referrerId}, 'earn', ${REFERRER_BONUS}, 'Referral bonus — friend joined TourismPay', 'TourismPay Referral', ${referral.id}, ${nowMs})`
      );

      // Award points to referee (current user)
      await ensureAccount(ctx.user.id);
      await db.execute(
        sql`UPDATE loyalty_accounts SET points_balance = points_balance + ${REFEREE_BONUS}, lifetime_points = lifetime_points + ${REFEREE_BONUS}, updated_at = ${nowMs} WHERE user_id = ${String(ctx.user.id)}`
      );
      await db.execute(
        sql`INSERT INTO loyalty_transactions (id, user_id, type, points, description, partner, reference_id, created_at)
            VALUES (gen_random_uuid()::text, ${String(ctx.user.id)}, 'earn', ${REFEREE_BONUS}, 'Welcome bonus — referral code applied', 'TourismPay Referral', ${referral.id}, ${nowMs})`
      );

      // Notify referrer
      await createUserNotification({
        userId: referrerId,
        category: "system",
        title: `🎉 You earned ${REFERRER_BONUS} referral bonus points!`,
        content: `A friend used your referral code and joined TourismPay. You've been awarded ${REFERRER_BONUS} bonus loyalty points. Keep sharing your code to earn more!`,
        actionUrl: "/loyalty",
        actionLabel: "View Points",
      }).catch(() => null);

      return { referrerBonus: REFERRER_BONUS, refereeBonus: REFEREE_BONUS };
    }),

  // Get user's referral history
  getReferrals: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { sent: [], received: null };
    const sent = await db
      .select()
      .from(loyaltyReferrals)
      .where(eq(loyaltyReferrals.referrerId, String(ctx.user.id)))
      .orderBy(desc(loyaltyReferrals.createdAt))
      .limit(20);
    const [received] = await db
      .select()
      .from(loyaltyReferrals)
      .where(and(eq(loyaltyReferrals.refereeId, String(ctx.user.id)), eq(loyaltyReferrals.status, "completed")))
      .limit(1);
    return {
      sent: sent.map(r => ({
        id: r.id,
        code: r.code,
        status: r.status,
        refereeId: r.refereeId,
        referrerPointsAwarded: r.referrerPointsAwarded,
        usedAt: r.usedAt,
        createdAt: r.createdAt,
      })),
      received: received ? {
        id: received.id,
        code: received.code,
        refereePointsAwarded: received.refereePointsAwarded,
        usedAt: received.usedAt,
      } : null,
    };
  }),

  // ─── Loyalty Leaderboard ──────────────────────────────────────────────────
  getLeaderboard: protectedProcedure
    .input(z.object({
      limit: z.number().min(5).max(50).default(20),
      timeFilter: z.enum(["allTime", "monthly", "weekly"]).default("allTime"),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const timeFilter = input?.timeFilter ?? "allTime";
      if (!db) return { entries: [], currentUserRank: null, timeFilter };
      const limit = input?.limit ?? 20;

      // Calculate period start in Unix seconds for time-scoped filters
      const nowSec = Math.floor(Date.now() / 1000);
      let periodStart: number | null = null;
      if (timeFilter === "weekly") periodStart = nowSec - 7 * 24 * 60 * 60;
      else if (timeFilter === "monthly") periodStart = nowSec - 30 * 24 * 60 * 60;

      let rows: any[];
      if (timeFilter === "allTime" || periodStart === null) {
        // All-time: rank by lifetime_points on loyalty_accounts
        rows = await db.execute(
          sql`SELECT la.user_id, la.tier, la.lifetime_points AS points_earned, la.points_balance, u.name, u.email
              FROM loyalty_accounts la
              LEFT JOIN users u ON u.id::text = la.user_id
              ORDER BY la.lifetime_points DESC NULLS LAST
              LIMIT ${limit}`
        ) as any[];
      } else {
        // Time-scoped: sum earn transactions within the period
        rows = await db.execute(
          sql`SELECT lt.user_id,
                COALESCE(la.tier, 'BRONZE') AS tier,
                SUM(CASE WHEN lt.points > 0 THEN lt.points ELSE 0 END) AS points_earned,
                COALESCE(la.points_balance, 0) AS points_balance,
                u.name, u.email
              FROM loyalty_transactions lt
              LEFT JOIN loyalty_accounts la ON la.user_id = lt.user_id
              LEFT JOIN users u ON u.id::text = lt.user_id
              WHERE lt.created_at >= ${periodStart}
                AND lt.points > 0
                AND lt.is_expired = false
              GROUP BY lt.user_id, la.tier, la.points_balance, u.name, u.email
              ORDER BY points_earned DESC NULLS LAST
              LIMIT ${limit}`
        ) as any[];
      }

      const entries = rows.map((row: any, idx: number) => {
        const name = row.name ?? row.email?.split("@")[0] ?? `User ${String(row.user_id).slice(0, 6)}`;
        return {
          rank: idx + 1,
          userId: String(row.user_id),
          displayName: name,
          tier: row.tier as string,
          totalEarned: Number(row.points_earned ?? 0),
          balance: Number(row.points_balance ?? 0),
          isCurrentUser: String(row.user_id) === String(ctx.user.id),
        };
      });

      // Find current user's rank if not in top N
      let currentUserRank: number | null = null;
      const currentUserEntry = entries.find((e: any) => e.isCurrentUser);
      if (currentUserEntry) {
        currentUserRank = currentUserEntry.rank;
      } else if (timeFilter === "allTime" || periodStart === null) {
        const [myRow] = await db.execute(
          sql`SELECT lifetime_points FROM loyalty_accounts WHERE user_id = ${String(ctx.user.id)} LIMIT 1`
        ) as any[];
        if (myRow) {
          const [countRow] = await db.execute(
            sql`SELECT COUNT(*) as cnt FROM loyalty_accounts WHERE lifetime_points > ${Number(myRow.lifetime_points ?? 0)}`
          ) as any[];
          currentUserRank = Number(countRow?.cnt ?? 0) + 1;
        }
      } else {
        const [myRow] = await db.execute(
          sql`SELECT COALESCE(SUM(CASE WHEN points > 0 THEN points ELSE 0 END), 0) AS pts
              FROM loyalty_transactions
              WHERE user_id = ${String(ctx.user.id)}
                AND created_at >= ${periodStart}
                AND points > 0
                AND is_expired = false`
        ) as any[];
        const myPts = Number(myRow?.pts ?? 0);
        const [countRow] = await db.execute(
          sql`SELECT COUNT(*) as cnt FROM (
                SELECT user_id FROM loyalty_transactions
                WHERE created_at >= ${periodStart} AND points > 0 AND is_expired = false
                GROUP BY user_id
                HAVING SUM(CASE WHEN points > 0 THEN points ELSE 0 END) > ${myPts}
              ) sub`
        ) as any[];
        currentUserRank = Number(countRow?.cnt ?? 0) + 1;
      }
      // Mask opted-out users as "Anonymous" (except the current user who always sees their own name)
      if (entries.length > 0) {
        const entryUserIds = entries.map((e: any) => e.userId);
        const optOutRows = await db.execute(
          sql`SELECT user_id, leaderboard_opt_out FROM loyalty_accounts WHERE user_id = ANY(${entryUserIds})`
        ) as any[];
        const optOutMap = new Map(optOutRows.map((r: any) => [String(r.user_id), Boolean(r.leaderboard_opt_out)]));
        for (const entry of entries) {
          if (!entry.isCurrentUser && optOutMap.get(entry.userId)) {
            entry.displayName = "Anonymous";
          }
        }
      }
      // Fetch current user's own points and tier for the personal rank card
      let myPoints = 0;
      let myTier = "BRONZE";
      const myEntry = entries.find((e: any) => e.isCurrentUser);
      if (myEntry) {
        myPoints = myEntry.totalEarned;
        myTier = myEntry.tier;
      } else {
        const [myAcct] = await db.execute(
          sql`SELECT lifetime_points, tier FROM loyalty_accounts WHERE user_id = ${String(ctx.user.id)} LIMIT 1`
        ) as any[];
        if (myAcct) {
          myPoints = Number(myAcct.lifetime_points ?? 0);
          myTier = String(myAcct.tier ?? "BRONZE");
        }
      }
      // Find points of the user ranked directly above the current user
      let pointsAboveMe: number | null = null;
      if (currentUserRank !== null && currentUserRank > 1) {
        // If user is in the top-N list, the user above is entries[rank-2]
        const aboveEntry = entries.find((e: any) => e.rank === (currentUserRank! - 1));
        if (aboveEntry) {
          pointsAboveMe = aboveEntry.totalEarned;
        } else if (timeFilter === "allTime" || periodStart === null) {
          // User is outside top-N: find the Nth user's points as the "next target"
          const topEntry = entries[entries.length - 1];
          if (topEntry) pointsAboveMe = topEntry.totalEarned;
        }
      }
      // Compute milestone badges for each entry
      // Badges: top10 (rank 1-10), streak (7+ consecutive earning days in last 14d), highEarner (10k+ lifetime)
      if (entries.length > 0) {
        const entryUserIds = entries.map((e: any) => e.userId);
        // High earner: lifetime_points >= 10000
        const highEarnerRows = await db.execute(
          sql`SELECT user_id FROM loyalty_accounts WHERE user_id = ANY(${entryUserIds}) AND lifetime_points >= 10000`
        ) as any[];
        const highEarnerSet = new Set(highEarnerRows.map((r: any) => String(r.user_id)));
        // Streak: earned points on 7+ distinct days in the last 14 days
        const streakRows = await db.execute(
          sql`SELECT user_id, COUNT(DISTINCT DATE(TO_TIMESTAMP(created_at))) AS day_count
              FROM loyalty_transactions
              WHERE user_id = ANY(${entryUserIds})
                AND points > 0
                AND is_expired = false
                AND created_at >= ${Math.floor(Date.now() / 1000) - 14 * 24 * 60 * 60}
              GROUP BY user_id
              HAVING COUNT(DISTINCT DATE(TO_TIMESTAMP(created_at))) >= 7`
        ) as any[];
        const streakSet = new Set(streakRows.map((r: any) => String(r.user_id)));
        for (const entry of entries) {
          const badges: string[] = [];
          if (entry.rank <= 10) badges.push("top10");
          if (streakSet.has(entry.userId)) badges.push("streak");
          if (highEarnerSet.has(entry.userId)) badges.push("highEarner");
          (entry as any).badges = badges;
        }
      }
      return { entries, currentUserRank, timeFilter, myPoints, myTier, pointsAboveMe };
    }),

  // Get current user's leaderboard privacy preference
  getLeaderboardPrivacy: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { optOut: false };
      const [row] = await db.execute(
        sql`SELECT leaderboard_opt_out FROM loyalty_accounts WHERE user_id = ${String(ctx.user.id)} LIMIT 1`
      ) as any[];
      return { optOut: Boolean(row?.leaderboard_opt_out ?? false) };
    }),

  // Set current user's leaderboard opt-out preference
  setLeaderboardPrivacy: protectedProcedure
    .input(z.object({ optOut: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.execute(
        sql`INSERT INTO loyalty_accounts (id, user_id, points_balance, tier, lifetime_points, leaderboard_opt_out, created_at, updated_at)
            VALUES (gen_random_uuid()::text, ${String(ctx.user.id)}, 0, 'BRONZE', 0, ${input.optOut}, ${Math.floor(Date.now() / 1000)}, ${Math.floor(Date.now() / 1000)})
            ON CONFLICT (user_id) DO UPDATE SET leaderboard_opt_out = ${input.optOut}, updated_at = ${Math.floor(Date.now() / 1000)}}`
      );
      return { success: true, optOut: input.optOut };
    }),

  // ─── Privacy Settings (transaction history visibility) ────────────────────
  getPrivacySettings: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { leaderboardOptOut: false, hideTransactionHistory: false };
      const [row] = await db.execute(
        sql`SELECT leaderboard_opt_out, hide_transaction_history FROM loyalty_accounts WHERE user_id = ${String(ctx.user.id)} LIMIT 1`
      ) as any[];
      return {
        leaderboardOptOut: Boolean(row?.leaderboard_opt_out ?? false),
        hideTransactionHistory: Boolean(row?.hide_transaction_history ?? false),
      };
    }),

  setPrivacySettings: protectedProcedure
    .input(z.object({
      leaderboardOptOut: z.boolean().optional(),
      hideTransactionHistory: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const now = Math.floor(Date.now() / 1000);
      // Fetch current values before update for audit trail
      const [currentRow] = await db.execute(
        sql`SELECT leaderboard_opt_out, hide_transaction_history FROM loyalty_accounts WHERE user_id = ${String(ctx.user.id)} LIMIT 1`
      ) as any[];
      const before = {
        leaderboardOptOut: Boolean(currentRow?.leaderboard_opt_out ?? false),
        hideTransactionHistory: Boolean(currentRow?.hide_transaction_history ?? false),
      };
      await db.execute(
        sql`INSERT INTO loyalty_accounts (id, user_id, points_balance, tier, lifetime_points, leaderboard_opt_out, hide_transaction_history, created_at, updated_at)
            VALUES (gen_random_uuid()::text, ${String(ctx.user.id)}, 0, 'BRONZE', 0,
              ${input.leaderboardOptOut ?? false}, ${input.hideTransactionHistory ?? false},
              ${now}, ${now})
            ON CONFLICT (user_id) DO UPDATE SET
              leaderboard_opt_out = CASE WHEN ${input.leaderboardOptOut !== undefined} THEN ${input.leaderboardOptOut ?? false} ELSE loyalty_accounts.leaderboard_opt_out END,
              hide_transaction_history = CASE WHEN ${input.hideTransactionHistory !== undefined} THEN ${input.hideTransactionHistory ?? false} ELSE loyalty_accounts.hide_transaction_history END,
              updated_at = ${now}`
      );
      // Build after state from input + before fallback
      const after = {
        leaderboardOptOut: input.leaderboardOptOut !== undefined ? input.leaderboardOptOut : before.leaderboardOptOut,
        hideTransactionHistory: input.hideTransactionHistory !== undefined ? input.hideTransactionHistory : before.hideTransactionHistory,
      };
      // Record changed fields in audit log (fire-and-forget, non-blocking)
      const changedFields: string[] = [];
      if (before.leaderboardOptOut !== after.leaderboardOptOut) changedFields.push("leaderboardOptOut");
      if (before.hideTransactionHistory !== after.hideTransactionHistory) changedFields.push("hideTransactionHistory");
      if (changedFields.length > 0) {
        createAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name ?? undefined,
          actorEmail: ctx.user.email ?? undefined,
          action: "privacy_update",
          entityType: "loyalty_account",
          entityId: String(ctx.user.id),
          before,
          after,
          description: `User updated privacy settings: ${changedFields.join(", ")}`,
        }).catch(() => {});
      }
      return { success: true, changedFields };
    }),

  // ─── Share Card Generation ────────────────────────────────────────────────
  // Generates a social share card image for a tier upgrade using the image generation helper.
  generateShareCard: protectedProcedure
    .input(z.object({
      tier: z.enum(["SILVER", "GOLD", "PLATINUM"]),
      userName: z.string().min(1).max(100),
    }))
    .mutation(async ({ input }) => {
      const TIER_COLORS: Record<string, string> = {
        SILVER: "silver and slate blue",
        GOLD: "gold and amber",
        PLATINUM: "violet and platinum white",
      };
      const TIER_EMOJIS: Record<string, string> = { SILVER: "🥈", GOLD: "🥇", PLATINUM: "💎" };
      const prompt = [
        `A premium social media achievement card for TourismPay loyalty program.`,
        `The card announces that "${input.userName}" has reached ${input.tier} tier status.`,
        `Use ${TIER_COLORS[input.tier]} color scheme with elegant typography.`,
        `Include the ${TIER_EMOJIS[input.tier]} emoji prominently.`,
        `Modern minimalist design with dark background and glowing ${input.tier.toLowerCase()} accents.`,
        `Text: "I just reached ${input.tier} status on TourismPay! 🎉"`,
        `Professional travel and fintech aesthetic. No borders or frames.`,
      ].join(" ");
      try {
        const { url } = await generateImage({ prompt });
        return { success: true, imageUrl: url, tier: input.tier };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to generate share card: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

  // ─── Points Expiry ──────────────────────────────────────────────────────
  // Expires earned points older than 12 months. Run periodically via cron or admin trigger.
  expirePoints: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const nowSec = Math.floor(Date.now() / 1000);

    // Find all unexpired earn transactions that have passed their expiry date
    const expiredTxns = await db.execute(
      sql`SELECT user_id, SUM(points) as total_points
          FROM loyalty_transactions
          WHERE type = 'earn' AND is_expired = false AND expires_at IS NOT NULL AND expires_at <= ${nowSec}
          GROUP BY user_id`
    );
    const rows = expiredTxns as any[];
    let totalUsersAffected = 0;
    let totalPointsExpired = 0;

    for (const row of rows) {
      const userId = row.user_id;
      const expiredPoints = Number(row.total_points);
      if (expiredPoints <= 0) continue;

      // Mark transactions as expired
      await db.execute(
        sql`UPDATE loyalty_transactions SET is_expired = true
            WHERE user_id = ${userId} AND type = 'earn' AND is_expired = false AND expires_at IS NOT NULL AND expires_at <= ${nowSec}`
      );

      // Deduct expired points from balance (floor at 0)
      await db.execute(
        sql`UPDATE loyalty_accounts SET points_balance = GREATEST(points_balance - ${expiredPoints}, 0), updated_at = ${Date.now()}
            WHERE user_id = ${userId}`
      );

      // Record expiry transaction
      await db.execute(
        sql`INSERT INTO loyalty_transactions (id, user_id, type, points, description, is_expired, created_at)
            VALUES (gen_random_uuid()::text, ${userId}, 'expire', ${-expiredPoints}, ${'Points expired after 12-month validity period'}, false, ${nowSec})`
      );

      // Notify the user
      await createUserNotification({
        userId: Number(userId),
        category: "system",
        title: "Loyalty Points Expired",
        content: `${expiredPoints.toLocaleString()} loyalty points have expired after their 12-month validity period. Earn and redeem points regularly to keep them active.`,
        actionUrl: "/loyalty",
        actionLabel: "View Points",
      }).catch(() => {});

      totalUsersAffected++;
      totalPointsExpired += expiredPoints;
    }
    return { success: true, usersAffected: totalUsersAffected, totalPointsExpired };
  }),
});
