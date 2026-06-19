"""
Training script for Entity Risk Scorer (MLP with Feature Interactions).

Features:
- Multi-task training: risk score (regression) + risk tier (4-class)
- Stratified train/val/test split
- Class-weighted cross-entropy for tier imbalance
- Early stopping + LR scheduling
- CPU-only training
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.optim as optim
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from torch.utils.data import DataLoader, TensorDataset

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from models.risk_scorer.model import RiskScorer, RiskScorerLoss, build_model

CHECKPOINT_DIR = Path(__file__).parent / "checkpoints" / "risk_scorer"
DATA_DIR = Path(__file__).parent.parent / "data" / "synthetic" / "generated"

HIGH_RISK_COUNTRIES = {"IR", "KP", "SY", "AF", "SO", "SS", "YE", "MM"}
MEDIUM_RISK_COUNTRIES = {"NG", "KE", "GH", "TZ", "ZA", "ET", "CM", "CI", "SN", "UG"}


def prepare_features(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Prepare feature matrix, risk scores, and risk tiers."""
    # 12 features
    features = np.zeros((len(df), 12), dtype=np.float32)
    for i, (_, row) in enumerate(df.iterrows()):
        country = row["country"]
        features[i] = [
            1.0 if country in HIGH_RISK_COUNTRIES else 0.5 if country in MEDIUM_RISK_COUNTRIES else 0.0,
            float(row["volume_30d"]) / 1e6,
            float(row["txn_count_30d"]) / 500,
            float(row["chargeback_rate"]) * 10,
            {"approved": 0.0, "pending": 0.5, "under_review": 0.7, "rejected": 1.0}.get(row["kyb_status"], 0.5),
            1.0 if row["sanctions_hit"] else 0.0,
            1.0 if row["pep_match"] else 0.0,
            float(row["adverse_media_hits"]) / 3.0,
            float(row["account_age_days"]) / 1095,
            1.0 if row["entity_type"] == "merchant" else 0.5 if row["entity_type"] == "institution" else 0.0,
            0.0, 0.0,
        ]

    # Risk score (0-1)
    risk_scores = df["is_high_risk"].astype(np.float32).values.copy()
    # Add nuance: not just binary
    for i, (_, row) in enumerate(df.iterrows()):
        if risk_scores[i] > 0.5:
            risk_scores[i] = min(1.0, 0.6 + features[i, 3] * 0.2 + features[i, 5] * 0.2)
        else:
            risk_scores[i] = max(0.0, features[i, 0] * 0.3 + features[i, 3] * 0.1)

    # Risk tiers: 0=low, 1=medium, 2=high, 3=critical
    tiers = np.zeros(len(df), dtype=np.int64)
    for i in range(len(df)):
        s = risk_scores[i]
        tiers[i] = 3 if s >= 0.75 else 2 if s >= 0.55 else 1 if s >= 0.30 else 0

    return features, risk_scores, tiers


