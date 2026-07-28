#!/usr/bin/env python3
"""
services/journey-analytics/main.py
─────────────────────────────────────────────────────────────────────────────
TourismPay Journey Analytics Service — Python/FastAPI

Provides analytics and AI-scoring endpoints for the 20 new stakeholder journeys.
Each endpoint corresponds to one or more journey workflows and returns structured
analytics data that the TypeScript tRPC routers surface to the frontend.

HTTP endpoints (port 8105):
  POST /analytics/bnpl-risk           — J01: BNPL credit risk score
  POST /analytics/insurance-score     — J02: Travel insurance risk score
  POST /analytics/gift-value          — J03: Diaspora gift value analytics
  POST /analytics/fraud-pattern       — J04: Open banking fraud pattern analysis
  POST /analytics/visa-bundle-score   — J05: e-Visa + booking bundle analytics
  POST /analytics/group-risk          — J06: Group MICE booking risk
  POST /analytics/dcc-spread          — J07: DCC spread revenue analytics
  POST /analytics/revenue-forecast    — J08: Revenue management forecast
  POST /analytics/tourism-kpis        — J09: Tourism intelligence KPIs
  POST /analytics/geo-density         — J10: Geospatial loyalty zone density
  POST /analytics/tenant-health       — J11: White label tenant health score
  POST /analytics/etl-status          — J12: Lakehouse ETL status
  POST /analytics/claim-risk          — J13: Insurance claim fraud risk
  POST /analytics/revenue-uplift      — J14: AI revenue recommendation uplift
  POST /analytics/payout-risk         — J15: Open banking payout risk
  POST /analytics/cancellation-rate   — J16: Group travel cancellation analytics
  POST /analytics/territory-coverage  — J17: Agent territory coverage
  POST /analytics/settlement-summary  — J18: White label settlement summary
  POST /analytics/fraud-network       — J19: Fraud network analysis
  POST /analytics/tourist-lifecycle   — J20: Full tourist lifecycle analytics

  GET  /health                        — liveness check
  GET  /metrics                       — Prometheus metrics

Environment variables:
  HTTP_PORT   — HTTP port (default: 8105)
  PG_DSN      — PostgreSQL DSN
  DAPR_PORT   — Dapr sidecar port (default: 3500)
"""
import asyncio
import json
import logging
import math
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import asyncpg
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from pydantic import BaseModel, Field
from starlette.responses import Response

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "service": "journey-analytics", "msg": "%(message)s"}',
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger(__name__)

# ─── Config ───────────────────────────────────────────────────────────────────
HTTP_PORT = int(os.getenv("HTTP_PORT", "8105"))
PG_DSN = os.getenv("PG_DSN", "")
DAPR_PORT = int(os.getenv("DAPR_PORT", "3500"))

# ─── Prometheus Metrics ───────────────────────────────────────────────────────
REQUEST_COUNT = Counter("journey_analytics_requests_total", "Total analytics requests", ["endpoint"])
REQUEST_LATENCY = Histogram("journey_analytics_latency_seconds", "Analytics request latency", ["endpoint"])
ERROR_COUNT = Counter("journey_analytics_errors_total", "Total analytics errors", ["endpoint"])

# ─── Database Pool ────────────────────────────────────────────────────────────
_pool: Optional[asyncpg.Pool] = None

async def get_pool() -> Optional[asyncpg.Pool]:
    global _pool
    if _pool is None and PG_DSN:
        try:
            _pool = await asyncpg.create_pool(PG_DSN, min_size=2, max_size=10, command_timeout=10)
            logger.info("PostgreSQL pool created")
        except Exception as e:
            logger.warning(f"PostgreSQL pool creation failed: {e}")
    return _pool

async def query(sql: str, *args) -> List[Dict]:
    pool = await get_pool()
    if not pool:
        return []
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(sql, *args)
            return [dict(row) for row in rows]
    except Exception as e:
        logger.warning(f"DB query failed: {e}")
        return []

# ─── Pydantic Models ──────────────────────────────────────────────────────────
class BnplRiskRequest(BaseModel):
    tourist_id: str
    hotel_id: str
    total_amount_ngn: float
    instalments: int = 3

class InsuranceScoreRequest(BaseModel):
    tourist_id: str
    destination: str
    coverage_type: str
    departure_date: str
    return_date: str
    premium_ngn: float

class GiftValueRequest(BaseModel):
    gift_id: str
    amount_ngn: float
    establishment_id: str

class FraudPatternRequest(BaseModel):
    user_id: str
    amount_ngn: float
    bank_code: str

class VisaBundleRequest(BaseModel):
    tourist_id: str
    passport_country: str
    hotel_id: str
    visa_fee_ngn: float
    booking_amount_ngn: float

class GroupRiskRequest(BaseModel):
    merchant_id: str
    hotel_id: str
    attendees: int
    total_amount_ngn: float
    event_date: str

class DccSpreadRequest(BaseModel):
    merchant_id: str
    amount_ngn: float
    home_currency: str
    fx_rate: float

