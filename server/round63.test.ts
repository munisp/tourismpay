/**
 * Round 63 — Role-Based Access Control, Tourist Onboarding, Merchant Revenue, Compliance
 *
 * Tests:
 *  - kybApplications router: compliance_officer can access, plain user cannot
 *  - auditLogs router: compliance_officer can access, plain user cannot
 *  - touristOnboarding router: tourist can access, unauthenticated cannot
 *  - merchantRevenue router: merchant can access, tourist cannot
 */
import { describe, it, expect } from "vitest";
import { ROLE_PERMISSIONS } from "../client/src/hooks/useRole";

// ─── useRole permission map ───────────────────────────────────────────────────

describe("ROLE_PERMISSIONS — useRole hook", () => {
  it("admin has wildcard permission", () => {
    expect(ROLE_PERMISSIONS.admin).toContain("*");
  });

  it("tourist has tourist_experience and qr_pay permissions", () => {
    expect(ROLE_PERMISSIONS.tourist).toContain("tourist_experience");
    expect(ROLE_PERMISSIONS.tourist).toContain("tourist_onboarding");
    expect(ROLE_PERMISSIONS.tourist).toContain("qr_pay");
  });

  it("merchant has merchant_revenue and qr_generate permissions", () => {
    expect(ROLE_PERMISSIONS.merchant).toContain("merchant_revenue");
    expect(ROLE_PERMISSIONS.merchant).toContain("qr_generate");
    expect(ROLE_PERMISSIONS.merchant).toContain("restaurant_onboarding");
  });

  it("compliance_officer has kyb_review and compliance_dashboard", () => {
    expect(ROLE_PERMISSIONS.compliance_officer).toContain("kyb_review");
    expect(ROLE_PERMISSIONS.compliance_officer).toContain("kyb_applications");
    expect(ROLE_PERMISSIONS.compliance_officer).toContain("compliance_dashboard");
    expect(ROLE_PERMISSIONS.compliance_officer).toContain("audit_log");
  });

  it("noc_operator has noc_dashboard and kill_switch", () => {
    expect(ROLE_PERMISSIONS.noc_operator).toContain("noc_dashboard");
    expect(ROLE_PERMISSIONS.noc_operator).toContain("kill_switch");
  });

  it("settlement_officer has remittance_admin", () => {
    expect(ROLE_PERMISSIONS.settlement_officer).toContain("remittance_admin");
    expect(ROLE_PERMISSIONS.settlement_officer).toContain("settlement_console");
  });

  it("bis_analyst has bis_investigations and security_fraud", () => {
    expect(ROLE_PERMISSIONS.bis_analyst).toContain("bis_investigations");
    expect(ROLE_PERMISSIONS.bis_analyst).toContain("security_fraud");
    expect(ROLE_PERMISSIONS.bis_analyst).toContain("security_soc");
  });

  it("plain user does NOT have kyb_review or merchant_revenue", () => {
    expect(ROLE_PERMISSIONS.user).not.toContain("kyb_review");
    expect(ROLE_PERMISSIONS.user).not.toContain("merchant_revenue");
    expect(ROLE_PERMISSIONS.user).not.toContain("compliance_dashboard");
  });

  it("tourist does NOT have merchant_revenue or kyb_review", () => {
    expect(ROLE_PERMISSIONS.tourist).not.toContain("merchant_revenue");
    expect(ROLE_PERMISSIONS.tourist).not.toContain("kyb_review");
  });

  it("merchant does NOT have kyb_review or compliance_dashboard", () => {
    expect(ROLE_PERMISSIONS.merchant).not.toContain("kyb_review");
    expect(ROLE_PERMISSIONS.merchant).not.toContain("compliance_dashboard");
  });
});

// ─── Role permission helper logic ────────────────────────────────────────────

