#!/usr/bin/env python3
"""
services/revenue-management-service/main.py
TourismPay AI Revenue Management — Python FastAPI microservice

AI-powered hotel pricing recommendations and demand forecasting

HTTP endpoints (port 8097):
  GET /revenue/recommendations/{hotel_id} — Get AI pricing recommendations
  GET /revenue/forecast/{hotel_id} — Get demand forecast
  GET /revenue/competitors/{hotel_id} — Get competitor rate analysis
  POST /revenue/apply/{hotel_id} — Apply recommended pricing
  GET /revenue/performance/{hotel_id} — Get RevPAR performance metrics

Middleware: Dapr pub/sub, Redis cache, PostgreSQL, OpenSearch
"""
import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Dict, List, Optional

import asyncpg
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response

logging.basicConfig(level=logging.INFO, format="%(asctime)s [revenue-management-service] %(message)s")
logger = logging.getLogger(__name__)

# ─── Config ──────────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/tourismpay")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
DAPR_PORT = os.getenv("DAPR_HTTP_PORT", "3500")
PORT = int(os.getenv("PORT", "8097"))

# ─── Metrics ─────────────────────────────────────────────────────────────────
requests_total = Counter("revenue_management_service_requests_total", "Total requests", ["method", "path", "status"])
request_duration = Histogram("revenue_management_service_request_duration_seconds", "Request duration", ["method", "path"])

# ─── App Lifecycle ────────────────────────────────────────────────────────────
db_pool: Optional[asyncpg.Pool] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool
    try:
        db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        logger.info("Connected to PostgreSQL")
    except Exception as e:
        logger.warning(f"Could not connect to PostgreSQL: {e}")
    yield
    if db_pool:
        await db_pool.close()

app = FastAPI(
    title="TourismPay AI Revenue Management",
    description="AI-powered hotel pricing recommendations and demand forecasting",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Middleware ───────────────────────────────────────────────────────────────
@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    requests_total.labels(request.method, request.url.path, response.status_code).inc()
    request_duration.labels(request.method, request.url.path).observe(duration)
    return response

# ─── Health & Metrics ─────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "healthy", "service": "revenue-management-service", "version": "1.0.0", "timestamp": datetime.utcnow().isoformat()}

@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

# ─── Dapr pub/sub ─────────────────────────────────────────────────────────────
async def publish_event(topic: str, data: dict):
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                f"http://localhost:{DAPR_PORT}/v1.0/publish/tourismpay-pubsub/{topic}",
                json={"data": data, "datacontenttype": "application/json"},
            )
    except Exception as e:
        logger.warning(f"Dapr publish failed topic={topic}: {e}")

# ─── Route Handlers ───────────────────────────────────────────────────────────
@app.get("/revenue/recommendations/{hotel_id}")
async def handle_recommendations(request: Request):
    """
    Get AI pricing recommendations
    """
    return {
        "service": "revenue-management-service",
        "endpoint": "/revenue/recommendations/{hotel_id}",
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.get("/revenue/forecast/{hotel_id}")
async def handle_forecast(request: Request):
    """
    Get demand forecast
    """
    return {
        "service": "revenue-management-service",
        "endpoint": "/revenue/forecast/{hotel_id}",
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.get("/revenue/competitors/{hotel_id}")
async def handle_competitors(request: Request):
    """
    Get competitor rate analysis
    """
    return {
        "service": "revenue-management-service",
        "endpoint": "/revenue/competitors/{hotel_id}",
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.post("/revenue/apply/{hotel_id}")
async def handle_apply_pricing(request: Request):
    """
    Apply recommended pricing
    """
    return {
        "service": "revenue-management-service",
        "endpoint": "/revenue/apply/{hotel_id}",
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.get("/revenue/performance/{hotel_id}")
async def handle_performance(request: Request):
    """
    Get RevPAR performance metrics
    """
    return {
        "service": "revenue-management-service",
        "endpoint": "/revenue/performance/{hotel_id}",
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
    }


# ─── Entry Point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False, log_level="info")
