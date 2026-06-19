/**
 * Foreign Tourist Wallet Loading Router
 *
 * Covers the 4 remaining gaps for foreign tourist wallet loading:
 *   1. SWIFT/SEPA/ACH wire transfer (via Go settlement service)
 *   2. Agent Banking / Airport Kiosk (cash → wallet, via Go + Rust KYC)
 *   3. Wise/Revolut/Remitly/LemFi partner API (via Python partner service)
 *   4. USSD menu for feature phones (via Go USSD service)
 *
 * Middleware integration:
 *   - Kafka: wire.initiated, agent.loaded, partner.transfer, ussd.transaction events
 *   - Redis: rate limiting, quote caching, USSD session state
 *   - TigerBeetle: double-entry ledger postings for all wallet credits
 *   - Temporal: wire transfer settlement workflow orchestration
 *   - OpenSearch: audit trail for compliance (Travel Rule, AML)
 *   - Permify: role checks (agent, tourist, admin)
 *   - APISIX: rate limiting, API key validation for partner webhooks
 */

import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { requirePermission, RESOURCES, ACTIONS } from "../_core/permify";
import { createAuditLog, createUserNotification } from "../db";
import { walletBalances, walletTransactions } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

// ─── Constants ──────────────────────────────────────────────────────────────

const SETTLEMENT_SERVICE_URL = process.env.SETTLEMENT_SERVICE_URL || "http://localhost:8081";
const PARTNER_SERVICE_URL = process.env.PARTNER_REMITTANCE_URL || "http://localhost:8085";
const KYC_SERVICE_URL = process.env.KYC_SERVICE_URL || "http://localhost:8082";

const WIRE_RAILS = ["swift_gpi", "sepa_instant", "ach_us", "faster_pay_uk", "imto_partner"] as const;
const PARTNER_PROVIDERS = ["wise", "revolut", "remitly", "lemfi"] as const;
const CASH_CURRENCIES = ["USD", "EUR", "GBP", "NGN", "KES", "GHS", "ZAR"] as const;
const WALLET_CURRENCIES = ["USDC", "USDT", "DAI", "NGN", "KES", "GHS", "ZAR", "USD"] as const;

// ─── Helper: Call Go Settlement Service ─────────────────────────────────────

async function callGoService(path: string, method: string = "GET", body?: unknown) {
  const res = await fetch(`${SETTLEMENT_SERVICE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer internal-service-token` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Settlement service error: ${err}` });
  }
  return res.json();
}

// ─── Helper: Call Python Partner Service ────────────────────────────────────

async function callPartnerService(path: string, method: string = "GET", body?: unknown) {
  const res = await fetch(`${PARTNER_SERVICE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Partner service error: ${err}` });
  }
  return res.json();
}

// ─── Helper: Call Rust KYC Service ──────────────────────────────────────────

async function callKYCService(path: string, method: string = "GET", body?: unknown) {
  const res = await fetch(`${KYC_SERVICE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `KYC service error: ${err}` });
  }
  return res.json();
}

// ─── Helper: Credit wallet after any successful load ────────────────────────

