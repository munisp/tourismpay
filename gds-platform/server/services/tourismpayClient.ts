/**
 * TourismPay API Client — The GDS platform calls TourismPay's REST API
 * for tax calculation, tipping, loyalty, and remittance operations.
 *
 * This is the integration layer that makes the GDS truly standalone:
 * it doesn't import TourismPay code, it calls the TourismPay HTTP API.
 */

const TOURISMPAY_API_URL = process.env.TOURISMPAY_API_URL || "http://localhost:3000";
const TOURISMPAY_API_KEY = process.env.TOURISMPAY_API_KEY || "";

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  params?: Record<string, string>;
}

async function callTourismPay<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(path, TOURISMPAY_API_URL);
  if (opts.params) {
    Object.entries(opts.params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-GDS-Platform": "tourismpay-gds/1.0",
  };
  if (TOURISMPAY_API_KEY) {
    headers["Authorization"] = `Bearer ${TOURISMPAY_API_KEY}`;
  }

  const res = await fetch(url.toString(), {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TourismPay API error [${res.status}]: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Tax API ─────────────────────────────────────────────────────────────────

export async function calculateTax(countryCode: string, amount: number, currency: string, bookingType: string) {
  return callTourismPay<{
    bookingAmount: number;
    currency: string;
    country: string;
    countryCode: string;
    components: Array<{ name: string; code: string; rate: number; amount: number; basis: number; authority: string }>;
    totalTax: number;
    grandTotal: number;
    effectiveRate: number;
    remittanceDue: string;
  }>("/api/v1/gds/tax/calculate", {
    params: { country: countryCode, amount: amount.toString(), currency, type: bookingType },
  });
}

export async function listTaxJurisdictions() {
  return callTourismPay<{
    jurisdictions: Array<{
      countryCode: string;
      countryName: string;
      totalEffective: number;
      taxRules: Array<{ name: string; code: string; rate: number; appliesTo: string; authority: string; remittanceCycle: string }>;
    }>;
    total: number;
  }>("/api/v1/gds/tax/jurisdictions");
}

export async function getTaxConfig(countryCode: string) {
  return callTourismPay<{
    countryCode: string;
    countryName: string;
    totalEffective: number;
    taxRules: Array<{ name: string; rate: number; authority: string }>;
  }>("/api/v1/gds/tax/config", { params: { country: countryCode } });
}

// ─── Tipping API ─────────────────────────────────────────────────────────────

export async function getStaffRoles(propertyType: string) {
  return callTourismPay<{
    roles: Array<{ code: string; name: string; suggestedPct: number; category: string }>;
    propertyType: string;
  }>("/api/v1/gds/tipping/roles", { params: { propertyType } });
}

export async function processTip(request: {
  reservationId: string;
  propertyId: string;
  guestId: string;
  totalAmount: number;
  currency: string;
  recipients: Array<{ staffRole: string; staffName?: string; amount?: number; percentage?: number }>;
  splitMode: string;
  message?: string;
}) {
  return callTourismPay<{
    tipGroupId: string;
    reservationId: string;
    totalTipped: number;
    currency: string;
    recipients: Array<{ staffRole: string; amount: number }>;
    status: string;
    processedAt: string;
  }>("/api/v1/gds/tipping/process", { method: "POST", body: request });
}

// ─── Loyalty API ─────────────────────────────────────────────────────────────

export async function calculateLoyalty(bookingId: string, guestId: string, amountUSD: number, tier: string, propertyType: string, bookingType: string) {
  return callTourismPay<{
    bookingId: string;
    guestId: string;
    basePoints: number;
    bonusPoints: number;
    totalPoints: number;
    multiplier: number;
    reason: string;
    expiresAt: string;
  }>("/api/v1/gds/loyalty/calculate", {
    params: { bookingId, guestId, amount: amountUSD.toString(), tier, propertyType, bookingType },
  });
}

export async function getLoyaltyConfig() {
  return callTourismPay<{
    basePointsPerUsd: number;
    tierMultipliers: Record<string, number>;
    propertyBonuses: Record<string, number>;
    bookingTypeMultiplier: Record<string, number>;
  }>("/api/v1/gds/loyalty/config");
}

// ─── Remittance API (admin-only on TourismPay side) ──────────────────────────

export async function getRemittanceSummary(adminToken: string) {
  return callTourismPay<{
    totalCollected: number;
    totalRemitted: number;
    outstanding: number;
    complianceScore: number;
    jurisdictions: Array<{
      countryCode: string;
      countryName: string;
      collected: number;
      remitted: number;
      status: string;
      nextDue: string;
      authority: string;
    }>;
  }>("/api/v1/gds/remittance/summary", {
    params: { token: adminToken },
  });
}

// ─── Trip Planner → GDS API ──────────────────────────────────────────────────

export async function convertItineraryToBookings(request: {
  itineraryId: string;
  items: Array<{
    establishmentId: number;
    propertyId?: string;
    checkIn: string;
    checkOut?: string;
    guests: number;
    roomType?: string;
  }>;
  guestName: string;
  guestEmail: string;
  guestCountry: string;
}) {
  return callTourismPay<{
    itineraryId: string;
    bookings: Array<{
      reservationId: string;
      confirmationNo: string;
      propertyId: string;
      checkIn: string;
      checkOut: string;
      nights: number;
      totalAmount: number;
      status: string;
    }>;
    totalBookings: number;
    totalSpend: number;
    loyalty: { basePoints: number; bonusPoints: number; totalPoints: number };
    status: string;
  }>("/api/v1/gds/trip-planner/convert", { method: "POST", body: request });
}

export const tourismPayClient = {
  tax: { calculate: calculateTax, listJurisdictions: listTaxJurisdictions, getConfig: getTaxConfig },
  tipping: { getRoles: getStaffRoles, process: processTip },
  loyalty: { calculate: calculateLoyalty, getConfig: getLoyaltyConfig },
  remittance: { getSummary: getRemittanceSummary },
  tripPlanner: { convert: convertItineraryToBookings },
};
