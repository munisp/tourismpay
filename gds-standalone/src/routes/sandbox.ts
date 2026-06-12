/**
 * GDS Developer Sandbox
 *
 * Provides a safe testing environment with:
 * - Sandbox API keys (prefix: gds_sandbox_)
 * - Pre-seeded mock data (properties, agents, reservations)
 * - Isolated from production data
 * - Rate-limited to prevent abuse
 * - Auto-reset capability (wipe and re-seed)
 * - Test card numbers for payment simulation
 * - Webhook testing endpoint (echo)
 */

import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";

const router = Router();

// ─── Sandbox API Key Management ───────────────────────────────────

interface SandboxKey {
  id: string;
  key: string;
  name: string;
  createdAt: string;
  expiresAt: string;
  tenantId: string;
  role: "agent" | "property_manager" | "admin";
  tokensRemaining: number;
  active: boolean;
}

const sandboxKeys = new Map<string, SandboxKey>();

// ─── Mock Data ────────────────────────────────────────────────────

const MOCK_PROPERTIES = [
  {
    id: "prop_sandbox_001",
    name: "Serengeti Sunrise Lodge",
    country_code: "TZ",
    city: "Serengeti",
    type: "safari_camp",
    star_rating: 5,
    description: "Luxury tented camp overlooking the Serengeti plains. Front-row seats to the Great Migration.",
    amenities: ["wifi", "pool", "spa", "restaurant", "game_drives", "hot_air_balloon"],
    base_rate_usd: 450,
    currency: "USD",
    rooms_total: 20,
    latitude: -2.3333,
    longitude: 34.8333,
    images: ["https://sandbox.gds.tourismpay.com/images/serengeti-lodge.jpg"],
    contact_email: "reservations@sandbox-serengeti.test",
    source: "direct",
  },
  {
    id: "prop_sandbox_002",
    name: "Cape Grace Boutique Hotel",
    country_code: "ZA",
    city: "Cape Town",
    type: "boutique",
    star_rating: 5,
    description: "Award-winning boutique hotel on the V&A Waterfront with Table Mountain views.",
    amenities: ["wifi", "pool", "spa", "restaurant", "bar", "concierge", "valet"],
    base_rate_usd: 320,
    currency: "ZAR",
    rooms_total: 120,
    latitude: -33.9083,
    longitude: 18.4208,
    images: ["https://sandbox.gds.tourismpay.com/images/cape-grace.jpg"],
    contact_email: "reservations@sandbox-capegrace.test",
    source: "direct",
  },
  {
    id: "prop_sandbox_003",
    name: "Masai Mara Safari Camp",
    country_code: "KE",
    city: "Masai Mara",
    type: "safari_camp",
    star_rating: 4,
    description: "Eco-friendly safari camp in the heart of the Masai Mara National Reserve.",
    amenities: ["wifi", "restaurant", "game_drives", "bush_walks", "cultural_visits"],
    base_rate_usd: 280,
    currency: "KES",
    rooms_total: 15,
    latitude: -1.5,
    longitude: 35.1,
    images: ["https://sandbox.gds.tourismpay.com/images/mara-camp.jpg"],
    contact_email: "book@sandbox-maracamp.test",
    source: "direct",
  },
  {
    id: "prop_sandbox_004",
    name: "Zanzibar Pearl Resort",
    country_code: "TZ",
    city: "Zanzibar",
    type: "resort",
    star_rating: 4,
    description: "Beachfront resort on the pristine white sands of Nungwi, Zanzibar.",
    amenities: ["wifi", "pool", "beach", "spa", "restaurant", "water_sports", "diving"],
    base_rate_usd: 200,
    currency: "USD",
    rooms_total: 80,
    latitude: -5.7264,
    longitude: 39.2945,
    images: ["https://sandbox.gds.tourismpay.com/images/zanzibar-pearl.jpg"],
    contact_email: "info@sandbox-zanzibar-pearl.test",
    source: "direct",
  },
  {
    id: "prop_sandbox_005",
    name: "Victoria Falls Safari Lodge",
    country_code: "ZW",
    city: "Victoria Falls",
    type: "lodge",
    star_rating: 4,
    description: "Overlooking the Zambezi National Park with views of visiting wildlife at the waterhole.",
    amenities: ["wifi", "pool", "restaurant", "bar", "game_drives", "bungee_jumping"],
    base_rate_usd: 350,
    currency: "USD",
    rooms_total: 72,
    latitude: -17.9243,
    longitude: 25.8572,
    images: ["https://sandbox.gds.tourismpay.com/images/vic-falls-lodge.jpg"],
    contact_email: "res@sandbox-vicfalls.test",
    source: "direct",
  },
  {
    id: "prop_sandbox_006",
    name: "Marrakech Riad Jardin",
    country_code: "MA",
    city: "Marrakech",
    type: "boutique",
    star_rating: 3,
    description: "Traditional riad in the Medina with courtyard garden and rooftop terrace.",
    amenities: ["wifi", "restaurant", "rooftop", "hammam", "cooking_classes"],
    base_rate_usd: 120,
    currency: "MAD",
    rooms_total: 8,
    latitude: 31.6295,
    longitude: -7.9811,
    images: ["https://sandbox.gds.tourismpay.com/images/marrakech-riad.jpg"],
    contact_email: "stay@sandbox-riad-jardin.test",
    source: "direct",
  },
  {
    id: "prop_sandbox_007",
    name: "Okavango Delta Camp",
    country_code: "BW",
    city: "Okavango Delta",
    type: "safari_camp",
    star_rating: 5,
    description: "Exclusive wilderness camp accessible only by light aircraft. Mokoro excursions included.",
    amenities: ["game_drives", "mokoro", "bush_walks", "star_gazing", "restaurant"],
    base_rate_usd: 800,
    currency: "BWP",
    rooms_total: 6,
    latitude: -19.5,
    longitude: 22.9,
    images: ["https://sandbox.gds.tourismpay.com/images/okavango-camp.jpg"],
    contact_email: "reservations@sandbox-okavango.test",
    source: "direct",
  },
  {
    id: "prop_sandbox_008",
    name: "Lagos Beach Hotel",
    country_code: "NG",
    city: "Lagos",
    type: "hotel",
    star_rating: 4,
    description: "Modern hotel on Victoria Island with ocean views and business facilities.",
    amenities: ["wifi", "pool", "gym", "restaurant", "conference", "bar", "concierge"],
    base_rate_usd: 180,
    currency: "NGN",
    rooms_total: 200,
    latitude: 6.4281,
    longitude: 3.4219,
    images: ["https://sandbox.gds.tourismpay.com/images/lagos-beach.jpg"],
    contact_email: "info@sandbox-lagosbeach.test",
    source: "direct",
  },
  {
    id: "prop_sandbox_009",
    name: "Kigali Hilltop Guesthouse",
    country_code: "RW",
    city: "Kigali",
    type: "guesthouse",
    star_rating: 3,
    description: "Charming guesthouse in Kigali with mountain views. Perfect base for gorilla trekking.",
    amenities: ["wifi", "restaurant", "garden", "airport_transfer", "gorilla_permits"],
    base_rate_usd: 95,
    currency: "RWF",
    rooms_total: 12,
    latitude: -1.9441,
    longitude: 29.8739,
    images: ["https://sandbox.gds.tourismpay.com/images/kigali-hilltop.jpg"],
    contact_email: "stay@sandbox-kigali-hilltop.test",
    source: "direct",
  },
  {
    id: "prop_sandbox_010",
    name: "Mauritius Blue Lagoon Villa",
    country_code: "MU",
    city: "Grand Baie",
    type: "villa",
    star_rating: 5,
    description: "Private beachfront villa with infinity pool, butler service, and coral reef snorkeling.",
    amenities: ["pool", "beach", "butler", "snorkeling", "spa", "chef", "yacht"],
    base_rate_usd: 1200,
    currency: "MUR",
    rooms_total: 4,
    latitude: -20.0125,
    longitude: 57.5893,
    images: ["https://sandbox.gds.tourismpay.com/images/mauritius-villa.jpg"],
    contact_email: "villa@sandbox-mauritius-lagoon.test",
    source: "direct",
  },
];

