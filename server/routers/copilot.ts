import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

const COPILOT_URL = process.env.COPILOT_URL || "http://localhost:8091";

// Try local Ollama first, fall back to built-in LLM
async function callOllama(prompt: string, systemPrompt: string): Promise<string | null> {
  try {
    const res = await fetch(`${COPILOT_URL}/api/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5:7b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        stream: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return data?.response || data?.message?.content || null;
  } catch {
    return null;
  }
}

async function generateWithFallback(
  prompt: string,
  systemPrompt: string
): Promise<string> {
  // Try local Ollama first
  const ollamaResult = await callOllama(prompt, systemPrompt);
  if (ollamaResult) return ollamaResult;

  // Try real LLM providers (OpenAI / Anthropic / rule-based fallback)
  try {
    const { chat } = await import("../integrations/llmCopilot");
    const result = await chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ]);
    if (result.provider !== "fallback") return result.message;
    // Rule-based fallback returned a useful response — use it instead of invoking unconfigured LLM
    if (result.message) return result.message;
  } catch { /* continue to built-in fallback */ }

  // Fall back to built-in LLM (Manus Forge) — only if API key is configured
  try {
    const result = await invokeLLM({
      messages: [
        { role: "system" as const, content: systemPrompt as string },
        { role: "user" as const, content: prompt as string },
      ],
    });
    const content = result.choices?.[0]?.message?.content;
    return (typeof content === "string" ? content : JSON.stringify(content)) ?? "Unable to generate response.";
  } catch {
    return "I'm your TourismPay AI travel assistant for Africa! I can help with destinations, currency, culture, safety, and itinerary planning. What would you like to know?"
  }
}

const TOURISM_SYSTEM_PROMPT = `You are TourismPay AI Co-Pilot, an expert travel and hospitality assistant 
specializing in African tourism. You help travelers plan itineraries, discover local experiences, 
understand payment options, and navigate tourism across 12 African countries. 
You are knowledgeable about local culture, safety, visa requirements, currency, and seasonal events.
Always provide practical, actionable advice. Be concise but comprehensive.`;

export const copilotRouter = router({
  // General chat with the AI Co-Pilot
  chat: protectedProcedure
    .input(
      z.object({
        message: z.string().min(1).max(2000),
        context: z.object({
          country: z.string().optional(),
          city: z.string().optional(),
          budget: z.string().optional(),
          duration: z.string().optional(),
          interests: z.array(z.string()).optional(),
        }).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const contextStr = input.context
        ? `\n\nUser context: ${JSON.stringify(input.context)}`
        : "";

      const response = await generateWithFallback(
        input.message + contextStr,
        TOURISM_SYSTEM_PROMPT
      );

      return { response, timestamp: new Date() };
    }),

  // Generate a full travel itinerary
  generateItinerary: protectedProcedure
    .input(
      z.object({
        destination: z.string(),
        country: z.string(),
        duration: z.number().min(1).max(30),
        budget: z.enum(["budget", "mid-range", "luxury"]),
        interests: z.array(z.string()),
        travelers: z.number().min(1).max(20).default(1),
        startDate: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const prompt = `Create a detailed ${input.duration}-day travel itinerary for ${input.destination}, ${input.country}.
Budget: ${input.budget}
Travelers: ${input.travelers}
Interests: ${input.interests.join(", ")}
${input.startDate ? `Start date: ${input.startDate}` : ""}

Include:
1. Day-by-day schedule with morning/afternoon/evening activities
2. Recommended restaurants and local food experiences
3. Accommodation suggestions
4. Transportation tips
5. Payment tips (local currency, mobile money, card acceptance)
6. Safety tips and local customs
7. Estimated daily budget breakdown

Format as a structured itinerary.`;

      const response = await generateWithFallback(prompt, TOURISM_SYSTEM_PROMPT);

      return {
        destination: input.destination,
        country: input.country,
        duration: input.duration,
        itinerary: response,
        generatedAt: new Date(),
      };
    }),

  // Get destination insights
  destinationInsights: protectedProcedure
    .input(
      z.object({
        country: z.string(),
        city: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const prompt = `Provide comprehensive travel insights for ${input.city ? `${input.city}, ` : ""}${input.country}.
Include: best time to visit, top attractions, local cuisine, payment methods accepted, safety rating, 
visa requirements for common nationalities, local currency tips, and unique cultural experiences.
Be specific and practical.`;

      const response = await generateWithFallback(prompt, TOURISM_SYSTEM_PROMPT);

      return {
        location: input.city ? `${input.city}, ${input.country}` : input.country,
        insights: response,
        generatedAt: new Date(),
      };
    }),

  // Payment guidance for a specific country
  paymentGuidance: protectedProcedure
    .input(z.object({ country: z.string() }))
    .query(async ({ input }) => {
      const prompt = `Provide detailed payment guidance for travelers in ${input.country}:
1. Accepted payment methods (cards, mobile money, cash)
2. Popular mobile money platforms (M-Pesa, MTN, etc.)
3. Currency exchange tips
4. ATM availability
5. Tipping culture
6. Common tourist payment scams to avoid
7. TourismPay platform availability and benefits`;

      const response = await generateWithFallback(prompt, TOURISM_SYSTEM_PROMPT);
      return { country: input.country, guidance: response };
    }),

  // Recommend establishments
  recommendEstablishments: protectedProcedure
    .input(
      z.object({
        country: z.string(),
        type: z.enum([
          "hotel", "restaurant", "concert_venue", "safari_lodge",
          "tour_operator", "spa_wellness", "museum", "beach_resort",
        ]),
        budget: z.enum(["budget", "mid-range", "luxury"]).optional(),
        preferences: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const prompt = `Recommend top ${input.type.replace("_", " ")} options in ${input.country}.
${input.budget ? `Budget level: ${input.budget}` : ""}
${input.preferences?.length ? `Preferences: ${input.preferences.join(", ")}` : ""}

Provide 5 specific recommendations with:
- Name and location
- Why it's recommended
- Price range
- TourismPay payment acceptance status
- Booking tips`;

      const response = await generateWithFallback(prompt, TOURISM_SYSTEM_PROMPT);
      return {
        country: input.country,
        type: input.type,
        recommendations: response,
      };
    }),
});
