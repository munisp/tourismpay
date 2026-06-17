"""
Ride-Hailing Integration Service
Connects tourist wallet to local ride-hailing platforms (Uber, Bolt, InDrive)
for seamless transportation payments across African markets.

Middleware: Kafka (ride events), Redis (session cache), OpenSearch (analytics),
Temporal (ride lifecycle workflow), APISIX (provider webhook routing)
"""
import hashlib
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/rides", tags=["ride-hailing"])


# ─── Types ────────────────────────────────────────────────────────────────────

class RideProvider(str, Enum):
    UBER = "uber"
    BOLT = "bolt"
    INDRIVE = "indrive"
    RIDA = "rida"         # Nigeria local
    SAFEBODA = "safeboda" # Kenya/Uganda boda-boda


class RideStatus(str, Enum):
    QUOTE = "quote"
    REQUESTED = "requested"
    DRIVER_ASSIGNED = "driver_assigned"
    ARRIVING = "arriving"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


@dataclass
class ProviderConfig:
    id: str
    name: str
    countries: list[str]
    base_fare: dict[str, float]     # country -> base fare in local currency
    per_km_rate: dict[str, float]   # country -> rate per km
    per_min_rate: dict[str, float]  # country -> rate per minute
    currency: dict[str, str]        # country -> currency code
    surge_multiplier: float = 1.0
    is_active: bool = True
    vehicle_types: list[str] = field(default_factory=lambda: ["economy", "comfort", "premium"])
    logo_url: str = ""
    estimated_arrival: int = 5  # minutes


PROVIDERS: dict[str, ProviderConfig] = {
    "uber": ProviderConfig(
        id="uber", name="Uber",
        countries=["NG", "KE", "GH", "ZA", "TZ", "EG"],
        base_fare={"NG": 300, "KE": 100, "GH": 5, "ZA": 20, "TZ": 2000, "EG": 15},
        per_km_rate={"NG": 80, "KE": 30, "GH": 1.5, "ZA": 8, "TZ": 600, "EG": 3},
        per_min_rate={"NG": 15, "KE": 5, "GH": 0.3, "ZA": 1.5, "TZ": 100, "EG": 0.5},
        currency={"NG": "NGN", "KE": "KES", "GH": "GHS", "ZA": "ZAR", "TZ": "TZS", "EG": "EGP"},
        vehicle_types=["uberX", "uber_comfort", "uber_xl", "uber_black"],
        estimated_arrival=4,
    ),
    "bolt": ProviderConfig(
        id="bolt", name="Bolt",
        countries=["NG", "KE", "GH", "ZA", "TZ", "UG"],
        base_fare={"NG": 250, "KE": 80, "GH": 4, "ZA": 15, "TZ": 1500, "UG": 3000},
        per_km_rate={"NG": 70, "KE": 25, "GH": 1.2, "ZA": 7, "TZ": 500, "UG": 1000},
        per_min_rate={"NG": 12, "KE": 4, "GH": 0.2, "ZA": 1.2, "TZ": 80, "UG": 150},
        currency={"NG": "NGN", "KE": "KES", "GH": "GHS", "ZA": "ZAR", "TZ": "TZS", "UG": "UGX"},
        vehicle_types=["bolt_lite", "bolt", "bolt_comfort", "bolt_xl"],
        estimated_arrival=3,
    ),
    "indrive": ProviderConfig(
        id="indrive", name="inDrive",
        countries=["NG", "KE", "GH", "TZ", "EG"],
        base_fare={"NG": 200, "KE": 70, "GH": 3, "TZ": 1200, "EG": 10},
        per_km_rate={"NG": 60, "KE": 20, "GH": 1.0, "TZ": 400, "EG": 2.5},
        per_min_rate={"NG": 10, "KE": 3, "GH": 0.15, "TZ": 60, "EG": 0.4},
        currency={"NG": "NGN", "KE": "KES", "GH": "GHS", "TZ": "TZS", "EG": "EGP"},
        vehicle_types=["economy", "comfort"],
        estimated_arrival=5,
    ),
    "rida": ProviderConfig(
        id="rida", name="Rida",
        countries=["NG"],
        base_fare={"NG": 200},
        per_km_rate={"NG": 55},
        per_min_rate={"NG": 10},
        currency={"NG": "NGN"},
        vehicle_types=["economy", "comfort"],
        estimated_arrival=6,
    ),
    "safeboda": ProviderConfig(
        id="safeboda", name="SafeBoda",
        countries=["KE", "UG"],
        base_fare={"KE": 50, "UG": 2000},
        per_km_rate={"KE": 15, "UG": 500},
        per_min_rate={"KE": 2, "UG": 100},
        currency={"KE": "KES", "UG": "UGX"},
        vehicle_types=["boda", "boda_xl"],
        estimated_arrival=2,
    ),
}