const MOCK_ROOM_TYPES = [
  { propertyId: "prop_sandbox_001", code: "STD", name: "Standard Tent", beds: "1 King", maxGuests: 2, baseRate: 450 },
  { propertyId: "prop_sandbox_001", code: "DLX", name: "Deluxe Tent", beds: "1 King + Daybed", maxGuests: 3, baseRate: 650 },
  { propertyId: "prop_sandbox_002", code: "STD", name: "Classic Room", beds: "1 Queen", maxGuests: 2, baseRate: 320 },
  { propertyId: "prop_sandbox_002", code: "STE", name: "Waterfront Suite", beds: "1 King + Lounge", maxGuests: 2, baseRate: 580 },
  { propertyId: "prop_sandbox_003", code: "STD", name: "Safari Tent", beds: "2 Twin", maxGuests: 2, baseRate: 280 },
  { propertyId: "prop_sandbox_004", code: "STD", name: "Ocean View Room", beds: "1 King", maxGuests: 2, baseRate: 200 },
  { propertyId: "prop_sandbox_004", code: "DLX", name: "Beach Villa", beds: "1 King + Pool", maxGuests: 4, baseRate: 400 },
  { propertyId: "prop_sandbox_005", code: "STD", name: "Standard Room", beds: "2 Twin", maxGuests: 2, baseRate: 350 },
  { propertyId: "prop_sandbox_006", code: "STD", name: "Riad Room", beds: "1 Double", maxGuests: 2, baseRate: 120 },
  { propertyId: "prop_sandbox_007", code: "DLX", name: "Delta Suite", beds: "1 King", maxGuests: 2, baseRate: 800 },
  { propertyId: "prop_sandbox_008", code: "STD", name: "City View", beds: "1 Queen", maxGuests: 2, baseRate: 180 },
  { propertyId: "prop_sandbox_008", code: "STE", name: "Ocean Suite", beds: "1 King + Lounge", maxGuests: 3, baseRate: 350 },
  { propertyId: "prop_sandbox_009", code: "STD", name: "Mountain View", beds: "1 Double", maxGuests: 2, baseRate: 95 },
  { propertyId: "prop_sandbox_010", code: "VIL", name: "Full Villa", beds: "4 Rooms", maxGuests: 8, baseRate: 1200 },
];

