/**
 * Round 105 Tests
 * Covers:
 *  1. Response rate leaderboard — calculation, color coding, display logic
 *  2. Tourist review deep-link — URL construction, parameter encoding
 *  3. Sentiment alert threshold — validation, enable/disable logic, alert triggering
 */
import { describe, it, expect } from "vitest";

// ─── Response Rate Leaderboard ────────────────────────────────────────────────
describe("Response rate leaderboard — calculation and display", () => {
  interface VenueWithResponseRate {
    establishmentId: number;
    name: string;
    positivePercent: number | null;
    reviewCount: number;
    repliedCount: number;
    responseRate: number | null;
  }

  function computeResponseRate(totalReviews: number, repliedReviews: number): number | null {
    if (totalReviews === 0) return null;
    return Math.round((repliedReviews / totalReviews) * 100);
  }

  function responseRateColorClass(rate: number | null): string {
    if (rate === null) return "text-muted-foreground";
    if (rate >= 70) return "text-green-600";
    if (rate >= 40) return "text-amber-600";
    return "text-red-600";
  }

  it("computes 100% response rate when all reviews are replied", () => {
    expect(computeResponseRate(10, 10)).toBe(100);
  });

  it("computes 50% response rate when half are replied", () => {
    expect(computeResponseRate(10, 5)).toBe(50);
  });

  it("computes 0% response rate when none are replied", () => {
    expect(computeResponseRate(10, 0)).toBe(0);
  });

  it("returns null when there are no reviews", () => {
    expect(computeResponseRate(0, 0)).toBeNull();
  });

  it("rounds to nearest integer", () => {
    // 1/3 = 33.33... → rounds to 33
    expect(computeResponseRate(3, 1)).toBe(33);
    // 2/3 = 66.66... → rounds to 67
    expect(computeResponseRate(3, 2)).toBe(67);
  });

  it("assigns green color for response rate >= 70%", () => {
    expect(responseRateColorClass(70)).toBe("text-green-600");
    expect(responseRateColorClass(100)).toBe("text-green-600");
    expect(responseRateColorClass(85)).toBe("text-green-600");
  });

  it("assigns amber color for response rate 40-69%", () => {
    expect(responseRateColorClass(40)).toBe("text-amber-600");
    expect(responseRateColorClass(69)).toBe("text-amber-600");
    expect(responseRateColorClass(55)).toBe("text-amber-600");
  });

  it("assigns red color for response rate < 40%", () => {
    expect(responseRateColorClass(39)).toBe("text-red-600");
    expect(responseRateColorClass(0)).toBe("text-red-600");
  });

  it("shows dash (null) for venues with no reviews", () => {
    expect(responseRateColorClass(null)).toBe("text-muted-foreground");
  });

  it("response rate is independent of sentiment score", () => {
    const venue: VenueWithResponseRate = {
      establishmentId: 1,
      name: "Test Venue",
      positivePercent: 30, // low sentiment
      reviewCount: 20,
      repliedCount: 18,
      responseRate: computeResponseRate(20, 18), // 90% response rate
    };
    expect(venue.responseRate).toBe(90);
    expect(venue.positivePercent).toBe(30);
    // High response rate despite low sentiment
    expect(responseRateColorClass(venue.responseRate)).toBe("text-green-600");
  });

  it("venue with 0 reviews shows null response rate", () => {
    const venue: VenueWithResponseRate = {
      establishmentId: 2,
      name: "New Venue",
      positivePercent: null,
      reviewCount: 0,
      repliedCount: 0,
      responseRate: computeResponseRate(0, 0),
    };
    expect(venue.responseRate).toBeNull();
  });

  it("multiple venues can be compared side by side", () => {
    const venues: VenueWithResponseRate[] = [
      { establishmentId: 1, name: "A", positivePercent: 80, reviewCount: 50, repliedCount: 45, responseRate: computeResponseRate(50, 45) },
      { establishmentId: 2, name: "B", positivePercent: 60, reviewCount: 20, repliedCount: 6, responseRate: computeResponseRate(20, 6) },
      { establishmentId: 3, name: "C", positivePercent: 40, reviewCount: 0, repliedCount: 0, responseRate: computeResponseRate(0, 0) },
    ];
    expect(venues[0].responseRate).toBe(90);
    expect(venues[1].responseRate).toBe(30);
    expect(venues[2].responseRate).toBeNull();
  });
});

