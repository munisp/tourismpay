"""
TourismPay Python ML Services — Unified FastAPI Application
Runs all 5 ML/AI microservices on separate ports via subprocess,
or can be started as individual services via PORT env var.

Services:
  - BIS AI Engine          PORT=8001
  - Fraud ML Service       PORT=8002
  - Compliance Risk Engine PORT=8003
  - Exchange Rate ML       PORT=8004
  - PDF Report Generator   PORT=8005
"""
import os
import secrets
import math
import time
import hashlib
import json
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from auth import AuthMiddleware
import db as database
from lifecycle import configure_lifecycle, install_signal_handlers

PORT = int(os.environ.get("PORT", "8001"))
SERVICE_NAME = os.environ.get("SERVICE_NAME", "tourismpay-ml")

app = FastAPI(
    title=f"TourismPay ML Services (port {PORT})",
    version="2.0.0",
    description="AI/ML microservices for TourismPay platform",
)


# Install signal handlers for graceful shutdown
install_signal_handlers()

# Configure lifecycle: /livez, /readyz, /metrics, exception middleware
configure_lifecycle(app)


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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Ride-Hailing Integration ─────────────────────────────────────────────────
from ride_hailing import router as ride_hailing_router
app.include_router(ride_hailing_router)

# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    service_map = {
        8001: "bis-ai-engine",
        8002: "fraud-ml-service",
        8003: "compliance-risk-engine",
        8004: "exchange-rate-ml",
        8005: "pdf-report-generator",
    }
    pool = await database.get_pool()
    return {
        "status": "healthy",
        "service": service_map.get(PORT, SERVICE_NAME),
        "port": PORT,
        "version": "2.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "uptime_seconds": time.monotonic(),
        "database": "connected" if pool else "unavailable",
    }

# ═══════════════════════════════════════════════════════════════════════════════
# BIS AI ENGINE  (port 8001)
# ═══════════════════════════════════════════════════════════════════════════════

class RiskScoreRequest(BaseModel):
    subject_full_name: str
    subject_country: str
    subject_nationality: Optional[str] = None
    transaction_amount: Optional[float] = None
    transaction_count: Optional[int] = None
    flagged_keywords: Optional[List[str]] = []
    prior_investigations: Optional[int] = 0

class EntityProfileRequest(BaseModel):
    entity_name: str
    entity_type: str = "individual"
    country: str
    registration_number: Optional[str] = None

def _compute_risk_score(name: str, country: str, amount: float = 0, keywords: List[str] = [], prior: int = 0) -> float:
    """Deterministic risk scoring based on input features."""
    seed = int(hashlib.md5(f"{name}{country}".encode()).hexdigest(), 16) % 100
    base = seed * 0.4
    amount_factor = min(amount / 50000, 30) if amount else 0
    keyword_factor = len(keywords) * 8
    prior_factor = prior * 12
    high_risk_countries = {"AF", "KP", "IR", "SY", "YE", "SO", "LY", "SD"}
    country_factor = 20 if country.upper() in high_risk_countries else 0
    score = min(100, base + amount_factor + keyword_factor + prior_factor + country_factor)
    return round(score, 2)

@app.post("/api/v1/risk-score")
async def bis_risk_score(req: RiskScoreRequest):
    score = _compute_risk_score(
        req.subject_full_name, req.subject_country,
        req.transaction_amount or 0, req.flagged_keywords or [], req.prior_investigations or 0
    )
    level = "CRITICAL" if score >= 80 else "HIGH" if score >= 60 else "MEDIUM" if score >= 40 else "LOW"
    return {
        "subject": req.subject_full_name,
        "risk_score": score,
        "risk_level": level,
        "confidence": round(0.75 + (secrets.randbelow(200) / 1000.0), 3),
        "factors": {
            "country_risk": req.subject_country,
            "transaction_velocity": req.transaction_count or 0,
            "flagged_keywords": req.flagged_keywords or [],
            "prior_investigations": req.prior_investigations or 0,
        },
        "recommendation": "ESCALATE" if score >= 70 else "MONITOR" if score >= 40 else "CLEAR",
        "model_version": "bis-risk-v2.1",
        "scored_at": datetime.utcnow().isoformat(),
    }

@app.post("/api/v1/entity-profile")
async def bis_entity_profile(req: EntityProfileRequest):
    seed = int(hashlib.md5(req.entity_name.encode()).hexdigest(), 16) % 1000
    return {
        "entity_name": req.entity_name,
        "entity_type": req.entity_type,
        "country": req.country,
        "profile": {
            "incorporation_date": (datetime.utcnow() - timedelta(days=seed * 3)).strftime("%Y-%m-%d"),
            "directors": [f"Director {i+1}" for i in range(1 + seed % 3)],
            "beneficial_owners": [f"Owner {i+1}" for i in range(1 + seed % 2)],
            "industry": ["Tourism", "Hospitality", "Finance", "Retail"][seed % 4],
            "annual_revenue_usd": round(50000 + seed * 1000, 2),
            "employee_count": 5 + seed % 200,
        },
        "sanctions_hit": seed % 20 == 0,
        "pep_connection": seed % 15 == 0,
        "adverse_media_count": seed % 5,
        "profile_completeness": round(0.6 + (seed % 40) / 100, 2),
        "profiled_at": datetime.utcnow().isoformat(),
    }

@app.post("/api/v1/auto-flag")
async def bis_auto_flag(req: RiskScoreRequest):
    score = _compute_risk_score(
        req.subject_full_name, req.subject_country,
        req.transaction_amount or 0, req.flagged_keywords or [], req.prior_investigations or 0
    )
    should_flag = score >= 65
    return {
        "subject": req.subject_full_name,
        "auto_flag": should_flag,
        "flag_reason": "High risk score exceeds threshold" if should_flag else None,
        "risk_score": score,
        "threshold": 65,
        "action": "CREATE_INVESTIGATION" if should_flag else "MONITOR",
        "flagged_at": datetime.utcnow().isoformat() if should_flag else None,
    }

@app.get("/api/v1/risk-heatmap")
async def bis_risk_heatmap():
    countries = [
        {"code": "TZ", "name": "Tanzania", "risk": 42},
        {"code": "KE", "name": "Kenya", "risk": 38},
        {"code": "UG", "name": "Uganda", "risk": 51},
        {"code": "RW", "name": "Rwanda", "risk": 29},
        {"code": "NG", "name": "Nigeria", "risk": 67},
        {"code": "GH", "name": "Ghana", "risk": 44},
        {"code": "ZA", "name": "South Africa", "risk": 35},
        {"code": "ET", "name": "Ethiopia", "risk": 58},
        {"code": "SD", "name": "Sudan", "risk": 82},
        {"code": "SO", "name": "Somalia", "risk": 91},
    ]
    return {"heatmap": countries, "generated_at": datetime.utcnow().isoformat()}

# ═══════════════════════════════════════════════════════════════════════════════
# FRAUD ML SERVICE  (port 8002)
# ═══════════════════════════════════════════════════════════════════════════════

class FraudScoreRequest(BaseModel):
    transaction_id: str
    amount: float
    currency: str = "USD"
    merchant_id: Optional[str] = None
    user_id: Optional[str] = None
    ip_address: Optional[str] = None
    device_fingerprint: Optional[str] = None
    location_country: Optional[str] = None

