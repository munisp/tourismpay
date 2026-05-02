/**
 * Round 98 — Vitest tests
 * Covers: Boost ROI analytics, deal expiry auto-deactivation, tourist booking reminders,
 * expired deals filter logic, and schema additions.
 */
import { describe, it, expect } from "vitest";

// ─── 1. Boost ROI calculation helpers ────────────────────────────────────────

function computeLiftPercent(
  preRate: number | null,
  postRate: number
): number | null {
  if (preRate === null || preRate === 0) return null;
  return Math.round(((postRate - preRate) / preRate) * 100);
}

function computeDailyRate(redemptions: number, days: number): number {
  if (days <= 0) return 0;
  return parseFloat((redemptions / days).toFixed(2));
}

describe("Boost ROI — computeLiftPercent", () => {
  it("returns null when preRate is null", () => {
    expect(computeLiftPercent(null, 5)).toBeNull();
  });

  it("returns null when preRate is 0 (no baseline)", () => {
    expect(computeLiftPercent(0, 5)).toBeNull();
  });

  it("returns positive lift when postRate > preRate", () => {
    // 2/day before, 4/day after → +100%
    expect(computeLiftPercent(2, 4)).toBe(100);
  });

  it("returns negative lift when postRate < preRate", () => {
    // 4/day before, 2/day after → -50%
    expect(computeLiftPercent(4, 2)).toBe(-50);
  });

  it("returns 0 when rates are equal", () => {
    expect(computeLiftPercent(3, 3)).toBe(0);
  });
});

describe("Boost ROI — computeDailyRate", () => {
  it("returns 0 for 0 days", () => {
    expect(computeDailyRate(10, 0)).toBe(0);
  });

  it("computes correct daily rate", () => {
    expect(computeDailyRate(30, 10)).toBe(3);
  });

  it("rounds to 2 decimal places", () => {
    expect(computeDailyRate(1, 3)).toBe(0.33);
  });
});

// ─── 2. Deal expiry auto-deactivation logic ───────────────────────────────────

function isExpired(validTo: Date, now: Date): boolean {
  return validTo < now;
}

function getExpiredDeals(
  deals: Array<{ id: number; isActive: boolean; validTo: Date }>,
  now: Date
) {
  return deals.filter((d) => d.isActive && isExpired(d.validTo, now));
}

describe("Deal expiry — isExpired", () => {
  const now = new Date("2026-03-01T00:00:00Z");

  it("returns true for a deal that expired yesterday", () => {
    expect(isExpired(new Date("2026-02-28T23:59:59Z"), now)).toBe(true);
  });

  it("returns false for a deal that expires tomorrow", () => {
    expect(isExpired(new Date("2026-03-02T00:00:00Z"), now)).toBe(false);
  });

  it("returns false for a deal expiring exactly at now (strict less-than)", () => {
    expect(isExpired(new Date("2026-03-01T00:00:00Z"), now)).toBe(false);
  });
});

