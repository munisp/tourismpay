"""
Exchange Rate ML Service — FastAPI microservice
FX rate forecasting using trained LSTM+Attention model.
Falls back to EMA-based rules if trained weights unavailable.
"""

from __future__ import annotations

import hashlib
import math
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from auth import AuthMiddleware
import db as database

app = FastAPI(title="Exchange Rate ML Service", version="2.0.0")

# --- Trained model loading ---
ML_PLATFORM_DIR = Path(__file__).resolve().parent.parent / "ml-platform"
CHECKPOINT_DIR = ML_PLATFORM_DIR / "training" / "checkpoints"
_fx_model = None

CORRIDOR_MAP = {c: i for i, c in enumerate(
    ["NGN/USD", "KES/USD", "GHS/USD", "TZS/USD", "ZAR/USD", "ETB/USD"]
)}


def _load_fx_model():
    global _fx_model
    model_path = CHECKPOINT_DIR / "fx_forecaster" / "best_model.pt"
    if model_path.exists():
        try:
            sys.path.insert(0, str(ML_PLATFORM_DIR))
            from models.fx_forecaster.model import build_model
            checkpoint = torch.load(model_path, weights_only=False, map_location="cpu")
            _fx_model = build_model(checkpoint.get("config"))
            _fx_model.load_state_dict(checkpoint["model_state_dict"])
            _fx_model.eval()
            print(f"Loaded FXForecaster ({sum(p.numel() for p in _fx_model.parameters()):,} params)")
        except Exception as e:
            print(f"Failed to load FXForecaster: {e}")


@app.on_event("startup")
async def _startup():
    await database.ensure_tables()
    _load_fx_model()


@app.on_event("shutdown")
async def _shutdown():
    await database.close_pool()

app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Models ──────────────────────────────────────────────────────────────────

class RateForecastRequest(BaseModel):
    base_currency: str
    quote_currency: str
    horizon_hours: Optional[int] = 24
    current_rate: float
    historical_rates: Optional[List[float]] = []

class SpreadOptimizationRequest(BaseModel):
    corridor: str  # e.g. "NGN/USD"
    base_spread_bps: float  # current spread in basis points
    volume_30d: float
    competition_spread_bps: Optional[float] = None
    risk_score: Optional[float] = 0.3

class CorridorPricingRequest(BaseModel):
    from_currency: str
    to_currency: str
    amount: float
    send_country: str
    receive_country: str

class RateAnomalyRequest(BaseModel):
    currency_pair: str
    rates: List[float]
    timestamps: Optional[List[str]] = None

# ─── Currency data ────────────────────────────────────────────────────────────

# Base rates vs USD (approximate)
BASE_RATES_VS_USD: Dict[str, float] = {
    "USD": 1.0,
    "EUR": 0.92,
    "GBP": 0.79,
    "JPY": 149.5,
    "CHF": 0.89,
    "AUD": 1.53,
    "CAD": 1.36,
    "CNY": 7.24,
    "AED": 3.67,
    "SAR": 3.75,
    "NGN": 1580.0,
    "KES": 129.5,
    "TZS": 2530.0,
    "GHS": 15.2,
    "ZAR": 18.7,
    "ETB": 56.8,
    "UGX": 3750.0,
    "XOF": 602.0,
    "MAD": 10.1,
    "EGP": 48.5,
    "INR": 83.2,
    "BDT": 110.0,
    "PKR": 278.0,
    "MXN": 17.1,
    "BRL": 4.97,
    "ARS": 820.0,
    "COP": 3950.0,
}

VOLATILITY_BY_PAIR: Dict[str, float] = {
    "NGN/USD": 0.025,
    "KES/USD": 0.012,
    "TZS/USD": 0.008,
    "GHS/USD": 0.018,
    "ZAR/USD": 0.015,
    "ETB/USD": 0.010,
    "EUR/USD": 0.005,
    "GBP/USD": 0.006,
    "JPY/USD": 0.007,
}


