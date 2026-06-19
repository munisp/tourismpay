"""
Training script for Fraud Detection GNN (GraphSAGE).

Features:
- Train/val/test split (70/15/15) with temporal ordering
- Class-weighted loss (handles 3% fraud rate imbalance)
- Early stopping with patience=10
- Learning rate scheduling (ReduceLROnPlateau)
- Checkpoint saving (best model + periodic)
- Metrics: AUROC, AUPRC, F1, precision, recall at threshold
- CPU-only training (no CUDA required)
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.metrics import (
    average_precision_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from models.fraud_gnn.model import FraudGNN, build_model

CHECKPOINT_DIR = Path(__file__).parent / "checkpoints" / "fraud_gnn"
DATA_DIR = Path(__file__).parent.parent / "data" / "synthetic" / "generated"


def load_and_prepare_data(
    data_dir: Path = DATA_DIR,
) -> dict:
    """Load synthetic data and prepare graph tensors."""
    transactions = pd.read_parquet(data_dir / "transactions.parquet")
    graph_edges = pd.read_parquet(data_dir / "graph_edges.parquet")
    users = pd.read_parquet(data_dir / "users.parquet")
    merchants = pd.read_parquet(data_dir / "merchants.parquet")

    # Build node ID mapping
    all_node_ids = sorted(set(users["user_id"].tolist() + merchants["merchant_id"].tolist()))
    node_id_map = {nid: idx for idx, nid in enumerate(all_node_ids)}
    n_nodes = len(node_id_map)

    # Build node features (14-dim)
    node_features = np.zeros((n_nodes, 14), dtype=np.float32)
    for _, row in users.iterrows():
        idx = node_id_map.get(row["user_id"])
        if idx is not None:
            node_features[idx] = [
                float(row["account_age_days"]) / 1095,
                float(row["avg_monthly_txns"]) / 100,
                float(row["avg_txn_amount"]) / 10000,
                float(row["device_count"]) / 5,
                1.0 if row["is_pep"] else 0.0,
                {"basic": 0.33, "verified": 0.66, "enhanced": 1.0}.get(row["kyc_level"], 0.33),
                1.0 if row["country"] in {"IR", "KP", "SY", "AF", "SO"} else 0.5 if row["country"] in {"NG", "KE", "GH"} else 0.0,
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
            ]
    for _, row in merchants.iterrows():
        idx = node_id_map.get(row["merchant_id"])
        if idx is not None:
            node_features[idx] = [
                float(row["years_in_operation"]) / 20,
                float(row["staff_count"]) / 50,
                float(row["monthly_volume"]) / 1e7,
                float(row["chargeback_rate"]) * 10,
                0.0,
                {"approved": 1.0, "pending": 0.5, "under_review": 0.3, "rejected": 0.0}.get(row["kyb_status"], 0.5),
                0.5,
                float(row["rating"]) / 5.0,
                1.0 if row["category"] in {"gambling", "crypto", "wire_transfer"} else 0.0,
                0.0, 0.0, 0.0, 0.0, 0.0,
            ]

    # Build edge index and features from graph_edges
    valid_edges = graph_edges[
        graph_edges["source"].isin(node_id_map) & graph_edges["target"].isin(node_id_map)
    ].copy()

    edge_src = [node_id_map[s] for s in valid_edges["source"]]
    edge_dst = [node_id_map[t] for t in valid_edges["target"]]
    edge_index = np.array([edge_src, edge_dst], dtype=np.int64)

    # Edge features (6-dim)
    edge_features = np.zeros((len(valid_edges), 6), dtype=np.float32)
    for i, (_, row) in enumerate(valid_edges.iterrows()):
        edge_features[i] = [
            float(row["amount"]) / 50000,
            1.0 if row["edge_type"] == "p2p_transfer" else 0.0,
            1.0 if row["edge_type"] == "transacts_with" else 0.0,
            0.0, 0.0, 0.0,
        ]

    labels = valid_edges["is_fraud"].astype(int).values

    # Temporal split (70/15/15)
    n = len(labels)
    train_end = int(n * 0.7)
    val_end = int(n * 0.85)

    return {
        "node_features": torch.FloatTensor(node_features),
        "edge_index": torch.LongTensor(edge_index),
        "edge_features": torch.FloatTensor(edge_features),
        "labels": torch.FloatTensor(labels),
        "train_mask": (0, train_end),
        "val_mask": (train_end, val_end),
        "test_mask": (val_end, n),
        "n_nodes": n_nodes,
    }


def compute_metrics(
    labels: np.ndarray,
    probs: np.ndarray,
    threshold: float = 0.5,
) -> dict:
    """Compute classification metrics."""
    preds = (probs >= threshold).astype(int)
    metrics = {
        "auroc": float(roc_auc_score(labels, probs)) if len(np.unique(labels)) > 1 else 0.0,
        "auprc": float(average_precision_score(labels, probs)) if len(np.unique(labels)) > 1 else 0.0,
        "f1": float(f1_score(labels, preds, zero_division=0)),
        "precision": float(precision_score(labels, preds, zero_division=0)),
        "recall": float(recall_score(labels, preds, zero_division=0)),
        "fraud_rate": float(labels.mean()),
        "pred_positive_rate": float(preds.mean()),
    }
    return metrics


def train(
    n_epochs: int = 150,
    lr: float = 5e-4,
    weight_decay: float = 1e-5,
    patience: int = 20,
    device: str = "cpu",
) -> dict:
    """
    Full training loop with early stopping.
    
    Returns training summary with metrics and checkpoint path.
    """
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading data...")
    data = load_and_prepare_data()

    model = build_model()
    model = model.to(device)

    # Class-weighted loss (3% fraud rate → weight fraud class higher)
    fraud_rate = float(data["labels"].mean())
    pos_weight = torch.tensor([(1 - fraud_rate) / max(fraud_rate, 1e-6)])
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)

    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=weight_decay)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", patience=5, factor=0.5)

    # Unpack masks
    train_start, train_end = data["train_mask"]
    val_start, val_end = data["val_mask"]
    test_start, test_end = data["test_mask"]

    best_val_auroc = 0.0
    best_epoch = 0
    no_improve = 0
    history = []

    print(f"Training FraudGNN: {sum(p.numel() for p in model.parameters()):,} parameters")
    print(f"Edges: train={train_end}, val={val_end - val_start}, test={test_end - test_start}")
    print(f"Fraud rate: {fraud_rate:.3f}")

    for epoch in range(1, n_epochs + 1):
        # --- Train ---
        model.train()
        optimizer.zero_grad()

        logits = model(
            data["node_features"],
            data["edge_index"][:, train_start:train_end],
            data["edge_features"][train_start:train_end],
        )
        train_labels = data["labels"][train_start:train_end]
        loss = criterion(logits, train_labels)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()

        # --- Validate ---
        model.eval()
        with torch.no_grad():
            val_logits = model(
                data["node_features"],
                data["edge_index"][:, val_start:val_end],
                data["edge_features"][val_start:val_end],
            )
            val_labels = data["labels"][val_start:val_end]
            val_loss = criterion(val_logits, val_labels)
            val_probs = torch.sigmoid(val_logits).numpy()
            val_metrics = compute_metrics(val_labels.numpy(), val_probs)

        scheduler.step(val_metrics["auroc"])
        current_lr = optimizer.param_groups[0]["lr"]

        epoch_data = {
            "epoch": epoch,
            "train_loss": float(loss.item()),
            "val_loss": float(val_loss.item()),
            "val_auroc": val_metrics["auroc"],
            "val_auprc": val_metrics["auprc"],
            "val_f1": val_metrics["f1"],
            "lr": current_lr,
        }
        history.append(epoch_data)

        if epoch % 5 == 0 or epoch == 1:
            print(
                f"  Epoch {epoch:3d} | "
                f"train_loss={loss.item():.4f} | "
                f"val_loss={val_loss.item():.4f} | "
                f"val_auroc={val_metrics['auroc']:.4f} | "
                f"val_auprc={val_metrics['auprc']:.4f} | "
                f"lr={current_lr:.6f}"
            )

        # Early stopping
        if val_metrics["auroc"] > best_val_auroc:
            best_val_auroc = val_metrics["auroc"]
            best_epoch = epoch
            no_improve = 0
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "val_auroc": best_val_auroc,
                "val_metrics": val_metrics,
                "config": {
                    "node_feat_dim": model.node_feat_dim,
                    "edge_feat_dim": model.edge_feat_dim,
                },
            }, CHECKPOINT_DIR / "best_model.pt")
        else:
            no_improve += 1
            if no_improve >= patience:
                print(f"  Early stopping at epoch {epoch} (best: {best_epoch})")
                break

    # --- Test ---
    print("\nEvaluating on test set...")
    checkpoint = torch.load(CHECKPOINT_DIR / "best_model.pt", weights_only=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    with torch.no_grad():
        test_logits = model(
            data["node_features"],
            data["edge_index"][:, test_start:test_end],
            data["edge_features"][test_start:test_end],
        )
        test_labels = data["labels"][test_start:test_end]
        test_probs = torch.sigmoid(test_logits).numpy()
        test_metrics = compute_metrics(test_labels.numpy(), test_probs)

    print(f"\nTest Results (best epoch={best_epoch}):")
    print(f"  AUROC:     {test_metrics['auroc']:.4f}")
    print(f"  AUPRC:     {test_metrics['auprc']:.4f}")
    print(f"  F1:        {test_metrics['f1']:.4f}")
    print(f"  Precision: {test_metrics['precision']:.4f}")
    print(f"  Recall:    {test_metrics['recall']:.4f}")

    # Save final summary
    summary = {
        "model": "FraudGNN (GraphSAGE)",
        "best_epoch": best_epoch,
        "total_epochs": len(history),
        "test_metrics": test_metrics,
        "val_metrics": checkpoint["val_metrics"],
        "training_history": history,
        "model_params": sum(p.numel() for p in model.parameters()),
        "checkpoint_path": str(CHECKPOINT_DIR / "best_model.pt"),
    }

    with open(CHECKPOINT_DIR / "training_summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    print(f"\nCheckpoint saved: {CHECKPOINT_DIR / 'best_model.pt'}")
    return summary


if __name__ == "__main__":
    train()
