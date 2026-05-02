import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb, createUserNotification, createAuditLog } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";
// financeRequests table is accessed via raw SQL in this router (finance_requests)
import { financeRequests as _financeRequests } from "../../drizzle/schema";

const typeLabel: Record<string, string> = {
  payout: "Payout Request",
  loan: "Loan Application",
  insurance: "Insurance Policy",
};

export const embeddedFinanceRouter = router({
  // List all finance requests for the current user
  list: protectedProcedure
    .input(z.object({
      type: z.enum(["payout", "loan", "insurance"]).optional(),
      dateFrom: z.number().optional(), // Unix ms timestamp
      dateTo: z.number().optional(),   // Unix ms timestamp
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;
      const typeFilter = input?.type;
      const dateFrom = input?.dateFrom;
      const dateTo = input?.dateTo;
      // Build query dynamically with parameterised values
      const buildWhere = () => {
        const parts = [sql`user_id = ${ctx.user.id}`];
        if (typeFilter) parts.push(sql`type = ${typeFilter}`);
        if (dateFrom) parts.push(sql`created_at >= ${dateFrom}`);
        if (dateTo) parts.push(sql`created_at <= ${dateTo}`);
        return parts.reduce((acc, part, i) => i === 0 ? part : sql`${acc} AND ${part}`);
      };
      const where = buildWhere();
      const rows = await db.execute(
        sql`SELECT * FROM finance_requests WHERE ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
      );
      const countResult = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM finance_requests WHERE ${where}`
      );
      return {
        items: (rows as any[]).map(r => ({
          id: r.id,
          type: r.type,
          amount: Number(r.amount),
          currency: r.currency,
          status: r.status,
          description: r.description,
          metadata: r.metadata,
          createdAt: Number(r.created_at),
          updatedAt: Number(r.updated_at),
        })),
        total: Number((countResult as any[])[0]?.cnt ?? 0),
      };
    }),

  // Request a payout
  requestPayout: protectedProcedure
    .input(z.object({
      amount: z.number().positive(),
      currency: z.string().default("USD"),
      bankName: z.string().min(1),
      accountNumber: z.string().min(1),
      accountName: z.string().min(1),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const metadata = JSON.stringify({
        bankName: input.bankName,
        accountNumber: input.accountNumber,
        accountName: input.accountName,
      });
      const result = await db.execute(
        sql`INSERT INTO finance_requests (id, user_id, type, amount, currency, status, description, metadata, created_at, updated_at)
            VALUES (gen_random_uuid()::text, ${ctx.user.id}, 'payout', ${input.amount}, ${input.currency}, 'pending', ${input.description ?? null}, ${metadata}::jsonb, ${Date.now()}, ${Date.now()})
            RETURNING *`
      );
      const row = (result as any[])[0];
      // Confirmation receipt to requester
      await createUserNotification({
        userId: ctx.user.id,
        category: "system",
        title: "Payout Request Submitted",
        content: `Your payout request for ${input.currency} ${input.amount} to ${input.bankName} (${input.accountNumber}) has been received and is pending review.`,
        actionUrl: "/finance",
        actionLabel: "View Finance",
      }).catch(() => null);
      // Notify owner of new payout request
      await notifyOwner({
        title: "New Payout Request",
        content: `${ctx.user.name ?? ctx.user.email} requested a payout of ${input.currency} ${input.amount}. Bank: ${input.bankName}.`,
      }).catch(() => null);
      return { id: row.id, status: row.status, amount: Number(row.amount), currency: row.currency };
    }),

  // Apply for a loan
  applyForLoan: protectedProcedure
    .input(z.object({
      amount: z.number().positive(),
      currency: z.string().default("USD"),
      termMonths: z.number().min(1).max(60),
      purpose: z.string().min(1),
      monthlyIncome: z.number().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const interestRate = 0.12; // 12% annual
      const monthlyRate = interestRate / 12;
      const monthlyPayment = (input.amount * monthlyRate * Math.pow(1 + monthlyRate, input.termMonths)) /
        (Math.pow(1 + monthlyRate, input.termMonths) - 1);
      const metadata = JSON.stringify({
        termMonths: input.termMonths,
        purpose: input.purpose,
        monthlyIncome: input.monthlyIncome,
        interestRate,
        monthlyPayment: Math.round(monthlyPayment * 100) / 100,
        totalRepayment: Math.round(monthlyPayment * input.termMonths * 100) / 100,
      });
      const result = await db.execute(
        sql`INSERT INTO finance_requests (id, user_id, type, amount, currency, status, description, metadata, created_at, updated_at)
            VALUES (gen_random_uuid()::text, ${ctx.user.id}, 'loan', ${input.amount}, ${input.currency}, 'under_review', ${input.purpose}, ${metadata}::jsonb, ${Date.now()}, ${Date.now()})
            RETURNING *`
      );
      const row = (result as any[])[0];
      // Confirmation receipt to requester
      await createUserNotification({
        userId: ctx.user.id,
        category: "system",
        title: "Loan Application Received",
        content: `Your loan application for ${input.currency} ${input.amount} over ${input.termMonths} months has been submitted and is under review. Estimated monthly payment: ${input.currency} ${Math.round(monthlyPayment * 100) / 100}.`,
        actionUrl: "/finance",
        actionLabel: "View Finance",
      }).catch(() => null);
      // Notify owner of new loan application
      await notifyOwner({
        title: "New Loan Application",
        content: `${ctx.user.name ?? ctx.user.email} applied for a loan of ${input.currency} ${input.amount} over ${input.termMonths} months. Purpose: ${input.purpose}.`,
      }).catch(() => null);
      return {
        id: row.id,
        status: row.status,
        amount: Number(row.amount),
        currency: row.currency,
        monthlyPayment: Math.round(monthlyPayment * 100) / 100,
        totalRepayment: Math.round(monthlyPayment * input.termMonths * 100) / 100,
      };
    }),

  // Get insurance quote
  getInsuranceQuote: protectedProcedure
    .input(z.object({
      coverageType: z.enum(["travel", "health", "business", "equipment"]),
      coverageAmount: z.number().positive(),
      durationDays: z.number().min(1).max(365),
      destination: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rateMap: Record<string, number> = {
        travel: 0.025,
        health: 0.04,
        business: 0.035,
        equipment: 0.03,
      };
      const dailyRate = rateMap[input.coverageType] ?? 0.03;
      const premium = Math.round(input.coverageAmount * dailyRate * (input.durationDays / 365) * 100) / 100;
      const metadata = JSON.stringify({
        coverageType: input.coverageType,
        coverageAmount: input.coverageAmount,
        durationDays: input.durationDays,
        destination: input.destination,
        premium,
        quoteValidUntil: Date.now() + 24 * 60 * 60 * 1000,
      });
      const result = await db.execute(
        sql`INSERT INTO finance_requests (id, user_id, type, amount, currency, status, description, metadata, created_at, updated_at)
            VALUES (gen_random_uuid()::text, ${ctx.user.id}, 'insurance', ${premium}, 'USD', 'quoted', ${`${input.coverageType} insurance quote`}, ${metadata}::jsonb, ${Date.now()}, ${Date.now()})
            RETURNING *`
      );
      const row = (result as any[])[0];
      return {
        quoteId: row.id,
        premium,
        coverageAmount: input.coverageAmount,
        coverageType: input.coverageType,
        durationDays: input.durationDays,
        validUntil: Date.now() + 24 * 60 * 60 * 1000,
      };
    }),

  // Purchase insurance from a quote
  purchaseInsurance: protectedProcedure
    .input(z.object({ quoteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const existing = await db.execute(
        sql`SELECT * FROM finance_requests WHERE id = ${input.quoteId} AND user_id = ${ctx.user.id} AND type = 'insurance' AND status = 'quoted' LIMIT 1`
      );
      if ((existing as any[]).length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found or already used" });
      }
      await db.execute(
        sql`UPDATE finance_requests SET status = 'active', updated_at = ${Date.now()} WHERE id = ${input.quoteId}`
      );
      // Confirmation receipt to policyholder
      await createUserNotification({
        userId: ctx.user.id,
        category: "system",
        title: "Insurance Policy Activated",
        content: `Your insurance policy (ID: ${input.quoteId}) is now active. You are covered — keep this reference for your records.`,
        actionUrl: "/finance",
        actionLabel: "View Policy",
      }).catch(() => null);
      // Notify owner
      await notifyOwner({
        title: "Insurance Policy Purchased",
        content: `${ctx.user.name ?? ctx.user.email} activated insurance policy #${input.quoteId}.`,
      }).catch(() => null);
      return { success: true, policyId: input.quoteId };
    }),

  // Admin: update request status with notifications + audit log
  updateStatus: adminProcedure
    .input(z.object({
      requestId: z.string(),
      status: z.enum(["pending", "under_review", "approved", "rejected", "active", "completed", "quoted"]),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Fetch the request before updating
      const existing = await db.execute(
        sql`SELECT id, user_id, type, amount, currency, status, description FROM finance_requests WHERE id = ${input.requestId} LIMIT 1`
      );
      const req = (existing as any[])[0];
      if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Finance request not found" });

      const previousStatus = req.status;

      await db.execute(
        sql`UPDATE finance_requests SET status = ${input.status}, updated_at = ${Date.now()} WHERE id = ${input.requestId}`
      );

      // In-app notification to requester
      const statusTitles: Record<string, string> = {
        approved: `Your ${typeLabel[req.type] ?? "Finance Request"} has been Approved`,
        rejected: `Your ${typeLabel[req.type] ?? "Finance Request"} was Rejected`,
        under_review: `Your ${typeLabel[req.type] ?? "Finance Request"} is Under Review`,
        active: `Your ${typeLabel[req.type] ?? "Finance Request"} is Now Active`,
        completed: `Your ${typeLabel[req.type] ?? "Finance Request"} has been Completed`,
      };
      const statusContents: Record<string, string> = {
        approved: `Your ${typeLabel[req.type] ?? "request"} for ${req.currency} ${req.amount} has been approved.${input.note ? ` Admin note: ${input.note}` : ""}`,
        rejected: `Your ${typeLabel[req.type] ?? "request"} for ${req.currency} ${req.amount} was rejected.${input.note ? ` Reason: ${input.note}` : " Please contact support for more details."}`,
        under_review: `Your ${typeLabel[req.type] ?? "request"} for ${req.currency} ${req.amount} is currently being reviewed by our team.`,
        active: `Your ${typeLabel[req.type] ?? "request"} for ${req.currency} ${req.amount} is now active.`,
        completed: `Your ${typeLabel[req.type] ?? "request"} for ${req.currency} ${req.amount} has been completed.`,
      };

      if (statusTitles[input.status] && req.user_id) {
        await createUserNotification({
          userId: Number(req.user_id),
          category: "system",
          title: statusTitles[input.status],
          content: statusContents[input.status] ?? `Your finance request status changed to ${input.status}.`,
          actionUrl: "/finance",
          actionLabel: "View Finance",
        }).catch(() => null);
      }

      // Notify owner
      await notifyOwner({
        title: `Finance Request ${input.status.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}`,
        content: `Request #${input.requestId} (${typeLabel[req.type] ?? req.type}, ${req.currency} ${req.amount}) status updated to "${input.status}" by ${ctx.user.name ?? ctx.user.email}.${input.note ? ` Note: ${input.note}` : ""}`,
      }).catch(() => null);

      // Audit log
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? undefined,
        actorEmail: ctx.user.email ?? undefined,
        action: `finance.request.${input.status}`,
        entityType: "finance_request",
        entityId: input.requestId,
        description: `Finance request #${input.requestId} status updated to "${input.status}" by ${ctx.user.name ?? ctx.user.email}.${input.note ? ` Note: ${input.note}` : ""}`,
        before: { status: previousStatus },
        after: { status: input.status, note: input.note },
      }).catch(() => null);

      return { success: true };
    }),

  // Admin: list all requests
  adminList: adminProcedure
    .input(z.object({
      type: z.enum(["payout", "loan", "insurance"]).optional(),
      status: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const rows = await db.execute(
        sql`SELECT fr.*, u.name as user_name, u.email as user_email
            FROM finance_requests fr
            JOIN users u ON fr.user_id = u.id
            ORDER BY fr.created_at DESC
            LIMIT ${input?.limit ?? 50} OFFSET ${input?.offset ?? 0}`
      );
      return {
        items: (rows as any[]).map(r => ({
          id: r.id,
          userId: r.user_id,
          userName: r.user_name,
          userEmail: r.user_email,
          type: r.type,
          amount: Number(r.amount),
          currency: r.currency,
          status: r.status,
          description: r.description,
          metadata: r.metadata,
          createdAt: Number(r.created_at),
        })),
        total: (rows as any[]).length,
      };
    }),
});
