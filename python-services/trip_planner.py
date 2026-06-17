"""
Trip Planner NL Service — Natural language intent parsing and
RAG-powered itinerary generation over the merchant database.

Endpoints:
  POST /api/trip-planner/parse-intent     — Extract travel intent from NL text
  POST /api/trip-planner/generate         — Generate structured itinerary from intent + merchant context
  POST /api/trip-planner/refine           — Refine existing itinerary via NL instruction
  POST /api/trip-planner/cost-optimize    — Optimize itinerary for budget
  GET  /api/trip-planner/country-profile  — Country travel profile with merchant summary
"""
import os
import re
import json
import math
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from pydantic import BaseModel


# ─── Models ──────────────────────────────────────────────────────────────────

class TravelIntent(BaseModel):
    destination_country: str = ""
    destination_city: str = ""
    duration_days: int = 5
    budget_usd: float = 0
    budget_level: str = "mid-range"  # budget, mid-range, luxury
    interests: List[str] = []
    travelers: int = 1
    start_date: Optional[str] = None
    special_requirements: List[str] = []
    original_query: str = ""

class ItineraryDay(BaseModel):
    day_number: int
    title: str
    items: List[Dict[str, Any]]
    day_cost_usd: float = 0

class GeneratedItinerary(BaseModel):
    id: str
    destination: str
    country: str
    country_code: str
    duration_days: int
    budget_level: str
    total_cost_usd: float
    daily_average_usd: float
    days: List[ItineraryDay]
    currency_info: Dict[str, Any]
    tips: List[str]
    merchant_coverage: float  # % of items from TourismPay merchants
    generated_at: str

class RefinementRequest(BaseModel):
    itinerary: GeneratedItinerary
    instruction: str
    merchant_context: str = ""

class CountryProfile(BaseModel):
    country_code: str
    country_name: str
    merchant_count: int
    top_cities: List[str]
    categories: List[Dict[str, Any]]
    avg_daily_cost: Dict[str, float]
    currency: Dict[str, Any]
    visa_info: str
    safety_rating: str
    best_months: List[str]
    seasonal_tips: List[str]


# ─── Country Data ────────────────────────────────────────────────────────────

COUNTRY_MAP = {
    "nigeria": "NG", "lagos": "NG", "abuja": "NG",
    "kenya": "KE", "nairobi": "KE", "mombasa": "KE", "masai mara": "KE",
    "ghana": "GH", "accra": "GH", "cape coast": "GH",
    "south africa": "ZA", "cape town": "ZA", "johannesburg": "ZA", "joburg": "ZA",
    "tanzania": "TZ", "zanzibar": "TZ", "arusha": "TZ", "serengeti": "TZ",
    "egypt": "EG", "cairo": "EG",
    "morocco": "MA", "marrakech": "MA",
    "rwanda": "RW", "kigali": "RW",
    "senegal": "SN", "dakar": "SN",
    "ethiopia": "ET", "addis ababa": "ET",
    "uganda": "UG", "kampala": "UG",
    "mozambique": "MZ", "maputo": "MZ",
}

CITY_MAP = {
    "lagos": ("Lagos", "NG"), "abuja": ("Abuja", "NG"), "port harcourt": ("Port Harcourt", "NG"),
    "nairobi": ("Nairobi", "KE"), "mombasa": ("Mombasa", "KE"),
    "accra": ("Accra", "GH"), "cape coast": ("Cape Coast", "GH"),
    "cape town": ("Cape Town", "ZA"), "johannesburg": ("Johannesburg", "ZA"),
    "zanzibar": ("Zanzibar", "TZ"), "arusha": ("Arusha", "TZ"),
    "cairo": ("Cairo", "EG"), "marrakech": ("Marrakech", "MA"),
    "kigali": ("Kigali", "RW"), "dakar": ("Dakar", "SN"),
}

