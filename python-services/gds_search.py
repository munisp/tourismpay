"""
Africa-first GDS Search & Discovery Service (Python)

High-performance property search with OpenSearch, ML-powered recommendations,
dynamic pricing, and demand forecasting.

Middleware: OpenSearch (search engine), Redis (cache), Kafka (events),
PostgreSQL (persistence), Lakehouse (analytics)
"""

import asyncio
import hashlib
import json
import math
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Optional

# --- Configuration ---

OPENSEARCH_URL = os.getenv("OPENSEARCH_URL", "http://localhost:9200")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "localhost:9092")
POSTGRES_URL = os.getenv("GDS_DATABASE_URL", "postgresql://tourismpay_user:testpass123@localhost:5432/tourismpay")

# --- Domain Types ---


class PropertyType(str, Enum):
    HOTEL = "hotel"
    LODGE = "lodge"
    SAFARI_CAMP = "safari_camp"
    RESORT = "resort"
    BOUTIQUE = "boutique"
    GUESTHOUSE = "guesthouse"
    VILLA = "villa"
    APARTMENT = "apartment"
    ACTIVITY = "activity"
    RESTAURANT = "restaurant"


class MealPlan(str, Enum):
    ROOM_ONLY = "RO"
    BED_BREAKFAST = "BB"
    HALF_BOARD = "HB"
    FULL_BOARD = "FB"
    ALL_INCLUSIVE = "AI"


@dataclass
class SearchQuery:
    """Search request from an agent or tourist."""
    destination: Optional[str] = None
    country_code: Optional[str] = None
    check_in: Optional[str] = None  # YYYY-MM-DD
    check_out: Optional[str] = None
    guests: int = 2
    rooms: int = 1
    property_type: Optional[PropertyType] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    star_rating: Optional[int] = None
    amenities: list[str] = field(default_factory=list)
    meal_plan: Optional[MealPlan] = None
    sort_by: str = "relevance"  # relevance, price_asc, price_desc, rating, distance
    page: int = 1
    page_size: int = 20
    currency: str = "USD"


@dataclass
class SearchResult:
    """Single property result from a search."""
    property_id: str
    name: str
    property_type: str
    country: str
    city: str
    star_rating: int
    score: float
    rate: float
    currency: str
    available_rooms: int
    image_url: str
    amenities: list[str]
    distance_km: Optional[float] = None


@dataclass
class SearchResponse:
    """Complete search response."""
    results: list[SearchResult]
    total: int
    page: int
    page_size: int
    query_time_ms: float
    filters_applied: dict[str, Any] = field(default_factory=dict)


@dataclass
class PricingSignal:
    """Input signals for dynamic pricing ML model."""
    property_id: str
    room_type: str
    date: str
    base_rate: float
    occupancy_pct: float
    days_until_checkin: int
    day_of_week: int
    is_holiday: bool
    is_peak_season: bool
    competitor_rate: Optional[float] = None
    demand_forecast: Optional[float] = None


@dataclass
class DemandForecast:
    """ML-predicted demand for a destination/date."""
    destination: str
    date: str
    predicted_demand: float  # 0-1 scale
    confidence: float
    factors: dict[str, float] = field(default_factory=dict)


# --- Search Engine ---


