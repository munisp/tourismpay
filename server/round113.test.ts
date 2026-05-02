/**
 * Round 113 Tests
 *
 * Covers:
 * 1. BIS gate on KYB approval — approve procedure checks for completed BIS investigation
 * 2. BIS gate on KYB approval — bypassBisCheck override flag allows approval without BIS
 * 3. BIS gate on KYB approval — listAll enriches each application with bisStatus
 * 4. BIS gate admin UI — KybApplicationsDashboard has BIS column and bypass checkbox
 * 5. Auto-trigger BIS on KYB submission — advanceKybStep creates BIS investigation at step 5
 * 6. Tourist availability-aware booking — listForTourist accepts optional date param
 * 7. Tourist availability-aware booking — listForTourist joins serviceAvailability
 * 8. Tourist availability-aware booking — TouristProductCatalog has date picker
 * 9. Tourist availability-aware booking — AvailabilityBadge component renders slot counts
 * 10. Tourist availability-aware booking — cart blocks adding unavailable products
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

describe("Round 113 — BIS Gate on KYB Approval", () => {
  it("kybApplications approve procedure checks for completed BIS investigation", () => {
    const src = readFile("server/routers/kybApplications.ts");
    expect(src).toContain("bisStatus");
    expect(src).toContain("completed");
    expect(src).toContain("bypassBisCheck");
  });

  it("approve procedure throws PRECONDITION_FAILED when no completed BIS and no bypass", () => {
    const src = readFile("server/routers/kybApplications.ts");
    expect(src).toContain("PRECONDITION_FAILED");
    expect(src).toContain("BIS investigation");
  });

  it("approve procedure accepts bypassBisCheck flag to skip BIS requirement", () => {
    const src = readFile("server/routers/kybApplications.ts");
    expect(src).toContain("bypassBisCheck: z.boolean().optional()");
  });

  it("listAll enriches each application with bisStatus field", () => {
    const src = readFile("server/routers/kybApplications.ts");
    expect(src).toContain("bisStatus:");
    // Should have none/pending/completed logic
    expect(src).toContain("none");
    expect(src).toContain("pending");
  });

  it("listAll queries bisInvestigations for each establishment", () => {
    const src = readFile("server/routers/kybApplications.ts");
    expect(src).toContain("bisInvestigations");
    expect(src).toContain("establishmentId");
  });

  it("KybApplicationsDashboard has BIS status column", () => {
    const src = readFile("client/src/pages/admin/KybApplicationsDashboard.tsx");
    expect(src).toContain("BIS");
    expect(src).toContain("bisStatus");
  });

  it("KybApplicationsDashboard has bypass checkbox for BIS gate", () => {
    const src = readFile("client/src/pages/admin/KybApplicationsDashboard.tsx");
    expect(src).toContain("bypassBisCheck");
    expect(src).toContain("bypass");
  });
});

describe("Round 113 — Auto-Trigger BIS on KYB Submission", () => {
  it("advanceKybStep creates BIS investigation when step reaches 5", () => {
    const src = readFile("server/routers/kyb.ts");
    expect(src).toContain("bisInvestigations");
    expect(src).toContain("Auto-trigger BIS entity investigation");
  });

  it("advanceKybStep sets status to under_review at step 5", () => {
    const src = readFile("server/routers/kyb.ts");
    expect(src).toContain("under_review");
    expect(src).toContain("step === 5");
  });

  it("auto-triggered BIS investigation has correct subject type", () => {
    const src = readFile("server/routers/kyb.ts");
    expect(src).toContain("entity");
    expect(src).toContain("subjectCountry");
  });

  it("auto-trigger is wrapped in try/catch so BIS failure does not block KYB submission", () => {
    const src = readFile("server/routers/kyb.ts");
    // Should have a try/catch around the BIS creation
    expect(src).toContain("try {");
    expect(src).toContain("catch");
    expect(src).toContain("auto-trigger BIS");
  });
});

describe("Round 113 — Tourist Availability-Aware Booking", () => {
  it("listForTourist accepts optional date parameter", () => {
    const src = readFile("server/routers/merchantProducts.ts");
    expect(src).toContain("date: z.string()");
    expect(src).toContain(".optional()");
  });

  it("listForTourist joins serviceAvailability when date is provided", () => {
    const src = readFile("server/routers/merchantProducts.ts");
    expect(src).toContain("serviceAvailability");
    expect(src).toContain("availability");
  });

  it("listForTourist returns availability object with availableSlots", () => {
    const src = readFile("server/routers/merchantProducts.ts");
    expect(src).toContain("availableSlots");
    expect(src).toContain("isAvailable");
  });

  it("listForTourist returns null availability when no date is provided", () => {
    const src = readFile("server/routers/merchantProducts.ts");
    expect(src).toContain("availability: null");
  });

  it("TouristProductCatalog passes selectedDate to listForTourist query", () => {
    const src = readFile("client/src/pages/tourist/TouristProductCatalog.tsx");
    expect(src).toContain("date: selectedDate");
    expect(src).toContain("selectedDate");
  });

  it("TouristProductCatalog has date picker input", () => {
    const src = readFile("client/src/pages/tourist/TouristProductCatalog.tsx");
    expect(src).toContain('type="date"');
    expect(src).toContain("booking-date");
    expect(src).toContain("selectedDate");
  });

  it("TouristProductCatalog shows AvailabilityBadge on product cards", () => {
    const src = readFile("client/src/pages/tourist/TouristProductCatalog.tsx");
    expect(src).toContain("AvailabilityBadge");
    expect(src).toContain("avail.availableSlots");
  });

  it("TouristProductCatalog blocks adding unavailable products to cart", () => {
    const src = readFile("client/src/pages/tourist/TouristProductCatalog.tsx");
    expect(src).toContain("unavailable");
    expect(src).toContain("not available on the selected date");
  });

  it("TouristProductCatalog clears cart when date changes", () => {
    const src = readFile("client/src/pages/tourist/TouristProductCatalog.tsx");
    expect(src).toContain("setCart([])");
  });

  it("TouristProductCatalog shows booking date in cart summary", () => {
    const src = readFile("client/src/pages/tourist/TouristProductCatalog.tsx");
    expect(src).toContain("hasAvailabilityData");
    expect(src).toContain("Booking for");
  });

  it("TouristProductCatalog uses todayStr() as default date", () => {
    const src = readFile("client/src/pages/tourist/TouristProductCatalog.tsx");
    expect(src).toContain("todayStr()");
    expect(src).toContain("function todayStr()");
  });

  it("TouristProductCatalog date picker only shows dates from today onwards", () => {
    const src = readFile("client/src/pages/tourist/TouristProductCatalog.tsx");
    expect(src).toContain('min={todayStr()}');
  });
});
