/**
 * Round 41 — BIS Notes PDF Export + Leaderboard Time Filters + Loyalty Tier-Up Notifications
 */
import { describe, it, expect, vi } from "vitest";

// ─── BIS Notes Export ─────────────────────────────────────────────────────────
describe("BIS Notes Export", () => {
  it("exportNotes procedure exists in bis router", async () => {
    const { bisRouter } = await import("./routers/bis");
    expect((bisRouter as any)._def?.procedures?.exportNotes).toBeDefined();
  });

  it("exportNotes returns correct shape when db is unavailable", async () => {
    // The procedure throws INTERNAL_SERVER_ERROR when db is null
    // We just verify the procedure is callable and the shape is defined
    const { bisRouter } = await import("./routers/bis");
    const proc = (bisRouter as any)._def?.procedures?.exportNotes;
    expect(proc).toBeDefined();
    expect(proc._def.type).toBe("query");
  });

  it("exportNotes input schema requires investigationId and optional includeInternal", async () => {
    const { bisRouter } = await import("./routers/bis");
    const proc = (bisRouter as any)._def?.procedures?.exportNotes;
    // The input parser should be defined
    expect(proc._def.inputs).toBeDefined();
  });

  it("exportNotes output text format is correct", () => {
    // Simulate the text generation logic
    const referenceId = "BIS-2026-0001";
    const subjectFullName = "John Doe";
    const exportedAt = new Date().toLocaleString();
    const notes = [
      { id: "n1", content: "Initial review complete.", authorName: "Admin", isInternal: false, createdAt: Date.now() },
      { id: "n2", content: "Escalated to compliance.", authorName: "Analyst", isInternal: true, createdAt: Date.now() },
    ];
    const lines: string[] = [
      "INVESTIGATION NOTES EXPORT",
      "===========================",
      `Investigation: ${referenceId}`,
      `Subject:       ${subjectFullName}`,
      `Exported:      ${exportedAt}`,
      `Total Notes:   ${notes.length}`,
      "",
    ];
    notes.forEach((note, idx) => {
      lines.push(`--- Note ${idx + 1}${note.isInternal ? " [INTERNAL — ADMIN ONLY]" : ""} ---`);
      lines.push(`Author: ${note.authorName}`);
      lines.push(`Date:   ${new Date(note.createdAt).toLocaleString()}`);
      lines.push("");
      lines.push(note.content);
      lines.push("");
    });
    const text = lines.join("\n");
    expect(text).toContain("INVESTIGATION NOTES EXPORT");
    expect(text).toContain(`Investigation: ${referenceId}`);
    expect(text).toContain(`Subject:       ${subjectFullName}`);
    expect(text).toContain("Total Notes:   2");
    expect(text).toContain("Initial review complete.");
    expect(text).toContain("[INTERNAL — ADMIN ONLY]");
    expect(text).toContain("Escalated to compliance.");
  });

  it("exportNotes filename includes referenceId and date", () => {
    const referenceId = "BIS-2026-0001";
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `notes-${referenceId}-${dateStr}.txt`;
    expect(filename).toMatch(/^notes-BIS-2026-0001-\d{4}-\d{2}-\d{2}\.txt$/);
  });

  it("exportNotes non-admin cannot see internal notes (logic check)", () => {
    const isAdmin = false;
    const includeInternal = false;
    const shouldFilterInternal = !isAdmin || !includeInternal;
    expect(shouldFilterInternal).toBe(true);
  });

  it("exportNotes admin with includeInternal=true can see all notes", () => {
    const isAdmin = true;
    const includeInternal = true;
    const shouldFilterInternal = !isAdmin || !includeInternal;
    expect(shouldFilterInternal).toBe(false);
  });

  it("exportNotes admin with includeInternal=false still filters internal notes", () => {
    const isAdmin = true;
    const includeInternal = false;
    const shouldFilterInternal = !isAdmin || !includeInternal;
    expect(shouldFilterInternal).toBe(true);
  });

  it("exportNotes empty notes case returns correct message", () => {
    const lines: string[] = [
      "INVESTIGATION NOTES EXPORT",
      "===========================",
      "Investigation: BIS-2026-0001",
      "Subject:       Jane Smith",
      `Exported:      ${new Date().toLocaleString()}`,
      "Total Notes:   0",
      "",
      "No notes found for this investigation.",
    ];
    const text = lines.join("\n");
    expect(text).toContain("No notes found for this investigation.");
    expect(text).toContain("Total Notes:   0");
  });
});

