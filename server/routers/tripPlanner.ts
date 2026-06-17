/**
 * tripPlanner.ts — NL Trip Planner Router
 *
 * Bridges natural language queries → Go merchant catalog → LLM structured output
 * → itinerary DB records. Provides conversational trip planning with real merchant
 * data and one-click booking.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  touristItineraries,
  touristItineraryItems,
  establishments,
  merchantProducts,
  touristBookings,
} from "../../drizzle/schema";
import { eq, and, sql, ilike, or } from "drizzle-orm";

// ─── Go Settlement Service Client ─────────────────────────────────────────────

const GO_URL = process.env.GO_SETTLEMENT_URL || "http://localhost:8081";

async function callGoService(path: string, method = "GET", body?: unknown): Promise<unknown> {
  const opts: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer internal-service-token`,
    },
    signal: AbortSignal.timeout(15_000),
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${GO_URL}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Go service error: ${res.status} ${text}`);
  }
  return res.json();
}

// ─── NL Intent Parsing ────────────────────────────────────────────────────────

const COUNTRY_MAP: Record<string, string> = {
  nigeria: "NG", lagos: "NG", abuja: "NG",
  kenya: "KE", nairobi: "KE", mombasa: "KE",
  ghana: "GH", accra: "GH",
  "south africa": "ZA", "cape town": "ZA", johannesburg: "ZA",
  tanzania: "TZ", zanzibar: "TZ", arusha: "TZ",
  egypt: "EG", cairo: "EG",
  morocco: "MA", marrakech: "MA",
  rwanda: "RW", kigali: "RW",
  senegal: "SN", dakar: "SN",
};

const CITY_MAP: Record<string, [string, string]> = {
  lagos: ["Lagos", "NG"], abuja: ["Abuja", "NG"],
  nairobi: ["Nairobi", "KE"], mombasa: ["Mombasa", "KE"],
  accra: ["Accra", "GH"], "cape coast": ["Cape Coast", "GH"],
  "cape town": ["Cape Town", "ZA"], johannesburg: ["Johannesburg", "ZA"],
  zanzibar: ["Zanzibar", "TZ"], arusha: ["Arusha", "TZ"],
  cairo: ["Cairo", "EG"], marrakech: ["Marrakech", "MA"],
  kigali: ["Kigali", "RW"], dakar: ["Dakar", "SN"],
};

interface TravelIntent {
  country: string;
  city: string;
  durationDays: number;
  budgetUsd: number;
  budgetLevel: string;
  interests: string[];
  travelers: number;
  specialRequirements: string[];
}

function parseIntent(query: string): TravelIntent {
  const q = query.toLowerCase();
  const intent: TravelIntent = {
    country: "", city: "", durationDays: 5, budgetUsd: 0,
    budgetLevel: "mid-range", interests: [], travelers: 1,
    specialRequirements: [],
  };

  // Country
  for (const [keyword, code] of Object.entries(COUNTRY_MAP)) {
    if (q.includes(keyword)) { intent.country = code; break; }
  }
  // City
  for (const [keyword, [city, code]] of Object.entries(CITY_MAP)) {
    if (q.includes(keyword)) {
      intent.city = city;
      if (!intent.country) intent.country = code;
      break;
    }
  }

  // Duration
  const durMatch = q.match(/(\d+)\s*(?:day|night)/);
  if (durMatch) intent.durationDays = parseInt(durMatch[1]);
  else if (q.includes("week")) intent.durationDays = 7;
  else if (q.includes("weekend")) intent.durationDays = 3;

  // Budget
  const budgetMatch = q.match(/\$\s*([\d,]+)/);
  if (budgetMatch) {
    intent.budgetUsd = parseFloat(budgetMatch[1].replace(/,/g, ""));
    const daily = intent.budgetUsd / intent.durationDays;
    intent.budgetLevel = daily < 100 ? "budget" : daily > 300 ? "luxury" : "mid-range";
  } else if (/budget|cheap|affordable/.test(q)) {
    intent.budgetLevel = "budget";
  } else if (/luxury|premium|high.?end|splurge/.test(q)) {
    intent.budgetLevel = "luxury";
  }

  // Interests
  const interestMap: Record<string, string[]> = {
    beach: ["beach", "coast", "ocean", "surf", "island"],
    safari: ["safari", "wildlife", "game drive", "big five"],
    cultural: ["culture", "history", "museum", "heritage", "art"],
    food: ["food", "restaurant", "cuisine", "dining", "culinary"],
    nightlife: ["nightlife", "bar", "club", "music", "afrobeats"],
    nature: ["nature", "hiking", "mountain", "forest", "canopy"],
    adventure: ["adventure", "diving", "balloon", "snorkeling"],
    shopping: ["shopping", "market", "mall", "souvenir"],
  };
  for (const [interest, keywords] of Object.entries(interestMap)) {
    if (keywords.some(kw => q.includes(kw))) intent.interests.push(interest);
  }
  if (intent.interests.length === 0) intent.interests = ["cultural", "food"];

  // Travelers
  const travelerMatch = q.match(/(\d+)\s*(?:people|person|travelers|adults)/);
  if (travelerMatch) intent.travelers = parseInt(travelerMatch[1]);
  else if (q.includes("couple")) intent.travelers = 2;
  else if (q.includes("family")) intent.travelers = 4;

  // Defaults
  if (!intent.country) { intent.country = "NG"; intent.city = "Lagos"; }

  return intent;
}

// ─── LLM Structured Itinerary Generation ──────────────────────────────────────

interface ItineraryItem {
  time_slot: string;
  start_time: string;
  end_time: string;
  title: string;
  description: string;
  merchant_id: number;
  merchant_name: string;
  product_name: string;
  cost_usd: number;
  item_type: string;
  bookable: boolean;
}

interface GeneratedDay {
  day_number: number;
  title: string;
  items: ItineraryItem[];
}

interface GeneratedItinerary {
  days: GeneratedDay[];
  tips: string[];
  total_cost_usd: number;
}

async function generateWithLLM(prompt: string, systemPrompt: string): Promise<string> {
  const result = await invokeLLM({
    messages: [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: prompt },
    ],
    responseFormat: { type: "json_object" as const },
  });
  const content = result.choices?.[0]?.message?.content;
  return (typeof content === "string" ? content : JSON.stringify(content)) ?? "{}";
}

// ─── Router ───────────────────────────────────────────────────────────────────

const TRIP_SYSTEM_PROMPT = `You are TourismPay Trip Planner AI. You create structured travel itineraries using ONLY the real merchant data provided to you. NEVER hallucinate merchants or prices — use only the establishments and products from the context.

Your output must be valid JSON matching the requested schema exactly. Include only merchants from the provided context. Use their exact IDs, names, and prices.`;

export const tripPlannerRouter = router({
  /**
   * Parse natural language into structured travel intent
   */
  parseIntent: protectedProcedure
    .input(z.object({ query: z.string().min(3).max(2000) }))
    .mutation(async ({ input }) => {
      const intent = parseIntent(input.query);
      return { intent, parsed: true };
    }),

  /**
   * Generate structured itinerary from NL query
   * Flow: NL → parse intent → fetch merchant context from Go → LLM → structured JSON
   */
  generate: protectedProcedure
    .input(z.object({
      query: z.string().min(3).max(2000),
      country: z.string().length(2).optional(),
      city: z.string().optional(),
      durationDays: z.number().min(1).max(30).optional(),
      budgetUsd: z.number().min(0).optional(),
      budgetLevel: z.enum(["budget", "mid-range", "luxury"]).optional(),
      interests: z.array(z.string()).optional(),
      travelers: z.number().min(1).max(20).optional(),
    }))
    .mutation(async ({ input }) => {
      // Parse NL intent
      const parsed = parseIntent(input.query);
      const intent: TravelIntent = {
        country: input.country || parsed.country,
        city: input.city || parsed.city,
        durationDays: input.durationDays || parsed.durationDays,
        budgetUsd: input.budgetUsd || parsed.budgetUsd,
        budgetLevel: input.budgetLevel || parsed.budgetLevel,
        interests: input.interests || parsed.interests,
        travelers: input.travelers || parsed.travelers,
        specialRequirements: parsed.specialRequirements,
      };

      // Fetch merchant context from Go service
      let merchantContext = "";
      try {
        const contextResp = await callGoService(
          `/api/v1/catalog/context?country=${intent.country}`
        ) as { context: string };
        merchantContext = contextResp.context;
      } catch {
        merchantContext = `Country: ${intent.country}. No merchant data available — generate a general itinerary with typical local prices.`;
      }

      // Also fetch estimate for budget framing
      let estimate: Record<string, unknown> = {};
      try {
        estimate = await callGoService(
          `/api/v1/catalog/estimate?country=${intent.country}&city=${encodeURIComponent(intent.city)}&days=${intent.durationDays}&budget=${intent.budgetLevel}`
        ) as Record<string, unknown>;
      } catch { /* ignore */ }

      const countryNames: Record<string, string> = {
        NG: "Nigeria", KE: "Kenya", GH: "Ghana", ZA: "South Africa", TZ: "Tanzania",
        EG: "Egypt", MA: "Morocco", RW: "Rwanda", SN: "Senegal",
      };
      const countryName = countryNames[intent.country] ?? intent.country;
      const cityName = intent.city || "the capital";

      const budgetStr = intent.budgetUsd > 0
        ? `$${intent.budgetUsd.toLocaleString()} total`
        : intent.budgetLevel;

      const prompt = `Generate a detailed ${intent.durationDays}-day travel itinerary for ${cityName}, ${countryName}.

TOURIST PROFILE:
- Budget: ${budgetStr}
- Travelers: ${intent.travelers}
- Interests: ${intent.interests.join(", ")}

REAL MERCHANT DATA (USE THESE — do NOT invent merchants):
${merchantContext}

RULES:
1. Use ONLY merchants from the data above. Reference their exact names, IDs, and prices.
2. Include 3 meals per day from listed restaurants.
3. Include transport between locations.
4. Fill morning, afternoon, and evening time slots.
5. Stay within the budget (${budgetStr}).
6. Each item must have: time_slot (morning/afternoon/evening), start_time (HH:MM), end_time (HH:MM), title, description, merchant_id (integer from data), merchant_name, product_name, cost_usd (number), item_type (activity/accommodation/transport/meal/free_time), bookable (true if merchant_id > 0).

OUTPUT: valid JSON with this structure:
{
  "days": [{ "day_number": 1, "title": "Day title", "items": [{ ...item fields }] }],
  "tips": ["tip 1", "tip 2"],
  "total_cost_usd": 1250.00
}`;

      let itineraryData: GeneratedItinerary;
      try {
        const llmOutput = await generateWithLLM(prompt, TRIP_SYSTEM_PROMPT);
        itineraryData = JSON.parse(llmOutput);
      } catch (e) {
        // Fallback: generate a template itinerary from merchant data
        itineraryData = buildFallbackItinerary(intent, merchantContext);
      }

      // Calculate totals
      let totalCost = 0;
      let merchantItemCount = 0;
      let totalItems = 0;
      for (const day of itineraryData.days ?? []) {
        for (const item of day.items ?? []) {
          totalCost += item.cost_usd ?? 0;
          totalItems++;
          if (item.merchant_id && item.merchant_id > 0) merchantItemCount++;
        }
      }

      const merchantCoverage = totalItems > 0 ? Math.round((merchantItemCount / totalItems) * 100) : 0;

      return {
        itinerary: {
          id: `trip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          destination: cityName,
          country: countryName,
          countryCode: intent.country,
          durationDays: intent.durationDays,
          budgetLevel: intent.budgetLevel,
          totalCostUsd: Math.round(totalCost * 100) / 100,
          dailyAverageUsd: Math.round((totalCost / intent.durationDays) * 100) / 100,
          days: itineraryData.days ?? [],
          tips: itineraryData.tips ?? [],
          merchantCoverage,
          generatedAt: new Date().toISOString(),
        },
        intent,
        estimate,
      };
    }),

  /**
   * Refine an existing itinerary via NL instruction
   * e.g., "make it cheaper", "add a safari on day 3", "swap the hotel for something near the beach"
   */
  refine: protectedProcedure
    .input(z.object({
      itinerary: z.any(),
      instruction: z.string().min(3).max(1000),
    }))
    .mutation(async ({ input }) => {
      const country = input.itinerary?.countryCode ?? "NG";

      let merchantContext = "";
      try {
        const contextResp = await callGoService(
          `/api/v1/catalog/context?country=${country}`
        ) as { context: string };
        merchantContext = contextResp.context;
      } catch { /* ignore */ }

      const prompt = `You have an existing travel itinerary. The user wants to modify it.

CURRENT ITINERARY:
${JSON.stringify(input.itinerary, null, 2)}

USER'S MODIFICATION REQUEST:
"${input.instruction}"

AVAILABLE MERCHANTS:
${merchantContext}

Apply the modification. Return the COMPLETE modified itinerary in the same JSON format with updated costs. Use only merchants from the provided data.`;

      let refinedData: GeneratedItinerary;
      try {
        const llmOutput = await generateWithLLM(prompt, TRIP_SYSTEM_PROMPT);
        refinedData = JSON.parse(llmOutput);
      } catch {
        return { itinerary: input.itinerary, refined: false, error: "Could not process refinement" };
      }

      let totalCost = 0;
      for (const day of refinedData.days ?? []) {
        for (const item of day.items ?? []) {
          totalCost += item.cost_usd ?? 0;
        }
      }

      return {
        itinerary: {
          ...input.itinerary,
          days: refinedData.days ?? input.itinerary.days,
          tips: refinedData.tips ?? input.itinerary.tips,
          totalCostUsd: Math.round(totalCost * 100) / 100,
          dailyAverageUsd: Math.round((totalCost / (input.itinerary.durationDays || 5)) * 100) / 100,
        },
        refined: true,
      };
    }),

  /**
   * Save generated itinerary to DB (creates touristItinerary + items)
   */
  saveToItinerary: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(255),
      itinerary: z.any(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const itin = input.itinerary;
      const [created] = await db.insert(touristItineraries).values({
        userId: ctx.user.id,
        title: input.title,
        description: `AI-generated ${itin.durationDays}-day trip to ${itin.destination}, ${itin.country}. Budget: ${itin.budgetLevel}. ${itin.merchantCoverage}% TourismPay merchants.`,
        currency: "USD",
        status: "draft",
      }).returning();

      // Insert items
      for (const day of itin.days ?? []) {
        let order = 1;
        for (const item of day.items ?? []) {
          await db.insert(touristItineraryItems).values({
            itineraryId: created.id,
            dayNumber: day.day_number,
            orderInDay: order++,
            title: item.title,
            notes: `${item.description ?? ""}\nMerchant: ${item.merchant_name ?? "N/A"}\nProduct: ${item.product_name ?? "N/A"}`,
            startTime: item.start_time,
            endTime: item.end_time,
            estimatedCostUsd: (item.cost_usd ?? 0).toString(),
            itemType: item.item_type ?? "activity",
            status: "planned",
            establishmentId: item.merchant_id > 0 ? item.merchant_id : null,
          });
        }
      }

      return { itineraryId: created.id, itemCount: itin.days?.reduce((s: number, d: { items: unknown[] }) => s + (d.items?.length ?? 0), 0) ?? 0 };
    }),

  /**
   * Book a specific item from an itinerary (creates a tourist booking)
   */
  bookItem: protectedProcedure
    .input(z.object({
      itineraryItemId: z.number(),
      establishmentId: z.number(),
      productId: z.number().optional(),
      amount: z.number().min(0),
      currency: z.string().default("USD"),
      date: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Create booking
      const [booking] = await db.insert(touristBookings).values({
        userId: ctx.user.id,
        establishmentId: input.establishmentId,
        productId: input.productId ?? null,
        serviceType: "itinerary_item",
        serviceName: "Trip Planner Booking",
        bookingDate: input.date ? new Date(input.date) : new Date(),
        priceUsd: input.amount.toString(),
        currency: input.currency,
        status: "pending" as const,
      }).returning();

      // Link booking to itinerary item
      await db.update(touristItineraryItems)
        .set({ bookingId: booking.id, status: "confirmed", updatedAt: new Date() })
        .where(eq(touristItineraryItems.id, input.itineraryItemId));

      return { bookingId: booking.id, status: "pending" };
    }),

  /**
   * Get country merchant profile
   * Shows all TourismPay merchants in a country with categories and pricing
   */
  countryMerchants: protectedProcedure
    .input(z.object({ country: z.string().length(2) }))
    .query(async ({ input }) => {
      // Try DB first
      const db = await getDb();
      let dbMerchants: Array<{ id: number; name: string; type: string; city: string | null; country: string }> = [];
      let dbProducts: Array<{ id: number; establishmentId: number; name: string; category: string; price: string; currency: string }> = [];

      if (db) {
        dbMerchants = await db.select({
          id: establishments.id,
          name: establishments.name,
          type: establishments.type,
          city: establishments.city,
          country: establishments.country,
        }).from(establishments).where(
          and(
            eq(establishments.country, input.country.toUpperCase()),
            eq(establishments.kybStatus, "approved" as const),
          )
        );
      }

      // Also fetch from Go service for supplemental data
      let goData: { merchants?: Array<Record<string, unknown>>; count?: number } = {};
      try {
        goData = await callGoService(
          `/api/v1/catalog/search?country=${input.country}`
        ) as typeof goData;
      } catch { /* ignore */ }

      // Combine
      const merchants = goData.merchants ?? dbMerchants.map(m => ({
        id: m.id, name: m.name, type: m.type, city: m.city, country: m.country,
        accepts_tourismpay: true,
      }));

      // Category summary
      const categoryCounts: Record<string, number> = {};
      for (const m of merchants) {
        const type = (m as Record<string, unknown>).type as string || "other";
        categoryCounts[type] = (categoryCounts[type] ?? 0) + 1;
      }
      const categories = Object.entries(categoryCounts).map(([cat, count]) => ({
        category: cat, count, percentage: Math.round((count / merchants.length) * 100),
      }));

      return {
        country: input.country.toUpperCase(),
        merchantCount: merchants.length,
        merchants,
        categories,
      };
    }),

  /**
   * NL chat with merchant-aware context
   */
  chat: protectedProcedure
    .input(z.object({
      message: z.string().min(1).max(2000),
      country: z.string().length(2).optional(),
      conversationHistory: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      const country = input.country ?? "NG";

      // Fetch merchant context
      let merchantContext = "";
      try {
        const contextResp = await callGoService(
          `/api/v1/catalog/context?country=${country}`
        ) as { context: string };
        merchantContext = contextResp.context;
      } catch { /* ignore */ }

      const systemPrompt = `You are TourismPay Trip Planner, an expert travel assistant for African tourism. You have access to REAL merchant data — always reference actual TourismPay-verified merchants and their exact prices when recommending.

REAL MERCHANT DATA:
${merchantContext}

Rules:
- Always recommend merchants from the data above with their actual prices
- If the user asks about costs, use real product prices
- Mention that all listed merchants accept TourismPay for easy payment
- Be conversational and helpful
- If the user seems to be planning a trip, suggest generating a full itinerary`;

      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...(input.conversationHistory ?? []).map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: input.message },
      ];

      const result = await invokeLLM({ messages });
      const content = result.choices?.[0]?.message?.content;
      const response = (typeof content === "string" ? content : JSON.stringify(content)) ?? "I can help you plan your trip! Tell me your destination, duration, and interests.";

      return { response, timestamp: new Date().toISOString() };
    }),

  /**
   * Search merchants by query — used for adding items to itinerary
   */
  searchMerchants: protectedProcedure
    .input(z.object({
      query: z.string().min(1).max(200),
      country: z.string().length(2).optional(),
      category: z.string().optional(),
    }))
    .query(async ({ input }) => {
      try {
        const params = new URLSearchParams();
        if (input.country) params.set("country", input.country);
        params.set("q", input.query);
        if (input.category) params.set("category", input.category);

        const data = await callGoService(
          `/api/v1/catalog/search?${params.toString()}`
        ) as { merchants: unknown[]; count: number };
        return data;
      } catch {
        return { merchants: [], count: 0 };
      }
    }),

  /**
   * Get products for a specific merchant
   */
  merchantProducts: protectedProcedure
    .input(z.object({
      country: z.string().length(2),
      category: z.string().optional(),
      budget: z.string().optional(),
    }))
    .query(async ({ input }) => {
      try {
        const params = new URLSearchParams({ country: input.country });
        if (input.category) params.set("category", input.category);
        if (input.budget) params.set("budget", input.budget);

        const data = await callGoService(
          `/api/v1/catalog/products?${params.toString()}`
        ) as { products: unknown[]; count: number };
        return data;
      } catch {
        return { products: [], count: 0 };
      }
    }),
});

// ─── Fallback Itinerary Builder ───────────────────────────────────────────────

function buildFallbackItinerary(intent: TravelIntent, _merchantContext: string): GeneratedItinerary {
  const days: GeneratedDay[] = [];

  // Simple template-based fallback
  for (let d = 1; d <= intent.durationDays; d++) {
    const items: ItineraryItem[] = [
      {
        time_slot: "morning",
        start_time: "08:00",
        end_time: "09:00",
        title: "Breakfast",
        description: "Morning meal at local restaurant",
        merchant_id: 0,
        merchant_name: "Local Restaurant",
        product_name: "Breakfast",
        cost_usd: 15,
        item_type: "meal",
        bookable: false,
      },
      {
        time_slot: "morning",
        start_time: "09:30",
        end_time: "12:00",
        title: d === 1 ? "City Orientation Tour" : `Day ${d} Activity`,
        description: "Explore local attractions",
        merchant_id: 0,
        merchant_name: "Local Tour Guide",
        product_name: "Guided Tour",
        cost_usd: 30,
        item_type: "activity",
        bookable: false,
      },
      {
        time_slot: "afternoon",
        start_time: "12:30",
        end_time: "13:30",
        title: "Lunch",
        description: "Lunch at local restaurant",
        merchant_id: 0,
        merchant_name: "Local Restaurant",
        product_name: "Lunch",
        cost_usd: 20,
        item_type: "meal",
        bookable: false,
      },
      {
        time_slot: "afternoon",
        start_time: "14:00",
        end_time: "17:00",
        title: "Afternoon Experience",
        description: "Cultural or nature activity",
        merchant_id: 0,
        merchant_name: "Local Operator",
        product_name: "Experience",
        cost_usd: 25,
        item_type: "activity",
        bookable: false,
      },
      {
        time_slot: "evening",
        start_time: "19:00",
        end_time: "21:00",
        title: "Dinner",
        description: "Evening dining experience",
        merchant_id: 0,
        merchant_name: "Local Restaurant",
        product_name: "Dinner",
        cost_usd: 30,
        item_type: "meal",
        bookable: false,
      },
    ];

    days.push({
      day_number: d,
      title: d === 1 ? "Arrival & Orientation" : d === intent.durationDays ? "Final Day & Departure" : `Day ${d} — Exploration`,
      items,
    });
  }

  const total = days.reduce((s, d) => s + d.items.reduce((ss, i) => ss + i.cost_usd, 0), 0);

  return {
    days,
    tips: [
      "Download TourismPay app for easy payments at all partner merchants",
      "Carry local SIM card for mobile payments and navigation",
      "Book popular attractions in advance during peak season",
    ],
    total_cost_usd: total,
  };
}
