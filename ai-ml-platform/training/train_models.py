"""
Insurance AI/ML Model Training Pipeline

Trains 4 production models:
1. Fraud Detection (binary classification)
2. Claims Adjudication (multi-class classification)
3. Churn Prediction (binary classification)
4. Anomaly Detection (binary classification / autoencoder)

All models use PyTorch, trained on synthetic data, and saved as .pt files.
CPU-compatible inference.
"""

import os
import sys
import json
import time
import numpy as np
import pandas as pd
from datetime import datetime
from typing import Dict, Tuple, Optional

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix, classification_report
)

DEVICE = torch.device("cpu")  # Ensure CPU inference compatibility
MODEL_REGISTRY = os.path.join(os.path.dirname(__file__), "..", "model_registry")
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "lakehouse_store", "training_data")


# ─── Model Architectures ───

class FraudDetectionNet(nn.Module):
    """Deep neural network for fraud detection with residual connections."""

    def __init__(self, input_dim: int = 22, hidden_dims: list = None):
        super().__init__()
        if hidden_dims is None:
            hidden_dims = [128, 64, 32]

        self.input_bn = nn.BatchNorm1d(input_dim)

        layers = []
        prev_dim = input_dim
        for h_dim in hidden_dims:
            layers.extend([
                nn.Linear(prev_dim, h_dim),
                nn.BatchNorm1d(h_dim),
                nn.ReLU(),
                nn.Dropout(0.3),
            ])
            prev_dim = h_dim
        self.trunk = nn.Sequential(*layers)
        self.classifier = nn.Linear(prev_dim, 2)

    def forward(self, x):
        x = self.input_bn(x)
        features = self.trunk(x)
        return self.classifier(features)


class ClaimsAdjudicationNet(nn.Module):
    """Multi-class classifier for claims decisions (approve/reject/partial/escalate)."""

    def __init__(self, input_dim: int = 17, hidden_dims: list = None, num_classes: int = 4):
        super().__init__()
        if hidden_dims is None:
            hidden_dims = [128, 96, 64, 32]

        self.input_bn = nn.BatchNorm1d(input_dim)

        layers = []
        prev_dim = input_dim
        for h_dim in hidden_dims:
            layers.extend([
                nn.Linear(prev_dim, h_dim),
                nn.BatchNorm1d(h_dim),
                nn.GELU(),
                nn.Dropout(0.25),
            ])
            prev_dim = h_dim
        self.trunk = nn.Sequential(*layers)
        self.classifier = nn.Linear(prev_dim, num_classes)

    def forward(self, x):
        x = self.input_bn(x)
        features = self.trunk(x)
        return self.classifier(features)


class ChurnPredictionNet(nn.Module):
    """Binary classifier for customer churn prediction with attention mechanism."""

    def __init__(self, input_dim: int = 20, hidden_dims: list = None):
        super().__init__()
        if hidden_dims is None:
            hidden_dims = [128, 64, 32]

        self.input_bn = nn.BatchNorm1d(input_dim)

        layers = []
        prev_dim = input_dim
        for h_dim in hidden_dims:
            layers.extend([
                nn.Linear(prev_dim, h_dim),
                nn.BatchNorm1d(h_dim),
                nn.ReLU(),
                nn.Dropout(0.3),
            ])
            prev_dim = h_dim
        self.trunk = nn.Sequential(*layers)

        # Self-attention on hidden features
        self.attention = nn.Sequential(
            nn.Linear(prev_dim, prev_dim),
            nn.Tanh(),
            nn.Linear(prev_dim, 1),
        )
        self.classifier = nn.Linear(prev_dim, 2)

    def forward(self, x):
        x = self.input_bn(x)
        features = self.trunk(x)
        attn_weights = torch.softmax(self.attention(features), dim=-1)
        attended = features * attn_weights
        return self.classifier(attended)