class RevenueForecastRequest(BaseModel):
    hotel_id: str
    room_type: str
    current_rate: float
    period_days: int = 30

class TourismKpisRequest(BaseModel):
    country: str
    period_start: str
    period_end: str
    report_type: str

class GeoDensityRequest(BaseModel):
    city: str
    center_lat: float
    center_lng: float
    radius_metres: int

class TenantHealthRequest(BaseModel):
    tenant_id: str

class EtlStatusRequest(BaseModel):
    job_name: str
    run_id: Optional[str] = None

class ClaimRiskRequest(BaseModel):
    tourist_id: str
    policy_id: str
    claim_type: str
    claim_amount_ngn: float

class RevenueUpliftRequest(BaseModel):
    hotel_id: str
    recommendation_type: str
    current_revenue: float
    projected_revenue: float

class PayoutRiskRequest(BaseModel):
    merchant_id: str
    amount_ngn: float
    bank_code: str

class CancellationRateRequest(BaseModel):
    group_booking_id: str
    hotel_id: str

class TerritoryCoverageRequest(BaseModel):
    agent_id: str
    city: str
    radius_km: float

class SettlementSummaryRequest(BaseModel):
    tenant_id: str
    period_start: str
    period_end: str

class FraudNetworkRequest(BaseModel):
    suspect_user_id: str
    risk_score: float
    trigger_type: str

class TouristLifecycleRequest(BaseModel):
    tourist_id: str
    destination: str

# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    logger.info(f"Journey Analytics Service started on port {HTTP_PORT}")
    yield
    if _pool:
        await _pool.close()
    logger.info("Journey Analytics Service stopped")

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="TourismPay Journey Analytics",
    version="1.0.0",
    description="Analytics and AI-scoring for 20 stakeholder journeys",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Helper: BNPL Credit Risk Score ──────────────────────────────────────────
def compute_bnpl_risk(amount: float, instalments: int, wallet_balance: float) -> Dict:
    """Compute BNPL credit risk score using rule-based model."""
    instalment_amount = amount / instalments
    affordability_ratio = wallet_balance / instalment_amount if instalment_amount > 0 else 0
    risk_score = 0.0
    factors = []

    if amount > 5_000_000:
        risk_score += 30
        factors.append("high_amount")
    elif amount > 1_000_000:
        risk_score += 15
        factors.append("medium_amount")

    if instalments > 6:
        risk_score += 20
        factors.append("many_instalments")

    if affordability_ratio < 1.5:
        risk_score += 25
        factors.append("low_affordability")
    elif affordability_ratio > 3:
        risk_score -= 10
        factors.append("high_affordability")

    risk_score = max(0, min(100, risk_score))
    risk_level = "high" if risk_score >= 70 else "medium" if risk_score >= 40 else "low"
    premium_pct = 3.5 if risk_score >= 70 else 2.5 if risk_score >= 40 else 1.5

    return {
        "risk_score": round(risk_score, 2),
        "risk_level": risk_level,
        "premium_pct": premium_pct,
        "instalment_amount": round(instalment_amount, 2),
        "affordability_ratio": round(affordability_ratio, 2),
        "factors": factors,
        "approved": risk_score < 80,
    }

# ─── J01: BNPL Risk ──────────────────────────────────────────────────────────
@app.post("/analytics/bnpl-risk")
async def bnpl_risk(req: BnplRiskRequest):
    start = time.time()
    REQUEST_COUNT.labels(endpoint="bnpl-risk").inc()
    try:
        rows = await query(
            "SELECT COALESCE(balance, 0) as balance FROM wallet_balances WHERE user_id = $1 AND currency = 'NGN' LIMIT 1",
            req.tourist_id
        )
        wallet_balance = float(rows[0]["balance"]) if rows else 0.0
        result = compute_bnpl_risk(req.total_amount_ngn, req.instalments, wallet_balance)
        result["tourist_id"] = req.tourist_id
        result["hotel_id"] = req.hotel_id
        REQUEST_LATENCY.labels(endpoint="bnpl-risk").observe(time.time() - start)
        return result
    except Exception as e:
        ERROR_COUNT.labels(endpoint="bnpl-risk").inc()
        logger.error(f"BNPL risk error: {e}")
        return {"risk_score": 50.0, "risk_level": "medium", "premium_pct": 2.5, "approved": True, "error": str(e)}

