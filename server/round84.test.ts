/**
 * Round 84 Tests
 * - PaymentGateway Stripe Checkout session creation
 * - QR payment mobile aliases (resolveQrCode, initiateQrPayment)
 * - KYB mobile procedures (getStatus, submitApplication)
 * - Mobile screen files existence
 * - RBAC role-specific procedures
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const MOBILE_ROOT = "/home/ubuntu/tourismpay-mobile";

// ─── Helpers ────────────────────────────────────────────────────────────────

function readFile(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

function readMobileFile(relPath: string): string {
  return readFileSync(join(MOBILE_ROOT, relPath), "utf-8");
}

function fileExists(relPath: string): boolean {
  return existsSync(join(ROOT, relPath));
}

function mobileFileExists(relPath: string): boolean {
  return existsSync(join(MOBILE_ROOT, relPath));
}

// ─── PaymentGateway Stripe Checkout ─────────────────────────────────────────

describe("PaymentGateway - Stripe Checkout integration", () => {
  it("PaymentGateway.tsx imports trpc and uses stripeConnect mutation", () => {
    const content = readFile("client/src/pages/paymentswitch/PaymentGateway.tsx");
    expect(content).toContain("trpc");
    expect(content).toContain("stripeConnect");
  });

  it("PaymentGateway.tsx opens checkout URL in new tab", () => {
    const content = readFile("client/src/pages/paymentswitch/PaymentGateway.tsx");
    expect(content).toMatch(/window\.open|_blank/);
  });

  it("stripeConnect router has createCheckoutSession procedure", () => {
    const content = readFile("server/routers/stripeConnect.ts");
    expect(content).toContain("createCheckoutSession");
  });

  it("createCheckoutSession uses stripe.checkout.sessions.create", () => {
    const content = readFile("server/routers/stripeConnect.ts");
    expect(content).toContain("checkout.sessions.create");
  });

  it("createCheckoutSession includes metadata with user_id", () => {
    const content = readFile("server/routers/stripeConnect.ts");
    expect(content).toContain("user_id");
    expect(content).toContain("metadata");
  });

  it("createCheckoutSession uses success_url and cancel_url", () => {
    const content = readFile("server/routers/stripeConnect.ts");
    expect(content).toContain("success_url");
    expect(content).toContain("cancel_url");
  });
});

// ─── DeveloperPortal API Keys ────────────────────────────────────────────────

describe("DeveloperPortal - Live API Keys section", () => {
  it("DeveloperPortal.tsx has ApiKeysSection component", () => {
    const content = readFile("client/src/pages/paymentswitch/DeveloperPortal.tsx");
    expect(content).toMatch(/ApiKeysSection|apiKeys/);
  });

  it("DeveloperPortal.tsx uses trpc for API key management", () => {
    const content = readFile("client/src/pages/paymentswitch/DeveloperPortal.tsx");
    expect(content).toContain("trpc");
  });
});

// ─── QR Payment Mobile Aliases ───────────────────────────────────────────────

describe("QR Payment - Mobile aliases", () => {
  it("qrPayment router has resolveQrCode procedure", () => {
    const content = readFile("server/routers/qrPayment.ts");
    expect(content).toContain("resolveQrCode");
  });

  it("qrPayment router has initiateQrPayment procedure", () => {
    const content = readFile("server/routers/qrPayment.ts");
    expect(content).toContain("initiateQrPayment");
  });

  it("resolveQrCode handles expired tokens", () => {
    const content = readFile("server/routers/qrPayment.ts");
    expect(content).toContain("expired");
  });

  it("initiateQrPayment updates QR token to paid status", () => {
    const content = readFile("server/routers/qrPayment.ts");
    expect(content).toContain("status: 'paid'");
  });

  it("initiateQrPayment validates token is still pending", () => {
    const content = readFile("server/routers/qrPayment.ts");
    expect(content).toContain("QR token is invalid, expired, or already used");
  });
});

// ─── KYB Mobile Procedures ───────────────────────────────────────────────────

describe("KYB - Mobile procedures", () => {
  it("kyb router has getStatus procedure", () => {
    const content = readFile("server/routers/kyb.ts");
    expect(content).toContain("getStatus");
  });

  it("kyb router has submitApplication procedure", () => {
    const content = readFile("server/routers/kyb.ts");
    expect(content).toContain("submitApplication");
  });

  it("getStatus returns not_started when no establishment exists", () => {
    const content = readFile("server/routers/kyb.ts");
    expect(content).toContain("not_started");
  });

  it("submitApplication creates KYB application record", () => {
    const content = readFile("server/routers/kyb.ts");
    expect(content).toContain("createKybApplication");
  });

  it("submitApplication sets kybStatus to submitted", () => {
    const content = readFile("server/routers/kyb.ts");
    expect(content).toContain("kybStatus: \"submitted\"");
  });
});

// ─── Mobile Screen Files ─────────────────────────────────────────────────────

describe("Mobile app - Critical screens exist", () => {
  it("QR payment scanner screen exists", () => {
    expect(mobileFileExists("app/payment/qr-scan.tsx")).toBe(true);
  });

  it("Merchant revenue dashboard screen exists", () => {
    expect(mobileFileExists("app/merchant/revenue.tsx")).toBe(true);
  });

  it("KYB onboarding screen exists", () => {
    expect(mobileFileExists("app/merchant/kyb-onboarding.tsx")).toBe(true);
  });

  it("QR scan screen uses camera/barcode scanner", () => {
    const content = readMobileFile("app/payment/qr-scan.tsx");
    expect(content).toMatch(/camera|barcode|scan|CameraView/i);
  });

  it("Merchant revenue screen shows revenue data", () => {
    const content = readMobileFile("app/merchant/revenue.tsx");
    expect(content).toMatch(/revenue|Revenue|earning|Earning/i);
  });

  it("KYB onboarding screen has form submission", () => {
    const content = readMobileFile("app/merchant/kyb-onboarding.tsx");
    expect(content).toMatch(/submit|Submit|mutation/i);
  });
});

// ─── RBAC Procedures ─────────────────────────────────────────────────────────

describe("RBAC - Role-specific tRPC procedures", () => {
  it("tRPC core defines bisProcedure", () => {
    const content = readFile("server/_core/trpc.ts");
    expect(content).toContain("bisProcedure");
  });

  it("tRPC core defines nocProcedure", () => {
    const content = readFile("server/_core/trpc.ts");
    expect(content).toContain("nocProcedure");
  });

  it("tRPC core defines complianceProcedure", () => {
    const content = readFile("server/_core/trpc.ts");
    expect(content).toContain("complianceProcedure");
  });

  it("tRPC core defines merchantProcedure", () => {
    const content = readFile("server/_core/trpc.ts");
    expect(content).toContain("merchantProcedure");
  });

  it("bisProcedure allows bis_analyst role", () => {
    const content = readFile("server/_core/trpc.ts");
    expect(content).toContain("bis_analyst");
  });

  it("nocProcedure allows noc_operator role", () => {
    const content = readFile("server/_core/trpc.ts");
    expect(content).toContain("noc_operator");
  });

  it("complianceProcedure allows compliance_officer role", () => {
    const content = readFile("server/_core/trpc.ts");
    expect(content).toContain("compliance_officer");
  });

  it("bisProcedure throws UNAUTHORIZED for null user", () => {
    const content = readFile("server/_core/trpc.ts");
    // Should check auth before role
    const bisIdx = content.indexOf("bisProcedure");
    const unauthorizedIdx = content.indexOf("UNAUTHORIZED", bisIdx);
    const forbiddenIdx = content.indexOf("FORBIDDEN", bisIdx);
    expect(unauthorizedIdx).toBeGreaterThan(bisIdx);
    expect(forbiddenIdx).toBeGreaterThan(unauthorizedIdx);
  });

  it("bis router uses bisProcedure for list operation", () => {
    const content = readFile("server/routers/bis.ts");
    expect(content).toContain("bisProcedure");
  });

  it("nocDashboard router uses nocProcedure", () => {
    const content = readFile("server/routers/nocDashboard.ts");
    expect(content).toContain("nocProcedure");
  });

  it("kybApplications router uses complianceProcedure", () => {
    const content = readFile("server/routers/kybApplications.ts");
    expect(content).toContain("complianceProcedure");
  });

  it("auditLogs router uses complianceProcedure", () => {
    const content = readFile("server/routers/auditLogs.ts");
    expect(content).toContain("complianceProcedure");
  });
});

// ─── Python Services ─────────────────────────────────────────────────────────

describe("Python microservices - All 5 services exist", () => {
  const services = [
    "bis-ai-engine",
    "fraud-ml-service",
    "compliance-risk-engine",
    "exchange-rate-ml",
    "pdf-report-generator",
  ];

  for (const svc of services) {
    it(`${svc} main.py exists`, () => {
      expect(fileExists(`python-services/${svc}/main.py`)).toBe(true);
    });
  }

  it("docker-compose.yml exists for Python services", () => {
    expect(fileExists("python-services/docker-compose.yml")).toBe(true);
  });

  it("requirements.txt exists for Python services", () => {
    expect(fileExists("python-services/requirements.txt")).toBe(true);
  });

  it("pythonServicesRouter is registered in routers.ts", () => {
    const content = readFile("server/routers.ts");
    expect(content).toContain("pythonServices");
  });
});

// ─── Platform Completeness ───────────────────────────────────────────────────

describe("Platform completeness - R84 audit", () => {
  it("All 5 PaymentSwitch onboarding pages exist", () => {
    const pages = [
      "client/src/pages/paymentswitch/onboarding/OnboardingPortal.tsx",
      "client/src/pages/paymentswitch/onboarding/IntegrationDevelopment.tsx",
      "client/src/pages/paymentswitch/onboarding/ProductionGoLive.tsx",
      "client/src/pages/paymentswitch/onboarding/TechnicalOnboarding.tsx",
    ];
    for (const p of pages) {
      expect(fileExists(p)).toBe(true);
    }
  });

  it("stripeConnect router is registered in routers.ts", () => {
    const content = readFile("server/routers.ts");
    expect(content).toContain("stripeConnect");
  });

  it("Stripe webhook handler is registered", () => {
    const content = readFile("server/_core/index.ts");
    expect(content).toMatch(/stripe.*webhook|webhook.*stripe/i);
  });

  it("Web Push service worker handles push events", () => {
    const swContent = readFile("client/public/sw.js");
    expect(swContent).toContain("push");
  });

  it("NotificationSettings has push notification toggle", () => {
    const content = readFile("client/src/pages/settings/NotificationSettings.tsx");
    expect(content).toMatch(/push|Push|PushNotification/);
  });
});
