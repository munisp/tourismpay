"""
Synthetic Insurance Data Generator for Model Training

Generates realistic Nigerian insurance industry data for training
fraud detection, claims adjudication, churn prediction, and anomaly detection models.
"""

import numpy as np
import pandas as pd
import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
import random

np.random.seed(42)
random.seed(42)

NIGERIAN_STATES = [
    "Lagos", "Kano", "Rivers", "FCT", "Oyo", "Kaduna", "Enugu", "Delta",
    "Anambra", "Imo", "Edo", "Ogun", "Kwara", "Borno", "Plateau"
]

PRODUCT_CODES = ["Motor", "Health", "Life", "Property", "Agriculture", "Cyber", "Marine", "Fire"]

OCCUPATIONS = [
    "Civil Servant", "Trader", "Engineer", "Doctor", "Teacher", "Lawyer",
    "Farmer", "Banker", "IT Professional", "Business Owner", "Artisan", "Driver"
]


def generate_fraud_detection_data(n_samples: int = 50000) -> pd.DataFrame:
    """Generate labeled fraud detection training data."""
    fraud_rate = 0.08  # 8% fraud rate (realistic for Nigerian market)

    data = {
        "claim_amount": np.round(np.random.lognormal(12, 1.5, n_samples), 2),
        "policy_age_days": np.random.randint(1, 3650, n_samples),
        "claim_frequency_12m": np.random.poisson(1.2, n_samples),
        "days_since_inception": np.random.randint(30, 3650, n_samples),
        "premium_paid": np.round(np.random.lognormal(10, 1, n_samples), 2),
        "sum_assured": np.round(np.random.lognormal(14, 1.5, n_samples), 2),
        "policyholder_age": np.random.randint(18, 75, n_samples),
        "num_policies": np.random.randint(1, 8, n_samples),
        "num_past_claims": np.random.poisson(0.8, n_samples),
        "claim_to_premium_ratio": np.zeros(n_samples),
        "is_high_risk_state": np.random.binomial(1, 0.3, n_samples),
        "product_type": np.random.choice(range(len(PRODUCT_CODES)), n_samples),
        "has_telematics": np.random.binomial(1, 0.15, n_samples),
        "claim_filed_weekend": np.random.binomial(1, 0.28, n_samples),
        "claim_filed_night": np.random.binomial(1, 0.12, n_samples),
        "multiple_claims_same_period": np.random.binomial(1, 0.05, n_samples),
        "address_change_before_claim": np.random.binomial(1, 0.03, n_samples),
        "beneficiary_change_before_claim": np.random.binomial(1, 0.02, n_samples),
        "late_premium_payments": np.random.poisson(1.5, n_samples),
        "claim_docs_submitted_count": np.random.randint(1, 10, n_samples),
        "kyc_verification_score": np.round(np.random.beta(5, 2, n_samples) * 100, 1),
        "agent_fraud_history_score": np.round(np.random.beta(8, 2, n_samples) * 100, 1),
    }

    df = pd.DataFrame(data)
    df["claim_to_premium_ratio"] = np.round(df["claim_amount"] / (df["premium_paid"] + 1), 4)

    # Generate fraud labels with realistic correlations
    fraud_prob = np.zeros(n_samples)
    fraud_prob += 0.15 * (df["claim_to_premium_ratio"] > 10).astype(float)
    fraud_prob += 0.12 * (df["claim_frequency_12m"] > 3).astype(float)
    fraud_prob += 0.10 * df["multiple_claims_same_period"]
    fraud_prob += 0.08 * df["address_change_before_claim"]
    fraud_prob += 0.10 * df["beneficiary_change_before_claim"]
    fraud_prob += 0.05 * (df["claim_filed_night"]).astype(float)
    fraud_prob += 0.05 * (df["policy_age_days"] < 90).astype(float)
    fraud_prob += 0.03 * (df["kyc_verification_score"] < 40).astype(float)
    fraud_prob += 0.02 * (df["agent_fraud_history_score"] < 50).astype(float)
    fraud_prob = np.clip(fraud_prob + np.random.normal(0, 0.03, n_samples), 0, 1)

    df["is_fraud"] = (fraud_prob > np.percentile(fraud_prob, 100 - fraud_rate * 100)).astype(int)
    return df


