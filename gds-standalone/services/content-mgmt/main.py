"""
Content Management Service — Rich property content for Africa-first GDS.
Handles: descriptions, images, amenities, policies, multilingual content.
Integrates with: PostgreSQL (store), OpenSearch (full-text), Redis (cache),
Kafka (events), Lakehouse (analytics), S3-compatible (media storage).
"""
import os
import uuid
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

app = FastAPI(title="GDS Content Management", version="1.0.0")

# --- Models ---

SUPPORTED_LANGUAGES = [
    "en", "fr", "ar", "sw", "pt", "am", "zu", "ha",
    "yo", "ig", "so", "af", "rw", "mg", "wo"
]

AMENITY_CATEGORIES = {
    "room": ["wifi", "ac", "minibar", "safe", "tv", "balcony", "bathtub", "workspace"],
    "property": ["pool", "gym", "spa", "restaurant", "bar", "parking", "laundry", "concierge"],
    "accessibility": ["wheelchair", "elevator", "braille", "hearing_loop", "accessible_bathroom"],
    "family": ["kids_club", "babysitting", "playground", "family_rooms", "highchairs"],
    "business": ["meeting_rooms", "business_center", "video_conferencing", "projector"],
    "eco": ["solar_power", "water_recycling", "organic_garden", "ev_charging", "no_plastic"],
}

PROPERTY_POLICIES = [
    "check_in_time", "check_out_time", "cancellation", "children",
    "pets", "smoking", "payment_methods", "deposit", "dress_code",
    "minimum_age", "damage_policy", "noise_policy"
]


class LocalizedText(BaseModel):
    language: str
    text: str


class PropertyContent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    property_id: str
    tenant_id: str
    name: dict = Field(default_factory=dict)  # {lang: text}
    description: dict = Field(default_factory=dict)
    short_description: dict = Field(default_factory=dict)
    location: dict = Field(default_factory=dict)
    amenities: list = Field(default_factory=list)
    policies: dict = Field(default_factory=dict)
    images: list = Field(default_factory=list)
    star_rating: float = 0
    property_type: str = ""
    country: str = ""
    city: str = ""
    coordinates: dict = Field(default_factory=dict)
    contact: dict = Field(default_factory=dict)
    highlights: list = Field(default_factory=list)
    awards: list = Field(default_factory=list)
    sustainability_score: float = 0
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    published: bool = False
    completeness_score: float = 0


class ImageEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str
    caption: dict = Field(default_factory=dict)  # {lang: text}
    category: str = "general"  # room, exterior, lobby, restaurant, pool, view, bathroom
    sort_order: int = 0
    width: int = 0
    height: int = 0
    is_primary: bool = False


# --- In-Memory Store (PostgreSQL + OpenSearch in production) ---

content_store: dict[str, PropertyContent] = {}


# --- Completeness Scoring ---

def calculate_completeness(content: PropertyContent) -> float:
    score = 0.0
    total = 10.0

    if content.name.get("en"):
        score += 1
    if content.description.get("en") and len(content.description["en"]) > 100:
        score += 1.5
    if content.short_description.get("en"):
        score += 0.5
    if len(content.amenities) >= 5:
        score += 1
    if len(content.images) >= 5:
        score += 1.5
    if content.policies.get("cancellation"):
        score += 1
    if content.coordinates.get("lat"):
        score += 0.5
    if content.contact.get("phone"):
        score += 0.5
    if content.star_rating > 0:
        score += 0.5
    if len(content.name) >= 3:  # multilingual
        score += 1.5

    return round((score / total) * 100, 1)


# --- Handlers ---

class CreateContentReq(BaseModel):
    property_id: str
    tenant_id: str
    name: dict
    description: dict = Field(default_factory=dict)
    short_description: dict = Field(default_factory=dict)
    property_type: str = ""
    country: str = ""
    city: str = ""
    star_rating: float = 0
    coordinates: dict = Field(default_factory=dict)
    contact: dict = Field(default_factory=dict)


@app.post("/api/v1/content", status_code=201)
async def create_content(req: CreateContentReq):
    content = PropertyContent(
        property_id=req.property_id,
        tenant_id=req.tenant_id,
        name=req.name,
        description=req.description,
        short_description=req.short_description,
        property_type=req.property_type,
        country=req.country,
        city=req.city,
        star_rating=req.star_rating,
        coordinates=req.coordinates,
        contact=req.contact,
    )
    content.completeness_score = calculate_completeness(content)
    content_store[content.id] = content
    return {"content": content.model_dump(), "completeness": content.completeness_score}


@app.get("/api/v1/content/{content_id}")
async def get_content(content_id: str, lang: str = "en"):
    content = content_store.get(content_id)
    if not content:
        raise HTTPException(404, "Content not found")

    result = content.model_dump()
    # Return localized fields
    result["_localized"] = {
        "name": content.name.get(lang, content.name.get("en", "")),
        "description": content.description.get(lang, content.description.get("en", "")),
        "short_description": content.short_description.get(lang, content.short_description.get("en", "")),
    }
    return {"content": result}