const MOCK_AGENTS = [
  {
    id: "agent_sandbox_001",
    agencyName: "Safari Dreams Travel",
    agentName: "Alice Wanjiku",
    email: "alice@sandbox-safaridreams.test",
    country: "KE",
    tier: "gold",
    commissionRate: 0.15,
    totalBookings: 145,
    totalCommission: 12500.00,
  },
  {
    id: "agent_sandbox_002",
    agencyName: "Cape Explorer Tours",
    agentName: "David Naidoo",
    email: "david@sandbox-capeexplorer.test",
    country: "ZA",
    tier: "silver",
    commissionRate: 0.12,
    totalBookings: 68,
    totalCommission: 5200.00,
  },
  {
    id: "agent_sandbox_003",
    agencyName: "Sahara Adventures",
    agentName: "Fatima Benali",
    email: "fatima@sandbox-sahara.test",
    country: "MA",
    tier: "bronze",
    commissionRate: 0.10,
    totalBookings: 22,
    totalCommission: 1800.00,
  },
];

const MOCK_RESERVATIONS = [
  {
    id: "res_sandbox_001",
    confirmationNo: "GDS-SB-000001",
    propertyId: "prop_sandbox_001",
    propertyName: "Serengeti Sunrise Lodge",
    roomTypeCode: "DLX",
    agentId: "agent_sandbox_001",
    guestName: "John Smith",
    guestEmail: "john.smith@sandbox.test",
    checkIn: "2025-08-01",
    checkOut: "2025-08-05",
    nights: 4,
    guests: 2,
    totalAmount: 2600.00,
    currency: "USD",
    commissionAmount: 390.00,
    status: "confirmed",
    createdAt: "2025-05-15T10:30:00Z",
  },
  {
    id: "res_sandbox_002",
    confirmationNo: "GDS-SB-000002",
    propertyId: "prop_sandbox_004",
    propertyName: "Zanzibar Pearl Resort",
    roomTypeCode: "DLX",
    agentId: "agent_sandbox_001",
    guestName: "Maria Garcia",
    guestEmail: "maria@sandbox.test",
    checkIn: "2025-09-10",
    checkOut: "2025-09-17",
    nights: 7,
    guests: 2,
    totalAmount: 2800.00,
    currency: "USD",
    commissionAmount: 420.00,
    status: "pending",
    createdAt: "2025-06-01T14:00:00Z",
  },
  {
    id: "res_sandbox_003",
    confirmationNo: "GDS-SB-000003",
    propertyId: "prop_sandbox_007",
    propertyName: "Okavango Delta Camp",
    roomTypeCode: "DLX",
    agentId: "agent_sandbox_002",
    guestName: "Hans Mueller",
    guestEmail: "hans@sandbox.test",
    checkIn: "2025-07-15",
    checkOut: "2025-07-18",
    nights: 3,
    guests: 2,
    totalAmount: 2400.00,
    currency: "USD",
    commissionAmount: 288.00,
    status: "confirmed",
    createdAt: "2025-04-20T09:00:00Z",
  },
];

