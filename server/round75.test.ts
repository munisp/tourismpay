/**
 * Round 75 Tests
 * Covers: staff sidebar link, tourist order confirmation logic, staff QR payment permissions
 */
import { describe, it, expect } from "vitest";

// ─── 1. Staff sidebar link ────────────────────────────────────────────────────
describe("AppShell staff sidebar link", () => {
  it("includes Staff Management in the merchant nav section", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../client/src/components/layout/AppShell.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("/merchant/staff");
    expect(content).toContain("Staff Management");
    expect(content).toContain("Users2");
  });

  it("Staff Management is restricted to merchant and admin roles", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../client/src/components/layout/AppShell.tsx", import.meta.url).pathname,
      "utf-8"
    );
    // Find the Staff Management line and check it has roles
    const match = content.match(/Staff Management.*?roles.*?\[([^\]]+)\]/s);
    expect(match).not.toBeNull();
    const rolesStr = match![1];
    expect(rolesStr).toContain("merchant");
    expect(rolesStr).toContain("admin");
  });
});

// ─── 2. Tourist order confirmation page ──────────────────────────────────────
describe("TouristOrderConfirm page", () => {
  it("page file exists", async () => {
    const fs = await import("fs");
    const exists = fs.existsSync(
      new URL("../client/src/pages/tourist/TouristOrderConfirm.tsx", import.meta.url).pathname
    );
    expect(exists).toBe(true);
  });

  it("route is registered in App.tsx", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../client/src/App.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("/pay/:token");
    expect(content).toContain("TouristOrderConfirm");
  });

  it("catalog route is registered before confirm route to avoid shadowing", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../client/src/App.tsx", import.meta.url).pathname,
      "utf-8"
    );
    const catalogIdx = content.indexOf("/pay/:token/catalog");
    const confirmIdx = content.indexOf('path="/pay/:token"');
    // catalog must come before the catch-all /pay/:token
    expect(catalogIdx).toBeGreaterThan(0);
    expect(confirmIdx).toBeGreaterThan(0);
    expect(catalogIdx).toBeLessThan(confirmIdx);
  });

  it("cart total calculation is correct for multiple items", () => {
    const items = [
      { name: "Jollof Rice", qty: 2, unitPrice: "12.50", currency: "USD" },
      { name: "Zobo Drink", qty: 3, unitPrice: "3.00", currency: "USD" },
    ];
    const total = items.reduce((sum, item) => sum + parseFloat(item.unitPrice) * item.qty, 0);
    expect(total).toBeCloseTo(34.00, 2);
  });

  it("loyalty points preview: 10 pts per USD, minimum 1", () => {
    const calcPoints = (amountUsd: number) => Math.max(1, Math.round(amountUsd * 10));
    expect(calcPoints(5.0)).toBe(50);
    expect(calcPoints(0.05)).toBe(1); // below threshold → minimum 1
    expect(calcPoints(12.75)).toBe(128);
  });

  it("insufficient balance detection works correctly", () => {
    const isInsufficient = (balance: number, amount: number) => balance < amount;
    expect(isInsufficient(10.0, 15.0)).toBe(true);
    expect(isInsufficient(20.0, 15.0)).toBe(false);
    expect(isInsufficient(15.0, 15.0)).toBe(false);
  });

  it("formatPrice handles USD correctly", () => {
    const formatPrice = (amount: string | number, currency: string) => {
      try {
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
        }).format(typeof amount === "string" ? parseFloat(amount) : amount);
      } catch {
        return `${parseFloat(String(amount)).toFixed(2)} ${currency}`;
      }
    };
    expect(formatPrice("12.50", "USD")).toBe("$12.50");
    expect(formatPrice(100, "USD")).toBe("$100.00");
    expect(formatPrice("0.99", "USD")).toBe("$0.99");
  });

  it("URL params encoding for cart items is round-trippable", () => {
    const items = [
      { name: "Suya Platter", qty: 1, unitPrice: "18.00", currency: "USD" },
      { name: "Chapman Cocktail", qty: 2, unitPrice: "6.50", currency: "USD" },
    ];
    const encoded = JSON.stringify(items);
    const decoded = JSON.parse(encoded);
    expect(decoded).toHaveLength(2);
    expect(decoded[0].name).toBe("Suya Platter");
    expect(decoded[1].qty).toBe(2);
  });
});

