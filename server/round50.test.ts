/**
 * Round 50 Tests
 *
 * 1. Audit Log preset URL sharing — "Share current filter" button + handleCopyPresetLink
 * 2. Leaderboard milestone badges — backend badge computation + frontend badge legend
 * 3. BIS export preview — previewExport procedure + BISDashboard preview panel
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const root = resolve(__dirname, "..");

// ─── 1. Audit Log Preset URL Sharing ─────────────────────────────────────────
describe("Round 50 — Audit Log Preset URL Sharing", () => {
  it("AuditLog.tsx imports Link icon from lucide-react", () => {
    const src = readFileSync(resolve(root, "client/src/pages/admin/AuditLog.tsx"), "utf-8");
    expect(src).toContain("Link,");
  });

  it("AuditLog.tsx has handleCopyPresetLink function", () => {
    const src = readFileSync(resolve(root, "client/src/pages/admin/AuditLog.tsx"), "utf-8");
    expect(src).toContain("handleCopyPresetLink");
    expect(src).toContain("new URLSearchParams()");
  });

  it("AuditLog.tsx handleCopyPresetLink encodes action, entity, from, to, preset params", () => {
    const src = readFileSync(resolve(root, "client/src/pages/admin/AuditLog.tsx"), "utf-8");
    expect(src).toContain('params.set("action"');
    expect(src).toContain('params.set("entity"');
    expect(src).toContain('params.set("from"');
    expect(src).toContain('params.set("to"');
    expect(src).toContain('params.set("preset"');
  });

  it("AuditLog.tsx handleCopyPresetLink builds URL from window.location.origin", () => {
    const src = readFileSync(resolve(root, "client/src/pages/admin/AuditLog.tsx"), "utf-8");
    expect(src).toContain("window.location.origin");
    expect(src).toContain("/audit-logs?");
  });

  it("AuditLog.tsx handleCopyPresetLink uses navigator.clipboard.writeText", () => {
    const src = readFileSync(resolve(root, "client/src/pages/admin/AuditLog.tsx"), "utf-8");
    expect(src).toContain("navigator.clipboard.writeText");
    expect(src).toContain("Filter link copied");
  });

  it("AuditLog.tsx has fallback clipboard copy using document.execCommand", () => {
    const src = readFileSync(resolve(root, "client/src/pages/admin/AuditLog.tsx"), "utf-8");
    expect(src).toContain("document.execCommand");
    expect(src).toContain("document.createElement(\"textarea\")");
  });

  it("AuditLog.tsx reads URL query params on mount to restore shared filter", () => {
    const src = readFileSync(resolve(root, "client/src/pages/admin/AuditLog.tsx"), "utf-8");
    expect(src).toContain("new URLSearchParams(window.location.search)");
    expect(src).toContain('params.get("action")');
    expect(src).toContain('params.get("entity")');
    expect(src).toContain('params.get("from")');
    expect(src).toContain('params.get("to")');
  });

  it("AuditLog.tsx shows toast when shared filter is applied from URL", () => {
    const src = readFileSync(resolve(root, "client/src/pages/admin/AuditLog.tsx"), "utf-8");
    expect(src).toContain("Shared filter");
    expect(src).toContain("applied from shared link");
  });

  it("AuditLog.tsx has 'Share current filter' button in filter bar header", () => {
    const src = readFileSync(resolve(root, "client/src/pages/admin/AuditLog.tsx"), "utf-8");
    expect(src).toContain("Share current filter");
  });

  it("AuditLog.tsx each preset chip has a copy link button", () => {
    const src = readFileSync(resolve(root, "client/src/pages/admin/AuditLog.tsx"), "utf-8");
    expect(src).toContain("handleCopyPresetLink(preset)");
    expect(src).toContain("Copy shareable link for this preset");
  });

  it("AuditLog.tsx URL sharing uses empty string fallback for current filter (no name)", () => {
    const src = readFileSync(resolve(root, "client/src/pages/admin/AuditLog.tsx"), "utf-8");
    // handleCopyPresetLink() called without args uses current filter state
    expect(src).toContain("const f = preset ?? { actionFilter, entityTypeFilter, dateFrom, dateTo, name: \"\" }");
  });
});

// ─── 2. Leaderboard Milestone Badges ─────────────────────────────────────────
describe("Round 50 — Leaderboard Milestone Badges (Backend)", () => {
  it("loyalty.ts getLeaderboard computes milestone badges for each entry", () => {
    const src = readFileSync(resolve(root, "server/routers/loyalty.ts"), "utf-8");
    expect(src).toContain("Compute milestone badges");
    expect(src).toContain("badges: string[]");
  });

  it("loyalty.ts top10 badge assigned to rank <= 10", () => {
    const src = readFileSync(resolve(root, "server/routers/loyalty.ts"), "utf-8");
    expect(src).toContain('if (entry.rank <= 10) badges.push("top10")');
  });

  it("loyalty.ts streak badge assigned when user earned on 7+ distinct days in last 14d", () => {
    const src = readFileSync(resolve(root, "server/routers/loyalty.ts"), "utf-8");
    expect(src).toContain("7+ consecutive earning days");
    expect(src).toContain("HAVING COUNT(DISTINCT DATE(TO_TIMESTAMP(created_at))) >= 7");
  });

  it("loyalty.ts highEarner badge assigned when lifetime_points >= 10000", () => {
    const src = readFileSync(resolve(root, "server/routers/loyalty.ts"), "utf-8");
    expect(src).toContain("lifetime_points >= 10000");
    expect(src).toContain('badges.push("highEarner")');
  });

  it("loyalty.ts streak query uses 14-day window", () => {
    const src = readFileSync(resolve(root, "server/routers/loyalty.ts"), "utf-8");
    expect(src).toContain("14 * 24 * 60 * 60");
  });

  it("loyalty.ts badge sets use Set for O(1) lookup", () => {
    const src = readFileSync(resolve(root, "server/routers/loyalty.ts"), "utf-8");
    expect(src).toContain("highEarnerSet");
    expect(src).toContain("streakSet");
    expect(src).toContain("new Set(");
  });

  it("loyalty.ts badges are attached to entry objects", () => {
    const src = readFileSync(resolve(root, "server/routers/loyalty.ts"), "utf-8");
    expect(src).toContain("(entry as any).badges = badges");
  });
});

describe("Round 50 — Leaderboard Milestone Badges (Frontend)", () => {
  it("LoyaltyRewards.tsx renders top10 badge emoji", () => {
    const src = readFileSync(resolve(root, "client/src/pages/tier2/LoyaltyRewards.tsx"), "utf-8");
    expect(src).toContain('badges?.includes("top10")');
    expect(src).toContain("Top 10 this period");
  });

  it("LoyaltyRewards.tsx renders streak badge emoji", () => {
    const src = readFileSync(resolve(root, "client/src/pages/tier2/LoyaltyRewards.tsx"), "utf-8");
    expect(src).toContain('badges?.includes("streak")');
    expect(src).toContain("7-day earning streak");
  });

  it("LoyaltyRewards.tsx renders highEarner badge emoji", () => {
    const src = readFileSync(resolve(root, "client/src/pages/tier2/LoyaltyRewards.tsx"), "utf-8");
    expect(src).toContain('badges?.includes("highEarner")');
    expect(src).toContain("10,000+ lifetime points");
  });

  it("LoyaltyRewards.tsx has a milestone badge legend section", () => {
    const src = readFileSync(resolve(root, "client/src/pages/tier2/LoyaltyRewards.tsx"), "utf-8");
    expect(src).toContain("Achievement Badges");
    expect(src).toContain("10k+ lifetime points");
  });

  it("LoyaltyRewards.tsx badge legend shows all three badge types", () => {
    const src = readFileSync(resolve(root, "client/src/pages/tier2/LoyaltyRewards.tsx"), "utf-8");
    expect(src).toContain("Top 10 this period");
    expect(src).toContain("7-day earning streak");
    expect(src).toContain("10k+ lifetime points");
  });

  it("LoyaltyRewards.tsx badge legend is inside the leaderboard glass-card", () => {
    const src = readFileSync(resolve(root, "client/src/pages/tier2/LoyaltyRewards.tsx"), "utf-8");
    // Legend appears after the leaderboard entries section
    const legendIdx = src.indexOf("Achievement Badges");
    const leaderboardIdx = src.indexOf("Leaderboard");
    expect(legendIdx).toBeGreaterThan(leaderboardIdx);
  });

  it("LoyaltyRewards.tsx badge titles use tooltip-style title attributes", () => {
    const src = readFileSync(resolve(root, "client/src/pages/tier2/LoyaltyRewards.tsx"), "utf-8");
    expect(src).toContain('title="Top 10 this period"');
    expect(src).toContain('title="7-day earning streak"');
    expect(src).toContain('title="10,000+ lifetime points"');
  });
});

// ─── 3. BIS Export Preview ────────────────────────────────────────────────────
describe("Round 50 — BIS Export Preview (Backend)", () => {
  it("bis.ts has previewExport procedure", () => {
    const src = readFileSync(resolve(root, "server/routers/bis.ts"), "utf-8");
    expect(src).toContain("previewExport: protectedProcedure");
  });

  it("bis.ts previewExport returns investigationCount", () => {
    const src = readFileSync(resolve(root, "server/routers/bis.ts"), "utf-8");
    expect(src).toContain("investigationCount");
  });

  it("bis.ts previewExport returns noteCount", () => {
    const src = readFileSync(resolve(root, "server/routers/bis.ts"), "utf-8");
    expect(src).toContain("noteCount");
  });

  it("bis.ts previewExport returns dateRange", () => {
    const src = readFileSync(resolve(root, "server/routers/bis.ts"), "utf-8");
    expect(src).toContain("dateRange");
    expect(src).toContain("from: new Date(");
    expect(src).toContain("to: new Date(");
  });

  it("bis.ts previewExport returns frequency from schedule", () => {
    const src = readFileSync(resolve(root, "server/routers/bis.ts"), "utf-8");
    expect(src).toContain("frequency: schedule.frequency");
  });

  it("bis.ts previewExport returns nextRunAt from schedule", () => {
    const src = readFileSync(resolve(root, "server/routers/bis.ts"), "utf-8");
    expect(src).toContain("nextRunAt: schedule.nextRunAt");
  });

  it("bis.ts previewExport returns empty result when no schedule exists", () => {
    const src = readFileSync(resolve(root, "server/routers/bis.ts"), "utf-8");
    expect(src).toContain("investigationCount: 0, noteCount: 0, dateRange: null, filters: {}");
  });

  it("bis.ts previewExport respects includeInternal flag from schedule", () => {
    const src = readFileSync(resolve(root, "server/routers/bis.ts"), "utf-8");
    expect(src).toContain("schedule.includeInternal");
    expect(src).toContain("is_internal = false");
  });

  it("bis.ts previewExport uses COUNT(*) for note count", () => {
    const src = readFileSync(resolve(root, "server/routers/bis.ts"), "utf-8");
    expect(src).toContain("COUNT(*) as cnt");
  });

  it("bis.ts previewExport fetches MIN/MAX created_at for date range", () => {
    const src = readFileSync(resolve(root, "server/routers/bis.ts"), "utf-8");
    expect(src).toContain("MIN(created_at) as oldest");
    expect(src).toContain("MAX(created_at) as newest");
  });
});

describe("Round 50 — BIS Export Preview (Frontend)", () => {
  it("BISDashboard.tsx calls trpc.bis.previewExport.useQuery", () => {
    const src = readFileSync(resolve(root, "client/src/pages/bis/BISDashboard.tsx"), "utf-8");
    expect(src).toContain("trpc.bis.previewExport.useQuery");
  });

  it("BISDashboard.tsx previewExport query is enabled only when schedule panel is open", () => {
    const src = readFileSync(resolve(root, "client/src/pages/bis/BISDashboard.tsx"), "utf-8");
    expect(src).toContain("enabled: showSchedulePanel && !!exportSchedule");
  });

  it("BISDashboard.tsx renders Export Preview section", () => {
    const src = readFileSync(resolve(root, "client/src/pages/bis/BISDashboard.tsx"), "utf-8");
    expect(src).toContain("Export Preview");
    expect(src).toContain("dry run");
  });

  it("BISDashboard.tsx preview shows investigation count", () => {
    const src = readFileSync(resolve(root, "client/src/pages/bis/BISDashboard.tsx"), "utf-8");
    expect(src).toContain("exportPreview.investigationCount");
    expect(src).toContain("Investigations");
  });

  it("BISDashboard.tsx preview shows note count", () => {
    const src = readFileSync(resolve(root, "client/src/pages/bis/BISDashboard.tsx"), "utf-8");
    expect(src).toContain("exportPreview.noteCount");
    expect(src).toContain("Notes");
  });

  it("BISDashboard.tsx preview shows date range when available", () => {
    const src = readFileSync(resolve(root, "client/src/pages/bis/BISDashboard.tsx"), "utf-8");
    expect(src).toContain("exportPreview.dateRange");
    expect(src).toContain("Date range");
  });

  it("BISDashboard.tsx preview shows frequency", () => {
    const src = readFileSync(resolve(root, "client/src/pages/bis/BISDashboard.tsx"), "utf-8");
    expect(src).toContain("exportPreview.frequency");
    expect(src).toContain("Frequency");
  });

  it("BISDashboard.tsx preview shows warning when noteCount is 0", () => {
    const src = readFileSync(resolve(root, "client/src/pages/bis/BISDashboard.tsx"), "utf-8");
    expect(src).toContain("exportPreview.noteCount === 0");
    expect(src).toContain("export will be empty");
  });

  it("BISDashboard.tsx preview panel is inside the schedule panel conditional", () => {
    const src = readFileSync(resolve(root, "client/src/pages/bis/BISDashboard.tsx"), "utf-8");
    const schedPanelIdx = src.indexOf("showSchedulePanel && (");
    const previewIdx = src.indexOf("Export Preview");
    expect(previewIdx).toBeGreaterThan(schedPanelIdx);
  });

  it("BISDashboard.tsx previewExport query refetches every 30s when panel is open", () => {
    const src = readFileSync(resolve(root, "client/src/pages/bis/BISDashboard.tsx"), "utf-8");
    expect(src).toContain("refetchInterval: showSchedulePanel ? 30_000 : false");
  });
});
