"""
PDF Report Generator — FastAPI microservice
Generates professional PDF reports for:
- Merchant revenue reports
- BIS investigation reports
- Compliance/AML reports
- Settlement statements
- KYB application summaries
"""

from __future__ import annotations

import io
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from auth import AuthMiddleware
import db as database

app = FastAPI(title="PDF Report Generator", version="1.0.0")


@app.on_event("startup")
async def _startup():
    await database.ensure_tables()


@app.on_event("shutdown")
async def _shutdown():
    await database.close_pool()

app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Brand colours ────────────────────────────────────────────────────────────
BRAND_BLUE = colors.HexColor("#1E40AF")
BRAND_LIGHT = colors.HexColor("#DBEAFE")
BRAND_DARK = colors.HexColor("#1E3A5F")
ACCENT_GREEN = colors.HexColor("#059669")
ACCENT_RED = colors.HexColor("#DC2626")
ACCENT_AMBER = colors.HexColor("#D97706")
LIGHT_GREY = colors.HexColor("#F3F4F6")
MID_GREY = colors.HexColor("#9CA3AF")
TEXT_DARK = colors.HexColor("#111827")

# ─── Models ──────────────────────────────────────────────────────────────────

class MerchantRevenueReportRequest(BaseModel):
    merchant_name: str
    merchant_id: str
    period_start: str
    period_end: str
    total_revenue: float
    total_transactions: int
    currency: str
    top_products: Optional[List[Dict[str, Any]]] = []
    daily_breakdown: Optional[List[Dict[str, Any]]] = []
    generated_by: Optional[str] = "TourismPay Platform"

class BISInvestigationReportRequest(BaseModel):
    investigation_id: str
    subject_name: str
    investigator: str
    risk_score: float
    risk_level: str
    findings: List[str]
    transactions: Optional[List[Dict[str, Any]]] = []
    recommended_action: str
    generated_by: Optional[str] = "TourismPay BIS"

class SettlementStatementRequest(BaseModel):
    participant_name: str
    participant_id: str
    settlement_period: str
    net_position: float
    currency: str
    transactions: Optional[List[Dict[str, Any]]] = []
    generated_by: Optional[str] = "TourismPay Settlement"

class ComplianceReportRequest(BaseModel):
    entity_name: str
    entity_id: str
    report_type: str  # "AML_REVIEW" | "KYB_SUMMARY" | "SAR"
    risk_rating: str
    findings: List[str]
    recommendations: List[str]
    generated_by: Optional[str] = "TourismPay Compliance"

# ─── PDF helpers ──────────────────────────────────────────────────────────────

def make_styles():
    styles = getSampleStyleSheet()
    custom = {
        "Title": ParagraphStyle(
            "Title", parent=styles["Title"],
            fontSize=22, textColor=BRAND_DARK, spaceAfter=6,
            fontName="Helvetica-Bold",
        ),
        "Subtitle": ParagraphStyle(
            "Subtitle", parent=styles["Normal"],
            fontSize=11, textColor=MID_GREY, spaceAfter=12,
        ),
        "SectionHeader": ParagraphStyle(
            "SectionHeader", parent=styles["Normal"],
            fontSize=13, textColor=BRAND_BLUE, spaceBefore=16, spaceAfter=6,
            fontName="Helvetica-Bold",
        ),
        "Body": ParagraphStyle(
            "Body", parent=styles["Normal"],
            fontSize=10, textColor=TEXT_DARK, spaceAfter=4,
        ),
        "Small": ParagraphStyle(
            "Small", parent=styles["Normal"],
            fontSize=8, textColor=MID_GREY,
        ),
        "TableHeader": ParagraphStyle(
            "TableHeader", parent=styles["Normal"],
            fontSize=9, textColor=colors.white, fontName="Helvetica-Bold",
        ),
    }
    return custom


