/**
 * Biometric Enrollment Expiry Job
 *
 * Runs every 6 hours to:
 *   1. Revoke enrollments that have passed their expiresAt timestamp
 *   2. Notify users whose enrollments expire within the next 7 days ("expiring soon")
 *
 * Notifications are deduplicated: each enrollment triggers at most one
 * "expiring soon" notification per day (tracked in-memory; resets on restart).
 */
import { getDb } from "../db";
import { biometricEnrollments } from "../../drizzle/schema";
import { eq, and, lt, isNotNull } from "drizzle-orm";
import { createAuditLog, createUserNotification } from "../db";

// Dedup set: enrollmentId → last notification date (YYYY-MM-DD)
const _expirySoonNotified = new Map<string, string>();

const SEVEN_DAYS_S = 7 * 24 * 60 * 60;

async function runExpiryJob() {
  const db = await getDb();
  if (!db) return;

  const nowS = Math.floor(Date.now() / 1000);
  const soonThreshold = nowS + SEVEN_DAYS_S;
  const today = new Date().toISOString().slice(0, 10);

  try {
    // ── 1. Revoke expired enrollments ──────────────────────────────────────
    const expired = await db
      .select()
      .from(biometricEnrollments)
      .where(
        and(
          eq(biometricEnrollments.isActive, true),
          isNotNull(biometricEnrollments.expiresAt),
          lt(biometricEnrollments.expiresAt, nowS)
        )
      );

    for (const enrollment of expired) {
      await db
        .update(biometricEnrollments)
        .set({ isActive: false })
        .where(eq(biometricEnrollments.id, enrollment.id));

      // Audit log
      await createAuditLog({
        actorId: 0, // system actor
        actorName: "system",
        action: "biometric.expiredRevoked",
        entityType: "biometric_enrollment",
        entityId: enrollment.id,
        after: { isActive: false, expiredAt: enrollment.expiresAt },
        description: `Biometric enrollment "${enrollment.deviceName}" auto-revoked due to expiry`,
      }).catch(() => {});

      // Notify user
      const userId = parseInt(enrollment.userId, 10);
      if (!isNaN(userId)) {
        createUserNotification({
          userId,
          category: "system",
          title: "⚠️ Biometric Credential Expired",
          content:
            `Your biometric credential "${enrollment.deviceName ?? "Device"}" has expired and been automatically revoked. ` +
            `Please re-register your device in Settings → Biometric Security to restore biometric login.`,
          actionUrl: "/settings/biometric",
          actionLabel: "Re-register Device",
        }).catch(() => {});
      }
    }

    // ── 2. Warn about enrollments expiring within 7 days ──────────────────
    const expiringSoon = await db
      .select()
      .from(biometricEnrollments)
      .where(
        and(
          eq(biometricEnrollments.isActive, true),
          isNotNull(biometricEnrollments.expiresAt),
          lt(biometricEnrollments.expiresAt, soonThreshold)
        )
      );

    for (const enrollment of expiringSoon) {
      if (!enrollment.expiresAt || enrollment.expiresAt < nowS) continue; // already expired
      const dedupKey = `${enrollment.id}-${today}`;
      if (_expirySoonNotified.has(dedupKey)) continue; // already notified today

      const daysLeft = Math.ceil((enrollment.expiresAt - nowS) / 86400);
      const userId = parseInt(enrollment.userId, 10);
      if (!isNaN(userId)) {
        createUserNotification({
          userId,
          category: "system",
          title: "🔔 Biometric Credential Expiring Soon",
          content:
            `Your biometric credential "${enrollment.deviceName ?? "Device"}" will expire in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. ` +
            `Please re-register your device to avoid losing biometric authentication access.`,
          actionUrl: "/settings/biometric",
          actionLabel: "Manage Credentials",
        }).catch(() => {});
        _expirySoonNotified.set(dedupKey, today);
      }
    }

    if (expired.length > 0 || expiringSoon.length > 0) {
      console.log(
        `[Biometric Expiry Job] Revoked: ${expired.length}, Expiring soon notified: ${expiringSoon.length}`
      );
    }
  } catch (err) {
    console.error("[Biometric Expiry Job] Error:", err);
  }
}

let _jobInterval: ReturnType<typeof setInterval> | null = null;

export function startBiometricExpiryJob(intervalMs = 6 * 60 * 60 * 1000) {
  if (_jobInterval) return; // already running
  // Run immediately on start, then on interval
  runExpiryJob();
  _jobInterval = setInterval(runExpiryJob, intervalMs);
  console.log(`[Biometric Expiry Job] Started (interval: ${intervalMs / 3600000}h)`);
}

export function stopBiometricExpiryJob() {
  if (_jobInterval) {
    clearInterval(_jobInterval);
    _jobInterval = null;
  }
}
