/**
 * Payment Gateway Integration — Paystack + Flutterwave
 *
 * Provides a unified interface for:
 * - Initializing payments (card, bank transfer, mobile money)
 * - Verifying payment status
 * - Processing refunds
 * - Webhook signature validation
 *
 * Configuration (env vars):
 *   PAYMENT_PROVIDER       "paystack" | "flutterwave" (default: "paystack")
 *   PAYSTACK_SECRET_KEY    sk_test_xxx or sk_live_xxx
 *   PAYSTACK_PUBLIC_KEY    pk_test_xxx or pk_live_xxx
 *   FLUTTERWAVE_SECRET_KEY FLWSECK_TEST-xxx or FLWSECK-xxx
 *   FLUTTERWAVE_PUBLIC_KEY FLWPUBK_TEST-xxx or FLWPUBK-xxx
 *   PAYMENT_WEBHOOK_SECRET Webhook signing secret for signature verification
 */

import crypto from "crypto";
import { logger } from "./logger";

const PROVIDER = process.env.PAYMENT_PROVIDER ?? "paystack";

// ── Paystack Configuration ─────────────────────────────────────────────────
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? "";
const PAYSTACK_BASE = "https://api.paystack.co";

// ── Flutterwave Configuration ──────────────────────────────────────────────
const FLUTTERWAVE_SECRET = process.env.FLUTTERWAVE_SECRET_KEY ?? "";
const FLUTTERWAVE_BASE = "https://api.flutterwave.com/v3";

export type PaymentProvider = "paystack" | "flutterwave";

export interface InitPaymentInput {
  amountKobo: number; // Amount in smallest currency unit (kobo for NGN, cents for USD)
  currency: string;
  email: string;
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
  channels?: ("card" | "bank" | "ussd" | "mobile_money" | "bank_transfer")[];
}

export interface PaymentResult {
  success: boolean;
  provider: PaymentProvider;
  reference: string;
  authorizationUrl?: string;
  accessCode?: string;
  transactionId?: string;
  status: "pending" | "success" | "failed";
  error?: string;
}

export interface VerifyResult {
  success: boolean;
  provider: PaymentProvider;
  reference: string;
  status: "success" | "failed" | "abandoned" | "pending";
  amount: number;
  currency: string;
  paidAt?: string;
  channel?: string;
  gatewayResponse?: string;
  customerEmail?: string;
}

export interface RefundResult {
  success: boolean;
  provider: PaymentProvider;
  reference: string;
  refundReference?: string;
  status: string;
  error?: string;
}

/** Check if payment gateway is configured */
export function isPaymentGatewayConfigured(): boolean {
  if (PROVIDER === "paystack") return !!PAYSTACK_SECRET;
  if (PROVIDER === "flutterwave") return !!FLUTTERWAVE_SECRET;
  return false;
}

/** Get configured provider name */
export function getConfiguredProvider(): PaymentProvider {
  return PROVIDER as PaymentProvider;
}

// ── Paystack Implementation ────────────────────────────────────────────────

async function paystackInit(input: InitPaymentInput): Promise<PaymentResult> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amountKobo,
      email: input.email,
      reference: input.reference,
      currency: input.currency,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
      channels: input.channels,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const body = await res.json() as { status: boolean; data?: { authorization_url: string; access_code: string; reference: string }; message?: string };

  if (!body.status || !body.data) {
    return {
      success: false,
      provider: "paystack",
      reference: input.reference,
      status: "failed",
      error: body.message ?? "Paystack initialization failed",
    };
  }

  return {
    success: true,
    provider: "paystack",
    reference: body.data.reference,
    authorizationUrl: body.data.authorization_url,
    accessCode: body.data.access_code,
    status: "pending",
  };
}

async function paystackVerify(reference: string): Promise<VerifyResult> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    signal: AbortSignal.timeout(15000),
  });

  const body = await res.json() as {
    status: boolean;
    data?: {
      status: string; amount: number; currency: string;
      paid_at: string; channel: string; gateway_response: string;
      customer: { email: string };
    };
  };

  if (!body.status || !body.data) {
    return {
      success: false, provider: "paystack", reference,
      status: "failed", amount: 0, currency: "NGN",
    };
  }

  return {
    success: true,
    provider: "paystack",
    reference,
    status: body.data.status === "success" ? "success" : body.data.status === "abandoned" ? "abandoned" : "failed",
    amount: body.data.amount,
    currency: body.data.currency,
    paidAt: body.data.paid_at,
    channel: body.data.channel,
    gatewayResponse: body.data.gateway_response,
    customerEmail: body.data.customer?.email,
  };
}

async function paystackRefund(reference: string, amountKobo?: number): Promise<RefundResult> {
  const res = await fetch(`${PAYSTACK_BASE}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transaction: reference,
      ...(amountKobo ? { amount: amountKobo } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  });

  const body = await res.json() as { status: boolean; data?: { id: number }; message?: string };

  return {
    success: body.status,
    provider: "paystack",
    reference,
    refundReference: body.data?.id?.toString(),
    status: body.status ? "processed" : "failed",
    error: body.status ? undefined : body.message,
  };
}

// ── Flutterwave Implementation ─────────────────────────────────────────────

async function flutterwaveInit(input: InitPaymentInput): Promise<PaymentResult> {
  const res = await fetch(`${FLUTTERWAVE_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FLUTTERWAVE_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tx_ref: input.reference,
      amount: input.amountKobo / 100, // Flutterwave uses major units
      currency: input.currency,
      redirect_url: input.callbackUrl,
      customer: { email: input.email },
      meta: input.metadata,
      payment_options: input.channels?.join(","),
    }),
    signal: AbortSignal.timeout(15000),
  });

  const body = await res.json() as { status: string; data?: { link: string }; message?: string };

  if (body.status !== "success" || !body.data) {
    return {
      success: false,
      provider: "flutterwave",
      reference: input.reference,
      status: "failed",
      error: body.message ?? "Flutterwave initialization failed",
    };
  }

  return {
    success: true,
    provider: "flutterwave",
    reference: input.reference,
    authorizationUrl: body.data.link,
    status: "pending",
  };
}

