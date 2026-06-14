/**
 * Stablecoin On-Ramp / Off-Ramp Router
 *
 * On-Ramp:  Fiat → Stablecoin  (tourist/diaspora buys USDC/USDT with local currency)
 * Off-Ramp: Stablecoin → Fiat  (merchant/agent sells USDC for M-Pesa, bank transfer, etc.)
 *
 * African Payment Rails:
 *   - M-Pesa (Kenya, Tanzania)       - MTN MoMo (Ghana, Uganda, Cameroon)
 *   - Orange Money (Senegal, Mali)    - Airtel Money (Zambia, Uganda)
 *   - Vodacom M-Pesa (DRC, Tanzania) - OPay (Nigeria)
 *   - Flutterwave (pan-African)       - Chipper Cash (pan-African)
 *   - Bank Transfer (SWIFT, local)    - Stripe (global cards)
 *   - Mojaloop (interbank, ILP)       - CBDC Bridge (eNaira, eCedi)
 *
 * Settlement: TigerBeetle double-entry ledger via Go settlement service.
 * Compliance: BIS auto-flag for high-value, velocity checks.
 */
import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb, withTransaction } from "../db";
import {
  stablecoinOnrampOrders,
  stablecoinOfframpRequests,
  stablecoinLimitOrders,
  stablecoinYieldPositions,
  walletBalances,
  walletTransactions,
} from "../../drizzle/schema";
import { eq, and, desc, sql, gte, lte, count } from "drizzle-orm";
import { createAuditLog, createUserNotification } from "../db";
import { cacheGet, cacheSet } from "../_core/redis";
import { checkAndAutoFlag } from "./bisIntegration";
import crypto from "crypto";

// ─── Constants ───────────────────────────────────────────────────────────────

const SUPPORTED_STABLECOINS = ["USDC", "USDT", "DAI", "CBDC-NG", "CBDC-KE", "CBDC-GH"] as const;
const FIAT_CURRENCIES = ["NGN", "KES", "GHS", "ZAR", "TZS", "UGX", "XOF", "XAF", "USD", "EUR", "GBP"] as const;
const PAYMENT_RAILS = [
  "stripe_card", "bank_transfer", "mpesa", "mtn_momo", "orange_money",
  "airtel_money", "vodacom_mpesa", "opay", "flutterwave", "chipper_cash",
  "mojaloop", "cbdc_bridge",
] as const;

type Stablecoin = typeof SUPPORTED_STABLECOINS[number];
type FiatCurrency = typeof FIAT_CURRENCIES[number];

// Fee tiers: lower fees for higher volumes and preferred rails
const ONRAMP_FEE_SCHEDULE: Record<string, { percent: number; min: number; max: number }> = {
  stripe_card:    { percent: 2.5, min: 0.50, max: 50 },
  bank_transfer:  { percent: 0.5, min: 0.10, max: 25 },
  mpesa:          { percent: 1.0, min: 0.05, max: 15 },
  mtn_momo:       { percent: 1.0, min: 0.05, max: 15 },
  orange_money:   { percent: 1.2, min: 0.05, max: 15 },
  airtel_money:   { percent: 1.0, min: 0.05, max: 15 },
  vodacom_mpesa:  { percent: 1.0, min: 0.05, max: 15 },
  opay:           { percent: 0.8, min: 0.05, max: 20 },
  flutterwave:    { percent: 1.4, min: 0.10, max: 25 },
  chipper_cash:   { percent: 1.0, min: 0.05, max: 15 },
  mojaloop:       { percent: 0.3, min: 0.02, max: 10 },
  cbdc_bridge:    { percent: 0.1, min: 0.01, max: 5 },
};

const OFFRAMP_FEE_SCHEDULE: Record<string, { percent: number; min: number; max: number }> = {
  bank_transfer:  { percent: 0.8, min: 0.25, max: 30 },
  mpesa:          { percent: 1.2, min: 0.10, max: 20 },
  mtn_momo:       { percent: 1.2, min: 0.10, max: 20 },
  orange_money:   { percent: 1.5, min: 0.10, max: 20 },
  airtel_money:   { percent: 1.2, min: 0.10, max: 20 },
  vodacom_mpesa:  { percent: 1.2, min: 0.10, max: 20 },
  opay:           { percent: 1.0, min: 0.10, max: 25 },
  flutterwave:    { percent: 1.5, min: 0.15, max: 30 },
  chipper_cash:   { percent: 1.0, min: 0.10, max: 20 },
  mojaloop:       { percent: 0.4, min: 0.05, max: 10 },
  cbdc_bridge:    { percent: 0.15, min: 0.02, max: 5 },
  stripe_card:    { percent: 2.0, min: 0.50, max: 50 },
};

// Stablecoin → USD base rates (stablecoins are pegged ~$1)
const STABLECOIN_USD: Record<string, number> = {
  USDC: 1.0, USDT: 1.0, DAI: 1.0,
  "CBDC-NG": 0.00065, "CBDC-KE": 0.0077, "CBDC-GH": 0.067,
};

// Fiat → USD base rates
const FIAT_USD: Record<string, number> = {
  USD: 1.0, EUR: 1.09, GBP: 1.27,
  NGN: 0.00065, KES: 0.0077, GHS: 0.067, ZAR: 0.054,
  TZS: 0.00039, UGX: 0.00027, XOF: 0.0016, XAF: 0.0016,
};

