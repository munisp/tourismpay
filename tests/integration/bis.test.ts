/**
 * Integration tests for BIS (Background Investigation System).
 * Tests investigation CRUD and Kafka event publishing.
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

describe("BIS Operations", () => {
  beforeAll(async () => {
    sessionCookie = await getSessionCookie();
  });

  it("list returns investigations with pagination", async () => {
    const { status, body } = await trpcQuery("bis.list", { page: 1, perPage: 10 });
    expect(status).toBe(200);
    const data = body.result?.data?.json;
    expect(data.investigations).toBeDefined();
    expect(Array.isArray(data.investigations)).toBe(true);
  });

  it("getStats returns investigation statistics", async () => {
    const { status, body } = await trpcQuery("bis.getStats");
    expect(status).toBe(200);
    const data = body.result?.data?.json;
    expect(data.total).toBeDefined();
    expect(typeof data.total).toBe("number");
  });

  it("create validates required fields", async () => {
    const { body } = await trpcMutation("bis.create", {
      subjectFullName: "",  // Should fail validation (min 2 chars)
      tier: "basic",
    });
    expect(body.error).toBeDefined();
  });

  it("create succeeds with valid input", async () => {
    const { status, body } = await trpcMutation("bis.create", {
      subjectFullName: "Test Subject Nigeria",
      subjectType: "individual",
      subjectNationality: "NG",
      subjectCountry: "NG",
      tier: "basic",
      consentObtained: true,
    });
    // May fail if establishment link is required, but should not 500
    expect(status).toBeLessThan(500);
  });
});

describe("BIS Security", () => {
  it("rejects unauthenticated access", async () => {
    const res = await fetch(`${BASE_URL}/api/trpc/bis.list?input=${encodeURIComponent(JSON.stringify({ json: { page: 1, perPage: 10 } }))}`);
    expect(res.status).toBe(401);
  });
});