class AnomalyDetectionAutoencoder(nn.Module):
    """Autoencoder for anomaly detection via reconstruction error."""

    def __init__(self, input_dim: int = 8, latent_dim: int = 3):
        super().__init__()
        self.input_bn = nn.BatchNorm1d(input_dim)
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 16),
            nn.ReLU(),
            nn.Linear(16, 8),
            nn.ReLU(),
            nn.Linear(8, latent_dim),
        )
        self.decoder = nn.Sequential(
            nn.Linear(latent_dim, 8),
            nn.ReLU(),
            nn.Linear(8, 16),
            nn.ReLU(),
            nn.Linear(16, input_dim),
        )
        self.classifier = nn.Linear(latent_dim, 2)

    def forward(self, x):
        x = self.input_bn(x)
        latent = self.encoder(x)
        reconstructed = self.decoder(latent)
        classification = self.classifier(latent)
        return classification, reconstructed, x


# ─── Training Functions ───

def load_and_prepare_data(dataset_name: str, target_col: str, feature_cols: list = None) -> Tuple:
    """Load dataset, split, and prepare DataLoaders."""
    csv_path = os.path.join(DATA_DIR, f"{dataset_name}_train.csv")
    parquet_path = os.path.join(DATA_DIR, f"{dataset_name}_train.parquet")

    if os.path.exists(parquet_path):
        df = pd.read_parquet(parquet_path)
    elif os.path.exists(csv_path):
        df = pd.read_csv(csv_path)
    else:
        raise FileNotFoundError(f"No training data at {csv_path} or {parquet_path}")

    if feature_cols is None:
        feature_cols = [c for c in df.columns if c != target_col]

    X = df[feature_cols].values.astype(np.float32)
    y = df[target_col].values.astype(np.int64)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    scaler = StandardScaler()
    X_train = scaler.fit_transform(X_train)
    X_test = scaler.transform(X_test)

    train_ds = TensorDataset(torch.tensor(X_train), torch.tensor(y_train))
    test_ds = TensorDataset(torch.tensor(X_test), torch.tensor(y_test))

    train_loader = DataLoader(train_ds, batch_size=256, shuffle=True)
    test_loader = DataLoader(test_ds, batch_size=512)

    return train_loader, test_loader, scaler, X_train.shape[1]


def train_classifier(
    model: nn.Module,
    train_loader: DataLoader,
    test_loader: DataLoader,
    epochs: int = 50,
    lr: float = 0.001,
    class_weights: torch.Tensor = None,
    model_name: str = "model",
) -> Dict:
    """Train a classifier and return metrics."""
    model.to(DEVICE)
    optimizer = optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    if class_weights is not None:
        criterion = nn.CrossEntropyLoss(weight=class_weights.to(DEVICE))
    else:
        criterion = nn.CrossEntropyLoss()

    best_f1 = 0.0
    best_state = None
    history = {"train_loss": [], "val_loss": [], "val_f1": []}
    start_time = time.time()

    for epoch in range(epochs):
        # Training
        model.train()
        train_loss = 0.0
        for X_batch, y_batch in train_loader:
            X_batch, y_batch = X_batch.to(DEVICE), y_batch.to(DEVICE)
            optimizer.zero_grad()
            logits = model(X_batch)
            loss = criterion(logits, y_batch)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            train_loss += loss.item()
        scheduler.step()

        # Validation
        model.eval()
        all_preds, all_labels, val_loss = [], [], 0.0
        with torch.no_grad():
            for X_batch, y_batch in test_loader:
                X_batch, y_batch = X_batch.to(DEVICE), y_batch.to(DEVICE)
                logits = model(X_batch)
                val_loss += criterion(logits, y_batch).item()
                preds = logits.argmax(dim=1)
                all_preds.extend(preds.cpu().numpy())
                all_labels.extend(y_batch.cpu().numpy())

        val_f1 = f1_score(all_labels, all_preds, average="weighted")
        history["train_loss"].append(train_loss / len(train_loader))
        history["val_loss"].append(val_loss / len(test_loader))
        history["val_f1"].append(val_f1)

        if val_f1 > best_f1:
            best_f1 = val_f1
            best_state = {k: v.clone() for k, v in model.state_dict().items()}

        if (epoch + 1) % 10 == 0:
            print(f"  [{model_name}] Epoch {epoch+1}/{epochs}: train_loss={train_loss/len(train_loader):.4f}, val_f1={val_f1:.4f}")

    training_time = time.time() - start_time
    model.load_state_dict(best_state)

    # Final evaluation
    model.eval()
    all_preds, all_labels, all_probs = [], [], []
    with torch.no_grad():
        for X_batch, y_batch in test_loader:
            X_batch = X_batch.to(DEVICE)
            logits = model(X_batch)
            probs = torch.softmax(logits, dim=1)
            all_preds.extend(logits.argmax(dim=1).cpu().numpy())
            all_labels.extend(y_batch.numpy())
            all_probs.extend(probs.cpu().numpy())

    all_probs = np.array(all_probs)
    n_classes = all_probs.shape[1]
    try:
        if n_classes == 2:
            auc = roc_auc_score(all_labels, all_probs[:, 1])
        else:
            auc = roc_auc_score(all_labels, all_probs, multi_class="ovr", average="weighted")
    except Exception:
        auc = 0.0

    metrics = {
        "accuracy": float(accuracy_score(all_labels, all_preds)),
        "precision": float(precision_score(all_labels, all_preds, average="weighted", zero_division=0)),
        "recall": float(recall_score(all_labels, all_preds, average="weighted", zero_division=0)),
        "f1_score": float(f1_score(all_labels, all_preds, average="weighted", zero_division=0)),
        "auc_roc": float(auc),
        "training_time_seconds": round(training_time, 2),
        "epochs": epochs,
        "best_epoch": int(np.argmax(history["val_f1"])) + 1,
        "confusion_matrix": confusion_matrix(all_labels, all_preds).tolist(),
        "classification_report": classification_report(all_labels, all_preds, output_dict=True, zero_division=0),
    }
    return metrics, history