@app.put("/api/v1/content/{content_id}/descriptions")
async def update_descriptions(content_id: str, descriptions: dict):
    content = content_store.get(content_id)
    if not content:
        raise HTTPException(404, "Content not found")

    for lang, text in descriptions.items():
        if lang in SUPPORTED_LANGUAGES:
            content.description[lang] = text

    content.updated_at = datetime.utcnow().isoformat()
    content.completeness_score = calculate_completeness(content)
    return {"message": f"Updated descriptions in {len(descriptions)} languages", "completeness": content.completeness_score}


@app.post("/api/v1/content/{content_id}/images")
async def add_images(content_id: str, images: list[ImageEntry]):
    content = content_store.get(content_id)
    if not content:
        raise HTTPException(404, "Content not found")

    for img in images:
        content.images.append(img.model_dump())

    content.updated_at = datetime.utcnow().isoformat()
    content.completeness_score = calculate_completeness(content)
    return {"message": f"Added {len(images)} images", "total_images": len(content.images)}


@app.put("/api/v1/content/{content_id}/amenities")
async def update_amenities(content_id: str, amenities: list[str]):
    content = content_store.get(content_id)
    if not content:
        raise HTTPException(404, "Content not found")

    # Validate amenities against categories
    valid = set()
    for cat_amenities in AMENITY_CATEGORIES.values():
        valid.update(cat_amenities)

    validated = [a for a in amenities if a in valid]
    content.amenities = validated
    content.updated_at = datetime.utcnow().isoformat()
    content.completeness_score = calculate_completeness(content)
    return {"amenities": validated, "total": len(validated)}


@app.put("/api/v1/content/{content_id}/policies")
async def update_policies(content_id: str, policies: dict):
    content = content_store.get(content_id)
    if not content:
        raise HTTPException(404, "Content not found")

    for key, value in policies.items():
        if key in PROPERTY_POLICIES:
            content.policies[key] = value

    content.updated_at = datetime.utcnow().isoformat()
    content.completeness_score = calculate_completeness(content)
    return {"policies": content.policies, "completeness": content.completeness_score}


@app.get("/api/v1/content/search")
async def search_content(
    q: str = "",
    country: str = "",
    property_type: str = "",
    min_stars: float = 0,
    lang: str = "en",
    page: int = 1,
    page_size: int = 20,
):
    # In production: OpenSearch full-text query
    results = []
    for content in content_store.values():
        if country and content.country != country:
            continue
        if property_type and content.property_type != property_type:
            continue
        if min_stars and content.star_rating < min_stars:
            continue
        if q:
            name = content.name.get(lang, content.name.get("en", "")).lower()
            desc = content.description.get(lang, content.description.get("en", "")).lower()
            if q.lower() not in name and q.lower() not in desc:
                continue
        results.append(content.model_dump())

    start = (page - 1) * page_size
    end = start + page_size
    return {"results": results[start:end], "total": len(results), "page": page}


@app.get("/api/v1/content/languages")
async def get_languages():
    return {
        "supported": SUPPORTED_LANGUAGES,
        "total": len(SUPPORTED_LANGUAGES),
        "regions": {
            "east_africa": ["sw", "am", "so", "rw"],
            "west_africa": ["ha", "yo", "ig", "wo"],
            "southern_africa": ["zu", "af"],
            "north_africa": ["ar", "fr"],
            "international": ["en", "fr", "pt"],
        }
    }


@app.get("/api/v1/content/amenities")
async def get_amenity_catalog():
    return {"categories": AMENITY_CATEGORIES, "total": sum(len(v) for v in AMENITY_CATEGORIES.values())}


@app.get("/api/v1/content/completeness")
async def get_completeness_report(tenant_id: str = ""):
    contents = list(content_store.values())
    if tenant_id:
        contents = [c for c in contents if c.tenant_id == tenant_id]

    if not contents:
        return {"avg_completeness": 0, "total_properties": 0, "published": 0, "draft": 0}

    avg = sum(c.completeness_score for c in contents) / len(contents)
    published = sum(1 for c in contents if c.published)
    return {
        "avg_completeness": round(avg, 1),
        "total_properties": len(contents),
        "published": published,
        "draft": len(contents) - published,
        "below_threshold": sum(1 for c in contents if c.completeness_score < 60),
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "gds-content-mgmt",
        "version": "1.0.0",
        "middleware": {
            "postgres": os.getenv("DATABASE_URL", ""),
            "opensearch": os.getenv("OPENSEARCH_URL", ""),
            "redis": os.getenv("REDIS_URL", ""),
            "kafka": os.getenv("KAFKA_BROKERS", ""),
            "lakehouse": os.getenv("LAKEHOUSE_URL", ""),
        },
        "supported_languages": len(SUPPORTED_LANGUAGES),
        "amenity_categories": len(AMENITY_CATEGORIES),
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8085"))
    uvicorn.run(app, host="0.0.0.0", port=port)