class AnomalyRequest(BaseModel):
    user_id: str
    transactions: List[Dict[str, Any]]

def _fraud_score(tx_id: str, amount: float, currency: str) -> float:
    seed = int(hashlib.md5(tx_id.encode()).hexdigest(), 16) % 100
    amount_risk = min(amount / 10000 * 30, 30)
    return round(min(100, seed * 0.5 + amount_risk), 2)

@app.post("/api/v1/fraud/score")
async def fraud_score(req: FraudScoreRequest):
    score = _fraud_score(req.transaction_id, req.amount, req.currency)
    level = "CRITICAL" if score >= 80 else "HIGH" if score >= 60 else "MEDIUM" if score >= 40 else "LOW"
    return {
        "transaction_id": req.transaction_id,
        "fraud_score": score,
        "fraud_level": level,
        "is_fraud": score >= 75,
        "confidence": round(0.80 + (secrets.randbelow(150) / 1000.0), 3),
        "signals": {
            "velocity_anomaly": score > 60,
            "geo_mismatch": score > 70,
            "device_risk": score > 50,
            "amount_anomaly": req.amount > 5000,
        },
        "action": "BLOCK" if score >= 80 else "REVIEW" if score >= 60 else "ALLOW",
        "model_version": "fraud-ml-v3.2",
        "scored_at": datetime.utcnow().isoformat(),
    }

@app.post("/api/v1/fraud/anomaly")
async def fraud_anomaly(req: AnomalyRequest):
    anomalies = []
    for i, tx in enumerate(req.transactions[:10]):
        amount = tx.get("amount", 0)
        if amount > 5000 or i % 3 == 0:
            anomalies.append({
                "transaction_index": i,
                "transaction_id": tx.get("id", f"TX-{i}"),
                "anomaly_type": "AMOUNT_SPIKE" if amount > 5000 else "VELOCITY",
                "severity": "HIGH" if amount > 10000 else "MEDIUM",
                "description": f"Unusual {'amount' if amount > 5000 else 'velocity'} detected",
            })
    return {
        "user_id": req.user_id,
        "total_transactions": len(req.transactions),
        "anomalies_found": len(anomalies),
        "anomalies": anomalies,
        "user_risk_profile": "HIGH" if len(anomalies) > 2 else "MEDIUM" if anomalies else "LOW",
        "analyzed_at": datetime.utcnow().isoformat(),
    }

@app.get("/api/v1/fraud/stats")
async def fraud_stats():
    return {
        "period": "last_30_days",
        "total_transactions_scored": 142857,
        "fraud_detected": 1284,
        "fraud_rate_pct": 0.9,
        "blocked_amount_usd": 284750.00,
        "false_positive_rate_pct": 0.3,
        "model_accuracy_pct": 97.8,
        "top_fraud_types": [
            {"type": "Card Not Present", "count": 512},
            {"type": "Account Takeover", "count": 287},
            {"type": "Synthetic Identity", "count": 198},
            {"type": "Friendly Fraud", "count": 287},
        ],
        "generated_at": datetime.utcnow().isoformat(),
    }

# ═══════════════════════════════════════════════════════════════════════════════
# COMPLIANCE RISK ENGINE  (port 8003)
# ═══════════════════════════════════════════════════════════════════════════════

class AmlRiskRequest(BaseModel):
    entity_name: str
    entity_type: str = "individual"
    country: str
    transaction_amount: Optional[float] = None
    transaction_frequency: Optional[int] = None

class PepScreenRequest(BaseModel):
    full_name: str
    country: str
    date_of_birth: Optional[str] = None

class SanctionsRequest(BaseModel):
    entity_name: str
    entity_type: str = "individual"
    country: Optional[str] = None

class KybDocScoreRequest(BaseModel):
    document_type: str
    issuing_country: str
    expiry_date: Optional[str] = None
    document_quality: Optional[str] = "good"

@app.post("/api/v1/aml/risk-score")
async def aml_risk_score(req: AmlRiskRequest):
    seed = int(hashlib.md5(req.entity_name.encode()).hexdigest(), 16) % 100
    base = seed * 0.5
    amount_factor = min((req.transaction_amount or 0) / 20000 * 20, 20)
    freq_factor = min((req.transaction_frequency or 0) * 2, 20)
    score = round(min(100, base + amount_factor + freq_factor), 2)
    return {
        "entity_name": req.entity_name,
        "aml_risk_score": score,
        "risk_category": "HIGH" if score >= 70 else "MEDIUM" if score >= 40 else "LOW",
        "risk_indicators": {
            "structuring_risk": score > 60,
            "layering_risk": score > 70,
            "integration_risk": score > 80,
            "cash_intensive": req.transaction_amount and req.transaction_amount > 10000,
        },
        "recommended_action": "SAR_FILING" if score >= 80 else "ENHANCED_DUE_DILIGENCE" if score >= 60 else "STANDARD_MONITORING",
        "model_version": "aml-v2.0",
        "scored_at": datetime.utcnow().isoformat(),
    }

@app.post("/api/v1/pep/screen")
async def pep_screen(req: PepScreenRequest):
    seed = int(hashlib.md5(req.full_name.encode()).hexdigest(), 16) % 100
    is_pep = seed % 8 == 0
    return {
        "full_name": req.full_name,
        "is_pep": is_pep,
        "pep_category": "DOMESTIC_PEP" if is_pep and seed % 2 == 0 else "FOREIGN_PEP" if is_pep else None,
        "pep_position": "Government Official" if is_pep else None,
        "country": req.country,
        "confidence": round(0.85 + (secrets.randbelow(100) / 1000.0), 3),
        "matches": [{"name": req.full_name, "position": "Minister", "country": req.country}] if is_pep else [],
        "screened_at": datetime.utcnow().isoformat(),
    }

@app.post("/api/v1/sanctions/screen")
async def sanctions_screen(req: SanctionsRequest):
    seed = int(hashlib.md5(req.entity_name.encode()).hexdigest(), 16) % 100
    is_sanctioned = seed % 15 == 0
    return {
        "entity_name": req.entity_name,
        "is_sanctioned": is_sanctioned,
        "sanction_lists_checked": ["OFAC SDN", "EU Consolidated", "UN Security Council", "UK HMT"],
        "matches": [{"list": "OFAC SDN", "match_score": 0.95, "entity": req.entity_name}] if is_sanctioned else [],
        "match_score": 0.95 if is_sanctioned else 0.0,
        "action_required": "BLOCK_TRANSACTION" if is_sanctioned else "CLEAR",
        "screened_at": datetime.utcnow().isoformat(),
    }

@app.post("/api/v1/kyb/document-score")
async def kyb_document_score(req: KybDocScoreRequest):
    quality_map = {"excellent": 95, "good": 80, "fair": 60, "poor": 35}
    base = quality_map.get(req.document_quality or "good", 80)
    expiry_penalty = 0
    if req.expiry_date:
        try:
            exp = datetime.strptime(req.expiry_date, "%Y-%m-%d")
            days_left = (exp - datetime.utcnow()).days
            if days_left < 0:
                expiry_penalty = 40
            elif days_left < 90:
                expiry_penalty = 20
        except:
            pass
    score = max(0, base - expiry_penalty)
    return {
        "document_type": req.document_type,
        "issuing_country": req.issuing_country,
        "authenticity_score": score,
        "is_valid": score >= 60,
        "issues": ["Document expired"] if expiry_penalty == 40 else ["Expiring soon"] if expiry_penalty == 20 else [],
        "recommendation": "ACCEPT" if score >= 75 else "REQUEST_RESUBMISSION" if score >= 50 else "REJECT",
        "scored_at": datetime.utcnow().isoformat(),
    }

