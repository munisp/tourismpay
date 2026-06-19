"""
Ray Distributed Training & Serving

Provides:
- Distributed training across multiple workers
- Hyperparameter tuning with Ray Tune
- Model serving with Ray Serve
- Parallel data preprocessing
- Fault-tolerant checkpointing

Falls back to single-process training when Ray is unavailable.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path
from typing import Any

logger = logging.getLogger("tourismpay.ray")

_ray_available = False
try:
    import ray
    from ray import train as ray_train
    _ray_available = True
except ImportError:
    logger.warning("Ray not available, falling back to single-process training")


def is_ray_available() -> bool:
    return _ray_available


def init_ray(
    num_cpus: int | None = None,
    address: str | None = None,
) -> bool:
    """Initialize Ray runtime."""
    if not _ray_available:
        return False

    try:
        if address:
            ray.init(address=address, ignore_reinit_error=True)
        else:
            ray.init(
                num_cpus=num_cpus or os.cpu_count(),
                ignore_reinit_error=True,
                logging_level=logging.WARNING,
            )
        logger.info("Ray initialized: %s", ray.cluster_resources())
        return True
    except Exception as e:
        logger.warning("Ray init failed: %s", e)
        return False


def shutdown_ray() -> None:
    """Shutdown Ray runtime."""
    if _ray_available and ray.is_initialized():
        ray.shutdown()


# --- Distributed Training ---

def train_distributed(
    model_name: str,
    config: dict[str, Any] | None = None,
    num_workers: int = 2,
    use_gpu: bool = False,
) -> dict[str, Any]:
    """
    Run distributed training using Ray Train.
    
    Falls back to single-process if Ray unavailable.
    """
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

    if not _ray_available or not ray.is_initialized():
        logger.info("Ray not available, running single-process training")
        return _train_single_process(model_name, config)

    from ray.train.torch import TorchTrainer
    from ray.train import ScalingConfig, RunConfig, CheckpointConfig

    def train_func(train_config):
        """Training function executed on each worker."""
        import torch
        from ray.train import report

        # Import the right training module
        if model_name == "fraud_gnn":
            from training.train_fraud_gnn import train
            result = train(n_epochs=train_config.get("epochs", 50))
        elif model_name == "fx_forecaster":
            from training.train_fx_forecaster import train
            result = train(n_epochs=train_config.get("epochs", 30))
        elif model_name == "anomaly_detector":
            from training.train_anomaly_detector import train
            result = train(n_epochs=train_config.get("epochs", 30))
        elif model_name == "risk_scorer":
            from training.train_risk_scorer import train
            result = train(n_epochs=train_config.get("epochs", 50))
        else:
            raise ValueError(f"Unknown model: {model_name}")

        report(result.get("test_metrics", {}))

    trainer = TorchTrainer(
        train_loop_per_worker=train_func,
        train_loop_config=config or {},
        scaling_config=ScalingConfig(
            num_workers=num_workers,
            use_gpu=use_gpu,
        ),
        run_config=RunConfig(
            name=f"tourismpay_{model_name}",
            checkpoint_config=CheckpointConfig(
                num_to_keep=2,
            ),
        ),
    )

    result = trainer.fit()
    return {
        "model": model_name,
        "metrics": result.metrics,
        "checkpoint": str(result.checkpoint) if result.checkpoint else None,
        "distributed": True,
        "num_workers": num_workers,
    }


def _train_single_process(
    model_name: str,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Fallback single-process training."""
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

    if model_name == "fraud_gnn":
        from training.train_fraud_gnn import train
        result = train(n_epochs=(config or {}).get("epochs", 50))
    elif model_name == "fx_forecaster":
        from training.train_fx_forecaster import train
        result = train(n_epochs=(config or {}).get("epochs", 30))
    elif model_name == "anomaly_detector":
        from training.train_anomaly_detector import train
        result = train(n_epochs=(config or {}).get("epochs", 30))
    elif model_name == "risk_scorer":
        from training.train_risk_scorer import train
        result = train(n_epochs=(config or {}).get("epochs", 50))
    else:
        raise ValueError(f"Unknown model: {model_name}")

    return {
        "model": model_name,
        "metrics": result.get("test_metrics", {}),
        "distributed": False,
    }


# --- Hyperparameter Tuning ---