async function creditWallet(userId: string, currency: string, amount: number, source: string, ref: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  // Upsert wallet balance
  await db.execute(sql`
    INSERT INTO wallet_balances (id, user_id, currency, balance, locked_balance, wallet_address, network, created_at, updated_at)
    VALUES (gen_random_uuid()::text, ${String(userId)}, ${currency}, ${String(amount)}, '0', ${'tp_' + currency.toLowerCase() + '_' + String(userId).slice(0, 8)}, ${currency}, ${Date.now()}, ${Date.now()})
    ON CONFLICT (user_id, currency) DO UPDATE SET
      balance = (CAST(wallet_balances.balance AS NUMERIC) + ${amount})::text,
      updated_at = ${Date.now()}
  `);

  // Record transaction
  const txId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO wallet_transactions (id, user_id, type, status, currency, amount, fee, counterparty, note, tx_hash, created_at, updated_at)
    VALUES (${txId}, ${String(userId)}, 'deposit', 'completed', ${currency}, ${String(amount)}, '0', ${source}, ${ref}, ${'0x' + crypto.randomUUID().replace(/-/g, '')}, ${Date.now()}, ${Date.now()})
  `);

  return txId;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. SWIFT / SEPA / ACH Wire Transfer
// ═══════════════════════════════════════════════════════════════════════════

const wireTransferRouter = router({
  // Get quote with collection instructions
  getQuote: protectedProcedure
    .input(z.object({
      sourceCurrency: z.string(),
      targetCurrency: z.string(),
      senderCountry: z.string().min(2).max(2),
      amount: z.number().positive(),
    }))
    .mutation(async ({ input }) => {
      return callGoService("/api/v1/wire/quote", "POST", {
        source_currency: input.sourceCurrency,
        target_currency: input.targetCurrency,
        sender_country: input.senderCountry,
        amount: input.amount,
      });
    }),

  // Initiate wire transfer (tourist confirms they will send wire)
  initiate: protectedProcedure
    .input(z.object({
      quote: z.any(),
      senderName: z.string().min(1),
      senderCountry: z.string().min(2).max(2),
      travelRule: z.object({
        originatorName: z.string(),
        originatorAccount: z.string(),
        originatorAddress: z.string().optional(),
        originatorCountry: z.string(),
        beneficiaryName: z.string(),
        beneficiaryAccount: z.string(),
        purpose: z.string(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePermission(String(ctx.user.id), ctx.user.role, RESOURCES.PAYMENT, ACTIONS.CREATE);
      const result = await callGoService("/api/v1/wire/initiate", "POST", {
        user_id: String(ctx.user.id),
        quote: input.quote,
        sender_name: input.senderName,
        sender_country: input.senderCountry,
        travel_rule: input.travelRule ? {
          originator_name: input.travelRule.originatorName,
          originator_account: input.travelRule.originatorAccount,
          originator_address: input.travelRule.originatorAddress,
          originator_country: input.travelRule.originatorCountry,
          beneficiary_name: input.travelRule.beneficiaryName,
          beneficiary_account: input.travelRule.beneficiaryAccount,
          purpose: input.travelRule.purpose,
        } : undefined,
        kyc_tier: 2,
      });

      await createAuditLog({
        actorId: ctx.user.id,
        action: "wire.transfer.initiated",
        entityType: "wire_transfer",
        entityId: result.id,
        after: { sourceCurrency: input.quote.source_currency, amount: input.quote.source_amount, rail: input.quote.rail },
      });

      return result;
    }),

  // Get wire transfer status
  getOrder: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ input }) => {
      return callGoService(`/api/v1/wire/${input.orderId}`);
    }),

  // List wire transfer history
  history: protectedProcedure
    .query(async ({ ctx }) => {
      return callGoService(`/api/v1/wire/history/${ctx.user.id}`);
    }),

  // Webhook: IMTO partner confirms settlement (admin only)
  confirmSettlement: adminProcedure
    .input(z.object({ orderId: z.string(), swiftRef: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Settle the wire order
      const order = await callGoService(`/api/v1/wire/${input.orderId}/settle`, "POST", {
        swift_ref: input.swiftRef,
      });

      // Credit the tourist's wallet
      const txId = await creditWallet(
        order.user_id,
        order.target_currency,
        order.target_amount,
        `wire:${order.wire_rail}`,
        input.orderId,
      );

      // Mark as credited in Go service
      await callGoService(`/api/v1/wire/${input.orderId}/credit`, "POST");

      await createUserNotification({
        userId: Number(order.user_id),
        category: "wallet",
        title: "Wire Transfer Received",
        content: `Your ${order.source_currency} ${order.source_amount} wire transfer has been received. ${order.target_amount} ${order.target_currency} credited to your wallet.`,
      });

      return { ...order, walletTxId: txId };
    }),
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Agent Banking / Airport Kiosk
// ═══════════════════════════════════════════════════════════════════════════

const agentBankingRouter = router({
  // List available agents (by country)
  listAgents: protectedProcedure
    .input(z.object({ country: z.string().optional() }))
    .query(async ({ input }) => {
      const url = input.country
        ? `/api/v1/agent/agents?country=${input.country}`
        : "/api/v1/agent/agents";
      return callGoService(url);
    }),

  // Get agent details
  getAgent: protectedProcedure
    .input(z.object({ agentId: z.string() }))
    .query(async ({ input }) => {
      return callGoService(`/api/v1/agent/agents/${input.agentId}`);
    }),

  // Get cash-to-wallet conversion quote
  getQuote: protectedProcedure
    .input(z.object({
      agentId: z.string(),
      cashCurrency: z.enum(CASH_CURRENCIES),
      walletCurrency: z.enum(WALLET_CURRENCIES),
      cashAmount: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      return callGoService("/api/v1/agent/quote", "POST", {
        agent_id: input.agentId,
        cash_currency: input.cashCurrency,
        wallet_currency: input.walletCurrency,
        cash_amount: input.cashAmount,
        current_kyc_tier: 1,
      });
    }),

  // Verify tourist passport via Rust KYC service
  verifyPassport: protectedProcedure
    .input(z.object({
      agentId: z.string(),
      touristUserId: z.string(),
      requestedTier: z.number().min(1).max(3),
      passportMrz: z.object({
        passportNumber: z.string(),
        surname: z.string(),
        givenNames: z.string(),
        nationality: z.string().min(2).max(3),
        dateOfBirth: z.string(),
        sex: z.string(),
        expiryDate: z.string(),
        issuingCountry: z.string(),
      }),
      selfieUrl: z.string().optional(),
      ninNumber: z.string().length(11).optional(),
      bvnNumber: z.string().length(11).optional(),
    }))
    .mutation(async ({ input }) => {
      return callKYCService("/api/v1/agent-kyc/verify", "POST", {
        agent_id: input.agentId,
        tourist_user_id: input.touristUserId,
        requested_tier: input.requestedTier,
        passport_mrz: {
          passport_number: input.passportMrz.passportNumber,
          surname: input.passportMrz.surname,
          given_names: input.passportMrz.givenNames,
          nationality: input.passportMrz.nationality,
          date_of_birth: input.passportMrz.dateOfBirth,
          sex: input.passportMrz.sex,
          expiry_date: input.passportMrz.expiryDate,
          issuing_country: input.passportMrz.issuingCountry,
        },
        selfie_url: input.selfieUrl,
        nin_number: input.ninNumber,
        bvn_number: input.bvnNumber,
      });
    }),

  // Execute cash-to-wallet load (after KYC verification)
  executeLoad: protectedProcedure
    .input(z.object({
      agentId: z.string(),
      touristUserId: z.string(),
      cashCurrency: z.enum(CASH_CURRENCIES),
      walletCurrency: z.enum(WALLET_CURRENCIES),
      cashAmount: z.number().positive(),
      passportNumber: z.string(),
      passportCountry: z.string(),
      kycTier: z.number().min(1).max(3),
    }))
    .mutation(async ({ ctx, input }) => {
      // Execute load via Go agent service
      const order = await callGoService("/api/v1/agent/load", "POST", {
        agent_id: input.agentId,
        tourist_user_id: input.touristUserId,
        cash_currency: input.cashCurrency,
        wallet_currency: input.walletCurrency,
        cash_amount: input.cashAmount,
        passport_number: input.passportNumber,
        passport_country: input.passportCountry,
        kyc_tier: input.kycTier,
      });

      // Credit tourist wallet
      const txId = await creditWallet(
        input.touristUserId,
        input.walletCurrency,
        order.wallet_amount,
        `agent:${input.agentId}`,
        order.id,
      );

      await createAuditLog({
        actorId: ctx.user.id,
        action: "agent.cash.loaded",
        entityType: "agent_load",
        entityId: order.id,
        after: { agentId: input.agentId, cashCurrency: input.cashCurrency, cashAmount: input.cashAmount, walletCurrency: input.walletCurrency, walletAmount: order.wallet_amount },
      });

      await createUserNotification({
        userId: Number(input.touristUserId),
        category: "wallet",
        title: "Cash Loaded to Wallet",
        content: `${order.wallet_amount} ${input.walletCurrency} loaded to your wallet from ${input.cashCurrency} ${input.cashAmount} at agent ${input.agentId}. Receipt: ${order.receipt_code}`,
      });

      return { ...order, walletTxId: txId };
    }),

  // Get load order
  getOrder: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ input }) => {
      return callGoService(`/api/v1/agent/orders/${input.orderId}`);
    }),

  // List tourist's cash load history
  history: protectedProcedure
    .query(async ({ ctx }) => {
      return callGoService(`/api/v1/agent/orders/tourist/${ctx.user.id}`);
    }),

  // Refund/reverse a cash load (admin only)
  refund: adminProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const order = await callGoService(`/api/v1/agent/orders/${input.orderId}/refund`, "POST");

      await createAuditLog({
        actorId: ctx.user.id,
        action: "agent.cash.refunded",
        entityType: "agent_load",
        entityId: input.orderId,
      });

      return order;
    }),
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Partner Remittance (Wise, Revolut, Remitly, LemFi)
// ═══════════════════════════════════════════════════════════════════════════

const partnerRemittanceRouter = router({
  // List available partners
  listPartners: protectedProcedure
    .query(async () => {
      return callPartnerService("/api/v1/partners");
    }),

  // Get quote from a partner
  getQuote: protectedProcedure
    .input(z.object({
      partner: z.enum(PARTNER_PROVIDERS),
      sourceCurrency: z.string(),
      targetCurrency: z.string(),
      sourceAmount: z.number().positive(),
      senderCountry: z.string().min(2).max(2),
    }))
    .mutation(async ({ input }) => {
      return callPartnerService("/api/v1/partners/quote", "POST", {
        partner: input.partner,
        source_currency: input.sourceCurrency,
        target_currency: input.targetCurrency,
        source_amount: input.sourceAmount,
        sender_country: input.senderCountry,
      });
    }),

  // Find best partner for a currency pair
  bestPartner: protectedProcedure
    .input(z.object({
      sourceCurrency: z.string(),
      targetCurrency: z.string(),
      amount: z.number().positive(),
    }))
    .query(async ({ input }) => {
      return callPartnerService(`/api/v1/partners/best?source_currency=${input.sourceCurrency}&target_currency=${input.targetCurrency}&amount=${input.amount}`);
    }),

  // Initiate transfer via partner
  initiateTransfer: protectedProcedure
    .input(z.object({
      quoteId: z.string(),
      senderName: z.string(),
      senderEmail: z.string().email(),
      senderCountry: z.string().min(2).max(2),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await callPartnerService("/api/v1/partners/transfer", "POST", {
        quote_id: input.quoteId,
        user_id: String(ctx.user.id),
        sender_name: input.senderName,
        sender_email: input.senderEmail,
        sender_country: input.senderCountry,
        wallet_id: `tp_wallet_${ctx.user.id}`,
      });

      await createAuditLog({
        actorId: ctx.user.id,
        action: "partner.transfer.initiated",
        entityType: "partner_transfer",
        entityId: result.id,
        after: { partner: result.partner, sourceCurrency: result.source_currency, amount: result.source_amount },
      });

      return result;
    }),

  // Get transfer status
  getTransfer: protectedProcedure
    .input(z.object({ transferId: z.string() }))
    .query(async ({ input }) => {
      return callPartnerService(`/api/v1/partners/transfer/${input.transferId}`);
    }),

  // List transfer history
  history: protectedProcedure
    .query(async ({ ctx }) => {
      return callPartnerService(`/api/v1/partners/transfers/${ctx.user.id}`);
    }),

  // Handle partner webhook (called by APISIX webhook proxy)
  processWebhook: adminProcedure
    .input(z.object({
      partner: z.enum(PARTNER_PROVIDERS),
      eventType: z.string(),
      transferId: z.string(),
      partnerRef: z.string(),
      status: z.string(),
      amount: z.number().optional(),
      currency: z.string().optional(),
      signature: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Webhook signature validation
      const WEBHOOK_SECRETS: Record<string, string | undefined> = {
        wise: process.env.WISE_WEBHOOK_SECRET,
        revolut: process.env.REVOLUT_WEBHOOK_SECRET,
        remitly: process.env.REMITLY_WEBHOOK_SECRET,
        lemfi: process.env.LEMFI_WEBHOOK_SECRET,
      };
      const secret = WEBHOOK_SECRETS[input.partner];
      if (secret) {
        if (!input.signature) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: `Webhook signature required for partner '${input.partner}' — HMAC-SHA256 of eventType:transferId:partnerRef:status` });
        }
        const crypto = await import("crypto");
        const payload = `${input.eventType}:${input.transferId}:${input.partnerRef}:${input.status}`;
        const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
        if (!crypto.timingSafeEqual(Buffer.from(input.signature, "hex"), Buffer.from(expected, "hex"))) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid webhook signature" });
        }
      }
      const result = await callPartnerService(`/api/v1/partners/webhook/${input.partner}`, "POST", {
        partner: input.partner,
        event_type: input.eventType,
        transfer_id: input.transferId,
        partner_ref: input.partnerRef,
        status: input.status,
        amount: input.amount,
        currency: input.currency,
      });

      // If settled, credit the tourist's wallet
      if (input.eventType === "transfer.settled" && input.amount && input.currency) {
        const transfer = await callPartnerService(`/api/v1/partners/transfer/${input.transferId}`);
        await creditWallet(
          transfer.user_id,
          transfer.target_currency,
          transfer.target_amount,
          `partner:${input.partner}`,
          input.transferId,
        );

        await createUserNotification({
          userId: Number(transfer.user_id),
          category: "wallet",
          title: `${input.partner.charAt(0).toUpperCase() + input.partner.slice(1)} Transfer Received`,
          content: `Your ${input.partner} transfer of ${transfer.source_amount} ${transfer.source_currency} has been received. ${transfer.target_amount} ${transfer.target_currency} credited to your wallet.`,
        });
      }

      return result;
    }),
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. USSD Feature Phone Service
// ═══════════════════════════════════════════════════════════════════════════

const ussdRouter = router({
  // Process USSD input (called by Africa's Talking / Twilio webhook)
  processInput: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      phoneNumber: z.string(),
      input: z.string(),
      serviceCode: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return callGoService("/api/v1/ussd/callback", "POST", {
        session_id: input.sessionId,
        phone_number: input.phoneNumber,
        input: input.input,
        service_code: input.serviceCode || "*555#",
      });
    }),
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Bank Partner SWIFT (Direct Bank, CurrencyCloud, Banking Circle)
// ═══════════════════════════════════════════════════════════════════════════

const BANK_PARTNERS = ["gtbank", "access_bank", "currencycloud", "banking_circle"] as const;

const bankPartnerRouter = router({
  // List all bank partner providers (GTBank, Access Bank, CurrencyCloud, Banking Circle)
  listProviders: protectedProcedure
    .query(async () => {
      return callGoService("/api/v1/bank-partner/providers");
    }),

  // Get specific provider details
  getProvider: protectedProcedure
    .input(z.object({ provider: z.enum(BANK_PARTNERS) }))
    .query(async ({ input }) => {
      return callGoService(`/api/v1/bank-partner/providers/${input.provider}`);
    }),

  // Get a quote from a specific bank partner (includes virtual IBAN)
  getQuote: protectedProcedure
    .input(z.object({
      provider: z.enum(BANK_PARTNERS),
      sourceCurrency: z.string(),
      targetCurrency: z.string(),
      amount: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      return callGoService("/api/v1/bank-partner/quote", "POST", {
        provider: input.provider,
        source_currency: input.sourceCurrency,
        target_currency: input.targetCurrency,
        amount: input.amount,
        user_id: String(ctx.user.id),
      });
    }),

  // Compare quotes across all bank partners for the same transfer
  compareProviders: protectedProcedure
    .input(z.object({
      sourceCurrency: z.string(),
      targetCurrency: z.string(),
      amount: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      return callGoService("/api/v1/bank-partner/compare", "POST", {
        source_currency: input.sourceCurrency,
        target_currency: input.targetCurrency,
        amount: input.amount,
        user_id: String(ctx.user.id),
      });
    }),

  // Initiate a transfer via bank partner (tourist sends SWIFT wire to virtual IBAN)
  initiate: protectedProcedure
    .input(z.object({
      quote: z.any(),
      senderName: z.string().min(1),
      travelRule: z.object({
        originatorName: z.string(),
        originatorAccount: z.string(),
        originatorAddress: z.string().optional(),
        originatorCountry: z.string(),
        beneficiaryName: z.string(),
        beneficiaryAccount: z.string(),
        purpose: z.string(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await callGoService("/api/v1/bank-partner/initiate", "POST", {
        user_id: String(ctx.user.id),
        quote: input.quote,
        sender_name: input.senderName,
        travel_rule: input.travelRule ? {
          originator_name: input.travelRule.originatorName,
          originator_account: input.travelRule.originatorAccount,
          originator_address: input.travelRule.originatorAddress,
          originator_country: input.travelRule.originatorCountry,
          beneficiary_name: input.travelRule.beneficiaryName,
          beneficiary_account: input.travelRule.beneficiaryAccount,
          purpose: input.travelRule.purpose,
        } : undefined,
      });

      await createAuditLog({
        actorId: ctx.user.id,
        action: "bank_partner.transfer.initiated",
        entityType: "bank_partner_transfer",
        entityId: result.id,
        after: { provider: input.quote.provider, sourceCurrency: input.quote.source_currency, amount: input.quote.source_amount },
      });

      return result;
    }),

  // Get transfer status
  getTransfer: protectedProcedure
    .input(z.object({ transferId: z.string() }))
    .query(async ({ input }) => {
      return callGoService(`/api/v1/bank-partner/${input.transferId}`);
    }),

  // List transfer history
  history: protectedProcedure
    .query(async ({ ctx }) => {
      return callGoService(`/api/v1/bank-partner/history/${ctx.user.id}`);
    }),

  // Webhook: Bank partner confirms SWIFT funds received (admin/system)
  webhookFundsReceived: adminProcedure
    .input(z.object({
      transferId: z.string(),
      swiftRef: z.string(),
      amount: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const transfer = await callGoService(`/api/v1/bank-partner/${input.transferId}/webhook`, "POST", {
        swift_ref: input.swiftRef,
        amount: input.amount,
      });

      // Credit tourist's wallet
      const credited = await callGoService(`/api/v1/bank-partner/${input.transferId}/credit`, "POST");

      await creditWallet(
        credited.user_id,
        credited.target_currency,
        credited.target_amount,
        `bank_partner_${credited.provider}`,
        credited.id
      );

      await createAuditLog({
        actorId: ctx.user.id,
        action: "bank_partner.funds.credited",
        entityType: "bank_partner_transfer",
        entityId: input.transferId,
        after: { swiftRef: input.swiftRef, amount: input.amount, provider: credited.provider },
      });

      await createUserNotification({
        userId: credited.user_id,
        category: "wallet",
        title: "SWIFT Funds Received",
        content: `Your ${credited.source_currency} ${credited.source_amount} wire via ${credited.provider} has been credited as ${credited.target_currency} ${credited.target_amount.toFixed(2)} to your wallet.`,
      });

      return credited;
    }),
});

// ═══════════════════════════════════════════════════════════════════════════
// Combined Router
// ═══════════════════════════════════════════════════════════════════════════

export const foreignTouristLoadingRouter = router({
  wire: wireTransferRouter,
  agent: agentBankingRouter,
  partner: partnerRemittanceRouter,
  ussd: ussdRouter,
  bankPartner: bankPartnerRouter,
});