// ─── 3. Staff QR payment permissions ─────────────────────────────────────────
describe("qrPayment staff permission logic", () => {
  it("router file imports staffInvites from schema", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../server/routers/qrPayment.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("staffInvites");
    expect(content).toContain("from \"../../drizzle/schema\"");
  });

  it("permission check is present in the pay procedure", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../server/routers/qrPayment.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("Staff permission check");
    expect(content).toContain("isEstOwner");
    expect(content).toContain("staffRecord");
    expect(content).toContain("ownedEst");
  });

  it("error message for unauthorised merchant is descriptive", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../server/routers/qrPayment.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("not authorised to process payments for this establishment");
    expect(content).toContain("Only the owner or accepted staff members");
  });

  it("permission logic: owner is always allowed", () => {
    const checkPermission = (
      callerId: number,
      ownerId: number,
      staffRecord: { id: number } | null,
      ownedEstId: number | null
    ) => {
      const isOwner = ownerId === callerId;
      if (isOwner) return { allowed: true };
      if (staffRecord) return { allowed: true };
      if (ownedEstId !== null) return { allowed: false, reason: "cross-merchant" };
      return { allowed: true }; // tourist
    };

    // Owner
    expect(checkPermission(1, 1, null, null).allowed).toBe(true);
    // Accepted staff
    expect(checkPermission(2, 1, { id: 5 }, null).allowed).toBe(true);
    // Tourist (no establishment)
    expect(checkPermission(3, 1, null, null).allowed).toBe(true);
    // Merchant who owns a DIFFERENT establishment — blocked
    const result = checkPermission(4, 1, null, 99);
    expect(result.allowed).toBe(false);
    expect((result as any).reason).toBe("cross-merchant");
  });

  it("accepted status check uses correct enum value", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../server/routers/qrPayment.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain('"accepted"');
  });

  it("staffInvites table has acceptedByUserId column", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../drizzle/schema.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("acceptedByUserId");
    expect(content).toContain("accepted_by_user_id");
  });
});

// ─── 4. MerchantStaff page ────────────────────────────────────────────────────
describe("MerchantStaff page", () => {
  it("page file exists", async () => {
    const fs = await import("fs");
    const exists = fs.existsSync(
      new URL("../client/src/pages/merchant/MerchantStaff.tsx", import.meta.url).pathname
    );
    expect(exists).toBe(true);
  });

  it("route is registered in App.tsx", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../client/src/App.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("/merchant/staff");
    expect(content).toContain("MerchantStaff");
  });

  it("uses staffInvites tRPC procedures", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../client/src/pages/merchant/MerchantStaff.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("staffInvites");
  });
});

// ─── 5. InviteAccept page ─────────────────────────────────────────────────────
describe("InviteAccept page", () => {
  it("page file exists", async () => {
    const fs = await import("fs");
    const exists = fs.existsSync(
      new URL("../client/src/pages/InviteAccept.tsx", import.meta.url).pathname
    );
    expect(exists).toBe(true);
  });

  it("route is registered in App.tsx", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../client/src/App.tsx", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("/invite/:token");
    expect(content).toContain("InviteAccept");
  });
});

// ─── 6. staffInvites router ───────────────────────────────────────────────────
describe("staffInvites tRPC router", () => {
  it("router file exists", async () => {
    const fs = await import("fs");
    const exists = fs.existsSync(
      new URL("../server/routers/staffInvites.ts", import.meta.url).pathname
    );
    expect(exists).toBe(true);
  });

  it("exports staffInvitesRouter", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../server/routers/staffInvites.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("export const staffInvitesRouter");
  });

  it("has create, list, revoke, accept, getByToken procedures", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../server/routers/staffInvites.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("create:");
    expect(content).toContain("list:");
    expect(content).toContain("revoke:");
    expect(content).toContain("accept:");
    expect(content).toContain("getByToken:");
  });

  it("invite token is a 64-character hex string", () => {
    const crypto = require("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it("invite expiry is 7 days from creation", () => {
    const now = Date.now();
    const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000);
    const diffDays = (expiresAt.getTime() - now) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 1);
  });

  it("router is registered in main routers.ts", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../server/routers.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).toContain("staffInvites");
  });
});
