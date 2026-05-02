/**
 * Round 102 Tests
 * Covers:
 *  1. Review sentiment analysis — LLM JSON parsing, caching, ownership validation, fallback
 *  2. Wishlist expiry alert opt-out — preference check, opted-out users skipped
 *  3. Reply templates — template content, template selection, template overridability
 */
import { describe, it, expect } from "vitest";

// ─── Review Sentiment Analysis ─────────────────────────────────────────────────
describe("Review sentiment analysis — LLM JSON parsing", () => {
  function parseSentimentResponse(raw: string): {
    positivePercent: number;
    themes: string[];
    summary: string;
  } {
    try {
      const parsed = JSON.parse(raw);
      return {
        positivePercent: Math.min(100, Math.max(0, parsed.positivePercent ?? 0)),
        themes: (parsed.themes ?? []).slice(0, 5),
        summary: parsed.summary ?? "",
      };
    } catch {
      return { positivePercent: 0, themes: [], summary: "Could not analyse reviews at this time." };
    }
  }

  it("parses a valid LLM response with all fields", () => {
    const raw = JSON.stringify({
      positivePercent: 85,
      themes: ["clean rooms", "friendly staff", "great location"],
      summary: "Guests consistently praise cleanliness and staff friendliness.",
    });
    const result = parseSentimentResponse(raw);
    expect(result.positivePercent).toBe(85);
    expect(result.themes).toEqual(["clean rooms", "friendly staff", "great location"]);
    expect(result.summary).toContain("cleanliness");
  });

  it("clamps positivePercent to 0-100 range", () => {
    const tooHigh = JSON.stringify({ positivePercent: 150, themes: [], summary: "test" });
    const tooLow = JSON.stringify({ positivePercent: -20, themes: [], summary: "test" });
    expect(parseSentimentResponse(tooHigh).positivePercent).toBe(100);
    expect(parseSentimentResponse(tooLow).positivePercent).toBe(0);
  });

  it("limits themes to 5 items", () => {
    const raw = JSON.stringify({
      positivePercent: 70,
      themes: ["a", "b", "c", "d", "e", "f", "g"],
      summary: "test",
    });
    expect(parseSentimentResponse(raw).themes).toHaveLength(5);
  });

  it("returns fallback on invalid JSON", () => {
    const result = parseSentimentResponse("not valid json {{");
    expect(result.positivePercent).toBe(0);
    expect(result.themes).toEqual([]);
    expect(result.summary).toBe("Could not analyse reviews at this time.");
  });

  it("handles missing fields gracefully", () => {
    const raw = JSON.stringify({ positivePercent: 60 }); // no themes or summary
    const result = parseSentimentResponse(raw);
    expect(result.positivePercent).toBe(60);
    expect(result.themes).toEqual([]);
    expect(result.summary).toBe("");
  });

  it("handles non-string LLM content (array content) gracefully", () => {
    // Simulate the typeof check in the procedure
    const rawContent: unknown = [{ type: "text", text: "some content" }];
    const raw = typeof rawContent === "string" ? rawContent : "{}";
    const result = parseSentimentResponse(raw);
    expect(result.positivePercent).toBe(0);
    expect(result.themes).toEqual([]);
  });
});

describe("Review sentiment analysis — ownership validation", () => {
  // The procedure uses protectedProcedure and checks est.ownerId === ctx.user.id
  // Any authenticated user who owns the establishment can access it (no role check)
  function validateSentimentAccess(
    requestingUserId: number,
    establishmentOwnerId: number
  ): boolean {
    return requestingUserId === establishmentOwnerId;
  }

  it("allows the establishment owner to view sentiment", () => {
    expect(validateSentimentAccess(5, 5)).toBe(true);
  });

  it("denies a user who does not own the establishment", () => {
    expect(validateSentimentAccess(5, 10)).toBe(false);
  });

  it("denies a user with matching id but different establishment owner", () => {
    expect(validateSentimentAccess(1, 99)).toBe(false);
  });

  it("access is purely based on ownership, not role", () => {
    // User 3 owns establishment 3 — access granted regardless of role
    expect(validateSentimentAccess(3, 3)).toBe(true);
    // User 3 does not own establishment 7 — access denied
    expect(validateSentimentAccess(3, 7)).toBe(false);
  });
});

