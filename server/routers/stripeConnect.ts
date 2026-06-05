/**
 * Stripe Connect Router
 * Manages Stripe Connect Express account onboarding for merchant payouts.
 *
 * Procedures:
 *   stripeConnect.getStatus        — get current Connect status for an establishment
 *   stripeConnect.createOnboardingLink — create an account link for onboarding
 *   stripeConnect.handleReturn      — handle return from Stripe onboarding (refresh status)
 *   stripeConnect.getPayoutBalance  — get available/pending balance for connected account
 *   stripeConnect.triggerPayout     — initiate a payout to the merchant's bank account
 *   stripeConnect.listPayouts       — list recent payouts for a connected account
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { establishments } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { stripe } from "../_core/stripe";
import { TRPCError } from "@trpc/server";
import { createAuditLog, createUserNotification } from "../db";

function requireStripe() {
  if (!stripe) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Stripe is not configured — set STRIPE_SECRET_KEY" });
  return stripe;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function requireEstablishment(establishmentId: number, userId: number, isAdmin: boolean) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const [est] = await db
    .select()
    .from(establishments)
    .where(eq(establishments.id, establishmentId))
    .limit(1);
  if (!est) throw new TRPCError({ code: "NOT_FOUND", message: "Establishment not found" });
  if (est.ownerId !== userId && !isAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
  }
  return { db, est };
}

export const stripeConnectRouter = router({
  /** Get Stripe Connect status for an establishment */
  getStatus: protectedProcedure
    .input(z.object({ establishmentId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const { est } = await requireEstablishment(
        input.establishmentId,
        ctx.user.id,
        ctx.user.role === "admin"
      );
      // If we have an account, refresh status from Stripe
      if (est.stripeAccountId) {
        try {
          const account = await requireStripe().accounts.retrieve(est.stripeAccountId);
          const db = await getDb();
          if (db) {
            await db
              .update(establishments)
              .set({
                stripePayoutsEnabled: account.payouts_enabled ?? false,
                stripeDetailsSubmitted: account.details_submitted ?? false,
                stripeConnectStatus: account.payouts_enabled
                  ? "active"
                  : account.details_submitted
                  ? "pending_verification"
                  : "onboarding",
                updatedAt: new Date(),
              })
              .where(eq(establishments.id, input.establishmentId));
          }
          return {
            hasAccount: true,
            stripeAccountId: est.stripeAccountId,
            status: account.payouts_enabled
              ? "active"
              : account.details_submitted
              ? "pending_verification"
              : "onboarding",
            payoutsEnabled: account.payouts_enabled ?? false,
            detailsSubmitted: account.details_submitted ?? false,
            chargesEnabled: account.charges_enabled ?? false,
            country: account.country,
            defaultCurrency: account.default_currency,
          };
        } catch {
          // Account may have been deleted from Stripe
        }
      }
      return {
        hasAccount: false,
        stripeAccountId: null,
        status: est.stripeConnectStatus ?? "not_started",
        payoutsEnabled: false,
        detailsSubmitted: false,
        chargesEnabled: false,
        country: null,
        defaultCurrency: null,
      };
    }),

  /** Create a Stripe Connect account and return an onboarding link */
  createOnboardingLink: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number().int().positive(),
        origin: z.string().url(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, est } = await requireEstablishment(
        input.establishmentId,
        ctx.user.id,
        ctx.user.role === "admin"
      );
      let accountId = est.stripeAccountId;
      // Create account if not yet created
      if (!accountId) {
        const account = await requireStripe().accounts.create({
          type: "express",
          country: est.country ?? "US",
          email: est.contactEmail ?? ctx.user.email ?? undefined,
          business_type: "company",
          business_profile: {
            name: est.name,
            url: est.website ?? undefined,
          },
          metadata: {
            establishment_id: String(input.establishmentId),
            user_id: String(ctx.user.id),
          },
        });
        accountId = account.id;
        await db
          .update(establishments)
          .set({
            stripeAccountId: accountId,
            stripeConnectStatus: "onboarding",
            updatedAt: new Date(),
          })
          .where(eq(establishments.id, input.establishmentId));
        await createAuditLog({ actorId: ctx.user.id, action: "stripe_connect.account_created", entityType: "establishment", entityId: String(input.establishmentId), after: { stripeAccountId: accountId } });
      }
      // Create account link
      const accountLink = await requireStripe().accountLinks.create({
        account: accountId,
        refresh_url: `${input.origin}/merchant/stripe-connect?stripe_connect=refresh&est=${input.establishmentId}`,
        return_url: `${input.origin}/merchant/stripe-connect?stripe_connect=return&est=${input.establishmentId}`,
        type: "account_onboarding",
      });
      return { url: accountLink.url, expiresAt: accountLink.expires_at };
    }),

  /** Refresh Connect status after returning from Stripe onboarding */
  handleReturn: protectedProcedure
    .input(z.object({ establishmentId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const { db, est } = await requireEstablishment(
        input.establishmentId,
        ctx.user.id,
        ctx.user.role === "admin"
      );
      if (!est.stripeAccountId) {
        return { success: false, message: "No Stripe account found" };
      }
      const account = await requireStripe().accounts.retrieve(est.stripeAccountId);
      const newStatus = account.payouts_enabled
        ? "active"
        : account.details_submitted
        ? "pending_verification"
        : "onboarding";
      await db
        .update(establishments)
        .set({
          stripePayoutsEnabled: account.payouts_enabled ?? false,
          stripeDetailsSubmitted: account.details_submitted ?? false,
          stripeConnectStatus: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(establishments.id, input.establishmentId));
      if (account.payouts_enabled) {
        await createUserNotification({
          userId: ctx.user.id,
          category: "system",
          title: "Stripe Payouts Enabled",
          content: `Your establishment "${est.name}" is now connected to Stripe. Payouts will be processed automatically.`,
          actionUrl: `/merchant/payouts`,
          actionLabel: "View Payouts",
        });
        await createAuditLog({ actorId: ctx.user.id, action: "stripe_connect.payouts_enabled", entityType: "establishment", entityId: String(input.establishmentId), after: { stripeAccountId: est.stripeAccountId } });
      }
      return {
        success: true,
        status: newStatus,
        payoutsEnabled: account.payouts_enabled ?? false,
        detailsSubmitted: account.details_submitted ?? false,
      };
    }),

  /** Get available and pending balance for a connected account */
  getPayoutBalance: protectedProcedure
    .input(z.object({ establishmentId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const { est } = await requireEstablishment(
        input.establishmentId,
        ctx.user.id,
        ctx.user.role === "admin"
      );
      if (!est.stripeAccountId || !est.stripePayoutsEnabled) {
        return { available: [], pending: [], currency: "usd" };
      }
      const balance = await requireStripe().balance.retrieve({
        stripeAccount: est.stripeAccountId,
      });
      return {
        available: balance.available.map((b) => ({
          amount: b.amount / 100,
          currency: b.currency.toUpperCase(),
        })),
        pending: balance.pending.map((b) => ({
          amount: b.amount / 100,
          currency: b.currency.toUpperCase(),
        })),
        currency: balance.available[0]?.currency ?? "usd",
      };
    }),

  /** List recent payouts for a connected account */
  listPayouts: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number().int().positive(),
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const { est } = await requireEstablishment(
        input.establishmentId,
        ctx.user.id,
        ctx.user.role === "admin"
      );
      if (!est.stripeAccountId) return { payouts: [] };
      const payouts = await requireStripe().payouts.list(
        { limit: input.limit },
        { stripeAccount: est.stripeAccountId }
      );
      return {
        payouts: payouts.data.map((p) => ({
          id: p.id,
          amount: p.amount / 100,
          currency: p.currency.toUpperCase(),
          status: p.status,
          arrivalDate: p.arrival_date * 1000,
          createdAt: p.created * 1000,
          description: p.description,
          statementDescriptor: p.statement_descriptor,
          method: p.method,
        })),
      };
    }),

  /** Trigger an immediate payout to the merchant's bank account */
  triggerPayout: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number().int().positive(),
        amount: z.number().positive().optional(), // if omitted, pays out full available balance
        currency: z.string().length(3).default("usd"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { est } = await requireEstablishment(
        input.establishmentId,
        ctx.user.id,
        ctx.user.role === "admin"
      );
      if (!est.stripeAccountId || !est.stripePayoutsEnabled) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Stripe payouts not enabled for this establishment" });
      }
      // Stripe requires amount; if not provided, use full available balance
      let payoutAmount: number;
      if (input.amount) {
        payoutAmount = Math.round(input.amount * 100);
      } else {
        const balance = await requireStripe().balance.retrieve({ stripeAccount: est.stripeAccountId });
        const avail = balance.available.find((b) => b.currency === input.currency.toLowerCase());
        payoutAmount = avail?.amount ?? 0;
        if (payoutAmount <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No available balance to payout" });
        }
      }
      const payout = await requireStripe().payouts.create(
        { currency: input.currency.toLowerCase(), method: "standard", amount: payoutAmount },
        { stripeAccount: est.stripeAccountId }
      );
      await createAuditLog({ actorId: ctx.user.id, action: "stripe_connect.payout_triggered", entityType: "establishment", entityId: String(input.establishmentId), after: { payoutId: payout.id, amount: payout.amount / 100, currency: payout.currency } });
      await createUserNotification({
        userId: ctx.user.id,
        category: "system",
        title: "Payout Initiated",
        content: `A payout of ${(payout.amount / 100).toFixed(2)} ${payout.currency.toUpperCase()} has been initiated for "${est.name}". Expected arrival: ${new Date((payout.arrival_date ?? 0) * 1000).toLocaleDateString()}.`,
        actionUrl: `/merchant/payouts`,
        actionLabel: "View Payouts",
      });
      return {
        payoutId: payout.id,
        amount: payout.amount / 100,
        currency: payout.currency.toUpperCase(),
        status: payout.status,
        arrivalDate: payout.arrival_date * 1000,
      };
    }),

  /**
   * Create a Stripe Checkout Session for wallet top-up or service payment.
   * Returns a checkout URL to redirect the user to.
   */
  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        amountUsd: z.number().positive().min(0.5, "Minimum $0.50 USD"),
        walletCurrency: z.string().min(1).default("USDC"),
        description: z.string().optional(),
        origin: z.string().url(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const session = await requireStripe().checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: Math.round(input.amountUsd * 100),
              product_data: {
                name: input.description ?? `TourismPay Wallet Top-Up (${input.walletCurrency})`,
                description: `Funds will be credited to your ${input.walletCurrency} wallet`,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: ctx.user.email ?? undefined,
        client_reference_id: String(ctx.user.id),
        metadata: {
          user_id: String(ctx.user.id),
          customer_email: ctx.user.email ?? "",
          customer_name: ctx.user.name ?? "",
          wallet_currency: input.walletCurrency,
          amount_usd: String(input.amountUsd),
        },
        allow_promotion_codes: true,
        success_url: `${input.origin}/wallet?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${input.origin}/payment-gateway?checkout=cancelled`,
      });
      return { checkoutUrl: session.url!, sessionId: session.id };
    }),
});
