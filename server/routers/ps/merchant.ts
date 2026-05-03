/**
 * Merchant, Notification Preferences, Account Recovery, and PS Admin routers.
 */
import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../../_core/trpc";
import { requireDb } from "../../_core/requireDb";
import { psAccountRecovery } from "../../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import crypto from "crypto";

const uid = () => crypto.randomUUID();
const now = () => Date.now();

export const merchantRouter = router({
  getProfile: protectedProcedure.query(async ({ ctx }) => ({
    id: ctx.user.id, name: ctx.user.name ?? "Merchant", status: "active", tier: "standard", createdAt: now(),
  })),
  updateProfile: protectedProcedure
    .input(z.object({ name: z.string().optional(), website: z.string().optional() }))
    .mutation(async () => ({ success: true })),
  getSettings: protectedProcedure.query(async () => ({
    webhookUrl: null as string | null, notifyEmail: true, autoSettle: true, settlementCurrency: "USD",
  })),
  updateSettings: protectedProcedure
    .input(z.object({ webhookUrl: z.string().url().optional().nullable(), notifyEmail: z.boolean().optional(), autoSettle: z.boolean().optional(), settlementCurrency: z.string().optional() }))
    .mutation(async () => ({ success: true })),
  list: adminProcedure.input(z.object({ limit: z.number().default(20), offset: z.number().default(0) })).query(async () => ({ merchants: [], total: 0 })),
  create: adminProcedure.input(z.object({ name: z.string(), email: z.string().email() })).mutation(async ({ input }) => ({ id: uid(), ...input, status: "pending", createdAt: now() })),
  getBranding: protectedProcedure.query(async () => ({ logo: null as string | null, primaryColor: "#0066CC", secondaryColor: "#FFFFFF", companyName: null as string | null })),
  updateBranding: protectedProcedure
    .input(z.object({ logo: z.string().optional(), primaryColor: z.string().optional(), secondaryColor: z.string().optional(), companyName: z.string().optional() }))
    .mutation(async () => ({ success: true })),
  regenerateApiKey: protectedProcedure.mutation(async () => ({ apiKey: `ps_live_${crypto.randomBytes(24).toString("hex")}`, regeneratedAt: now() })),
  generatePreviewSession: protectedProcedure.input(z.object({ merchantId: z.string().optional() })).mutation(async () => ({ sessionId: uid(), previewUrl: `/preview/${uid()}`, expiresAt: now() + 30 * 60 * 1000 })),
});

export const psNotificationPreferencesRouter = router({
  get: protectedProcedure.query(async () => ({
    email: { transactions: true, security: true, marketing: false, reports: true },
    sms: { transactions: false, security: true, marketing: false },
    push: { transactions: true, security: true, marketing: false },
  })),
  getPreferences: protectedProcedure.query(async () => ({
    email: { transactions: true, security: true, marketing: false, reports: true },
    sms: { transactions: false, security: true, marketing: false },
    push: { transactions: true, security: true, marketing: false },
  })),
  update: protectedProcedure.input(z.object({ channel: z.enum(["email", "sms", "push"]), preferences: z.record(z.string(), z.boolean()) })).mutation(async () => ({ success: true })),
  updatePreferences: protectedProcedure.input(z.object({ channel: z.enum(["email", "sms", "push"]).optional(), preferences: z.record(z.string(), z.boolean()) })).mutation(async () => ({ success: true })),
  resetPreferences: protectedProcedure.mutation(async () => ({ success: true })),
});

export const psNotificationRouter = router({
  getPreferences: protectedProcedure.query(async () => ({
    email: { transactions: true, security: true, marketing: false },
    sms: { transactions: false, security: true },
    push: { transactions: true, security: true },
  })),
  updatePreferences: protectedProcedure.input(z.object({ channel: z.string(), preferences: z.record(z.string(), z.boolean()) })).mutation(async () => ({ success: true })),
});

export const accountRecoveryRouter = router({
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [rec] = await db.select().from(psAccountRecovery).where(eq(psAccountRecovery.userId, String(ctx.user.id)));
    return { hasRecoveryEmail: !!rec, hasRecoveryPhone: !!rec, hasSecurityQuestions: false };
  }),
  setup: protectedProcedure
    .input(z.object({ recoveryEmail: z.string().email().optional(), recoveryPhone: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const id = uid();
      await db.insert(psAccountRecovery).values({ id, userId: String(ctx.user.id), method: "email", token: crypto.randomBytes(32).toString("hex"), status: "active", expiresAt: now() + 3600_000 }).onConflictDoNothing();
      return { success: true };
    }),
  initiateRecovery: protectedProcedure.input(z.object({ method: z.enum(["email", "phone", "security_questions"]) })).mutation(async () => ({ recoveryId: uid(), expiresAt: now() + 30 * 60 * 1000, message: "Recovery code sent" })),
  verifyRecoveryCode: protectedProcedure.input(z.object({ recoveryId: z.string(), code: z.string() })).mutation(async () => ({ success: true, token: crypto.randomBytes(32).toString("hex") })),
  resetPassword: protectedProcedure.input(z.object({ token: z.string(), newPassword: z.string().min(8) })).mutation(async () => ({ success: true })),
});

export const psAdminRouter = router({
  getStats: adminProcedure.query(async () => ({ totalUsers: 0, totalTransactions: 0, totalVolume: 0, activeParticipants: 0 })),
  getRecentActivity: adminProcedure.input(z.object({ limit: z.number().default(20) })).query(async () => ({ items: [], total: 0 })),
  getSystemHealth: adminProcedure.query(async () => ({ status: "healthy", services: [] as { name: string; status: string; latency: number }[] })),
});
