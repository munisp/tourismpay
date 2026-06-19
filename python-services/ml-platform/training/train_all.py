"""
Master Training Orchestrator

Runs all training pipelines in sequence:
1. Generate synthetic data
2. Train Fraud GNN (GraphSAGE)
3. Train FX Forecaster (LSTM + Attention)
4. Train Anomaly Detector (VAE)
5. Train Risk Scorer (MLP + Feature Interactions)

Saves comprehensive training report.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def main():
    report = {"started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"), "models": {}}

    # Step 1: Generate synthetic data
    print("=" * 60)
    print("STEP 1: Generating synthetic training data")
    print("=" * 60)
    from data.synthetic.generator import generate_all

    datasets = generate_all()
    report["data"] = {
        name: len(df) for name, df in datasets.items()
    }

    # Step 2: Train Fraud GNN
    print("\n" + "=" * 60)
    print("STEP 2: Training Fraud GNN (GraphSAGE)")
    print("=" * 60)
    from training.train_fraud_gnn import train as train_fraud

    t0 = time.time()
    fraud_summary = train_fraud(n_epochs=50)
    fraud_summary["training_time_seconds"] = time.time() - t0
    report["models"]["fraud_gnn"] = {
        "test_metrics": fraud_summary["test_metrics"],
        "best_epoch": fraud_summary["best_epoch"],
        "params": fraud_summary["model_params"],
        "time_seconds": fraud_summary["training_time_seconds"],
    }

    # Step 3: Train FX Forecaster
    print("\n" + "=" * 60)
    print("STEP 3: Training FX Forecaster (LSTM + Attention)")
    print("=" * 60)
    from training.train_fx_forecaster import train as train_fx

    t0 = time.time()
    fx_summary = train_fx(n_epochs=30)
    fx_summary["training_time_seconds"] = time.time() - t0
    report["models"]["fx_forecaster"] = {
        "test_metrics": fx_summary["test_metrics"],
        "best_epoch": fx_summary["best_epoch"],
        "params": fx_summary["model_params"],
        "time_seconds": fx_summary["training_time_seconds"],
    }

    # Step 4: Train Anomaly Detector
    print("\n" + "=" * 60)
    print("STEP 4: Training Anomaly Detector (VAE)")
    print("=" * 60)
    from training.train_anomaly_detector import train as train_anomaly

    t0 = time.time()
    anomaly_summary = train_anomaly(n_epochs=30)
    anomaly_summary["training_time_seconds"] = time.time() - t0
    report["models"]["anomaly_detector"] = {
        "test_metrics": anomaly_summary["test_metrics"],
        "best_epoch": anomaly_summary["best_epoch"],
        "params": anomaly_summary["model_params"],
        "time_seconds": anomaly_summary["training_time_seconds"],
    }

    # Step 5: Train Risk Scorer
    print("\n" + "=" * 60)
    print("STEP 5: Training Risk Scorer (MLP + Feature Interactions)")
    print("=" * 60)
    from training.train_risk_scorer import train as train_risk

    t0 = time.time()
    risk_summary = train_risk(n_epochs=50)
    risk_summary["training_time_seconds"] = time.time() - t0
    report["models"]["risk_scorer"] = {
        "test_metrics": risk_summary["test_metrics"],
        "best_epoch": risk_summary["best_epoch"],
        "params": risk_summary["model_params"],
        "time_seconds": risk_summary["training_time_seconds"],
    }

    # Summary
    report["completed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    total_params = sum(m["params"] for m in report["models"].values())
    total_time = sum(m["time_seconds"] for m in report["models"].values())
    report["totals"] = {
        "total_parameters": total_params,
        "total_training_time_seconds": total_time,
        "models_trained": len(report["models"]),
    }

    # Save report
    report_path = Path(__file__).parent / "checkpoints" / "training_report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    print("\n" + "=" * 60)
    print("TRAINING COMPLETE")
    print("=" * 60)
    print(f"Models trained: {len(report['models'])}")
    print(f"Total parameters: {total_params:,}")
    print(f"Total time: {total_time:.1f}s")
    print(f"\nPer-model results:")
    for name, data in report["models"].items():
        print(f"  {name}:")
        for k, v in data["test_metrics"].items():
            if isinstance(v, dict):
                for kk, vv in v.items():
                    print(f"    {k}.{kk}: {vv:.4f}")
            else:
                print(f"    {k}: {v:.4f}")
    print(f"\nReport saved: {report_path}")


if __name__ == "__main__":
    main()
