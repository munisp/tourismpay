/**
 * Transactional Email Helper
 *
 * Sends HTML emails via Nodemailer (SMTP) when SMTP credentials are configured,
 * or falls back to a rich in-app notification so merchants are always informed.
 *
 * Environment variables (optional — falls back to in-app notification if absent):
 *   SMTP_HOST       e.g. smtp.sendgrid.net
 *   SMTP_PORT       e.g. 587
 *   SMTP_USER       e.g. apikey
 *   SMTP_PASS       e.g. SG.xxxx
 *   SMTP_FROM       e.g. "TourismPay <noreply@tourismpay.com>"
 */

import { createUserNotification } from "../db";
import { ENV } from "./env";

export type EmailPayload = {
  /** Recipient user ID (for fallback in-app notification) */
  userId: number;
  /** Recipient email address */
  to: string;
  /** Email subject line */
  subject: string;
  /** Plain-text fallback body */
  text: string;
  /** Full HTML email body */
  html: string;
  /** Category for in-app notification fallback */
  category?: "bis" | "kyb" | "system" | "fraud" | "soc" | "report" | "wallet";
  /** Action URL for in-app notification fallback */
  actionUrl?: string;
  /** Action label for in-app notification fallback */
  actionLabel?: string;
};

/** Build a branded TourismPay HTML email template */
export function buildBisEmailHtml(opts: {
  merchantName: string;
  establishmentName: string;
  referenceId: string;
  status: "completed" | "flagged";
  riskScore: number;
  riskLevel: string;
  recommendation: string;
  actionUrl: string;
}): string {
  const isCompleted = opts.status === "completed";
  const statusColor = isCompleted ? "#22c55e" : "#f59e0b";
  const statusLabel = isCompleted ? "Investigation Complete" : "Action Required";
  const statusIcon = isCompleted ? "✅" : "⚠️";
  const headline = isCompleted
    ? "Your BIS Investigation is complete — KYB Eligible"
    : "Your BIS Investigation requires attention";
  const bodyText = isCompleted
    ? `Your Background Investigation for <strong>${opts.establishmentName}</strong> has been completed successfully. Your KYB application is now eligible for admin approval, which typically takes 1–3 business days.`
    : `Your Background Investigation for <strong>${opts.establishmentName}</strong> has been flagged for compliance review. A compliance officer will contact you within 2 business days. Please log in to review the details.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${statusLabel} — TourismPay</title>
</head>
<body style="margin:0;padding:0;background:#0a0f1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0f1e;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);border-radius:12px 12px 0 0;padding:32px 40px;border-bottom:1px solid #1e293b;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Tourism<span style="color:#22c55e;">Pay</span></span>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}44;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600;">
                      ${statusIcon} ${statusLabel}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background:#111827;padding:40px;">
              <p style="margin:0 0 8px;font-size:14px;color:#94a3b8;">Hello, ${opts.merchantName}</p>
              <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;">${headline}</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#cbd5e1;line-height:1.6;">${bodyText}</p>

              <!-- Investigation details card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:8px;border:1px solid #334155;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom:12px;border-bottom:1px solid #334155;">
                          <span style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Investigation Details</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top:12px;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="padding:4px 0;font-size:13px;color:#94a3b8;">Reference ID</td>
                              <td align="right" style="padding:4px 0;font-size:13px;color:#e2e8f0;font-weight:600;">${opts.referenceId}</td>
                            </tr>
                            <tr>
                              <td style="padding:4px 0;font-size:13px;color:#94a3b8;">Establishment</td>
                              <td align="right" style="padding:4px 0;font-size:13px;color:#e2e8f0;">${opts.establishmentName}</td>
                            </tr>
                            <tr>
                              <td style="padding:4px 0;font-size:13px;color:#94a3b8;">Risk Score</td>
                              <td align="right" style="padding:4px 0;font-size:13px;color:${statusColor};font-weight:700;">${opts.riskScore}/100 (${opts.riskLevel})</td>
                            </tr>
                            <tr>
                              <td style="padding:4px 0;font-size:13px;color:#94a3b8;">Status</td>
                              <td align="right" style="padding:4px 0;font-size:13px;color:${statusColor};font-weight:600;">${opts.status.charAt(0).toUpperCase() + opts.status.slice(1)}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Recommendation -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:${statusColor}11;border-radius:8px;border:1px solid ${statusColor}33;margin-bottom:32px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:13px;color:${statusColor};font-weight:600;">Next Step</p>
                    <p style="margin:6px 0 0;font-size:14px;color:#cbd5e1;line-height:1.5;">${opts.recommendation}</p>
                  </td>
                </tr>
              </table>

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:8px;background:${statusColor};">
                    <a href="${opts.actionUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#000000;text-decoration:none;border-radius:8px;">
                      View BIS Status →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#0f172a;border-radius:0 0 12px 12px;padding:24px 40px;border-top:1px solid #1e293b;">
              <p style="margin:0;font-size:12px;color:#475569;line-height:1.6;">
                This is an automated notification from TourismPay Compliance. If you have questions, contact your compliance officer or reply to this email.
                <br />© ${new Date().getFullYear()} TourismPay. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send a transactional email.
 *
 * When SMTP_HOST is configured, sends via Nodemailer SMTP.
 * Otherwise, falls back to a rich in-app notification so the merchant is
 * always informed regardless of email configuration.
 *
 * Returns `{ sent: boolean; method: 'smtp' | 'notification' | 'none' }`.
 */
export async function sendTransactionalEmail(
  payload: EmailPayload
): Promise<{ sent: boolean; method: "smtp" | "notification" | "none" }> {
  const smtpHost = ENV.smtpHost;
  const smtpUser = ENV.smtpUser;
  const smtpPass = ENV.smtpPass;
  const smtpFrom = ENV.smtpFrom || "TourismPay <noreply@tourismpay.com>";
  const smtpPort = ENV.smtpPort;

  // ── SMTP path ─────────────────────────────────────────────────────────────
  if (smtpHost && smtpUser && smtpPass) {
    try {
      // Dynamic import so nodemailer is only loaded when SMTP is configured
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });
      await transporter.sendMail({
        from: smtpFrom,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      });
      console.log(`[Email] Sent via SMTP to ${payload.to}: ${payload.subject}`);
      return { sent: true, method: "smtp" };
    } catch (err) {
      console.error("[Email] SMTP send failed, falling back to in-app notification:", err);
      // Fall through to in-app notification
    }
  }

  // ── In-app notification fallback ──────────────────────────────────────────
  try {
    await createUserNotification({
      userId: payload.userId,
      category: payload.category ?? "system",
      title: payload.subject,
      content: payload.text,
      actionUrl: payload.actionUrl,
      actionLabel: payload.actionLabel ?? "View",
    });
    console.log(`[Email] No SMTP configured — sent as in-app notification to user ${payload.userId}`);
    return { sent: true, method: "notification" };
  } catch (err) {
    console.error("[Email] In-app notification fallback also failed:", err);
    return { sent: false, method: "none" };
  }
}