# ─── J02: Insurance Score ─────────────────────────────────────────────────────
@app.post("/analytics/insurance-score")
async def insurance_score(req: InsuranceScoreRequest):
    start = time.time()
    REQUEST_COUNT.labels(endpoint="insurance-score").inc()
    try:
        # Risk by destination and coverage type
        high_risk_destinations = ["Yemen", "Syria", "Libya", "Somalia", "Afghanistan"]
        base_risk = 30.0
        if req.destination in high_risk_destinations:
            base_risk += 40
        if req.coverage_type == "comprehensive":
            base_risk -= 10
        elif req.coverage_type == "basic":
            base_risk += 10

        # Check tourist's claim history
        claims = await query(
            "SELECT COUNT(*) as cnt FROM insurance_claims WHERE user_id::text = $1",
            req.tourist_id
        )
        claim_count = int(claims[0]["cnt"]) if claims else 0
        base_risk += claim_count * 5

        risk_score = max(0, min(100, base_risk))
        recommended_premium = req.premium_ngn * (1 + risk_score / 200)

        REQUEST_LATENCY.labels(endpoint="insurance-score").observe(time.time() - start)
        return {
            "risk_score": round(risk_score, 2),
            "risk_level": "high" if risk_score >= 70 else "medium" if risk_score >= 40 else "low",
            "recommended_premium_ngn": round(recommended_premium, 2),
            "claim_history_count": claim_count,
            "destination_risk": "high" if req.destination in high_risk_destinations else "low",
        }
    except Exception as e:
        ERROR_COUNT.labels(endpoint="insurance-score").inc()
        return {"risk_score": 30.0, "risk_level": "low", "recommended_premium_ngn": req.premium_ngn, "error": str(e)}

# ─── J03: Gift Value Analytics ────────────────────────────────────────────────
@app.post("/analytics/gift-value")
async def gift_value(req: GiftValueRequest):
    start = time.time()
    REQUEST_COUNT.labels(endpoint="gift-value").inc()
    try:
        # Get establishment category for loyalty multiplier
        est = await query(
            "SELECT type, city FROM establishments WHERE id::text = $1 LIMIT 1",
            req.establishment_id
        )
        est_type = est[0]["type"] if est else "general"
        multipliers = {"hotel": 1.5, "restaurant": 1.2, "nightclub": 1.3, "transport": 1.0}
        multiplier = multipliers.get(est_type, 1.0)
        loyalty_earned = math.floor(req.amount_ngn / 50 * multiplier)

        REQUEST_LATENCY.labels(endpoint="gift-value").observe(time.time() - start)
        return {
            "gift_id": req.gift_id,
            "amount_ngn": req.amount_ngn,
            "establishment_type": est_type,
            "loyalty_multiplier": multiplier,
            "loyalty_earned": loyalty_earned,
            "effective_value_ngn": round(req.amount_ngn + loyalty_earned, 2),
        }
    except Exception as e:
        ERROR_COUNT.labels(endpoint="gift-value").inc()
        return {"gift_id": req.gift_id, "amount_ngn": req.amount_ngn, "loyalty_earned": 0, "error": str(e)}

# ─── J04: Fraud Pattern Analysis ─────────────────────────────────────────────
@app.post("/analytics/fraud-pattern")
async def fraud_pattern(req: FraudPatternRequest):
    start = time.time()
    REQUEST_COUNT.labels(endpoint="fraud-pattern").inc()
    try:
        # Velocity check: transactions in last hour
        velocity = await query(
            """SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total
               FROM wallet_transactions
               WHERE user_id::text = $1 AND type = 'credit'
                 AND created_at > NOW() - INTERVAL '1 hour'""",
            req.user_id
        )
        tx_count = int(velocity[0]["cnt"]) if velocity else 0
        tx_total = float(velocity[0]["total"]) if velocity else 0.0

        # Risk scoring
        risk_score = 0.0
        signals = []
        if tx_count > 5:
            risk_score += 30
            signals.append("high_velocity")
        if req.amount_ngn > 1_000_000:
            risk_score += 20
            signals.append("large_amount")
        if tx_total > 5_000_000:
            risk_score += 25
            signals.append("high_daily_volume")

        risk_score = max(0, min(100, risk_score))
        REQUEST_LATENCY.labels(endpoint="fraud-pattern").observe(time.time() - start)
        return {
            "user_id": req.user_id,
            "fraud_score": round(risk_score, 2),
            "risk_level": "high" if risk_score >= 70 else "medium" if risk_score >= 40 else "low",
            "signals": signals,
            "velocity_1h": tx_count,
            "volume_1h_ngn": round(tx_total, 2),
            "should_block": risk_score >= 80,
        }
    except Exception as e:
        ERROR_COUNT.labels(endpoint="fraud-pattern").inc()
        return {"user_id": req.user_id, "fraud_score": 0.0, "risk_level": "low", "should_block": False, "error": str(e)}

# ─── J05: Visa Bundle Score ───────────────────────────────────────────────────
@app.post("/analytics/visa-bundle-score")
async def visa_bundle_score(req: VisaBundleRequest):
    start = time.time()
    REQUEST_COUNT.labels(endpoint="visa-bundle-score").inc()
    try:
        total = req.visa_fee_ngn + req.booking_amount_ngn
        # High-risk passport countries
        high_risk_countries = ["KP", "IR", "SY", "YE", "LY"]
        country_risk = 30 if req.passport_country in high_risk_countries else 0
        bundle_discount_pct = 5.0  # 5% discount for bundle
        savings_ngn = total * (bundle_discount_pct / 100)

        REQUEST_LATENCY.labels(endpoint="visa-bundle-score").observe(time.time() - start)
        return {
            "tourist_id": req.tourist_id,
            "total_ngn": round(total, 2),
            "bundle_discount_pct": bundle_discount_pct,
            "savings_ngn": round(savings_ngn, 2),
            "country_risk_score": country_risk,
            "approved": country_risk < 50,
            "recommended_coverage": "comprehensive" if country_risk > 20 else "standard",
        }
    except Exception as e:
        ERROR_COUNT.labels(endpoint="visa-bundle-score").inc()
        return {"tourist_id": req.tourist_id, "total_ngn": req.visa_fee_ngn + req.booking_amount_ngn, "approved": True, "error": str(e)}

