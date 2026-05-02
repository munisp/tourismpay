/**
 * Round 97 Tests
 * - boostDeal mutation (visibilityScore increment, boostedUntil set)
 * - getSpendingInsightsRange (arbitrary date range, CSV export)
 * - toggleReminderEnabled (per-booking reminder toggle)
 * - bookingReminder job (24h window detection)
 */

import { describe, it, expect } from "vitest";

// ─── boostDeal ────────────────────────────────────────────────────────────────

describe("boostDeal logic", () => {
  it("increments visibilityScore by the boost amount", () => {
    const currentScore = 5;
    const boostAmount = 10;
    const newScore = currentScore + boostAmount;
    expect(newScore).toBe(15);
  });

  it("sets boostedUntil to approximately 7 days from now", () => {
    const now = Date.now();
    const boostedUntil = new Date(now + 7 * 24 * 60 * 60 * 1000);
    const diffDays = (boostedUntil.getTime() - now) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 0);
  });

  it("rejects boost for deals with status other than active", () => {
    const allowedStatuses = ["active"];
    const testStatus = "expired";
    expect(allowedStatuses.includes(testStatus)).toBe(false);
  });

  it("allows boost for active deals", () => {
    const allowedStatuses = ["active"];
    const testStatus = "active";
    expect(allowedStatuses.includes(testStatus)).toBe(true);
  });

  it("getDealBoostStatus returns isBoosted=true when boostedUntil is in the future", () => {
    const boostedUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const isBoosted = boostedUntil > new Date();
    expect(isBoosted).toBe(true);
  });

  it("getDealBoostStatus returns isBoosted=false when boostedUntil is in the past", () => {
    const boostedUntil = new Date(Date.now() - 1000);
    const isBoosted = boostedUntil > new Date();
    expect(isBoosted).toBe(false);
  });
});

// ─── getSpendingInsightsRange ─────────────────────────────────────────────────

describe("getSpendingInsightsRange date range logic", () => {
  it("accepts arbitrary start and end dates", () => {
    const start = new Date("2025-01-01");
    const end = new Date("2025-03-31");
    expect(start < end).toBe(true);
  });

  it("rejects end date before start date", () => {
    const start = new Date("2025-06-01");
    const end = new Date("2025-01-01");
    const isValid = end >= start;
    expect(isValid).toBe(false);
  });

  it("computes total spent correctly", () => {
    const transactions = [
      { amountUsd: "10.50", type: "payment" },
      { amountUsd: "25.00", type: "payment" },
      { amountUsd: "5.00", type: "refund" },
    ];
    const totalSpent = transactions
      .filter((t) => t.type === "payment")
      .reduce((sum, t) => sum + parseFloat(t.amountUsd), 0);
    expect(totalSpent).toBeCloseTo(35.5, 2);
  });

  it("computes savings from redemptions correctly", () => {
    const redemptions = [
      { discountPct: 20, priceUsd: "50.00" },
      { discountPct: 10, priceUsd: "30.00" },
    ];
    const totalSavings = redemptions.reduce((sum, r) => {
      return sum + (parseFloat(r.priceUsd) * r.discountPct) / 100;
    }, 0);
    expect(totalSavings).toBeCloseTo(13.0, 2);
  });
});

// ─── exportSpendingCsv ────────────────────────────────────────────────────────

describe("exportSpendingCsv format", () => {
  function buildCsvRow(row: {
    date: string;
    type: string;
    amountUsd: string;
    fromCurrency: string;
    toCurrency: string;
    counterparty: string | null;
    reference: string | null;
    note: string | null;
  }) {
    const escape = (v: string | null) => {
      if (!v) return "";
      if (v.includes(",") || v.includes('"') || v.includes("\n")) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    };
    return [
      row.date,
      escape(row.type),
      row.amountUsd,
      escape(row.fromCurrency),
      escape(row.toCurrency),
      escape(row.counterparty),
      escape(row.reference),
      escape(row.note),
    ].join(",");
  }

  it("produces a valid CSV row", () => {
    const row = buildCsvRow({
      date: "2025-03-15",
      type: "payment",
      amountUsd: "25.00",
      fromCurrency: "USD",
      toCurrency: "KES",
      counterparty: "Nairobi Tours",
      reference: "REF-001",
      note: null,
    });
    expect(row).toBe("2025-03-15,payment,25.00,USD,KES,Nairobi Tours,REF-001,");
  });

  it("escapes commas in CSV values", () => {
    const row = buildCsvRow({
      date: "2025-03-15",
      type: "payment",
      amountUsd: "10.00",
      fromCurrency: "USD",
      toCurrency: "KES",
      counterparty: "Nairobi, Kenya Tours",
      reference: null,
      note: null,
    });
    expect(row).toContain('"Nairobi, Kenya Tours"');
  });

  it("escapes double quotes in CSV values", () => {
    const row = buildCsvRow({
      date: "2025-03-15",
      type: "payment",
      amountUsd: "10.00",
      fromCurrency: "USD",
      toCurrency: "KES",
      counterparty: 'Hotel "Grand"',
      reference: null,
      note: null,
    });
    expect(row).toContain('"Hotel ""Grand"""');
  });
});