// Test payment card numbers for sandbox
const TEST_CARDS = {
  success: { number: "4242424242424242", brand: "Visa", description: "Always succeeds" },
  declined: { number: "4000000000000002", brand: "Visa", description: "Always declined" },
  insufficient: { number: "4000000000009995", brand: "Visa", description: "Insufficient funds" },
  expired: { number: "4000000000000069", brand: "Visa", description: "Expired card" },
  processing: { number: "4000000000000119", brand: "Visa", description: "Processing error" },
  threeds: { number: "4000000000003220", brand: "Visa", description: "Requires 3D Secure" },
};

// ─── Routes ───────────────────────────────────────────────────────

// POST /api/v1/gds/sandbox/keys — Create a sandbox API key
router.post("/keys", (req: Request, res: Response) => {
  const { name, role = "agent" } = req.body;

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const keyId = randomUUID();
  const apiKey = `gds_sandbox_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const sandboxKey: SandboxKey = {
    id: keyId,
    key: apiKey,
    name,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    tenantId: `sandbox_${randomUUID().slice(0, 8)}`,
    role: role as SandboxKey["role"],
    tokensRemaining: 10_000, // sandbox plan
    active: true,
  };

  sandboxKeys.set(keyId, sandboxKey);

  res.status(201).json({
    id: sandboxKey.id,
    apiKey: sandboxKey.key,
    name: sandboxKey.name,
    role: sandboxKey.role,
    tenantId: sandboxKey.tenantId,
    expiresAt: sandboxKey.expiresAt,
    tokensRemaining: sandboxKey.tokensRemaining,
    usage: {
      baseUrl: "https://sandbox.gds.tourismpay.com",
      header: "X-GDS-API-Key",
      example: `curl -H "X-GDS-API-Key: ${sandboxKey.key}" https://sandbox.gds.tourismpay.com/api/v1/gds/search`,
    },
    note: "Sandbox keys are limited to 10,000 tokens/month. Data is pre-seeded and isolated from production.",
  });
});

