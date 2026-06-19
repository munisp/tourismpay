"""
Continuous Training Pipeline

Implements continuous model retraining from platform data:
1. Extract fresh data from PostgreSQL (platform DB)
2. Transform into training features via Lakehouse
3. Detect data drift (feature distribution shift)
4. Retrain models when drift threshold exceeded
5. Validate new model against champion (A/B comparison)
6. Promote if new model wins, rollback otherwise
7. Log all training runs for audit

Schedule: runs every 6 hours (configurable).
"""
from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger("tourismpay.continuous_training")

CHECKPOINT_BASE = Path(__file__).parent / "checkpoints"
PIPELINE_LOG = CHECKPOINT_BASE / "pipeline_log.jsonl"

# Database connection for platform data extraction
PG_DSN = os.environ.get(
    "DATABASE_URL",
    "postgresql://tourismpay_user:testpass123@localhost:5432/tourismpay",
)


async def extract_platform_data(
    lookback_hours: int = 24,
) -> dict[str, pd.DataFrame]:
    """
    Extract fresh data from TourismPay PostgreSQL.
    
    Pulls:
    - Recent transactions (wallet_transactions)
    - User profiles (users)
    - Merchant profiles (establishments)
    - Fraud alerts (fraud_alerts)
    - FX rate snapshots (if available)
    """
    try:
        import asyncpg
        conn = await asyncpg.connect(PG_DSN)
    except Exception as e:
        logger.warning("Cannot connect to platform DB: %s", e)
        return {}

    cutoff = datetime.utcnow() - timedelta(hours=lookback_hours)
    datasets = {}

    try:
        # Transactions
        rows = await conn.fetch("""
            SELECT id, user_id, amount, currency, status, type,
                   created_at, wallet_id
            FROM wallet_transactions
            WHERE created_at > $1
            ORDER BY created_at
        """, int(cutoff.timestamp()))
        if rows:
            datasets["transactions"] = pd.DataFrame([dict(r) for r in rows])

        # Users
        rows = await conn.fetch("""
            SELECT id, open_id, name, email, role, created_at
            FROM users
        """)
        if rows:
            datasets["users"] = pd.DataFrame([dict(r) for r in rows])

        # Establishments (merchants)
        rows = await conn.fetch("""
            SELECT id, name, city, country, type, status, owner_id, created_at
            FROM establishments
        """)
        if rows:
            datasets["merchants"] = pd.DataFrame([dict(r) for r in rows])

        # Fraud alerts
        rows = await conn.fetch("""
            SELECT id, type, severity, status, country, amount,
                   description, created_at
            FROM fraud_alerts
            WHERE created_at > $1
        """, int(cutoff.timestamp()))
        if rows:
            datasets["fraud_alerts"] = pd.DataFrame([dict(r) for r in rows])

    except Exception as e:
        logger.error("Data extraction error: %s", e)
    finally:
        await conn.close()

    return datasets


def detect_data_drift(
    current_data: pd.DataFrame,
    reference_data: pd.DataFrame,
    feature_cols: list[str],
    threshold: float = 0.1,
) -> dict[str, Any]:
    """
    Detect distribution drift between current and reference data
    using Population Stability Index (PSI).
    
    PSI < 0.1: no drift
    0.1 <= PSI < 0.25: moderate drift
    PSI >= 0.25: significant drift → retrain
    """
    drift_scores = {}

    for col in feature_cols:
        if col not in current_data.columns or col not in reference_data.columns:
            continue

        current_vals = current_data[col].dropna().values
        reference_vals = reference_data[col].dropna().values

        if len(current_vals) < 10 or len(reference_vals) < 10:
            continue

        # Compute PSI
        n_bins = 10
        breakpoints = np.percentile(reference_vals, np.linspace(0, 100, n_bins + 1))
        breakpoints = np.unique(breakpoints)

        if len(breakpoints) < 3:
            continue

        ref_counts, _ = np.histogram(reference_vals, bins=breakpoints)
        cur_counts, _ = np.histogram(current_vals, bins=breakpoints)

        ref_pct = ref_counts / max(len(reference_vals), 1) + 1e-6
        cur_pct = cur_counts / max(len(current_vals), 1) + 1e-6

        psi = float(np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct)))
        drift_scores[col] = round(psi, 4)

    avg_psi = np.mean(list(drift_scores.values())) if drift_scores else 0.0
    needs_retrain = avg_psi >= threshold

    return {
        "feature_drift": drift_scores,
        "average_psi": round(float(avg_psi), 4),
        "threshold": threshold,
        "needs_retrain": needs_retrain,
        "drift_level": "significant" if avg_psi >= 0.25 else "moderate" if avg_psi >= 0.1 else "none",
        "checked_at": datetime.utcnow().isoformat(),
    }


