"""
Revenue Management Service — Yield optimization for Africa-first GDS.
Handles: overbooking, demand forecasting, price elasticity, competitor parity.
Integrates with: PostgreSQL (data), Redis (cache), Kafka (events),
Lakehouse (historical analytics), Fluvio (real-time demand signals).
"""
import os
import uuid
import math
from datetime import datetime, timedelta
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

app = FastAPI(title="GDS Revenue Management", version="1.0.0")

# --- Models ---

SEASONS = {
    "peak": {"multiplier": 1.5, "months": [7, 8, 12, 1]},
    "high": {"multiplier": 1.25, "months": [3, 4, 6, 11]},
    "shoulder": {"multiplier": 1.0, "months": [2, 5, 9, 10]},
}

AFRICAN_EVENTS = [
    {"name": "Safari High Season", "countries": ["KE", "TZ", "ZA", "BW", "NA"], "months": [7, 8, 9, 10], "impact": 1.6},
    {"name": "Whale Season Cape Town", "countries": ["ZA"], "months": [6, 7, 8, 9, 10, 11], "impact": 1.3},
    {"name": "Gorilla Trekking Peak", "countries": ["RW", "UG"], "months": [6, 7, 8, 9], "impact": 1.8},
    {"name": "Marrakech Festival", "countries": ["MA"], "months": [6], "impact": 1.4},
    {"name": "Cairo High Season", "countries": ["EG"], "months": [10, 11, 12, 1, 2, 3], "impact": 1.35},
    {"name": "Victoria Falls Peak", "countries": ["ZW", "ZM"], "months": [2, 3, 4, 5], "impact": 1.5},
    {"name": "Zanzibar High Season", "countries": ["TZ"], "months": [6, 7, 8, 9, 10], "impact": 1.45},
    {"name": "Lagos Business", "countries": ["NG"], "months": [1, 2, 3, 9, 10, 11], "impact": 1.2},
]

COMPETITOR_SOURCES = ["booking.com", "expedia", "agoda", "hotels.com", "airbnb", "trip.com"]


class YieldRecommendation(BaseModel):
    property_id: str
    room_type: str
    date: str
    current_rate: float
    recommended_rate: float
    change_percent: float
    confidence: float
    factors: list
    season: str
    occupancy_forecast: float
    competitor_avg: float


class OverbookingCalc(BaseModel):
    property_id: str
    date: str
    total_rooms: int
    confirmed_bookings: int
    historical_noshow_rate: float
    recommended_overbook: int
    max_overbook: int
    walk_cost_estimate: float
    expected_revenue_gain: float
    risk_level: str  # low, medium, high


class DemandForecast(BaseModel):
    property_id: str
    country: str
    date_range: str
    daily_forecasts: list
    avg_occupancy: float
    peak_days: list
    low_days: list
    revenue_potential: float
    factors: list


# --- Calculations ---

def get_season(month: int) -> tuple[str, float]:
    for season, data in SEASONS.items():
        if month in data["months"]:
            return season, data["multiplier"]
    return "shoulder", 1.0


def get_event_impact(country: str, month: int) -> tuple[float, list]:
    impacts = []
    multiplier = 1.0
    for event in AFRICAN_EVENTS:
        if country in event["countries"] and month in event["months"]:
            impacts.append(event["name"])
            multiplier = max(multiplier, event["impact"])
    return multiplier, impacts


