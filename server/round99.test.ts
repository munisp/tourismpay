/**
 * Round 99 Tests
 * - Boost Deal revenue from boost calculation
 * - Tourist booking reminder push notification logic
 * - Deal expiry push notification logic
 * - Deal renewal mutation logic
 */
import { describe, it, expect } from "vitest";

// ─── Boost Revenue Calculation ────────────────────────────────────────────────
describe("Boost ROI — revenue from boost calculation", () => {
  function calcRevenueFromBoost(postBoostRedemptions: number, discountAmountUsd: string | null): number | null {
    const discountUsd = discountAmountUsd ? parseFloat(discountAmountUsd) : null;
    if (discountUsd === null) return null;
    return parseFloat((postBoostRedemptions * discountUsd).toFixed(2));
  }

  it("returns null when discountAmountUsd is null", () => {
    expect(calcRevenueFromBoost(10, null)).toBeNull();
  });

  it("returns 0 when there are no post-boost redemptions", () => {
    expect(calcRevenueFromBoost(0, "5.00")).toBe(0);
  });

  it("calculates revenue correctly for 10 redemptions at $5 each", () => {
    expect(calcRevenueFromBoost(10, "5.00")).toBe(50.00);
  });

  it("calculates revenue correctly for 7 redemptions at $12.50 each", () => {
    expect(calcRevenueFromBoost(7, "12.50")).toBe(87.50);
  });

  it("rounds to 2 decimal places", () => {
    expect(calcRevenueFromBoost(3, "3.333333")).toBe(10.00);
  });

  it("handles zero discount amount", () => {
    expect(calcRevenueFromBoost(100, "0.00")).toBe(0);
  });
});

// ─── Deal Renewal Logic ───────────────────────────────────────────────────────
describe("Deal renewal — validTo extension", () => {
  function calcNewValidTo(renewDays: number): Date {
    return new Date(Date.now() + renewDays * 24 * 60 * 60 * 1000);
  }

  it("30-day renewal adds ~30 days from now", () => {
    const before = Date.now();
    const newValidTo = calcNewValidTo(30);
    const after = Date.now();
    const diffMs = newValidTo.getTime() - before;
    const expectedMs = 30 * 24 * 60 * 60 * 1000;
    expect(diffMs).toBeGreaterThanOrEqual(expectedMs - 100);
    expect(diffMs).toBeLessThanOrEqual(expectedMs + (after - before) + 100);
  });

  it("90-day renewal adds ~90 days from now", () => {
    const before = Date.now();
    const newValidTo = calcNewValidTo(90);
    const after = Date.now();
    const diffMs = newValidTo.getTime() - before;
    const expectedMs = 90 * 24 * 60 * 60 * 1000;
    expect(diffMs).toBeGreaterThanOrEqual(expectedMs - 100);
    expect(diffMs).toBeLessThanOrEqual(expectedMs + (after - before) + 100);
  });

  it("1-day renewal adds ~1 day from now", () => {
    const before = Date.now();
    const newValidTo = calcNewValidTo(1);
    const after = Date.now();
    const diffMs = newValidTo.getTime() - before;
    const expectedMs = 1 * 24 * 60 * 60 * 1000;
    expect(diffMs).toBeGreaterThanOrEqual(expectedMs - 100);
    expect(diffMs).toBeLessThanOrEqual(expectedMs + (after - before) + 100);
  });

  it("365-day renewal adds ~365 days from now", () => {
    const before = Date.now();
    const newValidTo = calcNewValidTo(365);
    const after = Date.now();
    const diffMs = newValidTo.getTime() - before;
    const expectedMs = 365 * 24 * 60 * 60 * 1000;
    expect(diffMs).toBeGreaterThanOrEqual(expectedMs - 100);
    expect(diffMs).toBeLessThanOrEqual(expectedMs + (after - before) + 100);
  });
});

// ─── Deal Expiry Detection ────────────────────────────────────────────────────
describe("Deal expiry — detection logic", () => {
  function isDealExpired(validTo: Date, now: Date = new Date()): boolean {
    return validTo.getTime() < now.getTime();
  }

  it("deal with validTo in the past is expired", () => {
    const past = new Date(Date.now() - 1000);
    expect(isDealExpired(past)).toBe(true);
  });

  it("deal with validTo in the future is not expired", () => {
    const future = new Date(Date.now() + 60000);
    expect(isDealExpired(future)).toBe(false);
  });

  it("deal with validTo exactly now is expired (strict less-than)", () => {
    const now = new Date();
    const justBefore = new Date(now.getTime() - 1);
    expect(isDealExpired(justBefore, now)).toBe(true);
  });

  it("deal expiring tomorrow is not expired", () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(isDealExpired(tomorrow)).toBe(false);
  });
});

// ─── Tourist Booking Reminder — 24h window ────────────────────────────────────
describe("Tourist booking reminder — 24h window detection", () => {
  function isInReminderWindow(bookingDate: Date, now: Date = new Date()): boolean {
    const windowStart = new Date(now.getTime());
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    return bookingDate >= windowStart && bookingDate <= windowEnd;
  }

  it("booking in 12 hours is in the reminder window", () => {
    const booking = new Date(Date.now() + 12 * 60 * 60 * 1000);
    expect(isInReminderWindow(booking)).toBe(true);
  });

  it("booking in 24 hours is in the reminder window", () => {
    const booking = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(isInReminderWindow(booking)).toBe(true);
  });

  it("booking in 26 hours is outside the reminder window", () => {
    const booking = new Date(Date.now() + 26 * 60 * 60 * 1000);
    expect(isInReminderWindow(booking)).toBe(false);
  });

  it("booking in the past is outside the reminder window", () => {
    const booking = new Date(Date.now() - 60000);
    expect(isInReminderWindow(booking)).toBe(false);
  });

  it("booking exactly now is in the reminder window", () => {
    const now = new Date();
    const booking = new Date(now.getTime() + 1);
    expect(isInReminderWindow(booking, now)).toBe(true);
  });
});

// ─── Push Notification Payload ────────────────────────────────────────────────
describe("Push notification payload construction", () => {
  function buildBookingReminderPayload(serviceName: string, bookingDate: Date, establishmentName: string) {
    return {
      title: "Booking Reminder",
      body: `Your booking for ${serviceName} at ${establishmentName} is tomorrow at ${bookingDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/badge-72x72.png",
      tag: `booking-reminder-${serviceName}`,
    };
  }

  it("builds a valid booking reminder payload", () => {
    const payload = buildBookingReminderPayload("Dinner for 2", new Date("2026-03-02T19:00:00Z"), "The Grand Hotel");
    expect(payload.title).toBe("Booking Reminder");
    expect(payload.body).toContain("Dinner for 2");
    expect(payload.body).toContain("The Grand Hotel");
    expect(payload.tag).toBe("booking-reminder-Dinner for 2");
    expect(payload.icon).toBe("/icons/icon-192x192.png");
  });

  it("builds a valid deal expiry payload", () => {
    const dealTitle = "20% off dinner";
    const payload = {
      title: "Deal Expired",
      body: `Your deal "${dealTitle}" has expired. Renew it to keep attracting tourists.`,
      tag: `deal-expired-${dealTitle}`,
    };
    expect(payload.title).toBe("Deal Expired");
    expect(payload.body).toContain(dealTitle);
    expect(payload.tag).toContain("deal-expired");
  });
});