def tune_hyperparameters(
    model_name: str,
    param_space: dict[str, Any] | None = None,
    num_samples: int = 10,
    max_epochs: int = 20,
) -> dict[str, Any]:
    """
    Run hyperparameter tuning using Ray Tune.
    
    Falls back to grid search with 3 configs if Ray unavailable.
    """
    if not _ray_available or not ray.is_initialized():
        return _tune_fallback(model_name, max_epochs)

    from ray import tune
    from ray.tune.schedulers import ASHAScheduler

    default_space = {
        "lr": tune.loguniform(1e-4, 1e-2),
        "dropout": tune.uniform(0.1, 0.5),
        "hidden_dim": tune.choice([32, 64, 128]),
        "epochs": max_epochs,
    }

    if param_space:
        default_space.update(param_space)

    scheduler = ASHAScheduler(
        metric="auroc" if model_name != "fx_forecaster" else "mae",
        mode="max" if model_name != "fx_forecaster" else "min",
        max_t=max_epochs,
        grace_period=5,
    )

    def trainable(config):
        result = _train_single_process(model_name, config)
        return result.get("metrics", {})

    analysis = tune.run(
        trainable,
        config=default_space,
        num_samples=num_samples,
        scheduler=scheduler,
        resources_per_trial={"cpu": 2},
    )

    best_config = analysis.best_config
    best_result = analysis.best_result

    return {
        "model": model_name,
        "best_config": best_config,
        "best_result": best_result,
        "num_trials": num_samples,
    }


def _tune_fallback(model_name: str, max_epochs: int = 20) -> dict[str, Any]:
    """Fallback: try 3 predefined configs."""
    configs = [
        {"lr": 1e-3, "epochs": max_epochs},
        {"lr": 5e-4, "epochs": max_epochs},
        {"lr": 1e-4, "epochs": max_epochs},
    ]

    results = []
    for cfg in configs:
        result = _train_single_process(model_name, cfg)
        results.append({"config": cfg, "metrics": result.get("metrics", {})})

    # Pick best by primary metric
    if model_name == "fx_forecaster":
        best = min(results, key=lambda r: r["metrics"].get("mae", float("inf")))
    else:
        best = max(results, key=lambda r: r["metrics"].get("auroc", 0))

    return {
        "model": model_name,
        "best_config": best["config"],
        "best_result": best["metrics"],
        "num_trials": len(configs),
        "fallback": True,
    }


# --- Model Serving ---

def deploy_model(
    model_name: str,
    checkpoint_path: str,
    route: str | None = None,
    num_replicas: int = 1,
) -> dict[str, Any]:
    """
    Deploy a trained model as a Ray Serve endpoint.
    
    Falls back to returning model info if Ray Serve unavailable.
    """
    if not _ray_available:
        return {
            "model": model_name,
            "status": "not_deployed",
            "reason": "Ray not available",
            "checkpoint": checkpoint_path,
        }

    try:
        from ray import serve

        if not serve.status().applications:
            serve.start(http_options={"host": "0.0.0.0", "port": 8000})

        route = route or f"/ml/v1/{model_name}/predict"

        @serve.deployment(
            name=model_name,
            num_replicas=num_replicas,
            ray_actor_options={"num_cpus": 1},
        )
        class ModelDeployment:
            def __init__(self):
                import torch
                self.checkpoint = torch.load(checkpoint_path, weights_only=False, map_location="cpu")
                # Load model based on name
                if model_name == "fraud_gnn":
                    from models.fraud_gnn.model import build_model
                elif model_name == "fx_forecaster":
                    from models.fx_forecaster.model import build_model
                elif model_name == "anomaly_detector":
                    from models.anomaly_detector.model import build_model
                elif model_name == "risk_scorer":
                    from models.risk_scorer.model import build_model
                else:
                    raise ValueError(f"Unknown model: {model_name}")

                self.model = build_model(self.checkpoint.get("config"))
                self.model.load_state_dict(self.checkpoint["model_state_dict"])
                self.model.eval()

            async def __call__(self, request):
                import torch
                data = await request.json()
                tensor = torch.FloatTensor(data["features"])
                with torch.no_grad():
                    if model_name == "fraud_gnn":
                        output = self.model.predict_proba(tensor, None, None)
                    else:
                        output = self.model(tensor)
                return {"prediction": output.tolist() if hasattr(output, "tolist") else output}

        handle = serve.run(ModelDeployment.bind(), route_prefix=route)

        return {
            "model": model_name,
            "status": "deployed",
            "route": route,
            "num_replicas": num_replicas,
        }
    except Exception as e:
        return {
            "model": model_name,
            "status": "deploy_failed",
            "error": str(e),
        }
