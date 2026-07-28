import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";

export const openBankingRouter = router({
  // Initiate bank account connection (Mono/Okra)
  initiateConnection: protectedProcedure
    .input(z.object({
      provider: z.enum(["mono", "okra"]),
      bankCode: z.string(),
      bankName: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const connId = `OB-${ctx.user.id}-${input.provider}-${Date.now()}`;
      await db.execute(sql`
        INSERT INTO open_banking_connections (id, user_id, provider, account_id, bank_code, bank_name, currency, status, created_at)
        VALUES (${connId}, ${String(ctx.user.id)}, ${input.provider}, 'pending', ${input.bankCode}, ${input.bankName}, 'NGN', 'pending', NOW())
      `);
      // In production: generate OAuth URL for Mono/Okra widget
      const authUrl = input.provider === "mono"
        ? `https://connect.mono.co/?key=${process.env.MONO_PUBLIC_KEY ?? "demo"}&scope=accounts&redirect_uri=${process.env.APP_URL ?? "https://tourismpay.servers.upi.dev"}/api/open-banking/mono/callback`
        : `https://okra.ng/connect?client_id=${process.env.OKRA_CLIENT_ID ?? "demo"}`;
      return { connectionId: connId, authUrl, message: "Redirect user to authUrl to complete bank connection" };
    }),

  // Complete connection after OAuth callback
  completeConnection: protectedProcedure
    .input(z.object({
      connectionId: z.string(),
      accountId: z.string(),
      accountNumber: z.string().optional(),
      accountName: z.string().optional(),
      accessToken: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Mask account number for storage
      const maskedAccount = input.accountNumber ? `****${input.accountNumber.slice(-4)}` : null;
      await db.execute(sql`
        UPDATE open_banking_connections SET account_id = ${input.accountId}, account_number = ${maskedAccount},
          account_name = ${input.accountName ?? null}, access_token = ${input.accessToken},
          status = 'connected', token_expires_at = NOW() + INTERVAL '90 days'
        WHERE id = ${input.connectionId} AND user_id = ${String(ctx.user.id)}
      `);
      return { success: true, message: "Bank account connected successfully" };
    }),

  // List my connected bank accounts
  myConnections: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.execute(sql`
      SELECT id, provider, bank_code, bank_name, account_number, account_name, currency, status,
        last_topup_at, total_topup_ngn, created_at
      FROM open_banking_connections WHERE user_id = ${String(ctx.user.id)} AND status != 'disconnected'
      ORDER BY created_at DESC
    `);
    return rows as any[];
  }),

  // Top up wallet from connected bank account
  topUpWallet: protectedProcedure
    .input(z.object({
      connectionId: z.string(),
      amountNgn: z.number().min(1000).max(10000000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Verify connection belongs to user
      const rows = await db.execute(sql`SELECT * FROM open_banking_connections WHERE id = ${input.connectionId} AND user_id = ${String(ctx.user.id)} AND status = 'connected' LIMIT 1`);
      if (!(rows as any[]).length) throw new TRPCError({ code: "NOT_FOUND", message: "Bank connection not found or not active" });
      const conn = (rows as any[])[0];
      // In production: call Mono/Okra debit API here
      // Record the top-up
      await db.execute(sql`
        UPDATE open_banking_connections SET last_topup_at = NOW(), total_topup_ngn = total_topup_ngn + ${input.amountNgn}
        WHERE id = ${input.connectionId}
      `);
      const txRef = `OB-TOPUP-${Date.now()}`;
      return { success: true, transactionRef: txRef, amountNgn: input.amountNgn, bankName: conn.bank_name, message: `₦${input.amountNgn.toLocaleString()} top-up initiated from ${conn.bank_name}` };
    }),

  // Disconnect a bank account
  disconnect: protectedProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.execute(sql`UPDATE open_banking_connections SET status = 'disconnected', disconnected_at = NOW(), access_token = NULL WHERE id = ${input.connectionId} AND user_id = ${String(ctx.user.id)}`);
      return { success: true };
    }),
});