class GDSSearchEngine:
    """OpenSearch-powered property search with ML ranking."""

    def __init__(self):
        self._index_name = "gds-properties"
        self._rate_index = "gds-rates"
        self._cache: dict[str, tuple[Any, float]] = {}
        self._cache_ttl = 300  # 5 minutes

    def _cache_key(self, query: SearchQuery) -> str:
        """Generate cache key from search query."""
        raw = json.dumps({
            "dest": query.destination,
            "country": query.country_code,
            "in": query.check_in,
            "out": query.check_out,
            "guests": query.guests,
            "type": query.property_type.value if query.property_type else None,
            "min": query.min_price,
            "max": query.max_price,
            "star": query.star_rating,
            "sort": query.sort_by,
            "page": query.page,
        }, sort_keys=True)
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    async def search(self, query: SearchQuery) -> SearchResponse:
        """Execute a property search with OpenSearch."""
        start = time.time()

        # Check cache
        cache_key = self._cache_key(query)
        if cache_key in self._cache:
            cached, ts = self._cache[cache_key]
            if time.time() - ts < self._cache_ttl:
                return cached

        # Build OpenSearch query
        os_query = self._build_opensearch_query(query)

        # In production: execute against OpenSearch
        # response = await self._opensearch_client.search(index=self._index_name, body=os_query)
        # For now: return empty results (OpenSearch not connected)
        results: list[SearchResult] = []

        elapsed = (time.time() - start) * 1000

        response = SearchResponse(
            results=results,
            total=len(results),
            page=query.page,
            page_size=query.page_size,
            query_time_ms=elapsed,
            filters_applied={
                "destination": query.destination,
                "country": query.country_code,
                "check_in": query.check_in,
                "check_out": query.check_out,
                "property_type": query.property_type.value if query.property_type else None,
            },
        )

        # Cache result
        self._cache[cache_key] = (response, time.time())

        return response

    def _build_opensearch_query(self, query: SearchQuery) -> dict:
        """Build OpenSearch DSL query from search request."""
        must_clauses = []
        filter_clauses = []

        # Full-text search on destination
        if query.destination:
            must_clauses.append({
                "multi_match": {
                    "query": query.destination,
                    "fields": ["name^3", "city^2", "region", "description", "country"],
                    "type": "best_fields",
                    "fuzziness": "AUTO",
                }
            })

        # Country filter
        if query.country_code:
            filter_clauses.append({"term": {"country_code": query.country_code}})

        # Property type filter
        if query.property_type:
            filter_clauses.append({"term": {"property_type": query.property_type.value}})

        # Star rating filter
        if query.star_rating:
            filter_clauses.append({"range": {"star_rating": {"gte": query.star_rating}}})

        # Price range filter
        if query.min_price or query.max_price:
            price_range: dict[str, Any] = {}
            if query.min_price:
                price_range["gte"] = query.min_price
            if query.max_price:
                price_range["lte"] = query.max_price
            filter_clauses.append({"range": {"base_rate": price_range}})

        # Amenities filter
        if query.amenities:
            for amenity in query.amenities:
                filter_clauses.append({"term": {"amenities": amenity}})

        # Build final query
        os_query: dict[str, Any] = {
            "query": {
                "bool": {
                    "must": must_clauses if must_clauses else [{"match_all": {}}],
                    "filter": filter_clauses,
                }
            },
            "from": (query.page - 1) * query.page_size,
            "size": query.page_size,
        }

        # Sorting
        if query.sort_by == "price_asc":
            os_query["sort"] = [{"base_rate": "asc"}]
        elif query.sort_by == "price_desc":
            os_query["sort"] = [{"base_rate": "desc"}]
        elif query.sort_by == "rating":
            os_query["sort"] = [{"star_rating": "desc"}]
        # Default: relevance (OpenSearch _score)

        return os_query

    async def index_property(self, property_data: dict) -> bool:
        """Index a property document in OpenSearch."""
        # In production: await self._opensearch_client.index(...)
        return True

    async def suggest(self, prefix: str, limit: int = 5) -> list[str]:
        """Autocomplete suggestions for destinations."""
        african_destinations = [
            "Masai Mara, Kenya", "Serengeti, Tanzania", "Cape Town, South Africa",
            "Victoria Falls, Zimbabwe", "Marrakech, Morocco", "Zanzibar, Tanzania",
            "Kruger National Park, South Africa", "Nairobi, Kenya", "Lagos, Nigeria",
            "Accra, Ghana", "Kigali, Rwanda", "Diani Beach, Kenya",
            "Ngorongoro, Tanzania", "Okavango Delta, Botswana", "Sossusvlei, Namibia",
            "Lamu Island, Kenya", "Addis Ababa, Ethiopia", "Mauritius",
            "Seychelles", "Mozambique Coast", "Lake Malawi", "Mount Kilimanjaro",
        ]
        return [d for d in african_destinations if d.lower().startswith(prefix.lower())][:limit]


# --- Dynamic Pricing Engine ---