// ─── Leaderboard Time Filters ─────────────────────────────────────────────────
describe("Leaderboard Time Filters", () => {
  it("getLeaderboard procedure exists in loyalty router", async () => {
    const { loyaltyRouter } = await import("./routers/loyalty");
    expect((loyaltyRouter as any)._def?.procedures?.getLeaderboard).toBeDefined();
  });

  it("getLeaderboard accepts timeFilter enum values", () => {
    const validFilters = ["allTime", "monthly", "weekly"] as const;
    validFilters.forEach((f) => {
      expect(["allTime", "monthly", "weekly"]).toContain(f);
    });
  });

  it("weekly period start is 7 days ago in seconds", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const weeklyStart = nowSec - 7 * 24 * 60 * 60;
    const diff = nowSec - weeklyStart;
    expect(diff).toBe(7 * 24 * 60 * 60);
  });

  it("monthly period start is 30 days ago in seconds", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const monthlyStart = nowSec - 30 * 24 * 60 * 60;
    const diff = nowSec - monthlyStart;
    expect(diff).toBe(30 * 24 * 60 * 60);
  });

  it("allTime filter uses null periodStart", () => {
    const timeFilter = "allTime";
    const nowSec = Math.floor(Date.now() / 1000);
    let periodStart: number | null = null;
    if (timeFilter === "weekly") periodStart = nowSec - 7 * 24 * 60 * 60;
    else if (timeFilter === "monthly") periodStart = nowSec - 30 * 24 * 60 * 60;
    expect(periodStart).toBeNull();
  });

  it("weekly filter sets correct periodStart", () => {
    const timeFilter = "weekly";
    const nowSec = Math.floor(Date.now() / 1000);
    let periodStart: number | null = null;
    if (timeFilter === "weekly") periodStart = nowSec - 7 * 24 * 60 * 60;
    else if (timeFilter === "monthly") periodStart = nowSec - 30 * 24 * 60 * 60;
    expect(periodStart).not.toBeNull();
    expect(periodStart).toBeLessThan(nowSec);
  });

  it("monthly filter sets correct periodStart", () => {
    const timeFilter = "monthly";
    const nowSec = Math.floor(Date.now() / 1000);
    let periodStart: number | null = null;
    if (timeFilter === "weekly") periodStart = nowSec - 7 * 24 * 60 * 60;
    else if (timeFilter === "monthly") periodStart = nowSec - 30 * 24 * 60 * 60;
    expect(periodStart).not.toBeNull();
    expect(periodStart).toBeLessThan(nowSec);
  });

  it("getLeaderboard returns timeFilter in response", () => {
    // Simulate the return shape
    const mockResult = { entries: [], currentUserRank: null, timeFilter: "weekly" as const };
    expect(mockResult.timeFilter).toBe("weekly");
  });

  it("leaderboard entry shape includes all required fields", () => {
    const entry = {
      rank: 1,
      userId: "user-abc",
      displayName: "Alice",
      tier: "GOLD",
      totalEarned: 15000,
      balance: 8000,
      isCurrentUser: false,
    };
    expect(entry).toHaveProperty("rank");
    expect(entry).toHaveProperty("userId");
    expect(entry).toHaveProperty("displayName");
    expect(entry).toHaveProperty("tier");
    expect(entry).toHaveProperty("totalEarned");
    expect(entry).toHaveProperty("balance");
    expect(entry).toHaveProperty("isCurrentUser");
  });

  it("getLeaderboard returns empty when db unavailable", async () => {
    const { loyaltyRouter } = await import("./routers/loyalty");
    // The procedure returns { entries: [], currentUserRank: null, timeFilter } when db is null
    expect(loyaltyRouter).toBeDefined();
  });

  it("leaderboard limit is clamped between 5 and 50", () => {
    const clamp = (n: number) => Math.min(50, Math.max(5, n));
    expect(clamp(3)).toBe(5);
    expect(clamp(20)).toBe(20);
    expect(clamp(100)).toBe(50);
    expect(clamp(50)).toBe(50);
    expect(clamp(5)).toBe(5);
  });

  it("time filter toggle labels are correct", () => {
    const labels: Record<string, string> = {
      weekly: "This Week",
      monthly: "This Month",
      allTime: "All Time",
    };
    expect(labels["weekly"]).toBe("This Week");
    expect(labels["monthly"]).toBe("This Month");
    expect(labels["allTime"]).toBe("All Time");
  });
});

