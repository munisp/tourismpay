import { z } from "zod";
import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import {
  getBisInvestigationById,
  createBisReportExport,
  getBisReportExportsByInvestigation,
  getLatestBisReportExport,
} from "../db";
import { storagePut } from "../storage";
import { invokeLLM } from "../_core/llm";
import { notifyOwner } from "../_core/notification";

function randomSuffix(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 8);
}

// ─── LLM Summary Generation ───────────────────────────────────────────────────

async function generateEntityBisLlmSummary(inv: Record<string, unknown>): Promise<string> {
  const moduleResults = inv.moduleResults as Record<string, unknown> | null;
  const recommendations = (inv.recommendations as string[]) ?? [];

  const moduleText = moduleResults
    ? Object.entries(moduleResults)
        .map(([k, v]) => `  • ${k}: ${JSON.stringify(v)}`)
        .join("\n")
    : "  No module results available.";

  const prompt = `You are a senior corporate due diligence analyst for TourismPay, a financial compliance platform operating across Africa.

Generate a concise, professional executive summary for the following ENTITY background investigation report. The summary should:
1. Summarise the company profile, structure, and investigation scope
2. Highlight key findings on company registration, directorship, regulatory compliance, and financial health
3. Identify any red flags in ownership structure, sanctions exposure, or regulatory violations
4. Provide a clear risk assessment (Low / Medium / High / Critical)
5. List the top 3-5 actionable recommendations for the requesting institution
6. Use formal, compliance-grade language suitable for a financial institution's KYB/AML process

Entity Investigation Details:
- Reference ID: ${inv.referenceId}
- Entity Name: ${inv.subjectFullName}
- Entity Type: ${inv.entityType ?? 'Unknown'}
- Registration Number: ${inv.entityRegistrationNumber ?? 'Unknown'}
- Country of Operation: ${inv.subjectCountry ?? 'Unknown'}
- Year Founded: ${inv.entityYearFounded ?? 'Unknown'}
- Website: ${inv.entityWebsite ?? 'Unknown'}
- Investigation Tier: ${inv.tier}
- Risk Score: ${inv.riskScore ?? 'Pending'}/100
- Risk Level: ${String(inv.riskLevel ?? 'Pending').toUpperCase()}
- Status: ${inv.status}

Module Results:
${moduleText}

Recommendations:
${recommendations.length > 0 ? recommendations.map((r) => `  • ${r}`).join('\n') : '  None recorded.'}

Write a 3-5 paragraph executive summary covering company legitimacy, ownership transparency, regulatory standing, and financial health. Follow with a bullet-point recommendations section.`;

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are a senior corporate due diligence analyst specialising in African market entity investigations. Produce concise, factual, professional reports.",
        },
        { role: "user", content: prompt },
      ],
    });
    const content = result.choices[0]?.message?.content;
    return typeof content === "string" ? content : JSON.stringify(content);
  } catch (err) {
    console.error("[BIS Report] Entity LLM summary generation failed:", err);
    return `Entity Investigation Executive Summary\n\nThis report covers a ${String(inv.tier)} entity background investigation for ${String(inv.subjectFullName)} (Reference: ${String(inv.referenceId)}). The investigation yielded a risk score of ${String(inv.riskScore ?? 'N/A')}/100 with a ${String(inv.riskLevel ?? 'pending')} risk classification.\n\nEntity profile, directorship, regulatory compliance, and financial health analysis are presented in the sections below. Please refer to the module results for full details.`;
  }
}

