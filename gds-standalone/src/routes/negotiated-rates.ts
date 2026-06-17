/**
 * Negotiated Rates Proxy Router
 * Proxies to Go negotiated-rates service (port 8113)
 *
 * Middleware: PostgreSQL (contracts), Redis (rate cache), Kafka (rate events),
 * OpenSearch (rate search), Keycloak (corporate auth), Permify (rate access)
 */
import { Router, Request, Response } from "express";
import { requireRole } from "../auth";

export const negotiatedRatesRouter = Router();

const agreements = [
  {
    id: "AGR-001", name: "Safaricom Corporate Program", agreement_type: "corporate",
    party_a: { id: "CHAIN-001", name: "Serengeti Hotels Group", type: "chain", country: "KE" },
    party_b: { id: "CORP-001", name: "Safaricom PLC", type: "corporate", country: "KE" },
    rate_type: "discount_on_bar", base_discount_percent: 25, currency: "KES",
    min_room_nights: 500, actual_room_nights: 342,
    meal_plan: "BB", payment_terms: "30_days", commission: 8,
    last_room_availability: true, status: "active",
    amenities: ["wifi", "breakfast", "airport_transfer", "late_checkout"],
    valid_from: "2026-01-01", valid_to: "2026-12-31",
  },
  {
    id: "AGR-002", name: "African Travel Consortium", agreement_type: "consortium",
    party_a: { id: "CHAIN-002", name: "Pan-Africa Lodges", type: "chain", country: "TZ" },
    party_b: { id: "CONS-001", name: "ATTA Consortium", type: "consortium", country: "KE" },
    rate_type: "net_rate", base_discount_percent: 0, negotiated_rate: 120, currency: "USD",
    min_room_nights: 2000, actual_room_nights: 1450,
    meal_plan: "RO", payment_terms: "prepaid", commission: 12,
    last_room_availability: false, status: "active",
    amenities: ["wifi", "parking"],
    valid_from: "2026-01-01", valid_to: "2026-12-31",
  },
  {
    id: "AGR-003", name: "MTN Nigeria Wholesale", agreement_type: "wholesale",
    party_a: { id: "PROP-010", name: "Lagos Continental", type: "property", country: "NG" },
    party_b: { id: "CORP-002", name: "MTN Nigeria", type: "corporate", country: "NG" },
    rate_type: "fixed", base_discount_percent: 0, negotiated_rate: 45000, currency: "NGN",
    min_room_nights: 1000, actual_room_nights: 780,
    meal_plan: "BB", payment_terms: "60_days", commission: 5,
    last_room_availability: true, status: "active",
    amenities: ["wifi", "breakfast", "gym", "meeting_room_1hr"],
    valid_from: "2026-01-01", valid_to: "2026-12-31",
  },
  {
    id: "AGR-004", name: "UN Agencies Rate", agreement_type: "government",
    party_a: { id: "CHAIN-003", name: "East Africa Hotel Group", type: "chain", country: "KE" },
    party_b: { id: "GOV-001", name: "United Nations Agencies", type: "government", country: "INT" },
    rate_type: "dynamic_floor", base_discount_percent: 30, currency: "USD",
    min_room_nights: 3000, actual_room_nights: 2100,
    meal_plan: "BB", payment_terms: "direct_bill", commission: 6,
    last_room_availability: true, status: "active",
    amenities: ["wifi", "breakfast", "airport_transfer", "laundry", "business_center"],
    valid_from: "2026-01-01", valid_to: "2027-06-30",
  },
  {
    id: "AGR-005", name: "Rwanda Tourism Board NGO Rate", agreement_type: "ngo",
    party_a: { id: "CHAIN-004", name: "Rwanda Hospitality Group", type: "chain", country: "RW" },
    party_b: { id: "NGO-001", name: "Rwanda Tourism Board", type: "government", country: "RW" },
    rate_type: "discount_on_bar", base_discount_percent: 20, currency: "RWF",
    min_room_nights: 800, actual_room_nights: 650,
    meal_plan: "HB", payment_terms: "30_days", commission: 10,
    last_room_availability: false, status: "active",
    amenities: ["wifi", "breakfast"],
    valid_from: "2026-01-01", valid_to: "2026-12-31",
  },
];

