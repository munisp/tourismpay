import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getEstablishments, getTourismEvents, getDashboardStats } from "../db";

const REGISTRY_URL = process.env.REGISTRY_URL || "http://localhost:8082";

async function callRegistry(path: string): Promise<unknown> {
  try {
    const res = await fetch(`${REGISTRY_URL}${path}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Registry error: ${res.status}`);
    return res.json();
  } catch {
    return null;
  }
}

// Static country data (mirrors Go registry service)
const AFRICA_COUNTRIES = [
  {
    code: "NG", name: "Nigeria", capital: "Abuja", currency: "NGN",
    flag: "🇳🇬", region: "West Africa", population: 220000000,
    gdpBillionUsd: 477, tourismContributionPct: 4.8,
    majorEvents: ["Lagos Jazz Festival", "Calabar Carnival", "Abuja Carnival"],
    languages: ["English", "Hausa", "Yoruba", "Igbo"],
    timezone: "Africa/Lagos",
  },
  {
    code: "KE", name: "Kenya", capital: "Nairobi", currency: "KES",
    flag: "🇰🇪", region: "East Africa", population: 55000000,
    gdpBillionUsd: 110, tourismContributionPct: 8.8,
    majorEvents: ["Lewa Safari Marathon", "Nairobi International Film Festival", "Maasai Mara Wildebeest Migration"],
    languages: ["Swahili", "English"],
    timezone: "Africa/Nairobi",
  },
  {
    code: "ZA", name: "South Africa", capital: "Pretoria", currency: "ZAR",
    flag: "🇿🇦", region: "Southern Africa", population: 60000000,
    gdpBillionUsd: 419, tourismContributionPct: 6.7,
    majorEvents: ["Cape Town Jazz Festival", "Oppikoppi", "Hermanus Whale Festival"],
    languages: ["Zulu", "Xhosa", "Afrikaans", "English"],
    timezone: "Africa/Johannesburg",
  },
  {
    code: "GH", name: "Ghana", capital: "Accra", currency: "GHS",
    flag: "🇬🇭", region: "West Africa", population: 33000000,
    gdpBillionUsd: 77, tourismContributionPct: 5.9,
    majorEvents: ["Chale Wote Street Art Festival", "Ghana Music Awards", "Panafest"],
    languages: ["English", "Akan", "Ewe"],
    timezone: "Africa/Accra",
  },
  {
    code: "TZ", name: "Tanzania", capital: "Dodoma", currency: "TZS",
    flag: "🇹🇿", region: "East Africa", population: 63000000,
    gdpBillionUsd: 67, tourismContributionPct: 17.2,
    majorEvents: ["Sauti za Busara", "Zanzibar International Film Festival", "Kilimanjaro Marathon"],
    languages: ["Swahili", "English"],
    timezone: "Africa/Dar_es_Salaam",
  },
  {
    code: "RW", name: "Rwanda", capital: "Kigali", currency: "RWF",
    flag: "🇷🇼", region: "East Africa", population: 14000000,
    gdpBillionUsd: 11, tourismContributionPct: 12.4,
    majorEvents: ["Kigali Jazz Junction", "Rwanda Mountain Gorilla Tracking", "Kwita Izina"],
    languages: ["Kinyarwanda", "French", "English"],
    timezone: "Africa/Kigali",
  },
  {
    code: "ET", name: "Ethiopia", capital: "Addis Ababa", currency: "ETB",
    flag: "🇪🇹", region: "East Africa", population: 120000000,
    gdpBillionUsd: 111, tourismContributionPct: 4.1,
    majorEvents: ["Timkat Festival", "Meskel Festival", "Addis Ababa International Film Festival"],
    languages: ["Amharic", "Oromo", "Tigrinya"],
    timezone: "Africa/Addis_Ababa",
  },
  {
    code: "EG", name: "Egypt", capital: "Cairo", currency: "EGP",
    flag: "🇪🇬", region: "North Africa", population: 104000000,
    gdpBillionUsd: 476, tourismContributionPct: 11.9,
    majorEvents: ["Cairo International Film Festival", "El Gouna Film Festival", "Luxor African Film Festival"],
    languages: ["Arabic"],
    timezone: "Africa/Cairo",
  },
  {
    code: "MA", name: "Morocco", capital: "Rabat", currency: "MAD",
    flag: "🇲🇦", region: "North Africa", population: 37000000,
    gdpBillionUsd: 142, tourismContributionPct: 7.1,
    majorEvents: ["Marrakech International Film Festival", "Gnaoua World Music Festival", "Fes Festival of World Sacred Music"],
    languages: ["Arabic", "Berber", "French"],
    timezone: "Africa/Casablanca",
  },
  {
    code: "SN", name: "Senegal", capital: "Dakar", currency: "XOF",
    flag: "🇸🇳", region: "West Africa", population: 17000000,
    gdpBillionUsd: 28, tourismContributionPct: 6.3,
    majorEvents: ["Dakar Rally", "Saint-Louis Jazz Festival", "FESMAN"],
    languages: ["French", "Wolof"],
    timezone: "Africa/Dakar",
  },
  {
    code: "CI", name: "Côte d'Ivoire", capital: "Yamoussoukro", currency: "XOF",
    flag: "🇨🇮", region: "West Africa", population: 27000000,
    gdpBillionUsd: 70, tourismContributionPct: 3.8,
    majorEvents: ["Abidjan Fashion Week", "MASA Festival", "Fête du Dipri"],
    languages: ["French", "Dioula"],
    timezone: "Africa/Abidjan",
  },
  {
    code: "UG", name: "Uganda", capital: "Kampala", currency: "UGX",
    flag: "🇺🇬", region: "East Africa", population: 48000000,
    gdpBillionUsd: 45, tourismContributionPct: 7.7,
    majorEvents: ["Nyege Nyege Festival", "Kampala City Festival", "Pearl of Africa Tourism Expo"],
    languages: ["English", "Swahili", "Luganda"],
    timezone: "Africa/Kampala",
  },
];

