"""
Carbon Credit Integration Service (4.6)

Calculates carbon footprint per trip, offers one-tap offset purchases
from verified African carbon credit projects, and tracks impact.

Middleware integration: Kafka (offset events), OpenSearch (credit registry),
Lakehouse (impact analytics), Redis (offset price cache).
"""
import os
import secrets
from datetime import datetime

import db as database
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends, Header
from pydantic import BaseModel, Field

app = FastAPI(title="Carbon Credits Service", version="1.0.0")

# ─── Models ────────────────────────────────────────────────────────────────────

class CarbonFootprint(BaseModel):
    trip_id: str
    user_id: str
    total_kg_co2: float
    breakdown: dict  # {"flights": 450.0, "transport": 30.0, "accommodation": 20.0}
    offset_cost_usd: float
    offset_credits_needed: float
    calculated_at: str

class CarbonProject(BaseModel):
    id: str
    name: str
    country: str
    type: str  # "reforestation", "clean_energy", "cookstove", "mangrove"
    price_per_tonne_usd: float
    verified_standard: str  # "verra", "gold_standard", "plan_vivo"
    tonnes_available: float
    description: str
    impact_score: float = Field(ge=0, le=10)

class OffsetPurchase(BaseModel):
    id: str
    user_id: str
    trip_id: Optional[str]
    project_id: str
    tonnes_offset: float
    cost_usd: float
    certificate_url: Optional[str]
    status: str  # "pending", "confirmed", "retired"
    purchased_at: str

class UserImpact(BaseModel):
    user_id: str
    total_tonnes_offset: float
    total_spent_usd: float
    trips_offset: int
    projects_supported: int
    equivalent_trees: int
    equivalent_car_km_avoided: float
    badge: str  # "none", "bronze", "silver", "gold", "platinum"

# ─── Data ──────────────────────────────────────────────────────────────────────

CARBON_PROJECTS: list[CarbonProject] = [
    CarbonProject(
        id="proj_kenya_forest",
        name="Kasigau Corridor REDD+",
        country="Kenya",
        type="reforestation",
        price_per_tonne_usd=15.50,
        verified_standard="verra",
        tonnes_available=250000,
        description="Protecting 200,000 hectares of dryland forest between Tsavo East and Tsavo West National Parks",
        impact_score=9.2,
    ),
    CarbonProject(
        id="proj_ghana_cookstove",
        name="Ghana Clean Cookstoves",
        country="Ghana",
        type="cookstove",
        price_per_tonne_usd=12.00,
        verified_standard="gold_standard",
        tonnes_available=80000,
        description="Distributing fuel-efficient cookstoves to 50,000 rural households",
        impact_score=8.5,
    ),
    CarbonProject(
        id="proj_tanzania_wind",
        name="Singida Wind Farm",
        country="Tanzania",
        type="clean_energy",
        price_per_tonne_usd=18.00,
        verified_standard="verra",
        tonnes_available=150000,
        description="100MW wind farm providing clean electricity to 400,000 homes",
        impact_score=8.8,
    ),
    CarbonProject(
        id="proj_mozambique_mangrove",
        name="Sofala Mangrove Restoration",
        country="Mozambique",
        type="mangrove",
        price_per_tonne_usd=22.00,
        verified_standard="plan_vivo",
        tonnes_available=45000,
        description="Restoring 5,000 hectares of coastal mangrove forests for blue carbon",
        impact_score=9.5,
    ),
    CarbonProject(
        id="proj_sa_solar",
        name="Northern Cape Solar",
        country="South Africa",
        type="clean_energy",
        price_per_tonne_usd=14.00,
        verified_standard="gold_standard",
        tonnes_available=300000,
        description="200MW concentrated solar power in the Northern Cape karoo",
        impact_score=8.0,
    ),
]

# In-memory stores
offset_purchases: dict[str, OffsetPurchase] = {}

# ─── Auth ──────────────────────────────────────────────────────────────────────

async def verify_auth(authorization: Optional[str] = Header(None)):
    api_key = os.environ.get("INTERNAL_API_KEY", "dev-key")
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization")
    token = authorization.replace("Bearer ", "")
    if token != api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")

# ─── Carbon Calculation ────────────────────────────────────────────────────────

EMISSION_FACTORS = {
    "flight_short": 0.255,   # kg CO2 per km (< 1500km)
    "flight_medium": 0.195,  # 1500-4000km
    "flight_long": 0.150,    # > 4000km
    "car": 0.171,            # per km
    "bus": 0.089,            # per km
    "train": 0.041,          # per km
    "hotel_night": 21.3,     # per night (average)
    "safari_day": 45.0,      # per day (vehicle + camp)
    "boat": 0.120,           # per km
}

