import { z } from "zod";
import { protectedProcedure, publicProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";

export const diasporaGiftsRouter = router({
  // Send a gift (diaspora to Nigeria)
  sendGift: protectedProcedure
    .input(z.object({
      recipientEmail: z.string().email().optional(),
      recipientPhone: z.string().optional(),
      giftType: z.enum(["hotel_stay", "dining", "experience", "wallet_credit"]),
      establishmentId: z.string().optional(),
      amountNgn: z.number().min(5000).max(5000000),
      amountSenderCurrency: z.number().positive(),
      senderCurrency: z.string().length(3),
      exchangeRate: z.number().positive(),
      message: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      if (!input.recipientEmail && !input.recipientPhone) throw new TRPCError({ code: "BAD_REQUEST", message: "Either recipientEmail or recipientPhone is required" });
      const giftId = `GIFT-${Date.now()}`;
      const redemptionCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
      const senderName = ctx.user.name ?? "Anonymous";
      await db.execute(sql`
        INSERT INTO diaspora_gifts (id, sender_id, sender_name, recipient_email, recipient_phone,
          gift_type, establishment_id, amount_ngn, amount_sender_currency, sender_currency,
          exchange_rate, message, redemption_code, status, expires_at, created_at)
        VALUES (${giftId}, ${String(ctx.user.id)}, ${senderName}, ${input.recipientEmail ?? null},
          ${input.recipientPhone ?? null}, ${input.giftType}, ${input.establishmentId ?? null},
          ${input.amountNgn}, ${input.amountSenderCurrency}, ${input.senderCurrency},
          ${input.exchangeRate}, ${input.message ?? null}, ${redemptionCode}, 'active',
          ${expiresAt.toISOString()}, NOW())
      `);
      return { giftId, redemptionCode, expiresAt, message: `Gift of ₦${input.amountNgn.toLocaleString()} sent! Redemption code: ${redemptionCode}` };
    }),

  // Redeem a gift
  redeemGift: protectedProcedure
    .input(z.object({ redemptionCode: z.string().length(8) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await db.execute(sql`SELECT * FROM diaspora_gifts WHERE redemption_code = ${input.redemptionCode.toUpperCase()} AND status = 'active' AND expires_at > NOW() LIMIT 1`);
      if (!(rows as any[]).length) throw new TRPCError({ code: "NOT_FOUND", message: "Gift not found, already redeemed, or expired" });
      const gift = (rows as any[])[0];
      await db.execute(sql`UPDATE diaspora_gifts SET status = 'redeemed', redeemed_at = NOW(), recipient_id = ${String(ctx.user.id)} WHERE id = ${gift.id}`);
      return { success: true, amountNgn: Number(gift.amount_ngn), giftType: gift.gift_type, senderName: gift.sender_name, message: gift.message, message2: `Gift of ₦${Number(gift.amount_ngn).toLocaleString()} redeemed successfully!` };
    }),

  // My sent gifts
  mySentGifts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.execute(sql`SELECT id, recipient_email, recipient_phone, gift_type, amount_ngn, sender_currency, amount_sender_currency, redemption_code, status, expires_at, redeemed_at, created_at FROM diaspora_gifts WHERE sender_id = ${String(ctx.user.id)} ORDER BY created_at DESC LIMIT 50`);
    return rows as any[];
  }),

  // My received gifts
  myReceivedGifts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.execute(sql`SELECT * FROM diaspora_gifts WHERE recipient_id = ${String(ctx.user.id)} ORDER BY created_at DESC LIMIT 50`);
    return rows as any[];
  }),

  // Check gift by redemption code (public)
  checkGift: publicProcedure
    .input(z.object({ redemptionCode: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await db.execute(sql`SELECT id, sender_name, gift_type, amount_ngn, message, status, expires_at FROM diaspora_gifts WHERE redemption_code = ${input.redemptionCode.toUpperCase()} LIMIT 1`);
      if (!(rows as any[]).length) throw new TRPCError({ code: "NOT_FOUND", message: "Gift not found" });
      return (rows as any[])[0];
    }),

  // Admin: gift analytics
  giftAnalytics: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { totalGifts: 0, totalValueNgn: 0, redemptionRate: 0 };
    const rows = await db.execute(sql`SELECT COUNT(*) as total, SUM(amount_ngn) as total_value, SUM(CASE WHEN status = 'redeemed' THEN 1 ELSE 0 END) as redeemed FROM diaspora_gifts WHERE created_at > NOW() - INTERVAL '30 days'`);
    const r = (rows as any[])[0] ?? {};
    const total = Number(r.total ?? 0);
    return { totalGifts: total, totalValueNgn: Number(r.total_value ?? 0), redemptionRate: total > 0 ? Math.round((Number(r.redeemed ?? 0) / total) * 100) : 0 };
  }),
});
