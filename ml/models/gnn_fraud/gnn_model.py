"""
Graph Attention Network (GAT) for fraud detection on transaction graphs.
Detects fraud rings, money laundering patterns, and anomalous entity behavior
by learning from the structure of the transaction graph.

Uses PyTorch Geometric for GNN layers.
Supports both node-level (user fraud) and edge-level (transaction fraud) classification.
"""
import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

logger = logging.getLogger(__name__)


class GATFraudDetector(nn.Module):
    """
    Graph Attention Network for fraud node classification.

    Architecture:
    - Input projection
    - N GAT layers with multi-head attention
    - Skip connections
    - Batch normalization
    - Final classifier head

    Can detect:
    - Fraud ring participants (circular money flows)
    - Money mules (pass-through accounts)
    - Shell entity networks
    """

    def __init__(
        self,
        in_channels: int,
        hidden_channels: int = 64,
        num_layers: int = 3,
        heads: int = 4,
        dropout: float = 0.3,
        num_classes: int = 2,
    ):
        super().__init__()
        try:
            from torch_geometric.nn import GATv2Conv, BatchNorm
        except ImportError:
            raise ImportError(
                "torch_geometric is required. Install with: "
                "pip install torch-geometric"
            )

        self.num_layers = num_layers
        self.dropout = dropout

        self.input_proj = nn.Linear(in_channels, hidden_channels)

        self.convs = nn.ModuleList()
        self.norms = nn.ModuleList()
        for i in range(num_layers):
            in_ch = hidden_channels if i == 0 else hidden_channels * heads
            self.convs.append(GATv2Conv(
                in_ch, hidden_channels, heads=heads, dropout=dropout, concat=True
            ))
            self.norms.append(BatchNorm(hidden_channels * heads))

        self.classifier = nn.Sequential(
            nn.Linear(hidden_channels * heads, hidden_channels),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_channels, num_classes),
        )

        # Edge classifier for transaction-level fraud detection
        self.edge_classifier = nn.Sequential(
            nn.Linear(hidden_channels * heads * 2, hidden_channels),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_channels, 2),
        )

    def forward(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Forward pass.
        Returns: (node_logits, node_embeddings)
        """
        x = self.input_proj(x)
        x = F.relu(x)
        x = F.dropout(x, p=self.dropout, training=self.training)

        for i in range(self.num_layers):
            residual = x
            x = self.convs[i](x, edge_index)
            x = self.norms[i](x)
            x = F.elu(x)
            # Skip connection (if dimensions match)
            if residual.shape == x.shape:
                x = x + residual
            x = F.dropout(x, p=self.dropout, training=self.training)

        node_embeddings = x
        node_logits = self.classifier(x)

        return node_logits, node_embeddings

    def predict_edges(
        self,
        node_embeddings: torch.Tensor,
        edge_index: torch.Tensor,
    ) -> torch.Tensor:
        """Predict fraud probability for each edge (transaction)."""
        src_emb = node_embeddings[edge_index[0]]
        dst_emb = node_embeddings[edge_index[1]]
        edge_features = torch.cat([src_emb, dst_emb], dim=-1)
        return self.edge_classifier(edge_features)


class GNNTrainer:
    """Training loop for the GAT fraud detector."""

    def __init__(
        self,
        model: GATFraudDetector,
        learning_rate: float = 0.001,
        weight_decay: float = 1e-5,
        device: str = "cpu",
    ):
        self.model = model.to(device)
        self.device = device
        self.optimizer = torch.optim.AdamW(
            model.parameters(), lr=learning_rate, weight_decay=weight_decay
        )
        self.scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
            self.optimizer, mode="max", patience=10, factor=0.5
        )

    def train_epoch(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor,
        node_labels: torch.Tensor,
        train_mask: torch.Tensor,
    ) -> Dict[str, float]:
        self.model.train()
        self.optimizer.zero_grad()

        node_logits, _ = self.model(x, edge_index)

        # Weighted cross-entropy for class imbalance
        n_fraud = node_labels[train_mask].sum().item()
        n_legit = train_mask.sum().item() - n_fraud
        weight = torch.tensor(
            [1.0, max(n_legit / max(n_fraud, 1), 1.0)],
            device=self.device,
        )

        loss = F.cross_entropy(node_logits[train_mask], node_labels[train_mask], weight=weight)
        loss.backward()

        torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
        self.optimizer.step()

        with torch.no_grad():
            preds = node_logits[train_mask].argmax(dim=1)
            acc = (preds == node_labels[train_mask]).float().mean().item()

        return {"loss": loss.item(), "accuracy": acc}

    @torch.no_grad()
    def evaluate(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor,
        node_labels: torch.Tensor,
        eval_mask: torch.Tensor,
    ) -> Dict[str, float]:
        self.model.eval()
        node_logits, _ = self.model(x, edge_index)

        preds = node_logits[eval_mask].argmax(dim=1)
        probs = F.softmax(node_logits[eval_mask], dim=1)[:, 1]
        labels = node_labels[eval_mask]

        acc = (preds == labels).float().mean().item()

        # Compute AUC if both classes present
        labels_np = labels.cpu().numpy()
        probs_np = probs.cpu().numpy()
        if len(np.unique(labels_np)) > 1:
            from sklearn.metrics import roc_auc_score, average_precision_score
            auc_roc = roc_auc_score(labels_np, probs_np)
            auc_pr = average_precision_score(labels_np, probs_np)
        else:
            auc_roc = 0.0
            auc_pr = 0.0

        tp = ((preds == 1) & (labels == 1)).sum().item()
        fp = ((preds == 1) & (labels == 0)).sum().item()
        fn = ((preds == 0) & (labels == 1)).sum().item()
        precision = tp / max(tp + fp, 1)
        recall = tp / max(tp + fn, 1)
        f1 = 2 * precision * recall / max(precision + recall, 1e-10)

        return {
            "accuracy": acc,
            "auc_roc": auc_roc,
            "auc_pr": auc_pr,
            "precision": precision,
            "recall": recall,
            "f1": f1,
        }

    def train_full(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor,
        node_labels: torch.Tensor,
        train_mask: torch.Tensor,
        val_mask: torch.Tensor,
        epochs: int = 200,
        patience: int = 20,
    ) -> Dict[str, Any]:
        best_val_auc = 0.0
        best_state = None
        patience_counter = 0
        history = {"train_loss": [], "val_auc_roc": [], "val_f1": []}

        for epoch in range(epochs):
            train_metrics = self.train_epoch(x, edge_index, node_labels, train_mask)
            val_metrics = self.evaluate(x, edge_index, node_labels, val_mask)

            history["train_loss"].append(train_metrics["loss"])
            history["val_auc_roc"].append(val_metrics["auc_roc"])
            history["val_f1"].append(val_metrics["f1"])

            self.scheduler.step(val_metrics["auc_roc"])

            if val_metrics["auc_roc"] > best_val_auc:
                best_val_auc = val_metrics["auc_roc"]
                best_state = {k: v.cpu().clone() for k, v in self.model.state_dict().items()}
                patience_counter = 0
            else:
                patience_counter += 1

            if (epoch + 1) % 20 == 0:
                logger.info(
                    f"Epoch {epoch+1}/{epochs} — "
                    f"Loss: {train_metrics['loss']:.4f}, "
                    f"Val AUC: {val_metrics['auc_roc']:.4f}, "
                    f"Val F1: {val_metrics['f1']:.4f}"
                )

            if patience_counter >= patience:
                logger.info(f"Early stopping at epoch {epoch+1}")
                break

        if best_state:
            self.model.load_state_dict(best_state)

        final_metrics = self.evaluate(x, edge_index, node_labels, val_mask)
        return {"best_val_auc": best_val_auc, "final_metrics": final_metrics, "history": history}

    def save(self, path: str, metrics: Optional[Dict] = None) -> None:
        p = Path(path)
        p.mkdir(parents=True, exist_ok=True)
        torch.save(self.model.state_dict(), str(p / "gnn_fraud.pt"))
        meta = {
            "model_class": "GATFraudDetector",
            "metrics": metrics or {},
        }
        (p / "metadata.json").write_text(json.dumps(meta, indent=2, default=str))
        logger.info(f"GNN model saved to {path}")

    def load(self, path: str) -> None:
        p = Path(path)
        state = torch.load(str(p / "gnn_fraud.pt"), map_location=self.device, weights_only=True)
        self.model.load_state_dict(state)
        logger.info(f"GNN model loaded from {path}")

    def export_onnx(self, path: str, num_nodes: int = 100, num_edges: int = 500) -> None:
        """Export to ONNX for inference."""
        p = Path(path)
        p.mkdir(parents=True, exist_ok=True)
        self.model.eval()

        dummy_x = torch.randn(num_nodes, self.model.input_proj.in_features)
        dummy_edge = torch.randint(0, num_nodes, (2, num_edges))

        torch.onnx.export(
            self.model,
            (dummy_x, dummy_edge),
            str(p / "gnn_fraud.onnx"),
            input_names=["node_features", "edge_index"],
            output_names=["node_logits", "node_embeddings"],
            dynamic_axes={
                "node_features": {0: "num_nodes"},
                "edge_index": {1: "num_edges"},
                "node_logits": {0: "num_nodes"},
                "node_embeddings": {0: "num_nodes"},
            },
            opset_version=17,
        )
        logger.info(f"GNN ONNX model exported to {p / 'gnn_fraud.onnx'}")
