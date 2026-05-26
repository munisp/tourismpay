/**
 * Payment Rails — unified abstraction over multiple African payment providers.
 *
 * Supports:
 * - Stripe Connect (international cards, express accounts)
 * - M-Pesa (Safaricom, Vodacom via Daraja API)
 * - Flutterwave (cards, bank transfers, mobile money across Africa)
 * - Wise (cross-border remittance)
 *
 * Each provider is optional — if env vars are not set, the provider is disabled.
 * The PaymentRails class provides a unified interface for:
 *   - Initiating payments
 *   - Checking payment status
 *   - Processing refunds
 *   - Handling webhooks
 */
import crypto from "crypto";
import { logger } from "../_core/logger";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PaymentProvider = "stripe" | "mpesa" | "flutterwave" | "wise";
export type PaymentStatus = "pending" | "processing" | "completed" | "failed" | "refunded";

export interface PaymentRequest {
  amount: number;
  currency: string;
  provider: PaymentProvider;
  reference: string;
  description?: string;
  metadata?: Record<string, string>;
  // Provider-specific
  mpesaPhoneNumber?: string;
  flutterwavePaymentType?: "card" | "mobilemoney" | "banktransfer";
  wiseTargetCurrency?: string;
  wiseRecipientId?: string;
  stripeCustomerId?: string;
}

export interface PaymentResult {
  id: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  amount: number;
  currency: string;
  reference: string;
  providerReference?: string;
  redirectUrl?: string;
  error?: string;
  timestamp: string;
}

// ─── Provider Configs ────────────────────────────────────────────────────────

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || "";
const MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY || "";
const MPESA_CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET || "";
const MPESA_PASSKEY = process.env.MPESA_PASSKEY || "";
const MPESA_SHORTCODE = process.env.MPESA_SHORTCODE || "174379";
const MPESA_ENVIRONMENT = process.env.MPESA_ENVIRONMENT || "sandbox";
const FLUTTERWAVE_SECRET = process.env.FLUTTERWAVE_SECRET_KEY || "";
const FLUTTERWAVE_ENCRYPTION_KEY = process.env.FLUTTERWAVE_ENCRYPTION_KEY || "";
const WISE_API_TOKEN = process.env.WISE_API_TOKEN || "";
const WISE_PROFILE_ID = process.env.WISE_PROFILE_ID || "";
const WISE_ENVIRONMENT = process.env.WISE_ENVIRONMENT || "sandbox";

const MPESA_BASE = MPESA_ENVIRONMENT === "production"
  ? "https://api.safaricom.co.ke"
  : "https://sandbox.safaricom.co.ke";

const FLUTTERWAVE_BASE = "https://api.flutterwave.com/v3";

const WISE_BASE = WISE_ENVIRONMENT === "production"
  ? "https://api.transferwise.com"
  : "https://api.sandbox.transferwise.tech";

// ─── Provider Status ─────────────────────────────────────────────────────────

export function getAvailableProviders(): { provider: PaymentProvider; enabled: boolean; environment: string }[] {
  return [
    { provider: "stripe", enabled: !!STRIPE_SECRET, environment: STRIPE_SECRET.startsWith("sk_live") ? "live" : "test" },
    { provider: "mpesa", enabled: !!(MPESA_CONSUMER_KEY && MPESA_CONSUMER_SECRET), environment: MPESA_ENVIRONMENT },
    { provider: "flutterwave", enabled: !!FLUTTERWAVE_SECRET, environment: FLUTTERWAVE_SECRET.startsWith("FLWSECK_TEST") ? "test" : "live" },
    { provider: "wise", enabled: !!WISE_API_TOKEN, environment: WISE_ENVIRONMENT },
  ];
}

// ─── M-Pesa Integration ──────────────────────────────────────────────────────

let mpesaToken: { token: string; expiresAt: number } | null = null;

