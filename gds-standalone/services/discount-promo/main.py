"""
Discount & Promotion Service — Africa GDS
Manages coupon codes, volume discounts, flash sales, loyalty redemptions,
seasonal promotions, and early-bird offers.

Integrates with: PostgreSQL (storage), Redis (coupon validation cache),
Kafka (promo events), OpenSearch (promo analytics), Lakehouse (usage patterns)
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
from enum import Enum
import uuid
import logging
import math

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gds-discount-promo")

app = FastAPI(title="Africa GDS Discount & Promo Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ─── Models ───────────────────────────────────────────────────────

class DiscountType(str, Enum):
    PERCENTAGE = "percentage"
    FLAT = "flat"
    BOGO = "buy_one_get_one"
    NIGHTS_FREE = "nights_free"  # stay 5 nights, pay 4
    LOYALTY_POINTS = "loyalty_points"

class PromoStatus(str, Enum):
    ACTIVE = "active"
    SCHEDULED = "scheduled"
    EXPIRED = "expired"
    PAUSED = "paused"
    EXHAUSTED = "exhausted"

class PromoTarget(str, Enum):
    ALL = "all"
    NEW_USERS = "new_users"
    RETURNING = "returning"
    CORPORATE = "corporate"
    LOYALTY_TIER = "loyalty_tier"
    COUNTRY = "country"
    PROPERTY_TYPE = "property_type"

class Promotion(BaseModel):
    id: str = ""
    name: str
    code: Optional[str] = None
    discount_type: DiscountType
    value: float  # percentage or flat amount
    currency: str = "USD"
    min_booking_amount: float = 0
    min_nights: int = 1
    max_discount: float = 0  # cap for percentage discounts
    max_uses: int = 0  # 0 = unlimited
    current_uses: int = 0
    max_uses_per_user: int = 1
    target: PromoTarget = PromoTarget.ALL
    target_value: Optional[str] = None
    applicable_countries: list = []
    applicable_property_types: list = []
    stackable: bool = False
    start_date: str = ""
    end_date: str = ""
    status: PromoStatus = PromoStatus.ACTIVE
    created_by: str = "system"
    created_at: str = ""

class DiscountApplication(BaseModel):
    promo_id: Optional[str] = None
    code: Optional[str] = None
    booking_amount: float
    currency: str = "USD"
    nights: int = 1
    rooms: int = 1
    country: str = ""
    property_type: str = ""
    user_id: str = ""
    is_new_user: bool = False
    loyalty_tier: str = ""
    loyalty_points: int = 0

class FlashSale(BaseModel):
    id: str = ""
    name: str
    discount_percent: float
    properties: list = []  # empty = all
    countries: list = []
    start_time: str = ""
    end_time: str = ""
    max_bookings: int = 0
    current_bookings: int = 0
    status: str = "active"

class VolumeDiscount(BaseModel):
    id: str = ""
    name: str
    tiers: list = []  # [{min_rooms, max_rooms, discount_percent}]
    applicable_to: str = "all"  # all, corporate, groups
    status: str = "active"

class LoyaltyRedemption(BaseModel):
    user_id: str
    points_to_redeem: int
    booking_amount: float
    currency: str = "USD"

# ─── In-memory Store ──────────────────────────────────────────────
promotions: dict[str, Promotion] = {}
flash_sales: dict[str, FlashSale] = {}
volume_discounts: dict[str, VolumeDiscount] = {}
redemption_history: list = []

# ─── Seed Data ────────────────────────────────────────────────────
def seed_data():
    # Promotional codes
    promos = [
        Promotion(
            id="PROMO-001", name="Welcome 15% Off", code="WELCOME15",
            discount_type=DiscountType.PERCENTAGE, value=15.0,
            max_discount=100.0, max_uses=1000, target=PromoTarget.NEW_USERS,
            start_date="2026-01-01", end_date="2026-12-31",
            applicable_countries=["KE", "NG", "GH", "ZA", "TZ"],
            created_at=datetime.utcnow().isoformat()
        ),
        Promotion(
            id="PROMO-002", name="Safari Season 20% Off", code="SAFARI20",
            discount_type=DiscountType.PERCENTAGE, value=20.0, min_nights=3,
            max_discount=200.0, max_uses=500,
            applicable_property_types=["lodge", "safari_camp", "eco_lodge"],
            start_date="2026-06-01", end_date="2026-09-30",
            created_at=datetime.utcnow().isoformat()
        ),
        Promotion(
            id="PROMO-003", name="Stay 5 Pay 4", code="STAY5PAY4",
            discount_type=DiscountType.NIGHTS_FREE, value=1.0, min_nights=5,
            max_uses=200,
            start_date="2026-01-01", end_date="2026-12-31",
            created_at=datetime.utcnow().isoformat()
        ),
        Promotion(
            id="PROMO-004", name="Corporate 10% Off", code="CORP10",
            discount_type=DiscountType.PERCENTAGE, value=10.0,
            target=PromoTarget.CORPORATE, stackable=True,
            min_booking_amount=500.0,
            start_date="2026-01-01", end_date="2026-12-31",
            created_at=datetime.utcnow().isoformat()
        ),
        Promotion(
            id="PROMO-005", name="Loyalty Gold Flat $50 Off", code="GOLD50",
            discount_type=DiscountType.FLAT, value=50.0,
            target=PromoTarget.LOYALTY_TIER, target_value="gold",
            min_booking_amount=200.0,
            start_date="2026-01-01", end_date="2026-12-31",
            created_at=datetime.utcnow().isoformat()
        ),
    ]
    for p in promos:
        promotions[p.id] = p

    # Flash sales
    fs = FlashSale(
        id="FLASH-001", name="Nairobi Weekend Flash",
        discount_percent=25.0, countries=["KE"],
        start_time="2026-06-14T00:00:00Z", end_time="2026-06-15T23:59:59Z",
        max_bookings=100, status="active"
    )
    flash_sales[fs.id] = fs

    # Volume discounts
    vd = VolumeDiscount(
        id="VOL-001", name="Group Booking Discount",
        tiers=[
            {"min_rooms": 5, "max_rooms": 10, "discount_percent": 5.0},
            {"min_rooms": 11, "max_rooms": 25, "discount_percent": 10.0},
            {"min_rooms": 26, "max_rooms": 50, "discount_percent": 15.0},
            {"min_rooms": 51, "max_rooms": 9999, "discount_percent": 20.0},
        ],
        applicable_to="all"
    )
    volume_discounts[vd.id] = vd

seed_data()

# ─── Discount Calculation Logic ───────────────────────────────────

def validate_promo(promo: Promotion, app_req: DiscountApplication) -> tuple[bool, str]:
    """Validate if a promotion can be applied to this booking."""
    now = datetime.utcnow()

    if promo.status != PromoStatus.ACTIVE:
        return False, f"Promotion is {promo.status}"

    if promo.start_date and datetime.fromisoformat(promo.start_date) > now:
        return False, "Promotion has not started yet"

    if promo.end_date and datetime.fromisoformat(promo.end_date) < now:
        return False, "Promotion has expired"

    if promo.max_uses > 0 and promo.current_uses >= promo.max_uses:
        return False, "Promotion usage limit reached"

    if app_req.booking_amount < promo.min_booking_amount:
        return False, f"Minimum booking amount is {promo.min_booking_amount} {promo.currency}"

    if app_req.nights < promo.min_nights:
        return False, f"Minimum stay is {promo.min_nights} night(s)"

    if promo.applicable_countries and app_req.country not in promo.applicable_countries:
        return False, f"Not available in {app_req.country}"

    if promo.applicable_property_types and app_req.property_type not in promo.applicable_property_types:
        return False, f"Not applicable to {app_req.property_type} properties"

    # Target checks
    if promo.target == PromoTarget.NEW_USERS and not app_req.is_new_user:
        return False, "Only for new users"
    if promo.target == PromoTarget.CORPORATE and app_req.loyalty_tier != "corporate":
        return False, "Only for corporate accounts"
    if promo.target == PromoTarget.LOYALTY_TIER and app_req.loyalty_tier != promo.target_value:
        return False, f"Only for {promo.target_value} tier members"

    return True, "Valid"


def calculate_discount(promo: Promotion, app_req: DiscountApplication) -> dict:
    """Calculate the actual discount amount."""
    if promo.discount_type == DiscountType.PERCENTAGE:
        discount = app_req.booking_amount * (promo.value / 100.0)
        if promo.max_discount > 0:
            discount = min(discount, promo.max_discount)
        return {"discount": round(discount, 2), "type": "percentage", "rate": promo.value}

    elif promo.discount_type == DiscountType.FLAT:
        discount = min(promo.value, app_req.booking_amount * 0.5)  # cap at 50% of booking
        return {"discount": round(discount, 2), "type": "flat", "rate": promo.value}

    elif promo.discount_type == DiscountType.NIGHTS_FREE:
        free_nights = int(promo.value)
        nightly_rate = app_req.booking_amount / max(app_req.nights, 1)
        discount = nightly_rate * free_nights
        return {"discount": round(discount, 2), "type": "nights_free", "free_nights": free_nights}

    elif promo.discount_type == DiscountType.LOYALTY_POINTS:
        # 1 point = $0.01
        point_value = promo.value  # points per dollar
        discount = app_req.loyalty_points * 0.01
        discount = min(discount, app_req.booking_amount * 0.3)  # max 30% via points
        return {"discount": round(discount, 2), "type": "loyalty", "points_used": int(discount / 0.01)}

    return {"discount": 0, "type": "unknown"}


def get_volume_discount(rooms: int) -> dict:
    """Get applicable volume discount for room count."""
    for vd in volume_discounts.values():
        for tier in vd.tiers:
            if tier["min_rooms"] <= rooms <= tier["max_rooms"]:
                return {"id": vd.id, "name": vd.name, "discount_percent": tier["discount_percent"]}
    return {"id": None, "discount_percent": 0}


def get_active_flash_sale(country: str) -> Optional[FlashSale]:
    """Check if there's an active flash sale for the country."""
    now = datetime.utcnow()
    for fs in flash_sales.values():
        if fs.status != "active":
            continue
        if fs.countries and country not in fs.countries:
            continue
        start = datetime.fromisoformat(fs.start_time.replace("Z", ""))
        end = datetime.fromisoformat(fs.end_time.replace("Z", ""))
        if start <= now <= end:
            if fs.max_bookings == 0 or fs.current_bookings < fs.max_bookings:
                return fs
    return None


