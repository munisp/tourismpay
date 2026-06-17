/**
 * Group Bookings Route — Proxies to Go group-bookings service (port 8087).
 * Falls back to in-memory seed data when service is unavailable.
 */
import { Router, Request, Response } from "express";

export const groupBookingsRouter = Router();

const GROUP_SERVICE_URL = process.env.GROUP_SERVICE_URL || "http://localhost:8087";

// ─── Seed Data ───────────────────────────────────────────────────
const SEED_GROUPS = [
  {
    id: "GRP-001", name: "ATTA East Africa Summit 2026", type: "conference", status: "confirmed",
    property: "Serena Nairobi", property_id: "PROP-001",
    rooms_blocked: 50, rooms_picked_up: 42, attrition_rate: 0.84,
    check_in: "2026-09-15", check_out: "2026-09-18", rate: 185,
    contact: { name: "Dr. Kwame Asante", email: "kwame@atta.travel", phone: "+233241234567" },
    rooming_list: Array.from({ length: 42 }, (_, i) => ({ room: i + 1, guest: `Delegate ${i + 1}`, status: "confirmed" })),
    attrition_schedule: [
      { cutoff_date: "2026-07-15", min_pickup: 0.80, current: 0.84, status: "passed" },
      { cutoff_date: "2026-08-15", min_pickup: 0.60, current: 0.84, status: "passed" },
      { cutoff_date: "2026-09-01", min_pickup: 0.40, current: 0.84, status: "passed" },
    ],
    created_at: "2026-03-01T10:00:00Z",
  },
  {
    id: "GRP-002", name: "Okonkwo-Ngugi Wedding", type: "wedding", status: "confirmed",
    property: "Zanzibar Beach Resort", property_id: "PROP-003",
    rooms_blocked: 30, rooms_picked_up: 24, attrition_rate: 0.80,
    check_in: "2026-10-20", check_out: "2026-10-24", rate: 280,
    contact: { name: "Amara Okonkwo", email: "amara@wedding.ng", phone: "+2348012345678" },
    rooming_list: Array.from({ length: 24 }, (_, i) => ({ room: i + 1, guest: `Guest ${i + 1}`, status: "confirmed" })),
    attrition_schedule: [
      { cutoff_date: "2026-08-20", min_pickup: 0.90, current: 0.80, status: "at_risk" },
      { cutoff_date: "2026-09-20", min_pickup: 0.75, current: 0.80, status: "passed" },
      { cutoff_date: "2026-10-06", min_pickup: 0.50, current: 0.80, status: "passed" },
    ],
    created_at: "2026-04-15T14:00:00Z",
  },
  {
    id: "GRP-003", name: "Migration Photo Tour Series", type: "tour_series", status: "confirmed",
    property: "Mara Serena Safari Lodge", property_id: "PROP-002",
    rooms_blocked: 15, rooms_picked_up: 15, attrition_rate: 1.0,
    check_in: "2026-08-01", check_out: "2026-08-07", rate: 420,
    contact: { name: "Pierre Dubois", email: "pierre@voyageafrique.fr", phone: "+33612345678" },
    rooming_list: Array.from({ length: 15 }, (_, i) => ({ room: i + 1, guest: `Photographer ${i + 1}`, status: "confirmed" })),
    attrition_schedule: [
      { cutoff_date: "2026-06-01", min_pickup: 0.85, current: 1.0, status: "passed" },
      { cutoff_date: "2026-07-01", min_pickup: 0.70, current: 1.0, status: "passed" },
      { cutoff_date: "2026-07-15", min_pickup: 0.45, current: 1.0, status: "passed" },
    ],
    created_at: "2026-01-20T08:00:00Z",
  },
  {
    id: "GRP-004", name: "Cape United FC Pre-Season Camp", type: "sports_team", status: "confirmed",
    property: "Table Mountain Hotel", property_id: "PROP-004",
    rooms_blocked: 25, rooms_picked_up: 25, attrition_rate: 1.0,
    check_in: "2026-07-10", check_out: "2026-07-20", rate: 350,
    contact: { name: "Coach van der Berg", email: "team@capeunited.co.za", phone: "+27821234567" },
    rooming_list: Array.from({ length: 25 }, (_, i) => ({ room: i + 1, guest: `Player/Staff ${i + 1}`, status: "confirmed" })),
    attrition_schedule: [
      { cutoff_date: "2026-05-10", min_pickup: 0.95, current: 1.0, status: "passed" },
      { cutoff_date: "2026-06-10", min_pickup: 0.85, current: 1.0, status: "passed" },
      { cutoff_date: "2026-06-26", min_pickup: 0.70, current: 1.0, status: "passed" },
    ],
    created_at: "2026-02-15T12:00:00Z",
  },
  {
    id: "GRP-005", name: "Safaricom Leadership Retreat", type: "corporate_retreat", status: "provisional",
    property: "Bisate Lodge", property_id: "PROP-005",
    rooms_blocked: 12, rooms_picked_up: 8, attrition_rate: 0.67,
    check_in: "2026-11-05", check_out: "2026-11-08", rate: 1100,
    contact: { name: "Jennifer Kimani", email: "jennifer@safaricom.co.ke", phone: "+254712345678" },
    rooming_list: Array.from({ length: 8 }, (_, i) => ({ room: i + 1, guest: `Executive ${i + 1}`, status: "confirmed" })),
    attrition_schedule: [
      { cutoff_date: "2026-09-05", min_pickup: 0.80, current: 0.67, status: "at_risk" },
      { cutoff_date: "2026-10-05", min_pickup: 0.60, current: 0.67, status: "passed" },
      { cutoff_date: "2026-10-22", min_pickup: 0.40, current: 0.67, status: "passed" },
    ],
    created_at: "2026-05-01T09:00:00Z",
  },
  {
    id: "GRP-006", name: "Morocco Incentive Trip — MTN Gold Club", type: "incentive_travel", status: "confirmed",
    property: "La Mamounia Marrakech", property_id: "PROP-006",
    rooms_blocked: 40, rooms_picked_up: 36, attrition_rate: 0.90,
    check_in: "2026-10-10", check_out: "2026-10-15", rate: 480,
    contact: { name: "Grace Mensah", email: "grace@mtn.com.gh", phone: "+233201234567" },
    rooming_list: Array.from({ length: 36 }, (_, i) => ({ room: i + 1, guest: `Winner ${i + 1}`, status: "confirmed" })),
    attrition_schedule: [
      { cutoff_date: "2026-08-10", min_pickup: 0.75, current: 0.90, status: "passed" },
      { cutoff_date: "2026-09-10", min_pickup: 0.55, current: 0.90, status: "passed" },
      { cutoff_date: "2026-09-26", min_pickup: 0.35, current: 0.90, status: "passed" },
    ],
    created_at: "2026-04-01T16:00:00Z",
  },
];

