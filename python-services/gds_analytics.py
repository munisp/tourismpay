"""
Africa-first GDS Analytics & Lakehouse Pipeline (Python)

Batch + stream analytics for the GDS: booking trends, revenue forecasting,
agent performance, property scoring, and market intelligence.

Middleware: Lakehouse (data warehouse), Kafka (stream ingestion),
Fluvio (real-time), PostgreSQL (operational), OpenSearch (search analytics)
"""

import json
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Optional


# --- Configuration ---

LAKEHOUSE_URL = os.getenv("LAKEHOUSE_URL", "http://localhost:8181")
KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "localhost:9092")
FLUVIO_ENDPOINT = os.getenv("FLUVIO_ENDPOINT", "localhost:9003")
POSTGRES_URL = os.getenv("GDS_DATABASE_URL", "postgresql://tourismpay_user:testpass123@localhost:5432/tourismpay")


# --- Analytics Domain Types ---


class MetricPeriod(str, Enum):
    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"


@dataclass
class BookingMetrics:
    """Aggregated booking metrics for a time period."""
    period: str
    period_start: str
    period_end: str
    total_bookings: int = 0
    confirmed_bookings: int = 0
    cancelled_bookings: int = 0
    total_revenue: float = 0.0
    average_booking_value: float = 0.0
    average_lead_time_days: float = 0.0
    average_length_of_stay: float = 0.0
    occupancy_rate: float = 0.0
    cancellation_rate: float = 0.0
    top_countries: list[dict] = field(default_factory=list)
    top_properties: list[dict] = field(default_factory=list)


@dataclass
class AgentPerformance:
    """Performance metrics for a travel agent."""
    agent_id: str
    agent_name: str
    period: str
    total_bookings: int = 0
    total_revenue: float = 0.0
    commission_earned: float = 0.0
    cancellation_rate: float = 0.0
    average_booking_value: float = 0.0
    conversion_rate: float = 0.0
    top_destinations: list[str] = field(default_factory=list)
    tier: str = "bronze"
    score: float = 0.0


@dataclass
class PropertyScore:
    """Quality/performance score for a property."""
    property_id: str
    property_name: str
    overall_score: float = 0.0  # 0-100
    booking_volume_score: float = 0.0
    revenue_score: float = 0.0
    guest_satisfaction_score: float = 0.0
    response_time_score: float = 0.0
    content_quality_score: float = 0.0
    rate_competitiveness_score: float = 0.0
    cancellation_score: float = 0.0


@dataclass
class MarketIntelligence:
    """Market insights for a destination/country."""
    destination: str
    country_code: str
    period: str
    avg_daily_rate: float = 0.0
    revpar: float = 0.0  # Revenue per available room
    occupancy_pct: float = 0.0
    demand_index: float = 0.0
    supply_index: float = 0.0
    price_trend: str = "stable"  # rising, falling, stable
    top_source_markets: list[dict] = field(default_factory=list)
    competitor_landscape: list[dict] = field(default_factory=list)
    seasonality_factor: float = 1.0


@dataclass
class RevenueForecast:
    """ML-predicted revenue for future periods."""
    property_id: Optional[str] = None
    destination: Optional[str] = None
    forecast_date: str = ""
    predicted_revenue: float = 0.0
    confidence_interval_low: float = 0.0
    confidence_interval_high: float = 0.0
    model_version: str = "v1.0"
    factors: dict[str, float] = field(default_factory=dict)


# --- Analytics Engine ---


