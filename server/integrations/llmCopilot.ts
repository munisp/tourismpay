/**
 * LLM-Powered AI Co-Pilot — real conversational travel assistant.
 *
 * Supports:
 * - OpenAI (GPT-4o, GPT-4o-mini)
 * - Anthropic (Claude 3.5 Sonnet)
 * - Falls back to rule-based responses when no API key is configured.
 *
 * The copilot has domain-specific system prompts for tourism in Africa,
 * currency exchange, local customs, safety tips, and merchant recommendations.
 */
import { logger } from "../_core/logger";

// ─── Configuration ───────────────────────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const LLM_PROVIDER = process.env.LLM_PROVIDER || (OPENAI_API_KEY ? "openai" : ANTHROPIC_API_KEY ? "anthropic" : "fallback");
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CopilotResponse {
  message: string;
  provider: string;
  model: string;
  tokensUsed?: number;
  cached?: boolean;
}

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are TourismPay AI Co-Pilot, a knowledgeable travel assistant specializing in tourism across Africa.

Your capabilities:
- Recommend destinations, restaurants, activities, and experiences across African countries
- Provide real-time currency exchange information and budgeting tips
- Share local customs, etiquette, and cultural insights
- Offer safety tips and travel advisories specific to African regions
- Help plan itineraries with time estimates, transportation options, and costs
- Suggest local merchants and businesses that accept TourismPay
- Answer questions about visa requirements, vaccinations, and travel documentation
- Provide information about sustainability and eco-tourism options

Guidelines:
- Always be helpful, accurate, and culturally sensitive
- If unsure about specific current information, say so rather than guessing
- Prioritize safety advice when relevant
- Mention TourismPay features (wallet, QR payments, loyalty rewards) when contextually appropriate
- Support multiple languages (English, French, Portuguese, Swahili, Arabic)
- Keep responses concise but informative (2-3 paragraphs max unless asked for detail)`;

// ─── OpenAI ──────────────────────────────────────────────────────────────────

async function chatOpenAI(messages: ChatMessage[]): Promise<CopilotResponse> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
    usage?: { total_tokens: number };
  };

  return {
    message: data.choices[0]?.message?.content || "I couldn't generate a response. Please try again.",
    provider: "openai",
    model: OPENAI_MODEL,
    tokensUsed: data.usage?.total_tokens,
  };
}

// ─── Anthropic ───────────────────────────────────────────────────────────────

async function chatAnthropic(messages: ChatMessage[]): Promise<CopilotResponse> {
  const userMessages = messages.filter((m) => m.role !== "system");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: userMessages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    content: Array<{ text: string }>;
    usage?: { input_tokens: number; output_tokens: number };
  };

  return {
    message: data.content[0]?.text || "I couldn't generate a response. Please try again.",
    provider: "anthropic",
    model: ANTHROPIC_MODEL,
    tokensUsed: data.usage ? data.usage.input_tokens + data.usage.output_tokens : undefined,
  };
}

// ─── Rule-Based Fallback ─────────────────────────────────────────────────────

function chatFallback(messages: ChatMessage[]): CopilotResponse {
  const lastMsg = messages[messages.length - 1]?.content.toLowerCase() || "";

  const responses: Record<string, string> = {
    currency: "For currency exchange in Africa, I recommend using your TourismPay digital wallet. It supports real-time exchange rates for major African currencies including KES (Kenya), NGN (Nigeria), ZAR (South Africa), TZS (Tanzania), and more. You can check current rates in the Exchange Rates section, and set rate alerts for favorable rates.",
    safety: "For travel safety in Africa: always keep your valuables secure, use registered transportation services, stay in well-reviewed accommodations, and keep copies of your travel documents. TourismPay's offline mode ensures you can access your wallet even without connectivity. Register your trip with your embassy for additional support.",
    food: "African cuisine is incredibly diverse! In East Africa, try nyama choma (grilled meat) and ugali. In West Africa, jollof rice is a must-try. In North Africa, tagine and couscous are staples. In Southern Africa, try bunny chow and braai. Use TourismPay to find highly-rated local restaurants and earn loyalty rewards with every meal.",
    wallet: "Your TourismPay digital wallet supports multiple currencies and instant QR code payments. You can top up via card, bank transfer, or mobile money (M-Pesa). Set spending limits, track expenses by category, and earn loyalty points on every transaction. The wallet works offline too — transactions sync when you're back online.",
    visa: "Visa requirements vary by your nationality and destination. Many African countries offer visa-on-arrival or e-visa options. The African Union is rolling out the Africa-wide visa for tourism. I recommend checking your destination country's embassy website at least 6 weeks before travel. Popular destinations like Kenya, Tanzania, and South Africa all offer e-visas.",
    itinerary: "I can help you plan your African adventure! Popular routes include: Safari in Kenya/Tanzania (7-10 days), Cape Town & Garden Route (10-14 days), Morocco circuit (7 days), Ghana & West Africa heritage trail (10 days). Use the Trip Itinerary feature to build and share your plans with travel companions.",
    loyalty: "TourismPay Loyalty rewards you for every transaction. Earn points when you pay at participating merchants, book experiences, or refer friends. Tiers: Bronze (0-999pts), Silver (1000-4999pts), Gold (5000-9999pts), Platinum (10000+pts). Higher tiers unlock better exchange rates, priority support, and exclusive deals.",
  };

  for (const [key, response] of Object.entries(responses)) {
    if (lastMsg.includes(key)) {
      return { message: response, provider: "fallback", model: "rule-based", cached: true };
    }
  }

  return {
    message: "I'm your TourismPay AI travel assistant for Africa! I can help with:\n\n" +
      "- **Destinations & Activities** — recommendations across 54 African countries\n" +
      "- **Currency & Payments** — exchange rates, wallet tips, budgeting\n" +
      "- **Local Culture** — customs, etiquette, food recommendations\n" +
      "- **Safety & Logistics** — travel advisories, visa requirements, vaccinations\n" +
      "- **Itinerary Planning** — route suggestions, time estimates, transportation\n\n" +
      "What would you like to know about your African adventure?",
    provider: "fallback",
    model: "rule-based",
  };
}

// ─── Unified Interface ───────────────────────────────────────────────────────

export async function chat(messages: ChatMessage[]): Promise<CopilotResponse> {
  try {
    switch (LLM_PROVIDER) {
      case "openai":
        if (!OPENAI_API_KEY) break;
        return await chatOpenAI(messages);
      case "anthropic":
        if (!ANTHROPIC_API_KEY) break;
        return await chatAnthropic(messages);
    }
  } catch (err) {
    logger.error("[AI Co-Pilot] LLM call failed, falling back to rules", {
      provider: LLM_PROVIDER,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return chatFallback(messages);
}

export function getCopilotStatus(): { provider: string; model: string; configured: boolean } {
  if (OPENAI_API_KEY) return { provider: "openai", model: OPENAI_MODEL, configured: true };
  if (ANTHROPIC_API_KEY) return { provider: "anthropic", model: ANTHROPIC_MODEL, configured: true };
  return { provider: "fallback", model: "rule-based", configured: false };
}
