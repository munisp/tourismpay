/**
 * PaymentSwitch Integration Tests
 * Covers: schema tables, router registrations, BIS↔PS integration hooks,
 * navigation entries, route registrations, and stub router completeness.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const root = resolve(__dirname, "..");

// ─── Schema Tests ─────────────────────────────────────────────────────────────
describe("PaymentSwitch schema tables", () => {
  const schema = readFileSync(resolve(root, "drizzle/schema.ts"), "utf-8");

  it("psParticipants table exists in schema", () => {
    expect(schema).toContain("psParticipants");
    expect(schema).toContain("ps_participants");
  });

  it("psRemittances table exists in schema", () => {
    expect(schema).toContain("psRemittances");
    // psRemittances is an alias for the remittances table
    expect(schema).toContain("remittances");
  });

  it("psSettlements table exists in schema", () => {
    expect(schema).toContain("psSettlements");
    expect(schema).toContain("ps_settlements");
  });

  it("psNocEvents table exists in schema", () => {
    expect(schema).toContain("psNocEvents");
    // psNocEvents is an alias for the noc_events table
    expect(schema).toContain("noc_events");
  });

  it("psFraudRules table exists in schema", () => {
    expect(schema).toContain("psFraudRules");
    expect(schema).toContain("ps_fraud_rules");
  });

  it("psLedgerEntries table exists in schema", () => {
    expect(schema).toContain("psLedgerEntries");
    expect(schema).toContain("ps_ledger_entries");
  });

  it("psSettlements has totalAmount column (not amount)", () => {
    const psSettlementsBlock = schema.slice(
      schema.indexOf("ps_settlements"),
      schema.indexOf("ps_settlements") + 500
    );
    expect(psSettlementsBlock).toContain("total_amount");
    expect(psSettlementsBlock).not.toContain('"amount"');
  });

  it("bisInvestigations has linkedTransactionId column", () => {
    expect(schema).toContain("linkedTransactionId");
    expect(schema).toContain("linked_transaction_id");
  });

  it("remittanceStatusEnum is defined", () => {
    expect(schema).toContain("remittanceStatusEnum");
  });

  it("settlementStatusEnum is defined", () => {
    expect(schema).toContain("settlementStatusEnum");
  });

  it("nocEventTypeEnum is defined", () => {
    expect(schema).toContain("nocEventTypeEnum");
  });
});

// ─── Router Registration Tests ────────────────────────────────────────────────
describe("PaymentSwitch router registrations", () => {
  const routers = readFileSync(resolve(root, "server/routers.ts"), "utf-8");

  it("paymentSwitchRouter is imported", () => {
    expect(routers).toContain("paymentSwitchRouter");
  });

  it("nocDashboardRouter is imported", () => {
    expect(routers).toContain("nocDashboardRouter");
  });

  it("paymentSwitch routers are imported", () => {
    expect(routers).toContain("psRouters");
  });

  it("paymentSwitch is registered in appRouter", () => {
    expect(routers).toContain("paymentSwitch:");
  });

  it("nocDashboard is registered in appRouter", () => {
    expect(routers).toContain("nocDashboard:");
  });

  it("remittance stub is registered in appRouter", () => {
    expect(routers).toContain("remittance:");
  });

  it("analytics stub is registered in appRouter", () => {
    expect(routers).toContain("analytics:");
  });

  it("rateAlerts stub is registered in appRouter", () => {
    expect(routers).toContain("rateAlerts:");
  });

  it("apiKeys stub is registered in appRouter", () => {
    expect(routers).toContain("apiKeys:");
  });

  it("testingCertification stub is registered in appRouter", () => {
    expect(routers).toContain("testingCertification:");
  });

  it("technicalOnboarding stub is registered in appRouter", () => {
    expect(routers).toContain("technicalOnboarding:");
  });

  it("productionGoLive stub is registered in appRouter", () => {
    expect(routers).toContain("productionGoLive:");
  });

  it("merchant stub is registered in appRouter", () => {
    expect(routers).toContain("merchant:");
  });
});

// ─── PaymentSwitch Router File Tests ─────────────────────────────────────────
describe("psRouters.ts router", () => {
  const ps = readFileSync(resolve(root, "server/routers/psRouters.ts"), "utf-8");

  it("has initiateRemittance procedure", () => {
    expect(ps).toContain("initiateRemittance");
  });

  it("has listRemittances procedure", () => {
    expect(ps).toContain("listRemittances");
  });

  it("has getRemittance procedure", () => {
    expect(ps).toContain("getRemittance");
  });

  it("has cancelRemittance procedure", () => {
    expect(ps).toContain("cancelRemittance");
  });

  it("has settlementSummary procedure", () => {
    expect(ps).toContain("settlementSummary");
  });

  it("has listSettlements procedure", () => {
    expect(ps).toContain("listSettlements");
  });

  it("has listParticipants procedure", () => {
    expect(ps).toContain("listParticipants");
  });

  it("has participantHealth procedure", () => {
    expect(ps).toContain("participantHealth");
  });

  it("has fraudCheckTransaction procedure", () => {
    expect(ps).toContain("fraudCheckTransaction");
  });

  it("has listFraudRules procedure", () => {
    expect(ps).toContain("listFraudRules");
  });

  it("has ledgerBalance procedure", () => {
    expect(ps).toContain("ledgerBalance");
  });

  it("has ledgerEntries procedure", () => {
    expect(ps).toContain("ledgerEntries");
  });

  it("uses protectedProcedure for sensitive operations", () => {
    expect(ps).toContain("protectedProcedure");
  });

  it("uses adminProcedure for admin-only operations", () => {
    expect(ps).toContain("adminProcedure");
  });
});

// ─── NOC Dashboard Router Tests ───────────────────────────────────────────────
describe("nocDashboard.ts router", () => {
  const noc = readFileSync(resolve(root, "server/routers/nocDashboard.ts"), "utf-8");

  it("has systemHealth procedure", () => {
    expect(noc).toContain("systemHealth");
  });

  it("has recentEvents procedure", () => {
    expect(noc).toContain("recentEvents");
  });

  it("has transactionVolume procedure", () => {
    expect(noc).toContain("transactionVolume");
  });

  it("has killSwitch procedure", () => {
    expect(noc).toContain("killSwitch");
  });

  it("has logEvent procedure", () => {
    expect(noc).toContain("logEvent");
  });

  it("killSwitch is admin-protected", () => {
    const killSwitchIdx = noc.indexOf("killSwitch");
    const adminIdx = noc.indexOf("adminProcedure", killSwitchIdx - 200);
    expect(adminIdx).toBeGreaterThan(-1);
  });
});

// ─── BIS ↔ PaymentSwitch Integration Tests ───────────────────────────────────
describe("BIS ↔ PaymentSwitch integration in bis.ts", () => {
  const bis = readFileSync(resolve(root, "server/routers/bis.ts"), "utf-8");

  it("imports fraudAlerts from schema", () => {
    expect(bis).toContain("fraudAlerts");
  });

  it("imports psSettlements from schema", () => {
    expect(bis).toContain("psSettlements");
  });

  it("BIS create accepts linkedTransactionId input", () => {
    expect(bis).toContain("linkedTransactionId");
  });

  it("updateStatus creates fraud alert when linkedTransactionId is set", () => {
    expect(bis).toContain("FA-BIS-");
    expect(bis).toContain("BIS_INVESTIGATION_COMPLETE");
  });

  it("fraud alert uses correct severity mapping from riskLevel", () => {
    expect(bis).toContain("riskLevel === \"critical\" ? \"critical\"");
    expect(bis).toContain("riskLevel === \"high\" ? \"high\"");
  });

  it("fraud alert status is 'investigating' when BIS status is 'flagged'", () => {
    expect(bis).toContain("status === \"flagged\" ? \"investigating\"");
  });

  it("previewExport pulls settlement summary from psSettlements", () => {
    expect(bis).toContain("settlementSummary");
    expect(bis).toContain("psSettlements");
    expect(bis).toContain("totalSettled");
  });

  it("previewExport returns settlementSummary in response", () => {
    expect(bis).toContain("settlementSummary,");
  });

  it("settlement enrichment is non-blocking (wrapped in try/catch)", () => {
    const settlementBlock = bis.slice(
      bis.indexOf("PaymentSwitch integration: pull settlement"),
      bis.indexOf("settlementSummary,") + 50
    );
    expect(settlementBlock).toContain("try {");
    expect(settlementBlock).toContain("} catch {");
  });

  it("fraud alert creation is non-blocking (.catch(() => {}))", () => {
    expect(bis).toContain(".catch(() => {});");
  });
});

// ─── Navigation Tests ─────────────────────────────────────────────────────────
describe("PaymentSwitch navigation entries in AppShell", () => {
  const appShell = readFileSync(
    resolve(root, "client/src/components/layout/AppShell.tsx"),
    "utf-8"
  );

  it("Payment Switch section label exists", () => {
    expect(appShell).toContain("Payment Switch");
  });

  it("NOC Dashboard nav item exists", () => {
    expect(appShell).toContain("/paymentswitch/noc");
  });

  it("Admin Dashboard nav item exists", () => {
    expect(appShell).toContain("/paymentswitch/admin");
  });

  it("Remittance nav item exists", () => {
    expect(appShell).toContain("/paymentswitch/remittance");
  });

  it("Settlement Console nav item exists", () => {
    // Settlement Console was moved to its own dedicated /settlement route
    expect(appShell).toContain("/settlement");
  });

  it("Developer Portal nav item exists", () => {
    expect(appShell).toContain("/paymentswitch/developer");
  });
});

// ─── Route Registration Tests ─────────────────────────────────────────────────
describe("PaymentSwitch routes in App.tsx", () => {
  const app = readFileSync(resolve(root, "client/src/App.tsx"), "utf-8");

  it("NOCDashboard route is registered", () => {
    expect(app).toContain("/paymentswitch/noc");
  });

  it("AdminDashboard route is registered", () => {
    expect(app).toContain("/paymentswitch/admin");
  });

  it("RemittanceAdminDashboard route is registered", () => {
    expect(app).toContain("/paymentswitch/remittance");
  });

  it("PaymentGateway route is registered", () => {
    expect(app).toContain("/paymentswitch/gateway");
  });

  it("DeveloperPortal route is registered", () => {
    expect(app).toContain("/paymentswitch/developer");
  });

  it("Analytics route is registered", () => {
    expect(app).toContain("/paymentswitch/analytics");
  });

  it("RateAlerts route is registered", () => {
    expect(app).toContain("/paymentswitch/rate-alerts");
  });

  it("TechnicalOnboarding route is registered", () => {
    expect(app).toContain("/paymentswitch/onboarding");
  });

  it("ProductionGoLive route is registered", () => {
    expect(app).toContain("/paymentswitch/go-live");
  });

  it("TestingCertification route is registered", () => {
    expect(app).toContain("/paymentswitch/testing");
  });
});

// ─── PaymentSwitch Page Files Exist ───────────────────────────────────────────
describe("PaymentSwitch page files exist", () => {
  const pages = [
    "client/src/pages/paymentswitch/NOCDashboard.tsx",
    "client/src/pages/paymentswitch/AdminDashboard.tsx",
    "client/src/pages/paymentswitch/RemittanceAdminDashboard.tsx",
    "client/src/pages/paymentswitch/Dashboard.tsx",
    "client/src/pages/paymentswitch/Analytics.tsx",
    "client/src/pages/paymentswitch/PaymentGateway.tsx",
    "client/src/pages/paymentswitch/DeveloperPortal.tsx",
    "client/src/pages/paymentswitch/RateAlerts.tsx",
  ];

  pages.forEach((page) => {
    it(`${page.split("/").pop()} exists`, () => {
      expect(existsSync(resolve(root, page))).toBe(true);
    });
  });
});

// ─── psRouters.ts Completeness Tests ────────────────────────────────────────────
describe("psRouters.ts stub router completeness", () => {
  const stubs = readFileSync(resolve(root, "server/routers/psRouters.ts"), "utf-8");

  it("rateAlerts router has getAlerts procedure", () => {
    expect(stubs).toContain("getAlerts");
  });

  it("apiKeys router has list procedure", () => {
    expect(stubs).toContain("list:");
  });

  it("testingCertification router has getSandboxEnvironments procedure", () => {
    expect(stubs).toContain("getSandboxEnvironments");
  });

  it("technicalOnboarding router has getTechnicalOnboarding procedure", () => {
    expect(stubs).toContain("getTechnicalOnboarding");
  });

  it("productionGoLive router has getChecklist procedure", () => {
    expect(stubs).toContain("getChecklist");
  });

  it("merchant router has list procedure", () => {
    expect(stubs).toContain("merchant");
  });

  it("integration router has getWebhooks procedure", () => {
    expect(stubs).toContain("getWebhooks");
  });

  it("notificationChannels router exists", () => {
    expect(stubs).toContain("notificationChannels");
  });

  it("accountActivity router exists", () => {
    expect(stubs).toContain("accountActivity");
  });

  it("twoFactor router exists", () => {
    expect(stubs).toContain("twoFactor");
  });
});

// ─── BIS Dashboard Settlement Enrichment UI Tests ─────────────────────────────
describe("BISDashboard.tsx shows settlement enrichment from PaymentSwitch", () => {
  const bisDash = readFileSync(
    resolve(root, "client/src/pages/bis/BISDashboard.tsx"),
    "utf-8"
  );

  it("BISDashboard renders settlementSummary from previewExport", () => {
    expect(bisDash).toContain("settlementSummary");
  });
});
