"""
Transformer-based FX rate forecasting model.
Uses encoder-decoder architecture with temporal attention for multi-step
exchange rate prediction.

Input: Sequence of hourly FX features (rate, SMA, EMA, RSI, volume, etc.)
Output: Next N hours of rate predictions with confidence intervals.
"""
import json
import logging
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

logger = logging.getLogger(__name__)


class PositionalEncoding(nn.Module):
    def __init__(self, d_model: int, max_len: int = 5000, dropout: float = 0.1):
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)

        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        pe = pe.unsqueeze(0)
        self.register_buffer("pe", pe)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x + self.pe[:, :x.size(1)]
        return self.dropout(x)


class FXTransformerForecaster(nn.Module):
    """
    Transformer encoder-decoder for FX time series forecasting.

    Encoder processes historical sequence, decoder generates forecast.
    Uses teacher forcing during training, autoregressive during inference.
    """

    def __init__(
        self,
        n_features: int = 11,
        d_model: int = 64,
        n_heads: int = 4,
        n_encoder_layers: int = 3,
        n_decoder_layers: int = 2,
        dim_feedforward: int = 128,
        dropout: float = 0.1,
        forecast_horizon: int = 24,
    ):
        super().__init__()
        self.n_features = n_features
        self.d_model = d_model
        self.forecast_horizon = forecast_horizon

        # Input projection
        self.encoder_input = nn.Linear(n_features, d_model)
        self.decoder_input = nn.Linear(1, d_model)  # decoder gets rate only

        self.pos_encoder = PositionalEncoding(d_model, dropout=dropout)
        self.pos_decoder = PositionalEncoding(d_model, dropout=dropout)

        # Transformer
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=n_heads,
            dim_feedforward=dim_feedforward,
            dropout=dropout,
            batch_first=True,
        )
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=n_encoder_layers)

        decoder_layer = nn.TransformerDecoderLayer(
            d_model=d_model,
            nhead=n_heads,
            dim_feedforward=dim_feedforward,
            dropout=dropout,
            batch_first=True,
        )
        self.decoder = nn.TransformerDecoder(decoder_layer, num_layers=n_decoder_layers)

        # Output heads
        self.rate_head = nn.Linear(d_model, 1)  # point forecast
        self.uncertainty_head = nn.Linear(d_model, 1)  # log variance for confidence interval

    def forward(
        self,
        src: torch.Tensor,          # (batch, seq_len, n_features)
        tgt: torch.Tensor,          # (batch, forecast_len, 1) - target rates
        src_mask: Optional[torch.Tensor] = None,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Forward pass with teacher forcing.
        Returns: (rate_predictions, log_variance)
        """
        # Encode
        src_emb = self.encoder_input(src)
        src_emb = self.pos_encoder(src_emb)
        memory = self.encoder(src_emb, src_key_padding_mask=src_mask)

        # Decode
        tgt_emb = self.decoder_input(tgt)
        tgt_emb = self.pos_decoder(tgt_emb)

        # Causal mask for decoder
        tgt_len = tgt.size(1)
        tgt_mask = nn.Transformer.generate_square_subsequent_mask(tgt_len, device=tgt.device)

        decoded = self.decoder(tgt_emb, memory, tgt_mask=tgt_mask)

        rate_pred = self.rate_head(decoded)
        log_var = self.uncertainty_head(decoded)

        return rate_pred, log_var

    @torch.no_grad()
    def forecast(
        self,
        src: torch.Tensor,
        last_rate: float,
        steps: int = 24,
    ) -> Dict[str, np.ndarray]:
        """
        Autoregressive inference: generate multi-step forecast.
        Returns point forecasts and confidence intervals.
        """
        self.eval()
        device = next(self.parameters()).device

        src_emb = self.encoder_input(src)
        src_emb = self.pos_encoder(src_emb)
        memory = self.encoder(src_emb)

        forecasts = []
        log_vars = []
        current_rate = torch.tensor([[[last_rate]]], device=device)

        for step in range(steps):
            if step == 0:
                tgt_seq = current_rate
            else:
                tgt_seq = torch.cat([current_rate] + forecasts, dim=1)

            tgt_emb = self.decoder_input(tgt_seq)
            tgt_emb = self.pos_decoder(tgt_emb)
            tgt_mask = nn.Transformer.generate_square_subsequent_mask(
                tgt_seq.size(1), device=device
            )

            decoded = self.decoder(tgt_emb, memory, tgt_mask=tgt_mask)

            rate_pred = self.rate_head(decoded[:, -1:, :])
            log_var = self.uncertainty_head(decoded[:, -1:, :])

            forecasts.append(rate_pred)
            log_vars.append(log_var)

        rates = torch.cat(forecasts, dim=1).squeeze(-1).cpu().numpy()
        vars_ = torch.cat(log_vars, dim=1).squeeze(-1).exp().cpu().numpy()

        return {
            "forecast": rates[0],
            "lower_95": rates[0] - 1.96 * np.sqrt(vars_[0]),
            "upper_95": rates[0] + 1.96 * np.sqrt(vars_[0]),
            "uncertainty": np.sqrt(vars_[0]),
        }


class FXTrainer:
    """Training loop for the FX Transformer model."""

    def __init__(
        self,
        model: FXTransformerForecaster,
        learning_rate: float = 0.0005,
        weight_decay: float = 1e-4,
        device: str = "cpu",
    ):
        self.model = model.to(device)
        self.device = device
        self.optimizer = torch.optim.AdamW(
            model.parameters(), lr=learning_rate, weight_decay=weight_decay
        )
        self.scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            self.optimizer, T_max=100, eta_min=1e-6
        )

    def gaussian_nll_loss(
        self,
        pred: torch.Tensor,
        target: torch.Tensor,
        log_var: torch.Tensor,
    ) -> torch.Tensor:
        """Negative log-likelihood with learned variance (heteroscedastic loss)."""
        precision = torch.exp(-log_var)
        return 0.5 * (precision * (pred - target) ** 2 + log_var).mean()

    def train_epoch(self, dataloader: "torch.utils.data.DataLoader") -> float:
        self.model.train()
        total_loss = 0.0
        n_batches = 0

        for src, tgt_input, tgt_output in dataloader:
            src = src.to(self.device)
            tgt_input = tgt_input.to(self.device)
            tgt_output = tgt_output.to(self.device)

            self.optimizer.zero_grad()
            rate_pred, log_var = self.model(src, tgt_input)
            loss = self.gaussian_nll_loss(rate_pred, tgt_output, log_var)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
            self.optimizer.step()

            total_loss += loss.item()
            n_batches += 1

        self.scheduler.step()
        return total_loss / max(n_batches, 1)

    @torch.no_grad()
    def evaluate(self, dataloader: "torch.utils.data.DataLoader") -> Dict[str, float]:
        self.model.eval()
        total_loss = 0.0
        all_preds, all_targets = [], []

        for src, tgt_input, tgt_output in dataloader:
            src = src.to(self.device)
            tgt_input = tgt_input.to(self.device)
            tgt_output = tgt_output.to(self.device)

            rate_pred, log_var = self.model(src, tgt_input)
            loss = self.gaussian_nll_loss(rate_pred, tgt_output, log_var)
            total_loss += loss.item()

            all_preds.append(rate_pred.cpu())
            all_targets.append(tgt_output.cpu())

        preds = torch.cat(all_preds)
        targets = torch.cat(all_targets)

        mae = (preds - targets).abs().mean().item()
        rmse = ((preds - targets) ** 2).mean().sqrt().item()
        mape = ((preds - targets).abs() / targets.abs().clamp(min=1e-8)).mean().item() * 100

        return {
            "loss": total_loss / max(len(dataloader), 1),
            "mae": mae,
            "rmse": rmse,
            "mape": mape,
        }

    def train_full(
        self,
        train_loader: "torch.utils.data.DataLoader",
        val_loader: "torch.utils.data.DataLoader",
        epochs: int = 100,
        patience: int = 15,
    ) -> Dict[str, Any]:
        best_val_loss = float("inf")
        best_state = None
        patience_counter = 0
        history: Dict[str, List[float]] = {"train_loss": [], "val_loss": [], "val_mape": []}

        for epoch in range(epochs):
            train_loss = self.train_epoch(train_loader)
            val_metrics = self.evaluate(val_loader)

            history["train_loss"].append(train_loss)
            history["val_loss"].append(val_metrics["loss"])
            history["val_mape"].append(val_metrics["mape"])

            if val_metrics["loss"] < best_val_loss:
                best_val_loss = val_metrics["loss"]
                best_state = {k: v.cpu().clone() for k, v in self.model.state_dict().items()}
                patience_counter = 0
            else:
                patience_counter += 1

            if (epoch + 1) % 10 == 0:
                logger.info(
                    f"Epoch {epoch+1}/{epochs} — "
                    f"Train Loss: {train_loss:.6f}, "
                    f"Val Loss: {val_metrics['loss']:.6f}, "
                    f"Val MAPE: {val_metrics['mape']:.2f}%"
                )

            if patience_counter >= patience:
                logger.info(f"Early stopping at epoch {epoch+1}")
                break

        if best_state:
            self.model.load_state_dict(best_state)

        return {"best_val_loss": best_val_loss, "history": history}

    def save(self, path: str, metrics: Optional[Dict] = None) -> None:
        p = Path(path)
        p.mkdir(parents=True, exist_ok=True)
        torch.save(self.model.state_dict(), str(p / "fx_transformer.pt"))
        meta = {
            "model_class": "FXTransformerForecaster",
            "n_features": self.model.n_features,
            "d_model": self.model.d_model,
            "forecast_horizon": self.model.forecast_horizon,
            "metrics": metrics or {},
        }
        (p / "metadata.json").write_text(json.dumps(meta, indent=2, default=str))

    def load(self, path: str) -> None:
        p = Path(path)
        state = torch.load(str(p / "fx_transformer.pt"), map_location=self.device, weights_only=True)
        self.model.load_state_dict(state)
