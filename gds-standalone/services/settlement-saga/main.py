"""
Settlement Saga Service — Multi-step payment settlement waterfall.
All data persisted to PostgreSQL via asyncpg.
"""
import os
import uuid
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/tourismpay")
DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001"

pool: asyncpg.Pool = None

SETTLEMENT_STEPS = [
    {"name": "tax_withholding", "pct": 0.04},
    {"name": "platform_fee", "pct": 0.06},
    {"name": "agent_commission", "pct": 0.32},
    {"name": "insurance_reserve", "pct": 0.02},
    {"name": "property_payout", "pct": 0.56},
]


class SettlementRequest(BaseModel):
    booking_id: str
    gross_amount: float
    currency: str = "NGN"
    property_id: str = ""
    agent_id: str = ""


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    print("[DB] PostgreSQL connected")
    yield
    await pool.close()


app = FastAPI(title="GDS Settlement Saga", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    try:
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "healthy", "service": "settlement-saga", "database": "connected"}
    except Exception:
        return {"status": "degraded", "service": "settlement-saga", "database": "disconnected"}


@app.post("/api/v1/settlement/execute", status_code=201)
async def execute_settlement(req: SettlementRequest):
    saga_id = str(uuid.uuid4())
    steps = []
    remaining = req.gross_amount

    for step_def in SETTLEMENT_STEPS:
        step_id = str(uuid.uuid4())
        amount = round(req.gross_amount * step_def["pct"], 2)
        if step_def["name"] == "property_payout":
            amount = round(remaining, 2)
        remaining -= amount
        steps.append({
            "id": step_id,
            "step_name": step_def["name"],
            "amount": amount,
            "status": "completed",
            "sequence": len(steps) + 1,
        })

    # Persist saga and steps
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO gds_settlement_sagas (id, tenant_id, booking_id, gross_amount, currency,
               property_id, agent_id, status, steps_completed, total_steps)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'completed',$8,$9)""",
            saga_id, DEFAULT_TENANT, req.booking_id, req.gross_amount, req.currency,
            req.property_id, req.agent_id, len(steps), len(steps)
        )
        for step in steps:
            await conn.execute(
                """INSERT INTO gds_settlement_steps (id, tenant_id, saga_id, step_name, amount, status, sequence)
                   VALUES ($1,$2,$3,$4,$5,$6,$7)""",
                step["id"], DEFAULT_TENANT, saga_id, step["step_name"], step["amount"], step["status"], step["sequence"]
            )

    return {
        "saga_id": saga_id,
        "booking_id": req.booking_id,
        "gross_amount": req.gross_amount,
        "currency": req.currency,
        "status": "completed",
        "steps": steps,
        "total_distributed": sum(s["amount"] for s in steps),
    }


@app.get("/api/v1/settlement/sagas")
async def list_sagas():
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, booking_id, gross_amount, currency, property_id, agent_id, status,
               steps_completed, total_steps, created_at
               FROM gds_settlement_sagas WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50""",
            DEFAULT_TENANT
        )
    sagas = [dict(r) for r in rows]
    return {"sagas": sagas, "total": len(sagas)}


@app.get("/api/v1/settlement/sagas/{saga_id}")
async def get_saga(saga_id: str):
    async with pool.acquire() as conn:
        saga = await conn.fetchrow(
            """SELECT id, booking_id, gross_amount, currency, property_id, agent_id, status,
               steps_completed, total_steps, created_at
               FROM gds_settlement_sagas WHERE id=$1 AND tenant_id=$2""",
            saga_id, DEFAULT_TENANT
        )
        if not saga:
            raise HTTPException(status_code=404, detail="Saga not found")
        steps = await conn.fetch(
            """SELECT id, step_name, amount, status, sequence
               FROM gds_settlement_steps WHERE saga_id=$1 ORDER BY sequence""",
            saga_id
        )
    return {"saga": dict(saga), "steps": [dict(s) for s in steps]}


@app.get("/api/v1/settlement/rate-card")
async def get_rate_card():
    return {
        "steps": SETTLEMENT_STEPS,
        "total_pct": sum(s["pct"] for s in SETTLEMENT_STEPS),
        "currency": "NGN",
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8114"))
    print(f"[Settlement Saga] Starting on port {port} with PostgreSQL")
    uvicorn.run(app, host="0.0.0.0", port=port)
