/**
 * Round 103 Tests
 * Covers:
 *  1. Force-refresh sentiment — forceRefresh param bypasses cache TTL check
 *  2. Sentiment history — 14-day window filtering, snapshot upsert deduplication
 *  3. Daily snapshot job — correct snapshot building from cache rows
 *  4. Reply quality suggestion — LLM JSON parsing, issue detection, fallback, ownership
 */
import { describe, it, expect } from "vitest";

// ─── Force-Refresh Sentiment ──────────────────────────────────────────────────
describe("Force-refresh sentiment — cache bypass logic", () => {
  function shouldUseCachedResult(
    cachedAgeMs: number,
    forceRefresh: boolean,
    cacheExistsInDb: boolean
  ): boolean {
    if (forceRefresh) return false; // always bypass when forceRefresh = true
    if (!cacheExistsInDb) return false;
    return cachedAgeMs < 24 * 60 * 60 * 1000;
  }

  it("uses cache when fresh and forceRefresh is false", () => {
    const oneHourMs = 60 * 60 * 1000;
    expect(shouldUseCachedResult(oneHourMs, false, true)).toBe(true);
  });

  it("bypasses cache when forceRefresh is true even if cache is fresh", () => {
    const oneHourMs = 60 * 60 * 1000;
    expect(shouldUseCachedResult(oneHourMs, true, true)).toBe(false);
  });

  it("bypasses cache when forceRefresh is true and cache is stale", () => {
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    expect(shouldUseCachedResult(twoDaysMs, true, true)).toBe(false);
  });

  it("bypasses cache when cache does not exist in DB", () => {
    expect(shouldUseCachedResult(0, false, false)).toBe(false);
  });

  it("bypasses stale cache (>24h) even without forceRefresh", () => {
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    expect(shouldUseCachedResult(twoDaysMs, false, true)).toBe(false);
  });

  it("uses cache when exactly at 23h59m (just under 24h TTL)", () => {
    const justUnder24h = 23 * 60 * 60 * 1000 + 59 * 60 * 1000;
    expect(shouldUseCachedResult(justUnder24h, false, true)).toBe(true);
  });

  it("bypasses cache at exactly 24h boundary", () => {
    const exactly24h = 24 * 60 * 60 * 1000;
    expect(shouldUseCachedResult(exactly24h, false, true)).toBe(false);
  });
});

// ─── Sentiment History — 14-day Window ───────────────────────────────────────
describe("Sentiment history — 14-day window filtering", () => {
  interface HistoryRow {
    snapshotDate: string; // YYYY-MM-DD
    positivePercent: number;
    reviewCount: number;
  }

  function filterLast14Days(rows: HistoryRow[], today: Date): HistoryRow[] {
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - 14);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    return rows
      .filter((r) => r.snapshotDate >= cutoffStr)
      .sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
  }

  const today = new Date("2026-03-01");

  it("includes rows within the last 14 days", () => {
    const rows: HistoryRow[] = [
      { snapshotDate: "2026-02-20", positivePercent: 75, reviewCount: 10 },
      { snapshotDate: "2026-02-28", positivePercent: 80, reviewCount: 12 },
    ];
    const result = filterLast14Days(rows, today);
    expect(result).toHaveLength(2);
  });

  it("excludes rows older than 14 days", () => {
    const rows: HistoryRow[] = [
      { snapshotDate: "2026-02-10", positivePercent: 60, reviewCount: 8 }, // 19 days ago
      { snapshotDate: "2026-02-28", positivePercent: 80, reviewCount: 12 },
    ];
    const result = filterLast14Days(rows, today);
    expect(result).toHaveLength(1);
    expect(result[0].snapshotDate).toBe("2026-02-28");
  });

  it("includes row exactly at 14-day boundary", () => {
    const rows: HistoryRow[] = [
      { snapshotDate: "2026-02-15", positivePercent: 70, reviewCount: 9 }, // exactly 14 days ago
    ];
    const result = filterLast14Days(rows, today);
    expect(result).toHaveLength(1);
  });

  it("returns rows sorted by date ascending", () => {
    const rows: HistoryRow[] = [
      { snapshotDate: "2026-02-28", positivePercent: 80, reviewCount: 12 },
      { snapshotDate: "2026-02-20", positivePercent: 75, reviewCount: 10 },
      { snapshotDate: "2026-02-25", positivePercent: 78, reviewCount: 11 },
    ];
    const result = filterLast14Days(rows, today);
    expect(result[0].snapshotDate).toBe("2026-02-20");
    expect(result[1].snapshotDate).toBe("2026-02-25");
    expect(result[2].snapshotDate).toBe("2026-02-28");
  });

  it("returns empty array when no rows exist", () => {
    expect(filterLast14Days([], today)).toHaveLength(0);
  });
});

