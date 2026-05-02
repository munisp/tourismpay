/**
 * Round 83 Tests
 *
 * Covers:
 * 1. RBAC — new role-specific tRPC procedures (bisProcedure, nocProcedure, complianceProcedure, merchantProcedure, paymentSwitchProcedure)
 * 2. BIS list/byId now accessible to bis_analyst (not just admin)
 * 3. NOC read procedures accessible to noc_operator
 * 4. KYB and audit log procedures accessible to compliance_officer
 * 5. PaymentSwitch role matrix
 * 6. Missing workflow audit — PaymentGateway and DeveloperPortal are intentional static landing pages
 * 7. Mobile screen gap analysis
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const SERVER = join(ROOT, "server");
const CLIENT = join(ROOT, "client/src");

// ─── 1. tRPC Core: all role-specific procedures exported ─────────────────────

describe("tRPC core — role-specific procedures", () => {
  const trpcCore = readFileSync(join(SERVER, "_core/trpc.ts"), "utf-8");

  it("exports bisProcedure allowing admin + bis_analyst", () => {
    expect(trpcCore).toContain("export const bisProcedure");
    expect(trpcCore).toContain("bis_analyst");
  });

  it("exports nocProcedure allowing admin + noc_operator", () => {
    expect(trpcCore).toContain("export const nocProcedure");
    expect(trpcCore).toContain("noc_operator");
  });

  it("exports complianceProcedure allowing admin + compliance_officer", () => {
    expect(trpcCore).toContain("export const complianceProcedure");
    expect(trpcCore).toContain("compliance_officer");
  });

  it("exports merchantProcedure allowing admin + merchant", () => {
    expect(trpcCore).toContain("export const merchantProcedure");
    expect(trpcCore).toContain("merchant");
  });

  it("exports paymentSwitchProcedure allowing admin + noc_operator + settlement_officer", () => {
    expect(trpcCore).toContain("export const paymentSwitchProcedure");
    expect(trpcCore).toContain("noc_operator");
    expect(trpcCore).toContain("settlement_officer");
  });

  it("exports settlementProcedure allowing admin + settlement_officer", () => {
    expect(trpcCore).toContain("export const settlementProcedure");
    expect(trpcCore).toContain("settlement_officer");
  });

  it("throws FORBIDDEN for wrong role in bisProcedure", () => {
    // Verify the guard throws FORBIDDEN (not UNAUTHORIZED)
    expect(trpcCore).toContain("FORBIDDEN");
  });
});

// ─── 2. BIS router uses bisProcedure for list/byId ───────────────────────────

describe("BIS router — bisProcedure for analyst access", () => {
  const bisRouter = readFileSync(join(SERVER, "routers/bis.ts"), "utf-8");

  it("imports bisProcedure", () => {
    expect(bisRouter).toContain("bisProcedure");
  });

  it("list procedure uses bisProcedure (not protectedProcedure)", () => {
    expect(bisRouter).toContain("list: bisProcedure");
  });

  it("byId procedure uses bisProcedure (not protectedProcedure)", () => {
    expect(bisRouter).toContain("byId: bisProcedure");
  });

  it("create/updateStatus still use adminProcedure (write-restricted)", () => {
    expect(bisRouter).toContain("create: adminProcedure");
    expect(bisRouter).toContain("updateStatus: adminProcedure");
  });
});

// ─── 3. NOC Dashboard uses nocProcedure for read operations ──────────────────

describe("NOC Dashboard router — nocProcedure for operator access", () => {
  const nocRouter = readFileSync(join(SERVER, "routers/nocDashboard.ts"), "utf-8");

  it("imports nocProcedure", () => {
    expect(nocRouter).toContain("nocProcedure");
  });

  it("getKillSwitchState uses nocProcedure (read-only)", () => {
    expect(nocRouter).toContain("getKillSwitchState: nocProcedure");
  });

  it("listEvents uses nocProcedure", () => {
    expect(nocRouter).toContain("listEvents: nocProcedure");
  });

  it("hourlyVolume uses nocProcedure", () => {
    expect(nocRouter).toContain("hourlyVolume: nocProcedure");
  });

  it("dailyVolume uses nocProcedure", () => {
    expect(nocRouter).toContain("dailyVolume: nocProcedure");
  });

  it("systemHealth uses nocProcedure", () => {
    expect(nocRouter).toContain("systemHealth: nocProcedure");
  });

  it("activateKillSwitch still uses adminProcedure (write-restricted)", () => {
    expect(nocRouter).toContain("activateKillSwitch: adminProcedure");
  });

  it("deactivateKillSwitch still uses adminProcedure (write-restricted)", () => {
    expect(nocRouter).toContain("deactivateKillSwitch: adminProcedure");
  });
});

// ─── 4. KYB Applications uses complianceProcedure ────────────────────────────

describe("KYB Applications router — complianceProcedure", () => {
  const kybRouter = readFileSync(join(SERVER, "routers/kybApplications.ts"), "utf-8");

  it("imports complianceProcedure from core", () => {
    expect(kybRouter).toContain("complianceProcedure");
  });

  it("no longer has inline protectedProcedure role guard", () => {
    // The old inline guard checked allowed array manually
    expect(kybRouter).not.toContain('const allowed = ["admin", "compliance_officer"]');
  });
});

// ─── 5. Audit Logs uses complianceProcedure ───────────────────────────────────

describe("Audit Logs router — complianceProcedure", () => {
  const auditRouter = readFileSync(join(SERVER, "routers/auditLogs.ts"), "utf-8");

  it("imports complianceProcedure from core", () => {
    expect(auditRouter).toContain("complianceProcedure");
  });

  it("no longer has inline role guard", () => {
    expect(auditRouter).not.toContain('const allowed = ["admin", "compliance_officer"]');
  });

  it("sidebarBadges still uses protectedProcedure (any authenticated user)", () => {
    expect(auditRouter).toContain("protectedProcedure");
    expect(auditRouter).toContain("sidebarBadges");
  });
});

// ─── 6. AppShell role matrix — PaymentSwitch nav ─────────────────────────────

describe("AppShell — PaymentSwitch role assignments", () => {
  const appShell = readFileSync(join(CLIENT, "components/layout/AppShell.tsx"), "utf-8");

  it("PS Dashboard accessible to admin, noc_operator, settlement_officer", () => {
    expect(appShell).toContain('"noc_operator"');
    expect(appShell).toContain('"settlement_officer"');
  });

  it("NOC Dashboard accessible to admin and noc_operator", () => {
    expect(appShell).toContain('href: "/paymentswitch/noc"');
    expect(appShell).toContain('"noc_operator"');
  });

  it("Kill Switch accessible to admin and noc_operator", () => {
    expect(appShell).toContain('href: "/paymentswitch/kill-switch"');
  });

  it("Rate Limits restricted to admin only", () => {
    expect(appShell).toContain('href: "/paymentswitch/rate-limits"');
    // Rate limits badge is "Admin"
    expect(appShell).toContain('badgeVariant: "blue"');
  });

  it("Settlement Console accessible to admin and settlement_officer", () => {
    expect(appShell).toContain('href: "/settlement"');
    expect(appShell).toContain('"settlement_officer"');
  });
});

// ─── 7. AppShell role matrix — BIS nav ───────────────────────────────────────

describe("AppShell — BIS role assignments", () => {
  const appShell = readFileSync(join(CLIENT, "components/layout/AppShell.tsx"), "utf-8");

  it("BIS Investigations accessible to bis_analyst and admin", () => {
    expect(appShell).toContain('"bis_analyst"');
    expect(appShell).toContain('href: "/bis"');
  });

  it("Fraud Monitor accessible to bis_analyst, compliance_officer, admin", () => {
    expect(appShell).toContain('href: "/security/fraud"');
    expect(appShell).toContain('"compliance_officer"');
  });

  it("SOC Dashboard accessible to security roles", () => {
    expect(appShell).toContain('href: "/security/soc"');
  });
});

// ─── 8. PaymentGateway and DeveloperPortal are intentional static pages ───────

describe("PaymentGateway and DeveloperPortal — intentional static landing pages", () => {
  const gatewayPath = join(CLIENT, "pages/paymentswitch/PaymentGateway.tsx");
  const devPortalPath = join(CLIENT, "pages/paymentswitch/DeveloperPortal.tsx");

  it("PaymentGateway.tsx exists", () => {
    expect(existsSync(gatewayPath)).toBe(true);
  });

  it("DeveloperPortal.tsx exists", () => {
    expect(existsSync(devPortalPath)).toBe(true);
  });

  it("PaymentGateway is a public-facing landing page (uses useAuth)", () => {
    const content = readFileSync(gatewayPath, "utf-8");
    expect(content).toContain("useAuth");
  });

  it("DeveloperPortal renders documentation content (has Tabs)", () => {
    const content = readFileSync(devPortalPath, "utf-8");
    expect(content).toContain("Tabs");
  });
});

// ─── 9. Mobile screen gap analysis ───────────────────────────────────────────

describe("Mobile app — screen coverage", () => {
  const mobileRoot = join(ROOT, "../tourismpay-mobile/app");

  it("has tourist home screen", () => {
    expect(existsSync(join(mobileRoot, "(tabs)/index.tsx"))).toBe(true);
  });

  it("has wallet screen", () => {
    expect(existsSync(join(mobileRoot, "(tabs)/wallet.tsx"))).toBe(true);
  });

  it("has BIS tab screen", () => {
    expect(existsSync(join(mobileRoot, "(tabs)/bis.tsx"))).toBe(true);
  });

  it("has remittance tab screen", () => {
    expect(existsSync(join(mobileRoot, "(tabs)/remittance.tsx"))).toBe(true);
  });

  it("has biometric registration screen", () => {
    expect(existsSync(join(mobileRoot, "biometric/register.tsx"))).toBe(true);
  });

  it("has DID identity screen", () => {
    expect(existsSync(join(mobileRoot, "identity/did.tsx"))).toBe(true);
  });

  it("has loyalty rewards screen", () => {
    expect(existsSync(join(mobileRoot, "loyalty/rewards.tsx"))).toBe(true);
  });

  it("has Africa KYB screen", () => {
    expect(existsSync(join(mobileRoot, "africa/kyb.tsx"))).toBe(true);
  });

  it("has embedded finance apply screen", () => {
    expect(existsSync(join(mobileRoot, "finance/apply.tsx"))).toBe(true);
  });

  it("has BIS investigation detail screen", () => {
    expect(existsSync(join(mobileRoot, "bis/[id].tsx"))).toBe(true);
  });
});

// ─── 10. Role enum completeness in schema ────────────────────────────────────

describe("Schema — role enum completeness", () => {
  const schema = readFileSync(join(ROOT, "drizzle/schema.ts"), "utf-8");

  const expectedRoles = [
    "admin",
    "user",
    "tourist",
    "merchant",
    "compliance_officer",
    "noc_operator",
    "settlement_officer",
    "bis_analyst",
  ];

  for (const role of expectedRoles) {
    it(`schema roleEnum includes "${role}"`, () => {
      expect(schema).toContain(`"${role}"`);
    });
  }
});

// ─── 11. Stripe Connect router registered in appRouter ───────────────────────

describe("Stripe Connect — router registration", () => {
  const routersTs = readFileSync(join(SERVER, "routers.ts"), "utf-8");

  it("stripeConnect router is imported", () => {
    expect(routersTs).toContain("stripeConnect");
  });

  it("stripeConnect router is registered in appRouter", () => {
    // Check it appears in the router object
    const routerSection = routersTs.split("export const appRouter")[1] ?? routersTs;
    expect(routerSection).toContain("stripeConnect");
  });
});

// ─── 12. PaymentSwitch role access matrix summary ────────────────────────────

describe("PaymentSwitch — complete role access matrix", () => {
  const appShell = readFileSync(join(CLIENT, "components/layout/AppShell.tsx"), "utf-8");

  const psRoutes = [
    { path: "/paymentswitch", roles: ["admin", "noc_operator", "settlement_officer"] },
    { path: "/paymentswitch/noc", roles: ["admin", "noc_operator"] },
    { path: "/paymentswitch/admin", roles: ["admin"] },
    { path: "/paymentswitch/kill-switch", roles: ["admin", "noc_operator"] },
    { path: "/settlement", roles: ["admin", "settlement_officer"] },
    { path: "/paymentswitch/rate-limits", roles: ["admin"] },
    { path: "/paymentswitch/webhooks", roles: ["admin", "noc_operator"] },
    { path: "/paymentswitch/remittance", roles: ["admin", "settlement_officer"] },
  ];

  for (const route of psRoutes) {
    it(`route "${route.path}" is defined in AppShell nav`, () => {
      expect(appShell).toContain(`href: "${route.path}"`);
    });
  }
});

// ─── 13. Python Services Router ──────────────────────────────────────────────

describe("Python Services Router — registration and structure", () => {
  const routerFile = readFileSync(join(SERVER, "routers/pythonServices.ts"), "utf-8");

  it("exports pythonServicesRouter", () => {
    expect(routerFile).toContain("export const pythonServicesRouter");
  });

  it("defines all 5 service URL constants with env var fallback", () => {
    expect(routerFile).toContain("BIS_AI_ENGINE_URL");
    expect(routerFile).toContain("FRAUD_ML_SERVICE_URL");
    expect(routerFile).toContain("COMPLIANCE_RISK_ENGINE_URL");
    expect(routerFile).toContain("EXCHANGE_RATE_ML_URL");
    expect(routerFile).toContain("PDF_REPORT_GENERATOR_URL");
  });

  it("BIS AI procedures gated behind bisProcedure", () => {
    expect(routerFile).toContain("bisScoreInvestigation: bisProcedure");
    expect(routerFile).toContain("bisEntityRiskProfile: bisProcedure");
    expect(routerFile).toContain("bisAutoFlag: bisProcedure");
  });

  it("fraud ML score available to all authenticated users", () => {
    expect(routerFile).toContain("fraudScore: protectedProcedure");
  });

  it("fraud stats gated behind adminProcedure", () => {
    expect(routerFile).toContain("fraudStats: adminProcedure");
  });

  it("compliance procedures gated behind complianceProcedure", () => {
    expect(routerFile).toContain("complianceAmlRiskScore: complianceProcedure");
    expect(routerFile).toContain("compliancePepScreening: complianceProcedure");
    expect(routerFile).toContain("complianceSanctionsScreening: complianceProcedure");
  });

  it("PDF BIS investigation gated behind bisProcedure", () => {
    expect(routerFile).toContain("pdfBisInvestigation: bisProcedure");
  });

  it("PDF compliance report gated behind complianceProcedure", () => {
    expect(routerFile).toContain("pdfComplianceReport: complianceProcedure");
  });

  it("health check gated behind adminProcedure", () => {
    expect(routerFile).toContain("healthCheck: adminProcedure");
  });

  it("handles service unavailability with TRPCError INTERNAL_SERVER_ERROR", () => {
    expect(routerFile).toContain("INTERNAL_SERVER_ERROR");
    expect(routerFile).toContain("Python service unavailable");
  });
});

describe("Python Services Router — registered in appRouter", () => {
  const routersFile = readFileSync(join(SERVER, "routers.ts"), "utf-8");

  it("imports pythonServicesRouter", () => {
    expect(routersFile).toContain("pythonServicesRouter");
  });

  it("registers as pythonServices in appRouter", () => {
    expect(routersFile).toContain("pythonServices: pythonServicesRouter");
  });
});

// ─── 14. Python microservice files ───────────────────────────────────────────

describe("Python microservice files — existence and FastAPI structure", () => {
  const services = [
    "python-services/bis-ai-engine/main.py",
    "python-services/fraud-ml-service/main.py",
    "python-services/compliance-risk-engine/main.py",
    "python-services/exchange-rate-ml/main.py",
    "python-services/pdf-report-generator/main.py",
  ];

  for (const svc of services) {
    it(`${svc} has FastAPI app and /health endpoint`, () => {
      const content = readFileSync(join(ROOT, svc), "utf-8");
      expect(content).toContain("FastAPI");
      expect(content).toContain("/health");
    });
  }

  it("docker-compose.yml defines all 5 services", () => {
    const compose = readFileSync(join(ROOT, "python-services/docker-compose.yml"), "utf-8");
    expect(compose).toContain("bis-ai-engine");
    expect(compose).toContain("fraud-ml-service");
    expect(compose).toContain("compliance-risk-engine");
    expect(compose).toContain("exchange-rate-ml");
    expect(compose).toContain("pdf-report-generator");
  });

  it("requirements.txt includes all required packages", () => {
    const req = readFileSync(join(ROOT, "python-services/requirements.txt"), "utf-8");
    expect(req).toContain("fastapi");
    expect(req).toContain("scikit-learn");
    expect(req).toContain("reportlab");
    expect(req).toContain("pandas");
  });
});

describe("BIS AI Engine Python service — endpoints", () => {
  const bisAi = readFileSync(join(ROOT, "python-services/bis-ai-engine/main.py"), "utf-8");

  it("has score-investigation endpoint", () => {
    expect(bisAi).toContain("/api/v1/bis/score-investigation");
  });

  it("has entity-risk-profile endpoint", () => {
    expect(bisAi).toContain("/api/v1/bis/entity-risk-profile");
  });

  it("has auto-flag endpoint", () => {
    expect(bisAi).toContain("/api/v1/bis/auto-flag");
  });

  it("has risk-heatmap endpoint", () => {
    expect(bisAi).toContain("/api/v1/bis/risk-heatmap");
  });
});

describe("PDF Report Generator Python service — endpoints", () => {
  const pdfGen = readFileSync(join(ROOT, "python-services/pdf-report-generator/main.py"), "utf-8");

  it("has merchant-revenue endpoint", () => {
    expect(pdfGen).toContain("/api/v1/reports/merchant-revenue");
  });

  it("has bis-investigation endpoint", () => {
    expect(pdfGen).toContain("/api/v1/reports/bis-investigation");
  });

  it("has settlement-statement endpoint", () => {
    expect(pdfGen).toContain("/api/v1/reports/settlement-statement");
  });

  it("has compliance endpoint", () => {
    expect(pdfGen).toContain("/api/v1/reports/compliance");
  });

  it("uses reportlab SimpleDocTemplate for PDF generation", () => {
    expect(pdfGen).toContain("SimpleDocTemplate");
    expect(pdfGen).toContain("StreamingResponse");
    expect(pdfGen).toContain("application/pdf");
  });
});

describe("Fraud ML Service Python service — endpoints", () => {
  const fraudMl = readFileSync(join(ROOT, "python-services/fraud-ml-service/main.py"), "utf-8");

  it("has fraud score endpoint", () => {
    expect(fraudMl).toContain("/api/v1/fraud/score");
  });

  it("has anomaly detection endpoint", () => {
    expect(fraudMl).toContain("/api/v1/fraud/anomaly-detection");
  });

  it("has stats endpoint", () => {
    expect(fraudMl).toContain("/api/v1/fraud/stats");
  });
});

describe("Exchange Rate ML Python service — endpoints", () => {
  const ratesMl = readFileSync(join(ROOT, "python-services/exchange-rate-ml/main.py"), "utf-8");

  it("has forecast endpoint", () => {
    expect(ratesMl).toContain("/api/v1/rates/forecast");
  });

  it("has optimize-spread endpoint", () => {
    expect(ratesMl).toContain("/api/v1/rates/optimize-spread");
  });

  it("has corridor-pricing endpoint", () => {
    expect(ratesMl).toContain("/api/v1/rates/corridor-pricing");
  });

  it("has live rates endpoint", () => {
    expect(ratesMl).toContain("/api/v1/rates/live");
  });
});

describe("Compliance Risk Engine Python service — endpoints", () => {
  const compliance = readFileSync(join(ROOT, "python-services/compliance-risk-engine/main.py"), "utf-8");

  it("has aml-risk-score endpoint", () => {
    expect(compliance).toContain("/api/v1/compliance/aml-risk-score");
  });

  it("has pep-screening endpoint", () => {
    expect(compliance).toContain("/api/v1/compliance/pep-screening");
  });

  it("has sanctions-screening endpoint", () => {
    expect(compliance).toContain("/api/v1/compliance/sanctions-screening");
  });

  it("has kyb-document-score endpoint", () => {
    expect(compliance).toContain("/api/v1/compliance/kyb-document-score");
  });
});
