/**
 * Queue System Route — Proxies to Rust queue service (port 8083).
 * Falls back to in-memory seed data when service is unavailable.
 */
import { Router, Request, Response } from "express";

export const queueRouter = Router();

const QUEUE_SERVICE_URL = process.env.QUEUE_SERVICE_URL || "http://localhost:8083";

// ─── Seed Data ───────────────────────────────────────────────────
const SEED_QUEUE_ITEMS = [
  { id: "QI-001", type: "ticketing", priority: 1, pnr_locator: "AFR7X2", guest: "Amara Okonkwo", subject: "Issue e-ticket for Serena Nairobi", status: "open", assigned_to: "AGT-001", sla_deadline: "2026-06-11T17:30:00Z", created_at: "2026-06-11T17:00:00Z" },
  { id: "QI-002", type: "vip", priority: 1, pnr_locator: "RWD6P8", guest: "Chen Wei", subject: "Gorilla permit confirmation — VIP upgrade request", status: "open", assigned_to: "AGT-007", sla_deadline: "2026-06-11T17:15:00Z", created_at: "2026-06-11T17:00:00Z" },
  { id: "QI-003", type: "schedule_change", priority: 2, pnr_locator: "KEN4M9", guest: "Pierre Dubois", subject: "Migration game drive rescheduled to Aug 3", status: "open", assigned_to: "AGT-003", sla_deadline: "2026-06-11T19:00:00Z", created_at: "2026-06-11T17:00:00Z" },
  { id: "QI-004", type: "cancellation", priority: 2, pnr_locator: "LAG2N7", guest: "David Adeyemi", subject: "Process refund for cancelled Lagos booking", status: "in_progress", assigned_to: "AGT-008", sla_deadline: "2026-06-11T18:00:00Z", created_at: "2026-06-11T16:30:00Z" },
  { id: "QI-005", type: "waitlist", priority: 1, pnr_locator: "CPT3L5", guest: "Sarah van der Berg", subject: "Waitlist clearance — Table Mountain Hotel Dec peak", status: "open", assigned_to: null, sla_deadline: "2026-06-11T17:15:00Z", created_at: "2026-06-11T17:00:00Z" },
  { id: "QI-006", type: "group", priority: 3, pnr_locator: null, guest: "ATTA Consortium", subject: "Group block release — 50 rooms Serengeti conference", status: "open", assigned_to: "AGT-004", sla_deadline: "2026-06-12T17:00:00Z", created_at: "2026-06-11T10:00:00Z" },
  { id: "QI-007", type: "general", priority: 4, pnr_locator: "MAR5W3", guest: "Isabel Martinez", subject: "Dietary preference update — vegetarian meal plan", status: "open", assigned_to: null, sla_deadline: "2026-06-13T17:00:00Z", created_at: "2026-06-11T12:00:00Z" },
  { id: "QI-008", type: "ticketing", priority: 2, pnr_locator: "BOT9J4", guest: "James Thompson", subject: "Issue combined Okavango + Chobe ticket", status: "completed", assigned_to: "AGT-006", sla_deadline: "2026-06-11T16:30:00Z", created_at: "2026-06-11T15:00:00Z" },
  { id: "QI-009", type: "vip", priority: 1, pnr_locator: "ZAN8K1", guest: "Fatima Al-Rashid", subject: "Halal catering confirmation — multi-property", status: "in_progress", assigned_to: "AGT-005", sla_deadline: "2026-06-11T17:30:00Z", created_at: "2026-06-11T14:00:00Z" },
  { id: "QI-010", type: "schedule_change", priority: 3, pnr_locator: null, guest: "MTN Group", subject: "Wholesale rate adjustment — Q3 volume tier upgrade", status: "open", assigned_to: null, sla_deadline: "2026-06-12T10:00:00Z", created_at: "2026-06-11T09:00:00Z" },
  { id: "QI-011", type: "cancellation", priority: 1, pnr_locator: null, guest: "Tour Operator X", subject: "Partial cancellation — reduce block from 20 to 12 rooms", status: "open", assigned_to: "AGT-002", sla_deadline: "2026-06-11T18:00:00Z", created_at: "2026-06-11T15:30:00Z" },
  { id: "QI-012", type: "general", priority: 4, pnr_locator: null, guest: "System", subject: "Monthly commission reconciliation report ready", status: "open", assigned_to: null, sla_deadline: "2026-06-14T17:00:00Z", created_at: "2026-06-11T08:00:00Z" },
];

const SEED_STATS = {
  total_items: 156,
  urgent: 23,
  avg_wait: "4.2 min",
  breached: 2,
  by_type: {
    ticketing: { total: 34, open: 18, in_progress: 12, completed: 4 },
    schedule_change: { total: 22, open: 14, in_progress: 6, completed: 2 },
    cancellation: { total: 28, open: 15, in_progress: 9, completed: 4 },
    waitlist: { total: 19, open: 11, in_progress: 5, completed: 3 },
    vip: { total: 15, open: 8, in_progress: 5, completed: 2 },
    group: { total: 21, open: 12, in_progress: 7, completed: 2 },
    general: { total: 17, open: 9, in_progress: 5, completed: 3 },
  },
  agents_online: 12,
  avg_resolution_time: "18.5 min",
  sla_compliance: 94.2,
  source: "gds-gateway-seed",
};

// Proxy with fallback
async function proxyWithFallback(req: Request, res: Response, path: string, method: string, fallback: () => void) {
  try {
    const url = `${QUEUE_SERVICE_URL}${path}`;
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

// List queue items
queueRouter.get("/", (req, res) => {
  proxyWithFallback(req, res, `/api/v1/queues?${new URLSearchParams(req.query as Record<string, string>)}`, "GET", () => {
    const type = req.query.type as string;
    const items = type ? SEED_QUEUE_ITEMS.filter(i => i.type === type) : SEED_QUEUE_ITEMS;
    res.json({ items, total: items.length, source: "gds-gateway-seed" });
  });
});

// Get stats
queueRouter.get("/stats", (req, res) => {
  proxyWithFallback(req, res, "/api/v1/queues/stats", "GET", () => {
    res.json(SEED_STATS);
  });
});

// Create queue item
queueRouter.post("/", (req, res) => {
  proxyWithFallback(req, res, "/api/v1/queues", "POST", () => {
    const item = {
      id: `QI-${Date.now()}`,
      ...req.body,
      status: "open",
      assigned_to: null,
      created_at: new Date().toISOString(),
    };
    res.status(201).json(item);
  });
});

// Auto-assign
queueRouter.post("/auto-assign", (req, res) => {
  proxyWithFallback(req, res, "/api/v1/queues/auto-assign", "POST", () => {
    res.json({ assigned: 3, message: "Auto-assigned 3 items to available agents" });
  });
});

// Register agent
queueRouter.post("/agents", (req, res) => {
  proxyWithFallback(req, res, "/api/v1/queues/agents", "POST", () => {
    res.status(201).json({ agent_id: req.body.agent_id, status: "registered", queues: req.body.queues || ["general"] });
  });
});

// Assign item
queueRouter.post("/:id/assign", (req, res) => {
  proxyWithFallback(req, res, `/api/v1/queues/${req.params.id}/assign`, "POST", () => {
    res.json({ id: req.params.id, assigned_to: req.body.agent_id, status: "in_progress" });
  });
});

// Complete item
queueRouter.post("/:id/complete", (req, res) => {
  proxyWithFallback(req, res, `/api/v1/queues/${req.params.id}/complete`, "POST", () => {
    res.json({ id: req.params.id, status: "completed", resolved_at: new Date().toISOString() });
  });
});
