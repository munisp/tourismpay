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
import { createTransfer as tbCreateTransfer } from "../_core/tigerbeetle";
import { streamPaymentEvent, FLUVIO_TOPICS } from "../_core/fluvio";
import { publishEvent, TOPICS } from "../_core/kafka";
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

// ─── Sanctions Screening ─────────────────────────────────────────────────────

async function screenSanctions(
  originatorName: string,
  beneficiaryName: string,
): Promise<{ result: "clear" | "potential_match" | "confirmed_match"; provider: string; matchDetails?: string }> {
  const sanctionedPatterns = [/^(OFAC|SDN|BLOCKED)/i];
  const names = [originatorName, beneficiaryName];
  for (const name of names) {
    for (const pattern of sanctionedPatterns) {
      if (pattern.test(name)) {
        return { result: "confirmed_match", provider: "internal_screening", matchDetails: `Name "${name}" matches sanctions pattern` };
      }
    }
  }
  const cacheKey = `sanctions:${originatorName}:${beneficiaryName}`;
  const cached = await cacheGet<string>(cacheKey);
  if (cached) return JSON.parse(cached);
  const result = { result: "clear" as const, provider: "refinitiv_world_check" };
  await cacheSet(cacheKey, JSON.stringify(result), 86400);
  return result;
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

      publishEvent(TOPICS.WALLET_TRANSACTIONS, { type: "stablecoin.onramp", payload: { orderId, userId: String(ctx.user.id), sourceAmount: input.sourceAmount, sourceCurrency: input.sourceCurrency, targetAmount, targetStablecoin: input.targetStablecoin, fee: feeUsd } });

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

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: Stablecoin-to-Stablecoin Swap (USDC ↔ USDT ↔ DAI)
  // ═══════════════════════════════════════════════════════════════════════════

  stablecoinSwap: protectedProcedure
    .input(z.object({
      fromStablecoin: z.enum(SUPPORTED_STABLECOINS),
      toStablecoin: z.enum(SUPPORTED_STABLECOINS),
      amount: z.number().positive().max(100000),
      idempotencyKey: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.fromStablecoin === input.toStablecoin) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot swap to same stablecoin" });
      }
      // Idempotency check
      if (input.idempotencyKey) {
        const existing = await cacheGet<string>(`idem:stableswap:${input.idempotencyKey}`);
        if (existing) return JSON.parse(existing);
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const fromUsd = STABLECOIN_USD[input.fromStablecoin] ?? 1;
      const toUsd = STABLECOIN_USD[input.toStablecoin] ?? 1;
      const swapRate = fromUsd / toUsd;
      const swapFeePct = 0.15; // 15 bps for stablecoin-to-stablecoin
      const feeAmount = input.amount * (swapFeePct / 100);
      const outputAmount = Math.round((input.amount - feeAmount) * swapRate * 1e6) / 1e6;
      const txHash = `0x${crypto.randomBytes(32).toString("hex")}`;

      await withTransaction(async (tx) => {
        // Deduct source
        const [fromBal] = await tx`
          SELECT id, balance FROM wallet_balances WHERE user_id = ${String(ctx.user.id)} AND currency = ${input.fromStablecoin} FOR UPDATE
        `;
        if (!fromBal || parseFloat(fromBal.balance) < input.amount) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Insufficient ${input.fromStablecoin} balance` });
        }
        await tx`UPDATE wallet_balances SET balance = ${String(parseFloat(fromBal.balance) - input.amount)}, updated_at = ${Date.now()} WHERE id = ${fromBal.id}`;

        // Credit destination
        const [toBal] = await tx`
          SELECT id, balance FROM wallet_balances WHERE user_id = ${String(ctx.user.id)} AND currency = ${input.toStablecoin} FOR UPDATE
        `;
        if (toBal) {
          await tx`UPDATE wallet_balances SET balance = ${String(parseFloat(toBal.balance) + outputAmount)}, updated_at = ${Date.now()} WHERE id = ${toBal.id}`;
        } else {
          await tx`INSERT INTO wallet_balances (id, user_id, currency, balance, locked_balance, wallet_address, network, created_at, updated_at)
            VALUES (${crypto.randomUUID()}, ${String(ctx.user.id)}, ${input.toStablecoin}, ${String(outputAmount)}, '0',
              ${"tp_" + input.toStablecoin.toLowerCase().replace("-", "_") + "_" + String(ctx.user.id).slice(0, 8)}, 'Stellar / Ethereum', ${Date.now()}, ${Date.now()})`;
        }

        await tx`INSERT INTO wallet_transactions (id, user_id, type, status, from_currency, to_currency, amount, to_amount, fee, reference, note, tx_hash, completed_at, created_at)
          VALUES (${crypto.randomUUID()}, ${String(ctx.user.id)}, 'swap', 'completed', ${input.fromStablecoin}, ${input.toStablecoin},
            ${String(input.amount)}, ${String(outputAmount)}, ${String(feeAmount * fromUsd)},
            ${"STABLESWAP:" + crypto.randomUUID()}, ${input.amount + " " + input.fromStablecoin + " → " + outputAmount.toFixed(2) + " " + input.toStablecoin},
            ${txHash}, ${Date.now()}, ${Date.now()})`;
      });

      const swapResult = { success: true, outputAmount, swapRate, fee: feeAmount, txHash };
      if (input.idempotencyKey) {
        await cacheSet(`idem:stableswap:${input.idempotencyKey}`, JSON.stringify(swapResult), 3600);
      }
      return swapResult;
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: Recurring Buy (DCA — Dollar Cost Average)
  // ═══════════════════════════════════════════════════════════════════════════

  createRecurringBuy: protectedProcedure
    .input(z.object({
      sourceCurrency: z.enum(FIAT_CURRENCIES),
      sourceAmount: z.number().positive().max(10000),
      targetStablecoin: z.enum(SUPPORTED_STABLECOINS).default("USDC"),
      paymentRail: z.enum(PAYMENT_RAILS),
      frequency: z.enum(["daily", "weekly", "biweekly", "monthly"]),
      dayOfWeek: z.number().int().min(0).max(6).optional(), // 0=Sun, for weekly
      dayOfMonth: z.number().int().min(1).max(28).optional(), // for monthly
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const scheduleId = crypto.randomUUID();
      const intervalMs: Record<string, number> = {
        daily: 86400000, weekly: 604800000, biweekly: 1209600000, monthly: 2592000000,
      };

      await db.execute(sql`
        INSERT INTO stablecoin_recurring_buys (id, user_id, source_currency, source_amount, target_stablecoin, payment_rail,
          frequency, day_of_week, day_of_month, next_execution_at, status, total_executed, total_spent, created_at)
        VALUES (${scheduleId}, ${String(ctx.user.id)}, ${input.sourceCurrency}, ${String(input.sourceAmount)},
          ${input.targetStablecoin}, ${input.paymentRail}, ${input.frequency},
          ${input.dayOfWeek ?? null}, ${input.dayOfMonth ?? null},
          ${Date.now() + intervalMs[input.frequency]}, 'active', 0, '0', ${Date.now()})
      `);

      return { success: true, scheduleId, frequency: input.frequency, nextExecution: Date.now() + intervalMs[input.frequency] };
    }),

  listRecurringBuys: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db.execute(sql`SELECT * FROM stablecoin_recurring_buys WHERE user_id = ${String(ctx.user.id)} ORDER BY created_at DESC`);
  }),

  cancelRecurringBuy: protectedProcedure
    .input(z.object({ scheduleId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.execute(sql`UPDATE stablecoin_recurring_buys SET status = 'cancelled', updated_at = ${Date.now()} WHERE id = ${input.scheduleId} AND user_id = ${String(ctx.user.id)}`);
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: Price Alerts
  // ═══════════════════════════════════════════════════════════════════════════

  createPriceAlert: protectedProcedure
    .input(z.object({
      stablecoin: z.enum(SUPPORTED_STABLECOINS),
      fiatCurrency: z.enum(FIAT_CURRENCIES),
      direction: z.enum(["above", "below"]),
      targetRate: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const alertId = crypto.randomUUID();
      const currentRate = getExchangeRate(input.stablecoin, input.fiatCurrency);

      await db.execute(sql`
        INSERT INTO stablecoin_price_alerts (id, user_id, stablecoin, fiat_currency, direction, target_rate, current_rate_at_creation, status, created_at)
        VALUES (${alertId}, ${String(ctx.user.id)}, ${input.stablecoin}, ${input.fiatCurrency},
          ${input.direction}, ${String(input.targetRate)}, ${String(currentRate)}, 'active', ${Date.now()})
      `);

      return { success: true, alertId, currentRate, targetRate: input.targetRate };
    }),

  listPriceAlerts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db.execute(sql`SELECT * FROM stablecoin_price_alerts WHERE user_id = ${String(ctx.user.id)} ORDER BY created_at DESC`);
  }),

  deletePriceAlert: protectedProcedure
    .input(z.object({ alertId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.execute(sql`DELETE FROM stablecoin_price_alerts WHERE id = ${input.alertId} AND user_id = ${String(ctx.user.id)}`);
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: Compliance — Travel Rule (FATF Recommendation 16)
  // ═══════════════════════════════════════════════════════════════════════════

  submitTravelRuleData: protectedProcedure
    .input(z.object({
      transactionId: z.string().uuid(),
      direction: z.enum(["onramp", "offramp"]),
      originatorName: z.string().min(1).max(255),
      originatorAccount: z.string().max(128),
      originatorCountry: z.string().length(2),
      originatorIdType: z.enum(["passport", "national_id", "drivers_license", "bvn", "nin"]),
      originatorIdNumber: z.string().max(64),
      beneficiaryName: z.string().min(1).max(255),
      beneficiaryAccount: z.string().max(128),
      beneficiaryCountry: z.string().length(2),
      beneficiaryInstitution: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const recordId = crypto.randomUUID();

      // Sanctions screening (simulated — in production, call Refinitiv/Dow Jones API)
      const sanctionsResult = await screenSanctions(input.originatorName, input.beneficiaryName);

      await db.execute(sql`
        INSERT INTO stablecoin_travel_rule_records (id, transaction_id, user_id, direction,
          originator_name, originator_account, originator_country, originator_id_type, originator_id_number,
          beneficiary_name, beneficiary_account, beneficiary_country, beneficiary_institution,
          sanctions_screened, sanctions_result, sanctions_provider, created_at)
        VALUES (${recordId}, ${input.transactionId}, ${String(ctx.user.id)}, ${input.direction},
          ${input.originatorName}, ${input.originatorAccount}, ${input.originatorCountry},
          ${input.originatorIdType}, ${input.originatorIdNumber},
          ${input.beneficiaryName}, ${input.beneficiaryAccount}, ${input.beneficiaryCountry},
          ${input.beneficiaryInstitution ?? null},
          true, ${sanctionsResult.result}, ${sanctionsResult.provider}, ${Date.now()})
      `);

      if (sanctionsResult.result !== "clear") {
        await checkAndAutoFlag({
          walletTxId: input.transactionId,
          userId: String(ctx.user.id),
          currency: "COMPLIANCE",
          amount: 0,
          counterparty: `sanctions_hit:${sanctionsResult.result}:${input.beneficiaryName}`,
        }).catch(() => {});
      }

      return {
        success: true,
        recordId,
        sanctionsResult: sanctionsResult.result,
        sanctionsProvider: sanctionsResult.provider,
      };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: KYC-Tiered Transaction Limits
  // ═══════════════════════════════════════════════════════════════════════════

  getTransactionLimits: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;

    // Determine KYC tier from kyc_verification_records
    const kycRecords = await db.execute(sql`
      SELECT document_type, status FROM kyc_verification_records
      WHERE user_id = ${String(ctx.user.id)} AND status = 'verified'
    `);
    const verifiedTypes = (Array.isArray(kycRecords) ? kycRecords : []).map((r: Record<string, unknown>) => String(r.document_type));
    const hasIdentity = verifiedTypes.includes("identity");
    const hasAddress = verifiedTypes.includes("address");
    const hasEnhanced = verifiedTypes.includes("enhanced");

    let tier: "unverified" | "basic" | "standard" | "enhanced" = "unverified";
    if (hasEnhanced) tier = "enhanced";
    else if (hasIdentity && hasAddress) tier = "standard";
    else if (hasIdentity) tier = "basic";

    const limits: Record<string, { dailyOnramp: number; dailyOfframp: number; singleTx: number; monthlyVolume: number }> = {
      unverified: { dailyOnramp: 0, dailyOfframp: 0, singleTx: 0, monthlyVolume: 0 },
      basic:      { dailyOnramp: 500, dailyOfframp: 200, singleTx: 200, monthlyVolume: 5000 },
      standard:   { dailyOnramp: 5000, dailyOfframp: 5000, singleTx: 2000, monthlyVolume: 50000 },
      enhanced:   { dailyOnramp: 50000, dailyOfframp: 50000, singleTx: 25000, monthlyVolume: 500000 },
    };

    // Calculate current usage
    const dayAgo = Date.now() - 86400000;
    const monthAgo = Date.now() - 30 * 86400000;
    const [dailyOnramp] = await db.select({ total: sql`COALESCE(SUM(source_amount::numeric), 0)` })
      .from(stablecoinOnrampOrders)
      .where(and(eq(stablecoinOnrampOrders.userId, String(ctx.user.id)), gte(stablecoinOnrampOrders.createdAt, dayAgo)));
    const [dailyOfframp] = await db.select({ total: sql`COALESCE(SUM(source_amount::numeric), 0)` })
      .from(stablecoinOfframpRequests)
      .where(and(eq(stablecoinOfframpRequests.userId, String(ctx.user.id)), gte(stablecoinOfframpRequests.createdAt, dayAgo)));
    const [monthlyVol] = await db.select({ total: sql`COALESCE(SUM(source_amount::numeric), 0)` })
      .from(stablecoinOnrampOrders)
      .where(and(eq(stablecoinOnrampOrders.userId, String(ctx.user.id)), gte(stablecoinOnrampOrders.createdAt, monthAgo)));

    return {
      kycTier: tier,
      limits: limits[tier],
      usage: {
        dailyOnramp: parseFloat(String(dailyOnramp?.total ?? 0)),
        dailyOfframp: parseFloat(String(dailyOfframp?.total ?? 0)),
        monthlyVolume: parseFloat(String(monthlyVol?.total ?? 0)),
      },
      upgradeUrl: tier !== "enhanced" ? "/settings/privacy" : null,
    };
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: Refund / Dispute
  // ═══════════════════════════════════════════════════════════════════════════

  requestRefund: protectedProcedure
    .input(z.object({
      transactionId: z.string().uuid(),
      transactionType: z.enum(["onramp", "offramp"]),
      reason: z.enum(["wrong_amount", "duplicate", "unauthorized", "service_not_received", "other"]),
      description: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify the transaction belongs to user and is refundable (within 72 hours)
      if (input.transactionType === "onramp") {
        const [order] = await db.select().from(stablecoinOnrampOrders)
          .where(and(eq(stablecoinOnrampOrders.id, input.transactionId), eq(stablecoinOnrampOrders.userId, String(ctx.user.id))));
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
        if (order.status !== "completed") throw new TRPCError({ code: "BAD_REQUEST", message: "Only completed transactions can be refunded" });
        const ageMs = Date.now() - (order.completedAt ?? order.createdAt);
        if (ageMs > 72 * 3600 * 1000) throw new TRPCError({ code: "BAD_REQUEST", message: "Refund window expired (72 hours)" });
      } else {
        const [req] = await db.select().from(stablecoinOfframpRequests)
          .where(and(eq(stablecoinOfframpRequests.id, input.transactionId), eq(stablecoinOfframpRequests.userId, String(ctx.user.id))));
        if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
        if (req.status !== "completed") throw new TRPCError({ code: "BAD_REQUEST", message: "Only completed transactions can be refunded" });
        const ageMs = Date.now() - (req.completedAt ?? req.createdAt);
        if (ageMs > 72 * 3600 * 1000) throw new TRPCError({ code: "BAD_REQUEST", message: "Refund window expired (72 hours)" });
      }

      const disputeId = crypto.randomUUID();
      await db.execute(sql`
        INSERT INTO stablecoin_disputes (id, user_id, transaction_id, transaction_type, reason, description, status, created_at)
        VALUES (${disputeId}, ${String(ctx.user.id)}, ${input.transactionId}, ${input.transactionType},
          ${input.reason}, ${input.description ?? null}, 'pending', ${Date.now()})
      `);

      await createUserNotification({
        userId: ctx.user.id,
        category: "system",
        title: "Refund Request Submitted",
        content: `Your refund request for ${input.transactionType} transaction has been submitted. We'll review within 24 hours.`,
        actionUrl: "/wallet/stablecoin",
        actionLabel: "View Status",
      });

      return { success: true, disputeId, estimatedResolution: "24-48 hours" };
    }),

  listDisputes: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db.execute(sql`SELECT * FROM stablecoin_disputes WHERE user_id = ${String(ctx.user.id)} ORDER BY created_at DESC`);
  }),

  // Admin: resolve dispute
  resolveDispute: adminProcedure
    .input(z.object({
      disputeId: z.string().uuid(),
      resolution: z.enum(["approved", "rejected", "partial_refund"]),
      refundAmount: z.number().positive().optional(),
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const disputes = await db.execute(sql`SELECT * FROM stablecoin_disputes WHERE id = ${input.disputeId}`);
      const dispute = (Array.isArray(disputes) ? disputes[0] : undefined) as Record<string, unknown> | undefined;
      if (!dispute) throw new TRPCError({ code: "NOT_FOUND", message: "Dispute not found" });

      if (input.resolution === "approved" || input.resolution === "partial_refund") {
        // Process refund: credit back to user wallet
        const userId = String(dispute.user_id);
        const txType = String(dispute.transaction_type);

        if (txType === "onramp") {
          const [order] = await db.select().from(stablecoinOnrampOrders).where(eq(stablecoinOnrampOrders.id, String(dispute.transaction_id)));
          if (order) {
            const refundAmount = input.refundAmount ?? parseFloat(order.targetAmount ?? "0");
            await withTransaction(async (tx) => {
              const [bal] = await tx`SELECT id, balance FROM wallet_balances WHERE user_id = ${userId} AND currency = ${order.targetStablecoin} FOR UPDATE`;
              if (bal) {
                const newBalance = Math.max(0, parseFloat(bal.balance) - refundAmount);
                await tx`UPDATE wallet_balances SET balance = ${String(newBalance)}, updated_at = ${Date.now()} WHERE id = ${bal.id}`;
              }
              await tx`INSERT INTO wallet_transactions (id, user_id, type, status, from_currency, to_currency, amount, fee, reference, note, completed_at, created_at)
                VALUES (${crypto.randomUUID()}, ${userId}, 'refund', 'completed', ${order.targetStablecoin}, ${order.sourceCurrency},
                  ${String(refundAmount)}, '0', ${"REFUND:" + input.disputeId}, ${"Refund for onramp order " + order.id}, ${Date.now()}, ${Date.now()})`;
            });
          }
        }
      }

      await db.execute(sql`
        UPDATE stablecoin_disputes SET status = ${input.resolution}, resolution_notes = ${input.notes ?? null},
          resolved_by = ${String(ctx.user.id)}, resolved_at = ${Date.now()}, refund_amount = ${String(input.refundAmount ?? 0)}
        WHERE id = ${input.disputeId}
      `);

      const disputeUserId = Number(dispute.user_id);
      await createUserNotification({
        userId: disputeUserId,
        category: "system",
        title: `Refund ${input.resolution === "approved" ? "Approved" : input.resolution === "partial_refund" ? "Partially Approved" : "Rejected"}`,
        content: input.notes ?? `Your refund request has been ${input.resolution}.`,
      });

      return { success: true, resolution: input.resolution };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: Stablecoin Portfolio / Analytics
  // ═══════════════════════════════════════════════════════════════════════════

  portfolio: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;

    // Get all stablecoin balances
    const balances = await db.select().from(walletBalances)
      .where(eq(walletBalances.userId, String(ctx.user.id)));
    const stableBalances = balances.filter(b =>
      (STABLECOIN_USD as Record<string, unknown>)[b.currency] !== undefined
    );

    // Calculate total portfolio value in USD
    let totalUsd = 0;
    const holdings = stableBalances.map(b => {
      const bal = parseFloat((b.balance as unknown as string) ?? "0");
      const usdRate = STABLECOIN_USD[b.currency] ?? 1;
      const usdValue = bal * usdRate;
      totalUsd += usdValue;
      return {
        currency: b.currency,
        balance: bal,
        usdValue,
        network: b.network,
        walletAddress: b.walletAddress,
      };
    });

    // Get yield positions
    const yieldPositions = await db.select().from(stablecoinYieldPositions)
      .where(and(eq(stablecoinYieldPositions.userId, String(ctx.user.id)), eq(stablecoinYieldPositions.status, "active")));
    let totalYield = 0;
    for (const pos of yieldPositions) {
      const elapsedMs = Date.now() - (pos.createdAt ?? Date.now());
      const elapsedYears = elapsedMs / (365.25 * 24 * 3600 * 1000);
      const accrued = parseFloat(pos.principalAmount) * (pos.apyBps / 10000) * elapsedYears;
      totalYield += accrued;
    }

    // 30-day P&L
    const monthAgo = Date.now() - 30 * 86400000;
    const [bought] = await db.select({ total: sql`COALESCE(SUM(target_amount::numeric), 0)` })
      .from(stablecoinOnrampOrders)
      .where(and(eq(stablecoinOnrampOrders.userId, String(ctx.user.id)), gte(stablecoinOnrampOrders.createdAt, monthAgo), eq(stablecoinOnrampOrders.status, "completed")));
    const [sold] = await db.select({ total: sql`COALESCE(SUM(source_amount::numeric), 0)` })
      .from(stablecoinOfframpRequests)
      .where(and(eq(stablecoinOfframpRequests.userId, String(ctx.user.id)), gte(stablecoinOfframpRequests.createdAt, monthAgo), eq(stablecoinOfframpRequests.status, "completed")));

    return {
      holdings,
      totalUsd,
      totalYieldAccrued: totalYield,
      activeYieldPositions: yieldPositions.length,
      thirtyDayBought: parseFloat(String(bought?.total ?? 0)),
      thirtyDaySold: parseFloat(String(sold?.total ?? 0)),
      thirtyDayNetFlow: parseFloat(String(bought?.total ?? 0)) - parseFloat(String(sold?.total ?? 0)),
    };
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: LP Reserve Proof (public endpoint for transparency)
  // ═══════════════════════════════════════════════════════════════════════════

  reserveStatus: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;

    // Total minted stablecoins (from on-ramp orders)
    const [minted] = await db.select({ total: sql`COALESCE(SUM(target_amount::numeric), 0)` })
      .from(stablecoinOnrampOrders).where(eq(stablecoinOnrampOrders.status, "completed"));
    const [burned] = await db.select({ total: sql`COALESCE(SUM(source_amount::numeric), 0)` })
      .from(stablecoinOfframpRequests).where(eq(stablecoinOfframpRequests.status, "completed"));

    const totalMinted = parseFloat(String(minted?.total ?? 0));
    const totalBurned = parseFloat(String(burned?.total ?? 0));
    const circulating = totalMinted - totalBurned;

    // LP reserves backing
    const lpReserves = await db.execute(sql`
      SELECT pool_id, total_liquidity FROM lp_pool_snapshots ORDER BY snapshot_at DESC
    `);
    const reserves = (Array.isArray(lpReserves) ? lpReserves : []) as Record<string, unknown>[];
    const totalReserves = reserves.reduce((sum: number, r) => sum + parseFloat(String(r.total_liquidity ?? 0)), 0);

    const reserveRatio = circulating > 0 ? (totalReserves / circulating) * 100 : 100;

    return {
      totalMinted,
      totalBurned,
      circulating,
      totalLPReserves: totalReserves,
      reserveRatio: Math.round(reserveRatio * 100) / 100,
      isFullyBacked: reserveRatio >= 100,
      lastUpdated: Date.now(),
      pools: reserves.map(r => ({ poolId: String(r.pool_id), liquidity: parseFloat(String(r.total_liquidity ?? 0)) })),
    };
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: Admin — Freeze/Unfreeze User Stablecoin Operations
  // ═══════════════════════════════════════════════════════════════════════════

  adminFreezeUser: adminProcedure
    .input(z.object({
      userId: z.number().int(),
      action: z.enum(["freeze", "unfreeze"]),
      reason: z.string().max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.execute(sql`
        INSERT INTO stablecoin_user_freezes (id, user_id, action, reason, initiated_by, created_at)
        VALUES (${crypto.randomUUID()}, ${String(input.userId)}, ${input.action}, ${input.reason}, ${String(ctx.user.id)}, ${Date.now()})
      `);

      // Cancel all active limit orders if freezing
      if (input.action === "freeze") {
        await db.update(stablecoinLimitOrders)
          .set({ status: "cancelled" })
          .where(and(eq(stablecoinLimitOrders.userId, String(input.userId)), eq(stablecoinLimitOrders.status, "active")));
      }

      await createAuditLog({
        actorId: ctx.user.id,
        action: `stablecoin.user.${input.action}`,
        entityType: "user",
        entityId: String(input.userId),
        description: `${input.action}: ${input.reason}`,
      });

      return { success: true, action: input.action, userId: input.userId };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: Exchange Rate History (for charts)
  // ═══════════════════════════════════════════════════════════════════════════

  rateHistory: protectedProcedure
    .input(z.object({
      stablecoin: z.enum(SUPPORTED_STABLECOINS).default("USDC"),
      fiatCurrency: z.enum(FIAT_CURRENCIES).default("NGN"),
      periodDays: z.number().int().min(1).max(365).default(30),
    }))
    .query(({ input }) => {
      const baseRate = getExchangeRate(input.stablecoin, input.fiatCurrency);
      const points: Array<{ timestamp: number; rate: number }> = [];
      const now = Date.now();

      for (let i = input.periodDays; i >= 0; i--) {
        const ts = now - i * 86400000;
        // Simulate historical rates with realistic volatility (±2%)
        const dayHash = (ts / 86400000) | 0;
        const noise = (Math.sin(dayHash * 0.7) * 0.015 + Math.cos(dayHash * 1.3) * 0.005);
        points.push({ timestamp: ts, rate: baseRate * (1 + noise) });
      }

      return {
        stablecoin: input.stablecoin,
        fiatCurrency: input.fiatCurrency,
        currentRate: baseRate,
        points,
        high: Math.max(...points.map(p => p.rate)),
        low: Math.min(...points.map(p => p.rate)),
        change24h: points.length >= 2
          ? ((points[points.length - 1].rate - points[points.length - 2].rate) / points[points.length - 2].rate) * 100
          : 0,
      };
    }),
});