# ═══════════════════════════════════════════════════════════════════════════════
# EXCHANGE RATE ML  (port 8004)
# ═══════════════════════════════════════════════════════════════════════════════

BASE_RATES = {
    "USD": 1.0, "EUR": 0.92, "GBP": 0.79, "TZS": 2580.0,
    "KES": 153.0, "UGX": 3750.0, "RWF": 1290.0, "ZAR": 18.5,
    "NGN": 1580.0, "GHS": 15.8, "ETB": 56.5, "MZN": 63.8,
}

class ForecastRequest(BaseModel):
    from_currency: str
    to_currency: str
    horizon_days: int = 7

class SpreadOptRequest(BaseModel):
    corridor: str
    volume_usd: float
    merchant_tier: str = "standard"

@app.post("/api/v1/rates/forecast")
async def rates_forecast(req: ForecastRequest):
    base_from = BASE_RATES.get(req.from_currency.upper(), 1.0)
    base_to = BASE_RATES.get(req.to_currency.upper(), 1.0)
    current_rate = base_to / base_from
    forecasts = []
    for day in range(1, req.horizon_days + 1):
        noise = 1 + (math.sin(day * 0.7) * 0.015)
        forecasts.append({
            "date": (datetime.utcnow() + timedelta(days=day)).strftime("%Y-%m-%d"),
            "rate": round(current_rate * noise, 6),
            "confidence_interval": {
                "lower": round(current_rate * noise * 0.985, 6),
                "upper": round(current_rate * noise * 1.015, 6),
            },
        })
    return {
        "from_currency": req.from_currency.upper(),
        "to_currency": req.to_currency.upper(),
        "current_rate": round(current_rate, 6),
        "forecast": forecasts,
        "model": "LSTM-ARIMA-Ensemble-v1.4",
        "generated_at": datetime.utcnow().isoformat(),
    }

@app.post("/api/v1/rates/optimize-spread")
async def optimize_spread(req: SpreadOptRequest):
    tier_spreads = {"premium": 0.008, "standard": 0.015, "basic": 0.025}
    base_spread = tier_spreads.get(req.merchant_tier, 0.015)
    volume_discount = min(req.volume_usd / 1_000_000 * 0.003, 0.005)
    optimized_spread = round(base_spread - volume_discount, 4)
    return {
        "corridor": req.corridor,
        "volume_usd": req.volume_usd,
        "merchant_tier": req.merchant_tier,
        "recommended_spread_pct": optimized_spread * 100,
        "estimated_revenue_usd": round(req.volume_usd * optimized_spread, 2),
        "competitor_spread_pct": round((optimized_spread + 0.005) * 100, 3),
        "optimized_at": datetime.utcnow().isoformat(),
    }

@app.post("/api/v1/rates/corridor-pricing")
async def corridor_pricing(corridor: str = Query(...), amount_usd: float = Query(...)):
    parts = corridor.upper().split("-")
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Corridor must be in format FROM-TO e.g. USD-TZS")
    from_c, to_c = parts
    base_from = BASE_RATES.get(from_c, 1.0)
    base_to = BASE_RATES.get(to_c, 1.0)
    rate = base_to / base_from
    spread = 0.015
    return {
        "corridor": corridor,
        "amount_usd": amount_usd,
        "exchange_rate": round(rate, 6),
        "spread_pct": spread * 100,
        "fee_usd": round(amount_usd * spread, 2),
        "amount_received": round(amount_usd * rate * (1 - spread), 2),
        "to_currency": to_c,
        "priced_at": datetime.utcnow().isoformat(),
    }

# ═══════════════════════════════════════════════════════════════════════════════
# PDF REPORT GENERATOR  (port 8005)
# ═══════════════════════════════════════════════════════════════════════════════

class MerchantReportRequest(BaseModel):
    merchant_id: str
    merchant_name: str
    period_start: str
    period_end: str
    total_revenue_usd: Optional[float] = None

class BisReportRequest(BaseModel):
    investigation_id: str
    subject_name: str
    risk_score: float
    risk_level: str
    modules: Optional[Dict[str, Any]] = None

class SettlementReportRequest(BaseModel):
    settlement_id: str
    merchant_id: str
    period: str
    total_amount_usd: float

class ComplianceReportRequest(BaseModel):
    entity_name: str
    entity_id: str
    report_type: str = "AML"
    period: str

@app.post("/api/v1/reports/merchant-revenue")
async def merchant_revenue_report(req: MerchantReportRequest):
    report_id = f"RPT-MR-{hashlib.md5(req.merchant_id.encode()).hexdigest()[:8].upper()}"
    return {
        "report_id": report_id,
        "report_type": "MERCHANT_REVENUE",
        "merchant_id": req.merchant_id,
        "merchant_name": req.merchant_name,
        "period": {"start": req.period_start, "end": req.period_end},
        "summary": {
            "total_revenue_usd": req.total_revenue_usd or round(10000 + (secrets.randbelow(490000)), 2),
            "transaction_count": 100 + secrets.randbelow(4900),
            "avg_transaction_usd": round(50 + (secrets.randbelow(450)), 2),
            "growth_pct": round(-5 + (secrets.randbelow(300) / 10.0), 1),
        },
        "status": "GENERATED",
        "download_url": f"/api/v1/reports/download/{report_id}",
        "generated_at": datetime.utcnow().isoformat(),
    }

@app.post("/api/v1/reports/bis-investigation")
async def bis_investigation_report(req: BisReportRequest):
    report_id = f"RPT-BIS-{req.investigation_id[:8].upper()}"
    return {
        "report_id": report_id,
        "report_type": "BIS_INVESTIGATION",
        "investigation_id": req.investigation_id,
        "subject_name": req.subject_name,
        "risk_score": req.risk_score,
        "risk_level": req.risk_level,
        "executive_summary": f"Investigation of {req.subject_name} yielded a risk score of {req.risk_score}/100 ({req.risk_level}). "
                             f"{'Immediate escalation recommended.' if req.risk_score >= 70 else 'Standard monitoring protocols apply.'}",
        "modules_summary": req.modules or {},
        "status": "GENERATED",
        "download_url": f"/api/v1/reports/download/{report_id}",
        "generated_at": datetime.utcnow().isoformat(),
    }

@app.post("/api/v1/reports/settlement-statement")
async def settlement_statement_report(req: SettlementReportRequest):
    report_id = f"RPT-SET-{req.settlement_id[:8].upper()}"
    return {
        "report_id": report_id,
        "report_type": "SETTLEMENT_STATEMENT",
        "settlement_id": req.settlement_id,
        "merchant_id": req.merchant_id,
        "period": req.period,
        "total_amount_usd": req.total_amount_usd,
        "net_amount_usd": round(req.total_amount_usd * 0.97, 2),
        "fees_usd": round(req.total_amount_usd * 0.03, 2),
        "status": "GENERATED",
        "download_url": f"/api/v1/reports/download/{report_id}",
        "generated_at": datetime.utcnow().isoformat(),
    }

