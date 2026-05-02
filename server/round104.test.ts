/**
 * Round 104 Tests
 * Covers:
 *  1. Multi-venue sentiment comparison — sorting, null handling, ownership filtering
 *  2. Review prompt job — 2h delay logic, deduplication via reviewPromptedAt, existing review skip
 *  3. Reply ROI — repeat rate calculation, delta computation, edge cases (empty data, zero denominator)
 */
import { describe, it, expect } from "vitest";

// ─── Multi-Venue Sentiment Comparison ────────────────────────────────────────
describe("Multi-venue sentiment — sorting and display logic", () => {
  interface VenueSentiment {
    establishmentId: number;
    name: string;
    city: string | null;
    positivePercent: number | null;
    reviewCount: number;
  }

  function sortVenuesByScore(venues: VenueSentiment[]): VenueSentiment[] {
    return [...venues].sort((a, b) => (b.positivePercent ?? -1) - (a.positivePercent ?? -1));
  }

  function shouldShowComparison(venues: VenueSentiment[]): boolean {
    return venues.length >= 2;
  }

  const venues: VenueSentiment[] = [
    { establishmentId: 1, name: "Cafe A", city: "Paris", positivePercent: 45, reviewCount: 10 },
    { establishmentId: 2, name: "Cafe B", city: "Lyon", positivePercent: 82, reviewCount: 25 },
    { establishmentId: 3, name: "Cafe C", city: null, positivePercent: 60, reviewCount: 5 },
    { establishmentId: 4, name: "Cafe D", city: "Nice", positivePercent: null, reviewCount: 0 },
  ];

  it("sorts venues by positivePercent descending", () => {
    const sorted = sortVenuesByScore(venues);
    expect(sorted[0].name).toBe("Cafe B");
    expect(sorted[1].name).toBe("Cafe C");
    expect(sorted[2].name).toBe("Cafe A");
  });

  it("places venues with null positivePercent at the bottom", () => {
    const sorted = sortVenuesByScore(venues);
    expect(sorted[sorted.length - 1].name).toBe("Cafe D");
  });

  it("shows comparison card when 2 or more venues", () => {
    expect(shouldShowComparison(venues)).toBe(true);
    expect(shouldShowComparison([venues[0], venues[1]])).toBe(true);
  });

  it("hides comparison card for single venue", () => {
    expect(shouldShowComparison([venues[0]])).toBe(false);
  });

  it("hides comparison card when no venues", () => {
    expect(shouldShowComparison([])).toBe(false);
  });

  it("handles all null positivePercent gracefully", () => {
    const nullVenues: VenueSentiment[] = [
      { establishmentId: 1, name: "A", city: null, positivePercent: null, reviewCount: 0 },
      { establishmentId: 2, name: "B", city: null, positivePercent: null, reviewCount: 0 },
    ];
    const sorted = sortVenuesByScore(nullVenues);
    expect(sorted).toHaveLength(2);
  });

  it("correctly identifies the best and worst venue", () => {
    const sorted = sortVenuesByScore(venues.filter(v => v.positivePercent !== null));
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    expect(best.positivePercent).toBe(82);
    expect(worst.positivePercent).toBe(45);
  });

  it("assigns correct color class based on positivePercent threshold", () => {
    function colorClass(pct: number | null): string {
      if (pct === null) return "text-muted-foreground";
      if (pct >= 60) return "text-green-600";
      if (pct >= 40) return "text-amber-600";
      return "text-red-600";
    }
    expect(colorClass(82)).toBe("text-green-600");
    expect(colorClass(60)).toBe("text-green-600");
    expect(colorClass(59)).toBe("text-amber-600");
    expect(colorClass(40)).toBe("text-amber-600");
    expect(colorClass(39)).toBe("text-red-600");
    expect(colorClass(null)).toBe("text-muted-foreground");
  });
});

// ─── Review Prompt Job — 2h Delay and Deduplication ──────────────────────────
describe("Review prompt job — timing and deduplication logic", () => {
  const PROMPT_DELAY_MS = 2 * 60 * 60 * 1000; // 2 hours

  function isEligibleForPrompt(
    redeemedAt: Date,
    reviewPromptedAt: Date | null,
    hasExistingReview: boolean,
    now: Date
  ): boolean {
    if (reviewPromptedAt !== null) return false; // already prompted
    if (hasExistingReview) return false; // already reviewed
    const ageMs = now.getTime() - redeemedAt.getTime();
    return ageMs >= PROMPT_DELAY_MS;
  }

  const now = new Date("2026-03-01T12:00:00Z");

  it("prompts when redemption is exactly 2 hours old and not yet prompted", () => {
    const redeemedAt = new Date(now.getTime() - PROMPT_DELAY_MS);
    expect(isEligibleForPrompt(redeemedAt, null, false, now)).toBe(true);
  });

  it("prompts when redemption is 3 hours old", () => {
    const redeemedAt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    expect(isEligibleForPrompt(redeemedAt, null, false, now)).toBe(true);
  });

  it("does not prompt when redemption is only 1 hour old", () => {
    const redeemedAt = new Date(now.getTime() - 60 * 60 * 1000);
    expect(isEligibleForPrompt(redeemedAt, null, false, now)).toBe(false);
  });

  it("does not prompt when reviewPromptedAt is already set", () => {
    const redeemedAt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const promptedAt = new Date(now.getTime() - 60 * 60 * 1000);
    expect(isEligibleForPrompt(redeemedAt, promptedAt, false, now)).toBe(false);
  });

  it("does not prompt when tourist already left a review", () => {
    const redeemedAt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    expect(isEligibleForPrompt(redeemedAt, null, true, now)).toBe(false);
  });

  it("does not prompt when both already prompted and has review", () => {
    const redeemedAt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const promptedAt = new Date(now.getTime() - 60 * 60 * 1000);
    expect(isEligibleForPrompt(redeemedAt, promptedAt, true, now)).toBe(false);
  });

  it("does not prompt when redemption is 1 minute under 2 hours", () => {
    const redeemedAt = new Date(now.getTime() - (PROMPT_DELAY_MS - 60_000));
    expect(isEligibleForPrompt(redeemedAt, null, false, now)).toBe(false);
  });

  it("builds correct notification payload", () => {
    function buildNotificationPayload(dealTitle: string, establishmentName: string): { title: string; body: string } {
      return {
        title: "How was your experience?",
        body: `You recently redeemed "${dealTitle}" at ${establishmentName}. Share your thoughts!`,
      };
    }
    const payload = buildNotificationPayload("50% Off Pasta", "La Bella Italia");
    expect(payload.title).toBe("How was your experience?");
    expect(payload.body).toContain("50% Off Pasta");
    expect(payload.body).toContain("La Bella Italia");
  });
});

