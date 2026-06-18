"""
AI-Powered Dynamic FX Optimization Service (4.2)

Predicts optimal currency conversion windows using ML time-series analysis.
Provides "Smart Convert" limit-order style functionality for tourists.

Middleware integration: Redis (rate cache), Kafka (conversion events),
OpenSearch (historical rate indexing), Lakehouse (training data).
"""
import os
import secrets
import time
from datetime import datetime, timedelta
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends, Header
from pydantic import BaseModel, Field

app = FastAPI(title="FX Optimizer Service", version="1.0.0")

# ─── Models ────────────────────────────────────────────────────────────────────

class FXPrediction(BaseModel):
    currency_pair: str
    current_rate: float
    predicted_rate_1h: float
    predicted_rate_24h: float
    predicted_rate_7d: float
    confidence: float = Field(ge=0, le=1)
    recommendation: str  # "convert_now", "wait", "set_limit"
    savings_potential_pct: float
    optimal_window_start: str
    optimal_window_end: str

class SmartConvertOrder(BaseModel):
    user_id: str
    from_currency: str
    to_currency: str
    amount: float = Field(gt=0)
    target_rate: float = Field(gt=0)
    expires_at: str
    status: str = "pending"  # pending, triggered, expired, cancelled

class ConversionAnalysis(BaseModel):
    currency_pair: str
    current_rate: float
    airport_kiosk_rate: float
    tourismpay_rate: float
    savings_vs_airport: float
    savings_vs_bank: float
    volatility_30d: float
    trend: str  # "appreciating", "depreciating", "stable"

import db as database

# ─── Rate History (simulated - production pulls from Lakehouse) ────────────────

RATE_HISTORY = {
    "USD/NGN": [1565, 1570, 1575, 1580, 1578, 1582, 1580],
    "USD/KES": [126, 127, 128, 129, 128.5, 129.2, 129],
    "USD/GHS": [14.8, 14.9, 15.0, 15.1, 15.15, 15.2, 15.2],
    "USD/ZAR": [18.1, 18.2, 18.3, 18.4, 18.45, 18.5, 18.5],
    "EUR/NGN": [1700, 1710, 1715, 1720, 1718, 1725, 1722],
    "GBP/NGN": [1980, 1990, 2000, 2010, 2005, 2015, 2012],
}

# ─── Auth ──────────────────────────────────────────────────────────────────────

async def verify_auth(authorization: Optional[str] = Header(None)):
    api_key = os.environ.get("INTERNAL_API_KEY", "dev-key")
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    token = authorization.replace("Bearer ", "")
    if token != api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return token

# ─── Prediction Engine ─────────────────────────────────────────────────────────

def predict_rate(pair: str, hours_ahead: int) -> tuple[float, float]:
    """Simple moving average + trend prediction. Production uses LSTM/Prophet."""
    history = RATE_HISTORY.get(pair, [])
    if not history:
        return 0.0, 0.0
    
    current = history[-1]
    avg = sum(history) / len(history)
    trend = (history[-1] - history[0]) / len(history)
    
    predicted = current + (trend * hours_ahead / 24)
    confidence = max(0.3, 1.0 - (abs(trend) * hours_ahead / current))
    
    return predicted, min(confidence, 0.95)

def calculate_volatility(pair: str) -> float:
    """30-day rolling volatility."""
    history = RATE_HISTORY.get(pair, [])
    if len(history) < 2:
        return 0.0
    returns = [(history[i] - history[i-1]) / history[i-1] for i in range(1, len(history))]
    mean_return = sum(returns) / len(returns)
    variance = sum((r - mean_return) ** 2 for r in returns) / len(returns)
    return variance ** 0.5

# ─── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "fx-optimizer", "timestamp": datetime.utcnow().isoformat()}

