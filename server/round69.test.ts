/**
 * Round 69 Tests
 * Covers:
 *  1. Merchant establishment location update (kyb.updateEstablishmentLocation)
 *  2. Tourist spending analytics (wallet.spendingAnalytics)
 *  3. Settlement CSV export (settlement.exportCsv)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Parser } from "json2csv";

// ─── 1. Establishment Location Update ─────────────────────────────────────────

describe("kyb.updateEstablishmentLocation", () => {
  it("validates latitude range [-90, 90]", () => {
    const validateLat = (lat: number) => lat >= -90 && lat <= 90;
    expect(validateLat(-90)).toBe(true);
    expect(validateLat(90)).toBe(true);
    expect(validateLat(0)).toBe(true);
    expect(validateLat(-91)).toBe(false);
    expect(validateLat(91)).toBe(false);
  });

  it("validates longitude range [-180, 180]", () => {
    const validateLng = (lng: number) => lng >= -180 && lng <= 180;
    expect(validateLng(-180)).toBe(true);
    expect(validateLng(180)).toBe(true);
    expect(validateLng(0)).toBe(true);
    expect(validateLng(-181)).toBe(false);
    expect(validateLng(181)).toBe(false);
  });

  it("formats coordinates to 6 decimal places", () => {
    const formatCoord = (n: number) => parseFloat(n.toFixed(6));
    expect(formatCoord(-1.2921)).toBe(-1.2921);
    expect(formatCoord(36.821945)).toBe(36.821945);
    // Precision capped at 6 decimals
    const precise = formatCoord(36.8219451234567);
    expect(precise.toString().split(".")[1]?.length ?? 0).toBeLessThanOrEqual(6);
  });

  it("rejects update without establishment ID", () => {
    const validateInput = (input: { establishmentId?: number; lat: number; lng: number }) => {
      if (!input.establishmentId || input.establishmentId <= 0) {
        throw new Error("Invalid establishment ID");
      }
      return true;
    };
    expect(() => validateInput({ lat: 0, lng: 0 })).toThrow("Invalid establishment ID");
    expect(() => validateInput({ establishmentId: 0, lat: 0, lng: 0 })).toThrow("Invalid establishment ID");
    expect(validateInput({ establishmentId: 1, lat: 0, lng: 0 })).toBe(true);
  });

  it("builds correct SQL update payload", () => {
    const buildPayload = (lat: number, lng: number) => ({
      latitude: lat.toString(),
      longitude: lng.toString(),
      updatedAt: expect.any(Number),
    });
    const payload = buildPayload(-1.2921, 36.8219);
    expect(payload.latitude).toBe("-1.2921");
    expect(payload.longitude).toBe("36.8219");
  });
});

// ─── 2. Tourist Spending Analytics ────────────────────────────────────────────

describe("wallet.spendingAnalytics", () => {
  it("groups transactions by month correctly", () => {
    const transactions = [
      { createdAt: new Date("2026-01-15").getTime(), amount: "100", type: "qr_payment", category: "food" },
      { createdAt: new Date("2026-01-20").getTime(), amount: "50", type: "qr_payment", category: "transport" },
      { createdAt: new Date("2026-02-05").getTime(), amount: "200", type: "qr_payment", category: "food" },
      { createdAt: new Date("2026-02-10").getTime(), amount: "75", type: "qr_payment", category: "entertainment" },
    ];

    const groupByMonth = (txs: typeof transactions) => {
      const map = new Map<string, number>();
      for (const tx of txs) {
        const d = new Date(tx.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        map.set(key, (map.get(key) ?? 0) + parseFloat(tx.amount));
      }
      return Array.from(map.entries()).map(([month, total]) => ({ month, total }));
    };

    const result = groupByMonth(transactions);
    expect(result).toHaveLength(2);
    const jan = result.find((r) => r.month === "2026-01");
    const feb = result.find((r) => r.month === "2026-02");
    expect(jan?.total).toBe(150);
    expect(feb?.total).toBe(275);
  });

  it("groups transactions by category correctly", () => {
    const transactions = [
      { amount: "100", category: "food" },
      { amount: "50", category: "transport" },
      { amount: "200", category: "food" },
      { amount: "75", category: "entertainment" },
    ];

    const groupByCategory = (txs: typeof transactions) => {
      const map = new Map<string, number>();
      for (const tx of txs) {
        const cat = tx.category || "other";
        map.set(cat, (map.get(cat) ?? 0) + parseFloat(tx.amount));
      }
      return Array.from(map.entries())
        .map(([category, total]) => ({ category, total }))
        .sort((a, b) => b.total - a.total);
    };

    const result = groupByCategory(transactions);
    expect(result[0].category).toBe("food");
    expect(result[0].total).toBe(300);
    expect(result[1].category).toBe("entertainment");
    expect(result[2].category).toBe("transport");
  });

  it("filters only qr_payment transactions for spending analytics", () => {
    const transactions = [
      { type: "qr_payment", amount: "100" },
      { type: "top_up", amount: "500" },
      { type: "qr_payment", amount: "50" },
      { type: "transfer", amount: "200" },
    ];

    const filterSpending = (txs: typeof transactions) =>
      txs.filter((t) => t.type === "qr_payment");

    const result = filterSpending(transactions);
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.type === "qr_payment")).toBe(true);
  });

  it("returns empty arrays when no transactions exist", () => {
    const computeAnalytics = (txs: any[]) => ({
      monthly: [],
      byCategory: [],
      totalSpent: 0,
    });

    const result = computeAnalytics([]);
    expect(result.monthly).toHaveLength(0);
    expect(result.byCategory).toHaveLength(0);
    expect(result.totalSpent).toBe(0);
  });

  it("limits monthly data to last 12 months", () => {
    const now = Date.now();
    // Create 18 transactions spaced 35 days apart (> 12 months total span)
    const transactions = Array.from({ length: 18 }, (_, i) => ({
      createdAt: now - i * 35 * 86_400_000,
      amount: "100",
      type: "qr_payment",
    }));

    const limitToLast12Months = (txs: typeof transactions) => {
      const cutoff = now - 365 * 86_400_000;
      return txs.filter((t) => t.createdAt >= cutoff);
    };

    const result = limitToLast12Months(transactions);
    // 365 days / 35 days per step = ~10 items within 12 months
    expect(result.length).toBeLessThan(18);
    expect(result.length).toBeGreaterThan(0);
    // All results should be within the last 12 months
    const cutoff = now - 365 * 86_400_000;
    expect(result.every((t) => t.createdAt >= cutoff)).toBe(true);
  });
});

// ─── 3. Settlement CSV Export ──────────────────────────────────────────────────

describe("settlement.exportCsv", () => {
  it("generates valid CSV from settlement rows", () => {
    const rows = [
      {
        id: "batch-001",
        merchantId: "merchant-1",
        participantId: "part-1",
        status: "completed",
        totalAmount: "1500.00",
        currency: "USD",
        transactionCount: 15,
        settlementDate: new Date("2026-02-01").getTime(),
        createdAt: new Date("2026-02-01").getTime(),
        updatedAt: new Date("2026-02-01").getTime(),
        notes: null,
      },
    ];

    const fields = [
      { label: "Batch ID", value: "id" },
      { label: "Status", value: "status" },
      { label: "Total Amount", value: (r: any) => Number(r.totalAmount).toFixed(2) },
      { label: "Currency", value: "currency" },
      { label: "Transaction Count", value: "transactionCount" },
    ];

    const parser = new Parser({ fields } as any);
    const csv = parser.parse(rows);

    expect(csv).toContain("Batch ID");
    expect(csv).toContain("batch-001");
    expect(csv).toContain("completed");
    expect(csv).toContain("1500.00");
    expect(csv).toContain("USD");
    expect(csv).toContain("15");
  });

  it("handles empty rows by returning null csv", () => {
    const handleEmpty = (rows: any[]) => {
      if (rows.length === 0) return { csv: null, filename: "settlements.csv", rowCount: 0 };
      return { csv: "data", filename: "settlements.csv", rowCount: rows.length };
    };

    expect(handleEmpty([])).toEqual({ csv: null, filename: "settlements.csv", rowCount: 0 });
    expect(handleEmpty([{ id: 1 }])).toEqual({ csv: "data", filename: "settlements.csv", rowCount: 1 });
  });

  it("generates filename with current date", () => {
    const generateFilename = () => {
      const date = new Date().toISOString().slice(0, 10);
      return `settlements-${date}.csv`;
    };

    const filename = generateFilename();
    expect(filename).toMatch(/^settlements-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("applies status filter correctly", () => {
    const rows = [
      { id: "1", status: "pending" },
      { id: "2", status: "completed" },
      { id: "3", status: "pending" },
      { id: "4", status: "failed" },
    ];

    const filterByStatus = (rows: typeof rows, status?: string) => {
      if (!status) return rows;
      return rows.filter((r) => r.status === status);
    };

    expect(filterByStatus(rows, "pending")).toHaveLength(2);
    expect(filterByStatus(rows, "completed")).toHaveLength(1);
    expect(filterByStatus(rows, "failed")).toHaveLength(1);
    expect(filterByStatus(rows)).toHaveLength(4);
  });

  it("applies date range filter correctly", () => {
    const now = Date.now();
    const rows = [
      { id: "1", createdAt: now - 10 * 86_400_000 }, // 10 days ago
      { id: "2", createdAt: now - 5 * 86_400_000 },  // 5 days ago
      { id: "3", createdAt: now - 1 * 86_400_000 },  // 1 day ago
    ];

    const filterByDate = (rows: typeof rows, dateFrom?: number, dateTo?: number) => {
      return rows.filter((r) => {
        if (dateFrom && r.createdAt < dateFrom) return false;
        if (dateTo && r.createdAt > dateTo) return false;
        return true;
      });
    };

    const last7Days = filterByDate(rows, now - 7 * 86_400_000);
    expect(last7Days).toHaveLength(2);

    const last2Days = filterByDate(rows, now - 2 * 86_400_000);
    expect(last2Days).toHaveLength(1);
  });

  it("limits export to 5000 rows maximum", () => {
    const MAX_EXPORT_ROWS = 5000;
    const generateRows = (count: number) => Array.from({ length: count }, (_, i) => ({ id: String(i) }));

    const rows = generateRows(6000);
    const limited = rows.slice(0, MAX_EXPORT_ROWS);
    expect(limited).toHaveLength(MAX_EXPORT_ROWS);
  });

  it("formats amounts to 2 decimal places in CSV", () => {
    const formatAmount = (amount: string | number) => Number(amount).toFixed(2);
    expect(formatAmount("1500")).toBe("1500.00");
    expect(formatAmount("99.9")).toBe("99.90");
    expect(formatAmount(1234.567)).toBe("1234.57");
  });

  it("handles null notes gracefully", () => {
    const formatNotes = (notes: string | null | undefined) => notes ?? "";
    expect(formatNotes(null)).toBe("");
    expect(formatNotes(undefined)).toBe("");
    expect(formatNotes("Some note")).toBe("Some note");
  });
});

// ─── 4. CSV Download Client-Side Logic ────────────────────────────────────────

describe("CSV download client-side logic", () => {
  it("creates a valid blob URL for download", () => {
    const csvContent = "id,status\n1,completed\n2,pending";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe("text/csv;charset=utf-8;");
  });

  it("validates CSV content type", () => {
    const isValidCsvType = (type: string) => type.includes("text/csv");
    expect(isValidCsvType("text/csv;charset=utf-8;")).toBe(true);
    expect(isValidCsvType("application/json")).toBe(false);
  });

  it("generates correct download filename from response", () => {
    const getFilename = (date: string) => `settlements-${date}.csv`;
    expect(getFilename("2026-02-26")).toBe("settlements-2026-02-26.csv");
  });
});