class DynamicPricingEngine:
    """ML-powered dynamic pricing for GDS properties."""

    def __init__(self):
        self._base_multipliers: dict[str, float] = {}

    def calculate_dynamic_rate(self, signal: PricingSignal) -> float:
        """Calculate optimized rate based on demand signals."""
        rate = signal.base_rate
        multiplier = 1.0

        # Occupancy-based adjustment (higher occupancy = higher price)
        if signal.occupancy_pct > 0.9:
            multiplier *= 1.25  # 25% premium at 90%+ occupancy
        elif signal.occupancy_pct > 0.75:
            multiplier *= 1.15
        elif signal.occupancy_pct > 0.5:
            multiplier *= 1.05
        elif signal.occupancy_pct < 0.3:
            multiplier *= 0.85  # Discount at low occupancy

        # Lead time adjustment (last-minute vs advance)
        if signal.days_until_checkin <= 2:
            multiplier *= 1.20  # Last-minute premium
        elif signal.days_until_checkin <= 7:
            multiplier *= 1.10
        elif signal.days_until_checkin >= 90:
            multiplier *= 0.90  # Early bird discount

        # Day of week (weekend premium for leisure properties)
        if signal.day_of_week in (4, 5, 6):  # Fri, Sat, Sun
            multiplier *= 1.10

        # Seasonality
        if signal.is_peak_season:
            multiplier *= 1.30
        if signal.is_holiday:
            multiplier *= 1.20

        # Competitor awareness
        if signal.competitor_rate and signal.competitor_rate > 0:
            if rate * multiplier > signal.competitor_rate * 1.1:
                # Don't be more than 10% above competitors
                multiplier = min(multiplier, (signal.competitor_rate * 1.1) / rate)

        # Demand forecast integration
        if signal.demand_forecast is not None:
            if signal.demand_forecast > 0.8:
                multiplier *= 1.15
            elif signal.demand_forecast < 0.3:
                multiplier *= 0.90

        # Cap multiplier to prevent extreme pricing
        multiplier = max(0.7, min(multiplier, 2.0))

        return round(rate * multiplier, 2)

    def forecast_demand(self, destination: str, date: str) -> DemandForecast:
        """Predict demand for a destination on a specific date."""
        # In production: ML model inference
        # For now: rule-based estimation

        dt = datetime.strptime(date, "%Y-%m-%d")
        factors: dict[str, float] = {}

        # Base demand
        demand = 0.5

        # Month-based seasonality for African tourism
        month = dt.month
        if month in (6, 7, 8, 9):  # Peak safari season (dry season East Africa)
            demand += 0.25
            factors["peak_safari_season"] = 0.25
        elif month in (12, 1):  # Holiday season
            demand += 0.20
            factors["holiday_season"] = 0.20
        elif month in (3, 4, 5):  # Rainy season (low demand)
            demand -= 0.15
            factors["rainy_season"] = -0.15

        # Weekend boost
        if dt.weekday() >= 4:
            demand += 0.05
            factors["weekend"] = 0.05

        # Popular destinations get higher base demand
        high_demand_dests = ["masai mara", "serengeti", "cape town", "victoria falls", "zanzibar"]
        if any(d in destination.lower() for d in high_demand_dests):
            demand += 0.15
            factors["popular_destination"] = 0.15

        demand = max(0.0, min(1.0, demand))

        return DemandForecast(
            destination=destination,
            date=date,
            predicted_demand=round(demand, 3),
            confidence=0.72,  # Placeholder confidence
            factors=factors,
        )


# --- Recommendation Engine ---


class RecommendationEngine:
    """Content-based and collaborative filtering for property recommendations."""

    def __init__(self):
        self._user_history: dict[str, list[str]] = {}  # user -> property IDs viewed/booked

    def get_similar_properties(self, property_id: str, limit: int = 5) -> list[str]:
        """Find properties similar to a given property (content-based)."""
        # In production: use OpenSearch more_like_this or embedding similarity
        return []

    def get_personalized_recommendations(self, user_id: str, limit: int = 10) -> list[str]:
        """Get personalized property recommendations for a user."""
        history = self._user_history.get(user_id, [])
        if not history:
            return self._get_trending_properties(limit)
        # In production: collaborative filtering or embedding-based
        return []

    def _get_trending_properties(self, limit: int) -> list[str]:
        """Get currently trending properties (fallback for cold-start)."""
        return []

    def record_interaction(self, user_id: str, property_id: str, interaction_type: str) -> None:
        """Record a user-property interaction for future recommendations."""
        if user_id not in self._user_history:
            self._user_history[user_id] = []
        self._user_history[user_id].append(property_id)
        # Keep last 100 interactions
        self._user_history[user_id] = self._user_history[user_id][-100:]


# --- FastAPI Application ---


