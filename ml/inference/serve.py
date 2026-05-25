"""
FastAPI inference server for all TourismPay ML models.
Serves trained models via REST API for real-time predictions.

Supports:
  - XGBoost fraud detection (native or ONNX)
  - GNN fraud graph scoring (PyTorch)
  - FX rate forecasting (PyTorch Transformer)
  - BIS risk classification (LightGBM native or ONNX)
  - Model hot-reloading from registry
  - Health checks and model metadata

Port: 8200 (configurable via ML_INFERENCE_PORT env var)
"""
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logger = logging.getLogger(__name__)

app = FastAPI(
    title="TourismPay ML Inference Service",
    version="1.0.0",
    description="Real-time ML inference for fraud detection, FX forecasting, BIS risk scoring, and GNN analysis",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_DIR = os.environ.get("ML_MODEL_DIR", "./ml/saved_models")

# ─── Model Registry (lazy-loaded) ───────────────────────────────────────────

_loaded_models: Dict[str, Any] = {}


def _get_fraud_xgb():
    if "fraud_xgb" not in _loaded_models:
        try:
            from ml.models.fraud.xgb_fraud import FraudXGBModel
            model = FraudXGBModel()
            model.load(f"{MODEL_DIR}/fraud_xgb")
            _loaded_models["fraud_xgb"] = model
            logger.info("Loaded fraud XGB model")
        except Exception as e:
            logger.error(f"Failed to load fraud XGB: {e}")
            return None
    return _loaded_models.get("fraud_xgb")


def _get_gnn_fraud():
    if "gnn_fraud" not in _loaded_models:
        try:
            import torch
            from ml.models.gnn_fraud.gnn_model import GATFraudDetector, GNNTrainer

            meta_path = Path(f"{MODEL_DIR}/gnn_fraud/metadata.json")
            if not meta_path.exists():
                return None

            model = GATFraudDetector(in_channels=8, hidden_channels=64, num_layers=3, heads=4)
            trainer = GNNTrainer(model, device="cpu")
            trainer.load(f"{MODEL_DIR}/gnn_fraud")
            _loaded_models["gnn_fraud"] = trainer
            logger.info("Loaded GNN fraud model")
        except Exception as e:
            logger.error(f"Failed to load GNN fraud: {e}")
            return None
    return _loaded_models.get("gnn_fraud")


def _get_fx_transformer():
    if "fx_transformer" not in _loaded_models:
        try:
            import torch
            from ml.models.fx_forecast.transformer_model import FXTransformerForecaster, FXTrainer

            meta_path = Path(f"{MODEL_DIR}/fx_transformer/metadata.json")
            if not meta_path.exists():
                return None
            meta = json.loads(meta_path.read_text())

            model = FXTransformerForecaster(
                n_features=meta.get("n_features", 11),
                d_model=meta.get("d_model", 64),
            )
            trainer = FXTrainer(model, device="cpu")
            trainer.load(f"{MODEL_DIR}/fx_transformer")
            _loaded_models["fx_transformer"] = trainer
            logger.info("Loaded FX transformer model")
        except Exception as e:
            logger.error(f"Failed to load FX transformer: {e}")
            return None
    return _loaded_models.get("fx_transformer")


def _get_bis_lgbm():
    if "bis_lgbm" not in _loaded_models:
        try:
            from ml.models.bis_risk.lgbm_risk import BISRiskModel
            model = BISRiskModel()
            model.load(f"{MODEL_DIR}/bis_risk_lgbm")
            _loaded_models["bis_lgbm"] = model
            logger.info("Loaded BIS LightGBM model")
        except Exception as e:
            logger.error(f"Failed to load BIS LightGBM: {e}")
            return None
    return _loaded_models.get("bis_lgbm")


# ─── Request/Response Models ────────────────────────────────────────────────

class FraudScoreRequest(BaseModel):
    transaction_id: str
    amount: float
    amount_log: Optional[float] = None
    amount_zscore: Optional[float] = 0.0
    velocity_1h: int = 0
    velocity_24h: int = 0
    velocity_7d: int = 0
    is_new_device: int = 0
    is_vpn: int = 0
    is_tor: int = 0
    failed_auth_count: int = 0
    merchant_category_risk: float = 0.2
    country_risk: float = 0.3
    hour_of_day: int = 12
    day_of_week: int = 3
    is_weekend: int = 0
    days_since_last_txn: int = 1
    avg_txn_amount_30d: float = 100.0
    std_txn_amount_30d: float = 50.0
    txn_amount_ratio: Optional[float] = None
    ip_risk_score: float = 0.1
    device_age_days: int = 100
    cross_border: int = 0
    currency_mismatch: int = 0


class GNNScoreRequest(BaseModel):
    node_features: List[List[float]]
    edge_index: List[List[int]]  # [[src...], [dst...]]


class FXForecastRequest(BaseModel):
    corridor: str
    historical_features: List[List[float]]  # (seq_len, n_features)
    last_rate: float
    steps: int = 24


class BISRiskRequest(BaseModel):
    country_risk_score: float
    industry_risk_score: float
    entity_age_days: int = 365
    transaction_volume_30d: float = 10000.0
    transaction_count_30d: int = 50
    chargeback_rate: float = 0.01
    refund_rate: float = 0.05
    sanctions_hit: int = 0
    pep_connection: int = 0
    adverse_media_count: int = 0
    kyb_completeness_score: float = 0.8
    ubo_declared: int = 1
    cross_border_ratio: float = 0.3
    cash_intensive: int = 0
    prior_investigations: int = 0
    prior_risk_level_encoded: int = 0
    directors_count: int = 2
    shareholders_count: int = 3
    revenue_vs_volume_ratio: float = 1.0


# ─── Endpoints ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    models_loaded = list(_loaded_models.keys())
    model_dir_exists = Path(MODEL_DIR).exists()
    available_models = []
    for name in ["fraud_xgb", "gnn_fraud", "fx_transformer", "bis_risk_lgbm"]:
        if (Path(MODEL_DIR) / name).exists():
            available_models.append(name)

    return {
        "status": "ok",
        "service": "ml-inference",
        "models_loaded": models_loaded,
        "models_available": available_models,
        "model_dir": MODEL_DIR,
        "model_dir_exists": model_dir_exists,
    }


@app.post("/api/v1/ml/fraud/score")
async def fraud_score(req: FraudScoreRequest):
    """Score a transaction for fraud using the trained XGBoost model."""
    import pandas as pd

    model = _get_fraud_xgb()
    if model is None:
        raise HTTPException(503, "Fraud model not loaded")

    # Build feature row
    data = req.model_dump()
    if data["amount_log"] is None:
        data["amount_log"] = float(np.log1p(data["amount"]))
    if data["txn_amount_ratio"] is None:
        data["txn_amount_ratio"] = data["amount"] / max(data["avg_txn_amount_30d"], 1.0)

    df = pd.DataFrame([data])
    result = model.predict_with_decision(df)

    return {
        "transaction_id": req.transaction_id,
        "fraud_score": float(result["fraud_score"].iloc[0]),
        "decision": str(result["decision"].iloc[0]),
        "risk_level": str(result["risk_level"].iloc[0]),
        "model_version": "fraud_xgb_v1",
        "model_type": "xgboost",
        "scored_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


@app.post("/api/v1/ml/fraud/gnn-score")
async def gnn_score(req: GNNScoreRequest):
    """Score nodes in a transaction graph for fraud using the GNN model."""
    import torch

    trainer = _get_gnn_fraud()
    if trainer is None:
        raise HTTPException(503, "GNN model not loaded")

    x = torch.tensor(req.node_features, dtype=torch.float32)
    edge_index = torch.tensor(req.edge_index, dtype=torch.long)

    trainer.model.eval()
    with torch.no_grad():
        logits, embeddings = trainer.model(x, edge_index)
        probs = torch.softmax(logits, dim=1)

    fraud_probs = probs[:, 1].numpy().tolist()

    return {
        "node_scores": fraud_probs,
        "n_nodes": len(fraud_probs),
        "n_flagged": sum(1 for p in fraud_probs if p > 0.5),
        "model_version": "gnn_fraud_v1",
        "model_type": "gat_v2",
        "scored_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


@app.post("/api/v1/ml/fx/forecast")
async def fx_forecast(req: FXForecastRequest):
    """Forecast exchange rates using the Transformer model."""
    import torch

    trainer = _get_fx_transformer()
    if trainer is None:
        raise HTTPException(503, "FX model not loaded")

    src = torch.tensor([req.historical_features], dtype=torch.float32)
    result = trainer.model.forecast(src, req.last_rate, steps=req.steps)

    return {
        "corridor": req.corridor,
        "forecast": result["forecast"].tolist(),
        "lower_95": result["lower_95"].tolist(),
        "upper_95": result["upper_95"].tolist(),
        "uncertainty": result["uncertainty"].tolist(),
        "horizon_hours": req.steps,
        "model_version": "fx_transformer_v1",
        "model_type": "transformer_encoder_decoder",
        "forecast_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


@app.post("/api/v1/ml/bis/risk-score")
async def bis_risk_score(req: BISRiskRequest):
    """Score entity risk using the trained LightGBM model."""
    import pandas as pd

    model = _get_bis_lgbm()
    if model is None:
        raise HTTPException(503, "BIS model not loaded")

    df = pd.DataFrame([req.model_dump()])
    result = model.predict_risk(df)

    return {
        "risk_class": int(result["risk_class"].iloc[0]),
        "risk_label": str(result["risk_label"].iloc[0]),
        "confidence": float(result["confidence"].iloc[0]),
        "probabilities": {
            "low": float(result["prob_low"].iloc[0]),
            "medium": float(result["prob_medium"].iloc[0]),
            "high": float(result["prob_high"].iloc[0]),
            "critical": float(result["prob_critical"].iloc[0]),
        },
        "model_version": "bis_lgbm_v1",
        "model_type": "lightgbm",
        "scored_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


@app.get("/api/v1/ml/models")
async def list_models():
    """List all available and loaded models."""
    models = []
    for name in ["fraud_xgb", "gnn_fraud", "fx_transformer", "bis_risk_lgbm"]:
        model_path = Path(MODEL_DIR) / name
        meta_path = model_path / "metadata.json"
        meta = {}
        if meta_path.exists():
            meta = json.loads(meta_path.read_text())

        models.append({
            "name": name,
            "available": model_path.exists(),
            "loaded": name in _loaded_models or name.replace("_lgbm", "") in _loaded_models,
            "metadata": meta,
        })

    return {"models": models, "model_dir": MODEL_DIR}


@app.post("/api/v1/ml/models/reload")
async def reload_models():
    """Hot-reload all models from disk."""
    _loaded_models.clear()
    loaded = []
    for loader_name, loader in [
        ("fraud_xgb", _get_fraud_xgb),
        ("gnn_fraud", _get_gnn_fraud),
        ("fx_transformer", _get_fx_transformer),
        ("bis_lgbm", _get_bis_lgbm),
    ]:
        try:
            result = loader()
            if result:
                loaded.append(loader_name)
        except Exception as e:
            logger.error(f"Failed to reload {loader_name}: {e}")

    return {"reloaded": loaded, "total": len(loaded)}


@app.get("/api/v1/ml/lakehouse/stats")
async def lakehouse_stats():
    """Get lakehouse feature store stats."""
    try:
        from ml.lakehouse.feature_store import FeatureStore
        lakehouse_dir = os.environ.get("LAKEHOUSE_DATA_DIR", str(Path(MODEL_DIR).parent / "lakehouse_data"))
        store = FeatureStore(lakehouse_dir)
        stats = store.get_stats()
        return {"status": "ok", **stats}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.get("/api/v1/ml/lakehouse/lineage/{domain}")
async def lakehouse_lineage(domain: str):
    """Get data lineage for a lakehouse domain."""
    try:
        from ml.lakehouse.feature_store import FeatureStore
        lakehouse_dir = os.environ.get("LAKEHOUSE_DATA_DIR", str(Path(MODEL_DIR).parent / "lakehouse_data"))
        store = FeatureStore(lakehouse_dir)
        lineage = store.get_lineage(domain)
        return {"domain": domain, "lineage": lineage}
    except Exception as e:
        return {"domain": domain, "error": str(e)}


@app.post("/api/v1/ml/lakehouse/materialize")
async def trigger_materialization():
    """Trigger feature materialization from platform data."""
    try:
        from ml.lakehouse.feature_store import (
            FeatureStore, materialize_fraud_features, materialize_bis_features, materialize_fx_features,
        )
        from ml.data_generators.fraud_data import generate_fraud_dataset
        from ml.data_generators.bis_data import generate_bis_dataset
        from ml.data_generators.fx_data import generate_fx_dataset

        lakehouse_dir = os.environ.get("LAKEHOUSE_DATA_DIR", str(Path(MODEL_DIR).parent / "lakehouse_data"))
        store = FeatureStore(lakehouse_dir)

        results = {}
        fraud_df = generate_fraud_dataset(n_samples=10_000, fraud_rate=0.03)
        m = materialize_fraud_features(store, fraud_df)
        results["fraud_transactions"] = len(m)

        bis_df = generate_bis_dataset(n_samples=5_000)
        m = materialize_bis_features(store, bis_df)
        results["bis_entities"] = len(m)

        fx_df = generate_fx_dataset(n_hours=168)
        m = materialize_fx_features(store, fx_df)
        results["fx_rates"] = len(m)

        return {"status": "ok", "materialized": results, "stats": store.get_stats()}
    except Exception as e:
        logger.error(f"Materialization failed: {e}")
        raise HTTPException(500, f"Materialization failed: {e}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("ML_INFERENCE_PORT", "8200"))
    uvicorn.run(app, host="0.0.0.0", port=port)
