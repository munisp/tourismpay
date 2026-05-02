/**
 * Python Services Router
 * Proxies tRPC calls to the 5 Python FastAPI microservices:
 *   - BIS AI Engine       (port 8001)
 *   - Fraud ML Service    (port 8002)
 *   - Compliance Engine   (port 8003)
 *   - Exchange Rate ML    (port 8004)
 *   - PDF Report Generator (port 8005)
 *
 * In production these are resolved via service discovery / env vars.
 * In development they run locally via docker-compose or uvicorn.
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure, bisProcedure, complianceProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

// ─── Service URLs ─────────────────────────────────────────────────────────────

const PYTHON_SERVICES = {
  bisAi: process.env.BIS_AI_ENGINE_URL || "http://localhost:8001",
  fraudMl: process.env.FRAUD_ML_SERVICE_URL || "http://localhost:8002",
  compliance: process.env.COMPLIANCE_RISK_ENGINE_URL || "http://localhost:8003",
  exchangeRateMl: process.env.EXCHANGE_RATE_ML_URL || "http://localhost:8004",
  pdfReports: process.env.PDF_REPORT_GENERATOR_URL || "http://localhost:8005",
};

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function callPythonService<T>(
  baseUrl: string,
  path: string,
  body?: unknown,
  method: "GET" | "POST" = "POST"
): Promise<T> {
  const url = `${baseUrl}${path}`;
  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
    signal: (AbortSignal as any).timeout(30_000) as AbortSignal,
  };
  if (body && method === "POST") {
    options.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (err: any) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Python service unavailable: ${baseUrl} — ${err?.message ?? "network error"}`,
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Python service error (${res.status}): ${text}`,
    });
  }

  return res.json() as Promise<T>;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const pythonServicesRouter = router({
  // ── BIS AI Engine ────────────────────────────────────────────────────────

  bisScoreInvestigation: bisProcedure
    .input(z.object({
      subjectFullName: z.string(),
      subjectCountry: z.string(),
      subjectNationality: z.string().optional(),
      transactionAmount: z.number().optional(),
      transactionCount: z.number().int().optional(),
      flaggedKeywords: z.array(z.string()).optional(),
      priorInvestigations: z.number().int().optional(),
      accountAgeDays: z.number().int().optional(),
      crossBorder: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      return callPythonService(PYTHON_SERVICES.bisAi, "/api/v1/bis/score-investigation", {
        subject_full_name: input.subjectFullName,
        subject_country: input.subjectCountry,
        subject_nationality: input.subjectNationality,
        transaction_amount: input.transactionAmount,
        transaction_count: input.transactionCount,
        flagged_keywords: input.flaggedKeywords,
        prior_investigations: input.priorInvestigations,
        account_age_days: input.accountAgeDays,
        cross_border: input.crossBorder,
      });
    }),

  bisEntityRiskProfile: bisProcedure
    .input(z.object({
      entityId: z.string(),
      entityType: z.enum(["individual", "merchant", "institution"]),
      country: z.string(),
      transactionVolume30d: z.number().optional(),
      transactionCount30d: z.number().int().optional(),
      chargebackRate: z.number().optional(),
      kybStatus: z.string().optional(),
      sanctionsHit: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      return callPythonService(PYTHON_SERVICES.bisAi, "/api/v1/bis/entity-risk-profile", {
        entity_id: input.entityId,
        entity_type: input.entityType,
        country: input.country,
        transaction_volume_30d: input.transactionVolume30d,
        transaction_count_30d: input.transactionCount30d,
        chargeback_rate: input.chargebackRate,
        kyb_status: input.kybStatus,
        sanctions_hit: input.sanctionsHit,
      });
    }),

  bisAutoFlag: bisProcedure
    .input(z.object({
      transactionId: z.string(),
      amount: z.number(),
      currency: z.string(),
      senderCountry: z.string(),
      receiverCountry: z.string(),
      senderId: z.string(),
      receiverId: z.string(),
      transactionType: z.string(),
      velocity1h: z.number().int().optional(),
      velocity24h: z.number().int().optional(),
    }))
    .mutation(async ({ input }) => {
      return callPythonService(PYTHON_SERVICES.bisAi, "/api/v1/bis/auto-flag", {
        transaction_id: input.transactionId,
        amount: input.amount,
        currency: input.currency,
        sender_country: input.senderCountry,
        receiver_country: input.receiverCountry,
        sender_id: input.senderId,
        receiver_id: input.receiverId,
        transaction_type: input.transactionType,
        velocity_1h: input.velocity1h,
        velocity_24h: input.velocity24h,
      });
    }),

  bisRiskHeatmap: bisProcedure
    .query(async () => {
      return callPythonService(PYTHON_SERVICES.bisAi, "/api/v1/bis/risk-heatmap", undefined, "GET");
    }),

  // ── Fraud ML Service ──────────────────────────────────────────────────────

  fraudScore: protectedProcedure
    .input(z.object({
      transactionId: z.string(),
      userId: z.string(),
      amount: z.number(),
      currency: z.string(),
      merchantId: z.string().optional(),
      merchantCategory: z.string().optional(),
      ipAddress: z.string().optional(),
      deviceFingerprint: z.string().optional(),
      isNewDevice: z.boolean().optional(),
      isVpn: z.boolean().optional(),
      failedAuthAttempts: z.number().int().optional(),
      avgTransactionAmount: z.number().optional(),
      stdTransactionAmount: z.number().optional(),
      transactionsLastHour: z.number().int().optional(),
      transactionsLastDay: z.number().int().optional(),
    }))
    .mutation(async ({ input }) => {
      return callPythonService(PYTHON_SERVICES.fraudMl, "/api/v1/fraud/score", {
        transaction_id: input.transactionId,
        user_id: input.userId,
        amount: input.amount,
        currency: input.currency,
        merchant_id: input.merchantId,
        merchant_category: input.merchantCategory,
        ip_address: input.ipAddress,
        device_fingerprint: input.deviceFingerprint,
        is_new_device: input.isNewDevice,
        is_vpn: input.isVpn,
        failed_auth_attempts: input.failedAuthAttempts,
        avg_transaction_amount: input.avgTransactionAmount,
        std_transaction_amount: input.stdTransactionAmount,
        transactions_last_hour: input.transactionsLastHour,
        transactions_last_day: input.transactionsLastDay,
      });
    }),

  fraudAnomalyDetection: protectedProcedure
    .input(z.object({
      userId: z.string(),
      recentAmounts: z.array(z.number()),
    }))
    .mutation(async ({ input }) => {
      return callPythonService(PYTHON_SERVICES.fraudMl, "/api/v1/fraud/anomaly-detection", {
        user_id: input.userId,
        recent_amounts: input.recentAmounts,
      });
    }),

  fraudStats: adminProcedure
    .query(async () => {
      return callPythonService(PYTHON_SERVICES.fraudMl, "/api/v1/fraud/stats", undefined, "GET");
    }),

  // ── Compliance Risk Engine ────────────────────────────────────────────────

  complianceAmlRiskScore: complianceProcedure
    .input(z.object({
      entityId: z.string(),
      entityType: z.enum(["individual", "business"]),
      fullName: z.string(),
      countryOfResidence: z.string(),
      countryOfIncorporation: z.string().optional(),
      industry: z.string().optional(),
      annualRevenue: z.number().optional(),
      transactionVolumeMonthly: z.number().optional(),
      cashIntensive: z.boolean().optional(),
      politicallyExposed: z.boolean().optional(),
      adverseMediaHits: z.number().int().optional(),
    }))
    .mutation(async ({ input }) => {
      return callPythonService(PYTHON_SERVICES.compliance, "/api/v1/compliance/aml-risk-score", {
        entity_id: input.entityId,
        entity_type: input.entityType,
        full_name: input.fullName,
        country_of_residence: input.countryOfResidence,
        country_of_incorporation: input.countryOfIncorporation,
        industry: input.industry,
        annual_revenue: input.annualRevenue,
        transaction_volume_monthly: input.transactionVolumeMonthly,
        cash_intensive: input.cashIntensive,
        politically_exposed: input.politicallyExposed,
        adverse_media_hits: input.adverseMediaHits,
      });
    }),

  compliancePepScreening: complianceProcedure
    .input(z.object({
      fullName: z.string(),
      dateOfBirth: z.string().optional(),
      nationality: z.string().optional(),
      position: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return callPythonService(PYTHON_SERVICES.compliance, "/api/v1/compliance/pep-screening", {
        full_name: input.fullName,
        date_of_birth: input.dateOfBirth,
        nationality: input.nationality,
        position: input.position,
      });
    }),

  complianceSanctionsScreening: complianceProcedure
    .input(z.object({
      fullName: z.string(),
      entityType: z.string(),
      country: z.string().optional(),
      registrationNumber: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return callPythonService(PYTHON_SERVICES.compliance, "/api/v1/compliance/sanctions-screening", {
        full_name: input.fullName,
        entity_type: input.entityType,
        country: input.country,
        registration_number: input.registrationNumber,
      });
    }),

  complianceKybDocumentScore: complianceProcedure
    .input(z.object({
      applicationId: z.string(),
      documentTypesSubmitted: z.array(z.string()),
      businessName: z.string(),
      country: z.string(),
      industry: z.string(),
      yearsInOperation: z.number().int().optional(),
      uboDeclaimed: z.boolean().optional(),
      sourceOfFundsDeclared: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      return callPythonService(PYTHON_SERVICES.compliance, "/api/v1/compliance/kyb-document-score", {
        application_id: input.applicationId,
        document_types_submitted: input.documentTypesSubmitted,
        business_name: input.businessName,
        country: input.country,
        industry: input.industry,
        years_in_operation: input.yearsInOperation,
        ubo_declared: input.uboDeclaimed,
        source_of_funds_declared: input.sourceOfFundsDeclared,
      });
    }),

  complianceDashboard: complianceProcedure
    .query(async () => {
      return callPythonService(PYTHON_SERVICES.compliance, "/api/v1/compliance/risk-dashboard", undefined, "GET");
    }),

  // ── Exchange Rate ML ──────────────────────────────────────────────────────

  ratesForecast: protectedProcedure
    .input(z.object({
      baseCurrency: z.string(),
      quoteCurrency: z.string(),
      horizonHours: z.number().int().optional(),
      currentRate: z.number(),
      historicalRates: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input }) => {
      return callPythonService(PYTHON_SERVICES.exchangeRateMl, "/api/v1/rates/forecast", {
        base_currency: input.baseCurrency,
        quote_currency: input.quoteCurrency,
        horizon_hours: input.horizonHours,
        current_rate: input.currentRate,
        historical_rates: input.historicalRates,
      });
    }),

  ratesOptimizeSpread: adminProcedure
    .input(z.object({
      corridor: z.string(),
      baseSpreadBps: z.number(),
      volume30d: z.number(),
      competitionSpreadBps: z.number().optional(),
      riskScore: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return callPythonService(PYTHON_SERVICES.exchangeRateMl, "/api/v1/rates/optimize-spread", {
        corridor: input.corridor,
        base_spread_bps: input.baseSpreadBps,
        volume_30d: input.volume30d,
        competition_spread_bps: input.competitionSpreadBps,
        risk_score: input.riskScore,
      });
    }),

  ratesCorridorPricing: protectedProcedure
    .input(z.object({
      fromCurrency: z.string(),
      toCurrency: z.string(),
      amount: z.number(),
      sendCountry: z.string(),
      receiveCountry: z.string(),
    }))
    .mutation(async ({ input }) => {
      return callPythonService(PYTHON_SERVICES.exchangeRateMl, "/api/v1/rates/corridor-pricing", {
        from_currency: input.fromCurrency,
        to_currency: input.toCurrency,
        amount: input.amount,
        send_country: input.sendCountry,
        receive_country: input.receiveCountry,
      });
    }),

  ratesLive: protectedProcedure
    .query(async () => {
      return callPythonService(PYTHON_SERVICES.exchangeRateMl, "/api/v1/rates/live", undefined, "GET");
    }),

  ratesAnomalyDetection: adminProcedure
    .input(z.object({
      currencyPair: z.string(),
      rates: z.array(z.number()),
    }))
    .mutation(async ({ input }) => {
      return callPythonService(PYTHON_SERVICES.exchangeRateMl, "/api/v1/rates/anomaly-detection", {
        currency_pair: input.currencyPair,
        rates: input.rates,
      });
    }),

  // ── PDF Report Generator ──────────────────────────────────────────────────

  pdfMerchantRevenue: protectedProcedure
    .input(z.object({
      merchantName: z.string(),
      merchantId: z.string(),
      periodStart: z.string(),
      periodEnd: z.string(),
      totalRevenue: z.number(),
      totalTransactions: z.number().int(),
      currency: z.string(),
      topProducts: z.array(z.record(z.string(), z.any())).optional(),
      dailyBreakdown: z.array(z.record(z.string(), z.any())).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // For PDF we return a URL to download — call service and return base64 or URL
      // In production: upload to S3, return presigned URL
      // Here: return the service URL for direct download
      return {
        downloadUrl: `${PYTHON_SERVICES.pdfReports}/api/v1/reports/merchant-revenue`,
        payload: {
          merchant_name: input.merchantName,
          merchant_id: input.merchantId,
          period_start: input.periodStart,
          period_end: input.periodEnd,
          total_revenue: input.totalRevenue,
          total_transactions: input.totalTransactions,
          currency: input.currency,
          top_products: input.topProducts,
          daily_breakdown: input.dailyBreakdown,
        },
        instructions: "POST payload to downloadUrl with Content-Type: application/json to receive PDF stream",
      };
    }),

  pdfBisInvestigation: bisProcedure
    .input(z.object({
      investigationId: z.string(),
      subjectName: z.string(),
      investigator: z.string(),
      riskScore: z.number(),
      riskLevel: z.string(),
      findings: z.array(z.string()),
      transactions: z.array(z.record(z.string(), z.any())).optional(),
      recommendedAction: z.string(),
    }))
    .mutation(async ({ input }) => {
      return {
        downloadUrl: `${PYTHON_SERVICES.pdfReports}/api/v1/reports/bis-investigation`,
        payload: {
          investigation_id: input.investigationId,
          subject_name: input.subjectName,
          investigator: input.investigator,
          risk_score: input.riskScore,
          risk_level: input.riskLevel,
          findings: input.findings,
          transactions: input.transactions,
          recommended_action: input.recommendedAction,
        },
        instructions: "POST payload to downloadUrl to receive PDF stream",
      };
    }),

  pdfSettlementStatement: adminProcedure
    .input(z.object({
      participantName: z.string(),
      participantId: z.string(),
      settlementPeriod: z.string(),
      netPosition: z.number(),
      currency: z.string(),
      transactions: z.array(z.record(z.string(), z.any())).optional(),
    }))
    .mutation(async ({ input }) => {
      return {
        downloadUrl: `${PYTHON_SERVICES.pdfReports}/api/v1/reports/settlement-statement`,
        payload: {
          participant_name: input.participantName,
          participant_id: input.participantId,
          settlement_period: input.settlementPeriod,
          net_position: input.netPosition,
          currency: input.currency,
          transactions: input.transactions,
        },
        instructions: "POST payload to downloadUrl to receive PDF stream",
      };
    }),

  pdfComplianceReport: complianceProcedure
    .input(z.object({
      entityName: z.string(),
      entityId: z.string(),
      reportType: z.enum(["AML_REVIEW", "KYB_SUMMARY", "SAR"]),
      riskRating: z.string(),
      findings: z.array(z.string()),
      recommendations: z.array(z.string()),
    }))
    .mutation(async ({ input }) => {
      return {
        downloadUrl: `${PYTHON_SERVICES.pdfReports}/api/v1/reports/compliance`,
        payload: {
          entity_name: input.entityName,
          entity_id: input.entityId,
          report_type: input.reportType,
          risk_rating: input.riskRating,
          findings: input.findings,
          recommendations: input.recommendations,
        },
        instructions: "POST payload to downloadUrl to receive PDF stream",
      };
    }),

  // ── Health checks ─────────────────────────────────────────────────────────

  healthCheck: adminProcedure
    .query(async () => {
      const services = [
        { name: "bis-ai-engine", url: PYTHON_SERVICES.bisAi },
        { name: "fraud-ml-service", url: PYTHON_SERVICES.fraudMl },
        { name: "compliance-risk-engine", url: PYTHON_SERVICES.compliance },
        { name: "exchange-rate-ml", url: PYTHON_SERVICES.exchangeRateMl },
        { name: "pdf-report-generator", url: PYTHON_SERVICES.pdfReports },
      ];

      const results = await Promise.allSettled(
        services.map(async (svc) => {
          const res = await fetch(`${svc.url}/health`, {
            signal: (AbortSignal as any).timeout(5000) as AbortSignal,
          });
          const data = await res.json();
          return { name: svc.name, status: "healthy", ...data };
        })
      );

      return results.map((r, i) => ({
        name: services[i].name,
        url: services[i].url,
        status: r.status === "fulfilled" ? "healthy" : "unreachable",
        detail: r.status === "fulfilled" ? r.value : (r as PromiseRejectedResult).reason?.message,
      }));
    }),
});