async function flutterwaveVerify(reference: string): Promise<VerifyResult> {
  // First find the transaction ID
  const searchRes = await fetch(
    `${FLUTTERWAVE_BASE}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${FLUTTERWAVE_SECRET}` },
      signal: AbortSignal.timeout(15000),
    },
  );

  const body = await searchRes.json() as {
    status: string;
    data?: {
      status: string; amount: number; currency: string;
      created_at: string; payment_type: string;
      customer: { email: string };
    };
  };

  if (body.status !== "success" || !body.data) {
    return {
      success: false, provider: "flutterwave", reference,
      status: "failed", amount: 0, currency: "NGN",
    };
  }

  return {
    success: true,
    provider: "flutterwave",
    reference,
    status: body.data.status === "successful" ? "success" : "failed",
    amount: Math.round(body.data.amount * 100), // Convert to kobo
    currency: body.data.currency,
    paidAt: body.data.created_at,
    channel: body.data.payment_type,
    customerEmail: body.data.customer?.email,
  };
}

async function flutterwaveRefund(reference: string, amountKobo?: number): Promise<RefundResult> {
  // Need transaction ID first
  const verifyResult = await flutterwaveVerify(reference);
  if (!verifyResult.success) {
    return { success: false, provider: "flutterwave", reference, status: "failed", error: "Transaction not found" };
  }

  // Flutterwave refund requires transaction ID
  const res = await fetch(`${FLUTTERWAVE_BASE}/transactions/${reference}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FLUTTERWAVE_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amountKobo ? amountKobo / 100 : undefined,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const body = await res.json() as { status: string; data?: { id: number }; message?: string };

  return {
    success: body.status === "success",
    provider: "flutterwave",
    reference,
    refundReference: body.data?.id?.toString(),
    status: body.status === "success" ? "processed" : "failed",
    error: body.status !== "success" ? body.message : undefined,
  };
}

// ── Unified Interface ──────────────────────────────────────────────────────

/** Initialize a payment via the configured gateway */
export async function initializePayment(input: InitPaymentInput): Promise<PaymentResult> {
  if (!isPaymentGatewayConfigured()) {
    logger.warn("[PaymentGateway] No payment provider configured — returning simulation");
    return {
      success: true,
      provider: PROVIDER as PaymentProvider,
      reference: input.reference,
      authorizationUrl: `/payment/simulate?ref=${input.reference}`,
      status: "pending",
    };
  }

  try {
    if (PROVIDER === "flutterwave") return await flutterwaveInit(input);
    return await paystackInit(input);
  } catch (err) {
    logger.error("[PaymentGateway] Init failed:", err);
    return {
      success: false,
      provider: PROVIDER as PaymentProvider,
      reference: input.reference,
      status: "failed",
      error: `Payment gateway error: ${err}`,
    };
  }
}

/** Verify a payment by reference */
export async function verifyPayment(reference: string): Promise<VerifyResult> {
  if (!isPaymentGatewayConfigured()) {
    return {
      success: true,
      provider: PROVIDER as PaymentProvider,
      reference,
      status: "success",
      amount: 0,
      currency: "NGN",
      gatewayResponse: "Simulated — no provider configured",
    };
  }

  try {
    if (PROVIDER === "flutterwave") return await flutterwaveVerify(reference);
    return await paystackVerify(reference);
  } catch (err) {
    logger.error("[PaymentGateway] Verify failed:", err);
    return {
      success: false,
      provider: PROVIDER as PaymentProvider,
      reference,
      status: "failed",
      amount: 0,
      currency: "NGN",
    };
  }
}

/** Process a refund */
export async function processRefund(reference: string, amountKobo?: number): Promise<RefundResult> {
  if (!isPaymentGatewayConfigured()) {
    return { success: true, provider: PROVIDER as PaymentProvider, reference, status: "simulated" };
  }

  try {
    if (PROVIDER === "flutterwave") return await flutterwaveRefund(reference, amountKobo);
    return await paystackRefund(reference, amountKobo);
  } catch (err) {
    logger.error("[PaymentGateway] Refund failed:", err);
    return {
      success: false,
      provider: PROVIDER as PaymentProvider,
      reference,
      status: "failed",
      error: `Refund error: ${err}`,
    };
  }
}

/** Validate webhook signature from payment provider */
export function validateWebhookSignature(
  body: string | Buffer,
  signature: string,
  secret?: string,
): boolean {
  const webhookSecret = secret ?? process.env.PAYMENT_WEBHOOK_SECRET ?? "";
  if (!webhookSecret) return false;

  if (PROVIDER === "paystack") {
    const hash = crypto
      .createHmac("sha512", webhookSecret)
      .update(body)
      .digest("hex");
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  }

  if (PROVIDER === "flutterwave") {
    const hash = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");
    return hash === signature;
  }

  return false;
}
