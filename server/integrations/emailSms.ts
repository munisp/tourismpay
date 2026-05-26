/**
 * Email & SMS Delivery — real integrations with SendGrid and Twilio.
 *
 * Falls back to console logging when credentials are not configured.
 * Supports Africa's Talking as an alternative SMS provider for African markets.
 */
import { logger } from "../_core/logger";

// ─── Configuration ───────────────────────────────────────────────────────────

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@tourismpay.com";
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || "TourismPay";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || "";

const AT_API_KEY = process.env.AFRICASTALKING_API_KEY || "";
const AT_USERNAME = process.env.AFRICASTALKING_USERNAME || "sandbox";
const AT_FROM = process.env.AFRICASTALKING_FROM || "TourismPay";
const AT_ENVIRONMENT = process.env.AFRICASTALKING_ENVIRONMENT || "sandbox";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  templateId?: string;
  dynamicData?: Record<string, unknown>;
  replyTo?: string;
}

export interface SmsOptions {
  to: string;
  body: string;
  provider?: "twilio" | "africastalking";
}

export interface DeliveryResult {
  success: boolean;
  provider: string;
  messageId?: string;
  error?: string;
}

// ─── Email via SendGrid ──────────────────────────────────────────────────────

export async function sendEmail(options: EmailOptions): Promise<DeliveryResult> {
  if (!SENDGRID_API_KEY) {
    logger.warn("[Email] SendGrid not configured, logging email", { to: options.to, subject: options.subject });
    logger.info(`[Email] To: ${options.to} | Subject: ${options.subject} | Body: ${options.text || options.html?.slice(0, 200)}`);
    return { success: true, provider: "console", messageId: `dev-${Date.now()}` };
  }

  const body: Record<string, unknown> = {
    personalizations: [{
      to: [{ email: options.to }],
      ...(options.dynamicData ? { dynamic_template_data: options.dynamicData } : {}),
    }],
    from: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
    subject: options.subject,
    ...(options.replyTo ? { reply_to: { email: options.replyTo } } : {}),
  };

  if (options.templateId) {
    body.template_id = options.templateId;
  } else {
    body.content = [];
    if (options.text) (body.content as unknown[]).push({ type: "text/plain", value: options.text });
    if (options.html) (body.content as unknown[]).push({ type: "text/html", value: options.html });
    if (!(body.content as unknown[]).length) {
      (body.content as unknown[]).push({ type: "text/plain", value: options.subject });
    }
  }

  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 202 || res.status === 200) {
      const messageId = res.headers.get("x-message-id") || `sg-${Date.now()}`;
      logger.info("[Email] Sent via SendGrid", { to: options.to, messageId });
      return { success: true, provider: "sendgrid", messageId };
    }

    const errBody = await res.text();
    logger.error("[Email] SendGrid error", { status: res.status, body: errBody });
    return { success: false, provider: "sendgrid", error: `HTTP ${res.status}: ${errBody}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[Email] SendGrid request failed", { error: msg });
    return { success: false, provider: "sendgrid", error: msg };
  }
}

// ─── SMS via Twilio ──────────────────────────────────────────────────────────

async function sendSmsViaTwilio(options: SmsOptions): Promise<DeliveryResult> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    logger.warn("[SMS] Twilio not configured, logging SMS", { to: options.to });
    logger.info(`[SMS] To: ${options.to} | Body: ${options.body}`);
    return { success: true, provider: "console", messageId: `dev-${Date.now()}` };
  }

  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const params = new URLSearchParams({
    To: options.to,
    From: TWILIO_FROM_NUMBER,
    Body: options.body,
  });

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    const data = await res.json() as { sid?: string; error_message?: string; status?: string };

    if (data.sid) {
      logger.info("[SMS] Sent via Twilio", { to: options.to, sid: data.sid });
      return { success: true, provider: "twilio", messageId: data.sid };
    }

    return { success: false, provider: "twilio", error: data.error_message || `HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, provider: "twilio", error: msg };
  }
}

// ─── SMS via Africa's Talking ────────────────────────────────────────────────

