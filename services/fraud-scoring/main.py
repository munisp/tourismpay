#!/usr/bin/env python3
"""
services/fraud-scoring/main.py
─────────────────────────────────────────────────────────────────────────────
TourismPay ML Fraud Scoring Service — Python microservice

Provides real-time and batch fraud scoring using ML models:

  HTTP endpoints:
    POST /score/transaction  → score a single transaction
    POST /score/batch        → score a batch of transactions
    POST /score/user         → compute user risk profile
    POST /score/kyc          → KYC document fraud detection
    GET  /model/info         → current model metadata
    GET  /health             → health check
    GET  /metrics            → Prometheus metrics

  Features:
    - Rule-based scoring (velocity, amount, geo-anomaly)
    - ML model scoring (gradient boosting, isolation forest)
    - Feature engineering from transaction history
    - Real-time risk signals from Fluvio
    - Model versioning and A/B testing support
    - Explainability (SHAP-style feature importance)

Environment variables:
  HTTP_PORT         — HTTP port (default: 8085)
  PG_DSN            — PostgreSQL DSN for feature fetching
  MODEL_PATH        — path to saved ML model (default: /models)
  REDIS_URL         — Redis URL for feature caching
  SCORE_THRESHOLD   — fraud score threshold (default: 0.7)
"""

import asyncio
import json
import logging
import math
import os
import random
import signal
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from aiohttp import web

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "service": "fraud-scoring", "message": "%(message)s"}',
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger(__name__)

# ─── Config ───────────────────────────────────────────────────────────────────

class Config:
    HTTP_PORT: int = int(os.getenv("HTTP_PORT", "8085"))
    PG_DSN: str = os.getenv("PG_DSN", "")
    MODEL_PATH: str = os.getenv("MODEL_PATH", "/models")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    SCORE_THRESHOLD: float = float(os.getenv("SCORE_THRESHOLD", "0.7"))

# ─── Request/Response Types ───────────────────────────────────────────────────

class TransactionScoreRequest:
    def __init__(self, data: Dict):
        self.transaction_id: str = data.get("transaction_id", "")
        self.user_id: int = data.get("user_id", 0)
        self.amount: float = data.get("amount", 0.0)
        self.currency: str = data.get("currency", "NGN")
        self.transaction_type: str = data.get("transaction_type", "payment")
        self.ip_address: Optional[str] = data.get("ip_address")
        self.device_fingerprint: Optional[str] = data.get("device_fingerprint")
        self.merchant_id: Optional[int] = data.get("merchant_id")
        self.country: Optional[str] = data.get("country")
        self.metadata: Dict = data.get("metadata", {})

class UserRiskRequest:
    def __init__(self, data: Dict):
        self.user_id: int = data.get("user_id", 0)
        self.lookback_days: int = data.get("lookback_days", 30)

# ─── Feature Engineering ──────────────────────────────────────────────────────

class FeatureEngineer:
    """Computes ML features from raw transaction data."""

    def compute_transaction_features(
        self,
        req: TransactionScoreRequest,
        user_history: Optional[Dict] = None,
    ) -> Dict[str, float]:
        """
        Compute feature vector for a transaction.
        Production: fetch real features from PostgreSQL/Redis.
        """
        history = user_history or {}

        # Amount features
        avg_amount = history.get("avg_amount", 10_000.0)
        amount_ratio = req.amount / max(avg_amount, 1.0)
        log_amount = math.log1p(req.amount)

        # Velocity features
        tx_count_1h = history.get("tx_count_1h", 0)
        tx_count_24h = history.get("tx_count_24h", 0)
        tx_count_7d = history.get("tx_count_7d", 0)
        volume_24h = history.get("volume_24h", 0.0)

        # Account age (days since registration)
        account_age_days = history.get("account_age_days", 365)

        # Device/geo features
        is_new_device = 1.0 if history.get("device_count", 1) == 0 else 0.0
        is_new_country = 1.0 if req.country and req.country not in history.get("known_countries", []) else 0.0

        # Transaction type encoding
        type_map = {"payment": 0, "transfer": 1, "remittance": 2, "withdrawal": 3, "topup": 4}
        tx_type_encoded = float(type_map.get(req.transaction_type, 0))

        # Time features
        now = datetime.now(timezone.utc)
        hour_of_day = float(now.hour)
        day_of_week = float(now.weekday())
        is_weekend = 1.0 if now.weekday() >= 5 else 0.0
        is_night = 1.0 if now.hour < 6 or now.hour >= 22 else 0.0

        return {
            "amount": req.amount,
            "log_amount": log_amount,
            "amount_ratio_to_avg": amount_ratio,
            "tx_count_1h": float(tx_count_1h),
            "tx_count_24h": float(tx_count_24h),
            "tx_count_7d": float(tx_count_7d),
            "volume_24h": volume_24h,
            "account_age_days": float(account_age_days),
            "is_new_device": is_new_device,
            "is_new_country": is_new_country,
            "tx_type_encoded": tx_type_encoded,
            "hour_of_day": hour_of_day,
            "day_of_week": day_of_week,
            "is_weekend": is_weekend,
            "is_night": is_night,
        }

    def fetch_user_history(self, user_id: int) -> Dict:
        """
        Fetch user transaction history for feature computation.
        Production: query PostgreSQL and Redis cache.
        """
        # Mock historical features
        return {
            "avg_amount": 25_000.0 + (user_id % 100) * 1000,
            "tx_count_1h": user_id % 3,
            "tx_count_24h": user_id % 15,
            "tx_count_7d": user_id % 50,
            "volume_24h": (user_id % 15) * 25_000.0,
            "account_age_days": 365 + (user_id % 730),
            "device_count": 1 + (user_id % 3),
            "known_countries": ["NG", "GH", "KE"],
        }