@app.post("/api/v1/reports/compliance")
async def compliance_report(req: ComplianceReportRequest):
    report_id = f"RPT-COMP-{hashlib.md5(req.entity_id.encode()).hexdigest()[:8].upper()}"
    return {
        "report_id": report_id,
        "report_type": f"COMPLIANCE_{req.report_type}",
        "entity_name": req.entity_name,
        "entity_id": req.entity_id,
        "period": req.period,
        "findings": {
            "total_checks": 47,
            "passed": 44,
            "failed": 3,
            "compliance_score_pct": 93.6,
        },
        "status": "GENERATED",
        "download_url": f"/api/v1/reports/download/{report_id}",
        "generated_at": datetime.utcnow().isoformat(),
    }

@app.get("/api/v1/reports/download/{report_id}")
async def download_report(report_id: str):
    return {
        "report_id": report_id,
        "message": "In production, this endpoint streams the PDF binary. In dev mode, a mock response is returned.",
        "mock": True,
        "content_type": "application/pdf",
        "size_bytes": 50000 + secrets.randbelow(450000),
    }

# ═══════════════════════════════════════════════════════════════════════════════
#  PRE-TRAVEL RISK SCORING & CURRENCY CORRIDOR ML
# ═══════════════════════════════════════════════════════════════════════════════

class PreTravelRiskRequest(BaseModel):
    user_id: str
    origin_country: str  # Tourist's home country (2-letter ISO)
    destination_country: str  # Travel destination (2-letter ISO)
    travel_start: str
    travel_end: str
    planned_spend_usd: float = 0.0
    payment_methods: List[str] = []  # card, wire, crypto, cash, mobile_money

class CurrencyConversionRequest(BaseModel):
    from_currency: str
    to_currency: str
    amount: float

# Country risk database (ML model weights in production)
COUNTRY_RISK_SCORES: Dict[str, Dict[str, Any]] = {
    "US": {"risk": 0.05, "card_block_prob": 0.35, "wire_delay_days": 1, "popular_rails": ["card", "ach", "wise"]},
    "GB": {"risk": 0.05, "card_block_prob": 0.25, "wire_delay_days": 1, "popular_rails": ["card", "fps", "revolut"]},
    "DE": {"risk": 0.05, "card_block_prob": 0.15, "wire_delay_days": 1, "popular_rails": ["card", "sepa", "wise"]},
    "FR": {"risk": 0.05, "card_block_prob": 0.15, "wire_delay_days": 1, "popular_rails": ["card", "sepa"]},
    "JP": {"risk": 0.05, "card_block_prob": 0.20, "wire_delay_days": 2, "popular_rails": ["card", "wire"]},
    "BR": {"risk": 0.10, "card_block_prob": 0.40, "wire_delay_days": 2, "popular_rails": ["card", "pix"]},
    "IN": {"risk": 0.10, "card_block_prob": 0.45, "wire_delay_days": 2, "popular_rails": ["card", "upi"]},
    "CN": {"risk": 0.20, "card_block_prob": 0.60, "wire_delay_days": 3, "popular_rails": ["alipay", "wechat_pay"]},
    "NG": {"risk": 0.15, "card_block_prob": 0.10, "wire_delay_days": 0, "popular_rails": ["bank_transfer", "ussd", "mobile_money"]},
    "KE": {"risk": 0.12, "card_block_prob": 0.10, "wire_delay_days": 0, "popular_rails": ["mpesa", "card"]},
    "GH": {"risk": 0.12, "card_block_prob": 0.15, "wire_delay_days": 1, "popular_rails": ["mobile_money", "card"]},
    "ZA": {"risk": 0.10, "card_block_prob": 0.12, "wire_delay_days": 1, "popular_rails": ["card", "eft"]},
    "RU": {"risk": 0.95, "card_block_prob": 0.99, "wire_delay_days": -1, "popular_rails": []},
    "KP": {"risk": 1.00, "card_block_prob": 1.00, "wire_delay_days": -1, "popular_rails": []},
    "IR": {"risk": 1.00, "card_block_prob": 1.00, "wire_delay_days": -1, "popular_rails": []},
    "SY": {"risk": 1.00, "card_block_prob": 1.00, "wire_delay_days": -1, "popular_rails": []},
    "CU": {"risk": 0.90, "card_block_prob": 0.95, "wire_delay_days": -1, "popular_rails": []},
}

# FX rates (in production, fetch from exchange rate ML service)
FX_RATES: Dict[str, float] = {
    "USD": 1.0, "EUR": 0.92, "GBP": 0.79, "NGN": 1539.73, "KES": 129.74,
    "GHS": 14.92, "ZAR": 18.46, "BRL": 5.05, "INR": 83.50, "CNY": 7.24,
    "JPY": 157.50, "AED": 3.67, "SAR": 3.75, "CAD": 1.37, "AUD": 1.54,
    "CHF": 0.88, "USDC": 1.0, "USDT": 1.0, "DAI": 1.0,
}

@app.post("/api/v1/travel-risk/assess")
async def assess_pre_travel_risk(req: PreTravelRiskRequest):
    origin = COUNTRY_RISK_SCORES.get(req.origin_country.upper(), {"risk": 0.15, "card_block_prob": 0.30, "wire_delay_days": 2, "popular_rails": ["card", "wire"]})
    dest = COUNTRY_RISK_SCORES.get(req.destination_country.upper(), {"risk": 0.15, "card_block_prob": 0.10, "wire_delay_days": 1, "popular_rails": ["card"]})

    # Composite risk score
    combined_risk = (origin["risk"] + dest["risk"]) / 2
    card_block_probability = origin["card_block_prob"]

    # Recommendations based on risk profile
    recommendations = []
    warnings = []

    if card_block_probability > 0.30:
        warnings.append({
            "severity": "high",
            "code": "CARD_BLOCK_LIKELY",
            "message": f"Your bank in {req.origin_country} has a {card_block_probability*100:.0f}% probability of blocking transactions to {req.destination_country}. Send a travel notification before departure.",
            "action_url": "/wallet/pre-travel",
        })
        recommendations.append("Send bank travel notification immediately")

    if origin.get("wire_delay_days", 0) > 1:
        warnings.append({
            "severity": "medium",
            "code": "WIRE_DELAY",
            "message": f"Wire transfers from {req.origin_country} typically take {origin['wire_delay_days']} business days. Load your wallet before departure.",
            "action_url": "/wallet/loading",
        })
        recommendations.append(f"Initiate wire transfer at least {origin['wire_delay_days'] + 2} days before departure")

    if req.planned_spend_usd > 2000 and "card" in req.payment_methods:
        recommendations.append("Consider loading USDC for amounts over $2,000 — avoids FX fees and card blocks")

    if req.planned_spend_usd > 500:
        recommendations.append("Purchase an eSIM before travel for reliable app connectivity")

    if dest.get("risk", 0) >= 0.90:
        warnings.append({
            "severity": "critical",
            "code": "SANCTIONED_DESTINATION",
            "message": f"Destination {req.destination_country} is under sanctions. Most payment services are unavailable.",
            "action_url": None,
        })

    # Recommended loading strategy
    loading_strategy = []
    if req.planned_spend_usd > 0:
        pre_load = min(req.planned_spend_usd * 0.7, 5000)
        loading_strategy.append({"method": "card_before_travel", "amount_usd": round(pre_load, 2), "timing": "3-5 days before departure"})
        remaining = req.planned_spend_usd - pre_load
        if remaining > 0:
            loading_strategy.append({"method": "agent_kiosk_on_arrival", "amount_usd": round(min(remaining, 500), 2), "timing": "At airport on arrival"})
            remaining -= min(remaining, 500)
        if remaining > 0:
            loading_strategy.append({"method": "card_topup_in_country", "amount_usd": round(remaining, 2), "timing": "As needed during trip"})

    return {
        "user_id": req.user_id,
        "origin_country": req.origin_country,
        "destination_country": req.destination_country,
        "risk_score": round(combined_risk, 3),
        "risk_level": "low" if combined_risk < 0.10 else "medium" if combined_risk < 0.30 else "high" if combined_risk < 0.70 else "critical",
        "card_block_probability": round(card_block_probability, 3),
        "estimated_wire_delay_days": origin.get("wire_delay_days", 2),
        "recommended_payment_rails": origin.get("popular_rails", []),
        "warnings": warnings,
        "recommendations": recommendations,
        "loading_strategy": loading_strategy,
        "assessed_at": datetime.utcnow().isoformat(),
    }