async function sendSmsViaAfricasTalking(options: SmsOptions): Promise<DeliveryResult> {
  if (!AT_API_KEY) {
    logger.warn("[SMS] Africa's Talking not configured, logging SMS", { to: options.to });
    logger.info(`[SMS-AT] To: ${options.to} | Body: ${options.body}`);
    return { success: true, provider: "console", messageId: `dev-${Date.now()}` };
  }

  const baseUrl = AT_ENVIRONMENT === "production"
    ? "https://api.africastalking.com/version1/messaging"
    : "https://api.sandbox.africastalking.com/version1/messaging";

  const params = new URLSearchParams({
    username: AT_USERNAME,
    to: options.to,
    message: options.body,
    from: AT_FROM,
  });

  try {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        apiKey: AT_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });

    const data = await res.json() as {
      SMSMessageData?: { Recipients?: Array<{ messageId: string; status: string; statusCode: number }> };
    };

    const recipient = data.SMSMessageData?.Recipients?.[0];
    if (recipient && recipient.statusCode === 101) {
      logger.info("[SMS] Sent via Africa's Talking", { to: options.to, messageId: recipient.messageId });
      return { success: true, provider: "africastalking", messageId: recipient.messageId };
    }

    return { success: false, provider: "africastalking", error: recipient?.status || "Unknown error" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, provider: "africastalking", error: msg };
  }
}

// ─── Unified SMS Interface ───────────────────────────────────────────────────

export async function sendSms(options: SmsOptions): Promise<DeliveryResult> {
  // Auto-detect provider based on phone number prefix (African numbers → AT, others → Twilio)
  const provider = options.provider ||
    (isAfricanNumber(options.to) && AT_API_KEY ? "africastalking" : "twilio");

  if (provider === "africastalking") {
    return sendSmsViaAfricasTalking(options);
  }
  return sendSmsViaTwilio(options);
}

function isAfricanNumber(phone: string): boolean {
  const africanPrefixes = [
    "+254", "+234", "+27", "+255", "+256", "+233", "+225", "+237",
    "+221", "+250", "+251", "+212", "+213", "+216", "+20",
  ];
  return africanPrefixes.some((p) => phone.startsWith(p));
}

// ─── Convenience Functions ───────────────────────────────────────────────────

export async function sendVerificationEmail(to: string, code: string): Promise<DeliveryResult> {
  return sendEmail({
    to,
    subject: "TourismPay — Verify your email",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a1a;">Verify your email</h2>
        <p>Your verification code is:</p>
        <div style="background: #f4f4f5; padding: 16px; border-radius: 8px; text-align: center; font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #18181b;">
          ${code}
        </div>
        <p style="color: #71717a; font-size: 14px; margin-top: 16px;">
          This code expires in 10 minutes. If you didn't request this, please ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;" />
        <p style="color: #a1a1aa; font-size: 12px;">TourismPay — Tourism payments for Africa</p>
      </div>
    `,
    text: `Your TourismPay verification code is: ${code}. It expires in 10 minutes.`,
  });
}

export async function sendVerificationSms(to: string, code: string): Promise<DeliveryResult> {
  return sendSms({
    to,
    body: `TourismPay: Your verification code is ${code}. Valid for 10 minutes.`,
  });
}

export async function sendPaymentReceipt(to: string, data: {
  amount: number;
  currency: string;
  merchant: string;
  reference: string;
  date: string;
}): Promise<DeliveryResult> {
  return sendEmail({
    to,
    subject: `TourismPay — Payment receipt (${data.reference})`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2>Payment Receipt</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; color: #71717a;">Amount</td><td style="padding: 8px 0; text-align: right; font-weight: bold;">${data.currency} ${data.amount.toFixed(2)}</td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Merchant</td><td style="padding: 8px 0; text-align: right;">${data.merchant}</td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Reference</td><td style="padding: 8px 0; text-align: right;">${data.reference}</td></tr>
          <tr><td style="padding: 8px 0; color: #71717a;">Date</td><td style="padding: 8px 0; text-align: right;">${data.date}</td></tr>
        </table>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;" />
        <p style="color: #a1a1aa; font-size: 12px;">TourismPay — Tourism payments for Africa</p>
      </div>
    `,
  });
}

export function getDeliveryStatus(): { email: { provider: string; configured: boolean }; sms: { provider: string; configured: boolean }[] } {
  return {
    email: {
      provider: SENDGRID_API_KEY ? "sendgrid" : "console",
      configured: !!SENDGRID_API_KEY,
    },
    sms: [
      { provider: "twilio", configured: !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) },
      { provider: "africastalking", configured: !!AT_API_KEY },
    ],
  };
}
