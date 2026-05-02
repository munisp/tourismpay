/**
 * Service Proxy Router
 *
 * Provides environment-gated tRPC procedures that proxy requests to external
 * Go microservices when their URLs are configured. Falls back to the internal
 * PWA implementation when the service URLs are not set.
 *
 * Services:
 *  - bis-core    (BIS_CORE_URL)    — background investigation core
 *  - bis-ai      (BIS_AI_URL)      — AI analysis and scoring
 *  - bis-gateway (BIS_GATEWAY_URL) — BIS API gateway
 *  - bis-osint   (BIS_OSINT_URL)   — OSINT data enrichment
 *  - kyb-service (KYB_SERVICE_URL) — KYB verification service
 *  - registry    (REGISTRY_SERVICE_URL) — multi-country registry
 */

import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import { TRPCError } from "@trpc/server";

/** Make an authenticated HTTP request to a Go microservice */
async function callService(
  baseUrl: string,
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
  authToken?: string
): Promise<unknown> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Source": "tourismpay-pwa",
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "unknown error");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Service ${baseUrl} returned ${res.status}: ${text}`,
    });
  }
  return res.json();
}

export const serviceProxyRouter = router({
  /** Returns the health/availability status of all configured microservices */
  serviceHealth: adminProcedure.query(async () => {
    const services = [
      { name: "bis-core", url: ENV.bisCoreUrl, path: "/health" },
      { name: "bis-ai", url: ENV.bisAiUrl, path: "/health" },
      { name: "bis-gateway", url: ENV.bisGatewayUrl, path: "/health" },
      { name: "bis-osint", url: ENV.bisOsintUrl, path: "/health" },
      { name: "kyb-service", url: ENV.kybServiceUrl, path: "/health" },
      { name: "registry", url: ENV.registryServiceUrl, path: "/health" },
    ];

    const results = await Promise.allSettled(
      services.map(async (svc) => {
        if (!svc.url) {
          return { name: svc.name, status: "not_configured" as const, url: null };
        }
        try {
          const res = await fetch(`${svc.url.replace(/\/$/, "")}${svc.path}`, {
            signal: AbortSignal.timeout(5000),
          });
          return {
            name: svc.name,
            status: res.ok ? ("healthy" as const) : ("unhealthy" as const),
            url: svc.url,
            httpStatus: res.status,
          };
        } catch (err) {
          return {
            name: svc.name,
            status: "unreachable" as const,
            url: svc.url,
            error: err instanceof Error ? err.message : "unknown",
          };
        }
      })
    );

    return results.map((r) => (r.status === "fulfilled" ? r.value : { name: "unknown", status: "error" as const }));
  }),

  /** Proxy a BIS investigation creation to bis-core when configured */
  bisCreateProxy: protectedProcedure
    .input(
      z.object({
        subjectFullName: z.string().min(1),
        subjectCountry: z.string().length(2),
        tier: z.enum(["BASIC", "STANDARD", "ENHANCED"]),
        subjectDob: z.string().optional(),
        subjectNin: z.string().optional(),
        subjectPhone: z.string().optional(),
        subjectEmail: z.string().email().optional(),
        subjectRole: z.string().optional(),
        subjectNationality: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ENV.bisCoreUrl) {
        return { proxied: false, message: "bis-core not configured — using internal implementation" };
      }
      const result = await callService(ENV.bisCoreUrl, "/api/v1/investigations", "POST", {
        subject_full_name: input.subjectFullName,
        subject_country: input.subjectCountry,
        tier: input.tier,
        subject_dob: input.subjectDob,
        subject_nin: input.subjectNin,
        subject_phone: input.subjectPhone,
        subject_email: input.subjectEmail,
        subject_role: input.subjectRole,
        subject_nationality: input.subjectNationality,
        requested_by: ctx.user.id,
      });
      return { proxied: true, data: result };
    }),

  /** Proxy a BIS AI scoring request to bis-ai when configured */
  bisAiScore: adminProcedure
    .input(
      z.object({
        investigationId: z.string().min(1),
        moduleType: z.enum(["identity", "criminal", "financial", "sanctions", "pep", "adverse_media"]),
        subjectData: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ input }) => {
      if (!ENV.bisAiUrl) {
        return { proxied: false, message: "bis-ai not configured — using internal LLM implementation" };
      }
      const result = await callService(ENV.bisAiUrl, "/api/v1/score", "POST", {
        investigation_id: input.investigationId,
        module_type: input.moduleType,
        subject_data: input.subjectData,
      });
      return { proxied: true, data: result };
    }),

  /** Proxy OSINT enrichment to bis-osint when configured */
  bisOsintEnrich: adminProcedure
    .input(
      z.object({
        investigationId: z.string().min(1),
        subjectName: z.string().min(1),
        subjectCountry: z.string().length(2),
        sources: z.array(z.enum(["news", "sanctions", "pep", "court_records", "social"])).default(["news", "sanctions"]),
      })
    )
    .mutation(async ({ input }) => {
      if (!ENV.bisOsintUrl) {
        return { proxied: false, message: "bis-osint not configured" };
      }
      const result = await callService(ENV.bisOsintUrl, "/api/v1/enrich", "POST", {
        investigation_id: input.investigationId,
        subject_name: input.subjectName,
        subject_country: input.subjectCountry,
        sources: input.sources,
      });
      return { proxied: true, data: result };
    }),

  /** Proxy KYB verification to kyb-service when configured */
  kybVerifyProxy: protectedProcedure
    .input(
      z.object({
        establishmentId: z.string().min(1),
        verificationType: z.enum(["identity", "business", "aml", "sanctions"]),
        documents: z.array(z.object({ type: z.string(), url: z.string() })).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ENV.kybServiceUrl) {
        return { proxied: false, message: "kyb-service not configured — using internal implementation" };
      }
      const result = await callService(ENV.kybServiceUrl, "/api/v1/verify", "POST", {
        establishment_id: input.establishmentId,
        verification_type: input.verificationType,
        documents: input.documents,
        requested_by: ctx.user.id,
      });
      return { proxied: true, data: result };
    }),

  /** Proxy registry lookup to multi-country-registry when configured */
  registryLookup: protectedProcedure
    .input(
      z.object({
        countryCode: z.string().length(2),
        entityType: z.enum(["establishment", "individual", "event"]),
        query: z.string().min(1),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      if (!ENV.registryServiceUrl) {
        return { proxied: false, message: "registry-service not configured — using internal africa router", results: [] };
      }
      const result = await callService(
        ENV.registryServiceUrl,
        `/api/v1/lookup?country=${input.countryCode}&type=${input.entityType}&q=${encodeURIComponent(input.query)}&limit=${input.limit}`,
        "GET",
        undefined
      );
      return { proxied: true, data: result };
    }),

  /** Returns the last N hours of health check history per service for sparkline display */
  serviceHealthHistory: adminProcedure
    .input(z.object({
      serviceKey: z.string().optional(),
      hours: z.number().min(1).max(48).default(24),
    }))
    .query(async ({ input }) => {
      const db = await import("../db").then((m) => m.getDb());
      if (!db) return [];
      const { serviceHealthHistory: historyTable } = await import("../../drizzle/schema");
      const { desc, gte, eq: eqOp, and: andOp } = await import("drizzle-orm");
      const cutoff = Math.floor(Date.now() / 1000) - input.hours * 3600;
      const conditions = input.serviceKey
        ? andOp(gte(historyTable.checkedAt, cutoff), eqOp(historyTable.serviceKey, input.serviceKey))
        : gte(historyTable.checkedAt, cutoff);
      const rows = await db
        .select()
        .from(historyTable)
        .where(conditions)
        .orderBy(desc(historyTable.checkedAt))
        .limit(2000);
      return rows;
    }),

  /** Returns the current alert cooldown state per service (for admin visibility) */
  serviceHealthAlertLog: adminProcedure.query(async () => {
    const db = await import("../db").then((m) => m.getDb());
    if (!db) return [];
    const { serviceHealthAlerts: alertsTable } = await import("../../drizzle/schema");
    return db.select().from(alertsTable);
  }),

  /** Returns the current proxy configuration (which services are enabled) */
  proxyConfig: adminProcedure.query(() => {
    return {
      bisCoreUrl: ENV.bisCoreUrl ? ENV.bisCoreUrl : null,
      bisAiUrl: ENV.bisAiUrl ? ENV.bisAiUrl : null,
      bisGatewayUrl: ENV.bisGatewayUrl ? ENV.bisGatewayUrl : null,
      bisOsintUrl: ENV.bisOsintUrl ? ENV.bisOsintUrl : null,
      kybServiceUrl: ENV.kybServiceUrl ? ENV.kybServiceUrl : null,
      registryServiceUrl: ENV.registryServiceUrl ? ENV.registryServiceUrl : null,
      enabledCount: [
        ENV.bisCoreUrl,
        ENV.bisAiUrl,
        ENV.bisGatewayUrl,
        ENV.bisOsintUrl,
        ENV.kybServiceUrl,
        ENV.registryServiceUrl,
      ].filter(Boolean).length,
    };
  }),
});