def create_gds_search_app():
    """Create the GDS Search FastAPI application."""
    try:
        from fastapi import FastAPI, Query
        from fastapi.middleware.cors import CORSMiddleware
    except ImportError:
        return None

    app = FastAPI(
        title="TourismPay Africa GDS - Search & Discovery",
        description="Property search, dynamic pricing, and recommendations for African tourism",
        version="1.0.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    search_engine = GDSSearchEngine()
    pricing_engine = DynamicPricingEngine()
    recommendation_engine = RecommendationEngine()

    @app.get("/health")
    async def health():
        return {"status": "healthy", "service": "gds-search", "version": "1.0.0"}

    @app.get("/api/v1/gds/search")
    async def search_properties(
        destination: str = Query(None),
        country: str = Query(None),
        check_in: str = Query(None),
        check_out: str = Query(None),
        guests: int = Query(2),
        rooms: int = Query(1),
        property_type: str = Query(None),
        min_price: float = Query(None),
        max_price: float = Query(None),
        star_rating: int = Query(None),
        sort_by: str = Query("relevance"),
        page: int = Query(1),
        page_size: int = Query(20),
    ):
        query = SearchQuery(
            destination=destination,
            country_code=country,
            check_in=check_in,
            check_out=check_out,
            guests=guests,
            rooms=rooms,
            property_type=PropertyType(property_type) if property_type else None,
            min_price=min_price,
            max_price=max_price,
            star_rating=star_rating,
            sort_by=sort_by,
            page=page,
            page_size=page_size,
        )
        result = await search_engine.search(query)
        return result

    @app.get("/api/v1/gds/suggest")
    async def suggest_destinations(q: str = Query(""), limit: int = Query(5)):
        suggestions = await search_engine.suggest(q, limit)
        return {"suggestions": suggestions}

    @app.get("/api/v1/gds/pricing/dynamic")
    async def get_dynamic_price(
        property_id: str = Query(...),
        room_type: str = Query(...),
        date: str = Query(...),
        base_rate: float = Query(...),
        occupancy_pct: float = Query(0.5),
    ):
        dt = datetime.strptime(date, "%Y-%m-%d")
        days_until = (dt - datetime.now()).days

        signal = PricingSignal(
            property_id=property_id,
            room_type=room_type,
            date=date,
            base_rate=base_rate,
            occupancy_pct=occupancy_pct,
            days_until_checkin=max(0, days_until),
            day_of_week=dt.weekday(),
            is_holiday=False,
            is_peak_season=dt.month in (6, 7, 8, 9, 12, 1),
        )

        dynamic_rate = pricing_engine.calculate_dynamic_rate(signal)
        return {
            "property_id": property_id,
            "room_type": room_type,
            "date": date,
            "base_rate": base_rate,
            "dynamic_rate": dynamic_rate,
            "multiplier": round(dynamic_rate / base_rate, 3),
        }

    @app.get("/api/v1/gds/demand/forecast")
    async def forecast_demand(destination: str = Query(...), date: str = Query(...)):
        forecast = pricing_engine.forecast_demand(destination, date)
        return forecast

    @app.get("/api/v1/gds/recommendations")
    async def get_recommendations(user_id: str = Query(...), limit: int = Query(10)):
        recs = recommendation_engine.get_personalized_recommendations(user_id, limit)
        return {"user_id": user_id, "recommendations": recs, "count": len(recs)}

    @app.get("/api/v1/gds/countries")
    async def list_countries():
        return {
            "countries": [
                {"code": "KE", "name": "Kenya", "currency": "KES"},
                {"code": "ZA", "name": "South Africa", "currency": "ZAR"},
                {"code": "NG", "name": "Nigeria", "currency": "NGN"},
                {"code": "GH", "name": "Ghana", "currency": "GHS"},
                {"code": "TZ", "name": "Tanzania", "currency": "TZS"},
                {"code": "UG", "name": "Uganda", "currency": "UGX"},
                {"code": "RW", "name": "Rwanda", "currency": "RWF"},
                {"code": "ET", "name": "Ethiopia", "currency": "ETB"},
                {"code": "MA", "name": "Morocco", "currency": "MAD"},
                {"code": "EG", "name": "Egypt", "currency": "EGP"},
                {"code": "TN", "name": "Tunisia", "currency": "TND"},
                {"code": "MU", "name": "Mauritius", "currency": "MUR"},
                {"code": "SN", "name": "Senegal", "currency": "XOF"},
                {"code": "CI", "name": "Ivory Coast", "currency": "XOF"},
                {"code": "CM", "name": "Cameroon", "currency": "XAF"},
                {"code": "ZW", "name": "Zimbabwe", "currency": "ZWL"},
                {"code": "BW", "name": "Botswana", "currency": "BWP"},
                {"code": "NA", "name": "Namibia", "currency": "NAD"},
                {"code": "MZ", "name": "Mozambique", "currency": "MZN"},
                {"code": "MG", "name": "Madagascar", "currency": "MGA"},
            ]
        }

    return app


# Entry point
if __name__ == "__main__":
    app = create_gds_search_app()
    if app:
        import uvicorn
        uvicorn.run(app, host="0.0.0.0", port=8010)
