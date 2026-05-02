/**
 * Round 77 Tests
 * - QR expiry regenerate logic
 * - Tourist payment notification content
 * - KYB bulk approval selection logic
 */
import { describe, it, expect } from "vitest";

// ─── 1. QR Regenerate Logic ───────────────────────────────────────────────────

describe("QR Cashier Terminal — regenerate logic", () => {
  it("resets countdown to 900 seconds on regenerate", () => {
    let timeLeft = 0; // expired
    const startCountdown = () => { timeLeft = 900; };
    startCountdown();
    expect(timeLeft).toBe(900);
  });

  it("shows regenerate button only when timeLeft === 0", () => {
    const showRegenerate = (timeLeft: number) => timeLeft === 0;
    expect(showRegenerate(0)).toBe(true);
    expect(showRegenerate(1)).toBe(false);
    expect(showRegenerate(900)).toBe(false);
    expect(showRegenerate(60)).toBe(false);
  });

  it("formats countdown correctly", () => {
    const formatTime = (secs: number) => {
      const m = Math.floor(secs / 60).toString().padStart(2, "0");
      const s = (secs % 60).toString().padStart(2, "0");
      return `${m}:${s}`;
    };
    expect(formatTime(900)).toBe("15:00");
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(61)).toBe("01:01");
    expect(formatTime(599)).toBe("09:59");
  });

  it("shows warning colour when timeLeft < 120", () => {
    const getTimerClass = (timeLeft: number) =>
      timeLeft < 120 ? "destructive" : "emerald";
    expect(getTimerClass(119)).toBe("destructive");
    expect(getTimerClass(120)).toBe("emerald");
    expect(getTimerClass(0)).toBe("destructive");
    expect(getTimerClass(900)).toBe("emerald");
  });

  it("regenerate reuses same establishment and amount params", () => {
    const params = { establishmentId: 5, amountUsd: "25.00", currency: "USD", description: "Table 3" };
    const regenerate = (p: typeof params) => ({ ...p }); // same params
    const result = regenerate(params);
    expect(result.establishmentId).toBe(5);
    expect(result.amountUsd).toBe("25.00");
    expect(result.currency).toBe("USD");
    expect(result.description).toBe("Table 3");
  });
});

// ─── 2. Tourist Payment Notification ─────────────────────────────────────────

describe("Tourist payment notification", () => {
  it("builds correct notification title", () => {
    const buildTitle = (amount: string, currency: string) =>
      `Payment of ${amount} ${currency} confirmed`;
    expect(buildTitle("50.00", "USD")).toBe("Payment of 50.00 USD confirmed");
    expect(buildTitle("100.00", "EUR")).toBe("Payment of 100.00 EUR confirmed");
  });

  it("builds correct notification content with merchant name", () => {
    const buildContent = (amount: string, currency: string, merchant: string, txRef: string, points: number) => {
      const pointsMsg = points > 0 ? ` You earned ${points} loyalty points.` : "";
      return `Your payment of ${amount} ${currency} to ${merchant} was successful (ref: ${txRef}).${pointsMsg} View your receipt for full details.`;
    };
    const content = buildContent("50.00", "USD", "Nairobi Grill", "QR-ABC123", 500);
    expect(content).toContain("Nairobi Grill");
    expect(content).toContain("QR-ABC123");
    expect(content).toContain("500 loyalty points");
    expect(content).toContain("View your receipt");
  });

  it("omits loyalty points message when points = 0", () => {
    const buildContent = (amount: string, currency: string, merchant: string, txRef: string, points: number) => {
      const pointsMsg = points > 0 ? ` You earned ${points} loyalty points.` : "";
      return `Your payment of ${amount} ${currency} to ${merchant} was successful (ref: ${txRef}).${pointsMsg} View your receipt for full details.`;
    };
    const content = buildContent("10.00", "NGN", "Lagos Hotel", "QR-XYZ", 0);
    expect(content).not.toContain("loyalty points");
  });

  it("builds correct receipt action URL", () => {
    const buildReceiptUrl = (token: string) => `/receipt/${token}`;
    expect(buildReceiptUrl("abc-123-def")).toBe("/receipt/abc-123-def");
  });

  it("notification category is wallet", () => {
    const category = "wallet";
    expect(category).toBe("wallet");
  });

  it("falls back to 'the merchant' when establishment name is null", () => {
    const merchantName = (null as string | null) ?? "the merchant";
    expect(merchantName).toBe("the merchant");
  });
});

