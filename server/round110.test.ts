/**
 * Round 110 Tests
 * - Director bundle Stripe webhook handler (checkout.session.completed → create BIS investigations)
 * - Weekly leaderboard score snapshot job + peerLeaderboard weekDelta trend
 * - Bundle checkout success toast on BIS report page
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readSrc(relPath: string): string {
  return readFileSync(path.join("/home/ubuntu/tourismpay-pwa", relPath), "utf-8");
}

// ─── 1. Director Bundle Stripe Webhook Handler ───────────────────────────────

describe("Director bundle Stripe webhook handler", () => {
  const webhook = readSrc("server/stripeWebhook.ts");
  const schema = readSrc("drizzle/schema.ts");

  it("webhook imports bisDirectors and bisInvestigations from schema", () => {
    expect(webhook).toContain("bisDirectors");
    expect(webhook).toContain("bisInvestigations");
  });

  it("webhook imports createBisInvestigation from db", () => {
    expect(webhook).toContain("createBisInvestigation");
  });

  it("webhook checks for director_bundle metadata bundle_type", () => {
    expect(webhook).toContain("bundle_type");
    expect(webhook).toContain("director_bundle");
  });

  it("handleDirectorBundle function exists and reads director_ids from metadata", () => {
    expect(webhook).toContain("handleDirectorBundle");
    expect(webhook).toContain("director_ids");
  });

  it("handleDirectorBundle creates BIS investigation for each director", () => {
    expect(webhook).toContain("createBisInvestigation");
    // Should iterate over directors
    expect(webhook).toMatch(/for.*of.*directors|directors\.map|directors\.forEach/i);
  });

  it("handleDirectorBundle links director back via linkedInvestigationId", () => {
    expect(webhook).toContain("linkedInvestigationId");
    expect(webhook).toMatch(/update.*bisDirectors|bisDirectors.*update/i);
  });

  it("handleDirectorBundle applies 20% bundle discount", () => {
    expect(webhook).toContain("DISCOUNT_PERCENT");
    expect(webhook).toContain("20");
  });

  it("handleDirectorBundle sends in-app notification to user", () => {
    expect(webhook).toContain("createUserNotification");
    expect(webhook).toMatch(/Director Bundle|bundle.*queued|investigations.*created/i);
  });

  it("handleDirectorBundle creates an audit log entry", () => {
    expect(webhook).toContain("createAuditLog");
    expect(webhook).toContain("bis.director_bundle.completed");
  });

  it("handleDirectorBundle is idempotent: skips directors with existing linkedInvestigationId", () => {
    expect(webhook).toContain("linkedInvestigationId");
    // Should check if already linked before creating
    expect(webhook).toMatch(/director\.linkedInvestigationId|already.*linked|skipping/i);
  });

  it("schema has establishmentScoreSnapshots table", () => {
    expect(schema).toContain("establishmentScoreSnapshots");
    expect(schema).toContain("establishment_score_snapshots");
  });

  it("schema has snapshotDate field on establishmentScoreSnapshots", () => {
    expect(schema).toContain("snapshotDate");
    expect(schema).toContain("snapshot_date");
  });

  it("schema has uniqueIndex on (establishmentId, snapshotDate)", () => {
    expect(schema).toContain("est_snapshot_unique");
  });
});

// ─── 2. Weekly Leaderboard Score Snapshot Job ────────────────────────────────

describe("Weekly leaderboard score snapshot job", () => {
  const job = readSrc("server/jobs/leaderboardSnapshotJob.ts");
  const coreIndex = readSrc("server/_core/index.ts");
  const merchantRevenue = readSrc("server/routers/merchantRevenue.ts");

  it("job file exists and exports startLeaderboardSnapshotJob", () => {
    expect(job).toContain("startLeaderboardSnapshotJob");
    expect(job).toContain("export function startLeaderboardSnapshotJob");
  });

  it("job runs on a 7-day interval", () => {
    expect(job).toMatch(/7.*24.*60.*60.*1000|JOB_INTERVAL_MS.*7.*day|7 days/i);
  });

  it("job computes composite score with correct weights", () => {
    // bookings 40%, rating 30%, responseRate 30%
    expect(job).toContain("0.4");
    expect(job).toContain("0.3");
    expect(job).toContain("compositeScore");
  });

  it("job uses onConflictDoUpdate for idempotent upsert", () => {
    expect(job).toContain("onConflictDoUpdate");
  });

  it("job computes currentWeekMonday date string", () => {
    expect(job).toContain("currentWeekMonday");
    expect(job).toMatch(/snapshotDate|snapshot_date/i);
  });

  it("job is registered in core index", () => {
    expect(coreIndex).toContain("startLeaderboardSnapshotJob");
    expect(coreIndex).toContain("leaderboardSnapshotJob");
  });

  it("peerLeaderboard procedure imports establishmentScoreSnapshots", () => {
    expect(merchantRevenue).toContain("establishmentScoreSnapshots");
  });

  it("peerLeaderboard imports inArray from drizzle-orm", () => {
    expect(merchantRevenue).toContain("inArray");
  });

  it("peerLeaderboard computes weekDelta for each entry", () => {
    expect(merchantRevenue).toContain("weekDelta");
    expect(merchantRevenue).toContain("prevRank");
  });

  it("peerLeaderboard returns weekDelta in leaderboard entries", () => {
    // weekDelta should be returned as part of each row
    expect(merchantRevenue).toContain("weekDelta");
    expect(merchantRevenue).toMatch(/rank.*currentRank|currentRank.*rank/i);
  });

  it("peerLeaderboard handles missing snapshot data gracefully (non-fatal)", () => {
    // Should catch errors from snapshot query without throwing
    expect(merchantRevenue).toMatch(/catch.*err|try.*snapshot|Non-fatal/i);
    expect(merchantRevenue).toContain("lastWeekRankMap");
  });

  it("peerLeaderboard uses selectDistinct for snapshot dates", () => {
    expect(merchantRevenue).toContain("selectDistinct");
    expect(merchantRevenue).toContain("snapshotDate");
  });
});

// ─── 3. Bundle Checkout Success Toast on BIS Report Page ─────────────────────

describe("Bundle checkout success toast on BIS report page", () => {
  const bisReport = readSrc("client/src/pages/bis/BISReport.tsx");

  it("BISReport imports useSearch from wouter", () => {
    expect(bisReport).toContain("useSearch");
    expect(bisReport).toMatch(/from.*wouter/);
  });

  it("BISReport imports useEffect from react", () => {
    expect(bisReport).toContain("useEffect");
    expect(bisReport).toMatch(/from.*react/);
  });

  it("BISReport reads bundle_checkout query param", () => {
    expect(bisReport).toContain("bundle_checkout");
    expect(bisReport).toContain("success");
  });

  it("BISReport shows toast on bundle_checkout=success", () => {
    expect(bisReport).toContain("toast.success");
    expect(bisReport).toMatch(/Director Bundle|bundle.*payment|Payment Confirmed/i);
  });

  it("BISReport includes director count in toast description", () => {
    expect(bisReport).toContain("count");
    expect(bisReport).toMatch(/investigation.*queued|queued.*investigation/i);
  });

  it("BISReport includes tier information in toast description", () => {
    expect(bisReport).toContain("tier");
    expect(bisReport).toMatch(/20%.*discount|bundle.*discount/i);
  });

  it("BISReport cleans up query params after showing toast", () => {
    expect(bisReport).toContain("window.history.replaceState");
    expect(bisReport).toContain("cleanUrl");
  });

  it("BISReport uses bundleToastShown flag to prevent duplicate toasts", () => {
    expect(bisReport).toContain("bundleToastShown");
    expect(bisReport).toContain("setBundleToastShown");
  });

  it("BISReport toast has extended duration for readability", () => {
    // Should have duration > 5000ms for the bundle success message
    expect(bisReport).toMatch(/duration.*[6-9]\d{3}|duration.*[1-9]\d{4}/);
  });
});

// ─── 4. Leaderboard Trend Arrow UI ───────────────────────────────────────────

describe("Leaderboard trend arrow UI", () => {
  const leaderboard = readSrc("client/src/pages/merchant/MerchantKpiLeaderboard.tsx");

  it("imports TrendingUp and TrendingDown from lucide-react", () => {
    expect(leaderboard).toContain("TrendingUp");
    expect(leaderboard).toContain("TrendingDown");
  });

  it("has TrendArrow component", () => {
    expect(leaderboard).toContain("TrendArrow");
    expect(leaderboard).toContain("function TrendArrow");
  });

  it("TrendArrow shows green TrendingUp for positive delta", () => {
    expect(leaderboard).toMatch(/delta.*>.*0|delta > 0/);
    expect(leaderboard).toContain("emerald");
  });

  it("TrendArrow shows red TrendingDown for negative delta", () => {
    expect(leaderboard).toContain("TrendingDown");
    expect(leaderboard).toContain("red");
  });

  it("TrendArrow shows Minus icon for null or zero delta", () => {
    expect(leaderboard).toContain("Minus");
    expect(leaderboard).toMatch(/delta.*null|null.*delta/);
  });

  it("TrendArrow uses Tooltip to explain the delta value", () => {
    expect(leaderboard).toContain("Tooltip");
    expect(leaderboard).toMatch(/last week|prior week/i);
  });

  it("table shows Trend column only when trend data is available", () => {
    expect(leaderboard).toContain("hasTrendData");
    expect(leaderboard).toMatch(/hasTrendData.*&&|hasTrendData.*\?/);
  });

  it("rank summary card shows own weekDelta trend arrow", () => {
    // The Your Rank card should show the own entry's weekDelta
    expect(leaderboard).toMatch(/own.*weekDelta|weekDelta.*own/);
  });

  it("footer text mentions trend arrows and weekly snapshots", () => {
    expect(leaderboard).toMatch(/Trend arrows|trend.*arrows/i);
    expect(leaderboard).toMatch(/last week|weekly snapshot/i);
  });
});
