import { logger } from "@/lib/logger";

/** Stub PDF export utilities — replace with a real PDF library for production */
export async function exportAnalyticsToPDF(elementId: string, filename: string): Promise<void> {
  logger.warn("exportAnalyticsToPDF: PDF export not yet implemented", { elementId, filename });
  alert("PDF export is not yet available in this version.");
}

export function downloadCSV(data: Record<string, unknown>[], filename: string): void {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) => headers.map((h) => JSON.stringify(row[h] ?? "")).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
