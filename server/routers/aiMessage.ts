/**
 * AI Message Router — Full LLM-powered conversational AI
 *
 * Provides:
 *  - Chat completions via invokeLLM (OpenAI-compatible)
 *  - Ollama CPU inference for local models (fraud detection, trip planning)
 *  - Conversation history stored in DB
 *  - Context-aware responses for tourism/payment domain
 */
import { router, publicProcedure, protectedProcedure } from '../_core/trpc';
import { z } from 'zod';
import { invokeLLM } from '../_core/llm';
import { getDb } from '../db';
import { logger } from '../_core/logger';
import { desc, eq, and, count } from 'drizzle-orm';

// ─── Ollama CPU Inference Client ──────────────────────────────────────────────
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';

export async function ollamaGenerate(
  model: string,
  prompt: string,
  options?: { temperature?: number; max_tokens?: number }
): Promise<string | null> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.max_tokens ?? 512,
        },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: string };
    return data.response ?? null;
  } catch (err) {
    logger.warn(`[Ollama] Generate failed: ${(err as Error).message}`);
    return null;
  }
}

export async function ollamaChat(
  model: string,
  messages: Array<{ role: string; content: string }>,
  options?: { temperature?: number; max_tokens?: number }
): Promise<string | null> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.max_tokens ?? 1024,
        },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? null;
  } catch (err) {
    logger.warn(`[Ollama] Chat failed: ${(err as Error).message}`);
    return null;
  }
}

export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── System Prompt ────────────────────────────────────────────────────────────
const TOURISMPAY_SYSTEM_PROMPT = `You are TourismPay AI, an intelligent assistant for the TourismPay platform — Africa's premier tourism payment and financial services platform.

You help users with:
- Travel planning and destination recommendations across Africa
- Payment and wallet management (NGN, USD, KES, GHS, ZAR)
- Hotel and accommodation bookings
- Tourism tax information and compliance
- Agent onboarding and float management
- Fraud detection and security alerts
- KYB/KYC verification guidance
- Currency exchange and remittance

Always be helpful, accurate, and professional. For financial transactions, always emphasize security and compliance with Nigerian CBN regulations and other African regulatory frameworks.

Current platform capabilities:
- Multi-currency wallets (NGN, USD, EUR, GBP, KES, GHS, ZAR)
- GDS hotel bookings across 15 African countries
- AI-powered trip planning
- Agent network management
- Real-time fraud detection
- Tax remittance to 10 African jurisdictions`;

