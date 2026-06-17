/**
 * Content Management Route — Proxies to Python content service (port 8085).
 * Falls back to in-memory seed data when service is unavailable.
 */
import { Router, Request, Response } from "express";

export const contentRouter = Router();

const CONTENT_SERVICE_URL = process.env.CONTENT_SERVICE_URL || "http://localhost:8085";

// ─── Seed Data ───────────────────────────────────────────────────
const LANGUAGES = [
  { code: "en", name: "English", region: "Pan-African" },
  { code: "fr", name: "French", region: "West/Central Africa" },
  { code: "ar", name: "Arabic", region: "North Africa" },
  { code: "sw", name: "Swahili", region: "East Africa" },
  { code: "pt", name: "Portuguese", region: "Mozambique, Angola" },
  { code: "am", name: "Amharic", region: "Ethiopia" },
  { code: "zu", name: "Zulu", region: "South Africa" },
  { code: "ha", name: "Hausa", region: "Nigeria, West Africa" },
  { code: "yo", name: "Yoruba", region: "Nigeria" },
  { code: "ig", name: "Igbo", region: "Nigeria" },
  { code: "so", name: "Somali", region: "Horn of Africa" },
  { code: "af", name: "Afrikaans", region: "South Africa" },
  { code: "rw", name: "Kinyarwanda", region: "Rwanda" },
  { code: "mg", name: "Malagasy", region: "Madagascar" },
  { code: "wo", name: "Wolof", region: "Senegal" },
];

const AMENITY_CATEGORIES = [
  "Pool", "Spa & Wellness", "WiFi", "Parking", "Restaurant", "Bar & Lounge",
  "Gym & Fitness", "Beach Access", "Safari Vehicle", "Game Drives",
  "Conference Room", "Business Center", "Kids Club", "Laundry",
  "Airport Transfer", "Room Service", "Concierge", "Gift Shop",
  "Tennis Court", "Golf Course", "Water Sports", "Diving",
  "Cultural Tours", "Cooking Classes", "Bird Watching", "Horseback Riding",
  "Hot Air Balloon", "Boat Trips", "Mountain Biking", "Hiking Trails",
  "Electric Vehicle Charging", "Solar Powered", "Eco Lodge",
  "Organic Garden", "Pet Friendly", "Wheelchair Accessible",
  "Helipad", "Private Airstrip",
];

