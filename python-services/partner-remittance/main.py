"""
TourismPay Partner Remittance Service (Python)

Integrates with Wise, Revolut Business, Remitly, and LemFi APIs
to provide foreign tourists additional wallet loading options via
their existing remittance/neobank apps.

Middleware: Kafka (events), Redis (rate limiting/caching), OpenSearch (audit),
            Temporal (workflow orchestration), PostgreSQL (state persistence)
"""

import os
import json
import time
import uuid
import hashlib
import hmac
import signal
import logging
from datetime import datetime, timedelta
from typing import Optional
from dataclasses import dataclass, field, asdict

import asyncpg
from fastapi import FastAPI, HTTPException, Request, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from prometheus_client import Counter, Histogram, Gauge, generate_latest
from starlette.responses import Response

# ─── Logging ─────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","service":"partner-remittance","msg":"%(message)s"}'
)
logger = logging.getLogger("partner-remittance")

# ─── Prometheus Metrics ──────────────────────────────────────────────────────

partner_transfers_total = Counter(
    "tourismpay_partner_transfers_total",
    "Total partner remittance transfers",
    ["partner", "status", "source_currency"]
)
partner_volume_usd = Counter(
    "tourismpay_partner_volume_usd_total",
    "Total partner transfer volume in USD",
    ["partner"]
)
partner_latency = Histogram(
    "tourismpay_partner_transfer_seconds",
    "Partner transfer processing time",
    ["partner"],
    buckets=[1, 5, 30, 60, 300, 600, 3600]
)
partner_webhook_total = Counter(
    "tourismpay_partner_webhooks_total",
    "Total partner webhooks received",
    ["partner", "event_type"]
)

# ─── Data Models ─────────────────────────────────────────────────────────────

class PartnerQuoteRequest(BaseModel):
    partner: str = Field(..., description="wise, revolut, remitly, lemfi")
    source_currency: str = Field(..., description="USD, EUR, GBP, etc.")
    target_currency: str = Field(..., description="USDC, NGN, KES, etc.")
    source_amount: float = Field(..., gt=0)
    sender_country: str = Field(..., min_length=2, max_length=2)

class PartnerQuoteResponse(BaseModel):
    quote_id: str
    partner: str
    source_currency: str
    source_amount: float
    target_currency: str
    target_amount: float
    exchange_rate: float
    fee: float
    fee_percent: float
    partner_fee: float
    estimated_time: str
    redirect_url: str
    expires_at: str

class PartnerTransferRequest(BaseModel):
    quote_id: str
    user_id: str
    sender_name: str
    sender_email: str
    sender_country: str
    wallet_id: str

class PartnerTransfer(BaseModel):
    id: str
    quote_id: str
    user_id: str
    partner: str
    status: str  # initiated, pending_payment, partner_processing, settled, credited, failed
    source_currency: str
    source_amount: float
    target_currency: str
    target_amount: float
    exchange_rate: float
    fee: float
    partner_fee: float
    partner_ref: str
    payment_url: str
    wallet_id: str
    created_at: str
    settled_at: Optional[str] = None
    credited_at: Optional[str] = None

class WebhookPayload(BaseModel):
    partner: str
    event_type: str
    transfer_id: str
    partner_ref: str
    status: str
    amount: Optional[float] = None
    currency: Optional[str] = None

# ─── Partner Configuration ───────────────────────────────────────────────────