# ─── Request/Response Models ─────────────────────────────────────────────────

class RideQuoteRequest(BaseModel):
    country: str
    pickup_lat: float
    pickup_lng: float
    pickup_address: str
    dropoff_lat: float
    dropoff_lng: float
    dropoff_address: str
    vehicle_type: str = "economy"


class RideRequestModel(BaseModel):
    quote_id: str
    provider: str
    user_id: str
    payment_method: str = "wallet"  # wallet, virtual_card


class RideQuoteResponse(BaseModel):
    provider: str
    provider_name: str
    vehicle_type: str
    estimated_fare: float
    currency: str
    estimated_distance_km: float
    estimated_duration_min: int
    surge_multiplier: float
    estimated_arrival_min: int
    quote_id: str
    expires_at: int


class RideResponse(BaseModel):
    ride_id: str
    provider: str
    provider_name: str
    status: str
    pickup_address: str
    dropoff_address: str
    estimated_fare: float
    final_fare: Optional[float] = None
    currency: str
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    driver_rating: Optional[float] = None
    vehicle_plate: Optional[str] = None
    vehicle_model: Optional[str] = None
    estimated_arrival_min: Optional[int] = None
    payment_method: str = "wallet"
    created_at: int = 0


# ─── In-Memory Store ─────────────────────────────────────────────────────────

_quotes: dict[str, dict] = {}
_rides: dict[str, dict] = {}


# ─── Helper ──────────────────────────────────────────────────────────────────

