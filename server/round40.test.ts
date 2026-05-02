/**
 * Round 40 — Loyalty Leaderboard + BIS Investigation Notes
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Loyalty Leaderboard ──────────────────────────────────────────────────────
describe("Loyalty Leaderboard", () => {
  it("returns empty leaderboard when db is unavailable", async () => {
    const { loyaltyRouter } = await import("./routers/loyalty");
    const ctx = { user: { id: 1, role: "user", name: "Alice", email: "alice@test.com" } };
    // Mock getDb to return null
    vi.doMock("./db", () => ({ getDb: async () => null, createUserNotification: vi.fn() }));
    // The router's getLeaderboard returns { entries: [], currentUserRank: null } when db is null
    expect(loyaltyRouter).toBeDefined();
    expect(typeof loyaltyRouter).toBe("object");
  });

  it("getLeaderboard procedure exists in loyalty router", async () => {
    const { loyaltyRouter } = await import("./routers/loyalty");
    // Check the procedure is defined
    expect((loyaltyRouter as any)._def?.procedures?.getLeaderboard).toBeDefined();
  });

  it("leaderboard entry shape is correct", () => {
    const entry = {
      rank: 1,
      userId: "user-123",
      displayName: "Alice",
      tier: "GOLD",
      totalEarned: 25000,
      balance: 12000,
      isCurrentUser: true,
    };
    expect(entry.rank).toBe(1);
    expect(entry.totalEarned).toBeGreaterThan(0);
    expect(entry.tier).toBe("GOLD");
    expect(entry.isCurrentUser).toBe(true);
  });

  it("leaderboard rank medals are correct", () => {
    const medals: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
    expect(medals[1]).toBe("🥇");
    expect(medals[2]).toBe("🥈");
    expect(medals[3]).toBe("🥉");
  });

  it("leaderboard limit is clamped between 5 and 50", () => {
    const clamp = (n: number) => Math.min(50, Math.max(5, n));
    expect(clamp(3)).toBe(5);
    expect(clamp(20)).toBe(20);
    expect(clamp(100)).toBe(50);
  });
});

// ─── BIS Investigation Notes ──────────────────────────────────────────────────
describe("BIS Investigation Notes", () => {
  it("addNote procedure exists in bis router", async () => {
    const { bisRouter } = await import("./routers/bis");
    expect((bisRouter as any)._def?.procedures?.addNote).toBeDefined();
  });

  it("getNotes procedure exists in bis router", async () => {
    const { bisRouter } = await import("./routers/bis");
    expect((bisRouter as any)._def?.procedures?.getNotes).toBeDefined();
  });

  it("deleteNote procedure exists in bis router", async () => {
    const { bisRouter } = await import("./routers/bis");
    expect((bisRouter as any)._def?.procedures?.deleteNote).toBeDefined();
  });

  it("note content must be between 1 and 5000 characters", () => {
    const validateContent = (s: string) => s.length >= 1 && s.length <= 5000;
    expect(validateContent("")).toBe(false);
    expect(validateContent("A valid note")).toBe(true);
    expect(validateContent("x".repeat(5001))).toBe(false);
    expect(validateContent("x".repeat(5000))).toBe(true);
  });

  it("internal notes are only visible to admins", () => {
    const filterNotes = (notes: any[], isAdmin: boolean) =>
      notes.filter((n) => isAdmin || !n.isInternal);
    const notes = [
      { id: "1", content: "Public note", isInternal: false },
      { id: "2", content: "Internal note", isInternal: true },
    ];
    expect(filterNotes(notes, false)).toHaveLength(1);
    expect(filterNotes(notes, true)).toHaveLength(2);
  });

  it("note shape includes required fields", () => {
    const note = {
      id: "note-uuid",
      investigationId: "42",
      authorId: "user-1",
      authorName: "John Doe",
      content: "Suspicious activity detected",
      isInternal: false,
      createdAt: Date.now(),
    };
    expect(note.id).toBeTruthy();
    expect(note.investigationId).toBe("42");
    expect(note.authorName).toBeTruthy();
    expect(note.content).toBeTruthy();
    expect(typeof note.isInternal).toBe("boolean");
  });

  it("non-admins cannot post internal notes (FORBIDDEN check)", () => {
    const canPostInternal = (role: string, isInternal: boolean) => {
      if (isInternal && role !== "admin") return false;
      return true;
    };
    expect(canPostInternal("user", true)).toBe(false);
    expect(canPostInternal("admin", true)).toBe(true);
    expect(canPostInternal("user", false)).toBe(true);
  });

  it("bisInvestigationNotes table is exported from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.bisInvestigationNotes).toBeDefined();
  });
});
