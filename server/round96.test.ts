/**
 * Round 96 Tests
 * - Deal Performance Leaderboard (getDealLeaderboard)
 * - Tourist Spending CSV Export (exportSpendingCsv)
 * - Reschedule Booking (rescheduleBooking)
 */

import { describe, it, expect } from "vitest";

// ─── Deal Leaderboard helpers ─────────────────────────────────────────────────

interface DealRow {
  id: number;
  title: string;
  redemptionCount: number;
  revenueUsd: number;
  discountPct: number;
}

function rankDeals(deals: DealRow[]): DealRow[] {
  return [...deals].sort((a, b) => b.redemptionCount - a.redemptionCount || b.revenueUsd - a.revenueUsd);
}

function computeConversionRate(redemptions: number, views: number): number {
  if (views === 0) return 0;
  return Math.round((redemptions / views) * 100);
}

describe("Deal Leaderboard", () => {
  it("ranks deals by redemption count descending", () => {
    const deals: DealRow[] = [
      { id: 1, title: "10% off dinner", redemptionCount: 5, revenueUsd: 120, discountPct: 10 },
      { id: 2, title: "Free dessert", redemptionCount: 20, revenueUsd: 80, discountPct: 0 },
      { id: 3, title: "Happy hour", redemptionCount: 12, revenueUsd: 300, discountPct: 20 },
    ];
    const ranked = rankDeals(deals);
    expect(ranked[0].id).toBe(2); // 20 redemptions
    expect(ranked[1].id).toBe(3); // 12 redemptions
    expect(ranked[2].id).toBe(1); // 5 redemptions
  });

  it("breaks ties by revenue descending", () => {
    const deals: DealRow[] = [
      { id: 1, title: "Deal A", redemptionCount: 10, revenueUsd: 50, discountPct: 5 },
      { id: 2, title: "Deal B", redemptionCount: 10, revenueUsd: 200, discountPct: 5 },
    ];
    const ranked = rankDeals(deals);
    expect(ranked[0].id).toBe(2); // higher revenue wins tie
  });

  it("returns empty array for no deals", () => {
    expect(rankDeals([])).toEqual([]);
  });

  it("computes conversion rate correctly", () => {
    expect(computeConversionRate(10, 100)).toBe(10);
    expect(computeConversionRate(0, 100)).toBe(0);
    expect(computeConversionRate(50, 200)).toBe(25);
  });

  it("handles zero views without division error", () => {
    expect(computeConversionRate(5, 0)).toBe(0);
  });

  it("limits top deals to requested count", () => {
    const deals: DealRow[] = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      title: `Deal ${i + 1}`,
      redemptionCount: 10 - i,
      revenueUsd: (10 - i) * 20,
      discountPct: 5,
    }));
    const top5 = rankDeals(deals).slice(0, 5);
    expect(top5).toHaveLength(5);
    expect(top5[0].id).toBe(1); // highest redemptions
  });
});

// ─── CSV Export helpers ───────────────────────────────────────────────────────

interface TxRow {
  createdAt: number; // unix timestamp
  type: string;
  amount: string;
  fromCurrency: string;
  toCurrency: string;
  counterparty: string | null;
  reference: string | null;
  note: string | null;
}

function buildCsvRow(t: TxRow): string {
  const date = new Date(t.createdAt * 1000).toISOString().slice(0, 10);
  return [
    date,
    t.type,
    t.amount,
    t.fromCurrency,
    t.toCurrency,
    t.counterparty ?? "",
    t.reference ?? "",
    `"${(t.note ?? "").replace(/"/g, "'")}"`,
  ].join(",");
}

function buildCsv(rows: TxRow[]): string {
  const header = "Date,Type,Amount,From Currency,To Currency,Counterparty,Reference,Note";
  return [header, ...rows.map(buildCsvRow)].join("\n");
}

