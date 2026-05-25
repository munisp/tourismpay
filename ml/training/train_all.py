"""
Master training script — trains all TourismPay ML models end-to-end.

Usage:
    python -m ml.training.train_all [--output-dir ./saved_models] [--skip-gnn]

Steps:
  1. Generate synthetic training data
  2. Train XGBoost fraud detector
  3. Train GNN fraud graph model
  4. Train FX Transformer forecaster
  5. Train LightGBM BIS risk classifier
  6. Save all models + metrics
"""
import argparse
import json
import logging
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("train_all")


def train_fraud_xgb(output_dir: Path) -> dict:
    logger.info("=" * 60)
    logger.info("STEP 1: Training XGBoost Fraud Detector")
    logger.info("=" * 60)

    from ml.data_generators.fraud_data import generate_fraud_dataset
    from ml.models.fraud.xgb_fraud import FraudXGBModel

    df = generate_fraud_dataset(n_samples=100_000, fraud_rate=0.03)
    logger.info(f"Generated {len(df)} transactions, fraud rate: {df['is_fraud'].mean():.3f}")

    model = FraudXGBModel()
    metrics = model.train(df, val_split=0.2)

    save_path = str(output_dir / "fraud_xgb")
    model.save(save_path)

    importance = model.feature_importance()
    logger.info(f"Top 5 features: {list(importance.items())[:5]}")
    logger.info(f"Fraud XGB — AUC-ROC: {metrics['auc_roc']:.4f}, AUC-PR: {metrics['auc_pr']:.4f}")

    return {"model": "fraud_xgb", "metrics": metrics, "path": save_path}


def train_fraud_gnn(output_dir: Path) -> dict:
    logger.info("=" * 60)
    logger.info("STEP 2: Training GNN Fraud Graph Detector")
    logger.info("=" * 60)

    import torch
    from ml.data_generators.fraud_data import generate_transaction_graph
    from ml.models.gnn_fraud.gnn_model import GATFraudDetector, GNNTrainer

    graph = generate_transaction_graph(n_users=5000, n_transactions=50000)
    logger.info(
        f"Generated graph — Nodes: {graph['node_features'].shape[0]}, "
        f"Edges: {graph['edge_index'].shape[1]}, "
        f"Fraud nodes: {graph['node_labels'].sum()}"
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
        hidden_channels=64,
        num_layers=3,
        heads=4,
        dropout=0.3,
    )

    trainer = GNNTrainer(model, learning_rate=0.001, device="cpu")
    results = trainer.train_full(
        x, edge_index, labels, train_mask, val_mask,
        epochs=100, patience=20,
    )

    save_path = str(output_dir / "gnn_fraud")
    trainer.save(save_path, metrics=results["final_metrics"])

    logger.info(
        f"GNN Fraud — Val AUC: {results['final_metrics']['auc_roc']:.4f}, "
        f"F1: {results['final_metrics']['f1']:.4f}"
    )

    return {"model": "gnn_fraud", "metrics": results["final_metrics"], "path": save_path}