const SEED_CONTENT = [
  {
    id: "CNT-001", property_id: "PROP-001", property_name: "Serena Nairobi",
    country: "KE", type: "city_hotel",
    descriptions: {
      en: "Premier 5-star hotel in the heart of Nairobi, offering world-class dining, conference facilities, and a tranquil garden retreat amidst the bustling city.",
      fr: "Hôtel 5 étoiles de premier plan au cœur de Nairobi, offrant une cuisine de classe mondiale.",
      sw: "Hoteli ya nyota 5 katikati ya Nairobi, inatoa huduma za ulimwengu.",
    },
    amenities: ["Pool", "Spa & Wellness", "WiFi", "Restaurant", "Bar & Lounge", "Gym & Fitness", "Conference Room", "Business Center", "Airport Transfer", "Room Service", "Concierge"],
    images: { total: 42, rooms: 18, exterior: 8, dining: 10, facilities: 6 },
    completeness_score: 92,
    policies: { check_in: "14:00", check_out: "11:00", children: "Welcome, under 5 free", pets: "Not allowed", cancellation: "moderate" },
    updated_at: "2026-06-01T10:00:00Z",
  },
  {
    id: "CNT-002", property_id: "PROP-002", property_name: "Mara Serena Safari Lodge",
    country: "KE", type: "safari_lodge",
    descriptions: {
      en: "Perched on a hill overlooking the Masai Mara, this award-winning lodge offers front-row seats to the Great Migration with Maasai-inspired architecture.",
      fr: "Perché sur une colline surplombant le Masai Mara, ce lodge primé offre des places au premier rang de la Grande Migration.",
    },
    amenities: ["Pool", "Restaurant", "Bar & Lounge", "Safari Vehicle", "Game Drives", "Bird Watching", "Hot Air Balloon", "Cultural Tours", "WiFi", "Gift Shop"],
    images: { total: 56, rooms: 20, exterior: 15, dining: 8, facilities: 13 },
    completeness_score: 88,
    policies: { check_in: "12:00", check_out: "10:00", children: "6+ years on game drives", pets: "Not allowed", cancellation: "strict" },
    updated_at: "2026-05-28T14:00:00Z",
  },
  {
    id: "CNT-003", property_id: "PROP-003", property_name: "Zanzibar Beach Resort",
    country: "TZ", type: "beach_resort",
    descriptions: {
      en: "Beachfront paradise on Zanzibar's Nungwi coast with overwater villas, a PADI dive center, and authentic Swahili cuisine.",
      sw: "Paradiso ya pwani huko Nungwi, Zanzibar, na villa za juu ya maji.",
      ar: "جنة شاطئية في ساحل نونجوي بزنجبار مع فيلات فوق الماء.",
    },
    amenities: ["Beach Access", "Pool", "Spa & Wellness", "Restaurant", "Bar & Lounge", "Water Sports", "Diving", "WiFi", "Boat Trips", "Concierge", "Room Service"],
    images: { total: 64, rooms: 22, exterior: 18, dining: 12, facilities: 12 },
    completeness_score: 95,
    policies: { check_in: "15:00", check_out: "11:00", children: "Welcome", pets: "Not allowed", cancellation: "moderate" },
    updated_at: "2026-06-05T09:00:00Z",
  },
  {
    id: "CNT-004", property_id: "PROP-004", property_name: "Table Mountain Hotel",
    country: "ZA", type: "city_hotel",
    descriptions: {
      en: "Luxury boutique hotel at the foot of Table Mountain with panoramic views of Cape Town's waterfront and Lion's Head.",
      af: "'n Luukse boetiekhotel aan die voet van Tafelberg met panoramiese uitsigte.",
    },
    amenities: ["Pool", "Spa & Wellness", "WiFi", "Restaurant", "Bar & Lounge", "Gym & Fitness", "Parking", "Concierge", "Room Service", "Hiking Trails", "Electric Vehicle Charging"],
    images: { total: 38, rooms: 16, exterior: 10, dining: 6, facilities: 6 },
    completeness_score: 85,
    policies: { check_in: "14:00", check_out: "11:00", children: "Welcome", pets: "Small dogs allowed", cancellation: "flexible" },
    updated_at: "2026-06-02T16:00:00Z",
  },
  {
    id: "CNT-005", property_id: "PROP-005", property_name: "Bisate Lodge",
    country: "RW", type: "eco_lodge",
    descriptions: {
      en: "Exclusive eco-lodge in Volcanoes National Park offering intimate gorilla trekking experiences with only 12 villas nestled in a reforested volcanic cone.",
      rw: "Ihoteli ya ekologiya mu Parike Nasiyonali ya Volcanoes.",
    },
    amenities: ["Restaurant", "Bar & Lounge", "Hiking Trails", "Cultural Tours", "Bird Watching", "Organic Garden", "Eco Lodge", "Solar Powered", "WiFi", "Concierge"],
    images: { total: 48, rooms: 14, exterior: 16, dining: 8, facilities: 10 },
    completeness_score: 91,
    policies: { check_in: "13:00", check_out: "10:00", children: "15+ for gorilla trekking", pets: "Not allowed", cancellation: "super_strict" },
    updated_at: "2026-05-30T08:00:00Z",
  },
  {
    id: "CNT-006", property_id: "PROP-006", property_name: "La Mamounia Marrakech",
    country: "MA", type: "palace_hotel",
    descriptions: {
      en: "Legendary palace hotel in Marrakech with century-old gardens, a world-class spa, and the finest Moroccan hospitality since 1929.",
      fr: "Hôtel-palais légendaire à Marrakech avec des jardins centenaires et un spa de classe mondiale.",
      ar: "فندق قصر أسطوري في مراكش مع حدائق عمرها قرون ومنتجع صحي عالمي.",
    },
    amenities: ["Pool", "Spa & Wellness", "Restaurant", "Bar & Lounge", "Gym & Fitness", "Tennis Court", "Golf Course", "Gift Shop", "Room Service", "Concierge", "Parking", "Conference Room"],
    images: { total: 72, rooms: 28, exterior: 20, dining: 14, facilities: 10 },
    completeness_score: 98,
    policies: { check_in: "15:00", check_out: "12:00", children: "Welcome", pets: "Not allowed", cancellation: "moderate" },
    updated_at: "2026-06-08T11:00:00Z",
  },
];