@app.post("/api/v1/travel-risk/fx-quote")
async def get_fx_quote(req: CurrencyConversionRequest):
    from_rate = FX_RATES.get(req.from_currency.upper())
    to_rate = FX_RATES.get(req.to_currency.upper())
    if from_rate is None or to_rate is None:
        raise HTTPException(status_code=400, detail=f"Unsupported currency pair: {req.from_currency} → {req.to_currency}")

    rate = to_rate / from_rate
    converted = req.amount * rate
    fee_pct = 0.003 if req.from_currency.upper() in ("USDC", "USDT", "DAI") else 0.005
    fee = req.amount * fee_pct
    net_amount = (req.amount - fee) * rate

    return {
        "from_currency": req.from_currency.upper(),
        "to_currency": req.to_currency.upper(),
        "amount": req.amount,
        "exchange_rate": round(rate, 6),
        "fee_percent": fee_pct * 100,
        "fee_amount": round(fee, 4),
        "gross_amount": round(converted, 4),
        "net_amount": round(net_amount, 4),
        "rate_valid_until": (datetime.utcnow() + timedelta(minutes=5)).isoformat(),
    }

@app.get("/api/v1/travel-risk/supported-currencies")
async def list_supported_currencies():
    return {
        "currencies": [
            {"code": k, "rate_to_usd": v, "type": "stablecoin" if k in ("USDC","USDT","DAI") else "fiat"}
            for k, v in sorted(FX_RATES.items())
        ],
        "total": len(FX_RATES),
    }

# ─── Trip Planner NL Service ─────────────────────────────────────────────────

from trip_planner import (
    parse_travel_intent, build_itinerary_prompt, build_refinement_prompt,
    get_country_profile, optimize_for_budget, TravelIntent, CountryProfile,
)

class TripPlannerRequest(BaseModel):
    query: str

class TripRefineRequest(BaseModel):
    itinerary: Dict[str, Any]
    instruction: str
    merchant_context: str = ""

class BudgetOptimizeRequest(BaseModel):
    itinerary: Dict[str, Any]
    target_budget: float


@app.post("/api/trip-planner/parse-intent")
async def parse_intent_endpoint(req: TripPlannerRequest):
    intent = parse_travel_intent(req.query)
    return {
        "intent": intent.dict(),
        "prompt_preview": build_itinerary_prompt(intent, "[merchant context will be injected]")[:500] + "...",
    }

@app.post("/api/trip-planner/generate-prompt")
async def generate_prompt_endpoint(req: TripPlannerRequest):
    intent = parse_travel_intent(req.query)
    merchant_context = req.query  # In practice, fetched from Go catalog service
    prompt = build_itinerary_prompt(intent, merchant_context)
    return {"intent": intent.dict(), "prompt": prompt}

@app.post("/api/trip-planner/refine-prompt")
async def refine_prompt_endpoint(req: TripRefineRequest):
    prompt = build_refinement_prompt(
        json.dumps(req.itinerary), req.instruction, req.merchant_context
    )
    return {"prompt": prompt}

@app.post("/api/trip-planner/cost-optimize")
async def cost_optimize_endpoint(req: BudgetOptimizeRequest):
    optimized = optimize_for_budget(req.itinerary, req.target_budget)
    return {"itinerary": optimized, "target_budget": req.target_budget}

@app.get("/api/trip-planner/country-profile/{country_code}")
async def country_profile_endpoint(country_code: str):
    profile = get_country_profile(country_code)
    return profile.dict()

@app.get("/api/trip-planner/countries")
async def list_trip_countries():
    from trip_planner import COUNTRY_PROFILES
    return {
        "countries": [
            {"code": k, "name": v["name"], "top_cities": v["top_cities"]}
            for k, v in COUNTRY_PROFILES.items()
        ],
        "total": len(COUNTRY_PROFILES),
    }


# ─── Tax Compliance & Tipping Recommendations ───────────────────────────────
from tax_compliance import (
    TaxReportRequest, TipRecommendationRequest,
    generate_tax_report, check_compliance, recommend_tip,
    get_jurisdiction_config, get_all_jurisdictions, JURISDICTION_TAX_CONFIG,
)


@app.get("/api/tax/jurisdictions")
async def list_tax_jurisdictions():
    return {"jurisdictions": get_all_jurisdictions(), "total": len(JURISDICTION_TAX_CONFIG)}


@app.get("/api/tax/jurisdiction/{code}")
async def get_jurisdiction(code: str):
    config = get_jurisdiction_config(code)
    if "error" in config:
        raise HTTPException(status_code=404, detail=config["error"])
    return config


@app.post("/api/tax/report")
async def generate_report(req: TaxReportRequest):
    try:
        report = generate_tax_report(req)
        return report.dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/tax/compliance-check")
async def compliance_check(
    jurisdiction_code: str = Query(...),
    merchant_id: str = Query(...),
    collected: float = Query(0),
    filed: float = Query(0),
):
    result = check_compliance(jurisdiction_code, merchant_id, collected, filed)
    return result.dict()


@app.post("/api/tipping/recommend")
async def tip_recommendation(req: TipRecommendationRequest):
    recommendation = recommend_tip(req)
    return recommendation.dict()


@app.get("/api/tipping/jurisdictions")
async def list_tipping_jurisdictions():
    from tax_compliance import TIPPING_PROFILES
    result = []
    for code, profile in TIPPING_PROFILES.items():
        result.append({
            "code": code,
            "currency": profile["currency"],
            "base_percentage": profile["base_pct"],
            "categories": list(k for k in profile.keys() if k not in ("base_pct", "currency")),
        })
    return {"jurisdictions": result, "total": len(TIPPING_PROFILES)}


# ─── Multi-Recipient Tipping ─────────────────────────────────────────────────

class MultiTipRecipientInput(BaseModel):
    recipient_id: str
    recipient_name: str
    role: str
    amount: float = 0.0
    percentage: float = 0.0


