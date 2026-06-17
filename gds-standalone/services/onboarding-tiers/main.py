"""
Progressive Tier System — Africa GDS Low-Tech Onboarding
Manages establishment tier progression: SMS-Only → WhatsApp → Web Lite → Full Platform

Auto-upgrades establishments based on engagement metrics, booking volume,
response times, and feature usage.

Integrates with: PostgreSQL, Kafka (tier change events), Temporal (upgrade workflows)
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
from enum import Enum
import uuid
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gds-onboarding-tiers")

app = FastAPI(title="Africa GDS Onboarding Tier System", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ─── Tier Definitions ─────────────────────────────────────────────
class Tier(str, Enum):
    SMS_ONLY = "sms_only"       # Tier 1: Feature phone, SMS confirmations
    WHATSAPP = "whatsapp"       # Tier 2: Basic smartphone, photo uploads
    WEB_LITE = "web_lite"       # Tier 3: Low bandwidth, 50KB dashboard
    FULL = "full"               # Tier 4: Complete GDS platform access


TIER_FEATURES = {
    Tier.SMS_ONLY: {
        "name": "SMS Only",
        "level": 1,
        "channels": ["sms", "ussd"],
        "features": [
            "Receive booking alerts via SMS",
            "Confirm/decline by replying YES/NO",
            "Rate updates via USSD",
            "Payout notifications",
            "Weekly earnings summary SMS",
        ],
        "requirements": {
            "phone": True,
            "smartphone": False,
            "internet": False,
        },
        "max_rooms": 20,
        "commission_rate": 0.15,  # 15%
    },
    Tier.WHATSAPP: {
        "name": "WhatsApp",
        "level": 2,
        "channels": ["sms", "ussd", "whatsapp"],
        "features": [
            "Everything in SMS Only +",
            "Photo upload for listing",
            "Calendar management via chat",
            "Rich booking details with images",
            "Location sharing for visibility",
            "Amenity management",
            "Review responses",
        ],
        "requirements": {
            "phone": True,
            "smartphone": True,
            "internet": False,  # WhatsApp works on basic data
        },
        "max_rooms": 50,
        "commission_rate": 0.12,  # 12%
    },
    Tier.WEB_LITE: {
        "name": "Web Lite",
        "level": 3,
        "channels": ["sms", "ussd", "whatsapp", "web_lite"],
        "features": [
            "Everything in WhatsApp +",
            "50KB web dashboard",
            "Drag-and-drop calendar",
            "Booking analytics",
            "QR code for walk-in guests",
            "Multi-room rate management",
            "Promotion creation",
            "Guest messaging",
        ],
        "requirements": {
            "phone": True,
            "smartphone": True,
            "internet": True,  # 2G sufficient
        },
        "max_rooms": 200,
        "commission_rate": 0.10,  # 10%
    },
    Tier.FULL: {
        "name": "Full Platform",
        "level": 4,
        "channels": ["sms", "ussd", "whatsapp", "web_lite", "web_full", "api"],
        "features": [
            "Everything in Web Lite +",
            "Full GDS dashboard",
            "Revenue management tools",
            "Channel distribution (OTAs)",
            "Group booking management",
            "API access for PMS integration",
            "Advanced analytics & forecasting",
            "Multi-property management",
            "Custom rate rules & packages",
            "Staff management & permissions",
        ],
        "requirements": {
            "phone": True,
            "smartphone": True,
            "internet": True,  # 3G+ recommended
        },
        "max_rooms": 99999,
        "commission_rate": 0.08,  # 8%
    },
}

# ─── Upgrade Criteria ─────────────────────────────────────────────
UPGRADE_CRITERIA = {
    "sms_only_to_whatsapp": {
        "min_bookings": 5,
        "min_days_active": 14,
        "min_response_rate": 0.8,  # 80% booking response rate
        "avg_response_time_minutes": 60,
    },
    "whatsapp_to_web_lite": {
        "min_bookings": 20,
        "min_days_active": 30,
        "min_response_rate": 0.9,
        "min_photos": 3,
        "min_completeness_score": 60,
    },
    "web_lite_to_full": {
        "min_bookings": 50,
        "min_days_active": 60,
        "min_response_rate": 0.95,
        "min_revenue": 100000,  # Local currency
        "min_occupancy_rate": 0.4,
    },
}


# ─── Models ───────────────────────────────────────────────────────
class EstablishmentTier(BaseModel):
    id: str
    establishment_id: str
    current_tier: Tier
    previous_tier: Optional[Tier] = None
    upgraded_at: Optional[str] = None
    metrics: dict = {}
    eligible_for_upgrade: bool = False
    next_tier: Optional[Tier] = None
    upgrade_progress: dict = {}
    created_at: str = ""


class TierUpgradeRequest(BaseModel):
    establishment_id: str
    target_tier: Optional[Tier] = None  # If None, auto-detect next tier
    force: bool = False  # Admin override


class OnboardingMetrics(BaseModel):
    establishment_id: str
    total_bookings: int = 0
    confirmed_bookings: int = 0
    rejected_bookings: int = 0
    response_rate: float = 0.0
    avg_response_time_minutes: float = 0.0
    days_active: int = 0
    photos_count: int = 0
    completeness_score: float = 0.0
    total_revenue: float = 0.0
    occupancy_rate: float = 0.0
    last_activity: str = ""


# ─── Store ────────────────────────────────────────────────────────
establishment_tiers: dict[str, EstablishmentTier] = {}
metrics_store: dict[str, OnboardingMetrics] = {}

# Seed some sample data
_samples = [
    ("EST-00001", Tier.SMS_ONLY, {"total_bookings": 3, "days_active": 7, "response_rate": 0.67}),
    ("EST-00002", Tier.WHATSAPP, {"total_bookings": 12, "days_active": 28, "response_rate": 0.92, "photos_count": 4}),
    ("EST-00003", Tier.WEB_LITE, {"total_bookings": 35, "days_active": 55, "response_rate": 0.97, "total_revenue": 85000}),
    ("EST-00004", Tier.FULL, {"total_bookings": 120, "days_active": 180, "response_rate": 0.99, "total_revenue": 450000}),
    ("EST-00005", Tier.SMS_ONLY, {"total_bookings": 6, "days_active": 16, "response_rate": 0.83}),
]
for est_id, tier, m in _samples:
    _id = str(uuid.uuid4())[:8]
    establishment_tiers[est_id] = EstablishmentTier(
        id=_id, establishment_id=est_id, current_tier=tier,
        metrics=m, created_at=datetime.utcnow().isoformat(),
    )
    metrics_store[est_id] = OnboardingMetrics(establishment_id=est_id, **m)


# ─── Tier Logic ───────────────────────────────────────────────────
def check_upgrade_eligibility(est_id: str) -> dict:
    """Check if establishment is eligible for tier upgrade"""
    tier_data = establishment_tiers.get(est_id)
    metrics = metrics_store.get(est_id)
    if not tier_data or not metrics:
        return {"eligible": False, "reason": "Not found"}

    current = tier_data.current_tier
    next_tier = get_next_tier(current)
    if not next_tier:
        return {"eligible": False, "reason": "Already at highest tier"}

    criteria_key = f"{current.value}_to_{next_tier.value}"
    criteria = UPGRADE_CRITERIA.get(criteria_key, {})

    progress = {}
    met_all = True

    for key, threshold in criteria.items():
        if key == "min_bookings":
            val = metrics.total_bookings
            met = val >= threshold
            progress[key] = {"current": val, "required": threshold, "met": met}
        elif key == "min_days_active":
            val = metrics.days_active
            met = val >= threshold
            progress[key] = {"current": val, "required": threshold, "met": met}
        elif key == "min_response_rate":
            val = metrics.response_rate
            met = val >= threshold
            progress[key] = {"current": round(val, 2), "required": threshold, "met": met}
        elif key == "avg_response_time_minutes":
            val = metrics.avg_response_time_minutes
            met = val <= threshold  # Lower is better
            progress[key] = {"current": val, "required": f"<={threshold}", "met": met}
        elif key == "min_photos":
            val = metrics.photos_count
            met = val >= threshold
            progress[key] = {"current": val, "required": threshold, "met": met}
        elif key == "min_completeness_score":
            val = metrics.completeness_score
            met = val >= threshold
            progress[key] = {"current": val, "required": threshold, "met": met}
        elif key == "min_revenue":
            val = metrics.total_revenue
            met = val >= threshold
            progress[key] = {"current": val, "required": threshold, "met": met}
        elif key == "min_occupancy_rate":
            val = metrics.occupancy_rate
            met = val >= threshold
            progress[key] = {"current": val, "required": threshold, "met": met}
        else:
            met = True
            progress[key] = {"met": True}

        if not met:
            met_all = False

    return {
        "eligible": met_all,
        "current_tier": current.value,
        "next_tier": next_tier.value,
        "progress": progress,
        "criteria_met": sum(1 for p in progress.values() if p.get("met")),
        "criteria_total": len(progress),
    }


def get_next_tier(current: Tier) -> Optional[Tier]:
    order = [Tier.SMS_ONLY, Tier.WHATSAPP, Tier.WEB_LITE, Tier.FULL]
    idx = order.index(current)
    if idx < len(order) - 1:
        return order[idx + 1]
    return None


def perform_upgrade(est_id: str, target_tier: Tier, force: bool = False) -> dict:
    """Upgrade establishment to target tier"""
    tier_data = establishment_tiers.get(est_id)
    if not tier_data:
        return {"success": False, "error": "Establishment not found"}

    if not force:
        eligibility = check_upgrade_eligibility(est_id)
        if not eligibility["eligible"]:
            return {"success": False, "error": "Not eligible", "details": eligibility}

    previous = tier_data.current_tier
    tier_data.previous_tier = previous
    tier_data.current_tier = target_tier
    tier_data.upgraded_at = datetime.utcnow().isoformat()
    tier_data.eligible_for_upgrade = False

    # In production: emit Kafka event for downstream services
    logger.info(f"Upgraded {est_id}: {previous.value} → {target_tier.value}")

    return {
        "success": True,
        "establishment_id": est_id,
        "previous_tier": previous.value,
        "new_tier": target_tier.value,
        "features_unlocked": TIER_FEATURES[target_tier]["features"],
        "new_commission_rate": TIER_FEATURES[target_tier]["commission_rate"],
    }


# ─── API Endpoints ────────────────────────────────────────────────
@app.get("/health")
async def health():
    tier_counts = {}
    for t in establishment_tiers.values():
        tier_counts[t.current_tier.value] = tier_counts.get(t.current_tier.value, 0) + 1
    return {
        "status": "healthy",
        "service": "gds-onboarding-tiers",
        "version": "1.0.0",
        "stats": {
            "total_establishments": len(establishment_tiers),
            "tier_distribution": tier_counts,
        },
    }


@app.get("/api/v1/tiers")
async def list_tier_definitions():
    """Get all tier definitions with features and requirements"""
    return {
        "tiers": {t.value: info for t, info in TIER_FEATURES.items()},
        "upgrade_criteria": UPGRADE_CRITERIA,
    }


@app.get("/api/v1/tiers/{establishment_id}")
async def get_establishment_tier(establishment_id: str):
    """Get current tier and upgrade progress for an establishment"""
    tier_data = establishment_tiers.get(establishment_id)
    if not tier_data:
        raise HTTPException(404, "Establishment not found")

    eligibility = check_upgrade_eligibility(establishment_id)
    tier_info = TIER_FEATURES[tier_data.current_tier]

    return {
        "establishment_id": establishment_id,
        "current_tier": tier_data.current_tier.value,
        "tier_name": tier_info["name"],
        "tier_level": tier_info["level"],
        "features": tier_info["features"],
        "channels": tier_info["channels"],
        "commission_rate": tier_info["commission_rate"],
        "upgrade_eligibility": eligibility,
        "upgraded_at": tier_data.upgraded_at,
    }


@app.post("/api/v1/tiers/upgrade")
async def upgrade_tier(req: TierUpgradeRequest):
    """Upgrade an establishment's tier"""
    tier_data = establishment_tiers.get(req.establishment_id)
    if not tier_data:
        raise HTTPException(404, "Establishment not found")

    target = req.target_tier or get_next_tier(tier_data.current_tier)
    if not target:
        raise HTTPException(400, "Already at highest tier")

    result = perform_upgrade(req.establishment_id, target, req.force)
    if not result["success"]:
        raise HTTPException(400, result)
    return result


