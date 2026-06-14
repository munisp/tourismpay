"""
Process lifecycle management for TourismPay Python ML services.

Provides:
- Graceful shutdown via SIGTERM/SIGINT
- Exception middleware that catches unhandled errors and logs structured JSON
- Liveness probe (/livez)
- Readiness probe (/readyz)
- Prometheus metrics endpoint (/metrics)
- In-flight request tracking for graceful drain
- Startup/shutdown event logging for OpenSearch ingestion
"""

import asyncio
import json
import os
import signal
import sys
import time
import traceback
import threading
from collections import defaultdict
from datetime import datetime, timezone
from typing import Callable

from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# ─── Global State ─────────────────────────────────────────────────────────────

_ready = threading.Event()
_alive = threading.Event()
_alive.set()

_start_time = time.monotonic()
_start_epoch = time.time()

_in_flight = 0
_in_flight_lock = threading.Lock()

# ─── Metrics ──────────────────────────────────────────────────────────────────

_metrics_lock = threading.Lock()

_http_requests_total: dict[str, int] = defaultdict(int)
_http_errors_total: int = 0
_panics_recovered: int = 0
_shutdowns_total: int = 0
_request_durations: list[float] = []

SERVICE_NAME = os.environ.get("SERVICE_NAME", os.environ.get("OTEL_SERVICE_NAME", "python-ml"))
POD_NAME = os.environ.get("POD_NAME", "unknown")


def _emit_event(level: str, event: str, **extra: object) -> None:
    """Emit structured JSON log to stderr for OpenSearch ingestion."""
    payload = {
        "level": level,
        "event": event,
        "service": SERVICE_NAME,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "pod_name": POD_NAME,
        **extra,
    }
    print(json.dumps(payload), file=sys.stderr, flush=True)


# ─── Lifecycle Functions ──────────────────────────────────────────────────────

def set_ready() -> None:
    _ready.set()
    _emit_event("INFO", "service_ready")


def set_not_ready() -> None:
    _ready.clear()


def is_ready() -> bool:
    return _ready.is_set()


# ─── ASGI Middleware ──────────────────────────────────────────────────────────

