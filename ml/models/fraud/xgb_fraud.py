"""
XGBoost-based fraud detection model.
Binary classifier: legitimate (0) vs fraudulent (1).
Trained on tabular transaction features, exportable to ONNX for CPU inference.
"""
import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.metrics import (
    average_precision_score,
    classification_report,
    f1_score,
    precision_recall_curve,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

logger = logging.getLogger(__name__)

FEATURE_COLS = [
    "amount", "amount_log", "amount_zscore",
    "velocity_1h", "velocity_24h", "velocity_7d",
    "is_new_device", "is_vpn", "is_tor", "failed_auth_count",
    "merchant_category_risk", "country_risk",
    "hour_of_day", "day_of_week", "is_weekend",
    "days_since_last_txn", "avg_txn_amount_30d", "std_txn_amount_30d",
    "txn_amount_ratio",
    "ip_risk_score", "device_age_days",
    "cross_border", "currency_mismatch",
]


class FraudXGBModel:
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        import xgboost as xgb

        cfg = config or {}
        self.model = xgb.XGBClassifier(
            n_estimators=cfg.get("n_estimators", 500),
            max_depth=cfg.get("max_depth", 8),
            learning_rate=cfg.get("learning_rate", 0.05),
            subsample=cfg.get("subsample", 0.8),
            colsample_bytree=cfg.get("colsample_bytree", 0.8),
            min_child_weight=cfg.get("min_child_weight", 5),
            scale_pos_weight=cfg.get("scale_pos_weight", 10.0),
            eval_metric=cfg.get("eval_metric", "aucpr"),
            tree_method="hist",
            random_state=42,
            use_label_encoder=False,
        )
        self.feature_cols = FEATURE_COLS
        self.threshold: float = 0.5
        self.metrics: Dict[str, float] = {}

    def train(
        self,
        df: pd.DataFrame,
        val_split: float = 0.2,
        early_stopping_rounds: int = 30,
    ) -> Dict[str, float]:
        X = df[self.feature_cols].values
        y = df["is_fraud"].values

        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=val_split, random_state=42, stratify=y
        )

        self.model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            verbose=50,
        )

        # Evaluate
        y_prob = self.model.predict_proba(X_val)[:, 1]
        self.metrics = self._compute_metrics(y_val, y_prob)

        # Find optimal threshold via F1
        self.threshold = self._find_optimal_threshold(y_val, y_prob)
        y_pred = (y_prob >= self.threshold).astype(int)

        logger.info(f"Train complete — AUC-ROC: {self.metrics['auc_roc']:.4f}, "
                     f"AUC-PR: {self.metrics['auc_pr']:.4f}, "
                     f"Threshold: {self.threshold:.3f}")
        logger.info(f"\n{classification_report(y_val, y_pred, target_names=['legit', 'fraud'])}")

        self.metrics["optimal_threshold"] = self.threshold
        return self.metrics

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        X = df[self.feature_cols].values
        return self.model.predict_proba(X)[:, 1]

    def predict_with_decision(self, df: pd.DataFrame) -> pd.DataFrame:
        probs = self.predict(df)
        decisions = np.where(probs >= 0.8, "block",
                    np.where(probs >= 0.6, "review",
                    np.where(probs >= self.threshold, "flag", "allow")))
        return pd.DataFrame({
            "fraud_score": probs,
            "decision": decisions,
            "risk_level": np.where(probs >= 0.8, "critical",
                          np.where(probs >= 0.6, "high",
                          np.where(probs >= 0.35, "medium", "low"))),
        })

    def feature_importance(self) -> Dict[str, float]:
        importances = self.model.feature_importances_
        return dict(sorted(
            zip(self.feature_cols, importances.tolist()),
            key=lambda x: x[1], reverse=True
        ))

    def save(self, path: str) -> None:
        p = Path(path)
        p.mkdir(parents=True, exist_ok=True)
        self.model.save_model(str(p / "fraud_xgb.json"))
        meta = {
            "feature_cols": self.feature_cols,
            "threshold": self.threshold,
            "metrics": self.metrics,
        }
        (p / "metadata.json").write_text(json.dumps(meta, indent=2))
        logger.info(f"Model saved to {path}")

    def load(self, path: str) -> None:
        import xgboost as xgb

        p = Path(path)
        self.model.load_model(str(p / "fraud_xgb.json"))
        meta = json.loads((p / "metadata.json").read_text())
        self.feature_cols = meta["feature_cols"]
        self.threshold = meta["threshold"]
        self.metrics = meta["metrics"]
        logger.info(f"Model loaded from {path}")

    def export_onnx(self, path: str) -> None:
        """Export to ONNX for CPU inference via onnxruntime."""
        from onnxmltools import convert_xgboost
        from onnxmltools.convert.common.data_types import FloatTensorType

        initial_type = [("features", FloatTensorType([None, len(self.feature_cols)]))]
        onnx_model = convert_xgboost(self.model.get_booster(), initial_types=initial_type)

        p = Path(path)
        p.mkdir(parents=True, exist_ok=True)
        onnx_path = str(p / "fraud_xgb.onnx")
        with open(onnx_path, "wb") as f:
            f.write(onnx_model.SerializeToString())
        logger.info(f"ONNX model exported to {onnx_path}")

    @staticmethod
    def _compute_metrics(y_true: np.ndarray, y_prob: np.ndarray) -> Dict[str, float]:
        return {
            "auc_roc": float(roc_auc_score(y_true, y_prob)),
            "auc_pr": float(average_precision_score(y_true, y_prob)),
        }

    @staticmethod
    def _find_optimal_threshold(y_true: np.ndarray, y_prob: np.ndarray) -> float:
        precisions, recalls, thresholds = precision_recall_curve(y_true, y_prob)
        f1_scores = 2 * precisions * recalls / (precisions + recalls + 1e-10)
        best_idx = np.argmax(f1_scores)
        return float(thresholds[min(best_idx, len(thresholds) - 1)])
