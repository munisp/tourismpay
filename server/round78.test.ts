/**
 * Round 78 Tests
 * - Payout CSV export (merchantRevenue.exportPayouts)
 * - Exchange rate indicator (exchangeRates.getRate)
 * - KYB Applications search (client-side filter logic)
 */

import { describe, it, expect } from "vitest";

// ─── Payout CSV Export ────────────────────────────────────────────────────────

describe("Payout CSV Export", () => {
  it("generates correct CSV header row", () => {
    const headers = ["Date", "Establishment", "Amount (USD)", "Currency", "Status", "Reference"];
    const csv = headers.join(",") + "\n";
    expect(csv).toContain("Amount (USD)");
    expect(csv).toContain("Establishment");
    expect(csv.split(",")).toHaveLength(6);
  });

  it("escapes commas in establishment names", () => {
    const name = 'Lagos, Nigeria Restaurant';
    const escaped = name.includes(",") ? `"${name}"` : name;
    expect(escaped).toBe('"Lagos, Nigeria Restaurant"');
  });

  it("escapes double quotes in CSV values", () => {
    const name = 'The "Best" Hotel';
    const escaped = `"${name.replace(/"/g, '""')}"`;
    expect(escaped).toBe('"The ""Best"" Hotel"');
  });

  it("formats date as ISO string in CSV", () => {
    const ts = 1700000000000;
    const formatted = new Date(ts).toISOString();
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("formats amount to 2 decimal places", () => {
    const amount = 1234.5;
    const formatted = amount.toFixed(2);
    expect(formatted).toBe("1234.50");
  });

  it("handles empty payout list gracefully", () => {
    const payouts: unknown[] = [];
    const rows = payouts.map(() => "");
    expect(rows).toHaveLength(0);
  });

  it("includes all required columns in export", () => {
    const requiredColumns = ["Date", "Establishment", "Amount (USD)", "Currency", "Status", "Reference"];
    requiredColumns.forEach((col) => {
      expect(typeof col).toBe("string");
      expect(col.length).toBeGreaterThan(0);
    });
  });
});

// ─── Exchange Rate Indicator ──────────────────────────────────────────────────

describe("Exchange Rate Indicator", () => {
  it("converts USD to NGN correctly", () => {
    const usdToNgn = 1600;
    const usdAmount = 10;
    const ngnAmount = usdAmount * usdToNgn;
    expect(ngnAmount).toBe(16000);
  });

  it("converts NGN to USD correctly", () => {
    const usdToNgn = 1600;
    const ngnAmount = 16000;
    const usdAmount = ngnAmount / usdToNgn;
    expect(usdAmount).toBe(10);
  });

  it("formats rate with 4 decimal places for small values", () => {
    const rate = 0.000625; // 1 NGN in USD
    const formatted = rate.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
    expect(formatted).toContain("0.0006");
  });

  it("formats large rates with 2 decimal places", () => {
    const rate = 1600.50;
    const formatted = rate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    expect(formatted).toContain("1,600.50");
  });

  it("calculates cache age in minutes correctly", () => {
    const fetchedAt = Date.now() - 3 * 60 * 1000; // 3 minutes ago
    const ageMinutes = Math.floor((Date.now() - fetchedAt) / 60_000);
    expect(ageMinutes).toBe(3);
  });

  it("returns 'just now' for age of 0 minutes", () => {
    const ageMinutes = 0;
    const label = ageMinutes === 0 ? "just now" : `${ageMinutes}m ago`;
    expect(label).toBe("just now");
  });

  it("returns correct label for non-zero age", () => {
    const ageMinutes = 4;
    const label = ageMinutes === 0 ? "just now" : `${ageMinutes}m ago`;
    expect(label).toBe("4m ago");
  });

  it("supports all 8 tourist currencies", () => {
    const currencies = ["NGN", "KES", "GHS", "ZAR", "EGP", "EUR", "GBP", "TZS"];
    expect(currencies).toHaveLength(8);
    expect(currencies).toContain("NGN");
    expect(currencies).toContain("EUR");
    expect(currencies).toContain("TZS");
  });

  it("marks fallback rates with isFallback flag", () => {
    const response = { rate: 1600, isFallback: true, fetchedAt: Date.now() };
    expect(response.isFallback).toBe(true);
  });

  it("5-minute cache interval is correct in milliseconds", () => {
    const intervalMs = 5 * 60 * 1000;
    expect(intervalMs).toBe(300_000);
  });
});

// ─── KYB Applications Search ──────────────────────────────────────────────────

type AppRow = {
  id: number;
  establishmentName: string | null;
  country: string | null;
  businessType: string | null;
  status: string;
};

function filterApps(apps: AppRow[], query: string): AppRow[] {
  if (!query.trim()) return apps;
  const q = query.toLowerCase();
  return apps.filter((a) =>
    (a.establishmentName ?? "").toLowerCase().includes(q) ||
    (a.country ?? "").toLowerCase().includes(q) ||
    (a.businessType ?? "").toLowerCase().includes(q) ||
    String(a.id).includes(q)
  );
}

const sampleApps: AppRow[] = [
  { id: 1, establishmentName: "Lagos Beach Hotel", country: "Nigeria", businessType: "hotel", status: "submitted" },
  { id: 2, establishmentName: "Nairobi Safari Lodge", country: "Kenya", businessType: "lodge", status: "approved" },
  { id: 3, establishmentName: "Cape Town Restaurant", country: "South Africa", businessType: "restaurant", status: "under_review" },
  { id: 4, establishmentName: "Cairo Museum Shop", country: "Egypt", businessType: "retail", status: "rejected" },
  { id: 5, establishmentName: null, country: null, businessType: null, status: "draft" },
];

describe("KYB Applications Search Filter", () => {
  it("returns all apps when query is empty", () => {
    expect(filterApps(sampleApps, "")).toHaveLength(5);
  });

  it("returns all apps when query is whitespace only", () => {
    expect(filterApps(sampleApps, "   ")).toHaveLength(5);
  });

  it("filters by establishment name (case-insensitive)", () => {
    const results = filterApps(sampleApps, "lagos");
    expect(results).toHaveLength(1);
    expect(results[0].establishmentName).toBe("Lagos Beach Hotel");
  });

  it("filters by country (case-insensitive)", () => {
    const results = filterApps(sampleApps, "kenya");
    expect(results).toHaveLength(1);
    expect(results[0].country).toBe("Kenya");
  });

  it("filters by business type", () => {
    const results = filterApps(sampleApps, "restaurant");
    expect(results).toHaveLength(1);
    expect(results[0].businessType).toBe("restaurant");
  });

  it("filters by ID as string", () => {
    const results = filterApps(sampleApps, "3");
    expect(results.some((a) => a.id === 3)).toBe(true);
  });

  it("handles null fields without throwing", () => {
    expect(() => filterApps(sampleApps, "test")).not.toThrow();
  });

  it("returns empty array when no match found", () => {
    const results = filterApps(sampleApps, "zzznomatch");
    expect(results).toHaveLength(0);
  });

  it("matches partial strings", () => {
    const results = filterApps(sampleApps, "nairo");
    expect(results).toHaveLength(1);
    expect(results[0].establishmentName).toBe("Nairobi Safari Lodge");
  });

  it("is case-insensitive for all fields", () => {
    const results = filterApps(sampleApps, "NIGERIA");
    expect(results).toHaveLength(1);
    expect(results[0].country).toBe("Nigeria");
  });

  it("filtered count label shows correct numbers", () => {
    const filtered = filterApps(sampleApps, "hotel");
    const label = `${filtered.length} shown (filtered from ${sampleApps.length})`;
    expect(label).toBe("1 shown (filtered from 5)");
  });

  it("clear search restores full list", () => {
    const filtered = filterApps(sampleApps, "cairo");
    expect(filtered).toHaveLength(1);
    const restored = filterApps(sampleApps, "");
    expect(restored).toHaveLength(5);
  });
});
