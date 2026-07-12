"""
conftest.py — Shared pytest fixtures and configuration for TourismPay Python test suite.
"""

import asyncio
import os
import sys
from typing import Any, Dict, Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ─── Ensure python-services is on the path ───────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ─── Async event loop ─────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def event_loop():
    """Create a single event loop for the entire test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()

# ─── Environment mocking ──────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def mock_env_vars():
    """Provide safe default environment variables for all tests."""
    env = {
        "DATABASE_URL": "postgresql://tourismpay:test@localhost:5432/tourismpay_test",
        "REDIS_URL": "redis://localhost:6379",
        "KAFKA_BROKERS": "localhost:9092",
        "PERMIFY_URL": "",  # Disabled by default
        "PERMIFY_TENANT_ID": "tourismpay",
        "ENAIRA_GATEWAY_URL": "http://localhost:8090",
        "NODE_ENV": "test",
        "JWT_SECRET": "test-secret-key",
    }
    with patch.dict(os.environ, env, clear=False):
        yield env

# ─── Database mocking ─────────────────────────────────────────────────────────

@pytest.fixture
def mock_db_pool():
    """Mock asyncpg connection pool."""
    pool = MagicMock()
    pool.acquire = AsyncMock()
    pool.fetchrow = AsyncMock(return_value=None)
    pool.fetch = AsyncMock(return_value=[])
    pool.execute = AsyncMock(return_value="OK")
    pool.executemany = AsyncMock(return_value=None)
    return pool

# ─── Redis mocking ────────────────────────────────────────────────────────────

@pytest.fixture
def mock_redis():
    """Mock Redis client."""
    redis = MagicMock()
    redis.get = AsyncMock(return_value=None)
    redis.set = AsyncMock(return_value=True)
    redis.delete = AsyncMock(return_value=1)
    redis.exists = AsyncMock(return_value=0)
    redis.expire = AsyncMock(return_value=True)
    return redis

# ─── Kafka mocking ────────────────────────────────────────────────────────────

@pytest.fixture
def mock_kafka_producer():
    """Mock Kafka producer."""
    producer = MagicMock()
    producer.send = MagicMock(return_value=MagicMock())
    producer.flush = MagicMock()
    producer.close = MagicMock()
    return producer

# ─── MinIO mocking ────────────────────────────────────────────────────────────

@pytest.fixture
def mock_minio():
    """Mock MinIO client."""
    minio = MagicMock()
    minio.put_object = MagicMock(return_value=None)
    minio.get_object = MagicMock(return_value=MagicMock())
    minio.bucket_exists = MagicMock(return_value=True)
    minio.make_bucket = MagicMock(return_value=None)
    return minio

# ─── Trino mocking ────────────────────────────────────────────────────────────

@pytest.fixture
def mock_trino():
    """Mock Trino connection."""
    conn = MagicMock()
    cursor = MagicMock()
    cursor.execute = MagicMock(return_value=None)
    cursor.fetchall = MagicMock(return_value=[])
    cursor.description = []
    conn.cursor.return_value = cursor
    return conn

# ─── eNaira Gateway mocking ───────────────────────────────────────────────────

@pytest.fixture
def mock_enaira_gateway():
    """Mock eNaira gateway HTTP client."""
    import httpx
    mock_response = MagicMock()
    mock_response.status_code = 201
    mock_response.json.return_value = {
        "id": "wallet-test-001",
        "cbn_wallet_id": "cbn-wallet-abc",
        "wallet_address": "eNGNabc123",
        "status": "active",
        "balance_kobo": 0,
        "kyc_level": 1,
    }
    mock_response.raise_for_status = MagicMock(return_value=None)

    with patch("httpx.AsyncClient") as mock_client:
        mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_client.return_value)
        mock_client.return_value.__aexit__ = AsyncMock(return_value=None)
        mock_client.return_value.post = AsyncMock(return_value=mock_response)
        mock_client.return_value.get = AsyncMock(return_value=mock_response)
        yield mock_client

# ─── Lakehouse mocking ────────────────────────────────────────────────────────

@pytest.fixture
def mock_lakehouse_disabled():
    """Mock lakehouse as disabled (no Trino/MinIO available)."""
    with patch("lakehouse.client.is_lakehouse_enabled", return_value=False):
        yield

@pytest.fixture
def mock_lakehouse_enabled(mock_minio, mock_trino):
    """Mock lakehouse as enabled with mock Trino and MinIO."""
    with patch("lakehouse.client.is_lakehouse_enabled", return_value=True), \
         patch("lakehouse.client._get_minio", return_value=mock_minio), \
         patch("lakehouse.client._get_trino", return_value=mock_trino):
        yield
