"""
Discount & Promotions Service — Promo code validation and discount engine.
All data persisted to PostgreSQL via asyncpg.
"""
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/tourismpay")
DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001"

pool: asyncpg.Pool = None


class PromoCreate(BaseModel):
    code: str
    name: str
    discount_type: str = "percentage"  # percentage, fixed, bogo
    discount_value: float
    min_booking_amount: float = 0
    max_discount: float = 0
    valid_from: str = ""
    valid_to: str = ""
    max_uses: int = 0
    applicable_properties: str = ""


class ValidateRequest(BaseModel):
    code: str
    booking_amount: float
    property_id: str = ""
    currency: str = "NGN"


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    print("[DB] PostgreSQL connected")
    yield
    await pool.close()


app = FastAPI(title="GDS Discount & Promotions", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    try:
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "healthy", "service": "discount-promo", "database": "connected"}
    except Exception:
        return {"status": "degraded", "service": "discount-promo", "database": "disconnected"}


@app.post("/api/v1/discounts/promos", status_code=201)
async def create_promo(req: PromoCreate):
    promo_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO gds_discount_promos (id, tenant_id, code, name, discount_type, discount_value,
               min_booking_amount, max_discount, valid_from, valid_to, max_uses, current_uses, applicable_properties, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$12,'active')""",
            promo_id, DEFAULT_TENANT, req.code.upper(), req.name, req.discount_type,
            req.discount_value, req.min_booking_amount, req.max_discount,
            req.valid_from, req.valid_to, req.max_uses, req.applicable_properties
        )
    return {"id": promo_id, "code": req.code.upper(), "name": req.name, "status": "active"}


@app.get("/api/v1/discounts/promos")
async def list_promos():
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, code, name, discount_type, discount_value, min_booking_amount,
               max_discount, valid_from, valid_to, max_uses, current_uses, status
               FROM gds_discount_promos WHERE tenant_id=$1 ORDER BY created_at DESC""",
            DEFAULT_TENANT
        )
    promos = [dict(r) for r in rows]
    return {"promos": promos, "total": len(promos)}


@app.post("/api/v1/discounts/validate")
async def validate_promo(req: ValidateRequest):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT id, code, name, discount_type, discount_value, min_booking_amount,
               max_discount, max_uses, current_uses, status
               FROM gds_discount_promos WHERE tenant_id=$1 AND code=$2 AND status='active'""",
            DEFAULT_TENANT, req.code.upper()
        )
    if not row:
        raise HTTPException(status_code=404, detail=f"Promo code '{req.code}' not found or inactive")

    promo = dict(row)
    if promo["min_booking_amount"] > 0 and req.booking_amount < promo["min_booking_amount"]:
        raise HTTPException(status_code=400, detail=f"Minimum booking amount is {promo['min_booking_amount']}")
    if promo["max_uses"] > 0 and promo["current_uses"] >= promo["max_uses"]:
        raise HTTPException(status_code=400, detail="Promo code has reached maximum uses")

    # Calculate discount
    if promo["discount_type"] == "percentage":
        discount = req.booking_amount * promo["discount_value"] / 100
    elif promo["discount_type"] == "fixed":
        discount = promo["discount_value"]
    else:
        discount = req.booking_amount * 0.5  # BOGO = 50% off

    if promo["max_discount"] > 0:
        discount = min(discount, promo["max_discount"])

    final_amount = req.booking_amount - discount

    # Increment usage counter
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE gds_discount_promos SET current_uses = current_uses + 1 WHERE id=$1",
            promo["id"]
        )

    return {
        "valid": True,
        "code": promo["code"],
        "name": promo["name"],
        "discount_type": promo["discount_type"],
        "discount_value": promo["discount_value"],
        "discount_amount": round(discount, 2),
        "original_amount": req.booking_amount,
        "final_amount": round(final_amount, 2),
        "currency": req.currency,
    }


@app.delete("/api/v1/discounts/promos/{promo_id}")
async def deactivate_promo(promo_id: str):
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE gds_discount_promos SET status='inactive' WHERE id=$1 AND tenant_id=$2",
            promo_id, DEFAULT_TENANT
        )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Promo not found")
    return {"id": promo_id, "status": "inactive"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8111"))
    print(f"[Discount Promo] Starting on port {port} with PostgreSQL")
    uvicorn.run(app, host="0.0.0.0", port=port)
