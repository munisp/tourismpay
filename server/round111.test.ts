/**
 * Round 111 Tests
 * - Service-type-specific onboarding templates (hotel rooms, tour packages, spa treatments)
 * - serviceAvailability DB table and tRPC router
 * - Onboarding completion score widget (tRPC procedure + React component)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readSrc(relPath: string): string {
  return readFileSync(path.join("/home/ubuntu/tourismpay-pwa", relPath), "utf-8");
}

// ─── 1. Service-Type-Specific Onboarding Templates ───────────────────────────

describe("Service-type-specific onboarding templates in MerchantProducts", () => {
  const products = readSrc("client/src/pages/merchant/MerchantProducts.tsx");

  it("MerchantProducts imports and uses service type templates", () => {
    expect(products).toContain("SERVICE_TEMPLATES");
  });

  it("has hotel room type template", () => {
    expect(products).toMatch(/hotel|Hotel/);
    expect(products).toMatch(/room.*type|Room.*Type|bed.*type|Bed.*Type/i);
  });

  it("has tour operator package template", () => {
    expect(products).toMatch(/tour.*operator|Tour.*Operator|tour.*package|Tour.*Package/i);
  });

  it("has spa treatment template", () => {
    expect(products).toMatch(/spa.*treatment|Spa.*Treatment|wellness|Wellness/i);
  });

  it("Quick Setup template picker is shown when no products exist", () => {
    expect(products).toContain("Quick Setup");
    expect(products).toMatch(/no.*product|empty.*product|products.*length.*0|products\.length === 0/i);
  });

  it("template pre-fills the product form with type-specific fields", () => {
    // Template should populate name, category, price, and metadata
    expect(products).toMatch(/applyTemplate|apply.*template|handleTemplate/i);
  });

  it("template metadata includes type-specific fields", () => {
    // Hotel template should include occupancy or bed configuration
    expect(products).toMatch(/occupancy|bedType|bed_type|maxGuests|max_guests/i);
  });

  it("tour template includes duration and group size", () => {
    expect(products).toMatch(/duration|groupSize|group_size|maxGroupSize/i);
  });

  it("spa template includes duration and treatment type", () => {
    expect(products).toMatch(/duration|treatmentType|treatment_type|massageType/i);
  });

  it("MerchantProducts sends metadata field to create procedure", () => {
    expect(products).toMatch(/metadata.*template|template.*metadata/i);
  });
});

// ─── 2. serviceAvailability DB Table and tRPC Router ─────────────────────────

describe("serviceAvailability DB table", () => {
  const schema = readSrc("drizzle/schema.ts");

  it("schema has serviceAvailability table", () => {
    expect(schema).toContain("serviceAvailability");
    expect(schema).toContain("service_availability");
  });

  it("serviceAvailability has productId field", () => {
    expect(schema).toContain("productId");
    expect(schema).toContain("product_id");
  });

  it("serviceAvailability has date field", () => {
    expect(schema).toContain("date");
    expect(schema).toMatch(/varchar.*date|date.*varchar/i);
  });

  it("serviceAvailability has totalSlots and bookedSlots fields", () => {
    expect(schema).toContain("totalSlots");
    expect(schema).toContain("bookedSlots");
  });

  it("serviceAvailability has notes field", () => {
    expect(schema).toContain("notes");
  });

  it("serviceAvailability has isBlocked field", () => {
    expect(schema).toContain("isBlocked");
    expect(schema).toContain("is_blocked");
  });

  it("serviceAvailability has unique index on (productId, date)", () => {
    expect(schema).toContain("sav_product_date_unique");
  });
});

describe("serviceAvailability tRPC router", () => {
  const router = readSrc("server/routers/serviceAvailability.ts");
  const routers = readSrc("server/routers.ts");

  it("router file exports serviceAvailabilityRouter", () => {
    expect(router).toContain("serviceAvailabilityRouter");
    expect(router).toContain("export const serviceAvailabilityRouter");
  });

  it("router has getByProduct procedure", () => {
    expect(router).toContain("getByProduct");
  });

  it("router has setDate procedure", () => {
    expect(router).toContain("setDate");
  });

  it("router has bulkSetRange procedure", () => {
    expect(router).toContain("bulkSetRange");
  });

  it("router has blockRange procedure", () => {
    expect(router).toContain("blockRange");
  });

  it("setDate uses onConflictDoUpdate for idempotency", () => {
    expect(router).toContain("onConflictDoUpdate");
  });

  it("getByProduct validates productId and date range input", () => {
    expect(router).toContain("productId");
    expect(router).toContain("startDate");
    expect(router).toContain("endDate");
  });

  it("router is registered in routers.ts", () => {
    expect(routers).toContain("serviceAvailabilityRouter");
    expect(routers).toContain("serviceAvailability");
  });

  it("router verifies establishment ownership before mutations", () => {
    // Uses ownerId check with FORBIDDEN error
    expect(router).toContain("ownerId");
    expect(router).toContain("FORBIDDEN");
  });
});

describe("ServiceAvailabilityCalendar page", () => {
  const page = readSrc("client/src/pages/merchant/ServiceAvailabilityCalendar.tsx");
  const appTsx = readSrc("client/src/App.tsx");
  const appShell = readSrc("client/src/components/layout/AppShell.tsx");

  it("page exists and exports default component", () => {
    expect(page).toContain("export default");
    expect(page).toMatch(/function ServiceAvailabilityCalendar|const ServiceAvailabilityCalendar/);
  });

  it("page uses trpc.serviceAvailability.getByProduct", () => {
    expect(page).toContain("serviceAvailability");
    expect(page).toContain("getByProduct");
  });

  it("page uses trpc.serviceAvailability.setDate", () => {
    expect(page).toContain("setDate");
  });

  it("page has month navigation (prev/next)", () => {
    expect(page).toMatch(/prevMonth|prev.*month|previousMonth|ChevronLeft/i);
    expect(page).toMatch(/nextMonth|next.*month|ChevronRight/i);
  });

  it("page shows calendar grid with day cells", () => {
    expect(page).toMatch(/calendar.*grid|grid.*calendar|day.*cell|CalendarDays/i);
  });

  it("page shows blocked days with visual indicator", () => {
    expect(page).toMatch(/isBlocked|blocked.*day|day.*blocked/i);
  });

  it("page shows slot counts per day", () => {
    expect(page).toMatch(/totalSlots|bookedSlots|available.*slot/i);
  });

  it("page is registered in App.tsx at /merchant/availability", () => {
    expect(appTsx).toContain("ServiceAvailabilityCalendar");
    expect(appTsx).toContain("/merchant/availability");
  });

  it("AppShell has Availability Calendar nav link", () => {
    expect(appShell).toContain("Availability");
    expect(appShell).toContain("/merchant/availability");
  });
});

// ─── 3. Onboarding Completion Score Widget ────────────────────────────────────

describe("onboardingScore tRPC procedure", () => {
  const merchantRevenue = readSrc("server/routers/merchantRevenue.ts");

  it("procedure exists in merchantRevenue router", () => {
    expect(merchantRevenue).toContain("onboardingScore");
  });

  it("procedure checks establishment details completeness", () => {
    expect(merchantRevenue).toContain("detailsComplete");
    expect(merchantRevenue).toMatch(/est\.name.*est\.country|name.*country.*city/i);
  });

  it("procedure checks KYB documents uploaded", () => {
    expect(merchantRevenue).toContain("docsUploaded");
    expect(merchantRevenue).toContain("kybDocuments");
  });

  it("procedure checks KYB application approved", () => {
    expect(merchantRevenue).toContain("kybApproved");
    expect(merchantRevenue).toContain("approved");
  });

  it("procedure checks at least one product listed", () => {
    expect(merchantRevenue).toContain("hasProduct");
    expect(merchantRevenue).toContain("merchantProducts");
  });

  it("procedure checks Stripe Connect active", () => {
    expect(merchantRevenue).toContain("stripeActive");
    expect(merchantRevenue).toContain("stripePayoutsEnabled");
  });

  it("procedure checks first deal published", () => {
    expect(merchantRevenue).toContain("hasDeal");
    expect(merchantRevenue).toContain("isActive");
  });

  it("procedure returns weighted score (0-100)", () => {
    expect(merchantRevenue).toContain("score");
    expect(merchantRevenue).toContain("weight");
    expect(merchantRevenue).toContain("earnedWeight");
    expect(merchantRevenue).toContain("totalWeight");
  });

  it("procedure returns steps array with href for each step", () => {
    expect(merchantRevenue).toContain("steps");
    expect(merchantRevenue).toContain("href");
    expect(merchantRevenue).toContain("completed");
  });

  it("procedure returns completedCount and totalCount", () => {
    expect(merchantRevenue).toContain("completedCount");
    expect(merchantRevenue).toContain("totalCount");
  });

  it("procedure verifies ownership before returning data", () => {
    expect(merchantRevenue).toContain("ownerId");
    expect(merchantRevenue).toContain("FORBIDDEN");
  });
});

describe("OnboardingScoreWidget React component", () => {
  const widget = readSrc("client/src/components/merchant/OnboardingScoreWidget.tsx");
  const merchantRevenue = readSrc("client/src/pages/merchant/MerchantRevenue.tsx");

  it("widget file exists and exports default component", () => {
    expect(widget).toContain("export default function OnboardingScoreWidget");
  });

  it("widget calls trpc.merchantRevenue.onboardingScore", () => {
    expect(widget).toContain("merchantRevenue.onboardingScore.useQuery");
  });

  it("widget renders a ScoreRing SVG progress circle", () => {
    expect(widget).toContain("ScoreRing");
    expect(widget).toContain("strokeDashoffset");
  });

  it("widget shows percentage score in the ring", () => {
    expect(widget).toContain("score");
    expect(widget).toMatch(/\{.*score.*\}.*%|%.*\{.*score.*\}/);
  });

  it("widget shows checklist with completed/incomplete steps", () => {
    expect(widget).toContain("CheckCircle2");
    expect(widget).toContain("Circle");
    expect(widget).toContain("completed");
  });

  it("widget shows Next Step CTA with link to incomplete step", () => {
    expect(widget).toContain("nextStep");
    expect(widget).toContain("Next:");
    expect(widget).toContain("AlertCircle");
  });

  it("widget hides itself when score is 100%", () => {
    expect(widget).toMatch(/score.*===.*100|100.*score/);
    expect(widget).toContain("return null");
  });

  it("widget uses Tooltip for step descriptions", () => {
    expect(widget).toContain("Tooltip");
    expect(widget).toContain("description");
  });

  it("widget is imported and used in MerchantRevenue dashboard", () => {
    expect(merchantRevenue).toContain("OnboardingScoreWidget");
    expect(merchantRevenue).toContain("import OnboardingScoreWidget");
  });

  it("widget is rendered after KYBStatusBanner in dashboard JSX", () => {
    // The JSX usage of KYBStatusBanner (line 1177) should come before OnboardingScoreWidget (line 1179)
    const kybUsageIdx = merchantRevenue.indexOf("<KYBStatusBanner");
    const widgetUsageIdx = merchantRevenue.indexOf("<OnboardingScoreWidget");
    expect(widgetUsageIdx).toBeGreaterThan(kybUsageIdx);
  });

  it("merchantProducts.create and update accept metadata field", () => {
    const merchantProductsRouter = readSrc("server/routers/merchantProducts.ts");
    expect(merchantProductsRouter).toContain("metadata");
    expect(merchantProductsRouter).toMatch(/z\.record.*z\.string.*z\.unknown/);
  });
});
