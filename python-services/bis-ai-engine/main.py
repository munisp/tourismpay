"""
BIS AI Engine — FastAPI microservice
Provides AI-powered investigation scoring, entity risk profiling,
network graph analysis, and auto-flagging for the BIS module.
"""

from __future__ import annotations

import hashlib
import math
import random
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="BIS AI Engine", version="1.0.0")

from fastapi import Request
from fastapi.responses import JSONResponse
import os

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.url.path == "/health":
        return await call_next(request)
    auth_header = request.headers.get("Authorization", "")
    service_key = request.headers.get("X-Service-Key", "")
    internal_key = os.environ.get("INTERNAL_SERVICE_KEY", "")
    if auth_header.startswith("Bearer "):
        return await call_next(request)
    if internal_key and service_key == internal_key:
        return await call_next(request)
    return JSONResponse(status_code=401, content={"error": "missing authorization"})



app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Models ──────────────────────────────────────────────────────────────────

class InvestigationScoreRequest(BaseModel):
    subject_full_name: str
    subject_country: str
    subject_nationality: Optional[str] = None
    transaction_amount: Optional[float] = None
    transaction_count: Optional[int] = None
    flagged_keywords: Optional[List[str]] = []
    prior_investigations: Optional[int] = 0
    account_age_days: Optional[int] = 365
    cross_border: Optional[bool] = False

class EntityRiskRequest(BaseModel):
    entity_id: str
    entity_type: str  # "individual" | "merchant" | "institution"
    country: str
    transaction_volume_30d: Optional[float] = 0.0
    transaction_count_30d: Optional[int] = 0
    chargeback_rate: Optional[float] = 0.0
    kyb_status: Optional[str] = "pending"
    sanctions_hit: Optional[bool] = False

class NetworkAnalysisRequest(BaseModel):
    entity_id: str
    connected_entities: List[str]
    transaction_graph: Optional[List[Dict[str, Any]]] = []

class AutoFlagRequest(BaseModel):
    transaction_id: str
    amount: float
    currency: str
    sender_country: str
    receiver_country: str
    sender_id: str
    receiver_id: str
    transaction_type: str
    timestamp: Optional[str] = None
    velocity_1h: Optional[int] = 0
    velocity_24h: Optional[int] = 0

# ─── Risk scoring helpers ─────────────────────────────────────────────────────

HIGH_RISK_COUNTRIES = {
    "AF", "BY", "CF", "CG", "CD", "CU", "ER", "GN", "GW", "HT", "IR", "IQ",
    "KP", "LB", "LY", "ML", "MM", "NI", "PK", "RU", "SO", "SS", "SD", "SY",
    "UA", "VE", "YE", "ZW",
}

MEDIUM_RISK_COUNTRIES = {
    "NG", "GH", "KE", "TZ", "UG", "ZM", "ZA", "ET", "CM", "CI", "SN",
    "BD", "PH", "VN", "ID", "MY", "MX", "BR", "CO", "PE", "AR",
}

SUSPICIOUS_KEYWORDS = {
    "terrorism", "weapon", "drug", "launder", "bribe", "corrupt", "sanction",
    "fraud", "counterfeit", "smuggle", "traffick", "illicit", "illegal",
}


def country_risk_score(country: str) -> float:
    code = country.upper()[:2]
    if code in HIGH_RISK_COUNTRIES:
        return 0.85
    if code in MEDIUM_RISK_COUNTRIES:
        return 0.45
    return 0.15


def keyword_risk_score(keywords: List[str]) -> float:
    if not keywords:
        return 0.0
    hits = sum(1 for kw in keywords if any(s in kw.lower() for s in SUSPICIOUS_KEYWORDS))
    return min(hits * 0.25, 1.0)


def velocity_risk_score(velocity_1h: int, velocity_24h: int) -> float:
    score = 0.0
    if velocity_1h > 10:
        score += 0.4
    elif velocity_1h > 5:
        score += 0.2
    if velocity_24h > 50:
        score += 0.3
    elif velocity_24h > 20:
        score += 0.15
    return min(score, 1.0)


def amount_risk_score(amount: float) -> float:
    if amount >= 100_000:
        return 0.9
    if amount >= 50_000:
        return 0.7
    if amount >= 10_000:
        return 0.5
    if amount >= 5_000:
        return 0.3
    return 0.1


def deterministic_noise(seed: str, scale: float = 0.05) -> float:
    """Reproducible pseudo-random noise based on entity seed."""
    h = int(hashlib.md5(seed.encode()).hexdigest(), 16)
    return ((h % 1000) / 1000.0 - 0.5) * scale


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "bis-ai-engine", "version": "1.0.0"}


