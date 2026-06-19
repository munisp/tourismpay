"""
Fraud Detection GNN — GraphSAGE-based model

Architecture:
- Node features: user/merchant transaction statistics (14-dim)
- Edge features: transaction amount, velocity, device risk (6-dim)  
- 3-layer GraphSAGE with mean aggregation
- Edge-level fraud classification head

Designed for heterogeneous transaction graphs where nodes are
users/merchants and edges are transactions. Detects fraud rings
via message passing over the transaction network.

Runs on CPU (no CUDA required). Inference: ~2ms per edge batch.
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class GraphSAGELayer(nn.Module):
    """Single GraphSAGE layer with mean aggregation (no PyG dependency)."""

    def __init__(self, in_dim: int, out_dim: int, bias: bool = True):
        super().__init__()
        self.linear_self = nn.Linear(in_dim, out_dim, bias=False)
        self.linear_neigh = nn.Linear(in_dim, out_dim, bias=False)
        self.bias = nn.Parameter(torch.zeros(out_dim)) if bias else None

    def forward(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor,
    ) -> torch.Tensor:
        """
        Args:
            x: Node features [N, in_dim]
            edge_index: Edge list [2, E] (source -> target)
        Returns:
            Updated node features [N, out_dim]
        """
        src, dst = edge_index[0], edge_index[1]
        N = x.size(0)

        # Mean aggregation: for each node, average neighbor features
        src_features = x[src]  # [E, in_dim]

        # Scatter mean: aggregate src features into dst nodes
        agg = torch.zeros(N, x.size(1), device=x.device)
        count = torch.zeros(N, 1, device=x.device)
        agg.scatter_add_(0, dst.unsqueeze(1).expand_as(src_features), src_features)
        count.scatter_add_(0, dst.unsqueeze(1), torch.ones_like(dst.unsqueeze(1).float()))
        count = count.clamp(min=1)
        neigh_mean = agg / count

        out = self.linear_self(x) + self.linear_neigh(neigh_mean)
        if self.bias is not None:
            out = out + self.bias
        return out


class FraudGNN(nn.Module):
    """
    GraphSAGE-based fraud detection model.
    
    Architecture:
        Input (14-dim node features)
        -> GraphSAGE Layer 1 (14 -> 64) + ReLU + Dropout
        -> GraphSAGE Layer 2 (64 -> 32) + ReLU + Dropout
        -> GraphSAGE Layer 3 (32 -> 16) + ReLU
        -> Edge classifier: concat(src, dst, edge_feat) -> MLP -> sigmoid
    
    Output: Fraud probability per edge (transaction).
    """

    def __init__(
        self,
        node_feat_dim: int = 14,
        edge_feat_dim: int = 6,
        hidden_dim: int = 64,
        dropout: float = 0.3,
    ):
        super().__init__()
        self.node_feat_dim = node_feat_dim
        self.edge_feat_dim = edge_feat_dim

        # GraphSAGE message-passing layers
        self.sage1 = GraphSAGELayer(node_feat_dim, hidden_dim)
        self.sage2 = GraphSAGELayer(hidden_dim, hidden_dim // 2)
        self.sage3 = GraphSAGELayer(hidden_dim // 2, hidden_dim // 4)

        self.dropout = nn.Dropout(dropout)
        self.bn1 = nn.BatchNorm1d(hidden_dim)
        self.bn2 = nn.BatchNorm1d(hidden_dim // 2)

        # Edge-level classifier
        # Input: concat(src_emb, dst_emb, edge_features) = 16 + 16 + edge_feat_dim
        edge_input_dim = (hidden_dim // 4) * 2 + edge_feat_dim
        self.edge_classifier = nn.Sequential(
            nn.Linear(edge_input_dim, 32),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(32, 16),
            nn.ReLU(),
            nn.Linear(16, 1),
        )

    def encode_nodes(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor,
    ) -> torch.Tensor:
        """Encode nodes via GraphSAGE message passing."""
        h = self.sage1(x, edge_index)
        h = self.bn1(h)
        h = F.relu(h)
        h = self.dropout(h)

        h = self.sage2(h, edge_index)
        h = self.bn2(h)
        h = F.relu(h)
        h = self.dropout(h)

        h = self.sage3(h, edge_index)
        h = F.relu(h)
        return h

    def classify_edges(
        self,
        node_emb: torch.Tensor,
        edge_index: torch.Tensor,
        edge_features: torch.Tensor,
    ) -> torch.Tensor:
        """Classify edges (transactions) as fraud/legitimate."""
        src_emb = node_emb[edge_index[0]]  # [E, 16]
        dst_emb = node_emb[edge_index[1]]  # [E, 16]

        edge_input = torch.cat([src_emb, dst_emb, edge_features], dim=1)
        logits = self.edge_classifier(edge_input).squeeze(-1)
        return logits

    def forward(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor,
        edge_features: torch.Tensor,
    ) -> torch.Tensor:
        """
        Full forward pass: encode nodes + classify edges.
        
        Args:
            x: Node features [N, 14]
            edge_index: Edge list [2, E]
            edge_features: Edge features [E, 6]
        Returns:
            Fraud logits per edge [E]
        """
        node_emb = self.encode_nodes(x, edge_index)
        logits = self.classify_edges(node_emb, edge_index, edge_features)
        return logits

    def predict_proba(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor,
        edge_features: torch.Tensor,
    ) -> torch.Tensor:
        """Return fraud probabilities (0-1) per edge."""
        self.eval()
        with torch.no_grad():
            logits = self.forward(x, edge_index, edge_features)
            return torch.sigmoid(logits)


def build_model(config: dict | None = None) -> FraudGNN:
    """Factory function to build FraudGNN with optional config override."""
    defaults = {
        "node_feat_dim": 14,
        "edge_feat_dim": 6,
        "hidden_dim": 64,
        "dropout": 0.3,
    }
    if config:
        defaults.update(config)
    return FraudGNN(**defaults)