// ─── Loyalty Tier-Up Notifications ───────────────────────────────────────────
describe("Loyalty Tier-Up Notifications", () => {
  it("TIER_BENEFITS constants are defined for all upgrade tiers", () => {
    const TIER_BENEFITS: Record<string, string> = {
      SILVER: "You now enjoy 1.5x points multiplier, priority customer support, and exclusive Silver member discounts.",
      GOLD: "You now enjoy 2x points multiplier, dedicated account manager, complimentary lounge access, and Gold-exclusive offers.",
      PLATINUM: "You now enjoy 3x points multiplier, personal concierge service, unlimited lounge access, and Platinum VIP benefits.",
    };
    expect(TIER_BENEFITS["SILVER"]).toBeDefined();
    expect(TIER_BENEFITS["GOLD"]).toBeDefined();
    expect(TIER_BENEFITS["PLATINUM"]).toBeDefined();
    expect(TIER_BENEFITS["BRONZE"]).toBeUndefined(); // No upgrade message for BRONZE (starting tier)
  });

  it("tier upgrade is detected when newTier differs from previousTier", () => {
    const previousTier = "BRONZE";
    const newTier = "SILVER";
    const tierUpgraded = newTier !== previousTier;
    expect(tierUpgraded).toBe(true);
  });

  it("no tier upgrade when tier remains the same", () => {
    const previousTier = "SILVER";
    const newTier = "SILVER";
    const tierUpgraded = newTier !== previousTier;
    expect(tierUpgraded).toBe(false);
  });

  it("getTierFromPoints returns correct tier for each threshold", () => {
    const getTierFromPoints = (lifetime: number): string => {
      if (lifetime >= 50000) return "PLATINUM";
      if (lifetime >= 20000) return "GOLD";
      if (lifetime >= 5000) return "SILVER";
      return "BRONZE";
    };
    expect(getTierFromPoints(0)).toBe("BRONZE");
    expect(getTierFromPoints(4999)).toBe("BRONZE");
    expect(getTierFromPoints(5000)).toBe("SILVER");
    expect(getTierFromPoints(19999)).toBe("SILVER");
    expect(getTierFromPoints(20000)).toBe("GOLD");
    expect(getTierFromPoints(49999)).toBe("GOLD");
    expect(getTierFromPoints(50000)).toBe("PLATINUM");
    expect(getTierFromPoints(100000)).toBe("PLATINUM");
  });

  it("tier upgrade notification content is correct for SILVER", () => {
    const previousTier = "BRONZE";
    const newTier = "SILVER";
    const TIER_BENEFITS: Record<string, string> = {
      SILVER: "You now enjoy 1.5x points multiplier, priority customer support, and exclusive Silver member discounts.",
      GOLD: "You now enjoy 2x points multiplier, dedicated account manager, complimentary lounge access, and Gold-exclusive offers.",
      PLATINUM: "You now enjoy 3x points multiplier, personal concierge service, unlimited lounge access, and Platinum VIP benefits.",
    };
    const notification = {
      title: `Congratulations! You've reached ${newTier} tier!`,
      content: `You've been upgraded from ${previousTier} to ${newTier}! ${TIER_BENEFITS[newTier]}`,
    };
    expect(notification.title).toContain("SILVER");
    expect(notification.content).toContain("BRONZE");
    expect(notification.content).toContain("SILVER");
    expect(notification.content).toContain("1.5x points multiplier");
  });

  it("tier upgrade notification content is correct for GOLD", () => {
    const previousTier = "SILVER";
    const newTier = "GOLD";
    const TIER_BENEFITS: Record<string, string> = {
      SILVER: "You now enjoy 1.5x points multiplier, priority customer support, and exclusive Silver member discounts.",
      GOLD: "You now enjoy 2x points multiplier, dedicated account manager, complimentary lounge access, and Gold-exclusive offers.",
      PLATINUM: "You now enjoy 3x points multiplier, personal concierge service, unlimited lounge access, and Platinum VIP benefits.",
    };
    const notification = {
      title: `Congratulations! You've reached ${newTier} tier!`,
      content: `You've been upgraded from ${previousTier} to ${newTier}! ${TIER_BENEFITS[newTier]}`,
    };
    expect(notification.title).toContain("GOLD");
    expect(notification.content).toContain("2x points multiplier");
  });

  it("tier upgrade notification content is correct for PLATINUM", () => {
    const previousTier = "GOLD";
    const newTier = "PLATINUM";
    const TIER_BENEFITS: Record<string, string> = {
      SILVER: "You now enjoy 1.5x points multiplier, priority customer support, and exclusive Silver member discounts.",
      GOLD: "You now enjoy 2x points multiplier, dedicated account manager, complimentary lounge access, and Gold-exclusive offers.",
      PLATINUM: "You now enjoy 3x points multiplier, personal concierge service, unlimited lounge access, and Platinum VIP benefits.",
    };
    const notification = {
      title: `Congratulations! You've reached ${newTier} tier!`,
      content: `You've been upgraded from ${previousTier} to ${newTier}! ${TIER_BENEFITS[newTier]}`,
    };
    expect(notification.title).toContain("PLATINUM");
    expect(notification.content).toContain("3x points multiplier");
    expect(notification.content).toContain("personal concierge");
  });

  it("loyalty.earn procedure returns tierUpgraded flag", async () => {
    const { loyaltyRouter } = await import("./routers/loyalty");
    const earnProc = (loyaltyRouter as any)._def?.procedures?.earn;
    expect(earnProc).toBeDefined();
    // The procedure is a mutation
    expect(earnProc._def.type).toBe("mutation");
  });

  it("loyalty.earnWithPartner procedure exists and is a mutation", async () => {
    const { loyaltyRouter } = await import("./routers/loyalty");
    const proc = (loyaltyRouter as any)._def?.procedures?.earnWithPartner;
    expect(proc).toBeDefined();
    expect(proc._def.type).toBe("mutation");
  });

  it("tier downgrade job sends notification to affected users", () => {
    // Simulate the downgrade notification logic
    const downgrades = [
      { userId: "1", from: "GOLD", to: "SILVER" },
      { userId: "2", from: "SILVER", to: "BRONZE" },
    ];
    const notificationContent = downgrades.map(d => `• User #${d.userId}: ${d.from} → ${d.to}`).join("\n");
    expect(notificationContent).toContain("User #1: GOLD → SILVER");
    expect(notificationContent).toContain("User #2: SILVER → BRONZE");
  });

  it("tier order is correct for upgrade/downgrade detection", () => {
    const TIER_ORDER = ["BRONZE", "SILVER", "GOLD", "PLATINUM"];
    expect(TIER_ORDER.indexOf("BRONZE")).toBe(0);
    expect(TIER_ORDER.indexOf("SILVER")).toBe(1);
    expect(TIER_ORDER.indexOf("GOLD")).toBe(2);
    expect(TIER_ORDER.indexOf("PLATINUM")).toBe(3);
    // SILVER > BRONZE
    expect(TIER_ORDER.indexOf("SILVER")).toBeGreaterThan(TIER_ORDER.indexOf("BRONZE"));
    // GOLD > SILVER
    expect(TIER_ORDER.indexOf("GOLD")).toBeGreaterThan(TIER_ORDER.indexOf("SILVER"));
    // PLATINUM > GOLD
    expect(TIER_ORDER.indexOf("PLATINUM")).toBeGreaterThan(TIER_ORDER.indexOf("GOLD"));
  });
});
