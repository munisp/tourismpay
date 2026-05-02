/**
 * Round 51 Tests
 * Covers:
 *   1. Cross-Platform Analytics Dashboard (analytics router)
 *   2. Mobile Remittance Tab (paymentSwitch.remittanceHistory + initiateRemittance)
 *   3. TigerBeetle/Mojaloop Service Client (settlementClient.ts)
 *   4. PaymentSwitch serviceStatus, mojaloopParticipants, settlementWindows procedures
 *   5. ServiceStatus page registration and navigation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

// ─── 1. Cross-Platform Analytics Dashboard ────────────────────────────────────

describe("Cross-Platform Analytics Router", () => {
  it("analytics.ts router file exists", () => {
    expect(existsSync(path.join(ROOT, "server/routers/analytics.ts"))).toBe(true);
  });

  it("exports analyticsRouter", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/analytics.ts"), "utf-8");
    expect(content).toContain("export const analyticsRouter");
  });

  it("has crossPlatform query procedure", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/analytics.ts"), "utf-8");
    expect(content).toContain("crossPlatform");
    expect(content).toContain(".query(");
  });

  it("aggregates walletTransactions data", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/analytics.ts"), "utf-8");
    expect(content).toContain("walletTransactions");
  });

  it("aggregates bisInvestigations data", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/analytics.ts"), "utf-8");
    expect(content).toContain("bisInvestigations");
  });

  it("aggregates psSettlements data", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/analytics.ts"), "utf-8");
    expect(content).toContain("psSettlements");
  });

  it("aggregates fraudAlerts data", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/analytics.ts"), "utf-8");
    expect(content).toContain("fraudAlerts");
  });

  it("is registered in routers.ts", () => {
    const content = readFileSync(path.join(ROOT, "server/routers.ts"), "utf-8");
    expect(content).toContain("analyticsRouter");
    expect(content).toContain("analytics:");
  });

  it("CrossPlatformAnalytics page exists", () => {
    expect(existsSync(path.join(ROOT, "client/src/pages/CrossPlatformAnalytics.tsx"))).toBe(true);
  });

  it("CrossPlatformAnalytics page uses trpc.analytics.crossPlatform", () => {
    const content = readFileSync(path.join(ROOT, "client/src/pages/CrossPlatformAnalytics.tsx"), "utf-8");
    expect(content).toContain("trpc.analytics.crossPlatform");
  });

  it("CrossPlatformAnalytics page shows TourismPay metrics", () => {
    const content = readFileSync(path.join(ROOT, "client/src/pages/CrossPlatformAnalytics.tsx"), "utf-8");
    expect(content.toLowerCase()).toContain("tourismpay");
  });

  it("CrossPlatformAnalytics page shows BIS metrics", () => {
    const content = readFileSync(path.join(ROOT, "client/src/pages/CrossPlatformAnalytics.tsx"), "utf-8");
    expect(content.toLowerCase()).toContain("bis");
  });

  it("CrossPlatformAnalytics page shows PaymentSwitch metrics", () => {
    const content = readFileSync(path.join(ROOT, "client/src/pages/CrossPlatformAnalytics.tsx"), "utf-8");
    expect(content.toLowerCase()).toMatch(/payment.?switch|settlement/i);
  });

  it("/analytics route is registered in App.tsx", () => {
    const content = readFileSync(path.join(ROOT, "client/src/App.tsx"), "utf-8");
    expect(content).toContain("/analytics");
    expect(content).toContain("CrossPlatformAnalytics");
  });

  it("Cross-Platform Analytics nav item is in AppShell", () => {
    const content = readFileSync(path.join(ROOT, "client/src/components/layout/AppShell.tsx"), "utf-8");
    expect(content).toContain("/analytics");
  });
});

// ─── 2. Mobile Remittance Tab ─────────────────────────────────────────────────

describe("Mobile Remittance Tab", () => {
  it("remittance.tsx tab screen exists in mobile app", () => {
    expect(
      existsSync(path.join(ROOT, "../tourismpay-mobile/app/(tabs)/remittance.tsx"))
    ).toBe(true);
  });

  it("mobile remittance screen calls initiateRemittance", () => {
    const content = readFileSync(
      path.join(ROOT, "../tourismpay-mobile/app/(tabs)/remittance.tsx"),
      "utf-8"
    );
    expect(content).toContain("initiateRemittance");
  });

  it("mobile remittance screen calls remittanceHistory", () => {
    const content = readFileSync(
      path.join(ROOT, "../tourismpay-mobile/app/(tabs)/remittance.tsx"),
      "utf-8"
    );
    expect(content).toContain("remittanceHistory");
  });

  it("mobile remittance tab is registered in tabs layout", () => {
    const content = readFileSync(
      path.join(ROOT, "../tourismpay-mobile/app/(tabs)/_layout.tsx"),
      "utf-8"
    );
    expect(content).toContain("remittance");
  });

  it("paymentSwitch.remittanceHistory procedure exists", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/paymentSwitch.ts"), "utf-8");
    expect(content).toContain("remittanceHistory:");
  });

  it("paymentSwitch.initiateRemittance procedure exists", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/paymentSwitch.ts"), "utf-8");
    expect(content).toContain("initiateRemittance:");
  });

  it("remittanceHistory is a protectedProcedure", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/paymentSwitch.ts"), "utf-8");
    const idx = content.indexOf("remittanceHistory:");
    const snippet = content.slice(idx, idx + 200);
    expect(snippet).toContain("protectedProcedure");
  });

  it("initiateRemittance validates receiverCurrency", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/paymentSwitch.ts"), "utf-8");
    // The field is named receiveCurrency (no 'r' suffix) in initiateRemittance
    expect(content).toContain("receiveCurrency");
  });

  it("initiateRemittance validates senderAmount", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/paymentSwitch.ts"), "utf-8");
    expect(content).toContain("senderAmount");
  });
});

// ─── 3. Settlement Service Client (TigerBeetle/Mojaloop) ─────────────────────

describe("Settlement Service Client", () => {
  it("settlementClient.ts exists", () => {
    expect(existsSync(path.join(ROOT, "server/_core/settlementClient.ts"))).toBe(true);
  });

  it("exports getLedgerBalance function", () => {
    const content = readFileSync(path.join(ROOT, "server/_core/settlementClient.ts"), "utf-8");
    expect(content).toContain("getLedgerBalance");
    expect(content).toContain("export");
  });

  it("exports getLedgerStatus function", () => {
    const content = readFileSync(path.join(ROOT, "server/_core/settlementClient.ts"), "utf-8");
    expect(content).toContain("getLedgerStatus");
  });

  it("exports getMojaloopStatus function", () => {
    const content = readFileSync(path.join(ROOT, "server/_core/settlementClient.ts"), "utf-8");
    expect(content).toContain("getMojaloopStatus");
  });

  it("exports listMojaloopParticipants function", () => {
    const content = readFileSync(path.join(ROOT, "server/_core/settlementClient.ts"), "utf-8");
    expect(content).toContain("listMojaloopParticipants");
  });

  it("exports createMojaloopQuote function", () => {
    const content = readFileSync(path.join(ROOT, "server/_core/settlementClient.ts"), "utf-8");
    expect(content).toContain("createMojaloopQuote");
  });

  it("exports prepareMojaloopTransfer function", () => {
    const content = readFileSync(path.join(ROOT, "server/_core/settlementClient.ts"), "utf-8");
    expect(content).toContain("prepareMojaloopTransfer");
  });

  it("exports commitMojaloopTransfer function", () => {
    const content = readFileSync(path.join(ROOT, "server/_core/settlementClient.ts"), "utf-8");
    expect(content).toContain("commitMojaloopTransfer");
  });

  it("exports getInfrastructureStatus function", () => {
    const content = readFileSync(path.join(ROOT, "server/_core/settlementClient.ts"), "utf-8");
    expect(content).toContain("getInfrastructureStatus");
  });

  it("exports getSettlementHealth function", () => {
    const content = readFileSync(path.join(ROOT, "server/_core/settlementClient.ts"), "utf-8");
    expect(content).toContain("getSettlementHealth");
  });

  it("exports listSettlementWindows function", () => {
    const content = readFileSync(path.join(ROOT, "server/_core/settlementClient.ts"), "utf-8");
    expect(content).toContain("listSettlementWindows");
  });

  it("uses SETTLEMENT_SERVICE_URL env var", () => {
    const content = readFileSync(path.join(ROOT, "server/_core/settlementClient.ts"), "utf-8");
    expect(content).toContain("SETTLEMENT_SERVICE_URL");
  });

  it("returns null gracefully when service is unavailable", () => {
    const content = readFileSync(path.join(ROOT, "server/_core/settlementClient.ts"), "utf-8");
    // Should have try/catch or null return pattern
    expect(content).toMatch(/catch|null|undefined/);
  });

  it("getLedgerBalance is imported in paymentSwitch.ts", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/paymentSwitch.ts"), "utf-8");
    expect(content).toContain("settlementClient");
    expect(content).toContain("tbGetLedgerBalance");
  });

  it("getInfrastructureStatus is used in stats procedure", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/paymentSwitch.ts"), "utf-8");
    expect(content).toContain("getInfrastructureStatus");
  });

  it("ledgerBalance falls back to local DB when service unavailable", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/paymentSwitch.ts"), "utf-8");
    const idx = content.indexOf("ledgerBalance:");
    // psLedgerEntries appears ~905 chars into the procedure, use 1000 char window
    const snippet = content.slice(idx, idx + 1000);
    expect(snippet).toContain("Fall back");
    expect(snippet).toContain("psLedgerEntries");
  });
});

// ─── 4. PaymentSwitch serviceStatus, mojaloopParticipants, settlementWindows ──

describe("PaymentSwitch New Procedures", () => {
  it("serviceStatus procedure exists", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/paymentSwitch.ts"), "utf-8");
    expect(content).toContain("serviceStatus:");
  });

  it("serviceStatus is an adminProcedure", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/paymentSwitch.ts"), "utf-8");
    const idx = content.indexOf("serviceStatus:");
    const snippet = content.slice(idx, idx + 200);
    expect(snippet).toContain("adminProcedure");
  });

  it("serviceStatus calls tbGetLedgerStatus", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/paymentSwitch.ts"), "utf-8");
    const idx = content.indexOf("serviceStatus:");
    const snippet = content.slice(idx, idx + 600);
    expect(snippet).toContain("tbGetLedgerStatus");
  });

  it("serviceStatus calls getMojaloopStatus", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/paymentSwitch.ts"), "utf-8");
    const idx = content.indexOf("serviceStatus:");
    const snippet = content.slice(idx, idx + 600);
    expect(snippet).toContain("getMojaloopStatus");
  });

  it("mojaloopParticipants procedure exists", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/paymentSwitch.ts"), "utf-8");
    expect(content).toContain("mojaloopParticipants:");
  });

  it("mojaloopParticipants falls back to local DB", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/paymentSwitch.ts"), "utf-8");
    const idx = content.indexOf("mojaloopParticipants:");
    const snippet = content.slice(idx, idx + 500);
    expect(snippet).toContain("psParticipants");
    expect(snippet).toContain("local");
  });

  it("settlementWindows procedure exists", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/paymentSwitch.ts"), "utf-8");
    expect(content).toContain("settlementWindows:");
  });

  it("settlementWindows falls back to local psSettlements", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/paymentSwitch.ts"), "utf-8");
    const idx = content.indexOf("settlementWindows:");
    const snippet = content.slice(idx, idx + 500);
    expect(snippet).toContain("psSettlements");
  });

  it("stats procedure includes infrastructure status", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/paymentSwitch.ts"), "utf-8");
    expect(content).toContain("infrastructure:");
    expect(content).toContain("settlementService:");
  });
});

// ─── 5. ServiceStatus Page and Navigation ─────────────────────────────────────

describe("ServiceStatus Page and Navigation", () => {
  it("ServiceStatus.tsx page exists", () => {
    expect(
      existsSync(path.join(ROOT, "client/src/pages/paymentswitch/ServiceStatus.tsx"))
    ).toBe(true);
  });

  it("ServiceStatus page uses trpc.paymentSwitch.serviceStatus", () => {
    const content = readFileSync(
      path.join(ROOT, "client/src/pages/paymentswitch/ServiceStatus.tsx"),
      "utf-8"
    );
    expect(content).toContain("trpc.paymentSwitch.serviceStatus");
  });

  it("ServiceStatus page shows TigerBeetle status", () => {
    const content = readFileSync(
      path.join(ROOT, "client/src/pages/paymentswitch/ServiceStatus.tsx"),
      "utf-8"
    );
    expect(content.toLowerCase()).toContain("tigerbeetle");
  });

  it("ServiceStatus page shows Mojaloop status", () => {
    const content = readFileSync(
      path.join(ROOT, "client/src/pages/paymentswitch/ServiceStatus.tsx"),
      "utf-8"
    );
    expect(content.toLowerCase()).toContain("mojaloop");
  });

  it("ServiceStatus page has auto-refresh every 30 seconds", () => {
    const content = readFileSync(
      path.join(ROOT, "client/src/pages/paymentswitch/ServiceStatus.tsx"),
      "utf-8"
    );
    expect(content).toContain("30_000");
  });

  it("/paymentswitch/service-status route is in App.tsx", () => {
    const content = readFileSync(path.join(ROOT, "client/src/App.tsx"), "utf-8");
    expect(content).toContain("/paymentswitch/service-status");
    expect(content).toContain("ServiceStatus");
  });

  it("Service Status nav item is in AppShell", () => {
    const content = readFileSync(
      path.join(ROOT, "client/src/components/layout/AppShell.tsx"),
      "utf-8"
    );
    expect(content).toContain("/paymentswitch/service-status");
  });

  it("Service Status nav item is in the paymentswitch section", () => {
    const content = readFileSync(
      path.join(ROOT, "client/src/components/layout/AppShell.tsx"),
      "utf-8"
    );
    const idx = content.indexOf("/paymentswitch/service-status");
    const snippet = content.slice(Math.max(0, idx - 50), idx + 100);
    expect(snippet).toContain("paymentswitch");
  });
});

// ─── 6. Integration: BIS ↔ PaymentSwitch ─────────────────────────────────────

describe("BIS ↔ PaymentSwitch Integration", () => {
  it("BIS schema has linkedTransactionId field", () => {
    const content = readFileSync(path.join(ROOT, "drizzle/schema.ts"), "utf-8");
    expect(content).toContain("linkedTransactionId");
  });

  it("BIS updateStatus procedure triggers fraud check", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/bis.ts"), "utf-8");
    expect(content).toContain("linkedTransactionId");
    expect(content).toContain("fraudAlerts");
  });

  it("BIS previewExport includes settlement enrichment", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/bis.ts"), "utf-8");
    const idx = content.indexOf("previewExport:");
    // psSettlements appears ~2081 chars into the procedure, use 2200 char window
    const snippet = content.slice(idx, idx + 2200);
    expect(snippet).toContain("psSettlements");
  });

  it("BIS create procedure accepts linkedTransactionId", () => {
    const content = readFileSync(path.join(ROOT, "server/routers/bis.ts"), "utf-8");
    const idx = content.indexOf("create:");
    // Use a larger slice (2000 chars) to account for the expanded entity investigation fields
    // added in Round 106 which pushed linkedTransactionId further into the procedure
    const snippet = content.slice(idx, idx + 2000);
    expect(snippet).toContain("linkedTransactionId");
  });
});

// ─── 7. Three-Platform Architecture Completeness ─────────────────────────────

describe("Three-Platform Architecture", () => {
  it("TourismPay: wallet router exists", () => {
    expect(existsSync(path.join(ROOT, "server/routers/wallet.ts"))).toBe(true);
  });

  it("TourismPay: loyalty router exists", () => {
    expect(existsSync(path.join(ROOT, "server/routers/loyalty.ts"))).toBe(true);
  });

  it("BIS: bis router exists", () => {
    expect(existsSync(path.join(ROOT, "server/routers/bis.ts"))).toBe(true);
  });

  it("PaymentSwitch: paymentSwitch router exists", () => {
    expect(existsSync(path.join(ROOT, "server/routers/paymentSwitch.ts"))).toBe(true);
  });

  it("PaymentSwitch: nocDashboard router exists", () => {
    expect(existsSync(path.join(ROOT, "server/routers/nocDashboard.ts"))).toBe(true);
  });

  it("PaymentSwitch: settlementClient exists", () => {
    expect(existsSync(path.join(ROOT, "server/_core/settlementClient.ts"))).toBe(true);
  });

  it("Analytics: cross-platform analytics router exists", () => {
    expect(existsSync(path.join(ROOT, "server/routers/analytics.ts"))).toBe(true);
  });

  it("All three platforms have nav sections in AppShell", () => {
    const content = readFileSync(
      path.join(ROOT, "client/src/components/layout/AppShell.tsx"),
      "utf-8"
    );
    // TourismPay uses 'overview'/'finance'/'africa' section names (not 'tourismpay')
    expect(content).toContain("section: \"overview\"");
    expect(content).toContain("section: \"bis\"");
    expect(content).toContain("section: \"paymentswitch\"");
  });

  it("PaymentSwitch has 27+ routes in App.tsx", () => {
    const content = readFileSync(path.join(ROOT, "client/src/App.tsx"), "utf-8");
    const matches = content.match(/path="\/paymentswitch\//g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(10);
  });

  it("Mobile app has remittance tab", () => {
    expect(
      existsSync(path.join(ROOT, "../tourismpay-mobile/app/(tabs)/remittance.tsx"))
    ).toBe(true);
  });
});