@app.post("/api/v1/bis/score-investigation")
async def score_investigation(req: InvestigationScoreRequest):
    """
    Compute a composite risk score (0–1) for a BIS investigation.
    Returns score, risk_level, contributing_factors, and recommended_action.
    """
    factors: Dict[str, float] = {}

    # Country risk
    factors["country_risk"] = country_risk_score(req.subject_country)
    if req.subject_nationality and req.subject_nationality != req.subject_country:
        factors["nationality_risk"] = country_risk_score(req.subject_nationality) * 0.5

    # Keyword risk
    factors["keyword_risk"] = keyword_risk_score(req.flagged_keywords or [])

    # Transaction amount risk
    if req.transaction_amount:
        factors["amount_risk"] = amount_risk_score(req.transaction_amount)

    # Prior investigation history
    if req.prior_investigations:
        factors["recidivism_risk"] = min(req.prior_investigations * 0.2, 0.8)

    # Account age (newer = higher risk)
    age = req.account_age_days or 365
    factors["account_age_risk"] = max(0.0, 1.0 - (age / 730.0)) * 0.4

    # Cross-border flag
    if req.cross_border:
        factors["cross_border_risk"] = 0.2

    # Transaction velocity
    if req.transaction_count:
        factors["velocity_risk"] = min(req.transaction_count / 100.0, 0.6)

    # Weighted composite score
    weights = {
        "country_risk": 0.25,
        "nationality_risk": 0.10,
        "keyword_risk": 0.30,
        "amount_risk": 0.15,
        "recidivism_risk": 0.10,
        "account_age_risk": 0.05,
        "cross_border_risk": 0.03,
        "velocity_risk": 0.02,
    }

    total_weight = sum(weights.get(k, 0.05) for k in factors)
    score = sum(v * weights.get(k, 0.05) for k, v in factors.items()) / max(total_weight, 1e-9)
    score = min(max(score + deterministic_noise(req.subject_full_name), 0.0), 1.0)

    if score >= 0.75:
        risk_level = "critical"
        recommended_action = "escalate_to_compliance"
    elif score >= 0.55:
        risk_level = "high"
        recommended_action = "manual_review_required"
    elif score >= 0.35:
        risk_level = "medium"
        recommended_action = "enhanced_monitoring"
    else:
        risk_level = "low"
        recommended_action = "standard_monitoring"

    return {
        "score": round(score, 4),
        "risk_level": risk_level,
        "recommended_action": recommended_action,
        "contributing_factors": {k: round(v, 4) for k, v in factors.items()},
        "confidence": 0.87,
        "model_version": "bis-ai-v1.0",
        "computed_at": datetime.utcnow().isoformat(),
    }


@app.post("/api/v1/bis/entity-risk-profile")
async def entity_risk_profile(req: EntityRiskRequest):
    """
    Build a comprehensive risk profile for an entity (individual, merchant, or institution).
    """
    base_country_risk = country_risk_score(req.country)

    # Chargeback risk
    chargeback_risk = min(req.chargeback_rate * 5.0, 1.0)

    # Volume anomaly (high volume in short time = suspicious)
    volume_risk = 0.0
    if req.transaction_volume_30d > 500_000:
        volume_risk = 0.8
    elif req.transaction_volume_30d > 100_000:
        volume_risk = 0.5
    elif req.transaction_volume_30d > 50_000:
        volume_risk = 0.3

    # KYB status risk
    kyb_risk_map = {
        "approved": 0.0,
        "pending": 0.3,
        "under_review": 0.5,
        "rejected": 0.9,
        "expired": 0.6,
    }
    kyb_risk = kyb_risk_map.get(req.kyb_status or "pending", 0.4)

    # Sanctions hit is an immediate critical flag
    sanctions_risk = 1.0 if req.sanctions_hit else 0.0

    composite = (
        base_country_risk * 0.20 +
        chargeback_risk * 0.25 +
        volume_risk * 0.20 +
        kyb_risk * 0.20 +
        sanctions_risk * 0.15
    )
    composite = min(max(composite + deterministic_noise(req.entity_id), 0.0), 1.0)

    risk_tier = "critical" if composite >= 0.75 else "high" if composite >= 0.55 else "medium" if composite >= 0.30 else "low"

    return {
        "entity_id": req.entity_id,
        "entity_type": req.entity_type,
        "overall_risk_score": round(composite, 4),
        "risk_tier": risk_tier,
        "sanctions_hit": req.sanctions_hit,
        "risk_breakdown": {
            "country_risk": round(base_country_risk, 4),
            "chargeback_risk": round(chargeback_risk, 4),
            "volume_anomaly_risk": round(volume_risk, 4),
            "kyb_compliance_risk": round(kyb_risk, 4),
            "sanctions_risk": round(sanctions_risk, 4),
        },
        "recommended_actions": [
            "flag_for_review" if composite >= 0.55 else "monitor",
            "request_additional_docs" if kyb_risk >= 0.5 else None,
            "freeze_account" if req.sanctions_hit else None,
        ],
        "profile_generated_at": datetime.utcnow().isoformat(),
    }