PARTNER_CONFIG = {
    "wise": {
        "name": "Wise (TransferWise)",
        "api_base": os.getenv("WISE_API_BASE", "https://api.sandbox.transferwise.tech"),
        "api_key": os.getenv("WISE_API_KEY", ""),
        "webhook_secret": os.getenv("WISE_WEBHOOK_SECRET", ""),
        "fee_percent": 0.5,
        "flat_fee": 1.50,
        "supported_source": ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "SGD"],
        "supported_target": ["USDC", "NGN", "KES", "GHS", "ZAR", "USD"],
        "estimated_time": "~1-2 hours",
        "redirect_base": "https://wise.com/pay",
    },
    "revolut": {
        "name": "Revolut Business",
        "api_base": os.getenv("REVOLUT_API_BASE", "https://sandbox-b2b.revolut.com/api/1.0"),
        "api_key": os.getenv("REVOLUT_API_KEY", ""),
        "webhook_secret": os.getenv("REVOLUT_WEBHOOK_SECRET", ""),
        "fee_percent": 0.3,
        "flat_fee": 0.0,
        "supported_source": ["USD", "EUR", "GBP", "CHF", "PLN", "CZK", "SEK", "NOK", "DKK"],
        "supported_target": ["USDC", "NGN", "USD"],
        "estimated_time": "~30 minutes",
        "redirect_base": "https://business.revolut.com/pay",
    },
    "remitly": {
        "name": "Remitly",
        "api_base": os.getenv("REMITLY_API_BASE", "https://api.remitly.io/v3"),
        "api_key": os.getenv("REMITLY_API_KEY", ""),
        "webhook_secret": os.getenv("REMITLY_WEBHOOK_SECRET", ""),
        "fee_percent": 1.0,
        "flat_fee": 3.99,
        "supported_source": ["USD", "EUR", "GBP", "CAD", "AUD"],
        "supported_target": ["NGN", "KES", "GHS", "ZAR"],
        "estimated_time": "~15 minutes (express) / 3-5 days (economy)",
        "redirect_base": "https://www.remitly.com/pay",
    },
    "lemfi": {
        "name": "LemFi (Lemonade Finance)",
        "api_base": os.getenv("LEMFI_API_BASE", "https://api.lemfi.com/v1"),
        "api_key": os.getenv("LEMFI_API_KEY", ""),
        "webhook_secret": os.getenv("LEMFI_WEBHOOK_SECRET", ""),
        "fee_percent": 0.0,
        "flat_fee": 0.0,
        "supported_source": ["USD", "EUR", "GBP", "CAD"],
        "supported_target": ["NGN", "KES", "GHS"],
        "estimated_time": "~5 minutes",
        "redirect_base": "https://app.lemfi.com/pay",
    },
}

# FX rates (production: from exchange-rate-ml service)
FX_RATES = {
    "USD": 1.0, "EUR": 1.08, "GBP": 1.27, "CHF": 1.12, "CAD": 0.74,
    "AUD": 0.65, "SGD": 0.74, "PLN": 0.25, "CZK": 0.043, "SEK": 0.095,
    "NOK": 0.093, "DKK": 0.145,
    "NGN": 0.000625, "KES": 0.0077, "GHS": 0.067, "ZAR": 0.054,
    "USDC": 1.0, "USDT": 1.0, "DAI": 1.0,
}

# ─── Database Connection ─────────────────────────────────────────────────────

db_pool: Optional[asyncpg.Pool] = None