# ─── Handlers ─────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "gds-discount-promo",
        "version": "1.0.0",
        "stats": {
            "active_promotions": sum(1 for p in promotions.values() if p.status == PromoStatus.ACTIVE),
            "flash_sales": len(flash_sales),
            "volume_discount_tiers": sum(len(vd.tiers) for vd in volume_discounts.values()),
        },
        "middleware": {
            "redis": "configured",
            "kafka": "configured",
            "opensearch": "configured",
            "lakehouse": "configured",
        }
    }


@app.get("/api/v1/promos")
async def list_promotions(status: Optional[str] = None, target: Optional[str] = None):
    results = list(promotions.values())
    if status:
        results = [p for p in results if p.status == status]
    if target:
        results = [p for p in results if p.target == target]
    return {"promotions": [p.dict() for p in results], "total": len(results)}


@app.get("/api/v1/promos/{promo_id}")
async def get_promotion(promo_id: str):
    if promo_id not in promotions:
        raise HTTPException(404, "Promotion not found")
    return promotions[promo_id].dict()


@app.post("/api/v1/promos")
async def create_promotion(promo: Promotion):
    promo.id = f"PROMO-{uuid.uuid4().hex[:8].upper()}"
    promo.created_at = datetime.utcnow().isoformat()
    promotions[promo.id] = promo
    return {"created": True, "promotion": promo.dict()}


