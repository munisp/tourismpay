"""MLOps Governance — model registry, drift monitoring, and explainability.

Business Rules:
- Model registry: Version control for all ML models (fraud, risk, pricing)
- Drift detection: Statistical tests (KS, PSI) on input features and predictions
- Alert: PSI > 0.2 = significant drift, requires retraining
- Explainability: SHAP values for all model decisions (regulatory requirement)
- A/B testing: Shadow mode for new models, champion-challenger pattern
- Approval: Data science lead approval before production deployment
- Audit: Full model lineage — training data, hyperparameters, performance metrics
"""
from datetime import datetime

try:
    from fastapi import FastAPI
    app = FastAPI(title="MLOps Governance", version="1.0.0")
except ImportError:
    app = None

MODELS = [
    {"id": "MDL-001", "name": "fraud_detection_v3", "type": "gradient_boosting", "accuracy": 0.95, "status": "production", "deployed": "2026-04-15"},
    {"id": "MDL-002", "name": "risk_scoring_v2", "type": "neural_network", "accuracy": 0.88, "status": "production", "deployed": "2026-03-01"},
    {"id": "MDL-003", "name": "claim_prediction_v1", "type": "random_forest", "accuracy": 0.82, "status": "shadow", "deployed": "2026-05-20"},
]

if app:
    @app.get("/health")
    def health():
        return {"status": "healthy", "service": "mlops-governance"}

    @app.get("/api/v1/models")
    def list_models():
        return {"models": MODELS, "total": len(MODELS)}

    @app.get("/api/v1/drift")
    def check_drift():
        return {
            "models": [
                {"model": "fraud_detection_v3", "psi": 0.08, "status": "stable", "action": "none"},
                {"model": "risk_scoring_v2", "psi": 0.15, "status": "warning", "action": "monitor"},
                {"model": "claim_prediction_v1", "psi": 0.05, "status": "stable", "action": "none"},
            ],
            "threshold": 0.2, "check_interval": "daily",
        }

    @app.get("/api/v1/explainability/{model_id}")
    def get_explainability(model_id: str):
        return {
            "model_id": model_id, "method": "SHAP",
            "top_features": [
                {"feature": "transaction_amount", "importance": 0.35},
                {"feature": "time_of_day", "importance": 0.22},
                {"feature": "merchant_risk_score", "importance": 0.18},
                {"feature": "customer_tenure", "importance": 0.15},
                {"feature": "device_fingerprint", "importance": 0.10},
            ],
        }