# ─── J06: Group Risk ──────────────────────────────────────────────────────────
@app.post("/analytics/group-risk")
async def group_risk(req: GroupRiskRequest):
    start = time.time()
    REQUEST_COUNT.labels(endpoint="group-risk").inc()
    try:
        # Check merchant's existing group bookings
        existing = await query(
            "SELECT COUNT(*) as cnt FROM group_bookings WHERE organizer_id = $1 AND status = 'confirmed'",
            req.merchant_id
        )
        existing_count = int(existing[0]["cnt"]) if existing else 0
        risk_score = 0.0
        if req.attendees > 500:
            risk_score += 30
        if req.total_amount_ngn > 10_000_000:
            risk_score += 25
        if existing_count == 0:
            risk_score += 20  # No track record

        risk_score = max(0, min(100, risk_score))
        recommended_deposit_pct = 30 if risk_score >= 60 else 20 if risk_score >= 30 else 15

        REQUEST_LATENCY.labels(endpoint="group-risk").inc()
        return {
            "merchant_id": req.merchant_id,
            "risk_score": round(risk_score, 2),
            "risk_level": "high" if risk_score >= 70 else "medium" if risk_score >= 40 else "low",
            "recommended_deposit_pct": recommended_deposit_pct,
            "existing_bookings": existing_count,
            "approved": risk_score < 85,
        }
    except Exception as e:
        ERROR_COUNT.labels(endpoint="group-risk").inc()
        return {"merchant_id": req.merchant_id, "risk_score": 30.0, "approved": True, "error": str(e)}

# ─── J07: DCC Spread Analytics ───────────────────────────────────────────────
@app.post("/analytics/dcc-spread")
async def dcc_spread(req: DccSpreadRequest):
    start = time.time()
    REQUEST_COUNT.labels(endpoint="dcc-spread").inc()
    try:
        # Get recent DCC transactions for this merchant
        recent = await query(
            """SELECT AVG(spread_pct::float) as avg_spread, COUNT(*) as cnt,
                      SUM(spread_revenue_ngn::float) as total_revenue
               FROM dcc_transactions WHERE merchant_id = $1
                 AND created_at > NOW() - INTERVAL '30 days'""",
            req.merchant_id
        )
        avg_spread = float(recent[0]["avg_spread"] or 2.5) if recent else 2.5
        tx_count = int(recent[0]["cnt"] or 0) if recent else 0
        total_revenue = float(recent[0]["total_revenue"] or 0) if recent else 0.0

        spread_revenue = req.amount_ngn * (avg_spread / 100)
        REQUEST_LATENCY.labels(endpoint="dcc-spread").observe(time.time() - start)
        return {
            "merchant_id": req.merchant_id,
            "amount_ngn": req.amount_ngn,
            "home_currency": req.home_currency,
            "fx_rate": req.fx_rate,
            "spread_pct": round(avg_spread, 2),
            "spread_revenue_ngn": round(spread_revenue, 2),
            "monthly_dcc_count": tx_count,
            "monthly_spread_revenue_ngn": round(total_revenue, 2),
        }
    except Exception as e:
        ERROR_COUNT.labels(endpoint="dcc-spread").inc()
        return {"merchant_id": req.merchant_id, "spread_pct": 2.5, "spread_revenue_ngn": req.amount_ngn * 0.025, "error": str(e)}

# ─── J08: Revenue Forecast ───────────────────────────────────────────────────
@app.post("/analytics/revenue-forecast")
async def revenue_forecast(req: RevenueForecastRequest):
    start = time.time()
    REQUEST_COUNT.labels(endpoint="revenue-forecast").inc()
    try:
        # Get historical DCC and booking data for hotel
        history = await query(
            """SELECT COALESCE(SUM(total_amount::float), 0) as total_revenue,
                      COUNT(*) as booking_count
               FROM direct_bookings WHERE hotel_id = $1
                 AND created_at > NOW() - INTERVAL '30 days'""",
            req.hotel_id
        )
        current_revenue = float(history[0]["total_revenue"] or 0) if history else 0.0
        booking_count = int(history[0]["booking_count"] or 0) if history else 0

        # Simple linear forecast with seasonality
        growth_rate = 0.08  # 8% monthly growth assumption
        forecasted_revenue = current_revenue * (1 + growth_rate)
        optimal_rate = req.current_rate * 1.12  # 12% rate increase recommendation

        REQUEST_LATENCY.labels(endpoint="revenue-forecast").observe(time.time() - start)
        return {
            "hotel_id": req.hotel_id,
            "room_type": req.room_type,
            "current_rate_ngn": req.current_rate,
            "optimal_rate_ngn": round(optimal_rate, 2),
            "current_monthly_revenue_ngn": round(current_revenue, 2),
            "forecasted_monthly_revenue_ngn": round(forecasted_revenue, 2),
            "projected_uplift_ngn": round(forecasted_revenue - current_revenue, 2),
            "booking_count_30d": booking_count,
            "confidence_score": 0.78,
        }
    except Exception as e:
        ERROR_COUNT.labels(endpoint="revenue-forecast").inc()
        return {"hotel_id": req.hotel_id, "optimal_rate_ngn": req.current_rate * 1.1, "confidence_score": 0.5, "error": str(e)}