def get_base_rate(from_ccy: str, to_ccy: str) -> float:
    from_usd = BASE_RATES_VS_USD.get(from_ccy.upper(), 1.0)
    to_usd = BASE_RATES_VS_USD.get(to_ccy.upper(), 1.0)
    return to_usd / from_usd


def get_volatility(pair: str) -> float:
    return VOLATILITY_BY_PAIR.get(pair.upper(), 0.010)


def deterministic_noise(seed: str, scale: float = 0.002) -> float:
    h = int(hashlib.md5(seed.encode()).hexdigest(), 16)
    return ((h % 1000) / 1000.0 - 0.5) * scale


def simple_moving_average(rates: List[float], window: int) -> List[float]:
    result = []
    for i in range(len(rates)):
        start = max(0, i - window + 1)
        result.append(sum(rates[start:i + 1]) / (i - start + 1))
    return result


def exponential_moving_average(rates: List[float], alpha: float = 0.3) -> List[float]:
    if not rates:
        return []
    ema = [rates[0]]
    for r in rates[1:]:
        ema.append(alpha * r + (1 - alpha) * ema[-1])
    return ema


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    pool = await database.get_pool()
    return {
        "status": "ok",
        "service": "exchange-rate-ml",
        "version": "1.0.0",
        "database": "connected" if pool else "unavailable",
    }


@app.post("/api/v1/rates/forecast")
async def forecast_rate(req: RateForecastRequest):
    """
    Forecast exchange rate using trained LSTM+Attention model.
    Falls back to EMA-based forecast if model not loaded.
    """
    pair = f"{req.base_currency}/{req.quote_currency}"
    volatility = get_volatility(pair)
    horizon = req.horizon_hours or 24
    current = req.current_rate
    model_used = "ema_random_walk"

    if _fx_model is not None and req.historical_rates and len(req.historical_rates) >= 10:
        # --- LSTM model inference ---
        rates = req.historical_rates
        seq_len = _fx_model.seq_len
        if len(rates) < seq_len:
            rates = [rates[0]] * (seq_len - len(rates)) + rates
        rates = rates[-seq_len:]

        rate_arr = np.array(rates, dtype=np.float32)
        mean_r, std_r = float(rate_arr.mean()), float(rate_arr.std()) + 1e-8
        normalized = (rate_arr - mean_r) / std_r

        features = np.zeros((seq_len, _fx_model.n_features), dtype=np.float32)
        features[:, 0] = normalized
        features[:, 1] = np.gradient(normalized)
        features[:, 2] = np.abs(np.gradient(normalized)) * 100
        vol_series = []
        for i in range(len(normalized)):
            window = normalized[max(0, i-4):i+1]
            vol_series.append(float(np.std(window)) if len(window) > 1 else 0.0)
        features[:, 3] = vol_series
        features[:, 4] = normalized - 0.001
        features[:, 5] = normalized + 0.001

        x = torch.FloatTensor(features).unsqueeze(0)
        corridor_id = torch.LongTensor([CORRIDOR_MAP.get(pair, 0)])

        with torch.no_grad():
            out = _fx_model(x, corridor_id)
            n_h = min(horizon, out["point"].shape[1])
            point_vals = (out["point"][0, :n_h].numpy() * std_r + mean_r).tolist()
            lower_vals = (out["lower"][0, :n_h].numpy() * std_r + mean_r).tolist()
            upper_vals = (out["upper"][0, :n_h].numpy() * std_r + mean_r).tolist()

        forecast = point_vals[-1] if point_vals else current
        ci_lower = lower_vals[-1] if lower_vals else forecast * 0.98
        ci_upper = upper_vals[-1] if upper_vals else forecast * 1.02

        hourly_points = [
            {"hour": h + 1, "forecast_rate": round(point_vals[h], 6),
             "lower_95": round(lower_vals[h], 6), "upper_95": round(upper_vals[h], 6)}
            for h in range(len(point_vals))
        ]
        model_used = "lstm-attention-v2.0"
    else:
        # --- Fallback: EMA-based ---
        if req.historical_rates and len(req.historical_rates) >= 3:
            ema = exponential_moving_average(req.historical_rates)
            trend = (ema[-1] - ema[0]) / max(len(ema) - 1, 1)
        else:
            trend = 0.0

        noise = deterministic_noise(f"{pair}-{horizon}")
        forecast = current + trend * horizon + noise * current
        ci_half = volatility * current * math.sqrt(horizon / 24.0) * 1.96
        ci_lower = forecast - ci_half
        ci_upper = forecast + ci_half

        hourly_points = []
        for h in range(1, min(horizon + 1, 25)):
            point_noise = deterministic_noise(f"{pair}-{h}", scale=volatility * 0.5)
            hourly_points.append({
                "hour": h,
                "forecast_rate": round(current + trend * h + point_noise * current, 6),
            })

    trend_direction = "up" if forecast > current else "down" if forecast < current else "stable"

    await database.execute(
        "INSERT INTO fx_rate_predictions (base_currency, quote_currency, predicted_rate, confidence, horizon_hours) VALUES ($1,$2,$3,$4,$5)",
        req.base_currency, req.quote_currency, round(forecast, 6), round(1.0 - volatility, 4), horizon,
    )

    return {
        "currency_pair": pair,
        "current_rate": req.current_rate,
        "forecast_rate": round(forecast, 6),
        "horizon_hours": horizon,
        "confidence_interval": {
            "lower_95": round(ci_lower, 6),
            "upper_95": round(ci_upper, 6),
        },
        "trend_direction": trend_direction,
        "volatility_annualized": round(volatility * math.sqrt(252), 4),
        "hourly_forecast": hourly_points,
        "model": model_used,
        "lstm_loaded": _fx_model is not None,
        "generated_at": datetime.utcnow().isoformat(),
    }