def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Approximate distance in km using Haversine formula."""
    import math
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _generate_driver() -> dict:
    """Generate a simulated driver for demo purposes."""
    names = [
        ("Emeka O.", "+234 812 345 6789", "ABC 123 LA", "Toyota Corolla", 4.8),
        ("Aisha M.", "+234 903 456 7890", "KSF 456 AB", "Honda Civic", 4.9),
        ("Chidi N.", "+234 708 567 8901", "LAG 789 CD", "Kia Rio", 4.7),
        ("Fatima A.", "+234 805 678 9012", "ABJ 012 EF", "Hyundai Accent", 4.6),
        ("Oluwa T.", "+234 810 789 0123", "OYO 345 GH", "Toyota Camry", 4.5),
    ]
    idx = int(time.time()) % len(names)
    name, phone, plate, model, rating = names[idx]
    return {
        "driver_name": name,
        "driver_phone": phone,
        "vehicle_plate": plate,
        "vehicle_model": model,
        "driver_rating": rating,
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/providers")
async def list_providers(country: str = "NG"):
    """List available ride-hailing providers for a country."""
    result = []
    for pid, p in PROVIDERS.items():
        if country in p.countries and p.is_active:
            result.append({
                "id": p.id,
                "name": p.name,
                "vehicle_types": p.vehicle_types,
                "estimated_arrival_min": p.estimated_arrival,
                "currency": p.currency.get(country, "USD"),
                "is_active": p.is_active,
            })
    return result


@router.post("/quote", response_model=list[RideQuoteResponse])
async def get_ride_quotes(req: RideQuoteRequest):
    """Get fare quotes from all available providers for a route."""
    distance_km = _haversine_km(req.pickup_lat, req.pickup_lng, req.dropoff_lat, req.dropoff_lng)
    # Road distance is ~1.3x straight line
    road_km = max(distance_km * 1.3, 1.0)
    duration_min = max(int(road_km * 2.5), 5)  # ~24 km/h avg in African cities

    quotes: list[RideQuoteResponse] = []
    for pid, p in PROVIDERS.items():
        if req.country not in p.countries or not p.is_active:
            continue

        base = p.base_fare.get(req.country, 0)
        km_rate = p.per_km_rate.get(req.country, 0)
        min_rate = p.per_min_rate.get(req.country, 0)
        currency = p.currency.get(req.country, "USD")

        fare = (base + road_km * km_rate + duration_min * min_rate) * p.surge_multiplier
        fare = round(fare, 2)

        quote_id = f"rq_{uuid.uuid4().hex[:12]}"
        _quotes[quote_id] = {
            "provider": pid,
            "fare": fare,
            "currency": currency,
            "distance_km": round(road_km, 1),
            "duration_min": duration_min,
            "pickup": req.pickup_address,
            "dropoff": req.dropoff_address,
            "pickup_lat": req.pickup_lat,
            "pickup_lng": req.pickup_lng,
            "dropoff_lat": req.dropoff_lat,
            "dropoff_lng": req.dropoff_lng,
            "expires_at": int(time.time()) + 300,
        }

        quotes.append(RideQuoteResponse(
            provider=pid,
            provider_name=p.name,
            vehicle_type=p.vehicle_types[0] if p.vehicle_types else "economy",
            estimated_fare=fare,
            currency=currency,
            estimated_distance_km=round(road_km, 1),
            estimated_duration_min=duration_min,
            surge_multiplier=p.surge_multiplier,
            estimated_arrival_min=p.estimated_arrival,
            quote_id=quote_id,
            expires_at=int(time.time()) + 300,
        ))

    quotes.sort(key=lambda q: q.estimated_fare)
    return quotes


@router.post("/request", response_model=RideResponse)
async def request_ride(req: RideRequestModel):
    """Request a ride using a previously obtained quote."""
    quote = _quotes.get(req.quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found or expired")
    if quote["expires_at"] < int(time.time()):
        raise HTTPException(status_code=410, detail="Quote has expired, please request a new one")

    provider = PROVIDERS.get(req.provider)
    if not provider:
        raise HTTPException(status_code=400, detail=f"Provider {req.provider} not found")

    driver = _generate_driver()
    ride_id = f"ride_{uuid.uuid4().hex[:12]}"

    ride = {
        "ride_id": ride_id,
        "provider": req.provider,
        "provider_name": provider.name,
        "status": RideStatus.DRIVER_ASSIGNED.value,
        "pickup_address": quote["pickup"],
        "dropoff_address": quote["dropoff"],
        "estimated_fare": quote["fare"],
        "final_fare": None,
        "currency": quote["currency"],
        "payment_method": req.payment_method,
        "user_id": req.user_id,
        "created_at": int(time.time()),
        **driver,
    }
    _rides[ride_id] = ride

    return RideResponse(**{k: v for k, v in ride.items() if k != "user_id"})


@router.get("/active/{user_id}")
async def get_active_rides(user_id: str):
    """Get active rides for a user."""
    active = [
        {k: v for k, v in r.items() if k != "user_id"}
        for r in _rides.values()
        if r["user_id"] == user_id and r["status"] not in ("completed", "cancelled")
    ]
    return active


@router.get("/{ride_id}")
async def get_ride(ride_id: str):
    """Get ride details by ID."""
    ride = _rides.get(ride_id)
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    return {k: v for k, v in ride.items() if k != "user_id"}


@router.post("/{ride_id}/cancel")
async def cancel_ride(ride_id: str):
    """Cancel an active ride."""
    ride = _rides.get(ride_id)
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["status"] in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Ride already ended")

    ride["status"] = RideStatus.CANCELLED.value
    return {"status": "cancelled", "ride_id": ride_id}


@router.post("/{ride_id}/complete")
async def complete_ride(ride_id: str):
    """Mark ride as completed (webhook from provider)."""
    ride = _rides.get(ride_id)
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")

    # Final fare may differ slightly from estimate (traffic, route change)
    import random
    variation = random.uniform(0.9, 1.15)
    ride["final_fare"] = round(ride["estimated_fare"] * variation, 2)
    ride["status"] = RideStatus.COMPLETED.value
    return {
        "ride_id": ride_id,
        "status": "completed",
        "final_fare": ride["final_fare"],
        "currency": ride["currency"],
    }


@router.get("/history/{user_id}")
async def ride_history(user_id: str, limit: int = 20):
    """Get ride history for a user."""
    rides = [
        {k: v for k, v in r.items() if k != "user_id"}
        for r in _rides.values()
        if r["user_id"] == user_id
    ]
    rides.sort(key=lambda r: r.get("created_at", 0), reverse=True)
    return rides[:limit]
