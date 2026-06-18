"""
Shared PostgreSQL database module for TourismPay Python services.
Provides async connection pooling via asyncpg with graceful fallback.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger("tourismpay.db")

_pool = None


def _get_dsn() -> str:
    dsn = os.environ.get("ML_DATABASE_URL", "")
    if not dsn:
        dsn = os.environ.get("DATABASE_URL", "")
    if not dsn:
        dsn = "postgresql://tourismpay_user:testpass123@localhost:5432/tourismpay_settlement"
    return dsn


async def get_pool():
    global _pool
    if _pool is not None:
        return _pool
    try:
        import asyncpg
        dsn = _get_dsn()
        _pool = await asyncpg.create_pool(
            dsn,
            min_size=2,
            max_size=10,
            command_timeout=10,
        )
        logger.info("PostgreSQL pool created: %s", dsn.split("@")[-1] if "@" in dsn else dsn)
        return _pool
    except Exception as e:
        logger.warning("Failed to create PostgreSQL pool: %s (falling back to in-memory)", e)
        return None


async def close_pool():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def execute(query: str, *args) -> Optional[str]:
    pool = await get_pool()
    if pool is None:
        return None
    try:
        return await pool.execute(query, *args)
    except Exception as e:
        logger.error("DB execute error: %s", e)
        return None


async def fetch(query: str, *args) -> List[Dict[str, Any]]:
    pool = await get_pool()
    if pool is None:
        return []
    try:
        rows = await pool.fetch(query, *args)
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error("DB fetch error: %s", e)
        return []


async def fetchrow(query: str, *args) -> Optional[Dict[str, Any]]:
    pool = await get_pool()
    if pool is None:
        return None
    try:
        row = await pool.fetchrow(query, *args)
        return dict(row) if row else None
    except Exception as e:
        logger.error("DB fetchrow error: %s", e)
        return None


async def fetchval(query: str, *args) -> Any:
    pool = await get_pool()
    if pool is None:
        return None
    try:
        return await pool.fetchval(query, *args)
    except Exception as e:
        logger.error("DB fetchval error: %s", e)
        return None


async def ensure_tables():
    """Create service-specific tables if they don't exist."""
    migrations = [
        """CREATE TABLE IF NOT EXISTS fraud_scores (
            id SERIAL PRIMARY KEY,
            transaction_id VARCHAR(128) NOT NULL,
            user_id VARCHAR(128) NOT NULL,
            score REAL NOT NULL,
            risk_level VARCHAR(20) NOT NULL,
            factors JSONB NOT NULL DEFAULT '[]',
            scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_fraud_scores_txn ON fraud_scores(transaction_id)",
        "CREATE INDEX IF NOT EXISTS idx_fraud_scores_user ON fraud_scores(user_id)",
        """CREATE TABLE IF NOT EXISTS compliance_screenings (
            id SERIAL PRIMARY KEY,
            entity_id VARCHAR(128) NOT NULL,
            entity_type VARCHAR(20) NOT NULL,
            risk_score REAL NOT NULL,
            risk_level VARCHAR(20) NOT NULL,
            pep_match BOOLEAN NOT NULL DEFAULT FALSE,
            sanctions_match BOOLEAN NOT NULL DEFAULT FALSE,
            factors JSONB NOT NULL DEFAULT '[]',
            screened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_compliance_entity ON compliance_screenings(entity_id)",
        """CREATE TABLE IF NOT EXISTS fx_rate_predictions (
            id SERIAL PRIMARY KEY,
            base_currency VARCHAR(10) NOT NULL,
            quote_currency VARCHAR(10) NOT NULL,
            predicted_rate REAL NOT NULL,
            confidence REAL NOT NULL,
            horizon_hours INT NOT NULL DEFAULT 24,
            predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_fx_pair ON fx_rate_predictions(base_currency, quote_currency)",
        """CREATE TABLE IF NOT EXISTS generated_reports (
            id SERIAL PRIMARY KEY,
            report_type VARCHAR(64) NOT NULL,
            entity_id VARCHAR(128),
            file_key VARCHAR(256),
            generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS bis_ai_scores (
            id SERIAL PRIMARY KEY,
            investigation_id VARCHAR(128),
            subject_name VARCHAR(256) NOT NULL,
            risk_score REAL NOT NULL,
            risk_level VARCHAR(20) NOT NULL,
            factors JSONB NOT NULL DEFAULT '[]',
            scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_bis_ai_inv ON bis_ai_scores(investigation_id)",
        """CREATE TABLE IF NOT EXISTS ride_bookings (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(128) NOT NULL,
            provider VARCHAR(32) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'requested',
            pickup_address TEXT,
            dropoff_address TEXT,
            estimated_fare REAL,
            final_fare REAL,
            currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
            payment_method VARCHAR(32),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_ride_user ON ride_bookings(user_id)",
        """CREATE TABLE IF NOT EXISTS carbon_credit_purchases (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(128) NOT NULL,
            project_id VARCHAR(64) NOT NULL,
            tonnes REAL NOT NULL,
            price_per_tonne REAL NOT NULL,
            total_cost REAL NOT NULL,
            currency VARCHAR(10) NOT NULL DEFAULT 'USD',
            status VARCHAR(20) NOT NULL DEFAULT 'completed',
            purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS tax_compliance_reports (
            id SERIAL PRIMARY KEY,
            jurisdiction VARCHAR(10) NOT NULL,
            entity_id VARCHAR(128),
            report_type VARCHAR(32) NOT NULL,
            period VARCHAR(20),
            total_collected REAL NOT NULL DEFAULT 0,
            total_remitted REAL NOT NULL DEFAULT 0,
            status VARCHAR(20) NOT NULL DEFAULT 'generated',
            generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS smart_convert_orders (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(128) NOT NULL,
            from_currency VARCHAR(10) NOT NULL,
            to_currency VARCHAR(10) NOT NULL,
            amount REAL NOT NULL,
            target_rate REAL NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_smart_convert_user ON smart_convert_orders(user_id)",
        """CREATE TABLE IF NOT EXISTS analytics_snapshots (
            id SERIAL PRIMARY KEY,
            snapshot_type VARCHAR(32) NOT NULL,
            entity_id VARCHAR(128),
            data JSONB NOT NULL DEFAULT '{}',
            period VARCHAR(20),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_snapshots(snapshot_type)",
    ]
    pool = await get_pool()
    if pool is None:
        return
    async with pool.acquire() as conn:
        for migration in migrations:
            try:
                await conn.execute(migration)
            except Exception as e:
                logger.warning("Migration error (non-fatal): %s", e)
