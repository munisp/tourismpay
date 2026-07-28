/**
 * TourismPay — Journey V2 Orchestrator tRPC Router
 *
 * Provides tRPC mutations and queries for all 20 new stakeholder journeys.
 * Each mutation calls the corresponding workflow function from journey-workflows-v2.ts.
 * Each query reads from the DB directly (read path).
 *
 * Architecture:
 *   tRPC mutation → workflowFn() → activities → DB + services
 *   tRPC query    → direct DB read
 */

import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getWorkflowStatus } from "../_core/temporal-integration";

// Import all 20 journey workflow functions
import {
  bnplHotelBookingWorkflow,
  aiTripWithInsuranceWorkflow,
  diasporaGiftRedemptionWorkflow,
  openBankingTopUpWorkflow,
  eVisaDirectBookingWorkflow,
  groupMiceBnplWorkflow,
  dccPosPaymentWorkflow,
  revenuePmsRateSyncWorkflow,
  tourismIntelligenceComplianceWorkflow,
  geospatialLoyaltyZoneWorkflow,
  whiteLabelTenantOnboardingWorkflow,
  lakehouseEtlRefreshWorkflow,
  insuranceClaimBisWorkflow,
  aiRevenueRecommendationWorkflow,
  openBankingMerchantPayoutWorkflow,
  groupTravelCancellationWorkflow,
  geospatialAgentTerritoryWorkflow,
  whiteLabelSettlementWorkflow,
  aiFraudBisEscalationWorkflow,
  fullTouristLifecycleWorkflow,
} from "../temporal/journey-workflows-v2";

const db = () => getDb();

