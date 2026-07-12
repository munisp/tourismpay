"""
Revenue Management Service — Dynamic pricing and yield management.
All data persisted to PostgreSQL via asyncpg.
"""
import os
import uuid
import math
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/tourismpay")
DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001"

pool: asyncpg.Pool = None


class DemandEvent(BaseModel):
    property_id: str
    event_type: str  # booking, search, cancellation, competitor_rate
    value: float = 0
    metadata: str = ""


class YieldRequest(BaseModel):
    property_id: str
    base_rate: float
    occupancy_pct: float
    days_until_arrival: int
    season: str = "normal"
    competitor_avg: float = 0


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    print("[DB] PostgreSQL connected")
    yield
    await pool.close()


app = FastAPI(title="GDS Revenue Management", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    try:
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "healthy", "service": "revenue-mgmt", "database": "connected"}
    except Exception:
        return {"status": "degraded", "service": "revenue-mgmt", "database": "disconnected"}


@app.post("/api/v1/revenue/events", status_code=201)
async def record_event(req: DemandEvent):
    event_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO gds_revenue_events (id, tenant_id, property_id, event_type, value, metadata)
               VALUES ($1,$2,$3,$4,$5,$6)""",
            event_id, DEFAULT_TENANT, req.property_id, req.event_type, req.value, req.metadata
        )
    return {"id": event_id, "event_type": req.event_type, "recorded": True}


@app.get("/api/v1/revenue/events")
async def list_events():
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, property_id, event_type, value, metadata, created_at
               FROM gds_revenue_events WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100""",
            DEFAULT_TENANT
        )
    events = [dict(r) for r in rows]
    return {"events": events, "total": len(events)}


@app.post("/api/v1/revenue/yield")
async def calculate_yield(req: YieldRequest):
    # Sigmoid-based dynamic pricing
    occupancy_factor = 1 / (1 + math.exp(-10 * (req.occupancy_pct / 100 - 0.7)))
    urgency_factor = max(0.8, min(1.5, 1 + (1 / max(req.days_until_arrival, 1)) * 2))
    season_multiplier = {"peak": 1.5, "high": 1.3, "normal": 1.0, "low": 0.8, "off_peak": 0.6}.get(req.season, 1.0)
    competitor_factor = 1.0
    if req.competitor_avg > 0:
        competitor_factor = min(1.2, max(0.85, req.base_rate / req.competitor_avg))

    dynamic_rate = req.base_rate * (1 + occupancy_factor * 0.5) * urgency_factor * season_multiplier * competitor_factor
    dynamic_rate = round(dynamic_rate, 2)
    multiplier = round(dynamic_rate / req.base_rate, 2) if req.base_rate > 0 else 1.0

    # Persist calculation
    calc_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO gds_revenue_calculations (id, tenant_id, property_id, base_rate, dynamic_rate,
               multiplier, occupancy_pct, days_until_arrival, season)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
            calc_id, DEFAULT_TENANT, req.property_id, req.base_rate, dynamic_rate,
            multiplier, req.occupancy_pct, req.days_until_arrival, req.season
        )

    return {
        "base_rate": req.base_rate,
        "dynamic_rate": dynamic_rate,
        "multiplier": multiplier,
        "season": req.season,
        "occupancy_factor": round(occupancy_factor, 3),
        "urgency_factor": round(urgency_factor, 3),
    }


@app.get("/api/v1/revenue/analytics")
async def get_analytics():
    async with pool.acquire() as conn:
        total_events = await conn.fetchval(
            "SELECT COUNT(*) FROM gds_revenue_events WHERE tenant_id=$1", DEFAULT_TENANT
        )
        avg_rate = await conn.fetchval(
            "SELECT COALESCE(AVG(dynamic_rate), 0) FROM gds_revenue_calculations WHERE tenant_id=$1", DEFAULT_TENANT
        )
        calc_count = await conn.fetchval(
            "SELECT COUNT(*) FROM gds_revenue_calculations WHERE tenant_id=$1", DEFAULT_TENANT
        )
    return {
        "total_events": total_events or 0,
        "total_calculations": calc_count or 0,
        "avg_dynamic_rate": round(float(avg_rate or 0), 2),
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8086"))
    print(f"[Revenue Mgmt] Starting on port {port} with PostgreSQL")
    uvicorn.run(app, host="0.0.0.0", port=port)