def train_fx_transformer(output_dir: Path) -> dict:
    logger.info("=" * 60)
    logger.info("STEP 3: Training FX Transformer Forecaster")
    logger.info("=" * 60)

    import torch
    from torch.utils.data import DataLoader, TensorDataset
    from ml.data_generators.fx_data import generate_fx_dataset
    from ml.models.fx_forecast.transformer_model import FXTransformerForecaster, FXTrainer

    df = generate_fx_dataset(corridors=["NGN/USD", "KES/USD"], n_hours=2160)  # 3 months
    logger.info(f"Generated FX data — {len(df)} rows, {df['corridor'].nunique()} corridors")

    feature_cols = [
        "rate", "rate_sma_24", "rate_ema_12", "rate_rsi_14",
        "volume", "spread", "volatility_24h",
        "hour_sin", "hour_cos", "dow_sin", "dow_cos",
    ]

    seq_len = 168  # 7 days lookback
    horizon = 24   # 24h forecast

    # Create sequences for each corridor
    all_src, all_tgt_in, all_tgt_out = [], [], []

    for corridor in df["corridor"].unique():
        cdf = df[df["corridor"] == corridor].sort_values("timestamp").reset_index(drop=True)
        features = cdf[feature_cols].values.astype(np.float32)

        # Replace NaN/inf before normalization
        features = np.nan_to_num(features, nan=0.0, posinf=0.0, neginf=0.0)

        # Normalize per-corridor
        means = features.mean(axis=0)
        stds = features.std(axis=0).clip(min=1e-6)
        features = (features - means) / stds
        features = np.clip(features, -10, 10)  # prevent extreme outliers

        rates = cdf["rate"].values.astype(np.float32)
        rate_mean, rate_std = float(rates.mean()), max(float(rates.std()), 1e-6)
        rates_norm = (rates - rate_mean) / rate_std
        rates_norm = np.clip(rates_norm, -10, 10)

        for i in range(len(features) - seq_len - horizon):
            src = features[i:i + seq_len]
            tgt_rates = rates_norm[i + seq_len:i + seq_len + horizon]
            tgt_in = tgt_rates[:-1].reshape(-1, 1)
            tgt_in = np.concatenate([rates_norm[i + seq_len - 1:i + seq_len].reshape(1, 1), tgt_in], axis=0)
            tgt_out = tgt_rates.reshape(-1, 1)

            all_src.append(src)
            all_tgt_in.append(tgt_in)
            all_tgt_out.append(tgt_out)

    src_tensor = torch.tensor(np.array(all_src))
    tgt_in_tensor = torch.tensor(np.array(all_tgt_in))
    tgt_out_tensor = torch.tensor(np.array(all_tgt_out))

    n_total = len(src_tensor)
    n_train = int(0.8 * n_total)

    train_ds = TensorDataset(src_tensor[:n_train], tgt_in_tensor[:n_train], tgt_out_tensor[:n_train])
    val_ds = TensorDataset(src_tensor[n_train:], tgt_in_tensor[n_train:], tgt_out_tensor[n_train:])

    train_loader = DataLoader(train_ds, batch_size=64, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=64)

    model = FXTransformerForecaster(
        n_features=len(feature_cols),
        d_model=64,
        n_heads=4,
        n_encoder_layers=3,
        n_decoder_layers=2,
        dim_feedforward=128,
        forecast_horizon=horizon,
    )

    trainer = FXTrainer(model, learning_rate=0.001, device="cpu")
    results = trainer.train_full(train_loader, val_loader, epochs=30, patience=10)

    save_path = str(output_dir / "fx_transformer")
    trainer.save(save_path, metrics={"best_val_loss": results["best_val_loss"]})

    logger.info(f"FX Transformer — Best val loss: {results['best_val_loss']:.6f}")

    return {
        "model": "fx_transformer",
        "metrics": {"best_val_loss": results["best_val_loss"]},
        "path": save_path,
    }


def train_bis_lgbm(output_dir: Path) -> dict:
    logger.info("=" * 60)
    logger.info("STEP 4: Training LightGBM BIS Risk Classifier")
    logger.info("=" * 60)

    from ml.data_generators.bis_data import generate_bis_dataset
    from ml.models.bis_risk.lgbm_risk import BISRiskModel

    df = generate_bis_dataset(n_samples=20_000)
    logger.info(f"Generated {len(df)} BIS records")
    logger.info(f"Label distribution:\n{df['risk_label'].value_counts().sort_index().to_dict()}")

    model = BISRiskModel()
    metrics = model.train(df, val_split=0.2)

    save_path = str(output_dir / "bis_risk_lgbm")
    model.save(save_path)

    importance = model.feature_importance()
    logger.info(f"Top 5 features: {list(importance.items())[:5]}")
    logger.info(f"BIS Risk — AUC-ROC: {metrics['auc_roc_weighted']:.4f}, F1: {metrics['f1_weighted']:.4f}")

    return {"model": "bis_risk_lgbm", "metrics": metrics, "path": save_path}


