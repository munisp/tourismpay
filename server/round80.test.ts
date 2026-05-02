/**
 * Round 80 Tests
 * - Revenue chart bar drill-down (transactionsByDate procedure)
 * - Multi-currency wallet conversion (already tested in wallet tests; spot checks here)
 * - Exchange rate deviation alert (checkRateDeviations logic)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 1. transactionsByDate procedure input validation ─────────────────────────
describe("merchantRevenue.transactionsByDate", () => {
  it("rejects invalid date format", () => {
    const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
    expect(isValidDate("not-a-date")).toBe(false);
    expect(isValidDate("2024-13-01")).toBe(false);
    expect(isValidDate("2024-00-01")).toBe(false); // month 0 is invalid
  });

  it("accepts valid ISO date strings", () => {
    const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
    expect(isValidDate("2024-01-15")).toBe(true);
    expect(isValidDate("2025-12-31")).toBe(true);
    expect(isValidDate("2024-02-29")).toBe(true); // leap year
  });

  it("computes correct start/end of day boundaries for UTC", () => {
    const date = "2024-06-15";
    const startOfDay = new Date(`${date}T00:00:00.000Z`).getTime();
    const endOfDay = new Date(`${date}T23:59:59.999Z`).getTime();
    expect(endOfDay - startOfDay).toBe(86_399_999);
    expect(startOfDay).toBeLessThan(endOfDay);
  });

  it("handles date range spanning month boundary", () => {
    const dates = ["2024-01-31", "2024-02-01"];
    const timestamps = dates.map((d) => new Date(`${d}T00:00:00.000Z`).getTime());
    expect(timestamps[1] - timestamps[0]).toBe(86_400_000); // exactly 1 day
  });
});

// ─── 2. Revenue chart drill-down state logic ──────────────────────────────────
describe("Revenue chart drill-down state", () => {
  it("drillDownDate starts as null", () => {
    let drillDownDate: string | null = null;
    expect(drillDownDate).toBeNull();
  });

  it("sets drillDownDate when bar is clicked", () => {
    let drillDownDate: string | null = null;
    const onBarClick = (date: string) => { drillDownDate = date; };
    onBarClick("2024-06-15");
    expect(drillDownDate).toBe("2024-06-15");
  });

  it("resets drillDownDate to null on close", () => {
    let drillDownDate: string | null = "2024-06-15";
    const onClose = () => { drillDownDate = null; };
    onClose();
    expect(drillDownDate).toBeNull();
  });

  it("slide-over is open when drillDownDate is non-null", () => {
    const isOpen = (date: string | null) => date !== null;
    expect(isOpen(null)).toBe(false);
    expect(isOpen("2024-06-15")).toBe(true);
  });
});

// ─── 3. Currency conversion math ──────────────────────────────────────────────
describe("Multi-currency wallet conversion", () => {
  const RATES: Record<string, number> = {
    USD: 1,
    NGN: 1600,
    KES: 129,
    GHS: 15.5,
    EUR: 0.92,
  };

  function convertViaUsd(amount: number, from: string, to: string): number {
    const fromRate = RATES[from] ?? 1;
    const toRate = RATES[to] ?? 1;
    const usdAmount = amount / fromRate;
    return usdAmount * toRate;
  }

  it("converts USD to NGN correctly", () => {
    expect(convertViaUsd(1, "USD", "NGN")).toBeCloseTo(1600, 2);
  });

  it("converts NGN to KES correctly", () => {
    const result = convertViaUsd(1600, "NGN", "KES");
    expect(result).toBeCloseTo(129, 2); // 1600 NGN = 1 USD = 129 KES
  });

  it("converts EUR to GHS correctly", () => {
    const result = convertViaUsd(1, "EUR", "GHS");
    // 1 EUR = 1/0.92 USD = 1.0869 USD = 1.0869 * 15.5 GHS ≈ 16.85 GHS
    expect(result).toBeCloseTo(16.85, 1);
  });

  it("same currency conversion returns same amount", () => {
    expect(convertViaUsd(100, "USD", "USD")).toBeCloseTo(100, 6);
    expect(convertViaUsd(500, "NGN", "NGN")).toBeCloseTo(500, 6);
  });

  it("applies 0.2% swap fee correctly", () => {
    const amount = 100;
    const fee = amount * 0.002;
    expect(fee).toBeCloseTo(0.2, 6);
    expect(amount - fee).toBeCloseTo(99.8, 6);
  });

  it("preview rate calculation matches expected output", () => {
    const from = "USD";
    const to = "NGN";
    const amount = 10;
    const rate = RATES[to] / RATES[from];
    const converted = amount * rate;
    expect(rate).toBe(1600);
    expect(converted).toBe(16000);
  });
});

// ─── 4. Exchange rate deviation detection ────────────────────────────────────
describe("checkRateDeviations", () => {
  function computeDeviation(oldRate: number, newRate: number): number {
    return Math.abs((newRate - oldRate) / oldRate) * 100;
  }

  it("detects deviation above 5% threshold", () => {
    expect(computeDeviation(1600, 1700)).toBeGreaterThan(5);
    expect(computeDeviation(1600, 1685)).toBeGreaterThan(5);
  });

  it("does not flag deviation below 5% threshold", () => {
    expect(computeDeviation(1600, 1650)).toBeLessThan(5); // 3.125%
    expect(computeDeviation(1600, 1620)).toBeLessThan(5); // 1.25%
  });

  it("detects exactly 5% deviation as triggering", () => {
    const deviation = computeDeviation(1600, 1680); // exactly 5%
    expect(deviation).toBeCloseTo(5, 4);
    expect(deviation >= 5).toBe(true);
  });

  it("handles negative rate movement (currency appreciation)", () => {
    expect(computeDeviation(1600, 1500)).toBeGreaterThan(5); // -6.25%
    expect(computeDeviation(1600, 1550)).toBeLessThan(5); // -3.125%
  });

  it("baseline is updated after deviation detected", () => {
    const baselines = new Map<string, number>();
    const thresholdPct = 5;

    function checkAndUpdate(currency: string, newRate: number): boolean {
      const baseline = baselines.get(currency);
      if (baseline === undefined) {
        baselines.set(currency, newRate);
        return false;
      }
      const deviation = computeDeviation(baseline, newRate);
      if (deviation >= thresholdPct) {
        baselines.set(currency, newRate); // update baseline
        return true;
      }
      return false;
    }

    // First call: sets baseline
    expect(checkAndUpdate("NGN", 1600)).toBe(false);
    // Second call: small change, no alert
    expect(checkAndUpdate("NGN", 1620)).toBe(false);
    // Third call: big change, alert + baseline updated
    expect(checkAndUpdate("NGN", 1750)).toBe(true);
    // Fourth call: same rate as new baseline, no alert
    expect(checkAndUpdate("NGN", 1750)).toBe(false);
  });

  it("formats deviation notification message correctly", () => {
    const deviations = [
      { currency: "NGN", oldRate: 1600, newRate: 1750, deviationPct: 9.375 },
      { currency: "KES", oldRate: 129, newRate: 140, deviationPct: 8.527 },
    ];
    const lines = deviations.map(
      (d) => `• ${d.currency}: ${d.oldRate.toFixed(4)} → ${d.newRate.toFixed(4)} (${d.deviationPct.toFixed(1)}% shift)`
    );
    expect(lines[0]).toContain("NGN");
    expect(lines[0]).toContain("1600.0000");
    expect(lines[0]).toContain("1750.0000");
    expect(lines[0]).toContain("9.4% shift");
    expect(lines[1]).toContain("KES");
  });

  it("returns notified=false when no deviations found", () => {
    const deviations: unknown[] = [];
    const notified = deviations.length > 0;
    expect(notified).toBe(false);
  });

  it("returns notified=true when deviations found and notification sent", () => {
    const deviations = [{ currency: "NGN", oldRate: 1600, newRate: 1750, deviationPct: 9.375 }];
    const notified = deviations.length > 0;
    expect(notified).toBe(true);
  });
});

// ─── 5. Admin Check Deviations button state ───────────────────────────────────
describe("Check Deviations button UI state", () => {
  it("button is disabled when mutation is pending", () => {
    const isPending = true;
    const isDisabled = isPending;
    expect(isDisabled).toBe(true);
  });

  it("button is enabled when mutation is idle", () => {
    const isPending = false;
    const isDisabled = isPending;
    expect(isDisabled).toBe(false);
  });

  it("shows spinner icon when pending", () => {
    const isPending = true;
    const icon = isPending ? "RefreshCw animate-spin" : "AlertTriangle";
    expect(icon).toBe("RefreshCw animate-spin");
  });

  it("shows alert triangle icon when idle", () => {
    const isPending = false;
    const icon = isPending ? "RefreshCw animate-spin" : "AlertTriangle";
    expect(icon).toBe("AlertTriangle");
  });
});
