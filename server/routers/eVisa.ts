import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";

export const eVisaRouter = router({
  // Get visa fee for nationality and type
  getVisaFee: protectedProcedure
    .input(z.object({ nationality: z.string().length(2), visaType: z.enum(["tourist", "business", "transit"]) }))
    .query(async ({ input }) => {
      // Nigeria e-Visa fee schedule (USD)
      const fees: Record<string, Record<string, number>> = {
        tourist: { default: 100, US: 160, GB: 120, CA: 120, AU: 120, IN: 50, NG: 0 },
        business: { default: 150, US: 200, GB: 180, CA: 180, AU: 180, IN: 80, NG: 0 },
        transit: { default: 50, default_all: 50 },
      };
      const feeMap = fees[input.visaType] ?? fees.tourist;
      const feeUsd = feeMap[input.nationality] ?? feeMap.default ?? 100;
      return { nationality: input.nationality, visaType: input.visaType, feeUsd, currency: "USD", processingDays: input.visaType === "transit" ? 1 : 3 };
    }),

  // Initiate e-Visa payment
  initiatePayment: protectedProcedure
    .input(z.object({
      passportNumber: z.string().min(6),
      nationality: z.string().length(2),
      visaType: z.enum(["tourist", "business", "transit"]),
      durationDays: z.number().int().min(1).max(90),
      feeAmount: z.number().positive(),
      currency: z.string().default("USD"),
      idempotencyKey: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const idempotencyKey = input.idempotencyKey ?? `evisa-${ctx.user.id}-${input.passportNumber}-${Date.now()}`;
      // Check idempotency
      const existing = await db.execute(sql`SELECT id FROM evisa_payments WHERE idempotency_key = ${idempotencyKey} LIMIT 1`);
      if ((existing as any[]).length) return { paymentId: (existing as any[])[0].id, status: "existing", message: "Duplicate request" };
      const paymentId = `EVISA-${Date.now()}`;
      await db.execute(sql`
        INSERT INTO evisa_payments (id, tourist_id, passport_number, nationality, visa_type, duration_days,
          fee_amount, currency, status, idempotency_key, created_at)
        VALUES (${paymentId}, ${String(ctx.user.id)}, ${input.passportNumber}, ${input.nationality},
          ${input.visaType}, ${input.durationDays}, ${input.feeAmount}, ${input.currency},
          'initiated', ${idempotencyKey}, NOW())
      `);
      return { paymentId, status: "initiated", message: "e-Visa payment initiated. Complete payment to proceed with application." };
    }),

  // Process payment (called after wallet deduction)
  processPayment: protectedProcedure
    .input(z.object({ paymentId: z.string(), walletTransactionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.execute(sql`
        UPDATE evisa_payments SET status = 'processing', wallet_transaction_id = ${input.walletTransactionId}, processed_at = NOW()
        WHERE id = ${input.paymentId} AND tourist_id = ${String(ctx.user.id)} AND status = 'initiated'
      `);
      // In production: call NIS API here to submit application
      const nisRef = `NIS-${Date.now()}`;
      await db.execute(sql`UPDATE evisa_payments SET nis_reference_id = ${nisRef} WHERE id = ${input.paymentId}`);
      return { success: true, nisReferenceId: nisRef, message: "Payment processed. e-Visa application submitted to Nigeria Immigration Service." };
    }),

  // Get payment status
  getPaymentStatus: protectedProcedure
    .input(z.object({ paymentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await db.execute(sql`SELECT * FROM evisa_payments WHERE id = ${input.paymentId} AND tourist_id = ${String(ctx.user.id)} LIMIT 1`);
      if (!(rows as any[]).length) throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" });
      return (rows as any[])[0];
    }),

  // My e-Visa history
  myPayments: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.execute(sql`SELECT * FROM evisa_payments WHERE tourist_id = ${String(ctx.user.id)} ORDER BY created_at DESC LIMIT 20`);
    return rows as any[];
  }),

  // Admin: list all e-Visa payments
  allPayments: adminProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().default(100) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const statusFilter = input.status ? sql`WHERE status = ${input.status}` : sql``;
      const rows = await db.execute(sql`SELECT * FROM evisa_payments ${statusFilter} ORDER BY created_at DESC LIMIT ${input.limit}`);
      return rows as any[];
    }),
});
