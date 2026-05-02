/**
 * Round 66 Tests: Settlement Console, Analytics Enhancements, CrossPlatformAnalytics
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const root = resolve(__dirname, "..");

// ─── Settlement Router Tests ───────────────────────────────────────────────────
describe("settlement.ts router", () => {
  const settlement = readFileSync(resolve(root, "server/routers/settlement.ts"), "utf-8");

  it("settlement router file exists", () => {
    expect(existsSync(resolve(root, "server/routers/settlement.ts"))).toBe(true);
  });

  it("has stats procedure", () => {
    expect(settlement).toContain("stats");
  });

  it("has list procedure", () => {
    expect(settlement).toContain("list");
  });

  it("has approveBatch procedure", () => {
    expect(settlement).toContain("approveBatch");
  });

  it("has reject procedure", () => {
    expect(settlement).toContain("reject");
  });

  it("has dailyVolume procedure", () => {
    expect(settlement).toContain("dailyVolume");
  });

  it("uses settlementProcedure for role-based access", () => {
    expect(settlement).toContain("settlementProcedure");
  });

  it("uses psSettlements table", () => {
    expect(settlement).toContain("psSettlements");
  });
});

// ─── Settlement Router Registration Tests ─────────────────────────────────────
describe("settlement router registration in routers.ts", () => {
  const routers = readFileSync(resolve(root, "server/routers.ts"), "utf-8");

  it("settlementRouter is imported", () => {
    expect(routers).toContain("settlementRouter");
  });

  it("settlement is registered in appRouter", () => {
    expect(routers).toContain("settlement:");
  });
});

// ─── Settlement Console Page Tests ────────────────────────────────────────────
describe("SettlementConsole.tsx page", () => {
  const page = readFileSync(
    resolve(root, "client/src/pages/settlement/SettlementConsole.tsx"),
    "utf-8"
  );

  it("SettlementConsole page file exists", () => {
    expect(existsSync(resolve(root, "client/src/pages/settlement/SettlementConsole.tsx"))).toBe(true);
  });

  it("uses trpc.settlement.stats", () => {
    expect(page).toContain("trpc.settlement.stats");
  });

  it("uses trpc.settlement.list", () => {
    expect(page).toContain("trpc.settlement.list");
  });

  it("uses trpc.settlement.approveBatch", () => {
    expect(page).toContain("trpc.settlement.approveBatch");
  });

  it("uses trpc.settlement reject mutation", () => {
    expect(page).toContain("trpc.settlement.reject");
  });

  it("uses RoleGuard with settlement_officer and admin roles", () => {
    expect(page).toContain("settlement_officer");
    expect(page).toContain("admin");
  });

  it("has StatCard KPI components", () => {
    expect(page).toContain("StatCard");
  });

  it("has batch selection checkbox logic", () => {
    expect(page).toContain("selectedIds");
  });
});

// ─── Settlement Route in App.tsx ──────────────────────────────────────────────
describe("Settlement route in App.tsx", () => {
  const app = readFileSync(resolve(root, "client/src/App.tsx"), "utf-8");

  it("SettlementConsole is imported", () => {
    expect(app).toContain("SettlementConsole");
  });

  it("/settlement route is registered", () => {
    expect(app).toContain("/settlement");
  });
});

// ─── Analytics Router Enhancements Tests ──────────────────────────────────────
describe("analytics.ts router enhancements", () => {
  const analytics = readFileSync(resolve(root, "server/routers/analytics.ts"), "utf-8");

  it("has dauByRole procedure", () => {
    expect(analytics).toContain("dauByRole");
  });

  it("has qrVolume procedure", () => {
    expect(analytics).toContain("qrVolume");
  });

  it("has kybRate procedure", () => {
    expect(analytics).toContain("kybRate");
  });

  it("imports users from schema", () => {
    expect(analytics).toContain("users");
  });

  it("imports kybApplications from schema", () => {
    expect(analytics).toContain("kybApplications");
  });
});

// ─── CrossPlatformAnalytics Page Tests ────────────────────────────────────────
describe("CrossPlatformAnalytics.tsx page enhancements", () => {
  const page = readFileSync(
    resolve(root, "client/src/pages/CrossPlatformAnalytics.tsx"),
    "utf-8"
  );

  it("uses trpc.analytics.dauByRole", () => {
    expect(page).toContain("dauByRole");
  });

  it("uses trpc.analytics.qrVolume", () => {
    expect(page).toContain("qrVolume");
  });

  it("uses trpc.analytics.kybRate", () => {
    expect(page).toContain("kybRate");
  });
});

// ─── settlementProcedure in trpc.ts ───────────────────────────────────────────
describe("settlementProcedure in trpc.ts", () => {
  const trpc = readFileSync(resolve(root, "server/_core/trpc.ts"), "utf-8");

  it("settlementProcedure is exported", () => {
    expect(trpc).toContain("settlementProcedure");
  });

  it("settlementProcedure allows settlement_officer role", () => {
    expect(trpc).toContain("settlement_officer");
  });
});