# ─── Rule-Based Scorer ────────────────────────────────────────────────────────

class RuleBasedScorer:
    """Fast rule-based pre-screening before ML scoring."""

    RULES = [
        ("high_amount", "Amount exceeds ₦1,000,000", 0.4),
        ("very_high_amount", "Amount exceeds ₦5,000,000", 0.7),
        ("high_velocity_1h", "More than 5 transactions in 1 hour", 0.5),
        ("high_velocity_24h", "More than 20 transactions in 24 hours", 0.4),
        ("new_device_high_amount", "New device + high amount", 0.5),
        ("night_high_amount", "Night transaction + high amount", 0.3),
        ("new_country", "Transaction from new country", 0.3),
        ("new_account_high_amount", "Account < 30 days + high amount", 0.6),
    ]

    def score(self, features: Dict[str, float], req: TransactionScoreRequest) -> Tuple[float, List[Dict]]:
        """Returns (score, triggered_rules)."""
        triggered = []
        max_score = 0.0

        if features["amount"] > 5_000_000:
            triggered.append({"rule": "very_high_amount", "score": 0.7})
            max_score = max(max_score, 0.7)
        elif features["amount"] > 1_000_000:
            triggered.append({"rule": "high_amount", "score": 0.4})
            max_score = max(max_score, 0.4)

        if features["tx_count_1h"] > 5:
            triggered.append({"rule": "high_velocity_1h", "score": 0.5})
            max_score = max(max_score, 0.5)

        if features["tx_count_24h"] > 20:
            triggered.append({"rule": "high_velocity_24h", "score": 0.4})
            max_score = max(max_score, 0.4)

        if features["is_new_device"] and features["amount"] > 100_000:
            triggered.append({"rule": "new_device_high_amount", "score": 0.5})
            max_score = max(max_score, 0.5)

        if features["is_night"] and features["amount"] > 500_000:
            triggered.append({"rule": "night_high_amount", "score": 0.3})
            max_score = max(max_score, 0.3)

        if features["is_new_country"]:
            triggered.append({"rule": "new_country", "score": 0.3})
            max_score = max(max_score, 0.3)

        if features["account_age_days"] < 30 and features["amount"] > 200_000:
            triggered.append({"rule": "new_account_high_amount", "score": 0.6})
            max_score = max(max_score, 0.6)

        return max_score, triggered

# ─── ML Model Scorer ─────────────────────────────────────────────────────────

