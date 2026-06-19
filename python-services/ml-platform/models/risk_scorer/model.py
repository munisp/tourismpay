"""
Entity Risk Scorer — Multi-Layer Perceptron with Feature Interactions

Architecture:
- Input: entity features (12-dim: country risk, volume, chargeback, KYB, etc.)
- Feature interaction layer (learned pairwise feature crosses)
- 3-layer MLP with residual connections
- Multi-task head: risk_score (regression) + risk_tier (4-class)

Designed for compliance risk assessment of merchants, individuals,
and institutions in African tourism payment corridors.

Runs on CPU. Inference: <1ms per entity.
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class FeatureInteractionLayer(nn.Module):
    """
    Learned pairwise feature interactions.
    
    For n features, computes n*(n-1)/2 pairwise interactions
    via learned weight matrix, then projects to output dim.
    """

    def __init__(self, n_features: int, interaction_dim: int = 32):
        super().__init__()
        n_pairs = n_features * (n_features - 1) // 2
        self.interaction_proj = nn.Linear(n_pairs, interaction_dim)
        self.n_features = n_features

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Compute pairwise feature interactions."""
        pairs = []
        for i in range(self.n_features):
            for j in range(i + 1, self.n_features):
                pairs.append(x[:, i] * x[:, j])
        interactions = torch.stack(pairs, dim=1)  # [B, n_pairs]
        return self.interaction_proj(interactions)  # [B, interaction_dim]


class ResidualBlock(nn.Module):
    """MLP block with residual connection."""

    def __init__(self, dim: int, dropout: float = 0.2):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(dim, dim),
            nn.ReLU(),
            nn.BatchNorm1d(dim),
            nn.Dropout(dropout),
            nn.Linear(dim, dim),
        )
        self.norm = nn.LayerNorm(dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.norm(x + self.net(x))


class RiskScorer(nn.Module):
    """
    Multi-task entity risk scoring model.
    
    Architecture:
        Input features [B, 12]
        -> Feature interactions [B, 32]
        -> Concat [B, 12+32=44]
        -> Projection [B, 128]
        -> ResidualBlock x3 [B, 128]
        -> Risk score head (regression) [B, 1]
        -> Risk tier head (4-class) [B, 4]
    """

    def __init__(
        self,
        n_features: int = 12,
        interaction_dim: int = 32,
        hidden_dim: int = 128,
        n_risk_tiers: int = 4,  # low, medium, high, critical
        dropout: float = 0.2,
    ):
        super().__init__()
        self.n_features = n_features

        # Feature interaction
        self.interaction = FeatureInteractionLayer(n_features, interaction_dim)

        # Input projection
        self.input_proj = nn.Sequential(
            nn.Linear(n_features + interaction_dim, hidden_dim),
            nn.ReLU(),
            nn.BatchNorm1d(hidden_dim),
        )

        # Residual blocks
        self.res_blocks = nn.Sequential(
            ResidualBlock(hidden_dim, dropout),
            ResidualBlock(hidden_dim, dropout),
            ResidualBlock(hidden_dim, dropout),
        )

        # Risk score regression head (0-1)
        self.score_head = nn.Sequential(
            nn.Linear(hidden_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 1),
            nn.Sigmoid(),
        )

        # Risk tier classification head
        self.tier_head = nn.Sequential(
            nn.Linear(hidden_dim, 64),
            nn.ReLU(),
            nn.Linear(64, n_risk_tiers),
        )

    def forward(
        self,
        x: torch.Tensor,
    ) -> dict[str, torch.Tensor]:
        """
        Forward pass.
        
        Args:
            x: Entity features [B, n_features]
        Returns:
            dict with 'risk_score' [B, 1] and 'tier_logits' [B, 4]
        """
        # Feature interactions
        interactions = self.interaction(x)
        h = torch.cat([x, interactions], dim=1)

        # Encode
        h = self.input_proj(h)
        h = self.res_blocks(h)

        # Multi-task heads
        risk_score = self.score_head(h)
        tier_logits = self.tier_head(h)

        return {
            "risk_score": risk_score.squeeze(-1),
            "tier_logits": tier_logits,
        }

    def predict(self, x: torch.Tensor) -> dict[str, Any]:
        """Predict risk score and tier."""
        self.eval()
        with torch.no_grad():
            out = self.forward(x)
            tier_probs = F.softmax(out["tier_logits"], dim=1)
            tier_idx = tier_probs.argmax(dim=1)
            tier_names = ["low", "medium", "high", "critical"]
            return {
                "risk_score": out["risk_score"],
                "tier_probs": tier_probs,
                "tier": [tier_names[i] for i in tier_idx.tolist()],
            }


class RiskScorerLoss(nn.Module):
    """Multi-task loss: MSE for risk score + CrossEntropy for tier."""

    def __init__(self, score_weight: float = 0.6, tier_weight: float = 0.4):
        super().__init__()
        self.score_weight = score_weight
        self.tier_weight = tier_weight
        self.ce_loss = nn.CrossEntropyLoss()

    def forward(
        self,
        pred: dict[str, torch.Tensor],
        target_score: torch.Tensor,
        target_tier: torch.Tensor,
    ) -> dict[str, torch.Tensor]:
        score_loss = F.mse_loss(pred["risk_score"], target_score)
        tier_loss = self.ce_loss(pred["tier_logits"], target_tier)
        total = self.score_weight * score_loss + self.tier_weight * tier_loss
        return {
            "total": total,
            "score_loss": score_loss,
            "tier_loss": tier_loss,
        }


# Type stub for predict return
from typing import Any


def build_model(config: dict | None = None) -> RiskScorer:
    """Factory function."""
    defaults = {
        "n_features": 12,
        "interaction_dim": 32,
        "hidden_dim": 128,
        "n_risk_tiers": 4,
        "dropout": 0.2,
    }
    if config:
        defaults.update(config)
    return RiskScorer(**defaults)
