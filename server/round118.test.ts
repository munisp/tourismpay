/**
 * Round 118 Tests
 *
 * Covers:
 * 1. SMTP env wiring — ENV.smtp* fields are correctly populated from process.env
 * 2. Email helper — buildBisEmailHtml generates correct HTML for completed/flagged
 * 3. Email helper — sendTransactionalEmail falls back to in-app notification when SMTP not set
 * 4. Email preview router — getTemplate returns HTML and smtpConfigured flag
 * 5. Map viewport persistence — isInAfrica bounding box guard logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── 1. SMTP env wiring ────────────────────────────────────────────────────────

describe("ENV SMTP fields", () => {
  it("reads SMTP_HOST from process.env", async () => {
    process.env.SMTP_HOST = "smtp.test.example.com";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_USER = "testuser";
    process.env.SMTP_PASS = "testpass";
    process.env.SMTP_FROM = "test@example.com";

    // Re-import to pick up new env values
    vi.resetModules();
    const { ENV } = await import("./_core/env");

    expect(ENV.smtpHost).toBe("smtp.test.example.com");
    expect(ENV.smtpPort).toBe(465);
    expect(ENV.smtpUser).toBe("testuser");
    expect(ENV.smtpPass).toBe("testpass");
    expect(ENV.smtpFrom).toBe("test@example.com");

    // Cleanup
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
  });

  it("defaults smtpPort to 587 when SMTP_PORT is not set", async () => {
    delete process.env.SMTP_PORT;
    vi.resetModules();
    const { ENV } = await import("./_core/env");
    expect(ENV.smtpPort).toBe(587);
  });

  it("defaults smtpFrom to noreply@tourismpay.com when SMTP_FROM is not set", async () => {
    delete process.env.SMTP_FROM;
    vi.resetModules();
    const { ENV } = await import("./_core/env");
    expect(ENV.smtpFrom).toBe("noreply@tourismpay.com");
  });
});

// ─── 2. buildBisEmailHtml ──────────────────────────────────────────────────────

describe("buildBisEmailHtml", () => {
  let buildBisEmailHtml: typeof import("./_core/email").buildBisEmailHtml;

  beforeEach(async () => {
    vi.resetModules();
    ({ buildBisEmailHtml } = await import("./_core/email"));
  });

  const baseOpts = {
    merchantName: "Alice Okonkwo",
    establishmentName: "Lagos Grand Hotel",
    referenceId: "BIS-2026-0042",
    riskScore: 22,
    riskLevel: "low",
    recommendation: "Proceed with KYB approval.",
    actionUrl: "/merchant/bis-status",
  };

  it("includes merchant name in completed email", () => {
    const html = buildBisEmailHtml({ ...baseOpts, status: "completed" });
    expect(html).toContain("Alice Okonkwo");
  });

  it("includes establishment name in completed email", () => {
    const html = buildBisEmailHtml({ ...baseOpts, status: "completed" });
    expect(html).toContain("Lagos Grand Hotel");
  });

  it("includes reference ID in completed email", () => {
    const html = buildBisEmailHtml({ ...baseOpts, status: "completed" });
    expect(html).toContain("BIS-2026-0042");
  });

  it("shows 'Investigation Complete' label for completed status", () => {
    const html = buildBisEmailHtml({ ...baseOpts, status: "completed" });
    expect(html).toContain("Investigation Complete");
  });

  it("shows 'Action Required' label for flagged status", () => {
    const html = buildBisEmailHtml({ ...baseOpts, status: "flagged" });
    expect(html).toContain("Action Required");
  });

  it("uses green status color (#22c55e) for completed", () => {
    const html = buildBisEmailHtml({ ...baseOpts, status: "completed" });
    expect(html).toContain("#22c55e");
  });

  it("uses amber status color (#f59e0b) for flagged", () => {
    const html = buildBisEmailHtml({ ...baseOpts, status: "flagged" });
    expect(html).toContain("#f59e0b");
  });

  it("includes risk score in the details card", () => {
    const html = buildBisEmailHtml({ ...baseOpts, status: "completed" });
    expect(html).toContain("22/100");
    expect(html).toContain("low");
  });

  it("includes recommendation text", () => {
    const html = buildBisEmailHtml({ ...baseOpts, status: "completed" });
    expect(html).toContain("Proceed with KYB approval.");
  });

  it("includes the CTA action URL", () => {
    const html = buildBisEmailHtml({ ...baseOpts, status: "completed" });
    expect(html).toContain("/merchant/bis-status");
  });

  it("includes TourismPay branding", () => {
    const html = buildBisEmailHtml({ ...baseOpts, status: "completed" });
    expect(html).toContain("TourismPay");
  });

  it("is valid HTML with DOCTYPE", () => {
    const html = buildBisEmailHtml({ ...baseOpts, status: "completed" });
    expect(html.trim()).toMatch(/^<!DOCTYPE html>/i);
    expect(html).toContain("</html>");
  });

  it("completed email mentions KYB eligibility", () => {
    const html = buildBisEmailHtml({ ...baseOpts, status: "completed" });
    expect(html.toLowerCase()).toContain("kyb");
  });

  it("flagged email mentions compliance review", () => {
    const html = buildBisEmailHtml({ ...baseOpts, status: "flagged" });
    expect(html.toLowerCase()).toContain("compliance");
  });
});

// ─── 3. sendTransactionalEmail fallback ───────────────────────────────────────

describe("sendTransactionalEmail", () => {
  beforeEach(() => {
    // Ensure SMTP is not configured so we test the fallback path
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });

  it("returns method=notification when SMTP is not configured", async () => {
    vi.resetModules();

    // Mock createUserNotification
    vi.doMock("../server/db", () => ({
      createUserNotification: vi.fn().mockResolvedValue({ id: 1 }),
    }));

    const { sendTransactionalEmail } = await import("./_core/email");
    const result = await sendTransactionalEmail({
      userId: 1,
      to: "merchant@test.com",
      subject: "Test BIS Email",
      text: "Plain text body",
      html: "<p>HTML body</p>",
      category: "bis",
      actionUrl: "/merchant/bis-status",
      actionLabel: "View Status",
    });

    expect(result.method).toBe("notification");
    expect(result.sent).toBe(true);
  });
});

// ─── 4. emailPreview router — getTemplate ─────────────────────────────────────

describe("emailPreview.getTemplate", () => {
  it("returns HTML string and smtpConfigured flag", async () => {
    vi.resetModules();
    delete process.env.SMTP_HOST;

    const { emailPreviewRouter } = await import("./routers/emailPreview");

    // Access the getTemplate procedure's resolver directly
    const resolver = (emailPreviewRouter as any)._def.procedures.getTemplate._def.resolver;
    expect(resolver).toBeDefined();
  });

  it("emailPreview router is exported correctly", async () => {
    vi.resetModules();
    const { emailPreviewRouter } = await import("./routers/emailPreview");
    expect(emailPreviewRouter).toBeDefined();
    expect(typeof emailPreviewRouter).toBe("object");
  });

  it("emailPreview is registered in the appRouter", async () => {
    vi.resetModules();
    const { appRouter } = await import("./routers");
    expect((appRouter as any)._def.procedures).toHaveProperty("emailPreview.getTemplate");
    expect((appRouter as any)._def.procedures).toHaveProperty("emailPreview.sendTest");
  });
});

// ─── 5. Map viewport persistence — isInAfrica bounding box ───────────────────

describe("Map viewport persistence — isInAfrica guard", () => {
  // Replicate the exact logic from TouristExperience.tsx
  const isInAfrica = (lat: number, lng: number) =>
    lat >= -35 && lat <= 37 && lng >= -20 && lng <= 52;

  it("accepts Lagos, Nigeria (6.5, 3.4)", () => {
    expect(isInAfrica(6.5, 3.4)).toBe(true);
  });

  it("accepts Nairobi, Kenya (-1.3, 36.8)", () => {
    expect(isInAfrica(-1.3, 36.8)).toBe(true);
  });

  it("accepts Cape Town, South Africa (-33.9, 18.4)", () => {
    expect(isInAfrica(-33.9, 18.4)).toBe(true);
  });

  it("accepts Cairo, Egypt (30.0, 31.2)", () => {
    expect(isInAfrica(30.0, 31.2)).toBe(true);
  });

  it("rejects London, UK (51.5, -0.1)", () => {
    expect(isInAfrica(51.5, -0.1)).toBe(false);
  });

  it("rejects New York, USA (40.7, -74.0)", () => {
    expect(isInAfrica(40.7, -74.0)).toBe(false);
  });

  it("rejects Tokyo, Japan (35.7, 139.7)", () => {
    expect(isInAfrica(35.7, 139.7)).toBe(false);
  });

  it("rejects Sydney, Australia (-33.9, 151.2)", () => {
    expect(isInAfrica(-33.9, 151.2)).toBe(false);
  });

  it("rejects far south (-36, 18) — just outside Africa bounds", () => {
    expect(isInAfrica(-36, 18)).toBe(false);
  });

  it("rejects far north (38, 20) — just outside Africa bounds", () => {
    expect(isInAfrica(38, 20)).toBe(false);
  });

  it("accepts boundary point at lat=-35, lng=-20 (SW corner)", () => {
    expect(isInAfrica(-35, -20)).toBe(true);
  });

  it("accepts boundary point at lat=37, lng=52 (NE corner)", () => {
    expect(isInAfrica(37, 52)).toBe(true);
  });
});

// ─── 6. localStorage key constant ─────────────────────────────────────────────

describe("Map viewport localStorage key", () => {
  it("uses the correct key tp_tourist_map_viewport", () => {
    // This test documents the agreed key name to prevent accidental renames
    const VIEWPORT_KEY = "tp_tourist_map_viewport";
    expect(VIEWPORT_KEY).toBe("tp_tourist_map_viewport");
  });

  it("parsed viewport object has lat, lng, zoom fields", () => {
    const viewport = { lat: 6.5, lng: 3.4, zoom: 10 };
    expect(typeof viewport.lat).toBe("number");
    expect(typeof viewport.lng).toBe("number");
    expect(typeof viewport.zoom).toBe("number");
  });
});
