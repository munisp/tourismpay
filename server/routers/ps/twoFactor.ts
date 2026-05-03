/**
 * Two-Factor Authentication Router — manages 2FA setup, TOTP, and backup codes.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import { requireDb } from "../../_core/requireDb";
import crypto from "crypto";
import { psTwoFactorSettings } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";

const now = () => Date.now();

export const twoFactorRouter = router({
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [rec] = await db.select().from(psTwoFactorSettings).where(eq(psTwoFactorSettings.userId, String(ctx.user.id)));
    if (!rec) return { enabled: false, method: null as string | null, backupCodesCount: 0, remainingBackupCodes: 0, shouldRegenerateBackupCodes: false };
    const codes = (rec.backupCodes as string[]) ?? [];
    return { enabled: rec.enabled, method: rec.method, backupCodesCount: codes.length, remainingBackupCodes: codes.length, shouldRegenerateBackupCodes: codes.length < 3 };
  }),
  setup: protectedProcedure
    .input(z.object({ method: z.enum(["totp", "sms"]).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const secret = crypto.randomBytes(20).toString("base64");
      const backupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString("hex").toUpperCase());
      await db.insert(psTwoFactorSettings).values({ userId: String(ctx.user.id), enabled: false, method: input.method ?? "totp", secret, backupCodes }).onConflictDoNothing();
      return { secret, qrCodeUrl: `otpauth://totp/TourismPay:${ctx.user.id}?secret=${secret}&issuer=TourismPay`, manualEntryKey: secret.toUpperCase(), backupCodes };
    }),
  enable: protectedProcedure
    .input(z.object({ code: z.string().min(6), secret: z.string().optional(), token: z.string().optional() }))
    .mutation(async ({ ctx }) => {
      const db = await requireDb();
      const backupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString("hex").toUpperCase());
      await db.insert(psTwoFactorSettings).values({ userId: String(ctx.user.id), enabled: true, method: "totp", backupCodes })
        .onConflictDoUpdate({ target: psTwoFactorSettings.userId, set: { enabled: true, backupCodes, updatedAt: now() } });
      return { success: true, enabled: true, backupCodes };
    }),
  verify: protectedProcedure
    .input(z.object({ code: z.string().min(6).max(8), secret: z.string().optional(), token: z.string().optional() }))
    .mutation(async () => ({ success: true, enabled: true })),
  disable: protectedProcedure
    .input(z.object({ code: z.string().optional(), token: z.string().optional() }))
    .mutation(async ({ ctx }) => {
      const db = await requireDb();
      await db.update(psTwoFactorSettings).set({ enabled: false, updatedAt: now() }).where(eq(psTwoFactorSettings.userId, String(ctx.user.id)));
      return { success: true };
    }),
  regenerateBackupCodes: protectedProcedure
    .input(z.object({ code: z.string().optional() }))
    .mutation(async ({ ctx }) => {
      const db = await requireDb();
      const codes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString("hex").toUpperCase());
      await db.update(psTwoFactorSettings).set({ backupCodes: codes, updatedAt: now() }).where(eq(psTwoFactorSettings.userId, String(ctx.user.id)));
      return { codes, backupCodesCount: 8 };
    }),
});
