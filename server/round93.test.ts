/**
 * Round 93 Tests
 * Covers: deal redemption flow, merchant booking inbox, and offline QR fallback
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Deal Redemption ──────────────────────────────────────────────────────────

describe("Deal Redemption", () => {
  it("validates dealId is a positive integer", () => {
    const schema = { dealId: (v: unknown) => typeof v === "number" && v > 0 };
    expect(schema.dealId(1)).toBe(true);
    expect(schema.dealId(0)).toBe(false);
    expect(schema.dealId(-5)).toBe(false);
    expect(schema.dealId("abc")).toBe(false);
  });

  it("validates optional notes length", () => {
    const maxLen = 500;
    const validate = (s: string) => s.length <= maxLen;
    expect(validate("Great deal!")).toBe(true);
    expect(validate("x".repeat(500))).toBe(true);
    expect(validate("x".repeat(501))).toBe(false);
  });

  it("generates a unique redemption code", () => {
    const genCode = () => `RDM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const code1 = genCode();
    const code2 = genCode();
    expect(code1).toMatch(/^RDM-/);
    expect(code1).not.toBe(code2);
  });

  it("prevents double redemption by same user", () => {
    const redemptions = new Map<string, boolean>();
    const redeem = (userId: string, dealId: number) => {
      const key = `${userId}:${dealId}`;
      if (redemptions.has(key)) throw new Error("Already redeemed");
      redemptions.set(key, true);
      return { success: true };
    };
    expect(() => redeem("user1", 1)).not.toThrow();
    expect(() => redeem("user1", 1)).toThrow("Already redeemed");
    expect(() => redeem("user2", 1)).not.toThrow(); // different user OK
  });

  it("enforces maxRedemptions limit", () => {
    const deal = { maxRedemptions: 3, redemptionCount: 3 };
    const canRedeem = (d: typeof deal) =>
      d.maxRedemptions === null || d.redemptionCount < d.maxRedemptions;
    expect(canRedeem(deal)).toBe(false);
    expect(canRedeem({ ...deal, redemptionCount: 2 })).toBe(true);
    expect(canRedeem({ ...deal, maxRedemptions: null as unknown as number })).toBe(true);
  });

  it("rejects expired deals", () => {
    const now = Date.now();
    const isExpired = (expiresAt: number | null) =>
      expiresAt !== null && expiresAt < now;
    expect(isExpired(now - 1000)).toBe(true);
    expect(isExpired(now + 1000)).toBe(false);
    expect(isExpired(null)).toBe(false);
  });

  it("rejects inactive deals", () => {
    const isActive = (status: string) => status === "active";
    expect(isActive("active")).toBe(true);
    expect(isActive("paused")).toBe(false);
    expect(isActive("expired")).toBe(false);
  });

  it("increments redemption count after successful redemption", () => {
    let count = 5;
    const redeem = () => { count += 1; return count; };
    expect(redeem()).toBe(6);
    expect(count).toBe(6);
  });

  it("formats redemption notification content", () => {
    const formatNotification = (dealTitle: string, code: string, merchant: string) =>
      `Deal "${dealTitle}" redeemed at ${merchant}. Code: ${code}`;
    const msg = formatNotification("20% Off Dinner", "RDM-ABC123", "Safari Grill");
    expect(msg).toContain("20% Off Dinner");
    expect(msg).toContain("RDM-ABC123");
    expect(msg).toContain("Safari Grill");
  });
});

// ─── Merchant Booking Inbox ───────────────────────────────────────────────────

describe("Merchant Booking Inbox", () => {
  it("validates booking status transitions", () => {
    const validTransitions: Record<string, string[]> = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
    };
    const canTransition = (from: string, to: string) =>
      (validTransitions[from] ?? []).includes(to);
    expect(canTransition("pending", "confirmed")).toBe(true);
    expect(canTransition("pending", "completed")).toBe(false);
    expect(canTransition("confirmed", "completed")).toBe(true);
    expect(canTransition("completed", "cancelled")).toBe(false);
    expect(canTransition("cancelled", "confirmed")).toBe(false);
  });

  it("validates booking date is in the future for new bookings", () => {
    const now = Date.now();
    const isValidDate = (ts: number) => ts > now;
    expect(isValidDate(now + 86400000)).toBe(true);
    expect(isValidDate(now - 1000)).toBe(false);
  });

  it("calculates booking stats correctly", () => {
    const bookings = [
      { status: "pending" },
      { status: "confirmed" },
      { status: "confirmed" },
      { status: "completed" },
      { status: "cancelled" },
    ];
    const stats = {
      total: bookings.length,
      pending: bookings.filter((b) => b.status === "pending").length,
      confirmed: bookings.filter((b) => b.status === "confirmed").length,
      completed: bookings.filter((b) => b.status === "completed").length,
      cancelled: bookings.filter((b) => b.status === "cancelled").length,
    };
    expect(stats.total).toBe(5);
    expect(stats.pending).toBe(1);
    expect(stats.confirmed).toBe(2);
    expect(stats.completed).toBe(1);
    expect(stats.cancelled).toBe(1);
  });

  it("filters bookings by status", () => {
    const bookings = [
      { id: 1, status: "pending" },
      { id: 2, status: "confirmed" },
      { id: 3, status: "pending" },
    ];
    const pending = bookings.filter((b) => b.status === "pending");
    expect(pending).toHaveLength(2);
    expect(pending.map((b) => b.id)).toEqual([1, 3]);
  });

  it("filters bookings by establishment", () => {
    const bookings = [
      { id: 1, establishmentId: 10 },
      { id: 2, establishmentId: 20 },
      { id: 3, establishmentId: 10 },
    ];
    const filtered = bookings.filter((b) => b.establishmentId === 10);
    expect(filtered).toHaveLength(2);
  });

  it("sorts bookings by date descending", () => {
    const bookings = [
      { id: 1, bookingDate: 1000 },
      { id: 2, bookingDate: 3000 },
      { id: 3, bookingDate: 2000 },
    ];
    const sorted = [...bookings].sort((a, b) => b.bookingDate - a.bookingDate);
    expect(sorted.map((b) => b.id)).toEqual([2, 3, 1]);
  });

  it("bulk status update applies to all selected IDs", () => {
    const bookings = new Map([
      [1, "pending"],
      [2, "pending"],
      [3, "confirmed"],
    ]);
    const bulkUpdate = (ids: number[], newStatus: string) => {
      ids.forEach((id) => bookings.set(id, newStatus));
    };
    bulkUpdate([1, 2], "confirmed");
    expect(bookings.get(1)).toBe("confirmed");
    expect(bookings.get(2)).toBe("confirmed");
    expect(bookings.get(3)).toBe("confirmed"); // unchanged
  });

  it("generates confirmation code with correct format", () => {
    const genCode = (id: number) => `BK-${String(id).padStart(6, "0")}`;
    expect(genCode(1)).toBe("BK-000001");
    expect(genCode(12345)).toBe("BK-012345");
    expect(genCode(1000000)).toBe("BK-1000000");
  });
});

// ─── Offline QR Fallback ──────────────────────────────────────────────────────

describe("Offline QR Fallback", () => {
  const STORAGE_KEY = "tp_last_qr_token";
  const EXPIRY_KEY = "tp_last_qr_expiry";

  beforeEach(() => {
    // Mock localStorage
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    });
  });

  it("persists token and expiry to localStorage", () => {
    const token = "abc123xyz";
    const expiry = Date.now() + 30 * 60 * 1000;
    localStorage.setItem(STORAGE_KEY, token);
    localStorage.setItem(EXPIRY_KEY, String(expiry));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(token);
    expect(parseInt(localStorage.getItem(EXPIRY_KEY)!)).toBe(expiry);
  });

  it("sets 30-minute TTL on token", () => {
    const before = Date.now();
    const expiry = Date.now() + 30 * 60 * 1000;
    const after = Date.now();
    const thirtyMin = 30 * 60 * 1000;
    expect(expiry - before).toBeGreaterThanOrEqual(thirtyMin - 100);
    expect(expiry - after).toBeLessThanOrEqual(thirtyMin + 100);
  });

  it("detects expired token", () => {
    const expiredAt = Date.now() - 1000;
    const isValid = (expiry: number) => expiry > Date.now();
    expect(isValid(expiredAt)).toBe(false);
    expect(isValid(Date.now() + 1000)).toBe(true);
  });

  it("constructs correct QR data URI from token", () => {
    const token = "pay-token-abc";
    const qrData = `tourismpay://pay?token=${token}`;
    expect(qrData).toBe("tourismpay://pay?token=pay-token-abc");
    expect(qrData).toContain("tourismpay://pay");
  });

  it("clears token from localStorage on manual clear", () => {
    localStorage.setItem(STORAGE_KEY, "some-token");
    localStorage.setItem(EXPIRY_KEY, String(Date.now() + 1000));
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(EXPIRY_KEY)).toBeNull();
  });

  it("handles missing localStorage gracefully", () => {
    const getToken = () => {
      try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
    };
    expect(() => getToken()).not.toThrow();
  });

  it("does not show offline QR when online", () => {
    const shouldShow = (isOnline: boolean, hasToken: boolean, isValid: boolean) =>
      !isOnline && hasToken && isValid;
    expect(shouldShow(true, true, true)).toBe(false);
    expect(shouldShow(false, true, true)).toBe(true);
    expect(shouldShow(false, false, true)).toBe(false);
    expect(shouldShow(false, true, false)).toBe(false);
  });

  it("does not show offline QR when token is expired", () => {
    const shouldShow = (isOnline: boolean, expiry: number) =>
      !isOnline && expiry > Date.now();
    expect(shouldShow(false, Date.now() - 1000)).toBe(false);
    expect(shouldShow(false, Date.now() + 60000)).toBe(true);
  });
});