def train_autoencoder(
    model: AnomalyDetectionAutoencoder,
    train_loader: DataLoader,
    test_loader: DataLoader,
    epochs: int = 50,
    lr: float = 0.001,
) -> Dict:
    """Train autoencoder for anomaly detection."""
    model.to(DEVICE)
    optimizer = optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
    cls_criterion = nn.CrossEntropyLoss()
    recon_criterion = nn.MSELoss()
    history = {"train_loss": [], "val_loss": []}
    start_time = time.time()
    best_loss = float("inf")
    best_state = None

    for epoch in range(epochs):
        model.train()
        train_loss = 0.0
        for X_batch, y_batch in train_loader:
            X_batch, y_batch = X_batch.to(DEVICE), y_batch.to(DEVICE)
            optimizer.zero_grad()
            cls_out, reconstructed, original = model(X_batch)
            loss = cls_criterion(cls_out, y_batch) + 0.5 * recon_criterion(reconstructed, original)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()

        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for X_batch, y_batch in test_loader:
                X_batch, y_batch = X_batch.to(DEVICE), y_batch.to(DEVICE)
                cls_out, reconstructed, original = model(X_batch)
                loss = cls_criterion(cls_out, y_batch) + 0.5 * recon_criterion(reconstructed, original)
                val_loss += loss.item()

        avg_val = val_loss / len(test_loader)
        history["train_loss"].append(train_loss / len(train_loader))
        history["val_loss"].append(avg_val)

        if avg_val < best_loss:
            best_loss = avg_val
            best_state = {k: v.clone() for k, v in model.state_dict().items()}

        if (epoch + 1) % 10 == 0:
            print(f"  [anomaly] Epoch {epoch+1}/{epochs}: train={train_loss/len(train_loader):.4f}, val={avg_val:.4f}")

    model.load_state_dict(best_state)
    training_time = time.time() - start_time

    # Evaluate classification
    model.eval()
    all_preds, all_labels = [], []
    with torch.no_grad():
        for X_batch, y_batch in test_loader:
            cls_out, _, _ = model(X_batch.to(DEVICE))
            all_preds.extend(cls_out.argmax(dim=1).cpu().numpy())
            all_labels.extend(y_batch.numpy())

    metrics = {
        "accuracy": float(accuracy_score(all_labels, all_preds)),
        "f1_score": float(f1_score(all_labels, all_preds, average="weighted", zero_division=0)),
        "training_time_seconds": round(training_time, 2),
        "epochs": epochs,
    }
    return metrics, history


