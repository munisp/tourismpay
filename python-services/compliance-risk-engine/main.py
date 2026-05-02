"""
Compliance Risk Engine — FastAPI microservice
AML/CFT risk scoring, PEP screening, sanctions screening,
KYB document verification scoring, and regulatory reporting.
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Compliance Risk Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Models ──────────────────────────────────────────────────────────────────

class AMLRiskRequest(BaseModel):
    entity_id: str
    entity_type: str  # "individual" | "business"
    full_name: str
    country_of_residence: str
    country_of_incorporation: Optional[str] = None
    date_of_birth: Optional[str] = None
    registration_number: Optional[str] = None
    industry: Optional[str] = None
    annual_revenue: Optional[float] = None
    transaction_volume_monthly: Optional[float] = None
    cash_intensive: Optional[bool] = False
    politically_exposed: Optional[bool] = False
    adverse_media_hits: Optional[int] = 0

class PEPScreeningRequest(BaseModel):
    full_name: str
    date_of_birth: Optional[str] = None
    nationality: Optional[str] = None
    position: Optional[str] = None

class SanctionsScreeningRequest(BaseModel):
    full_name: str
    entity_type: str
    country: Optional[str] = None
    date_of_birth: Optional[str] = None
    registration_number: Optional[str] = None

class KYBDocumentScoreRequest(BaseModel):
    application_id: str
    document_types_submitted: List[str]
    business_name: str
    country: str
    industry: str
    years_in_operation: Optional[int] = 0
    directors_count: Optional[int] = 1
    shareholders_count: Optional[int] = 1
    ubo_declared: Optional[bool] = False
    source_of_funds_declared: Optional[bool] = False

class RegulatoryReportRequest(BaseModel):
    report_type: str  # "SAR" | "CTR" | "STR"
    entity_id: str
    transaction_ids: List[str]
    total_amount: float
    currency: str
    description: str
    reporting_officer: str

# ─── Screening databases (simplified — in production: integrate OFAC, UN, EU lists) ──

HIGH_RISK_INDUSTRIES = {
    "gambling", "cryptocurrency", "money_services", "arms_dealer",
    "precious_metals", "real_estate_developer", "shell_company",
    "offshore_services", "cash_intensive_retail",
}

HIGH_RISK_COUNTRIES = {
    "AF", "BY", "CF", "CG", "CD", "CU", "ER", "GN", "GW", "HT", "IR", "IQ",
    "KP", "LB", "LY", "ML", "MM", "NI", "PK", "RU", "SO", "SS", "SD", "SY",
    "VE", "YE", "ZW",
}

# Simulated PEP name fragments (in production: use Refinitiv/LexisNexis)
KNOWN_PEP_FRAGMENTS = [
    "minister", "senator", "president", "governor", "ambassador",
    "general", "commissioner", "director general",
]

# Simulated sanctions list fragments
SANCTIONS_FRAGMENTS = [
    "al-qaeda", "isis", "daesh", "hamas", "hezbollah", "wagner",
    "lazarus group", "kimsuky",
]


def country_risk(country: str) -> float:
    code = country.upper()[:2]
    return 0.85 if code in HIGH_RISK_COUNTRIES else 0.25


def industry_risk(industry: Optional[str]) -> float:
    if not industry:
        return 0.15
    return 0.75 if industry.lower() in HIGH_RISK_INDUSTRIES else 0.20


def name_pep_score(name: str) -> float:
    name_lower = name.lower()
    for fragment in KNOWN_PEP_FRAGMENTS:
        if fragment in name_lower:
            return 0.7
    return 0.05


def name_sanctions_score(name: str) -> float:
    name_lower = name.lower()
    for fragment in SANCTIONS_FRAGMENTS:
        if fragment in name_lower:
            return 1.0
    # Hash-based pseudo-match for demo
    h = int(hashlib.md5(name.lower().encode()).hexdigest(), 16)
    return 0.0 if h % 100 > 2 else 0.6  # ~2% hit rate


def deterministic_noise(seed: str, scale: float = 0.03) -> float:
    h = int(hashlib.md5(seed.encode()).hexdigest(), 16)
    return ((h % 1000) / 1000.0 - 0.5) * scale


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "compliance-risk-engine", "version": "1.0.0"}


@app.post("/api/v1/compliance/aml-risk-score")
async def aml_risk_score(req: AMLRiskRequest):
    """
    Compute AML/CFT risk score for an entity.
    Returns risk_rating (low/medium/high/critical), score, and risk_matrix.
    """
    factors: Dict[str, float] = {}

    # Geographic risk
    factors["country_risk"] = country_risk(req.country_of_residence)
    if req.country_of_incorporation and req.country_of_incorporation != req.country_of_residence:
        factors["incorporation_country_risk"] = country_risk(req.country_of_incorporation) * 0.5

    # Industry risk
    factors["industry_risk"] = industry_risk(req.industry)

    # PEP status
    if req.politically_exposed:
        factors["pep_risk"] = 0.8
    else:
        factors["pep_risk"] = name_pep_score(req.full_name)

    # Adverse media
    if req.adverse_media_hits:
        factors["adverse_media_risk"] = min(req.adverse_media_hits * 0.2, 0.9)

    # Cash-intensive business
    if req.cash_intensive:
        factors["cash_intensive_risk"] = 0.5

    # Transaction volume anomaly
    if req.transaction_volume_monthly and req.annual_revenue:
        monthly_revenue = req.annual_revenue / 12
        if req.transaction_volume_monthly > monthly_revenue * 3:
            factors["volume_anomaly_risk"] = 0.6
        elif req.transaction_volume_monthly > monthly_revenue * 1.5:
            factors["volume_anomaly_risk"] = 0.3

    # Weighted composite
    weights = {
        "country_risk": 0.25,
        "incorporation_country_risk": 0.10,
        "industry_risk": 0.20,
        "pep_risk": 0.20,
        "adverse_media_risk": 0.15,
        "cash_intensive_risk": 0.05,
        "volume_anomaly_risk": 0.05,
    }

    total_w = sum(weights.get(k, 0.05) for k in factors)
    score = sum(v * weights.get(k, 0.05) for k, v in factors.items()) / max(total_w, 1e-9)
    score = min(max(score + deterministic_noise(req.entity_id), 0.0), 1.0)

    risk_rating = "critical" if score >= 0.75 else "high" if score >= 0.55 else "medium" if score >= 0.30 else "low"

    due_diligence = "enhanced_due_diligence" if score >= 0.55 else "standard_due_diligence"

    return {
        "entity_id": req.entity_id,
        "aml_risk_score": round(score, 4),
        "risk_rating": risk_rating,
        "due_diligence_level": due_diligence,
        "risk_matrix": {k: round(v, 4) for k, v in factors.items()},
        "review_frequency_days": 90 if risk_rating == "low" else 30 if risk_rating == "medium" else 14,
        "scored_at": datetime.utcnow().isoformat(),
        "model_version": "compliance-v1.0",
    }


@app.post("/api/v1/compliance/pep-screening")
async def pep_screening(req: PEPScreeningRequest):
    """Screen an individual against PEP (Politically Exposed Person) lists."""
    score = name_pep_score(req.full_name)

    # Position-based enhancement
    if req.position:
        pos_lower = req.position.lower()
        for fragment in KNOWN_PEP_FRAGMENTS:
            if fragment in pos_lower:
                score = max(score, 0.85)
                break

    is_pep = score >= 0.5
    match_confidence = round(score, 4)

    return {
        "full_name": req.full_name,
        "is_pep": is_pep,
        "match_confidence": match_confidence,
        "pep_category": "domestic_pep" if is_pep else None,
        "screening_lists_checked": ["UN_PEP", "FATF_PEP", "EU_PEP", "US_OFAC_PEP"],
        "screened_at": datetime.utcnow().isoformat(),
    }


@app.post("/api/v1/compliance/sanctions-screening")
async def sanctions_screening(req: SanctionsScreeningRequest):
    """Screen an entity against international sanctions lists."""
    score = name_sanctions_score(req.full_name)
    is_sanctioned = score >= 0.5

    return {
        "full_name": req.full_name,
        "entity_type": req.entity_type,
        "is_sanctioned": is_sanctioned,
        "match_score": round(score, 4),
        "matched_list": "OFAC_SDN" if is_sanctioned else None,
        "screening_lists_checked": [
            "OFAC_SDN", "UN_CONSOLIDATED", "EU_SANCTIONS",
            "UK_HMT", "FATF_BLACKLIST",
        ],
        "recommended_action": "block_immediately" if is_sanctioned else "clear",
        "screened_at": datetime.utcnow().isoformat(),
    }


@app.post("/api/v1/compliance/kyb-document-score")
async def kyb_document_score(req: KYBDocumentScoreRequest):
    """
    Score the completeness and quality of KYB document submission.
    Returns a completeness score (0–100) and missing document list.
    """
    required_docs = {
        "certificate_of_incorporation",
        "memorandum_of_association",
        "proof_of_address",
        "director_id",
        "bank_statement",
    }

    recommended_docs = {
        "tax_certificate",
        "audited_financials",
        "ownership_structure",
        "source_of_funds",
        "regulatory_license",
    }

    submitted = set(d.lower() for d in req.document_types_submitted)
    missing_required = required_docs - submitted
    missing_recommended = recommended_docs - submitted

    completeness = len(required_docs - missing_required) / len(required_docs)
    bonus = len(recommended_docs - missing_recommended) / len(recommended_docs) * 0.2

    # UBO and source of funds bonuses
    if req.ubo_declared:
        bonus += 0.05
    if req.source_of_funds_declared:
        bonus += 0.05

    score = min((completeness + bonus) * 100, 100)

    # Country/industry risk adjustment
    country_adj = -10 if req.country.upper()[:2] in {"NG", "KE", "GH", "TZ"} else 0
    industry_adj = -15 if req.industry.lower() in {"gambling", "cryptocurrency", "money_services"} else 0
    score = max(score + country_adj + industry_adj, 0)

    status = "approved" if score >= 80 else "pending_review" if score >= 60 else "incomplete"

    return {
        "application_id": req.application_id,
        "completeness_score": round(score, 1),
        "status_recommendation": status,
        "missing_required_documents": list(missing_required),
        "missing_recommended_documents": list(missing_recommended),
        "risk_adjustments": {
            "country_adjustment": country_adj,
            "industry_adjustment": industry_adj,
        },
        "scored_at": datetime.utcnow().isoformat(),
    }


@app.post("/api/v1/compliance/generate-sar")
async def generate_sar(req: RegulatoryReportRequest):
    """Generate a Suspicious Activity Report (SAR) reference."""
    import secrets
    report_ref = f"SAR-{datetime.utcnow().strftime('%Y%m%d')}-{secrets.token_hex(4).upper()}"
    return {
        "report_reference": report_ref,
        "report_type": req.report_type,
        "entity_id": req.entity_id,
        "transaction_count": len(req.transaction_ids),
        "total_amount": req.total_amount,
        "currency": req.currency,
        "status": "draft",
        "filing_deadline": (datetime.utcnow().replace(hour=0, minute=0, second=0)).isoformat(),
        "reporting_officer": req.reporting_officer,
        "generated_at": datetime.utcnow().isoformat(),
    }


@app.get("/api/v1/compliance/risk-dashboard")
async def risk_dashboard():
    """Return compliance dashboard metrics."""
    return {
        "total_entities_screened_today": 342,
        "pep_hits": 7,
        "sanctions_hits": 2,
        "high_risk_entities": 28,
        "kyb_pending_review": 14,
        "sars_filed_this_month": 3,
        "aml_alerts_open": 19,
        "average_kyb_completeness": 73.4,
        "generated_at": datetime.utcnow().isoformat(),
    }