async function generateBisLlmSummary(inv: Record<string, unknown>): Promise<string> {
  const moduleResults = inv.moduleResults as Record<string, unknown> | null;
  const recommendations = (inv.recommendations as string[]) ?? [];

  const moduleText = moduleResults
    ? Object.entries(moduleResults)
        .map(([k, v]) => `  • ${k}: ${JSON.stringify(v)}`)
        .join("\n")
    : "  No module results available.";

  const prompt = `You are a professional background investigation analyst for TourismPay, a financial compliance platform operating across Africa.

Generate a concise, professional executive summary for the following background investigation report. The summary should:
1. Summarise the subject's profile and investigation scope
2. Highlight key risk findings from each module
3. Provide a clear risk assessment (Low / Medium / High / Critical)
4. List the top 3-5 actionable recommendations
5. Use formal, compliance-grade language suitable for a financial institution

Investigation Details:
- Reference ID: ${inv.referenceId}
- Subject: ${inv.subjectFullName}
- Nationality: ${inv.subjectNationality ?? "Unknown"}
- Country: ${inv.subjectCountry ?? "Unknown"}
- Role: ${inv.subjectRole ?? "Unknown"}
- Investigation Tier: ${inv.tier}
- Risk Score: ${inv.riskScore ?? "Pending"}/100
- Risk Level: ${String(inv.riskLevel ?? "Pending").toUpperCase()}
- Status: ${inv.status}
- Consent Obtained: ${inv.consentObtained ? "Yes" : "No"}

Module Results:
${moduleText}

Recommendations:
${recommendations.length > 0 ? recommendations.map((r) => `  • ${r}`).join("\n") : "  None recorded."}

Write a 3-5 paragraph executive summary followed by a bullet-point recommendations section.`;

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are a senior compliance analyst specialising in African market background investigations. Produce concise, factual, professional reports.",
        },
        { role: "user", content: prompt },
      ],
    });
    const content = result.choices[0]?.message?.content;
    return typeof content === "string" ? content : JSON.stringify(content);
  } catch (err) {
    console.error("[BIS Report] LLM summary generation failed:", err);
    return `Executive Summary\n\nThis report covers a ${String(inv.tier)} background investigation for ${String(inv.subjectFullName)} (Reference: ${String(inv.referenceId)}). The investigation yielded a risk score of ${String(inv.riskScore ?? "N/A")}/100 with a ${String(inv.riskLevel ?? "pending")} risk classification.\n\nModule analysis and detailed findings are presented in the sections below. Please refer to the module results for full details.`;
  }
}

// ─── PDF Generation ───────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function riskColor(level: string | null | undefined): string {
  switch (level) {
    case "critical": return "#dc2626";
    case "high": return "#ea580c";
    case "medium": return "#d97706";
    case "low": return "#16a34a";
    default: return "#6b7280";
  }
}

