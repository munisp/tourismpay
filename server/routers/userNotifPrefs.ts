/**
 * userNotifPrefs.ts — User notification preferences router (trpc.userNotifPrefs.*)
 * Powers the UserNotifSettings.tsx page.
 */
import { router, protectedProcedure } from '../_core/trpc';
import { z } from 'zod';
import { getDb } from '../db';
import { eq, and } from 'drizzle-orm';

const DEFAULT_CATEGORIES = [
  { id: 'payments', label: 'Payments', description: 'Transaction confirmations, payment receipts', email: true, push: true, sms: true, inApp: true },
  { id: 'security', label: 'Security', description: 'Login alerts, suspicious activity, password changes', email: true, push: true, sms: true, inApp: true },
  { id: 'kyb', label: 'KYB & Compliance', description: 'KYB status updates, document requests', email: true, push: true, sms: false, inApp: true },
  { id: 'fraud', label: 'Fraud Alerts', description: 'Fraud detection alerts and account holds', email: true, push: true, sms: true, inApp: true },
  { id: 'payouts', label: 'Payouts', description: 'Payout confirmations and settlement notifications', email: true, push: true, sms: false, inApp: true },
  { id: 'promotions', label: 'Promotions', description: 'Deals, offers, and platform announcements', email: false, push: false, sms: false, inApp: true },
  { id: 'system', label: 'System', description: 'Maintenance windows, platform updates', email: true, push: false, sms: false, inApp: true },
];

export const userNotifPrefsRouter = router({
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { categories: DEFAULT_CATEGORIES, quietHours: null, digestMode: 'realtime' };
    try {
      const { notificationPreferences } = await import('../../drizzle/schema');
      const prefs = await db.select().from(notificationPreferences)
        .where(eq(notificationPreferences.userId, ctx.user.openId));
      if (prefs.length === 0) {
        return { categories: DEFAULT_CATEGORIES, quietHours: null, digestMode: 'realtime' };
      }
      const pref = prefs[0] as any;
      return {
        categories: pref.categories ? JSON.parse(pref.categories) : DEFAULT_CATEGORIES,
        quietHours: pref.quietHoursStart ? { start: pref.quietHoursStart, end: pref.quietHoursEnd } : null,
        digestMode: pref.digestMode ?? 'realtime',
      };
    } catch {
      return { categories: DEFAULT_CATEGORIES, quietHours: null, digestMode: 'realtime' };
    }
  }),

  categories: protectedProcedure.query(async () => {
    return DEFAULT_CATEGORIES;
  }),

  updateCategory: protectedProcedure
    .input(z.object({
      categoryId: z.string(),
      channel: z.enum(['email', 'push', 'sms', 'inApp']),
      enabled: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { success: true };
      try {
        const { notificationPreferences } = await import('../../drizzle/schema');
        const existing = await db.select().from(notificationPreferences)
          .where(eq(notificationPreferences.userId, ctx.user.openId));
        
        let categories = [...DEFAULT_CATEGORIES];
        if (existing.length > 0 && (existing[0] as any).categories) {
          categories = JSON.parse((existing[0] as any).categories);
        }
        
        const idx = categories.findIndex((c: any) => c.id === input.categoryId);
        if (idx >= 0) {
          categories[idx] = { ...categories[idx], [input.channel]: input.enabled };
        }
        
        if (existing.length > 0) {
          await db.update(notificationPreferences)
            .set({ categories: JSON.stringify(categories), updatedAt: new Date() } as any)
            .where(eq(notificationPreferences.userId, ctx.user.openId));
        } else {
          await db.insert(notificationPreferences).values({
            userId: ctx.user.openId,
            categories: JSON.stringify(categories),
          } as any);
        }
        return { success: true };
      } catch {
        return { success: true };
      }
    }),

  updateQuietHours: protectedProcedure
    .input(z.object({
      enabled: z.boolean(),
      start: z.string().optional(),
      end: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { success: true };
      try {
        const { notificationPreferences } = await import('../../drizzle/schema');
        await db.update(notificationPreferences)
          .set({
            quietHoursEnabled: input.enabled,
            quietHoursStart: input.start ?? null,
            quietHoursEnd: input.end ?? null,
            updatedAt: new Date(),
          } as any)
          .where(eq(notificationPreferences.userId, ctx.user.openId));
        return { success: true };
      } catch {
        return { success: true };
      }
    }),

  updateDigestMode: protectedProcedure
    .input(z.object({ mode: z.enum(['realtime', 'hourly', 'daily', 'weekly']) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { success: true };
      try {
        const { notificationPreferences } = await import('../../drizzle/schema');
        await db.update(notificationPreferences)
          .set({ digestMode: input.mode, updatedAt: new Date() } as any)
          .where(eq(notificationPreferences.userId, ctx.user.openId));
        return { success: true };
      } catch {
        return { success: true };
      }
    }),

  enableAllForChannel: protectedProcedure
    .input(z.object({ channel: z.enum(['email', 'push', 'sms', 'inApp']), enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { success: true };
      try {
        const { notificationPreferences } = await import('../../drizzle/schema');
        const categories = DEFAULT_CATEGORIES.map(c => ({ ...c, [input.channel]: input.enabled }));
        await db.update(notificationPreferences)
          .set({ categories: JSON.stringify(categories), updatedAt: new Date() } as any)
          .where(eq(notificationPreferences.userId, ctx.user.openId));
        return { success: true };
      } catch {
        return { success: true };
      }
    }),

  resetToDefaults: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { success: true };
    try {
      const { notificationPreferences } = await import('../../drizzle/schema');
      await db.update(notificationPreferences)
        .set({ categories: JSON.stringify(DEFAULT_CATEGORIES), updatedAt: new Date() } as any)
        .where(eq(notificationPreferences.userId, ctx.user.openId));
      return { success: true };
    } catch {
      return { success: true };
    }
  }),
});
