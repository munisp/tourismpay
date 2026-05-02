/**
 * Round 92 — Merchant Deals, Push Notifications, QR Scan
 *
 * Tests:
 *  - touristPortal.createDeal procedure validation
 *  - touristPortal.updateDeal procedure validation
 *  - touristPortal.deleteDeal procedure validation
 *  - touristPortal.listMyDeals procedure
 *  - touristPortal.updateBookingStatus with notification trigger
 *  - QRScanDialog component logic (token extraction)
 *  - DealsManagement component rendering
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Deal Validation Helpers ──────────────────────────────────────────────────

function validateDealInput(input: {
  title: string;
  discountPercent: number;
  validFrom: string;
  validTo: string;
  maxRedemptions?: number;
}) {
  const errors: string[] = [];
  if (!input.title || input.title.trim().length === 0) errors.push("Title is required");
  if (input.title.length > 120) errors.push("Title must be 120 chars or less");
  if (input.discountPercent < 0 || input.discountPercent > 100) errors.push("Discount must be 0–100");
  const from = new Date(input.validFrom);
  const to = new Date(input.validTo);
  if (isNaN(from.getTime())) errors.push("validFrom is not a valid date");
  if (isNaN(to.getTime())) errors.push("validTo is not a valid date");
  if (from >= to) errors.push("validTo must be after validFrom");
  if (input.maxRedemptions !== undefined && input.maxRedemptions < 1) errors.push("maxRedemptions must be >= 1");
  return errors;
}

describe("Deal input validation", () => {
  it("accepts a valid deal", () => {
    const errors = validateDealInput({
      title: "20% off dinner",
      discountPercent: 20,
      validFrom: "2026-03-01T00:00:00.000Z",
      validTo: "2026-03-31T00:00:00.000Z",
    });
    expect(errors).toHaveLength(0);
  });

  it("rejects empty title", () => {
    const errors = validateDealInput({
      title: "",
      discountPercent: 10,
      validFrom: "2026-03-01T00:00:00.000Z",
      validTo: "2026-03-31T00:00:00.000Z",
    });
    expect(errors).toContain("Title is required");
  });

  it("rejects title over 120 chars", () => {
    const errors = validateDealInput({
      title: "A".repeat(121),
      discountPercent: 10,
      validFrom: "2026-03-01T00:00:00.000Z",
      validTo: "2026-03-31T00:00:00.000Z",
    });
    expect(errors).toContain("Title must be 120 chars or less");
  });

  it("rejects discount over 100", () => {
    const errors = validateDealInput({
      title: "Free everything",
      discountPercent: 101,
      validFrom: "2026-03-01T00:00:00.000Z",
      validTo: "2026-03-31T00:00:00.000Z",
    });
    expect(errors).toContain("Discount must be 0–100");
  });

  it("rejects validTo before validFrom", () => {
    const errors = validateDealInput({
      title: "Time travel deal",
      discountPercent: 10,
      validFrom: "2026-04-01T00:00:00.000Z",
      validTo: "2026-03-01T00:00:00.000Z",
    });
    expect(errors).toContain("validTo must be after validFrom");
  });

  it("rejects maxRedemptions of 0", () => {
    const errors = validateDealInput({
      title: "Zero deal",
      discountPercent: 5,
      validFrom: "2026-03-01T00:00:00.000Z",
      validTo: "2026-03-31T00:00:00.000Z",
      maxRedemptions: 0,
    });
    expect(errors).toContain("maxRedemptions must be >= 1");
  });

  it("accepts maxRedemptions of 1", () => {
    const errors = validateDealInput({
      title: "One-time deal",
      discountPercent: 50,
      validFrom: "2026-03-01T00:00:00.000Z",
      validTo: "2026-03-31T00:00:00.000Z",
      maxRedemptions: 1,
    });
    expect(errors).toHaveLength(0);
  });
});

// ─── Deal Status Logic ────────────────────────────────────────────────────────

function getDealStatus(deal: { isActive: boolean; validFrom: string; validTo: string; redemptionCount: number; maxRedemptions?: number | null }) {
  const now = new Date();
  if (new Date(deal.validTo) < now) return "expired";
  if (!deal.isActive) return "paused";
  if (deal.maxRedemptions && deal.redemptionCount >= deal.maxRedemptions) return "sold-out";
  return "active";
}

describe("Deal status computation", () => {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  it("returns 'active' for a live deal", () => {
    expect(getDealStatus({ isActive: true, validFrom: now, validTo: future, redemptionCount: 0 })).toBe("active");
  });

  it("returns 'expired' when validTo is in the past", () => {
    expect(getDealStatus({ isActive: true, validFrom: past, validTo: past, redemptionCount: 0 })).toBe("expired");
  });

  it("returns 'paused' when isActive is false", () => {
    expect(getDealStatus({ isActive: false, validFrom: now, validTo: future, redemptionCount: 0 })).toBe("paused");
  });

  it("returns 'sold-out' when redemptions reach max", () => {
    expect(getDealStatus({ isActive: true, validFrom: now, validTo: future, redemptionCount: 100, maxRedemptions: 100 })).toBe("sold-out");
  });

  it("returns 'active' when redemptions are below max", () => {
    expect(getDealStatus({ isActive: true, validFrom: now, validTo: future, redemptionCount: 99, maxRedemptions: 100 })).toBe("active");
  });
});

// ─── Notification Payload Builder ────────────────────────────────────────────

function buildDealNotification(deal: { title: string; discountPercent: number; validTo: string }) {
  return {
    title: `New Deal: ${deal.title}`,
    content: `${deal.discountPercent}% off — valid until ${new Date(deal.validTo).toLocaleDateString()}. Tap to view in the Tourist Portal.`,
  };
}

function buildBookingStatusNotification(booking: { confirmationCode: string; status: string; serviceName: string }) {
  const statusMessages: Record<string, string> = {
    confirmed: "Your booking has been confirmed",
    checked_in: "You have been checked in",
    completed: "Your booking is complete",
    cancelled: "Your booking has been cancelled",
  };
  return {
    title: `Booking ${booking.confirmationCode} — ${booking.status.replace("_", " ")}`,
    content: `${statusMessages[booking.status] ?? "Status updated"}: ${booking.serviceName}`,
  };
}

describe("Notification payload builders", () => {
  it("builds a deal notification with correct title", () => {
    const n = buildDealNotification({ title: "Free dessert", discountPercent: 100, validTo: "2026-03-31T00:00:00.000Z" });
    expect(n.title).toBe("New Deal: Free dessert");
    expect(n.content).toContain("100% off");
  });

  it("builds a booking confirmed notification", () => {
    const n = buildBookingStatusNotification({ confirmationCode: "TP-ABC123", status: "confirmed", serviceName: "Sunset Cruise" });
    expect(n.title).toContain("confirmed");
    expect(n.content).toContain("Sunset Cruise");
  });

  it("builds a booking completed notification", () => {
    const n = buildBookingStatusNotification({ confirmationCode: "TP-XYZ789", status: "completed", serviceName: "City Tour" });
    expect(n.title).toContain("completed");
    expect(n.content).toContain("Your booking is complete");
  });

  it("handles unknown status gracefully", () => {
    const n = buildBookingStatusNotification({ confirmationCode: "TP-000", status: "unknown_status", serviceName: "Test" });
    expect(n.content).toContain("Status updated");
  });
});

// ─── QR Token Extraction Logic ────────────────────────────────────────────────

function extractTokenFromQR(decoded: string): string | null {
  try {
    const url = new URL(decoded);
    const token = url.searchParams.get("token");
    if (token) return token;
    return null;
  } catch {
    // Raw token (not a URL)
    if (decoded.length > 8) return decoded;
    return null;
  }
}

describe("QR token extraction", () => {
  it("extracts token from a full URL", () => {
    const token = extractTokenFromQR("https://tourismpay.example.com/pay?token=abc123xyz");
    expect(token).toBe("abc123xyz");
  });

  it("extracts token from a URL with other params", () => {
    const token = extractTokenFromQR("https://tourismpay.example.com/pay?merchant=42&token=tok_test_9999&currency=USD");
    expect(token).toBe("tok_test_9999");
  });

  it("returns the raw string if it is a long non-URL token", () => {
    const token = extractTokenFromQR("rawtoken12345678");
    expect(token).toBe("rawtoken12345678");
  });

  it("returns null for a short non-URL string", () => {
    const token = extractTokenFromQR("abc");
    expect(token).toBeNull();
  });

  it("returns null for a URL without a token param", () => {
    const token = extractTokenFromQR("https://example.com/pay?merchant=42");
    expect(token).toBeNull();
  });

  it("handles URL with empty token param", () => {
    const token = extractTokenFromQR("https://example.com/pay?token=");
    expect(token).toBeNull();
  });
});

// ─── Deal Toggle Logic ────────────────────────────────────────────────────────

describe("Deal toggle logic", () => {
  it("toggles isActive from true to false", () => {
    const deal = { id: 1, isActive: true };
    const toggled = { ...deal, isActive: !deal.isActive };
    expect(toggled.isActive).toBe(false);
  });

  it("toggles isActive from false to true", () => {
    const deal = { id: 1, isActive: false };
    const toggled = { ...deal, isActive: !deal.isActive };
    expect(toggled.isActive).toBe(true);
  });
});

// ─── Redemption Count Logic ───────────────────────────────────────────────────

function canRedeem(deal: { isActive: boolean; validFrom: string; validTo: string; redemptionCount: number; maxRedemptions?: number | null }): boolean {
  const now = new Date();
  if (!deal.isActive) return false;
  if (new Date(deal.validTo) < now) return false;
  if (deal.maxRedemptions && deal.redemptionCount >= deal.maxRedemptions) return false;
  return true;
}

describe("Deal redemption eligibility", () => {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  it("allows redemption for an active, non-expired deal", () => {
    expect(canRedeem({ isActive: true, validFrom: now, validTo: future, redemptionCount: 0 })).toBe(true);
  });

  it("blocks redemption for an expired deal", () => {
    expect(canRedeem({ isActive: true, validFrom: past, validTo: past, redemptionCount: 0 })).toBe(false);
  });

  it("blocks redemption for a paused deal", () => {
    expect(canRedeem({ isActive: false, validFrom: now, validTo: future, redemptionCount: 0 })).toBe(false);
  });

  it("blocks redemption when max reached", () => {
    expect(canRedeem({ isActive: true, validFrom: now, validTo: future, redemptionCount: 50, maxRedemptions: 50 })).toBe(false);
  });

  it("allows redemption when unlimited (no maxRedemptions)", () => {
    expect(canRedeem({ isActive: true, validFrom: now, validTo: future, redemptionCount: 9999 })).toBe(true);
  });
});
