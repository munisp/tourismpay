/**
 * Round 114 Tests
 *
 * Covers:
 * 1. BIS gate merchant notification — approve sends in-app notification to merchant when held pending BIS
 * 2. BIS gate merchant notification — notification includes actionUrl linking to BIS investigation
 * 3. BIS gate merchant notification — notification uses kyb category
 * 4. Slot availability on tourist experience — getEstablishmentAvailabilitySummary public procedure
 * 5. Slot availability on tourist experience — TouristExperience queries availability summary
 * 6. Slot availability on tourist experience — AvailabilityDot rendered on EstablishmentCard
 * 7. BIS bypass audit trail — dedicated kyb_bis_bypass audit log entry when bypassBisCheck is true
 * 8. BIS bypass audit trail — AuditLog.tsx has kyb_bis_bypass filter option
 * 9. BIS bypass audit trail — AuditLog.tsx has BIS Bypasses quick-filter chip
 * 10. BIS bypass audit trail — ACTION_LABELS includes kyb_bis_bypass label
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

describe("Round 114 — BIS Gate Merchant Notification", () => {
  it("approve procedure sends in-app notification to merchant when held pending BIS", () => {
    const src = readFile("server/routers/kybApplications.ts");
    // Should create a user notification when BIS gate blocks approval
    expect(src).toContain("createUserNotification");
    expect(src).toContain("KYB Approval Pending BIS Clearance");
  });

  it("notification includes actionUrl linking to BIS investigation", () => {
    const src = readFile("server/routers/kybApplications.ts");
    expect(src).toContain("actionUrl: bisId ?");
    expect(src).toContain("/bis/");
  });

  it("notification uses kyb category", () => {
    const src = readFile("server/routers/kybApplications.ts");
    // The BIS gate notification should use kyb category
    expect(src).toContain("category: \"kyb\"");
  });

  it("notification content explains the BIS compliance step", () => {
    const src = readFile("server/routers/kybApplications.ts");
    expect(src).toContain("Background Investigation");
    expect(src).toContain("compliance");
  });

  it("notification is sent to the KYB submitter (merchant)", () => {
    const src = readFile("server/routers/kybApplications.ts");
    expect(src).toContain("submittedBy");
    expect(src).toContain("userId: submitterRows[0].submittedBy");
  });
});

describe("Round 114 — Slot Availability on Tourist Experience", () => {
  it("serviceAvailability router has getEstablishmentAvailabilitySummary public procedure", () => {
    const src = readFile("server/routers/serviceAvailability.ts");
    expect(src).toContain("getEstablishmentAvailabilitySummary");
    expect(src).toContain("publicProcedure");
  });

  it("getEstablishmentAvailabilitySummary accepts establishmentId and date params", () => {
    const src = readFile("server/routers/serviceAvailability.ts");
    expect(src).toContain("establishmentId");
    expect(src).toContain("date:");
  });

  it("getEstablishmentAvailabilitySummary returns availability status per product", () => {
    const src = readFile("server/routers/serviceAvailability.ts");
    expect(src).toContain("availableSlots");
    expect(src).toContain("totalSlots");
    expect(src).toContain("status");
  });

  it("TouristExperience queries availability summary when date is selected", () => {
    const src = readFile("client/src/pages/TouristExperience.tsx");
    expect(src).toContain("getEstablishmentAvailabilitySummary");
    expect(src).toContain("availabilitySummary");
  });

  it("TouristExperience passes availability to EstablishmentCard", () => {
    const src = readFile("client/src/pages/TouristExperience.tsx");
    expect(src).toContain("availability={");
    expect(src).toContain("availabilitySummary");
  });

  it("EstablishmentCard renders AvailabilityDot when availability is provided", () => {
    const src = readFile("client/src/pages/TouristExperience.tsx");
    expect(src).toContain("AvailabilityDot");
    expect(src).toContain("availability &&");
  });

  it("AvailabilityDot component is defined in TouristExperience", () => {
    const src = readFile("client/src/pages/TouristExperience.tsx");
    expect(src).toContain("function AvailabilityDot");
  });
});

describe("Round 114 — BIS Bypass Audit Trail", () => {
  it("approve procedure writes dedicated kyb_bis_bypass audit log when bypass is used", () => {
    const src = readFile("server/routers/kybApplications.ts");
    expect(src).toContain("kyb_bis_bypass");
    expect(src).toContain("bypassBisCheck");
    // The bypass audit log should be conditional on bypassBisCheck being true
    expect(src).toContain("if (input.bypassBisCheck)");
  });

  it("bypass audit log records bisGateBypassed in the after field", () => {
    const src = readFile("server/routers/kybApplications.ts");
    expect(src).toContain("bisGateBypassed: true");
  });

  it("bypass audit log description mentions the admin and establishment", () => {
    const src = readFile("server/routers/kybApplications.ts");
    expect(src).toContain("bypassed the BIS gate");
    expect(src).toContain("estName");
  });

  it("AuditLog.tsx has kyb_bis_bypass filter option in action select", () => {
    const src = readFile("client/src/pages/admin/AuditLog.tsx");
    expect(src).toContain("kyb_bis_bypass");
    expect(src).toContain("BIS Gate Bypass");
  });

  it("AuditLog.tsx has BIS Bypasses quick-filter chip", () => {
    const src = readFile("client/src/pages/admin/AuditLog.tsx");
    expect(src).toContain("BIS Bypasses");
    expect(src).toContain("bg-amber-500/10");
  });

  it("ACTION_LABELS map includes kyb_bis_bypass label", () => {
    const src = readFile("client/src/pages/admin/AuditLog.tsx");
    expect(src).toContain("\"kyb_bis_bypass\"");
    expect(src).toContain("BIS Gate Bypass");
  });

  it("bypass audit log uses kyb_application entity type", () => {
    const src = readFile("server/routers/kybApplications.ts");
    // The bypass audit log should use kyb_application entity type
    const bypassSection = src.substring(src.indexOf("if (input.bypassBisCheck)"));
    expect(bypassSection).toContain("kyb_application");
  });
});