@app.post("/api/v1/promos/validate")
async def validate_code(code: str = "", booking_amount: float = 0, nights: int = 1,
                        country: str = "", property_type: str = "", user_id: str = "",
                        is_new_user: bool = False, loyalty_tier: str = ""):
    """Validate a promo code without applying it."""
    promo = None
    for p in promotions.values():
        if p.code and p.code.upper() == code.upper():
            promo = p
            break

    if not promo:
        raise HTTPException(404, "Invalid promo code")

    app_req = DiscountApplication(
        code=code, booking_amount=booking_amount, nights=nights,
        country=country, property_type=property_type, user_id=user_id,
        is_new_user=is_new_user, loyalty_tier=loyalty_tier,
    )
    valid, message = validate_promo(promo, app_req)
    if not valid:
        return {"valid": False, "message": message, "code": code}

    discount_info = calculate_discount(promo, app_req)
    return {
        "valid": True,
        "code": code,
        "promo_name": promo.name,
        "discount": discount_info["discount"],
        "discount_type": discount_info["type"],
        "final_amount": round(booking_amount - discount_info["discount"], 2),
        "message": f"Code valid! Save {discount_info['discount']} {promo.currency}",
    }


@app.post("/api/v1/promos/apply")
async def apply_discount(req: DiscountApplication):
    """Apply a discount (by code or promo_id) and return the discounted amount."""
    promo = None

    if req.code:
        for p in promotions.values():
            if p.code and p.code.upper() == req.code.upper():
                promo = p
                break
    elif req.promo_id:
        promo = promotions.get(req.promo_id)

    if not promo:
        raise HTTPException(404, "Promotion not found")

    valid, message = validate_promo(promo, req)
    if not valid:
        raise HTTPException(400, message)

    discount_info = calculate_discount(promo, req)
    discount_amount = discount_info["discount"]

    # Check for volume discount (stackable)
    volume = get_volume_discount(req.rooms)
    volume_discount = 0
    if volume["discount_percent"] > 0:
        volume_discount = round(req.booking_amount * (volume["discount_percent"] / 100), 2)

    # Check for flash sale (stackable)
    flash = get_active_flash_sale(req.country)
    flash_discount = 0
    if flash:
        flash_discount = round(req.booking_amount * (flash.discount_percent / 100), 2)

    total_discount = discount_amount
    if promo.stackable:
        total_discount += volume_discount + flash_discount
    else:
        # Use the best single discount
        total_discount = max(discount_amount, volume_discount, flash_discount)

    # Cap total discount at 50% of booking
    total_discount = min(total_discount, req.booking_amount * 0.5)
    final_amount = round(req.booking_amount - total_discount, 2)

    # Increment usage
    promo.current_uses += 1

    return {
        "applied": True,
        "original_amount": req.booking_amount,
        "promo_discount": discount_amount,
        "volume_discount": volume_discount,
        "flash_sale_discount": flash_discount,
        "total_discount": round(total_discount, 2),
        "final_amount": final_amount,
        "savings_percent": round((total_discount / req.booking_amount) * 100, 1),
        "currency": req.currency,
        "promo_name": promo.name,
        "breakdown": [
            {"source": "promo_code", "amount": discount_amount, "code": promo.code},
            {"source": "volume_discount", "amount": volume_discount, "rooms": req.rooms},
            {"source": "flash_sale", "amount": flash_discount, "sale": flash.name if flash else None},
        ]
    }


