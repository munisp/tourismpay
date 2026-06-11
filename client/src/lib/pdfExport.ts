import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

/**
 * Export a DOM element as a PDF document.
 * Uses html2canvas to render the element to a canvas, then embeds it into jsPDF.
 */
export async function exportAnalyticsToPDF(elementId: string, filename: string): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`);
  }

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
  });

  const imgData = canvas.toDataURL("image/png");
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;

  // A4 dimensions in points (72 DPI)
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const scaledHeight = (imgHeight * contentWidth) / imgWidth;

  const pdf = new jsPDF({
    orientation: scaledHeight > pageHeight ? "landscape" : "portrait",
    unit: "pt",
    format: "a4",
  });

  // Add header
  pdf.setFontSize(10);
  pdf.setTextColor(128);
  pdf.text(`TourismPay Analytics Report — ${new Date().toLocaleDateString()}`, margin, 25);

  let yPosition = margin;
  let remainingHeight = scaledHeight;
  let sourceY = 0;

  // Handle multi-page content
  while (remainingHeight > 0) {
    const availableHeight = pageHeight - yPosition - margin;
    const sliceHeight = Math.min(availableHeight, remainingHeight);

    // Create a slice of the canvas for this page
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = imgWidth;
    sliceCanvas.height = (sliceHeight / contentWidth) * imgWidth;
    const sliceCtx = sliceCanvas.getContext("2d");
    if (sliceCtx) {
      sliceCtx.drawImage(
        canvas,
        0, sourceY, imgWidth, sliceCanvas.height,
        0, 0, imgWidth, sliceCanvas.height,
      );
    }

    const sliceImgData = sliceCanvas.toDataURL("image/png");
    pdf.addImage(sliceImgData, "PNG", margin, yPosition, contentWidth, sliceHeight);

    remainingHeight -= sliceHeight;
    sourceY += sliceCanvas.height;

    if (remainingHeight > 0) {
      pdf.addPage();
      yPosition = margin;
    }
  }

  // Add footer
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(160);
    pdf.text(`Page ${i} of ${pageCount}`, pageWidth - margin - 60, pageHeight - 15);
  }

  const safeName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  pdf.save(safeName);
}

/**
 * Export tabular data as a CSV file download.
 */
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