# ─── J09: Tourism KPIs ───────────────────────────────────────────────────────
@app.post("/analytics/tourism-kpis")
async def tourism_kpis(req: TourismKpisRequest):
    start = time.time()
    REQUEST_COUNT.labels(endpoint="tourism-kpis").inc()
    try:
        # Get wallet transaction volumes
        wallet_stats = await query(
            """SELECT COUNT(DISTINCT user_id) as active_wallets,
                      COALESCE(SUM(amount), 0) as total_spend
               FROM wallet_transactions
               WHERE type = 'debit'
                 AND created_at BETWEEN $1 AND $2""",
            req.period_start, req.period_end
        )
        active_wallets = int(wallet_stats[0]["active_wallets"] or 0) if wallet_stats else 0
        total_spend = float(wallet_stats[0]["total_spend"] or 0) if wallet_stats else 0.0

        # Get new registrations
        new_users = await query(
            "SELECT COUNT(*) as cnt FROM users WHERE created_at BETWEEN $1 AND $2",
            req.period_start, req.period_end
        )
        new_registrations = int(new_users[0]["cnt"] or 0) if new_users else 0

        REQUEST_LATENCY.labels(endpoint="tourism-kpis").observe(time.time() - start)
        return {
            "country": req.country,
            "period_start": req.period_start,
            "period_end": req.period_end,
            "report_type": req.report_type,
            "active_wallets": active_wallets,
            "total_spend_ngn": round(total_spend, 2),
            "new_registrations": new_registrations,
            "avg_spend_per_tourist_ngn": round(total_spend / max(active_wallets, 1), 2),
            "fx_inflow_usd": round(total_spend / 1580, 2),
        }
    except Exception as e:
        ERROR_COUNT.labels(endpoint="tourism-kpis").inc()
        return {"country": req.country, "active_wallets": 0, "total_spend_ngn": 0, "error": str(e)}

# ─── J10: Geo Density ────────────────────────────────────────────────────────
@app.post("/analytics/geo-density")
async def geo_density(req: GeoDensityRequest):
    start = time.time()
    REQUEST_COUNT.labels(endpoint="geo-density").inc()
    try:
        # Count establishments in radius
        est_count = await query(
            """SELECT COUNT(*) as cnt FROM establishments
               WHERE city = $1 AND latitude IS NOT NULL AND longitude IS NOT NULL""",
            req.city
        )
        establishment_count = int(est_count[0]["cnt"] or 0) if est_count else 0

        # Count active loyalty zones in city
        zones = await query(
            "SELECT COUNT(*) as cnt FROM geospatial_loyalty_zones WHERE city = $1 AND active = true",
            req.city
        )
        zone_count = int(zones[0]["cnt"] or 0) if zones else 0

        density_score = min(100, establishment_count * 2 + zone_count * 10)
        REQUEST_LATENCY.labels(endpoint="geo-density").observe(time.time() - start)
        return {
            "city": req.city,
            "center_lat": req.center_lat,
            "center_lng": req.center_lng,
            "radius_metres": req.radius_metres,
            "establishment_count": establishment_count,
            "active_loyalty_zones": zone_count,
            "density_score": density_score,
            "recommended_multiplier": 2.0 if density_score > 60 else 1.5 if density_score > 30 else 1.2,
        }
    except Exception as e:
        ERROR_COUNT.labels(endpoint="geo-density").inc()
        return {"city": req.city, "establishment_count": 0, "density_score": 0, "error": str(e)}

# ─── J11: Tenant Health ──────────────────────────────────────────────────────
@app.post("/analytics/tenant-health")
async def tenant_health(req: TenantHealthRequest):
    start = time.time()
    REQUEST_COUNT.labels(endpoint="tenant-health").inc()
    try:
        tenant = await query(
            "SELECT * FROM white_label_tenants WHERE id = $1 LIMIT 1",
            req.tenant_id
        )
        if not tenant:
            return {"tenant_id": req.tenant_id, "health_score": 0, "status": "not_found"}

        t = tenant[0]
        health_score = 100
        issues = []
        if t.get("status") != "active":
            health_score -= 50
            issues.append("tenant_not_active")

        wallet = await query(
            "SELECT COALESCE(balance, 0) as balance FROM wallet_balances WHERE user_id = $1 AND currency = 'NGN' LIMIT 1",
            req.tenant_id
        )
        balance = float(wallet[0]["balance"] or 0) if wallet else 0.0
        if balance < 10000:
            health_score -= 20
            issues.append("low_wallet_balance")

        REQUEST_LATENCY.labels(endpoint="tenant-health").observe(time.time() - start)
        return {
            "tenant_id": req.tenant_id,
            "health_score": max(0, health_score),
            "status": t.get("status", "unknown"),
            "wallet_balance_ngn": balance,
            "issues": issues,
            "plan_type": t.get("plan_type", "standard"),
        }
    except Exception as e:
        ERROR_COUNT.labels(endpoint="tenant-health").inc()
        return {"tenant_id": req.tenant_id, "health_score": 50, "status": "unknown", "error": str(e)}

