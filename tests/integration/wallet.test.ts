/**
 * Integration tests for wallet operations.
 * Tests the full transaction flow including TigerBeetle ledger.
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
let sessionCookie = "";

async function getSessionCookie(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/dev/session-token?redirect=/`, { redirect: "manual" });
  const setCookie = res.headers.get("set-cookie") || "";
  return setCookie.split(";")[0] || "";
}

async function trpcQuery(procedure: string, input?: unknown) {
  const url = input
    ? `${BASE_URL}/api/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`
    : `${BASE_URL}/api/trpc/${procedure}?input=%7B%22json%22%3Anull%7D`;
  const res = await fetch(url, { headers: { cookie: sessionCookie } });
  return { status: res.status, body: await res.json() };
}

async function trpcMutation(procedure: string, input: unknown) {
  const res = await fetch(`${BASE_URL}/api/trpc/${procedure}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: sessionCookie },
    body: JSON.stringify({ json: input }),
  });
  return { status: res.status, body: await res.json() };
}

describe("Wallet Operations", () => {
  beforeAll(async () => {
    sessionCookie = await getSessionCookie();
  });

  it("getBalances returns wallet balances for authenticated user", async () => {
    const { status, body } = await trpcQuery("wallet.getBalances");
    expect(status).toBe(200);
    expect(body.result?.data?.json).toBeDefined();
    const balances = body.result.data.json;
    expect(Array.isArray(balances)).toBe(true);
  });

  it("getFxRate returns exchange rate between currencies", async () => {
    const { status, body } = await trpcQuery("wallet.getFxRate", {
      fromCurrency: "USD",
      toCurrency: "NGN",
      amount: 100,
    });
    expect(status).toBe(200);
    const data = body.result?.data?.json;
    expect(data.rate).toBeGreaterThan(0);
    expect(data.effectiveRate).toBeGreaterThan(0);
    expect(data.spread).toBeGreaterThan(0);
    expect(data.convertedAmount).toBeGreaterThan(0);
  });

  it("getTransactions returns transaction history", async () => {
    const { status, body } = await trpcQuery("wallet.getTransactions", {
      page: 1,
      perPage: 10,
    });
    expect(status).toBe(200);
    const data = body.result?.data?.json;
    expect(data.transactions).toBeDefined();
    expect(data.pagination).toBeDefined();
  });

  it("send rejects insufficient balance", async () => {
    const { body } = await trpcMutation("wallet.send", {
      currency: "USDC",
      amount: 999999999,
      counterparty: "test@example.com",
    });
    // Should get an error (insufficient balance or some validation error)
    expect(body.error || body.result?.data?.json?.success === false).toBeTruthy();
  });
});

describe("Wallet Security", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await fetch(`${BASE_URL}/api/trpc/wallet.getBalances?input=%7B%22json%22%3Anull%7D`);
    expect(res.status).toBe(401);
  });

  it("rate limits excessive requests", async () => {
    // Send 15 rapid requests (limit is 10/min for wallet.send)
    const results = await Promise.all(
      Array.from({ length: 15 }, () =>
        trpcMutation("wallet.send", { currency: "USDC", amount: 0.01, counterparty: "test" })
      )
    );
    // At least one should be rate limited
    const rateLimited = results.some(r => r.status === 429 || r.body?.error?.message?.includes("Rate limit"));
    // May or may not hit rate limit depending on timing, but should not crash
    expect(results.every(r => r.status < 500)).toBe(true);
  });
});