class GDSAnalyticsEngine:
    """Core analytics engine for the Africa-first GDS."""

    def __init__(self):
        self._bookings_buffer: list[dict] = []
        self._events_buffer: list[dict] = []

    # --- Booking Analytics ---

    def compute_booking_metrics(
        self,
        bookings: list[dict],
        period: MetricPeriod,
        start_date: str,
        end_date: str,
    ) -> BookingMetrics:
        """Compute aggregated booking metrics for a period."""
        total = len(bookings)
        confirmed = sum(1 for b in bookings if b.get("status") == "confirmed")
        cancelled = sum(1 for b in bookings if b.get("status") == "cancelled")
        revenue = sum(b.get("total_amount", 0) for b in bookings if b.get("status") != "cancelled")

        # Country breakdown
        country_counts: dict[str, int] = {}
        for b in bookings:
            country = b.get("guest_country", "Unknown")
            country_counts[country] = country_counts.get(country, 0) + 1

        top_countries = sorted(
            [{"country": k, "bookings": v} for k, v in country_counts.items()],
            key=lambda x: x["bookings"],
            reverse=True,
        )[:10]

        return BookingMetrics(
            period=period.value,
            period_start=start_date,
            period_end=end_date,
            total_bookings=total,
            confirmed_bookings=confirmed,
            cancelled_bookings=cancelled,
            total_revenue=revenue,
            average_booking_value=revenue / max(confirmed, 1),
            cancellation_rate=cancelled / max(total, 1),
            top_countries=top_countries,
        )

    # --- Agent Performance ---

    def compute_agent_performance(
        self,
        agent_id: str,
        agent_name: str,
        bookings: list[dict],
        period: str,
    ) -> AgentPerformance:
        """Calculate agent performance metrics."""
        agent_bookings = [b for b in bookings if b.get("agent_id") == agent_id]
        total = len(agent_bookings)
        revenue = sum(b.get("total_amount", 0) for b in agent_bookings)
        commission = sum(b.get("commission", 0) for b in agent_bookings)
        cancelled = sum(1 for b in agent_bookings if b.get("status") == "cancelled")

        # Score: 0-100 based on volume, revenue, and quality
        volume_score = min(total / 10, 10) * 3  # Max 30 points for volume
        revenue_score = min(revenue / 10000, 10) * 4  # Max 40 points for revenue
        quality_score = (1 - cancelled / max(total, 1)) * 30  # Max 30 for low cancellation

        score = volume_score + revenue_score + quality_score

        # Determine tier
        tier = "bronze"
        if score >= 80:
            tier = "platinum"
        elif score >= 60:
            tier = "gold"
        elif score >= 40:
            tier = "silver"

        return AgentPerformance(
            agent_id=agent_id,
            agent_name=agent_name,
            period=period,
            total_bookings=total,
            total_revenue=revenue,
            commission_earned=commission,
            cancellation_rate=cancelled / max(total, 1),
            average_booking_value=revenue / max(total, 1),
            tier=tier,
            score=round(score, 1),
        )

    # --- Property Scoring ---

    def compute_property_score(
        self,
        property_id: str,
        property_name: str,
        bookings: list[dict],
        reviews: list[dict],
    ) -> PropertyScore:
        """Calculate property quality/performance score."""
        prop_bookings = [b for b in bookings if b.get("property_id") == property_id]
        prop_reviews = [r for r in reviews if r.get("property_id") == property_id]

        # Volume score (normalized)
        volume_score = min(len(prop_bookings) / 50, 1.0) * 100

        # Revenue score
        revenue = sum(b.get("total_amount", 0) for b in prop_bookings)
        revenue_score = min(revenue / 50000, 1.0) * 100

        # Guest satisfaction (from reviews)
        if prop_reviews:
            avg_rating = sum(r.get("rating", 0) for r in prop_reviews) / len(prop_reviews)
            satisfaction_score = (avg_rating / 5) * 100
        else:
            satisfaction_score = 50.0  # Neutral if no reviews

        # Cancellation score (lower = better)
        if prop_bookings:
            cancel_rate = sum(1 for b in prop_bookings if b.get("status") == "cancelled") / len(prop_bookings)
            cancellation_score = (1 - cancel_rate) * 100
        else:
            cancellation_score = 50.0

        # Overall composite
        overall = (
            volume_score * 0.2
            + revenue_score * 0.25
            + satisfaction_score * 0.30
            + cancellation_score * 0.25
        )

        return PropertyScore(
            property_id=property_id,
            property_name=property_name,
            overall_score=round(overall, 1),
            booking_volume_score=round(volume_score, 1),
            revenue_score=round(revenue_score, 1),
            guest_satisfaction_score=round(satisfaction_score, 1),
            cancellation_score=round(cancellation_score, 1),
        )

    # --- Market Intelligence ---

    def compute_market_intelligence(
        self,
        destination: str,
        country_code: str,
        bookings: list[dict],
        total_rooms: int,
        period: str,
    ) -> MarketIntelligence:
        """Generate market intelligence for a destination."""
        dest_bookings = [
            b for b in bookings
            if b.get("country") == country_code or b.get("destination") == destination
        ]

        total_revenue = sum(b.get("total_amount", 0) for b in dest_bookings)
        room_nights = sum(b.get("nights", 1) for b in dest_bookings)

        adr = total_revenue / max(room_nights, 1)
        occupancy = min(room_nights / max(total_rooms * 30, 1), 1.0)  # Assume 30-day period
        revpar = adr * occupancy

        # Source market analysis
        source_counts: dict[str, int] = {}
        for b in dest_bookings:
            source = b.get("guest_country", "Unknown")
            source_counts[source] = source_counts.get(source, 0) + 1

        top_sources = sorted(
            [{"country": k, "bookings": v} for k, v in source_counts.items()],
            key=lambda x: x["bookings"],
            reverse=True,
        )[:5]

        return MarketIntelligence(
            destination=destination,
            country_code=country_code,
            period=period,
            avg_daily_rate=round(adr, 2),
            revpar=round(revpar, 2),
            occupancy_pct=round(occupancy * 100, 1),
            top_source_markets=top_sources,
        )

    # --- Revenue Forecasting ---

    def forecast_revenue(
        self,
        property_id: str,
        historical_revenue: list[float],
        forecast_days: int = 30,
    ) -> list[RevenueForecast]:
        """Simple time-series revenue forecast."""
        if not historical_revenue:
            return []

        # Simple moving average + trend
        n = len(historical_revenue)
        avg = sum(historical_revenue) / n

        # Detect trend (simple linear)
        if n >= 7:
            recent_avg = sum(historical_revenue[-7:]) / 7
            older_avg = sum(historical_revenue[:7]) / 7
            trend = (recent_avg - older_avg) / max(older_avg, 1)
        else:
            trend = 0.0

        forecasts = []
        for day in range(1, forecast_days + 1):
            predicted = avg * (1 + trend * day / 30)
            confidence_low = predicted * 0.8
            confidence_high = predicted * 1.2

            forecasts.append(RevenueForecast(
                property_id=property_id,
                forecast_date=(datetime.now() + timedelta(days=day)).strftime("%Y-%m-%d"),
                predicted_revenue=round(max(0, predicted), 2),
                confidence_interval_low=round(max(0, confidence_low), 2),
                confidence_interval_high=round(confidence_high, 2),
                factors={"trend": round(trend, 4), "base_avg": round(avg, 2)},
            ))

        return forecasts

    # --- Lakehouse Integration ---

    def export_to_lakehouse(self, table: str, data: list[dict]) -> dict:
        """Export analytics data to lakehouse (Iceberg/Delta format)."""
        # In production: write Parquet files to S3/MinIO, register with Iceberg catalog
        return {
            "table": table,
            "rows_written": len(data),
            "format": "parquet",
            "timestamp": datetime.now().isoformat(),
        }

    def ingest_from_kafka(self, topic: str, batch_size: int = 100) -> int:
        """Consume events from Kafka topic into analytics buffer."""
        # In production: Kafka consumer reads events, batches for processing
        return 0

    def ingest_from_fluvio(self, topic: str) -> int:
        """Consume real-time events from Fluvio stream."""
        # In production: Fluvio consumer for ultra-low-latency streaming
        return 0