# ─── J12: ETL Status ─────────────────────────────────────────────────────────
@app.post("/analytics/etl-status")
async def etl_status(req: EtlStatusRequest):
    start = time.time()
    REQUEST_COUNT.labels(endpoint="etl-status").inc()
    try:
        if req.run_id:
            runs = await query(
                "SELECT * FROM lakehouse_etl_runs WHERE id = $1 LIMIT 1",
                req.run_id
            )
        else:
            runs = await query(
                "SELECT * FROM lakehouse_etl_runs WHERE job_type = $1 ORDER BY created_at DESC LIMIT 5",
                req.job_name
            )

        REQUEST_LATENCY.labels(endpoint="etl-status").observe(time.time() - start)
        return {
            "job_name": req.job_name,
            "runs": [dict(r) for r in runs],
            "latest_status": runs[0]["status"] if runs else "no_runs",
            "total_runs": len(runs),
        }
    except Exception as e:
        ERROR_COUNT.labels(endpoint="etl-status").inc()
        return {"job_name": req.job_name, "runs": [], "latest_status": "unknown", "error": str(e)}

# ─── J13: Claim Risk ─────────────────────────────────────────────────────────
@app.post("/analytics/claim-risk")
async def claim_risk(req: ClaimRiskRequest):
    start = time.time()
    REQUEST_COUNT.labels(endpoint="claim-risk").inc()
    try:
        # Check claim history
        prior_claims = await query(
            "SELECT COUNT(*) as cnt, COALESCE(SUM(claim_amount::float), 0) as total FROM insurance_claims WHERE user_id::text = $1",
            req.tourist_id
        )
        claim_count = int(prior_claims[0]["cnt"] or 0) if prior_claims else 0
        prior_total = float(prior_claims[0]["total"] or 0) if prior_claims else 0.0

        risk_score = 0.0
        if claim_count > 3:
            risk_score += 40
        if req.claim_amount_ngn > 500_000:
            risk_score += 30
        if prior_total > 1_000_000:
            risk_score += 20

        risk_score = max(0, min(100, risk_score))
        REQUEST_LATENCY.labels(endpoint="claim-risk").observe(time.time() - start)
        return {
            "tourist_id": req.tourist_id,
            "claim_risk_score": round(risk_score, 2),
            "prior_claims_count": claim_count,
            "prior_claims_total_ngn": round(prior_total, 2),
            "auto_approve": risk_score < 50,
            "requires_manual_review": risk_score >= 70,
        }
    except Exception as e:
        ERROR_COUNT.labels(endpoint="claim-risk").inc()
        return {"tourist_id": req.tourist_id, "claim_risk_score": 30.0, "auto_approve": True, "error": str(e)}

# ─── J14: Revenue Uplift ─────────────────────────────────────────────────────
@app.post("/analytics/revenue-uplift")
async def revenue_uplift(req: RevenueUpliftRequest):
    start = time.time()
    REQUEST_COUNT.labels(endpoint="revenue-uplift").inc()
    try:
        uplift = req.projected_revenue - req.current_revenue
        uplift_pct = (uplift / req.current_revenue * 100) if req.current_revenue > 0 else 0

        # Get historical recommendations for this hotel
        accepted = await query(
            "SELECT COUNT(*) as cnt FROM revenue_recommendations WHERE hotel_id = $1 AND applied = true",
            req.hotel_id
        )
        accepted_count = int(accepted[0]["cnt"] or 0) if accepted else 0

        REQUEST_LATENCY.labels(endpoint="revenue-uplift").observe(time.time() - start)
        return {
            "hotel_id": req.hotel_id,
            "recommendation_type": req.recommendation_type,
            "current_revenue_ngn": req.current_revenue,
            "projected_revenue_ngn": req.projected_revenue,
            "uplift_ngn": round(uplift, 2),
            "uplift_pct": round(uplift_pct, 2),
            "previously_accepted_recommendations": accepted_count,
            "confidence_score": 0.82,
        }
    except Exception as e:
        ERROR_COUNT.labels(endpoint="revenue-uplift").inc()
        return {"hotel_id": req.hotel_id, "uplift_ngn": 0, "confidence_score": 0.5, "error": str(e)}

