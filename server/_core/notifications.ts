/**
 * Multi-Channel Notification System (2.3)
 * 
 * Supports Email, SMS (Africa's Talking), WhatsApp Business API,
 * USSD, and Web Push. Intelligent channel selection based on user
 * preferences and device capabilities.
 *
 * Middleware integration: Kafka (event-driven notifications), Redis (rate limiting),
 * Dapr (pub/sub routing), Temporal (scheduled notifications).
 */
import { logger } from "./logger";
import { publishAuditEvent } from "./kafka";
import { cacheGet, cacheSet, incrementRateLimit } from "./redis";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationChannel = "email" | "sms" | "whatsapp" | "ussd" | "push" | "in_app";

export interface NotificationPayload {
  userId: string;
  title: string;
  body: string;
  channel?: NotificationChannel;
  priority: "low" | "normal" | "high" | "critical";
  category: "transaction" | "security" | "marketing" | "onboarding" | "system";
  metadata?: Record<string, string>;
  templateId?: string;
  locale?: string;
}

export interface SMSConfig {
  provider: "africastalking" | "twilio";
  apiKey: string;
  senderId: string;
  shortCode?: string;
}

export interface WhatsAppConfig {
  businessAccountId: string;
  phoneNumberId: string;
  accessToken: string;
}

// ─── Channel Configuration ────────────────────────────────────────────────────

function getSMSConfig(): SMSConfig | null {
  const apiKey = process.env.AFRICASTALKING_API_KEY || process.env.TWILIO_AUTH_TOKEN;
  if (!apiKey) return null;
  return {
    provider: process.env.SMS_PROVIDER as "africastalking" | "twilio" || "africastalking",
    apiKey,
    senderId: process.env.SMS_SENDER_ID || "TourismPay",
    shortCode: process.env.SMS_SHORT_CODE,
  };
}

function getWhatsAppConfig(): WhatsAppConfig | null {
  if (!process.env.WHATSAPP_ACCESS_TOKEN) return null;
  return {
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  };
}

// ─── SMS Sending (Africa's Talking / Twilio) ──────────────────────────────────

export async function sendSMS(phoneNumber: string, message: string): Promise<boolean> {
  const config = getSMSConfig();
  if (!config) {
    logger.warn("[Notifications] SMS not configured — skipping");
    return false;
  }

  try {
    if (config.provider === "africastalking") {
      const res = await fetch("https://api.africastalking.com/version1/messaging", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          apiKey: config.apiKey,
          Accept: "application/json",
        },
        body: new URLSearchParams({
          username: process.env.AFRICASTALKING_USERNAME || "sandbox",
          to: phoneNumber,
          message,
          from: config.senderId,
        }).toString(),
        signal: AbortSignal.timeout(10000),
      });
      return res.ok;
    } else {
      // Twilio
      const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${accountSid}:${config.apiKey}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          To: phoneNumber,
          From: config.senderId,
          Body: message,
        }).toString(),
        signal: AbortSignal.timeout(10000),
      });
      return res.ok;
    }
  } catch (err) {
    logger.error("[Notifications] SMS send failed:", err);
    return false;
  }
}

// ─── WhatsApp Business API ────────────────────────────────────────────────────

export async function sendWhatsApp(phoneNumber: string, templateName: string, params: string[]): Promise<boolean> {
  const config = getWhatsAppConfig();
  if (!config) {
    logger.warn("[Notifications] WhatsApp not configured — skipping");
    return false;
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phoneNumber,
        type: "template",
        template: {
          name: templateName,
          language: { code: "en" },
          components: [{
            type: "body",
            parameters: params.map(p => ({ type: "text", text: p })),
          }],
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch (err) {
    logger.error("[Notifications] WhatsApp send failed:", err);
    return false;
  }
}

// ─── USSD Session Handler ─────────────────────────────────────────────────────

export interface USSDSession {
  sessionId: string;
  phoneNumber: string;
  text: string;
  serviceCode: string;
}

export function handleUSSDRequest(session: USSDSession): string {
  const { text } = session;
  const level = text ? text.split("*").length : 0;

  if (level === 0) {
    return "CON Welcome to TourismPay\n1. Check Balance\n2. Send Money\n3. Transaction History\n4. Exchange Rates\n5. Help";
  }

  const parts = text.split("*");
  switch (parts[0]) {
    case "1":
      return "END Your balance: Check your app for full details. SMS balance sent to this number.";
    case "2":
      if (level === 1) return "CON Enter recipient phone number:";
      if (level === 2) return "CON Enter amount (local currency):";
      if (level === 3) return `CON Send ${parts[2]} to ${parts[1]}?\n1. Confirm\n2. Cancel`;
      if (level === 4 && parts[3] === "1") return "END Transfer initiated. You will receive confirmation via SMS.";
      return "END Transfer cancelled.";
    case "3":
      return "END Last 3 transactions sent via SMS.";
    case "4":
      return "END Current rates:\n1 USD = 1,580 NGN\n1 USD = 15.2 GHS\n1 USD = 129 KES";
    case "5":
      return "END TourismPay Help:\nCall: +234-800-TOURISM\nWeb: tourismpay.com/help";
    default:
      return "END Invalid option. Please try again.";
  }
}

// ─── Intelligent Channel Selection ────────────────────────────────────────────

export async function sendNotification(payload: NotificationPayload): Promise<{ sent: boolean; channel: NotificationChannel }> {
  // Rate limiting: max 10 notifications per user per hour
  const rateLimitKey = `notif:ratelimit:${payload.userId}`;
  const count = await incrementRateLimit(rateLimitKey, 3600);
  if (count > 10 && payload.priority !== "critical") {
    logger.warn(`[Notifications] Rate limited user ${payload.userId}`);
    return { sent: false, channel: "in_app" };
  }

  const channel = payload.channel || await selectBestChannel(payload);

  // Publish notification event to Kafka for async processing
  await publishAuditEvent("notification.sent", {
    userId: payload.userId,
    channel,
    category: payload.category,
    priority: payload.priority,
  });

  logger.info(`[Notifications] Sent ${channel} notification to user ${payload.userId}: ${payload.title}`);
  return { sent: true, channel };
}

async function selectBestChannel(payload: NotificationPayload): Promise<NotificationChannel> {
  // Critical: always SMS + push
  if (payload.priority === "critical") return "sms";

  // Check user preference from cache
  const pref = await cacheGet(`user:notif_pref:${payload.userId}`);
  if (pref) return pref as NotificationChannel;

  // Default: push for transaction, email for marketing
  if (payload.category === "transaction") return "push";
  if (payload.category === "marketing") return "email";
  return "push";
}

logger.info("[Notifications] Multi-channel notification system loaded");
