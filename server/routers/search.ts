import { z } from "zod";
import { cacheGet, cacheSet } from "../_core/redis";
import { protectedProcedure, router } from "../_core/trpc";
import { globalSearch } from "../db";

export const searchRouter = router({
  /**
   * Global search across establishments, BIS investigations, and KYB applications.
   * Requires at least 2 characters.
   */
  global: protectedProcedure
    .input(
      z.object({
        query: z.string().min(2).max(100),
      })
    )
    .query(async ({ input }) => {
      const results = await globalSearch(input.query);

      // Flatten into a ranked list with category tags
      const items: Array<{
        id: number;
        category: "establishment" | "investigation" | "kyb_application";
        title: string;
        subtitle: string;
        href: string;
        badge?: string;
        badgeColor?: string;
      }> = [];

      for (const est of results.establishments) {
        items.push({
          id: est.id,
          category: "establishment",
          title: est.name,
          subtitle: `${est.type} · ${est.country}${est.contactEmail ? ` · ${est.contactEmail}` : ""}`,
          href: `/africa/registry`,
          badge: est.kybStatus,
          badgeColor:
            est.kybStatus === "approved"
              ? "green"
              : est.kybStatus === "rejected"
              ? "red"
              : est.kybStatus === "under_review"
              ? "yellow"
              : "gray",
        });
      }

      for (const inv of results.investigations) {
        items.push({
          id: inv.id,
          category: "investigation",
          title: inv.subjectFullName,
          subtitle: `${inv.referenceId} · ${inv.tier} tier${inv.subjectEmail ? ` · ${inv.subjectEmail}` : ""}`,
          href: `/bis/${inv.id}`,
          badge: inv.status,
          badgeColor:
            inv.status === "completed"
              ? "green"
              : inv.status === "flagged"
              ? "red"
              : inv.status === "processing"
              ? "blue"
              : "gray",
        });
      }

      for (const app of results.kybApplications) {
        items.push({
          id: app.id,
          category: "kyb_application",
          title: `KYB Application #${app.id}`,
          subtitle: `Step ${app.currentStep} · ${app.status}${app.complianceScore != null ? ` · Score: ${app.complianceScore}` : ""}`,
          href: `/admin/kyb-applications`,
          badge: app.status,
          badgeColor:
            app.status === "approved"
              ? "green"
              : app.status === "rejected"
              ? "red"
              : app.status === "under_review"
              ? "yellow"
              : "gray",
        });
      }

      return {
        items,
        counts: {
          establishments: results.establishments.length,
          investigations: results.investigations.length,
          kybApplications: results.kybApplications.length,
          total: items.length,
        },
      };
    }),
});

// ─── Extended OpenSearch-backed search procedures ─────────────────────────────
import {
  searchTransactions as osSearchTransactions,
  searchSettlements as osSearchSettlements,
  searchMerchants as osSearchMerchants,
  searchAgents as osSearchAgents,
  searchFraudAlerts as osSearchFraudAlerts,
  searchOrders as osSearchOrders,
  searchWebhooks as osSearchWebhooks,
  searchUssdSessions as osSearchUssdSessions,
  universalSearch,
  EXTENDED_INDICES,
} from "../_core/opensearch";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