// Proxy with fallback
async function proxyWithFallback(req: Request, res: Response, path: string, method: string, fallback: () => void) {
  try {
    const url = `${GROUP_SERVICE_URL}${path}`;
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

// List groups
groupBookingsRouter.get("/", (req, res) => {
  proxyWithFallback(req, res, `/api/v1/groups/?${new URLSearchParams(req.query as Record<string, string>)}`, "GET", () => {
    const type = req.query.type as string;
    const groups = type ? SEED_GROUPS.filter(g => g.type === type) : SEED_GROUPS;
    res.json({ groups, total: groups.length, source: "gds-gateway-seed" });
  });
});

// Create group
groupBookingsRouter.post("/", (req, res) => {
  proxyWithFallback(req, res, "/api/v1/groups/", "POST", () => {
    const group = {
      id: `GRP-${Date.now()}`,
      ...req.body,
      status: "provisional",
      rooms_picked_up: 0,
      attrition_rate: 0,
      rooming_list: [],
      created_at: new Date().toISOString(),
    };
    res.status(201).json(group);
  });
});

// Get group
groupBookingsRouter.get("/:id", (req, res) => {
  proxyWithFallback(req, res, `/api/v1/groups/${req.params.id}`, "GET", () => {
    const group = SEED_GROUPS.find(g => g.id === req.params.id);
    if (group) res.json(group);
    else res.status(404).json({ error: "Group not found" });
  });
});

// Add rooming entry
groupBookingsRouter.post("/:id/rooming", (req, res) => {
  proxyWithFallback(req, res, `/api/v1/groups/${req.params.id}/rooming`, "POST", () => {
    res.status(201).json({ group_id: req.params.id, entry: req.body, message: "Rooming entry added" });
  });
});

// Get attrition status
groupBookingsRouter.get("/:id/attrition", (req, res) => {
  proxyWithFallback(req, res, `/api/v1/groups/${req.params.id}/attrition`, "GET", () => {
    const group = SEED_GROUPS.find(g => g.id === req.params.id);
    if (!group) return res.status(404).json({ error: "Group not found" });
    res.json({
      group_id: group.id,
      rooms_blocked: group.rooms_blocked,
      rooms_picked_up: group.rooms_picked_up,
      attrition_rate: group.attrition_rate,
      schedule: group.attrition_schedule,
      source: "gds-gateway-seed",
    });
  });
});

// Washdown (release rooms)
groupBookingsRouter.post("/:id/washdown", (req, res) => {
  proxyWithFallback(req, res, `/api/v1/groups/${req.params.id}/washdown`, "POST", () => {
    const group = SEED_GROUPS.find(g => g.id === req.params.id);
    if (!group) return res.status(404).json({ error: "Group not found" });
    const released = group.rooms_blocked - group.rooms_picked_up;
    res.json({ group_id: group.id, rooms_released: released, rooms_remaining: group.rooms_picked_up, message: `Released ${released} rooms back to inventory` });
  });
});
