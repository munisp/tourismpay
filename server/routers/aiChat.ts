/**
 * aiChat.ts — AI chat router (trpc.ai.chat)
 * Powers the ComponentShowcase AI chat demo and any inline AI chat widgets.
 */
import { router, protectedProcedure } from '../_core/trpc';
import { z } from 'zod';
import { invokeLLM } from '../_core/llm';

export const aiChatRouter = router({
  chat: protectedProcedure
    .input(z.object({
      message: z.string().min(1).max(2000),
      context: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const systemPrompt = input.context
        ? `You are a helpful AI assistant for TourismPay, an African tourism payment platform. Context: ${input.context}`
        : 'You are a helpful AI assistant for TourismPay, an African tourism payment platform. Help users with payments, bookings, compliance, and travel queries.';
      
      try {
        const response = await invokeLLM([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input.message },
        ]);
        return { reply: response, error: null };
      } catch (err) {
        return { reply: 'I apologize, but I am currently unable to process your request. Please try again later.', error: 'LLM unavailable' };
      }
    }),
});