// GET /api/v1/gds/sandbox/keys — List sandbox API keys
router.get("/keys", (_req: Request, res: Response) => {
  const keys = Array.from(sandboxKeys.values()).map((k) => ({
    id: k.id,
    name: k.name,
    role: k.role,
    createdAt: k.createdAt,
    expiresAt: k.expiresAt,
    active: k.active,
    tokensRemaining: k.tokensRemaining,
    keyPrefix: k.key.slice(0, 16) + "...",
  }));
  res.json({ keys });
});

// DELETE /api/v1/gds/sandbox/keys/:id — Revoke a sandbox key
router.delete("/keys/:id", (req: Request, res: Response) => {
  const key = sandboxKeys.get(req.params.id);
  if (!key) {
    res.status(404).json({ error: "Sandbox key not found" });
    return;
  }
  key.active = false;
  res.json({ success: true, message: "Sandbox key revoked" });
});

// GET /api/v1/gds/sandbox/data — Get all sandbox mock data
router.get("/data", (_req: Request, res: Response) => {
  res.json({
    properties: MOCK_PROPERTIES,
    roomTypes: MOCK_ROOM_TYPES,
    agents: MOCK_AGENTS,
    reservations: MOCK_RESERVATIONS,
    countries: ["KE", "ZA", "TZ", "NG", "GH", "RW", "UG", "ET", "MA", "EG", "BW", "NA", "ZW", "MU", "MZ", "SN", "CI", "CM", "TN", "MG"],
    stats: {
      totalProperties: MOCK_PROPERTIES.length,
      totalAgents: MOCK_AGENTS.length,
      totalReservations: MOCK_RESERVATIONS.length,
      countriesCovered: new Set(MOCK_PROPERTIES.map((p) => p.country_code)).size,
    },
  });
});

// GET /api/v1/gds/sandbox/data/properties — Sandbox properties
router.get("/data/properties", (req: Request, res: Response) => {
  let results = [...MOCK_PROPERTIES];
  const { country, type } = req.query;
  if (country) results = results.filter((p) => p.country_code === country);
  if (type) results = results.filter((p) => p.type === type);
  res.json({ properties: results, total: results.length });
});

// GET /api/v1/gds/sandbox/data/properties/:id — Single sandbox property
router.get("/data/properties/:id", (req: Request, res: Response) => {
  const property = MOCK_PROPERTIES.find((p) => p.id === req.params.id);
  if (!property) {
    res.status(404).json({ error: "Sandbox property not found" });
    return;
  }
  const roomTypes = MOCK_ROOM_TYPES.filter((r) => r.propertyId === property.id);
  res.json({ property, roomTypes });
});

// GET /api/v1/gds/sandbox/data/agents — Sandbox agents
router.get("/data/agents", (_req: Request, res: Response) => {
  res.json({ agents: MOCK_AGENTS });
});

// GET /api/v1/gds/sandbox/data/reservations — Sandbox reservations
router.get("/data/reservations", (_req: Request, res: Response) => {
  res.json({ reservations: MOCK_RESERVATIONS });
});

// POST /api/v1/gds/sandbox/reset — Reset sandbox to initial state
router.post("/reset", (_req: Request, res: Response) => {
  sandboxKeys.clear();
  res.json({
    success: true,
    message: "Sandbox reset to initial state. All custom keys revoked. Mock data restored.",
    data: {
      properties: MOCK_PROPERTIES.length,
      agents: MOCK_AGENTS.length,
      reservations: MOCK_RESERVATIONS.length,
    },
  });
});

// GET /api/v1/gds/sandbox/test-cards — Test payment card numbers
router.get("/test-cards", (_req: Request, res: Response) => {
  res.json({
    cards: TEST_CARDS,
    note: "Use these card numbers in sandbox mode for payment testing. Any expiry date in the future and any 3-digit CVC will work.",
    expiryDate: "Any future date (e.g., 12/30)",
    cvc: "Any 3 digits (e.g., 123)",
  });
});