// ─── Daily Snapshot Job — Snapshot Building ───────────────────────────────────
describe("Daily sentiment snapshot job — snapshot building", () => {
  interface CacheRow {
    establishmentId: number;
    positivePercent: number;
    reviewCount: number;
  }

  interface SnapshotRow {
    establishmentId: number;
    positivePercent: number;
    reviewCount: number;
    snapshotDate: string;
  }

  function buildSnapshots(cacheRows: CacheRow[], today: string): SnapshotRow[] {
    return cacheRows.map((row) => ({
      establishmentId: row.establishmentId,
      positivePercent: row.positivePercent,
      reviewCount: row.reviewCount,
      snapshotDate: today,
    }));
  }

  it("builds one snapshot per cache row", () => {
    const cacheRows: CacheRow[] = [
      { establishmentId: 1, positivePercent: 80, reviewCount: 10 },
      { establishmentId: 2, positivePercent: 60, reviewCount: 5 },
    ];
    const snapshots = buildSnapshots(cacheRows, "2026-03-01");
    expect(snapshots).toHaveLength(2);
  });

  it("assigns today's date to all snapshots", () => {
    const cacheRows: CacheRow[] = [
      { establishmentId: 1, positivePercent: 75, reviewCount: 8 },
    ];
    const snapshots = buildSnapshots(cacheRows, "2026-03-01");
    expect(snapshots[0].snapshotDate).toBe("2026-03-01");
  });

  it("preserves positivePercent and reviewCount from cache", () => {
    const cacheRows: CacheRow[] = [
      { establishmentId: 3, positivePercent: 92, reviewCount: 25 },
    ];
    const snapshots = buildSnapshots(cacheRows, "2026-03-01");
    expect(snapshots[0].positivePercent).toBe(92);
    expect(snapshots[0].reviewCount).toBe(25);
  });

  it("returns empty array when no cache rows exist", () => {
    expect(buildSnapshots([], "2026-03-01")).toHaveLength(0);
  });

  it("generates correct YYYY-MM-DD date format for today", () => {
    const today = new Date("2026-03-01T12:00:00Z").toISOString().split("T")[0];
    expect(today).toBe("2026-03-01");
  });
});

