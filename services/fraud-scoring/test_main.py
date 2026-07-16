"""
Unit tests for the fraud scoring service.
Run with: pytest test_main.py -v
"""
import pytest
import json
from unittest.mock import patch, MagicMock, AsyncMock
from datetime import datetime, timezone


# ─── Feature Extraction Tests ─────────────────────────────────────────────────

class TestFeatureExtraction:
    """Tests for the transaction feature extraction pipeline."""

    def test_extract_basic_features(self):
        """Feature extractor should return all required fields."""
        from main import extract_features

        transaction = {
            "id": "txn-001",
            "userId": "user-123",
            "amount": 50000,
            "currency": "NGN",
            "type": "transfer",
            "createdAt": int(datetime.now(timezone.utc).timestamp()),
        }

        features = extract_features(transaction)
        assert features is not None
        assert "amount" in features
        assert "hour_of_day" in features
        assert "day_of_week" in features

    def test_extract_features_high_amount(self):
        """High-amount transactions should have elevated risk signal."""
        from main import extract_features

        low_txn = {"id": "t1", "userId": "u1", "amount": 1000, "currency": "NGN",
                   "type": "transfer", "createdAt": int(datetime.now(timezone.utc).timestamp())}
        high_txn = {"id": "t2", "userId": "u1", "amount": 10_000_000, "currency": "NGN",
                    "type": "transfer", "createdAt": int(datetime.now(timezone.utc).timestamp())}

        low_features = extract_features(low_txn)
        high_features = extract_features(high_txn)

        assert high_features["amount"] > low_features["amount"]

    def test_extract_features_night_transaction(self):
        """Night-time transactions (2-4 AM) should be flagged."""
        from main import extract_features
        import datetime as dt

        # Create a timestamp for 3 AM
        night_ts = dt.datetime(2024, 1, 15, 3, 0, 0, tzinfo=dt.timezone.utc).timestamp()
        txn = {"id": "t1", "userId": "u1", "amount": 5000, "currency": "NGN",
               "type": "transfer", "createdAt": int(night_ts)}

        features = extract_features(txn)
        assert features["hour_of_day"] == 3


# ─── Rule Engine Tests ────────────────────────────────────────────────────────

class TestRuleEngine:
    """Tests for the rule-based fraud detection engine."""

    def test_velocity_rule_triggers(self):
        """Velocity rule should trigger for high transaction counts."""
        from main import apply_rules

        context = {
            "transaction_count_1h": 25,  # above threshold
            "transaction_count_24h": 50,
            "amount": 5000,
            "is_new_recipient": False,
            "country_mismatch": False,
        }

        alerts = apply_rules(context)
        velocity_alerts = [a for a in alerts if "velocity" in a.get("rule", "").lower()]
        assert len(velocity_alerts) > 0

    def test_high_amount_rule_triggers(self):
        """High-amount rule should trigger above threshold."""
        from main import apply_rules

        context = {
            "transaction_count_1h": 1,
            "transaction_count_24h": 3,
            "amount": 5_000_000,  # 5M NGN — above threshold
            "is_new_recipient": False,
            "country_mismatch": False,
        }

        alerts = apply_rules(context)
        amount_alerts = [a for a in alerts if "amount" in a.get("rule", "").lower()]
        assert len(amount_alerts) > 0

    def test_no_alerts_for_normal_transaction(self):
        """Normal transaction should not trigger any rules."""
        from main import apply_rules

        context = {
            "transaction_count_1h": 2,
            "transaction_count_24h": 5,
            "amount": 10000,
            "is_new_recipient": False,
            "country_mismatch": False,
        }

        alerts = apply_rules(context)
        assert len(alerts) == 0

    def test_country_mismatch_rule(self):
        """Country mismatch should trigger a rule."""
        from main import apply_rules

        context = {
            "transaction_count_1h": 1,
            "transaction_count_24h": 2,
            "amount": 5000,
            "is_new_recipient": True,
            "country_mismatch": True,  # unusual country
        }

        alerts = apply_rules(context)
        assert len(alerts) > 0


# ─── Score Calculation Tests ──────────────────────────────────────────────────