// POST /api/v1/gds/sandbox/webhooks/test — Test webhook delivery
router.post("/webhooks/test", (req: Request, res: Response) => {
  const { url, event = "reservation.created" } = req.body;

  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  const payload = {
    id: `evt_sandbox_${randomUUID().slice(0, 8)}`,
    type: event,
    timestamp: new Date().toISOString(),
    sandbox: true,
    data: event === "reservation.created"
      ? MOCK_RESERVATIONS[0]
      : event === "reservation.cancelled"
        ? { ...MOCK_RESERVATIONS[0], status: "cancelled", cancelReason: "Guest request" }
        : { event, message: "Sandbox test event" },
  };

  // Attempt delivery (fire-and-forget)
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-GDS-Signature": "sandbox_test_signature", "X-GDS-Event": event },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  })
    .then((r) => {
      res.json({ success: true, statusCode: r.status, eventId: payload.id, payload });
    })
    .catch((err) => {
      res.json({ success: false, error: `Delivery failed: ${(err as Error).message}`, eventId: payload.id, payload });
    });
});

// GET /api/v1/gds/sandbox/guide — Developer quick-start guide
router.get("/guide", (_req: Request, res: Response) => {
  res.json({
    title: "Africa GDS Developer Sandbox — Quick Start",
    steps: [
      {
        step: 1,
        title: "Create a sandbox API key",
        method: "POST",
        endpoint: "/api/v1/gds/sandbox/keys",
        body: { name: "My Test App", role: "agent" },
        description: "Creates a sandbox API key with 10,000 tokens/month.",
      },
      {
        step: 2,
        title: "Search properties",
        method: "GET",
        endpoint: "/api/v1/gds/search?destination=Serengeti",
        headers: { "X-GDS-API-Key": "gds_sandbox_YOUR_KEY" },
        description: "Search 10 pre-seeded African properties.",
      },
      {
        step: 3,
        title: "Check availability",
        method: "GET",
        endpoint: "/api/v1/gds/availability/check?propertyId=prop_sandbox_001&roomType=DLX&checkIn=2025-08-01&checkOut=2025-08-05&rooms=1",
        description: "All sandbox properties have availability for any future date.",
      },
      {
        step: 4,
        title: "Create a reservation",
        method: "POST",
        endpoint: "/api/v1/gds/reservations",
        body: {
          propertyId: "prop_sandbox_001",
          roomTypeCode: "DLX",
          checkIn: "2025-08-01",
          checkOut: "2025-08-05",
          guests: 2,
          guestName: "Test Guest",
          guestEmail: "test@sandbox.test",
        },
        description: "Sandbox reservations always succeed. No real charges.",
      },
      {
        step: 5,
        title: "Test webhooks",
        method: "POST",
        endpoint: "/api/v1/gds/sandbox/webhooks/test",
        body: { url: "https://your-app.com/webhooks", event: "reservation.created" },
        description: "Sends a test webhook payload to your URL.",
      },
      {
        step: 6,
        title: "Check usage",
        method: "GET",
        endpoint: "/api/v1/gds/metering/usage",
        description: "View token consumption and remaining quota.",
      },
    ],
    sdks: {
      typescript: 'npm install @tourismpay/gds-sdk',
      python: 'pip install africa-gds-sdk',
      go: 'go get github.com/tourismpay/gds-sdk-go',
    },
    limits: {
      tokensPerMonth: 10_000,
      maxProperties: 10,
      maxAgents: 3,
      maxReservations: "unlimited (sandbox)",
      dataRetention: "30 days, then auto-reset",
    },
    support: {
      docs: "https://docs.gds.tourismpay.com",
      email: "developers@tourismpay.com",
      slack: "https://tourismpay-developers.slack.com",
    },
  });
});

export default router;
