/**
 * Payment Rails Router — unified payment initiation via M-Pesa, Flutterwave, Wise.
 * Stripe Connect is handled separately via stripeConnect router.
 */
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import {
  initiatePayment,
  verifyPayment,
  refundPayment,
  getAvailableProviders,
  type PaymentProvider,
} from "../integrations/paymentRails";

export const paymentRailsRouter = router({
  /** List available payment providers and their status. */
  providers: publicProcedure.query(() => getAvailableProviders()),

  /** Initiate a payment via any supported provider. */
  initiate: protectedProcedure
    .input(z.object({
      amount: z.number().positive(),
      currency: z.string().length(3),
      provider: z.enum(["mpesa", "flutterwave", "wise"]),
      reference: z.string().min(1).max(64),
      description: z.string().optional(),
      metadata: z.record(z.string(), z.string()).optional(),
      // Provider-specific
      mpesaPhoneNumber: z.string().optional(),
      flutterwavePaymentType: z.enum(["card", "mobilemoney", "banktransfer"]).optional(),
      wiseTargetCurrency: z.string().optional(),
      wiseRecipientId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return initiatePayment(input);
    }),

  /** Check payment status. */
  verify: protectedProcedure
    .input(z.object({
      provider: z.enum(["mpesa", "flutterwave", "wise"]),
      transactionId: z.string(),
    }))
    .query(async ({ input }) => {
      return verifyPayment(input.provider as PaymentProvider, input.transactionId);
    }),

  /** Refund a payment. */
  refund: protectedProcedure
    .input(z.object({
      provider: z.enum(["flutterwave"]),
      transactionId: z.string(),
      amount: z.number().positive().optional(),
    }))
    .mutation(async ({ input }) => {
      return refundPayment(input.provider as PaymentProvider, input.transactionId, input.amount);
    }),
});