// ─── Helper ───────────────────────────────────────────────────────────────────
async function callInvokeLLM(
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  userMessage: string,
): Promise<string> {
  try {
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: userMessage },
    ];
    const result = await invokeLLM({ messages, maxTokens: 1024 });
    return (result.content as string) || 'I apologize, I could not generate a response at this time.';
  } catch (err) {
    logger.error(`[AI] invokeLLM failed: ${(err as Error).message}`);
    return 'I apologize, I am temporarily unavailable. Please try again later.';
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const aiMessageRouter = router({
  // List conversation messages
  list: protectedProcedure
    .input(z.object({
      sessionId: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { messages: [], total: 0 };
      try {
        const { aiConversations } = await import('../../drizzle/schema');
        const conditions: any[] = [eq(aiConversations.userId, ctx.user.id)];
        if (input?.sessionId) conditions.push(eq(aiConversations.sessionId, input.sessionId));
        const messages = await db
          .select()
          .from(aiConversations)
          .where(and(...conditions))
          .orderBy(desc(aiConversations.createdAt))
          .limit(input?.limit ?? 50)
          .offset(input?.offset ?? 0);
        const [{ total }] = await db.select({ total: count() }).from(aiConversations)
          .where(and(...conditions));
        return { messages, total: total ?? 0 };
      } catch {
        return { messages: [], total: 0 };
      }
    }),

  // Get single message
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      try {
        const { aiConversations } = await import('../../drizzle/schema');
        const [msg] = await db.select().from(aiConversations)
          .where(and(eq(aiConversations.id, input.id), eq(aiConversations.userId, ctx.user.id)))
          .limit(1);
        return msg ?? null;
      } catch {
        return null;
      }
    }),

  // Send a message and get AI response
  chat: protectedProcedure
    .input(z.object({
      message: z.string().min(1).max(4000),
      sessionId: z.string().optional(),
      context: z.enum(['general', 'trip_planning', 'payment', 'fraud', 'kyb', 'agent']).default('general'),
      useLocalModel: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const sessionId = input.sessionId || `session_${ctx.user.id}_${Date.now()}`;

      // Build conversation history
      let history: Array<{ role: string; content: string }> = [];
      if (db) {
        try {
          const { aiConversations } = await import('../../drizzle/schema');
          const prevMessages = await db
            .select()
            .from(aiConversations)
            .where(and(
              eq(aiConversations.userId, ctx.user.id),
              eq(aiConversations.sessionId, sessionId)
            ))
            .orderBy(aiConversations.createdAt)
            .limit(20);
          history = prevMessages.map(m => ({
            role: m.role as string,
            content: m.content as string,
          }));
        } catch { /* table may not exist */ }
      }

      // Add context-specific system prompt additions
      let contextPrompt = TOURISMPAY_SYSTEM_PROMPT;
      if (input.context === 'trip_planning') {
        contextPrompt += '\n\nFocus on providing detailed travel itineraries, accommodation recommendations, and activity suggestions for African destinations.';
      } else if (input.context === 'payment') {
        contextPrompt += '\n\nFocus on payment processing, wallet management, and financial transactions. Always emphasize security.';
      } else if (input.context === 'fraud') {
        contextPrompt += '\n\nFocus on fraud detection, security alerts, and risk management. Be precise and data-driven.';
      }

      let aiResponse: string;

      // Try Ollama first if requested, then fall back to invokeLLM
      if (input.useLocalModel && await isOllamaAvailable()) {
        const ollamaMessages = [
          { role: 'system', content: contextPrompt },
          ...history,
          { role: 'user', content: input.message },
        ];
        const ollamaResult = await ollamaChat('llama3.2:3b', ollamaMessages);
        aiResponse = ollamaResult || await callInvokeLLM(contextPrompt, history, input.message);
      } else {
        aiResponse = await callInvokeLLM(contextPrompt, history, input.message);
      }

      // Store conversation in DB
      if (db) {
        try {
          const { aiConversations } = await import('../../drizzle/schema');
          await db.insert(aiConversations).values([
            {
              userId: ctx.user.id,
              sessionId,
              role: 'user',
              content: input.message,
              context: input.context,
            },
            {
              userId: ctx.user.id,
              sessionId,
              role: 'assistant',
              content: aiResponse,
              context: input.context,
            },
          ]);
        } catch { /* table may not exist */ }
      }

      return {
        sessionId,
        message: aiResponse,
        role: 'assistant' as const,
        timestamp: new Date().toISOString(),
      };
    }),

  // Get AI health status
  health: publicProcedure.query(async () => {
    const ollamaAvailable = await isOllamaAvailable();
    return {
      llm: true,
      ollama: ollamaAvailable,
      ollamaUrl: OLLAMA_BASE_URL,
      models: ollamaAvailable ? ['llama3.2:3b', 'mistral:7b'] : [],
    };
  }),

  // List AI sessions for user
  sessions: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    try {
      const result = await db.execute(
        `SELECT session_id, MIN(created_at) as started_at, COUNT(*) as message_count, MAX(created_at) as last_message_at
         FROM ai_conversations WHERE user_id = ${ctx.user.id} GROUP BY session_id ORDER BY MAX(created_at) DESC LIMIT 20`
      );
      return (result as any).rows ?? [];
    } catch {
      return [];
    }
  }),

  // Fraud analysis via AI
  analyzeFraud: protectedProcedure
    .input(z.object({
      transactionId: z.string(),
      amount: z.number(),
      currency: z.string(),
      merchantId: z.number().optional(),
      userId: z.number().optional(),
      metadata: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const prompt = `Analyze this transaction for fraud risk:
Transaction ID: ${input.transactionId}
Amount: ${input.amount} ${input.currency}
Merchant ID: ${input.merchantId ?? 'N/A'}
User ID: ${input.userId ?? 'N/A'}
Metadata: ${JSON.stringify(input.metadata ?? {})}

Provide a fraud risk score (0-100), risk level (low/medium/high/critical), and key risk factors.
Respond in JSON format: { "score": number, "level": string, "factors": string[], "recommendation": string }`;

      try {
        const result = await invokeLLM({
          messages: [
            { role: 'system', content: 'You are a fraud detection AI. Always respond with valid JSON.' },
            { role: 'user', content: prompt },
          ],
        });
        const text = result.content as string;
        try {
          return JSON.parse(text);
        } catch {
          return { score: 0, level: 'low', factors: [], recommendation: text };
        }
      } catch (err) {
        logger.error(`[AI] Fraud analysis failed: ${(err as Error).message}`);
        return { score: 0, level: 'unknown', factors: [], recommendation: 'Analysis unavailable' };
      }
    }),
});