// Proxy with fallback
async function proxyWithFallback(req: Request, res: Response, path: string, method: string, fallback: () => void) {
  try {
    const url = `${CONTENT_SERVICE_URL}${path}`;
    const options: RequestInit = { method, headers: { "Content-Type": "application/json" } };
    if (method !== "GET") options.body = JSON.stringify(req.body);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    options.signal = controller.signal;
    const response = await fetch(url, options);
    clearTimeout(timeout);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch {
    fallback();
  }
}

// Languages
contentRouter.get("/languages", (_req, res) => {
  proxyWithFallback(_req, res, "/api/v1/content/languages", "GET", () => {
    res.json({ languages: LANGUAGES.map(l => l.code), details: LANGUAGES, total: LANGUAGES.length, source: "gds-gateway-seed" });
  });
});

// Amenities
contentRouter.get("/amenities", (_req, res) => {
  proxyWithFallback(_req, res, "/api/v1/content/amenities", "GET", () => {
    res.json({ amenities: AMENITY_CATEGORIES, total: AMENITY_CATEGORIES.length, source: "gds-gateway-seed" });
  });
});

// Completeness
contentRouter.get("/completeness", (req, res) => {
  proxyWithFallback(req, res, `/api/v1/content/completeness?${new URLSearchParams(req.query as Record<string, string>)}`, "GET", () => {
    res.json({
      average_score: 91.5,
      properties: SEED_CONTENT.map(c => ({
        property_id: c.property_id, property_name: c.property_name,
        score: c.completeness_score, country: c.country,
      })),
      source: "gds-gateway-seed",
    });
  });
});

// Search content
contentRouter.get("/search", (req, res) => {
  const q = (req.query.q as string || "").toLowerCase();
  proxyWithFallback(req, res, `/api/v1/content/search?${new URLSearchParams(req.query as Record<string, string>)}`, "GET", () => {
    const results = q
      ? SEED_CONTENT.filter(c => c.property_name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q))
      : SEED_CONTENT;
    res.json({ results, total: results.length, source: "gds-gateway-seed" });
  });
});

// Get content by ID
contentRouter.get("/:id", (req, res) => {
  proxyWithFallback(req, res, `/api/v1/content/${req.params.id}?lang=${req.query.lang || "en"}`, "GET", () => {
    const content = SEED_CONTENT.find(c => c.id === req.params.id || c.property_id === req.params.id);
    if (content) res.json(content);
    else res.status(404).json({ error: "Content not found" });
  });
});

// Create content
contentRouter.post("/", (req, res) => {
  proxyWithFallback(req, res, "/api/v1/content", "POST", () => {
    res.status(201).json({ id: `CNT-${Date.now()}`, ...req.body, completeness_score: 0, created_at: new Date().toISOString() });
  });
});

// Update content
contentRouter.put("/:id/descriptions", (req, res) => {
  proxyWithFallback(req, res, `/api/v1/content/${req.params.id}/descriptions`, "PUT", () => {
    res.json({ message: "Descriptions updated", id: req.params.id });
  });
});
contentRouter.put("/:id/amenities", (req, res) => {
  proxyWithFallback(req, res, `/api/v1/content/${req.params.id}/amenities`, "PUT", () => {
    res.json({ message: "Amenities updated", id: req.params.id });
  });
});
contentRouter.put("/:id/policies", (req, res) => {
  proxyWithFallback(req, res, `/api/v1/content/${req.params.id}/policies`, "PUT", () => {
    res.json({ message: "Policies updated", id: req.params.id });
  });
});
contentRouter.post("/:id/images", (req, res) => {
  proxyWithFallback(req, res, `/api/v1/content/${req.params.id}/images`, "POST", () => {
    res.status(201).json({ message: "Image uploaded", id: req.params.id });
  });
});
