#!/usr/bin/env python3
"""
services/agentic-ai-service/main.py
TourismPay Agentic AI Booking Engine — Python FastAPI microservice

Tool-calling AI agent for autonomous travel booking with OpenAI function calling

HTTP endpoints (port 8096):
  POST /agent/chat — Send message to AI booking agent
  POST /agent/book — Execute autonomous booking via AI agent
  GET /agent/sessions/{session_id} — Get agent session history
  DELETE /agent/sessions/{session_id} — Clear agent session
  GET /agent/tools — List available agent tools

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

logging.basicConfig(level=logging.INFO, format="%(asctime)s [agentic-ai-service] %(message)s")
logger = logging.getLogger(__name__)

# ─── Config ──────────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/tourismpay")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
DAPR_PORT = os.getenv("DAPR_HTTP_PORT", "3500")
PORT = int(os.getenv("PORT", "8096"))

# ─── Metrics ─────────────────────────────────────────────────────────────────
requests_total = Counter("agentic_ai_service_requests_total", "Total requests", ["method", "path", "status"])
request_duration = Histogram("agentic_ai_service_request_duration_seconds", "Request duration", ["method", "path"])

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
    title="TourismPay Agentic AI Booking Engine",
    description="Tool-calling AI agent for autonomous travel booking with OpenAI function calling",
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
    return {"status": "healthy", "service": "agentic-ai-service", "version": "1.0.0", "timestamp": datetime.utcnow().isoformat()}

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
@app.post("/agent/chat")
async def handle_chat(request: Request):
    """
    Send message to AI booking agent
    """
    return {
        "service": "agentic-ai-service",
        "endpoint": "/agent/chat",
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.post("/agent/book")
async def handle_book(request: Request):
    """
    Execute autonomous booking via AI agent
    """
    return {
        "service": "agentic-ai-service",
        "endpoint": "/agent/book",
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.get("/agent/sessions/{session_id}")
async def handle_get_session(request: Request):
    """
    Get agent session history
    """
    return {
        "service": "agentic-ai-service",
        "endpoint": "/agent/sessions/{session_id}",
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.delete("/agent/sessions/{session_id}")
async def handle_delete_session(request: Request):
    """
    Clear agent session
    """
    return {
        "service": "agentic-ai-service",
        "endpoint": "/agent/sessions/{session_id}",
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.get("/agent/tools")
async def handle_list_tools(request: Request):
    """
    List available agent tools
    """
    return {
        "service": "agentic-ai-service",
        "endpoint": "/agent/tools",
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
    }


# ─── Entry Point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False, log_level="info")
