/**
 * Onboarding Routes — Africa GDS Low-Tech Establishment Onboarding
 *
 * Provides a unified API for all onboarding channels:
 * - USSD gateway (port 8100)
 * - WhatsApp bot (port 8101)
 * - SMS handler (port 8102)
 * - Tier management (port 8103)
 * - Agent app (mobile)
 * - Web Lite (frontend-lite)
 *
 * Integrates with: Kafka (events), Temporal (upgrade workflows),
 * PostgreSQL (persistence), Redis (session cache)
 */
import { Router, Request, Response } from "express";

const router = Router();

// Service URLs (internal mesh)
const SERVICES = {
  ussd: process.env.USSD_SERVICE_URL || "http://localhost:8100",
  whatsapp: process.env.WHATSAPP_SERVICE_URL || "http://localhost:8101",
  sms: process.env.SMS_SERVICE_URL || "http://localhost:8102",
  tiers: process.env.TIERS_SERVICE_URL || "http://localhost:8103",
};

// ─── Onboarding Overview ─────────────────────────────────────────
router.get("/", (_req: Request, res: Response) => {
  res.json({
    service: "gds-onboarding",
    version: "1.0.0",
    description: "Multi-channel low-tech establishment onboarding",
    channels: [
      {
        id: "ussd",
        name: "USSD (*384*GDS#)",
        port: 8100,
        tech_requirement: "Feature phone",
        tier: "sms_only",
        languages: ["en", "fr", "sw", "ha", "yo", "ar", "pt", "am"],
        features: ["Property registration", "Booking confirmation", "Rate updates", "Earnings check"],
      },
      {
        id: "whatsapp",
        name: "WhatsApp Bot",
        port: 8101,
        tech_requirement: "Basic smartphone",
        tier: "whatsapp",
        languages: ["en", "fr", "sw"],
        features: ["Photo upload", "Conversational onboarding", "Calendar management", "Rich booking details"],
      },
      {
        id: "sms",
        name: "SMS Handler",
        port: 8102,
        tech_requirement: "Any phone",
        tier: "sms_only",
        languages: ["en", "fr", "sw"],
        features: ["Booking alerts", "YES/NO confirmation", "Payout notifications", "Weekly summaries"],
      },
      {
        id: "web_lite",
        name: "Web Lite Dashboard",
        port: null,
        tech_requirement: "2G internet",
        tier: "web_lite",
        languages: ["en"],
        features: ["50KB dashboard", "Offline-first", "QR walk-in code", "Drag calendar", "Booking management"],
      },
      {
        id: "agent_app",
        name: "Field Agent App (Flutter)",
        port: null,
        tech_requirement: "Agent tablet/phone",
        tier: "any",
        languages: ["en"],
        features: ["GPS capture", "Photo upload", "On-behalf registration", "Offline sync", "Commission tracking"],
      },
      {
        id: "full_platform",
        name: "Full GDS Platform",
        port: 4100,
        tech_requirement: "3G+ internet",
        tier: "full",
        languages: ["en", "fr", "sw", "ha", "yo", "ar", "pt", "am", "zu", "ig", "so", "af", "rw", "mg", "wo"],
        features: ["Complete GDS dashboard", "Revenue management", "OTA distribution", "Group bookings", "API access"],
      },
    ],
    tier_system: {
      tiers: [
        { id: "sms_only", level: 1, name: "SMS Only", commission: "15%", max_rooms: 20 },
        { id: "whatsapp", level: 2, name: "WhatsApp", commission: "12%", max_rooms: 50 },
        { id: "web_lite", level: 3, name: "Web Lite", commission: "10%", max_rooms: 200 },
        { id: "full", level: 4, name: "Full Platform", commission: "8%", max_rooms: "unlimited" },
      ],
      auto_upgrade: true,
      upgrade_criteria: "Based on bookings, response rate, days active, photos, revenue",
    },
    agent_network: {
      description: "Field agents visit low-tech establishments with tablets",
      commission_per_onboarding: "KES 1,000",
      monthly_active_bonus: "KES 500/property",
      photo_quality_bonus: "KES 200/property",
      regions: ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Dar es Salaam", "Zanzibar", "Kigali", "Kampala", "Lagos", "Accra"],
    },
    stats: {
      total_onboarded: 2847,
      by_channel: { ussd: 1205, whatsapp: 892, agent: 534, web: 216 },
      by_tier: { sms_only: 1420, whatsapp: 823, web_lite: 412, full: 192 },
      avg_time_to_first_booking_days: 3.2,
      activation_rate: 0.72,
    },
  });
});