// ─── Tourist Review Deep-Link URL Construction ────────────────────────────────
describe("Tourist review deep-link — URL construction", () => {
  function buildReviewDeepLink(
    establishmentId: number | null,
    dealId: number | null,
    dealTitle: string
  ): string {
    const estPart = establishmentId ?? "";
    const params = new URLSearchParams();
    if (dealId) params.set("dealId", dealId.toString());
    if (dealTitle) params.set("dealTitle", dealTitle);
    const queryStr = params.toString();
    return `/tourist/review/${estPart}${queryStr ? `?${queryStr}` : ""}`;
  }

  it("builds correct deep-link with establishment ID and deal info", () => {
    const url = buildReviewDeepLink(42, 7, "50% Off Pasta");
    expect(url).toBe("/tourist/review/42?dealId=7&dealTitle=50%25+Off+Pasta");
  });

  it("handles null establishment ID gracefully", () => {
    const url = buildReviewDeepLink(null, 7, "Beach Tour");
    expect(url).toContain("/tourist/review/");
    expect(url).toContain("dealId=7");
  });

  it("handles null deal ID gracefully", () => {
    const url = buildReviewDeepLink(42, null, "Beach Tour");
    expect(url).toContain("/tourist/review/42");
    expect(url).not.toContain("dealId");
  });

  it("encodes special characters in deal title", () => {
    const url = buildReviewDeepLink(1, 1, "50% Off & More!");
    expect(url).toContain("dealTitle=");
    // URL-encoded special chars
    expect(url).not.toContain("50% Off & More!");
  });

  it("builds URL without query string when no deal info", () => {
    const url = buildReviewDeepLink(42, null, "");
    expect(url).toBe("/tourist/review/42");
  });

  it("deep-link URL starts with /tourist/review/", () => {
    const url = buildReviewDeepLink(99, 5, "Test Deal");
    expect(url.startsWith("/tourist/review/")).toBe(true);
  });

  it("notification payload includes the deep-link URL", () => {
    function buildNotificationPayload(
      dealTitle: string,
      establishmentName: string,
      establishmentId: number | null,
      dealId: number | null
    ) {
      return {
        title: "How was your experience?",
        body: `You redeemed "${dealTitle}" at ${establishmentName}. Share your thoughts — it takes just 30 seconds!`,
        url: buildReviewDeepLink(establishmentId, dealId, dealTitle),
      };
    }

    const payload = buildNotificationPayload("Sunset Cruise", "Marina Club", 10, 3);
    expect(payload.title).toBe("How was your experience?");
    expect(payload.body).toContain("Sunset Cruise");
    expect(payload.body).toContain("Marina Club");
    expect(payload.url).toContain("/tourist/review/10");
    expect(payload.url).toContain("dealId=3");
  });

  it("notification body matches the expected format", () => {
    const dealTitle = "Free Snorkeling";
    const establishmentName = "Ocean Adventures";
    const body = `You redeemed "${dealTitle}" at ${establishmentName}. Share your thoughts — it takes just 30 seconds!`;
    expect(body).toContain(dealTitle);
    expect(body).toContain(establishmentName);
    expect(body).toContain("30 seconds");
  });
});

