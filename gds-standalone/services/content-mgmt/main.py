"""
Content Management Service — Rich property content for Africa-first GDS.
All data persisted to PostgreSQL via asyncpg.
"""
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/tourismpay")
DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001"

pool: asyncpg.Pool = None

SUPPORTED_LANGUAGES = [
    "en", "fr", "ar", "sw", "pt", "am", "zu", "ha",
    "yo", "ig", "so", "af", "rw", "mg", "wo"
]

AMENITY_CATEGORIES = {
    "room": ["wifi", "ac", "minibar", "safe", "tv", "balcony", "bathtub", "workspace"],
    "property": ["pool", "gym", "spa", "restaurant", "bar", "parking", "laundry", "concierge"],
    "accessibility": ["wheelchair", "elevator", "braille", "hearing_loop"],
    "family": ["kids_club", "babysitting", "playground", "family_rooms"],
    "business": ["meeting_rooms", "business_center", "video_conferencing"],
    "eco": ["solar_power", "water_recycling", "organic_garden", "ev_charging"],
}


class ContentCreate(BaseModel):
    property_id: str
    name: str
    description: str = ""
    country: str = ""
    city: str = ""
    property_type: str = ""
    star_rating: float = 0
    amenities: str = ""
    languages: str = ""


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    print("[DB] PostgreSQL connected")
    yield
    await pool.close()


app = FastAPI(title="GDS Content Management", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    try:
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "healthy", "service": "content-mgmt", "database": "connected"}
    except Exception:
        return {"status": "degraded", "service": "content-mgmt", "database": "disconnected"}


@app.post("/api/v1/content", status_code=201)
async def create_content(req: ContentCreate):
    content_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO gds_content (id, tenant_id, property_id, name, description, country, city,
               property_type, star_rating, amenities, languages, published, completeness_score)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,0)""",
            content_id, DEFAULT_TENANT, req.property_id, req.name, req.description,
            req.country, req.city, req.property_type, req.star_rating, req.amenities, req.languages
        )
    return {"id": content_id, "property_id": req.property_id, "name": req.name, "status": "created"}


@app.get("/api/v1/content")
async def list_content():
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, property_id, name, description, country, city, property_type,
               star_rating, amenities, languages, published, completeness_score, created_at
               FROM gds_content WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50""",
            DEFAULT_TENANT
        )
    contents = [dict(r) for r in rows]
    return {"contents": contents, "total": len(contents)}


@app.get("/api/v1/content/{content_id}")
async def get_content(content_id: str):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT id, property_id, name, description, country, city, property_type,
               star_rating, amenities, languages, published, completeness_score, created_at
               FROM gds_content WHERE id=$1 AND tenant_id=$2""",
            content_id, DEFAULT_TENANT
        )
    if not row:
        raise HTTPException(status_code=404, detail="Content not found")
    return dict(row)


@app.put("/api/v1/content/{content_id}")
async def update_content(content_id: str, req: ContentCreate):
    async with pool.acquire() as conn:
        result = await conn.execute(
            """UPDATE gds_content SET name=$1, description=$2, country=$3, city=$4,
               property_type=$5, star_rating=$6, amenities=$7, languages=$8, updated_at=NOW()
               WHERE id=$9 AND tenant_id=$10""",
            req.name, req.description, req.country, req.city,
            req.property_type, req.star_rating, req.amenities, req.languages,
            content_id, DEFAULT_TENANT
        )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Content not found")
    return {"id": content_id, "updated": True}


@app.delete("/api/v1/content/{content_id}")
async def delete_content(content_id: str):
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM gds_content WHERE id=$1 AND tenant_id=$2", content_id, DEFAULT_TENANT
        )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Content not found")
    return {"deleted": True}


@app.get("/api/v1/content/languages")
async def get_languages():
    return {"languages": SUPPORTED_LANGUAGES, "total": len(SUPPORTED_LANGUAGES)}


@app.get("/api/v1/content/amenities")
async def get_amenities():
    all_amenities = []
    for cat, items in AMENITY_CATEGORIES.items():
        for item in items:
            all_amenities.append({"category": cat, "code": item})
    return {"amenities": all_amenities, "total": len(all_amenities), "categories": list(AMENITY_CATEGORIES.keys())}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8085"))
    print(f"[Content Mgmt] Starting on port {port} with PostgreSQL")
    uvicorn.run(app, host="0.0.0.0", port=port)