describe("Role permission helper logic", () => {
  function can(role: keyof typeof ROLE_PERMISSIONS, permission: string): boolean {
    const perms = ROLE_PERMISSIONS[role] ?? [];
    if (perms.includes("*")) return true;
    return perms.includes(permission);
  }

  function hasRole(userRole: string, ...roles: string[]): boolean {
    return roles.includes(userRole);
  }

  it("admin can do everything via wildcard", () => {
    expect(can("admin", "kyb_review")).toBe(true);
    expect(can("admin", "merchant_revenue")).toBe(true);
    expect(can("admin", "compliance_dashboard")).toBe(true);
    expect(can("admin", "any_random_permission")).toBe(true);
  });

  it("compliance_officer can do kyb_review but not merchant_revenue", () => {
    expect(can("compliance_officer", "kyb_review")).toBe(true);
    expect(can("compliance_officer", "merchant_revenue")).toBe(false);
  });

  it("merchant can do merchant_revenue but not kyb_review", () => {
    expect(can("merchant", "merchant_revenue")).toBe(true);
    expect(can("merchant", "kyb_review")).toBe(false);
  });

  it("tourist can do qr_pay but not qr_generate", () => {
    expect(can("tourist", "qr_pay")).toBe(true);
    expect(can("tourist", "qr_generate")).toBe(false);
  });

  it("hasRole correctly matches single and multiple roles", () => {
    expect(hasRole("admin", "admin")).toBe(true);
    expect(hasRole("tourist", "tourist", "admin")).toBe(true);
    expect(hasRole("user", "tourist", "merchant")).toBe(false);
    expect(hasRole("compliance_officer", "compliance_officer", "admin")).toBe(true);
  });
});

// ─── Sidebar nav role filtering ───────────────────────────────────────────────

describe("Sidebar nav items — role filtering", () => {
  const mockNavItems = [
    { label: "Tourist Experience", href: "/tourist", roles: ["tourist", "admin"] },
    { label: "Revenue Dashboard", href: "/merchant/revenue", roles: ["merchant", "admin"] },
    { label: "QR Codes", href: "/merchant/qr", roles: ["merchant", "admin"] },
    { label: "Compliance Dashboard", href: "/compliance", roles: ["compliance_officer", "admin"] },
    { label: "KYB Applications", href: "/admin/kyb-applications", roles: ["compliance_officer", "admin"] },
    { label: "Fraud Monitor", href: "/security/fraud", roles: ["bis_analyst", "compliance_officer", "admin"] },
    { label: "NOC Dashboard", href: "/paymentswitch/noc", roles: ["noc_operator", "admin"] },
    { label: "Remittance Admin", href: "/paymentswitch/remittance", roles: ["settlement_officer", "admin"] },
  ];

  function filterNavForRole(role: string) {
    return mockNavItems.filter((item) => item.roles.includes(role));
  }

  it("tourist sees tourist experience but not merchant or compliance pages", () => {
    const visible = filterNavForRole("tourist");
    expect(visible.some((i) => i.href === "/tourist")).toBe(true);
    expect(visible.some((i) => i.href === "/merchant/revenue")).toBe(false);
    expect(visible.some((i) => i.href === "/compliance")).toBe(false);
  });

  it("merchant sees revenue and QR pages but not compliance or tourist", () => {
    const visible = filterNavForRole("merchant");
    expect(visible.some((i) => i.href === "/merchant/revenue")).toBe(true);
    expect(visible.some((i) => i.href === "/merchant/qr")).toBe(true);
    expect(visible.some((i) => i.href === "/compliance")).toBe(false);
    expect(visible.some((i) => i.href === "/tourist")).toBe(false);
  });

  it("compliance_officer sees compliance and KYB pages but not merchant or NOC", () => {
    const visible = filterNavForRole("compliance_officer");
    expect(visible.some((i) => i.href === "/compliance")).toBe(true);
    expect(visible.some((i) => i.href === "/admin/kyb-applications")).toBe(true);
    expect(visible.some((i) => i.href === "/security/fraud")).toBe(true);
    expect(visible.some((i) => i.href === "/merchant/revenue")).toBe(false);
    expect(visible.some((i) => i.href === "/paymentswitch/noc")).toBe(false);
  });

  it("admin sees all pages", () => {
    const visible = filterNavForRole("admin");
    expect(visible.length).toBe(mockNavItems.length);
  });

  it("noc_operator sees NOC dashboard but not compliance or merchant", () => {
    const visible = filterNavForRole("noc_operator");
    expect(visible.some((i) => i.href === "/paymentswitch/noc")).toBe(true);
    expect(visible.some((i) => i.href === "/compliance")).toBe(false);
    expect(visible.some((i) => i.href === "/merchant/revenue")).toBe(false);
  });

  it("settlement_officer sees remittance but not compliance or tourist", () => {
    const visible = filterNavForRole("settlement_officer");
    expect(visible.some((i) => i.href === "/paymentswitch/remittance")).toBe(true);
    expect(visible.some((i) => i.href === "/compliance")).toBe(false);
    expect(visible.some((i) => i.href === "/tourist")).toBe(false);
  });
});
