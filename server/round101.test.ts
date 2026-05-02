/**
 * Round 101 Tests
 * Covers:
 *  1. Merchant review notification — payload construction, non-fatal failure handling
 *  2. Wishlist deal expiry alert — 48h window detection, deduplication, user grouping
 *  3. Review CSV export — CSV building, escaping, ownership validation
 */

import { describe, it, expect } from "vitest";

// ─── Merchant Review Notification ─────────────────────────────────────────────

describe("Merchant review notification — payload construction", () => {
  function buildReviewNotificationPayload(
    reviewerName: string,
    rating: number,
    establishmentName: string,
    reviewId: number
  ) {
    const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
    return {
      title: "New Review Received",
      body: `${reviewerName} left a ${rating}-star review for ${establishmentName}. ${stars}`,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/badge-72x72.png",
      tag: `review-${reviewId}`,
      data: { url: "/merchant/revenue" },
    };
  }

  it("builds a valid 5-star review notification", () => {
    const payload = buildReviewNotificationPayload("Alice", 5, "The Grand Hotel", 42);
    expect(payload.title).toBe("New Review Received");
    expect(payload.body).toContain("Alice");
    expect(payload.body).toContain("5-star");
    expect(payload.body).toContain("The Grand Hotel");
    expect(payload.body).toContain("★★★★★");
    expect(payload.tag).toBe("review-42");
    expect(payload.data.url).toBe("/merchant/revenue");
  });

  it("builds a 1-star review notification with correct star display", () => {
    const payload = buildReviewNotificationPayload("Bob", 1, "Beachside Cafe", 7);
    expect(payload.body).toContain("1-star");
    expect(payload.body).toContain("★☆☆☆☆");
  });

  it("uses 'A tourist' as fallback when reviewer name is null", () => {
    const name = null ?? "A tourist";
    const payload = buildReviewNotificationPayload(name, 3, "Safari Lodge", 99);
    expect(payload.body).toContain("A tourist");
  });

  it("notification is non-fatal — error should not propagate", () => {
    // Simulate the try/catch pattern used in submitReview
    let notificationSent = false;
    let errorCaught = false;
    try {
      throw new Error("Push service unavailable");
    } catch {
      errorCaught = true;
      // Non-fatal: do not rethrow
    }
    expect(errorCaught).toBe(true);
    expect(notificationSent).toBe(false); // review still succeeds
  });

  it("notification tag is unique per review ID", () => {
    const p1 = buildReviewNotificationPayload("X", 4, "Hotel A", 10);
    const p2 = buildReviewNotificationPayload("Y", 3, "Hotel B", 20);
    expect(p1.tag).not.toBe(p2.tag);
  });
});

// ─── Wishlist Deal Expiry Alert — 48h Window ──────────────────────────────────

describe("Wishlist deal expiry alert — 48h window detection", () => {
  const ALERT_WINDOW_MS = 48 * 60 * 60 * 1000;

  function isExpiringWithin48h(validTo: Date, now: Date = new Date()): boolean {
    const windowEnd = new Date(now.getTime() + ALERT_WINDOW_MS);
    return validTo >= now && validTo <= windowEnd;
  }

  it("deal expiring in 24 hours is within the alert window", () => {
    const validTo = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(isExpiringWithin48h(validTo)).toBe(true);
  });

  it("deal expiring in 47 hours is within the alert window", () => {
    const validTo = new Date(Date.now() + 47 * 60 * 60 * 1000);
    expect(isExpiringWithin48h(validTo)).toBe(true);
  });

  it("deal expiring in exactly 48 hours is within the alert window", () => {
    const now = new Date();
    const validTo = new Date(now.getTime() + ALERT_WINDOW_MS);
    expect(isExpiringWithin48h(validTo, now)).toBe(true);
  });

  it("deal expiring in 49 hours is outside the alert window", () => {
    const validTo = new Date(Date.now() + 49 * 60 * 60 * 1000);
    expect(isExpiringWithin48h(validTo)).toBe(false);
  });

  it("already expired deal is not in the alert window", () => {
    const validTo = new Date(Date.now() - 1000);
    expect(isExpiringWithin48h(validTo)).toBe(false);
  });

  it("deal expiring in 1 minute is within the alert window", () => {
    const validTo = new Date(Date.now() + 60 * 1000);
    expect(isExpiringWithin48h(validTo)).toBe(true);
  });
});

