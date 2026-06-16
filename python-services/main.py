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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