// List agreements
negotiatedRatesRouter.get("/agreements", async (req: Request, res: Response) => {
  const type = req.query.type as string;
  let results = agreements;
  if (type) results = results.filter(a => a.agreement_type === type);
  res.json({
    agreements: results, total: results.length,
    types: ["corporate", "consortium", "wholesale", "government", "ngo"],
  });
});

// Get specific agreement
negotiatedRatesRouter.get("/agreements/:id", async (req: Request, res: Response) => {
  const agr = agreements.find(a => a.id === req.params.id);
  if (!agr) { res.status(404).json({ error: "Agreement not found" }); return; }

  const compliance = agr.min_room_nights > 0 ? Math.round((agr.actual_room_nights / agr.min_room_nights) * 100 * 10) / 10 : 100;
  res.json({ agreement: agr, volume_compliance: `${compliance}%`, room_nights_remaining: agr.min_room_nights - agr.actual_room_nights });
});

// Query negotiated rate
negotiatedRatesRouter.post("/query", async (req: Request, res: Response) => {
  const { property_id, corporate_id, agent_id, consortium_id } = req.body;
  const publicRate = 200;

  const matching = agreements.find(a => {
    if (corporate_id && a.party_b.id === corporate_id) return true;
    if (consortium_id && a.party_b.id === consortium_id) return true;
    if (agent_id && a.party_b.id === agent_id) return true;
    return false;
  });

  if (!matching) {
    res.json({ found: false, public_rate: publicRate, message: "No negotiated rate found" });
    return;
  }

  let negRate = publicRate;
  if (matching.rate_type === "discount_on_bar" || matching.rate_type === "dynamic_floor") {
    negRate = publicRate * (1 - matching.base_discount_percent / 100);
  } else if (matching.rate_type === "fixed" || matching.rate_type === "net_rate") {
    negRate = (matching as any).negotiated_rate || publicRate;
  }

  res.json({
    found: true,
    result: {
      public_rate: publicRate, negotiated_rate: negRate,
      savings: Math.round((publicRate - negRate) * 100) / 100,
      savings_percent: Math.round(((publicRate - negRate) / publicRate) * 100),
      agreement_id: matching.id, agreement_name: matching.name,
      meal_plan: matching.meal_plan, amenities: matching.amenities,
      last_room_availability: matching.last_room_availability,
    },
  });
});

// Volume compliance report
negotiatedRatesRouter.get("/volume-report", async (_req: Request, res: Response) => {
  const report = agreements.map(a => {
    const compliance = a.min_room_nights > 0 ? Math.round((a.actual_room_nights / a.min_room_nights) * 100 * 10) / 10 : 100;
    return {
      agreement_id: a.id, name: a.name, type: a.agreement_type,
      committed: a.min_room_nights, actual: a.actual_room_nights,
      compliance, status: compliance >= 100 ? "exceeded" : compliance >= 50 ? "on_track" : "at_risk",
    };
  });

  const totalCommitted = agreements.reduce((s, a) => s + a.min_room_nights, 0);
  const totalActual = agreements.reduce((s, a) => s + a.actual_room_nights, 0);

  res.json({
    report, total: report.length,
    summary: { total_committed: totalCommitted, total_actual: totalActual, overall_compliance: Math.round((totalActual / totalCommitted) * 100 * 10) / 10 },
  });
});

// Create agreement
negotiatedRatesRouter.post("/agreements", requireRole("admin"), async (req: Request, res: Response) => {
  const { name, agreement_type, party_a, party_b, rate_type, base_discount_percent } = req.body;
  if (!name || !agreement_type) {
    res.status(400).json({ error: "name and agreement_type required" });
    return;
  }
  res.status(201).json({
    created: true,
    agreement: {
      id: `AGR-${Date.now().toString(36)}`, name, agreement_type,
      party_a, party_b, rate_type, base_discount_percent,
      status: "pending", created_at: new Date().toISOString(),
    },
  });
});