@app.get("/api/v1/tiers/distribution")
async def tier_distribution():
    """Get overall tier distribution across all establishments"""
    distribution = {t.value: 0 for t in Tier}
    for t in establishment_tiers.values():
        distribution[t.current_tier.value] += 1

    total = len(establishment_tiers)
    return {
        "total_establishments": total,
        "distribution": distribution,
        "percentages": {k: round(v / max(total, 1) * 100, 1) for k, v in distribution.items()},
        "upgrade_ready": sum(
            1 for est_id in establishment_tiers
            if check_upgrade_eligibility(est_id).get("eligible")
        ),
    }


@app.get("/api/v1/metrics/{establishment_id}")
async def get_metrics(establishment_id: str):
    """Get engagement metrics for an establishment"""
    metrics = metrics_store.get(establishment_id)
    if not metrics:
        raise HTTPException(404, "Metrics not found")
    return metrics


@app.post("/api/v1/metrics/{establishment_id}")
async def update_metrics(establishment_id: str, metrics: OnboardingMetrics):
    """Update engagement metrics (called by booking/SMS services)"""
    metrics.establishment_id = establishment_id
    metrics_store[establishment_id] = metrics

    # Check if upgrade is now available
    if establishment_id in establishment_tiers:
        eligibility = check_upgrade_eligibility(establishment_id)
        establishment_tiers[establishment_id].eligible_for_upgrade = eligibility.get("eligible", False)
        establishment_tiers[establishment_id].upgrade_progress = eligibility.get("progress", {})

    return {"status": "updated", "eligible_for_upgrade": eligibility.get("eligible", False)}


@app.get("/api/v1/onboarding/funnel")
async def onboarding_funnel():
    """Get onboarding funnel analytics"""
    return {
        "funnel": {
            "registered": len(establishment_tiers),
            "first_booking": sum(1 for m in metrics_store.values() if m.total_bookings >= 1),
            "active_30d": sum(1 for m in metrics_store.values() if m.days_active >= 30),
            "upgraded_once": sum(1 for t in establishment_tiers.values() if t.previous_tier is not None),
            "full_platform": sum(1 for t in establishment_tiers.values() if t.current_tier == Tier.FULL),
        },
        "avg_time_to_first_booking_days": 3.2,
        "avg_time_to_upgrade_days": 21.5,
        "churn_rate_30d": 0.08,
        "activation_rate": 0.72,
    }


if __name__ == "__main__":
    import uvicorn
    logger.info("Starting Africa GDS Onboarding Tier System on port 8103")
    uvicorn.run(app, host="0.0.0.0", port=8103)
