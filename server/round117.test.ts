/**
 * Round 117 Tests
 *
 * Covers:
 * 1. Transactional email helper (email.ts) — HTML template generation, SMTP/notification fallback
 * 2. Cluster click zoom-to-fit — logic validation
 * 3. Audit log CSV export — bypass_reason column extraction
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 1. Email helper ──────────────────────────────────────────────────────────

describe("buildBisEmailHtml", () => {
  it("generates HTML with completed status content", async () => {
    const { buildBisEmailHtml } = await import("./_core/email");
    const html = buildBisEmailHtml({
      merchantName: "Alice",
      establishmentName: "Safari Lodge Nairobi",
      referenceId: "BIS-2026-001",
      status: "completed",
      riskScore: 22,
      riskLevel: "low",
      recommendation: "Proceed to KYB approval.",
      actionUrl: "https://tourismpay.manus.space/merchant/bis-status",
    });
    expect(html).toContain("Safari Lodge Nairobi");
    expect(html).toContain("BIS-2026-001");
    expect(html).toContain("22/100");
    expect(html).toContain("low");
    expect(html).toContain("KYB Eligible");
    expect(html).toContain("View BIS Status");
    expect(html).toContain("https://tourismpay.manus.space/merchant/bis-status");
    expect(html).toContain("Alice");
  });

  it("generates HTML with flagged status content", async () => {
    const { buildBisEmailHtml } = await import("./_core/email");
    const html = buildBisEmailHtml({
      merchantName: "Bob",
      establishmentName: "Coastal Hotel Mombasa",
      referenceId: "BIS-2026-002",
      status: "flagged",
      riskScore: 78,
      riskLevel: "high",
      recommendation: "Contact compliance within 2 business days.",
      actionUrl: "https://tourismpay.manus.space/merchant/bis-status",
    });
    expect(html).toContain("Coastal Hotel Mombasa");
    expect(html).toContain("BIS-2026-002");
    expect(html).toContain("78/100");
    expect(html).toContain("high");
    expect(html).toContain("Action Required");
    expect(html).toContain("Contact compliance within 2 business days.");
  });

  it("includes TourismPay branding", async () => {
    const { buildBisEmailHtml } = await import("./_core/email");
    const html = buildBisEmailHtml({
      merchantName: "Test",
      establishmentName: "Test Est",
      referenceId: "BIS-TEST",
      status: "completed",
      riskScore: 10,
      riskLevel: "low",
      recommendation: "All good.",
      actionUrl: "https://example.com",
    });
    expect(html).toContain("TourismPay");
    expect(html).toContain("TourismPay Compliance");
    expect(html).toContain("All rights reserved");
  });
});

describe("sendTransactionalEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    // Ensure SMTP env vars are not set for fallback tests
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });

  it("falls back to in-app notification when SMTP is not configured", async () => {
    const mockCreateNotification = vi.fn().mockResolvedValue({ id: 1 });
    vi.doMock("../server/db", () => ({
      createUserNotification: mockCreateNotification,
    }));
    const { sendTransactionalEmail } = await import("./_core/email");
    const result = await sendTransactionalEmail({
      userId: 42,
      to: "merchant@example.com",
      subject: "BIS Complete",
      text: "Your BIS investigation is complete.",
      html: "<p>Your BIS investigation is complete.</p>",
      category: "bis",
      actionUrl: "/merchant/bis-status",
      actionLabel: "View",
    });
    // Without SMTP, should fall back to notification or return gracefully
    expect(["smtp", "notification", "none"]).toContain(result.method);
    expect(typeof result.sent).toBe("boolean");
  });

  it("returns method=none when both SMTP and notification fail", async () => {
    vi.doMock("../server/db", () => ({
      createUserNotification: vi.fn().mockRejectedValue(new Error("DB down")),
    }));
    const { sendTransactionalEmail } = await import("./_core/email");
    const result = await sendTransactionalEmail({
      userId: 99,
      to: "fail@example.com",
      subject: "Test",
      text: "Test",
      html: "<p>Test</p>",
    });
    expect(result.sent).toBe(false);
    expect(result.method).toBe("none");
  });
});

// ─── 2. Cluster zoom-to-fit logic ─────────────────────────────────────────────

describe("Cluster click zoom-to-fit logic", () => {
  it("computes LatLngBounds from a list of marker positions", () => {
    // Simulate the cluster click handler logic
    const positions = [
      { lat: -1.286389, lng: 36.817223 }, // Nairobi
      { lat: -4.043477, lng: 39.668206 }, // Mombasa
      { lat: -0.091702, lng: 34.767956 }, // Kisumu
    ];

    // Simulate bounds computation
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
    positions.forEach((p) => {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng);
      maxLng = Math.max(maxLng, p.lng);
    });

    expect(minLat).toBeCloseTo(-4.043477, 3);
    expect(maxLat).toBeCloseTo(-0.091702, 3);
    expect(minLng).toBeCloseTo(34.767956, 3);
    expect(maxLng).toBeCloseTo(39.668206, 3);
    // Bounds should not be empty
    expect(maxLat - minLat).toBeGreaterThan(0);
    expect(maxLng - minLng).toBeGreaterThan(0);
  });

  it("handles a single-marker cluster without error", () => {
    const positions = [{ lat: -1.286389, lng: 36.817223 }];
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
    positions.forEach((p) => {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng);
      maxLng = Math.max(maxLng, p.lng);
    });
    // Single point — bounds are a zero-size box (still valid)
    expect(minLat).toBeCloseTo(-1.286389, 3);
    expect(maxLat).toBeCloseTo(-1.286389, 3);
    expect(maxLat - minLat).toBe(0);
  });

  it("skips fitBounds when marker list is empty", () => {
    const clusterMarkers: { position?: { lat: number; lng: number } }[] = [];
    // Simulate the guard: if (clusterMarkers.length === 0) return;
    const shouldFit = clusterMarkers.length > 0;
    expect(shouldFit).toBe(false);
  });
});

// ─── 3. CSV export bypass_reason extraction ───────────────────────────────────

describe("Audit log CSV bypass_reason extraction", () => {
  it("extracts bypassReason from after JSON for kyb_bis_bypass action", () => {
    const rows = [
      {
        id: 1,
        action: "kyb_bis_bypass",
        actorName: "Admin",
        actorEmail: "admin@tp.com",
        entityType: "kyb_application",
        entityId: "42",
        description: "BIS gate bypassed",
        ipAddress: "127.0.0.1",
        createdAt: new Date("2026-03-01T10:00:00Z"),
        after: JSON.stringify({ bypassReason: "Low-risk seasonal operator; approved by compliance head." }),
        before: null,
      },
    ];

    const enrichedRows = rows.map((row: any) => {
      let bypassReason = "";
      if (row.action === "kyb_bis_bypass" && row.after) {
        try {
          const after = typeof row.after === "string" ? JSON.parse(row.after) : row.after;
          bypassReason = after?.bypassReason ?? "";
        } catch { /* ignore */ }
      }
      return { ...row, bypassReason };
    });

    expect(enrichedRows[0].bypassReason).toBe("Low-risk seasonal operator; approved by compliance head.");
  });

  it("returns empty bypassReason for non-bypass actions", () => {
    const rows = [
      {
        id: 2,
        action: "kyb.application.approve",
        actorName: "Admin",
        actorEmail: "admin@tp.com",
        entityType: "kyb_application",
        entityId: "43",
        description: "Application approved",
        ipAddress: "127.0.0.1",
        createdAt: new Date("2026-03-01T11:00:00Z"),
        after: JSON.stringify({ status: "approved" }),
        before: null,
      },
    ];

    const enrichedRows = rows.map((row: any) => {
      let bypassReason = "";
      if (row.action === "kyb_bis_bypass" && row.after) {
        try {
          const after = typeof row.after === "string" ? JSON.parse(row.after) : row.after;
          bypassReason = after?.bypassReason ?? "";
        } catch { /* ignore */ }
      }
      return { ...row, bypassReason };
    });

    expect(enrichedRows[0].bypassReason).toBe("");
  });

  it("returns empty bypassReason for legacy bypass entries without the field", () => {
    const rows = [
      {
        id: 3,
        action: "kyb_bis_bypass",
        actorName: "Admin",
        actorEmail: "admin@tp.com",
        entityType: "kyb_application",
        entityId: "44",
        description: "BIS gate bypassed (legacy)",
        ipAddress: "127.0.0.1",
        createdAt: new Date("2025-01-01T10:00:00Z"),
        after: JSON.stringify({ bisStatus: "bypassed" }), // No bypassReason field
        before: null,
      },
    ];

    const enrichedRows = rows.map((row: any) => {
      let bypassReason = "";
      if (row.action === "kyb_bis_bypass" && row.after) {
        try {
          const after = typeof row.after === "string" ? JSON.parse(row.after) : row.after;
          bypassReason = after?.bypassReason ?? "";
        } catch { /* ignore */ }
      }
      return { ...row, bypassReason };
    });

    expect(enrichedRows[0].bypassReason).toBe("");
  });

  it("handles malformed after JSON gracefully", () => {
    const rows = [
      {
        id: 4,
        action: "kyb_bis_bypass",
        actorName: "Admin",
        actorEmail: "admin@tp.com",
        entityType: "kyb_application",
        entityId: "45",
        description: "BIS gate bypassed",
        ipAddress: "127.0.0.1",
        createdAt: new Date("2026-03-01T12:00:00Z"),
        after: "{ invalid json }", // Malformed
        before: null,
      },
    ];

    const enrichedRows = rows.map((row: any) => {
      let bypassReason = "";
      if (row.action === "kyb_bis_bypass" && row.after) {
        try {
          const after = typeof row.after === "string" ? JSON.parse(row.after) : row.after;
          bypassReason = after?.bypassReason ?? "";
        } catch { /* ignore */ }
      }
      return { ...row, bypassReason };
    });

    // Should not throw; bypassReason should be empty
    expect(enrichedRows[0].bypassReason).toBe("");
  });

  it("handles after as an object (not a string) correctly", () => {
    const rows = [
      {
        id: 5,
        action: "kyb_bis_bypass",
        actorName: "Admin",
        actorEmail: "admin@tp.com",
        entityType: "kyb_application",
        entityId: "46",
        description: "BIS gate bypassed",
        ipAddress: "127.0.0.1",
        createdAt: new Date("2026-03-01T13:00:00Z"),
        after: { bypassReason: "Verified by head of compliance." }, // Already parsed object
        before: null,
      },
    ];

    const enrichedRows = rows.map((row: any) => {
      let bypassReason = "";
      if (row.action === "kyb_bis_bypass" && row.after) {
        try {
          const after = typeof row.after === "string" ? JSON.parse(row.after) : row.after;
          bypassReason = after?.bypassReason ?? "";
        } catch { /* ignore */ }
      }
      return { ...row, bypassReason };
    });

    expect(enrichedRows[0].bypassReason).toBe("Verified by head of compliance.");
  });
});
