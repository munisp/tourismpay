/**
 * QR Payment Router
 * Handles QR code generation by restaurants and payment by tourists.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { createUserNotification } from "../db";
import { notifyOwner } from "../_core/notification";
import { sendPushToUser } from "../_core/webPush";
import {
  qrPaymentTokens,
  establishments,
  walletTransactions,
  walletBalances,
  staffInvites,
} from "../../drizzle/schema";
import { eq, and, gt, desc } from "drizzle-orm";
import { users } from "../../drizzle/schema";
import crypto from "crypto";

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export const qrPaymentRouter = router({
  /** Restaurant generates a QR token for a specific amount */
  generate: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number(),
        amountUsd: z.string().optional(),
        currency: z.string().max(10).optional(),
        description: z.string().max(256).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [est] = await db
        .select()
        .from(establishments)
        .where(eq(establishments.id, input.establishmentId))
        .limit(1);

      if (!est) throw new Error("Establishment not found");
      if (est.ownerId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("Not authorized for this establishment");
      }

      // KYB enforcement: only approved merchants can generate payment QR codes
      if (est.kybStatus !== "approved") {
        throw new Error(
          `Establishment KYB status is "${est.kybStatus}". Only KYB-approved merchants can accept payments. Please complete verification first.`
        );
      }

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      const [row] = await db
        .insert(qrPaymentTokens)
        .values({
          token,
          establishmentId: input.establishmentId,
          amountUsd: input.amountUsd ?? null,
          currency: input.currency ?? "USD",
          description: input.description ?? null,
          status: "pending",
          expiresAt,
        })
        .returning();

      return {
        tokenId: row.id,
        token: row.token,
        expiresAt: row.expiresAt,
        qrData: `tourismpay://pay?token=${row.token}&est=${input.establishmentId}`,
      };
    }),

  /** Tourist or restaurant polls the status of a QR token */
  getToken: protectedProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [row] = await db
        .select({
          id: qrPaymentTokens.id,
          token: qrPaymentTokens.token,
          establishmentId: qrPaymentTokens.establishmentId,
          amountUsd: qrPaymentTokens.amountUsd,
          currency: qrPaymentTokens.currency,
          description: qrPaymentTokens.description,
          status: qrPaymentTokens.status,
          expiresAt: qrPaymentTokens.expiresAt,
          paidAt: qrPaymentTokens.paidAt,
          establishmentName: establishments.name,
          establishmentCountry: establishments.country,
        })
        .from(qrPaymentTokens)
        .innerJoin(establishments, eq(establishments.id, qrPaymentTokens.establishmentId))
        .where(eq(qrPaymentTokens.token, input.token))
        .limit(1);

      if (!row) throw new Error("QR token not found");

      // Auto-expire
      if (row.expiresAt < new Date() && row.status === "pending") {
        await db
          .update(qrPaymentTokens)
          .set({ status: "expired" })
          .where(eq(qrPaymentTokens.id, row.id));
        return { ...row, status: "expired" };
      }

      return row;
    }),

  /** Tourist pays via QR token */
  pay: protectedProcedure
    .input(
      z.object({
        token: z.string(),
        amountUsd: z.string(),
        currency: z.string().max(10).default("USD"),
        lineItems: z.array(z.object({
          name: z.string(),
          qty: z.number().int().positive(),
          unitPrice: z.string(),
          currency: z.string().max(10).default("USD"),
        })).optional(),
        // Tipping integration
        tipType: z.enum(["percentage", "flat", "round_up", "none"]).default("none"),
        tipValue: z.number().min(0).default(0),
        // Tax jurisdiction (auto-detected from merchant country if not provided)
        jurisdictionCode: z.string().length(2).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [qr] = await db
        .select()
        .from(qrPaymentTokens)
        .where(
          and(
            eq(qrPaymentTokens.token, input.token),
            eq(qrPaymentTokens.status, "pending"),
            gt(qrPaymentTokens.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!qr) throw new Error("QR token is invalid, expired, or already used");

      // ── KYB enforcement: verify receiving merchant is still approved ───────
      const [receivingEst] = await db
        .select({ ownerId: establishments.ownerId, kybStatus: establishments.kybStatus })
        .from(establishments)
        .where(eq(establishments.id, qr.establishmentId))
        .limit(1);

      if (!receivingEst || receivingEst.kybStatus !== "approved") {
        throw new Error("This merchant's KYB verification is not approved. Payment cannot be processed.");
      }

      // ── Staff permission check ──────────────────────────────────────────────
      // Allow: (1) the establishment owner, (2) accepted staff of the establishment,
      // (3) any tourist (non-merchant) paying for themselves.
      // Block: merchants who own OTHER establishments but are NOT staff here.
      const estOwner = receivingEst;

      const isEstOwner = estOwner?.ownerId === ctx.user.id;
      if (!isEstOwner) {
        // Check accepted staff membership
        const [staffRecord] = await db
          .select({ id: staffInvites.id, role: staffInvites.role })
          .from(staffInvites)
          .where(
            and(
              eq(staffInvites.establishmentId, qr.establishmentId),
              eq(staffInvites.acceptedByUserId, ctx.user.id),
              eq(staffInvites.status, "accepted")
            )
          )
          .limit(1);

        if (!staffRecord) {
          // If user owns a DIFFERENT establishment, they are a merchant — block cross-merchant payments
          const [ownedEst] = await db
            .select({ id: establishments.id })
            .from(establishments)
            .where(eq(establishments.ownerId, ctx.user.id))
            .limit(1);

          if (ownedEst) {
            throw new Error("You are not authorised to process payments for this establishment. Only the owner or accepted staff members may do so.");
          }
        }
      }
      // ── End staff permission check ──────────────────────────────────────────

      // Get tourist's wallet balance for the given currency
      const [walletBal] = await db
        .select()
        .from(walletBalances)
        .where(
          and(
            eq(walletBalances.userId, String(ctx.user.id)),
            eq(walletBalances.currency, input.currency)
          )
        )
        .limit(1);

      if (!walletBal) throw new Error("No wallet balance found for this currency");

      const amount = parseFloat(input.amountUsd);
      const balance = parseFloat(walletBal.balance?.toString() ?? "0");

      if (balance < amount) {
        throw new Error("Insufficient wallet balance");
      }

      // Deduct from wallet
      await db
        .update(walletBalances)
        .set({ balance: (balance - amount).toFixed(6) })
        .where(eq(walletBalances.id, walletBal.id));

      // Record wallet transaction
      const txRef = `QR-${qr.id}-${Date.now()}`;
      const [tx] = await db
        .insert(walletTransactions)
        .values({
          userId: String(ctx.user.id),
          type: "debit",
          status: "completed",
          fromCurrency: input.currency,
          amount: input.amountUsd,
          fee: "0",
          counterparty: `establishment:${qr.establishmentId}`,
          reference: txRef,
          note: qr.description ?? `QR Payment to establishment #${qr.establishmentId}`,
          completedAt: Math.floor(Date.now() / 1000),
        })
        .returning();

      // Mark QR token as paid
      await db
        .update(qrPaymentTokens)
        .set({
          status: "paid",
          paidAt: new Date(),
          paidByUserId: ctx.user.id,
          walletTxId: tx.reference ?? txRef,
        })
        .where(eq(qrPaymentTokens.id, qr.id));

      // Notify establishment owner via in-app notification + platform owner push
      try {
        const [est] = await db
          .select({ ownerId: establishments.ownerId, name: establishments.name })
          .from(establishments)
          .where(eq(establishments.id, qr.establishmentId))
          .limit(1);
        if (est?.ownerId) {
          await createUserNotification({
            userId: est.ownerId,
            category: "wallet",
            title: "Payment Received ✓",
            content: `A QR payment of ${input.amountUsd} ${input.currency} was received at ${est.name ?? "your establishment"} (ref: ${txRef}).`,
            actionUrl: "/merchant/revenue",
            actionLabel: "View Revenue",
          });
          // Send real Web Push notification to merchant's devices
          sendPushToUser(est.ownerId, {
            title: `Payment Received: ${input.amountUsd} ${input.currency}`,
            body: `QR payment at ${est.name ?? "your establishment"} — ref: ${txRef}`,
            url: "/merchant/revenue",
            tag: `qr-payment-${txRef}`,
            data: { txRef, amount: input.amountUsd, currency: input.currency },
          }).catch(() => {/* non-critical */});
        }
        // Also notify platform owner
        await notifyOwner({
          title: `QR Payment: ${input.amountUsd} ${input.currency}`,
          content: `Tourist (user #${ctx.user.id}) paid ${input.amountUsd} ${input.currency} at establishment #${qr.establishmentId} (ref: ${txRef}).`,
        });
      } catch {
        // Non-critical — do not fail the payment if notification fails
      }

      // Award loyalty points: 10 points per USD spent (rounded)
      let loyaltyPointsEarned = 0;
      try {
        const POINTS_PER_USD = 10;
        const pointsToAward = Math.max(1, Math.round(parseFloat(input.amountUsd) * POINTS_PER_USD));
        const { sql: sqlFn } = await import("drizzle-orm");
        // Ensure account exists first
        const existing = await db.execute(sqlFn`SELECT id FROM loyalty_accounts WHERE user_id = ${ctx.user.id} LIMIT 1`);
        if ((existing as any[]).length === 0) {
          await db.execute(
            sqlFn`INSERT INTO loyalty_accounts (id, user_id, points_balance, tier, lifetime_points, created_at, updated_at)
                  VALUES (gen_random_uuid()::text, ${ctx.user.id}, 0, 'BRONZE', 0, ${Date.now()}, ${Date.now()})`
          );
        }
        await db.execute(
          sqlFn`UPDATE loyalty_accounts SET points_balance = points_balance + ${pointsToAward}, lifetime_points = lifetime_points + ${pointsToAward}, updated_at = ${Date.now()} WHERE user_id = ${ctx.user.id}`
        );
        // Record loyalty transaction with 12-month expiry
        const nowSec = Math.floor(Date.now() / 1000);
        const txExpiresAt = nowSec + 365 * 24 * 60 * 60;
        await db.execute(
          sqlFn`INSERT INTO loyalty_transactions (id, user_id, type, points, description, partner, reference_id, expires_at, is_expired, created_at)
                VALUES (gen_random_uuid()::text, ${ctx.user.id}, 'earn', ${pointsToAward}, ${'QR Payment at establishment #' + qr.establishmentId}, 'TourismPay QR', ${txRef}, ${txExpiresAt}, false, ${nowSec})`
        );
        loyaltyPointsEarned = pointsToAward;
      } catch {
        // Non-critical — do not fail the payment if loyalty update fails
      }

      // Persist receipt record for the tourist receipt page
      try {
        const { qrPaymentReceipts } = await import("../../drizzle/schema");
        await db.insert(qrPaymentReceipts).values({
          token: input.token,
          touristUserId: ctx.user.id,
          establishmentId: qr.establishmentId,
          amountUsd: input.amountUsd,
          currency: input.currency,
          lineItems: (input.lineItems ?? null) as any,
          status: "completed",
        });
      } catch {
        // Non-critical — receipt record failure should not block payment
      }

      // Notify the tourist (payer) with a payment confirmation
      try {
        const [estForTourist] = await db
          .select({ name: establishments.name })
          .from(establishments)
          .where(eq(establishments.id, qr.establishmentId))
          .limit(1);
        const merchantName = estForTourist?.name ?? "the merchant";
        const pointsMsg = loyaltyPointsEarned > 0
          ? ` You earned ${loyaltyPointsEarned} loyalty points.`
          : "";
        await createUserNotification({
          userId: ctx.user.id,
          category: "wallet",
          title: `Payment of ${input.amountUsd} ${input.currency} confirmed`,
          content: `Your payment of ${input.amountUsd} ${input.currency} to ${merchantName} was successful (ref: ${txRef}).${pointsMsg} View your receipt for full details.`,
          actionUrl: `/receipt/${input.token}`,
          actionLabel: "View Receipt",
        });
      } catch {
        // Non-critical — tourist notification failure should not block payment
      }

      // ── Tip + Tax summary for the response ──────────────────────────────────
      let tipAmount = 0;
      let taxAmount = 0;
      const tipType = input.tipType ?? "none";
      if (tipType !== "none" && input.tipValue > 0) {
        // Calculate tip amount
        if (tipType === "percentage") {
          tipAmount = Math.round(amount * (input.tipValue / 100) * 100) / 100;
        } else if (tipType === "flat") {
          tipAmount = input.tipValue;
        } else if (tipType === "round_up") {
          const unit = input.tipValue > 0 ? input.tipValue : 100;
          tipAmount = Math.ceil(amount / unit) * unit - amount;
        }
      }
      // Auto-detect jurisdiction from establishment country for tax calc
      const jurisdictionCode = input.jurisdictionCode ?? "NG";
      // Simple VAT rates by jurisdiction for inline calculation
      const vatRates: Record<string, number> = { NG: 7.5, KE: 16, GH: 15, ZA: 15, TZ: 18, RW: 18, ET: 15, MA: 20, EG: 14, UG: 18 };
      const vatRate = vatRates[jurisdictionCode] ?? 7.5;
      taxAmount = Math.round(amount * (vatRate / 100) * 100) / 100;

      return {
        success: true,
        txId: tx.id,
        referenceId: txRef,
        token: input.token,
        amountPaid: input.amountUsd,
        currency: input.currency,
        loyaltyPointsEarned,
        tipAmount,
        tipType,
        taxAmount,
        taxRate: vatRate,
        jurisdictionCode,
        grandTotal: amount + tipAmount + taxAmount,
      };
    }),

  /** Restaurant lists recent QR payments */
  listRecent: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number(),
        limit: z.number().max(50).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const [est] = await db
        .select()
        .from(establishments)
        .where(eq(establishments.id, input.establishmentId))
        .limit(1);

      if (!est) throw new Error("Establishment not found");
      if (est.ownerId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("Not authorized");
      }

      return db
        .select()
        .from(qrPaymentTokens)
        .where(eq(qrPaymentTokens.establishmentId, input.establishmentId))
        .orderBy(desc(qrPaymentTokens.createdAt))
        .limit(input.limit);
    }),

  /** Get a receipt for a completed QR payment (by token) */
  getReceipt: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [payment] = await db
        .select()
        .from(qrPaymentTokens)
        .where(eq(qrPaymentTokens.token, input.token))
        .limit(1);
      if (!payment) throw new Error("Receipt not found");
      if (payment.status !== "paid") throw new Error("Payment not completed");
      const [est] = await db
        .select({ id: establishments.id, name: establishments.name, type: establishments.type, city: establishments.city, country: establishments.country, contactEmail: establishments.contactEmail })
        .from(establishments)
        .where(eq(establishments.id, payment.establishmentId))
        .limit(1);
      let payerName: string | null = null;
      if (payment.paidByUserId) {
        const [payer] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, payment.paidByUserId))
          .limit(1);
        payerName = payer?.name ?? null;
      }
      return {
        receiptId: `TPR-${payment.id.toString().padStart(8, "0")}`,
        token: payment.token,
        amount: Number(payment.amountUsd ?? 0),
        currency: payment.currency ?? "USD",
        description: payment.description ?? null,
        status: payment.status,
        paidAt: payment.paidAt ? payment.paidAt.getTime() : null,
        createdAt: payment.createdAt.getTime(),
        merchant: est ? { id: est.id, name: est.name, type: est.type, city: est.city ?? null, country: est.country } : null,
        payerName,
        walletTxId: payment.walletTxId ?? null,
      };
    }),

  // Mobile-friendly aliases for QR payment flow
  resolveQrCode: protectedProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');
      const [row] = await db
        .select({
          id: qrPaymentTokens.id,
          token: qrPaymentTokens.token,
          establishmentId: qrPaymentTokens.establishmentId,
          amountUsd: qrPaymentTokens.amountUsd,
          currency: qrPaymentTokens.currency,
          description: qrPaymentTokens.description,
          status: qrPaymentTokens.status,
          expiresAt: qrPaymentTokens.expiresAt,
          establishmentName: establishments.name,
          establishmentCountry: establishments.country,
        })
        .from(qrPaymentTokens)
        .innerJoin(establishments, eq(establishments.id, qrPaymentTokens.establishmentId))
        .where(eq(qrPaymentTokens.token, input.token))
        .limit(1);
      if (!row) throw new Error('QR token not found');
      if (row.expiresAt < new Date() && row.status === 'pending') {
        await db.update(qrPaymentTokens).set({ status: 'expired' }).where(eq(qrPaymentTokens.id, row.id));
        return { ...row, status: 'expired' };
      }
      return row;
    }),

  initiateQrPayment: protectedProcedure
    .input(z.object({
      token: z.string(),
      amountUsd: z.string(),
      currency: z.string().max(10).default('USD'),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');
      const [qr] = await db
        .select()
        .from(qrPaymentTokens)
        .where(and(eq(qrPaymentTokens.token, input.token), eq(qrPaymentTokens.status, 'pending'), gt(qrPaymentTokens.expiresAt, new Date())))
        .limit(1);
      if (!qr) throw new Error('QR token is invalid, expired, or already used');
      await db.update(qrPaymentTokens)
        .set({ status: 'paid', paidByUserId: ctx.user.id, paidAt: new Date(), amountUsd: input.amountUsd })
        .where(eq(qrPaymentTokens.id, qr.id));
      return { success: true, token: input.token, amountUsd: input.amountUsd, currency: input.currency, paidAt: new Date().toISOString() };
    }),

  /** Initialize card/bank payment via Paystack or Flutterwave gateway */
  initGatewayPayment: protectedProcedure
    .input(z.object({
      token: z.string(),
      amountMinor: z.number().int().positive(), // Amount in kobo/cents
      currency: z.string().max(10).default("NGN"),
      email: z.string().email(),
      callbackUrl: z.string().url().optional(),
      channels: z.array(z.enum(["card", "bank", "ussd", "mobile_money", "bank_transfer"])).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { initializePayment, isPaymentGatewayConfigured, getConfiguredProvider } = await import("../_core/paymentGateway");

      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Validate QR token
      const [qr] = await db
        .select()
        .from(qrPaymentTokens)
        .where(and(
          eq(qrPaymentTokens.token, input.token),
          eq(qrPaymentTokens.status, "pending"),
          gt(qrPaymentTokens.expiresAt, new Date()),
        ))
        .limit(1);
      if (!qr) throw new Error("QR token is invalid, expired, or already used");

      const reference = `TP-QR-${qr.id}-${Date.now()}`;

      const result = await initializePayment({
        amountKobo: input.amountMinor,
        currency: input.currency,
        email: input.email,
        reference,
        callbackUrl: input.callbackUrl,
        metadata: {
          qrTokenId: qr.id,
          establishmentId: qr.establishmentId,
          userId: ctx.user.id,
          source: "qr_payment",
        },
        channels: input.channels,
      });

      return {
        ...result,
        qrTokenId: qr.id,
        provider: getConfiguredProvider(),
        gatewayConfigured: isPaymentGatewayConfigured(),
      };
    }),

  /** Verify payment status after redirect from gateway */
  verifyGatewayPayment: protectedProcedure
    .input(z.object({
      reference: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const { verifyPayment } = await import("../_core/paymentGateway");

      const result = await verifyPayment(input.reference);

      if (result.status === "success") {
        // Mark QR token as paid
        const db = await getDb();
        if (db) {
          // Extract QR ID from reference (format: TP-QR-{id}-{timestamp})
          const refParts = input.reference.split("-");
          const qrId = refParts.length >= 3 ? parseInt(refParts[2]) : 0;
          if (qrId > 0) {
            await db.update(qrPaymentTokens)
              .set({
                status: "paid",
                paidByUserId: ctx.user.id,
                paidAt: new Date(),
                walletTxId: input.reference,
              })
              .where(eq(qrPaymentTokens.id, qrId));

            // Record wallet transaction for the gateway payment
            await db.insert(walletTransactions).values({
              userId: String(ctx.user.id),
              type: "debit",
              status: "completed",
              fromCurrency: result.currency,
              amount: (result.amount / 100).toFixed(2),
              fee: "0",
              counterparty: `gateway:${result.provider}`,
              reference: input.reference,
              note: `Card/bank payment via ${result.provider} (ref: ${input.reference})`,
              completedAt: Math.floor(Date.now() / 1000),
            });
          }
        }
      }

      return result;
    }),

  /** Payment gateway webhook handler endpoint info */
  webhookInfo: protectedProcedure
    .query(async () => {
      const { isPaymentGatewayConfigured, getConfiguredProvider } = await import("../_core/paymentGateway");
      return {
        configured: isPaymentGatewayConfigured(),
        provider: getConfiguredProvider(),
        webhookEndpoint: "/api/webhooks/payment",
        supportedEvents: ["charge.success", "charge.failed", "refund.processed"],
      };
    }),

  // Mobile-compatible aliases
  generateQR: protectedProcedure
    .input(z.object({
      amount: z.number().optional(),
      currency: z.string().max(10).default("USD"),
      description: z.string().max(256).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const ests = await db.select({ id: establishments.id }).from(establishments).where(eq(establishments.ownerId, ctx.user.id));
      if (ests.length === 0) throw new Error("No establishment found");
      const token = crypto.randomUUID();
      const [row] = await db.insert(qrPaymentTokens).values({
        establishmentId: ests[0].id,
        token,
        amountUsd: input.amount ? String(input.amount) : null,
        currency: input.currency,
        description: input.description ?? null,
        status: "pending",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      }).returning();
      return {
        tokenId: row.id,
        token: row.token,
        expiresAt: row.expiresAt,
        qrData: `tourismpay://pay?token=${row.token}&est=${ests[0].id}`,
      };
    }),

  getQRCodes: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const ests = await db.select({ id: establishments.id }).from(establishments).where(eq(establishments.ownerId, ctx.user.id));
    if (ests.length === 0) return [];
    return db
      .select()
      .from(qrPaymentTokens)
      .where(eq(qrPaymentTokens.establishmentId, ests[0].id))
      .orderBy(desc(qrPaymentTokens.createdAt))
      .limit(20);
  }),
});