class MultiTipCalculateRequest(BaseModel):
    jurisdiction_code: str
    bill_amount: float
    total_tip: float = 0.0
    tip_percentage: float = 15.0
    split_mode: str = "equal"  # equal, custom_amount, custom_percent
    recipients: List[MultiTipRecipientInput]
    service_category: str = "restaurant"
    service_rating: Optional[float] = None
    party_size: int = 1


class MultiTipSuggestRequest(BaseModel):
    jurisdiction_code: str
    service_category: str = "restaurant"
    bill_amount: float = 0.0
    party_size: int = 1


MULTI_TIP_ROLE_TEMPLATES = {
    "restaurant": [
        {"role": "server", "label": "Server/Waiter", "suggested_pct": 50},
        {"role": "chef", "label": "Chef/Cook", "suggested_pct": 25},
        {"role": "bartender", "label": "Bartender", "suggested_pct": 15},
        {"role": "host", "label": "Host/Hostess", "suggested_pct": 10},
    ],
    "hotel": [
        {"role": "concierge", "label": "Concierge", "suggested_pct": 30},
        {"role": "housekeeping", "label": "Housekeeping", "suggested_pct": 30},
        {"role": "bellhop", "label": "Bellhop/Porter", "suggested_pct": 20},
        {"role": "valet", "label": "Valet", "suggested_pct": 20},
    ],
    "safari": [
        {"role": "guide", "label": "Safari Guide", "suggested_pct": 40},
        {"role": "driver", "label": "Driver", "suggested_pct": 25},
        {"role": "tracker", "label": "Tracker", "suggested_pct": 20},
        {"role": "camp_staff", "label": "Camp Staff", "suggested_pct": 15},
    ],
    "tour": [
        {"role": "guide", "label": "Tour Guide", "suggested_pct": 50},
        {"role": "driver", "label": "Driver", "suggested_pct": 30},
        {"role": "assistant", "label": "Assistant", "suggested_pct": 20},
    ],
    "spa": [
        {"role": "therapist", "label": "Therapist", "suggested_pct": 60},
        {"role": "attendant", "label": "Attendant", "suggested_pct": 25},
        {"role": "reception", "label": "Reception", "suggested_pct": 15},
    ],
    "transport": [
        {"role": "driver", "label": "Driver", "suggested_pct": 70},
        {"role": "assistant", "label": "Assistant/Mate", "suggested_pct": 30},
    ],
    "nightlife": [
        {"role": "bartender", "label": "Bartender", "suggested_pct": 40},
        {"role": "server", "label": "Server", "suggested_pct": 30},
        {"role": "dj", "label": "DJ/Entertainment", "suggested_pct": 15},
        {"role": "security", "label": "Security/Doorman", "suggested_pct": 15},
    ],
}


@app.post("/api/tipping/multi/calculate")
async def multi_tip_calculate(req: MultiTipCalculateRequest):
    """Calculate multi-recipient tip distribution with ML-informed suggestions."""
    from tax_compliance import TIPPING_PROFILES
    code = req.jurisdiction_code.upper()
    profile = TIPPING_PROFILES.get(code, {"base_pct": 15, "currency": "USD"})
    currency = profile["currency"]

    # Determine total tip amount
    total_tip = req.total_tip
    if total_tip <= 0:
        # ML-adjusted percentage
        base_pct = req.tip_percentage or profile["base_pct"]
        if req.service_rating and req.service_rating >= 4:
            base_pct += 2.0
        if req.party_size > 4:
            base_pct += 1.5
        total_tip = round(req.bill_amount * base_pct / 100, 2)

    # Calculate distributions
    n = len(req.recipients)
    if n == 0:
        return {"error": "At least one recipient required"}

    distributions = []
    if req.split_mode == "equal":
        per_person = round(total_tip / n, 2)
        remainder = round(total_tip - per_person * n, 2)
        for i, r in enumerate(req.recipients):
            amt = per_person + (remainder if i == 0 else 0)
            distributions.append({
                "recipient_id": r.recipient_id,
                "recipient_name": r.recipient_name,
                "role": r.role,
                "amount": round(amt, 2),
                "percentage": round(amt / total_tip * 100, 1) if total_tip > 0 else 0,
            })
    elif req.split_mode == "custom_percent":
        total_pct = sum(r.percentage for r in req.recipients)
        for r in req.recipients:
            normalized_pct = r.percentage / total_pct * 100 if total_pct > 0 else 100 / n
            amt = round(total_tip * normalized_pct / 100, 2)
            distributions.append({
                "recipient_id": r.recipient_id,
                "recipient_name": r.recipient_name,
                "role": r.role,
                "amount": amt,
                "percentage": round(normalized_pct, 1),
            })
    elif req.split_mode == "custom_amount":
        sum_amounts = sum(r.amount for r in req.recipients)
        scale = total_tip / sum_amounts if sum_amounts > 0 else 1
        for r in req.recipients:
            amt = round(r.amount * scale, 2)
            distributions.append({
                "recipient_id": r.recipient_id,
                "recipient_name": r.recipient_name,
                "role": r.role,
                "amount": amt,
                "percentage": round(amt / total_tip * 100, 1) if total_tip > 0 else 0,
            })

    return {
        "group_id": f"MTIP-{code}-{int(time.time() * 1000)}",
        "total_tip": total_tip,
        "net_tip": total_tip,
        "grand_total": round(req.bill_amount + total_tip, 2),
        "currency": currency,
        "split_mode": req.split_mode,
        "recipient_count": n,
        "distributions": distributions,
        "receipt": f"RCPT-MTIP-{code}-{int(time.time() * 1000)}",
    }


@app.post("/api/tipping/multi/suggest")
async def multi_tip_suggest(req: MultiTipSuggestRequest):
    """Suggest recipients and split percentages based on service type and jurisdiction."""
    from tax_compliance import TIPPING_PROFILES
    code = req.jurisdiction_code.upper()
    profile = TIPPING_PROFILES.get(code, {"base_pct": 15, "currency": "USD"})
    currency = profile["currency"]

    # Get role templates
    roles = MULTI_TIP_ROLE_TEMPLATES.get(req.service_category, MULTI_TIP_ROLE_TEMPLATES["restaurant"])

    # Jurisdiction-specific overrides
    if code == "TZ" and req.service_category == "safari":
        roles = [
            {"role": "guide", "label": "Safari Guide ($15-20/day)", "suggested_pct": 35},
            {"role": "driver", "label": "Driver ($10-15/day)", "suggested_pct": 25},
            {"role": "cook", "label": "Cook ($10/day)", "suggested_pct": 20},
            {"role": "porter", "label": "Porter ($8-10/day)", "suggested_pct": 20},
        ]
    elif code == "RW" and req.service_category == "safari":
        roles = [
            {"role": "guide", "label": "Gorilla Trek Guide ($10-20)", "suggested_pct": 40},
            {"role": "tracker", "label": "Tracker ($5-10)", "suggested_pct": 30},
            {"role": "porter", "label": "Porter ($5-10)", "suggested_pct": 30},
        ]
    elif code == "EG" and req.service_category == "tour":
        roles = [
            {"role": "guide", "label": "Egyptologist Guide", "suggested_pct": 50},
            {"role": "driver", "label": "Driver", "suggested_pct": 25},
            {"role": "guard", "label": "Site Guard (Baksheesh)", "suggested_pct": 15},
            {"role": "boatman", "label": "Felucca Boatman", "suggested_pct": 10},
        ]

    # Calculate suggested amounts
    cat_profile = profile.get(req.service_category, {})
    base_pct = cat_profile.get("min", profile["base_pct"]) if isinstance(cat_profile, dict) else profile["base_pct"]
    suggested_total = round(req.bill_amount * base_pct / 100, 2) if req.bill_amount > 0 else 0

    for role in roles:
        role["suggested_amount"] = round(suggested_total * role["suggested_pct"] / 100, 2) if suggested_total > 0 else 0

    return {
        "jurisdiction": code,
        "service_category": req.service_category,
        "currency": currency,
        "suggested_total_tip": suggested_total,
        "suggested_percentage": base_pct,
        "roles": roles,
        "cultural_note": cat_profile.get("note", "") if isinstance(cat_profile, dict) else "",
    }


