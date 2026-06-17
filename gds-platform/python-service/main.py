"""
GDS Platform — Python ML Microservice
Standalone FastAPI service for demand forecasting, revenue optimization,
and tip recommendation models. Runs as a sidecar to the GDS platform.

Port: 4003 (env: GDS_PYTHON_PORT)
"""
import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import FastAPI, Query
from pydantic import BaseModel

app = FastAPI(title="GDS ML Service", version="1.0.0")

GDS_PYTHON_PORT = int(os.getenv("GDS_PYTHON_PORT", "4003"))


# ─── Models ───────────────────────────────────────────────────────────────────

class DemandForecast(BaseModel):
    property_id: str
    date: str
    predicted_occupancy: float
    confidence: float
    recommendation: str
    suggested_rate_adjustment: float


class RevenueOptimization(BaseModel):
    property_id: str
    current_adr: float
    suggested_adr: float
    expected_revenue_change: float
    reasoning: str


class TipRecommendation(BaseModel):
    country_code: str
    property_type: str
    service_quality: str
    suggested_percentage: float
    local_custom_note: str


# ─── Jurisdiction-specific tip customs ────────────────────────────────────────

TIP_CUSTOMS = {
    "NG": {"default": 10, "excellent": 15, "note": "Tipping increasingly common in Lagos/Abuja hotels"},
    "KE": {"default": 10, "excellent": 15, "note": "Safari guides: $10-20/day per person is customary"},
    "GH": {"default": 10, "excellent": 12, "note": "Tipping appreciated but not mandatory"},
    "ZA": {"default": 10, "excellent": 15, "note": "10-15% standard in restaurants and hotels"},
    "TZ": {"default": 10, "excellent": 15, "note": "Safari: $15-20/day guide, $10/day for camp staff"},
    "RW": {"default": 10, "excellent": 15, "note": "Gorilla trekking guides: $20-50 per group"},
    "EG": {"default": 10, "excellent": 12, "note": "'Baksheesh' culture — small tips expected everywhere"},
    "MA": {"default": 10, "excellent": 12, "note": "Riads: 50-100 MAD per day for staff"},
    "UG": {"default": 10, "excellent": 12, "note": "Similar to Kenya safari tipping norms"},
    "ET": {"default": 5, "excellent": 10, "note": "Tipping less common, appreciated in tourist areas"},
    "BW": {"default": 10, "excellent": 15, "note": "Safari guides: $10-15 USD per day"},
    "NA": {"default": 10, "excellent": 15, "note": "Similar to South African norms"},
    "MU": {"default": 10, "excellent": 15, "note": "Resort staff often receive tips (10-15%)"},
    "MZ": {"default": 5, "excellent": 10, "note": "Tipping appreciated in tourist hotels"},
    "ZW": {"default": 10, "excellent": 12, "note": "USD preferred, similar to regional norms"},
}


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "gds-python-ml", "version": "1.0.0"}


@app.get("/api/v1/gds/ml/demand-forecast")
def demand_forecast(
    property_id: str = Query(...),
    days_ahead: int = Query(default=7, ge=1, le=90),
):
    """Predict occupancy for a property over the next N days."""
    forecasts = []
    base_occupancy = 0.68  # baseline

    for i in range(days_ahead):
        date = (datetime.now() + timedelta(days=i)).strftime("%Y-%m-%d")
        # Simple seasonal model (peak in Dec-Feb for East Africa)
        month = (datetime.now() + timedelta(days=i)).month
        seasonal_factor = 1.2 if month in [12, 1, 2, 7, 8] else 0.9
        day_of_week = (datetime.now() + timedelta(days=i)).weekday()
        weekend_factor = 1.15 if day_of_week >= 4 else 1.0

        predicted = min(base_occupancy * seasonal_factor * weekend_factor, 0.98)
        confidence = 0.85 - (i * 0.005)  # confidence decreases with time

        rec = "maintain" if predicted > 0.75 else "discount" if predicted < 0.5 else "promote"
        rate_adj = 15.0 if predicted > 0.85 else -10.0 if predicted < 0.5 else 0.0

        forecasts.append(DemandForecast(
            property_id=property_id,
            date=date,
            predicted_occupancy=round(predicted, 3),
            confidence=round(max(confidence, 0.6), 3),
            recommendation=rec,
            suggested_rate_adjustment=rate_adj,
        ))

    return {"forecasts": [f.dict() for f in forecasts], "total_days": days_ahead}


@app.get("/api/v1/gds/ml/revenue-optimize")
def revenue_optimize(
    property_id: str = Query(...),
    current_adr: float = Query(..., description="Current Average Daily Rate in USD"),
    occupancy: float = Query(default=0.7, ge=0, le=1),
):
    """Suggest optimal rate based on demand elasticity model."""
    # Price elasticity model: if high occupancy, can increase; if low, should decrease
    if occupancy > 0.85:
        suggested = current_adr * 1.12
        reasoning = "High occupancy suggests price elasticity allows 12% increase"
        rev_change = (suggested - current_adr) * occupancy * 30
    elif occupancy < 0.5:
        suggested = current_adr * 0.88
        reasoning = "Low occupancy — 12% discount expected to boost bookings by 25%"
        rev_change = (suggested * 1.25 - current_adr) * 0.5 * 30
    else:
        suggested = current_adr * 1.03
        reasoning = "Moderate occupancy — small 3% increase sustainable"
        rev_change = (suggested - current_adr) * occupancy * 30

    return RevenueOptimization(
        property_id=property_id,
        current_adr=current_adr,
        suggested_adr=round(suggested, 2),
        expected_revenue_change=round(rev_change, 2),
        reasoning=reasoning,
    ).dict()


@app.get("/api/v1/gds/ml/tip-recommendation")
def tip_recommendation(
    country_code: str = Query(..., min_length=2, max_length=2),
    property_type: str = Query(default="hotel"),
    service_quality: Optional[str] = Query(default="good"),
):
    """Get culturally-appropriate tip recommendation for a jurisdiction."""
    customs = TIP_CUSTOMS.get(country_code.upper(), {"default": 10, "excellent": 12, "note": "Standard 10% appreciated"})

    # Adjust for property type
    type_multiplier = {
        "safari_camp": 1.5,
        "lodge": 1.3,
        "resort": 1.2,
        "boutique": 1.1,
        "hotel": 1.0,
    }.get(property_type, 1.0)

    quality_key = "excellent" if service_quality in ["excellent", "outstanding"] else "default"
    base_pct = customs[quality_key]
    suggested = round(base_pct * type_multiplier, 1)

    return TipRecommendation(
        country_code=country_code.upper(),
        property_type=property_type,
        service_quality=service_quality or "good",
        suggested_percentage=suggested,
        local_custom_note=customs["note"],
    ).dict()


@app.get("/api/v1/gds/ml/jurisdictions")
def supported_jurisdictions():
    """List all supported jurisdictions with tip customs."""
    return {
        "jurisdictions": [
            {"code": code, "default_tip_pct": v["default"], "note": v["note"]}
            for code, v in TIP_CUSTOMS.items()
        ],
        "total": len(TIP_CUSTOMS),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=GDS_PYTHON_PORT)
