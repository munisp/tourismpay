import { z } from "zod";
import { protectedProcedure, merchantProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql, eq, desc, and, lt } from "drizzle-orm";
import { bnplPlans, bnplInstalments } from "../../drizzle/schema";

export const bnplRouter = router({
  // Create a new BNPL instalment plan
  createPlan: protectedProcedure
    .input(z.object({
      hotelId: z.string(),
      totalAmount: z.number().min(10000).max(50000000),
      currency: z.string().default("NGN"),
      instalments: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(6), z.literal(12)]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const riskPremium = 2.0;
      const totalWithPremium = input.totalAmount * (1 + riskPremium / 100);
      const instalmentAmount = Math.round((totalWithPremium / input.instalments) * 100) / 100;
      const planId = `BNPL-${Date.now()}`;
      const now = new Date();
      const firstDue = new Date(now);
      firstDue.setMonth(firstDue.getMonth() + 1);
      await db.execute(sql`
        INSERT INTO bnpl_plans (id, tourist_id, hotel_id, total_amount, currency, instalments,
          instalment_amount, paid_count, status, risk_premium_pct, created_at, next_due_date)
        VALUES (${planId}, ${String(ctx.user.id)}, ${input.hotelId}, ${input.totalAmount},
          ${input.currency}, ${input.instalments}, ${instalmentAmount}, 0, 'active',
          ${riskPremium}, NOW(), ${firstDue.toISOString()})
      `);
      for (let i = 1; i <= input.instalments; i++) {
        const dueDate = new Date(now);
        dueDate.setMonth(dueDate.getMonth() + i);
        await db.execute(sql`
          INSERT INTO bnpl_instalments (id, plan_id, number, amount, currency, due_date, status)
          VALUES (${planId + "-I" + String(i).padStart(2,"0")}, ${planId}, ${i},
            ${instalmentAmount}, ${input.currency}, ${dueDate.toISOString()}, 'pending')
        `);
      }
      return { planId, instalmentAmount, firstDueDate: firstDue, message: `BNPL plan created. ${input.instalments} instalments of ${input.currency} ${instalmentAmount.toFixed(2)} each.` };
    }),

  // Get plan details with instalments
  getPlan: protectedProcedure
    .input(z.object({ planId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await db.execute(sql`SELECT * FROM bnpl_plans WHERE id = ${input.planId} LIMIT 1`);
      if (!(rows as any[]).length) throw new TRPCError({ code: "NOT_FOUND", message: "BNPL plan not found" });
      const plan = (rows as any[])[0];
      const instalments = await db.execute(sql`SELECT * FROM bnpl_instalments WHERE plan_id = ${input.planId} ORDER BY number`);
      return { ...plan, instalments: instalments as any[] };
    }),

  // List plans for the current user
  myPlans: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.execute(sql`
      SELECT * FROM bnpl_plans WHERE tourist_id = ${String(ctx.user.id)} ORDER BY created_at DESC LIMIT 50
    `);
    return rows as any[];
  }),

  // List plans for a hotel (merchant access)
  hotelPlans: merchantProcedure
    .input(z.object({ hotelId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.execute(sql`
        SELECT * FROM bnpl_plans WHERE hotel_id = ${input.hotelId} ORDER BY created_at DESC LIMIT 100
      `);
      return rows as any[];
    }),

  // Pay an instalment
  payInstalment: protectedProcedure
    .input(z.object({ planId: z.string(), instalmentId: z.string(), paymentRef: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.execute(sql`
        UPDATE bnpl_instalments SET status = 'paid', paid_at = NOW(), payment_ref = ${input.paymentRef}
        WHERE id = ${input.instalmentId} AND plan_id = ${input.planId} AND status = 'pending'
      `);
      await db.execute(sql`
        UPDATE bnpl_plans SET paid_count = paid_count + 1,
          status = CASE WHEN paid_count + 1 >= instalments THEN 'completed' ELSE 'active' END,
          next_due_date = (SELECT MIN(due_date) FROM bnpl_instalments WHERE plan_id = ${input.planId} AND status = 'pending')
        WHERE id = ${input.planId}
      `);
      return { success: true, message: "Instalment paid successfully" };
    }),

  // Cancel a plan
  cancelPlan: protectedProcedure
    .input(z.object({ planId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.execute(sql`UPDATE bnpl_plans SET status = 'cancelled' WHERE id = ${input.planId} AND tourist_id = ${String(ctx.user.id)} AND status = 'active'`);
      await db.execute(sql`UPDATE bnpl_instalments SET status = 'cancelled' WHERE plan_id = ${input.planId} AND status = 'pending'`);
      return { success: true };
    }),

  // Admin: list all overdue instalments
  overdueInstalments: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    await db.execute(sql`UPDATE bnpl_instalments SET status = 'overdue' WHERE status = 'pending' AND due_date < NOW()`);
    const rows = await db.execute(sql`
      SELECT i.*, p.tourist_id, p.hotel_id FROM bnpl_instalments i
      JOIN bnpl_plans p ON p.id = i.plan_id WHERE i.status = 'overdue' ORDER BY i.due_date ASC LIMIT 100
    `);
    return rows as any[];
  }),
});
