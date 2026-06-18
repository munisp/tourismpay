/**
 * PNR Engine Route — Proxies to Go PNR service (port 8082).
 * Falls back to in-memory seed data when service is unavailable.
 */
import { Router, Request, Response } from "express";

export const pnrRouter = Router();

const PNR_SERVICE_URL = process.env.PNR_SERVICE_URL || "http://localhost:8082";

// ─── Seed Data ───────────────────────────────────────────────────
const SEED_PNRS = [
  {
    id: "pnr-001", record_locator: "AFR7X2", locator: "AFR7X2",
    guest_name: "Amara Okonkwo", contact_email: "amara@safaritravel.ng",
    agency_id: "AGY-001", agent_id: "AGT-001",
    status: "CONFIRMED", ticketing_status: "ISSUED",
    segments: [
      { type: "hotel", property: "Serena Nairobi", check_in: "2026-07-15", check_out: "2026-07-18", status: "HK", rooms: 1, rate: 220 },
      { type: "transfer", from: "JKIA Airport", to: "Serena Nairobi", date: "2026-07-15", status: "HK" },
    ],
    remarks: [{ type: "general", text: "VIP guest — early check-in requested" }],
    created_at: "2026-06-01T10:30:00Z",
  },
  {
    id: "pnr-002", record_locator: "KEN4M9", locator: "KEN4M9",
    guest_name: "Pierre Dubois", contact_email: "pierre@voyageafrique.fr",
    agency_id: "AGY-002", agent_id: "AGT-003",
    status: "CONFIRMED", ticketing_status: "ISSUED",
    segments: [
      { type: "hotel", property: "Mara Serena Safari Lodge", check_in: "2026-08-01", check_out: "2026-08-05", status: "HK", rooms: 2, rate: 450 },
      { type: "activity", name: "Great Migration Game Drive", date: "2026-08-02", status: "HK" },
      { type: "activity", name: "Hot Air Balloon Safari", date: "2026-08-03", status: "HK" },
    ],
    remarks: [{ type: "corporate", text: "Safaricom Corporate Program — 25% discount applied" }],
    created_at: "2026-06-03T14:20:00Z",
  },
  {
    id: "pnr-003", record_locator: "ZAN8K1", locator: "ZAN8K1",
    guest_name: "Fatima Al-Rashid", contact_email: "fatima@gulftravel.ae",
    agency_id: "AGY-003", agent_id: "AGT-005",
    status: "CONFIRMED", ticketing_status: "PENDING",
    segments: [
      { type: "hotel", property: "Zanzibar Beach Resort", check_in: "2026-09-10", check_out: "2026-09-17", status: "HK", rooms: 1, rate: 320 },
      { type: "hotel", property: "Ngorongoro Crater Lodge", check_in: "2026-09-17", check_out: "2026-09-20", status: "HK", rooms: 1, rate: 580 },
      { type: "transfer", from: "Zanzibar Airport", to: "Beach Resort", date: "2026-09-10", status: "HK" },
    ],
    remarks: [{ type: "dietary", text: "Halal meals required throughout" }],
    created_at: "2026-06-05T09:15:00Z",
  },
  {
    id: "pnr-004", record_locator: "CPT3L5", locator: "CPT3L5",
    guest_name: "Sarah van der Berg", contact_email: "sarah@capetownluxury.co.za",
    agency_id: "AGY-001", agent_id: "AGT-002",
    status: "WAITLISTED", ticketing_status: "ON_REQUEST",
    segments: [
      { type: "hotel", property: "Table Mountain Hotel", check_in: "2026-12-20", check_out: "2026-12-27", status: "HL", rooms: 1, rate: 400 },
      { type: "car", provider: "Avis Cape Town", pickup: "2026-12-20", dropoff: "2026-12-27", status: "HK" },
    ],
    remarks: [{ type: "general", text: "Peak season — waitlist for room upgrade" }],
    created_at: "2026-06-07T16:45:00Z",
  },
  {
    id: "pnr-005", record_locator: "RWD6P8", locator: "RWD6P8",
    guest_name: "Chen Wei", contact_email: "chen@asiatravelgroup.cn",
    agency_id: "AGY-004", agent_id: "AGT-007",
    status: "CONFIRMED", ticketing_status: "ISSUED",
    segments: [
      { type: "hotel", property: "Bisate Lodge", check_in: "2026-07-20", check_out: "2026-07-23", status: "HK", rooms: 1, rate: 1200 },
      { type: "activity", name: "Gorilla Trekking Permit", date: "2026-07-21", status: "HK" },
      { type: "activity", name: "Golden Monkey Trek", date: "2026-07-22", status: "HK" },
      { type: "insurance", provider: "Africa Travel Shield", coverage: "comprehensive", status: "HK" },
    ],
    remarks: [{ type: "general", text: "Mandarin-speaking guide requested" }],
    created_at: "2026-06-08T11:00:00Z",
  },
  {
    id: "pnr-006", record_locator: "LAG2N7", locator: "LAG2N7",
    guest_name: "David Adeyemi", contact_email: "david@lagosluxe.ng",
    agency_id: "AGY-005", agent_id: "AGT-008",
    status: "CANCELLED", ticketing_status: "VOID",
    segments: [
      { type: "hotel", property: "Eko Suites Lagos", check_in: "2026-06-15", check_out: "2026-06-18", status: "XX", rooms: 2, rate: 180 },
    ],
    remarks: [{ type: "cancellation", text: "Cancelled due to travel restriction — full refund processed" }],
    created_at: "2026-06-02T08:30:00Z",
  },
  {
    id: "pnr-007", record_locator: "MAR5W3", locator: "MAR5W3",
    guest_name: "Isabel Martinez", contact_email: "isabel@iberiatravel.es",
    agency_id: "AGY-002", agent_id: "AGT-004",
    status: "CONFIRMED", ticketing_status: "ISSUED",
    segments: [
      { type: "hotel", property: "La Mamounia Marrakech", check_in: "2026-10-05", check_out: "2026-10-10", status: "HK", rooms: 1, rate: 550 },
      { type: "activity", name: "Sahara Desert Excursion (2 nights)", date: "2026-10-07", status: "HK" },
      { type: "transfer", from: "Marrakech Airport", to: "La Mamounia", date: "2026-10-05", status: "HK" },
    ],
    remarks: [{ type: "general", text: "Anniversary trip — room with garden view" }],
    created_at: "2026-06-09T13:20:00Z",
  },
  {
    id: "pnr-008", record_locator: "BOT9J4", locator: "BOT9J4",
    guest_name: "James & Emily Thompson", contact_email: "thompson@ukholidays.co.uk",
    agency_id: "AGY-003", agent_id: "AGT-006",
    status: "CONFIRMED", ticketing_status: "ISSUED",
    segments: [
      { type: "hotel", property: "Belmond Eagle Island Lodge", check_in: "2026-08-15", check_out: "2026-08-19", status: "HK", rooms: 1, rate: 950 },
      { type: "hotel", property: "Chobe Game Lodge", check_in: "2026-08-19", check_out: "2026-08-22", status: "HK", rooms: 1, rate: 680 },
      { type: "activity", name: "Mokoro Canoe Safari", date: "2026-08-16", status: "HK" },
      { type: "activity", name: "Chobe River Cruise", date: "2026-08-20", status: "HK" },
    ],
    remarks: [{ type: "general", text: "Honeymoon package — champagne welcome" }],
    created_at: "2026-06-10T10:00:00Z",
  },
];

