/**
 * Tax API — Multi-jurisdiction tax calculation for GDS bookings.
 * 15 African jurisdictions with compound taxation, tourism levies, and service charges.
 * Integrates with Go settlement engine for real-time computation.
 */
import { Router, Request, Response } from "express";
import { requireRole } from "../auth";

export const taxRouter = Router();

interface TaxRule {
  name: string;
  rate: number;
  authority: string;
  compoundable: boolean;
}

interface Jurisdiction {
  code: string;
  country: string;
  currency: string;
  effectiveRate: number;
  rules: TaxRule[];
  filingFrequency: "monthly" | "quarterly";
  authority: string;
}

const JURISDICTIONS: Jurisdiction[] = [
  {
    code: "NG", country: "Nigeria", currency: "NGN", effectiveRate: 17.5, authority: "FIRS",
    filingFrequency: "monthly",
    rules: [
      { name: "VAT", rate: 7.5, authority: "FIRS", compoundable: false },
      { name: "Consumption Tax", rate: 5.0, authority: "LIRS", compoundable: false },
      { name: "Tourism Levy", rate: 5.0, authority: "NTDC", compoundable: false },
    ],
  },
  {
    code: "KE", country: "Kenya", currency: "KES", effectiveRate: 20.0, authority: "KRA",
    filingFrequency: "monthly",
    rules: [
      { name: "VAT", rate: 16.0, authority: "KRA", compoundable: false },
      { name: "Catering Levy", rate: 2.0, authority: "KRA", compoundable: false },
      { name: "Tourism Fund", rate: 2.0, authority: "Tourism Fund", compoundable: false },
    ],
  },
  {
    code: "GH", country: "Ghana", currency: "GHS", effectiveRate: 21.0, authority: "GRA",
    filingFrequency: "monthly",
    rules: [
      { name: "VAT", rate: 15.0, authority: "GRA", compoundable: false },
      { name: "NHIL", rate: 2.5, authority: "GRA", compoundable: false },
      { name: "GETFund", rate: 2.5, authority: "GRA", compoundable: false },
      { name: "Tourism Levy", rate: 1.0, authority: "GTA", compoundable: false },
    ],
  },
  {
    code: "ZA", country: "South Africa", currency: "ZAR", effectiveRate: 16.0, authority: "SARS",
    filingFrequency: "monthly",
    rules: [
      { name: "VAT", rate: 15.0, authority: "SARS", compoundable: false },
      { name: "Tourism Levy", rate: 1.0, authority: "NDT", compoundable: false },
    ],
  },
  {
    code: "TZ", country: "Tanzania", currency: "TZS", effectiveRate: 22.8, authority: "TRA",
    filingFrequency: "quarterly",
    rules: [
      { name: "VAT", rate: 18.0, authority: "TRA", compoundable: false },
      { name: "SDL", rate: 4.5, authority: "TRA", compoundable: false },
      { name: "Service Levy", rate: 0.3, authority: "LGA", compoundable: false },
    ],
  },
  {
    code: "RW", country: "Rwanda", currency: "RWF", effectiveRate: 19.5, authority: "RRA",
    filingFrequency: "quarterly",
    rules: [
      { name: "VAT", rate: 18.0, authority: "RRA", compoundable: false },
      { name: "Infrastructure Levy", rate: 1.5, authority: "RDB", compoundable: false },
    ],
  },
  {
    code: "EG", country: "Egypt", currency: "EGP", effectiveRate: 27.0, authority: "ETA",
    filingFrequency: "monthly",
    rules: [
      { name: "VAT", rate: 14.0, authority: "ETA", compoundable: false },
      { name: "Service Charge", rate: 12.0, authority: "ETA", compoundable: false },
      { name: "Municipal Tax", rate: 1.0, authority: "Municipality", compoundable: false },
    ],
  },
  {
    code: "MA", country: "Morocco", currency: "MAD", effectiveRate: 10.0, authority: "DGI",
    filingFrequency: "quarterly",
    rules: [
      { name: "VAT (Hospitality)", rate: 10.0, authority: "DGI", compoundable: false },
    ],
  },
  {
    code: "UG", country: "Uganda", currency: "UGX", effectiveRate: 19.5, authority: "URA",
    filingFrequency: "monthly",
    rules: [
      { name: "VAT", rate: 18.0, authority: "URA", compoundable: false },
      { name: "Tourism Levy", rate: 1.5, authority: "UTB", compoundable: false },
    ],
  },
  {
    code: "ET", country: "Ethiopia", currency: "ETB", effectiveRate: 27.0, authority: "MoR",
    filingFrequency: "quarterly",
    rules: [
      { name: "VAT", rate: 15.0, authority: "MoR", compoundable: false },
      { name: "Service Tax", rate: 10.0, authority: "MoR", compoundable: false },
      { name: "TOT", rate: 2.0, authority: "MoR", compoundable: false },
    ],
  },
  {
    code: "BW", country: "Botswana", currency: "BWP", effectiveRate: 15.0, authority: "BURS",
    filingFrequency: "monthly",
    rules: [
      { name: "VAT", rate: 14.0, authority: "BURS", compoundable: false },
      { name: "Tourism Levy", rate: 1.0, authority: "BTO", compoundable: false },
    ],
  },
  {
    code: "NA", country: "Namibia", currency: "NAD", effectiveRate: 17.0, authority: "NamRA",
    filingFrequency: "monthly",
    rules: [
      { name: "VAT", rate: 15.0, authority: "NamRA", compoundable: false },
      { name: "Tourism Levy", rate: 2.0, authority: "NTB", compoundable: false },
    ],
  },
  {
    code: "MU", country: "Mauritius", currency: "MUR", effectiveRate: 15.85, authority: "MRA",
    filingFrequency: "quarterly",
    rules: [
      { name: "VAT", rate: 15.0, authority: "MRA", compoundable: false },
      { name: "Environment Fee", rate: 0.85, authority: "MRA", compoundable: false },
    ],
  },
  {
    code: "MZ", country: "Mozambique", currency: "MZN", effectiveRate: 19.0, authority: "AT",
    filingFrequency: "quarterly",
    rules: [
      { name: "IVA", rate: 16.0, authority: "AT", compoundable: false },
      { name: "Tourism Tax", rate: 3.0, authority: "INATUR", compoundable: false },
    ],
  },
  {
    code: "ZW", country: "Zimbabwe", currency: "ZWL", effectiveRate: 17.0, authority: "ZIMRA",
    filingFrequency: "monthly",
    rules: [
      { name: "VAT", rate: 15.0, authority: "ZIMRA", compoundable: false },
      { name: "Tourism Levy", rate: 2.0, authority: "ZTA", compoundable: false },
    ],
  },
];

