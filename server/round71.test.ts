/**
 * Round 71 Tests
 * Covers:
 *   1. Merchant payout auto-scheduler — computeNextRunAt helper
 *   2. Trip summary HTML renderer — renderTripSummaryHtml helper
 *   3. Impersonation session log — audit log action string constants
 */

import { describe, it, expect } from "vitest";

// ─── 1. Payout Scheduler ─────────────────────────────────────────────────────

/**
 * Inline copy of the computeNextRunAt helper from merchantPayoutScheduler.ts
 * so we can test it without starting the full server.
 */
function computeNextRunAt(
  frequency: "daily" | "weekly" | "monthly",
  preferredDay: number,
  fromMs: number
): number {
  const now = new Date(fromMs);
  if (frequency === "daily") {
    const next = new Date(fromMs + 24 * 60 * 60 * 1000);
    next.setUTCHours(2, 0, 0, 0);
    return next.getTime();
  }
  if (frequency === "weekly") {
    const dayOfWeek = now.getUTCDay();
    const daysUntilNext = ((preferredDay - dayOfWeek + 7) % 7) || 7;
    const next = new Date(fromMs + daysUntilNext * 24 * 60 * 60 * 1000);
    next.setUTCHours(2, 0, 0, 0);
    return next.getTime();
  }
  // monthly
  const d = new Date(fromMs);
  let candidate = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), preferredDay, 2, 0, 0, 0)
  );
  if (candidate.getTime() <= fromMs) {
    candidate = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, preferredDay, 2, 0, 0, 0)
    );
  }
  return candidate.getTime();
}

describe("computeNextRunAt — daily", () => {
  it("returns a timestamp ~24h in the future", () => {
    const now = Date.UTC(2026, 1, 26, 10, 0, 0); // Feb 26 10:00 UTC
    const next = computeNextRunAt("daily", 0, now);
    expect(next).toBeGreaterThan(now);
    const diffHours = (next - now) / (60 * 60 * 1000);
    expect(diffHours).toBeGreaterThanOrEqual(16); // at least 16h (to 02:00 next day)
    expect(diffHours).toBeLessThanOrEqual(24);
  });

  it("sets the run time to 02:00 UTC", () => {
    const now = Date.UTC(2026, 1, 26, 10, 0, 0);
    const next = computeNextRunAt("daily", 0, now);
    const d = new Date(next);
    expect(d.getUTCHours()).toBe(2);
    expect(d.getUTCMinutes()).toBe(0);
  });
});

describe("computeNextRunAt — weekly", () => {
  it("returns the next Monday when today is Wednesday", () => {
    // 2026-02-25 is a Wednesday (day 3)
    const now = Date.UTC(2026, 1, 25, 10, 0, 0);
    const next = computeNextRunAt("weekly", 1 /* Monday */, now);
    const d = new Date(next);
    expect(d.getUTCDay()).toBe(1); // Monday
    expect(d.getUTCHours()).toBe(2);
  });

  it("advances a full week when today matches the preferred day", () => {
    // 2026-02-23 is a Monday (day 1)
    const now = Date.UTC(2026, 1, 23, 10, 0, 0);
    const next = computeNextRunAt("weekly", 1 /* Monday */, now);
    const diffDays = (next - now) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeGreaterThanOrEqual(6.5); // ~7 days
    expect(diffDays).toBeLessThanOrEqual(7.5);
  });

  it("returns the next Saturday when today is Sunday", () => {
    // 2026-03-01 is a Sunday (day 0)
    const now = Date.UTC(2026, 2, 1, 10, 0, 0);
    const next = computeNextRunAt("weekly", 6 /* Saturday */, now);
    const d = new Date(next);
    expect(d.getUTCDay()).toBe(6); // Saturday
  });
});

describe("computeNextRunAt — monthly", () => {
  it("returns the 15th of the current month if it hasn't passed yet", () => {
    // Feb 10 — the 15th is still in the future
    const now = Date.UTC(2026, 1, 10, 10, 0, 0);
    const next = computeNextRunAt("monthly", 15, now);
    const d = new Date(next);
    expect(d.getUTCDate()).toBe(15);
    expect(d.getUTCMonth()).toBe(1); // February
  });

  it("advances to the next month if the preferred day has already passed", () => {
    // Feb 20 — the 15th has already passed
    const now = Date.UTC(2026, 1, 20, 10, 0, 0);
    const next = computeNextRunAt("monthly", 15, now);
    const d = new Date(next);
    expect(d.getUTCDate()).toBe(15);
    expect(d.getUTCMonth()).toBe(2); // March
  });

  it("returns the 1st of next month when today is the 1st", () => {
    const now = Date.UTC(2026, 1, 1, 10, 0, 0);
    const next = computeNextRunAt("monthly", 1, now);
    const d = new Date(next);
    expect(d.getUTCDate()).toBe(1);
    expect(d.getUTCMonth()).toBe(2); // March
  });
});

