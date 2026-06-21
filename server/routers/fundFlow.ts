/**
 * Fund Flow Router — Exposes all 20 atomicity-guaranteed scenarios via tRPC
 *
 * Every mutation in this router:
 * 1. Requires authentication (Permify/Keycloak)
 * 2. Uses distributed locking (Redis)
 * 3. Records to double-entry ledger (TigerBeetle)
 * 4. Publishes audit events (Kafka)
 * 5. Streams to fraud detection (Fluvio)
 * 6. Indexes for search (OpenSearch)
 * 7. Supports saga compensation on failure
 * 8. Enforces idempotency (exactly-once)
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { requirePermission, RESOURCES, ACTIONS } from "../_core/permify";
import {
  scenario1_P2PTransfer,
  scenario2_QRPayment,
  scenario3_FXSwap,
  scenario4_MerchantSettlement,
  scenario5_BookingEscrow,
  scenario5_ReleaseBookingEscrow,
  scenario5_RefundBookingEscrow,
  scenario6_CrossBorderRemittance,
  scenario7_LoyaltyRedemption,
  scenario8_SplitBill,
  scenario9_MultiTip,
  scenario10_TaxRemittance,
  scenario11_Refund,
  scenario12_StablecoinSwap,
  scenario13_AgentCashInOut,
  scenario14_RecurringPayment,
  scenario15_GatewayCharge,
  scenario16_PlatformFee,
  scenario17_LoyaltyAccrual,
  scenario18_ForeignWalletLoad,
  scenario19_RevenueDistribution,
  scenario20_InsuranceClaimPayout,
} from "../_core/fundFlowScenarios";
import { FundFlowContext } from "../_core/fundFlowOrchestrator";
import { startFundFlowWorkflow, signalWorkflow } from "../_core/temporalWorkflows";
import { syncFundFlowRoutes, configureOpenAppSecWAF } from "../_core/apisix";
import crypto from "crypto";

function buildContext(ctx: { user: { id: number; role: string }; sessionId?: string }): FundFlowContext {
  return {
    userId: ctx.user.id,
    userRole: ctx.user.role,
    sessionId: ctx.sessionId || crypto.randomUUID(),
  };
}

function uid(ctx: { user: { id: number } }): string {
  return String(ctx.user.id);
}

export const fundFlowRouter = router({
  // ─── Scenario 1: P2P Transfer ──────────────────────────────────────────────
  p2pTransfer: protectedProcedure
    .input(z.object({
      recipientUserId: z.number(),
      amount: z.number().positive().max(1_000_000),
      currency: z.string().min(2).max(10),
      note: z.string().max(200).optional(),
      idempotencyKey: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.WALLET, ACTIONS.EXECUTE, undefined);
      return scenario1_P2PTransfer(buildContext(ctx), input);
    }),

  // ─── Scenario 2: QR Payment ────────────────────────────────────────────────
  qrPayment: protectedProcedure
    .input(z.object({
      establishmentId: z.number(),
      amount: z.number().positive(),
      currency: z.string(),
      qrTokenId: z.string(),
      idempotencyKey: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.PAYMENT, ACTIONS.EXECUTE, undefined);
      return scenario2_QRPayment(buildContext(ctx), input);
    }),

  // ─── Scenario 3: FX Swap ───────────────────────────────────────────────────
  fxSwap: protectedProcedure
    .input(z.object({
      fromCurrency: z.string(),
      toCurrency: z.string(),
      amount: z.number().positive(),
      idempotencyKey: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.WALLET, ACTIONS.EXECUTE, undefined);
      return scenario3_FXSwap(buildContext(ctx), input);
    }),

  // ─── Scenario 4: Merchant Settlement ───────────────────────────────────────
  merchantSettlement: protectedProcedure
    .input(z.object({
      establishmentId: z.number(),
      amount: z.number().positive(),
      currency: z.string(),
      bankAccount: z.string(),
      tPlusDays: z.number().int().min(0).max(30),
      idempotencyKey: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.SETTLEMENT, ACTIONS.EXECUTE, undefined);
      return scenario4_MerchantSettlement(buildContext(ctx), input);
    }),

  // ─── Scenario 5: Booking Escrow ────────────────────────────────────────────
  escrowHold: protectedProcedure
    .input(z.object({
      bookingId: z.string(),
      establishmentId: z.number(),
      amount: z.number().positive(),
      currency: z.string(),
      idempotencyKey: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.PAYMENT, ACTIONS.EXECUTE, undefined);
      const result = await scenario5_BookingEscrow(buildContext(ctx), input);
      // Start Temporal escrow workflow for timeout management
      if (result.success && result.ledgerTransferId) {
        await startFundFlowWorkflow("escrow", {
          bookingId: input.bookingId,
          userId: ctx.user.id,
          establishmentId: input.establishmentId,
          amount: input.amount,
          currency: input.currency,
          holdDurationMs: 72 * 60 * 60 * 1000, // 72h default
          pendingTransferId: result.ledgerTransferId,
        });
      }
      return result;
    }),

  escrowRelease: protectedProcedure
    .input(z.object({
      transactionId: z.string(),
      pendingTransferId: z.string(),
      establishmentId: z.number(),
      amount: z.number().positive(),
      currency: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.PAYMENT, ACTIONS.APPROVE, undefined);
      const success = await scenario5_ReleaseBookingEscrow(
        input.transactionId, input.pendingTransferId,
        input.establishmentId, input.amount, input.currency,
      );
      return { success };
    }),

  escrowRefund: protectedProcedure
    .input(z.object({
      transactionId: z.string(),
      pendingTransferId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.PAYMENT, ACTIONS.EXECUTE, undefined);
      const success = await scenario5_RefundBookingEscrow(input.transactionId, input.pendingTransferId);
      return { success };
    }),

  // ─── Scenario 6: Cross-Border Remittance ───────────────────────────────────
  crossBorderRemittance: protectedProcedure
    .input(z.object({
      recipientMsisdn: z.string().min(10).max(15),
      amount: z.number().positive(),
      sourceCurrency: z.string(),
      destCurrency: z.string(),
      corridor: z.string(),
      idempotencyKey: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.PAYMENT, ACTIONS.EXECUTE, undefined);
      // Start Temporal workflow for durability
      const workflowId = await startFundFlowWorkflow("remittance", {
        ...input,
        senderId: ctx.user.id,
      });
      const result = await scenario6_CrossBorderRemittance(buildContext(ctx), input);
      return { ...result, temporalWorkflowId: workflowId || result.temporalWorkflowId };
    }),

  // ─── Scenario 7: Loyalty Points Redemption ─────────────────────────────────
  redeemLoyaltyPoints: protectedProcedure
    .input(z.object({
      points: z.number().int().positive(),
      rewardValue: z.number().positive(),
      currency: z.string(),
      idempotencyKey: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.LOYALTY, ACTIONS.EXECUTE, undefined);
      return scenario7_LoyaltyRedemption(buildContext(ctx), input);
    }),

  // ─── Scenario 8: Split Bill ────────────────────────────────────────────────
  splitBillPayment: protectedProcedure
    .input(z.object({
      establishmentId: z.number(),
      totalAmount: z.number().positive(),
      currency: z.string(),
      participants: z.array(z.object({
        userId: z.number(),
        share: z.number().positive().max(1),
      })).min(2),
      idempotencyKey: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Validate shares sum to 1.0
      const totalShares = input.participants.reduce((sum, p) => sum + p.share, 0);
      if (Math.abs(totalShares - 1.0) > 0.001) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Participant shares must sum to 1.0" });
      }
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.PAYMENT, ACTIONS.EXECUTE, undefined);
      return scenario8_SplitBill(buildContext(ctx), input);
    }),

  // ─── Scenario 9: Multi-Tip ─────────────────────────────────────────────────
  multiTip: protectedProcedure
    .input(z.object({
      recipients: z.array(z.object({
        userId: z.number(),
        amount: z.number().positive(),
      })).min(1).max(20),
      currency: z.string(),
      taxRate: z.number().min(0).max(0.5),
      idempotencyKey: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.PAYMENT, ACTIONS.EXECUTE, undefined);
      return scenario9_MultiTip(buildContext(ctx), input);
    }),

  // ─── Scenario 10: Tax Remittance ───────────────────────────────────────────
  taxRemittance: protectedProcedure
    .input(z.object({
      establishmentId: z.number(),
      taxAmount: z.number().positive(),
      currency: z.string(),
      jurisdiction: z.string(),
      period: z.string(),
      idempotencyKey: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.SETTLEMENT, ACTIONS.EXECUTE, undefined);
      return scenario10_TaxRemittance(buildContext(ctx), input);
    }),

  // ─── Scenario 11: Refund ───────────────────────────────────────────────────
  processRefund: protectedProcedure
    .input(z.object({
      originalTransactionId: z.string(),
      userId: z.number(),
      amount: z.number().positive(),
      currency: z.string(),
      reason: z.string().max(500),
      idempotencyKey: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.PAYMENT, ACTIONS.APPROVE, undefined);
      return scenario11_Refund(buildContext(ctx), input);
    }),

  // ─── Scenario 12: Stablecoin Swap ──────────────────────────────────────────
  stablecoinSwap: protectedProcedure
    .input(z.object({
      fromStablecoin: z.string(),
      toStablecoin: z.string(),
      amount: z.number().positive(),
      idempotencyKey: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.WALLET, ACTIONS.EXECUTE, undefined);
      return scenario12_StablecoinSwap(buildContext(ctx), input);
    }),

  // ─── Scenario 13: Agent Cash-In/Out ────────────────────────────────────────
  agentCashInOut: protectedProcedure
    .input(z.object({
      agentEstablishmentId: z.number(),
      amount: z.number().positive(),
      currency: z.string(),
      direction: z.enum(["cash_in", "cash_out"]),
      idempotencyKey: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.WALLET, ACTIONS.EXECUTE, undefined);
      return scenario13_AgentCashInOut(buildContext(ctx), input);
    }),

  // ─── Scenario 14: Recurring Payment ────────────────────────────────────────
  recurringPayment: protectedProcedure
    .input(z.object({
      recipientUserId: z.number().optional(),
      recipientEstablishmentId: z.number().optional(),
      amount: z.number().positive(),
      currency: z.string(),
      scheduleId: z.string(),
      idempotencyKey: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.PAYMENT, ACTIONS.EXECUTE, undefined);
      return scenario14_RecurringPayment(buildContext(ctx), input);
    }),

  // ─── Scenario 15: Gateway Charge ───────────────────────────────────────────
  gatewayCharge: protectedProcedure
    .input(z.object({
      provider: z.enum(["paystack", "flutterwave"]),
      amount: z.number().positive(),
      currency: z.string(),
      gatewayReference: z.string(),
      idempotencyKey: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.WALLET, ACTIONS.EXECUTE, undefined);
      return scenario15_GatewayCharge(buildContext(ctx), input);
    }),

  // ─── Scenario 16: Platform Fee ─────────────────────────────────────────────
  collectPlatformFee: protectedProcedure
    .input(z.object({
      sourceUserId: z.number().optional(),
      sourceEstablishmentId: z.number().optional(),
      amount: z.number().positive(),
      currency: z.string(),
      feeType: z.string(),
      idempotencyKey: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.SETTLEMENT, ACTIONS.EXECUTE, undefined);
      return scenario16_PlatformFee(buildContext(ctx), input);
    }),

  // ─── Scenario 17: Loyalty Accrual ──────────────────────────────────────────
  accruePoints: protectedProcedure
    .input(z.object({
      transactionAmount: z.number().positive(),
      pointsMultiplier: z.number().positive().max(10),
      currency: z.string(),
      idempotencyKey: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      return scenario17_LoyaltyAccrual(buildContext(ctx), input);
    }),

  // ─── Scenario 18: Foreign Wallet Load ──────────────────────────────────────
  foreignWalletLoad: protectedProcedure
    .input(z.object({
      source: z.enum(["SWIFT", "CARD", "AGENT", "PARTNER"]),
      amount: z.number().positive(),
      currency: z.string(),
      externalReference: z.string(),
      idempotencyKey: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.WALLET, ACTIONS.EXECUTE, undefined);
      return scenario18_ForeignWalletLoad(buildContext(ctx), input);
    }),

  // ─── Scenario 19: Revenue Distribution ─────────────────────────────────────
  distributeRevenue: protectedProcedure
    .input(z.object({
      establishmentId: z.number(),
      totalRevenue: z.number().positive(),
      currency: z.string(),
      splits: z.array(z.object({
        recipientUserId: z.number(),
        percentage: z.number().positive().max(100),
      })).min(1),
      idempotencyKey: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const totalPct = input.splits.reduce((sum, s) => sum + s.percentage, 0);
      if (Math.abs(totalPct - 100) > 0.01) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Split percentages must sum to 100" });
      }
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.SETTLEMENT, ACTIONS.EXECUTE, undefined);
      return scenario19_RevenueDistribution(buildContext(ctx), input);
    }),

  // ─── Scenario 20: Insurance Claim Payout ───────────────────────────────────
  insuranceClaimPayout: protectedProcedure
    .input(z.object({
      claimId: z.string(),
      userId: z.number(),
      amount: z.number().positive(),
      currency: z.string(),
      policyType: z.string(),
      idempotencyKey: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.SETTLEMENT, ACTIONS.APPROVE, undefined);
      return scenario20_InsuranceClaimPayout(buildContext(ctx), input);
    }),

  // ─── Workflow Signal (for escrow/fraud investigation) ──────────────────────
  signalWorkflow: protectedProcedure
    .input(z.object({
      workflowId: z.string(),
      signalName: z.string(),
      payload: z.unknown().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.SYSTEM, ACTIONS.EXECUTE, undefined);
      const success = await signalWorkflow(input.workflowId, input.signalName, input.payload);
      return { success };
    }),

  // ─── Reconciliation Trigger ────────────────────────────────────────────────
  triggerReconciliation: protectedProcedure
    .input(z.object({ type: z.enum(["full", "incremental"]).default("full") }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.SYSTEM, ACTIONS.EXECUTE, undefined);
      // Start reconciliation workflow via Temporal
      const workflowId = await startFundFlowWorkflow("settlement", {
        windowId: `recon-${Date.now()}`,
        type: input.type,
      });
      return { initiated: true, workflowId };
    }),

  // ─── Gateway Protection Sync ───────────────────────────────────────────────
  syncGatewayProtection: protectedProcedure
    .input(z.object({}))
    .mutation(async ({ ctx }) => {
      await requirePermission(uid(ctx), ctx.user.role, RESOURCES.SYSTEM, ACTIONS.EXECUTE, undefined);
      const routesSynced = await syncFundFlowRoutes();
      const wafConfigured = await configureOpenAppSecWAF();
      return { routesSynced, wafConfigured };
    }),
});