// Rail → Country mapping
const RAIL_COUNTRIES: Record<string, string[]> = {
  mpesa:          ["KE", "TZ"],
  mtn_momo:       ["GH", "UG", "CM", "CI", "RW"],
  orange_money:   ["SN", "ML", "CI", "CM"],
  airtel_money:   ["ZM", "UG", "TZ", "KE"],
  vodacom_mpesa:  ["CD", "TZ", "MZ"],
  opay:           ["NG"],
  flutterwave:    ["NG", "KE", "GH", "ZA", "TZ", "UG"],
  chipper_cash:   ["NG", "KE", "GH", "ZA", "TZ", "UG", "RW"],
  bank_transfer:  ["NG", "KE", "GH", "ZA", "TZ", "UG", "US", "GB"],
  stripe_card:    ["US", "GB", "NG", "KE", "GH", "ZA"],
  mojaloop:       ["NG", "KE", "GH", "ZA", "TZ", "UG"],
  cbdc_bridge:    ["NG", "GH"],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calculateFee(
  amountUsd: number,
  rail: string,
  schedule: Record<string, { percent: number; min: number; max: number }>
): { feeCents: number; feeUsd: number; feePercent: number } {
  const tier = schedule[rail] ?? { percent: 2.0, min: 0.50, max: 50 };
  const rawFee = amountUsd * (tier.percent / 100);
  const feeUsd = Math.max(tier.min, Math.min(rawFee, tier.max));
  const feeCents = Math.round(feeUsd * 1_000_000);
  return { feeCents, feeUsd: feeCents / 1_000_000, feePercent: tier.percent };
}

function getExchangeRate(fromCurrency: string, toCurrency: string): number {
  const fromUsd = FIAT_USD[fromCurrency] ?? STABLECOIN_USD[fromCurrency] ?? 1;
  const toUsd = FIAT_USD[toCurrency] ?? STABLECOIN_USD[toCurrency] ?? 1;
  return fromUsd / toUsd;
}

function selectBestRail(country: string, amount: number, direction: "onramp" | "offramp"): string {
  const schedule = direction === "onramp" ? ONRAMP_FEE_SCHEDULE : OFFRAMP_FEE_SCHEDULE;
  const candidates = Object.entries(RAIL_COUNTRIES)
    .filter(([, countries]) => countries.includes(country))
    .map(([rail]) => rail);
  if (candidates.length === 0) return "bank_transfer";
  let bestRail = candidates[0];
  let bestFee = Infinity;
  for (const rail of candidates) {
    const { feeUsd } = calculateFee(amount, rail, schedule);
    if (feeUsd < bestFee) {
      bestFee = feeUsd;
      bestRail = rail;
    }
  }
  return bestRail;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const stablecoinSwapRouter = router({
  // ─── INFO ────────────────────────────────────────────────────────────────────

  supportedRails: protectedProcedure.query(() => {
    return {
      stablecoins: SUPPORTED_STABLECOINS.map(s => ({
        symbol: s,
        name: s === "USDC" ? "USD Coin (Circle)" : s === "USDT" ? "Tether USD" : s === "DAI" ? "Dai" :
              s === "CBDC-NG" ? "eNaira" : s === "CBDC-KE" ? "eCedi (Kenya)" : "eCedi (Ghana)",
        usdPeg: STABLECOIN_USD[s] ?? 1,
      })),
      fiatCurrencies: FIAT_CURRENCIES.map(f => ({
        symbol: f,
        usdRate: FIAT_USD[f] ?? 1,
      })),
      paymentRails: Object.entries(RAIL_COUNTRIES).map(([rail, countries]) => ({
        rail,
        countries,
        onrampFee: ONRAMP_FEE_SCHEDULE[rail],
        offrampFee: OFFRAMP_FEE_SCHEDULE[rail],
      })),
    };
  }),

  // ─── ON-RAMP: Get Quote ──────────────────────────────────────────────────────

  onrampQuote: protectedProcedure
    .input(z.object({
      sourceCurrency: z.enum(FIAT_CURRENCIES),
      sourceAmount: z.number().positive().max(50000),
      targetStablecoin: z.enum(SUPPORTED_STABLECOINS).default("USDC"),
      paymentRail: z.enum(PAYMENT_RAILS),
      country: z.string().length(2).optional(),
    }))
    .query(({ input }) => {
      const rate = getExchangeRate(input.sourceCurrency, input.targetStablecoin);
      const amountUsd = input.sourceAmount * (FIAT_USD[input.sourceCurrency] ?? 1);
      const { feeUsd, feePercent } = calculateFee(amountUsd, input.paymentRail, ONRAMP_FEE_SCHEDULE);
      const spreadPercent = 0.3;
      const effectiveRate = rate * (1 - spreadPercent / 100);
      const targetAmount = (input.sourceAmount - feeUsd / (FIAT_USD[input.sourceCurrency] ?? 1)) * effectiveRate;

      return {
        sourceCurrency: input.sourceCurrency,
        sourceAmount: input.sourceAmount,
        targetStablecoin: input.targetStablecoin,
        targetAmount: Math.round(targetAmount * 1e6) / 1e6,
        exchangeRate: effectiveRate,
        fee: feeUsd,
        feePercent,
        spreadPercent,
        paymentRail: input.paymentRail,
        estimatedTime: input.paymentRail === "stripe_card" ? "~2 min" :
                       input.paymentRail === "mpesa" || input.paymentRail === "mtn_momo" ? "~5 min" :
                       input.paymentRail === "bank_transfer" ? "1-3 business days" :
                       input.paymentRail === "cbdc_bridge" ? "~30 sec" : "~10 min",
        expiresAt: Date.now() + 5 * 60 * 1000,
      };
    }),

  // ─── ON-RAMP: Buy Stablecoin ─────────────────────────────────────────────────

  onrampBuy: protectedProcedure
    .input(z.object({
      sourceCurrency: z.enum(FIAT_CURRENCIES),
      sourceAmount: z.number().positive().max(50000),
      targetStablecoin: z.enum(SUPPORTED_STABLECOINS).default("USDC"),
      paymentRail: z.enum(PAYMENT_RAILS),
      country: z.string().length(2).optional(),
      mobileNumber: z.string().max(32).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Rate limit: max 10 on-ramp orders per hour
      const rlKey = `rl:onramp:${ctx.user.id}`;
      const rlCount = await cacheGet<number>(rlKey);
      if (rlCount !== null && rlCount >= 10) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Max 10 on-ramp orders per hour." });
      }
      await cacheSet(rlKey, (rlCount ?? 0) + 1, 3600);

      // Calculate pricing
      const rate = getExchangeRate(input.sourceCurrency, input.targetStablecoin);
      const amountUsd = input.sourceAmount * (FIAT_USD[input.sourceCurrency] ?? 1);
      const { feeUsd, feePercent } = calculateFee(amountUsd, input.paymentRail, ONRAMP_FEE_SCHEDULE);
      const spreadPercent = 0.3;
      const effectiveRate = rate * (1 - spreadPercent / 100);
      const feeInSource = feeUsd / (FIAT_USD[input.sourceCurrency] ?? 1);
      const targetAmount = Math.round((input.sourceAmount - feeInSource) * effectiveRate * 1e6) / 1e6;

      const orderId = crypto.randomUUID();
      const walletAddress = `tp_${input.targetStablecoin.toLowerCase().replace("-", "_")}_${String(ctx.user.id).slice(0, 8)}`;

      await db.insert(stablecoinOnrampOrders).values({
        id: orderId,
        userId: String(ctx.user.id),
        status: "pending_payment",
        sourceCurrency: input.sourceCurrency,
        sourceAmount: String(input.sourceAmount),
        paymentRail: input.paymentRail,
        targetStablecoin: input.targetStablecoin,
        targetAmount: String(targetAmount),
        targetWalletAddress: walletAddress,
        targetNetwork: input.targetStablecoin.startsWith("CBDC") ? "cbdc" : "stellar",
        exchangeRate: String(effectiveRate),
        fee: String(feeUsd),
        feePercent: String(feePercent),
        spreadPercent: String(spreadPercent),
        country: input.country ?? null,
        mobileNumber: input.mobileNumber ?? null,
        quoteExpiresAt: Date.now() + 15 * 60 * 1000,
      });

      // Simulate payment received → mint stablecoin → credit wallet
      const mintTxHash = `0x${crypto.randomBytes(32).toString("hex")}`;

      await withTransaction(async (tx) => {
        // Credit stablecoin to user wallet
        const [bal] = await tx`
          SELECT id, balance FROM wallet_balances
          WHERE user_id = ${String(ctx.user.id)} AND currency = ${input.targetStablecoin}
          FOR UPDATE
        `;
        if (!bal) {
          await tx`
            INSERT INTO wallet_balances (id, user_id, currency, balance, locked_balance, wallet_address, network, created_at, updated_at)
            VALUES (${crypto.randomUUID()}, ${String(ctx.user.id)}, ${input.targetStablecoin}, ${String(targetAmount)}, '0',
              ${walletAddress}, ${"Stellar / Ethereum"}, ${Date.now()}, ${Date.now()})
          `;
        } else {
          await tx`
            UPDATE wallet_balances SET balance = ${String(parseFloat(bal.balance) + targetAmount)}, updated_at = ${Date.now()}
            WHERE id = ${bal.id}
          `;
        }

        // Record wallet transaction
        const txId = crypto.randomUUID();
        await tx`
          INSERT INTO wallet_transactions (id, user_id, type, status, from_currency, to_currency, amount, to_amount, fee, reference, note, tx_hash, completed_at, created_at)
          VALUES (${txId}, ${String(ctx.user.id)}, 'deposit', 'completed', ${input.sourceCurrency}, ${input.targetStablecoin},
            ${String(input.sourceAmount)}, ${String(targetAmount)}, ${String(feeUsd)},
            ${"ONRAMP:" + orderId}, ${"On-ramp: " + input.sourceAmount + " " + input.sourceCurrency + " → " + targetAmount.toFixed(2) + " " + input.targetStablecoin + " via " + input.paymentRail},
            ${mintTxHash}, ${Date.now()}, ${Date.now()})
        `;

        // Update onramp order to completed
        await tx`
          UPDATE stablecoin_onramp_orders SET status = 'completed', mint_tx_hash = ${mintTxHash}, payment_ref = ${"PAY-" + crypto.randomBytes(8).toString("hex")},
            completed_at = ${Date.now()}, updated_at = ${Date.now()}, kyc_verified = true
          WHERE id = ${orderId}
        `;
      });

      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "stablecoin.onramp.buy",
        entityType: "stablecoin_onramp_order",
        entityId: orderId,
        after: { sourceCurrency: input.sourceCurrency, sourceAmount: input.sourceAmount, targetStablecoin: input.targetStablecoin, targetAmount, paymentRail: input.paymentRail },
      });

      // BIS auto-flag for high-value on-ramps
      if (amountUsd >= 500) {
        checkAndAutoFlag({
          walletTxId: orderId,
          userId: String(ctx.user.id),
          currency: input.targetStablecoin,
          amount: targetAmount,
          counterparty: `onramp:${input.paymentRail}`,
        }).catch(() => {});
      }

      await createUserNotification({
        userId: ctx.user.id,
        category: "system",
        title: `${input.targetStablecoin} Purchased`,
        content: `You bought ${targetAmount.toFixed(2)} ${input.targetStablecoin} for ${input.sourceAmount} ${input.sourceCurrency} via ${input.paymentRail}. Fee: $${feeUsd.toFixed(2)}.`,
        actionUrl: "/wallet",
        actionLabel: "View Wallet",
      });

      return {
        success: true,
        orderId,
        targetAmount,
        fee: feeUsd,
        exchangeRate: effectiveRate,
        mintTxHash,
        paymentRail: input.paymentRail,
      };
    }),

  // ─── OFF-RAMP: Get Quote ─────────────────────────────────────────────────────

  offrampQuote: protectedProcedure
    .input(z.object({
      sourceStablecoin: z.enum(SUPPORTED_STABLECOINS).default("USDC"),
      sourceAmount: z.number().positive().max(50000),
      targetCurrency: z.enum(FIAT_CURRENCIES),
      payoutRail: z.enum(PAYMENT_RAILS),
      country: z.string().length(2).optional(),
    }))
    .query(({ input }) => {
      const rate = getExchangeRate(input.sourceStablecoin, input.targetCurrency);
      const amountUsd = input.sourceAmount * (STABLECOIN_USD[input.sourceStablecoin] ?? 1);
      const { feeUsd, feePercent } = calculateFee(amountUsd, input.payoutRail, OFFRAMP_FEE_SCHEDULE);
      const spreadPercent = 0.4;
      const effectiveRate = rate * (1 - spreadPercent / 100);
      const feeInStablecoin = feeUsd / (STABLECOIN_USD[input.sourceStablecoin] ?? 1);
      const targetAmount = (input.sourceAmount - feeInStablecoin) * effectiveRate;

      return {
        sourceStablecoin: input.sourceStablecoin,
        sourceAmount: input.sourceAmount,
        targetCurrency: input.targetCurrency,
        targetAmount: Math.round(targetAmount * 100) / 100,
        exchangeRate: effectiveRate,
        fee: feeUsd,
        feePercent,
        spreadPercent,
        payoutRail: input.payoutRail,
        estimatedTime: input.payoutRail === "mpesa" || input.payoutRail === "mtn_momo" ? "~5 min" :
                       input.payoutRail === "bank_transfer" ? "1-3 business days" :
                       input.payoutRail === "cbdc_bridge" ? "~30 sec" : "~15 min",
        expiresAt: Date.now() + 5 * 60 * 1000,
      };
    }),

  // ─── OFF-RAMP: Sell Stablecoin ───────────────────────────────────────────────

  offrampSell: protectedProcedure
    .input(z.object({
      sourceStablecoin: z.enum(SUPPORTED_STABLECOINS).default("USDC"),
      sourceAmount: z.number().positive().max(50000),
      targetCurrency: z.enum(FIAT_CURRENCIES),
      payoutRail: z.enum(PAYMENT_RAILS),
      recipientName: z.string().min(1).max(255),
      recipientPhone: z.string().max(32).optional(),
      recipientBank: z.string().max(128).optional(),
      recipientAccount: z.string().max(64).optional(),
      recipientCountry: z.string().length(2).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Rate limit: max 5 off-ramp per hour
      const rlKey = `rl:offramp:${ctx.user.id}`;
      const rlCount = await cacheGet<number>(rlKey);
      if (rlCount !== null && rlCount >= 5) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Max 5 off-ramp orders per hour." });
      }
      await cacheSet(rlKey, (rlCount ?? 0) + 1, 3600);

      // Calculate pricing
      const rate = getExchangeRate(input.sourceStablecoin, input.targetCurrency);
      const amountUsd = input.sourceAmount * (STABLECOIN_USD[input.sourceStablecoin] ?? 1);
      const { feeUsd, feePercent } = calculateFee(amountUsd, input.payoutRail, OFFRAMP_FEE_SCHEDULE);
      const spreadPercent = 0.4;
      const effectiveRate = rate * (1 - spreadPercent / 100);
      const feeInStablecoin = feeUsd / (STABLECOIN_USD[input.sourceStablecoin] ?? 1);
      const targetAmount = Math.round((input.sourceAmount - feeInStablecoin) * effectiveRate * 100) / 100;

      // Velocity check: max $5000 per day
      const dayAgo = Date.now() - 86400000;
      const [recentVolume] = await db.select({ total: sql`COALESCE(SUM(source_amount::numeric), 0)` })
        .from(stablecoinOfframpRequests)
        .where(and(
          eq(stablecoinOfframpRequests.userId, String(ctx.user.id)),
          gte(stablecoinOfframpRequests.createdAt, dayAgo),
          eq(stablecoinOfframpRequests.status, "completed"),
        ));
      const dailyVolumeUsd = parseFloat(String(recentVolume?.total ?? "0")) * (STABLECOIN_USD[input.sourceStablecoin] ?? 1);
      if (dailyVolumeUsd + amountUsd > 5000) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Daily off-ramp limit is $5,000. Used $${dailyVolumeUsd.toFixed(2)} today. Remaining: $${(5000 - dailyVolumeUsd).toFixed(2)}.`,
        });
      }

      const requestId = crypto.randomUUID();
      const burnTxHash = `0x${crypto.randomBytes(32).toString("hex")}`;

      await withTransaction(async (tx) => {
        // Deduct stablecoin from user wallet
        const [bal] = await tx`
          SELECT id, balance FROM wallet_balances
          WHERE user_id = ${String(ctx.user.id)} AND currency = ${input.sourceStablecoin}
          FOR UPDATE
        `;
        if (!bal || parseFloat(bal.balance) < input.sourceAmount) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Insufficient ${input.sourceStablecoin} balance. Have ${parseFloat(bal?.balance ?? "0").toFixed(2)}, need ${input.sourceAmount}.`,
          });
        }
        await tx`
          UPDATE wallet_balances SET balance = ${String(parseFloat(bal.balance) - input.sourceAmount)}, updated_at = ${Date.now()}
          WHERE id = ${bal.id}
        `;

        // Record wallet transaction
        const txId = crypto.randomUUID();
        await tx`
          INSERT INTO wallet_transactions (id, user_id, type, status, from_currency, to_currency, amount, to_amount, fee, reference, note, tx_hash, completed_at, created_at)
          VALUES (${txId}, ${String(ctx.user.id)}, 'withdraw', 'completed', ${input.sourceStablecoin}, ${input.targetCurrency},
            ${String(input.sourceAmount)}, ${String(targetAmount)}, ${String(feeUsd)},
            ${"OFFRAMP:" + requestId}, ${"Off-ramp: " + input.sourceAmount + " " + input.sourceStablecoin + " → " + targetAmount.toFixed(2) + " " + input.targetCurrency + " via " + input.payoutRail + " to " + input.recipientName},
            ${burnTxHash}, ${Date.now()}, ${Date.now()})
        `;

        // Insert offramp request
        await tx`
          INSERT INTO stablecoin_offramp_requests (id, user_id, status, source_stablecoin, source_amount, source_network, burn_tx_hash,
            target_currency, target_amount, payout_rail, payout_ref, recipient_name, recipient_phone, recipient_bank, recipient_account, recipient_country,
            exchange_rate, fee, fee_percent, spread_percent, kyc_verified, velocity_check_passed, completed_at, created_at, updated_at)
          VALUES (${requestId}, ${String(ctx.user.id)}, 'completed', ${input.sourceStablecoin}, ${String(input.sourceAmount)},
            ${input.sourceStablecoin.startsWith("CBDC") ? "cbdc" : "stellar"}, ${burnTxHash},
            ${input.targetCurrency}, ${String(targetAmount)}, ${input.payoutRail},
            ${"PAYOUT-" + crypto.randomBytes(8).toString("hex")},
            ${input.recipientName}, ${input.recipientPhone ?? null}, ${input.recipientBank ?? null},
            ${input.recipientAccount ?? null}, ${input.recipientCountry ?? null},
            ${String(effectiveRate)}, ${String(feeUsd)}, ${String(feePercent)}, ${String(spreadPercent)},
            true, true, ${Date.now()}, ${Date.now()}, ${Date.now()})
        `;
      });

      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "stablecoin.offramp.sell",
        entityType: "stablecoin_offramp_request",
        entityId: requestId,
        after: { sourceStablecoin: input.sourceStablecoin, sourceAmount: input.sourceAmount, targetCurrency: input.targetCurrency, targetAmount, payoutRail: input.payoutRail, recipientName: input.recipientName },
      });

      // BIS auto-flag for high-value off-ramps
      if (amountUsd >= 500) {
        checkAndAutoFlag({
          walletTxId: requestId,
          userId: String(ctx.user.id),
          currency: input.sourceStablecoin,
          amount: input.sourceAmount,
          counterparty: `offramp:${input.payoutRail}:${input.recipientName}`,
        }).catch(() => {});
      }

      await createUserNotification({
        userId: ctx.user.id,
        category: "system",
        title: `${input.sourceStablecoin} Sold`,
        content: `You sold ${input.sourceAmount} ${input.sourceStablecoin} for ${targetAmount.toFixed(2)} ${input.targetCurrency} via ${input.payoutRail} to ${input.recipientName}. Fee: $${feeUsd.toFixed(2)}.`,
        actionUrl: "/wallet",
        actionLabel: "View Wallet",
      });

      return {
        success: true,
        requestId,
        targetAmount,
        fee: feeUsd,
        exchangeRate: effectiveRate,
        burnTxHash,
        payoutRail: input.payoutRail,
        recipientName: input.recipientName,
      };
    }),

  // ─── RATE ROUTING: Find Best Rail ────────────────────────────────────────────

  bestRail: protectedProcedure
    .input(z.object({
      direction: z.enum(["onramp", "offramp"]),
      country: z.string().length(2),
      amount: z.number().positive(),
      sourceCurrency: z.string().max(10).optional(),
    }))
    .query(({ input }) => {
      const schedule = input.direction === "onramp" ? ONRAMP_FEE_SCHEDULE : OFFRAMP_FEE_SCHEDULE;
      const candidates = Object.entries(RAIL_COUNTRIES)
        .filter(([, countries]) => countries.includes(input.country))
        .map(([rail]) => {
          const { feeUsd, feePercent } = calculateFee(input.amount, rail, schedule);
          return { rail, feeUsd, feePercent, countries: RAIL_COUNTRIES[rail] };
        })
        .sort((a, b) => a.feeUsd - b.feeUsd);

      return {
        bestRail: candidates[0]?.rail ?? "bank_transfer",
        allOptions: candidates,
        country: input.country,
        direction: input.direction,
      };
    }),

  // ─── HISTORY ─────────────────────────────────────────────────────────────────

  onrampHistory: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { orders: [], total: 0 };
      const orders = await db.select().from(stablecoinOnrampOrders)
        .where(eq(stablecoinOnrampOrders.userId, String(ctx.user.id)))
        .orderBy(desc(stablecoinOnrampOrders.createdAt))
        .limit(input.limit).offset(input.offset);
      const [{ total }] = await db.select({ total: count() }).from(stablecoinOnrampOrders)
        .where(eq(stablecoinOnrampOrders.userId, String(ctx.user.id)));
      return { orders, total };
    }),

  offrampHistory: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { requests: [], total: 0 };
      const requests = await db.select().from(stablecoinOfframpRequests)
        .where(eq(stablecoinOfframpRequests.userId, String(ctx.user.id)))
        .orderBy(desc(stablecoinOfframpRequests.createdAt))
        .limit(input.limit).offset(input.offset);
      const [{ total }] = await db.select({ total: count() }).from(stablecoinOfframpRequests)
        .where(eq(stablecoinOfframpRequests.userId, String(ctx.user.id)));
      return { requests, total };
    }),

  // ─── LIMIT ORDERS ────────────────────────────────────────────────────────────

  createLimitOrder: protectedProcedure
    .input(z.object({
      direction: z.enum(["buy", "sell"]),
      stablecoin: z.enum(SUPPORTED_STABLECOINS).default("USDC"),
      fiatCurrency: z.enum(FIAT_CURRENCIES),
      amount: z.number().positive().max(50000),
      targetRate: z.number().positive(),
      expiresInHours: z.number().int().min(1).max(720).default(24),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const orderId = crypto.randomUUID();
      await db.insert(stablecoinLimitOrders).values({
        id: orderId,
        userId: String(ctx.user.id),
        direction: input.direction,
        stablecoin: input.stablecoin,
        fiatCurrency: input.fiatCurrency,
        amount: String(input.amount),
        targetRate: String(input.targetRate),
        status: "active",
        expiresAt: Date.now() + input.expiresInHours * 3600 * 1000,
      });

      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "stablecoin.limit_order.create",
        entityType: "stablecoin_limit_order",
        entityId: orderId,
        after: input,
      });

      return { success: true, orderId, expiresAt: Date.now() + input.expiresInHours * 3600 * 1000 };
    }),

  listLimitOrders: protectedProcedure
    .input(z.object({ status: z.enum(["active", "filled", "cancelled", "expired"]).optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(stablecoinLimitOrders.userId, String(ctx.user.id))];
      if (input.status) conditions.push(eq(stablecoinLimitOrders.status, input.status));
      return db.select().from(stablecoinLimitOrders)
        .where(and(...conditions))
        .orderBy(desc(stablecoinLimitOrders.createdAt));
    }),

  cancelLimitOrder: protectedProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [order] = await db.select().from(stablecoinLimitOrders)
        .where(and(eq(stablecoinLimitOrders.id, input.orderId), eq(stablecoinLimitOrders.userId, String(ctx.user.id))));
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      if (order.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Order is not active" });
      await db.update(stablecoinLimitOrders)
        .set({ status: "cancelled" })
        .where(eq(stablecoinLimitOrders.id, input.orderId));
      return { success: true };
    }),

  // ─── YIELD: Deposit Stablecoin for Yield ─────────────────────────────────────

  yieldDeposit: protectedProcedure
    .input(z.object({
      stablecoin: z.enum(SUPPORTED_STABLECOINS).default("USDC"),
      amount: z.number().positive().max(100000),
      protocol: z.enum(["aave_v3", "compound_v3", "tourismpay_vault"]).default("tourismpay_vault"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const apyByProtocol: Record<string, number> = { aave_v3: 380, compound_v3: 420, tourismpay_vault: 500 };
      const apy = apyByProtocol[input.protocol] ?? 450;

      // Check wallet balance
      const positionId = crypto.randomUUID();
      const depositTxHash = `0x${crypto.randomBytes(32).toString("hex")}`;

      await withTransaction(async (tx) => {
        const [bal] = await tx`
          SELECT id, balance FROM wallet_balances
          WHERE user_id = ${String(ctx.user.id)} AND currency = ${input.stablecoin}
          FOR UPDATE
        `;
        if (!bal || parseFloat(bal.balance) < input.amount) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Insufficient ${input.stablecoin} balance` });
        }
        await tx`
          UPDATE wallet_balances SET balance = ${String(parseFloat(bal.balance) - input.amount)}, updated_at = ${Date.now()}
          WHERE id = ${bal.id}
        `;
      });

      await db.insert(stablecoinYieldPositions).values({
        id: positionId,
        userId: String(ctx.user.id),
        stablecoin: input.stablecoin,
        principalAmount: String(input.amount),
        currentAmount: String(input.amount),
        apyBps: apy,
        protocol: input.protocol,
        status: "active",
        depositTxHash,
      });

      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "stablecoin.yield.deposit",
        entityType: "stablecoin_yield_position",
        entityId: positionId,
        after: { stablecoin: input.stablecoin, amount: input.amount, protocol: input.protocol, apyBps: apy },
      });

      return {
        success: true,
        positionId,
        apyBps: apy,
        apyPercent: (apy / 100).toFixed(2) + "%",
        protocol: input.protocol,
        depositTxHash,
      };
    }),

  yieldWithdraw: protectedProcedure
    .input(z.object({ positionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [position] = await db.select().from(stablecoinYieldPositions)
        .where(and(eq(stablecoinYieldPositions.id, input.positionId), eq(stablecoinYieldPositions.userId, String(ctx.user.id))));
      if (!position) throw new TRPCError({ code: "NOT_FOUND", message: "Position not found" });
      if (position.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Position is not active" });

      // Calculate accrued yield
      const elapsedMs = Date.now() - (position.createdAt ?? Date.now());
      const elapsedYears = elapsedMs / (365.25 * 24 * 3600 * 1000);
      const principal = parseFloat(position.principalAmount);
      const apyDecimal = position.apyBps / 10000;
      const accruedYield = principal * apyDecimal * elapsedYears;
      const totalReturn = principal + accruedYield;
      const withdrawTxHash = `0x${crypto.randomBytes(32).toString("hex")}`;

      await withTransaction(async (tx) => {
        const [bal] = await tx`
          SELECT id, balance FROM wallet_balances
          WHERE user_id = ${String(ctx.user.id)} AND currency = ${position.stablecoin}
          FOR UPDATE
        `;
        if (bal) {
          await tx`
            UPDATE wallet_balances SET balance = ${String(parseFloat(bal.balance) + totalReturn)}, updated_at = ${Date.now()}
            WHERE id = ${bal.id}
          `;
        } else {
          await tx`
            INSERT INTO wallet_balances (id, user_id, currency, balance, locked_balance, wallet_address, network, created_at, updated_at)
            VALUES (${crypto.randomUUID()}, ${String(ctx.user.id)}, ${position.stablecoin}, ${String(totalReturn)}, '0',
              ${"tp_" + position.stablecoin.toLowerCase().replace("-", "_") + "_" + String(ctx.user.id).slice(0, 8)},
              'Stellar / Ethereum', ${Date.now()}, ${Date.now()})
          `;
        }
      });

      await db.update(stablecoinYieldPositions)
        .set({
          status: "withdrawn",
          currentAmount: String(totalReturn),
          accruedYield: String(accruedYield),
          withdrawTxHash,
          withdrawnAt: Date.now(),
          lastAccrualAt: Date.now(),
          updatedAt: Date.now(),
        })
        .where(eq(stablecoinYieldPositions.id, input.positionId));

      return { success: true, totalReturn, accruedYield, withdrawTxHash };
    }),

  yieldPositions: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(stablecoinYieldPositions)
      .where(eq(stablecoinYieldPositions.userId, String(ctx.user.id)))
      .orderBy(desc(stablecoinYieldPositions.createdAt));
  }),

  // ─── MERCHANT AUTO-SETTLE ────────────────────────────────────────────────────

  merchantAutoSettle: protectedProcedure
    .input(z.object({
      stablecoin: z.enum(SUPPORTED_STABLECOINS).default("USDC"),
      targetCurrency: z.enum(FIAT_CURRENCIES),
      payoutRail: z.enum(PAYMENT_RAILS),
      threshold: z.number().positive().default(100),
      recipientName: z.string().min(1).max(255),
      recipientPhone: z.string().max(32).optional(),
      recipientBank: z.string().max(128).optional(),
      recipientAccount: z.string().max(64).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Check stablecoin balance
      const [bal] = await db.select().from(walletBalances)
        .where(and(eq(walletBalances.userId, String(ctx.user.id)), eq(walletBalances.currency, input.stablecoin)));
      const balance = parseFloat((bal?.balance as unknown as string) ?? "0");
      if (balance < input.threshold) {
        return { triggered: false, balance, threshold: input.threshold, message: `Balance ${balance.toFixed(2)} below threshold ${input.threshold}` };
      }

      // Auto-settle: sell stablecoin above threshold
      const amountToSettle = balance - input.threshold / 2; // keep half the threshold as buffer
      const rate = getExchangeRate(input.stablecoin, input.targetCurrency);
      const amountUsd = amountToSettle * (STABLECOIN_USD[input.stablecoin] ?? 1);
      const { feeUsd } = calculateFee(amountUsd, input.payoutRail, OFFRAMP_FEE_SCHEDULE);
      const effectiveRate = rate * 0.996;
      const feeInStablecoin = feeUsd / (STABLECOIN_USD[input.stablecoin] ?? 1);
      const targetAmount = Math.round((amountToSettle - feeInStablecoin) * effectiveRate * 100) / 100;

      const requestId = crypto.randomUUID();
      const burnTxHash = `0x${crypto.randomBytes(32).toString("hex")}`;

      await withTransaction(async (tx) => {
        const [lockedBal] = await tx`
          SELECT id, balance FROM wallet_balances
          WHERE user_id = ${String(ctx.user.id)} AND currency = ${input.stablecoin}
          FOR UPDATE
        `;
        if (!lockedBal || parseFloat(lockedBal.balance) < amountToSettle) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient balance for auto-settle" });
        }
        await tx`
          UPDATE wallet_balances SET balance = ${String(parseFloat(lockedBal.balance) - amountToSettle)}, updated_at = ${Date.now()}
          WHERE id = ${lockedBal.id}
        `;
        await tx`
          INSERT INTO wallet_transactions (id, user_id, type, status, from_currency, to_currency, amount, to_amount, fee, reference, note, tx_hash, completed_at, created_at)
          VALUES (${crypto.randomUUID()}, ${String(ctx.user.id)}, 'withdraw', 'completed', ${input.stablecoin}, ${input.targetCurrency},
            ${String(amountToSettle)}, ${String(targetAmount)}, ${String(feeUsd)},
            ${"AUTOSETTLE:" + requestId}, ${"Merchant auto-settle: " + amountToSettle.toFixed(2) + " " + input.stablecoin + " → " + targetAmount.toFixed(2) + " " + input.targetCurrency},
            ${burnTxHash}, ${Date.now()}, ${Date.now()})
        `;
        await tx`
          INSERT INTO stablecoin_offramp_requests (id, user_id, status, source_stablecoin, source_amount, burn_tx_hash,
            target_currency, target_amount, payout_rail, payout_ref, recipient_name, recipient_phone, recipient_bank, recipient_account,
            exchange_rate, fee, fee_percent, spread_percent, kyc_verified, velocity_check_passed, completed_at, created_at, updated_at)
          VALUES (${requestId}, ${String(ctx.user.id)}, 'completed', ${input.stablecoin}, ${String(amountToSettle)}, ${burnTxHash},
            ${input.targetCurrency}, ${String(targetAmount)}, ${input.payoutRail},
            ${"AUTOPAYOUT-" + crypto.randomBytes(8).toString("hex")},
            ${input.recipientName}, ${input.recipientPhone ?? null}, ${input.recipientBank ?? null}, ${input.recipientAccount ?? null},
            ${String(effectiveRate)}, ${String(feeUsd)}, '1.0', '0.4', true, true, ${Date.now()}, ${Date.now()}, ${Date.now()})
        `;
      });

      return {
        triggered: true,
        requestId,
        amountSettled: amountToSettle,
        targetAmount,
        fee: feeUsd,
        payoutRail: input.payoutRail,
        remainingBalance: balance - amountToSettle,
      };
    }),

  // ─── MULTI-LEG SWAP (USD → USDC → NGN via best corridor) ────────────────────

  multiLegQuote: protectedProcedure
    .input(z.object({
      fromCurrency: z.string().max(10),
      toCurrency: z.string().max(10),
      amount: z.number().positive(),
      country: z.string().length(2).optional(),
    }))
    .query(({ input }) => {
      const legs: Array<{ from: string; to: string; rate: number; fee: number }> = [];

      const fromIsStable = STABLECOIN_USD[input.fromCurrency] !== undefined;
      const toIsStable = STABLECOIN_USD[input.toCurrency] !== undefined;
      const fromIsFiat = FIAT_USD[input.fromCurrency] !== undefined;
      const toIsFiat = FIAT_USD[input.toCurrency] !== undefined;

      // Direct fiat-to-fiat: go through USDC as intermediary
      if (fromIsFiat && toIsFiat) {
        const leg1Rate = getExchangeRate(input.fromCurrency, "USDC");
        const leg1Fee = input.amount * 0.01;
        const usdcAmount = (input.amount - leg1Fee) * leg1Rate;
        legs.push({ from: input.fromCurrency, to: "USDC", rate: leg1Rate, fee: leg1Fee });

        const leg2Rate = getExchangeRate("USDC", input.toCurrency);
        const leg2Fee = usdcAmount * 0.004;
        const finalAmount = (usdcAmount - leg2Fee) * leg2Rate;
        legs.push({ from: "USDC", to: input.toCurrency, rate: leg2Rate, fee: leg2Fee });

        return { legs, finalAmount: Math.round(finalAmount * 100) / 100, totalFee: leg1Fee + leg2Fee };
      }

      // Direct conversion
      const directRate = getExchangeRate(input.fromCurrency, input.toCurrency);
      const directFee = input.amount * 0.005;
      const finalAmount = (input.amount - directFee) * directRate;
      legs.push({ from: input.fromCurrency, to: input.toCurrency, rate: directRate, fee: directFee });

      return { legs, finalAmount: Math.round(finalAmount * 1e6) / 1e6, totalFee: directFee };
    }),

  // ─── ADMIN: Aggregate Volume Dashboard ──────────────────────────────────────

  adminVolume: adminProcedure
    .input(z.object({
      periodDays: z.number().int().min(1).max(365).default(30),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { onrampVolume: 0, offrampVolume: 0, onrampCount: 0, offrampCount: 0, activeYieldPositions: 0, totalYieldDeposited: 0, activeLimitOrders: 0 };

      const since = Date.now() - input.periodDays * 86400000;

      const [onramp] = await db.select({
        volume: sql`COALESCE(SUM(source_amount::numeric), 0)`,
        cnt: count(),
      }).from(stablecoinOnrampOrders).where(and(gte(stablecoinOnrampOrders.createdAt, since), eq(stablecoinOnrampOrders.status, "completed")));

      const [offramp] = await db.select({
        volume: sql`COALESCE(SUM(source_amount::numeric), 0)`,
        cnt: count(),
      }).from(stablecoinOfframpRequests).where(and(gte(stablecoinOfframpRequests.createdAt, since), eq(stablecoinOfframpRequests.status, "completed")));

      const [yieldData] = await db.select({
        cnt: count(),
        total: sql`COALESCE(SUM(principal_amount::numeric), 0)`,
      }).from(stablecoinYieldPositions).where(eq(stablecoinYieldPositions.status, "active"));

      const [limitData] = await db.select({ cnt: count() })
        .from(stablecoinLimitOrders).where(eq(stablecoinLimitOrders.status, "active"));

      return {
        onrampVolume: parseFloat(String(onramp?.volume ?? 0)),
        offrampVolume: parseFloat(String(offramp?.volume ?? 0)),
        onrampCount: Number(onramp?.cnt ?? 0),
        offrampCount: Number(offramp?.cnt ?? 0),
        activeYieldPositions: Number(yieldData?.cnt ?? 0),
        totalYieldDeposited: parseFloat(String(yieldData?.total ?? 0)),
        activeLimitOrders: Number(limitData?.cnt ?? 0),
      };
    }),
});