let pnrStore = [...SEED_PNRS];

// Proxy helper with fallback
async function proxyWithFallback(req: Request, res: Response, path: string, method: string, fallback: () => void) {
  try {
    const url = `${PNR_SERVICE_URL}${path}`;
    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-GDS-Tenant-ID": req.headers["x-gds-tenant-id"] as string || "",
        "X-GDS-Agent-ID": req.headers["x-gds-agent-id"] as string || "",
      },
    };
    if (method !== "GET" && method !== "DELETE") {
      options.body = JSON.stringify(req.body);
    }
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

// List PNRs (seed data fallback)
pnrRouter.get("/", (req, res) => {
  proxyWithFallback(req, res, "/api/v1/pnr/", "GET", () => {
    res.json({
      pnrs: pnrStore,
      total: pnrStore.length,
      source: "gds-gateway-seed",
    });
  });
});

// Search PNRs
pnrRouter.get("/search", (req, res) => {
  const q = (req.query.q as string || "").toLowerCase();
  const results = pnrStore.filter(p =>
    p.guest_name.toLowerCase().includes(q) ||
    p.locator.toLowerCase().includes(q) ||
    p.contact_email.toLowerCase().includes(q)
  );
  res.json({ pnrs: results, total: results.length });
});

// Create PNR
pnrRouter.post("/", (req, res) => {
  proxyWithFallback(req, res, "/api/v1/pnr/", "POST", () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let locator = "";
    for (let i = 0; i < 6; i++) locator += chars.charAt(Math.floor(Math.random() * chars.length));
    const pnr = {
      id: `pnr-${Date.now()}`,
      record_locator: locator,
      locator,
      guest_name: req.body.guest_name || "Guest",
      contact_email: req.body.contact_email || "",
      agency_id: req.body.agency_id || "",
      agent_id: req.body.agent_id || "",
      status: "CONFIRMED",
      ticketing_status: "PENDING",
      segments: [],
      remarks: [],
      created_at: new Date().toISOString(),
    };
    pnrStore.unshift(pnr);
    res.status(201).json(pnr);
  });
});

