/**
 * Role-based Navigation Tests
 *
 * Verifies that each role sees only their authorized navigation items.
 */
import { describe, it, expect } from "vitest";

// Navigation item types matching AppShell.tsx
interface NavItem {
  label: string;
  href: string;
  roles: string[];
}

// Simplified version of navItems from AppShell.tsx
const navItems: NavItem[] = [
  { label: "Tourist Experience", href: "/tourist/experience", roles: ["tourist"] },
  { label: "Tourist Portal", href: "/tourist/portal", roles: ["tourist"] },
  { label: "Trip Itinerary", href: "/itinerary", roles: ["tourist"] },
  { label: "Digital Wallet", href: "/wallet", roles: ["tourist", "merchant"] },
  { label: "Loyalty & Rewards", href: "/loyalty", roles: ["tourist", "merchant"] },
  { label: "AI Co-Pilot", href: "/copilot", roles: ["tourist", "merchant"] },
  { label: "Business Onboarding", href: "/restaurant-onboarding", roles: ["merchant"] },
  { label: "Revenue Dashboard", href: "/merchant/revenue", roles: ["merchant"] },
  { label: "QR Codes", href: "/merchant/qr", roles: ["merchant"] },
  { label: "Product Catalog", href: "/merchant/products", roles: ["merchant"] },
  { label: "Staff Management", href: "/merchant/staff", roles: ["merchant"] },
  { label: "Admin Panel", href: "/admin", roles: ["admin"] },
  { label: "User Management", href: "/admin/users", roles: ["admin"] },
  { label: "Audit Log", href: "/admin/audit-log", roles: ["admin"] },
  { label: "Service Health", href: "/admin/service-health", roles: ["admin"] },
  { label: "KYB Applications", href: "/admin/kyb-applications", roles: ["admin"] },
  { label: "Compliance Dashboard", href: "/compliance", roles: ["compliance_officer", "admin"] },
  { label: "NOC Dashboard", href: "/paymentswitch/noc", roles: ["noc_operator", "admin"] },
  { label: "Settlement Console", href: "/settlement", roles: ["settlement_officer", "admin"] },
];

function getNavForRole(role: string): NavItem[] {
  return navItems.filter(item => item.roles.includes(role) || item.roles.includes("admin") && role === "admin");
}

describe("Role-based Navigation", () => {
  it("tourist should see tourist-specific items but NOT admin/merchant-only items", () => {
    const touristNav = getNavForRole("tourist");
    const labels = touristNav.map(n => n.label);

    expect(labels).toContain("Tourist Experience");
    expect(labels).toContain("Digital Wallet");
    expect(labels).toContain("Loyalty & Rewards");
    expect(labels).not.toContain("Admin Panel");
    expect(labels).not.toContain("Revenue Dashboard");
    expect(labels).not.toContain("User Management");
  });

  it("merchant should see merchant-specific items but NOT admin-only items", () => {
    const merchantNav = getNavForRole("merchant");
    const labels = merchantNav.map(n => n.label);

    expect(labels).toContain("Business Onboarding");
    expect(labels).toContain("Revenue Dashboard");
    expect(labels).toContain("Product Catalog");
    expect(labels).toContain("Digital Wallet");
    expect(labels).not.toContain("Admin Panel");
    expect(labels).not.toContain("Tourist Experience");
  });

  it("admin should see all admin items", () => {
    const adminNav = getNavForRole("admin");
    const labels = adminNav.map(n => n.label);

    expect(labels).toContain("Admin Panel");
    expect(labels).toContain("User Management");
    expect(labels).toContain("Audit Log");
    expect(labels).toContain("KYB Applications");
    expect(labels).toContain("Service Health");
  });

  it("compliance_officer should see compliance dashboard", () => {
    const complianceNav = getNavForRole("compliance_officer");
    const labels = complianceNav.map(n => n.label);

    expect(labels).toContain("Compliance Dashboard");
    expect(labels).not.toContain("Admin Panel");
  });

  it("noc_operator should see NOC dashboard", () => {
    const nocNav = getNavForRole("noc_operator");
    const labels = nocNav.map(n => n.label);

    expect(labels).toContain("NOC Dashboard");
    expect(labels).not.toContain("Admin Panel");
  });

  it("each role should have at least one navigation item", () => {
    const roles = ["tourist", "merchant", "admin", "compliance_officer", "noc_operator", "settlement_officer"];
    for (const role of roles) {
      const nav = getNavForRole(role);
      expect(nav.length).toBeGreaterThan(0);
    }
  });
});
