"""
InsurePortal AI/ML Inference API

FastAPI service exposing trained models for real-time inference.
All inference runs on CPU — no GPU required.

Endpoints:
  POST /predict/fraud        — Fraud detection
  POST /predict/claims       — Claims adjudication decision
  POST /predict/churn        — Customer churn prediction
  POST /predict/anomaly      — Transaction anomaly detection
  GET  /models               — List available models
  GET  /health               — Health check
"""

import os
import sys
import json
import numpy as np
from datetime import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, Field

# Add parent to path for model imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "training"))

from train_models import InsuranceModelInference

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn
    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False

MODEL_REGISTRY = os.path.join(os.path.dirname(__file__), "..", "model_registry")


# ─── Request/Response Models ───

class FraudPredictionRequest(BaseModel):
    claim_amount: float = Field(..., description="Claim amount in NGN")
    policy_age_days: int = Field(..., description="Days since policy inception")
    claim_frequency_12m: int = Field(0, description="Number of claims in last 12 months")
    days_since_inception: int = Field(365)
    premium_paid: float = Field(50000)
    sum_assured: float = Field(1000000)
    policyholder_age: int = Field(35)
    num_policies: int = Field(1)
    num_past_claims: int = Field(0)
    claim_to_premium_ratio: float = Field(0)
    is_high_risk_state: int = Field(0)
    product_type: int = Field(0)
    has_telematics: int = Field(0)
    claim_filed_weekend: int = Field(0)
    claim_filed_night: int = Field(0)
    multiple_claims_same_period: int = Field(0)
    address_change_before_claim: int = Field(0)
    beneficiary_change_before_claim: int = Field(0)
    late_premium_payments: int = Field(0)
    claim_docs_submitted_count: int = Field(3)
    kyc_verification_score: float = Field(80)
    agent_fraud_history_score: float = Field(90)


class ClaimsAdjudicationRequest(BaseModel):
    claim_amount: float
    policy_premium: float = 50000
    sum_assured: float = 1000000
    deductible_amount: float = 10000
    policy_age_days: int = 365
    claimant_age: int = 35
    num_prior_claims: int = 0
    days_to_report: int = 7
    docs_completeness_pct: float = 90
    fraud_score: float = 10
    policy_status_active: int = 1
    premium_up_to_date: int = 1
    within_coverage_scope: int = 1
    product_type: int = 0
    has_witness_statement: int = 1
    police_report_filed: int = 0
    medical_report_attached: int = 0


class ChurnPredictionRequest(BaseModel):
    tenure_months: int = 24
    num_policies: int = 1
    monthly_premium: float = 15000
    total_premium_paid: float = 360000
    num_claims_filed: int = 0
    claims_approved_ratio: float = 0.5
    last_interaction_days: int = 30
    num_support_tickets: int = 1
    complaint_count: int = 0
    nps_score: int = 7
    has_mobile_app: int = 1
    uses_digital_payment: int = 1
    has_auto_renewal: int = 0
    age: int = 35
    is_urban: int = 1
    missed_payments_12m: int = 0
    product_diversity: int = 1
    referred_by_agent: int = 1
    loyalty_points: int = 2000
    family_policies: int = 0


class AnomalyDetectionRequest(BaseModel):
    transaction_amount: float
    hour_of_day: int = 12
    day_of_week: int = 3
    transaction_count_24h: int = 2
    avg_transaction_amount_30d: float = 50000
    deviation_from_avg: float = 0
    unique_recipients_24h: int = 1
    is_new_recipient: int = 0


class PredictionResponse(BaseModel):
    model: str
    prediction: int
    label: str
    confidence: float
    probabilities: List[float]
    inference_device: str = "cpu"
    timestamp: str


# ─── Application ───

inference_engine = InsuranceModelInference(MODEL_REGISTRY)

FRAUD_LABELS = {0: "Legitimate", 1: "Fraudulent"}
CLAIMS_LABELS = {0: "Rejected", 1: "Approved", 2: "Partial", 3: "Escalated"}
CHURN_LABELS = {0: "Retained", 1: "Churned"}
ANOMALY_LABELS = {0: "Normal", 1: "Anomaly"}


