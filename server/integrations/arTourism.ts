/**
 * AR Tourism — Augmented Reality experiences for African tourism.
 *
 * Provides server-side support for:
 * - AR experience catalog (landmarks, cultural sites, heritage trails)
 * - Geospatial anchors for AR content placement
 * - AR content delivery (3D models, overlays, information cards)
 * - Experience tracking and analytics
 *
 * The client uses WebXR API (browser) or ARKit/ARCore (native mobile).
 * This module manages the content and anchor data.
 */
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { logger } from "../_core/logger";

// ─── AR Experience Types ─────────────────────────────────────────────────────

export interface ARExperience {
  id: string;
  name: string;
  description: string;
  category: "landmark" | "cultural_site" | "heritage_trail" | "wildlife" | "market" | "restaurant";
  country: string;
  city: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  radius: number; // activation radius in meters
  modelUrl?: string; // 3D model URL (glTF/GLB)
  overlayImageUrl?: string;
  infoCards: Array<{
    title: string;
    content: string;
    imageUrl?: string;
    audioUrl?: string;
    language: string;
  }>;
  difficulty: "easy" | "moderate" | "advanced";
  duration: number; // estimated minutes
  active: boolean;
  createdAt: string;
}

// ─── Seed AR Experiences ─────────────────────────────────────────────────────

const AR_EXPERIENCES: ARExperience[] = [
  {
    id: "ar-001",
    name: "Maasai Mara Sunset Safari",
    description: "AR overlay showing wildlife migration patterns and Maasai cultural landmarks in real-time.",
    category: "wildlife",
    country: "Kenya",
    city: "Narok",
    latitude: -1.4061,
    longitude: 35.0143,
    radius: 5000,
    infoCards: [
      { title: "The Great Migration", content: "Over 1.5 million wildebeest cross between Tanzania and Kenya annually. Point your camera at the plains to see historical migration paths.", language: "en" },
      { title: "Maasai Culture", content: "The Maasai people have coexisted with wildlife for centuries. AR markers show traditional village layouts and ceremonial sites.", language: "en" },
    ],
    difficulty: "easy",
    duration: 45,
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "ar-002",
    name: "Cape Town Heritage Walk",
    description: "Walk through Bo-Kaap and District Six with AR overlays showing historical buildings and stories.",
    category: "heritage_trail",
    country: "South Africa",
    city: "Cape Town",
    latitude: -33.9222,
    longitude: 18.4113,
    radius: 2000,
    infoCards: [
      { title: "Bo-Kaap", content: "The colorful houses of Bo-Kaap date back to the 1760s. AR shows original building layouts and resident stories.", language: "en" },
      { title: "District Six", content: "Over 60,000 residents were forcibly removed during apartheid. AR markers show locations of demolished homes.", language: "en" },
    ],
    difficulty: "easy",
    duration: 90,
    active: true,
    createdAt: "2026-01-15T00:00:00Z",
  },
  {
    id: "ar-003",
    name: "Zanzibar Spice Tour AR",
    description: "Point your camera at spice plants to learn about Zanzibar's spice trade history and modern cultivation.",
    category: "cultural_site",
    country: "Tanzania",
    city: "Stone Town",
    latitude: -6.1622,
    longitude: 39.1921,
    radius: 3000,
    infoCards: [
      { title: "Spice Island", content: "Zanzibar produces cloves, nutmeg, cinnamon, and black pepper. AR identifies plants and shows trade routes.", language: "en" },
      { title: "Stone Town", content: "UNESCO World Heritage Site blending African, Arab, Indian, and European influences. AR overlays show historical layers.", language: "en" },
    ],
    difficulty: "easy",
    duration: 60,
    active: true,
    createdAt: "2026-02-01T00:00:00Z",
  },
  {
    id: "ar-004",
    name: "Pyramids of Giza Time Travel",
    description: "See the pyramids as they were 4,500 years ago — with original limestone casing and gold capstones.",
    category: "landmark",
    country: "Egypt",
    city: "Giza",
    latitude: 29.9792,
    longitude: 31.1342,
    radius: 1000,
    infoCards: [
      { title: "Great Pyramid of Khufu", content: "Originally 146.6 meters tall with smooth white limestone casing. AR shows the original appearance.", language: "en" },
      { title: "Sphinx", content: "Originally painted in bright colors. AR overlay reveals the Sphinx as ancient Egyptians saw it.", language: "en" },
    ],
    difficulty: "easy",
    duration: 120,
    active: true,
    createdAt: "2026-02-15T00:00:00Z",
  },
  {
    id: "ar-005",
    name: "Lagos Market Navigator",
    description: "Navigate Balogun Market with AR wayfinding, merchant ratings, and price comparison overlays.",
    category: "market",
    country: "Nigeria",
    city: "Lagos",
    latitude: 6.4541,
    longitude: 3.3947,
    radius: 500,
    infoCards: [
      { title: "Balogun Market", content: "One of the largest markets in West Africa. AR shows stall locations, specialties, and TourismPay merchant acceptance.", language: "en" },
      { title: "Bargaining Tips", content: "Start at 40% of the asking price. AR overlays show fair price ranges for common items.", language: "en" },
    ],
    difficulty: "moderate",
    duration: 120,
    active: true,
    createdAt: "2026-03-01T00:00:00Z",
  },
  {
    id: "ar-006",
    name: "Marrakech Medina Guide",
    description: "AR navigation through the labyrinthine streets of the Marrakech medina with historical overlays.",
    category: "heritage_trail",
    country: "Morocco",
    city: "Marrakech",
    latitude: 31.6295,
    longitude: -7.9811,
    radius: 2000,
    infoCards: [
      { title: "Jemaa el-Fna", content: "UNESCO-listed square. AR shows historical events and identifies street performers and food stalls.", language: "en" },
      { title: "Bahia Palace", content: "19th century palace with intricate tilework. AR reveals hidden architectural details.", language: "en" },
    ],
    difficulty: "moderate",
    duration: 150,
    active: true,
    createdAt: "2026-03-15T00:00:00Z",
  },
];