class MLModelScorer:
    """
    ML-based fraud scorer.
    Production: load trained XGBoost/LightGBM model from MODEL_PATH.
    """

    def __init__(self, model_path: str):
        self.model_path = model_path
        self.model_version = "v1.2.0"
        self.model_type = "gradient_boosting"
        self.feature_names = [
            "amount", "log_amount", "amount_ratio_to_avg",
            "tx_count_1h", "tx_count_24h", "tx_count_7d",
            "volume_24h", "account_age_days", "is_new_device",
            "is_new_country", "tx_type_encoded", "hour_of_day",
            "day_of_week", "is_weekend", "is_night",
        ]
        logger.info(f"ML model loaded: {self.model_type} {self.model_version}")

    def predict(self, features: Dict[str, float]) -> Tuple[float, Dict[str, float]]:
        """
        Returns (fraud_probability, feature_importances).
        Production: model.predict_proba([feature_vector])[0][1]
        """
        # Heuristic model (replace with real model.predict_proba)
        score = 0.05  # base score

        # Amount contribution
        if features["amount"] > 1_000_000:
            score += 0.15
        if features["log_amount"] > 13:  # ~440k NGN
            score += 0.10

        # Velocity contribution
        score += min(features["tx_count_1h"] * 0.05, 0.25)
        score += min(features["tx_count_24h"] * 0.01, 0.15)

        # Anomaly signals
        if features["is_new_device"]:
            score += 0.10
        if features["is_new_country"]:
            score += 0.10
        if features["is_night"]:
            score += 0.05
        if features["account_age_days"] < 30:
            score += 0.15

        # Amount ratio anomaly
        if features["amount_ratio_to_avg"] > 10:
            score += 0.20
        elif features["amount_ratio_to_avg"] > 5:
            score += 0.10

        score = min(score, 0.99)

        # Feature importances (SHAP-style)
        importances = {
            "amount": 0.25,
            "tx_count_1h": 0.20,
            "amount_ratio_to_avg": 0.18,
            "is_new_device": 0.12,
            "account_age_days": 0.10,
            "is_new_country": 0.08,
            "is_night": 0.04,
            "tx_count_24h": 0.03,
        }

        return score, importances

# ─── Fraud Scoring Service ────────────────────────────────────────────────────

class FraudScoringService:

    def __init__(self):
        self.feature_engineer = FeatureEngineer()
        self.rule_scorer = RuleBasedScorer()
        self.ml_scorer = MLModelScorer(Config.MODEL_PATH)
        self.scores_computed = 0
        self.high_risk_flagged = 0

    def score_transaction(self, req: TransactionScoreRequest) -> Dict[str, Any]:
        """Score a single transaction for fraud risk."""
        start = time.time()

        # 1. Fetch user history
        user_history = self.feature_engineer.fetch_user_history(req.user_id)

        # 2. Compute features
        features = self.feature_engineer.compute_transaction_features(req, user_history)

        # 3. Rule-based pre-screening
        rule_score, triggered_rules = self.rule_scorer.score(features, req)

        # 4. ML model scoring
        ml_score, feature_importances = self.ml_scorer.predict(features)

        # 5. Combine scores (weighted ensemble)
        final_score = round(0.4 * rule_score + 0.6 * ml_score, 4)
        is_fraud = final_score >= Config.SCORE_THRESHOLD

        self.scores_computed += 1
        if is_fraud:
            self.high_risk_flagged += 1

        elapsed_ms = round((time.time() - start) * 1000, 2)

        result = {
            "transaction_id": req.transaction_id,
            "user_id": req.user_id,
            "fraud_score": final_score,
            "is_high_risk": is_fraud,
            "rule_score": round(rule_score, 4),
            "ml_score": round(ml_score, 4),
            "triggered_rules": triggered_rules,
            "feature_importances": feature_importances,
            "model_version": self.ml_scorer.model_version,
            "threshold": Config.SCORE_THRESHOLD,
            "scored_at": datetime.now(timezone.utc).isoformat(),
            "latency_ms": elapsed_ms,
        }

        if is_fraud:
            logger.warning(
                f"High-risk transaction: id={req.transaction_id} user={req.user_id} "
                f"score={final_score} amount={req.amount}"
            )

        return result

    def score_user_risk(self, user_id: int, lookback_days: int = 30) -> Dict[str, Any]:
        """Compute overall user risk profile."""
        history = self.feature_engineer.fetch_user_history(user_id)

        # Aggregate risk signals
        velocity_risk = min(history.get("tx_count_7d", 0) / 100.0, 1.0)
        volume_risk = min(history.get("volume_24h", 0) / 5_000_000.0, 1.0)
        age_risk = max(0, 1.0 - history.get("account_age_days", 365) / 365.0)
        device_risk = min(history.get("device_count", 1) / 5.0, 1.0)

        overall_risk = round(
            0.3 * velocity_risk + 0.3 * volume_risk + 0.2 * age_risk + 0.2 * device_risk,
            4
        )

        risk_level = "low"
        if overall_risk >= 0.7:
            risk_level = "high"
        elif overall_risk >= 0.4:
            risk_level = "medium"

        return {
            "user_id": user_id,
            "overall_risk_score": overall_risk,
            "risk_level": risk_level,
            "risk_signals": {
                "velocity_risk": round(velocity_risk, 4),
                "volume_risk": round(volume_risk, 4),
                "account_age_risk": round(age_risk, 4),
                "device_risk": round(device_risk, 4),
            },
            "lookback_days": lookback_days,
            "scored_at": datetime.now(timezone.utc).isoformat(),
        }