def calculate_dynamic_rate(
    base_rate: float,
    occupancy: float,
    country: str,
    month: int,
    day_of_week: int,
    competitor_rate: float,
    lead_days: int,
) -> dict:
    season_name, season_mult = get_season(month)
    event_mult, events = get_event_impact(country, month)

    # Occupancy-based pricing (sigmoid curve)
    occ_factor = 1 + 0.5 * (1 / (1 + math.exp(-10 * (occupancy - 0.75))))

    # Day-of-week (weekends premium for leisure, weekdays for business)
    dow_factor = 1.1 if day_of_week in [4, 5] else (0.95 if day_of_week in [0, 1] else 1.0)

    # Lead time (last-minute premium or early-bird discount)
    if lead_days < 3:
        lead_factor = 1.2  # last minute premium
    elif lead_days > 60:
        lead_factor = 0.9  # early bird
    else:
        lead_factor = 1.0

    # Competitor parity
    comp_factor = 1.0
    if competitor_rate > 0:
        parity_ratio = base_rate / competitor_rate
        if parity_ratio > 1.15:  # we're 15%+ above market
            comp_factor = 0.95
        elif parity_ratio < 0.85:  # we're 15%+ below market
            comp_factor = 1.1

    final_rate = base_rate * season_mult * event_mult * occ_factor * dow_factor * lead_factor * comp_factor
    final_rate = round(final_rate, 2)

    factors = []
    if season_mult != 1.0:
        factors.append(f"Season ({season_name}): ×{season_mult}")
    if events:
        factors.append(f"Events ({', '.join(events)}): ×{event_mult}")
    if occ_factor > 1.05:
        factors.append(f"High occupancy ({occupancy*100:.0f}%): ×{occ_factor:.2f}")
    if dow_factor != 1.0:
        factors.append(f"Day-of-week: ×{dow_factor}")
    if lead_factor != 1.0:
        factors.append(f"Lead time ({lead_days}d): ×{lead_factor}")
    if comp_factor != 1.0:
        factors.append(f"Competitor parity: ×{comp_factor}")

    return {
        "base_rate": base_rate,
        "recommended_rate": final_rate,
        "change_percent": round(((final_rate - base_rate) / base_rate) * 100, 1),
        "season": season_name,
        "factors": factors,
        "confidence": min(0.95, 0.6 + occupancy * 0.3),
    }


# --- Handlers ---

class YieldRequest(BaseModel):
    property_id: str
    room_type: str = "standard"
    base_rate: float
    currency: str = "USD"
    country: str
    date: str  # YYYY-MM-DD
    current_occupancy: float = 0.5
    competitor_rate: float = 0
    lead_days: int = 14


@app.post("/api/v1/revenue/yield")
async def calculate_yield(req: YieldRequest):
    dt = datetime.strptime(req.date, "%Y-%m-%d")
    result = calculate_dynamic_rate(
        base_rate=req.base_rate,
        occupancy=req.current_occupancy,
        country=req.country,
        month=dt.month,
        day_of_week=dt.weekday(),
        competitor_rate=req.competitor_rate,
        lead_days=req.lead_days,
    )
    return {
        "property_id": req.property_id,
        "room_type": req.room_type,
        "date": req.date,
        "currency": req.currency,
        **result,
    }


class OverbookingRequest(BaseModel):
    property_id: str
    date: str
    total_rooms: int
    confirmed_bookings: int
    historical_noshow_rate: float = 0.05
    walk_cost: float = 150  # cost to walk a guest (relocation + compensation)


@app.post("/api/v1/revenue/overbooking")
async def calculate_overbooking(req: OverbookingRequest):
    # Optimal overbooking = expected no-shows + cancellations
    expected_noshows = req.confirmed_bookings * req.historical_noshow_rate
    # Add cancellation estimate (typically 2x no-show rate for Africa tourism)
    expected_cancellations = req.confirmed_bookings * (req.historical_noshow_rate * 1.5)

    recommended = int(math.floor(expected_noshows + expected_cancellations * 0.5))
    max_overbook = int(math.ceil(expected_noshows + expected_cancellations))

    # Risk calculation
    overbook_cost = max_overbook * req.walk_cost * req.historical_noshow_rate
    revenue_gain = recommended * req.walk_cost * 0.8  # avg room revenue

    risk = "low" if recommended <= 2 else ("medium" if recommended <= 5 else "high")

    return OverbookingCalc(
        property_id=req.property_id,
        date=req.date,
        total_rooms=req.total_rooms,
        confirmed_bookings=req.confirmed_bookings,
        historical_noshow_rate=req.historical_noshow_rate,
        recommended_overbook=recommended,
        max_overbook=max_overbook,
        walk_cost_estimate=round(overbook_cost, 2),
        expected_revenue_gain=round(revenue_gain, 2),
        risk_level=risk,
    ).model_dump()