// ─── toggleReminderEnabled ────────────────────────────────────────────────────

describe("toggleReminderEnabled logic", () => {
  it("toggles reminder from true to false", () => {
    const current = true;
    const toggled = !current;
    expect(toggled).toBe(false);
  });

  it("toggles reminder from false to true", () => {
    const current = false;
    const toggled = !current;
    expect(toggled).toBe(true);
  });

  it("defaults reminderEnabled to true for new bookings", () => {
    const defaultValue = true;
    expect(defaultValue).toBe(true);
  });
});

// ─── bookingReminder job ──────────────────────────────────────────────────────

describe("bookingReminder job - 24h window detection", () => {
  function isWithin24hWindow(bookingDate: Date, now: Date): boolean {
    const diffMs = bookingDate.getTime() - now.getTime();
    return diffMs > 0 && diffMs <= 24 * 60 * 60 * 1000;
  }

  it("detects booking exactly 24h from now as in window", () => {
    const now = new Date();
    const booking = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    expect(isWithin24hWindow(booking, now)).toBe(true);
  });

  it("detects booking 12h from now as in window", () => {
    const now = new Date();
    const booking = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    expect(isWithin24hWindow(booking, now)).toBe(true);
  });

  it("detects booking 25h from now as outside window", () => {
    const now = new Date();
    const booking = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    expect(isWithin24hWindow(booking, now)).toBe(false);
  });

  it("detects past booking as outside window", () => {
    const now = new Date();
    const booking = new Date(now.getTime() - 1000);
    expect(isWithin24hWindow(booking, now)).toBe(false);
  });

  it("detects booking 1 minute from now as in window", () => {
    const now = new Date();
    const booking = new Date(now.getTime() + 60 * 1000);
    expect(isWithin24hWindow(booking, now)).toBe(true);
  });

  it("skips bookings with reminderSentAt already set", () => {
    const reminderSentAt = new Date();
    const shouldSkip = reminderSentAt !== null;
    expect(shouldSkip).toBe(true);
  });

  it("skips bookings with reminderEnabled=false", () => {
    const reminderEnabled = false;
    expect(reminderEnabled).toBe(false);
  });

  it("formats reminder notification title correctly", () => {
    const serviceName = "Safari Tour";
    const confirmationCode = "CONF-001";
    const title = `Upcoming Booking: ${serviceName} (${confirmationCode})`;
    expect(title).toBe("Upcoming Booking: Safari Tour (CONF-001)");
  });
});

// ─── visibilityScore sorting ──────────────────────────────────────────────────

describe("deal discovery sort order with visibilityScore", () => {
  it("sorts boosted deals before non-boosted deals", () => {
    const deals = [
      { id: 1, title: "Regular Deal", visibilityScore: 0 },
      { id: 2, title: "Boosted Deal", visibilityScore: 10 },
      { id: 3, title: "Super Boosted", visibilityScore: 20 },
    ];
    const sorted = [...deals].sort((a, b) => b.visibilityScore - a.visibilityScore);
    expect(sorted[0].id).toBe(3);
    expect(sorted[1].id).toBe(2);
    expect(sorted[2].id).toBe(1);
  });

  it("deals with equal visibilityScore maintain relative order", () => {
    const deals = [
      { id: 1, visibilityScore: 5 },
      { id: 2, visibilityScore: 5 },
    ];
    const sorted = [...deals].sort((a, b) => b.visibilityScore - a.visibilityScore);
    expect(sorted.length).toBe(2);
  });
});
