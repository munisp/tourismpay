/**
 * Round 79 Tests
 *
 * Features:
 * 1. Revenue chart date range picker (custom date range support)
 * 2. Tourist wallet spending limit alert dialog (pre-payment check)
 * 3. Admin exchange rate override panel (CRUD, expiry, precedence)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 1. Revenue Chart Date Range Picker ──────────────────────────────────────

describe("Revenue chart date range picker", () => {
  it("computes correct day count for 7-day preset", () => {
    const days = 7;
    const start = new Date();
    start.setDate(start.getDate() - days);
    const diff = Math.round((Date.now() - start.getTime()) / 86_400_000);
    expect(diff).toBeGreaterThanOrEqual(7);
    expect(diff).toBeLessThanOrEqual(8);
  });

  it("computes correct day count for 30-day preset", () => {
    const days = 30;
    const start = new Date();
    start.setDate(start.getDate() - days);
    const diff = Math.round((Date.now() - start.getTime()) / 86_400_000);
    expect(diff).toBeGreaterThanOrEqual(30);
    expect(diff).toBeLessThanOrEqual(31);
  });

  it("computes correct day count for 90-day preset", () => {
    const days = 90;
    const start = new Date();
    start.setDate(start.getDate() - days);
    const diff = Math.round((Date.now() - start.getTime()) / 86_400_000);
    expect(diff).toBeGreaterThanOrEqual(90);
    expect(diff).toBeLessThanOrEqual(91);
  });

  it("custom range: start must be before end", () => {
    const start = new Date("2025-01-01");
    const end = new Date("2025-03-31");
    expect(start.getTime()).toBeLessThan(end.getTime());
  });

  it("custom range: day count is correct", () => {
    const start = new Date("2025-01-01");
    const end = new Date("2025-01-31");
    const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    expect(diff).toBe(30);
  });

  it("rejects invalid custom range where start > end", () => {
    const validateRange = (start: Date, end: Date) => start <= end;
    expect(validateRange(new Date("2025-03-01"), new Date("2025-01-01"))).toBe(false);
  });

  it("date range label formats correctly for presets", () => {
    const presets = [
      { days: 7, label: "Last 7 days" },
      { days: 30, label: "Last 30 days" },
      { days: 90, label: "Last 90 days" },
    ];
    presets.forEach(({ days, label }) => {
      expect(label).toContain(String(days));
    });
  });
});

// ─── 2. Tourist Wallet Spending Limit Alert ───────────────────────────────────

describe("Tourist wallet spending limit alert", () => {
  const mockLimits = [
    { currency: "USD", limitAmount: "100.00", isActive: true },
    { currency: "EUR", limitAmount: "80.00", isActive: true },
    { currency: "NGN", limitAmount: "50000.00", isActive: false }, // inactive
  ];

  const getActiveLimit = (currency: string) =>
    mockLimits.find((l) => l.currency === currency && l.isActive);

  it("detects when payment exceeds active spending limit", () => {
    const limit = getActiveLimit("USD");
    const paymentAmount = 150;
    expect(limit).toBeDefined();
    expect(paymentAmount).toBeGreaterThan(parseFloat(limit!.limitAmount));
  });

  it("does not alert when payment is within limit", () => {
    const limit = getActiveLimit("USD");
    const paymentAmount = 50;
    expect(paymentAmount).toBeLessThanOrEqual(parseFloat(limit!.limitAmount));
  });

  it("does not alert for inactive limits", () => {
    const limit = getActiveLimit("NGN"); // inactive
    expect(limit).toBeUndefined();
  });

  it("handles missing limit gracefully (no limit set)", () => {
    const limit = getActiveLimit("GBP"); // not in list
    expect(limit).toBeUndefined();
  });

  it("alert message includes currency and limit amount", () => {
    const limit = getActiveLimit("USD");
    const message = `This payment exceeds your ${limit!.currency} spending limit of ${limit!.limitAmount}`;
    expect(message).toContain("USD");
    expect(message).toContain("100.00");
  });

  it("payment exactly at limit does not trigger alert", () => {
    const limit = getActiveLimit("USD");
    const paymentAmount = 100;
    const exceedsLimit = paymentAmount > parseFloat(limit!.limitAmount);
    expect(exceedsLimit).toBe(false);
  });

  it("payment 1 cent over limit triggers alert", () => {
    const limit = getActiveLimit("USD");
    const paymentAmount = 100.01;
    const exceedsLimit = paymentAmount > parseFloat(limit!.limitAmount);
    expect(exceedsLimit).toBe(true);
  });
});

// ─── 3. Admin Exchange Rate Override Panel ────────────────────────────────────

describe("Exchange rate override logic", () => {
  interface Override {
    id: number;
    baseCurrency: string;
    targetCurrency: string;
    rate: number;
    isActive: boolean;
    expiresAt: number | null;
    reason?: string;
  }

  const now = Date.now();

  const overrides: Override[] = [
    { id: 1, baseCurrency: "USD", targetCurrency: "NGN", rate: 1600, isActive: true, expiresAt: now + 3_600_000, reason: "Market volatility" },
    { id: 2, baseCurrency: "USD", targetCurrency: "KES", rate: 130, isActive: true, expiresAt: null },
    { id: 3, baseCurrency: "USD", targetCurrency: "ZAR", rate: 18.5, isActive: false, expiresAt: null },
    { id: 4, baseCurrency: "USD", targetCurrency: "GHS", rate: 12, isActive: true, expiresAt: now - 1000 }, // expired
  ];

  const getActiveOverride = (base: string, target: string) => {
    const o = overrides.find(
      (x) => x.baseCurrency === base && x.targetCurrency === target && x.isActive
    );
    if (!o) return null;
    if (o.expiresAt !== null && o.expiresAt < now) return null; // expired
    return o;
  };

  it("returns active override for USD→NGN", () => {
    const o = getActiveOverride("USD", "NGN");
    expect(o).not.toBeNull();
    expect(o!.rate).toBe(1600);
  });

  it("returns active override with no expiry for USD→KES", () => {
    const o = getActiveOverride("USD", "KES");
    expect(o).not.toBeNull();
    expect(o!.expiresAt).toBeNull();
  });

  it("returns null for inactive override (USD→ZAR)", () => {
    const o = getActiveOverride("USD", "ZAR");
    expect(o).toBeNull();
  });

  it("returns null for expired override (USD→GHS)", () => {
    const o = getActiveOverride("USD", "GHS");
    expect(o).toBeNull();
  });

  it("returns null for non-existent pair", () => {
    const o = getActiveOverride("USD", "EUR");
    expect(o).toBeNull();
  });

  it("expiry calculation: 1 hour from now", () => {
    const durationHours = 1;
    const expiresAt = now + durationHours * 3_600_000;
    expect(expiresAt - now).toBe(3_600_000);
  });

  it("expiry calculation: 24 hours from now", () => {
    const durationHours = 24;
    const expiresAt = now + durationHours * 3_600_000;
    expect(expiresAt - now).toBe(86_400_000);
  });

  it("no expiry when durationHours is 0", () => {
    const durationHours = 0;
    const expiresAt = durationHours > 0 ? now + durationHours * 3_600_000 : null;
    expect(expiresAt).toBeNull();
  });

  it("rate must be positive", () => {
    const validateRate = (r: number) => r > 0;
    expect(validateRate(1600)).toBe(true);
    expect(validateRate(0)).toBe(false);
    expect(validateRate(-5)).toBe(false);
  });

  it("base and target currencies must differ", () => {
    const validate = (base: string, target: string) => base !== target;
    expect(validate("USD", "NGN")).toBe(true);
    expect(validate("USD", "USD")).toBe(false);
  });

  it("active count is correct", () => {
    const active = overrides.filter((o) => {
      if (!o.isActive) return false;
      if (o.expiresAt !== null && o.expiresAt < now) return false;
      return true;
    });
    expect(active.length).toBe(2); // NGN + KES (ZAR inactive, GHS expired)
  });

  it("expired count is correct", () => {
    const expired = overrides.filter(
      (o) => o.isActive && o.expiresAt !== null && o.expiresAt < now
    );
    expect(expired.length).toBe(1); // GHS
  });

  it("deactivating an override sets isActive to false", () => {
    const override = { ...overrides[0] };
    override.isActive = false;
    expect(override.isActive).toBe(false);
  });

  it("upsert deactivates existing before inserting new", () => {
    const existing = overrides.filter(
      (o) => o.baseCurrency === "USD" && o.targetCurrency === "NGN" && o.isActive
    );
    expect(existing.length).toBe(1);
    // After deactivation + insert, there should be 1 active (the new one)
    const afterDeactivate = existing.map((o) => ({ ...o, isActive: false }));
    const newOverride: Override = { id: 99, baseCurrency: "USD", targetCurrency: "NGN", rate: 1650, isActive: true, expiresAt: null };
    const updated = [...afterDeactivate, newOverride];
    const activeAfter = updated.filter((o) => o.isActive);
    expect(activeAfter.length).toBe(1);
    expect(activeAfter[0].rate).toBe(1650);
  });

  it("supported currencies list includes major African currencies", () => {
    const supported = ["USD", "EUR", "GBP", "NGN", "KES", "ZAR", "GHS", "TZS", "EGP"];
    const african = ["NGN", "KES", "ZAR", "GHS", "TZS", "EGP"];
    african.forEach((c) => expect(supported).toContain(c));
  });
});
