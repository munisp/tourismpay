"""
LightGBM-based BIS risk classification model.
Multi-class classifier: low (0), medium (1), high (2), critical (3).
For entity/investigation risk scoring in the BIS module.
"""
import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, f1_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import label_binarize

logger = logging.getLogger(__name__)

FEATURE_COLS = [
    "country_risk_score", "industry_risk_score",
    "entity_age_days", "transaction_volume_30d", "transaction_count_30d",
    "chargeback_rate", "refund_rate",
    "sanctions_hit", "pep_connection", "adverse_media_count",
    "kyb_completeness_score", "ubo_declared",
    "cross_border_ratio", "cash_intensive",
    "prior_investigations", "prior_risk_level_encoded",
    "directors_count", "shareholders_count",
    "revenue_vs_volume_ratio",
]

RISK_LABELS = {0: "low", 1: "medium", 2: "high", 3: "critical"}


class BISRiskModel:
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        import lightgbm as lgb

        cfg = config or {}
        self.model = lgb.LGBMClassifier(
            objective="multiclass",
            num_class=4,
            n_estimators=cfg.get("n_estimators", 300),
            max_depth=cfg.get("max_depth", 6),
            learning_rate=cfg.get("learning_rate", 0.08),
            num_leaves=cfg.get("num_leaves", 63),
            min_data_in_leaf=cfg.get("min_data_in_leaf", 20),
            feature_fraction=cfg.get("feature_fraction", 0.8),
            bagging_fraction=cfg.get("bagging_fraction", 0.8),
            bagging_freq=cfg.get("bagging_freq", 5),
            random_state=42,
            verbose=-1,
        )
        self.feature_cols = FEATURE_COLS
        self.metrics: Dict[str, Any] = {}

    def train(
        self,
        df: pd.DataFrame,
        val_split: float = 0.2,
        early_stopping_rounds: int = 25,
    ) -> Dict[str, Any]:
        X = df[self.feature_cols].values
        y = df["risk_label"].values

        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=val_split, random_state=42, stratify=y
        )

        self.model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            eval_metric="multi_logloss",
        )

        y_pred = self.model.predict(X_val)
        y_prob = self.model.predict_proba(X_val)

        # Multi-class AUC (one-vs-rest)
        y_bin = label_binarize(y_val, classes=[0, 1, 2, 3])
        try:
            auc_roc = roc_auc_score(y_bin, y_prob, multi_class="ovr", average="weighted")
        except ValueError:
            auc_roc = 0.0

        f1_weighted = f1_score(y_val, y_pred, average="weighted")
        f1_macro = f1_score(y_val, y_pred, average="macro")

        report = classification_report(
            y_val, y_pred,
            target_names=list(RISK_LABELS.values()),
            output_dict=True,
        )

        self.metrics = {
            "auc_roc_weighted": float(auc_roc),
            "f1_weighted": float(f1_weighted),
            "f1_macro": float(f1_macro),
            "classification_report": report,
        }

        logger.info(f"Train complete — AUC-ROC: {auc_roc:.4f}, F1-weighted: {f1_weighted:.4f}")
        logger.info(f"\n{classification_report(y_val, y_pred, target_names=list(RISK_LABELS.values()))}")

        return self.metrics

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        X = df[self.feature_cols].values
        return self.model.predict_proba(X)

    def predict_risk(self, df: pd.DataFrame) -> pd.DataFrame:
        probs = self.predict(df)
        predicted_class = probs.argmax(axis=1)
        confidence = probs.max(axis=1)

        return pd.DataFrame({
            "risk_class": predicted_class,
            "risk_label": [RISK_LABELS[c] for c in predicted_class],
            "confidence": confidence,
            "prob_low": probs[:, 0],
            "prob_medium": probs[:, 1],
            "prob_high": probs[:, 2],
            "prob_critical": probs[:, 3],
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
        self.model.booster_.save_model(str(p / "bis_risk_lgbm.txt"))
        meta = {
            "feature_cols": self.feature_cols,
            "risk_labels": RISK_LABELS,
            "metrics": self.metrics,
        }
        (p / "metadata.json").write_text(json.dumps(meta, indent=2, default=str))
        logger.info(f"Model saved to {path}")

    def load(self, path: str) -> None:
        import lightgbm as lgb

        p = Path(path)
        self.model = lgb.Booster(model_file=str(p / "bis_risk_lgbm.txt"))
        meta = json.loads((p / "metadata.json").read_text())
        self.feature_cols = meta["feature_cols"]
        self.metrics = meta.get("metrics", {})
        logger.info(f"Model loaded from {path}")

    def export_onnx(self, path: str) -> None:
        """Export to ONNX for CPU inference."""
        from onnxmltools import convert_lightgbm
        from onnxmltools.convert.common.data_types import FloatTensorType

        initial_type = [("features", FloatTensorType([None, len(self.feature_cols)]))]
        onnx_model = convert_lightgbm(self.model, initial_types=initial_type)

        p = Path(path)
        p.mkdir(parents=True, exist_ok=True)
        onnx_path = str(p / "bis_risk_lgbm.onnx")
        with open(onnx_path, "wb") as f:
            f.write(onnx_model.SerializeToString())
        logger.info(f"ONNX model exported to {onnx_path}")