class LifecycleMiddleware(BaseHTTPMiddleware):
    """Tracks in-flight requests, records latency, catches unhandled exceptions."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        global _in_flight, _http_errors_total

        with _in_flight_lock:
            _in_flight += 1

        start = time.monotonic()

        try:
            response = await call_next(request)
        except Exception:
            # Catch unhandled exceptions, log structured JSON, return 500
            with _metrics_lock:
                _http_errors_total += 1
                global _panics_recovered
                _panics_recovered += 1

            tb = traceback.format_exc()
            _emit_event(
                "CRITICAL",
                "unhandled_exception",
                error=str(sys.exc_info()[1]),
                traceback=tb,
                path=str(request.url.path),
                method=request.method,
            )
            response = Response(
                content=json.dumps({"error": "internal server error"}),
                status_code=500,
                media_type="application/json",
            )
        finally:
            duration = time.monotonic() - start
            with _in_flight_lock:
                _in_flight -= 1
            with _metrics_lock:
                status = response.status_code if response else 500
                key = f"{request.method}|{request.url.path}|{status}"
                _http_requests_total[key] += 1
                _request_durations.append(duration)
                if len(_request_durations) > 10000:
                    del _request_durations[:5000]
                if status >= 400:
                    _http_errors_total += 1

        return response


# ─── Probe Endpoints ──────────────────────────────────────────────────────────

async def livez() -> dict:
    """Liveness probe — returns 200 if process is alive."""
    if not _alive.is_set():
        return {"status": "dead"}
    return {
        "status": "alive",
        "uptime_seconds": round(time.monotonic() - _start_time, 1),
    }


async def readyz() -> dict:
    """Readiness probe — returns 503 during startup/shutdown."""
    if not _ready.is_set():
        return {"status": "not_ready", "reason": "starting up or shutting down"}
    return {
        "status": "ready",
        "in_flight": _in_flight,
    }


async def metrics() -> Response:
    """Prometheus-format metrics endpoint."""
    lines = []
    uptime = time.monotonic() - _start_time

    # Process metrics
    lines.append("# HELP python_process_uptime_seconds Process uptime")
    lines.append("# TYPE python_process_uptime_seconds gauge")
    lines.append(f"python_process_uptime_seconds {uptime:.1f}")

    lines.append("# HELP python_in_flight_requests Currently in-flight requests")
    lines.append("# TYPE python_in_flight_requests gauge")
    lines.append(f"python_in_flight_requests {_in_flight}")

    with _metrics_lock:
        # HTTP requests counter
        lines.append("# HELP python_http_requests_total Total HTTP requests")
        lines.append("# TYPE python_http_requests_total counter")
        for key, count in _http_requests_total.items():
            parts = key.split("|")
            if len(parts) == 3:
                lines.append(
                    f'python_http_requests_total{{method="{parts[0]}",path="{parts[1]}",status="{parts[2]}"}} {count}'
                )

        # Errors
        lines.append("# HELP python_http_errors_total Total HTTP errors")
        lines.append("# TYPE python_http_errors_total counter")
        lines.append(f"python_http_errors_total {_http_errors_total}")

        # Panics / unhandled exceptions
        lines.append("# HELP python_exceptions_recovered_total Unhandled exceptions caught")
        lines.append("# TYPE python_exceptions_recovered_total counter")
        lines.append(f"python_exceptions_recovered_total {_panics_recovered}")

        # Shutdowns
        lines.append("# HELP python_shutdowns_total Graceful shutdowns")
        lines.append("# TYPE python_shutdowns_total counter")
        lines.append(f"python_shutdowns_total {_shutdowns_total}")

        # Request duration histogram
        lines.append("# HELP python_http_request_duration_seconds Request duration")
        lines.append("# TYPE python_http_request_duration_seconds histogram")
        durations = sorted(_request_durations)
        buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
        total = sum(durations)
        count = len(durations)
        for b in buckets:
            c = sum(1 for d in durations if d <= b)
            lines.append(f'python_http_request_duration_seconds_bucket{{le="{b}"}} {c}')
        lines.append(f'python_http_request_duration_seconds_bucket{{le="+Inf"}} {count}')
        lines.append(f"python_http_request_duration_seconds_sum {total:.6f}")
        lines.append(f"python_http_request_duration_seconds_count {count}")

    # Memory (if psutil available)
    try:
        import resource

        usage = resource.getrusage(resource.RUSAGE_SELF)
        lines.append("# HELP python_max_rss_bytes Maximum resident set size")
        lines.append("# TYPE python_max_rss_bytes gauge")
        lines.append(f"python_max_rss_bytes {usage.ru_maxrss * 1024}")
    except Exception:
        pass

    body = "\n".join(lines) + "\n"
    return Response(content=body, media_type="text/plain; version=0.0.4; charset=utf-8")


# ─── Signal Handlers & Graceful Shutdown ──────────────────────────────────────

def _handle_signal(signum: int, _frame: object) -> None:
    """Handle SIGTERM/SIGINT for graceful shutdown."""
    global _shutdowns_total
    sig_name = signal.Signals(signum).name

    _emit_event(
        "WARN",
        "graceful_shutdown_started",
        signal=sig_name,
        in_flight=_in_flight,
        uptime_seconds=round(time.monotonic() - _start_time, 1),
    )

    with _metrics_lock:
        _shutdowns_total += 1

    # Mark not ready — K8s stops sending traffic
    set_not_ready()

    # Give K8s time to update endpoints
    time.sleep(2)

    # Wait for in-flight requests to drain (up to 25s)
    deadline = time.monotonic() + 25
    while _in_flight > 0 and time.monotonic() < deadline:
        time.sleep(0.5)

    _emit_event(
        "INFO",
        "graceful_shutdown_completed",
        remaining_in_flight=_in_flight,
    )

    sys.exit(0)


def install_signal_handlers() -> None:
    """Install SIGTERM/SIGINT handlers for graceful shutdown."""
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)
    _emit_event("INFO", "signal_handlers_installed")


# ─── FastAPI Integration ──────────────────────────────────────────────────────

def configure_lifecycle(app: FastAPI) -> None:
    """Register lifecycle middleware, probes, and signal handlers on a FastAPI app."""
    app.add_middleware(LifecycleMiddleware)

    app.get("/livez")(livez)
    app.get("/readyz")(readyz)
    app.get("/metrics")(metrics)

    @app.on_event("startup")
    async def _lifecycle_startup() -> None:
        _emit_event("INFO", "service_starting", port=os.environ.get("PORT", "unknown"))
        set_ready()

    @app.on_event("shutdown")
    async def _lifecycle_shutdown() -> None:
        set_not_ready()
        _emit_event("INFO", "service_shutdown_event")