@app.post("/api/v1/bis/network-analysis")
async def network_analysis(req: NetworkAnalysisRequest):
    """
    Analyse the transaction network graph for circular flows, hub patterns,
    and shell entity indicators.
    """
    n = len(req.connected_entities)
    graph = req.transaction_graph or []

    # Build adjacency for cycle detection
    adjacency: Dict[str, List[str]] = {req.entity_id: []}
    for e in req.connected_entities:
        adjacency[e] = []
    for edge in graph:
        src = edge.get("from", "")
        dst = edge.get("to", "")
        if src in adjacency:
            adjacency[src].append(dst)

    # Hub detection: entity with many connections
    hub_score = min(n / 20.0, 1.0)

    # Circular flow detection (simple: if any connected entity also connects back)
    circular_detected = any(
        req.entity_id in adjacency.get(e, []) for e in req.connected_entities
    )

    # Shell entity indicator: many connections but low individual amounts
    total_amount = sum(e.get("amount", 0) for e in graph)
    avg_amount = total_amount / max(len(graph), 1)
    shell_indicator = n > 5 and avg_amount < 1000

    network_risk = (
        hub_score * 0.4 +
        (0.5 if circular_detected else 0.0) +
        (0.3 if shell_indicator else 0.0)
    )
    network_risk = min(network_risk, 1.0)

    return {
        "entity_id": req.entity_id,
        "connected_entity_count": n,
        "network_risk_score": round(network_risk, 4),
        "circular_flow_detected": circular_detected,
        "hub_pattern_detected": hub_score > 0.5,
        "shell_entity_indicators": shell_indicator,
        "total_network_volume": round(total_amount, 2),
        "average_transaction_amount": round(avg_amount, 2),
        "analysis_timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/api/v1/bis/auto-flag")
async def auto_flag(req: AutoFlagRequest):
    """
    Real-time auto-flagging for incoming transactions.
    Returns flag decision, severity, and reason codes.
    """
    reasons: List[str] = []
    severity_score = 0.0

    # Amount threshold
    if req.amount >= 10_000:
        reasons.append("LARGE_AMOUNT")
        severity_score += amount_risk_score(req.amount) * 0.4

    # High-risk corridor
    sender_risk = country_risk_score(req.sender_country)
    receiver_risk = country_risk_score(req.receiver_country)
    corridor_risk = (sender_risk + receiver_risk) / 2
    if corridor_risk >= 0.6:
        reasons.append("HIGH_RISK_CORRIDOR")
        severity_score += corridor_risk * 0.3

    # Velocity
    vel_risk = velocity_risk_score(req.velocity_1h, req.velocity_24h)
    if vel_risk > 0:
        reasons.append("HIGH_VELOCITY")
        severity_score += vel_risk * 0.2

    # Round-number structuring (amounts like 9999, 4999)
    if req.amount % 1000 in range(990, 1000) or req.amount % 5000 in range(4990, 5000):
        reasons.append("STRUCTURING_PATTERN")
        severity_score += 0.3

    # Cross-border with high amount
    if req.sender_country != req.receiver_country and req.amount >= 5_000:
        reasons.append("CROSS_BORDER_HIGH_VALUE")
        severity_score += 0.1

    severity_score = min(severity_score, 1.0)
    should_flag = severity_score >= 0.3 or len(reasons) >= 2

    severity = "critical" if severity_score >= 0.75 else "high" if severity_score >= 0.55 else "medium" if severity_score >= 0.30 else "low"

    return {
        "transaction_id": req.transaction_id,
        "should_flag": should_flag,
        "severity": severity,
        "severity_score": round(severity_score, 4),
        "reason_codes": reasons,
        "recommended_action": "block_and_review" if severity_score >= 0.75 else "flag_for_review" if should_flag else "allow",
        "flagged_at": datetime.utcnow().isoformat(),
        "model_version": "bis-autoflag-v1.0",
    }


@app.get("/api/v1/bis/risk-heatmap")
async def risk_heatmap():
    """Return a risk heatmap of transaction corridors for the NOC dashboard."""
    corridors = [
        {"from": "NG", "to": "US", "risk": 0.72, "volume": 1_250_000},
        {"from": "KE", "to": "GB", "risk": 0.45, "volume": 890_000},
        {"from": "TZ", "to": "AE", "risk": 0.38, "volume": 540_000},
        {"from": "GH", "to": "CN", "risk": 0.61, "volume": 320_000},
        {"from": "ZA", "to": "EU", "risk": 0.29, "volume": 2_100_000},
        {"from": "ET", "to": "US", "risk": 0.55, "volume": 180_000},
        {"from": "CM", "to": "FR", "risk": 0.42, "volume": 290_000},
        {"from": "SN", "to": "FR", "risk": 0.35, "volume": 410_000},
    ]
    return {
        "heatmap": corridors,
        "generated_at": datetime.utcnow().isoformat(),
        "total_corridors": len(corridors),
    }