export const journeyV2OrchestratorRouter = router({

  // ─── J01: BNPL-Backed Hotel Booking ────────────────────────────────────────
  startBnplHotelBooking: protectedProcedure
    .input(z.object({
      hotelId: z.string(),
      checkIn: z.string(),
      checkOut: z.string(),
      totalAmountNgn: z.number().min(10000).max(50_000_000),
      instalments: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(6), z.literal(12)]),
      currency: z.string().default("NGN"),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await bnplHotelBookingWorkflow({
          touristId: String(ctx.user.id),
          ...input,
        });
        return { ...result, message: `BNPL hotel booking confirmed. ${input.instalments} instalments.` };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      }
    }),

  getBnplPlan: protectedProcedure
    .input(z.object({ planId: z.string() }))
    .query(async ({ input, ctx }) => {
      const rows = await db().execute(sql`
        SELECT * FROM bnpl_plans WHERE id = ${input.planId} AND tourist_id = ${String(ctx.user.id)} LIMIT 1
      `);
      if (!(rows as any[]).length) throw new TRPCError({ code: "NOT_FOUND", message: "BNPL plan not found" });
      return (rows as any[])[0];
    }),

  // ─── J02: AI-Planned Trip with Insurance ───────────────────────────────────
  startAiTripInsurance: protectedProcedure
    .input(z.object({
      destination: z.string().min(2),
      departureDate: z.string(),
      returnDate: z.string(),
      coverageType: z.enum(["basic", "standard", "comprehensive"]),
      premiumNgn: z.number().min(1000).max(5_000_000),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await aiTripWithInsuranceWorkflow({
          touristId: String(ctx.user.id),
          ...input,
        });
        return { ...result, message: `AI trip planned and insurance policy ${result.policyId} activated.` };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      }
    }),

  getInsurancePolicy: protectedProcedure
    .input(z.object({ policyNumber: z.string() }))
    .query(async ({ input }) => {
      const rows = await db().execute(sql`
        SELECT * FROM insurance_policies WHERE policy_number = ${input.policyNumber} LIMIT 1
      `);
      return (rows as any[])[0] ?? null;
    }),

  // ─── J03: Diaspora Gift Redemption ─────────────────────────────────────────
  startDiasporaGiftRedemption: protectedProcedure
    .input(z.object({
      giftId: z.string(),
      establishmentId: z.string(),
      amountNgn: z.number().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await diasporaGiftRedemptionWorkflow({
          recipientId: String(ctx.user.id),
          ...input,
        });
        return { ...result, message: `Gift redeemed! ₦${input.amountNgn.toLocaleString()} credited. Earned ${result.loyaltyEarned} loyalty points.` };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      }
    }),

  getDiasporaGift: protectedProcedure
    .input(z.object({ giftId: z.string() }))
    .query(async ({ input }) => {
      const rows = await db().execute(sql`
        SELECT * FROM diaspora_gifts WHERE id = ${input.giftId} LIMIT 1
      `);
      return (rows as any[])[0] ?? null;
    }),

  // ─── J04: Open Banking Wallet Top-Up with Fraud Check ──────────────────────
  startOpenBankingTopUp: protectedProcedure
    .input(z.object({
      bankConnectionId: z.string(),
      amountNgn: z.number().min(100).max(10_000_000),
      bankCode: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await openBankingTopUpWorkflow({
          touristId: String(ctx.user.id),
          ...input,
        });
        return { ...result, message: `₦${input.amountNgn.toLocaleString()} added via Open Banking.` };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      }
    }),

  getOpenBankingConnections: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db().execute(sql`
      SELECT id, provider, bank_name, bank_code, account_name, status, total_topup_ngn, created_at
      FROM open_banking_connections WHERE user_id = ${String(ctx.user.id)} AND status = 'active'
      ORDER BY created_at DESC
    `);
    return rows as any[];
  }),

  // ─── J05: e-Visa + Direct Hotel Booking Bundle ─────────────────────────────
  startEVisaDirectBooking: protectedProcedure
    .input(z.object({
      passportCountry: z.string().length(2),
      hotelId: z.string(),
      checkIn: z.string(),
      checkOut: z.string(),
      visaFeeNgn: z.number().min(1000),
      bookingAmountNgn: z.number().min(10000),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await eVisaDirectBookingWorkflow({
          touristId: String(ctx.user.id),
          ...input,
        });
        return { ...result, message: `e-Visa and hotel booking bundle confirmed. Total: ₦${result.totalCharged.toLocaleString()}.` };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      }
    }),

  getEVisaPayment: protectedProcedure
    .input(z.object({ visaRef: z.string() }))
    .query(async ({ input }) => {
      const rows = await db().execute(sql`
        SELECT * FROM evisa_payments WHERE id = ${input.visaRef} LIMIT 1
      `);
      return (rows as any[])[0] ?? null;
    }),

  // ─── J06: Group MICE Booking with BNPL Split ───────────────────────────────
  startGroupMiceBnpl: protectedProcedure
    .input(z.object({
      hotelId: z.string(),
      groupName: z.string().min(2),
      attendees: z.number().int().min(5).max(5000),
      eventDate: z.string(),
      totalAmountNgn: z.number().min(100_000),
      depositPct: z.number().min(10).max(50).default(20),
      instalments: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(6)]),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await groupMiceBnplWorkflow({
          merchantId: String(ctx.user.id),
          ...input,
        });
        return { ...result, message: `Group booking ${result.groupBookingId} confirmed with BNPL plan.` };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      }
    }),

  getGroupBooking: protectedProcedure
    .input(z.object({ groupBookingId: z.string() }))
    .query(async ({ input }) => {
      const rows = await db().execute(sql`
        SELECT * FROM group_bookings WHERE id = ${input.groupBookingId} LIMIT 1
      `);
      return (rows as any[])[0] ?? null;
    }),

  // ─── J07: DCC Payment at POS with Loyalty Earn ─────────────────────────────
  startDccPosPayment: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      amountNgn: z.number().min(100),
      homeCurrency: z.string().length(3),
      homeAmount: z.number().positive(),
      fxRate: z.number().positive(),
      establishmentId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await dccPosPaymentWorkflow({
          touristId: String(ctx.user.id),
          ...input,
        });
        return { ...result, message: `DCC payment successful. Earned ${result.loyaltyEarned} loyalty points.` };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      }
    }),

  getDccTransaction: protectedProcedure
    .input(z.object({ txRef: z.string() }))
    .query(async ({ input }) => {
      const rows = await db().execute(sql`
        SELECT * FROM dcc_transactions WHERE id = ${input.txRef} LIMIT 1
      `);
      return (rows as any[])[0] ?? null;
    }),

  // ─── J08: Revenue Management + PMS Rate Sync ───────────────────────────────
  startRevenuePmsSync: protectedProcedure
    .input(z.object({
      hotelId: z.string(),
      recommendationId: z.string(),
      newRateNgn: z.number().positive(),
      roomType: z.string(),
      effectiveDate: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await revenuePmsRateSyncWorkflow({
          merchantId: String(ctx.user.id),
          ...input,
        });
        return { ...result, message: `Rate synced to PMS. ${result.pmsUpdated ? "PMS updated." : "No PMS connected."}` };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      }
    }),

  getRevenueRecommendations: protectedProcedure
    .input(z.object({ hotelId: z.string() }))
    .query(async ({ input }) => {
      const rows = await db().execute(sql`
        SELECT * FROM revenue_recommendations WHERE hotel_id = ${input.hotelId}
        ORDER BY created_at DESC LIMIT 20
      `);
      return rows as any[];
    }),

  // ─── J09: Tourism Intelligence Report for Compliance ───────────────────────
  startTourismIntelligenceReport: adminProcedure
    .input(z.object({
      reportType: z.string(),
      periodStart: z.string(),
      periodEnd: z.string(),
      country: z.string().default("NG"),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await tourismIntelligenceComplianceWorkflow({
          complianceOfficerId: String(ctx.user.id),
          ...input,
        });
        return { ...result, message: `Intelligence report generated. Snapshot ID: ${result.snapshotId}.` };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      }
    }),

  getTourismSnapshot: adminProcedure
    .input(z.object({ snapshotId: z.string() }))
    .query(async ({ input }) => {
      const rows = await db().execute(sql`
        SELECT * FROM tourism_intelligence_snapshots WHERE id = ${input.snapshotId} LIMIT 1
      `);
      return (rows as any[])[0] ?? null;
    }),

  // ─── J10: Geospatial Loyalty Zone Activation ───────────────────────────────
  startGeospatialLoyaltyZone: adminProcedure
    .input(z.object({
      zoneName: z.string().min(2),
      city: z.string(),
      centerLat: z.number().min(-90).max(90),
      centerLng: z.number().min(-180).max(180),
      radiusMetres: z.number().int().min(100).max(50000),
      bonusMultiplier: z.number().min(1.0).max(10.0),
      minSpendNgn: z.number().min(0).default(0),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await geospatialLoyaltyZoneWorkflow({
          adminId: String(ctx.user.id),
          ...input,
        });
        return { ...result, message: `Loyalty zone ${result.zoneId} created. ${result.affectedEstablishments} establishments in zone.` };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      }
    }),

  getGeospatialZones: protectedProcedure
    .input(z.object({ city: z.string().optional() }))
    .query(async ({ input }) => {
      const rows = await db().execute(sql`
        SELECT * FROM geospatial_loyalty_zones
        WHERE active = true
          AND (${input.city ?? null} IS NULL OR city = ${input.city ?? null})
        ORDER BY created_at DESC LIMIT 50
      `);
      return rows as any[];
    }),

  // ─── J11: White Label Tenant Onboarding ────────────────────────────────────
  startWhiteLabelOnboarding: adminProcedure
    .input(z.object({
      tenantName: z.string().min(2).max(200),
      tenantDomain: z.string().min(3),
      primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#1a73e8"),
      contactEmail: z.string().email(),
      planType: z.enum(["starter", "professional", "enterprise"]).default("professional"),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await whiteLabelTenantOnboardingWorkflow({
          adminId: String(ctx.user.id),
          ...input,
        });
        return { ...result, message: `White label tenant ${result.tenantId} onboarded successfully.` };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      }
    }),

  getWhiteLabelTenant: adminProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      const rows = await db().execute(sql`
        SELECT * FROM white_label_tenants WHERE id = ${input.tenantId} LIMIT 1
      `);
      return (rows as any[])[0] ?? null;
    }),

  // ─── J12: Lakehouse ETL Trigger + Analytics Refresh ────────────────────────
  startLakehouseEtl: adminProcedure
    .input(z.object({
      jobName: z.string().min(2),
      targetTables: z.array(z.string()).min(1).max(20),
      priority: z.enum(["low", "normal", "high"]).default("normal"),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await lakehouseEtlRefreshWorkflow({
          adminId: String(ctx.user.id),
          ...input,
        });
        return { ...result, message: `ETL job "${input.jobName}" completed. ${result.tablesRefreshed} tables refreshed.` };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      }
    }),

  getEtlRuns: adminProcedure
    .input(z.object({ jobName: z.string().optional() }))
    .query(async ({ input }) => {
      const rows = await db().execute(sql`
        SELECT * FROM lakehouse_etl_runs
        WHERE (${input.jobName ?? null} IS NULL OR job_type = ${input.jobName ?? null})
        ORDER BY created_at DESC LIMIT 20
      `);
      return rows as any[];
    }),

  // ─── J13: Insurance Claim with BIS Fraud Check ─────────────────────────────
  startInsuranceClaim: protectedProcedure
    .input(z.object({
      policyId: z.string(),
      claimType: z.enum(["medical", "trip_cancellation", "baggage_loss", "flight_delay", "emergency"]),
      claimAmountNgn: z.number().min(1000).max(50_000_000),
      description: z.string().min(10).max(2000),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await insuranceClaimBisWorkflow({
          touristId: String(ctx.user.id),
          ...input,
        });
        return {
          ...result,
          message: result.bisCheckPassed
            ? `Claim ${result.claimId} approved. Payout ref: ${result.payoutRef}.`
            : `Claim ${result.claimId} under review. BIS check flagged for manual review.`,
        };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      }
    }),

  getInsuranceClaims: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db().execute(sql`
      SELECT ic.*, ip.policy_number FROM insurance_claims ic
      LEFT JOIN insurance_policies ip ON ip.id = ic.policy_id
      WHERE ic.user_id::text = ${String(ctx.user.id)}
      ORDER BY ic.created_at DESC LIMIT 20
    `);
    return rows as any[];
  }),

  // ─── J14: AI Revenue Recommendation Acceptance ─────────────────────────────
  startAiRevenueRecommendation: protectedProcedure
    .input(z.object({
      hotelId: z.string(),
      recommendationType: z.string(),
      currentRevenue: z.number().min(0),
      projectedRevenue: z.number().min(0),
      actions: z.array(z.string()).min(1).max(10),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await aiRevenueRecommendationWorkflow({
          merchantId: String(ctx.user.id),
          ...input,
        });
        return { ...result, message: `AI recommendation ${result.recommendationId} created. Projected uplift: ₦${result.projectedUplift.toLocaleString()}.` };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      }
    }),

  acceptRevenueRecommendation: protectedProcedure
    .input(z.object({ recommendationId: z.string(), hotelId: z.string() }))
    .mutation(async ({ input }) => {
      await db().execute(sql`
        UPDATE revenue_recommendations SET applied = true, applied_at = NOW()
        WHERE id = ${input.recommendationId} AND hotel_id = ${input.hotelId}
      `);
      return { success: true, message: "Recommendation accepted and applied." };
    }),

  // ─── J15: Open Banking Merchant Payout ─────────────────────────────────────
  startOpenBankingPayout: protectedProcedure
    .input(z.object({
      bankConnectionId: z.string(),
      amountNgn: z.number().min(1000).max(100_000_000),
      bankAccountNumber: z.string(),
      bankCode: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await openBankingMerchantPayoutWorkflow({
          merchantId: String(ctx.user.id),
          ...input,
        });
        return { ...result, message: `Payout ${result.payoutRef} initiated. Processing.` };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      }
    }),

  getPayoutHistory: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db().execute(sql`
      SELECT * FROM merchant_payments WHERE merchant_id = ${String(ctx.user.id)}
        AND payment_type = 'open_banking_payout'
      ORDER BY created_at DESC LIMIT 20
    `);
    return rows as any[];
  }),

  // ─── J16: Group Travel Cancellation + BNPL Refund ──────────────────────────
  startGroupCancellation: protectedProcedure
    .input(z.object({
      groupBookingId: z.string(),
      bnplPlanId: z.string(),
      cancellationReason: z.string().min(10),
      refundAmountNgn: z.number().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await groupTravelCancellationWorkflow({
          touristId: String(ctx.user.id),
          ...input,
        });
        return { ...result, message: `Group booking cancelled. Refund ${result.refundRef} processed.` };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      }
    }),

  // ─── J17: Geospatial Agent Territory Assignment ─────────────────────────────
  startAgentTerritoryAssignment: adminProcedure
    .input(z.object({
      agentId: z.string(),
      city: z.string(),
      centerLat: z.number().min(-90).max(90),
      centerLng: z.number().min(-180).max(180),
      radiusKm: z.number().min(0.5).max(100),
      agentType: z.enum(["field_agent", "senior_agent", "regional_manager"]).default("field_agent"),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await geospatialAgentTerritoryWorkflow({
          nocOperatorId: String(ctx.user.id),
          ...input,
        });
        return { ...result, message: `Territory ${result.territoryId} assigned to agent ${input.agentId}. ${result.establishmentsInTerritory} establishments.` };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      }
    }),

  // ─── J18: White Label Tenant Revenue Settlement ─────────────────────────────
  startWhiteLabelSettlement: adminProcedure
    .input(z.object({
      tenantId: z.string(),
      periodStart: z.string(),
      periodEnd: z.string(),
      revenueNgn: z.number().min(0),
      platformFeePercent: z.number().min(0.5).max(10).default(1.5),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await whiteLabelSettlementWorkflow({
          settlementOfficerId: String(ctx.user.id),
          ...input,
        });
        return { ...result, message: `Settlement ${result.settlementRef} completed. Net payout: ₦${result.netPayoutNgn.toLocaleString()}.` };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      }
    }),

  getWhiteLabelSettlements: adminProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      const rows = await db().execute(sql`
        SELECT * FROM merchant_payments WHERE merchant_id = ${input.tenantId}
          AND payment_type = 'white_label_settlement'
        ORDER BY created_at DESC LIMIT 20
      `);
      return rows as any[];
    }),

  // ─── J19: AI Fraud Detection + BIS Escalation ──────────────────────────────
  startAiFraudBisEscalation: adminProcedure
    .input(z.object({
      suspectUserId: z.string(),
      triggerType: z.string(),
      riskScore: z.number().min(0).max(100),
      transactionRef: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await aiFraudBisEscalationWorkflow({
          complianceOfficerId: String(ctx.user.id),
          ...input,
        });
        return {
          ...result,
          message: `Fraud case ${result.fraudCaseId} created. BIS investigation ${result.bisInvestigationId} opened.${result.accountFrozen ? " Account frozen." : ""}`,
        };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      }
    }),

  getFraudCases: adminProcedure
    .input(z.object({ userId: z.string().optional() }))
    .query(async ({ input }) => {
      const rows = await db().execute(sql`
        SELECT * FROM fraud_alerts
        WHERE (${input.userId ?? null} IS NULL OR user_id::text = ${input.userId ?? null})
        ORDER BY created_at DESC LIMIT 50
      `);
      return rows as any[];
    }),

  // ─── J20: Full Tourist Lifecycle ───────────────────────────────────────────
  startFullTouristLifecycle: protectedProcedure
    .input(z.object({
      passportCountry: z.string().length(2),
      destination: z.string().min(2),
      hotelId: z.string(),
      checkIn: z.string(),
      checkOut: z.string(),
      budgetNgn: z.number().min(50_000).max(100_000_000),
      insuranceCoverage: z.enum(["basic", "standard", "comprehensive"]).default("standard"),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await fullTouristLifecycleWorkflow({
          touristId: String(ctx.user.id),
          ...input,
        });
        return {
          ...result,
          message: `Full tourist lifecycle complete! Visa, insurance, hotel, and AI itinerary ready. Wallet balance: ₦${result.walletBalance.toLocaleString()}. Loyalty points: ${result.loyaltyPoints}.`,
        };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      }
    }),

  getTouristLifecycleSummary: protectedProcedure.query(async ({ ctx }) => {
    const userId = String(ctx.user.id);
    const [wallet, loyalty, bookings, policies, visas] = await Promise.all([
      db().execute(sql`SELECT COALESCE(balance, 0) as balance FROM wallet_balances WHERE user_id = ${userId} AND currency = 'NGN' LIMIT 1`),
      db().execute(sql`SELECT COALESCE(SUM(CASE WHEN transaction_type = 'earn' THEN points ELSE -points END), 0) as total FROM loyalty_transactions WHERE user_id::text = ${userId}`),
      db().execute(sql`SELECT COUNT(*) as cnt FROM direct_bookings WHERE hotel_id IS NOT NULL LIMIT 1`),
      db().execute(sql`SELECT COUNT(*) as cnt FROM insurance_policies WHERE user_id::text = ${userId} AND status = 'active'`),
      db().execute(sql`SELECT COUNT(*) as cnt FROM evisa_payments WHERE tourist_id = ${userId}`),
    ]);
    return {
      walletBalance: Number((wallet as any[])[0]?.balance ?? 0),
      loyaltyPoints: Number((loyalty as any[])[0]?.total ?? 0),
      bookingCount: Number((bookings as any[])[0]?.cnt ?? 0),
      activePolicies: Number((policies as any[])[0]?.cnt ?? 0),
      visaCount: Number((visas as any[])[0]?.cnt ?? 0),
    };
  }),

  // ─── SHARED: Workflow Status ────────────────────────────────────────────────
  getWorkflowStatus: protectedProcedure
    .input(z.object({ workflowId: z.string() }))
    .query(async ({ input }) => {
      return getWorkflowStatus(input.workflowId);
    }),
});
