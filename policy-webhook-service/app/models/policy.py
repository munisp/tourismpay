"""
Pydantic models for policy issuance webhook requests and responses.
"""
from datetime import datetime
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field, validator


class PolicyType(str, Enum):
    """Policy type enumeration."""
    LIFE = "LIFE"
    MOTOR = "MOTOR"
    HEALTH = "HEALTH"
    PROPERTY = "PROPERTY"
    TRAVEL = "TRAVEL"


class PremiumFrequency(str, Enum):
    """Premium payment frequency enumeration."""
    MONTHLY = "MONTHLY"
    QUARTERLY = "QUARTERLY"
    SEMI_ANNUALLY = "SEMI_ANNUALLY"
    ANNUALLY = "ANNUALLY"


class PaymentMethod(str, Enum):
    """Payment method enumeration."""
    CARD = "CARD"
    BANK_TRANSFER = "BANK_TRANSFER"
    MOBILE_MONEY = "MOBILE_MONEY"
    USSD = "USSD"
    WALLET = "WALLET"


class PolicyIssuanceWebhookRequest(BaseModel):
    """
    Webhook request model for policy issuance.
    This is received from external systems (e.g., mobile app, web portal).
    """
    customer_id: str = Field(..., description="Customer ID (NIN or unique identifier)")
    policy_type: PolicyType = Field(..., description="Type of insurance policy")
    sum_assured: float = Field(..., gt=0, description="Sum assured amount in NGN")
    premium_frequency: PremiumFrequency = Field(..., description="Premium payment frequency")
    duration_months: int = Field(..., gt=0, le=360, description="Policy duration in months")
    start_date: Optional[datetime] = Field(None, description="Policy start date (defaults to now)")
    payment_method: PaymentMethod = Field(..., description="Payment method")
    
    # Optional metadata
    source: Optional[str] = Field(None, description="Source system (e.g., 'mobile_app', 'web_portal')")
    agent_id: Optional[str] = Field(None, description="Agent ID if policy sold by agent")
    callback_url: Optional[str] = Field(None, description="Callback URL for status updates")
    idempotency_key: Optional[str] = Field(None, description="Idempotency key for duplicate prevention")

    @validator('start_date', pre=True, always=True)
    def set_start_date(cls, v):
        """Set start date to now if not provided."""
        return v or datetime.utcnow()

    @validator('sum_assured')
    def validate_sum_assured(cls, v, values):
        """Validate sum assured based on policy type."""
        policy_type = values.get('policy_type')
        
        # Minimum sum assured by policy type
        min_amounts = {
            PolicyType.LIFE: 100000.0,      # 100k NGN
            PolicyType.MOTOR: 50000.0,      # 50k NGN
            PolicyType.HEALTH: 50000.0,     # 50k NGN
            PolicyType.PROPERTY: 200000.0,  # 200k NGN
            PolicyType.TRAVEL: 25000.0,     # 25k NGN
        }
        
        min_amount = min_amounts.get(policy_type, 10000.0)
        if v < min_amount:
            raise ValueError(f"Sum assured for {policy_type} must be at least {min_amount} NGN")
        
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "customer_id": "12345678901",
                "policy_type": "LIFE",
                "sum_assured": 1000000.0,
                "premium_frequency": "MONTHLY",
                "duration_months": 12,
                "start_date": "2026-01-28T10:00:00Z",
                "payment_method": "CARD",
                "source": "mobile_app",
                "agent_id": "AGT-001",
                "callback_url": "https://api.example.com/callbacks/policy-status",
                "idempotency_key": "unique-request-id-123"
            }
        }


class PolicyIssuanceWebhookResponse(BaseModel):
    """
    Webhook response model for policy issuance.
    Returned immediately after workflow is started.
    """
    success: bool = Field(..., description="Whether workflow was started successfully")
    workflow_id: str = Field(..., description="Temporal workflow ID for tracking")
    run_id: str = Field(..., description="Temporal workflow run ID")
    message: str = Field(..., description="Human-readable message")
    estimated_completion_time: Optional[datetime] = Field(None, description="Estimated completion time")
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "workflow_id": "policy-issuance-12345678901-1706437200",
                "run_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "message": "Policy issuance workflow started successfully",
                "estimated_completion_time": "2026-01-28T10:02:00Z"
            }
        }


class WorkflowStatusRequest(BaseModel):
    """Request model for querying workflow status."""
    workflow_id: str = Field(..., description="Temporal workflow ID")


class WorkflowStatusResponse(BaseModel):
    """Response model for workflow status query."""
    workflow_id: str = Field(..., description="Temporal workflow ID")
    status: str = Field(..., description="Workflow status (RUNNING, COMPLETED, FAILED, etc.)")
    result: Optional[dict] = Field(None, description="Workflow result if completed")
    error: Optional[str] = Field(None, description="Error message if failed")
    started_at: Optional[datetime] = Field(None, description="Workflow start time")
    completed_at: Optional[datetime] = Field(None, description="Workflow completion time")


class PolicyIssuanceResult(BaseModel):
    """
    Policy issuance workflow result.
    This matches the Go workflow result structure.
    """
    success: bool
    policy_id: Optional[str] = None
    policy_number: Optional[str] = None
    transaction_id: Optional[str] = None
    payment_id: Optional[int] = None
    document_url: Optional[str] = None
    premium: Optional[float] = None
    risk_score: Optional[float] = None
    completed_steps: Optional[List[str]] = None
    completed_at: Optional[datetime] = None
    failure_reason: Optional[str] = None
    failure_step: Optional[str] = None


class ErrorResponse(BaseModel):
    """Standard error response model."""
    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Error message")
    details: Optional[dict] = Field(None, description="Additional error details")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Error timestamp")
    
    class Config:
        json_schema_extra = {
            "example": {
                "error": "VALIDATION_ERROR",
                "message": "Invalid policy issuance request",
                "details": {
                    "field": "sum_assured",
                    "reason": "Sum assured must be positive"
                },
                "timestamp": "2026-01-28T10:00:00Z"
            }
        }


class HealthCheckResponse(BaseModel):
    """Health check response model."""
    status: str = Field(..., description="Service status")
    temporal_connected: bool = Field(..., description="Temporal connection status")
    dapr_connected: bool = Field(..., description="Dapr connection status")
    version: str = Field(..., description="Service version")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