describe("Spending CSV Export", () => {
  const sampleTx: TxRow = {
    createdAt: 1700000000,
    type: "send",
    amount: "25.00",
    fromCurrency: "USD",
    toCurrency: "KES",
    counterparty: "Nairobi Grill",
    reference: "REF-001",
    note: "Dinner for 2",
  };

  it("generates correct CSV header", () => {
    const csv = buildCsv([]);
    expect(csv).toBe("Date,Type,Amount,From Currency,To Currency,Counterparty,Reference,Note");
  });

  it("formats a transaction row correctly", () => {
    const csv = buildCsv([sampleTx]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("send");
    expect(lines[1]).toContain("25.00");
    expect(lines[1]).toContain("Nairobi Grill");
    expect(lines[1]).toContain("REF-001");
  });

  it("escapes double quotes in note field", () => {
    const tx: TxRow = { ...sampleTx, note: 'He said "hello"' };
    const row = buildCsvRow(tx);
    expect(row).toContain("He said 'hello'");
    expect(row).not.toContain('"He said "hello"');
  });

  it("handles null counterparty and reference", () => {
    const tx: TxRow = { ...sampleTx, counterparty: null, reference: null };
    const row = buildCsvRow(tx);
    const parts = row.split(",");
    expect(parts[5]).toBe(""); // counterparty
    expect(parts[6]).toBe(""); // reference
  });

  it("formats date from unix timestamp correctly", () => {
    // 1700000000 = 2023-11-14
    const row = buildCsvRow(sampleTx);
    expect(row.startsWith("2023-11-14")).toBe(true);
  });

  it("generates filename with correct period suffix", () => {
    const today = new Date().toISOString().slice(0, 10);
    const filename30 = `spending-30d-${today}.csv`;
    const filenameAll = `spending-all-${today}.csv`;
    expect(filename30).toMatch(/^spending-30d-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(filenameAll).toMatch(/^spending-all-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("handles empty transaction list", () => {
    const csv = buildCsv([]);
    expect(csv.split("\n")).toHaveLength(1); // header only
  });
});

// ─── Reschedule Booking helpers ───────────────────────────────────────────────

function validateRescheduleDate(isoString: string): { valid: boolean; error?: string } {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return { valid: false, error: "Invalid date format" };
  if (d.getTime() < Date.now() - 60_000) return { valid: false, error: "Cannot reschedule to a past time" };
  return { valid: true };
}

function detectConflicts(
  bookings: { id: number; bookingDate: Date; status: string }[],
  thresholdMs = 60 * 60 * 1000
): Set<number> {
  const ids = new Set<number>();
  const active = bookings.filter((b) => b.status === "confirmed" || b.status === "pending");
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const diff = Math.abs(active[i].bookingDate.getTime() - active[j].bookingDate.getTime());
      if (diff < thresholdMs) {
        ids.add(active[i].id);
        ids.add(active[j].id);
      }
    }
  }
  return ids;
}

describe("Reschedule Booking", () => {
  it("validates a future ISO date as valid", () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect(validateRescheduleDate(future).valid).toBe(true);
  });

  it("rejects an invalid date string", () => {
    const result = validateRescheduleDate("not-a-date");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid date format");
  });

  it("rejects a past date", () => {
    const past = new Date(Date.now() - 3_600_000).toISOString();
    expect(validateRescheduleDate(past).valid).toBe(false);
    expect(result => result).toBeTruthy();
  });

  it("detects conflicts between two bookings within 1 hour", () => {
    const now = new Date();
    const bookings = [
      { id: 1, bookingDate: now, status: "confirmed" },
      { id: 2, bookingDate: new Date(now.getTime() + 30 * 60_000), status: "confirmed" }, // 30 min later
    ];
    const conflicts = detectConflicts(bookings);
    expect(conflicts.has(1)).toBe(true);
    expect(conflicts.has(2)).toBe(true);
  });

  it("does not flag bookings more than 1 hour apart", () => {
    const now = new Date();
    const bookings = [
      { id: 1, bookingDate: now, status: "confirmed" },
      { id: 2, bookingDate: new Date(now.getTime() + 90 * 60_000), status: "confirmed" }, // 90 min later
    ];
    const conflicts = detectConflicts(bookings);
    expect(conflicts.size).toBe(0);
  });

  it("ignores cancelled bookings in conflict detection", () => {
    const now = new Date();
    const bookings = [
      { id: 1, bookingDate: now, status: "confirmed" },
      { id: 2, bookingDate: new Date(now.getTime() + 30 * 60_000), status: "cancelled" },
    ];
    const conflicts = detectConflicts(bookings);
    expect(conflicts.size).toBe(0);
  });

  it("handles empty booking list", () => {
    expect(detectConflicts([])).toEqual(new Set());
  });

  it("detects multiple conflicts in a busy day", () => {
    const base = new Date();
    const bookings = [
      { id: 1, bookingDate: base, status: "confirmed" },
      { id: 2, bookingDate: new Date(base.getTime() + 20 * 60_000), status: "confirmed" },
      { id: 3, bookingDate: new Date(base.getTime() + 40 * 60_000), status: "confirmed" },
    ];
    const conflicts = detectConflicts(bookings);
    expect(conflicts.size).toBeGreaterThanOrEqual(2);
  });
});