# --- FastAPI Application ---


def create_gds_analytics_app():
    """Create the GDS Analytics FastAPI application."""
    try:
        from fastapi import FastAPI, Query as Q
        from fastapi.middleware.cors import CORSMiddleware
    except ImportError:
        return None

    app = FastAPI(
        title="TourismPay Africa GDS - Analytics & Intelligence",
        description="Booking analytics, agent performance, market intelligence, and revenue forecasting",
        version="1.0.0",
    )

    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    engine = GDSAnalyticsEngine()

    @app.get("/health")
    async def health():
        return {"status": "healthy", "service": "gds-analytics", "version": "1.0.0"}

    @app.get("/api/v1/gds/analytics/bookings")
    async def booking_analytics(
        period: str = Q("daily"),
        start_date: str = Q(None),
        end_date: str = Q(None),
    ):
        metrics = engine.compute_booking_metrics(
            [], MetricPeriod(period),
            start_date or datetime.now().strftime("%Y-%m-%d"),
            end_date or datetime.now().strftime("%Y-%m-%d"),
        )
        return metrics

    @app.get("/api/v1/gds/analytics/agents/{agent_id}")
    async def agent_analytics(agent_id: str, period: str = Q("monthly")):
        perf = engine.compute_agent_performance(agent_id, "Agent", [], period)
        return perf

    @app.get("/api/v1/gds/analytics/market")
    async def market_intelligence(
        destination: str = Q(...),
        country: str = Q(...),
        period: str = Q("monthly"),
    ):
        intel = engine.compute_market_intelligence(destination, country, [], 100, period)
        return intel

    @app.get("/api/v1/gds/analytics/forecast")
    async def revenue_forecast(property_id: str = Q(...), days: int = Q(30)):
        # Placeholder historical data
        historical = [100.0, 120.0, 110.0, 130.0, 125.0, 140.0, 135.0]
        forecasts = engine.forecast_revenue(property_id, historical, days)
        return {"property_id": property_id, "forecasts": forecasts[:7]}

    @app.get("/api/v1/gds/analytics/lakehouse/status")
    async def lakehouse_status():
        return {
            "status": "connected",
            "tables": [
                "gds_bookings", "gds_agents", "gds_properties",
                "gds_rates", "gds_market_intel", "gds_revenue_forecasts",
            ],
            "last_sync": datetime.now().isoformat(),
        }

    return app


if __name__ == "__main__":
    app = create_gds_analytics_app()
    if app:
        import uvicorn
        uvicorn.run(app, host="0.0.0.0", port=8011)