function buildPdfHtml(inv: Record<string, unknown>, llmSummary: string): string {
  const moduleResults = inv.moduleResults as Record<string, unknown> | null;
  const recommendations = (inv.recommendations as string[]) ?? [];
  const riskLvl = String(inv.riskLevel ?? "pending");
  const riskClr = riskColor(riskLvl);

  const moduleSections = moduleResults
    ? Object.entries(moduleResults)
        .map(([key, value]) => {
          const displayKey = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          const displayValue =
            typeof value === "object"
              ? `<pre style="font-size:10px;background:#f9fafb;padding:8px;border-radius:4px;overflow-wrap:break-word;">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`
              : `<p style="margin:4px 0;">${escapeHtml(String(value))}</p>`;
          return `
            <div style="margin-bottom:16px;padding:12px;border:1px solid #e5e7eb;border-radius:6px;">
              <h4 style="margin:0 0 8px;font-size:13px;color:#374151;">${escapeHtml(displayKey)}</h4>
              ${displayValue}
            </div>`;
        })
        .join("")
    : `<p style="color:#6b7280;font-style:italic;">No module results recorded.</p>`;

  const recommendationItems = recommendations.length > 0
    ? recommendations.map((r) => `<li style="margin-bottom:6px;">${escapeHtml(r)}</li>`).join("")
    : `<li style="color:#6b7280;font-style:italic;">No recommendations recorded.</li>`;

  // Convert LLM markdown-style text to paragraphs
  const summaryHtml = llmSummary
    .split(/\n\n+/)
    .map((para) => {
      const trimmed = para.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("•") || trimmed.startsWith("-")) {
        const items = trimmed
          .split(/\n/)
          .filter((l) => l.trim())
          .map((l) => `<li>${escapeHtml(l.replace(/^[•\-]\s*/, ""))}</li>`)
          .join("");
        return `<ul style="margin:8px 0 8px 20px;">${items}</ul>`;
      }
      return `<p style="margin:0 0 10px;line-height:1.6;">${escapeHtml(trimmed)}</p>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #111827; margin: 0; padding: 0; }
  .page { padding: 40px 48px; max-width: 800px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 16px; margin-bottom: 24px; }
  .logo { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
  .logo span { color: #2563eb; }
  .meta { text-align: right; font-size: 10px; color: #6b7280; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-weight: 700; font-size: 11px; color: #fff; text-transform: uppercase; }
  .section { margin-bottom: 28px; }
  .section-title { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #1f2937; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 14px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .field { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px 12px; }
  .field-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 2px; }
  .field-value { font-size: 12px; font-weight: 600; color: #111827; }
  .risk-banner { background: ${riskClr}15; border: 2px solid ${riskClr}; border-radius: 8px; padding: 16px 20px; display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
  .risk-score { font-size: 36px; font-weight: 800; color: ${riskClr}; }
  .risk-label { font-size: 18px; font-weight: 700; color: ${riskClr}; text-transform: uppercase; }
  .risk-desc { font-size: 11px; color: #374151; margin-top: 2px; }
  .summary-box { background: #f8fafc; border-left: 4px solid #2563eb; padding: 16px 20px; border-radius: 0 6px 6px 0; font-size: 12px; line-height: 1.7; }
  .footer { border-top: 1px solid #e5e7eb; padding-top: 12px; margin-top: 32px; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }
  ul { padding-left: 20px; }
  li { margin-bottom: 4px; }
  pre { white-space: pre-wrap; word-break: break-all; }
</style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div class="header">
    <div>
      <div class="logo">Tourism<span>Pay</span></div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px;">Background Investigation Service</div>
    </div>
    <div class="meta">
      <div><strong>Reference:</strong> ${escapeHtml(String(inv.referenceId))}</div>
      <div><strong>Generated:</strong> ${formatDate(new Date())}</div>
      <div><strong>Tier:</strong> ${escapeHtml(String(inv.tier ?? "standard").toUpperCase())}</div>
      <div style="margin-top:6px;"><span class="badge" style="background:${riskClr};">${escapeHtml(riskLvl)}</span></div>
    </div>
  </div>

  <!-- Risk Banner -->
  <div class="risk-banner">
    <div class="risk-score">${inv.riskScore ?? "—"}</div>
    <div>
      <div class="risk-label">${riskLvl} Risk</div>
      <div class="risk-desc">Composite risk score out of 100 based on multi-module analysis</div>
    </div>
  </div>

  <!-- Subject Details -->
  <div class="section">
    <div class="section-title">Subject Information</div>
    <div class="grid-2">
      <div class="field"><div class="field-label">Full Name</div><div class="field-value">${escapeHtml(String(inv.subjectFullName))}</div></div>
      <div class="field"><div class="field-label">Date of Birth</div><div class="field-value">${escapeHtml(String(inv.subjectDob ?? "N/A"))}</div></div>
      <div class="field"><div class="field-label">Nationality</div><div class="field-value">${escapeHtml(String(inv.subjectNationality ?? "N/A"))}</div></div>
      <div class="field"><div class="field-label">Country of Operation</div><div class="field-value">${escapeHtml(String(inv.subjectCountry ?? "N/A"))}</div></div>
      <div class="field"><div class="field-label">Role / Position</div><div class="field-value">${escapeHtml(String(inv.subjectRole ?? "N/A"))}</div></div>
      <div class="field"><div class="field-label">National ID (NIN)</div><div class="field-value">${escapeHtml(String(inv.subjectNin ?? "N/A"))}</div></div>
      <div class="field"><div class="field-label">Phone</div><div class="field-value">${escapeHtml(String(inv.subjectPhone ?? "N/A"))}</div></div>
      <div class="field"><div class="field-label">Email</div><div class="field-value">${escapeHtml(String(inv.subjectEmail ?? "N/A"))}</div></div>
    </div>
  </div>

  <!-- Investigation Details -->
  <div class="section">
    <div class="section-title">Investigation Details</div>
    <div class="grid-2">
      <div class="field"><div class="field-label">Status</div><div class="field-value">${escapeHtml(String(inv.status ?? "N/A").toUpperCase())}</div></div>
      <div class="field"><div class="field-label">Investigation Tier</div><div class="field-value">${escapeHtml(String(inv.tier ?? "N/A").toUpperCase())}</div></div>
      <div class="field"><div class="field-label">Consent Obtained</div><div class="field-value">${inv.consentObtained ? "Yes ✓" : "No ✗"}</div></div>
      <div class="field"><div class="field-label">Initiated</div><div class="field-value">${formatDate(inv.createdAt as any)}</div></div>
      <div class="field"><div class="field-label">Completed</div><div class="field-value">${formatDate(inv.completedAt as any)}</div></div>
      <div class="field"><div class="field-label">Price Paid</div><div class="field-value">${inv.pricePaid ? `${inv.currency ?? "USD"} ${inv.pricePaid}` : "N/A"}</div></div>
    </div>
  </div>

  <!-- Executive Summary -->
  <div class="section">
    <div class="section-title">Executive Summary</div>
    <div class="summary-box">
      ${summaryHtml}
    </div>
  </div>

  <!-- Module Results -->
  <div class="section">
    <div class="section-title">Module Analysis Results</div>
    ${moduleSections}
  </div>

  <!-- Recommendations -->
  <div class="section">
    <div class="section-title">Recommendations</div>
    <ul>
      ${recommendationItems}
    </ul>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div>TourismPay Background Investigation Service — Confidential</div>
    <div>Ref: ${escapeHtml(String(inv.referenceId))} | Generated: ${formatDate(new Date())}</div>
  </div>
</div>
</body>
</html>`;
}

// ─── Entity PDF Template ───────────────────────────────────────────────────

function buildEntityPdfHtml(inv: Record<string, unknown>, llmSummary: string): string {
  const moduleResults = inv.moduleResults as Record<string, unknown> | null;
  const recommendations = (inv.recommendations as string[]) ?? [];
  const riskLvl = String(inv.riskLevel ?? "pending");
  const riskClr = riskColor(riskLvl);

  // Parse structured module results for entity-specific sections
  const companyStructure = (moduleResults?.company_structure ?? moduleResults?.companyStructure) as Record<string, unknown> | null;
  const directorship = (moduleResults?.directorship ?? moduleResults?.directors) as Record<string, unknown> | null;
  const regulatory = (moduleResults?.regulatory_compliance ?? moduleResults?.regulatory) as Record<string, unknown> | null;
  const financial = (moduleResults?.financial_health ?? moduleResults?.financial) as Record<string, unknown> | null;
  const sanctions = (moduleResults?.sanctions_screening ?? moduleResults?.sanctions) as Record<string, unknown> | null;
  const aml = (moduleResults?.aml_check ?? moduleResults?.aml) as Record<string, unknown> | null;

  function renderModuleSection(title: string, data: Record<string, unknown> | null, accentColor = "#2563eb"): string {
    if (!data) return `<div style="margin-bottom:16px;padding:12px;border:1px solid #e5e7eb;border-radius:6px;"><h4 style="margin:0 0 8px;font-size:13px;color:#374151;">${escapeHtml(title)}</h4><p style="color:#6b7280;font-style:italic;font-size:11px;">No data recorded for this module.</p></div>`;
    const rows = Object.entries(data).map(([k, v]) => {
      const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const val = typeof v === "object" ? JSON.stringify(v) : String(v ?? "N/A");
      return `<tr><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:10px;text-transform:uppercase;letter-spacing:0.3px;width:40%;">${escapeHtml(label)}</td><td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;font-size:11px;font-weight:600;color:#111827;">${escapeHtml(val)}</td></tr>`;
    }).join("");
    return `<div style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;"><div style="background:${accentColor}10;border-bottom:2px solid ${accentColor};padding:8px 12px;"><h4 style="margin:0;font-size:12px;font-weight:700;color:${accentColor};text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(title)}</h4></div><table style="width:100%;border-collapse:collapse;">${rows}</table></div>`;
  }

  // Remaining modules not covered by specific sections
  const coveredKeys = new Set(["company_structure", "companyStructure", "directorship", "directors", "regulatory_compliance", "regulatory", "financial_health", "financial", "sanctions_screening", "sanctions", "aml_check", "aml"]);
  const otherModules = moduleResults
    ? Object.entries(moduleResults)
        .filter(([k]) => !coveredKeys.has(k))
        .map(([key, value]) => {
          const displayKey = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          const displayValue = typeof value === "object"
            ? `<pre style="font-size:10px;background:#f9fafb;padding:8px;border-radius:4px;overflow-wrap:break-word;">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`
            : `<p style="margin:4px 0;">${escapeHtml(String(value))}</p>`;
          return `<div style="margin-bottom:16px;padding:12px;border:1px solid #e5e7eb;border-radius:6px;"><h4 style="margin:0 0 8px;font-size:13px;color:#374151;">${escapeHtml(displayKey)}</h4>${displayValue}</div>`;
        }).join("")
    : "";

  const recommendationItems = recommendations.length > 0
    ? recommendations.map((r) => `<li style="margin-bottom:6px;">${escapeHtml(r)}</li>`).join("")
    : `<li style="color:#6b7280;font-style:italic;">No recommendations recorded.</li>`;

  const summaryHtml = llmSummary
    .split(/\n\n+/)
    .map((para) => {
      const trimmed = para.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("•") || trimmed.startsWith("-")) {
        const items = trimmed.split(/\n/).filter((l) => l.trim()).map((l) => `<li>${escapeHtml(l.replace(/^[•\-]\s*/, ""))}</li>`).join("");
        return `<ul style="margin:8px 0 8px 20px;">${items}</ul>`;
      }
      return `<p style="margin:0 0 10px;line-height:1.6;">${escapeHtml(trimmed)}</p>`;
    }).join("");

  const entityType = String(inv.entityType ?? "Business").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #111827; margin: 0; padding: 0; }
  .page { padding: 40px 48px; max-width: 800px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #111827; padding-bottom: 16px; margin-bottom: 24px; }
  .logo { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
  .logo span { color: #7c3aed; }
  .entity-badge { display: inline-block; background: #7c3aed; color: #fff; font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 3px; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
  .meta { text-align: right; font-size: 10px; color: #6b7280; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-weight: 700; font-size: 11px; color: #fff; text-transform: uppercase; }
  .section { margin-bottom: 28px; }
  .section-title { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #1f2937; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 14px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
  .field { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px 12px; }
  .field-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 2px; }
  .field-value { font-size: 12px; font-weight: 600; color: #111827; }
  .risk-banner { background: ${riskClr}15; border: 2px solid ${riskClr}; border-radius: 8px; padding: 16px 20px; display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
  .risk-score { font-size: 36px; font-weight: 800; color: ${riskClr}; }
  .risk-label { font-size: 18px; font-weight: 700; color: ${riskClr}; text-transform: uppercase; }
  .risk-desc { font-size: 11px; color: #374151; margin-top: 2px; }
  .summary-box { background: #f5f3ff; border-left: 4px solid #7c3aed; padding: 16px 20px; border-radius: 0 6px 6px 0; font-size: 12px; line-height: 1.7; }
  .entity-header-box { background: linear-gradient(135deg, #7c3aed10, #2563eb10); border: 1px solid #7c3aed30; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; display: flex; align-items: center; gap: 16px; }
  .entity-icon { width: 48px; height: 48px; background: #7c3aed; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
  .footer { border-top: 1px solid #e5e7eb; padding-top: 12px; margin-top: 32px; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }
  ul { padding-left: 20px; }
  li { margin-bottom: 4px; }
  pre { white-space: pre-wrap; word-break: break-all; }
  .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 80px; color: rgba(124,58,237,0.04); font-weight: 900; pointer-events: none; white-space: nowrap; }
</style>
</head>
<body>
<div class="watermark">ENTITY INVESTIGATION</div>
<div class="page">
  <!-- Header -->
  <div class="header">
    <div>
      <div class="logo">Tourism<span>Pay</span></div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px;">Background Investigation Service</div>
      <div class="entity-badge">★ Entity / Corporate Investigation</div>
    </div>
    <div class="meta">
      <div><strong>Reference:</strong> ${escapeHtml(String(inv.referenceId))}</div>
      <div><strong>Generated:</strong> ${formatDate(new Date())}</div>
      <div><strong>Tier:</strong> ${escapeHtml(String(inv.tier ?? "standard").toUpperCase())}</div>
      <div style="margin-top:6px;"><span class="badge" style="background:${riskClr};">${escapeHtml(riskLvl)}</span></div>
    </div>
  </div>

  <!-- Entity Identity Box -->
  <div class="entity-header-box">
    <div class="entity-icon">🏢</div>
    <div>
      <div style="font-size:18px;font-weight:800;color:#111827;">${escapeHtml(String(inv.subjectFullName))}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:2px;">${escapeHtml(entityType)} &nbsp;•&nbsp; Reg: ${escapeHtml(String(inv.entityRegistrationNumber ?? "N/A"))} &nbsp;•&nbsp; Est. ${escapeHtml(String(inv.entityYearFounded ?? "N/A"))}</div>
      ${inv.entityWebsite ? `<div style="font-size:11px;color:#7c3aed;margin-top:2px;">${escapeHtml(String(inv.entityWebsite))}</div>` : ""}
    </div>
  </div>

  <!-- Risk Banner -->
  <div class="risk-banner">
    <div class="risk-score">${inv.riskScore ?? "—"}</div>
    <div>
      <div class="risk-label">${riskLvl} Risk</div>
      <div class="risk-desc">Composite entity risk score out of 100 based on corporate due diligence analysis</div>
    </div>
  </div>

  <!-- Entity Profile -->
  <div class="section">
    <div class="section-title">Entity Profile</div>
    <div class="grid-2">
      <div class="field"><div class="field-label">Registered Name</div><div class="field-value">${escapeHtml(String(inv.subjectFullName))}</div></div>
      <div class="field"><div class="field-label">Entity Type</div><div class="field-value">${escapeHtml(entityType)}</div></div>
      <div class="field"><div class="field-label">Registration Number</div><div class="field-value">${escapeHtml(String(inv.entityRegistrationNumber ?? "N/A"))}</div></div>
      <div class="field"><div class="field-label">Year Founded</div><div class="field-value">${escapeHtml(String(inv.entityYearFounded ?? "N/A"))}</div></div>
      <div class="field"><div class="field-label">Country of Operation</div><div class="field-value">${escapeHtml(String(inv.subjectCountry ?? "N/A"))}</div></div>
      <div class="field"><div class="field-label">Website</div><div class="field-value">${escapeHtml(String(inv.entityWebsite ?? "N/A"))}</div></div>
      <div class="field"><div class="field-label">Contact Email</div><div class="field-value">${escapeHtml(String(inv.subjectEmail ?? "N/A"))}</div></div>
      <div class="field"><div class="field-label">Contact Phone</div><div class="field-value">${escapeHtml(String(inv.subjectPhone ?? "N/A"))}</div></div>
    </div>
  </div>

  <!-- Investigation Details -->
  <div class="section">
    <div class="section-title">Investigation Details</div>
    <div class="grid-3">
      <div class="field"><div class="field-label">Status</div><div class="field-value">${escapeHtml(String(inv.status ?? "N/A").toUpperCase())}</div></div>
      <div class="field"><div class="field-label">Tier</div><div class="field-value">${escapeHtml(String(inv.tier ?? "N/A").toUpperCase())}</div></div>
      <div class="field"><div class="field-label">Initiated</div><div class="field-value">${formatDate(inv.createdAt as any)}</div></div>
      <div class="field"><div class="field-label">Completed</div><div class="field-value">${formatDate(inv.completedAt as any)}</div></div>
      <div class="field"><div class="field-label">Price Paid</div><div class="field-value">${inv.pricePaid ? `${inv.currency ?? "USD"} ${inv.pricePaid}` : "N/A"}</div></div>
      <div class="field"><div class="field-label">Consent</div><div class="field-value">${inv.consentObtained ? "Obtained ✓" : "Not obtained ✗"}</div></div>
    </div>
  </div>

  <!-- Executive Summary -->
  <div class="section">
    <div class="section-title">Executive Summary</div>
    <div class="summary-box">
      ${summaryHtml}
    </div>
  </div>

  <!-- Company Structure -->
  <div class="section">
    <div class="section-title">Company Structure &amp; Ownership</div>
    ${renderModuleSection("Company Structure", companyStructure, "#7c3aed")}
  </div>

  <!-- Directorship -->
  <div class="section">
    <div class="section-title">Directorship &amp; Key Personnel</div>
    ${renderModuleSection("Directors &amp; Officers", directorship, "#0891b2")}
  </div>

  <!-- Regulatory Compliance -->
  <div class="section">
    <div class="section-title">Regulatory Compliance</div>
    ${renderModuleSection("Regulatory Status", regulatory, "#059669")}
  </div>

  <!-- Financial Health -->
  <div class="section">
    <div class="section-title">Financial Health Indicators</div>
    ${renderModuleSection("Financial Health", financial, "#d97706")}
  </div>

  <!-- Sanctions & AML -->
  <div class="section">
    <div class="section-title">Sanctions &amp; AML Screening</div>
    ${renderModuleSection("Sanctions Screening", sanctions, "#dc2626")}
    ${renderModuleSection("AML Check", aml, "#dc2626")}
  </div>

  ${otherModules ? `<div class="section"><div class="section-title">Additional Module Results</div>${otherModules}</div>` : ""}

  <!-- Recommendations -->
  <div class="section">
    <div class="section-title">Recommendations</div>
    <ul>
      ${recommendationItems}
    </ul>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div>TourismPay Background Investigation Service — Entity Investigation — Confidential</div>
    <div>Ref: ${escapeHtml(String(inv.referenceId))} | Generated: ${formatDate(new Date())}</div>
  </div>
</div>
</body>
</html>`;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const bisReportRouter = router({
  // Generate and upload a PDF report for a completed BIS investigation
  generate: protectedProcedure
    .input(z.object({ investigationId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const inv = await getBisInvestigationById(input.investigationId);
      if (!inv) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Investigation not found." });
      }

      // Branch on subjectType: entity investigations use a distinct template and LLM prompt
      const isEntity = (inv as Record<string, unknown>).subjectType === "entity";
      const llmSummary = isEntity
        ? await generateEntityBisLlmSummary(inv as Record<string, unknown>)
        : await generateBisLlmSummary(inv as Record<string, unknown>);

      // Build the HTML report (entity gets a distinct corporate layout)
      const htmlContent = isEntity
        ? buildEntityPdfHtml(inv as Record<string, unknown>, llmSummary)
        : buildPdfHtml(inv as Record<string, unknown>, llmSummary);

      // Upload the HTML report to S3 (rendered as HTML; browser can print to PDF)
      const fileKey = `bis-reports/inv-${inv.id}/${inv.referenceId}-${randomSuffix()}.html`;
      let fileUrl: string;
      try {
        const result = await storagePut(fileKey, htmlContent, "text/html");
        fileUrl = result.url;
      } catch (err) {
        console.error("[BIS Report] S3 upload failed:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to upload report to storage.",
        });
      }

      // Persist the export record
      const exportRecord = await createBisReportExport({
        investigationId: input.investigationId,
        generatedBy: ctx.user.id,
        fileKey,
        fileUrl,
        fileSizeBytes: Buffer.byteLength(htmlContent, "utf8"),
        llmSummary,
        exportFormat: "html",
      });

      // Notify owner: BIS report ready with download link
      const riskLvl = String(inv.riskLevel ?? "pending").toUpperCase();
      const riskScoreStr = inv.riskScore != null ? `${inv.riskScore}/100` : "N/A";
      await notifyOwner({
        title: `BIS Report Ready — ${inv.referenceId}`,
        content: `A background investigation report has been generated for ${inv.subjectFullName} (Ref: ${inv.referenceId}).\n\nRisk Level: ${riskLvl}\nRisk Score: ${riskScoreStr}\nTier: ${String(inv.tier ?? "standard").toUpperCase()}\n\nReport URL: ${fileUrl}\n\nGenerated by: ${ctx.user.name ?? ctx.user.email ?? "Unknown"}`,
      }).catch(() => {});

      return {
        exportId: exportRecord?.id,
        fileUrl,
        llmSummary,
        referenceId: inv.referenceId,
        subjectName: inv.subjectFullName,
        riskLevel: inv.riskLevel,
        riskScore: inv.riskScore,
      };
    }),

  // List all report exports for an investigation
  listExports: protectedProcedure
    .input(z.object({ investigationId: z.number() }))
    .query(async ({ input }) => {
      return getBisReportExportsByInvestigation(input.investigationId);
    }),

  // Get the latest report export for an investigation
  latestExport: protectedProcedure
    .input(z.object({ investigationId: z.number() }))
    .query(async ({ input }) => {
      return getLatestBisReportExport(input.investigationId);
    }),

  // Get the LLM summary for an investigation (without regenerating the full PDF)
  getSummary: protectedProcedure
    .input(z.object({ investigationId: z.number() }))
    .query(async ({ input }) => {
      const latest = await getLatestBisReportExport(input.investigationId);
      if (!latest) return null;
      return { llmSummary: latest.llmSummary, fileUrl: latest.fileUrl, createdAt: latest.createdAt };
    }),
});