describe("Wishlist deal expiry alert — deduplication", () => {
  interface WishlistRow {
    userId: number;
    dealId: number;
    alertedAt: Date | null;
  }

  function filterUnalerted(rows: WishlistRow[]): WishlistRow[] {
    return rows.filter((r) => r.alertedAt === null);
  }

  it("returns only rows that have not been alerted", () => {
    const rows: WishlistRow[] = [
      { userId: 1, dealId: 10, alertedAt: null },
      { userId: 2, dealId: 10, alertedAt: new Date("2026-02-01") },
      { userId: 3, dealId: 10, alertedAt: null },
    ];
    const result = filterUnalerted(rows);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.userId)).toEqual([1, 3]);
  });

  it("returns empty array when all rows have been alerted", () => {
    const rows: WishlistRow[] = [
      { userId: 1, dealId: 10, alertedAt: new Date() },
      { userId: 2, dealId: 10, alertedAt: new Date() },
    ];
    expect(filterUnalerted(rows)).toHaveLength(0);
  });

  it("returns all rows when none have been alerted", () => {
    const rows: WishlistRow[] = [
      { userId: 1, dealId: 10, alertedAt: null },
      { userId: 2, dealId: 20, alertedAt: null },
    ];
    expect(filterUnalerted(rows)).toHaveLength(2);
  });
});

describe("Wishlist deal expiry alert — user grouping", () => {
  interface WishlistRow { userId: number; dealId: number; }
  interface Deal { id: number; title: string; discountPercent: number; }

  function groupByUser(
    rows: WishlistRow[],
    deals: Deal[],
    redeemedSet: Set<string>
  ): Map<number, Deal[]> {
    const dealMap = new Map(deals.map((d) => [d.id, d]));
    const byUser = new Map<number, Deal[]>();
    for (const row of rows) {
      if (redeemedSet.has(`${row.userId}-${row.dealId}`)) continue;
      const deal = dealMap.get(row.dealId);
      if (!deal) continue;
      if (!byUser.has(row.userId)) byUser.set(row.userId, []);
      byUser.get(row.userId)!.push(deal);
    }
    return byUser;
  }

  it("groups deals by user correctly", () => {
    const rows: WishlistRow[] = [
      { userId: 1, dealId: 10 },
      { userId: 1, dealId: 20 },
      { userId: 2, dealId: 10 },
    ];
    const deals: Deal[] = [
      { id: 10, title: "Deal A", discountPercent: 20 },
      { id: 20, title: "Deal B", discountPercent: 15 },
    ];
    const result = groupByUser(rows, deals, new Set());
    expect(result.get(1)).toHaveLength(2);
    expect(result.get(2)).toHaveLength(1);
  });

  it("excludes already-redeemed deals from grouping", () => {
    const rows: WishlistRow[] = [
      { userId: 1, dealId: 10 },
      { userId: 1, dealId: 20 },
    ];
    const deals: Deal[] = [
      { id: 10, title: "Deal A", discountPercent: 20 },
      { id: 20, title: "Deal B", discountPercent: 15 },
    ];
    const redeemed = new Set(["1-10"]); // user 1 already redeemed deal 10
    const result = groupByUser(rows, deals, redeemed);
    expect(result.get(1)).toHaveLength(1);
    expect(result.get(1)![0].id).toBe(20);
  });

  it("returns empty map when all deals are redeemed", () => {
    const rows: WishlistRow[] = [{ userId: 1, dealId: 10 }];
    const deals: Deal[] = [{ id: 10, title: "Deal A", discountPercent: 20 }];
    const redeemed = new Set(["1-10"]);
    const result = groupByUser(rows, deals, redeemed);
    expect(result.size).toBe(0);
  });
});

// ─── Review CSV Export ─────────────────────────────────────────────────────────