def generate_claims_adjudication_data(n_samples: int = 30000) -> pd.DataFrame:
    """Generate labeled claims adjudication training data."""
    data = {
        "claim_amount": np.round(np.random.lognormal(12, 1.5, n_samples), 2),
        "policy_premium": np.round(np.random.lognormal(10, 1, n_samples), 2),
        "sum_assured": np.round(np.random.lognormal(14, 1.5, n_samples), 2),
        "deductible_amount": np.round(np.random.lognormal(9, 1, n_samples), 2),
        "policy_age_days": np.random.randint(30, 3650, n_samples),
        "claimant_age": np.random.randint(18, 75, n_samples),
        "num_prior_claims": np.random.poisson(0.8, n_samples),
        "days_to_report": np.random.exponential(15, n_samples).astype(int),
        "docs_completeness_pct": np.round(np.random.beta(5, 1, n_samples) * 100, 1),
        "fraud_score": np.round(np.random.beta(2, 8, n_samples) * 100, 1),
        "policy_status_active": np.random.binomial(1, 0.92, n_samples),
        "premium_up_to_date": np.random.binomial(1, 0.88, n_samples),
        "within_coverage_scope": np.random.binomial(1, 0.95, n_samples),
        "product_type": np.random.choice(range(len(PRODUCT_CODES)), n_samples),
        "has_witness_statement": np.random.binomial(1, 0.6, n_samples),
        "police_report_filed": np.random.binomial(1, 0.45, n_samples),
        "medical_report_attached": np.random.binomial(1, 0.35, n_samples),
    }

    df = pd.DataFrame(data)

    # Decision logic (0=reject, 1=approve, 2=partial, 3=escalate)
    decision = np.full(n_samples, 1)  # Default approve
    decision[df["policy_status_active"] == 0] = 0  # Reject inactive
    decision[df["premium_up_to_date"] == 0] = 0  # Reject unpaid
    decision[df["within_coverage_scope"] == 0] = 0  # Reject out of scope
    decision[df["fraud_score"] > 70] = 3  # Escalate high fraud risk
    decision[df["claim_amount"] > df["sum_assured"] * 0.8] = 3  # Escalate high value
    decision[(df["docs_completeness_pct"] < 60) & (decision == 1)] = 2  # Partial if docs incomplete
    decision[df["days_to_report"] > 180] = 0  # Reject late reports (NAICOM: 6 months)

    # Add noise (10% of decisions differ from rules to capture real-world variance)
    noise_idx = np.random.choice(n_samples, int(n_samples * 0.10), replace=False)
    decision[noise_idx] = np.random.choice([0, 1, 2, 3], len(noise_idx), p=[0.15, 0.50, 0.20, 0.15])

    df["decision"] = decision
    return df


def generate_churn_prediction_data(n_samples: int = 40000) -> pd.DataFrame:
    """Generate labeled churn prediction training data."""
    churn_rate = 0.22  # 22% annual churn (typical for African insurance)

    data = {
        "tenure_months": np.random.randint(1, 120, n_samples),
        "num_policies": np.random.randint(1, 6, n_samples),
        "monthly_premium": np.round(np.random.lognormal(9, 1, n_samples), 2),
        "total_premium_paid": np.round(np.random.lognormal(12, 1.5, n_samples), 2),
        "num_claims_filed": np.random.poisson(0.8, n_samples),
        "claims_approved_ratio": np.round(np.random.beta(4, 2, n_samples), 3),
        "last_interaction_days": np.random.exponential(60, n_samples).astype(int),
        "num_support_tickets": np.random.poisson(1.5, n_samples),
        "complaint_count": np.random.poisson(0.3, n_samples),
        "nps_score": np.random.randint(0, 11, n_samples),
        "has_mobile_app": np.random.binomial(1, 0.35, n_samples),
        "uses_digital_payment": np.random.binomial(1, 0.45, n_samples),
        "has_auto_renewal": np.random.binomial(1, 0.3, n_samples),
        "age": np.random.randint(18, 75, n_samples),
        "is_urban": np.random.binomial(1, 0.55, n_samples),
        "missed_payments_12m": np.random.poisson(0.8, n_samples),
        "product_diversity": np.random.randint(1, 5, n_samples),
        "referred_by_agent": np.random.binomial(1, 0.6, n_samples),
        "loyalty_points": np.random.exponential(2000, n_samples).astype(int),
        "family_policies": np.random.binomial(1, 0.25, n_samples),
    }

    df = pd.DataFrame(data)

    # Churn probability with realistic correlations
    churn_prob = np.zeros(n_samples)
    churn_prob += 0.15 * (df["tenure_months"] < 12).astype(float)
    churn_prob += 0.10 * (df["nps_score"] < 5).astype(float)
    churn_prob += 0.08 * (df["complaint_count"] > 2).astype(float)
    churn_prob += 0.12 * (df["missed_payments_12m"] > 2).astype(float)
    churn_prob += 0.05 * (df["last_interaction_days"] > 90).astype(float)
    churn_prob -= 0.08 * df["has_auto_renewal"]
    churn_prob -= 0.05 * df["family_policies"]
    churn_prob -= 0.03 * (df["product_diversity"] > 2).astype(float)
    churn_prob = np.clip(churn_prob + np.random.normal(0, 0.05, n_samples), 0, 1)

    df["churned"] = (churn_prob > np.percentile(churn_prob, 100 - churn_rate * 100)).astype(int)
    return df


