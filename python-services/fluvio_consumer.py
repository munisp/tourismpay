"""
Fluvio Streaming Consumer for Python ML Services

Consumes real-time event streams for ML model inference:
- Payment transaction events → fraud detection
- FX rate updates → anomaly detection
- NOC events → automated response

Falls back gracefully when Fluvio is unavailable.
"""
import os
import json
import logging
import asyncio
from typing import Any, Callable, Coroutine, Optional

logger = logging.getLogger("tourismpay.fluvio")

FLUVIO_ENDPOINT = os.environ.get("FLUVIO_ENDPOINT", "")

# ─── Topics ───────────────────────────────────────────────────────────────────

TOPIC_PAYMENT_STREAM = "tourismpay.payments.stream"
TOPIC_FX_RATE_FEED = "tourismpay.fx.rates"
TOPIC_NOC_LIVE = "tourismpay.noc.live"
TOPIC_TRANSACTION_EVENTS = "tourismpay.transactions.events"

# ─── HTTP-based Consumer ──────────────────────────────────────────────────────

EventHandler = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]


async def consume_events(
    topic: str,
    handler: EventHandler,
    poll_interval: float = 1.0,
    batch_size: int = 100,
) -> None:
    """
    Consume events from a Fluvio topic via HTTP polling.
    Calls handler for each event. Runs indefinitely.
    """
    if not FLUVIO_ENDPOINT:
        logger.info("Fluvio not configured — consumer for %s not started", topic)
        return

    import httpx

    offset = 0
    logger.info("Starting Fluvio consumer for topic: %s", topic)

    async with httpx.AsyncClient(timeout=10) as client:
        while True:
            try:
                resp = await client.get(
                    f"{FLUVIO_ENDPOINT}/consume",
                    params={"topic": topic, "offset": offset, "max_records": batch_size},
                )
                if resp.status_code == 200:
                    records = resp.json()
                    for record in records:
                        try:
                            event = json.loads(record.get("value", "{}"))
                            await handler(event)
                            offset = record.get("offset", offset) + 1
                        except json.JSONDecodeError:
                            logger.warning("Invalid JSON in Fluvio record")
                            offset = record.get("offset", offset) + 1
                        except Exception as e:
                            logger.error("Handler error for %s: %s", topic, e)
            except Exception as e:
                logger.warning("Fluvio poll error for %s: %s", topic, e)

            await asyncio.sleep(poll_interval)


async def produce_event(topic: str, key: str, value: dict[str, Any]) -> bool:
    """Produce a single event to Fluvio."""
    if not FLUVIO_ENDPOINT:
        return False
    try:
        import httpx

        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(
                f"{FLUVIO_ENDPOINT}/produce",
                json={"topic": topic, "key": key, "value": json.dumps(value)},
            )
            return resp.status_code < 400
    except Exception as e:
        logger.warning("Fluvio produce to %s failed: %s", topic, e)
        return False


# ─── Pre-built Consumers ──────────────────────────────────────────────────────

async def start_fraud_detection_consumer(fraud_model_fn: EventHandler) -> None:
    """Consume payment events and run fraud detection on each."""
    await consume_events(TOPIC_PAYMENT_STREAM, fraud_model_fn, poll_interval=0.5)


async def start_fx_anomaly_consumer(anomaly_fn: EventHandler) -> None:
    """Consume FX rate events and detect anomalies."""
    await consume_events(TOPIC_FX_RATE_FEED, anomaly_fn, poll_interval=2.0)


async def start_noc_consumer(noc_handler: EventHandler) -> None:
    """Consume NOC events for automated response."""
    await consume_events(TOPIC_NOC_LIVE, noc_handler, poll_interval=1.0)


def is_fluvio_enabled() -> bool:
    """Check if Fluvio is configured."""
    return bool(FLUVIO_ENDPOINT)
