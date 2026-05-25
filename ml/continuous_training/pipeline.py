"""
Continuous training pipeline for TourismPay ML models.
Monitors platform data, detects drift, and retrains models automatically.

Architecture:
  1. Feature Store reads from Lakehouse (Delta Lake)
  2. Drift Detector monitors feature distributions
  3. Retrainer triggers on drift or schedule
  4. Champion-Challenger evaluation before deployment
  5. Model Registry tracks versions

Designed to run as a background service or Ray job.
"""
import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


@dataclass
class ModelVersion:
    model_name: str
    version: int
    trained_at: str
    metrics: Dict[str, float]
    data_hash: str
    n_samples: int
    is_champion: bool = False
    artifact_path: str = ""


@dataclass
class DriftReport:
    feature_name: str
    drift_score: float
    drift_detected: bool
    reference_mean: float
    current_mean: float
    reference_std: float
    current_std: float
    method: str = "psi"


class FeatureDriftDetector:
    """
    Detect feature drift using Population Stability Index (PSI)
    and Kolmogorov-Smirnov test.
    """

    def __init__(self, psi_threshold: float = 0.1, n_bins: int = 20):
        self.psi_threshold = psi_threshold
        self.n_bins = n_bins
        self.reference_stats: Dict[str, Dict[str, float]] = {}

    def fit_reference(self, df: pd.DataFrame, feature_cols: List[str]) -> None:
        for col in feature_cols:
            values = df[col].dropna().values
            self.reference_stats[col] = {
                "mean": float(np.mean(values)),
                "std": float(np.std(values)),
                "min": float(np.min(values)),
                "max": float(np.max(values)),
                "hist": np.histogram(values, bins=self.n_bins)[0].tolist(),
                "bin_edges": np.histogram(values, bins=self.n_bins)[1].tolist(),
            }

    def detect_drift(self, df: pd.DataFrame) -> List[DriftReport]:
        reports = []
        for col, ref in self.reference_stats.items():
            if col not in df.columns:
                continue
            values = df[col].dropna().values
            if len(values) == 0:
                continue

            # PSI calculation
            ref_hist = np.array(ref["hist"], dtype=float)
            cur_hist = np.histogram(values, bins=ref["bin_edges"])[0].astype(float)

            # Normalize to proportions
            ref_prop = (ref_hist + 1) / (ref_hist.sum() + self.n_bins)
            cur_prop = (cur_hist + 1) / (cur_hist.sum() + self.n_bins)

            psi = float(np.sum((cur_prop - ref_prop) * np.log(cur_prop / ref_prop)))

            reports.append(DriftReport(
                feature_name=col,
                drift_score=psi,
                drift_detected=psi > self.psi_threshold,
                reference_mean=ref["mean"],
                current_mean=float(np.mean(values)),
                reference_std=ref["std"],
                current_std=float(np.std(values)),
                method="psi",
            ))

        return reports


class ModelRegistry:
    """Track model versions and manage champion/challenger."""

    def __init__(self, registry_path: str = "./ml/saved_models/registry"):
        self.path = Path(registry_path)
        self.path.mkdir(parents=True, exist_ok=True)
        self.versions: Dict[str, List[ModelVersion]] = {}
        self._load()

    def _load(self) -> None:
        registry_file = self.path / "registry.json"
        if registry_file.exists():
            data = json.loads(registry_file.read_text())
            for model_name, versions in data.items():
                self.versions[model_name] = [
                    ModelVersion(**v) for v in versions
                ]

    def _save(self) -> None:
        data = {}
        for model_name, versions in self.versions.items():
            data[model_name] = [
                {
                    "model_name": v.model_name,
                    "version": v.version,
                    "trained_at": v.trained_at,
                    "metrics": v.metrics,
                    "data_hash": v.data_hash,
                    "n_samples": v.n_samples,
                    "is_champion": v.is_champion,
                    "artifact_path": v.artifact_path,
                }
                for v in versions
            ]
        (self.path / "registry.json").write_text(json.dumps(data, indent=2))

    def register(self, version: ModelVersion) -> None:
        if version.model_name not in self.versions:
            self.versions[version.model_name] = []
        self.versions[version.model_name].append(version)
        self._save()
        logger.info(f"Registered {version.model_name} v{version.version}")

    def get_champion(self, model_name: str) -> Optional[ModelVersion]:
        versions = self.versions.get(model_name, [])
        for v in reversed(versions):
            if v.is_champion:
                return v
        return versions[-1] if versions else None

    def promote_challenger(
        self,
        model_name: str,
        version: int,
        metric_name: str = "auc_roc",
    ) -> bool:
        versions = self.versions.get(model_name, [])
        challenger = next((v for v in versions if v.version == version), None)
        if not challenger:
            return False

        champion = self.get_champion(model_name)
        if champion:
            champ_score = champion.metrics.get(metric_name, 0)
            chall_score = challenger.metrics.get(metric_name, 0)
            if chall_score <= champ_score:
                logger.info(
                    f"Challenger v{version} ({chall_score:.4f}) did not beat "
                    f"champion v{champion.version} ({champ_score:.4f})"
                )
                return False
            champion.is_champion = False

        challenger.is_champion = True
        self._save()
        logger.info(f"Promoted {model_name} v{version} to champion")
        return True