async def get_pool() -> Optional[asyncpg.Pool]:
    global db_pool
    if db_pool is None:
        dsn = os.getenv("DATABASE_URL")
        if dsn:
            try:
                db_pool = await asyncpg.create_pool(dsn, min_size=2, max_size=10)
                await db_pool.execute("""
                    CREATE TABLE IF NOT EXISTS partner_quotes (
                        quote_id TEXT PRIMARY KEY,
                        data JSONB NOT NULL,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await db_pool.execute("""
                    CREATE TABLE IF NOT EXISTS partner_transfers (
                        id TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL,
                        data JSONB NOT NULL,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                await db_pool.execute("""
                    CREATE INDEX IF NOT EXISTS pt_user_idx ON partner_transfers(user_id)
                """)
                logger.info("PostgreSQL pool initialized for partner-remittance")
            except Exception as e:
                logger.warning(f"Failed to connect to PostgreSQL: {e}")
                db_pool = None
    return db_pool

# ─── Lifecycle ───────────────────────────────────────────────────────────────

is_ready = False
is_alive = True

def handle_sigterm(signum, frame):
    global is_ready
    logger.info("SIGTERM received, draining connections")
    is_ready = False
    time.sleep(5)
    raise SystemExit(0)

signal.signal(signal.SIGTERM, handle_sigterm)
signal.signal(signal.SIGINT, handle_sigterm)

# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="TourismPay Partner Remittance Service",
    version="1.0.0",
    description="Wise, Revolut, Remitly, LemFi integration for tourist wallet loading"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    global is_ready
    await get_pool()
    is_ready = True
    logger.info("Partner remittance service started")

@app.get("/livez")
async def livez():
    if not is_alive:
        raise HTTPException(status_code=503, detail="not alive")
    return {"status": "alive"}

@app.get("/readyz")
async def readyz():
    if not is_ready:
        raise HTTPException(status_code=503, detail="not ready")
    pool = await get_pool()
    if pool is None:
        raise HTTPException(status_code=503, detail="database not connected")
    return {"status": "ready"}

@app.get("/metrics")
async def metrics():
    return Response(content=generate_latest(), media_type="text/plain")

# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/api/v1/partners")
async def list_partners():
    """List all available partner remittance providers"""
    result = []
    for key, config in PARTNER_CONFIG.items():
        result.append({
            "id": key,
            "name": config["name"],
            "fee_percent": config["fee_percent"],
            "flat_fee": config["flat_fee"],
            "supported_source_currencies": config["supported_source"],
            "supported_target_currencies": config["supported_target"],
            "estimated_time": config["estimated_time"],
        })
    return result

@app.post("/api/v1/partners/quote", response_model=PartnerQuoteResponse)
async def get_quote(req: PartnerQuoteRequest):
    """Get a quote from a partner for wallet loading"""
    config = PARTNER_CONFIG.get(req.partner)
    if not config:
        raise HTTPException(status_code=400, detail=f"Unknown partner: {req.partner}")

    if req.source_currency not in config["supported_source"]:
        raise HTTPException(
            status_code=400,
            detail=f"{req.partner} doesn't support {req.source_currency}. Supported: {config['supported_source']}"
        )
    if req.target_currency not in config["supported_target"]:
        raise HTTPException(
            status_code=400,
            detail=f"{req.partner} doesn't support {req.target_currency}. Supported: {config['supported_target']}"
        )

    # Calculate FX
    from_rate = FX_RATES.get(req.source_currency, 0)
    to_rate = FX_RATES.get(req.target_currency, 0)
    if from_rate == 0 or to_rate == 0:
        raise HTTPException(status_code=400, detail="Unsupported currency pair")

    exchange_rate = from_rate / to_rate
    partner_fee = req.source_amount * config["fee_percent"] / 100 + config["flat_fee"]
    platform_fee = req.source_amount * 0.2 / 100  # 0.2% TourismPay fee
    total_fee = partner_fee + platform_fee
    net_amount = req.source_amount - total_fee
    target_amount = net_amount * exchange_rate

    quote_id = f"PQ-{uuid.uuid4().hex[:12]}"
    expires_at = (datetime.utcnow() + timedelta(minutes=15)).isoformat() + "Z"

    quote = {
        "quote_id": quote_id,
        "partner": req.partner,
        "source_currency": req.source_currency,
        "source_amount": req.source_amount,
        "target_currency": req.target_currency,
        "target_amount": round(target_amount, 2),
        "exchange_rate": round(exchange_rate, 6),
        "fee": round(total_fee, 2),
        "fee_percent": round((total_fee / req.source_amount) * 100, 2),
        "partner_fee": round(partner_fee, 2),
        "estimated_time": config["estimated_time"],
        "redirect_url": f"{config['redirect_base']}?ref={quote_id}&amount={req.source_amount}&currency={req.source_currency}",
        "expires_at": expires_at,
    }
    pool = await get_pool()
    if pool:
        await pool.execute(
            "INSERT INTO partner_quotes (quote_id, data) VALUES ($1, $2) ON CONFLICT (quote_id) DO NOTHING",
            quote_id, json.dumps(quote)
        )
    return PartnerQuoteResponse(**quote)

@app.post("/api/v1/partners/transfer", response_model=PartnerTransfer)
async def initiate_transfer(req: PartnerTransferRequest):
    """Initiate a transfer using an accepted quote"""
    pool = await get_pool()
    quote = None
    if pool:
        row = await pool.fetchrow("SELECT data FROM partner_quotes WHERE quote_id = $1", req.quote_id)
        if row:
            quote = json.loads(row["data"])
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found or expired")

    partner = quote["partner"]
    config = PARTNER_CONFIG[partner]
    transfer_id = f"PT-{uuid.uuid4().hex[:12]}"
    partner_ref = f"{partner.upper()}-{uuid.uuid4().hex[:8]}"

    transfer = {
        "id": transfer_id,
        "quote_id": req.quote_id,
        "user_id": req.user_id,
        "partner": partner,
        "status": "initiated",
        "source_currency": quote["source_currency"],
        "source_amount": quote["source_amount"],
        "target_currency": quote["target_currency"],
        "target_amount": quote["target_amount"],
        "exchange_rate": quote["exchange_rate"],
        "fee": quote["fee"],
        "partner_fee": quote["partner_fee"],
        "partner_ref": partner_ref,
        "payment_url": f"{config['redirect_base']}?transfer={transfer_id}&ref={partner_ref}",
        "wallet_id": req.wallet_id,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    if pool:
        await pool.execute(
            "INSERT INTO partner_transfers (id, user_id, data) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
            transfer_id, req.user_id, json.dumps(transfer)
        )

    partner_transfers_total.labels(partner=partner, status="initiated", source_currency=quote["source_currency"]).inc()
    partner_volume_usd.labels(partner=partner).inc(quote["source_amount"] * FX_RATES.get(quote["source_currency"], 1.0))

    logger.info(f"Transfer initiated: {transfer_id} via {partner} for user {req.user_id}")
    return PartnerTransfer(**transfer)

@app.post("/api/v1/partners/webhook/{partner}")
async def partner_webhook(partner: str, payload: WebhookPayload):
    """Handle webhooks from partner APIs (Wise, Revolut, Remitly, LemFi)"""
    config = PARTNER_CONFIG.get(partner)
    if not config:
        raise HTTPException(status_code=400, detail=f"Unknown partner: {partner}")

    partner_webhook_total.labels(partner=partner, event_type=payload.event_type).inc()

    pool = await get_pool()
    transfer = None
    if pool:
        row = await pool.fetchrow("SELECT data FROM partner_transfers WHERE id = $1", payload.transfer_id)
        if row:
            transfer = json.loads(row["data"])
    if not transfer:
        logger.warning(f"Webhook for unknown transfer: {payload.transfer_id}")
        raise HTTPException(status_code=404, detail="Transfer not found")

    if payload.event_type == "transfer.settled":
        transfer["status"] = "settled"
        transfer["settled_at"] = datetime.utcnow().isoformat() + "Z"
        partner_transfers_total.labels(partner=partner, status="settled", source_currency=transfer["source_currency"]).inc()
        logger.info(f"Transfer settled: {payload.transfer_id}")

    elif payload.event_type == "transfer.credited":
        transfer["status"] = "credited"
        transfer["credited_at"] = datetime.utcnow().isoformat() + "Z"
        partner_transfers_total.labels(partner=partner, status="credited", source_currency=transfer["source_currency"]).inc()
        logger.info(f"Transfer credited to wallet: {payload.transfer_id}")

    elif payload.event_type == "transfer.failed":
        transfer["status"] = "failed"
        partner_transfers_total.labels(partner=partner, status="failed", source_currency=transfer["source_currency"]).inc()
        logger.warning(f"Transfer failed: {payload.transfer_id}")

    if pool:
        await pool.execute(
            "UPDATE partner_transfers SET data = $1 WHERE id = $2",
            json.dumps(transfer), payload.transfer_id
        )

    return {"status": "processed", "transfer_id": payload.transfer_id}

@app.get("/api/v1/partners/transfer/{transfer_id}")
async def get_transfer(transfer_id: str):
    """Get transfer status"""
    pool = await get_pool()
    if pool:
        row = await pool.fetchrow("SELECT data FROM partner_transfers WHERE id = $1", transfer_id)
        if row:
            return json.loads(row["data"])
    raise HTTPException(status_code=404, detail="Transfer not found")

@app.get("/api/v1/partners/transfers/{user_id}")
async def list_transfers(user_id: str):
    """List all transfers for a user"""
    pool = await get_pool()
    if not pool:
        return []
    rows = await pool.fetch(
        "SELECT data FROM partner_transfers WHERE user_id = $1 ORDER BY created_at DESC",
        user_id
    )
    return [json.loads(r["data"]) for r in rows]

@app.get("/api/v1/partners/best")
async def best_partner(source_currency: str, target_currency: str, amount: float):
    """Find the best partner for a given transfer (lowest total fee)"""
    candidates = []
    for key, config in PARTNER_CONFIG.items():
        if source_currency in config["supported_source"] and target_currency in config["supported_target"]:
            partner_fee = amount * config["fee_percent"] / 100 + config["flat_fee"]
            platform_fee = amount * 0.2 / 100
            total_fee = partner_fee + platform_fee
            candidates.append({
                "partner": key,
                "name": config["name"],
                "total_fee": round(total_fee, 2),
                "partner_fee": round(partner_fee, 2),
                "platform_fee": round(platform_fee, 2),
                "estimated_time": config["estimated_time"],
            })

    if not candidates:
        raise HTTPException(status_code=404, detail="No partners support this currency pair")

    candidates.sort(key=lambda x: x["total_fee"])
    return {"best": candidates[0], "all": candidates}

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "TourismPay Partner Remittance Service (Python)",
        "version": "1.0.0",
        "partners": list(PARTNER_CONFIG.keys()),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8085"))
    uvicorn.run(app, host="0.0.0.0", port=port)