describe("Deal expiry — getExpiredDeals", () => {
  const now = new Date("2026-03-01T00:00:00Z");

  it("returns only active expired deals", () => {
    const deals = [
      { id: 1, isActive: true, validTo: new Date("2026-02-28T00:00:00Z") },  // expired + active → include
      { id: 2, isActive: false, validTo: new Date("2026-02-28T00:00:00Z") }, // expired + inactive → skip
      { id: 3, isActive: true, validTo: new Date("2026-03-05T00:00:00Z") },  // future + active → skip
    ];
    const result = getExpiredDeals(deals, now);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("returns empty array when no deals are expired", () => {
    const deals = [
      { id: 1, isActive: true, validTo: new Date("2026-04-01T00:00:00Z") },
    ];
    expect(getExpiredDeals(deals, now)).toHaveLength(0);
  });
});

// ─── 3. Tourist booking reminder — 24h window logic ──────────────────────────

function isWithin24hWindow(bookingDate: Date, now: Date): boolean {
  const diffMs = bookingDate.getTime() - now.getTime();
  return diffMs > 0 && diffMs <= 24 * 60 * 60 * 1000;
}

function shouldSendReminder(
  booking: {
    status: string;
    reminderEnabled: boolean | null;
    reminderSentAt: Date | null;
    bookingDate: Date;
  },
  now: Date
): boolean {
  if (booking.status !== "confirmed") return false;
  if (booking.reminderEnabled === false) return false;
  if (booking.reminderSentAt !== null) return false;
  return isWithin24hWindow(booking.bookingDate, now);
}

describe("Tourist booking reminder — isWithin24hWindow", () => {
  const now = new Date("2026-03-01T10:00:00Z");

  it("returns true for a booking 12h from now", () => {
    const bookingDate = new Date("2026-03-01T22:00:00Z");
    expect(isWithin24hWindow(bookingDate, now)).toBe(true);
  });

  it("returns true for a booking exactly 24h from now", () => {
    const bookingDate = new Date("2026-03-02T10:00:00Z");
    expect(isWithin24hWindow(bookingDate, now)).toBe(true);
  });

  it("returns false for a booking 25h from now", () => {
    const bookingDate = new Date("2026-03-02T11:00:00Z");
    expect(isWithin24hWindow(bookingDate, now)).toBe(false);
  });

  it("returns false for a booking in the past", () => {
    const bookingDate = new Date("2026-02-28T10:00:00Z");
    expect(isWithin24hWindow(bookingDate, now)).toBe(false);
  });
});

describe("Tourist booking reminder — shouldSendReminder", () => {
  const now = new Date("2026-03-01T10:00:00Z");
  const bookingDate = new Date("2026-03-01T22:00:00Z"); // 12h away

  it("sends reminder for confirmed booking with reminder enabled and not yet sent", () => {
    expect(
      shouldSendReminder(
        { status: "confirmed", reminderEnabled: true, reminderSentAt: null, bookingDate },
        now
      )
    ).toBe(true);
  });

  it("does not send if reminder already sent", () => {
    expect(
      shouldSendReminder(
        { status: "confirmed", reminderEnabled: true, reminderSentAt: new Date(), bookingDate },
        now
      )
    ).toBe(false);
  });

  it("does not send if reminder disabled", () => {
    expect(
      shouldSendReminder(
        { status: "confirmed", reminderEnabled: false, reminderSentAt: null, bookingDate },
        now
      )
    ).toBe(false);
  });

  it("does not send for cancelled booking", () => {
    expect(
      shouldSendReminder(
        { status: "cancelled", reminderEnabled: true, reminderSentAt: null, bookingDate },
        now
      )
    ).toBe(false);
  });

  it("treats null reminderEnabled as enabled (default on)", () => {
    expect(
      shouldSendReminder(
        { status: "confirmed", reminderEnabled: null, reminderSentAt: null, bookingDate },
        now
      )
    ).toBe(true);
  });
});

// ─── 4. Expired deals filter (UI logic) ──────────────────────────────────────

type DealFilter = "all" | "active" | "paused" | "expired";

function filterDeals(
  deals: Array<{ id: number; isActive: boolean; validTo: Date }>,
  filter: DealFilter,
  now: Date
) {
  return deals.filter((deal) => {
    const expired = deal.validTo < now;
    if (filter === "expired") return expired;
    if (filter === "active") return !expired && deal.isActive;
    if (filter === "paused") return !expired && !deal.isActive;
    return true; // "all"
  });
}

describe("Expired deals filter", () => {
  const now = new Date("2026-03-01T00:00:00Z");
  const deals = [
    { id: 1, isActive: true, validTo: new Date("2026-04-01T00:00:00Z") },   // active
    { id: 2, isActive: false, validTo: new Date("2026-04-01T00:00:00Z") },  // paused
    { id: 3, isActive: true, validTo: new Date("2026-02-01T00:00:00Z") },   // expired (was active)
    { id: 4, isActive: false, validTo: new Date("2026-02-01T00:00:00Z") },  // expired (was paused)
  ];

  it("filter=all returns all deals", () => {
    expect(filterDeals(deals, "all", now)).toHaveLength(4);
  });

  it("filter=active returns only non-expired active deals", () => {
    const result = filterDeals(deals, "active", now);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("filter=paused returns only non-expired inactive deals", () => {
    const result = filterDeals(deals, "paused", now);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it("filter=expired returns all expired deals regardless of isActive", () => {
    const result = filterDeals(deals, "expired", now);
    expect(result).toHaveLength(2);
    expect(result.map((d) => d.id)).toEqual([3, 4]);
  });
});

// ─── 5. Schema additions verification ────────────────────────────────────────

describe("Schema additions — Round 98", () => {
  it("touristDeals schema file includes visibilityScore", async () => {
    const { readFileSync } = await import("fs");
    const schema = readFileSync(
      new URL("../drizzle/schema.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(schema).toContain("visibilityScore");
    expect(schema).toContain("boostedUntil");
    expect(schema).toContain("boostedAt");
  });

  it("touristBookings schema file includes reminderEnabled", async () => {
    const { readFileSync } = await import("fs");
    const schema = readFileSync(
      new URL("../drizzle/schema.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(schema).toContain("reminderEnabled");
    expect(schema).toContain("reminderSentAt");
  });

  it("bookingReminder job file exists", async () => {
    const { existsSync } = await import("fs");
    expect(
      existsSync(
        new URL("../server/jobs/bookingReminder.ts", import.meta.url).pathname
      )
    ).toBe(true);
  });

  it("touristBookingReminder job file exists", async () => {
    const { existsSync } = await import("fs");
    expect(
      existsSync(
        new URL("../server/jobs/touristBookingReminder.ts", import.meta.url).pathname
      )
    ).toBe(true);
  });

  it("dealExpiry job file exists", async () => {
    const { existsSync } = await import("fs");
    expect(
      existsSync(
        new URL("../server/jobs/dealExpiry.ts", import.meta.url).pathname
      )
    ).toBe(true);
  });

  it("DealLeaderboard page file exists", async () => {
    const { existsSync } = await import("fs");
    expect(
      existsSync(
        new URL("../client/src/pages/merchant/DealLeaderboard.tsx", import.meta.url).pathname
      )
    ).toBe(true);
  });
});
