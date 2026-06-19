"""
Training script for Transaction Anomaly Detector (VAE).

Features:
- Trains on normal transactions only (unsupervised)
- VAE with beta-annealing for stable latent space
- Anomaly threshold calibration on validation set
- Metrics: anomaly detection rate, precision, recall
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
from sklearn.preprocessing import StandardScaler
from torch.utils.data import DataLoader, TensorDataset

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from models.anomaly_detector.model import TransactionVAE, VAELoss, build_model

CHECKPOINT_DIR = Path(__file__).parent / "checkpoints" / "anomaly_detector"
DATA_DIR = Path(__file__).parent.parent / "data" / "synthetic" / "generated"


FEATURE_COLS = [
    "amount", "txns_last_hour", "txns_last_day",
    "days_since_last_txn", "failed_auth_attempts",
    "is_new_device", "is_vpn",
]

CATEGORICAL_COLS = {
    "device_type": ["mobile_ios", "mobile_android", "web_chrome", "web_firefox", "web_safari", "pos_terminal"],
    "merchant_category": [
        "hotel", "restaurant", "tour_operator", "transport", "retail",
        "entertainment", "spa_wellness", "gift_shop", "safari", "cultural_site",
        "gambling",
    ],
}


def prepare_features(df: pd.DataFrame) -> np.ndarray:
    """Convert transaction DataFrame to feature matrix."""
    numeric = df[FEATURE_COLS].fillna(0).values.astype(np.float32)

    # One-hot encode categoricals
    cat_arrays = []
    for col, categories in CATEGORICAL_COLS.items():
        one_hot = np.zeros((len(df), len(categories)), dtype=np.float32)
        for i, cat in enumerate(categories):
            one_hot[:, i] = (df[col] == cat).astype(np.float32)
        cat_arrays.append(one_hot)

    return np.hstack([numeric] + cat_arrays)


def train(
    n_epochs: int = 50,
    lr: float = 1e-3,
    batch_size: int = 256,
    patience: int = 10,
    beta_start: float = 0.0,
    beta_end: float = 1.0,
    beta_warmup: int = 10,
    device: str = "cpu",
) -> dict:
    """Train VAE anomaly detector."""
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading transaction data...")
    transactions = pd.read_parquet(DATA_DIR / "transactions.parquet")

    # Split: train on normal only, validate with mixed, test with mixed
    normal = transactions[~transactions["is_fraud"]].copy()
    fraud = transactions[transactions["is_fraud"]].copy()

    n_normal = len(normal)
    train_end = int(n_normal * 0.7)
    val_end = int(n_normal * 0.85)

    train_normal = normal.iloc[:train_end]
    val_normal = normal.iloc[train_end:val_end]
    test_normal = normal.iloc[val_end:]

    # Add some fraud to val/test for evaluation
    n_val_fraud = min(len(fraud) // 2, len(val_normal) // 5)
    n_test_fraud = len(fraud) - n_val_fraud
    val_fraud = fraud.iloc[:n_val_fraud]
    test_fraud = fraud.iloc[n_val_fraud:]

    val_data = pd.concat([val_normal, val_fraud]).sample(frac=1, random_state=42)
    test_data = pd.concat([test_normal, test_fraud]).sample(frac=1, random_state=42)

    # Prepare features
    train_features = prepare_features(train_normal)
    val_features = prepare_features(val_data)
    test_features = prepare_features(test_data)

    # Normalize
    scaler = StandardScaler()
    train_features = scaler.fit_transform(train_features)
    val_features = scaler.transform(val_features)
    test_features = scaler.transform(test_features)

    input_dim = train_features.shape[1]
    print(f"Input dimension: {input_dim}")
    print(f"Train: {len(train_features)} (normal only)")
    print(f"Val: {len(val_data)} ({len(val_fraud)} fraud)")
    print(f"Test: {len(test_data)} ({len(test_fraud)} fraud)")

    # DataLoaders
    train_tensor = torch.FloatTensor(train_features)
    train_loader = DataLoader(
        TensorDataset(train_tensor),
        batch_size=batch_size,
        shuffle=True,
        drop_last=True,
    )

    model = build_model({"input_dim": input_dim})
    model = model.to(device)
    print(f"Model parameters: {sum(p.numel() for p in model.parameters()):,}")

    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="min", patience=5, factor=0.5)

    best_val_loss = float("inf")
    best_epoch = 0
    no_improve = 0
    history = []

    for epoch in range(1, n_epochs + 1):
        # Beta annealing
        if epoch <= beta_warmup:
            beta = beta_start + (beta_end - beta_start) * (epoch / beta_warmup)
        else:
            beta = beta_end

        vae_loss_fn = VAELoss(beta=beta)

        # --- Train ---
        model.train()
        epoch_losses = {"total": [], "reconstruction": [], "kl_divergence": []}

        for (batch,) in train_loader:
            batch = batch.to(device)
            optimizer.zero_grad()
            recon, mu, logvar = model(batch)
            losses = vae_loss_fn(recon, batch, mu, logvar)
            losses["total"].backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

            for k, v in losses.items():
                epoch_losses[k].append(v.item())

        avg_losses = {k: np.mean(v) for k, v in epoch_losses.items()}

        # --- Validate ---
        model.eval()
        val_tensor = torch.FloatTensor(val_features).to(device)
        val_labels = val_data["is_fraud"].values

        with torch.no_grad():
            recon, mu, logvar = model(val_tensor)
            val_loss_dict = vae_loss_fn(recon, val_tensor, mu, logvar)
            val_loss = val_loss_dict["total"].item()

            scores = model.anomaly_score(val_tensor, beta=beta).numpy()

        scheduler.step(val_loss)

        # Find optimal threshold (maximize F1)
        from sklearn.metrics import f1_score as f1_fn

        best_f1, best_thresh = 0, 0
        for pct in np.arange(90, 99.5, 0.5):
            thresh = np.percentile(scores, pct)
            preds = (scores >= thresh).astype(int)
            f1 = f1_fn(val_labels, preds, zero_division=0)
            if f1 > best_f1:
                best_f1 = f1
                best_thresh = thresh

        epoch_data = {
            "epoch": epoch,
            "train_loss": float(avg_losses["total"]),
            "recon_loss": float(avg_losses["reconstruction"]),
            "kl_loss": float(avg_losses["kl_divergence"]),
            "val_loss": float(val_loss),
            "beta": beta,
            "best_f1": float(best_f1),
            "threshold": float(best_thresh),
            "lr": optimizer.param_groups[0]["lr"],
        }
        history.append(epoch_data)

        if epoch % 5 == 0 or epoch == 1:
            print(
                f"  Epoch {epoch:3d} | "
                f"loss={avg_losses['total']:.4f} "
                f"(recon={avg_losses['reconstruction']:.4f}, kl={avg_losses['kl_divergence']:.4f}) | "
                f"val_loss={val_loss:.4f} | "
                f"f1={best_f1:.4f} | "
                f"beta={beta:.3f}"
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
                "threshold": best_thresh,
                "beta": beta,
                "config": {
                    "input_dim": input_dim,
                    "hidden_dim": 128,
                    "latent_dim": 32,
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

    test_tensor = torch.FloatTensor(test_features).to(device)
    test_labels = test_data["is_fraud"].values
    threshold = checkpoint["threshold"]

    with torch.no_grad():
        test_scores = model.anomaly_score(test_tensor, beta=checkpoint["beta"]).numpy()

    test_preds = (test_scores >= threshold).astype(int)

    from sklearn.metrics import precision_score, recall_score, roc_auc_score

    test_metrics = {
        "auroc": float(roc_auc_score(test_labels, test_scores)),
        "f1": float(f1_fn(test_labels, test_preds, zero_division=0)),
        "precision": float(precision_score(test_labels, test_preds, zero_division=0)),
        "recall": float(recall_score(test_labels, test_preds, zero_division=0)),
        "anomaly_rate": float(test_preds.mean()),
        "true_fraud_rate": float(test_labels.mean()),
        "threshold": float(threshold),
    }

    print(f"\nTest Results (best epoch={best_epoch}):")
    for k, v in test_metrics.items():
        print(f"  {k}: {v:.4f}")

    summary = {
        "model": "TransactionVAE (Anomaly Detector)",
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
