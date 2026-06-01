/**
 * Biometric / FIDO2 enrollment router
 * Manages WebAuthn credential registrations per user.
 * Also supports mobile biometric login via device-side verification
 * (expo-local-authentication handles the actual fingerprint/face check;
 * the backend records the event and issues a session token).
 *
 * High-value transaction re-auth:
 *   1. Client calls biometric.requestHighValueToken({ amount, currency })
 *   2. Client triggers device biometric check (on-device)
 *   3. Client passes returned token to wallet.send({ ..., biometricToken })
 *   4. wallet.send calls biometric.verifyHighValueToken internally
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { biometricEnrollments, pinLockoutHistory } from "../../drizzle/schema";
import { eq, and, lt, desc } from "drizzle-orm";
import { createAuditLog, createUserNotification } from "../db";
import { cacheGet, cacheSet } from "../middleware/redisClient";
import { logger } from "../_core/logger";

// PIN lockout tracking — persisted to Redis with in-memory fallback
// key: userId, value: { failedAttempts, lockedUntil }
const _pinLockoutFallback = new Map<string, { failedAttempts: number; lockedUntil: number }>();

async function getPinLockout(userId: string): Promise<{ failedAttempts: number; lockedUntil: number } | undefined> {
  try {
    const cached = await cacheGet(`pinlockout:${userId}`);
    if (cached) return JSON.parse(cached);
  } catch { /* fallback */ }
  return _pinLockoutFallback.get(userId);
}

async function setPinLockout(userId: string, data: { failedAttempts: number; lockedUntil: number }): Promise<void> {
  _pinLockoutFallback.set(userId, data);
  const ttl = Math.max(Math.ceil((data.lockedUntil - Date.now()) / 1000), 3600);
  try {
    await cacheSet(`pinlockout:${userId}`, JSON.stringify(data), ttl);
  } catch { /* in-memory fallback already set */ }
}

async function deletePinLockout(userId: string): Promise<void> {
  _pinLockoutFallback.delete(userId);
  try {
    const { cacheDel } = await import("../middleware/redisClient");
    await cacheDel(`pinlockout:${userId}`);
  } catch { /* ignore */ }
}
const PIN_MAX_ATTEMPTS = 5;
// Exponential backoff tiers: tier 0 = 15 min, tier 1 = 1 hr, tier 2+ = 24 hr
const PIN_LOCKOUT_TIERS_MS = [
  15 * 60 * 1000,       // Tier 0: 15 minutes
  60 * 60 * 1000,       // Tier 1: 1 hour
  24 * 60 * 60 * 1000,  // Tier 2+: 24 hours
];
/** Get the lockout duration in ms for a given tier */
function getPinLockoutMs(tier: number): number {
  return PIN_LOCKOUT_TIERS_MS[Math.min(tier, PIN_LOCKOUT_TIERS_MS.length - 1)];
}
/** Get the human-readable label for a lockout tier */
function getPinLockoutLabel(tier: number): string {
  if (tier === 0) return "15 minutes";
  if (tier === 1) return "1 hour";
  return "24 hours";
}

// High-value transaction tokens — persisted to Redis with in-memory fallback
const _highValueTokensFallback = new Map<string, {
  userId: string;
  amount: number;
  currency: string;
  expiresAt: number;
}>();

async function getHighValueToken(token: string): Promise<{ userId: string; amount: number; currency: string; expiresAt: number } | undefined> {
  try {
    const cached = await cacheGet(`hvtoken:${token}`);
    if (cached) return JSON.parse(cached);
  } catch { /* fallback */ }
  return _highValueTokensFallback.get(token);
}

async function setHighValueToken(token: string, data: { userId: string; amount: number; currency: string; expiresAt: number }): Promise<void> {
  _highValueTokensFallback.set(token, data);
  const ttl = Math.max(Math.ceil((data.expiresAt - Date.now()) / 1000), 60);
  try {
    await cacheSet(`hvtoken:${token}`, JSON.stringify(data), ttl);
  } catch { /* in-memory fallback already set */ }
}

