import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

const SYSTEM_PROMPT = `You are TourismPay AI, an intelligent travel booking assistant for Nigeria and Africa.
You help tourists find hotels, restaurants, experiences, and activities, and can initiate bookings on their behalf.
You have access to the TourismPay platform which has verified establishments across Nigeria and Africa.
Always respond in a helpful, professional tone. When a user wants to book something, ask for the necessary details
(dates, number of guests, budget, preferences) before confirming. Provide specific recommendations based on their needs.`;

export const agenticAIRouter = router({
  // Start or continue a chat session
  chat: protectedProcedure
    .input(z.object({
      sessionId: z.string().optional(),
      message: z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      let sessionId = input.sessionId;
      let messages: any[] = [];

      if (sessionId) {
        // Load existing session
        const rows = await db.execute(sql`SELECT * FROM ai_booking_sessions WHERE id = ${sessionId} AND user_id = ${String(ctx.user.id)} LIMIT 1`);
        if ((rows as any[]).length) {
          messages = (rows as any[])[0].messages ?? [];
        }
      } else {
        // Create new session
        sessionId = `AI-${Date.now()}`;
        await db.execute(sql`
          INSERT INTO ai_booking_sessions (id, user_id, status, messages, tool_calls, total_tokens, created_at, updated_at)
          VALUES (${sessionId}, ${String(ctx.user.id)}, 'active', '[]'::jsonb, '[]'::jsonb, 0, NOW(), NOW())
        `);
      }

      // Add user message
      messages.push({ role: "user", content: input.message, timestamp: new Date().toISOString() });

      // Call LLM
      let assistantMessage = "";
      let tokensUsed = 0;
      try {
        const llmMessages = [
          { role: "system" as const, content: SYSTEM_PROMPT },
          ...messages.slice(-10).map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
        ];
        const response = await invokeLLM({ messages: llmMessages, maxTokens: 800 });
        assistantMessage = response.content;
        tokensUsed = response.usage?.totalTokens ?? 0;
      } catch (e) {
        assistantMessage = "I apologize, I'm having trouble connecting to my AI service right now. Please try again in a moment.";
      }

      // Add assistant response
      messages.push({ role: "assistant", content: assistantMessage, timestamp: new Date().toISOString() });

      // Update session
      await db.execute(sql`
        UPDATE ai_booking_sessions SET messages = ${JSON.stringify(messages)}::jsonb,
          total_tokens = total_tokens + ${tokensUsed}, updated_at = NOW()
        WHERE id = ${sessionId}
      `);

      return { sessionId, message: assistantMessage, tokensUsed };
    }),

  // Get session history
  getSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await db.execute(sql`SELECT * FROM ai_booking_sessions WHERE id = ${input.sessionId} AND user_id = ${String(ctx.user.id)} LIMIT 1`);
      if (!(rows as any[]).length) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      return (rows as any[])[0];
    }),

  // List my sessions
  mySessions: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.execute(sql`SELECT id, status, intent, total_tokens, created_at, updated_at FROM ai_booking_sessions WHERE user_id = ${String(ctx.user.id)} ORDER BY updated_at DESC LIMIT 20`);
    return rows as any[];
  }),

  // End a session
  endSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.execute(sql`UPDATE ai_booking_sessions SET status = 'completed', completed_at = NOW() WHERE id = ${input.sessionId} AND user_id = ${String(ctx.user.id)}`);
      return { success: true };
    }),

  // Admin: session analytics
  sessionAnalytics: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { totalSessions: 0, activeSessions: 0, avgTokensPerSession: 0 };
    const rows = await db.execute(sql`
      SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        AVG(total_tokens) as avg_tokens FROM ai_booking_sessions
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);
    const r = (rows as any[])[0] ?? {};
    return { totalSessions: Number(r.total ?? 0), activeSessions: Number(r.active ?? 0), avgTokensPerSession: Math.round(Number(r.avg_tokens ?? 0)) };
  }),
});