def header_table(title: str, subtitle: str, meta: Dict[str, str]) -> Table:
    """Build a branded header block."""
    meta_lines = "\n".join(f"{k}: {v}" for k, v in meta.items())
    data = [
        [Paragraph(f"<b>TourismPay</b>", ParagraphStyle("H", fontSize=14, textColor=colors.white, fontName="Helvetica-Bold")),
         Paragraph(meta_lines, ParagraphStyle("M", fontSize=8, textColor=BRAND_LIGHT))],
        [Paragraph(title, ParagraphStyle("T", fontSize=16, textColor=colors.white, fontName="Helvetica-Bold")),
         Paragraph(subtitle, ParagraphStyle("S", fontSize=9, textColor=BRAND_LIGHT))],
    ]
    t = Table(data, colWidths=[4 * inch, 3.5 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BRAND_BLUE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    return t


def kv_table(data: List[tuple], col_widths=None) -> Table:
    """Two-column key-value table."""
    col_widths = col_widths or [2.5 * inch, 5 * inch]
    rows = [[Paragraph(f"<b>{k}</b>", ParagraphStyle("K", fontSize=9, textColor=BRAND_DARK)),
             Paragraph(str(v), ParagraphStyle("V", fontSize=9, textColor=TEXT_DARK))]
            for k, v in data]
    t = Table(rows, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_GREY),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, LIGHT_GREY]),
        ("GRID", (0, 0), (-1, -1), 0.3, MID_GREY),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def data_table(headers: List[str], rows: List[List[Any]], col_widths=None) -> Table:
    """Styled data table with branded header row."""
    s = make_styles()
    header_row = [Paragraph(h, s["TableHeader"]) for h in headers]
    all_rows = [header_row] + [[Paragraph(str(c), ParagraphStyle("C", fontSize=8)) for c in row] for row in rows]
    t = Table(all_rows, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GREY]),
        ("GRID", (0, 0), (-1, -1), 0.3, MID_GREY),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return t


def build_pdf(elements: list) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.75 * inch, bottomMargin=0.75 * inch,
    )
    doc.build(elements)
    return buf.getvalue()


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    pool = await database.get_pool()
    return {
        "status": "ok",
        "service": "pdf-report-generator",
        "version": "1.0.0",
        "database": "connected" if pool else "unavailable",
    }


@app.post("/api/v1/reports/merchant-revenue")
async def merchant_revenue_report(req: MerchantRevenueReportRequest):
    """Generate a merchant revenue PDF report."""
    s = make_styles()
    elements = []

    # Header
    elements.append(header_table(
        "Merchant Revenue Report",
        f"{req.period_start} – {req.period_end}",
        {"Merchant": req.merchant_name, "ID": req.merchant_id, "Generated": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")},
    ))
    elements.append(Spacer(1, 12))

    # Summary
    elements.append(Paragraph("Summary", s["SectionHeader"]))
    elements.append(kv_table([
        ("Merchant Name", req.merchant_name),
        ("Merchant ID", req.merchant_id),
        ("Report Period", f"{req.period_start} to {req.period_end}"),
        ("Total Revenue", f"{req.currency} {req.total_revenue:,.2f}"),
        ("Total Transactions", f"{req.total_transactions:,}"),
        ("Average Transaction Value", f"{req.currency} {req.total_revenue / max(req.total_transactions, 1):,.2f}"),
    ]))
    elements.append(Spacer(1, 12))

    # Top products
    if req.top_products:
        elements.append(Paragraph("Top Products / Services", s["SectionHeader"]))
        rows = [[p.get("name", ""), p.get("revenue", 0), p.get("count", 0)] for p in req.top_products[:10]]
        elements.append(data_table(
            ["Product / Service", "Revenue", "Transactions"],
            rows,
            col_widths=[3.5 * inch, 2 * inch, 2 * inch],
        ))
        elements.append(Spacer(1, 12))

    # Daily breakdown
    if req.daily_breakdown:
        elements.append(Paragraph("Daily Breakdown", s["SectionHeader"]))
        rows = [[d.get("date", ""), d.get("revenue", 0), d.get("transactions", 0)] for d in req.daily_breakdown[:31]]
        elements.append(data_table(
            ["Date", "Revenue", "Transactions"],
            rows,
            col_widths=[2.5 * inch, 2.5 * inch, 2.5 * inch],
        ))

    # Footer
    elements.append(Spacer(1, 20))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=MID_GREY))
    elements.append(Paragraph(
        f"Generated by {req.generated_by} · {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} · Confidential",
        s["Small"],
    ))

    pdf_bytes = build_pdf(elements)
    await database.execute(
        "INSERT INTO generated_reports (report_type, entity_id) VALUES ($1,$2)",
        "merchant_revenue", req.merchant_id,
    )
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="merchant-revenue-{req.merchant_id}.pdf"'},
    )


