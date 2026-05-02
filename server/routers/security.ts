import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  createFraudAlert,
  getFraudAlerts,
  resolveFraudAlert,
  createSocAlert,
  getSocAlerts,
  resolveSocAlert,
} from "../db";

// ─── Fraud Monitor Router ─────────────────────────────────────────────────────

export const fraudRouter = router({
  // List fraud alerts with filters
  list: protectedProcedure
    .input(
      z.object({
        status: z.string().optional(),
        severity: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        since: z.date().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      return getFraudAlerts(input);
    }),

  // Get recent alerts for live feed (last 5 minutes)
  recentAlerts: protectedProcedure
    .input(z.object({ minutes: z.number().min(1).max(60).default(5) }).optional())
    .query(async ({ input }) => {
      const since = new Date(Date.now() - (input?.minutes ?? 5) * 60 * 1000);
      return getFraudAlerts({ since, limit: 50 });
    }),

  // Create a fraud alert (called by GNN engine webhook)
  create: protectedProcedure
    .input(
      z.object({
        transactionId: z.string().optional(),
        establishmentId: z.number().optional(),
        country: z.string().length(2).optional(),
        severity: z.enum(["info", "low", "medium", "high", "critical"]),
        ruleTriggered: z.string().optional(),
        description: z.string().optional(),
        amount: z.string().optional(),
        currency: z.string().length(3).optional(),
        gnnScore: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      return createFraudAlert({
        ...input,
        alertId: `FRD-${Date.now().toString(36).toUpperCase()}`,
      });
    }),

  // Resolve a fraud alert
  resolve: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      return resolveFraudAlert(input.id, ctx.user.id);
    }),

  // Mark as false positive
  markFalsePositive: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await import("../db").then((m) => m.getDb());
      if (!db) throw new Error("Database not available");
      const { fraudAlerts } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      return db
        .update(fraudAlerts)
        .set({
          status: "false_positive",
          resolvedBy: ctx.user.id,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(fraudAlerts.id, input.id))
        .returning();
    }),

  // Fraud stats for dashboard
  stats: protectedProcedure.query(async () => {
    const [all, open, critical, high, investigating] = await Promise.all([
      getFraudAlerts({ limit: 1000 }),
      getFraudAlerts({ status: "open", limit: 1000 }),
      getFraudAlerts({ severity: "critical", limit: 1000 }),
      getFraudAlerts({ severity: "high", limit: 1000 }),
      getFraudAlerts({ status: "investigating", limit: 1000 }),
    ]);

    // Alerts in last 24h
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last24h = await getFraudAlerts({ since: since24h, limit: 1000 });

    return {
      total: all.length,
      open: open.length,
      critical: critical.length,
      high: high.length,
      investigating: investigating.length,
      last24h: last24h.length,
    };
  }),
});

// ─── SOC Dashboard Router ─────────────────────────────────────────────────────

export const socRouter = router({
  // List SOC alerts with filters
  list: protectedProcedure
    .input(
      z.object({
        status: z.string().optional(),
        severity: z.string().optional(),
        type: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        since: z.date().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      return getSocAlerts(input);
    }),

  // Get recent SOC alerts for live feed
  recentAlerts: protectedProcedure
    .input(z.object({ minutes: z.number().min(1).max(60).default(5) }).optional())
    .query(async ({ input }) => {
      const since = new Date(Date.now() - (input?.minutes ?? 5) * 60 * 1000);
      return getSocAlerts({ since, limit: 50 });
    }),

  // Create a SOC alert (called by Wazuh/OpenCTI webhook)
  create: protectedProcedure
    .input(
      z.object({
        type: z.enum([
          "intrusion", "anomaly", "policy_violation",
          "threat_intel", "compliance", "data_exfiltration",
        ]),
        severity: z.enum(["info", "low", "medium", "high", "critical"]),
        source: z.string().optional(),
        title: z.string(),
        description: z.string().optional(),
        affectedSystem: z.string().optional(),
        sourceIp: z.string().optional(),
        mitreTactic: z.string().optional(),
        mitreId: z.string().optional(),
        rawPayload: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      return createSocAlert({
        ...input,
        alertId: `SOC-${Date.now().toString(36).toUpperCase()}`,
      });
    }),

  // Resolve a SOC alert
  resolve: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      return resolveSocAlert(input.id, ctx.user.id);
    }),

  // SOC stats for dashboard
  stats: protectedProcedure.query(async () => {
    const [all, open, critical, intrusions, threatIntel] = await Promise.all([
      getSocAlerts({ limit: 1000 }),
      getSocAlerts({ status: "open", limit: 1000 }),
      getSocAlerts({ severity: "critical", limit: 1000 }),
      getSocAlerts({ type: "intrusion", limit: 1000 }),
      getSocAlerts({ type: "threat_intel", limit: 1000 }),
    ]);

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last24h = await getSocAlerts({ since: since24h, limit: 1000 });

    return {
      total: all.length,
      open: open.length,
      critical: critical.length,
      intrusions: intrusions.length,
      threatIntel: threatIntel.length,
      last24h: last24h.length,
    };
  }),
});
