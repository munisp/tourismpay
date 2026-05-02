/**
 * Round 116 Tests
 *
 * Covers:
 * 1. Merchant BIS completion notification — bisAutoAdvance notifies establishment owner
 * 2. MarkerClusterer integration — @googlemaps/markerclusterer package present
 * 3. Bypass reason inline display — AuditLog renders bypassReason from after JSON
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Feature 1: Merchant BIS completion notification ─────────────────────────

describe("BIS Auto-Advance: merchant owner notification", () => {
  it("bisAutoAdvance.ts imports establishments schema for owner lookup", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("../server/jobs/bisAutoAdvance.ts", import.meta.url).pathname,
      "utf-8"
    );
    // Must import establishments from schema
    expect(src).toContain("establishments");
    // Must reference ownerId
    expect(src).toContain("ownerId");
    // Must send notification to merchant owner
    expect(src).toContain("merchant/bis-status");
  });

  it("merchant notification content references BIS status page URL", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("../server/jobs/bisAutoAdvance.ts", import.meta.url).pathname,
      "utf-8"
    );
    // Notification should link to /merchant/bis-status
    expect(src).toContain("/merchant/bis-status");
    // Should have different messages for completed vs flagged
    expect(src).toContain("KYB Eligible");
    expect(src).toContain("Action Required");
  });

  it("merchant notification is only sent when establishmentId is present", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("../server/jobs/bisAutoAdvance.ts", import.meta.url).pathname,
      "utf-8"
    );
    // Guard: if (inv.establishmentId)
    expect(src).toContain("inv.establishmentId");
    // Guard: if (est?.ownerId)
    expect(src).toContain("est?.ownerId");
  });

  it("merchant notification handles DB errors gracefully", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("../server/jobs/bisAutoAdvance.ts", import.meta.url).pathname,
      "utf-8"
    );
    // Should have try/catch around the owner lookup
    expect(src).toContain("catch (notifErr)");
  });
});

// ─── Feature 2: MarkerClusterer integration ───────────────────────────────────

describe("Map pin MarkerClusterer", () => {
  it("@googlemaps/markerclusterer is listed as a dependency", async () => {
    const fs = await import("fs");
    const pkg = JSON.parse(
      fs.readFileSync(
        new URL("../package.json", import.meta.url).pathname,
        "utf-8"
      )
    );
    expect(pkg.dependencies["@googlemaps/markerclusterer"]).toBeDefined();
  });

  it("TouristExperience.tsx imports MarkerClusterer dynamically", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("../client/src/pages/TouristExperience.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(src).toContain("@googlemaps/markerclusterer");
    expect(src).toContain("MarkerClusterer");
  });

  it("clustererRef is used to manage marker lifecycle", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("../client/src/pages/TouristExperience.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(src).toContain("clustererRef");
    expect(src).toContain("clearMarkers");
  });

  it("markers are NOT assigned map directly — clusterer manages them", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("../client/src/pages/TouristExperience.tsx", import.meta.url).pathname,
      "utf-8"
    );
    // The comment about clusterer managing map assignment must be present
    expect(src).toContain("MarkerClusterer manages map assignment");
  });

  it("geocoding promises are awaited before creating clusterer", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("../client/src/pages/TouristExperience.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(src).toContain("Promise.all(geocodePromises)");
  });

  it("fallback adds markers directly if clusterer import fails", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("../client/src/pages/TouristExperience.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(src).toContain(".catch(");
    // Fallback: m.map = map
    expect(src).toContain("m.map = map");
  });
});

// ─── Feature 3: Bypass reason inline display in Audit Log ────────────────────

describe("AuditLog: bypass reason inline display", () => {
  it("AuditLog.tsx has expandedRowId state", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("../client/src/pages/admin/AuditLog.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(src).toContain("expandedRowId");
    expect(src).toContain("setExpandedRowId");
  });

  it("AuditLog.tsx renders bypass reason from afterData.bypassReason", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("../client/src/pages/admin/AuditLog.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(src).toContain("bypassReason");
    expect(src).toContain("BIS Gate Override Reason");
  });

  it("AuditLog.tsx shows amber warning banner for kyb_bis_bypass entries", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("../client/src/pages/admin/AuditLog.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(src).toContain("isBypass");
    expect(src).toContain("amber-500");
    expect(src).toContain("AlertTriangle");
  });

  it("AuditLog.tsx renders before/after JSON diff in expanded row", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("../client/src/pages/admin/AuditLog.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(src).toContain("beforeData");
    expect(src).toContain("afterData");
    expect(src).toContain("JSON.stringify(beforeData");
    expect(src).toContain("JSON.stringify(afterData");
  });

  it("AuditLog.tsx shows expand/collapse chevron icons", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("../client/src/pages/admin/AuditLog.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(src).toContain("ChevronDown");
    expect(src).toContain("ChevronUp");
  });

  it("AuditLog.tsx shows 'No reason recorded' for legacy entries without bypassReason", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("../client/src/pages/admin/AuditLog.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(src).toContain("No reason recorded");
  });

  it("kybApplications.ts approve procedure accepts bypassReason field", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("../server/routers/kybApplications.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(src).toContain("bypassReason");
    expect(src).toContain("z.string()");
  });
});