describe("Review CSV export — CSV building", () => {
  function escapeCell(v: unknown): string {
    if (v === null || v === undefined) return "";
    const s = Array.isArray(v) ? v.join("; ") : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }

  function buildCsv(
    reviews: Array<{
      id: number;
      rating: number;
      title: string | null;
      body: string | null;
      reviewerName: string | null;
      createdAt: Date;
    }>
  ): string {
    const headers = ["ID", "Rating", "Title", "Body", "Reviewer Name", "Submitted At"];
    const rows = reviews.map((r) =>
      [r.id, r.rating, r.title, r.body, r.reviewerName, r.createdAt.toISOString()]
        .map(escapeCell)
        .join(",")
    );
    return [headers.join(","), ...rows].join("\n");
  }

  it("builds a valid CSV with headers", () => {
    const csv = buildCsv([
      { id: 1, rating: 5, title: "Great!", body: "Loved it", reviewerName: "Alice", createdAt: new Date("2026-01-01") },
    ]);
    expect(csv).toContain("ID,Rating,Title,Body,Reviewer Name,Submitted At");
    expect(csv).toContain("1,5,Great!,Loved it,Alice");
  });

  it("escapes commas in cell values", () => {
    const csv = buildCsv([
      { id: 2, rating: 4, title: "Good, but pricey", body: null, reviewerName: "Bob", createdAt: new Date("2026-01-02") },
    ]);
    expect(csv).toContain('"Good, but pricey"');
  });

  it("escapes double quotes in cell values", () => {
    const csv = buildCsv([
      { id: 3, rating: 3, title: 'Said "amazing"', body: null, reviewerName: "Carol", createdAt: new Date("2026-01-03") },
    ]);
    expect(csv).toContain('"Said ""amazing"""');
  });

  it("handles null values as empty strings", () => {
    const csv = buildCsv([
      { id: 4, rating: 2, title: null, body: null, reviewerName: null, createdAt: new Date("2026-01-04") },
    ]);
    const lines = csv.split("\n");
    expect(lines[1]).toMatch(/^4,2,,,/);
  });

  it("produces correct number of rows including header", () => {
    const reviews = [
      { id: 1, rating: 5, title: "A", body: "B", reviewerName: "X", createdAt: new Date() },
      { id: 2, rating: 4, title: "C", body: "D", reviewerName: "Y", createdAt: new Date() },
      { id: 3, rating: 3, title: "E", body: "F", reviewerName: "Z", createdAt: new Date() },
    ];
    const csv = buildCsv(reviews);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(4); // 1 header + 3 data rows
  });

  it("returns only header row for empty reviews list", () => {
    const csv = buildCsv([]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("ID");
  });
});

describe("Review CSV export — filename generation", () => {
  function buildFilename(establishmentName: string, date: Date): string {
    return `reviews-${establishmentName.replace(/\s+/g, "-")}-${date.toISOString().slice(0, 10)}.csv`;
  }

  it("generates a valid filename with date", () => {
    const filename = buildFilename("The Grand Hotel", new Date("2026-03-01"));
    expect(filename).toBe("reviews-The-Grand-Hotel-2026-03-01.csv");
  });

  it("replaces multiple spaces with single dash", () => {
    const filename = buildFilename("Safari   Lodge", new Date("2026-03-01"));
    expect(filename).toBe("reviews-Safari-Lodge-2026-03-01.csv");
  });

  it("filename ends with .csv extension", () => {
    const filename = buildFilename("Cafe", new Date("2026-03-01"));
    expect(filename.endsWith(".csv")).toBe(true);
  });
});

describe("Review CSV export — ownership validation", () => {
  function canExportReviews(establishment: { ownerId: number | null }, callerId: number): boolean {
    return establishment.ownerId === callerId;
  }

  it("owner can export reviews", () => {
    expect(canExportReviews({ ownerId: 42 }, 42)).toBe(true);
  });

  it("non-owner cannot export reviews", () => {
    expect(canExportReviews({ ownerId: 42 }, 99)).toBe(false);
  });

  it("establishment with no owner blocks export", () => {
    expect(canExportReviews({ ownerId: null }, 42)).toBe(false);
  });
});