async function getMpesaToken(): Promise<string> {
  if (mpesaToken && mpesaToken.expiresAt > Date.now()) return mpesaToken.token;

  const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString("base64");
  const res = await fetch(`${MPESA_BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`M-Pesa auth failed: ${res.status}`);
  const data = await res.json() as { access_token: string; expires_in: string };
  mpesaToken = { token: data.access_token, expiresAt: Date.now() + parseInt(data.expires_in) * 1000 - 60000 };
  return mpesaToken.token;
}

async function mpesaStkPush(request: PaymentRequest): Promise<PaymentResult> {
  const token = await getMpesaToken();
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString("base64");

  const callbackUrl = process.env.MPESA_CALLBACK_URL || `${process.env.APP_URL || "https://api.tourismpay.com"}/api/webhooks/mpesa`;

  const body = {
    BusinessShortCode: MPESA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.round(request.amount),
    PartyA: request.mpesaPhoneNumber,
    PartyB: MPESA_SHORTCODE,
    PhoneNumber: request.mpesaPhoneNumber,
    CallBackURL: callbackUrl,
    AccountReference: request.reference.slice(0, 12),
    TransactionDesc: request.description || "TourismPay Payment",
  };

  const res = await fetch(`${MPESA_BASE}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json() as Record<string, string>;

  if (data.ResponseCode === "0") {
    return {
      id: crypto.randomUUID(),
      provider: "mpesa",
      status: "pending",
      amount: request.amount,
      currency: request.currency,
      reference: request.reference,
      providerReference: data.CheckoutRequestID,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    id: crypto.randomUUID(),
    provider: "mpesa",
    status: "failed",
    amount: request.amount,
    currency: request.currency,
    reference: request.reference,
    error: data.errorMessage || data.ResponseDescription || "STK push failed",
    timestamp: new Date().toISOString(),
  };
}

// ─── Flutterwave Integration ─────────────────────────────────────────────────

async function flutterwaveCharge(request: PaymentRequest): Promise<PaymentResult> {
  const txRef = `TP-${request.reference}-${Date.now()}`;

  const body: Record<string, unknown> = {
    tx_ref: txRef,
    amount: request.amount,
    currency: request.currency,
    redirect_url: `${process.env.APP_URL || "https://tourismpay.com"}/payment/callback`,
    payment_options: request.flutterwavePaymentType || "card,mobilemoney,banktransfer",
    meta: { reference: request.reference, ...request.metadata },
    customer: { email: request.metadata?.email || "customer@tourismpay.com" },
    customizations: {
      title: "TourismPay",
      description: request.description || "Payment",
      logo: "https://tourismpay.com/logo.png",
    },
  };

  const res = await fetch(`${FLUTTERWAVE_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FLUTTERWAVE_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as { status: string; data?: { link?: string }; message?: string };

  if (data.status === "success" && data.data?.link) {
    return {
      id: crypto.randomUUID(),
      provider: "flutterwave",
      status: "pending",
      amount: request.amount,
      currency: request.currency,
      reference: request.reference,
      providerReference: txRef,
      redirectUrl: data.data.link,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    id: crypto.randomUUID(),
    provider: "flutterwave",
    status: "failed",
    amount: request.amount,
    currency: request.currency,
    reference: request.reference,
    error: data.message || "Flutterwave charge failed",
    timestamp: new Date().toISOString(),
  };
}

async function flutterwaveVerify(transactionId: string): Promise<PaymentResult> {
  const res = await fetch(`${FLUTTERWAVE_BASE}/transactions/${transactionId}/verify`, {
    headers: { Authorization: `Bearer ${FLUTTERWAVE_SECRET}` },
  });
  const data = await res.json() as { status: string; data?: { tx_ref?: string; amount?: number; currency?: string; status?: string } };

  return {
    id: transactionId,
    provider: "flutterwave",
    status: data.data?.status === "successful" ? "completed" : data.data?.status === "failed" ? "failed" : "pending",
    amount: data.data?.amount || 0,
    currency: data.data?.currency || "USD",
    reference: data.data?.tx_ref || "",
    providerReference: transactionId,
    timestamp: new Date().toISOString(),
  };
}

// ─── Wise Integration ────────────────────────────────────────────────────────

async function wiseCreateTransfer(request: PaymentRequest): Promise<PaymentResult> {
  // Step 1: Create quote
  const quoteRes = await fetch(`${WISE_BASE}/v3/profiles/${WISE_PROFILE_ID}/quotes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WISE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sourceCurrency: request.currency,
      targetCurrency: request.wiseTargetCurrency || "USD",
      sourceAmount: request.amount,
    }),
  });

  if (!quoteRes.ok) {
    return {
      id: crypto.randomUUID(),
      provider: "wise",
      status: "failed",
      amount: request.amount,
      currency: request.currency,
      reference: request.reference,
      error: `Quote creation failed: ${quoteRes.status}`,
      timestamp: new Date().toISOString(),
    };
  }

  const quote = await quoteRes.json() as { id: string };

  // Step 2: Create transfer
  const transferRes = await fetch(`${WISE_BASE}/v1/transfers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WISE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      targetAccount: request.wiseRecipientId,
      quoteUuid: quote.id,
      customerTransactionId: request.reference,
      details: { reference: request.description || "TourismPay Transfer" },
    }),
  });

  const transfer = await transferRes.json() as { id?: number; status?: string; error?: string };

  if (transfer.id) {
    return {
      id: crypto.randomUUID(),
      provider: "wise",
      status: "processing",
      amount: request.amount,
      currency: request.currency,
      reference: request.reference,
      providerReference: String(transfer.id),
      timestamp: new Date().toISOString(),
    };
  }

  return {
    id: crypto.randomUUID(),
    provider: "wise",
    status: "failed",
    amount: request.amount,
    currency: request.currency,
    reference: request.reference,
    error: transfer.error || "Wise transfer failed",
    timestamp: new Date().toISOString(),
  };
}

// ─── Unified Payment Interface ───────────────────────────────────────────────

export async function initiatePayment(request: PaymentRequest): Promise<PaymentResult> {
  logger.info(`Initiating ${request.provider} payment`, {
    amount: request.amount,
    currency: request.currency,
    reference: request.reference,
  });

  switch (request.provider) {
    case "mpesa":
      if (!MPESA_CONSUMER_KEY) throw new Error("M-Pesa not configured");
      return mpesaStkPush(request);

    case "flutterwave":
      if (!FLUTTERWAVE_SECRET) throw new Error("Flutterwave not configured");
      return flutterwaveCharge(request);

    case "wise":
      if (!WISE_API_TOKEN) throw new Error("Wise not configured");
      return wiseCreateTransfer(request);

    case "stripe":
      // Stripe is handled via the existing stripeConnect router
      // This path is for direct charges (not Connect)
      throw new Error("Use stripeConnect router for Stripe payments");

    default:
      throw new Error(`Unknown provider: ${request.provider}`);
  }
}

export async function verifyPayment(provider: PaymentProvider, transactionId: string): Promise<PaymentResult> {
  switch (provider) {
    case "flutterwave":
      return flutterwaveVerify(transactionId);

    case "mpesa": {
      const token = await getMpesaToken();
      const res = await fetch(`${MPESA_BASE}/mpesa/stkpushquery/v1/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          BusinessShortCode: MPESA_SHORTCODE,
          Password: Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}`).toString("base64"),
          Timestamp: new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14),
          CheckoutRequestID: transactionId,
        }),
      });
      const data = await res.json() as { ResultCode?: string; ResultDesc?: string };
      return {
        id: transactionId,
        provider: "mpesa",
        status: data.ResultCode === "0" ? "completed" : "pending",
        amount: 0,
        currency: "KES",
        reference: "",
        providerReference: transactionId,
        timestamp: new Date().toISOString(),
      };
    }

    default:
      throw new Error(`Verification not supported for ${provider}`);
  }
}

export async function refundPayment(provider: PaymentProvider, transactionId: string, amount?: number): Promise<PaymentResult> {
  if (provider === "flutterwave") {
    const res = await fetch(`${FLUTTERWAVE_BASE}/transactions/${transactionId}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FLUTTERWAVE_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(amount ? { amount } : {}),
    });
    const data = await res.json() as { status: string; data?: { amount_refunded?: number } };
    return {
      id: crypto.randomUUID(),
      provider: "flutterwave",
      status: data.status === "success" ? "refunded" : "failed",
      amount: data.data?.amount_refunded || amount || 0,
      currency: "USD",
      reference: transactionId,
      timestamp: new Date().toISOString(),
    };
  }

  throw new Error(`Refund not supported for ${provider}`);
}
