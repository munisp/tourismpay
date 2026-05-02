/**
 * Round 100 Tests
 * Covers:
 *  1. Boost Budget Cap — enforcement, deduction, auto-pause
 *  2. Tourist Deal Wishlist — toggle logic, saved-deals retrieval
 *  3. Merchant Response to Reviews — validation, update logic
 */

import { describe, it, expect } from "vitest";

// ─── Boost Budget Cap ─────────────────────────────────────────────────────────

describe("Boost budget cap — enforcement logic", () => {
  interface BoostState {
    boostBudgetUsd: number | null;
    boostSpentUsd: number;
    isActive: boolean;
  }

  function canBoost(deal: BoostState, costUsd: number): boolean {
    if (!deal.isActive) return false;
    if (deal.boostBudgetUsd === null) return true; // unlimited
    return deal.boostSpentUsd + costUsd <= deal.boostBudgetUsd;
  }

  function applyBoostCost(deal: BoostState, costUsd: number): BoostState {
    const newSpent = deal.boostSpentUsd + costUsd;
    const budgetExhausted =
      deal.boostBudgetUsd !== null && newSpent >= deal.boostBudgetUsd;
    return {
      ...deal,
      boostSpentUsd: newSpent,
      isActive: budgetExhausted ? false : deal.isActive,
    };
  }

  it("deal with no budget cap can always be boosted", () => {
    const deal: BoostState = { boostBudgetUsd: null, boostSpentUsd: 0, isActive: true };
    expect(canBoost(deal, 999)).toBe(true);
  });

  it("deal with budget cap allows boost when under budget", () => {
    const deal: BoostState = { boostBudgetUsd: 50, boostSpentUsd: 10, isActive: true };
    expect(canBoost(deal, 30)).toBe(true);
  });

  it("deal with budget cap blocks boost when over budget", () => {
    const deal: BoostState = { boostBudgetUsd: 50, boostSpentUsd: 40, isActive: true };
    expect(canBoost(deal, 20)).toBe(false);
  });

  it("deal with budget cap blocks boost when exactly at budget", () => {
    const deal: BoostState = { boostBudgetUsd: 50, boostSpentUsd: 50, isActive: true };
    expect(canBoost(deal, 1)).toBe(false);
  });

  it("inactive deal cannot be boosted", () => {
    const deal: BoostState = { boostBudgetUsd: null, boostSpentUsd: 0, isActive: false };
    expect(canBoost(deal, 10)).toBe(false);
  });

  it("boost cost is deducted from spent amount", () => {
    const deal: BoostState = { boostBudgetUsd: 100, boostSpentUsd: 20, isActive: true };
    const updated = applyBoostCost(deal, 15);
    expect(updated.boostSpentUsd).toBe(35);
    expect(updated.isActive).toBe(true);
  });

  it("deal is auto-paused when budget is exhausted", () => {
    const deal: BoostState = { boostBudgetUsd: 50, boostSpentUsd: 45, isActive: true };
    const updated = applyBoostCost(deal, 5);
    expect(updated.boostSpentUsd).toBe(50);
    expect(updated.isActive).toBe(false);
  });

  it("deal is auto-paused when boost cost exceeds remaining budget", () => {
    const deal: BoostState = { boostBudgetUsd: 50, boostSpentUsd: 45, isActive: true };
    const updated = applyBoostCost(deal, 10);
    expect(updated.boostSpentUsd).toBe(55);
    expect(updated.isActive).toBe(false);
  });

  it("deal with no budget cap is never auto-paused", () => {
    const deal: BoostState = { boostBudgetUsd: null, boostSpentUsd: 0, isActive: true };
    const updated = applyBoostCost(deal, 10000);
    expect(updated.isActive).toBe(true);
  });

  it("boost budget must be positive", () => {
    const isValidBudget = (v: number) => v > 0;
    expect(isValidBudget(0)).toBe(false);
    expect(isValidBudget(-10)).toBe(false);
    expect(isValidBudget(0.01)).toBe(true);
    expect(isValidBudget(100)).toBe(true);
  });
});

// ─── Tourist Deal Wishlist ────────────────────────────────────────────────────

describe("Tourist deal wishlist — toggle logic", () => {
  function toggleWishlist(ids: number[], dealId: number): number[] {
    if (ids.includes(dealId)) {
      return ids.filter((id) => id !== dealId);
    }
    return [...ids, dealId];
  }

  it("adds a deal to an empty wishlist", () => {
    expect(toggleWishlist([], 42)).toEqual([42]);
  });

  it("adds a deal to a non-empty wishlist", () => {
    const result = toggleWishlist([1, 2, 3], 42);
    expect(result).toContain(42);
    expect(result).toHaveLength(4);
  });

  it("removes a deal already in the wishlist", () => {
    const result = toggleWishlist([1, 2, 42], 42);
    expect(result).not.toContain(42);
    expect(result).toHaveLength(2);
  });

  it("toggling the same deal twice returns to original state", () => {
    const original = [1, 2, 3];
    const after = toggleWishlist(toggleWishlist(original, 99), 99);
    expect(after).toEqual(original);
  });

  it("wishlist preserves other deal IDs when removing", () => {
    const result = toggleWishlist([10, 20, 30], 20);
    expect(result).toContain(10);
    expect(result).toContain(30);
    expect(result).not.toContain(20);
  });

  it("wishlist does not add duplicates", () => {
    const result = toggleWishlist([1, 2, 3], 2);
    // Toggling an existing item removes it
    expect(result.filter((id) => id === 2)).toHaveLength(0);
  });
});