COUNTRY_PROFILES: Dict[str, Dict[str, Any]] = {
    "NG": {
        "name": "Nigeria", "top_cities": ["Lagos", "Abuja", "Port Harcourt"],
        "visa_info": "eVisa available for most nationalities — $75 single entry, $100 multiple entry. Processing: 48-72 hours.",
        "safety_rating": "Moderate — stick to tourist areas in Lagos/Abuja. Avoid night travel between cities.",
        "best_months": ["November", "December", "January", "February"],
        "avg_daily": {"budget": 80, "mid-range": 180, "luxury": 450},
    },
    "KE": {
        "name": "Kenya", "top_cities": ["Nairobi", "Mombasa", "Masai Mara"],
        "visa_info": "eTA required — $30, apply at etakenya.go.ke. 90-day stay.",
        "safety_rating": "Good — popular tourist destination. Standard precautions in Nairobi at night.",
        "best_months": ["July", "August", "September", "October", "January", "February"],
        "avg_daily": {"budget": 60, "mid-range": 150, "luxury": 500},
    },
    "GH": {
        "name": "Ghana", "top_cities": ["Accra", "Cape Coast", "Kumasi"],
        "visa_info": "Visa required — apply at embassy. $60 single entry. Year of Return initiative.",
        "safety_rating": "Good — one of the safest West African countries for tourists.",
        "best_months": ["November", "December", "January", "February", "March"],
        "avg_daily": {"budget": 50, "mid-range": 120, "luxury": 300},
    },
    "ZA": {
        "name": "South Africa", "top_cities": ["Cape Town", "Johannesburg", "Durban"],
        "visa_info": "Visa-free for US/EU/UK — 90-day stay. Others need visa ($45).",
        "safety_rating": "Moderate — excellent tourist infrastructure. Avoid isolated areas at night.",
        "best_months": ["September", "October", "November", "March", "April"],
        "avg_daily": {"budget": 70, "mid-range": 160, "luxury": 400},
    },
    "TZ": {
        "name": "Tanzania", "top_cities": ["Arusha", "Zanzibar", "Dar es Salaam"],
        "visa_info": "Visa on arrival — $50 single entry. eVisa also available.",
        "safety_rating": "Good — major safari and beach destination. Standard precautions.",
        "best_months": ["June", "July", "August", "September", "January", "February"],
        "avg_daily": {"budget": 50, "mid-range": 200, "luxury": 800},
    },
}

INTEREST_KEYWORDS = {
    "beach": ["beach", "coast", "ocean", "surf", "sand", "seaside", "island"],
    "safari": ["safari", "wildlife", "game drive", "animals", "national park", "big five"],
    "cultural": ["culture", "history", "museum", "heritage", "art", "gallery", "local", "tradition"],
    "food": ["food", "restaurant", "cuisine", "eat", "dining", "culinary", "taste", "cook"],
    "nightlife": ["nightlife", "bar", "club", "music", "live music", "party", "afrobeats"],
    "nature": ["nature", "hiking", "trek", "mountain", "forest", "waterfall", "canopy"],
    "luxury": ["luxury", "spa", "5-star", "premium", "exclusive", "vip", "suite"],
    "adventure": ["adventure", "zip line", "bungee", "diving", "snorkeling", "balloon", "skydive"],
    "shopping": ["shopping", "market", "mall", "souvenir", "craft"],
    "family": ["family", "kid", "child", "children", "family-friendly"],
}


# ─── Intent Parsing ──────────────────────────────────────────────────────────