// Get PNR by locator
pnrRouter.get("/:locator", (req, res) => {
  proxyWithFallback(req, res, `/api/v1/pnr/${req.params.locator}`, "GET", () => {
    const pnr = pnrStore.find(p => p.locator === req.params.locator);
    if (pnr) res.json(pnr);
    else res.status(404).json({ error: "PNR not found" });
  });
});

// Add segment
pnrRouter.post("/:locator/segments", (req, res) =>
  proxyWithFallback(req, res, `/api/v1/pnr/${req.params.locator}/segments`, "POST", () => {
    const pnr = pnrStore.find(p => p.locator === req.params.locator);
    if (!pnr) return res.status(404).json({ error: "PNR not found" });
    pnr.segments.push({ ...req.body, status: "HK" });
    res.json(pnr);
  }));

// Cancel segment
pnrRouter.delete("/:locator/segments/:segmentId", (req, res) =>
  proxyWithFallback(req, res, `/api/v1/pnr/${req.params.locator}/segments/${req.params.segmentId}`, "DELETE", () => {
    res.json({ message: "Segment cancelled" });
  }));

// Add remark
pnrRouter.post("/:locator/remarks", (req, res) =>
  proxyWithFallback(req, res, `/api/v1/pnr/${req.params.locator}/remarks`, "POST", () => {
    const pnr = pnrStore.find(p => p.locator === req.params.locator);
    if (!pnr) return res.status(404).json({ error: "PNR not found" });
    pnr.remarks.push(req.body);
    res.json(pnr);
  }));

// Ticket PNR
pnrRouter.post("/:locator/ticket", (req, res) =>
  proxyWithFallback(req, res, `/api/v1/pnr/${req.params.locator}/ticket`, "POST", () => {
    const pnr = pnrStore.find(p => p.locator === req.params.locator);
    if (!pnr) return res.status(404).json({ error: "PNR not found" });
    pnr.ticketing_status = "ISSUED";
    res.json(pnr);
  }));

// Queue PNR
pnrRouter.post("/:locator/queue", (req, res) =>
  proxyWithFallback(req, res, `/api/v1/pnr/${req.params.locator}/queue`, "POST", () => {
    res.json({ message: "PNR queued", queue: req.body.queue_type || "general" });
  }));

// Update PNR
pnrRouter.put("/:locator", (req, res) => {
  const pnr = pnrStore.find(p => p.locator === req.params.locator);
  if (!pnr) return res.status(404).json({ error: "PNR not found" });
  if (req.body.guest_name) pnr.guest_name = req.body.guest_name;
  if (req.body.contact_email) pnr.contact_email = req.body.contact_email;
  if (req.body.status) pnr.status = req.body.status;
  if (req.body.ticketing_status) pnr.ticketing_status = req.body.ticketing_status;
  res.json(pnr);
});

// Delete PNR
pnrRouter.delete("/:locator", (req, res) => {
  const idx = pnrStore.findIndex(p => p.locator === req.params.locator);
  if (idx === -1) return res.status(404).json({ error: "PNR not found" });
  pnrStore.splice(idx, 1);
  res.json({ deleted: true, locator: req.params.locator });
});

// Get history
pnrRouter.get("/:locator/history", (req, res) =>
  proxyWithFallback(req, res, `/api/v1/pnr/${req.params.locator}/history`, "GET", () => {
    res.json({ history: [
      { action: "CREATE", timestamp: "2026-06-01T10:30:00Z", agent: "AGT-001" },
      { action: "ADD_SEGMENT", timestamp: "2026-06-01T10:35:00Z", agent: "AGT-001" },
      { action: "TICKET", timestamp: "2026-06-01T11:00:00Z", agent: "AGT-001" },
    ]});
  }));