def create_app() -> "FastAPI":
    if not FASTAPI_AVAILABLE:
        raise ImportError("FastAPI not installed. pip install fastapi uvicorn")

    app = FastAPI(title="InsurePortal AI/ML Inference API", version="2.0.0")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    @app.get("/health")
    def health():
        return {"status": "healthy", "models_loaded": list(inference_engine.models.keys()), "device": "cpu"}

    @app.get("/models")
    def list_models():
        models = []
        for name in ["fraud_detection", "claims_adjudication", "churn_prediction", "anomaly_detection"]:
            card_path = os.path.join(MODEL_REGISTRY, name, "v2", "model_card.json")
            if os.path.exists(card_path):
                with open(card_path) as f:
                    models.append(json.load(f))
        return {"models": models}

    @app.post("/predict/fraud", response_model=PredictionResponse)
    def predict_fraud(req: FraudPredictionRequest):
        features = np.array([[
            req.claim_amount, req.policy_age_days, req.claim_frequency_12m,
            req.days_since_inception, req.premium_paid, req.sum_assured,
            req.policyholder_age, req.num_policies, req.num_past_claims,
            req.claim_to_premium_ratio, req.is_high_risk_state, req.product_type,
            req.has_telematics, req.claim_filed_weekend, req.claim_filed_night,
            req.multiple_claims_same_period, req.address_change_before_claim,
            req.beneficiary_change_before_claim, req.late_premium_payments,
            req.claim_docs_submitted_count, req.kyc_verification_score,
            req.agent_fraud_history_score,
        ]], dtype=np.float32)
        result = inference_engine.predict("fraud_detection", features)
        return PredictionResponse(
            model="fraud_detection", prediction=result["prediction"],
            label=FRAUD_LABELS[result["prediction"]], confidence=result["confidence"],
            probabilities=result["probabilities"][0], timestamp=datetime.now().isoformat(),
        )

    @app.post("/predict/claims", response_model=PredictionResponse)
    def predict_claims(req: ClaimsAdjudicationRequest):
        features = np.array([[
            req.claim_amount, req.policy_premium, req.sum_assured, req.deductible_amount,
            req.policy_age_days, req.claimant_age, req.num_prior_claims, req.days_to_report,
            req.docs_completeness_pct, req.fraud_score, req.policy_status_active,
            req.premium_up_to_date, req.within_coverage_scope, req.product_type,
            req.has_witness_statement, req.police_report_filed, req.medical_report_attached,
        ]], dtype=np.float32)
        result = inference_engine.predict("claims_adjudication", features)
        return PredictionResponse(
            model="claims_adjudication", prediction=result["prediction"],
            label=CLAIMS_LABELS[result["prediction"]], confidence=result["confidence"],
            probabilities=result["probabilities"][0], timestamp=datetime.now().isoformat(),
        )

    @app.post("/predict/churn", response_model=PredictionResponse)
    def predict_churn(req: ChurnPredictionRequest):
        features = np.array([[
            req.tenure_months, req.num_policies, req.monthly_premium,
            req.total_premium_paid, req.num_claims_filed, req.claims_approved_ratio,
            req.last_interaction_days, req.num_support_tickets, req.complaint_count,
            req.nps_score, req.has_mobile_app, req.uses_digital_payment,
            req.has_auto_renewal, req.age, req.is_urban, req.missed_payments_12m,
            req.product_diversity, req.referred_by_agent, req.loyalty_points,
            req.family_policies,
        ]], dtype=np.float32)
        result = inference_engine.predict("churn_prediction", features)
        return PredictionResponse(
            model="churn_prediction", prediction=result["prediction"],
            label=CHURN_LABELS[result["prediction"]], confidence=result["confidence"],
            probabilities=result["probabilities"][0], timestamp=datetime.now().isoformat(),
        )

    @app.post("/predict/anomaly", response_model=PredictionResponse)
    def predict_anomaly(req: AnomalyDetectionRequest):
        features = np.array([[
            req.transaction_amount, req.hour_of_day, req.day_of_week,
            req.transaction_count_24h, req.avg_transaction_amount_30d,
            req.deviation_from_avg, req.unique_recipients_24h, req.is_new_recipient,
        ]], dtype=np.float32)
        result = inference_engine.predict("anomaly_detection", features)
        return PredictionResponse(
            model="anomaly_detection", prediction=result["prediction"],
            label=ANOMALY_LABELS[result["prediction"]],
            confidence=float(max(result["probabilities"][0])),
            probabilities=result["probabilities"][0], timestamp=datetime.now().isoformat(),
        )

    return app


if __name__ == "__main__":
    app = create_app()
    uvicorn.run(app, host="0.0.0.0", port=8100)