def parse_travel_intent(query: str) -> TravelIntent:
    """Extract structured travel intent from natural language query."""
    q = query.lower().strip()
    intent = TravelIntent(original_query=query)

    # Extract country/city
    for keyword, code in COUNTRY_MAP.items():
        if keyword in q:
            intent.destination_country = code
            break

    for keyword, (city, code) in CITY_MAP.items():
        if keyword in q:
            intent.destination_city = city
            if not intent.destination_country:
                intent.destination_country = code
            break

    # Extract duration
    duration_patterns = [
        r'(\d+)\s*(?:day|night|d)',
        r'(\d+)\s*week',
        r'a\s*week',
        r'long\s*weekend',
    ]
    for pattern in duration_patterns:
        match = re.search(pattern, q)
        if match:
            if 'week' in pattern:
                if match.group(0).startswith('a'):
                    intent.duration_days = 7
                else:
                    intent.duration_days = int(match.group(1)) * 7
            elif 'weekend' in pattern:
                intent.duration_days = 3
            else:
                intent.duration_days = int(match.group(1))
            break

    # Extract budget
    budget_match = re.search(r'\$\s*([\d,]+)', q)
    if budget_match:
        intent.budget_usd = float(budget_match.group(1).replace(',', ''))
    elif 'budget' in q or 'cheap' in q or 'affordable' in q:
        intent.budget_level = "budget"
    elif 'luxury' in q or 'premium' in q or 'high-end' in q or 'splurge' in q:
        intent.budget_level = "luxury"
    else:
        intent.budget_level = "mid-range"

    # Infer budget level from amount
    if intent.budget_usd > 0 and intent.duration_days > 0:
        daily = intent.budget_usd / intent.duration_days
        if daily < 100:
            intent.budget_level = "budget"
        elif daily > 300:
            intent.budget_level = "luxury"
        else:
            intent.budget_level = "mid-range"

    # Extract interests
    for interest, keywords in INTEREST_KEYWORDS.items():
        for kw in keywords:
            if kw in q:
                intent.interests.append(interest)
                break

    if not intent.interests:
        intent.interests = ["cultural", "food"]

    # Extract travelers
    traveler_match = re.search(r'(\d+)\s*(?:people|person|travelers|travellers|of\s+us|adults)', q)
    if traveler_match:
        intent.travelers = int(traveler_match.group(1))
    elif 'couple' in q or 'two of us' in q:
        intent.travelers = 2
    elif 'family' in q:
        intent.travelers = 4
    elif 'solo' in q or 'alone' in q or 'myself' in q:
        intent.travelers = 1

    # Extract special requirements
    if any(w in q for w in ['vegetarian', 'vegan', 'halal', 'kosher']):
        for w in ['vegetarian', 'vegan', 'halal', 'kosher']:
            if w in q:
                intent.special_requirements.append(w)
    if 'wheelchair' in q or 'accessibility' in q or 'disabled' in q:
        intent.special_requirements.append("wheelchair_accessible")

    # Default country if none found
    if not intent.destination_country:
        intent.destination_country = "NG"
        intent.destination_city = "Lagos"

    return intent


def build_itinerary_prompt(intent: TravelIntent, merchant_context: str) -> str:
    """Build the LLM prompt for structured itinerary generation."""
    country_name = COUNTRY_PROFILES.get(intent.destination_country, {}).get("name", intent.destination_country)
    city = intent.destination_city or COUNTRY_PROFILES.get(intent.destination_country, {}).get("top_cities", [""])[0]

    budget_str = f"${intent.budget_usd:.0f} total" if intent.budget_usd > 0 else intent.budget_level
    interests_str = ", ".join(intent.interests) if intent.interests else "general sightseeing"

    prompt = f"""Generate a detailed {intent.duration_days}-day travel itinerary for {city}, {country_name}.

TOURIST PROFILE:
- Budget: {budget_str}
- Travelers: {intent.travelers}
- Interests: {interests_str}
{f"- Special requirements: {', '.join(intent.special_requirements)}" if intent.special_requirements else ""}
{f"- Start date: {intent.start_date}" if intent.start_date else ""}

REAL MERCHANT DATA (USE THESE — do NOT hallucinate merchants):
{merchant_context}

INSTRUCTIONS:
1. Create a day-by-day itinerary using ONLY the merchants and products listed above
2. For each item, include the merchant ID, product name, and exact price from the data
3. Include transport between locations using actual Uber/taxi estimates
4. Add 3 meals per day using restaurants from the merchant list
5. Fill morning, afternoon, and evening slots
6. Stay within the budget
7. Prioritize TourismPay-accepting merchants (all listed merchants accept TourismPay)

OUTPUT FORMAT (JSON):
{{
  "days": [
    {{
      "day_number": 1,
      "title": "Arrival & Cultural Immersion",
      "items": [
        {{
          "time_slot": "morning",
          "start_time": "09:00",
          "end_time": "11:00",
          "title": "Activity name",
          "description": "Brief description",
          "merchant_id": 4,
          "merchant_name": "Nike Art Gallery",
          "product_name": "Gallery Admission",
          "cost_usd": 10.00,
          "item_type": "activity",
          "bookable": true
        }}
      ]
    }}
  ],
  "tips": ["tip 1", "tip 2"],
  "total_cost_usd": 1250.00
}}

Generate the complete itinerary now as valid JSON only. No markdown, no explanation."""

    return prompt