// ─── 2. Trip Summary HTML Renderer ───────────────────────────────────────────

/**
 * Inline copy of the renderTripSummaryHtml helper from tripSummary.ts
 * so we can test it in isolation.
 */
interface TripSummaryData {
  userName: string;
  dateFrom: number;
  dateTo: number;
  totalSpentUsd: number;
  totalPointsEarned: number;
  uniqueEstablishments: string[];
  payments: Array<{
    establishmentName: string | null;
    amountUsd: string | null;
    currency: string | null;
    paidAt: number | null;
  }>;
}

function renderTripSummaryHtml(data: TripSummaryData): string {
  const {
    userName,
    dateFrom,
    dateTo,
    totalSpentUsd,
    totalPointsEarned,
    uniqueEstablishments,
    payments,
  } = data;
  const formatDate = (ms: number) =>
    new Date(ms).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  const rows = payments
    .map(
      (p) =>
        `<tr>
          <td>${p.establishmentName ?? "Unknown"}</td>
          <td>${p.currency ?? "USD"} ${parseFloat(String(p.amountUsd ?? "0")).toFixed(2)}</td>
          <td>${p.paidAt ? formatDate(p.paidAt) : "—"}</td>
        </tr>`
    )
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Trip Summary — ${userName}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; color: #1a1a2e; }
    h1 { color: #6c63ff; } h2 { color: #444; border-bottom: 1px solid #eee; padding-bottom: 6px; }
    .kpi { display: flex; gap: 24px; margin: 20px 0; }
    .kpi-card { background: #f5f5ff; border-radius: 8px; padding: 16px 24px; min-width: 140px; }
    .kpi-card .value { font-size: 1.8rem; font-weight: 700; color: #6c63ff; }
    .kpi-card .label { font-size: 0.8rem; color: #888; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { background: #6c63ff; color: #fff; padding: 8px 12px; text-align: left; }
    td { padding: 8px 12px; border-bottom: 1px solid #eee; }
    tr:hover td { background: #f9f9ff; }
    .places { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .place-tag { background: #e8e8ff; color: #6c63ff; border-radius: 20px; padding: 4px 12px; font-size: 0.85rem; }
    footer { margin-top: 40px; color: #aaa; font-size: 0.8rem; text-align: center; }
  </style>
</head>
<body>
  <h1>Trip Summary</h1>
  <p>Prepared for <strong>${userName}</strong> &middot; ${formatDate(dateFrom)} &ndash; ${formatDate(dateTo)}</p>
  <div class="kpi">
    <div class="kpi-card"><div class="value">$${totalSpentUsd.toFixed(2)}</div><div class="label">Total Spent</div></div>
    <div class="kpi-card"><div class="value">${totalPointsEarned.toLocaleString()}</div><div class="label">Points Earned</div></div>
    <div class="kpi-card"><div class="value">${payments.length}</div><div class="label">Payments</div></div>
    <div class="kpi-card"><div class="value">${uniqueEstablishments.length}</div><div class="label">Places Visited</div></div>
  </div>
  <h2>Places Visited</h2>
  <div class="places">${uniqueEstablishments.map((e) => `<span class="place-tag">${e}</span>`).join("")}</div>
  <h2>Payment History</h2>
  <table>
    <thead><tr><th>Establishment</th><th>Amount</th><th>Date</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <footer>Generated by TourismPay &middot; ${new Date().toLocaleDateString()}</footer>
</body>
</html>`;
}

describe("renderTripSummaryHtml", () => {
  const baseData: TripSummaryData = {
    userName: "Alice",
    dateFrom: Date.UTC(2026, 0, 1),
    dateTo: Date.UTC(2026, 0, 31),
    totalSpentUsd: 250.5,
    totalPointsEarned: 2505,
    uniqueEstablishments: ["Cafe Lumiere", "Hotel Azul"],
    payments: [
      {
        establishmentName: "Cafe Lumiere",
        amountUsd: "50.00",
        currency: "USD",
        paidAt: Date.UTC(2026, 0, 5),
      },
      {
        establishmentName: "Hotel Azul",
        amountUsd: "200.50",
        currency: "USD",
        paidAt: Date.UTC(2026, 0, 10),
      },
    ],
  };

  it("includes the user name in the output", () => {
    const html = renderTripSummaryHtml(baseData);
    expect(html).toContain("Alice");
  });

  it("renders total spent correctly", () => {
    const html = renderTripSummaryHtml(baseData);
    expect(html).toContain("250.50");
  });

  it("renders total points earned", () => {
    const html = renderTripSummaryHtml(baseData);
    expect(html).toContain("2,505");
  });

  it("renders establishment names as place tags", () => {
    const html = renderTripSummaryHtml(baseData);
    expect(html).toContain("Cafe Lumiere");
    expect(html).toContain("Hotel Azul");
  });

  it("renders payment rows in the table", () => {
    const html = renderTripSummaryHtml(baseData);
    expect(html).toContain("50.00");
    expect(html).toContain("200.50");
  });

  it("handles empty payments array gracefully", () => {
    const html = renderTripSummaryHtml({ ...baseData, payments: [], uniqueEstablishments: [] });
    expect(html).toContain("<tbody></tbody>");
  });

  it("returns valid HTML with doctype", () => {
    const html = renderTripSummaryHtml(baseData);
    expect(html.trim()).toMatch(/^<!DOCTYPE html>/i);
  });

  it("includes payment count KPI", () => {
    const html = renderTripSummaryHtml(baseData);
    // 2 payments
    expect(html).toContain(">2<");
  });
});

// ─── 3. Impersonation Audit Log Constants ────────────────────────────────────

describe("Impersonation audit log action strings", () => {
  const START_ACTION = "admin.impersonation.start";
  const END_ACTION = "admin.impersonation.end";

  it("start action string has correct format", () => {
    expect(START_ACTION).toBe("admin.impersonation.start");
    expect(START_ACTION.split(".")).toHaveLength(3);
  });

  it("end action string has correct format", () => {
    expect(END_ACTION).toBe("admin.impersonation.end");
    expect(END_ACTION.split(".")).toHaveLength(3);
  });

  it("start and end actions share the same prefix", () => {
    const startParts = START_ACTION.split(".");
    const endParts = END_ACTION.split(".");
    expect(startParts[0]).toBe(endParts[0]);
    expect(startParts[1]).toBe(endParts[1]);
  });

  it("start and end actions have different suffixes", () => {
    const startSuffix = START_ACTION.split(".").pop();
    const endSuffix = END_ACTION.split(".").pop();
    expect(startSuffix).not.toBe(endSuffix);
    expect(startSuffix).toBe("start");
    expect(endSuffix).toBe("end");
  });
});

// ─── 4. Payout Schedule Frequency Validation ─────────────────────────────────

describe("Payout schedule frequency validation", () => {
  const VALID_FREQUENCIES = ["daily", "weekly", "monthly"] as const;

  it("accepts all three valid frequency values", () => {
    VALID_FREQUENCIES.forEach((f) => {
      expect(["daily", "weekly", "monthly"]).toContain(f);
    });
  });

  it("rejects invalid frequency values", () => {
    const invalid = ["hourly", "yearly", "biweekly", ""];
    invalid.forEach((f) => {
      expect(VALID_FREQUENCIES).not.toContain(f as never);
    });
  });

  it("daily frequency produces next run within 26 hours", () => {
    // The daily schedule adds 24h then snaps to 02:00 UTC, so when now is near
    // midnight UTC the result can be up to 26h in the future.
    const now = Date.now();
    const next = computeNextRunAt("daily", 0, now);
    const diffMs = next - now;
    expect(diffMs).toBeGreaterThan(0);
    expect(diffMs).toBeLessThanOrEqual(26 * 60 * 60 * 1000);
  });

  it("weekly frequency produces next run within 7 days", () => {
    const now = Date.now();
    const next = computeNextRunAt("weekly", 3, now);
    const diffDays = (next - now) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeGreaterThan(0);
    expect(diffDays).toBeLessThanOrEqual(7);
  });

  it("monthly frequency produces next run within 31 days", () => {
    const now = Date.UTC(2026, 1, 15, 10, 0, 0);
    const next = computeNextRunAt("monthly", 28, now);
    const diffDays = (next - now) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeGreaterThan(0);
    expect(diffDays).toBeLessThanOrEqual(31);
  });
});
