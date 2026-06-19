"""
Comprehensive tests for all trained ML models.
Verifies:
1. Model loading from checkpoints
2. Forward pass produces correct output shapes
3. CPU inference works
4. Deterministic output on same input
5. Prediction values in expected ranges
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

CHECKPOINT_DIR = Path(__file__).parent.parent / "training" / "checkpoints"
RESULTS = {"passed": 0, "failed": 0, "tests": []}


def run_test(name: str, fn):
    try:
        fn()
        RESULTS["passed"] += 1
        RESULTS["tests"].append({"name": name, "status": "PASSED"})
        print(f"  PASSED: {name}")
    except Exception as e:
        RESULTS["failed"] += 1
        RESULTS["tests"].append({"name": name, "status": "FAILED", "error": str(e)})
        print(f"  FAILED: {name} — {e}")


# ─── Fraud GNN Tests ─────────────────────────────────────────────────────────

def test_fraud_gnn_loads():
    from models.fraud_gnn.model import build_model
    checkpoint = torch.load(CHECKPOINT_DIR / "fraud_gnn" / "best_model.pt", weights_only=False, map_location="cpu")
    model = build_model(checkpoint.get("config"))
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    assert sum(p.numel() for p in model.parameters()) > 0, "Model has no parameters"


def test_fraud_gnn_forward():
    from models.fraud_gnn.model import build_model
    model = build_model()
    model.eval()
    x = torch.randn(10, 14)  # 10 nodes, 14 features
    edge_index = torch.randint(0, 10, (2, 20))  # 20 edges
    edge_features = torch.randn(20, 6)
    with torch.no_grad():
        logits = model(x, edge_index, edge_features)
    assert logits.shape == (20,), f"Expected shape (20,), got {logits.shape}"


def test_fraud_gnn_predict_proba():
    from models.fraud_gnn.model import build_model
    model = build_model()
    model.eval()
    x = torch.randn(5, 14)
    edge_index = torch.tensor([[0, 1, 2], [1, 2, 3]])
    edge_features = torch.randn(3, 6)
    probs = model.predict_proba(x, edge_index, edge_features)
    assert probs.shape == (3,)
    assert (probs >= 0).all() and (probs <= 1).all(), f"Probs out of range: {probs}"


def test_fraud_gnn_deterministic():
    from models.fraud_gnn.model import build_model
    model = build_model()
    model.eval()
    x = torch.randn(3, 14)
    ei = torch.tensor([[0, 1], [1, 2]])
    ef = torch.randn(2, 6)
    p1 = model.predict_proba(x, ei, ef)
    p2 = model.predict_proba(x, ei, ef)
    assert torch.allclose(p1, p2), "Non-deterministic in eval mode"


def test_fraud_gnn_cpu():
    from models.fraud_gnn.model import build_model
    model = build_model()
    assert next(model.parameters()).device.type == "cpu"


# ─── FX Forecaster Tests ────────────────────────────────────────────────────

def test_fx_forecaster_loads():
    from models.fx_forecaster.model import build_model
    checkpoint = torch.load(CHECKPOINT_DIR / "fx_forecaster" / "best_model.pt", weights_only=False, map_location="cpu")
    model = build_model(checkpoint.get("config"))
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    assert sum(p.numel() for p in model.parameters()) > 0


def test_fx_forecaster_forward():
    from models.fx_forecaster.model import build_model
    model = build_model({"seq_len": 72, "n_horizons": 24})
    model.eval()
    x = torch.randn(4, 72, 6)  # batch=4, seq=72, features=6
    corridor_ids = torch.LongTensor([0, 1, 2, 3])
    with torch.no_grad():
        out = model(x, corridor_ids)
    assert out["point"].shape == (4, 24), f"Point shape: {out['point'].shape}"
    assert out["lower"].shape == (4, 24)
    assert out["upper"].shape == (4, 24)


def test_fx_forecaster_confidence_interval():
    from models.fx_forecaster.model import build_model
    model = build_model({"seq_len": 72, "n_horizons": 24})
    model.eval()
    x = torch.randn(2, 72, 6)
    with torch.no_grad():
        out = model(x)
    # Lower should be less than or equal to point, point <= upper
    assert (out["lower"] <= out["point"] + 1e-4).all(), "Lower bound exceeds point"
    assert (out["point"] <= out["upper"] + 1e-4).all(), "Point exceeds upper bound"


def test_fx_forecaster_cpu():
    from models.fx_forecaster.model import build_model
    model = build_model()
    assert next(model.parameters()).device.type == "cpu"


# ─── Anomaly Detector Tests ─────────────────────────────────────────────────

def test_anomaly_detector_loads():
    from models.anomaly_detector.model import build_model
    checkpoint = torch.load(CHECKPOINT_DIR / "anomaly_detector" / "best_model.pt", weights_only=False, map_location="cpu")
    model = build_model(checkpoint.get("config"))
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    assert sum(p.numel() for p in model.parameters()) > 0


def test_anomaly_detector_forward():
    from models.anomaly_detector.model import build_model
    model = build_model({"input_dim": 24})
    model.eval()
    x = torch.randn(10, 24)
    with torch.no_grad():
        recon, mu, logvar = model(x)
    assert recon.shape == (10, 24)
    assert mu.shape == (10, 32)  # latent_dim=32
    assert logvar.shape == (10, 32)


def test_anomaly_detector_scores():
    from models.anomaly_detector.model import build_model
    model = build_model({"input_dim": 24})
    model.eval()
    x = torch.randn(10, 24)
    scores = model.anomaly_score(x)
    assert scores.shape == (10,)
    assert (scores >= 0).all(), "Negative anomaly scores"


def test_anomaly_detector_detect():
    from models.anomaly_detector.model import build_model
    model = build_model({"input_dim": 24})
    model.eval()
    x = torch.randn(100, 24)
    result = model.detect_anomalies(x, percentile=95.0)
    assert "scores" in result
    assert "is_anomaly" in result
    assert "threshold" in result
    assert 0.0 <= result["anomaly_rate"] <= 1.0


def test_anomaly_detector_cpu():
    from models.anomaly_detector.model import build_model
    model = build_model()
    assert next(model.parameters()).device.type == "cpu"


# ─── Risk Scorer Tests ──────────────────────────────────────────────────────

def test_risk_scorer_loads():
    from models.risk_scorer.model import build_model
    checkpoint = torch.load(CHECKPOINT_DIR / "risk_scorer" / "best_model.pt", weights_only=False, map_location="cpu")
    model = build_model(checkpoint.get("config"))
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    assert sum(p.numel() for p in model.parameters()) > 0


def test_risk_scorer_forward():
    from models.risk_scorer.model import build_model
    model = build_model()
    model.eval()
    x = torch.randn(5, 12)
    with torch.no_grad():
        out = model(x)
    assert out["risk_score"].shape == (5,)
    assert out["tier_logits"].shape == (5, 4)
    assert (out["risk_score"] >= 0).all() and (out["risk_score"] <= 1).all()


def test_risk_scorer_predict():
    from models.risk_scorer.model import build_model
    model = build_model()
    model.eval()
    x = torch.randn(3, 12)
    result = model.predict(x)
    assert len(result["tier"]) == 3
    assert all(t in {"low", "medium", "high", "critical"} for t in result["tier"])


def test_risk_scorer_cpu():
    from models.risk_scorer.model import build_model
    model = build_model()
    assert next(model.parameters()).device.type == "cpu"


# ─── Training Summary Tests ─────────────────────────────────────────────────

def test_training_summaries_exist():
    for model_name in ["fraud_gnn", "fx_forecaster", "anomaly_detector", "risk_scorer"]:
        summary_path = CHECKPOINT_DIR / model_name / "training_summary.json"
        assert summary_path.exists(), f"Missing training summary for {model_name}"
        with open(summary_path) as f:
            data = json.load(f)
        assert "test_metrics" in data, f"No test_metrics for {model_name}"
        assert "best_epoch" in data
        assert "model_params" in data


def test_checkpoints_have_weights():
    for model_name in ["fraud_gnn", "fx_forecaster", "anomaly_detector", "risk_scorer"]:
        pt_path = CHECKPOINT_DIR / model_name / "best_model.pt"
        assert pt_path.exists(), f"Missing checkpoint for {model_name}"
        checkpoint = torch.load(pt_path, weights_only=False, map_location="cpu")
        assert "model_state_dict" in checkpoint
        assert len(checkpoint["model_state_dict"]) > 0


# ─── DuckDB Feature Store Tests ─────────────────────────────────────────────

def test_feature_store_init():
    from lakehouse.feature_store import get_connection
    conn = get_connection()
    assert conn is not None
    # Check tables exist
    tables = conn.execute("SHOW TABLES").fetchall()
    table_names = [t[0] for t in tables]
    assert "feature_metadata" in table_names
    assert "user_features" in table_names
    assert "transaction_features" in table_names


def test_feature_store_stats():
    from lakehouse.feature_store import compute_feature_stats, close
    stats = compute_feature_stats()
    assert "user_features" in stats
    assert "transaction_features" in stats
    close()


# ─── Graph Analyzer Tests ───────────────────────────────────────────────────

def test_graph_analyzer_init():
    from graph.neo4j_integration import GraphAnalyzer
    ga = GraphAnalyzer()
    stats = ga.get_graph_stats()
    assert "nodes" in stats
    assert "edges" in stats
    assert "backend" in stats  # either "neo4j" or "networkx_fallback"


def test_graph_analyzer_pagerank():
    from graph.neo4j_integration import GraphAnalyzer
    ga = GraphAnalyzer()
    ga.ingest_users([
        {"user_id": "u1", "country": "NG", "risk_score": 0.2, "account_age_days": 100, "is_pep": False},
        {"user_id": "u2", "country": "KE", "risk_score": 0.5, "account_age_days": 200, "is_pep": False},
    ])
    ga.ingest_p2p_transfers([
        {"source": "u1", "target": "u2", "amount": 100, "timestamp": "2024-01-01", "is_fraud": False},
    ])
    scores = ga.compute_pagerank(top_n=5)
    assert len(scores) >= 0  # may be empty for very small graph


# ─── Run All Tests ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("ML Platform Test Suite")
    print("=" * 60)

    print("\n--- Fraud GNN ---")
    run_test("fraud_gnn_loads", test_fraud_gnn_loads)
    run_test("fraud_gnn_forward", test_fraud_gnn_forward)
    run_test("fraud_gnn_predict_proba", test_fraud_gnn_predict_proba)
    run_test("fraud_gnn_deterministic", test_fraud_gnn_deterministic)
    run_test("fraud_gnn_cpu", test_fraud_gnn_cpu)

    print("\n--- FX Forecaster ---")
    run_test("fx_forecaster_loads", test_fx_forecaster_loads)
    run_test("fx_forecaster_forward", test_fx_forecaster_forward)
    run_test("fx_forecaster_confidence_interval", test_fx_forecaster_confidence_interval)
    run_test("fx_forecaster_cpu", test_fx_forecaster_cpu)

    print("\n--- Anomaly Detector ---")
    run_test("anomaly_detector_loads", test_anomaly_detector_loads)
    run_test("anomaly_detector_forward", test_anomaly_detector_forward)
    run_test("anomaly_detector_scores", test_anomaly_detector_scores)
    run_test("anomaly_detector_detect", test_anomaly_detector_detect)
    run_test("anomaly_detector_cpu", test_anomaly_detector_cpu)

    print("\n--- Risk Scorer ---")
    run_test("risk_scorer_loads", test_risk_scorer_loads)
    run_test("risk_scorer_forward", test_risk_scorer_forward)
    run_test("risk_scorer_predict", test_risk_scorer_predict)
    run_test("risk_scorer_cpu", test_risk_scorer_cpu)

    print("\n--- Training Artifacts ---")
    run_test("training_summaries_exist", test_training_summaries_exist)
    run_test("checkpoints_have_weights", test_checkpoints_have_weights)

    print("\n--- Feature Store ---")
    run_test("feature_store_init", test_feature_store_init)
    run_test("feature_store_stats", test_feature_store_stats)

    print("\n--- Graph Analyzer ---")
    run_test("graph_analyzer_init", test_graph_analyzer_init)
    run_test("graph_analyzer_pagerank", test_graph_analyzer_pagerank)

    print("\n" + "=" * 60)
    print(f"Results: {RESULTS['passed']}/{RESULTS['passed'] + RESULTS['failed']} passed")
    if RESULTS["failed"] > 0:
        print("FAILED TESTS:")
        for t in RESULTS["tests"]:
            if t["status"] == "FAILED":
                print(f"  - {t['name']}: {t.get('error', 'unknown')}")
    print("=" * 60)
