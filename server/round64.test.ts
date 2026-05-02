/**
 * Round 64 Tests
 * Covers: PWA manifest, push notification DB schema, role assignment UI logic,
 * and usersAdmin.stats extended role counts.
 */
import { describe, it, expect } from "vitest";
import { ROLE_PERMISSIONS } from "../client/src/hooks/useRole";

// ─── PWA manifest ─────────────────────────────────────────────────────────────
describe("PWA manifest", () => {
  it("manifest.webmanifest should exist in client/public", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const manifestPath = path.resolve(
      __dirname,
      "../client/public/manifest.json"
    );
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it("manifest should have required PWA fields", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const manifestPath = path.resolve(
      __dirname,
      "../client/public/manifest.json"
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest).toHaveProperty("name");
    expect(manifest).toHaveProperty("short_name");
    expect(manifest).toHaveProperty("start_url");
    expect(manifest).toHaveProperty("display");
    expect(manifest).toHaveProperty("icons");
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });
});

// ─── Push notification router ─────────────────────────────────────────────────
describe("push router file", () => {
  it("push.ts router should exist in server/routers", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const routerPath = path.resolve(__dirname, "routers/push.ts");
    expect(fs.existsSync(routerPath)).toBe(true);
  });

  it("push router should export pushRouter", async () => {
    const { pushRouter } = await import("./routers/push");
    expect(pushRouter).toBeDefined();
    expect(typeof pushRouter).toBe("object");
  });
});

// ─── usePushNotifications hook ────────────────────────────────────────────────
describe("usePushNotifications hook", () => {
  it("hook file should exist", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const hookPath = path.resolve(
      __dirname,
      "../client/src/hooks/usePushNotifications.ts"
    );
    expect(fs.existsSync(hookPath)).toBe(true);
  });
});

// ─── Role assignment — ROLE_META coverage ────────────────────────────────────
describe("UsersManagement role coverage", () => {
  const ALL_ROLES = [
    "user",
    "admin",
    "tourist",
    "merchant",
    "compliance_officer",
    "noc_operator",
    "settlement_officer",
    "bis_analyst",
  ];

  it("ROLE_PERMISSIONS covers all 8 roles", () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_PERMISSIONS).toHaveProperty(role);
    }
  });

  it("each role has at least one permission", () => {
    for (const role of ALL_ROLES) {
      const perms = ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS];
      expect(Array.isArray(perms)).toBe(true);
      expect(perms.length).toBeGreaterThan(0);
    }
  });

  it("admin role uses wildcard permission granting full access", () => {
    const adminPerms = ROLE_PERMISSIONS["admin"];
    // Admin uses "*" wildcard which grants access to everything
    expect(adminPerms).toContain("*");
  });

  it("non-admin roles do not have wildcard permission", () => {
    for (const role of ALL_ROLES.filter((r) => r !== "admin")) {
      const perms = ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS];
      expect(perms).not.toContain("*");
    }
  });
});

// ─── usersAdmin stats extended fields ────────────────────────────────────────
describe("usersAdmin stats extended fields", () => {
  it("usersAdmin router file should include extended role counts", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const routerPath = path.resolve(__dirname, "routers/usersAdmin.ts");
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("tourists");
    expect(content).toContain("merchants");
    expect(content).toContain("complianceOfficers");
    expect(content).toContain("nocOperators");
    expect(content).toContain("settlementOfficers");
    expect(content).toContain("bisAnalysts");
  });
});

// ─── MerchantRevenue push toggle ─────────────────────────────────────────────
describe("MerchantRevenue push toggle", () => {
  it("MerchantRevenue.tsx should import usePushNotifications", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const pagePath = path.resolve(
      __dirname,
      "../client/src/pages/merchant/MerchantRevenue.tsx"
    );
    const content = fs.readFileSync(pagePath, "utf-8");
    expect(content).toContain("usePushNotifications");
    expect(content).toContain("PushToggleButton");
  });
});