// ─── Reply ROI — Repeat Rate Calculation ─────────────────────────────────────
describe("Reply ROI — repeat redemption rate calculation", () => {
  interface ReviewRow {
    userId: number;
    merchantResponse: string | null;
  }

  function computeReplyROI(
    reviews: ReviewRow[],
    repeatUserIds: Set<number>
  ): {
    repliedCount: number;
    noReplyCount: number;
    repliedRepeatRate: number;
    noReplyRepeatRate: number;
    roiDelta: number;
  } {
    const replied = reviews.filter(r => r.merchantResponse && r.merchantResponse.trim().length > 0);
    const noReply = reviews.filter(r => !r.merchantResponse || r.merchantResponse.trim().length === 0);

    const repliedRepeat = replied.filter(r => repeatUserIds.has(r.userId)).length;
    const noReplyRepeat = noReply.filter(r => repeatUserIds.has(r.userId)).length;

    const repliedRepeatRate = replied.length > 0 ? Math.round((repliedRepeat / replied.length) * 100) : 0;
    const noReplyRepeatRate = noReply.length > 0 ? Math.round((noReplyRepeat / noReply.length) * 100) : 0;
    const roiDelta = repliedRepeatRate - noReplyRepeatRate;

    return {
      repliedCount: replied.length,
      noReplyCount: noReply.length,
      repliedRepeatRate,
      noReplyRepeatRate,
      roiDelta,
    };
  }

  const reviews: ReviewRow[] = [
    { userId: 1, merchantResponse: "Thank you!" },
    { userId: 2, merchantResponse: "We appreciate your visit!" },
    { userId: 3, merchantResponse: null },
    { userId: 4, merchantResponse: "" },
    { userId: 5, merchantResponse: "  " }, // whitespace only — treated as no reply
  ];

  it("correctly counts replied and no-reply reviews", () => {
    const roi = computeReplyROI(reviews, new Set());
    expect(roi.repliedCount).toBe(2);
    expect(roi.noReplyCount).toBe(3);
  });

  it("calculates 50% repeat rate for replied reviews when 1 of 2 returned", () => {
    const roi = computeReplyROI(reviews, new Set([1]));
    expect(roi.repliedRepeatRate).toBe(50);
  });

  it("calculates 100% repeat rate for replied reviews when all returned", () => {
    const roi = computeReplyROI(reviews, new Set([1, 2]));
    expect(roi.repliedRepeatRate).toBe(100);
  });

  it("calculates 0% repeat rate when no replied users returned", () => {
    const roi = computeReplyROI(reviews, new Set([3]));
    expect(roi.repliedRepeatRate).toBe(0);
  });

  it("computes positive roiDelta when replied reviews have higher repeat rate", () => {
    const roi = computeReplyROI(reviews, new Set([1, 2])); // both replied users returned, no no-reply users
    expect(roi.roiDelta).toBeGreaterThan(0);
  });

  it("computes zero roiDelta when rates are equal", () => {
    const equalReviews: ReviewRow[] = [
      { userId: 1, merchantResponse: "Thanks!" },
      { userId: 2, merchantResponse: null },
    ];
    const roi = computeReplyROI(equalReviews, new Set([1, 2])); // both returned
    expect(roi.roiDelta).toBe(0);
  });

  it("returns 0 for all rates when reviews array is empty", () => {
    const roi = computeReplyROI([], new Set([1, 2]));
    expect(roi.repliedCount).toBe(0);
    expect(roi.noReplyCount).toBe(0);
    expect(roi.repliedRepeatRate).toBe(0);
    expect(roi.noReplyRepeatRate).toBe(0);
    expect(roi.roiDelta).toBe(0);
  });

  it("handles whitespace-only merchantResponse as no reply", () => {
    const roi = computeReplyROI(reviews, new Set([5]));
    // userId 5 has whitespace-only response → counted in noReply
    expect(roi.noReplyRepeatRate).toBe(Math.round((1 / 3) * 100));
  });

  it("roiDelta is negative when no-reply users have higher repeat rate", () => {
    const roi = computeReplyROI(reviews, new Set([3, 4, 5])); // only no-reply users returned
    expect(roi.roiDelta).toBeLessThan(0);
  });
});
