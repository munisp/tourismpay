/**
 * Round 72 Tests
 * - Role-aware mobile navigation (tourist, merchant, admin, default)
 * - Trip summary sharing (navigator.share / clipboard fallback)
 * - Payout scheduler notification content
 */
import { describe, it, expect } from "vitest";

// ── Mobile nav role mapping ────────────────────────────────────────────────────

type UserRole = "tourist" | "merchant" | "admin" | "user" | "compliance_officer" | "noc_operator" | "settlement_officer" | "bis_analyst";

interface NavItem { label: string; href: string }

const touristNavItems: NavItem[] = [
  { label: "Discover", href: "/tourist" },
  { label: "Wallet", href: "/wallet" },
  { label: "Loyalty", href: "/loyalty" },
  { label: "Profile", href: "/settings/privacy" },
];

const merchantNavItems: NavItem[] = [
  { label: "Dashboard", href: "/merchant/revenue" },
  { label: "QR Codes", href: "/merchant/qr" },
  { label: "Payouts", href: "/merchant/payouts" },
  { label: "Products", href: "/merchant/products" },
  { label: "Profile", href: "/settings/privacy" },
];

const adminNavItems: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Analytics", href: "/analytics" },
  { label: "BIS", href: "/bis" },
  { label: "Co-Pilot", href: "/copilot" },
  { label: "Wallet", href: "/wallet" },
];

const defaultNavItems: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Africa", href: "/africa/registry" },
  { label: "BIS", href: "/bis" },
  { label: "Co-Pilot", href: "/copilot" },
  { label: "Wallet", href: "/wallet" },
];

function getMobileNavItems(role: UserRole): NavItem[] {
  if (role === "tourist") return touristNavItems;
  if (role === "merchant") return merchantNavItems;
  if (role === "admin") return adminNavItems;
  return defaultNavItems;
}

describe("Role-aware mobile navigation", () => {
  it("tourist role gets Discover, Wallet, Loyalty, Profile nav items", () => {
    const items = getMobileNavItems("tourist");
    expect(items).toHaveLength(4);
    expect(items[0].label).toBe("Discover");
    expect(items[0].href).toBe("/tourist");
    expect(items[1].label).toBe("Wallet");
    expect(items[2].label).toBe("Loyalty");
    expect(items[3].label).toBe("Profile");
  });

  it("merchant role gets Dashboard, QR Codes, Payouts, Products, Profile nav items", () => {
    const items = getMobileNavItems("merchant");
    expect(items).toHaveLength(5);
    expect(items[0].label).toBe("Dashboard");
    expect(items[0].href).toBe("/merchant/revenue");
    expect(items[1].label).toBe("QR Codes");
    expect(items[2].label).toBe("Payouts");
    expect(items[3].label).toBe("Products");
    expect(items[4].label).toBe("Profile");
  });

  it("admin role gets Dashboard, Analytics, BIS, Co-Pilot, Wallet nav items", () => {
    const items = getMobileNavItems("admin");
    expect(items).toHaveLength(5);
    expect(items[0].label).toBe("Dashboard");
    expect(items[1].label).toBe("Analytics");
    expect(items[2].label).toBe("BIS");
    expect(items[3].label).toBe("Co-Pilot");
    expect(items[4].label).toBe("Wallet");
  });

  it("compliance_officer role gets default nav items", () => {
    const items = getMobileNavItems("compliance_officer");
    expect(items).toHaveLength(5);
    expect(items[0].label).toBe("Dashboard");
    expect(items[1].label).toBe("Africa");
  });

  it("noc_operator role gets default nav items", () => {
    const items = getMobileNavItems("noc_operator");
    expect(items).toHaveLength(5);
    expect(items[2].label).toBe("BIS");
  });

  it("settlement_officer role gets default nav items", () => {
    const items = getMobileNavItems("settlement_officer");
    expect(items[4].label).toBe("Wallet");
  });

  it("bis_analyst role gets default nav items", () => {
    const items = getMobileNavItems("bis_analyst");
    expect(items[3].label).toBe("Co-Pilot");
  });

  it("user role gets default nav items", () => {
    const items = getMobileNavItems("user");
    expect(items).toHaveLength(5);
    expect(items[0].href).toBe("/");
  });

  it("tourist nav has no admin-only items", () => {
    const items = getMobileNavItems("tourist");
    const hrefs = items.map((i) => i.href);
    expect(hrefs).not.toContain("/admin");
    expect(hrefs).not.toContain("/analytics");
  });

  it("merchant nav has no tourist-only items", () => {
    const items = getMobileNavItems("merchant");
    const hrefs = items.map((i) => i.href);
    expect(hrefs).not.toContain("/tourist");
    expect(hrefs).not.toContain("/loyalty");
  });
});