def calculate_footprint(
    flight_km: float = 0,
    car_km: float = 0,
    bus_km: float = 0,
    hotel_nights: int = 0,
    safari_days: int = 0,
    activities: int = 0,
) -> dict:
    breakdown = {}
    
    if flight_km > 0:
        if flight_km < 1500:
            breakdown["flights"] = flight_km * EMISSION_FACTORS["flight_short"]
        elif flight_km < 4000:
            breakdown["flights"] = flight_km * EMISSION_FACTORS["flight_medium"]
        else:
            breakdown["flights"] = flight_km * EMISSION_FACTORS["flight_long"]
    
    if car_km > 0:
        breakdown["ground_transport"] = car_km * EMISSION_FACTORS["car"]
    if bus_km > 0:
        breakdown["ground_transport"] = breakdown.get("ground_transport", 0) + bus_km * EMISSION_FACTORS["bus"]
    if hotel_nights > 0:
        breakdown["accommodation"] = hotel_nights * EMISSION_FACTORS["hotel_night"]
    if safari_days > 0:
        breakdown["activities"] = safari_days * EMISSION_FACTORS["safari_day"]
    if activities > 0:
        breakdown["activities"] = breakdown.get("activities", 0) + activities * 5.0
    
    return breakdown

# ─── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "carbon-credits", "timestamp": datetime.utcnow().isoformat()}

@app.post("/calculate", response_model=CarbonFootprint)
async def calculate_carbon(
    trip_id: str,
    user_id: str,
    flight_km: float = 0,
    car_km: float = 0,
    bus_km: float = 0,
    hotel_nights: int = 0,
    safari_days: int = 0,
    activities: int = 0,
    _auth=Depends(verify_auth),
):
    breakdown = calculate_footprint(flight_km, car_km, bus_km, hotel_nights, safari_days, activities)
    total = sum(breakdown.values())
    tonnes = total / 1000
    
    avg_price = sum(p.price_per_tonne_usd for p in CARBON_PROJECTS) / len(CARBON_PROJECTS)
    
    return CarbonFootprint(
        trip_id=trip_id,
        user_id=user_id,
        total_kg_co2=round(total, 2),
        breakdown={k: round(v, 2) for k, v in breakdown.items()},
        offset_cost_usd=round(tonnes * avg_price, 2),
        offset_credits_needed=round(tonnes, 4),
        calculated_at=datetime.utcnow().isoformat(),
    )

@app.get("/projects", response_model=list[CarbonProject])
async def list_projects(country: Optional[str] = None, type: Optional[str] = None):
    projects = CARBON_PROJECTS
    if country:
        projects = [p for p in projects if p.country.lower() == country.lower()]
    if type:
        projects = [p for p in projects if p.type == type]
    return projects

@app.post("/offset", response_model=OffsetPurchase)
async def purchase_offset(
    user_id: str,
    project_id: str,
    tonnes: float = Field(gt=0),
    trip_id: Optional[str] = None,
    _auth=Depends(verify_auth),
):
    project = next((p for p in CARBON_PROJECTS if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if tonnes > project.tonnes_available:
        raise HTTPException(status_code=400, detail="Insufficient credits available")
    
    cost = tonnes * project.price_per_tonne_usd
    purchase_id = f"offset_{secrets.token_hex(8)}"
    
    purchase = OffsetPurchase(
        id=purchase_id,
        user_id=user_id,
        trip_id=trip_id,
        project_id=project_id,
        tonnes_offset=tonnes,
        cost_usd=round(cost, 2),
        certificate_url=None,
        status="confirmed",
        purchased_at=datetime.utcnow().isoformat(),
    )
    offset_purchases[purchase_id] = purchase

    # Persist to PostgreSQL
    await database.execute(
        "INSERT INTO carbon_credit_purchases (user_id, project_id, tonnes, price_per_tonne, total_cost, currency, status) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        user_id, project_id, tonnes, project.price_per_tonne_usd, cost, "USD", "confirmed",
    )

    return purchase

@app.get("/impact/{user_id}", response_model=UserImpact)
async def get_user_impact(user_id: str, _auth=Depends(verify_auth)):
    user_offsets = [o for o in offset_purchases.values() if o.user_id == user_id]
    
    total_tonnes = sum(o.tonnes_offset for o in user_offsets)
    total_spent = sum(o.cost_usd for o in user_offsets)
    trips = len(set(o.trip_id for o in user_offsets if o.trip_id))
    projects = len(set(o.project_id for o in user_offsets))
    
    # Badge calculation
    if total_tonnes >= 100:
        badge = "platinum"
    elif total_tonnes >= 50:
        badge = "gold"
    elif total_tonnes >= 20:
        badge = "silver"
    elif total_tonnes >= 5:
        badge = "bronze"
    else:
        badge = "none"
    
    return UserImpact(
        user_id=user_id,
        total_tonnes_offset=round(total_tonnes, 4),
        total_spent_usd=round(total_spent, 2),
        trips_offset=trips,
        projects_supported=projects,
        equivalent_trees=int(total_tonnes * 45),  # ~45 trees per tonne
        equivalent_car_km_avoided=round(total_tonnes * 1000 / 0.171, 0),
        badge=badge,
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8011)