describe("Tourist deal wishlist — saved deals filter", () => {
  interface Deal {
    id: number;
    title: string;
    isActive: boolean;
  }

  function filterSavedDeals(deals: Deal[], savedIds: number[]): Deal[] {
    const idSet = new Set(savedIds);
    return deals.filter((d) => idSet.has(d.id));
  }

  it("returns only saved deals from the full list", () => {
    const deals: Deal[] = [
      { id: 1, title: "Deal A", isActive: true },
      { id: 2, title: "Deal B", isActive: true },
      { id: 3, title: "Deal C", isActive: false },
    ];
    const saved = filterSavedDeals(deals, [1, 3]);
    expect(saved).toHaveLength(2);
    expect(saved.map((d) => d.id)).toEqual([1, 3]);
  });

  it("returns empty array when no deals are saved", () => {
    const deals: Deal[] = [
      { id: 1, title: "Deal A", isActive: true },
    ];
    expect(filterSavedDeals(deals, [])).toHaveLength(0);
  });

  it("returns empty array when saved IDs don't match any deals", () => {
    const deals: Deal[] = [{ id: 1, title: "Deal A", isActive: true }];
    expect(filterSavedDeals(deals, [999, 888])).toHaveLength(0);
  });

  it("handles deals with mixed active/inactive status", () => {
    const deals: Deal[] = [
      { id: 1, title: "Active", isActive: true },
      { id: 2, title: "Inactive", isActive: false },
    ];
    const saved = filterSavedDeals(deals, [1, 2]);
    expect(saved).toHaveLength(2);
  });
});

// ─── Merchant Response to Reviews ─────────────────────────────────────────────

describe("Merchant review response — validation", () => {
  function validateResponse(response: string): { valid: boolean; error?: string } {
    if (!response || response.trim().length === 0) {
      return { valid: false, error: "Response cannot be empty" };
    }
    if (response.trim().length > 2000) {
      return { valid: false, error: "Response must be 2000 characters or fewer" };
    }
    return { valid: true };
  }

  it("accepts a valid response", () => {
    const result = validateResponse("Thank you for your feedback!");
    expect(result.valid).toBe(true);
  });

  it("rejects an empty response", () => {
    const result = validateResponse("");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("empty");
  });

  it("rejects a whitespace-only response", () => {
    const result = validateResponse("   ");
    expect(result.valid).toBe(false);
  });

  it("rejects a response exceeding 2000 characters", () => {
    const longText = "a".repeat(2001);
    const result = validateResponse(longText);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("2000");
  });

  it("accepts a response of exactly 2000 characters", () => {
    const maxText = "a".repeat(2000);
    const result = validateResponse(maxText);
    expect(result.valid).toBe(true);
  });

  it("accepts a response of 1 character", () => {
    const result = validateResponse("x");
    expect(result.valid).toBe(true);
  });
});

describe("Merchant review response — ownership check", () => {
  interface Review {
    id: number;
    establishmentId: number;
  }

  interface Establishment {
    id: number;
    ownerId: number;
  }

  function canRespondToReview(
    review: Review,
    establishment: Establishment,
    callerId: number
  ): boolean {
    if (review.establishmentId !== establishment.id) return false;
    return establishment.ownerId === callerId;
  }

  it("owner can respond to their own establishment's review", () => {
    const review: Review = { id: 1, establishmentId: 10 };
    const est: Establishment = { id: 10, ownerId: 42 };
    expect(canRespondToReview(review, est, 42)).toBe(true);
  });

  it("non-owner cannot respond to another establishment's review", () => {
    const review: Review = { id: 1, establishmentId: 10 };
    const est: Establishment = { id: 10, ownerId: 42 };
    expect(canRespondToReview(review, est, 99)).toBe(false);
  });

  it("mismatched establishment ID returns false", () => {
    const review: Review = { id: 1, establishmentId: 10 };
    const est: Establishment = { id: 20, ownerId: 42 };
    expect(canRespondToReview(review, est, 42)).toBe(false);
  });
});

describe("Merchant review response — update logic", () => {
  interface ReviewRecord {
    id: number;
    merchantResponse: string | null;
    merchantRespondedAt: Date | null;
  }

  function applyMerchantResponse(
    review: ReviewRecord,
    response: string,
    now: Date = new Date()
  ): ReviewRecord {
    return {
      ...review,
      merchantResponse: response.trim(),
      merchantRespondedAt: now,
    };
  }

  it("sets merchantResponse and merchantRespondedAt", () => {
    const review: ReviewRecord = { id: 1, merchantResponse: null, merchantRespondedAt: null };
    const now = new Date("2026-03-01T12:00:00Z");
    const updated = applyMerchantResponse(review, "Thank you!", now);
    expect(updated.merchantResponse).toBe("Thank you!");
    expect(updated.merchantRespondedAt).toEqual(now);
  });

  it("trims whitespace from the response", () => {
    const review: ReviewRecord = { id: 1, merchantResponse: null, merchantRespondedAt: null };
    const updated = applyMerchantResponse(review, "  Great feedback!  ");
    expect(updated.merchantResponse).toBe("Great feedback!");
  });

  it("overwrites an existing response", () => {
    const review: ReviewRecord = {
      id: 1,
      merchantResponse: "Old reply",
      merchantRespondedAt: new Date("2026-01-01"),
    };
    const now = new Date("2026-03-01T12:00:00Z");
    const updated = applyMerchantResponse(review, "Updated reply", now);
    expect(updated.merchantResponse).toBe("Updated reply");
    expect(updated.merchantRespondedAt).toEqual(now);
  });

  it("preserves other review fields when updating response", () => {
    const review: ReviewRecord = { id: 99, merchantResponse: null, merchantRespondedAt: null };
    const updated = applyMerchantResponse(review, "Thanks!");
    expect(updated.id).toBe(99);
  });
});