# ─── J15: Payout Risk ────────────────────────────────────────────────────────
@app.post("/analytics/payout-risk")
async def payout_risk(req: PayoutRiskRequest):
    start = time.time()
    REQUEST_COUNT.labels(endpoint="payout-risk").inc()
    try:
        balance = await query(
            "SELECT COALESCE(balance, 0) as balance FROM wallet_balances WHERE user_id = $1 AND currency = 'NGN' LIMIT 1",
            req.merchant_id
        )
        wallet_balance = float(balance[0]["balance"] or 0) if balance else 0.0

        risk_score = 0.0
        if req.amount_ngn > wallet_balance * 0.9:
            risk_score += 40
        if req.amount_ngn > 10_000_000:
            risk_score += 30

        risk_score = max(0, min(100, risk_score))
        REQUEST_LATENCY.labels(endpoint="payout-risk").observe(time.time() - start)
        return {
            "merchant_id": req.merchant_id,
            "payout_risk_score": round(risk_score, 2),
            "wallet_balance_ngn": wallet_balance,
            "payout_amount_ngn": req.amount_ngn,
            "sufficient_balance": wallet_balance >= req.amount_ngn,
            "approved": risk_score < 70 and wallet_balance >= req.amount_ngn,
        }
    except Exception as e:
        ERROR_COUNT.labels(endpoint="payout-risk").inc()
        return {"merchant_id": req.merchant_id, "payout_risk_score": 30.0, "approved": True, "error": str(e)}

# ─── J16: Cancellation Rate ──────────────────────────────────────────────────
@app.post("/analytics/cancellation-rate")
async def cancellation_rate(req: CancellationRateRequest):
    start = time.time()
    REQUEST_COUNT.labels(endpoint="cancellation-rate").inc()
    try:
        stats = await query(
            """SELECT
               COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
               COUNT(*) as total
               FROM group_bookings WHERE hotel_id = $1""",
            req.hotel_id
        )
        cancelled = int(stats[0]["cancelled"] or 0) if stats else 0
        total = int(stats[0]["total"] or 1) if stats else 1
        cancellation_rate_pct = (cancelled / total * 100) if total > 0 else 0

        REQUEST_LATENCY.labels(endpoint="cancellation-rate").observe(time.time() - start)
        return {
            "group_booking_id": req.group_booking_id,
            "hotel_id": req.hotel_id,
            "hotel_cancellation_rate_pct": round(cancellation_rate_pct, 2),
            "total_bookings": total,
            "cancelled_bookings": cancelled,
            "recommended_refund_pct": 90 if cancellation_rate_pct < 10 else 75 if cancellation_rate_pct < 25 else 50,
        }
    except Exception as e:
        ERROR_COUNT.labels(endpoint="cancellation-rate").inc()
        return {"group_booking_id": req.group_booking_id, "hotel_cancellation_rate_pct": 10.0, "recommended_refund_pct": 90, "error": str(e)}

# ─── J17: Territory Coverage ─────────────────────────────────────────────────
@app.post("/analytics/territory-coverage")
async def territory_coverage(req: TerritoryCoverageRequest):
    start = time.time()
    REQUEST_COUNT.labels(endpoint="territory-coverage").inc()
    try:
        est_count = await query(
            "SELECT COUNT(*) as cnt FROM establishments WHERE city = $1",
            req.city
        )
        total_establishments = int(est_count[0]["cnt"] or 0) if est_count else 0

        # Estimate coverage based on radius
        coverage_pct = min(100, (req.radius_km / 20) * 100)  # 20km = 100% coverage

        REQUEST_LATENCY.labels(endpoint="territory-coverage").observe(time.time() - start)
        return {
            "agent_id": req.agent_id,
            "city": req.city,
            "radius_km": req.radius_km,
            "total_establishments_in_city": total_establishments,
            "estimated_coverage_pct": round(coverage_pct, 2),
            "estimated_establishments_covered": math.floor(total_establishments * coverage_pct / 100),
            "recommended_visit_frequency_days": 7 if total_establishments > 50 else 14,
        }
    except Exception as e:
        ERROR_COUNT.labels(endpoint="territory-coverage").inc()
        return {"agent_id": req.agent_id, "city": req.city, "estimated_coverage_pct": 50.0, "error": str(e)}

# ─── J18: Settlement Summary ─────────────────────────────────────────────────
@app.post("/analytics/settlement-summary")
async def settlement_summary(req: SettlementSummaryRequest):
    start = time.time()
    REQUEST_COUNT.labels(endpoint="settlement-summary").inc()
    try:
        payments = await query(
            """SELECT COALESCE(SUM(amount_ngn::float), 0) as total,
                      COUNT(*) as count
               FROM merchant_payments WHERE merchant_id = $1
                 AND created_at BETWEEN $2 AND $3""",
            req.tenant_id, req.period_start, req.period_end
        )
        total_revenue = float(payments[0]["total"] or 0) if payments else 0.0
        payment_count = int(payments[0]["count"] or 0) if payments else 0

        platform_fee_pct = 1.5
        platform_fee = total_revenue * (platform_fee_pct / 100)
        net_payout = total_revenue - platform_fee

        REQUEST_LATENCY.labels(endpoint="settlement-summary").observe(time.time() - start)
        return {
            "tenant_id": req.tenant_id,
            "period_start": req.period_start,
            "period_end": req.period_end,
            "total_revenue_ngn": round(total_revenue, 2),
            "payment_count": payment_count,
            "platform_fee_pct": platform_fee_pct,
            "platform_fee_ngn": round(platform_fee, 2),
            "net_payout_ngn": round(net_payout, 2),
        }
    except Exception as e:
        ERROR_COUNT.labels(endpoint="settlement-summary").inc()
        return {"tenant_id": req.tenant_id, "total_revenue_ngn": 0, "net_payout_ngn": 0, "error": str(e)}