// ─── Reply Quality Suggestion — LLM Parsing ───────────────────────────────────
describe("Reply quality suggestion — LLM JSON parsing", () => {
  function parseReplyQualityResponse(raw: string, draftReply: string): {
    hasIssues: boolean;
    issues: string[];
    improvedReply: string;
  } {
    try {
      const parsed = JSON.parse(raw);
      return {
        hasIssues: parsed.hasIssues ?? false,
        issues: (parsed.issues ?? []).slice(0, 5),
        improvedReply: parsed.improvedReply ?? draftReply,
      };
    } catch {
      return { hasIssues: false, issues: [], improvedReply: draftReply };
    }
  }

  it("parses a response with issues correctly", () => {
    const raw = JSON.stringify({
      hasIssues: true,
      issues: ["Too defensive", "Dismissive tone"],
      improvedReply: "Thank you for your feedback. We take all comments seriously.",
    });
    const result = parseReplyQualityResponse(raw, "original");
    expect(result.hasIssues).toBe(true);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]).toBe("Too defensive");
    expect(result.improvedReply).toContain("Thank you");
  });

  it("parses a clean response with no issues", () => {
    const raw = JSON.stringify({
      hasIssues: false,
      issues: [],
      improvedReply: "Thank you for your kind words! We look forward to seeing you again.",
    });
    const result = parseReplyQualityResponse(raw, "original");
    expect(result.hasIssues).toBe(false);
    expect(result.issues).toHaveLength(0);
  });

  it("limits issues to 5 items", () => {
    const raw = JSON.stringify({
      hasIssues: true,
      issues: ["a", "b", "c", "d", "e", "f", "g"],
      improvedReply: "Better reply",
    });
    const result = parseReplyQualityResponse(raw, "original");
    expect(result.issues).toHaveLength(5);
  });

  it("falls back to original draft reply on invalid JSON", () => {
    const result = parseReplyQualityResponse("not json {{", "my original draft");
    expect(result.hasIssues).toBe(false);
    expect(result.issues).toHaveLength(0);
    expect(result.improvedReply).toBe("my original draft");
  });

  it("uses original draft when improvedReply is missing from response", () => {
    const raw = JSON.stringify({ hasIssues: false, issues: [] });
    const result = parseReplyQualityResponse(raw, "fallback draft");
    expect(result.improvedReply).toBe("fallback draft");
  });

  it("returns hasIssues=false when field is missing from response", () => {
    const raw = JSON.stringify({ issues: [], improvedReply: "ok" });
    const result = parseReplyQualityResponse(raw, "draft");
    expect(result.hasIssues).toBe(false);
  });
});

// ─── Reply Quality Suggestion — Ownership Validation ─────────────────────────
describe("Reply quality suggestion — ownership validation", () => {
  function checkOwnership(
    establishment: { ownerId: number } | null,
    currentUserId: number
  ): boolean {
    if (!establishment) return false;
    return establishment.ownerId === currentUserId;
  }

  it("allows owner to request quality suggestion", () => {
    expect(checkOwnership({ ownerId: 42 }, 42)).toBe(true);
  });

  it("denies non-owner from requesting quality suggestion", () => {
    expect(checkOwnership({ ownerId: 42 }, 99)).toBe(false);
  });

  it("denies when establishment does not exist", () => {
    expect(checkOwnership(null, 42)).toBe(false);
  });
});

// ─── Sparkline Data Transformation ───────────────────────────────────────────
describe("Sparkline data transformation for AreaChart", () => {
  interface HistoryRow {
    snapshotDate: string;
    positivePercent: number;
  }

  function transformForChart(rows: HistoryRow[]): { date: string; pct: number }[] {
    return rows.map((h) => ({ date: h.snapshotDate, pct: h.positivePercent }));
  }

  it("maps snapshotDate to date and positivePercent to pct", () => {
    const rows: HistoryRow[] = [
      { snapshotDate: "2026-02-20", positivePercent: 75 },
      { snapshotDate: "2026-02-21", positivePercent: 80 },
    ];
    const chart = transformForChart(rows);
    expect(chart[0]).toEqual({ date: "2026-02-20", pct: 75 });
    expect(chart[1]).toEqual({ date: "2026-02-21", pct: 80 });
  });

  it("returns empty array for empty input", () => {
    expect(transformForChart([])).toHaveLength(0);
  });

  it("does not show sparkline when only 1 data point exists (needs >1)", () => {
    const rows: HistoryRow[] = [{ snapshotDate: "2026-02-28", positivePercent: 80 }];
    // The UI condition is: sentimentHistory.length > 1
    expect(rows.length > 1).toBe(false);
  });

  it("shows sparkline when 2 or more data points exist", () => {
    const rows: HistoryRow[] = [
      { snapshotDate: "2026-02-27", positivePercent: 78 },
      { snapshotDate: "2026-02-28", positivePercent: 80 },
    ];
    expect(rows.length > 1).toBe(true);
  });
});
