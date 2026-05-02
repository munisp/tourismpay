/**
 * usePdfDownload
 * Shared hook for downloading PDFs from the Python PDF report service.
 * The tRPC procedure returns { downloadUrl, payload, instructions }.
 * This hook POSTs the payload to the URL and triggers a browser download.
 */
import { useState } from "react";
import { toast } from "sonner";

interface PdfDownloadResult {
  downloadUrl: string;
  payload: Record<string, unknown>;
  instructions: string;
}

export function usePdfDownload() {
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadPdf = async (result: PdfDownloadResult, filename: string) => {
    setIsDownloading(true);
    try {
      const response = await fetch(result.downloadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.payload),
        signal: (AbortSignal as any).timeout(30000) as AbortSignal,
      });

      if (!response.ok) {
        throw new Error(`PDF service returned ${response.status}`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        // Service returned JSON (possibly an error or base64)
        const json = await response.json();
        if (json.base64) {
          const bytes = atob(json.base64);
          const arr = new Uint8Array(bytes.length);
          for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
          const blob = new Blob([arr], { type: "application/pdf" });
          triggerDownload(blob, filename);
        } else if (json.url) {
          window.open(json.url, "_blank");
        } else {
          throw new Error("Unexpected response from PDF service");
        }
      } else {
        // Direct PDF stream
        const blob = await response.blob();
        triggerDownload(blob, filename);
      }
      toast.success("PDF downloaded successfully.");
    } catch (err: any) {
      const msg = err?.message ?? "Unknown error";
      if (msg.includes("Failed to fetch") || msg.includes("timeout") || msg.includes("ECONNREFUSED")) {
        toast.error(
          "PDF service is not reachable. Start the Python PDF service (port 8005) to enable PDF generation.",
          { duration: 6000 }
        );
      } else {
        toast.error(`PDF download failed: ${msg}`);
      }
    } finally {
      setIsDownloading(false);
    }
  };

  return { downloadPdf, isDownloading };
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
