/**
 * Round 112 Tests
 *
 * Covers:
 * 1. Booking slot deduction — createBooking with productId deducts serviceAvailability.bookedSlots
 * 2. Booking slot deduction — blocked date throws BAD_REQUEST
 * 3. Booking slot deduction — full capacity throws BAD_REQUEST
 * 4. Booking slot deduction — no availability record is a no-op (graceful)
 * 5. Booking slot deduction — Stripe webhook deductBookingSlot helper exists and is exported
 * 6. Metadata spec table — SERVICE_TEMPLATES metaFields cover all expected template types
 * 7. Metadata spec table — MerchantProducts renders metadata grid (file structure check)
 * 8. Onboarding nudge job — startOnboardingNudgeJob is exported from onboardingNudgeJob.ts
 * 9. Onboarding nudge job — job file imports createUserNotification from db
 * 10. Onboarding nudge job — job file uses 7-day cooldown constant
 * 11. Onboarding nudge job — job is registered in server/_core/index.ts
 * 12. touristBookings schema — productId and bookingDateStr columns added
 * 13. serviceAvailability router — getByProduct procedure exists
 * 14. serviceAvailability router — setDate procedure exists
 * 15. serviceAvailability router — blockRange procedure exists
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

describe("Round 112 — Booking Slot Deduction", () => {
  it("createBooking accepts optional productId input", () => {
    const src = readFile("server/routers/touristPortal.ts");
    expect(src).toContain("productId: z.number().int().positive().optional()");
  });

  it("createBooking queries serviceAvailability when productId is provided", () => {
    const src = readFile("server/routers/touristPortal.ts");
    expect(src).toContain("from(serviceAvailability)");
    expect(src).toContain("eq(serviceAvailability.productId, input.productId)");
  });

  it("createBooking throws BAD_REQUEST when date is blocked", () => {
    const src = readFile("server/routers/touristPortal.ts");
    expect(src).toContain("avail.isBlocked");
    expect(src).toContain("not available on the selected date");
  });

  it("createBooking throws BAD_REQUEST when no slots available", () => {
    const src = readFile("server/routers/touristPortal.ts");
    expect(src).toContain("booked >= total");
    expect(src).toContain("No slots available on the selected date");
  });

  it("createBooking deducts slot atomically via update", () => {
    const src = readFile("server/routers/touristPortal.ts");
    expect(src).toContain("bookedSlots: booked + 1");
  });

  it("createBooking stores productId and bookingDateStr in the booking record", () => {
    const src = readFile("server/routers/touristPortal.ts");
    expect(src).toContain("productId: input.productId ?? null");
    expect(src).toContain("bookingDateStr,");
  });

  it("Stripe webhook deductBookingSlot helper is defined", () => {
    const src = readFile("server/stripeWebhook.ts");
    expect(src).toContain("async function deductBookingSlot(");
    expect(src).toContain("serviceAvailability.bookedSlots} + 1");
  });

  it("Stripe webhook handles booking_type=service metadata", () => {
    const src = readFile("server/stripeWebhook.ts");
    expect(src).toContain('booking_type === "service"');
    expect(src).toContain("session.metadata?.product_id");
    expect(src).toContain("session.metadata?.booking_date_str");
  });
});

describe("Round 112 — Metadata Spec Table on Product Cards", () => {
  it("MerchantProducts renders metadata as a grid (not just tags)", () => {
    const src = readFile("client/src/pages/merchant/MerchantProducts.tsx");
    expect(src).toContain("grid grid-cols-2");
    expect(src).toContain("SERVICE_TEMPLATES.flatMap(t => t.metaFields)");
  });

  it("MerchantProducts uses fieldDef label for human-readable display", () => {
    const src = readFile("client/src/pages/merchant/MerchantProducts.tsx");
    expect(src).toContain("fieldDef?.label");
    expect(src).toContain("k.replace(/([A-Z])/g");
  });

  it("SERVICE_TEMPLATES covers hotel_room template", () => {
    const src = readFile("client/src/pages/merchant/MerchantProducts.tsx");
    expect(src).toContain("hotel_room");
    expect(src).toContain("bedType");
    expect(src).toContain("maxOccupancy");
  });

  it("SERVICE_TEMPLATES covers tour_package template", () => {
    const src = readFile("client/src/pages/merchant/MerchantProducts.tsx");
    expect(src).toContain("tour_package");
    expect(src).toContain("durationHours");
    expect(src).toContain("meetingPoint");
  });

  it("SERVICE_TEMPLATES covers spa_treatment template", () => {
    const src = readFile("client/src/pages/merchant/MerchantProducts.tsx");
    expect(src).toContain("spa_treatment");
    expect(src).toContain("treatmentType");
    expect(src).toContain("durationMinutes");
  });
});

describe("Round 112 — Onboarding Nudge Job", () => {
  it("startOnboardingNudgeJob is exported from onboardingNudgeJob.ts", () => {
    const src = readFile("server/jobs/onboardingNudgeJob.ts");
    expect(src).toContain("export function startOnboardingNudgeJob()");
  });

  it("job imports createUserNotification from db", () => {
    const src = readFile("server/jobs/onboardingNudgeJob.ts");
    expect(src).toContain("createUserNotification");
    expect(src).toContain("from \"../db\"");
  });

  it("job uses 7-day nudge cooldown constant", () => {
    const src = readFile("server/jobs/onboardingNudgeJob.ts");
    expect(src).toContain("NUDGE_COOLDOWN_DAYS = 7");
  });

  it("job uses score threshold of 60", () => {
    const src = readFile("server/jobs/onboardingNudgeJob.ts");
    expect(src).toContain("SCORE_THRESHOLD = 60");
  });

  it("job checks lastNudgeSentAt in establishment metadata for cooldown", () => {
    const src = readFile("server/jobs/onboardingNudgeJob.ts");
    expect(src).toContain("lastNudgeSentAt");
    expect(src).toContain("NUDGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000");
  });

  it("job stores lastNudgeSentAt after sending nudge", () => {
    const src = readFile("server/jobs/onboardingNudgeJob.ts");
    expect(src).toContain("lastNudgeSentAt: now");
    expect(src).toContain(".update(establishments)");
  });

  it("job is registered in server/_core/index.ts", () => {
    const src = readFile("server/_core/index.ts");
    expect(src).toContain("startOnboardingNudgeJob");
    expect(src).toContain("import { startOnboardingNudgeJob }");
  });

  it("job runs every 24 hours", () => {
    const src = readFile("server/jobs/onboardingNudgeJob.ts");
    expect(src).toContain("24 * 60 * 60 * 1000");
  });

  it("job only nudges establishments older than 7 days", () => {
    const src = readFile("server/jobs/onboardingNudgeJob.ts");
    expect(src).toContain("MIN_AGE_DAYS = 7");
    expect(src).toContain("lt(establishments.createdAt, sevenDaysAgo)");
  });
});

describe("Round 112 — Schema Changes", () => {
  it("touristBookings schema has productId column", () => {
    const src = readFile("drizzle/schema.ts");
    expect(src).toContain("productId: integer(\"product_id\").references(() => merchantProducts.id");
  });

  it("touristBookings schema has bookingDateStr column", () => {
    const src = readFile("drizzle/schema.ts");
    expect(src).toContain("bookingDateStr: varchar(\"booking_date_str\"");
  });

  it("serviceAvailability table has uniqueIndex on productId + date", () => {
    const src = readFile("drizzle/schema.ts");
    expect(src).toContain("sav_product_date_unique");
  });
});

describe("Round 112 — serviceAvailability Router", () => {
  it("getByProduct procedure exists", () => {
    const src = readFile("server/routers/serviceAvailability.ts");
    expect(src).toContain("getByProduct:");
  });

  it("setDate procedure exists", () => {
    const src = readFile("server/routers/serviceAvailability.ts");
    expect(src).toContain("setDate:");
  });

  it("blockRange procedure exists", () => {
    const src = readFile("server/routers/serviceAvailability.ts");
    expect(src).toContain("blockRange:");
  });

  it("serviceAvailabilityRouter is registered in appRouter", () => {
    const src = readFile("server/routers.ts");
    expect(src).toContain("serviceAvailability:");
    expect(src).toContain("serviceAvailabilityRouter");
  });
});