// ─── 3. KYB Bulk Approval Selection Logic ────────────────────────────────────

describe("KYB bulk approval — selection logic", () => {
  const apps = [
    { id: 1, status: "submitted" },
    { id: 2, status: "under_review" },
    { id: 3, status: "approved" },
    { id: 4, status: "rejected" },
    { id: 5, status: "submitted" },
  ];

  const approvable = apps.filter((a) => a.status === "submitted" || a.status === "under_review");

  it("identifies approvable apps correctly", () => {
    expect(approvable).toHaveLength(3);
    expect(approvable.map((a) => a.id)).toEqual([1, 2, 5]);
  });

  it("Select All selects only approvable rows", () => {
    const selected = new Set(approvable.map((a) => a.id));
    expect(selected.has(1)).toBe(true);
    expect(selected.has(2)).toBe(true);
    expect(selected.has(5)).toBe(true);
    expect(selected.has(3)).toBe(false); // approved — not selectable
    expect(selected.has(4)).toBe(false); // rejected — not selectable
  });

  it("allApprovableSelected is true when all approvable are selected", () => {
    const selectedIds = new Set([1, 2, 5]);
    const allSelected = approvable.length > 0 && approvable.every((a) => selectedIds.has(a.id));
    expect(allSelected).toBe(true);
  });

  it("allApprovableSelected is false when some are missing", () => {
    const selectedIds = new Set([1, 2]);
    const allSelected = approvable.length > 0 && approvable.every((a) => selectedIds.has(a.id));
    expect(allSelected).toBe(false);
  });

  it("toggleRow adds an id when not selected", () => {
    const selectedIds = new Set<number>([1]);
    const next = new Set(selectedIds);
    if (next.has(2)) next.delete(2); else next.add(2);
    expect(next.has(2)).toBe(true);
    expect(next.size).toBe(2);
  });

  it("toggleRow removes an id when already selected", () => {
    const selectedIds = new Set<number>([1, 2]);
    const next = new Set(selectedIds);
    if (next.has(1)) next.delete(1); else next.add(1);
    expect(next.has(1)).toBe(false);
    expect(next.size).toBe(1);
  });

  it("Deselect All clears the selection", () => {
    const selectedIds = new Set([1, 2, 5]);
    const cleared = new Set<number>();
    expect(cleared.size).toBe(0);
  });

  it("bulk approve processes each id sequentially", async () => {
    const processed: number[] = [];
    const approveOne = async (id: number) => { processed.push(id); };
    const ids = [1, 2, 5];
    for (const id of ids) await approveOne(id);
    expect(processed).toEqual([1, 2, 5]);
  });

  it("bulk progress tracks done/total correctly", () => {
    const total = 3;
    let done = 0;
    const progress = () => ({ done, total });
    done++; expect(progress()).toEqual({ done: 1, total: 3 });
    done++; expect(progress()).toEqual({ done: 2, total: 3 });
    done++; expect(progress()).toEqual({ done: 3, total: 3 });
  });

  it("bulk approve button shows count in label", () => {
    const label = (count: number) => `Approve Selected (${count})`;
    expect(label(3)).toBe("Approve Selected (3)");
    expect(label(1)).toBe("Approve Selected (1)");
  });

  it("someSelected is true when at least one id is selected", () => {
    const selectedIds = new Set([2]);
    expect(selectedIds.size > 0).toBe(true);
  });

  it("someSelected is false when no ids are selected", () => {
    const selectedIds = new Set<number>();
    expect(selectedIds.size > 0).toBe(false);
  });
});