def main():
    parser = argparse.ArgumentParser(description="Train all TourismPay ML models")
    parser.add_argument("--output-dir", type=str, default="./ml/saved_models")
    parser.add_argument("--skip-gnn", action="store_true", help="Skip GNN training (requires torch-geometric)")
    parser.add_argument("--skip-fx", action="store_true", help="Skip FX transformer training")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    start = time.time()
    results = []

    # Initialize lakehouse feature store
    lakehouse_dir = output_dir.parent / "lakehouse_data"
    try:
        from ml.lakehouse.feature_store import (
            FeatureStore,
            materialize_fraud_features,
            materialize_bis_features,
            materialize_fx_features,
            materialize_graph_features,
        )
        feature_store = FeatureStore(str(lakehouse_dir))
        logger.info(f"Lakehouse feature store initialized at {lakehouse_dir}")
    except Exception as e:
        feature_store = None
        logger.warning(f"Lakehouse not available, skipping feature materialization: {e}")

    # 1. Fraud XGBoost
    try:
        r = train_fraud_xgb(output_dir)
        results.append(r)
    except Exception as e:
        logger.error(f"Fraud XGB training failed: {e}")
        results.append({"model": "fraud_xgb", "error": str(e)})

    # 2. GNN Fraud
    if not args.skip_gnn:
        try:
            r = train_fraud_gnn(output_dir)
            results.append(r)
        except Exception as e:
            logger.error(f"GNN Fraud training failed: {e}")
            results.append({"model": "gnn_fraud", "error": str(e)})
    else:
        logger.info("Skipping GNN training (--skip-gnn)")

    # 3. FX Transformer
    if not args.skip_fx:
        try:
            r = train_fx_transformer(output_dir)
            results.append(r)
        except Exception as e:
            logger.error(f"FX Transformer training failed: {e}")
            results.append({"model": "fx_transformer", "error": str(e)})
    else:
        logger.info("Skipping FX training (--skip-fx)")

    # 4. BIS LightGBM
    try:
        r = train_bis_lgbm(output_dir)
        results.append(r)
    except Exception as e:
        logger.error(f"BIS LightGBM training failed: {e}")
        results.append({"model": "bis_risk_lgbm", "error": str(e)})

    # ── Lakehouse Feature Materialization ──────────────────────────
    if feature_store:
        logger.info("=" * 60)
        logger.info("MATERIALIZING FEATURES TO LAKEHOUSE")
        logger.info("=" * 60)
        try:
            from ml.data_generators.fraud_data import generate_fraud_dataset
            from ml.data_generators.bis_data import generate_bis_dataset
            from ml.data_generators.fx_data import generate_fx_dataset

            # Materialize fraud features
            fraud_df = generate_fraud_dataset(n_samples=100_000, fraud_rate=0.03)
            materialized_fraud = materialize_fraud_features(feature_store, fraud_df)
            feature_store.write_training_data("fraud", materialized_fraud, split="train")
            logger.info(f"  fraud_transactions: {len(materialized_fraud)} rows materialized")

            # Materialize BIS features
            bis_df = generate_bis_dataset(n_samples=20_000)
            materialized_bis = materialize_bis_features(feature_store, bis_df)
            feature_store.write_training_data("bis", materialized_bis, split="train")
            logger.info(f"  bis_entities: {len(materialized_bis)} rows materialized")

            # Materialize FX features
            fx_df = generate_fx_dataset(n_hours=2160)
            materialized_fx = materialize_fx_features(feature_store, fx_df)
            logger.info(f"  fx_rates: {len(materialized_fx)} rows materialized")

            # Materialize graph features from fraud data
            graph_data = materialize_graph_features(feature_store, fraud_df)
            logger.info(f"  graph: {len(graph_data.get('edges', []))} edges, {len(graph_data.get('nodes', []))} nodes")

            stats = feature_store.get_stats()
            logger.info(f"  Lakehouse stats: {stats['total_rows']} total rows across {len(stats['domains'])} domains, {stats['total_size_mb']:.1f} MB")
        except Exception as e:
            logger.warning(f"Feature materialization failed: {e}")

    elapsed = time.time() - start
    logger.info("=" * 60)
    logger.info(f"ALL TRAINING COMPLETE — {elapsed:.1f}s")
    logger.info("=" * 60)

    for r in results:
        status = "OK" if "error" not in r else f"FAILED: {r['error']}"
        logger.info(f"  {r['model']}: {status}")

    # Save summary
    summary = {"timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"), "elapsed_seconds": elapsed, "results": results}
    summary_path = output_dir / "training_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2, default=str))
    logger.info(f"Summary saved to {summary_path}")

    return 0 if all("error" not in r for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