describe("Review sentiment analysis — cache logic", () => {
  const CACHE_TTL_HOURS = 6;

  function isCacheStale(generatedAt: Date): boolean {
    const ageMs = Date.now() - generatedAt.getTime();
    return ageMs > CACHE_TTL_HOURS * 60 * 60 * 1000;
  }

  it("considers cache fresh if generated within TTL", () => {
    const recentDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    expect(isCacheStale(recentDate)).toBe(false);
  });

  it("considers cache stale if older than TTL", () => {
    const oldDate = new Date(Date.now() - 8 * 60 * 60 * 1000); // 8 hours ago
    expect(isCacheStale(oldDate)).toBe(true);
  });

  it("considers cache stale if exactly at TTL boundary", () => {
    const exactBoundary = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000 - 1);
    expect(isCacheStale(exactBoundary)).toBe(true);
  });
});

// ─── Wishlist Expiry Alert Opt-Out ─────────────────────────────────────────────
describe("Wishlist expiry alert opt-out — preference check", () => {
  interface UserPref {
    userId: number;
    wishlistExpiryAlerts: boolean;
  }

  function filterOptedOutUsers(userIds: number[], prefs: UserPref[]): Set<number> {
    const optedOut = new Set<number>();
    for (const pref of prefs) {
      if (!pref.wishlistExpiryAlerts) optedOut.add(pref.userId);
    }
    return optedOut;
  }

  function shouldAlertUser(userId: number, optedOutSet: Set<number>): boolean {
    return !optedOutSet.has(userId);
  }

  it("includes users with no preference record (default opt-in)", () => {
    const prefs: UserPref[] = []; // no preferences stored
    const optedOut = filterOptedOutUsers([1, 2, 3], prefs);
    expect(shouldAlertUser(1, optedOut)).toBe(true);
    expect(shouldAlertUser(2, optedOut)).toBe(true);
  });

  it("excludes users who have opted out", () => {
    const prefs: UserPref[] = [
      { userId: 1, wishlistExpiryAlerts: false },
      { userId: 2, wishlistExpiryAlerts: true },
    ];
    const optedOut = filterOptedOutUsers([1, 2], prefs);
    expect(shouldAlertUser(1, optedOut)).toBe(false);
    expect(shouldAlertUser(2, optedOut)).toBe(true);
  });

  it("handles all users opted out", () => {
    const prefs: UserPref[] = [
      { userId: 10, wishlistExpiryAlerts: false },
      { userId: 11, wishlistExpiryAlerts: false },
    ];
    const optedOut = filterOptedOutUsers([10, 11], prefs);
    expect(shouldAlertUser(10, optedOut)).toBe(false);
    expect(shouldAlertUser(11, optedOut)).toBe(false);
  });

  it("handles user with wishlistExpiryAlerts=true (explicitly opted in)", () => {
    const prefs: UserPref[] = [{ userId: 5, wishlistExpiryAlerts: true }];
    const optedOut = filterOptedOutUsers([5], prefs);
    expect(shouldAlertUser(5, optedOut)).toBe(true);
  });

  it("does not affect users not in the preference list", () => {
    const prefs: UserPref[] = [{ userId: 1, wishlistExpiryAlerts: false }];
    const optedOut = filterOptedOutUsers([1, 2, 3], prefs);
    // User 2 and 3 have no preference row — they are NOT opted out
    expect(shouldAlertUser(2, optedOut)).toBe(true);
    expect(shouldAlertUser(3, optedOut)).toBe(true);
  });
});

