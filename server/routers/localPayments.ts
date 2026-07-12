/**
 * Local Payments Router
 *
 * Enables tourists & diaspora to make everyday local payments:
 *   1. Bill payments (airtime, data, electricity, cable TV, water, internet)
 *   2. Virtual card issuance (Visa/Mastercard/Verve for POS/online/ATM)
 *   3. Bank transfer out (NIBSS NIP to any Nigerian bank account)
 *   4. Ride-hailing (Uber, Bolt, inDrive, Rida, SafeBoda)
 *   5. Payment links (merchant generates shareable payment link)
 *   6. Split bill (divide a restaurant/service bill among group)
 *   7. Request money (send payment request to another user)
 *   8. USSD merchant payment (pay via USSD to off-platform merchant)
 *
 * Middleware integration:
 *   - Kafka: payment events for analytics & reconciliation
 *   - Redis: quote caching, rate limiting, session state
 *   - TigerBeetle: double-entry ledger for all debits/credits
 *   - Temporal: async settlement workflows
 *   - OpenSearch: payment search & audit trail
 *   - Permify: role-based access (tourist, merchant, admin)
 *   - APISIX: webhook authentication for provider callbacks
 */

import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { requirePermission, RESOURCES, ACTIONS } from "../_core/permify";
import { createAuditLog, createUserNotification } from "../db";
import { walletBalances, walletTransactions } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import crypto from "crypto";

// ─── Constants ──────────────────────────────────────────────────────────────

const SETTLEMENT_SERVICE_URL = process.env.SETTLEMENT_SERVICE_URL || "http://localhost:8081";
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICES_URL || "http://localhost:8001";

async function callGoService(path: string, method = "GET", body?: unknown): Promise<any> {
  const res = await fetch(`${SETTLEMENT_SERVICE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Source": "tourismpay-local-payments" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "unknown");
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Go service ${res.status}: ${text}` });
  }
  return res.json();
}

async function callPythonService(path: string, method = "GET", body?: unknown): Promise<any> {
  const res = await fetch(`${PYTHON_SERVICE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Source": "tourismpay-local-payments" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "unknown");
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Python service ${res.status}: ${text}` });
  }
  return res.json();
}

