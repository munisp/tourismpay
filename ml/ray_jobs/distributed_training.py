"""
Ray-based distributed training jobs for TourismPay ML models.
Supports:
  - Distributed hyperparameter tuning (Ray Tune)
  - Distributed data preprocessing
  - Parallel model training across multiple models
  - Scheduled retraining via Ray Jobs API

Designed for CPU-only clusters (no GPU required).
"""
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def init_ray(num_cpus: int = 4, dashboard_port: int = 8265) -> None:
    """Initialize Ray runtime."""
    import ray
    if not ray.is_initialized():
        ray.init(
            num_cpus=num_cpus,
            dashboard_port=dashboard_port,
            ignore_reinit_error=True,
            logging_level=logging.INFO,
        )
        logger.info(f"Ray initialized — CPUs: {num_cpus}, Dashboard: http://localhost:{dashboard_port}")


def shutdown_ray() -> None:
    import ray
    if ray.is_initialized():
        ray.shutdown()


# ─── Remote Functions ────────────────────────────────────────────────────────


def _train_fraud_xgb_remote(data_path: str, output_dir: str, config: dict) -> dict:
    """Train fraud XGB model (runs as Ray remote task)."""
    import ray
    ray.init(ignore_reinit_error=True)

    from ml.data_generators.fraud_data import generate_fraud_dataset
    from ml.models.fraud.xgb_fraud import FraudXGBModel

    df = generate_fraud_dataset(
        n_samples=config.get("n_samples", 100_000),
        fraud_rate=config.get("fraud_rate", 0.03),
        seed=config.get("seed", 42),
    )

    model = FraudXGBModel(config)
    metrics = model.train(df)
    model.save(output_dir)

    return {"model": "fraud_xgb", "metrics": metrics, "path": output_dir}


def _train_bis_lgbm_remote(data_path: str, output_dir: str, config: dict) -> dict:
    """Train BIS LightGBM model (runs as Ray remote task)."""
    import ray
    ray.init(ignore_reinit_error=True)

    from ml.data_generators.bis_data import generate_bis_dataset
    from ml.models.bis_risk.lgbm_risk import BISRiskModel

    df = generate_bis_dataset(
        n_samples=config.get("n_samples", 20_000),
        seed=config.get("seed", 42),
    )

    model = BISRiskModel(config)
    metrics = model.train(df)
    model.save(output_dir)

    return {"model": "bis_risk_lgbm", "metrics": metrics, "path": output_dir}


def _train_gnn_remote(output_dir: str, config: dict) -> dict:
    """Train GNN fraud model (runs as Ray remote task)."""
    import ray
    import torch
    ray.init(ignore_reinit_error=True)

    from ml.data_generators.fraud_data import generate_transaction_graph
    from ml.models.gnn_fraud.gnn_model import GATFraudDetector, GNNTrainer

    graph = generate_transaction_graph(
        n_users=config.get("n_users", 5000),
        n_transactions=config.get("n_transactions", 50000),
        seed=config.get("seed", 42),
    )

    x = torch.tensor(graph["node_features"], dtype=torch.float32)
    edge_index = torch.tensor(graph["edge_index"], dtype=torch.long)
    labels = torch.tensor(graph["node_labels"], dtype=torch.long)

    n_nodes = x.size(0)
    perm = torch.randperm(n_nodes)
    train_size = int(0.7 * n_nodes)
    val_size = int(0.15 * n_nodes)
    train_mask = torch.zeros(n_nodes, dtype=torch.bool)
    val_mask = torch.zeros(n_nodes, dtype=torch.bool)
    train_mask[perm[:train_size]] = True
    val_mask[perm[train_size:train_size + val_size]] = True

    model = GATFraudDetector(
        in_channels=x.size(1),
        hidden_channels=config.get("hidden_dim", 64),
        num_layers=config.get("num_layers", 3),
        heads=config.get("heads", 4),
        dropout=config.get("dropout", 0.3),
    )

    trainer = GNNTrainer(model, learning_rate=config.get("learning_rate", 0.001))
    results = trainer.train_full(
        x, edge_index, labels, train_mask, val_mask,
        epochs=config.get("epochs", 100),
        patience=config.get("patience", 20),
    )

    trainer.save(output_dir, metrics=results["final_metrics"])
    return {"model": "gnn_fraud", "metrics": results["final_metrics"], "path": output_dir}


