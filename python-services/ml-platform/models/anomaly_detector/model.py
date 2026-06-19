"""
Transaction Anomaly Detector — Variational Autoencoder (VAE)

Architecture:
- Encoder: MLP [input_dim -> 128 -> 64 -> (mu, logvar)] 
- Latent space: 32-dimensional
- Decoder: MLP [32 -> 64 -> 128 -> input_dim]
- Anomaly score: reconstruction error + KL divergence

Detects:
- Unusual transaction patterns (amount, timing, location)
- Account behavior changes (sudden activity spikes)
- Novel fraud patterns not seen in labeled data (unsupervised)

Runs on CPU. Inference: ~1ms per transaction.
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class TransactionVAE(nn.Module):
    """
    Variational Autoencoder for transaction anomaly detection.
    
    Architecture:
        Encoder: input_dim -> 128 -> 64 -> (mu_32, logvar_32)
        Decoder: 32 -> 64 -> 128 -> input_dim
    
    Anomaly score = reconstruction_error + beta * kl_divergence
    Higher score = more anomalous
    """

    def __init__(
        self,
        input_dim: int = 18,
        hidden_dim: int = 128,
        latent_dim: int = 32,
        dropout: float = 0.2,
    ):
        super().__init__()
        self.input_dim = input_dim
        self.latent_dim = latent_dim

        # Encoder
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.BatchNorm1d(hidden_dim),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.BatchNorm1d(hidden_dim // 2),
        )
        self.mu_layer = nn.Linear(hidden_dim // 2, latent_dim)
        self.logvar_layer = nn.Linear(hidden_dim // 2, latent_dim)

        # Decoder
        self.decoder = nn.Sequential(
            nn.Linear(latent_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.BatchNorm1d(hidden_dim // 2),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim // 2, hidden_dim),
            nn.ReLU(),
            nn.BatchNorm1d(hidden_dim),
            nn.Linear(hidden_dim, input_dim),
        )

    def encode(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Encode input to latent distribution parameters."""
        h = self.encoder(x)
        mu = self.mu_layer(h)
        logvar = self.logvar_layer(h)
        return mu, logvar

    def reparameterize(self, mu: torch.Tensor, logvar: torch.Tensor) -> torch.Tensor:
        """Reparameterization trick: z = mu + std * eps."""
        if self.training:
            std = torch.exp(0.5 * logvar)
            eps = torch.randn_like(std)
            return mu + eps * std
        return mu  # deterministic during inference

    def decode(self, z: torch.Tensor) -> torch.Tensor:
        """Decode latent vector to reconstructed input."""
        return self.decoder(z)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Full forward pass.
        
        Args:
            x: Input features [B, input_dim]
        Returns:
            (reconstructed, mu, logvar)
        """
        mu, logvar = self.encode(x)
        z = self.reparameterize(mu, logvar)
        reconstructed = self.decode(z)
        return reconstructed, mu, logvar

    def anomaly_score(
        self,
        x: torch.Tensor,
        beta: float = 0.5,
        n_samples: int = 10,
    ) -> torch.Tensor:
        """
        Compute anomaly score for each input.
        
        Score = mean_reconstruction_error + beta * kl_divergence
        Higher = more anomalous.
        
        Uses Monte Carlo sampling for robust estimation.
        """
        self.eval()
        with torch.no_grad():
            mu, logvar = self.encode(x)

            # Monte Carlo sampling
            recon_errors = []
            for _ in range(n_samples):
                std = torch.exp(0.5 * logvar)
                eps = torch.randn_like(std)
                z = mu + eps * std
                recon = self.decode(z)
                recon_error = F.mse_loss(recon, x, reduction="none").sum(dim=1)
                recon_errors.append(recon_error)

            mean_recon_error = torch.stack(recon_errors).mean(dim=0)

            # KL divergence
            kl = -0.5 * torch.sum(1 + logvar - mu.pow(2) - logvar.exp(), dim=1)

            score = mean_recon_error + beta * kl
            return score

    def detect_anomalies(
        self,
        x: torch.Tensor,
        threshold: float | None = None,
        percentile: float = 95.0,
    ) -> dict[str, torch.Tensor]:
        """
        Detect anomalies with automatic or manual thresholding.
        
        Returns:
            dict with 'scores', 'is_anomaly', 'threshold'
        """
        scores = self.anomaly_score(x)

        if threshold is None:
            threshold = float(torch.quantile(scores, percentile / 100.0))

        is_anomaly = scores > threshold

        return {
            "scores": scores,
            "is_anomaly": is_anomaly,
            "threshold": threshold,
            "anomaly_rate": float(is_anomaly.float().mean()),
        }


class VAELoss(nn.Module):
    """Combined reconstruction + KL divergence loss for VAE training."""

    def __init__(self, beta: float = 1.0):
        super().__init__()
        self.beta = beta

    def forward(
        self,
        recon: torch.Tensor,
        x: torch.Tensor,
        mu: torch.Tensor,
        logvar: torch.Tensor,
    ) -> dict[str, torch.Tensor]:
        recon_loss = F.mse_loss(recon, x, reduction="mean")
        kl_loss = -0.5 * torch.mean(1 + logvar - mu.pow(2) - logvar.exp())
        total = recon_loss + self.beta * kl_loss
        return {
            "total": total,
            "reconstruction": recon_loss,
            "kl_divergence": kl_loss,
        }


def build_model(config: dict | None = None) -> TransactionVAE:
    """Factory function to build TransactionVAE."""
    defaults = {
        "input_dim": 18,
        "hidden_dim": 128,
        "latent_dim": 32,
        "dropout": 0.2,
    }
    if config:
        defaults.update(config)
    return TransactionVAE(**defaults)
