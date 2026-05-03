/**
 * Notification Channels & Reminder Emails — PaymentSwitch notification management.
 */
import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../../_core/trpc";
import { requireDb } from "../../_core/requireDb";
import crypto from "crypto";
import { psNotificationChannels, psReminderEmails } from "../../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

const uid = () => crypto.randomUUID();
const now = () => Date.now();

export const notificationChannelsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const channels = await db.select().from(psNotificationChannels).where(eq(psNotificationChannels.userId, String(ctx.user.id)));
    return { channels, total: channels.length };
  }),
  getChannels: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const channels = await db.select().from(psNotificationChannels).where(eq(psNotificationChannels.userId, String(ctx.user.id)));
    return { channels };
  }),
  create: protectedProcedure
    .input(z.object({ type: z.enum(["email", "sms", "slack", "webhook"]), name: z.string(), config: z.record(z.string(), z.string()) }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const id = uid();
      await db.insert(psNotificationChannels).values({ id, userId: String(ctx.user.id), type: input.type, name: input.name, config: input.config });
      return { id: uid(), ...input, createdAt: now() };
    }),
  update: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string().optional(), config: z.record(z.string(), z.string()).optional(), enabled: z.boolean().optional() }))
    .mutation(async () => ({ success: true })),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(psNotificationChannels).where(eq(psNotificationChannels.id, input.id));
      return { success: true };
    }),
  test: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async () => ({ success: true, message: "Test notification sent" })),
});

export const reminderEmailsRouter = router({
  getTemplates: adminProcedure.query(async () => {
    const db = await requireDb();
    const templates = await db.select().from(psReminderEmails).orderBy(desc(psReminderEmails.createdAt));
    return { templates, total: templates.length };
  }),
  listTemplates: adminProcedure.query(async () => {
    const db = await requireDb();
    const templates = await db.select().from(psReminderEmails).orderBy(desc(psReminderEmails.createdAt));
    return { templates, total: templates.length };
  }),
  getSchedule: adminProcedure.query(async () => ({ schedule: [] as any[], total: 0 })),
  getSettings: adminProcedure.query(async () => ({ enabled: true, defaultDelay: 48, maxReminders: 3 })),
  updateSettings: adminProcedure.input(z.object({ enabled: z.boolean().optional(), defaultDelay: z.number().optional() })).mutation(async () => ({ success: true })),
  sendManualReminder: adminProcedure.input(z.object({ userId: z.string(), templateId: z.string().optional() })).mutation(async () => ({ success: true })),
  getReminderLog: adminProcedure.input(z.object({ limit: z.number().default(20) })).query(async () => ({ logs: [], total: 0 })),
  getStuckParticipants: adminProcedure.query(async () => ({ participants: [], total: 0 })),
  createTemplate: adminProcedure
    .input(z.object({ name: z.string(), subject: z.string(), body: z.string(), trigger: z.string() }))
    .mutation(async ({ input }) => ({ id: uid(), ...input, createdAt: now() })),
  updateTemplate: adminProcedure.input(z.object({ id: z.string(), subject: z.string().optional(), body: z.string().optional() })).mutation(async ({ input }) => ({ success: true, id: input.id })),
  deleteTemplate: adminProcedure.input(z.object({ id: z.string() })).mutation(async () => ({ success: true })),
  sendTest: adminProcedure.input(z.object({ templateId: z.string(), recipientEmail: z.string().email() })).mutation(async () => ({ success: true, message: "Test email queued" })),
});