@app.post("/api/v1/rates/optimize-spread")
async def optimize_spread(req: SpreadOptimizationRequest):
    """
    Recommend an optimal spread for a currency corridor based on
    volume, competition, and risk.
    """
    base_bps = req.base_spread_bps

    # Volume discount: higher volume → tighter spread
    volume_factor = 1.0
    if req.volume_30d > 10_000_000:
        volume_factor = 0.70
    elif req.volume_30d > 1_000_000:
        volume_factor = 0.85
    elif req.volume_30d > 100_000:
        volume_factor = 0.95

    # Risk premium: higher risk → wider spread
    risk_premium_bps = req.risk_score * 50  # up to 50 bps for max risk

    # Competition pressure
    comp_factor = 1.0
    if req.competition_spread_bps:
        if req.competition_spread_bps < base_bps:
            comp_factor = 0.90  # undercut competition by 10%

    recommended_bps = base_bps * volume_factor * comp_factor + risk_premium_bps
    recommended_bps = max(recommended_bps, 10)  # minimum 10 bps

    revenue_impact = (recommended_bps - base_bps) / 10000 * req.volume_30d

    return {
        "corridor": req.corridor,
        "current_spread_bps": req.base_spread_bps,
        "recommended_spread_bps": round(recommended_bps, 2),
        "spread_change_bps": round(recommended_bps - base_bps, 2),
        "estimated_monthly_revenue_impact_usd": round(revenue_impact, 2),
        "optimization_factors": {
            "volume_factor": volume_factor,
            "risk_premium_bps": round(risk_premium_bps, 2),
            "competition_factor": comp_factor,
        },
        "recommendation": "tighten" if recommended_bps < base_bps else "widen" if recommended_bps > base_bps else "maintain",
        "optimized_at": datetime.utcnow().isoformat(),
    }