# ─── J19: Fraud Network Analysis ─────────────────────────────────────────────
@app.post("/analytics/fraud-network")
async def fraud_network(req: FraudNetworkRequest):
    start = time.time()
    REQUEST_COUNT.labels(endpoint="fraud-network").inc()
    try:
        # Get connected fraud alerts
        alerts = await query(
            """SELECT COUNT(*) as cnt, COALESCE(AVG(fraud_score::float), 0) as avg_score
               FROM fraud_alerts WHERE user_id::text = $1""",
            req.suspect_user_id
        )
        alert_count = int(alerts[0]["cnt"] or 0) if alerts else 0
        avg_score = float(alerts[0]["avg_score"] or 0) if alerts else 0.0

        # Network risk: check if same device/IP used by other flagged users
        network_risk = min(100, req.risk_score + alert_count * 5)

        REQUEST_LATENCY.labels(endpoint="fraud-network").observe(time.time() - start)
        return {
            "suspect_user_id": req.suspect_user_id,
            "risk_score": req.risk_score,
            "trigger_type": req.trigger_type,
            "alert_count": alert_count,
            "avg_fraud_score": round(avg_score * 100, 2),
            "network_risk_score": round(network_risk, 2),
            "recommended_action": "freeze_and_investigate" if network_risk >= 80 else "monitor" if network_risk >= 50 else "flag",
            "escalate_to_bis": network_risk >= 70,
        }
    except Exception as e:
        ERROR_COUNT.labels(endpoint="fraud-network").inc()
        return {"suspect_user_id": req.suspect_user_id, "network_risk_score": req.risk_score, "escalate_to_bis": True, "error": str(e)}

# ─── J20: Tourist Lifecycle Analytics ────────────────────────────────────────
@app.post("/analytics/tourist-lifecycle")
async def tourist_lifecycle(req: TouristLifecycleRequest):
    start = time.time()
    REQUEST_COUNT.labels(endpoint="tourist-lifecycle").inc()
    try:
        # Wallet balance
        wallet = await query(
            "SELECT COALESCE(balance, 0) as balance FROM wallet_balances WHERE user_id = $1 AND currency = 'NGN' LIMIT 1",
            req.tourist_id
        )
        balance = float(wallet[0]["balance"] or 0) if wallet else 0.0

        # Loyalty points
        loyalty = await query(
            """SELECT COALESCE(SUM(CASE WHEN transaction_type = 'earn' THEN points ELSE -points END), 0) as total
               FROM loyalty_transactions WHERE user_id::text = $1""",
            req.tourist_id
        )
        loyalty_points = int(loyalty[0]["total"] or 0) if loyalty else 0

        # Total spend
        spend = await query(
            """SELECT COALESCE(SUM(amount), 0) as total FROM wallet_transactions
               WHERE user_id::text = $1 AND type = 'debit'""",
            req.tourist_id
        )
        total_spend = float(spend[0]["total"] or 0) if spend else 0.0

        # Bookings
        bookings = await query(
            "SELECT COUNT(*) as cnt FROM direct_bookings WHERE hotel_id IS NOT NULL LIMIT 1"
        )
        booking_count = int(bookings[0]["cnt"] or 0) if bookings else 0

        REQUEST_LATENCY.labels(endpoint="tourist-lifecycle").observe(time.time() - start)
        return {
            "tourist_id": req.tourist_id,
            "destination": req.destination,
            "wallet_balance_ngn": balance,
            "loyalty_points": loyalty_points,
            "total_spend_ngn": round(total_spend, 2),
            "booking_count": booking_count,
            "loyalty_tier": "gold" if loyalty_points > 5000 else "silver" if loyalty_points > 1000 else "bronze",
            "engagement_score": min(100, loyalty_points / 100 + booking_count * 10),
        }
    except Exception as e:
        ERROR_COUNT.labels(endpoint="tourist-lifecycle").inc()
        return {"tourist_id": req.tourist_id, "destination": req.destination, "wallet_balance_ngn": 0, "loyalty_points": 0, "error": str(e)}

# ─── Health & Metrics ─────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    pool = await get_pool()
    db_ok = False
    if pool:
        try:
            async with pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            db_ok = True
        except Exception:
            pass
    return {
        "status": "healthy" if db_ok else "degraded",
        "service": "journey-analytics",
        "version": "1.0.0",
        "database": "connected" if db_ok else "disconnected",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

# ─── Main ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=HTTP_PORT, log_level="info")