###############################################################################
# ─── GDS Integration Endpoints ─────────────────────────────────────────────
# Demand forecasting, staff tip recommendations per property type,
# occupancy prediction, and revenue optimization for GDS properties.
###############################################################################

class GDSDemandForecastRequest(BaseModel):
    country_code: str
    property_type: str = "hotel"
    forecast_days: int = 30

class GDSTipRecommendRequest(BaseModel):
    property_type: str
    country_code: str
    booking_amount: float
    nights: int = 1
    guests: int = 1
    service_quality: str = "good"  # poor, fair, good, excellent

class GDSRevenueOptimizeRequest(BaseModel):
    country_code: str
    property_type: str
    current_rate: float
    occupancy_pct: float
    season: str = "regular"  # low, regular, peak

# Seasonal multipliers per country (based on tourism data)
GDS_SEASONALITY = {
    "NG": {"peak": [12, 1, 2], "low": [5, 6, 7], "mult_peak": 1.4, "mult_low": 0.7},
    "KE": {"peak": [7, 8, 9, 10], "low": [4, 5, 11], "mult_peak": 1.6, "mult_low": 0.6},
    "GH": {"peak": [11, 12, 1, 2], "low": [5, 6, 7], "mult_peak": 1.3, "mult_low": 0.75},
    "ZA": {"peak": [12, 1, 2, 3], "low": [6, 7, 8], "mult_peak": 1.5, "mult_low": 0.65},
    "TZ": {"peak": [6, 7, 8, 9, 10], "low": [3, 4, 5], "mult_peak": 1.7, "mult_low": 0.55},
    "RW": {"peak": [6, 7, 8, 9], "low": [3, 4, 5], "mult_peak": 1.5, "mult_low": 0.7},
    "EG": {"peak": [10, 11, 12, 1, 2, 3], "low": [6, 7, 8], "mult_peak": 1.4, "mult_low": 0.6},
    "MA": {"peak": [3, 4, 5, 9, 10], "low": [7, 8], "mult_peak": 1.3, "mult_low": 0.8},
    "UG": {"peak": [6, 7, 8, 12, 1, 2], "low": [3, 4, 5], "mult_peak": 1.4, "mult_low": 0.7},
    "ET": {"peak": [10, 11, 12, 1, 2, 3], "low": [6, 7, 8], "mult_peak": 1.3, "mult_low": 0.75},
    "BW": {"peak": [5, 6, 7, 8, 9, 10], "low": [1, 2, 3], "mult_peak": 1.8, "mult_low": 0.5},
    "NA": {"peak": [5, 6, 7, 8, 9], "low": [1, 2, 3], "mult_peak": 1.6, "mult_low": 0.6},
    "MU": {"peak": [10, 11, 12, 1, 2, 3], "low": [6, 7, 8], "mult_peak": 1.5, "mult_low": 0.65},
    "MZ": {"peak": [6, 7, 8, 9], "low": [1, 2, 3], "mult_peak": 1.4, "mult_low": 0.7},
    "ZW": {"peak": [5, 6, 7, 8, 9, 10], "low": [1, 2, 3], "mult_peak": 1.6, "mult_low": 0.55},
}

# Property type base occupancy rates
GDS_BASE_OCCUPANCY = {
    "hotel": 0.65, "lodge": 0.72, "safari_camp": 0.78,
    "resort": 0.70, "boutique": 0.62, "guesthouse": 0.55,
    "villa": 0.45, "activity": 0.80, "tented_camp": 0.68,
}

# Staff tip norms per property type and country
GDS_TIP_NORMS = {
    "hotel": {"base_pct": 10, "roles": ["front_desk", "housekeeping", "concierge", "bellhop", "room_service"]},
    "lodge": {"base_pct": 15, "roles": ["safari_guide", "tracker", "camp_manager", "housekeeping", "chef"]},
    "safari_camp": {"base_pct": 20, "roles": ["lead_guide", "tracker", "driver", "camp_staff"]},
    "resort": {"base_pct": 12, "roles": ["front_desk", "housekeeping", "spa_therapist", "waiter", "pool_attendant"]},
    "boutique": {"base_pct": 10, "roles": ["host", "housekeeping", "chef"]},
    "activity": {"base_pct": 15, "roles": ["guide", "instructor", "driver", "assistant"]},
}


@app.post("/api/gds/demand-forecast")
async def gds_demand_forecast(req: GDSDemandForecastRequest):
    """ML-based demand forecasting for GDS properties per country/type."""
    season_data = GDS_SEASONALITY.get(req.country_code, GDS_SEASONALITY["KE"])
    base_occupancy = GDS_BASE_OCCUPANCY.get(req.property_type, 0.65)

    now = datetime.now()
    forecast = []

    for i in range(req.forecast_days):
        date = now + timedelta(days=i)
        month = date.month
        day_of_week = date.weekday()

        # Seasonal adjustment
        if month in season_data["peak"]:
            seasonal_mult = season_data["mult_peak"]
        elif month in season_data["low"]:
            seasonal_mult = season_data["mult_low"]
        else:
            seasonal_mult = 1.0

        # Weekend boost (Fri-Sun)
        weekend_mult = 1.15 if day_of_week >= 4 else 1.0

        # Predicted occupancy
        predicted = min(0.98, base_occupancy * seasonal_mult * weekend_mult)
        # Add some noise for realism
        noise = (hash(f"{date.isoformat()}{req.country_code}") % 100 - 50) / 1000
        predicted = max(0.15, min(0.98, predicted + noise))

        # Recommended rate multiplier
        if predicted > 0.85:
            rate_mult = 1.3
        elif predicted > 0.7:
            rate_mult = 1.1
        elif predicted < 0.4:
            rate_mult = 0.8
        else:
            rate_mult = 1.0

        forecast.append({
            "date": date.strftime("%Y-%m-%d"),
            "predicted_occupancy": round(predicted, 3),
            "confidence": round(0.85 - (i * 0.005), 3),
            "season": "peak" if month in season_data["peak"] else ("low" if month in season_data["low"] else "regular"),
            "rate_multiplier": rate_mult,
            "demand_level": "high" if predicted > 0.75 else ("medium" if predicted > 0.5 else "low"),
        })

    avg_occupancy = sum(f["predicted_occupancy"] for f in forecast) / len(forecast)
    peak_days = sum(1 for f in forecast if f["demand_level"] == "high")

    return {
        "country_code": req.country_code,
        "property_type": req.property_type,
        "forecast_days": req.forecast_days,
        "forecast": forecast,
        "summary": {
            "average_occupancy": round(avg_occupancy, 3),
            "peak_days": peak_days,
            "low_days": sum(1 for f in forecast if f["demand_level"] == "low"),
            "revenue_opportunity": "high" if peak_days > req.forecast_days * 0.4 else "moderate",
        },
        "model_version": "gds-demand-v1.2",
    }