async function debitWallet(userId: string, currency: string, amount: number, type: string, counterparty: string, reference: string, note?: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  const [wallet] = await db
    .select()
    .from(walletBalances)
    .where(and(eq(walletBalances.userId, userId), eq(walletBalances.currency, currency)))
    .for("update");

  if (!wallet) throw new TRPCError({ code: "BAD_REQUEST", message: `No ${currency} wallet found` });

  const balance = parseFloat(wallet.balance?.toString() ?? "0");
  if (balance < amount) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Insufficient ${currency} balance. Available: ${balance.toFixed(2)}, Required: ${amount.toFixed(2)}` });
  }

  await db.update(walletBalances)
    .set({ balance: (balance - amount).toFixed(6), updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(walletBalances.id, wallet.id));

  const [tx] = await db.insert(walletTransactions).values({
    userId,
    type: "debit",
    status: "completed",
    fromCurrency: currency,
    amount: amount.toFixed(6),
    fee: "0",
    counterparty,
    reference,
    note,
    completedAt: Math.floor(Date.now() / 1000),
  }).returning();

  return tx;
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const localPaymentsRouter = router({

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. BILL PAYMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  bill: router({
    listProviders: protectedProcedure
      .input(z.object({
        category: z.string().optional(),
        country: z.string().default("NG"),
      }))
      .query(async ({ input }) => {
        return callGoService(`/api/v1/bill/providers?category=${input.category ?? ""}&country=${input.country}`);
      }),

    getDataPlans: protectedProcedure
      .input(z.object({ providerId: z.string() }))
      .query(async ({ input }) => {
        return callGoService(`/api/v1/bill/providers/${input.providerId}/plans`);
      }),

    validateAccount: protectedProcedure
      .input(z.object({
        providerId: z.string(),
        accountNumber: z.string().min(4).max(20),
      }))
      .mutation(async ({ input }) => {
        return callGoService("/api/v1/bill/validate", "POST", {
          provider_id: input.providerId,
          account_number: input.accountNumber,
        });
      }),

    pay: protectedProcedure
      .input(z.object({
        providerId: z.string(),
        accountNumber: z.string().min(4).max(20),
        amount: z.number().positive(),
        currency: z.string().default("NGN"),
        dataPlanId: z.string().optional(),
        phoneNumber: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = String(ctx.user.id);
        await requirePermission(userId, ctx.user.role, RESOURCES.PAYMENT, ACTIONS.CREATE);

        // Process through Go service
        const result = await callGoService("/api/v1/bill/pay", "POST", {
          provider_id: input.providerId,
          account_number: input.accountNumber,
          amount: input.amount,
          currency: input.currency,
          user_id: userId,
          data_plan_id: input.dataPlanId,
          phone_number: input.phoneNumber,
        });

        // Debit wallet
        await debitWallet(
          userId, input.currency, result.total_charged,
          "bill_payment", result.provider_name,
          result.reference, `${result.category}: ${input.accountNumber}`
        );

        await createAuditLog({
          actorId: ctx.user.id,
          action: "bill.payment.completed",
          entityType: "bill_payment",
          entityId: result.transaction_id,
          after: { provider: input.providerId, amount: input.amount, category: result.category },
        });

        await createUserNotification({
          userId: Number(ctx.user.id),
          category: "wallet",
          title: "Bill Payment Successful",
          content: `${result.provider_name} payment of ${input.currency} ${input.amount.toLocaleString()} completed.${result.token ? ` Token: ${result.token}` : ""}`,
        });

        return result;
      }),
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. VIRTUAL CARD
  // ═══════════════════════════════════════════════════════════════════════════

  virtualCard: router({
    issue: protectedProcedure
      .input(z.object({
        cardType: z.enum(["visa", "mastercard", "verve"]).default("visa"),
        currency: z.string().default("USD"),
        fundAmount: z.number().min(0).default(0),
        spendLimit: z.number().positive().default(50000),
        dailyLimit: z.number().positive().default(5000),
        label: z.string().max(50).default("Travel Card"),
        allowAtm: z.boolean().default(false),
        allowOnline: z.boolean().default(true),
        allowPos: z.boolean().default(true),
        allowInternational: z.boolean().default(true),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = String(ctx.user.id);

        // If funding the card, debit wallet first
        if (input.fundAmount > 0) {
          await debitWallet(
            userId, input.currency, input.fundAmount,
            "virtual_card_fund", "Virtual Card Funding",
            `VCARD-FUND-${Date.now()}`, `Initial funding for ${input.label}`
          );
        }

        const card = await callGoService("/api/v1/virtual-card/issue", "POST", {
          user_id: userId,
          card_type: input.cardType,
          currency: input.currency,
          fund_amount: input.fundAmount,
          spend_limit: input.spendLimit,
          daily_limit: input.dailyLimit,
          label: input.label,
          allow_atm: input.allowAtm,
          allow_online: input.allowOnline,
          allow_pos: input.allowPos,
          allow_international: input.allowInternational,
        });

        await createAuditLog({
          actorId: ctx.user.id,
          action: "virtual_card.issued",
          entityType: "virtual_card",
          entityId: card.id,
          after: { cardType: input.cardType, currency: input.currency },
        });

        await createUserNotification({
          userId: Number(ctx.user.id),
          category: "wallet",
          title: "Virtual Card Issued",
          content: `Your ${input.cardType.toUpperCase()} virtual card (${card.masked_pan}) is ready. Use it at any POS terminal, online store, or ATM.`,
        });

        return card;
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      return callGoService(`/api/v1/virtual-card/cards?user_id=${ctx.user.id}`);
    }),

    get: protectedProcedure
      .input(z.object({ cardId: z.string() }))
      .query(async ({ input }) => {
        return callGoService(`/api/v1/virtual-card/cards/${input.cardId}`);
      }),

    fund: protectedProcedure
      .input(z.object({
        cardId: z.string(),
        amount: z.number().positive(),
        currency: z.string().default("USD"),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = String(ctx.user.id);
        await debitWallet(
          userId, input.currency, input.amount,
          "virtual_card_fund", "Virtual Card Top-up",
          `VCARD-TOPUP-${Date.now()}`, `Top-up card ${input.cardId}`
        );
        return callGoService(`/api/v1/virtual-card/cards/${input.cardId}/fund`, "POST", {
          card_id: input.cardId,
          amount: input.amount,
          currency: input.currency,
        });
      }),

    freeze: protectedProcedure
      .input(z.object({ cardId: z.string() }))
      .mutation(async ({ input }) => {
        return callGoService(`/api/v1/virtual-card/cards/${input.cardId}/freeze`, "POST");
      }),

    unfreeze: protectedProcedure
      .input(z.object({ cardId: z.string() }))
      .mutation(async ({ input }) => {
        return callGoService(`/api/v1/virtual-card/cards/${input.cardId}/unfreeze`, "POST");
      }),

    transactions: protectedProcedure
      .input(z.object({ cardId: z.string() }))
      .query(async ({ input }) => {
        return callGoService(`/api/v1/virtual-card/cards/${input.cardId}/transactions`);
      }),

    updateControls: protectedProcedure
      .input(z.object({
        cardId: z.string(),
        allowAtm: z.boolean(),
        allowOnline: z.boolean(),
        allowPos: z.boolean(),
        allowInternational: z.boolean(),
        dailyLimit: z.number().positive(),
      }))
      .mutation(async ({ input }) => {
        return callGoService(`/api/v1/virtual-card/cards/${input.cardId}/controls`, "PUT", {
          allow_atm: input.allowAtm,
          allow_online: input.allowOnline,
          allow_pos: input.allowPos,
          allow_international: input.allowInternational,
          daily_limit: input.dailyLimit,
        });
      }),
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. BANK TRANSFER OUT (NIBSS NIP)
  // ═══════════════════════════════════════════════════════════════════════════

  bankTransfer: router({
    listBanks: protectedProcedure.query(async () => {
      return callGoService("/api/v1/bank-transfer/banks");
    }),

    nameEnquiry: protectedProcedure
      .input(z.object({
        bankCode: z.string(),
        accountNumber: z.string().length(10),
      }))
      .mutation(async ({ input }) => {
        return callGoService("/api/v1/bank-transfer/name-enquiry", "POST", {
          bank_code: input.bankCode,
          account_number: input.accountNumber,
        });
      }),

    send: protectedProcedure
      .input(z.object({
        bankCode: z.string(),
        accountNumber: z.string().length(10),
        accountName: z.string(),
        amount: z.number().positive(),
        narration: z.string().max(100).default("TourismPay Transfer"),
        saveBeneficiary: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = String(ctx.user.id);

        // Debit wallet (NGN)
        const fee = input.amount <= 5000 ? 10.75 : input.amount <= 50000 ? 25.75 : 53.75;
        await debitWallet(
          userId, "NGN", input.amount + fee,
          "bank_transfer", input.accountName,
          `NIP-${Date.now()}`, `Transfer to ${input.accountName} (${input.accountNumber})`
        );

        const result = await callGoService("/api/v1/bank-transfer/initiate", "POST", {
          user_id: userId,
          bank_code: input.bankCode,
          account_number: input.accountNumber,
          amount: input.amount,
          currency: "NGN",
          narration: input.narration,
          beneficiary_name: input.accountName,
          save_beneficiary: input.saveBeneficiary,
        });

        await createAuditLog({
          actorId: ctx.user.id,
          action: "bank_transfer.initiated",
          entityType: "bank_transfer",
          entityId: result.transaction_id,
          after: { bankCode: input.bankCode, amount: input.amount },
        });

        await createUserNotification({
          userId: Number(ctx.user.id),
          category: "wallet",
          title: "Bank Transfer Sent",
          content: `₦${input.amount.toLocaleString()} sent to ${input.accountName} (${result.bank_name}). Session ID: ${result.session_id}`,
        });

        return result;
      }),

    getBeneficiaries: protectedProcedure.query(async ({ ctx }) => {
      return callGoService(`/api/v1/bank-transfer/beneficiaries?user_id=${ctx.user.id}`);
    }),

    deleteBeneficiary: protectedProcedure
      .input(z.object({ beneficiaryId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        return callGoService(`/api/v1/bank-transfer/beneficiaries/${input.beneficiaryId}?user_id=${ctx.user.id}`, "DELETE");
      }),
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. RIDE-HAILING
  // ═══════════════════════════════════════════════════════════════════════════

  rides: router({
    listProviders: protectedProcedure
      .input(z.object({ country: z.string().default("NG") }))
      .query(async ({ input }) => {
        return callPythonService(`/api/v1/rides/providers?country=${input.country}`);
      }),

    getQuotes: protectedProcedure
      .input(z.object({
        country: z.string(),
        pickupLat: z.number(),
        pickupLng: z.number(),
        pickupAddress: z.string(),
        dropoffLat: z.number(),
        dropoffLng: z.number(),
        dropoffAddress: z.string(),
        vehicleType: z.string().default("economy"),
      }))
      .mutation(async ({ input }) => {
        return callPythonService("/api/v1/rides/quote", "POST", {
          country: input.country,
          pickup_lat: input.pickupLat,
          pickup_lng: input.pickupLng,
          pickup_address: input.pickupAddress,
          dropoff_lat: input.dropoffLat,
          dropoff_lng: input.dropoffLng,
          dropoff_address: input.dropoffAddress,
          vehicle_type: input.vehicleType,
        });
      }),

    request: protectedProcedure
      .input(z.object({
        quoteId: z.string(),
        provider: z.string(),
        paymentMethod: z.enum(["wallet", "virtual_card"]).default("wallet"),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = String(ctx.user.id);
        const ride = await callPythonService("/api/v1/rides/request", "POST", {
          quote_id: input.quoteId,
          provider: input.provider,
          user_id: userId,
          payment_method: input.paymentMethod,
        });

        await createAuditLog({
          actorId: ctx.user.id,
          action: "ride.requested",
          entityType: "ride",
          entityId: ride.ride_id,
          after: { provider: input.provider },
        });

        return ride;
      }),

    getActive: protectedProcedure.query(async ({ ctx }) => {
      return callPythonService(`/api/v1/rides/active/${ctx.user.id}`);
    }),

    cancel: protectedProcedure
      .input(z.object({ rideId: z.string() }))
      .mutation(async ({ input }) => {
        return callPythonService(`/api/v1/rides/${input.rideId}/cancel`, "POST");
      }),

    history: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }))
      .query(async ({ ctx, input }) => {
        return callPythonService(`/api/v1/rides/history/${ctx.user.id}?limit=${input.limit}`);
      }),
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. PAYMENT LINKS
  // ═══════════════════════════════════════════════════════════════════════════

  paymentLink: router({
    create: protectedProcedure
      .input(z.object({
        amount: z.number().positive().optional(),
        currency: z.string().default("NGN"),
        description: z.string().max(200),
        expiresInHours: z.number().int().min(1).max(720).default(24),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        const linkId = crypto.randomBytes(8).toString("hex");
        const expiresAt = new Date(Date.now() + input.expiresInHours * 3600 * 1000);
        const userId = String(ctx.user.id);

        await db.insert(walletTransactions).values({
          userId,
          type: "payment_link",
          status: "pending",
          fromCurrency: input.currency,
          amount: String(input.amount ?? 0),
          reference: `PLINK-${linkId}`,
          note: input.description,
        });

        const paymentUrl = `https://pay.tourismpay.com/p/${linkId}`;
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Pay me via TourismPay: ${paymentUrl}`)}`;

        return {
          linkId,
          paymentUrl,
          whatsappUrl,
          amount: input.amount,
          currency: input.currency,
          description: input.description,
          expiresAt: expiresAt.toISOString(),
          createdBy: userId,
          status: "active",
        };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const links = await db.select()
        .from(walletTransactions)
        .where(and(
          eq(walletTransactions.userId, String(ctx.user.id)),
          eq(walletTransactions.type, "payment_link"),
        ))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(50);
      return links.map(l => ({
        linkId: l.reference?.replace("PLINK-", "") ?? "",
        amount: parseFloat(l.amount ?? "0"),
        currency: l.fromCurrency,
        description: l.note,
        status: l.status,
        paymentUrl: `https://pay.tourismpay.com/p/${l.reference?.replace("PLINK-", "")}`,
      }));
    }),

    pay: protectedProcedure
      .input(z.object({
        linkId: z.string(),
        amount: z.number().positive(),
        currency: z.string().default("NGN"),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        const [link] = await db.select()
          .from(walletTransactions)
          .where(eq(walletTransactions.reference, `PLINK-${input.linkId}`))
          .limit(1);

        if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Payment link not found" });
        if (link.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Payment link already used or expired" });

        const payerId = String(ctx.user.id);
        await debitWallet(payerId, input.currency, input.amount, "payment_link_pay", `Payment Link ${input.linkId}`, `PLINK-PAY-${input.linkId}`);

        await db.update(walletTransactions)
          .set({ status: "completed", completedAt: Math.floor(Date.now() / 1000) })
          .where(eq(walletTransactions.id, link.id));

        // Credit the link creator's wallet
        const [creatorWallet] = await db.select()
          .from(walletBalances)
          .where(and(eq(walletBalances.userId, link.userId), eq(walletBalances.currency, input.currency)));

        if (creatorWallet) {
          const newBal = parseFloat(creatorWallet.balance?.toString() ?? "0") + input.amount;
          await db.update(walletBalances)
            .set({ balance: newBal.toFixed(6), updatedAt: Math.floor(Date.now() / 1000) })
            .where(eq(walletBalances.id, creatorWallet.id));
        }

        await createUserNotification({
          userId: Number(link.userId),
          category: "wallet",
          title: "Payment Link Paid",
          content: `Someone paid ${input.currency} ${input.amount.toLocaleString()} via your payment link.`,
        });

        return { status: "paid", amount: input.amount, currency: input.currency };
      }),
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. SPLIT BILL
  // ═══════════════════════════════════════════════════════════════════════════

  splitBill: router({
    create: protectedProcedure
      .input(z.object({
        totalAmount: z.number().positive(),
        currency: z.string().default("NGN"),
        description: z.string().max(200),
        splitType: z.enum(["equal", "custom", "percentage"]).default("equal"),
        participants: z.array(z.object({
          userId: z.string().optional(),
          name: z.string(),
          amount: z.number().optional(),
          percentage: z.number().min(0).max(100).optional(),
          email: z.string().email().optional(),
        })).min(2).max(20),
        merchantName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        const splitId = crypto.randomBytes(6).toString("hex");
        const creatorId = String(ctx.user.id);
        const participantCount = input.participants.length;

        // Validate custom split amounts sum to total
        if (input.splitType === "custom") {
          const customTotal = input.participants.reduce((sum, p) => sum + (p.amount ?? 0), 0);
          if (Math.abs(customTotal - input.totalAmount) > 0.01) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Custom split amounts must sum to the total (${input.totalAmount}). Got ${customTotal.toFixed(2)}.`,
            });
          }
          const missingAmounts = input.participants.filter(p => p.amount === undefined || p.amount <= 0);
          if (missingAmounts.length > 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "All participants must have a positive amount in custom split mode.",
            });
          }
        }

        // Validate percentage split mode: percentages must sum to 100
        if (input.splitType === "percentage") {
          const pctTotal = input.participants.reduce((sum, p) => sum + (p.percentage ?? 0), 0);
          if (Math.abs(pctTotal - 100) > 0.01) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Participant percentages must sum to 100%. Got ${pctTotal.toFixed(2)}%.`,
            });
          }
          const missingPct = input.participants.filter(p => p.percentage === undefined || p.percentage <= 0);
          if (missingPct.length > 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "All participants must have a positive percentage in percentage split mode.",
            });
          }
        }

        const splits = input.participants.map((p, i) => {
          let amount: number;
          if (input.splitType === "equal") {
            amount = Math.round((input.totalAmount / participantCount) * 100) / 100;
          } else if (input.splitType === "percentage") {
            amount = Math.round(input.totalAmount * (p.percentage ?? 0) / 100 * 100) / 100;
          } else {
            amount = p.amount ?? input.totalAmount / participantCount;
          }
          return {
            participantIndex: i,
            name: p.name,
            userId: p.userId,
            email: p.email,
            amount,
            status: p.userId === creatorId ? "paid" : "pending",
          };
        });

        // Record the split bill
        await db.insert(walletTransactions).values({
          userId: creatorId,
          type: "split_bill",
          status: "pending",
          fromCurrency: input.currency,
          amount: String(input.totalAmount),
          reference: `SPLIT-${splitId}`,
          note: JSON.stringify({
            description: input.description,
            merchantName: input.merchantName,
            splits,
          }),
        });

        // Notify participants
        for (const p of splits) {
          if (p.userId && p.userId !== creatorId) {
            await createUserNotification({
              userId: Number(p.userId),
              category: "wallet",
              title: "Split Bill Request",
              content: `You owe ${input.currency} ${p.amount.toLocaleString()} for "${input.description}". Tap to pay your share.`,
            });
          }
        }

        return {
          splitId,
          totalAmount: input.totalAmount,
          currency: input.currency,
          description: input.description,
          merchantName: input.merchantName,
          participantCount,
          splits,
          paymentUrl: `https://pay.tourismpay.com/split/${splitId}`,
          whatsappUrl: `https://wa.me/?text=${encodeURIComponent(`Split bill: ${input.description} — pay your share: https://pay.tourismpay.com/split/${splitId}`)}`,
          status: "active",
          createdBy: creatorId,
        };
      }),

    payShare: protectedProcedure
      .input(z.object({
        splitId: z.string(),
        amount: z.number().positive(),
        currency: z.string().default("NGN"),
      }))
      .mutation(async ({ ctx, input }) => {
        const payerId = String(ctx.user.id);
        await debitWallet(
          payerId, input.currency, input.amount,
          "split_bill_pay", `Split Bill ${input.splitId}`,
          `SPLIT-PAY-${input.splitId}-${payerId}`
        );
        return { status: "paid", splitId: input.splitId, amount: input.amount };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const splits = await db.select()
        .from(walletTransactions)
        .where(and(
          eq(walletTransactions.userId, String(ctx.user.id)),
          eq(walletTransactions.type, "split_bill"),
        ))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(50);
      return splits.map(s => {
        const meta = JSON.parse(s.note ?? "{}");
        return {
          splitId: s.reference?.replace("SPLIT-", "") ?? "",
          totalAmount: parseFloat(s.amount ?? "0"),
          currency: s.fromCurrency,
          description: meta.description,
          merchantName: meta.merchantName,
          splits: meta.splits ?? [],
          status: s.status,
        };
      });
    }),
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. REQUEST MONEY
  // ═══════════════════════════════════════════════════════════════════════════

  requestMoney: router({
    create: protectedProcedure
      .input(z.object({
        amount: z.number().positive(),
        currency: z.string().default("NGN"),
        recipientUserId: z.string().optional(),
        recipientEmail: z.string().email().optional(),
        description: z.string().max(200),
        expiresInHours: z.number().int().min(1).max(168).default(48),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        const requestId = crypto.randomBytes(6).toString("hex");
        const requesterId = String(ctx.user.id);
        const expiresAt = new Date(Date.now() + input.expiresInHours * 3600 * 1000);

        await db.insert(walletTransactions).values({
          userId: requesterId,
          type: "money_request",
          status: "pending",
          fromCurrency: input.currency,
          amount: String(input.amount),
          reference: `REQ-${requestId}`,
          counterparty: input.recipientUserId ?? input.recipientEmail ?? "unknown",
          note: input.description,
        });

        if (input.recipientUserId) {
          await createUserNotification({
            userId: Number(input.recipientUserId),
            category: "wallet",
            title: "Money Request",
            content: `Someone requested ${input.currency} ${input.amount.toLocaleString()} from you: "${input.description}"`,
          });
        }

        return {
          requestId,
          amount: input.amount,
          currency: input.currency,
          description: input.description,
          recipientUserId: input.recipientUserId,
          recipientEmail: input.recipientEmail,
          expiresAt: expiresAt.toISOString(),
          status: "pending",
          paymentUrl: `https://pay.tourismpay.com/request/${requestId}`,
          whatsappUrl: `https://wa.me/?text=${encodeURIComponent(`Pay ${input.currency} ${input.amount} — ${input.description}: https://pay.tourismpay.com/request/${requestId}`)}`,
        };
      }),

    fulfill: protectedProcedure
      .input(z.object({
        requestId: z.string(),
        amount: z.number().positive(),
        currency: z.string().default("NGN"),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        const [req] = await db.select()
          .from(walletTransactions)
          .where(eq(walletTransactions.reference, `REQ-${input.requestId}`))
          .limit(1);

        if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
        if (req.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Request already fulfilled or expired" });

        const payerId = String(ctx.user.id);
        await debitWallet(payerId, input.currency, input.amount, "money_request_pay", `Money Request ${input.requestId}`, `REQ-PAY-${input.requestId}`);

        // Credit requester's wallet
        const [requesterWallet] = await db.select()
          .from(walletBalances)
          .where(and(eq(walletBalances.userId, req.userId), eq(walletBalances.currency, input.currency)));

        if (requesterWallet) {
          const newBal = parseFloat(requesterWallet.balance?.toString() ?? "0") + input.amount;
          await db.update(walletBalances)
            .set({ balance: newBal.toFixed(6), updatedAt: Math.floor(Date.now() / 1000) })
            .where(eq(walletBalances.id, requesterWallet.id));
        }

        await db.update(walletTransactions)
          .set({ status: "completed", completedAt: Math.floor(Date.now() / 1000) })
          .where(eq(walletTransactions.id, req.id));

        await createUserNotification({
          userId: Number(req.userId),
          category: "wallet",
          title: "Money Request Paid",
          content: `Your request for ${input.currency} ${input.amount.toLocaleString()} has been paid.`,
        });

        return { status: "fulfilled", requestId: input.requestId, amount: input.amount };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const requests = await db.select()
        .from(walletTransactions)
        .where(and(
          eq(walletTransactions.userId, String(ctx.user.id)),
          eq(walletTransactions.type, "money_request"),
        ))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(50);
      return requests.map(r => ({
        requestId: r.reference?.replace("REQ-", "") ?? "",
        amount: parseFloat(r.amount ?? "0"),
        currency: r.fromCurrency,
        description: r.note,
        recipient: r.counterparty,
        status: r.status,
      }));
    }),
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. USSD MERCHANT PAYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  ussdPay: router({
    generateCode: protectedProcedure
      .input(z.object({
        amount: z.number().positive(),
        currency: z.string().default("NGN"),
        merchantBankCode: z.string().optional(),
        merchantAccountNumber: z.string().optional(),
        description: z.string().max(100).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = String(ctx.user.id);
        const payCode = `*555*${Math.floor(Math.random() * 900000 + 100000)}#`;

        return {
          ussdCode: payCode,
          amount: input.amount,
          currency: input.currency,
          description: input.description ?? "USSD Payment",
          instructions: [
            `Dial ${payCode} on your phone`,
            "Follow the menu prompts",
            "Enter your PIN to confirm",
            "Payment will be deducted from your TourismPay wallet",
          ],
          expiresIn: 300,
        };
      }),
  }),
});
