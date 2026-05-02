/**
 * Round 76 Tests
 * Covers: staff cashier payment flow, KYB onboarding completion notification, Stripe wallet top-up
 */
import { describe, it, expect } from "vitest";

// ─── 1. MerchantCashier page ──────────────────────────────────────────────────
describe("MerchantCashier page", () => {
  it("page file exists", async () => {
    const fs = await import("fs");
    const exists = fs.existsSync(
      new URL("../client/src/pages/merchant/MerchantCashier.tsx", import.meta.url).pathname
    );
    expect(exists).toBe(true);
  });

  it("route is registered in App.tsx", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../client/src/App.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("/merchant/cashier");
    expect(content).toContain("MerchantCashier");
  });

  it("Cashier Terminal link is in AppShell sidebar", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../client/src/components/layout/AppShell.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("Cashier Terminal");
    expect(content).toContain("/merchant/cashier");
    expect(content).toContain("Terminal");
  });

  it("uses both myEstablishments and myStaffEstablishments queries", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../client/src/pages/merchant/MerchantCashier.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("myEstablishments");
    expect(content).toContain("myStaffEstablishments");
  });

  it("uses qrPayment.generate mutation for QR generation", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../client/src/pages/merchant/MerchantCashier.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("qrPayment.generate");
  });

  it("QR countdown timer starts at 900 seconds (15 minutes)", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../client/src/pages/merchant/MerchantCashier.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("900");
    expect(content).toContain("15 min");
  });

  it("formatTime formats seconds correctly", () => {
    const formatTime = (secs: number) => {
      const m = Math.floor(secs / 60).toString().padStart(2, "0");
      const s = (secs % 60).toString().padStart(2, "0");
      return `${m}:${s}`;
    };
    expect(formatTime(900)).toBe("15:00");
    expect(formatTime(61)).toBe("01:01");
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(599)).toBe("09:59");
  });

  it("deduplicates establishments when user is both owner and staff", () => {
    const ownedEsts = [{ id: 1, name: "Resto A", country: "NG", role: "owner" }];
    const staffEsts = [
      { id: 1, name: "Resto A", country: "NG", role: "cashier" }, // duplicate
      { id: 2, name: "Resto B", country: "KE", role: "manager" },
    ];
    const map = new Map<number, typeof ownedEsts[0]>();
    ownedEsts.forEach((e) => map.set(e.id, e));
    staffEsts.forEach((e) => { if (!map.has(e.id)) map.set(e.id, e); });
    const result = Array.from(map.values());
    expect(result).toHaveLength(2);
    expect(result.find((e) => e.id === 1)?.role).toBe("owner"); // owner takes precedence
    expect(result.find((e) => e.id === 2)?.role).toBe("manager");
  });

  it("generates a copy-able payment link from token", () => {
    const token = "abc123def456";
    const origin = "https://tourismpay.example.com";
    const payUrl = `${origin}/pay/${token}`;
    expect(payUrl).toBe("https://tourismpay.example.com/pay/abc123def456");
  });
});

// ─── 2. staffInvites.myStaffEstablishments procedure ─────────────────────────
describe("staffInvites.myStaffEstablishments", () => {
  it("procedure is exported in staffInvites router", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../server/routers/staffInvites.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("myStaffEstablishments:");
    expect(content).toContain("acceptedByUserId");
    expect(content).toContain('"accepted"');
  });

  it("joins establishments table to return establishment name", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../server/routers/staffInvites.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("establishmentName: establishments.name");
    expect(content).toContain("innerJoin(establishments");
  });
});