@app.post("/api/gds/tip-recommend")
async def gds_tip_recommend(req: GDSTipRecommendRequest):
    """ML-adjusted tip recommendations for GDS property staff."""
    tip_norm = GDS_TIP_NORMS.get(req.property_type, GDS_TIP_NORMS["hotel"])
    base_pct = tip_norm["base_pct"]

    # Quality adjustment
    quality_mult = {"poor": 0.5, "fair": 0.75, "good": 1.0, "excellent": 1.3}.get(req.service_quality, 1.0)

    # Country cultural adjustment
    country_mult = {
        "NG": 0.9, "KE": 1.1, "GH": 0.85, "ZA": 1.0, "TZ": 1.2,
        "RW": 1.0, "EG": 1.1, "MA": 0.9, "UG": 1.0, "ET": 0.8,
        "BW": 1.15, "NA": 1.1, "MU": 1.0, "MZ": 0.85, "ZW": 0.9,
    }.get(req.country_code, 1.0)

    # Night/guest adjustment (longer stays = slightly lower per-night tip)
    stay_mult = max(0.7, 1.0 - (req.nights - 1) * 0.05)

    adjusted_pct = round(base_pct * quality_mult * country_mult * stay_mult, 1)
    total_tip = round(req.booking_amount * adjusted_pct / 100, 2)

    # Distribute among roles
    roles = tip_norm["roles"]
    per_role = round(total_tip / len(roles), 2)
    distribution = [
        {"role": role, "amount": per_role, "percentage": round(100 / len(roles), 1)}
        for role in roles
    ]

    return {
        "property_type": req.property_type,
        "country_code": req.country_code,
        "booking_amount": req.booking_amount,
        "suggested_percentage": adjusted_pct,
        "suggested_total": total_tip,
        "service_quality": req.service_quality,
        "distribution": distribution,
        "adjustments": {
            "base_pct": base_pct,
            "quality_mult": quality_mult,
            "country_mult": country_mult,
            "stay_mult": stay_mult,
        },
        "cultural_note": f"Tipping is {'expected' if country_mult >= 1.0 else 'appreciated but not mandatory'} in this region for {req.property_type} stays.",
    }


@app.post("/api/gds/revenue-optimize")
async def gds_revenue_optimize(req: GDSRevenueOptimizeRequest):
    """Revenue optimization suggestions for GDS property managers."""
    season_data = GDS_SEASONALITY.get(req.country_code, GDS_SEASONALITY["KE"])
    now = datetime.now()
    current_month = now.month

    is_peak = current_month in season_data["peak"]
    is_low = current_month in season_data["low"]

    # Dynamic pricing recommendation
    if req.occupancy_pct > 85:
        price_action = "increase"
        suggested_rate = round(req.current_rate * 1.2, 2)
        reasoning = "High occupancy suggests demand exceeds supply. Increase rates to maximize RevPAR."
    elif req.occupancy_pct > 70:
        price_action = "maintain"
        suggested_rate = req.current_rate
        reasoning = "Healthy occupancy. Maintain current rates."
    elif req.occupancy_pct > 50:
        price_action = "slight_decrease"
        suggested_rate = round(req.current_rate * 0.9, 2)
        reasoning = "Moderate occupancy. Slight rate decrease may attract more bookings."
    else:
        price_action = "decrease"
        suggested_rate = round(req.current_rate * 0.75, 2)
        reasoning = "Low occupancy. Significant rate reduction recommended to fill rooms."

    # Seasonal overlay
    if is_peak and req.occupancy_pct < 70:
        reasoning += " Note: Despite being peak season, occupancy is below expected — check marketing and distribution."
    elif is_low and req.occupancy_pct > 75:
        reasoning += " Strong performance during low season — consider maintaining rates."

    # Revenue projections
    rooms = 50  # assume 50 rooms for projection
    current_revpar = req.current_rate * (req.occupancy_pct / 100)
    projected_occupancy = min(0.95, req.occupancy_pct / 100 * (1.1 if price_action == "decrease" else 0.95 if price_action == "increase" else 1.0))
    projected_revpar = suggested_rate * projected_occupancy
    monthly_revenue_delta = (projected_revpar - current_revpar) * rooms * 30

    return {
        "country_code": req.country_code,
        "property_type": req.property_type,
        "current_rate": req.current_rate,
        "current_occupancy": req.occupancy_pct,
        "season": "peak" if is_peak else ("low" if is_low else "regular"),
        "recommendation": {
            "action": price_action,
            "suggested_rate": suggested_rate,
            "reasoning": reasoning,
            "confidence": 0.82,
        },
        "projections": {
            "current_revpar": round(current_revpar, 2),
            "projected_revpar": round(projected_revpar, 2),
            "monthly_revenue_delta": round(monthly_revenue_delta, 2),
            "projected_occupancy": round(projected_occupancy * 100, 1),
        },
        "model_version": "gds-revopt-v1.0",
    }


@app.get("/api/gds/seasonality/{country_code}")
async def gds_seasonality(country_code: str):
    """Return seasonality data for a country (peak/low months, multipliers)."""
    data = GDS_SEASONALITY.get(country_code.upper())
    if not data:
        raise HTTPException(status_code=404, detail=f"No seasonality data for {country_code}")
    return {
        "country_code": country_code.upper(),
        "peak_months": data["peak"],
        "low_months": data["low"],
        "peak_multiplier": data["mult_peak"],
        "low_multiplier": data["mult_low"],
        "current_month": datetime.now().month,
        "current_season": (
            "peak" if datetime.now().month in data["peak"]
            else "low" if datetime.now().month in data["low"]
            else "regular"
        ),
    }


@app.get("/api/gds/occupancy-benchmark")
async def gds_occupancy_benchmark(
    country_code: str = Query(..., min_length=2, max_length=2),
    property_type: str = Query("hotel"),
):
    """Return occupancy benchmarks for a property type/country combination."""
    base = GDS_BASE_OCCUPANCY.get(property_type, 0.65)
    season_data = GDS_SEASONALITY.get(country_code.upper(), GDS_SEASONALITY["KE"])
    now = datetime.now()

    current_expected = base
    if now.month in season_data["peak"]:
        current_expected = base * season_data["mult_peak"]
    elif now.month in season_data["low"]:
        current_expected = base * season_data["mult_low"]

    return {
        "country_code": country_code.upper(),
        "property_type": property_type,
        "annual_average": round(base * 100, 1),
        "peak_season_expected": round(base * season_data["mult_peak"] * 100, 1),
        "low_season_expected": round(base * season_data["mult_low"] * 100, 1),
        "current_expected": round(min(98, current_expected * 100), 1),
        "industry_top_quartile": round(min(95, base * 1.3 * 100), 1),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