def generate_anomaly_detection_data(n_samples: int = 20000) -> pd.DataFrame:
    """Generate anomaly detection training data for financial transactions."""
    anomaly_rate = 0.03  # 3% anomaly rate

    data = {
        "transaction_amount": np.round(np.random.lognormal(11, 1.5, n_samples), 2),
        "hour_of_day": np.random.randint(0, 24, n_samples),
        "day_of_week": np.random.randint(0, 7, n_samples),
        "transaction_count_24h": np.random.poisson(3, n_samples),
        "avg_transaction_amount_30d": np.round(np.random.lognormal(11, 1, n_samples), 2),
        "deviation_from_avg": np.zeros(n_samples),
        "unique_recipients_24h": np.random.poisson(1.5, n_samples),
        "is_new_recipient": np.random.binomial(1, 0.15, n_samples),
    }

    df = pd.DataFrame(data)
    df["deviation_from_avg"] = np.round(
        (df["transaction_amount"] - df["avg_transaction_amount_30d"]) / (df["avg_transaction_amount_30d"] + 1), 4
    )

    # Anomaly indicators
    anomaly_score = np.zeros(n_samples)
    anomaly_score += 0.3 * (df["deviation_from_avg"] > 3).astype(float)
    anomaly_score += 0.2 * (df["transaction_count_24h"] > 10).astype(float)
    anomaly_score += 0.15 * (df["unique_recipients_24h"] > 5).astype(float)
    anomaly_score += 0.1 * ((df["hour_of_day"] < 5) | (df["hour_of_day"] > 22)).astype(float)
    anomaly_score = np.clip(anomaly_score + np.random.normal(0, 0.05, n_samples), 0, 1)

    df["is_anomaly"] = (anomaly_score > np.percentile(anomaly_score, 100 - anomaly_rate * 100)).astype(int)
    return df


def generate_gnn_graph_data(n_customers: int = 5000, n_claims: int = 3000, n_policies: int = 8000) -> Dict:
    """Generate graph-structured data for GNN fraud detection."""
    # Node features
    customers = {
        "id": [f"C{i}" for i in range(n_customers)],
        "age": np.random.randint(18, 75, n_customers).tolist(),
        "state": [random.choice(NIGERIAN_STATES) for _ in range(n_customers)],
        "kyc_score": np.round(np.random.beta(5, 2, n_customers) * 100, 1).tolist(),
        "num_policies": np.random.randint(1, 6, n_customers).tolist(),
        "is_fraud": np.random.binomial(1, 0.06, n_customers).tolist(),
    }

    claims = {
        "id": [f"CLM{i}" for i in range(n_claims)],
        "amount": np.round(np.random.lognormal(12, 1.5, n_claims), 2).tolist(),
        "customer_idx": np.random.randint(0, n_customers, n_claims).tolist(),
        "policy_idx": np.random.randint(0, n_policies, n_claims).tolist(),
        "days_to_report": np.random.exponential(15, n_claims).astype(int).tolist(),
        "is_fraudulent": np.random.binomial(1, 0.08, n_claims).tolist(),
    }

    # Edges: customer -> claim, customer -> policy, claim -> policy
    edges = {
        "customer_claim": [(claims["customer_idx"][i], i) for i in range(n_claims)],
        "customer_policy": [(random.randint(0, n_customers - 1), i) for i in range(n_policies)],
        "shared_address": [(random.randint(0, n_customers - 1), random.randint(0, n_customers - 1)) for _ in range(int(n_customers * 0.1))],
        "shared_agent": [(random.randint(0, n_customers - 1), random.randint(0, n_customers - 1)) for _ in range(int(n_customers * 0.15))],
    }

    return {"customers": customers, "claims": claims, "edges": edges, "n_policies": n_policies}


