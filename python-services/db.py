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