# ─── Hyperparameter Tuning ───────────────────────────────────────────────────


def tune_fraud_xgb(
    n_trials: int = 20,
    n_samples: int = 50_000,
    output_dir: str = "./ml/saved_models/fraud_xgb_tuned",
) -> dict:
    """
    Distributed hyperparameter search for fraud XGB using Ray Tune.
    """
    import ray
    from ray import tune
    from ray.tune.schedulers import ASHAScheduler

    init_ray()

    from ml.data_generators.fraud_data import generate_fraud_dataset
    from ml.models.fraud.xgb_fraud import FraudXGBModel

    # Generate data once and share via Ray object store
    df = generate_fraud_dataset(n_samples=n_samples)
    df_ref = ray.put(df)

    def train_fn(config: dict) -> None:
        df_local = ray.get(df_ref)
        model = FraudXGBModel(config)
        metrics = model.train(df_local, val_split=0.2)
        tune.report(auc_roc=metrics["auc_roc"], auc_pr=metrics["auc_pr"])

    search_space = {
        "n_estimators": tune.choice([200, 300, 500, 800]),
        "max_depth": tune.choice([4, 6, 8, 10]),
        "learning_rate": tune.loguniform(0.01, 0.3),
        "subsample": tune.uniform(0.6, 1.0),
        "colsample_bytree": tune.uniform(0.6, 1.0),
        "min_child_weight": tune.choice([1, 3, 5, 10]),
        "scale_pos_weight": tune.choice([5, 10, 20, 30]),
    }

    scheduler = ASHAScheduler(max_t=1, grace_period=1, reduction_factor=2)

    analysis = tune.run(
        train_fn,
        config=search_space,
        num_samples=n_trials,
        metric="auc_roc",
        mode="max",
        scheduler=scheduler,
        resources_per_trial={"cpu": 1},
        verbose=1,
    )

    best_config = analysis.best_config
    best_result = analysis.best_result

    # Retrain with best config on full data
    best_model = FraudXGBModel(best_config)
    final_metrics = best_model.train(df)
    best_model.save(output_dir)

    return {
        "best_config": best_config,
        "best_auc_roc": best_result["auc_roc"],
        "final_metrics": final_metrics,
        "n_trials": n_trials,
    }


# ─── Parallel Training Job ──────────────────────────────────────────────────


def train_all_parallel(output_dir: str = "./ml/saved_models") -> List[dict]:
    """
    Train all models in parallel using Ray tasks.
    Each model runs as an independent Ray remote task.
    """
    import ray

    init_ray()

    train_fraud = ray.remote(_train_fraud_xgb_remote)
    train_bis = ray.remote(_train_bis_lgbm_remote)
    train_gnn = ray.remote(_train_gnn_remote)

    futures = [
        train_fraud.remote("", f"{output_dir}/fraud_xgb", {}),
        train_bis.remote("", f"{output_dir}/bis_risk_lgbm", {}),
        train_gnn.remote(f"{output_dir}/gnn_fraud", {}),
    ]

    results = ray.get(futures)

    shutdown_ray()
    return results


# ─── Scheduled Retraining Job ────────────────────────────────────────────────


def scheduled_retrain_job(
    lakehouse_path: str = "./lakehouse_data",
    model_dir: str = "./ml/saved_models",
) -> dict:
    """
    Scheduled retraining job — designed to run as a Ray Job.
    Checks for new data, detects drift, and retrains if needed.
    """
    from ml.continuous_training.pipeline import ContinuousTrainingPipeline

    pipeline = ContinuousTrainingPipeline(
        lakehouse_path=lakehouse_path,
        model_dir=model_dir,
    )

    return pipeline.run_cycle()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["parallel", "tune", "scheduled"], default="parallel")
    parser.add_argument("--output-dir", default="./ml/saved_models")
    parser.add_argument("--n-trials", type=int, default=10)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)

    if args.mode == "parallel":
        results = train_all_parallel(args.output_dir)
        for r in results:
            print(f"  {r['model']}: {r.get('metrics', {})}")
    elif args.mode == "tune":
        result = tune_fraud_xgb(n_trials=args.n_trials, output_dir=args.output_dir)
        print(f"  Best AUC-ROC: {result['best_auc_roc']:.4f}")
        print(f"  Best config: {result['best_config']}")
    elif args.mode == "scheduled":
        result = scheduled_retrain_job()
        print(json.dumps(result, indent=2, default=str))