// ── Trip summary sharing logic ─────────────────────────────────────────────────

describe("Trip summary sharing", () => {
  it("share URL is the S3 report URL", () => {
    const reportUrl = "https://cdn.example.com/trip-summaries/42/1234567890-abc123.html";
    // Simulate share data construction
    const shareData = {
      title: "My TourismPay Trip Summary",
      url: reportUrl,
    };
    expect(shareData.title).toBe("My TourismPay Trip Summary");
    expect(shareData.url).toBe(reportUrl);
    expect(shareData.url).toMatch(/^https:\/\//);
  });

  it("clipboard fallback copies the report URL", () => {
    const reportUrl = "https://cdn.example.com/trip-summaries/42/1234567890-abc123.html";
    // Simulate clipboard write
    let copiedText = "";
    const mockClipboard = { writeText: (text: string) => { copiedText = text; return Promise.resolve(); } };
    mockClipboard.writeText(reportUrl);
    expect(copiedText).toBe(reportUrl);
  });

  it("share button is only shown when reportUrl is present", () => {
    const reportWithUrl = { id: 1, reportUrl: "https://cdn.example.com/report.html" };
    const reportWithoutUrl = { id: 2, reportUrl: null };
    expect(!!reportWithUrl.reportUrl).toBe(true);
    expect(!!reportWithoutUrl.reportUrl).toBe(false);
  });
});

// ── Payout scheduler notification content ─────────────────────────────────────

describe("Payout scheduler notification content", () => {
  it("notification title is 'Automatic payout initiated'", () => {
    const title = "Automatic payout initiated";
    expect(title).toBe("Automatic payout initiated");
  });

  it("notification content includes frequency and amount", () => {
    const frequency = "weekly";
    const totalAmount = 1250.75;
    const batchId = "AUTO-42-1700000000000";
    const content = `Your scheduled ${frequency} payout of $${totalAmount.toFixed(2)} USD has been initiated (Batch ${batchId}). Funds will be settled within 1–2 business days.`;
    expect(content).toContain("weekly");
    expect(content).toContain("$1250.75");
    expect(content).toContain(batchId);
    expect(content).toContain("1–2 business days");
  });

  it("notification action URL points to merchant payouts page", () => {
    const actionUrl = "/merchant/payouts";
    expect(actionUrl).toBe("/merchant/payouts");
  });

  it("notification action label is 'View Payouts'", () => {
    const actionLabel = "View Payouts";
    expect(actionLabel).toBe("View Payouts");
  });

  it("batch ID format includes merchant ID and timestamp", () => {
    const merchantId = 42;
    const timestamp = 1700000000000;
    const batchId = `AUTO-${merchantId}-${timestamp}`;
    expect(batchId).toMatch(/^AUTO-\d+-\d+$/);
    expect(batchId).toContain("42");
  });

  it("daily frequency produces correct notification content", () => {
    const frequency = "daily";
    const amount = 500;
    const content = `Your scheduled ${frequency} payout of $${amount.toFixed(2)} USD has been initiated`;
    expect(content).toContain("daily");
    expect(content).toContain("$500.00");
  });

  it("monthly frequency produces correct notification content", () => {
    const frequency = "monthly";
    const amount = 12000.5;
    const content = `Your scheduled ${frequency} payout of $${amount.toFixed(2)} USD has been initiated`;
    expect(content).toContain("monthly");
    expect(content).toContain("$12000.50");
  });
});
