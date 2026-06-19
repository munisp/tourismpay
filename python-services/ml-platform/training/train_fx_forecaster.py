"""
Training script for FX Rate Forecaster (LSTM + Attention).

Features:
- Sliding window dataset from FX time series
- Multi-corridor training with shared encoder
- Quantile loss for prediction intervals (2.5%, 50%, 97.5%)
- Walk-forward validation (temporal, no leakage)
- Checkpoint saving + early stopping
- CPU-only training
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from models.fx_forecaster.model import FXForecaster, QuantileLoss, build_model

CHECKPOINT_DIR = Path(__file__).parent / "checkpoints" / "fx_forecaster"
DATA_DIR = Path(__file__).parent.parent / "data" / "synthetic" / "generated"

CORRIDORS = ["NGN/USD", "KES/USD", "GHS/USD", "TZS/USD", "ZAR/USD", "ETB/USD"]
CORRIDOR_MAP = {c: i for i, c in enumerate(CORRIDORS)}


class FXDataset(Dataset):
    """Sliding window dataset for FX time series."""

    def __init__(
        self,
        data: pd.DataFrame,
        seq_len: int = 72,
        horizon: int = 24,
        features: list[str] | None = None,
    ):
        self.seq_len = seq_len
        self.horizon = horizon
        self.features = features or ["mid_rate", "volume", "spread_bps", "volatility", "bid", "ask"]

        # Normalize per corridor
        self.samples = []
        for corridor in data["corridor"].unique():
            cdf = data[data["corridor"] == corridor].sort_values("hour").reset_index(drop=True)
            corridor_id = CORRIDOR_MAP.get(corridor, 0)

            # Normalize features
            values = cdf[self.features].values.astype(np.float32)
            means = values.mean(axis=0)
            stds = values.std(axis=0) + 1e-8
            normalized = (values - means) / stds

            # Target: normalized mid_rate
            rate_idx = self.features.index("mid_rate")
            targets = normalized[:, rate_idx]

            # Create sliding windows
            for i in range(len(normalized) - seq_len - horizon):
                x = normalized[i:i + seq_len]
                y = targets[i + seq_len:i + seq_len + horizon]
                self.samples.append((
                    torch.FloatTensor(x),
                    torch.FloatTensor(y),
                    torch.LongTensor([corridor_id]),
                    float(means[rate_idx]),
                    float(stds[rate_idx]),
                ))

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int):
        x, y, corridor_id, mean, std = self.samples[idx]
        return x, y, corridor_id.squeeze(), mean, std


def train(
    n_epochs: int = 50,
    lr: float = 1e-3,
    batch_size: int = 64,
    seq_len: int = 72,
    horizon: int = 24,
    patience: int = 10,
    device: str = "cpu",
) -> dict:
    """Train FX forecaster with walk-forward validation."""
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading FX time series data...")
    fx_data = pd.read_parquet(DATA_DIR / "fx_time_series.parquet")

    # Temporal split: first 70% train, next 15% val, last 15% test
    corridors = fx_data["corridor"].unique()
    train_dfs, val_dfs, test_dfs = [], [], []

    for corridor in corridors:
        cdf = fx_data[fx_data["corridor"] == corridor].sort_values("hour")
        n = len(cdf)
        train_end = int(n * 0.7)
        val_end = int(n * 0.85)
        train_dfs.append(cdf.iloc[:train_end])
        val_dfs.append(cdf.iloc[train_end:val_end])
        test_dfs.append(cdf.iloc[val_end:])

    train_data = pd.concat(train_dfs)
    val_data = pd.concat(val_dfs)
    test_data = pd.concat(test_dfs)

    train_ds = FXDataset(train_data, seq_len=seq_len, horizon=horizon)
    val_ds = FXDataset(val_data, seq_len=seq_len, horizon=horizon)
    test_ds = FXDataset(test_data, seq_len=seq_len, horizon=horizon)

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, drop_last=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)
    test_loader = DataLoader(test_ds, batch_size=batch_size, shuffle=False)

    print(f"Train samples: {len(train_ds)}, Val: {len(val_ds)}, Test: {len(test_ds)}")

    model = build_model({"seq_len": seq_len, "n_horizons": horizon})
    model = model.to(device)
    print(f"Model parameters: {sum(p.numel() for p in model.parameters()):,}")

    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="min", patience=5, factor=0.5)
    criterion = QuantileLoss(quantiles=[0.025, 0.5, 0.975])

    best_val_loss = float("inf")
    best_epoch = 0
    no_improve = 0
    history = []

    for epoch in range(1, n_epochs + 1):
        # --- Train ---
        model.train()
        train_losses = []
        for x, y, corridor_ids, _, _ in train_loader:
            x, y, corridor_ids = x.to(device), y.to(device), corridor_ids.to(device)

            optimizer.zero_grad()
            out = model(x, corridor_ids)
            pred_stack = torch.stack([out["lower"], out["point"], out["upper"]], dim=2)
            loss = criterion(pred_stack, y)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            train_losses.append(loss.item())

        avg_train_loss = np.mean(train_losses)

        # --- Validate ---
        model.eval()
        val_losses = []
        val_maes = []
        with torch.no_grad():
            for x, y, corridor_ids, _, _ in val_loader:
                x, y, corridor_ids = x.to(device), y.to(device), corridor_ids.to(device)
                out = model(x, corridor_ids)
                pred_stack = torch.stack([out["lower"], out["point"], out["upper"]], dim=2)
                loss = criterion(pred_stack, y)
                val_losses.append(loss.item())
                mae = (out["point"] - y).abs().mean().item()
                val_maes.append(mae)

        avg_val_loss = np.mean(val_losses)
        avg_val_mae = np.mean(val_maes)
        scheduler.step(avg_val_loss)

        epoch_data = {
            "epoch": epoch,
            "train_loss": float(avg_train_loss),
            "val_loss": float(avg_val_loss),
            "val_mae": float(avg_val_mae),
            "lr": optimizer.param_groups[0]["lr"],
        }
        history.append(epoch_data)

        if epoch % 5 == 0 or epoch == 1:
            print(
                f"  Epoch {epoch:3d} | "
                f"train_loss={avg_train_loss:.6f} | "
                f"val_loss={avg_val_loss:.6f} | "
                f"val_mae={avg_val_mae:.6f}"
            )

        if avg_val_loss < best_val_loss:
            best_val_loss = avg_val_loss
            best_epoch = epoch
            no_improve = 0
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "val_loss": best_val_loss,
                "val_mae": avg_val_mae,
                "config": {
                    "n_features": model.n_features,
                    "d_model": model.d_model,
                    "seq_len": model.seq_len,
                    "n_horizons": model.n_horizons,
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

    test_losses, test_maes = [], []
    coverage_95 = []
    with torch.no_grad():
        for x, y, corridor_ids, _, _ in test_loader:
            x, y, corridor_ids = x.to(device), y.to(device), corridor_ids.to(device)
            out = model(x, corridor_ids)
            mae = (out["point"] - y).abs().mean().item()
            test_maes.append(mae)

            # Coverage: how often true value falls within [lower, upper]
            in_interval = ((y >= out["lower"]) & (y <= out["upper"])).float().mean().item()
            coverage_95.append(in_interval)

    test_metrics = {
        "mae": float(np.mean(test_maes)),
        "coverage_95": float(np.mean(coverage_95)),
    }

    print(f"\nTest Results (best epoch={best_epoch}):")
    print(f"  MAE:          {test_metrics['mae']:.6f}")
    print(f"  95% Coverage: {test_metrics['coverage_95']:.4f}")

    summary = {
        "model": "FXForecaster (LSTM + Attention)",
        "best_epoch": best_epoch,
        "total_epochs": len(history),
        "test_metrics": test_metrics,
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
