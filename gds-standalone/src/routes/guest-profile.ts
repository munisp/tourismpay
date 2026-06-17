/**
 * Guest Profile CRM Route — Proxies to Go guest-profile service (port 8084).
 * Falls back to in-memory seed data when service is unavailable.
 */
import { Router, Request, Response } from "express";

export const guestProfileRouter = Router();

const GUEST_SERVICE_URL = process.env.GUEST_SERVICE_URL || "http://localhost:8084";

// ─── Seed Data ───────────────────────────────────────────────────
const SEED_GUESTS = [
  {
    id: "GST-001", first_name: "Amara", last_name: "Okonkwo", name: "Amara Okonkwo",
    email: "amara@safaritravel.ng", phone: "+2348012345678", nationality: "NG",
    tier: "Gold", loyalty_points: 28400, total_stays: 12, total_spend: 18750,
    preferences: { room_type: "suite", floor: "high", pillow: "firm", dietary: "none", temperature: 22 },
    corporate_id: null, travel_policy: null,
    created_at: "2024-03-15T10:00:00Z",
  },
  {
    id: "GST-002", first_name: "Pierre", last_name: "Dubois", name: "Pierre Dubois",
    email: "pierre@voyageafrique.fr", phone: "+33612345678", nationality: "FR",
    tier: "Platinum", loyalty_points: 62300, total_stays: 34, total_spend: 89200,
    preferences: { room_type: "deluxe", floor: "any", pillow: "soft", dietary: "vegetarian", temperature: 20 },
    corporate_id: "CORP-003", travel_policy: "UN Geneva",
    created_at: "2023-01-20T08:00:00Z",
  },
  {
    id: "GST-003", first_name: "Fatima", last_name: "Al-Rashid", name: "Fatima Al-Rashid",
    email: "fatima@gulftravel.ae", phone: "+971501234567", nationality: "AE",
    tier: "Gold", loyalty_points: 35600, total_stays: 8, total_spend: 42800,
    preferences: { room_type: "suite", floor: "high", pillow: "medium", dietary: "halal", temperature: 21 },
    corporate_id: null, travel_policy: null,
    created_at: "2024-06-10T14:00:00Z",
  },
  {
    id: "GST-004", first_name: "Sarah", last_name: "van der Berg", name: "Sarah van der Berg",
    email: "sarah@capetownluxury.co.za", phone: "+27821234567", nationality: "ZA",
    tier: "Silver", loyalty_points: 12800, total_stays: 5, total_spend: 9200,
    preferences: { room_type: "standard", floor: "low", pillow: "firm", dietary: "none", temperature: 23 },
    corporate_id: null, travel_policy: null,
    created_at: "2025-02-18T12:00:00Z",
  },
  {
    id: "GST-005", first_name: "Chen", last_name: "Wei", name: "Chen Wei",
    email: "chen@asiatravelgroup.cn", phone: "+8613812345678", nationality: "CN",
    tier: "Platinum", loyalty_points: 78900, total_stays: 42, total_spend: 156000,
    preferences: { room_type: "villa", floor: "any", pillow: "firm", dietary: "none", temperature: 22 },
    corporate_id: "CORP-001", travel_policy: "Safaricom Premium",
    created_at: "2022-09-05T06:00:00Z",
  },
  {
    id: "GST-006", first_name: "David", last_name: "Adeyemi", name: "David Adeyemi",
    email: "david@lagosluxe.ng", phone: "+2347012345678", nationality: "NG",
    tier: "Bronze", loyalty_points: 4200, total_stays: 3, total_spend: 5400,
    preferences: { room_type: "standard", floor: "any", pillow: "soft", dietary: "none", temperature: 24 },
    corporate_id: null, travel_policy: null,
    created_at: "2025-11-01T09:00:00Z",
  },
  {
    id: "GST-007", first_name: "Isabel", last_name: "Martinez", name: "Isabel Martinez",
    email: "isabel@iberiatravel.es", phone: "+34612345678", nationality: "ES",
    tier: "Silver", loyalty_points: 15400, total_stays: 7, total_spend: 12600,
    preferences: { room_type: "deluxe", floor: "high", pillow: "medium", dietary: "none", temperature: 21 },
    corporate_id: null, travel_policy: null,
    created_at: "2024-08-22T16:00:00Z",
  },
  {
    id: "GST-008", first_name: "James", last_name: "Thompson", name: "James Thompson",
    email: "thompson@ukholidays.co.uk", phone: "+447712345678", nationality: "GB",
    tier: "Gold", loyalty_points: 31200, total_stays: 15, total_spend: 34800,
    preferences: { room_type: "suite", floor: "any", pillow: "firm", dietary: "none", temperature: 20 },
    corporate_id: null, travel_policy: null,
    created_at: "2024-01-10T11:00:00Z",
  },
  {
    id: "GST-009", first_name: "Kwame", last_name: "Asante", name: "Kwame Asante",
    email: "kwame@ghanatours.gh", phone: "+233241234567", nationality: "GH",
    tier: "Gold", loyalty_points: 22100, total_stays: 18, total_spend: 21400,
    preferences: { room_type: "standard", floor: "low", pillow: "soft", dietary: "none", temperature: 25 },
    corporate_id: "CORP-004", travel_policy: "ATTA Consortium",
    created_at: "2023-05-14T07:00:00Z",
  },
  {
    id: "GST-010", first_name: "Amina", last_name: "Uwimana", name: "Amina Uwimana",
    email: "amina@rwandatourism.rw", phone: "+250781234567", nationality: "RW",
    tier: "Platinum", loyalty_points: 54700, total_stays: 28, total_spend: 67200,
    preferences: { room_type: "deluxe", floor: "high", pillow: "medium", dietary: "none", temperature: 22 },
    corporate_id: "CORP-005", travel_policy: "Rwanda Tourism Board",
    created_at: "2023-02-28T13:00:00Z",
  },
];

