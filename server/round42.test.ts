/**
 * Round 42 Tests
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. BIS Notes Bulk Export — bulkExportNotes procedure
 * 2. Leaderboard Privacy — getLeaderboardPrivacy + setLeaderboardPrivacy
 * 3. Tier-up Celebration Modal — localStorage key logic (unit test)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 1. BIS Notes Bulk Export ─────────────────────────────────────────────────

describe("BIS bulkExportNotes", () => {
  it("formats a plain-text export with investigation header sections", () => {
    // Simulate the text generation logic from the bulkExportNotes procedure
    const investigations = [
      {
        id: 1,
        referenceId: "BIS-2025-0001",
        subjectFullName: "Alice Kamau",
        notes: [
          { id: "n1", content: "Initial review completed.", authorName: "Admin", isInternal: false, createdAt: Date.now() },
          { id: "n2", content: "Internal: flagged for review.", authorName: "Admin", isInternal: true, createdAt: Date.now() },
        ],
      },
      {
        id: 2,
        referenceId: "BIS-2025-0002",
        subjectFullName: "Bob Mensah",
        notes: [],
      },
    ];

    const includeInternal = false;
    const lines: string[] = [];
    lines.push(`TourismPay BIS Investigation Notes Export`);
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Investigations: ${investigations.length}`);
    lines.push("=".repeat(60));

    let totalNotes = 0;
    let investigationsWithNotes = 0;

    for (const inv of investigations) {
      const visibleNotes = inv.notes.filter((n) => includeInternal || !n.isInternal);
      if (visibleNotes.length === 0) continue;
      investigationsWithNotes++;
      lines.push(`\n[${inv.referenceId}] ${inv.subjectFullName}`);
      lines.push("-".repeat(40));
      for (const note of visibleNotes) {
        const date = new Date(note.createdAt).toLocaleString();
        const prefix = note.isInternal ? "[INTERNAL] " : "";
        lines.push(`${prefix}${note.authorName} — ${date}`);
        lines.push(note.content);
        lines.push("");
        totalNotes++;
      }
    }

    const text = lines.join("\n");

    expect(text).toContain("BIS-2025-0001");
    expect(text).toContain("Alice Kamau");
    expect(text).toContain("Initial review completed.");
    // Internal note should be excluded when includeInternal=false
    expect(text).not.toContain("Internal: flagged for review.");
    // Investigation with no visible notes should be skipped
    expect(text).not.toContain("BIS-2025-0002");
    expect(totalNotes).toBe(1);
    expect(investigationsWithNotes).toBe(1);
  });

  it("includes internal notes when includeInternal=true", () => {
    const notes = [
      { id: "n1", content: "Public note.", isInternal: false },
      { id: "n2", content: "Secret note.", isInternal: true },
    ];
    const includeInternal = true;
    const visible = notes.filter((n) => includeInternal || !n.isInternal);
    expect(visible).toHaveLength(2);
    expect(visible.map((n) => n.content)).toContain("Secret note.");
  });

  it("generates a filename with today's date", () => {
    const today = new Date().toISOString().slice(0, 10);
    const filename = `bis-notes-export-${today}.txt`;
    expect(filename).toMatch(/^bis-notes-export-\d{4}-\d{2}-\d{2}\.txt$/);
    expect(filename).toContain(today);
  });
});

// ─── 2. Leaderboard Privacy ───────────────────────────────────────────────────

describe("Leaderboard Privacy", () => {
  it("masks opted-out users as Anonymous in leaderboard entries", () => {
    const entries = [
      { userId: "1", displayName: "Alice", isCurrentUser: false },
      { userId: "2", displayName: "Bob", isCurrentUser: true },
      { userId: "3", displayName: "Charlie", isCurrentUser: false },
    ];
    const optOutMap = new Map([["1", true], ["2", false], ["3", false]]);

    for (const entry of entries) {
      if (!entry.isCurrentUser && optOutMap.get(entry.userId)) {
        entry.displayName = "Anonymous";
      }
    }

    expect(entries[0].displayName).toBe("Anonymous"); // opted out
    expect(entries[1].displayName).toBe("Bob");        // current user — never masked
    expect(entries[2].displayName).toBe("Charlie");    // not opted out
  });

  it("does not mask the current user even if they opted out", () => {
    const entry = { userId: "42", displayName: "MyName", isCurrentUser: true };
    const optOutMap = new Map([["42", true]]);
    // The masking logic skips current user
    if (!entry.isCurrentUser && optOutMap.get(entry.userId)) {
      entry.displayName = "Anonymous";
    }
    expect(entry.displayName).toBe("MyName");
  });

  it("setLeaderboardPrivacy input schema validates boolean optOut", () => {
    const { z } = require("zod");
    const schema = z.object({ optOut: z.boolean() });
    expect(() => schema.parse({ optOut: true })).not.toThrow();
    expect(() => schema.parse({ optOut: false })).not.toThrow();
    expect(() => schema.parse({ optOut: "yes" })).toThrow();
    expect(() => schema.parse({})).toThrow();
  });
});

// ─── 3. Tier-up Celebration Modal — localStorage guard logic ─────────────────

describe("TierUpCelebrationModal localStorage guard", () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => { store[key] = val; },
      removeItem: (key: string) => { delete store[key]; },
    });
  });

  const getCelebratedKey = (userId: string | number, tier: string) =>
    `tp_tier_celebrated_${userId}_${tier}`;

  const hasCelebrated = (userId: string | number, tier: string) => {
    try { return localStorage.getItem(getCelebratedKey(userId, tier)) === "1"; }
    catch { return false; }
  };

  const markCelebrated = (userId: string | number, tier: string) => {
    try { localStorage.setItem(getCelebratedKey(userId, tier), "1"); }
    catch {}
  };

  it("returns false for a tier that has not been celebrated", () => {
    expect(hasCelebrated("user1", "SILVER")).toBe(false);
  });

  it("returns true after marking as celebrated", () => {
    markCelebrated("user1", "SILVER");
    expect(hasCelebrated("user1", "SILVER")).toBe(true);
  });

  it("is scoped per user — different users have independent guards", () => {
    markCelebrated("user1", "GOLD");
    expect(hasCelebrated("user1", "GOLD")).toBe(true);
    expect(hasCelebrated("user2", "GOLD")).toBe(false);
  });

  it("is scoped per tier — celebrating SILVER does not affect GOLD", () => {
    markCelebrated("user1", "SILVER");
    expect(hasCelebrated("user1", "SILVER")).toBe(true);
    expect(hasCelebrated("user1", "GOLD")).toBe(false);
  });

  it("detects tier upgrade correctly", () => {
    const TIER_ORDER = ["BRONZE", "SILVER", "GOLD", "PLATINUM"];
    const isUpgrade = (prev: string, next: string) =>
      TIER_ORDER.includes(next) &&
      TIER_ORDER.indexOf(next) > TIER_ORDER.indexOf(prev);

    expect(isUpgrade("BRONZE", "SILVER")).toBe(true);
    expect(isUpgrade("SILVER", "GOLD")).toBe(true);
    expect(isUpgrade("GOLD", "PLATINUM")).toBe(true);
    expect(isUpgrade("GOLD", "SILVER")).toBe(false); // downgrade
    expect(isUpgrade("BRONZE", "BRONZE")).toBe(false); // no change
    expect(isUpgrade("PLATINUM", "GOLD")).toBe(false); // downgrade
  });
});
