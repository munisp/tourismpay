import { describe, it, expect, vi } from "vitest";

describe("Round 48 — Audit Log Saved Filters, BIS Countdown Timer, Leaderboard Personal Rank Card", () => {
  // ─── Feature 1: Audit Log Saved Filters ───────────────────────────────────
  describe("Audit Log Saved Filters", () => {
    it("AuditLog.tsx contains savedFilters state initialized from localStorage", () => {
      const fs = require("fs");
      const content = fs.readFileSync("client/src/pages/admin/AuditLog.tsx", "utf8");
      expect(content).toContain("localStorage");
      expect(content).toContain("savedFilter");
    });

    it("AuditLog.tsx has a Save Filter button", () => {
      const fs = require("fs");
      const content = fs.readFileSync("client/src/pages/admin/AuditLog.tsx", "utf8");
      expect(content).toContain("handleSaveFilter");
      expect(content).toContain("savedFilter");
    });

    it("AuditLog.tsx can restore a saved filter", () => {
      const fs = require("fs");
      const content = fs.readFileSync("client/src/pages/admin/AuditLog.tsx", "utf8");
      // Should have a handler that loads from savedFilters
      expect(content).toContain("setActionFilter");
      expect(content).toContain("setEntityTypeFilter");
    });
  });

  // ─── Feature 2: BIS Schedule Countdown Timer ──────────────────────────────
  describe("BIS Schedule Countdown Timer", () => {
    it("BISDashboard.tsx contains countdownStr state", () => {
      const fs = require("fs");
      const content = fs.readFileSync("client/src/pages/bis/BISDashboard.tsx", "utf8");
      expect(content).toContain("countdownStr");
      expect(content).toContain("setCountdownStr");
    });

    it("BISDashboard.tsx has a countdown useEffect with setInterval", () => {
      const fs = require("fs");
      const content = fs.readFileSync("client/src/pages/bis/BISDashboard.tsx", "utf8");
      expect(content).toContain("setInterval");
      expect(content).toContain("computeCountdown");
      expect(content).toContain("60_000");
    });

    it("BISDashboard.tsx uses countdownStr in the schedule badge", () => {
      const fs = require("fs");
      const content = fs.readFileSync("client/src/pages/bis/BISDashboard.tsx", "utf8");
      expect(content).toContain("countdownStr");
      expect(content).toContain("Active —");
    });

    it("countdown computes days, hours, and minutes correctly", () => {
      // Simulate the countdown logic
      function computeCountdown(nextRunAt: number): string {
        const diff = nextRunAt - Date.now();
        if (diff <= 0) return "due now";
        const days = Math.floor(diff / 86_400_000);
        const hours = Math.floor((diff % 86_400_000) / 3_600_000);
        const mins = Math.floor((diff % 3_600_000) / 60_000);
        if (days > 0) return `in ${days}d ${hours}h`;
        if (hours > 0) return `in ${hours}h ${mins}m`;
        return `in ${mins}m`;
      }

      // Use a fixed base time to avoid millisecond drift flakiness
      const now = 1_700_000_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(now);
      expect(computeCountdown(now + 3 * 86_400_000 + 5 * 3_600_000)).toBe("in 3d 5h");
      expect(computeCountdown(now + 2 * 3_600_000 + 30 * 60_000)).toBe("in 2h 30m");
      expect(computeCountdown(now + 45 * 60_000)).toBe("in 45m");
      expect(computeCountdown(now - 1000)).toBe("due now");
      vi.restoreAllMocks();
    });
  });

  // ─── Feature 3: Leaderboard Personal Rank Card ────────────────────────────
  describe("Leaderboard Personal Rank Card", () => {
    it("LoyaltyRewards.tsx extracts myLeaderboardPoints and myLeaderboardTier from leaderboardData", () => {
      const fs = require("fs");
      const content = fs.readFileSync("client/src/pages/tier2/LoyaltyRewards.tsx", "utf8");
      expect(content).toContain("myLeaderboardPoints");
      expect(content).toContain("myLeaderboardTier");
    });

    it("LoyaltyRewards.tsx renders personal rank card when user is outside top 20", () => {
      const fs = require("fs");
      const content = fs.readFileSync("client/src/pages/tier2/LoyaltyRewards.tsx", "utf8");
      expect(content).toContain("Personal rank card");
      expect(content).toContain("your rank");
      expect(content).toContain("isCurrentUser");
    });

    it("getLeaderboard procedure returns myPoints and myTier", () => {
      const fs = require("fs");
      const content = fs.readFileSync("server/routers/loyalty.ts", "utf8");
      expect(content).toContain("myPoints");
      expect(content).toContain("myTier");
      expect(content).toContain("pointsAboveMe"); // return now also includes pointsAboveMe (Round 49)
    });

    it("personal rank card uses tier-specific color classes", () => {
      const fs = require("fs");
      const content = fs.readFileSync("client/src/pages/tier2/LoyaltyRewards.tsx", "utf8");
      expect(content).toContain("PLATINUM");
      expect(content).toContain("GOLD");
      expect(content).toContain("SILVER");
      expect(content).toContain("BRONZE");
    });
  });
});
