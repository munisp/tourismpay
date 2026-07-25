/**
 * sprint27Export.ts — Audit log export router (trpc.sprint27Export.*)
 * Powers the AuditTrailPage.tsx export and stats features.
 */
import { router, adminProcedure } from '../_core/trpc';
import { z } from 'zod';
import { getDb } from '../db';
import { sql, desc, gte, and, eq } from 'drizzle-orm';

export const sprint27ExportRouter = router({
  auditLog: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(500).default(50),
      offset: z.number().min(0).default(0),
      action: z.string().optional(),
      userId: z.string().optional(),
      resource: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      try {
        const { auditLogs } = await import('../../drizzle/schema');
        const filters: any[] = [];
        if (input.action) filters.push(eq(auditLogs.action, input.action));
        if (input.userId) filters.push(eq(auditLogs.userId, input.userId));
        if (input.resource) filters.push(eq(auditLogs.resource, input.resource));
        if (input.dateFrom) filters.push(gte(auditLogs.createdAt, new Date(input.dateFrom)));

        const items = await db.select().from(auditLogs)
          .where(filters.length > 0 ? and(...filters) : undefined)
          .orderBy(desc(auditLogs.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(auditLogs)
          .where(filters.length > 0 ? and(...filters) : undefined);

        return { items, total: Number(count) };
      } catch {
        return { items: [], total: 0 };
      }
    }),

  auditStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, today: 0, byAction: [], byUser: [], byResource: [] };
    try {
      const { auditLogs } = await import('../../drizzle/schema');
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(auditLogs);
      const [{ todayCount }] = await db.select({ todayCount: sql<number>`count(*)` }).from(auditLogs)
        .where(gte(auditLogs.createdAt, today));

      const byAction = await db.select({
        action: auditLogs.action,
        count: sql<number>`count(*)`,
      }).from(auditLogs)
        .groupBy(auditLogs.action)
        .orderBy(sql`count(*) desc`)
        .limit(10);

      const byResource = await db.select({
        resource: auditLogs.resource,
        count: sql<number>`count(*)`,
      }).from(auditLogs)
        .groupBy(auditLogs.resource)
        .orderBy(sql`count(*) desc`)
        .limit(10);

      return {
        total: Number(total),
        today: Number(todayCount),
        byAction: byAction.map(r => ({ action: r.action, count: Number(r.count) })),
        byUser: [],
        byResource: byResource.map(r => ({ resource: r.resource, count: Number(r.count) })),
      };
    } catch {
      return { total: 0, today: 0, byAction: [], byUser: [], byResource: [] };
    }
  }),
});