class TestScoreCalculation:
    """Tests for the fraud score calculation logic."""

    def test_score_range(self):
        """Fraud score should always be between 0 and 1."""
        from main import calculate_fraud_score

        test_cases = [
            {"rule_alerts": [], "ml_score": 0.1},
            {"rule_alerts": [{"severity": "HIGH"}], "ml_score": 0.8},
            {"rule_alerts": [{"severity": "CRITICAL"}, {"severity": "HIGH"}], "ml_score": 0.95},
        ]

        for case in test_cases:
            score = calculate_fraud_score(case["rule_alerts"], case["ml_score"])
            assert 0.0 <= score <= 1.0, f"Score {score} out of range for case {case}"

    def test_high_alerts_increase_score(self):
        """More severe alerts should produce higher scores."""
        from main import calculate_fraud_score

        low_score = calculate_fraud_score([], 0.1)
        high_score = calculate_fraud_score(
            [{"severity": "CRITICAL"}, {"severity": "HIGH"}], 0.9
        )
        assert high_score > low_score

    def test_zero_score_for_clean_transaction(self):
        """Clean transaction with no alerts and low ML score should have low fraud score."""
        from main import calculate_fraud_score

        score = calculate_fraud_score([], 0.05)
        assert score < 0.3, f"Expected low score for clean transaction, got {score}"


# ─── API Endpoint Tests ───────────────────────────────────────────────────────

class TestAPIEndpoints:
    """Tests for the HTTP API endpoints."""

    @pytest.fixture
    def client(self):
        """Create a test client for the FastAPI app."""
        from main import app
        from fastapi.testclient import TestClient
        return TestClient(app)

    def test_health_endpoint(self, client):
        """Health endpoint should return 200."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data

    def test_score_endpoint_validation(self, client):
        """Score endpoint should validate required fields."""
        response = client.post("/score", json={})
        assert response.status_code == 422  # Unprocessable Entity

    def test_score_endpoint_with_valid_data(self, client):
        """Score endpoint should return a valid fraud score."""
        payload = {
            "transaction_id": "txn-test-001",
            "user_id": "user-123",
            "amount": 5000,
            "currency": "NGN",
            "transaction_type": "transfer",
            "timestamp": int(datetime.now(timezone.utc).timestamp()),
        }

        with patch("main.get_user_context", return_value={
            "transaction_count_1h": 2,
            "transaction_count_24h": 5,
            "avg_transaction_amount": 8000,
            "is_new_recipient": False,
            "country_mismatch": False,
        }):
            response = client.post("/score", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert "fraud_score" in data
        assert "risk_level" in data
        assert 0.0 <= data["fraud_score"] <= 1.0
        assert data["risk_level"] in ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

    def test_metrics_endpoint(self, client):
        """Metrics endpoint should return Prometheus format."""
        response = client.get("/metrics")
        assert response.status_code == 200


# ─── Risk Level Classification Tests ─────────────────────────────────────────

class TestRiskClassification:
    """Tests for risk level classification."""

    def test_low_risk_classification(self):
        """Score < 0.3 should be LOW risk."""
        from main import classify_risk_level
        assert classify_risk_level(0.1) == "LOW"
        assert classify_risk_level(0.29) == "LOW"

    def test_medium_risk_classification(self):
        """Score 0.3-0.6 should be MEDIUM risk."""
        from main import classify_risk_level
        assert classify_risk_level(0.3) == "MEDIUM"
        assert classify_risk_level(0.59) == "MEDIUM"

    def test_high_risk_classification(self):
        """Score 0.6-0.8 should be HIGH risk."""
        from main import classify_risk_level
        assert classify_risk_level(0.6) == "HIGH"
        assert classify_risk_level(0.79) == "HIGH"

    def test_critical_risk_classification(self):
        """Score >= 0.8 should be CRITICAL risk."""
        from main import classify_risk_level
        assert classify_risk_level(0.8) == "CRITICAL"
        assert classify_risk_level(1.0) == "CRITICAL"


# ─── Model Loading Tests ──────────────────────────────────────────────────────

class TestModelLoading:
    """Tests for ML model loading and fallback behavior."""

    def test_fallback_to_rule_engine_when_no_model(self):
        """Should fall back to rule engine when ML model is not available."""
        from main import score_transaction_fallback

        transaction = {
            "transaction_id": "txn-001",
            "user_id": "user-123",
            "amount": 5000,
            "currency": "NGN",
            "transaction_type": "transfer",
            "timestamp": int(datetime.now(timezone.utc).timestamp()),
        }

        context = {
            "transaction_count_1h": 2,
            "transaction_count_24h": 5,
            "is_new_recipient": False,
            "country_mismatch": False,
        }

        result = score_transaction_fallback(transaction, context)
        assert "fraud_score" in result
        assert "risk_level" in result
        assert result["model_used"] == "rule_engine"
