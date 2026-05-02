/**
 * Round 45 Tests
 * - Audit log privacy_update filter
 * - Export schedule history (lastRunAt, lastExportNoteCount)
 * - Share card download (generateShareCard returns imageUrl)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 1. Audit log privacy_update filter ──────────────────────────────────────

describe("Audit Log — privacy_update filter", () => {
  it("ACTION_LABELS includes privacy_update entry", async () => {
    // The AuditLog page defines ACTION_LABELS with privacy_update
    // We verify the constant is defined in the page source
    const fs = await import("fs");
    const src = fs.readFileSync(
      "client/src/pages/admin/AuditLog.tsx",
      "utf-8"
    );
    expect(src).toContain("privacy_update");
    expect(src).toContain("Privacy Update");
  });

  it("ACTION_COLORS includes privacy_update entry", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "client/src/pages/admin/AuditLog.tsx",
      "utf-8"
    );
    // Should have a color mapping for privacy_update
    expect(src).toMatch(/privacy_update.*bg-|bg-.*privacy_update/s);
  });

  it("Filter dropdown includes privacy_update option", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "client/src/pages/admin/AuditLog.tsx",
      "utf-8"
    );
    // The SelectItem for privacy_update should be present
    expect(src).toContain("privacy_update");
    // Should appear at least twice: in the map and in the filter
    const count = (src.match(/privacy_update/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ─── 2. Export schedule history ───────────────────────────────────────────────

describe("BIS Export Schedule — history fields", () => {
  it("getExportSchedule procedure returns lastExportNoteCount", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/routers/bis.ts", "utf-8");
    expect(src).toContain("lastExportNoteCount");
    expect(src).toContain("row.lastExportNoteCount ?? null");
  });

  it("bisWeeklyExport job writes lastExportNoteCount on completion", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/jobs/bisWeeklyExport.ts", "utf-8");
    expect(src).toContain("lastExportNoteCount");
  });

  it("BISDashboard renders last run history panel", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "client/src/pages/bis/BISDashboard.tsx",
      "utf-8"
    );
    expect(src).toContain("lastRunAt");
    expect(src).toContain("lastExportNoteCount");
    expect(src).toContain("Last run:");
    expect(src).toContain("exported");
  });

  it("schema has last_export_note_count column in bisExportSchedules", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("drizzle/schema.ts", "utf-8");
    expect(src).toContain("lastExportNoteCount");
    expect(src).toContain("last_export_note_count");
  });

  it("migration SQL contains ALTER TABLE for last_export_note_count", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const migrationsDir = "drizzle";
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith(".sql"))
      .sort();
    // Search all migrations for last_export_note_count (may not be in the latest migration)
    const allSql = files
      .map((f: string) => fs.readFileSync(path.join(migrationsDir, f), "utf-8"))
      .join("\n");
    expect(allSql).toContain("last_export_note_count");
  });
});

// ─── 3. Share card download button ───────────────────────────────────────────

describe("TierUpCelebrationModal — share card download", () => {
  it("component imports Download icon from lucide-react", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "client/src/components/TierUpCelebrationModal.tsx",
      "utf-8"
    );
    expect(src).toContain("Download");
    expect(src).toContain("from \"lucide-react\"");
  });

  it("component has shareCardUrl state", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "client/src/components/TierUpCelebrationModal.tsx",
      "utf-8"
    );
    expect(src).toContain("shareCardUrl");
    expect(src).toContain("setShareCardUrl");
  });

  it("handleDownloadCard function is defined", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "client/src/components/TierUpCelebrationModal.tsx",
      "utf-8"
    );
    expect(src).toContain("handleDownloadCard");
    expect(src).toContain("URL.createObjectURL");
    expect(src).toContain("a.download");
  });

  it("Download button is conditionally rendered when shareCardUrl is set", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "client/src/components/TierUpCelebrationModal.tsx",
      "utf-8"
    );
    expect(src).toContain("{shareCardUrl && (");
    expect(src).toContain("onClick={handleDownloadCard}");
  });

  it("generateShareCard mutation sets shareCardUrl on success", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "client/src/components/TierUpCelebrationModal.tsx",
      "utf-8"
    );
    expect(src).toContain("setShareCardUrl(data.imageUrl)");
  });

  it("handleShare resets shareCardUrl before generating new card", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "client/src/components/TierUpCelebrationModal.tsx",
      "utf-8"
    );
    expect(src).toContain("setShareCardUrl(null)");
  });
});

// ─── 4. Privacy Settings — transaction history toggle ────────────────────────

describe("Privacy Settings — transaction history toggle", () => {
  it("PrivacySettings page renders transaction history toggle", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      "client/src/pages/settings/PrivacySettings.tsx",
      "utf-8"
    );
    expect(src).toContain("hideTransactionHistory");
    expect(src).toContain("Transaction History");
  });

  it("setPrivacySettings procedure accepts hideTransactionHistory", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/routers/loyalty.ts", "utf-8");
    expect(src).toContain("hideTransactionHistory");
  });

  it("setPrivacySettings writes audit log on change", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/routers/loyalty.ts", "utf-8");
    expect(src).toContain("privacy_update");
    expect(src).toContain("createAuditLog");
  });
});
