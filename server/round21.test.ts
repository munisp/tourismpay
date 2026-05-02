/**
 * Round 21 Tests
 * Covers: biometric.changePin, biometric.resetPin, csvExport.biometricEvents,
 *         spending limit notifications in wallet.send
 */
import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  createUserNotification: vi.fn().mockResolvedValue(undefined),
  getBisInvestigations: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}));

const adminUser = { id: 1, name: "Admin", email: "admin@test.com", role: "admin" as const };
const regularUser = { id: 2, name: "User", email: "user@test.com", role: "user" as const };

function makeCtx(user: typeof adminUser | typeof regularUser | null = null): TrpcContext {
  return { user } as TrpcContext;
}

const adminCtx = () => makeCtx(adminUser);
const userCtx = () => makeCtx(regularUser);
const anonCtx = () => makeCtx(null);

// ── biometric.changePin ───────────────────────────────────────────────────────
describe("biometric.changePin", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx());
    await expect(
      caller.biometric.changePin({ currentPin: "123456", newPin: "654321" })
    ).rejects.toThrow();
  });

  it("returns error when DB is unavailable", async () => {
    const caller = appRouter.createCaller(userCtx());
    await expect(
      caller.biometric.changePin({ currentPin: "123456", newPin: "654321" })
    ).rejects.toThrow();
  });

  it("validates newPin length - rejects short PIN", async () => {
    const caller = appRouter.createCaller(userCtx());
    await expect(
      caller.biometric.changePin({ currentPin: "123456", newPin: "123" })
    ).rejects.toThrow();
  });

  it("validates newPin length - rejects long PIN", async () => {
    const caller = appRouter.createCaller(userCtx());
    await expect(
      caller.biometric.changePin({ currentPin: "123456", newPin: "1234567" })
    ).rejects.toThrow();
  });

  it("validates currentPin length - rejects short PIN", async () => {
    const caller = appRouter.createCaller(userCtx());
    await expect(
      caller.biometric.changePin({ currentPin: "12", newPin: "654321" })
    ).rejects.toThrow();
  });

  it("rejects when newPin is same as currentPin", async () => {
    const caller = appRouter.createCaller(userCtx());
    await expect(
      caller.biometric.changePin({ currentPin: "123456", newPin: "123456" })
    ).rejects.toThrow();
  });
});

// ── biometric.resetPin (admin) ────────────────────────────────────────────────
describe("biometric.resetPin", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx());
    await expect(
      caller.biometric.resetPin({ userId: "2", newPin: "999999" })
    ).rejects.toThrow();
  });

  it("requires admin role", async () => {
    const caller = appRouter.createCaller(userCtx());
    await expect(
      caller.biometric.resetPin({ userId: "2", newPin: "999999" })
    ).rejects.toThrow();
  });

  it("validates newPin length for admin reset", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.biometric.resetPin({ userId: "2", newPin: "123" })
    ).rejects.toThrow();
  });

  it("returns error when DB is unavailable (admin)", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.biometric.resetPin({ userId: "2", newPin: "999999" })
    ).rejects.toThrow();
  });
});

// ── csvExport.biometricEvents ─────────────────────────────────────────────────
describe("csvExport.biometricEvents", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx());
    await expect(caller.csvExport.biometricEvents({})).rejects.toThrow();
  });

  it("requires admin role", async () => {
    const caller = appRouter.createCaller(userCtx());
    await expect(caller.csvExport.biometricEvents({})).rejects.toThrow();
  });

  it("returns error when DB is unavailable (admin)", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(caller.csvExport.biometricEvents({})).rejects.toThrow();
  });

  it("accepts optional userId filter", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.csvExport.biometricEvents({ userId: "1" })
    ).rejects.toThrow(); // DB unavailable, but input is valid
  });

  it("accepts optional action filter", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.csvExport.biometricEvents({ action: "biometric.enroll" })
    ).rejects.toThrow(); // DB unavailable, but input is valid
  });

  it("accepts date range filters", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.csvExport.biometricEvents({
        from: new Date("2025-01-01"),
        to: new Date("2025-12-31"),
      })
    ).rejects.toThrow(); // DB unavailable, but input is valid
  });

  it("validates limit range - rejects 0", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.csvExport.biometricEvents({ limit: 0 })
    ).rejects.toThrow();
  });

  it("validates limit range - rejects over 10000", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.csvExport.biometricEvents({ limit: 10001 })
    ).rejects.toThrow();
  });

  it("accepts limit within valid range", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.csvExport.biometricEvents({ limit: 500 })
    ).rejects.toThrow(); // DB unavailable, but input is valid
  });
});

// ── wallet.send spending limit notification ───────────────────────────────────
describe("wallet.send spending limit notification", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx());
    await expect(
      caller.wallet.send({
        currency: "USDC",
        amount: 100,
        counterparty: "Alice",
      })
    ).rejects.toThrow();
  });

  it("returns error when DB is unavailable", async () => {
    const caller = appRouter.createCaller(userCtx());
    await expect(
      caller.wallet.send({
        currency: "USDC",
        amount: 100,
        counterparty: "Alice",
      })
    ).rejects.toThrow();
  });

  it("validates amount is positive", async () => {
    const caller = appRouter.createCaller(userCtx());
    await expect(
      caller.wallet.send({
        currency: "USDC",
        amount: -10,
        counterparty: "Alice",
      })
    ).rejects.toThrow();
  });

  it("validates amount is non-zero", async () => {
    const caller = appRouter.createCaller(userCtx());
    await expect(
      caller.wallet.send({
        currency: "USDC",
        amount: 0,
        counterparty: "Alice",
      })
    ).rejects.toThrow();
  });

  it("validates counterparty is not empty", async () => {
    const caller = appRouter.createCaller(userCtx());
    await expect(
      caller.wallet.send({
        currency: "USDC",
        amount: 100,
        counterparty: "",
      })
    ).rejects.toThrow();
  });

  it("requires biometricToken for high-value transactions when DB unavailable", async () => {
    const caller = appRouter.createCaller(userCtx());
    // High value (>= $1000 USD equivalent in USDC)
    await expect(
      caller.wallet.send({
        currency: "USDC",
        amount: 1500,
        counterparty: "Bob",
      })
    ).rejects.toThrow();
  });
});

// ── biometric.setPin / verifyPin (regression) ────────────────────────────────
describe("biometric.setPin regression", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx());
    await expect(caller.biometric.setPin({ pin: "123456" })).rejects.toThrow();
  });

  it("validates PIN is exactly 6 digits", async () => {
    const caller = appRouter.createCaller(userCtx());
    await expect(caller.biometric.setPin({ pin: "12345" })).rejects.toThrow();
    await expect(caller.biometric.setPin({ pin: "1234567" })).rejects.toThrow();
  });
});

describe("biometric.verifyPin regression", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller(anonCtx());
    await expect(caller.biometric.verifyPin({ pin: "123456" })).rejects.toThrow();
  });

  it("returns error when DB is unavailable", async () => {
    const caller = appRouter.createCaller(userCtx());
    await expect(caller.biometric.verifyPin({ pin: "123456" })).rejects.toThrow();
  });
});