@app.get("/predict/{currency_pair}", response_model=FXPrediction)
async def get_prediction(currency_pair: str, _auth=Depends(verify_auth)):
    pair = currency_pair.upper().replace("-", "/")
    if pair not in RATE_HISTORY:
        raise HTTPException(status_code=404, detail=f"Unsupported pair: {pair}")
    
    current = RATE_HISTORY[pair][-1]
    pred_1h, conf_1h = predict_rate(pair, 1)
    pred_24h, conf_24h = predict_rate(pair, 24)
    pred_7d, conf_7d = predict_rate(pair, 168)
    
    # Determine recommendation
    if pred_24h < current * 0.995:
        recommendation = "convert_now"  # Rate will worsen
        savings = ((current - pred_24h) / current) * 100
    elif pred_24h > current * 1.005:
        recommendation = "wait"  # Rate will improve
        savings = ((pred_24h - current) / current) * 100
    else:
        recommendation = "set_limit"  # Stable, set target
        savings = 0.5
    
    # Optimal window (when rate is predicted best)
    now = datetime.utcnow()
    window_start = now + timedelta(hours=2)
    window_end = now + timedelta(hours=8)
    
    return FXPrediction(
        currency_pair=pair,
        current_rate=current,
        predicted_rate_1h=round(pred_1h, 4),
        predicted_rate_24h=round(pred_24h, 4),
        predicted_rate_7d=round(pred_7d, 4),
        confidence=round(conf_24h, 3),
        recommendation=recommendation,
        savings_potential_pct=round(savings, 2),
        optimal_window_start=window_start.isoformat(),
        optimal_window_end=window_end.isoformat(),
    )

@app.get("/analysis/{currency_pair}", response_model=ConversionAnalysis)
async def get_analysis(currency_pair: str, _auth=Depends(verify_auth)):
    pair = currency_pair.upper().replace("-", "/")
    if pair not in RATE_HISTORY:
        raise HTTPException(status_code=404, detail=f"Unsupported pair: {pair}")
    
    current = RATE_HISTORY[pair][-1]
    airport_markup = 0.08  # Airport kiosks charge 8% spread
    bank_markup = 0.03  # Banks charge 3% spread
    tourismpay_markup = 0.005  # TourismPay charges 0.5%
    
    history = RATE_HISTORY[pair]
    trend_pct = (history[-1] - history[0]) / history[0]
    if trend_pct > 0.01:
        trend = "depreciating"  # More local currency per USD = depreciating
    elif trend_pct < -0.01:
        trend = "appreciating"
    else:
        trend = "stable"
    
    return ConversionAnalysis(
        currency_pair=pair,
        current_rate=current,
        airport_kiosk_rate=current * (1 + airport_markup),
        tourismpay_rate=current * (1 + tourismpay_markup),
        savings_vs_airport=round(airport_markup * 100 - tourismpay_markup * 100, 1),
        savings_vs_bank=round(bank_markup * 100 - tourismpay_markup * 100, 1),
        volatility_30d=round(calculate_volatility(pair) * 100, 3),
        trend=trend,
    )

@app.post("/smart-convert", response_model=SmartConvertOrder)
async def create_smart_convert(
    from_currency: str,
    to_currency: str,
    amount: float,
    target_rate: float,
    user_id: str,
    _auth=Depends(verify_auth),
):
    """Create a limit-order style smart conversion that triggers when rate is favorable."""
    order_id = f"sc_{secrets.token_hex(8)}"
    expires = datetime.utcnow() + timedelta(days=7)
    order = SmartConvertOrder(
        user_id=user_id,
        from_currency=from_currency.upper(),
        to_currency=to_currency.upper(),
        amount=amount,
        target_rate=target_rate,
        expires_at=expires.isoformat(),
        status="pending",
    )
    await database.execute(
        "INSERT INTO smart_convert_orders (id, user_id, from_currency, to_currency, amount, target_rate, status, expires_at) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        order_id, user_id, from_currency.upper(), to_currency.upper(), amount, target_rate, "pending", expires,
    )
    return order

@app.get("/smart-convert/{user_id}")
async def list_smart_converts(user_id: str, _auth=Depends(verify_auth)):
    rows = await database.fetch(
        "SELECT id, user_id, from_currency, to_currency, amount, target_rate, status, "
        "expires_at::text AS expires_at FROM smart_convert_orders WHERE user_id = $1 ORDER BY created_at DESC",
        user_id,
    )
    return rows

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8010)