export const africaRouter = router({
  // Get all supported countries
  countries: publicProcedure.query(() => AFRICA_COUNTRIES),

  // Get a single country by code
  country: publicProcedure
    .input(z.object({ code: z.string().length(2) }))
    .query(({ input }) => {
      const country = AFRICA_COUNTRIES.find(
        (c) => c.code === input.code.toUpperCase()
      );
      if (!country) throw new Error(`Country ${input.code} not found`);
      return country;
    }),

  // Get tourism events (from DB + Go registry)
  events: publicProcedure
    .input(z.object({ country: z.string().length(2).optional() }).optional())
    .query(async ({ input }) => {
      // Try Go registry first, fall back to DB
      const registryData: any = await callRegistry(
        `/api/v1/events${input?.country ? `?country=${input.country}` : ""}`
      );
      if (registryData?.events?.length > 0) return registryData.events;

      return getTourismEvents(input?.country);
    }),

  // Get establishment stats per country
  countryStats: protectedProcedure
    .input(z.object({ country: z.string().length(2) }))
    .query(async ({ input }) => {
      const establishments = await getEstablishments({
        country: input.country,
        limit: 1000,
      });

      const byType: Record<string, number> = {};
      const byStatus: Record<string, number> = {};

      for (const est of establishments) {
        byType[est.type] = (byType[est.type] || 0) + 1;
        byStatus[est.kybStatus] = (byStatus[est.kybStatus] || 0) + 1;
      }

      return {
        country: input.country,
        totalEstablishments: establishments.length,
        byType,
        byStatus,
      };
    }),

  // Platform-wide dashboard stats
  dashboardStats: protectedProcedure.query(async () => {
    return getDashboardStats();
  }),

  // Get establishment list for a country
  establishments: protectedProcedure
    .input(
      z.object({
        country: z.string().length(2).optional(),
        kybStatus: z.string().optional(),
        type: z.string().optional(), // filter by establishment type e.g. hotel, safari_lodge
        limit: z.number().default(20),
        offset: z.number().default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      return getEstablishments(input);
    }),
});