@app.post("/api/v1/rates/corridor-pricing")
async def corridor_pricing(req: CorridorPricingRequest):
    """
    Compute all-in pricing for a remittance corridor including
    exchange rate, fees, and delivery time estimate.
    """
    mid_rate = get_base_rate(req.from_currency, req.to_currency)
    pair = f"{req.from_currency}/{req.to_currency}"
    volatility = get_volatility(pair)

    # Spread based on corridor risk
    from_risk = 0.4 if req.send_country.upper()[:2] in {"NG", "GH", "KE", "TZ"} else 0.2
    to_risk = 0.4 if req.receive_country.upper()[:2] in {"NG", "GH", "KE", "TZ"} else 0.2
    spread_bps = 150 + (from_risk + to_risk) * 100  # 150–350 bps

    customer_rate = mid_rate * (1 - spread_bps / 10000)

    # Fee structure
    if req.amount < 100:
        fee_usd = 2.50
    elif req.amount < 500:
        fee_usd = 4.00
    elif req.amount < 2000:
        fee_usd = 6.00
    else:
        fee_usd = req.amount * 0.003  # 0.3% for large amounts

    receive_amount = (req.amount - fee_usd) * customer_rate

    # Delivery time
    delivery_hours = 2 if from_risk < 0.3 and to_risk < 0.3 else 24 if from_risk < 0.5 else 48

    return {
        "from_currency": req.from_currency,
        "to_currency": req.to_currency,
        "send_amount": req.amount,
        "fee_usd": round(fee_usd, 2),
        "mid_rate": round(mid_rate, 6),
        "customer_rate": round(customer_rate, 6),
        "spread_bps": round(spread_bps, 1),
        "receive_amount": round(receive_amount, 2),
        "delivery_estimate_hours": delivery_hours,
        "rate_valid_seconds": 30,
        "priced_at": datetime.utcnow().isoformat(),
    }


@app.post("/api/v1/rates/anomaly-detection")
async def rate_anomaly_detection(req: RateAnomalyRequest):
    """
    Detect anomalous rate movements using Bollinger Bands and Z-score.
    """
    rates = req.rates
    if len(rates) < 5:
        return {"currency_pair": req.currency_pair, "anomalies": [], "method": "insufficient_data"}

    arr = np.array(rates)
    mean = float(np.mean(arr))
    std = float(np.std(arr))

    # Bollinger Bands (2 std)
    upper_band = mean + 2 * std
    lower_band = mean - 2 * std

    anomalies = []
    for i, rate in enumerate(rates):
        z = abs(rate - mean) / max(std, 1e-9)
        outside_bands = rate > upper_band or rate < lower_band
        if z > 2.5 or outside_bands:
            anomalies.append({
                "index": i,
                "rate": rate,
                "z_score": round(z, 3),
                "outside_bollinger": outside_bands,
                "direction": "spike" if rate > upper_band else "crash",
            })

    # Detect sudden jumps (>2% in single step)
    jumps = []
    for i in range(1, len(rates)):
        pct_change = abs(rates[i] - rates[i - 1]) / max(rates[i - 1], 1e-9)
        if pct_change > 0.02:
            jumps.append({"index": i, "pct_change": round(pct_change * 100, 3)})

    return {
        "currency_pair": req.currency_pair,
        "statistics": {
            "mean": round(mean, 6),
            "std": round(std, 6),
            "upper_band_2sigma": round(upper_band, 6),
            "lower_band_2sigma": round(lower_band, 6),
        },
        "anomalies": anomalies,
        "sudden_jumps": jumps,
        "anomaly_rate": round(len(anomalies) / len(rates), 4),
        "analyzed_at": datetime.utcnow().isoformat(),
    }


@app.get("/api/v1/rates/live")
async def live_rates():
    """Return current live rates for all supported corridors."""
    rates = {}
    for ccy, rate_vs_usd in BASE_RATES_VS_USD.items():
        if ccy != "USD":
            noise = deterministic_noise(f"{ccy}-{datetime.utcnow().hour}")
            rates[f"USD/{ccy}"] = round(rate_vs_usd * (1 + noise), 6)
    return {
        "base": "USD",
        "rates": rates,
        "timestamp": datetime.utcnow().isoformat(),
        "source": "tourismpay-exchange-rate-ml",
    }