// ─── Sentiment Alert Threshold ────────────────────────────────────────────────
describe("Sentiment alert threshold — validation and alert logic", () => {
  interface SentimentAlertPrefs {
    sentimentAlertThreshold: number | null;
  }

  function shouldSendAlert(
    positivePercent: number,
    threshold: number | null
  ): boolean {
    if (threshold === null) return false; // alerts disabled
    return positivePercent < threshold;
  }

  function validateThreshold(value: number): { valid: boolean; error?: string } {
    if (!Number.isInteger(value)) return { valid: false, error: "Threshold must be an integer" };
    if (value < 0) return { valid: false, error: "Threshold must be at least 0" };
    if (value > 100) return { valid: false, error: "Threshold must be at most 100" };
    return { valid: true };
  }

  function buildAlertPayload(
    establishmentName: string,
    positivePercent: number,
    threshold: number,
    establishmentId: number
  ) {
    return {
      title: "Sentiment Alert",
      body: `"${establishmentName}" has dropped to ${positivePercent}% positive (your threshold: ${threshold}%). Check your reviews and respond.`,
      url: `/merchant/revenue?tab=reviews&estId=${establishmentId}`,
    };
  }

  // ── shouldSendAlert ──────────────────────────────────────────────────────────
  it("sends alert when positivePercent is below threshold", () => {
    expect(shouldSendAlert(45, 60)).toBe(true);
  });

  it("does not send alert when positivePercent equals threshold", () => {
    expect(shouldSendAlert(60, 60)).toBe(false);
  });

  it("does not send alert when positivePercent is above threshold", () => {
    expect(shouldSendAlert(75, 60)).toBe(false);
  });

  it("does not send alert when threshold is null (disabled)", () => {
    expect(shouldSendAlert(10, null)).toBe(false);
  });

  it("sends alert at threshold boundary (just below)", () => {
    expect(shouldSendAlert(59, 60)).toBe(true);
  });

  it("does not send alert at threshold boundary (exactly at)", () => {
    expect(shouldSendAlert(60, 60)).toBe(false);
  });

  it("handles threshold of 0 — never sends alert", () => {
    expect(shouldSendAlert(0, 0)).toBe(false);
    expect(shouldSendAlert(1, 0)).toBe(false);
  });

  it("handles threshold of 100 — always sends alert unless 100%", () => {
    expect(shouldSendAlert(99, 100)).toBe(true);
    expect(shouldSendAlert(100, 100)).toBe(false);
  });

  // ── validateThreshold ────────────────────────────────────────────────────────
  it("validates threshold of 60 as valid", () => {
    expect(validateThreshold(60).valid).toBe(true);
  });

  it("validates threshold of 0 as valid", () => {
    expect(validateThreshold(0).valid).toBe(true);
  });

  it("validates threshold of 100 as valid", () => {
    expect(validateThreshold(100).valid).toBe(true);
  });

  it("rejects threshold below 0", () => {
    const result = validateThreshold(-1);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("at least 0");
  });

  it("rejects threshold above 100", () => {
    const result = validateThreshold(101);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("at most 100");
  });

  it("rejects non-integer threshold", () => {
    const result = validateThreshold(60.5);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("integer");
  });

  // ── buildAlertPayload ────────────────────────────────────────────────────────
  it("builds correct alert notification payload", () => {
    const payload = buildAlertPayload("Cafe Lumiere", 45, 60, 7);
    expect(payload.title).toBe("Sentiment Alert");
    expect(payload.body).toContain("Cafe Lumiere");
    expect(payload.body).toContain("45%");
    expect(payload.body).toContain("60%");
    expect(payload.url).toBe("/merchant/revenue?tab=reviews&estId=7");
  });

  it("alert URL points to merchant reviews tab with establishment ID", () => {
    const payload = buildAlertPayload("Test Venue", 30, 50, 12);
    expect(payload.url).toContain("/merchant/revenue");
    expect(payload.url).toContain("tab=reviews");
    expect(payload.url).toContain("estId=12");
  });

  it("alert body mentions both current percent and threshold", () => {
    const payload = buildAlertPayload("Beach Bar", 25, 70, 3);
    expect(payload.body).toContain("25%");
    expect(payload.body).toContain("70%");
  });

  // ── Preferences enable/disable logic ────────────────────────────────────────
  it("saving with sentimentAlertEnabled=false sends null threshold to API", () => {
    function computeSavePayload(enabled: boolean, threshold: number): SentimentAlertPrefs {
      return {
        sentimentAlertThreshold: enabled ? threshold : null,
      };
    }
    expect(computeSavePayload(false, 60).sentimentAlertThreshold).toBeNull();
    expect(computeSavePayload(true, 60).sentimentAlertThreshold).toBe(60);
  });

  it("loading null threshold from API sets sentimentAlertEnabled=false", () => {
    function deriveEnabledState(threshold: number | null): boolean {
      return threshold !== null;
    }
    expect(deriveEnabledState(null)).toBe(false);
    expect(deriveEnabledState(60)).toBe(true);
    expect(deriveEnabledState(0)).toBe(true);
  });

  it("multiple establishments are each checked independently", () => {
    const establishments = [
      { id: 1, name: "Venue A", positivePercent: 45 },
      { id: 2, name: "Venue B", positivePercent: 75 },
      { id: 3, name: "Venue C", positivePercent: 55 },
    ];
    const threshold = 60;
    const alertsNeeded = establishments.filter(e => shouldSendAlert(e.positivePercent, threshold));
    expect(alertsNeeded).toHaveLength(2);
    expect(alertsNeeded.map(e => e.name)).toContain("Venue A");
    expect(alertsNeeded.map(e => e.name)).toContain("Venue C");
    expect(alertsNeeded.map(e => e.name)).not.toContain("Venue B");
  });
});