class ContinuousTrainingPipeline:
    """
    Orchestrates continuous model retraining based on:
    - Scheduled intervals
    - Data drift detection
    - Performance degradation
    - New data volume thresholds
    """

    def __init__(
        self,
        lakehouse_path: str = "./lakehouse_data",
        model_dir: str = "./ml/saved_models",
        retrain_interval_hours: int = 24,
        min_new_samples: int = 1000,
        performance_threshold: float = 0.85,
    ):
        self.lakehouse_path = Path(lakehouse_path)
        self.model_dir = Path(model_dir)
        self.retrain_interval = retrain_interval_hours * 3600
        self.min_new_samples = min_new_samples
        self.performance_threshold = performance_threshold

        self.drift_detector = FeatureDriftDetector()
        self.registry = ModelRegistry(str(self.model_dir / "registry"))
        self.last_train_time: Dict[str, float] = {}

    def check_should_retrain(self, model_name: str, new_data: pd.DataFrame) -> Dict[str, Any]:
        reasons = []

        # Check schedule
        last = self.last_train_time.get(model_name, 0)
        if time.time() - last > self.retrain_interval:
            reasons.append("scheduled_interval")

        # Check data volume
        if len(new_data) >= self.min_new_samples:
            reasons.append(f"new_samples={len(new_data)}")

        # Check drift
        drift_reports = self.drift_detector.detect_drift(new_data)
        drifted = [r for r in drift_reports if r.drift_detected]
        if drifted:
            reasons.append(f"drift_detected={len(drifted)}_features")

        return {
            "should_retrain": len(reasons) > 0,
            "reasons": reasons,
            "drift_reports": drift_reports,
        }

    def retrain_fraud_model(self, training_data: pd.DataFrame) -> Optional[ModelVersion]:
        from ml.models.fraud.xgb_fraud import FraudXGBModel

        logger.info(f"Retraining fraud model with {len(training_data)} samples")

        model = FraudXGBModel()
        metrics = model.train(training_data)

        # Check performance threshold
        if metrics.get("auc_roc", 0) < self.performance_threshold:
            logger.warning(
                f"New fraud model AUC {metrics['auc_roc']:.4f} below threshold "
                f"{self.performance_threshold}. Not deploying."
            )
            return None

        data_hash = hashlib.md5(
            training_data.to_csv(index=False).encode()
        ).hexdigest()[:12]

        existing = self.registry.versions.get("fraud_xgb", [])
        version_num = len(existing) + 1
        artifact_path = str(self.model_dir / f"fraud_xgb_v{version_num}")

        model.save(artifact_path)

        version = ModelVersion(
            model_name="fraud_xgb",
            version=version_num,
            trained_at=datetime.utcnow().isoformat(),
            metrics={k: v for k, v in metrics.items() if isinstance(v, (int, float))},
            data_hash=data_hash,
            n_samples=len(training_data),
            artifact_path=artifact_path,
        )

        self.registry.register(version)
        promoted = self.registry.promote_challenger("fraud_xgb", version_num, "auc_roc")

        self.last_train_time["fraud_xgb"] = time.time()
        return version if promoted else None

    def retrain_bis_model(self, training_data: pd.DataFrame) -> Optional[ModelVersion]:
        from ml.models.bis_risk.lgbm_risk import BISRiskModel

        logger.info(f"Retraining BIS model with {len(training_data)} samples")

        model = BISRiskModel()
        metrics = model.train(training_data)

        data_hash = hashlib.md5(
            training_data.to_csv(index=False).encode()
        ).hexdigest()[:12]

        existing = self.registry.versions.get("bis_risk_lgbm", [])
        version_num = len(existing) + 1
        artifact_path = str(self.model_dir / f"bis_risk_lgbm_v{version_num}")

        model.save(artifact_path)

        version = ModelVersion(
            model_name="bis_risk_lgbm",
            version=version_num,
            trained_at=datetime.utcnow().isoformat(),
            metrics={k: v for k, v in metrics.items() if isinstance(v, (int, float))},
            data_hash=data_hash,
            n_samples=len(training_data),
            artifact_path=artifact_path,
        )

        self.registry.register(version)
        promoted = self.registry.promote_challenger("bis_risk_lgbm", version_num, "auc_roc_weighted")

        self.last_train_time["bis_risk_lgbm"] = time.time()
        return version if promoted else None

    def run_cycle(self) -> Dict[str, Any]:
        """Run one continuous training cycle."""
        cycle_results = {"timestamp": datetime.utcnow().isoformat(), "models": {}}

        # Load latest data from lakehouse
        fraud_data_path = self.lakehouse_path / "training_data" / "fraud"
        bis_data_path = self.lakehouse_path / "training_data" / "bis"

        if fraud_data_path.exists():
            parquet_files = list(fraud_data_path.glob("*.parquet"))
            if parquet_files:
                fraud_df = pd.concat([pd.read_parquet(f) for f in parquet_files])
                check = self.check_should_retrain("fraud_xgb", fraud_df)
                if check["should_retrain"]:
                    version = self.retrain_fraud_model(fraud_df)
                    cycle_results["models"]["fraud_xgb"] = {
                        "retrained": True,
                        "reasons": check["reasons"],
                        "promoted": version is not None,
                    }

        if bis_data_path.exists():
            parquet_files = list(bis_data_path.glob("*.parquet"))
            if parquet_files:
                bis_df = pd.concat([pd.read_parquet(f) for f in parquet_files])
                check = self.check_should_retrain("bis_risk_lgbm", bis_df)
                if check["should_retrain"]:
                    version = self.retrain_bis_model(bis_df)
                    cycle_results["models"]["bis_risk_lgbm"] = {
                        "retrained": True,
                        "reasons": check["reasons"],
                        "promoted": version is not None,
                    }

        return cycle_results