async function deleteHighValueToken(token: string): Promise<void> {
  _highValueTokensFallback.delete(token);
  try {
    const { cacheDel } = await import("../middleware/redisClient");
    await cacheDel(`hvtoken:${token}`);
  } catch { /* ignore */ }
}

// Exported for test compatibility
export const _highValueTokens = _highValueTokensFallback;

export const biometricRouter = router({
  // List all enrollments for the current user
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(biometricEnrollments)
      .where(eq(biometricEnrollments.userId, String(ctx.user.id)));
  }),

  // Register a new biometric credential (mobile: expo-local-authentication device key)
  enroll: protectedProcedure
    .input(
      z.object({
        credentialId: z.string().min(1),
        publicKey: z.string().min(1),
        deviceName: z.string().max(200).optional(),
        aaguid: z.string().max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Check for duplicate credential
      const existing = await db
        .select()
        .from(biometricEnrollments)
        .where(
          and(
            eq(biometricEnrollments.userId, String(ctx.user.id)),
            eq(biometricEnrollments.credentialId, input.credentialId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Re-activate if previously revoked
        await db
          .update(biometricEnrollments)
          .set({ isActive: true, deviceName: input.deviceName, lastUsedAt: Math.floor(Date.now() / 1000) })
          .where(eq(biometricEnrollments.id, existing[0].id));
        return { id: existing[0].id, reactivated: true };
      }

      const NINETY_DAYS_S = 90 * 24 * 60 * 60;
      const [row] = await db
        .insert(biometricEnrollments)
        .values({
          userId: String(ctx.user.id),
          credentialId: input.credentialId,
          publicKey: input.publicKey,
          deviceName: input.deviceName ?? "Mobile Device",
          aaguid: input.aaguid,
          expiresAt: Math.floor(Date.now() / 1000) + NINETY_DAYS_S,
        })
        .returning();

      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "biometric.enroll",
        entityType: "biometric_enrollment",
        entityId: row.id,
        after: { deviceName: input.deviceName, credentialId: input.credentialId },
      });

      return { id: row.id, reactivated: false };
    }),

  // Verify a biometric login attempt (mobile: device confirmed biometric, backend records it)
  // The actual biometric check is done on-device by expo-local-authentication.
  // This procedure records the successful verification and updates sign count.
  verifyLogin: protectedProcedure
    .input(
      z.object({
        credentialId: z.string().min(1),
        deviceName: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [enrollment] = await db
        .select()
        .from(biometricEnrollments)
        .where(
          and(
            eq(biometricEnrollments.userId, String(ctx.user.id)),
            eq(biometricEnrollments.credentialId, input.credentialId),
            eq(biometricEnrollments.isActive, true)
          )
        )
        .limit(1);

      if (!enrollment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Biometric credential not found or revoked. Please re-register.",
        });
      }
      // Check if enrollment has expired
      const nowS = Math.floor(Date.now() / 1000);
      if (enrollment.expiresAt && enrollment.expiresAt < nowS) {
        // Auto-revoke expired enrollment
        await db
          .update(biometricEnrollments)
          .set({ isActive: false })
          .where(eq(biometricEnrollments.id, enrollment.id));
        // Notify user
        createUserNotification({
          userId: ctx.user.id,
          category: "system",
          title: "\u26A0\uFE0F Biometric Credential Expired",
          content: `Your biometric credential "${enrollment.deviceName ?? 'Device'}" has expired and been automatically revoked. ` +
            `Please re-register your device to continue using biometric authentication.`,
          actionUrl: "/settings/biometric",
          actionLabel: "Re-register Device",
        }).catch(() => {});
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Biometric credential has expired. Please re-register your device.",
        });
      }
      // Increment sign count and update last used timestampp
      const newSignCount = (enrollment.signCount ?? 0) + 1;
      await db
        .update(biometricEnrollments)
        .set({
          signCount: newSignCount,
          lastUsedAt: Math.floor(Date.now() / 1000),
        })
        .where(eq(biometricEnrollments.id, enrollment.id));

      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "biometric.login",
        entityType: "biometric_enrollment",
        entityId: enrollment.id,
        after: { signCount: newSignCount, deviceName: enrollment.deviceName },
      });

      return {
        success: true,
        enrollmentId: enrollment.id,
        signCount: newSignCount,
        deviceName: enrollment.deviceName,
      };
    }),

  // Check if the current user has any active biometric enrollments
  checkEnabled: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { enabled: false, enrollmentCount: 0, enrollments: [] };
    const enrollments = await db
      .select()
      .from(biometricEnrollments)
      .where(
        and(
          eq(biometricEnrollments.userId, String(ctx.user.id)),
          eq(biometricEnrollments.isActive, true)
        )
      );
    return {
      enabled: enrollments.length > 0,
      enrollmentCount: enrollments.length,
      enrollments: enrollments.map(e => ({
        id: e.id,
        deviceName: e.deviceName ?? "Unknown Device",
        credentialId: e.credentialId,
        signCount: e.signCount ?? 0,
        lastUsedAt: e.lastUsedAt,
        expiresAt: e.expiresAt,
        createdAt: e.createdAt,
      })),
    };
  }),

  // Deactivate (revoke) a credential
  revoke: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db
        .update(biometricEnrollments)
        .set({ isActive: false })
        .where(
          and(
            eq(biometricEnrollments.id, input.id),
            eq(biometricEnrollments.userId, String(ctx.user.id))
          )
        );

      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "biometric.revoke",
        entityType: "biometric_enrollment",
        entityId: input.id,
        after: { isActive: false },
      });

      return { success: true };
    }),

  // Stats for the BiometricAuth page
  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { total: 0, active: 0, revoked: 0 };
    const all = await db
      .select()
      .from(biometricEnrollments)
      .where(eq(biometricEnrollments.userId, String(ctx.user.id)));
    const active = all.filter((e) => e.isActive).length;
    return { total: all.length, active, revoked: all.length - active };
  }),

  // ── High-Value Transaction Biometric Re-Auth ──────────────────────────────
  // Step 1: Request a short-lived challenge token for a high-value transaction.
  // The client calls this, then triggers device biometric verification.
  // Returns a token that must be passed to wallet.send within 60 seconds.
  requestHighValueToken: protectedProcedure
    .input(z.object({
      amount: z.number().positive(),
      currency: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Verify user has at least one active biometric enrollment
      const enrollments = await db
        .select()
        .from(biometricEnrollments)
        .where(and(
          eq(biometricEnrollments.userId, String(ctx.user.id)),
          eq(biometricEnrollments.isActive, true)
        ))
        .limit(1);
      if (enrollments.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No active biometric credentials found. Please register your device first.",
        });
      }
      // Issue a short-lived token (60s TTL)
      const token = crypto.randomUUID();
      const expiresAt = Date.now() + 60_000;
      _highValueTokens.set(token, {
        userId: String(ctx.user.id),
        amount: input.amount,
        currency: input.currency,
        expiresAt,
      });
      // Prune expired tokens
      Array.from(_highValueTokens.entries()).forEach(([k, v]) => {
        if (v.expiresAt < Date.now()) _highValueTokens.delete(k);
      });
      // Audit: record token issuance (fire-and-forget, don't block response)
      createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        actorEmail: ctx.user.email,
        action: "biometric.highValueTokenIssued",
        entityType: "wallet_transaction",
        entityId: token,
        after: { amount: input.amount, currency: input.currency, expiresAt },
        description: `High-value biometric token issued for ${input.amount} ${input.currency}`,
      }).catch(() => {});
      return { token, expiresAt };
    }),

  // Step 2: Verify that the device biometric check succeeded and the token is valid.
  // Called by wallet.send to validate the biometric gate before executing the transaction.
  verifyHighValueToken: protectedProcedure
    .input(z.object({
      token: z.string().min(1),
      amount: z.number().positive(),
      currency: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const entry = _highValueTokens.get(input.token);
      if (!entry) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Biometric token not found or already used." });
      }
      if (entry.userId !== String(ctx.user.id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Biometric token does not belong to this user." });
      }
      if (entry.expiresAt < Date.now()) {
        _highValueTokens.delete(input.token);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Biometric token expired. Please re-authenticate." });
      }
      if (entry.amount !== input.amount || entry.currency !== input.currency) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Biometric token was issued for a different transaction." });
      }
      // Consume the token (one-time use)
      _highValueTokens.delete(input.token);
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "biometric.highValueAuth",
        entityType: "wallet_transaction",
        entityId: input.token,
        after: { amount: input.amount, currency: input.currency },
      });
      return { verified: true };
    }),

  // Set a 6-digit PIN as fallback for biometric authentication
  setPin: protectedProcedure
    .input(z.object({
      pin: z.string().length(6).regex(/^\d{6}$/, "PIN must be exactly 6 digits"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Hash the PIN with a user-specific salt using Web Crypto
      const salt = `tourismpay-pin-${ctx.user.id}`;
      const encoder = new TextEncoder();
      const data = encoder.encode(salt + input.pin);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const pinHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      // Store as a special 'pin' type enrollment (aaguid = 'pin' as type discriminator)
      const existing = await db
        .select()
        .from(biometricEnrollments)
        .where(and(
          eq(biometricEnrollments.userId, String(ctx.user.id)),
          eq(biometricEnrollments.aaguid, "pin"),
        ));
      if (existing.length > 0) {
        await db
          .update(biometricEnrollments)
          .set({ credentialId: pinHash, isActive: true, lastUsedAt: Math.floor(Date.now() / 1000) })
          .where(eq(biometricEnrollments.id, existing[0].id));
      } else {
        await db.insert(biometricEnrollments).values({
          userId: String(ctx.user.id),
          deviceName: "PIN Fallback",
          aaguid: "pin",
          credentialId: pinHash,
          publicKey: "",
          signCount: 0,
          isActive: true,
        });
      }
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "biometric.pinSet",
        entityType: "biometric_enrollment",
        entityId: String(ctx.user.id),
        after: { deviceType: "pin" },
      });
      return { success: true };
    }),

  // Verify a 6-digit PIN and return a one-time high-value token (same as biometric)
  verifyPin: protectedProcedure
    .input(z.object({
      pin: z.string().length(6).regex(/^\d{6}$/, "PIN must be exactly 6 digits"),
      amount: z.number().positive(),
      currency: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Hash the provided PIN
      const salt = `tourismpay-pin-${ctx.user.id}`;
      const encoder = new TextEncoder();
      const data = encoder.encode(salt + input.pin);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const pinHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      // Find the stored PIN enrollment (aaguid = 'pin' as type discriminator)
      const [enrollment] = await db
        .select()
        .from(biometricEnrollments)
        .where(and(
          eq(biometricEnrollments.userId, String(ctx.user.id)),
          eq(biometricEnrollments.aaguid, "pin"),
          eq(biometricEnrollments.isActive, true),
        ));
      if (!enrollment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No PIN set. Please set up a PIN first." });
      }
      // Check PIN lockout (exponential backoff: tier 0=15min, tier 1=1hr, tier 2+=24hr)
      const lockoutKey = String(ctx.user.id);
      // Check in-memory cache first for speed
      const lockoutEntry = await getPinLockout(lockoutKey);
      if (lockoutEntry && lockoutEntry.lockedUntil > Date.now()) {
        const remainingMs = lockoutEntry.lockedUntil - Date.now();
        const remainingMin = Math.ceil(remainingMs / 60_000);
        // Determine current tier from DB to include in error message
        const latestLockout = await db
          .select()
          .from(pinLockoutHistory)
          .where(and(eq(pinLockoutHistory.userId, lockoutKey), eq(pinLockoutHistory.resolved, false)))
          .orderBy(desc(pinLockoutHistory.lockedAt))
          .limit(1);
        const tier = latestLockout[0]?.tier ?? 0;
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `PIN locked (Tier ${tier + 1}). Try again in ${remainingMin} minute${remainingMin === 1 ? '' : 's'}.`,
          cause: { tier, unlocksAt: lockoutEntry.lockedUntil, remainingMs },
        });
      }
      if (enrollment.credentialId !== pinHash) {
        // Track failed attempt
        const current = (await getPinLockout(lockoutKey)) ?? { failedAttempts: 0, lockedUntil: 0 };
        const newAttempts = current.failedAttempts + 1;
        if (newAttempts >= PIN_MAX_ATTEMPTS) {
          // Determine next tier from DB (count unresolved lockout records)
          const priorLockouts = await db
            .select()
            .from(pinLockoutHistory)
            .where(eq(pinLockoutHistory.userId, lockoutKey));
          const nextTier = priorLockouts.length; // 0-indexed: 0=first lockout, 1=second, etc.
          const lockoutMs = getPinLockoutMs(nextTier);
          const lockedUntil = Date.now() + lockoutMs;
          const unlocksAtSec = Math.floor(lockedUntil / 1000);
          await setPinLockout(lockoutKey, { failedAttempts: newAttempts, lockedUntil });
          // Persist lockout event to DB for tier tracking across server restarts
          db.insert(pinLockoutHistory).values({
            id: crypto.randomUUID(),
            userId: lockoutKey,
            tier: nextTier,
            lockedAt: Math.floor(Date.now() / 1000),
            unlocksAt: unlocksAtSec,
            failedAttempts: newAttempts,
            resolved: false,
          }).catch(() => {});
          const tierLabel = getPinLockoutLabel(nextTier);
          // Notify user about lockout with tier-specific message (fire-and-forget)
          createUserNotification({
            userId: ctx.user.id,
            category: "system",
            title: `\uD83D\uDD12 Transaction PIN Locked (Tier ${nextTier + 1})`,
            content: `Your transaction PIN has been locked for ${tierLabel} after ${PIN_MAX_ATTEMPTS} consecutive failed attempts. ` +
              (nextTier > 0 ? `This is lockout #${nextTier + 1} — repeated failures increase the lockout duration. ` : '') +
              `If this wasn't you, please contact support immediately. ` +
              `You can reset your PIN via Settings \u2192 Biometric Security.`,
            actionUrl: "/settings/biometric",
            actionLabel: "Manage Security",
          }).catch(() => {});
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `PIN locked for ${tierLabel} after ${PIN_MAX_ATTEMPTS} failed attempts (Tier ${nextTier + 1}). A notification has been sent.`,
          });
        } else {
          await setPinLockout(lockoutKey, { failedAttempts: newAttempts, lockedUntil: 0 });
          const attemptsLeft = PIN_MAX_ATTEMPTS - newAttempts;
          // Log failed attempt to audit trail (fire-and-forget)
          createAuditLog({
            actorId: ctx.user.id,
            actorName: ctx.user.name || String(ctx.user.id),
            action: "biometric.pinFailed",
            entityType: "biometric_pin",
            entityId: String(ctx.user.id),
            after: { failedAttempts: newAttempts, attemptsLeft, amount: input.amount, currency: input.currency },
          }).catch(() => {});
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: `Incorrect PIN. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining before lockout.`,
          });
        }
      }
      // Successful — reset lockout counter
      await deletePinLockout(lockoutKey);
      // Issue a one-time high-value token (same mechanism as biometric)
      const token = crypto.randomUUID();
      const expiresAt = Date.now() + 60_000;
      _highValueTokens.set(token, {
        userId: String(ctx.user.id),
        amount: input.amount,
        currency: input.currency,
        expiresAt,
      });
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "biometric.pinVerified",
        entityType: "wallet_transaction",
        entityId: token,
        after: { amount: input.amount, currency: input.currency },
      });
      return { token, expiresAt };
    }),

  // Change PIN — requires current PIN verification before updating to new PIN
  changePin: protectedProcedure
    .input(z.object({
      currentPin: z.string().length(6).regex(/^\d{6}$/, "Current PIN must be exactly 6 digits"),
      newPin: z.string().length(6).regex(/^\d{6}$/, "New PIN must be exactly 6 digits"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      if (input.currentPin === input.newPin) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "New PIN must differ from current PIN." });
      }
      const salt = `tourismpay-pin-${ctx.user.id}`;
      const encoder = new TextEncoder();
      // Hash current PIN
      const currentData = encoder.encode(salt + input.currentPin);
      const currentHashBuffer = await crypto.subtle.digest("SHA-256", currentData);
      const currentHash = Array.from(new Uint8Array(currentHashBuffer))
        .map((b) => b.toString(16).padStart(2, "0")).join("");
      // Find existing PIN enrollment
      const [enrollment] = await db
        .select()
        .from(biometricEnrollments)
        .where(and(
          eq(biometricEnrollments.userId, String(ctx.user.id)),
          eq(biometricEnrollments.aaguid, "pin"),
          eq(biometricEnrollments.isActive, true),
        ));
      if (!enrollment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No PIN set. Please set up a PIN first." });
      }
      if (enrollment.credentialId !== currentHash) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Current PIN is incorrect." });
      }
      // Hash new PIN
      const newData = encoder.encode(salt + input.newPin);
      const newHashBuffer = await crypto.subtle.digest("SHA-256", newData);
      const newHash = Array.from(new Uint8Array(newHashBuffer))
        .map((b) => b.toString(16).padStart(2, "0")).join("");
      await db
        .update(biometricEnrollments)
        .set({ credentialId: newHash, lastUsedAt: Math.floor(Date.now() / 1000) })
        .where(eq(biometricEnrollments.id, enrollment.id));
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "biometric.pinSet",
        entityType: "biometric_enrollment",
        entityId: String(ctx.user.id),
        after: { action: "pin_changed" },
      });
      return { success: true };
    }),

  // Reset PIN — admin-only: revokes PIN enrollment for a given userId
  resetPin: adminProcedure
    .input(z.object({
      userId: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const result = await db
        .update(biometricEnrollments)
        .set({ isActive: false })
        .where(and(
          eq(biometricEnrollments.userId, input.userId),
          eq(biometricEnrollments.aaguid, "pin"),
        ));
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "biometric.revoked",
        entityType: "biometric_enrollment",
        entityId: input.userId,
        after: { action: "pin_reset_by_admin", targetUserId: input.userId },
      });
      return { success: true };
    }),

  // ── getPinLockoutStatus ────────────────────────────────────────────────────
  getPinLockoutStatus: protectedProcedure.query(async ({ ctx }) => {
    const lockoutKey = String(ctx.user.id);
    const entry = await getPinLockout(lockoutKey);
    // Fetch lockout history from DB for tier information
    const db = await getDb();
    const history = db ? await db
      .select()
      .from(pinLockoutHistory)
      .where(eq(pinLockoutHistory.userId, lockoutKey))
      .orderBy(desc(pinLockoutHistory.lockedAt))
      .limit(10) : [];
    const latestUnresolved = history.find((h) => !h.resolved);
    const totalLockouts = history.length;
    const nextTier = totalLockouts; // next lockout will be at this tier
    const nextLockoutDuration = getPinLockoutLabel(nextTier);
    if (!entry || entry.lockedUntil <= Date.now()) {
      // If in-memory says unlocked, also mark DB record as resolved
      if (latestUnresolved && db) {
        db.update(pinLockoutHistory)
          .set({ resolved: true })
          .where(eq(pinLockoutHistory.id, latestUnresolved.id))
          .catch(() => {});
      }
      return {
        isLocked: false,
        lockedUntilMs: null as number | null,
        remainingMs: 0,
        failedAttempts: entry?.failedAttempts ?? 0,
        currentTier: latestUnresolved?.tier ?? null,
        totalLockouts,
        nextLockoutDuration,
      };
    }
    return {
      isLocked: true,
      lockedUntilMs: entry.lockedUntil,
      remainingMs: Math.max(0, entry.lockedUntil - Date.now()),
      failedAttempts: entry.failedAttempts,
      currentTier: latestUnresolved?.tier ?? 0,
      totalLockouts,
      nextLockoutDuration: getPinLockoutLabel(nextTier),
    };
  }),

  // ── revokeAll ─────────────────────────────────────────────────────────────
  revokeAll: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    await db
      .update(biometricEnrollments)
      .set({ isActive: false })
      .where(eq(biometricEnrollments.userId, String(ctx.user.id)));
    await createAuditLog({
      actorId: ctx.user.id,
      actorName: ctx.user.name || String(ctx.user.id),
      action: "biometric.revoked",
      entityType: "biometric_enrollment",
      entityId: String(ctx.user.id),
      after: { action: "revoke_all_devices" },
    });
    return { success: true };
  }),

  // ── renewEnrollment ───────────────────────────────────────────────────────
  renewEnrollment: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const NINETY_DAYS_S = 90 * 24 * 60 * 60;
      const newExpiresAt = Math.floor(Date.now() / 1000) + NINETY_DAYS_S;
      const [enrollment] = await db
        .select()
        .from(biometricEnrollments)
        .where(
          and(
            eq(biometricEnrollments.id, input.id),
            eq(biometricEnrollments.userId, String(ctx.user.id)),
            eq(biometricEnrollments.isActive, true),
          )
        )
        .limit(1);
      if (!enrollment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Enrollment not found or already revoked" });
      }
      await db
        .update(biometricEnrollments)
        .set({ expiresAt: newExpiresAt })
        .where(eq(biometricEnrollments.id, input.id));
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "biometric.enrolled",
        entityType: "biometric_enrollment",
        entityId: String(input.id),
        after: { action: "renewed", newExpiresAt },
      });
      return { success: true, newExpiresAt };
    }),

  // ── getPinHistory ─────────────────────────────────────────────────────────
  // Returns the last N PIN-related audit events for the current user
  getPinHistory: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const { auditLogs } = await import("../../drizzle/schema");
      const { desc, inArray } = await import("drizzle-orm");
      const rows = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.actorId, ctx.user.id),
            inArray(auditLogs.action, [
              "biometric.pinVerified",
              "biometric.pinFailed",
              "biometric.pinSet",
              "biometric.pinLocked",
            ]),
          )
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(input.limit);
      return rows.map((r) => ({
        id: r.id,
        action: r.action as string,
        createdAt: r.createdAt,
        after: r.after as Record<string, unknown> | null,
      }));
    }),

  // Returns daily usage counts for a credential over the last N days (for sparkline chart)
  getSignCountTrend: protectedProcedure
    .input(z.object({
      credentialId: z.string(),
      days: z.number().int().min(7).max(90).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const { auditLogs } = await import("../../drizzle/schema");
      const { gte } = await import("drizzle-orm");
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const rows = await db
        .select({ createdAt: auditLogs.createdAt })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.actorId, ctx.user.id),
            eq(auditLogs.action, "biometric.verified"),
            eq(auditLogs.entityId, input.credentialId),
            gte(auditLogs.createdAt, since),
          )
        )
        .orderBy(auditLogs.createdAt);

      // Bucket by day
      const buckets: Record<string, number> = {};
      for (const row of rows) {
        const day = row.createdAt.toISOString().slice(0, 10);
        buckets[day] = (buckets[day] ?? 0) + 1;
      }
      // Build complete series
      const series: { date: string; count: number }[] = [];
      for (let i = input.days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const day = d.toISOString().slice(0, 10);
        series.push({ date: day, count: buckets[day] ?? 0 });
      }
      return series;
    }),
});