@app.post("/api/v1/reports/bis-investigation")
async def bis_investigation_report(req: BISInvestigationReportRequest):
    """Generate a BIS investigation PDF report."""
    s = make_styles()
    elements = []

    risk_color = ACCENT_RED if req.risk_level == "critical" else ACCENT_AMBER if req.risk_level == "high" else BRAND_BLUE

    elements.append(header_table(
        "BIS Investigation Report",
        f"Investigation ID: {req.investigation_id}",
        {"Subject": req.subject_name, "Investigator": req.investigator, "Generated": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")},
    ))
    elements.append(Spacer(1, 12))

    elements.append(Paragraph("Investigation Summary", s["SectionHeader"]))
    elements.append(kv_table([
        ("Investigation ID", req.investigation_id),
        ("Subject Name", req.subject_name),
        ("Investigator", req.investigator),
        ("Risk Score", f"{req.risk_score:.4f}"),
        ("Risk Level", req.risk_level.upper()),
        ("Recommended Action", req.recommended_action),
    ]))
    elements.append(Spacer(1, 12))

    elements.append(Paragraph("Findings", s["SectionHeader"]))
    for i, finding in enumerate(req.findings, 1):
        elements.append(Paragraph(f"{i}. {finding}", s["Body"]))
    elements.append(Spacer(1, 12))

    if req.transactions:
        elements.append(Paragraph("Associated Transactions", s["SectionHeader"]))
        rows = [[t.get("id", ""), t.get("amount", ""), t.get("currency", ""), t.get("date", ""), t.get("status", "")] for t in req.transactions[:20]]
        elements.append(data_table(
            ["Transaction ID", "Amount", "Currency", "Date", "Status"],
            rows,
            col_widths=[2 * inch, 1.5 * inch, 1 * inch, 1.5 * inch, 1.5 * inch],
        ))

    elements.append(Spacer(1, 20))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=MID_GREY))
    elements.append(Paragraph(
        f"Generated by {req.generated_by} · {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} · STRICTLY CONFIDENTIAL",
        s["Small"],
    ))

    pdf_bytes = build_pdf(elements)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="bis-investigation-{req.investigation_id}.pdf"'},
    )


@app.post("/api/v1/reports/settlement-statement")
async def settlement_statement(req: SettlementStatementRequest):
    """Generate a settlement statement PDF."""
    s = make_styles()
    elements = []

    elements.append(header_table(
        "Settlement Statement",
        req.settlement_period,
        {"Participant": req.participant_name, "ID": req.participant_id, "Generated": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")},
    ))
    elements.append(Spacer(1, 12))

    elements.append(Paragraph("Settlement Summary", s["SectionHeader"]))
    net_color = ACCENT_GREEN if req.net_position >= 0 else ACCENT_RED
    elements.append(kv_table([
        ("Participant", req.participant_name),
        ("Participant ID", req.participant_id),
        ("Settlement Period", req.settlement_period),
        ("Net Position", f"{req.currency} {req.net_position:,.2f}"),
        ("Settlement Status", "SETTLED"),
    ]))
    elements.append(Spacer(1, 12))

    if req.transactions:
        elements.append(Paragraph("Transaction Detail", s["SectionHeader"]))
        rows = [[t.get("id", ""), t.get("type", ""), t.get("amount", ""), t.get("currency", ""), t.get("date", "")] for t in req.transactions[:50]]
        elements.append(data_table(
            ["Transaction ID", "Type", "Amount", "Currency", "Date"],
            rows,
            col_widths=[2 * inch, 1.5 * inch, 1.5 * inch, 1 * inch, 1.5 * inch],
        ))

    elements.append(Spacer(1, 20))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=MID_GREY))
    elements.append(Paragraph(
        f"Generated by {req.generated_by} · {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} · Confidential",
        s["Small"],
    ))

    pdf_bytes = build_pdf(elements)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="settlement-{req.participant_id}.pdf"'},
    )


@app.post("/api/v1/reports/compliance")
async def compliance_report(req: ComplianceReportRequest):
    """Generate a compliance/AML PDF report."""
    s = make_styles()
    elements = []

    elements.append(header_table(
        f"Compliance Report — {req.report_type}",
        f"Entity: {req.entity_name}",
        {"Entity ID": req.entity_id, "Risk Rating": req.risk_rating.upper(), "Generated": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")},
    ))
    elements.append(Spacer(1, 12))

    elements.append(Paragraph("Entity Summary", s["SectionHeader"]))
    elements.append(kv_table([
        ("Entity Name", req.entity_name),
        ("Entity ID", req.entity_id),
        ("Report Type", req.report_type),
        ("Risk Rating", req.risk_rating.upper()),
        ("Generated By", req.generated_by or "TourismPay Compliance"),
    ]))
    elements.append(Spacer(1, 12))

    elements.append(Paragraph("Findings", s["SectionHeader"]))
    for i, finding in enumerate(req.findings, 1):
        elements.append(Paragraph(f"{i}. {finding}", s["Body"]))
    elements.append(Spacer(1, 12))

    elements.append(Paragraph("Recommendations", s["SectionHeader"]))
    for i, rec in enumerate(req.recommendations, 1):
        elements.append(Paragraph(f"{i}. {rec}", s["Body"]))

    elements.append(Spacer(1, 20))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=MID_GREY))
    elements.append(Paragraph(
        f"Generated by {req.generated_by} · {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} · CONFIDENTIAL — FOR INTERNAL USE ONLY",
        s["Small"],
    ))

    pdf_bytes = build_pdf(elements)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="compliance-{req.entity_id}.pdf"'},
    )