// List all jurisdictions
taxRouter.get("/jurisdictions", async (_req: Request, res: Response) => {
  res.json({
    jurisdictions: JURISDICTIONS.map((j) => ({
      code: j.code,
      country: j.country,
      currency: j.currency,
      effectiveRate: j.effectiveRate,
      authority: j.authority,
      filingFrequency: j.filingFrequency,
      ruleCount: j.rules.length,
    })),
    total: JURISDICTIONS.length,
  });
});

// Get jurisdiction details
taxRouter.get("/jurisdictions/:code", async (req: Request, res: Response) => {
  const jurisdiction = JURISDICTIONS.find((j) => j.code === req.params.code.toUpperCase());
  if (!jurisdiction) {
    res.status(404).json({ error: "Jurisdiction not found" });
    return;
  }
  res.json({ jurisdiction });
});

// Calculate tax for a booking
taxRouter.post("/calculate", async (req: Request, res: Response) => {
  const { amount, currency, jurisdictionCode, serviceType = "accommodation" } = req.body;

  if (!amount || !jurisdictionCode) {
    res.status(400).json({ error: "amount and jurisdictionCode required" });
    return;
  }

  const jurisdiction = JURISDICTIONS.find((j) => j.code === jurisdictionCode.toUpperCase());
  if (!jurisdiction) {
    res.status(404).json({ error: "Invalid jurisdiction code" });
    return;
  }

  const breakdown = jurisdiction.rules.map((rule) => ({
    name: rule.name,
    rate: rule.rate,
    amount: Math.round(amount * (rule.rate / 100) * 100) / 100,
    authority: rule.authority,
  }));

  const totalTax = breakdown.reduce((sum, r) => sum + r.amount, 0);

  res.json({
    baseAmount: amount,
    currency: currency || jurisdiction.currency,
    jurisdictionCode: jurisdiction.code,
    country: jurisdiction.country,
    serviceType,
    taxBreakdown: breakdown,
    totalTax: Math.round(totalTax * 100) / 100,
    grandTotal: Math.round((amount + totalTax) * 100) / 100,
    effectiveRate: jurisdiction.effectiveRate,
  });
});

// Bulk tax calculation (multiple bookings)
taxRouter.post("/calculate/bulk", async (req: Request, res: Response) => {
  const { bookings } = req.body;

  if (!Array.isArray(bookings) || bookings.length === 0) {
    res.status(400).json({ error: "bookings array required" });
    return;
  }

  const results = bookings.map((b: any) => {
    const j = JURISDICTIONS.find((j) => j.code === (b.jurisdictionCode || "").toUpperCase());
    if (!j) return { ...b, error: "Invalid jurisdiction" };
    const totalTax = b.amount * (j.effectiveRate / 100);
    return {
      bookingId: b.bookingId,
      baseAmount: b.amount,
      totalTax: Math.round(totalTax * 100) / 100,
      grandTotal: Math.round((b.amount + totalTax) * 100) / 100,
      jurisdictionCode: j.code,
    };
  });

  res.json({ results, total: results.length });
});

// Get filing schedule for a jurisdiction
taxRouter.get("/filing-schedule/:code", async (req: Request, res: Response) => {
  const jurisdiction = JURISDICTIONS.find((j) => j.code === req.params.code.toUpperCase());
  if (!jurisdiction) {
    res.status(404).json({ error: "Jurisdiction not found" });
    return;
  }

  const now = new Date();
  const nextDue = new Date(now.getFullYear(), now.getMonth() + 1, jurisdiction.filingFrequency === "monthly" ? 21 : 15);

  res.json({
    jurisdictionCode: jurisdiction.code,
    authority: jurisdiction.authority,
    frequency: jurisdiction.filingFrequency,
    nextDueDate: nextDue.toISOString().split("T")[0],
    penaltyRate: 0.5,
    gracePeriodDays: jurisdiction.filingFrequency === "monthly" ? 5 : 10,
  });
});
