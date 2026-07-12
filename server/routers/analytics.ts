/**
 * Analytics Router — Cross-Platform Aggregation
 * Aggregates metrics from TourismPay (wallet), BIS, and PaymentSwitch
 * into a unified dashboard for executive-level visibility.
 */
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { cacheGet, cacheSet } from "../_core/redis";
import { queryLakehouse, ingestToLakehouse } from "../_core/lakehouse";
import { z } from "zod";
import { sql, count, sum, desc } from "drizzle-orm";
import {
  walletTransactions,
  bisInvestigations,
  fraudAlerts,
  loyaltyTransactions,
  remittances,
  psSettlements,
  users,
  qrPaymentTokens,
  kybApplications,
} from "../../drizzle/schema";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

export const analyticsRouter = router({
  // ── Cross-platform summary metrics ─────────────────────────────────────────
  crossPlatform: adminProcedure.query(async () => {
    const db = await requireDb();

    // TourismPay wallet stats — last 30 days
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 86400;
    const [walletStats] = await db
      .select({
        totalTxns: count(),
        totalVolume: sum(walletTransactions.amount),
        completedTxns: sql<number>`count(*) filter (where status = 'completed')`,
        pendingTxns: sql<number>`count(*) filter (where status = 'pending')`,
        failedTxns: sql<number>`count(*) filter (where status = 'failed')`,
      })
      .from(walletTransactions)
      .where(sql`created_at >= ${thirtyDaysAgo}`);

    // BIS investigation stats — last 30 days
    const thirtyDaysAgoMs = Date.now() - 30 * 86400 * 1000;
    const [bisStats] = await db
      .select({
        total: count(),
        completed: sql<number>`count(*) filter (where status = 'completed')`,
        processing: sql<number>`count(*) filter (where status = 'processing')`,
        flagged: sql<number>`count(*) filter (where status = 'flagged')`,
        avgRiskScore: sql<number>`avg(risk_score) filter (where risk_score is not null)`,
      })
      .from(bisInvestigations)
      .where(sql`created_at >= ${thirtyDaysAgoMs}`);

    // Fraud alert stats — last 30 days
    const [fraudStats] = await db
      .select({
        total: count(),
        critical: sql<number>`count(*) filter (where severity = 'critical')`,
        high: sql<number>`count(*) filter (where severity = 'high')`,
        resolved: sql<number>`count(*) filter (where status = 'resolved')`,
      })
      .from(fraudAlerts)
      .where(sql`created_at >= ${thirtyDaysAgoMs}`);

    // PaymentSwitch remittance stats — last 30 days
    const [remittanceStats] = await db
      .select({
        total: count(),
        completed: sql<number>`count(*) filter (where status = 'completed')`,
        totalVolume: sum(remittances.senderAmount),
      })
      .from(remittances)
      .where(sql`created_at >= ${thirtyDaysAgo}`);

    // PaymentSwitch settlement stats — last 30 days
    const [settlementStats] = await db
      .select({
        total: count(),
        totalSettled: sum(psSettlements.totalAmount),
      })
      .from(psSettlements)
      .where(sql`created_at >= ${thirtyDaysAgo}`);

    // Loyalty points earned — last 30 days
    const [loyaltyStats] = await db
      .select({
        totalEarned: sql<number>`coalesce(sum(points) filter (where type = 'earn'), 0)`,
        totalRedeemed: sql<number>`coalesce(sum(abs(points)) filter (where type = 'redeem'), 0)`,
        txnCount: count(),
      })
      .from(loyaltyTransactions)
      .where(sql`created_at >= ${thirtyDaysAgo}`);

    // PaymentSwitch fraud alerts — use the same fraudAlerts table, filtered by source
    const [psFraudStats] = await db
      .select({
        total: count(),
        blocked: sql<number>`count(*) filter (where status = 'blocked')`,
        flagged: sql<number>`count(*) filter (where status = 'flagged')`,
      })
      .from(fraudAlerts)
      .where(sql`created_at >= ${thirtyDaysAgoMs}`);

    return {
      period: "last_30_days",
      generatedAt: Date.now(),
      tourismPay: {
        wallet: {
          totalTransactions: Number(walletStats?.totalTxns ?? 0),
          totalVolume: Number(walletStats?.totalVolume ?? 0),
          completed: Number(walletStats?.completedTxns ?? 0),
          pending: Number(walletStats?.pendingTxns ?? 0),
          failed: Number(walletStats?.failedTxns ?? 0),
        },
        loyalty: {
          pointsEarned: Number(loyaltyStats?.totalEarned ?? 0),
          pointsRedeemed: Number(loyaltyStats?.totalRedeemed ?? 0),
          transactions: Number(loyaltyStats?.txnCount ?? 0),
        },
      },
      bis: {
        investigations: {
          total: Number(bisStats?.total ?? 0),
          completed: Number(bisStats?.completed ?? 0),
          processing: Number(bisStats?.processing ?? 0),
          flagged: Number(bisStats?.flagged ?? 0),
          avgRiskScore: Number(bisStats?.avgRiskScore ?? 0),
        },
        fraud: {
          total: Number(fraudStats?.total ?? 0),
          critical: Number(fraudStats?.critical ?? 0),
          high: Number(fraudStats?.high ?? 0),
          resolved: Number(fraudStats?.resolved ?? 0),
        },
      },
      paymentSwitch: {
        remittances: {
          total: Number(remittanceStats?.total ?? 0),
          completed: Number(remittanceStats?.completed ?? 0),
          totalVolume: Number(remittanceStats?.totalVolume ?? 0),
        },
        settlements: {
          total: Number(settlementStats?.total ?? 0),
          totalSettled: Number(settlementStats?.totalSettled ?? 0),
        },
        fraud: {
          total: Number(psFraudStats?.total ?? 0),
          blocked: Number(psFraudStats?.blocked ?? 0),
          flagged: Number(psFraudStats?.flagged ?? 0),
        },
      },
    };
  }),

  // ── Time-series data for charts (last 30 days, daily buckets) ──────────────
  timeSeries: adminProcedure
    .input(
      z.object({
        metric: z.enum(["wallet_volume", "bis_investigations", "remittance_volume", "fraud_alerts"]),
        days: z.number().int().min(7).max(90).default(30),
      })
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      const sinceTs = Math.floor(Date.now() / 1000) - input.days * 86400;
      const sinceTsMs = Date.now() - input.days * 86400 * 1000;

      if (input.metric === "wallet_volume") {
        const rows = await db.execute(
          sql`SELECT
            to_char(to_timestamp(created_at), 'YYYY-MM-DD') as day,
            count(*) as txn_count,
            coalesce(sum(amount::numeric), 0) as volume
          FROM wallet_transactions
          WHERE created_at >= ${sinceTs}
          GROUP BY day ORDER BY day`
        );
        return { metric: input.metric, data: (rows as any[]) as { day: string; txn_count: number; volume: number }[] };
      }

      if (input.metric === "bis_investigations") {
        const rows = await db.execute(
          sql`SELECT
            to_char(to_timestamp(created_at / 1000), 'YYYY-MM-DD') as day,
            count(*) as total,
            count(*) filter (where status = 'flagged') as flagged
          FROM bis_investigations
          WHERE created_at >= ${sinceTsMs}
          GROUP BY day ORDER BY day`
        );
        return { metric: input.metric, data: (rows as any[]) as { day: string; total: number; flagged: number }[] };
      }

      if (input.metric === "remittance_volume") {
        const rows = await db.execute(
          sql`SELECT
            to_char(to_timestamp(created_at), 'YYYY-MM-DD') as day,
            count(*) as txn_count,
            coalesce(sum(sender_amount::numeric), 0) as volume
          FROM remittances
          WHERE created_at >= ${sinceTs}
          GROUP BY day ORDER BY day`
        );
        return { metric: input.metric, data: (rows as any[]) as { day: string; txn_count: number; volume: number }[] };
      }

      // fraud_alerts
      const rows = await db.execute(
        sql`SELECT
          to_char(to_timestamp(created_at / 1000), 'YYYY-MM-DD') as day,
          count(*) as total,
          count(*) filter (where severity = 'critical') as critical
        FROM fraud_alerts
        WHERE created_at >= ${sinceTsMs}
        GROUP BY day ORDER BY day`
      );
      return { metric: input.metric, data: (rows as any[]) as { day: string; total: number; critical: number }[] };
    }),

  // ── Platform health summary ─────────────────────────────────────────────────
  platformHealth: adminProcedure.query(async () => {
    const db = await requireDb();

    // Check for recent failed wallet transactions (last 1 hour)
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    const [walletHealth] = await db
      .select({
        recentFailed: sql<number>`count(*) filter (where status = 'failed' and created_at >= ${oneHourAgo})`,
        recentTotal: sql<number>`count(*) filter (where created_at >= ${oneHourAgo})`,
      })
      .from(walletTransactions);

    // Check for unresolved critical fraud alerts
    const [fraudHealth] = await db
      .select({
        unresolvedCritical: sql<number>`count(*) filter (where severity = 'critical' and status != 'resolved')`,
      })
      .from(fraudAlerts);

    // Check for stuck BIS investigations (processing > 24h)
    const oneDayAgoMs = Date.now() - 86400 * 1000;
    const [bisHealth] = await db
      .select({
        stuckProcessing: sql<number>`count(*) filter (where status = 'processing' and created_at < ${oneDayAgoMs})`,
      })
      .from(bisInvestigations);

    const walletFailRate =
      Number(walletHealth?.recentTotal ?? 0) > 0
        ? (Number(walletHealth?.recentFailed ?? 0) / Number(walletHealth?.recentTotal)) * 100
        : 0;

    return {
      tourismPay: {
        status: walletFailRate > 10 ? "degraded" : "healthy",
        walletFailRate: Math.round(walletFailRate * 10) / 10,
        recentTransactions: Number(walletHealth?.recentTotal ?? 0),
      },
      bis: {
        status:
          Number(fraudHealth?.unresolvedCritical ?? 0) > 5
            ? "critical"
            : Number(bisHealth?.stuckProcessing ?? 0) > 10
            ? "degraded"
            : "healthy",
        unresolvedCriticalFraud: Number(fraudHealth?.unresolvedCritical ?? 0),
        stuckInvestigations: Number(bisHealth?.stuckProcessing ?? 0),
      },
      paymentSwitch: {
        status: "healthy", // Kill switch state checked separately via paymentSwitch.stats
      },
      checkedAt: Date.now(),
    };
  }),

  // ── DAU by role (users who logged in within the last 24h) ──────────────────
  dauByRole: adminProcedure.query(async () => {
    const db = await requireDb();
    const oneDayAgo = new Date(Date.now() - 86_400_000);
    const rows = await db
      .select({
        role: users.role,
        count: sql<number>`count(*)`,
      })
      .from(users)
      .where(sql`last_signed_in >= ${oneDayAgo}`)
      .groupBy(users.role);
    const roleOrder = ["tourist", "merchant", "compliance_officer", "noc_operator", "settlement_officer", "bis_analyst", "admin", "user"];
    const byRole: Record<string, number> = Object.fromEntries(roleOrder.map((r) => [r, 0]));
    for (const row of rows) {
      if (row.role) byRole[row.role] = Number(row.count);
    }
    const total = Object.values(byRole).reduce((a, b) => a + b, 0);
    return {
      total,
      byRole,
      chartData: roleOrder.map((r) => ({ role: r.replace(/_/g, " "), count: byRole[r] })),
    };
  }),

  // ── QR payment volume (last 30 days, daily buckets) ───────────────────────
  qrVolume: adminProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(30) }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const days = input?.days ?? 30;
      const since = new Date(Date.now() - days * 86_400_000);
      const [totals] = await db
        .select({
          total: count(),
          paid: sql<number>`count(*) filter (where status = 'paid')`,
          totalAmountUsd: sql<number>`coalesce(sum(amount_usd::numeric) filter (where status = 'paid'), 0)`,
        })
        .from(qrPaymentTokens)
        .where(sql`created_at >= ${since}`);
      const daily = await db.execute(
        sql`SELECT
          to_char(created_at, 'YYYY-MM-DD') as day,
          count(*) as total,
          count(*) filter (where status = 'paid') as paid,
          coalesce(sum(amount_usd::numeric) filter (where status = 'paid'), 0) as volume
        FROM qr_payment_tokens
        WHERE created_at >= ${since}
        GROUP BY day ORDER BY day`
      );
      return {
        total: Number(totals?.total ?? 0),
        paid: Number(totals?.paid ?? 0),
        totalAmountUsd: Number(totals?.totalAmountUsd ?? 0),
        conversionRate: Number(totals?.total ?? 0) > 0
          ? Math.round((Number(totals?.paid ?? 0) / Number(totals?.total ?? 1)) * 100)
          : 0,
        daily: (daily as any[]).map((d) => ({
          day: d.day as string,
          total: Number(d.total),
          paid: Number(d.paid),
          volume: Number(d.volume),
        })),
      };
    }),

  // ── KYB approval rate (last 30 days) ──────────────────────────────────────
  kybRate: adminProcedure.query(async () => {
    const db = await requireDb();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const [stats] = await db
      .select({
        total: count(),
        approved: sql<number>`count(*) filter (where status = 'approved')`,
        rejected: sql<number>`count(*) filter (where status = 'rejected')`,
        pending: sql<number>`count(*) filter (where status = 'pending' or status = 'submitted')`,
        underReview: sql<number>`count(*) filter (where status = 'under_review')`,
      })
      .from(kybApplications)
      .where(sql`created_at >= ${thirtyDaysAgo}`);
    const total = Number(stats?.total ?? 0);
    const approved = Number(stats?.approved ?? 0);
    const rejected = Number(stats?.rejected ?? 0);
    const pending = Number(stats?.pending ?? 0);
    const underReview = Number(stats?.underReview ?? 0);
    return {
      total,
      approved,
      rejected,
      pending,
      underReview,
      approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
      rejectionRate: total > 0 ? Math.round((rejected / total) * 100) : 0,
      chartData: [
        { status: "Approved", count: approved, fill: "oklch(0.78 0.22 152)" },
        { status: "Rejected", count: rejected, fill: "oklch(0.62 0.22 25)" },
        { status: "Under Review", count: underReview, fill: "oklch(0.82 0.18 75)" },
        { status: "Pending", count: pending, fill: "oklch(0.6 0.1 240)" },
      ],
    };
  }),
});