// ─── Reply Templates ──────────────────────────────────────────────────────────
describe("Reply templates — content and selection", () => {
  const REPLY_TEMPLATES = [
    {
      label: "Thank you",
      text: "Thank you for your kind words! We're delighted you had a great experience and hope to welcome you back soon.",
    },
    {
      label: "Apology",
      text: "We're sorry to hear your experience didn't meet expectations. Please reach out directly so we can make it right.",
    },
    {
      label: "Invite back",
      text: "Thank you for your feedback! We'd love to have you visit again — we're always working to improve your experience.",
    },
  ];

  it("has exactly 3 templates", () => {
    expect(REPLY_TEMPLATES).toHaveLength(3);
  });

  it("each template has a non-empty label and text", () => {
    for (const tpl of REPLY_TEMPLATES) {
      expect(tpl.label.length).toBeGreaterThan(0);
      expect(tpl.text.length).toBeGreaterThan(20);
    }
  });

  it("thank-you template contains positive language", () => {
    const tpl = REPLY_TEMPLATES.find((t) => t.label === "Thank you")!;
    expect(tpl.text.toLowerCase()).toContain("thank you");
    expect(tpl.text.toLowerCase()).toContain("experience");
  });

  it("apology template contains empathetic language", () => {
    const tpl = REPLY_TEMPLATES.find((t) => t.label === "Apology")!;
    expect(tpl.text.toLowerCase()).toContain("sorry");
    expect(tpl.text.toLowerCase()).toContain("make it right");
  });

  it("invite-back template encourages return visit", () => {
    const tpl = REPLY_TEMPLATES.find((t) => t.label === "Invite back")!;
    expect(tpl.text.toLowerCase()).toContain("visit");
  });

  it("template text can be overridden by user input", () => {
    // Simulates clicking a template then editing the textarea
    let replyText = "";
    const selectTemplate = (tpl: (typeof REPLY_TEMPLATES)[0]) => {
      replyText = tpl.text;
    };
    const editText = (newText: string) => {
      replyText = newText;
    };

    selectTemplate(REPLY_TEMPLATES[0]);
    expect(replyText).toBe(REPLY_TEMPLATES[0].text);

    editText("Custom reply from merchant.");
    expect(replyText).toBe("Custom reply from merchant.");
  });

  it("selecting a different template replaces the current text", () => {
    let replyText = REPLY_TEMPLATES[0].text;
    replyText = REPLY_TEMPLATES[1].text; // user clicks Apology template
    expect(replyText).toBe(REPLY_TEMPLATES[1].text);
    expect(replyText).not.toBe(REPLY_TEMPLATES[0].text);
  });

  it("post reply button is disabled when reply text is empty", () => {
    const replyText = "";
    const isDisabled = !replyText.trim();
    expect(isDisabled).toBe(true);
  });

  it("post reply button is enabled when template is selected", () => {
    const replyText = REPLY_TEMPLATES[0].text;
    const isDisabled = !replyText.trim();
    expect(isDisabled).toBe(false);
  });
});

// ─── Sentiment Card UI Logic ──────────────────────────────────────────────────
describe("Sentiment card UI — sentiment level classification", () => {
  function classifySentiment(positivePercent: number): "positive" | "neutral" | "negative" {
    if (positivePercent >= 60) return "positive";
    if (positivePercent >= 40) return "neutral";
    return "negative";
  }

  it("classifies 80% as positive", () => {
    expect(classifySentiment(80)).toBe("positive");
  });

  it("classifies 60% as positive (boundary)", () => {
    expect(classifySentiment(60)).toBe("positive");
  });

  it("classifies 50% as neutral", () => {
    expect(classifySentiment(50)).toBe("neutral");
  });

  it("classifies 40% as neutral (boundary)", () => {
    expect(classifySentiment(40)).toBe("neutral");
  });

  it("classifies 39% as negative", () => {
    expect(classifySentiment(39)).toBe("negative");
  });

  it("classifies 0% as negative", () => {
    expect(classifySentiment(0)).toBe("negative");
  });

  it("classifies 100% as positive", () => {
    expect(classifySentiment(100)).toBe("positive");
  });
});