// Proxy with fallback
async function proxyWithFallback(req: Request, res: Response, path: string, method: string, fallback: () => void) {
  try {
    const url = `${GUEST_SERVICE_URL}${path}`;
    const options: RequestInit = {
      method,
      headers: { "Content-Type": "application/json", "X-GDS-Tenant-ID": req.headers["x-gds-tenant-id"] as string || "" },
    };
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

// Search profiles (with seed data fallback)
guestProfileRouter.get("/search", (req, res) => {
  const q = (req.query.q as string || "").toLowerCase();
  const limit = parseInt(req.query.limit as string) || 10;
  proxyWithFallback(req, res, `/api/v1/guests/search?${new URLSearchParams(req.query as Record<string, string>)}`, "GET", () => {
    const results = q
      ? SEED_GUESTS.filter(g => g.name.toLowerCase().includes(q) || g.email.toLowerCase().includes(q) || g.nationality.toLowerCase().includes(q))
      : SEED_GUESTS;
    res.json({ guests: results.slice(0, limit), total: results.length, source: "gds-gateway-seed" });
  });
});

// Corporate accounts
guestProfileRouter.get("/corporates", (req, res) => {
  proxyWithFallback(req, res, "/api/v1/corporates/", "GET", () => {
    const corporates = SEED_GUESTS.filter(g => g.corporate_id);
    res.json({ corporates: corporates.map(g => ({
      id: g.corporate_id, guest_name: g.name, travel_policy: g.travel_policy,
      tier: g.tier, total_stays: g.total_stays, total_spend: g.total_spend,
    })), total: corporates.length });
  });
});
guestProfileRouter.post("/corporates", (req, res) => {
  proxyWithFallback(req, res, "/api/v1/corporates/", "POST", () => {
    res.status(201).json({ id: `CORP-${Date.now()}`, ...req.body, status: "active" });
  });
});

// Create profile
guestProfileRouter.post("/", (req, res) => {
  proxyWithFallback(req, res, "/api/v1/guests/", "POST", () => {
    const guest = {
      id: `GST-${Date.now()}`,
      first_name: req.body.first_name || "",
      last_name: req.body.last_name || "",
      name: `${req.body.first_name || ""} ${req.body.last_name || ""}`.trim(),
      email: req.body.email || "",
      phone: req.body.phone || "",
      nationality: req.body.nationality || "",
      tier: "Bronze",
      loyalty_points: 0,
      total_stays: 0,
      total_spend: 0,
      preferences: req.body.preferences || {},
      created_at: new Date().toISOString(),
    };
    res.status(201).json(guest);
  });
});

// Get profile
guestProfileRouter.get("/:id", (req, res) => {
  proxyWithFallback(req, res, `/api/v1/guests/${req.params.id}`, "GET", () => {
    const guest = SEED_GUESTS.find(g => g.id === req.params.id);
    if (guest) res.json(guest);
    else res.status(404).json({ error: "Guest not found" });
  });
});

// Update preferences
guestProfileRouter.put("/:id/preferences", (req, res) => {
  proxyWithFallback(req, res, `/api/v1/guests/${req.params.id}/preferences`, "PUT", () => {
    const guest = SEED_GUESTS.find(g => g.id === req.params.id);
    if (!guest) return res.status(404).json({ error: "Guest not found" });
    Object.assign(guest.preferences, req.body);
    res.json(guest);
  });
});

// Add stay record
guestProfileRouter.post("/:id/stays", (req, res) => {
  proxyWithFallback(req, res, `/api/v1/guests/${req.params.id}/stays`, "POST", () => {
    res.status(201).json({ guest_id: req.params.id, stay: req.body, message: "Stay recorded" });
  });
});