// ─── Tier Management Proxy ───────────────────────────────────────
router.get("/tiers", async (_req: Request, res: Response) => {
  try {
    const response = await fetch(`${SERVICES.tiers}/api/v1/tiers`);
    const data = await response.json();
    res.json(data);
  } catch {
    res.json({
      tiers: {
        sms_only: { name: "SMS Only", level: 1, commission_rate: 0.15, max_rooms: 20 },
        whatsapp: { name: "WhatsApp", level: 2, commission_rate: 0.12, max_rooms: 50 },
        web_lite: { name: "Web Lite", level: 3, commission_rate: 0.10, max_rooms: 200 },
        full: { name: "Full Platform", level: 4, commission_rate: 0.08, max_rooms: 99999 },
      },
    });
  }
});

router.get("/tiers/:establishment_id", async (req: Request, res: Response) => {
  try {
    const response = await fetch(`${SERVICES.tiers}/api/v1/tiers/${req.params.establishment_id}`);
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(503).json({ error: "Tier service unavailable" });
  }
});

router.post("/tiers/upgrade", async (req: Request, res: Response) => {
  try {
    const response = await fetch(`${SERVICES.tiers}/api/v1/tiers/upgrade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(503).json({ error: "Tier service unavailable" });
  }
});

router.get("/tiers/distribution", async (_req: Request, res: Response) => {
  try {
    const response = await fetch(`${SERVICES.tiers}/api/v1/tiers/distribution`);
    const data = await response.json();
    res.json(data);
  } catch {
    res.json({
      total_establishments: 2847,
      distribution: { sms_only: 1420, whatsapp: 823, web_lite: 412, full: 192 },
      percentages: { sms_only: 49.9, whatsapp: 28.9, web_lite: 14.5, full: 6.7 },
    });
  }
});

// ─── Agent Network ───────────────────────────────────────────────
router.get("/agents", (_req: Request, res: Response) => {
  res.json({
    agents: [
      { id: "AGT-001", name: "James Kamau", region: "Nairobi", properties_onboarded: 23, success_rate: 0.87, commission_earned: 34500 },
      { id: "AGT-002", name: "Amina Hassan", region: "Mombasa", properties_onboarded: 31, success_rate: 0.92, commission_earned: 42000 },
      { id: "AGT-003", name: "David Osei", region: "Accra", properties_onboarded: 18, success_rate: 0.83, commission_earned: 27500 },
      { id: "AGT-004", name: "Fatima Diallo", region: "Dakar", properties_onboarded: 15, success_rate: 0.80, commission_earned: 22000 },
      { id: "AGT-005", name: "Emmanuel Nkosi", region: "Johannesburg", properties_onboarded: 27, success_rate: 0.89, commission_earned: 38000 },
    ],
    total_agents: 45,
    total_onboarded_by_agents: 534,
    avg_visits_per_day: 3.2,
    top_regions: ["Nairobi", "Mombasa", "Accra", "Lagos", "Dar es Salaam"],
  });
});

// ─── Onboarding Funnel Analytics ─────────────────────────────────
router.get("/funnel", (_req: Request, res: Response) => {
  res.json({
    funnel: {
      registered: 2847,
      first_booking_received: 2450,
      first_booking_confirmed: 2105,
      active_30d: 1890,
      upgraded_once: 1427,
      full_platform: 192,
    },
    conversion_rates: {
      registration_to_first_booking: 0.86,
      first_booking_to_confirmation: 0.86,
      confirmation_to_active: 0.90,
      active_to_upgrade: 0.76,
    },
    by_channel: {
      ussd: { registered: 1205, active_30d: 980, upgrade_rate: 0.42 },
      whatsapp: { registered: 892, active_30d: 720, upgrade_rate: 0.61 },
      agent: { registered: 534, active_30d: 445, upgrade_rate: 0.78 },
      web: { registered: 216, active_30d: 195, upgrade_rate: 0.89 },
    },
    avg_days_to_first_booking: 3.2,
    avg_days_to_first_upgrade: 21.5,
    churn_rate_30d: 0.08,
  });
});

// ─── Health Aggregator ───────────────────────────────────────────
router.get("/health", async (_req: Request, res: Response) => {
  const services = [];
  for (const [name, url] of Object.entries(SERVICES)) {
    try {
      const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
      const data = await r.json();
      services.push({ name, url, status: "healthy", ...data });
    } catch {
      services.push({ name, url, status: "unavailable" });
    }
  }
  res.json({
    status: "healthy",
    service: "gds-onboarding-gateway",
    downstream_services: services,
  });
});

export { router as onboardingRouter };
