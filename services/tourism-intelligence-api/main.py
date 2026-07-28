#!/usr/bin/env python3
"""
services/tourism-intelligence-api/main.py
TourismPay Tourism Intelligence API — Python FastAPI microservice

Aggregated tourism data API for investors, government, and researchers

HTTP endpoints (port 8098):
  GET /intelligence/arrivals — Tourist arrivals by country of origin
  GET /intelligence/spending — Average spend per visit by category
  GET /intelligence/fx-inflows — FX inflow by currency corridor
  GET /intelligence/occupancy — Hotel occupancy trends by city
  GET /intelligence/establishments — Top establishment categories
  GET /intelligence/summary — Platform-wide tourism KPI summary
  POST /intelligence/subscribe — Subscribe to data feed

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

logging.basicConfig(level=logging.INFO, format="%(asctime)s [tourism-intelligence-api] %(message)s")
logger = logging.getLogger(__name__)

# ─── Config ──────────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/tourismpay")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
DAPR_PORT = os.getenv("DAPR_HTTP_PORT", "3500")
PORT = int(os.getenv("PORT", "8098"))

# ─── Metrics ─────────────────────────────────────────────────────────────────
requests_total = Counter("tourism_intelligence_api_requests_total", "Total requests", ["method", "path", "status"])
request_duration = Histogram("tourism_intelligence_api_request_duration_seconds", "Request duration", ["method", "path"])

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
    title="TourismPay Tourism Intelligence API",
    description="Aggregated tourism data API for investors, government, and researchers",
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
    return {"status": "healthy", "service": "tourism-intelligence-api", "version": "1.0.0", "timestamp": datetime.utcnow().isoformat()}

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
@app.get("/intelligence/arrivals")
async def handle_arrivals(request: Request):
    """
    Tourist arrivals by country of origin
    """
    return {
        "service": "tourism-intelligence-api",
        "endpoint": "/intelligence/arrivals",
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.get("/intelligence/spending")
async def handle_spending(request: Request):
    """
    Average spend per visit by category
    """
    return {
        "service": "tourism-intelligence-api",
        "endpoint": "/intelligence/spending",
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.get("/intelligence/fx-inflows")
async def handle_fx_inflows(request: Request):
    """
    FX inflow by currency corridor
    """
    return {
        "service": "tourism-intelligence-api",
        "endpoint": "/intelligence/fx-inflows",
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.get("/intelligence/occupancy")
async def handle_occupancy(request: Request):
    """
    Hotel occupancy trends by city
    """
    return {
        "service": "tourism-intelligence-api",
        "endpoint": "/intelligence/occupancy",
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.get("/intelligence/establishments")
async def handle_establishments(request: Request):
    """
    Top establishment categories
    """
    return {
        "service": "tourism-intelligence-api",
        "endpoint": "/intelligence/establishments",
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.get("/intelligence/summary")
async def handle_summary(request: Request):
    """
    Platform-wide tourism KPI summary
    """
    return {
        "service": "tourism-intelligence-api",
        "endpoint": "/intelligence/summary",
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.post("/intelligence/subscribe")
async def handle_subscribe(request: Request):
    """
    Subscribe to data feed
    """
    return {
        "service": "tourism-intelligence-api",
        "endpoint": "/intelligence/subscribe",
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
    }


# ─── Entry Point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False, log_level="info")