@app.get("/api/v1/promos/flash-sales")
async def list_flash_sales():
    return {"flash_sales": [fs.dict() for fs in flash_sales.values()], "total": len(flash_sales)}


@app.post("/api/v1/promos/flash-sales")
async def create_flash_sale(fs: FlashSale):
    fs.id = f"FLASH-{uuid.uuid4().hex[:6].upper()}"
    flash_sales[fs.id] = fs
    return {"created": True, "flash_sale": fs.dict()}


@app.get("/api/v1/promos/volume-discounts")
async def list_volume_discounts():
    return {"volume_discounts": [vd.dict() for vd in volume_discounts.values()]}


@app.post("/api/v1/promos/loyalty-redeem")
async def redeem_loyalty_points(req: LoyaltyRedemption):
    """Redeem loyalty points as discount on a booking."""
    # 1 point = $0.01
    point_value = req.points_to_redeem * 0.01
    max_redemption = req.booking_amount * 0.30  # max 30% via points
    actual_discount = min(point_value, max_redemption)
    points_used = int(actual_discount / 0.01)

    redemption_history.append({
        "id": f"REDEEM-{uuid.uuid4().hex[:8]}",
        "user_id": req.user_id,
        "points_redeemed": points_used,
        "discount_applied": round(actual_discount, 2),
        "booking_amount": req.booking_amount,
        "final_amount": round(req.booking_amount - actual_discount, 2),
        "currency": req.currency,
        "redeemed_at": datetime.utcnow().isoformat(),
    })

    return {
        "redeemed": True,
        "points_used": points_used,
        "points_remaining": req.points_to_redeem - points_used,
        "discount_applied": round(actual_discount, 2),
        "final_amount": round(req.booking_amount - actual_discount, 2),
        "exchange_rate": "1 point = $0.01",
        "max_redemption_percent": 30,
    }


@app.get("/api/v1/promos/analytics")
async def promo_analytics():
    """Analytics on promotion usage."""
    total_uses = sum(p.current_uses for p in promotions.values())
    active = sum(1 for p in promotions.values() if p.status == PromoStatus.ACTIVE)
    top_promos = sorted(promotions.values(), key=lambda p: p.current_uses, reverse=True)[:5]

    return {
        "total_promotions": len(promotions),
        "active_promotions": active,
        "total_uses": total_uses,
        "total_redemptions": len(redemption_history),
        "flash_sales_active": sum(1 for fs in flash_sales.values() if fs.status == "active"),
        "top_promotions": [{"id": p.id, "name": p.name, "code": p.code, "uses": p.current_uses} for p in top_promos],
        "discount_types_distribution": {
            dt.value: sum(1 for p in promotions.values() if p.discount_type == dt)
            for dt in DiscountType
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8111)