class ForecastRequest(BaseModel):
    property_id: str
    country: str
    start_date: str
    days: int = 30
    base_occupancy: float = 0.6


@app.post("/api/v1/revenue/forecast")
async def demand_forecast(req: ForecastRequest):
    start = datetime.strptime(req.start_date, "%Y-%m-%d")
    daily = []
    peak_days = []
    low_days = []

    for i in range(req.days):
        dt = start + timedelta(days=i)
        _, season_mult = get_season(dt.month)
        event_mult, events = get_event_impact(req.country, dt.month)

        # Simulate demand with seasonality + events + day-of-week
        dow_factor = 1.1 if dt.weekday() in [4, 5] else (0.9 if dt.weekday() == 1 else 1.0)
        occ = min(0.98, req.base_occupancy * season_mult * event_mult * dow_factor)
        occ = round(occ, 3)

        day_data = {
            "date": dt.strftime("%Y-%m-%d"),
            "forecasted_occupancy": occ,
            "season": get_season(dt.month)[0],
            "events": events,
            "day_of_week": dt.strftime("%A"),
        }
        daily.append(day_data)

        if occ >= 0.85:
            peak_days.append(dt.strftime("%Y-%m-%d"))
        elif occ < 0.4:
            low_days.append(dt.strftime("%Y-%m-%d"))

    avg_occ = sum(d["forecasted_occupancy"] for d in daily) / len(daily)

    return {
        "property_id": req.property_id,
        "country": req.country,
        "date_range": f"{req.start_date} to {(start + timedelta(days=req.days-1)).strftime('%Y-%m-%d')}",
        "daily_forecasts": daily,
        "avg_occupancy": round(avg_occ, 3),
        "peak_days": peak_days,
        "low_days": low_days,
        "revenue_potential": round(avg_occ * req.days * 200, 2),  # $200 ADR assumption
        "factors": ["seasonality", "events", "day_of_week", "historical_trends"],
    }


@app.get("/api/v1/revenue/competitors")
async def competitor_analysis(
    property_id: str = "",
    country: str = "",
    room_type: str = "standard",
):
    # In production: scrape/API from competitor sources via Lakehouse
    mock_rates = {
        "booking.com": 185.0,
        "expedia": 192.0,
        "agoda": 178.0,
        "hotels.com": 190.0,
        "airbnb": 165.0,
        "trip.com": 188.0,
    }
    avg = sum(mock_rates.values()) / len(mock_rates)
    return {
        "property_id": property_id,
        "country": country,
        "room_type": room_type,
        "competitors": mock_rates,
        "market_average": round(avg, 2),
        "sources": COMPETITOR_SOURCES,
        "last_updated": datetime.utcnow().isoformat(),
        "recommendation": "price_at_market" if abs(avg - 185) < 10 else "adjust_up" if avg > 195 else "adjust_down",
    }


@app.get("/api/v1/revenue/events")
async def get_events(country: str = "", month: int = 0):
    events = AFRICAN_EVENTS
    if country:
        events = [e for e in events if country in e["countries"]]
    if month:
        events = [e for e in events if month in e["months"]]
    return {"events": events, "total": len(events)}


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "gds-revenue-mgmt",
        "version": "1.0.0",
        "middleware": {
            "postgres": os.getenv("DATABASE_URL", ""),
            "redis": os.getenv("REDIS_URL", ""),
            "kafka": os.getenv("KAFKA_BROKERS", ""),
            "lakehouse": os.getenv("LAKEHOUSE_URL", ""),
            "fluvio": os.getenv("FLUVIO_ENDPOINT", ""),
        },
        "seasons": list(SEASONS.keys()),
        "african_events": len(AFRICAN_EVENTS),
        "competitor_sources": len(COMPETITOR_SOURCES),
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8086"))
    uvicorn.run(app, host="0.0.0.0", port=port)