// Extend the searchRouter with OpenSearch procedures
// These are exported separately and merged in routers.ts
export const openSearchRouter = router({
  // Universal multi-index search
  universal: protectedProcedure
    .input(z.object({
      query: z.string().min(2).max(200),
      // Restrict to allowlisted index names only — prevents index enumeration attacks
      indices: z.array(z.enum([
        "tourismpay-transactions", "tourismpay-settlements", "tourismpay-merchants",
        "tourismpay-agents", "tourismpay-fraud-alerts", "tourismpay-orders",
        "tourismpay-ussd-sessions", "tourismpay-webhooks", "tourismpay-audit-logs",
        "tourismpay-establishments", "tourismpay-remittances", "tourismpay-users",
        "tourismpay-bis-investigations", "tourismpay-customers", "tourismpay-bulk-jobs",
        "tourismpay-notifications",
      ])).optional(),
      // Restrict filter keys to safe field names only — prevents arbitrary field injection
      filters: z.record(
        z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_.]{0,49}$/, "Invalid filter field name"),
        z.string().max(200)
      ).optional(),
      page: z.number().int().min(1).max(100).default(1),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      const allowedIndices = new Set(Object.values(EXTENDED_INDICES));
      // Double-check: only pass indices that are in our allowlist
      const targetIndices = input.indices
        ? input.indices.filter(idx => allowedIndices.has(idx as any))
        : Object.values(EXTENDED_INDICES);
      if (targetIndices.length === 0) {
        return { hits: [], total: 0, source: "opensearch" as const };
      }
      const result = await universalSearch(input.query, targetIndices, {
        from: (input.page - 1) * input.limit,
        size: input.limit,
        filters: input.filters,
      });
      return result;
    }),

  // Transactions search
  transactions: protectedProcedure
    .input(z.object({ query: z.string().min(2), status: z.string().max(50).optional(), currency: z.string().max(10).optional(), page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const osResult = await osSearchTransactions(input.query, { status: input.status, currency: input.currency }, { from: (input.page - 1) * input.limit, size: input.limit });
      if (osResult) return { hits: osResult.hits, total: osResult.total, source: "opensearch" as const };
      // PostgreSQL fallback
      const db = getDb();
      const rows = await db.execute(sql`SELECT id, reference, amount, currency, status, created_at FROM wallet_transactions WHERE reference ILIKE ${'%' + input.query + '%'} OR id::text ILIKE ${'%' + input.query + '%'} LIMIT ${input.limit} OFFSET ${(input.page - 1) * input.limit}`);
      return { hits: (rows as any[]).map(r => ({ id: r.id, index: "transactions", score: 1, source: r })), total: (rows as any[]).length, source: "postgres" as const };
    }),

  // Settlements search
  settlements: protectedProcedure
    .input(z.object({ query: z.string().min(2), page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const osResult = await osSearchSettlements(input.query, { from: (input.page - 1) * input.limit, size: input.limit });
      if (osResult) return { hits: osResult.hits, total: osResult.total, source: "opensearch" as const };
      const db = getDb();
      const rows = await db.execute(sql`SELECT id, batch_id, status, total_amount, currency, created_at FROM settlement_batches WHERE batch_id ILIKE ${'%' + input.query + '%'} OR status ILIKE ${'%' + input.query + '%'} LIMIT ${input.limit}`);
      return { hits: (rows as any[]).map(r => ({ id: r.id, index: "settlements", score: 1, source: r })), total: (rows as any[]).length, source: "postgres" as const };
    }),

  // Merchants search
  merchants: protectedProcedure
    .input(z.object({ query: z.string().min(2), page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const osResult = await osSearchMerchants(input.query, { from: (input.page - 1) * input.limit, size: input.limit });
      if (osResult) return { hits: osResult.hits, total: osResult.total, source: "opensearch" as const };
      const db = getDb();
      const rows = await db.execute(sql`SELECT id, business_name, email, phone, country, status FROM merchants WHERE business_name ILIKE ${'%' + input.query + '%'} OR email ILIKE ${'%' + input.query + '%'} LIMIT ${input.limit}`);
      return { hits: (rows as any[]).map(r => ({ id: r.id, index: "merchants", score: 1, source: r })), total: (rows as any[]).length, source: "postgres" as const };
    }),

  // Agents search
  agents: protectedProcedure
    .input(z.object({ query: z.string().min(2), page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const osResult = await osSearchAgents(input.query, { from: (input.page - 1) * input.limit, size: input.limit });
      if (osResult) return { hits: osResult.hits, total: osResult.total, source: "opensearch" as const };
      const db = getDb();
      const rows = await db.execute(sql`SELECT id, name, agent_code, phone, email, region, status FROM agents WHERE name ILIKE ${'%' + input.query + '%'} OR agent_code ILIKE ${'%' + input.query + '%'} OR phone ILIKE ${'%' + input.query + '%'} LIMIT ${input.limit}`);
      return { hits: (rows as any[]).map(r => ({ id: r.id, index: "agents", score: 1, source: r })), total: (rows as any[]).length, source: "postgres" as const };
    }),

  // Fraud alerts search
  fraudAlerts: protectedProcedure
    .input(z.object({ query: z.string().min(2), status: z.string().max(50).optional(), page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const osResult = await osSearchFraudAlerts(input.query, { from: (input.page - 1) * input.limit, size: input.limit });
      if (osResult) return { hits: osResult.hits, total: osResult.total, source: "opensearch" as const };
      const db = getDb();
      const rows = await db.execute(sql`SELECT id, alert_type, transaction_id, status, risk_score, created_at FROM fraud_alerts WHERE alert_type ILIKE ${'%' + input.query + '%'} OR transaction_id ILIKE ${'%' + input.query + '%'} LIMIT ${input.limit}`);
      return { hits: (rows as any[]).map(r => ({ id: r.id, index: "fraud_alerts", score: 1, source: r })), total: (rows as any[]).length, source: "postgres" as const };
    }),

  // Orders search
  orders: protectedProcedure
    .input(z.object({ query: z.string().min(2), status: z.string().max(50).optional(), page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const osResult = await osSearchOrders(input.query, { from: (input.page - 1) * input.limit, size: input.limit });
      if (osResult) return { hits: osResult.hits, total: osResult.total, source: "opensearch" as const };
      const db = getDb();
      const rows = await db.execute(sql`SELECT id, order_id, customer_name, customer_email, status, total_amount FROM ecommerce_orders WHERE order_id ILIKE ${'%' + input.query + '%'} OR customer_name ILIKE ${'%' + input.query + '%'} OR customer_email ILIKE ${'%' + input.query + '%'} LIMIT ${input.limit}`);
      return { hits: (rows as any[]).map(r => ({ id: r.id, index: "orders", score: 1, source: r })), total: (rows as any[]).length, source: "postgres" as const };
    }),

  // USSD sessions search
  ussdSessions: protectedProcedure
    .input(z.object({ query: z.string().min(2), page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const osResult = await osSearchUssdSessions(input.query, { from: (input.page - 1) * input.limit, size: input.limit });
      if (osResult) return { hits: osResult.hits, total: osResult.total, source: "opensearch" as const };
      const db = getDb();
      const rows = await db.execute(sql`SELECT id, session_id, msisdn, status, created_at FROM ussd_sessions WHERE session_id ILIKE ${'%' + input.query + '%'} OR msisdn ILIKE ${'%' + input.query + '%'} LIMIT ${input.limit}`);
      return { hits: (rows as any[]).map(r => ({ id: r.id, index: "ussd_sessions", score: 1, source: r })), total: (rows as any[]).length, source: "postgres" as const };
    }),

  // Webhooks search
  webhooks: protectedProcedure
    .input(z.object({ query: z.string().min(2), page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const osResult = await osSearchWebhooks(input.query, { from: (input.page - 1) * input.limit, size: input.limit });
      if (osResult) return { hits: osResult.hits, total: osResult.total, source: "opensearch" as const };
      const db = getDb();
      const rows = await db.execute(sql`SELECT id, url, events, enabled, created_at FROM webhook_endpoints WHERE url ILIKE ${'%' + input.query + '%'} LIMIT ${input.limit}`);
      return { hits: (rows as any[]).map(r => ({ id: r.id, index: "webhooks", score: 1, source: r })), total: (rows as any[]).length, source: "postgres" as const };
    }),

  // Audit logs search
  auditLogs: protectedProcedure
    .input(z.object({ query: z.string().min(2), action: z.string().max(100).optional(), page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const osResult = await search(INDICES.AUDIT_LOGS, {
        multi_match: { query: input.query, fields: ["action^3", "actorName^2", "entityType", "entityId"], fuzziness: "AUTO" },
      }, { from: (input.page - 1) * input.limit, size: input.limit });
      if (osResult) return { hits: osResult.hits, total: osResult.total, source: "opensearch" as const };
      const db = getDb();
      const rows = await db.execute(sql`SELECT id, action, actor_name, entity_type, entity_id, created_at FROM audit_logs WHERE action ILIKE ${'%' + input.query + '%'} OR actor_name ILIKE ${'%' + input.query + '%'} LIMIT ${input.limit}`);
      return { hits: (rows as any[]).map(r => ({ id: r.id, index: "audit_logs", score: 1, source: r })), total: (rows as any[]).length, source: "postgres" as const };
    }),
});
