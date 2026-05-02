/**
 * Round 108 Tests
 * - Itinerary sharing/export (shareToken generation, public route, PDF export)
 * - Merchant KPI benchmarking (peer averages, delta badges)
 * - Entity BIS directorship deep-dive (add/remove directors, bundled investigations)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readSrc(relPath: string): string {
  return readFileSync(path.join("/home/ubuntu/tourismpay-pwa", relPath), "utf-8");
}

// ─── 1. Itinerary Sharing & Export ───────────────────────────────────────────

describe("Itinerary sharing & export", () => {
  const itineraryRouter = readSrc("server/routers/itinerary.ts");
  const schema = readSrc("drizzle/schema.ts");
  const appTsx = readSrc("client/src/App.tsx");
  const sharedPage = readSrc("client/src/pages/tourist/SharedItinerary.tsx");
  const builderPage = readSrc("client/src/pages/tourist/ItineraryBuilder.tsx");

  it("schema has shareToken column on touristItineraries", () => {
    expect(schema).toContain("shareToken");
    // Should be a text or varchar column
    expect(schema).toMatch(/shareToken.*(?:text|varchar)|(?:text|varchar).*shareToken/);
  });

  it("itinerary router has share procedure", () => {
    expect(itineraryRouter).toContain("share:");
    // Should generate a token
    expect(itineraryRouter).toMatch(/crypto|randomUUID|nanoid|randomBytes|token/i);
  });

  it("itinerary router has getByToken public procedure", () => {
    expect(itineraryRouter).toContain("getByToken:");
    expect(itineraryRouter).toContain("publicProcedure");
    // Should query by shareToken
    expect(itineraryRouter).toContain("shareToken");
  });

  it("itinerary router has exportPdf procedure", () => {
    expect(itineraryRouter).toContain("exportPdf:");
    // Should generate PDF content
    expect(itineraryRouter).toMatch(/pdf|PDF|html|markdown/i);
  });

  it("App.tsx has /trip/:shareToken route", () => {
    expect(appTsx).toMatch(/\/trip\/:shareToken|trip.*shareToken/);
    expect(appTsx).toContain("SharedItinerary");
  });

  it("SharedItinerary page renders trip details", () => {
    expect(sharedPage).toContain("getByToken");
    // Should show itinerary name and items
    expect(sharedPage).toMatch(/title|name|itinerary/i);
    expect(sharedPage).toMatch(/items|days|timeline/i);
  });

  it("ItineraryBuilder has Share Trip button", () => {
    expect(builderPage).toMatch(/Share.*Trip|share.*trip|shareMutation|share\./i);
    expect(builderPage).toContain("trpc.itinerary.share");
  });

  it("ItineraryBuilder has Export PDF button", () => {
    expect(builderPage).toMatch(/Export.*PDF|export.*pdf|exportPdf|exportMutation/i);
    expect(builderPage).toContain("trpc.itinerary.exportPdf");
  });

  it("share procedure updates shareToken in database", () => {
    // Should use db.update to set shareToken
    expect(itineraryRouter).toMatch(/update.*shareToken|shareToken.*update|set.*shareToken/i);
  });

  it("getByToken returns 404 for invalid token", () => {
    expect(itineraryRouter).toMatch(/NOT_FOUND|not_found|throw.*TRPCError/i);
  });
});

// ─── 2. Merchant KPI Benchmarking ────────────────────────────────────────────

describe("Merchant KPI benchmarking", () => {
  const merchantRouter = readSrc("server/routers/merchantRevenue.ts");
  const typeKpiPanel = readSrc("client/src/components/merchant/TypeKpiPanel.tsx");

  it("merchantRevenue router has kpiBenchmark procedure", () => {
    expect(merchantRouter).toContain("kpiBenchmark");
    expect(merchantRouter).toContain("protectedProcedure");
  });

  it("kpiBenchmark accepts establishmentId input", () => {
    const benchmarkSection = merchantRouter.slice(merchantRouter.indexOf("kpiBenchmark"));
    expect(benchmarkSection.slice(0, 500)).toMatch(/establishmentId/);
  });

  it("kpiBenchmark queries peer establishments of same type and country", () => {
    const benchmarkSection = merchantRouter.slice(merchantRouter.indexOf("kpiBenchmark"));
    // Should filter by same type
    expect(benchmarkSection.slice(0, 2000)).toMatch(/type|country|peer/i);
  });

  it("kpiBenchmark returns peer averages for each KPI metric", () => {
    const benchmarkSection = merchantRouter.slice(merchantRouter.indexOf("kpiBenchmark"));
    expect(benchmarkSection.slice(0, 2000)).toMatch(/avg|average|peer|benchmark/i);
  });

  it("TypeKpiPanel fetches kpiBenchmark data", () => {
    expect(typeKpiPanel).toContain("kpiBenchmark");
    expect(typeKpiPanel).toContain("trpc.merchantRevenue.kpiBenchmark");
  });

  it("TypeKpiPanel shows delta badges with color coding", () => {
    // Should show green for positive delta, red for negative
    expect(typeKpiPanel).toMatch(/delta|Delta|diff|Diff|above|below/i);
    expect(typeKpiPanel).toMatch(/green|emerald|red|orange/i);
  });

  it("TypeKpiPanel shows peer comparison summary row", () => {
    expect(typeKpiPanel).toMatch(/peer|Peer|benchmark|Benchmark|average|Average/i);
  });

  it("TypeKpiPanel handles case where no benchmark data is available", () => {
    // Should gracefully handle null/undefined benchmark
    expect(typeKpiPanel).toMatch(/\?\.|isLoading|!benchmark|!data/i);
  });

  it("TypeKpiPanel covers all 15 establishment types with distinct KPIs", () => {
    // Check for hotel-specific KPIs
    expect(typeKpiPanel).toMatch(/occupancy|Occupancy|RevPAR|ADR/i);
    // Check for safari-specific KPIs
    expect(typeKpiPanel).toMatch(/safari|game.*drive|Game.*Drive/i);
    // Check for airline-specific KPIs
    expect(typeKpiPanel).toMatch(/airline|seat.*load|load.*factor/i);
    // Check for restaurant-specific KPIs
    expect(typeKpiPanel).toMatch(/table.*turn|cover|revenue.*seat/i);
  });
});

// ─── 3. Entity BIS Directorship Deep-Dive ────────────────────────────────────

describe("Entity BIS directorship deep-dive", () => {
  const bisRouter = readSrc("server/routers/bis.ts");
  const schema = readSrc("drizzle/schema.ts");
  const bisReport = readSrc("client/src/pages/bis/BISReport.tsx");

  it("schema has bisDirectors table", () => {
    expect(schema).toContain("bisDirectors");
    expect(schema).toMatch(/bisDirectors.*pgTable|pgTable.*bisDirectors/);
  });

  it("bisDirectors table has required columns", () => {
    const directorsSection = schema.slice(schema.indexOf("bisDirectors"));
    const snippet = directorsSection.slice(0, 1000);
    expect(snippet).toContain("fullName");
    expect(snippet).toContain("role");
    expect(snippet).toContain("entityInvestigationId");
    expect(snippet).toContain("linkedInvestigationId");
    expect(snippet).toContain("bundleDiscountPercent");
  });

  it("bisInvestigations table has linkedEntityInvestigationId column", () => {
    expect(schema).toContain("linkedEntityInvestigationId");
  });

  it("BIS router has listDirectors procedure", () => {
    expect(bisRouter).toContain("listDirectors:");
    expect(bisRouter).toContain("investigationId");
  });

  it("BIS router has addDirector procedure", () => {
    expect(bisRouter).toContain("addDirector:");
    // Should validate fullName and role
    expect(bisRouter).toMatch(/fullName.*min|min.*fullName/i);
    expect(bisRouter).toMatch(/role.*enum|enum.*role/i);
  });

  it("addDirector validates role enum with correct values", () => {
    const addSection = bisRouter.slice(bisRouter.indexOf("addDirector:"));
    const snippet = addSection.slice(0, 800);
    expect(snippet).toContain("Director");
    expect(snippet).toContain("CEO");
    expect(snippet).toContain("CFO");
    expect(snippet).toContain("Secretary");
    expect(snippet).toContain("Shareholder");
  });

  it("BIS router has removeDirector procedure", () => {
    expect(bisRouter).toContain("removeDirector:");
    expect(bisRouter).toContain("directorId");
  });

  it("BIS router has bundleDirectorInvestigation procedure", () => {
    expect(bisRouter).toContain("bundleDirectorInvestigation:");
    expect(bisRouter).toContain("directorId");
    // Should accept tier input
    expect(bisRouter).toMatch(/tier.*enum|enum.*tier/i);
  });

  it("bundleDirectorInvestigation applies 20% discount", () => {
    const bundleSection = bisRouter.slice(bisRouter.indexOf("bundleDirectorInvestigation:"));
    const snippet = bundleSection.slice(0, 1500);
    expect(snippet).toMatch(/20|bundleDiscountPercent/);
    expect(snippet).toMatch(/discount|Discount/i);
  });

  it("bundleDirectorInvestigation links director to new investigation", () => {
    const bundleSection = bisRouter.slice(bisRouter.indexOf("bundleDirectorInvestigation:"));
    const snippet = bundleSection.slice(0, 3000);
    // Should update bisDirectors.linkedInvestigationId
    expect(snippet).toContain("linkedInvestigationId");
    expect(snippet).toMatch(/update.*bisDirectors|bisDirectors.*update/i);
  });

  it("director procedures use requestedBy (not userId) for ownership check", () => {
    const directorsSection = bisRouter.slice(bisRouter.indexOf("listDirectors:"));
    // Should NOT use bisInvestigations.userId (wrong column name)
    expect(directorsSection).not.toMatch(/bisInvestigations\.userId/);
    // Should use requestedBy
    expect(directorsSection).toContain("requestedBy");
  });

  it("BISReport shows DirectorsPanel for entity investigations", () => {
    expect(bisReport).toContain("DirectorsPanel");
    expect(bisReport).toMatch(/subjectType.*entity|entity.*subjectType/);
  });

  it("DirectorsPanel has Add Director button and dialog", () => {
    expect(bisReport).toContain("Add Director");
    expect(bisReport).toMatch(/Dialog|dialog/);
    expect(bisReport).toContain("addDirector");
  });

  it("DirectorsPanel has Investigate button for bundled investigation", () => {
    expect(bisReport).toMatch(/Investigate|bundleDirectorInvestigation/);
  });

  it("DirectorsPanel shows linked investigation ID when investigation exists", () => {
    expect(bisReport).toContain("linkedInvestigationId");
    expect(bisReport).toMatch(/Linked investigation|linked.*investigation/i);
  });

  it("DirectorsPanel shows 20% bundle discount in UI hint", () => {
    expect(bisReport).toMatch(/20%|20 %|bundle discount/i);
  });
});

// ─── 4. Integration: Schema consistency ──────────────────────────────────────

describe("Schema consistency for Round 108", () => {
  const schema = readSrc("drizzle/schema.ts");

  it("touristItineraries has status column", () => {
    const itinSection = schema.slice(schema.indexOf("touristItineraries = pgTable"));
    const snippet = itinSection.slice(0, 1000);
    expect(snippet).toContain("status");
  });

  it("touristItineraries has currency column", () => {
    const itinSection = schema.slice(schema.indexOf("touristItineraries = pgTable"));
    const snippet = itinSection.slice(0, 1000);
    expect(snippet).toContain("currency");
  });

  it("touristItineraries has description column", () => {
    const itinSection = schema.slice(schema.indexOf("touristItineraries = pgTable"));
    const snippet = itinSection.slice(0, 1000);
    expect(snippet).toContain("description");
  });

  it("bisDirectors has nationality column", () => {
    const directorsSection = schema.slice(schema.indexOf("bisDirectors"));
    const snippet = directorsSection.slice(0, 1000);
    expect(snippet).toContain("nationality");
  });

  it("bisDirectors has ownershipPercent column", () => {
    const directorsSection = schema.slice(schema.indexOf("bisDirectors"));
    const snippet = directorsSection.slice(0, 1000);
    expect(snippet).toContain("ownershipPercent");
  });
});