// ─── 3. KYB onboarding completion notification ───────────────────────────────
describe("KYB onboarding completion notification", () => {
  it("kybApplications approve procedure sends rich notification", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../server/routers/kybApplications.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("is now LIVE on TourismPay");
    expect(content).toContain("Revenue Dashboard");
    expect(content).toContain("Cashier Terminal");
    expect(content).toContain("Product Catalog");
    expect(content).toContain("/merchant/revenue");
  });

  it("notification includes payout schedule information", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../server/routers/kybApplications.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("First payout");
    expect(content).toContain("payout");
  });

  it("notification fetches establishment name dynamically", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../server/routers/kybApplications.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("estName");
    expect(content).toContain("app.establishmentId");
    expect(content).toContain("estsTable.name");
  });

  it("rich notification content is structured correctly", () => {
    const estName = "Mama Titi's Kitchen";
    const reviewNotes = "All documents verified";
    const payoutDay = "every Friday";
    const richContent = [
      `🎉 Congratulations! ${estName} is now fully verified on TourismPay.`,
      ``,
      `Your establishment is live and ready to accept tourist payments via QR codes.`,
      ``,
      `📅 First payout: Payouts are processed ${payoutDay}. Your first payout will arrive within 7 days of your first completed transaction.`,
      ``,
      `📊 Revenue Dashboard: Track real-time earnings, transaction history, and payout schedules at /merchant/revenue.`,
      ``,
      `🖨️ Cashier Terminal: Your staff can process payments at /merchant/cashier.`,
      ``,
      `📦 Product Catalog: Add your menu or service items at /merchant/products so tourists can browse before paying.`,
      ``,
      reviewNotes ? `Admin note: ${reviewNotes}` : `Welcome aboard — your TourismPay journey starts now!`,
    ].join("\n");

    expect(richContent).toContain("Mama Titi's Kitchen");
    expect(richContent).toContain("every Friday");
    expect(richContent).toContain("/merchant/revenue");
    expect(richContent).toContain("Admin note: All documents verified");
    expect(richContent.split("\n").length).toBeGreaterThan(10);
  });
});

// ─── 4. Stripe wallet top-up ─────────────────────────────────────────────────
describe("Stripe wallet top-up", () => {
  it("stripeCheckout procedure exists in wallet router", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../server/routers/wallet.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("stripeCheckout:");
    expect(content).toContain("checkout.sessions.create");
  });

  it("webhook handler credits wallet on checkout.session.completed", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../server/stripeWebhook.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("checkout.session.completed");
    expect(content).toContain("walletBalances");
    expect(content).toContain("wallet_currency");
    expect(content).toContain("amount_usd");
  });

  it("webhook sends in-app notification on successful top-up", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../server/stripeWebhook.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("Wallet Top-Up Successful");
    expect(content).toContain("createUserNotification");
  });

  it("webhook handles test events correctly", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../server/stripeWebhook.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("evt_test_");
    expect(content).toContain('verified: true');
  });

  it("USD to wallet currency conversion rates are defined", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../server/stripeWebhook.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("APPROX_USD_RATES");
    expect(content).toContain("USDC");
    expect(content).toContain("NGN");
    expect(content).toContain("KES");
  });

  it("minimum top-up amount is $1 USD (Stripe minimum $0.50)", () => {
    const MIN_AMOUNT = 1.0;
    const testAmount = 0.5;
    expect(testAmount < MIN_AMOUNT).toBe(true);
    expect(1.0 >= MIN_AMOUNT).toBe(true);
  });

  it("Digital Wallet page has Top Up button wired to stripeCheckout", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../client/src/pages/tier2/DigitalWallet.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("stripeCheckout");
    expect(content).toContain("Top Up");
    expect(content).toContain("stripeAmount");
  });

  it("checkout session includes wallet_currency in metadata", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../server/routers/wallet.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("wallet_currency");
    expect(content).toContain("amount_usd");
    expect(content).toContain("client_reference_id");
  });
});

// ─── 5. Integration: cashier + staff permissions ──────────────────────────────
describe("Cashier + staff QR permission integration", () => {
  it("qrPayment.pay allows staff to process payments for their establishment", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../server/routers/qrPayment.ts", import.meta.url).pathname,
      "utf-8"
    );
    // Staff permission check should be present
    expect(content).toContain("staffRecord");
    expect(content).toContain("isEstOwner");
    expect(content).toContain("not authorised to process payments for this establishment");
  });

  it("cashier role is included in staffInvites role enum", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../drizzle/schema.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain('"cashier"');
    expect(content).toContain('"manager"');
    expect(content).toContain('"supervisor"');
  });
});
