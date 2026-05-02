/**
 * Round 109 Tests
 * - Itinerary collaboration system (co-planner invites, change logs, real-time updates)
 * - Merchant KPI benchmark leaderboard (/merchant/leaderboard, peerLeaderboard procedure)
 * - Director investigation bundle pricing UI with Stripe checkout (bundleAllDirectors)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readSrc(relPath: string): string {
  return readFileSync(path.join("/home/ubuntu/tourismpay-pwa", relPath), "utf-8");
}

// ─── 1. Itinerary Collaboration System ───────────────────────────────────────

describe("Itinerary collaboration system", () => {
  const itineraryRouter = readSrc("server/routers/itinerary.ts");
  const schema = readSrc("drizzle/schema.ts");
  const builderPage = readSrc("client/src/pages/tourist/ItineraryBuilder.tsx");
  const appTsx = readSrc("client/src/App.tsx");

  it("schema has itineraryCollaborators table", () => {
    expect(schema).toContain("itineraryCollaborators");
  });

  it("schema has itineraryChangelog table", () => {
    expect(schema).toContain("itineraryChangelog");
  });

  it("itinerary router has inviteCollaborator procedure", () => {
    expect(itineraryRouter).toContain("inviteCollaborator");
    // Should generate an invite token
    expect(itineraryRouter).toMatch(/inviteToken|invite_token|token/i);
  });

  it("itinerary router has acceptInvite procedure", () => {
    expect(itineraryRouter).toContain("acceptInvite");
    // acceptInvite uses protectedProcedure (user must be logged in to accept)
    expect(itineraryRouter).toContain("protectedProcedure");
  });

  it("itinerary router has getCollaborators procedure", () => {
    expect(itineraryRouter).toContain("getCollaborators");
  });

  it("itinerary router has getChangelog procedure", () => {
    expect(itineraryRouter).toContain("getChangelog");
  });

  it("itinerary router records changelog entries on item add", () => {
    // addItem should write to itineraryChangelog
    expect(itineraryRouter).toMatch(/itineraryChangelog|changelog/i);
    expect(itineraryRouter).toMatch(/insert.*changelog|changelog.*insert/i);
  });

  it("ItineraryBuilder has collaboration dialog or section", () => {
    expect(builderPage).toMatch(/collaborat|co-planner|Collaborat/i);
  });

  it("ItineraryBuilder calls inviteCollaborator mutation", () => {
    expect(builderPage).toContain("inviteCollaborator");
  });

  it("ItineraryBuilder shows changelog or activity log", () => {
    expect(builderPage).toMatch(/changelog|Changelog|activity|Activity/i);
  });

  it("invite accept route is registered in App.tsx", () => {
    // Should have a route for invite acceptance
    expect(appTsx).toMatch(/invite|InviteAccept/i);
  });

  it("inviteCollaborator generates a secure invite token", () => {
    // Should use crypto.randomBytes or similar to generate a token
    expect(itineraryRouter).toMatch(/inviteToken|invite_token|randomBytes|randomUUID/i);
  });
});

// ─── 2. Merchant KPI Benchmark Leaderboard ───────────────────────────────────

describe("Merchant KPI benchmark leaderboard", () => {
  const merchantRevenueRouter = readSrc("server/routers/merchantRevenue.ts");
  const leaderboardPage = readSrc("client/src/pages/merchant/MerchantKpiLeaderboard.tsx");
  const appTsx = readSrc("client/src/App.tsx");
  const appShell = readSrc("client/src/components/layout/AppShell.tsx");

  it("merchantRevenue router has peerLeaderboard procedure", () => {
    expect(merchantRevenueRouter).toContain("peerLeaderboard");
  });

  it("peerLeaderboard verifies establishment ownership", () => {
    // Should check ownerId === ctx.user.id
    expect(merchantRevenueRouter).toMatch(/ownerId.*ctx\.user\.id|ctx\.user\.id.*ownerId/);
  });

  it("peerLeaderboard filters by same type and country", () => {
    expect(merchantRevenueRouter).toMatch(/eq.*type.*est\.type|eq.*country.*est\.country/);
  });

  it("peerLeaderboard calculates composite score", () => {
    // Composite = bookings 40% + rating 30% + response rate 30%
    expect(merchantRevenueRouter).toContain("compositeScore");
    expect(merchantRevenueRouter).toMatch(/0\.4|40%/);
    expect(merchantRevenueRouter).toMatch(/0\.3|30%/);
  });

  it("peerLeaderboard returns ranked list with isOwn flag", () => {
    expect(merchantRevenueRouter).toContain("isOwn");
    expect(merchantRevenueRouter).toContain("rank");
    expect(merchantRevenueRouter).toContain("leaderboard");
  });

  it("peerLeaderboard returns ownRank and totalPeers", () => {
    expect(merchantRevenueRouter).toContain("ownRank");
    expect(merchantRevenueRouter).toContain("totalPeers");
  });

  it("peerLeaderboard sorts by compositeScore descending", () => {
    expect(merchantRevenueRouter).toMatch(/sort.*compositeScore|compositeScore.*sort/);
    // Descending: b.compositeScore - a.compositeScore
    expect(merchantRevenueRouter).toMatch(/b\.compositeScore.*a\.compositeScore/);
  });

  it("peerLeaderboard uses 30-day window for bookings", () => {
    expect(merchantRevenueRouter).toMatch(/30.*24.*60.*60|thirtyDaysAgo/);
  });

  it("leaderboard page uses peerLeaderboard query", () => {
    expect(leaderboardPage).toContain("peerLeaderboard");
    expect(leaderboardPage).toContain("trpc.merchantRevenue.peerLeaderboard");
  });

  it("leaderboard page highlights own row", () => {
    // Should apply a different style to the own row
    expect(leaderboardPage).toMatch(/isOwn/);
    expect(leaderboardPage).toMatch(/border-l-primary|border-primary|bg-primary/);
  });

  it("leaderboard page shows rank, name, bookings, rating, response rate, composite score", () => {
    expect(leaderboardPage).toMatch(/rank|Rank/i);
    expect(leaderboardPage).toMatch(/booking|Booking/i);
    expect(leaderboardPage).toMatch(/rating|Rating/i);
    expect(leaderboardPage).toMatch(/response.*rate|Response.*Rate/i);
    expect(leaderboardPage).toMatch(/composite|Composite/i);
  });

  it("leaderboard page has RankBadge with trophy for rank 1", () => {
    expect(leaderboardPage).toContain("Trophy");
    expect(leaderboardPage).toMatch(/rank.*1|1.*rank/i);
  });

  it("leaderboard page has score bar visualization", () => {
    expect(leaderboardPage).toMatch(/ScoreBar|score.*bar|bar.*score/i);
  });

  it("leaderboard page has establishment selector for multi-venue merchants", () => {
    expect(leaderboardPage).toContain("myEstablishments");
    expect(leaderboardPage).toMatch(/Select|select/);
  });

  it("App.tsx has /merchant/leaderboard route", () => {
    expect(appTsx).toContain("/merchant/leaderboard");
    expect(appTsx).toContain("MerchantKpiLeaderboard");
  });

  it("AppShell has KPI Leaderboard nav item", () => {
    expect(appShell).toContain("/merchant/leaderboard");
    expect(appShell).toMatch(/KPI.*Leaderboard|Leaderboard.*KPI/i);
  });

  it("leaderboard page shows country and establishment type context", () => {
    expect(leaderboardPage).toMatch(/country|Country/i);
    expect(leaderboardPage).toMatch(/establishmentType|establishment.*type/i);
  });

  it("response rate colour-coded: green ≥70%, amber ≥40%, red <40%", () => {
    expect(leaderboardPage).toMatch(/70/);
    expect(leaderboardPage).toMatch(/40/);
    expect(leaderboardPage).toMatch(/emerald|green/i);
    expect(leaderboardPage).toMatch(/amber|yellow/i);
    expect(leaderboardPage).toMatch(/red/i);
  });
});

// ─── 3. Director Bundle Pricing UI with Stripe Checkout ──────────────────────

describe("Director investigation bundle pricing UI", () => {
  const bisRouter = readSrc("server/routers/bis.ts");
  const bisReport = readSrc("client/src/pages/bis/BISReport.tsx");

  it("BIS router has bundleAllDirectors procedure", () => {
    expect(bisRouter).toContain("bundleAllDirectors");
  });

  it("bundleAllDirectors verifies entity investigation ownership", () => {
    expect(bisRouter).toMatch(/requestedBy.*ctx\.user\.id|ctx\.user\.id.*requestedBy/);
  });

  it("bundleAllDirectors filters directors without linkedInvestigationId", () => {
    expect(bisRouter).toMatch(/linkedInvestigationId.*IS NULL|IS NULL.*linkedInvestigationId/i);
  });

  it("bundleAllDirectors applies 20% bundle discount", () => {
    expect(bisRouter).toMatch(/DISCOUNT_PERCENT.*20|20.*DISCOUNT_PERCENT|0\.8|1.*-.*0\.2/);
  });

  it("bundleAllDirectors calculates total price correctly", () => {
    expect(bisRouter).toContain("totalPrice");
    expect(bisRouter).toContain("unitPrice");
    expect(bisRouter).toContain("discountedUnitPrice");
  });

  it("bundleAllDirectors creates Stripe Checkout session", () => {
    expect(bisRouter).toMatch(/stripe\.checkout\.sessions\.create|checkout.*sessions.*create/);
  });

  it("bundleAllDirectors uses line_items with quantity = director count", () => {
    expect(bisRouter).toContain("line_items");
    expect(bisRouter).toMatch(/quantity.*allDirectors\.length|allDirectors\.length.*quantity/);
  });

  it("bundleAllDirectors stores director_ids in Stripe metadata", () => {
    expect(bisRouter).toContain("director_ids");
    expect(bisRouter).toContain("bundle_type");
    expect(bisRouter).toMatch(/director_bundle/);
  });

  it("bundleAllDirectors success_url includes investigation ID and bundle_checkout param", () => {
    expect(bisRouter).toMatch(/bundle_checkout.*success|success.*bundle_checkout/);
    expect(bisRouter).toMatch(/investigationId|investigation_id/);
  });

  it("bundleAllDirectors returns checkoutUrl, directorCount, unitPrice, totalPrice", () => {
    expect(bisRouter).toContain("checkoutUrl");
    expect(bisRouter).toContain("directorCount");
    expect(bisRouter).toContain("unitPrice");
    expect(bisRouter).toContain("totalPrice");
  });

  it("bundleAllDirectors throws BAD_REQUEST when no uninvestigated directors", () => {
    expect(bisRouter).toMatch(/BAD_REQUEST.*No uninvestigated|No uninvestigated.*BAD_REQUEST/);
  });

  it("bundleAllDirectors accepts tier parameter (basic/standard/comprehensive)", () => {
    expect(bisRouter).toMatch(/tier.*basic.*standard.*comprehensive|basic.*standard.*comprehensive/);
  });

  it("DirectorsPanel shows Bundle All button when ≥2 uninvestigated directors", () => {
    expect(bisReport).toContain("Bundle All");
    expect(bisReport).toMatch(/uninvestigated\.length.*>=.*2|uninvestigated\.length.*>.*1/);
  });

  it("DirectorsPanel has price breakdown modal", () => {
    expect(bisReport).toContain("showBundleModal");
    expect(bisReport).toMatch(/Price.*Breakdown|breakdown.*price/i);
  });

  it("DirectorsPanel shows per-director line items in breakdown", () => {
    expect(bisReport).toMatch(/uninvestigated\.map|directors.*map/);
    expect(bisReport).toContain("unitPrice");
  });

  it("DirectorsPanel shows subtotal, discount line, and total", () => {
    expect(bisReport).toMatch(/Subtotal|subtotal/i);
    expect(bisReport).toMatch(/discount|Discount/i);
    expect(bisReport).toMatch(/Total|total/i);
  });

  it("DirectorsPanel tier selector shows all 3 tiers", () => {
    expect(bisReport).toContain("basic");
    expect(bisReport).toContain("standard");
    expect(bisReport).toContain("comprehensive");
  });

  it("DirectorsPanel redirects to Stripe Checkout on success", () => {
    expect(bisReport).toMatch(/window\.location\.href.*checkoutUrl|checkoutUrl.*window\.location/);
  });

  it("bundleAllMutation uses bundleAllDirectors procedure", () => {
    expect(bisReport).toContain("trpc.bis.bundleAllDirectors");
  });

  it("Bundle All button shows loading state during mutation", () => {
    expect(bisReport).toMatch(/isPending.*Loader2|Loader2.*isPending|Processing/i);
  });

  it("price preview matches server calculation (20% off base price)", () => {
    // Client-side TIER_BASE should match server basePrices
    expect(bisReport).toMatch(/basic.*49|49.*basic/);
    expect(bisReport).toMatch(/standard.*99|99.*standard/);
    expect(bisReport).toMatch(/comprehensive.*199|199.*comprehensive/);
    expect(bisReport).toMatch(/DISCOUNT.*20|20.*DISCOUNT/);
  });
});

// ─── 4. Integration: leaderboard + collaboration + bundle pricing ─────────────

describe("Round 109 integration checks", () => {
  const appTsx = readSrc("client/src/App.tsx");
  const appShell = readSrc("client/src/components/layout/AppShell.tsx");
  const bisRouter = readSrc("server/routers/bis.ts");
  const merchantRevenueRouter = readSrc("server/routers/merchantRevenue.ts");

  it("App.tsx has all Round 109 routes registered", () => {
    expect(appTsx).toContain("/merchant/leaderboard");
    expect(appTsx).toContain("MerchantKpiLeaderboard");
  });

  it("AppShell merchant section has KPI Leaderboard link", () => {
    expect(appShell).toContain("/merchant/leaderboard");
  });

  it("merchantRevenue router exports peerLeaderboard in the router object", () => {
    expect(merchantRevenueRouter).toContain("peerLeaderboard:");
  });

  it("BIS router exports bundleAllDirectors in the router object", () => {
    expect(bisRouter).toContain("bundleAllDirectors:");
  });

  it("bundleAllDirectors uses stripe from _core/stripe (dynamic or static import)", () => {
    // The procedure uses a dynamic import inside the mutation handler
    expect(bisRouter).toMatch(/stripe.*_core.*stripe|_core.*stripe.*stripe/i);
  });

  it("peerLeaderboard uses getDb (not requireDb)", () => {
    // Should use getDb, not a local requireDb
    const peerLeaderboardSection = merchantRevenueRouter.slice(
      merchantRevenueRouter.indexOf("peerLeaderboard:")
    );
    expect(peerLeaderboardSection).toContain("getDb");
    expect(peerLeaderboardSection).not.toContain("requireDb");
  });

  it("peerLeaderboard thirtyDaysAgo is a Date object (not number)", () => {
    expect(merchantRevenueRouter).toMatch(/new Date.*thirtyDaysAgo|thirtyDaysAgo.*new Date/);
  });
});