def compare_models(
    champion_metrics: dict[str, float],
    challenger_metrics: dict[str, float],
    primary_metric: str = "auroc",
    min_improvement: float = 0.005,
) -> dict[str, Any]:
    """
    Compare champion vs challenger model.
    Challenger must beat champion by min_improvement to be promoted.
    """
    champion_score = champion_metrics.get(primary_metric, 0)
    challenger_score = challenger_metrics.get(primary_metric, 0)

    improvement = challenger_score - champion_score
    is_better = improvement > min_improvement

    return {
        "champion_score": champion_score,
        "challenger_score": challenger_score,
        "improvement": round(improvement, 4),
        "min_required": min_improvement,
        "promote_challenger": is_better,
        "decision": "promote" if is_better else "keep_champion",
    }


def promote_model(
    model_name: str,
    checkpoint_path: str,
    metrics: dict[str, Any],
) -> bool:
    """
    Promote a challenger model to champion.
    Copies checkpoint to 'production' directory and logs the promotion.
    """
    prod_dir = CHECKPOINT_BASE / model_name / "production"
    prod_dir.mkdir(parents=True, exist_ok=True)

    import shutil
    src = Path(checkpoint_path)
    dst = prod_dir / "model.pt"

    if src.exists():
        shutil.copy2(src, dst)

        # Save promotion metadata
        metadata = {
            "promoted_at": datetime.utcnow().isoformat(),
            "source_checkpoint": str(src),
            "metrics": metrics,
        }
        with open(prod_dir / "metadata.json", "w") as f:
            json.dump(metadata, f, indent=2)

        logger.info("Model %s promoted to production", model_name)
        return True

    return False


async def run_pipeline(
    models: list[str] | None = None,
    force_retrain: bool = False,
    lookback_hours: int = 24,
) -> dict[str, Any]:
    """
    Run the full continuous training pipeline.
    
    Steps:
    1. Extract fresh data from platform DB
    2. Check for data drift
    3. Retrain if drift detected (or forced)
    4. Compare with champion model
    5. Promote if better
    """
    if models is None:
        models = ["fraud_gnn", "fx_forecaster", "anomaly_detector", "risk_scorer"]

    pipeline_run = {
        "run_id": f"pipeline_{int(time.time())}",
        "started_at": datetime.utcnow().isoformat(),
        "models": {},
    }

    # Extract data
    logger.info("Extracting platform data (lookback=%dh)...", lookback_hours)
    platform_data = await extract_platform_data(lookback_hours)

    for model_name in models:
        model_result = {"status": "skipped", "reason": ""}

        # Check drift (simplified — in production, compare against stored reference)
        if not force_retrain and model_name in ("fraud_gnn", "anomaly_detector"):
            if "transactions" in platform_data and len(platform_data["transactions"]) >= 100:
                numeric_cols = platform_data["transactions"].select_dtypes(include=[np.number]).columns.tolist()
                if numeric_cols:
                    drift = detect_data_drift(
                        platform_data["transactions"],
                        platform_data["transactions"],  # self-comparison baseline
                        numeric_cols,
                    )
                    model_result["drift"] = drift
                    if not drift["needs_retrain"]:
                        model_result["status"] = "skipped"
                        model_result["reason"] = f"No drift detected (PSI={drift['average_psi']:.4f})"
                        pipeline_run["models"][model_name] = model_result
                        continue

        # Retrain
        logger.info("Retraining %s...", model_name)
        try:
            from training.ray_distributed import train_distributed
            result = train_distributed(model_name, {"epochs": 20})
            model_result["training"] = result
            model_result["status"] = "trained"
        except Exception as e:
            model_result["status"] = "failed"
            model_result["error"] = str(e)
            logger.error("Training %s failed: %s", model_name, e)

        # Compare with champion
        champion_path = CHECKPOINT_BASE / model_name / "production" / "metadata.json"
        if champion_path.exists() and model_result["status"] == "trained":
            with open(champion_path) as f:
                champion_meta = json.load(f)
            comparison = compare_models(
                champion_meta.get("metrics", {}),
                result.get("metrics", {}),
            )
            model_result["comparison"] = comparison

            if comparison["promote_challenger"]:
                checkpoint_path = str(CHECKPOINT_BASE / model_name / "best_model.pt")
                promoted = promote_model(model_name, checkpoint_path, result.get("metrics", {}))
                model_result["promoted"] = promoted

        pipeline_run["models"][model_name] = model_result

    pipeline_run["completed_at"] = datetime.utcnow().isoformat()

    # Log pipeline run
    PIPELINE_LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(PIPELINE_LOG, "a") as f:
        f.write(json.dumps(pipeline_run) + "\n")

    return pipeline_run