// ─── Router ──────────────────────────────────────────────────────────────────

export const arTourismRouter = router({
  /** List all AR experiences, optionally filtered by location. */
  list: publicProcedure
    .input(z.object({
      country: z.string().optional(),
      category: z.enum(["landmark", "cultural_site", "heritage_trail", "wildlife", "market", "restaurant"]).optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      radiusKm: z.number().optional(),
    }).optional())
    .query(({ input }) => {
      let results = AR_EXPERIENCES.filter((e) => e.active);
      if (input?.country) results = results.filter((e) => e.country.toLowerCase() === input.country!.toLowerCase());
      if (input?.category) results = results.filter((e) => e.category === input.category);
      if (input?.latitude && input?.longitude && input?.radiusKm) {
        results = results.filter((e) => {
          const dist = haversineKm(input.latitude!, input.longitude!, e.latitude, e.longitude);
          return dist <= input.radiusKm!;
        });
      }
      return { experiences: results, total: results.length };
    }),

  /** Get a single AR experience by ID. */
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const exp = AR_EXPERIENCES.find((e) => e.id === input.id);
      if (!exp) return null;
      return exp;
    }),

  /** Get nearby AR experiences based on device GPS. */
  nearby: publicProcedure
    .input(z.object({ latitude: z.number(), longitude: z.number(), radiusKm: z.number().default(10) }))
    .query(({ input }) => {
      const nearby = AR_EXPERIENCES
        .filter((e) => e.active)
        .map((e) => ({
          ...e,
          distanceKm: haversineKm(input.latitude, input.longitude, e.latitude, e.longitude),
        }))
        .filter((e) => e.distanceKm <= input.radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm);
      return { experiences: nearby, total: nearby.length };
    }),

  /** Record that a user started an AR experience (analytics). */
  startExperience: protectedProcedure
    .input(z.object({ experienceId: z.string(), deviceType: z.enum(["webxr", "arkit", "arcore"]) }))
    .mutation(({ input, ctx }) => {
      logger.info("[AR] Experience started", { userId: ctx.user.id, ...input });
      return { started: true, experienceId: input.experienceId };
    }),

  /** Record experience completion. */
  completeExperience: protectedProcedure
    .input(z.object({ experienceId: z.string(), durationMinutes: z.number(), rating: z.number().min(1).max(5).optional() }))
    .mutation(({ input, ctx }) => {
      logger.info("[AR] Experience completed", { userId: ctx.user.id, ...input });
      return { completed: true, experienceId: input.experienceId, loyaltyPointsEarned: input.durationMinutes * 2 };
    }),

  /** WebXR configuration for the browser client. */
  webxrConfig: publicProcedure.query(() => ({
    requiredFeatures: ["local-floor", "hit-test"],
    optionalFeatures: ["dom-overlay", "light-estimation", "anchors", "plane-detection"],
    domOverlay: { root: "#ar-overlay" },
    depthSensing: { usagePreference: ["cpu-optimized"], dataFormatPreference: ["luminance-alpha"] },
    supportedSessionTypes: ["immersive-ar", "inline"],
    fallbackMode: "2d-overlay", // For devices without WebXR
  })),
});

// ─── Haversine Distance ──────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