def generate_all_datasets(output_dir: str = None):
    """Generate all training datasets."""
    if output_dir is None:
        output_dir = os.path.join(os.path.dirname(__file__), "..", "lakehouse_store", "training_data")
    os.makedirs(output_dir, exist_ok=True)

    print("Generating fraud detection dataset (50K samples)...")
    fraud_df = generate_fraud_detection_data(50000)
    fraud_df.to_parquet(os.path.join(output_dir, "fraud_detection_train.parquet"), index=False)
    fraud_df.to_csv(os.path.join(output_dir, "fraud_detection_train.csv"), index=False)
    print(f"  Fraud rate: {fraud_df['is_fraud'].mean():.3f}, Shape: {fraud_df.shape}")

    print("Generating claims adjudication dataset (30K samples)...")
    claims_df = generate_claims_adjudication_data(30000)
    claims_df.to_parquet(os.path.join(output_dir, "claims_adjudication_train.parquet"), index=False)
    claims_df.to_csv(os.path.join(output_dir, "claims_adjudication_train.csv"), index=False)
    print(f"  Decision dist: {dict(claims_df['decision'].value_counts().sort_index())}, Shape: {claims_df.shape}")

    print("Generating churn prediction dataset (40K samples)...")
    churn_df = generate_churn_prediction_data(40000)
    churn_df.to_parquet(os.path.join(output_dir, "churn_prediction_train.parquet"), index=False)
    churn_df.to_csv(os.path.join(output_dir, "churn_prediction_train.csv"), index=False)
    print(f"  Churn rate: {churn_df['churned'].mean():.3f}, Shape: {churn_df.shape}")

    print("Generating anomaly detection dataset (20K samples)...")
    anomaly_df = generate_anomaly_detection_data(20000)
    anomaly_df.to_parquet(os.path.join(output_dir, "anomaly_detection_train.parquet"), index=False)
    anomaly_df.to_csv(os.path.join(output_dir, "anomaly_detection_train.csv"), index=False)
    print(f"  Anomaly rate: {anomaly_df['is_anomaly'].mean():.3f}, Shape: {anomaly_df.shape}")

    print("Generating GNN graph data (5K customers, 3K claims, 8K policies)...")
    graph_data = generate_gnn_graph_data()
    with open(os.path.join(output_dir, "gnn_graph_data.json"), "w") as f:
        json.dump(graph_data, f)
    print(f"  Nodes: {len(graph_data['customers']['id'])} customers, {len(graph_data['claims']['id'])} claims")

    # Generate metadata
    metadata = {
        "generated_at": datetime.now().isoformat(),
        "datasets": {
            "fraud_detection": {"samples": len(fraud_df), "features": len(fraud_df.columns) - 1, "fraud_rate": float(fraud_df["is_fraud"].mean())},
            "claims_adjudication": {"samples": len(claims_df), "features": len(claims_df.columns) - 1, "classes": 4},
            "churn_prediction": {"samples": len(churn_df), "features": len(churn_df.columns) - 1, "churn_rate": float(churn_df["churned"].mean())},
            "anomaly_detection": {"samples": len(anomaly_df), "features": len(anomaly_df.columns) - 1, "anomaly_rate": float(anomaly_df["is_anomaly"].mean())},
            "gnn_graph": {"customers": len(graph_data["customers"]["id"]), "claims": len(graph_data["claims"]["id"]), "policies": graph_data["n_policies"]},
        },
    }
    with open(os.path.join(output_dir, "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"\nAll datasets saved to {output_dir}")
    return metadata


if __name__ == "__main__":
    generate_all_datasets()