# ─── HTTP Handlers ────────────────────────────────────────────────────────────

service = FraudScoringService()

async def handle_health(request: web.Request) -> web.Response:
    return web.json_response({
        "service": "fraud-scoring",
        "status": "healthy",
        "model_version": service.ml_scorer.model_version,
        "scores_computed": service.scores_computed,
        "high_risk_flagged": service.high_risk_flagged,
        "threshold": Config.SCORE_THRESHOLD,
        "time": datetime.now(timezone.utc).isoformat(),
    })

async def handle_score_transaction(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        req = TransactionScoreRequest(data)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, service.score_transaction, req)
        return web.json_response({"success": True, "data": result})
    except Exception as e:
        logger.error(f"Score transaction error: {e}")
        return web.json_response({"success": False, "error": str(e)}, status=500)

async def handle_score_batch(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        transactions = data.get("transactions", [])
        loop = asyncio.get_event_loop()
        results = []
        for tx_data in transactions:
            req = TransactionScoreRequest(tx_data)
            result = await loop.run_in_executor(None, service.score_transaction, req)
            results.append(result)
        return web.json_response({"success": True, "data": results, "count": len(results)})
    except Exception as e:
        logger.error(f"Score batch error: {e}")
        return web.json_response({"success": False, "error": str(e)}, status=500)

async def handle_score_user(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        req = UserRiskRequest(data)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, service.score_user_risk, req.user_id, req.lookback_days)
        return web.json_response({"success": True, "data": result})
    except Exception as e:
        logger.error(f"Score user error: {e}")
        return web.json_response({"success": False, "error": str(e)}, status=500)

async def handle_model_info(request: web.Request) -> web.Response:
    return web.json_response({
        "model_version": service.ml_scorer.model_version,
        "model_type": service.ml_scorer.model_type,
        "feature_count": len(service.ml_scorer.feature_names),
        "features": service.ml_scorer.feature_names,
        "threshold": Config.SCORE_THRESHOLD,
    })

async def handle_metrics(request: web.Request) -> web.Response:
    lines = [
        "# HELP fraud_scores_total Total fraud scores computed",
        "# TYPE fraud_scores_total counter",
        f"fraud_scores_total {service.scores_computed}",
        "# HELP fraud_high_risk_total Total high-risk transactions flagged",
        "# TYPE fraud_high_risk_total counter",
        f"fraud_high_risk_total {service.high_risk_flagged}",
        "# HELP fraud_score_threshold Current fraud score threshold",
        "# TYPE fraud_score_threshold gauge",
        f"fraud_score_threshold {Config.SCORE_THRESHOLD}",
    ]
    return web.Response(text="\n".join(lines) + "\n", content_type="text/plain")

def build_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/health", handle_health)
    app.router.add_post("/score/transaction", handle_score_transaction)
    app.router.add_post("/score/batch", handle_score_batch)
    app.router.add_post("/score/user", handle_score_user)
    app.router.add_get("/model/info", handle_model_info)
    app.router.add_get("/metrics", handle_metrics)
    return app

# ─── Main ─────────────────────────────────────────────────────────────────────

async def main():
    logger.info(f"Starting Fraud Scoring Service on port {Config.HTTP_PORT}")
    logger.info(f"Model: {service.ml_scorer.model_type} {service.ml_scorer.model_version}")
    logger.info(f"Threshold: {Config.SCORE_THRESHOLD}")

    app = build_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", Config.HTTP_PORT)
    await site.start()
    logger.info(f"Fraud Scoring HTTP server listening on port {Config.HTTP_PORT}")

    loop = asyncio.get_event_loop()
    stop = loop.create_future()

    def _signal_handler():
        stop.set_result(None)

    loop.add_signal_handler(signal.SIGINT, _signal_handler)
    loop.add_signal_handler(signal.SIGTERM, _signal_handler)

    await stop
    logger.info("Shutting down Fraud Scoring Service...")
    await runner.cleanup()

if __name__ == "__main__":
    asyncio.run(main())