def train(
    n_epochs: int = 80,
    lr: float = 1e-3,
    batch_size: int = 128,
    patience: int = 15,
    device: str = "cpu",
) -> dict:
    """Train risk scorer."""
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading entity risk data...")
    entities = pd.read_parquet(DATA_DIR / "entity_risk.parquet")

    features, risk_scores, tiers = prepare_features(entities)

    # Normalize features
    scaler = StandardScaler()
    features = scaler.fit_transform(features)

    # Stratified split
    X_train, X_temp, y_score_train, y_score_temp, y_tier_train, y_tier_temp = train_test_split(
        features, risk_scores, tiers, test_size=0.3, stratify=tiers, random_state=42
    )
    X_val, X_test, y_score_val, y_score_test, y_tier_val, y_tier_test = train_test_split(
        X_temp, y_score_temp, y_tier_temp, test_size=0.5, stratify=y_tier_temp, random_state=42
    )

    print(f"Train: {len(X_train)}, Val: {len(X_val)}, Test: {len(X_test)}")
    print(f"Tier distribution (train): {np.bincount(y_tier_train)}")

    train_loader = DataLoader(
        TensorDataset(
            torch.FloatTensor(X_train),
            torch.FloatTensor(y_score_train),
            torch.LongTensor(y_tier_train),
        ),
        batch_size=batch_size,
        shuffle=True,
        drop_last=True,
    )

    model = build_model({"n_features": features.shape[1]})
    model = model.to(device)
    print(f"Model parameters: {sum(p.numel() for p in model.parameters()):,}")

    # Class weights for tier imbalance
    tier_counts = np.bincount(y_tier_train, minlength=4).astype(float)
    tier_weights = torch.FloatTensor(1.0 / (tier_counts + 1e-6))
    tier_weights = tier_weights / tier_weights.sum() * 4

    criterion = RiskScorerLoss(score_weight=0.6, tier_weight=0.4)
    criterion.ce_loss = torch.nn.CrossEntropyLoss(weight=tier_weights.to(device))

    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="min", patience=5, factor=0.5)

    best_val_loss = float("inf")
    best_epoch = 0
    no_improve = 0
    history = []

    for epoch in range(1, n_epochs + 1):
        # --- Train ---
        model.train()
        train_losses = []
        for X_batch, y_score_batch, y_tier_batch in train_loader:
            X_batch = X_batch.to(device)
            y_score_batch = y_score_batch.to(device)
            y_tier_batch = y_tier_batch.to(device)

            optimizer.zero_grad()
            pred = model(X_batch)
            losses = criterion(pred, y_score_batch, y_tier_batch)
            losses["total"].backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            train_losses.append(losses["total"].item())

        avg_train_loss = np.mean(train_losses)

        # --- Validate ---
        model.eval()
        with torch.no_grad():
            X_val_t = torch.FloatTensor(X_val).to(device)
            y_score_val_t = torch.FloatTensor(y_score_val).to(device)
            y_tier_val_t = torch.LongTensor(y_tier_val).to(device)

            val_pred = model(X_val_t)
            val_losses = criterion(val_pred, y_score_val_t, y_tier_val_t)
            val_loss = val_losses["total"].item()

            # Accuracy
            tier_preds = val_pred["tier_logits"].argmax(dim=1).cpu().numpy()
            tier_acc = float((tier_preds == y_tier_val).mean())

            # Score MAE
            score_mae = float((val_pred["risk_score"].cpu().numpy() - y_score_val).mean())

        scheduler.step(val_loss)

        epoch_data = {
            "epoch": epoch,
            "train_loss": float(avg_train_loss),
            "val_loss": float(val_loss),
            "val_score_loss": float(val_losses["score_loss"].item()),
            "val_tier_loss": float(val_losses["tier_loss"].item()),
            "val_tier_accuracy": float(tier_acc),
            "val_score_mae": abs(float(score_mae)),
            "lr": optimizer.param_groups[0]["lr"],
        }
        history.append(epoch_data)

        if epoch % 5 == 0 or epoch == 1:
            print(
                f"  Epoch {epoch:3d} | "
                f"train={avg_train_loss:.4f} | "
                f"val={val_loss:.4f} | "
                f"tier_acc={tier_acc:.4f} | "
                f"score_mae={abs(score_mae):.4f}"
            )

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_epoch = epoch
            no_improve = 0
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "scaler_mean": scaler.mean_.tolist(),
                "scaler_scale": scaler.scale_.tolist(),
                "val_loss": best_val_loss,
                "tier_accuracy": tier_acc,
                "config": {"n_features": features.shape[1]},
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
        X_test_t = torch.FloatTensor(X_test).to(device)
        test_pred = model(X_test_t)

        tier_preds = test_pred["tier_logits"].argmax(dim=1).cpu().numpy()
        score_preds = test_pred["risk_score"].cpu().numpy()

    from sklearn.metrics import classification_report, mean_absolute_error

    tier_names = ["low", "medium", "high", "critical"]
    report = classification_report(y_tier_test, tier_preds, target_names=tier_names, labels=[0, 1, 2, 3], output_dict=True, zero_division=0)

    test_metrics = {
        "tier_accuracy": float((tier_preds == y_tier_test).mean()),
        "score_mae": float(mean_absolute_error(y_score_test, score_preds)),
        "tier_f1_macro": float(report["macro avg"]["f1-score"]),
        "tier_f1_weighted": float(report["weighted avg"]["f1-score"]),
        "per_tier_f1": {name: float(report[name]["f1-score"]) for name in tier_names},
    }

    print(f"\nTest Results (best epoch={best_epoch}):")
    for k, v in test_metrics.items():
        if isinstance(v, dict):
            for kk, vv in v.items():
                print(f"  {k}.{kk}: {vv:.4f}")
        else:
            print(f"  {k}: {v:.4f}")

    summary = {
        "model": "RiskScorer (MLP + Feature Interactions)",
        "best_epoch": best_epoch,
        "total_epochs": len(history),
        "test_metrics": test_metrics,
        "training_history": history,
        "model_params": sum(p.numel() for p in model.parameters()),
        "checkpoint_path": str(CHECKPOINT_DIR / "best_model.pt"),
    }

    with open(CHECKPOINT_DIR / "training_summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    return summary


if __name__ == "__main__":
    train()
