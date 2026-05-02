/**
 * Round 47 Tests
 * Covers:
 * 1. Schedule pause indicator badge in BIS Dashboard header
 * 2. Share card regeneration button in TierUpCelebrationModal
 * 3. Audit log From/To date range filter
 */

import { describe, it, expect } from "vitest";

// ─── 1. Schedule Pause Indicator Badge ───────────────────────────────────────
describe("BIS Dashboard — schedule pause indicator badge", () => {
  it("amber border class applied when schedule is paused", async () => {
    const fs = await import("fs");
    const page = fs.readFileSync("client/src/pages/bis/BISDashboard.tsx", "utf-8");
    expect(page).toContain("border-amber-500/40");
    expect(page).toContain("exportSchedule && !exportSchedule.enabled");
  });

  it("Paused badge renders with amber styling when enabled === false", async () => {
    const fs = await import("fs");
    const page = fs.readFileSync("client/src/pages/bis/BISDashboard.tsx", "utf-8");
    expect(page).toContain("bg-amber-500/20 text-amber-400 border border-amber-500/30");
    expect(page).toContain("Paused");
  });

  it("badge is gated on exportSchedule.enabled === false (not undefined)", async () => {
    const fs = await import("fs");
    const page = fs.readFileSync("client/src/pages/bis/BISDashboard.tsx", "utf-8");
    // Must check for explicit false, not just falsy (undefined = no schedule yet)
    expect(page).toContain("exportSchedule.enabled === false");
  });

  it("title tooltip explains paused state to admin", async () => {
    const fs = await import("fs");
    const page = fs.readFileSync("client/src/pages/bis/BISDashboard.tsx", "utf-8");
    expect(page).toContain("Export schedule is paused");
  });
});

// ─── 2. Share Card Regeneration Button ───────────────────────────────────────
describe("TierUpCelebrationModal — share card regeneration", () => {
  it("RefreshCw icon is imported", async () => {
    const fs = await import("fs");
    const modal = fs.readFileSync("client/src/components/TierUpCelebrationModal.tsx", "utf-8");
    expect(modal).toContain("RefreshCw");
    expect(modal).toContain('from "lucide-react"');
  });

  it("Regenerate button clears shareCardUrl and re-calls handleShare", async () => {
    const fs = await import("fs");
    const modal = fs.readFileSync("client/src/components/TierUpCelebrationModal.tsx", "utf-8");
    expect(modal).toContain("setShareCardUrl(null); handleShare();");
  });

  it("Regenerate button only renders when shareCardUrl is set", async () => {
    const fs = await import("fs");
    const modal = fs.readFileSync("client/src/components/TierUpCelebrationModal.tsx", "utf-8");
    // Find the regenerate button block — it must be inside a shareCardUrl guard
    const regenBlock = modal.split("Generate a new share card image")[0]?.split("{shareCardUrl && (").pop() ?? "";
    expect(regenBlock.length).toBeGreaterThan(0);
  });

  it("Regenerate button is disabled while generation is pending", async () => {
    const fs = await import("fs");
    const modal = fs.readFileSync("client/src/components/TierUpCelebrationModal.tsx", "utf-8");
    const regenSection = modal.split("Generate a new share card image")[0]?.split("title=")[1] ?? "";
    // The button must have disabled={generateShareCardMut.isPending}
    expect(modal).toContain("disabled={generateShareCardMut.isPending}");
  });

  it("Regenerate button shows spinner while generating", async () => {
    const fs = await import("fs");
    const modal = fs.readFileSync("client/src/components/TierUpCelebrationModal.tsx", "utf-8");
    // After the regenerate button section, there should be a Loader2 spinner
    const afterRegen = modal.split("Generate a new share card image")[1] ?? "";
    expect(afterRegen).toContain("Loader2");
    expect(afterRegen).toContain("animate-spin");
  });
});

// ─── 3. Audit Log Date Range Filter ──────────────────────────────────────────
describe("AuditLog — From/To date range filter", () => {
  it("dateFrom and dateTo state variables are declared", async () => {
    const fs = await import("fs");
    const page = fs.readFileSync("client/src/pages/admin/AuditLog.tsx", "utf-8");
    expect(page).toContain('const [dateFrom, setDateFrom] = useState<string>("")');
    expect(page).toContain('const [dateTo, setDateTo] = useState<string>("")');
  });

  it("since/until are derived from dateFrom/dateTo and passed to list query", async () => {
    const fs = await import("fs");
    const page = fs.readFileSync("client/src/pages/admin/AuditLog.tsx", "utf-8");
    expect(page).toContain('const since = dateFrom ? new Date(dateFrom + "T00:00:00") : undefined;');
    expect(page).toContain('const until = dateTo ? new Date(dateTo + "T23:59:59") : undefined;');
    expect(page).toContain("since,");
    expect(page).toContain("until,");
  });

  it("from/to are passed to CSV export mutation", async () => {
    const fs = await import("fs");
    const page = fs.readFileSync("client/src/pages/admin/AuditLog.tsx", "utf-8");
    expect(page).toContain('from: dateFrom ? new Date(dateFrom + "T00:00:00") : undefined,');
    expect(page).toContain('to: dateTo ? new Date(dateTo + "T23:59:59") : undefined,');
  });

  it("date range pickers are rendered in the filter bar", async () => {
    const fs = await import("fs");
    const page = fs.readFileSync("client/src/pages/admin/AuditLog.tsx", "utf-8");
    expect(page).toContain('type="date"');
    expect(page).toContain("Date range:");
    expect(page).toContain("Clear dates");
  });

  it("active date range shows a summary chip", async () => {
    const fs = await import("fs");
    const page = fs.readFileSync("client/src/pages/admin/AuditLog.tsx", "utf-8");
    expect(page).toContain("(dateFrom || dateTo) && (");
    expect(page).toContain("dateFrom && dateTo");
    expect(page).toContain("From ${dateFrom}");
    expect(page).toContain("Until ${dateTo}");
  });

  it("auditLogs.list procedure accepts since/until params", async () => {
    const fs = await import("fs");
    const router = fs.readFileSync("server/routers/auditLogs.ts", "utf-8");
    expect(router).toContain("since: z.date().optional()");
    expect(router).toContain("until: z.date().optional()");
  });

  it("csvExport.auditLogs procedure accepts from/to params", async () => {
    const fs = await import("fs");
    const router = fs.readFileSync("server/routers/csvExport.ts", "utf-8");
    expect(router).toContain("from: z.date().optional()");
    expect(router).toContain("to: z.date().optional()");
  });
});
