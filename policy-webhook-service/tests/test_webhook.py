"""
Tests for webhook endpoints.
"""
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

from app.main import create_app
from app.models.policy import (
    PolicyType,
    PremiumFrequency,
    PaymentMethod,
)


@pytest.fixture
def app():
    """Create test app."""
    config = {
        "temporal_address": "localhost:7233",
        "temporal_namespace": "test",
        "dapr_grpc_port": 50001,
    }
    return create_app(config)


@pytest.fixture
def client(app):
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def mock_temporal_client():
    """Mock Temporal client."""
    mock = AsyncMock()
    mock.start_policy_issuance_workflow.return_value = {
        "workflow_id": "policy-issuance-test-123",
        "run_id": "run-123",
        "started_at": datetime.utcnow(),
        "estimated_completion_time": datetime.utcnow(),
    }
    mock.get_workflow_status.return_value = {
        "workflow_id": "policy-issuance-test-123",
        "status": "RUNNING",
        "started_at": datetime.utcnow(),
    }
    mock.health_check.return_value = True
    return mock


@pytest.fixture
def mock_dapr_service():
    """Mock Dapr service."""
    mock = AsyncMock()
    mock.health_check.return_value = True
    return mock


class TestPolicyIssuanceWebhook:
    """Tests for policy issuance webhook endpoint."""

    def test_policy_issuance_success(self, client, mock_temporal_client, mock_dapr_service):
        """Test successful policy issuance workflow start."""
        with patch("app.main.temporal_client", mock_temporal_client), \
             patch("app.main.dapr_service", mock_dapr_service):
            
            request_data = {
                "customer_id": "12345678901",
                "policy_type": "LIFE",
                "sum_assured": 1000000.0,
                "premium_frequency": "MONTHLY",
                "duration_months": 12,
                "start_date": "2026-01-28T10:00:00Z",
                "payment_method": "CARD",
                "source": "mobile_app",
            }

            response = client.post("/api/v1/webhooks/policy-issuance", json=request_data)

            assert response.status_code == 202
            data = response.json()
            assert data["success"] is True
            assert "workflow_id" in data
            assert "run_id" in data
            assert "policy-issuance" in data["workflow_id"]

    def test_policy_issuance_invalid_sum_assured(self, client):
        """Test policy issuance with invalid sum assured."""
        request_data = {
            "customer_id": "12345678901",
            "policy_type": "LIFE",
            "sum_assured": 50000.0,  # Too low for LIFE policy
            "premium_frequency": "MONTHLY",
            "duration_months": 12,
            "payment_method": "CARD",
        }

        response = client.post("/api/v1/webhooks/policy-issuance", json=request_data)

        assert response.status_code == 422  # Validation error

    def test_policy_issuance_missing_fields(self, client):
        """Test policy issuance with missing required fields."""
        request_data = {
            "customer_id": "12345678901",
            "policy_type": "LIFE",
            # Missing sum_assured, premium_frequency, etc.
        }

        response = client.post("/api/v1/webhooks/policy-issuance", json=request_data)

        assert response.status_code == 422  # Validation error

    def test_policy_issuance_with_idempotency_key(self, client, mock_temporal_client, mock_dapr_service):
        """Test policy issuance with idempotency key."""
        with patch("app.main.temporal_client", mock_temporal_client), \
             patch("app.main.dapr_service", mock_dapr_service):
            
            request_data = {
                "customer_id": "12345678901",
                "policy_type": "MOTOR",
                "sum_assured": 500000.0,
                "premium_frequency": "MONTHLY",
                "duration_months": 12,
                "payment_method": "CARD",
                "idempotency_key": "unique-key-123",
            }

            response = client.post("/api/v1/webhooks/policy-issuance", json=request_data)

            assert response.status_code == 202
            data = response.json()
            assert "unique-key-123" in data["workflow_id"]


class TestWorkflowStatus:
    """Tests for workflow status endpoint."""

    def test_query_workflow_status_running(self, client, mock_temporal_client, mock_dapr_service):
        """Test querying status of running workflow."""
        with patch("app.main.temporal_client", mock_temporal_client), \
             patch("app.main.dapr_service", mock_dapr_service):
            
            request_data = {
                "workflow_id": "policy-issuance-test-123",
            }

            response = client.post("/api/v1/webhooks/policy-issuance/status", json=request_data)

            assert response.status_code == 200
            data = response.json()
            assert data["workflow_id"] == "policy-issuance-test-123"
            assert data["status"] == "RUNNING"

    def test_query_workflow_status_completed(self, client, mock_temporal_client, mock_dapr_service):
        """Test querying status of completed workflow."""
        mock_temporal_client.get_workflow_status.return_value = {
            "workflow_id": "policy-issuance-test-123",
            "status": "COMPLETED",
            "result": {
                "success": True,
                "policy_id": "policy-123",
                "transaction_id": "txn-123",
            },
            "started_at": datetime.utcnow(),
            "completed_at": datetime.utcnow(),
        }

        with patch("app.main.temporal_client", mock_temporal_client), \
             patch("app.main.dapr_service", mock_dapr_service):
            
            request_data = {
                "workflow_id": "policy-issuance-test-123",
            }

            response = client.post("/api/v1/webhooks/policy-issuance/status", json=request_data)

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "COMPLETED"
            assert data["result"]["success"] is True


class TestHealthCheck:
    """Tests for health check endpoint."""

    def test_health_check_healthy(self, client, mock_temporal_client, mock_dapr_service):
        """Test health check when all services are healthy."""
        with patch("app.main.temporal_client", mock_temporal_client), \
             patch("app.main.dapr_service", mock_dapr_service):
            
            response = client.get("/health")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"
            assert data["temporal_connected"] is True
            assert data["dapr_connected"] is True

    def test_health_check_degraded(self, client, mock_temporal_client, mock_dapr_service):
        """Test health check when Temporal is down."""
        mock_temporal_client.health_check.return_value = False

        with patch("app.main.temporal_client", mock_temporal_client), \
             patch("app.main.dapr_service", mock_dapr_service):
            
            response = client.get("/health")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "degraded"
            assert data["temporal_connected"] is False


class TestRootEndpoint:
    """Tests for root endpoint."""

    def test_root_endpoint(self, client):
        """Test root endpoint returns service information."""
        response = client.get("/")

        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "Policy Webhook Service"
        assert "version" in data
        assert "endpoints" in data