def build_refinement_prompt(itinerary_json: str, instruction: str, merchant_context: str) -> str:
    """Build prompt for refining an existing itinerary."""
    return f"""You have an existing travel itinerary. The user wants to modify it.

CURRENT ITINERARY:
{itinerary_json}

USER'S MODIFICATION REQUEST:
{instruction}

AVAILABLE MERCHANTS AND PRODUCTS:
{merchant_context}

INSTRUCTIONS:
1. Apply the user's requested changes to the itinerary
2. Keep unchanged days/items intact
3. Use ONLY merchants from the provided data
4. Recalculate costs after changes
5. Return the COMPLETE modified itinerary in the same JSON format

OUTPUT: Valid JSON only, same format as the input itinerary. No markdown."""


def get_country_profile(country_code: str, merchant_count: int = 0, categories: List[Dict] = None) -> CountryProfile:
    """Generate a country travel profile."""
    profile = COUNTRY_PROFILES.get(country_code.upper(), {})
    if not profile:
        return CountryProfile(
            country_code=country_code.upper(),
            country_name=country_code,
            merchant_count=0,
            top_cities=[],
            categories=[],
            avg_daily_cost={},
            currency={},
            visa_info="Check with embassy",
            safety_rating="Check travel advisories",
            best_months=[],
            seasonal_tips=[],
        )

    return CountryProfile(
        country_code=country_code.upper(),
        country_name=profile["name"],
        merchant_count=merchant_count,
        top_cities=profile["top_cities"],
        categories=categories or [],
        avg_daily_cost=profile.get("avg_daily", {}),
        currency={},
        visa_info=profile["visa_info"],
        safety_rating=profile["safety_rating"],
        best_months=profile["best_months"],
        seasonal_tips=[],
    )


def optimize_for_budget(itinerary_data: Dict, target_budget: float) -> Dict:
    """Optimize itinerary items to fit within target budget."""
    total = sum(
        item.get("cost_usd", 0)
        for day in itinerary_data.get("days", [])
        for item in day.get("items", [])
    )

    if total <= target_budget:
        return itinerary_data

    ratio = target_budget / total if total > 0 else 1.0

    for day in itinerary_data.get("days", []):
        for item in day.get("items", []):
            if item.get("item_type") in ("meal", "transport"):
                item["cost_usd"] = round(item.get("cost_usd", 0) * max(ratio, 0.6), 2)
            elif item.get("item_type") == "accommodation":
                item["cost_usd"] = round(item.get("cost_usd", 0) * max(ratio, 0.5), 2)

    new_total = sum(
        item.get("cost_usd", 0)
        for day in itinerary_data.get("days", [])
        for item in day.get("items", [])
    )
    itinerary_data["total_cost_usd"] = round(new_total, 2)
    return itinerary_data