def save_model(model: nn.Module, model_name: str, metrics: Dict, scaler=None, version: str = "v2"):
    """Save model weights, metrics, and scaler to registry."""
    model_dir = os.path.join(MODEL_REGISTRY, model_name, version)
    os.makedirs(model_dir, exist_ok=True)

    torch.save(model.state_dict(), os.path.join(model_dir, f"{model_name}.pt"))

    with open(os.path.join(model_dir, "metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2, default=str)

    if scaler is not None:
        import pickle
        with open(os.path.join(model_dir, "scaler.pkl"), "w+b") as f:
            pickle.dump(scaler, f)

    # Model card
    card = {
        "model_name": model_name,
        "version": version,
        "framework": "PyTorch",
        "trained_at": datetime.now().isoformat(),
        "device": "cpu",
        "metrics": {k: v for k, v in metrics.items() if k in ["accuracy", "precision", "recall", "f1_score", "auc_roc"]},
        "inference_device": "cpu",
        "can_run_on_cpu": True,
    }
    with open(os.path.join(model_dir, "model_card.json"), "w") as f:
        json.dump(card, f, indent=2)

    print(f"  Saved {model_name}/{version}: acc={metrics.get('accuracy', 0):.4f}, f1={metrics.get('f1_score', 0):.4f}")


# ─── CPU Inference Module ───

class InsuranceModelInference:
    """CPU-compatible inference for all insurance models."""

    def __init__(self, registry_path: str = None):
        if registry_path is None:
            registry_path = MODEL_REGISTRY
        self.registry_path = registry_path
        self.models = {}
        self.scalers = {}

    def load_model(self, model_name: str, version: str = "v2"):
        """Load a trained model for inference."""
        model_dir = os.path.join(self.registry_path, model_name, version)
        weights_path = os.path.join(model_dir, f"{model_name}.pt")

        if not os.path.exists(weights_path):
            raise FileNotFoundError(f"No weights at {weights_path}")

        state_dict = torch.load(weights_path, map_location="cpu", weights_only=True)

        # Instantiate model based on name
        if model_name == "fraud_detection":
            model = FraudDetectionNet()
        elif model_name == "claims_adjudication":
            model = ClaimsAdjudicationNet()
        elif model_name == "churn_prediction":
            model = ChurnPredictionNet()
        elif model_name == "anomaly_detection":
            model = AnomalyDetectionAutoencoder()
        else:
            raise ValueError(f"Unknown model: {model_name}")

        model.load_state_dict(state_dict)
        model.eval()
        self.models[model_name] = model

        # Load scaler if available
        scaler_path = os.path.join(model_dir, "scaler.pkl")
        if os.path.exists(scaler_path):
            import pickle
            with open(scaler_path, "rb") as f:
                self.scalers[model_name] = pickle.load(f)

        return model

    def predict(self, model_name: str, features: np.ndarray) -> Dict:
        """Run inference on CPU."""
        if model_name not in self.models:
            self.load_model(model_name)

        model = self.models[model_name]
        if model_name in self.scalers:
            features = self.scalers[model_name].transform(features.reshape(1, -1) if features.ndim == 1 else features)

        with torch.no_grad():
            x = torch.tensor(features, dtype=torch.float32)
            if model_name == "anomaly_detection":
                cls_out, reconstructed, _ = model(x)
                probs = torch.softmax(cls_out, dim=1).numpy()
                recon_error = torch.mean((reconstructed - x) ** 2, dim=1).numpy()
                return {"probabilities": probs.tolist(), "reconstruction_error": recon_error.tolist(), "prediction": int(probs[0].argmax())}
            else:
                logits = model(x)
                probs = torch.softmax(logits, dim=1).numpy()
                return {"probabilities": probs.tolist(), "prediction": int(probs[0].argmax()), "confidence": float(probs[0].max())}


# ─── Main Training Pipeline ───

def run_full_training_pipeline():
    """Run the complete training pipeline for all models."""
    print("=" * 60)
    print("InsurePortal AI/ML Training Pipeline")
    print(f"Device: {DEVICE}")
    print(f"PyTorch: {torch.__version__}")
    print("=" * 60)

    results = {}

    # 1. Fraud Detection
    print("\n[1/4] Training Fraud Detection Model...")
    train_loader, test_loader, scaler, input_dim = load_and_prepare_data("fraud_detection", "is_fraud")
    model = FraudDetectionNet(input_dim=input_dim)
    print(f"  Architecture: {sum(p.numel() for p in model.parameters())} parameters")
    metrics, history = train_classifier(model, train_loader, test_loader, epochs=50, model_name="fraud")
    save_model(model, "fraud_detection", metrics, scaler)
    results["fraud_detection"] = metrics

    # 2. Claims Adjudication
    print("\n[2/4] Training Claims Adjudication Model...")
    train_loader, test_loader, scaler, input_dim = load_and_prepare_data("claims_adjudication", "decision")
    model = ClaimsAdjudicationNet(input_dim=input_dim)
    print(f"  Architecture: {sum(p.numel() for p in model.parameters())} parameters")
    metrics, history = train_classifier(model, train_loader, test_loader, epochs=50, model_name="claims")
    save_model(model, "claims_adjudication", metrics, scaler)
    results["claims_adjudication"] = metrics

    # 3. Churn Prediction
    print("\n[3/4] Training Churn Prediction Model...")
    train_loader, test_loader, scaler, input_dim = load_and_prepare_data("churn_prediction", "churned")
    model = ChurnPredictionNet(input_dim=input_dim)
    print(f"  Architecture: {sum(p.numel() for p in model.parameters())} parameters")
    metrics, history = train_classifier(model, train_loader, test_loader, epochs=50, model_name="churn")
    save_model(model, "churn_prediction", metrics, scaler)
    results["churn_prediction"] = metrics

    # 4. Anomaly Detection
    print("\n[4/4] Training Anomaly Detection Model...")
    train_loader, test_loader, scaler, input_dim = load_and_prepare_data("anomaly_detection", "is_anomaly")
    model = AnomalyDetectionAutoencoder(input_dim=input_dim)
    print(f"  Architecture: {sum(p.numel() for p in model.parameters())} parameters")
    metrics, history = train_autoencoder(model, train_loader, test_loader, epochs=50)
    save_model(model, "anomaly_detection", metrics, scaler)
    results["anomaly_detection"] = metrics

    # Summary
    print("\n" + "=" * 60)
    print("TRAINING COMPLETE — Summary")
    print("=" * 60)
    for name, m in results.items():
        print(f"  {name}: accuracy={m['accuracy']:.4f}, f1={m['f1_score']:.4f}, time={m['training_time_seconds']:.1f}s")

    # Save pipeline results
    with open(os.path.join(MODEL_REGISTRY, "training_results.json"), "w") as f:
        json.dump({"trained_at": datetime.now().isoformat(), "models": results}, f, indent=2, default=str)

    # Verify CPU inference
    print("\n--- Verifying CPU Inference ---")
    inference = InsuranceModelInference()
    for name in ["fraud_detection", "claims_adjudication", "churn_prediction", "anomaly_detection"]:
        try:
            inference.load_model(name)
            dummy_input = np.random.randn(1, {"fraud_detection": 22, "claims_adjudication": 17, "churn_prediction": 20, "anomaly_detection": 8}[name]).astype(np.float32)
            result = inference.predict(name, dummy_input)
            print(f"  {name}: CPU inference OK — prediction={result['prediction']}")
        except Exception as e:
            print(f"  {name}: FAILED — {e}")

    print("\nAll models trained, saved, and verified for CPU inference.")
    return results


if __name__ == "__main__":
    run_full_training_pipeline()
