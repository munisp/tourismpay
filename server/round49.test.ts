/**
 * Round 49 Tests
 * Covers: multi-preset saved filters, BIS countdown toast, leaderboard rank progress bar
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const root = resolve(__dirname, "..");

describe("Round 49 — Multi-Preset Saved Filters", () => {
  it("AuditLog.tsx has filterPresets state initialized from localStorage", () => {
    const src = readFileSync(resolve(root, "client/src/pages/admin/AuditLog.tsx"), "utf-8");
    expect(src).toContain("filterPresets");
    expect(src).toContain("SAVED_PRESETS_KEY");
    expect(src).toContain("tp_audit_log_filter_presets");
  });

  it("AuditLog.tsx has showPresetInput and presetName state", () => {
    const src = readFileSync(resolve(root, "client/src/pages/admin/AuditLog.tsx"), "utf-8");
    expect(src).toContain("showPresetInput");
    expect(src).toContain("presetName");
    expect(src).toContain("setPresetName");
  });

  it("AuditLog.tsx handleSaveFilter uses preset name and saves to presets array", () => {
    const src = readFileSync(resolve(root, "client/src/pages/admin/AuditLog.tsx"), "utf-8");
    expect(src).toContain("const name = presetName.trim()");
    expect(src).toContain("filterPresets.filter(p => p.name !== name)");
    expect(src).toContain(".slice(-5)");
  });

  it("AuditLog.tsx handleRestoreFilter accepts an optional preset param", () => {
    const src = readFileSync(resolve(root, "client/src/pages/admin/AuditLog.tsx"), "utf-8");
    expect(src).toContain("handleRestoreFilter = (preset?: SavedFilter)");
    expect(src).toContain("const f = preset ?? savedFilter");
  });

  it("AuditLog.tsx handleDeletePreset removes preset by name", () => {
    const src = readFileSync(resolve(root, "client/src/pages/admin/AuditLog.tsx"), "utf-8");
    expect(src).toContain("handleDeletePreset");
    expect(src).toContain("filterPresets.filter(p => p.name !== name)");
  });

  it("AuditLog.tsx handleClearSavedFilter clears both keys", () => {
    const src = readFileSync(resolve(root, "client/src/pages/admin/AuditLog.tsx"), "utf-8");
    expect(src).toContain("SAVED_PRESETS_KEY");
    expect(src).toContain("setFilterPresets([])");
  });

  it("SavedFilter type includes name field", () => {
    const src = readFileSync(resolve(root, "client/src/pages/admin/AuditLog.tsx"), "utf-8");
    expect(src).toMatch(/type SavedFilter = \{[\s\S]*?name: string/);
  });
});

describe("Round 49 — BIS Export Countdown Toast", () => {
  it("BISDashboard.tsx has countdownToastFiredRef", () => {
    const src = readFileSync(resolve(root, "client/src/pages/bis/BISDashboard.tsx"), "utf-8");
    expect(src).toContain("countdownToastFiredRef");
    expect(src).toContain("useRef<string | null>(null)");
  });

  it("BISDashboard.tsx countdown fires toast when within 1 hour", () => {
    const src = readFileSync(resolve(root, "client/src/pages/bis/BISDashboard.tsx"), "utf-8");
    expect(src).toContain("diff <= 3_600_000");
    expect(src).toContain("BIS export in");
    expect(src).toContain("exportSchedule?.enabled");
  });

  it("BISDashboard.tsx countdown toast fires only once per scheduled run", () => {
    const src = readFileSync(resolve(root, "client/src/pages/bis/BISDashboard.tsx"), "utf-8");
    expect(src).toContain("countdownToastFiredRef.current !== String(nextRun)");
    expect(src).toContain("countdownToastFiredRef.current = String(nextRun)");
  });

  it("BISDashboard.tsx countdown toast has action to open schedule panel", () => {
    const src = readFileSync(resolve(root, "client/src/pages/bis/BISDashboard.tsx"), "utf-8");
    expect(src).toContain("setShowSchedulePanel(true)");
    expect(src).toContain("duration: 10_000");
  });
});

describe("Round 49 — Leaderboard Rank Progress Bar", () => {
  it("loyalty.ts getLeaderboard returns pointsAboveMe", () => {
    const src = readFileSync(resolve(root, "server/routers/loyalty.ts"), "utf-8");
    expect(src).toContain("pointsAboveMe");
    expect(src).toContain("return { entries, currentUserRank, timeFilter, myPoints, myTier, pointsAboveMe }");
  });

  it("loyalty.ts pointsAboveMe finds user ranked directly above", () => {
    const src = readFileSync(resolve(root, "server/routers/loyalty.ts"), "utf-8");
    expect(src).toContain("currentUserRank! - 1");
    expect(src).toContain("aboveEntry.totalEarned");
  });

  it("LoyaltyRewards.tsx computes pointsGap and progressPct", () => {
    const src = readFileSync(resolve(root, "client/src/pages/tier2/LoyaltyRewards.tsx"), "utf-8");
    expect(src).toContain("pointsAboveMe");
    expect(src).toContain("pointsGap");
    expect(src).toContain("progressPct");
    expect(src).toContain("Math.min(100,");
  });

  it("LoyaltyRewards.tsx renders progress bar with correct structure", () => {
    const src = readFileSync(resolve(root, "client/src/pages/tier2/LoyaltyRewards.tsx"), "utf-8");
    expect(src).toContain("Progress to rank #");
    expect(src).toContain("pts needed");
    expect(src).toContain("of the way there");
    expect(src).toContain("bg-gradient-to-r from-primary/70 to-primary");
  });

  it("LoyaltyRewards.tsx wraps rank card and progress bar in Fragment", () => {
    const src = readFileSync(resolve(root, "client/src/pages/tier2/LoyaltyRewards.tsx"), "utf-8");
    // Fragment wrapper ensures both elements render correctly
    expect(src).toContain("<>\n              <div className=\"mt-3 flex items-center");
  });

  it("LoyaltyRewards.tsx shows 100% completion message", () => {
    const src = readFileSync(resolve(root, "client/src/pages/tier2/LoyaltyRewards.tsx"), "utf-8");
    expect(src).toContain("progressPct === 100");
    expect(src).toContain("You have enough points to move up");
  });
});
