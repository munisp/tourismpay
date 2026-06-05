"""
Unleash Feature Flags — Shared Integration Module
Used by all Python microservices in the Insurance Platform
Provides: flag evaluation, gradual rollouts, A/B testing, kill switches
"""

from __future__ import annotations

import logging
import os
from enum import Enum
from functools import wraps
from typing import Any, Callable, Dict, Optional

from UnleashClient import UnleashClient
from UnleashClient.strategies import Strategy

logger = logging.getLogger(__name__)

# ============================================================
# Feature Flag Definitions
# All platform feature flags are defined here as constants
# ============================================================
class FeatureFlag(str, Enum):
    # ---- Claims ----
    CLAIMS_AI_FRAUD_DETECTION = "claims.ai-fraud-detection"
    CLAIMS_AUTO_APPROVAL = "claims.auto-approval"
    CLAIMS_DOCUMENT_OCR = "claims.document-ocr"
    CLAIMS_REAL_TIME_STATUS = "claims.real-time-status"
    CLAIMS_BLOCKCHAIN_AUDIT = "claims.blockchain-audit"

    # ---- Underwriting ----
    UNDERWRITING_ML_RISK_SCORING = "underwriting.ml-risk-scoring"
    UNDERWRITING_REAL_TIME_PRICING = "underwriting.real-time-pricing"
    UNDERWRITING_EXTERNAL_DATA_ENRICHMENT = "underwriting.external-data-enrichment"
    UNDERWRITING_PARAMETRIC_TRIGGERS = "underwriting.parametric-triggers"

    # ---- Payments ----
    PAYMENTS_MOBILE_MONEY = "payments.mobile-money"
    PAYMENTS_CRYPTO = "payments.crypto"
    PAYMENTS_BNPL = "payments.buy-now-pay-later"
    PAYMENTS_INSTANT_SETTLEMENT = "payments.instant-settlement"
    PAYMENTS_MULTI_CURRENCY = "payments.multi-currency"

    # ---- Customer Experience ----
    CUSTOMER_AI_CHATBOT = "customer.ai-chatbot"
    CUSTOMER_SELF_SERVICE_PORTAL = "customer.self-service-portal"
    CUSTOMER_POLICY_COMPARISON = "customer.policy-comparison"
    CUSTOMER_DIGITAL_ONBOARDING = "customer.digital-onboarding"
    CUSTOMER_BIOMETRIC_AUTH = "customer.biometric-auth"

    # ---- Analytics ----
    ANALYTICS_REAL_TIME_DASHBOARD = "analytics.real-time-dashboard"
    ANALYTICS_PREDICTIVE_CHURN = "analytics.predictive-churn"
    ANALYTICS_LOSS_RATIO_ALERTS = "analytics.loss-ratio-alerts"
    ANALYTICS_GEOSPATIAL = "analytics.geospatial"

    # ---- Reinsurance ----
    REINSURANCE_AUTO_CESSION = "reinsurance.auto-cession"
    REINSURANCE_DIGITAL_TREATIES = "reinsurance.digital-treaties"
    REINSURANCE_REAL_TIME_REPORTING = "reinsurance.real-time-reporting"

    # ---- Infrastructure ----
    INFRA_CIRCUIT_BREAKER_AGGRESSIVE = "infra.circuit-breaker-aggressive"
    INFRA_RATE_LIMITING_STRICT = "infra.rate-limiting-strict"
    INFRA_MAINTENANCE_MODE = "infra.maintenance-mode"
    INFRA_READ_ONLY_MODE = "infra.read-only-mode"
    INFRA_DARK_LAUNCH_V2_API = "infra.dark-launch-v2-api"

    # ---- Compliance ----
    COMPLIANCE_GDPR_STRICT_MODE = "compliance.gdpr-strict-mode"
    COMPLIANCE_NDPR_ENFORCEMENT = "compliance.ndpr-enforcement"
    COMPLIANCE_AUDIT_ALL_READS = "compliance.audit-all-reads"
    COMPLIANCE_PII_MASKING_ENHANCED = "compliance.pii-masking-enhanced"

    # ---- Mobile ----
    MOBILE_BIOMETRIC_CLAIM_SUBMISSION = "mobile.biometric-claim-submission"
    MOBILE_OFFLINE_MODE = "mobile.offline-mode"
    MOBILE_PUSH_NOTIFICATIONS_V2 = "mobile.push-notifications-v2"
    MOBILE_AR_DAMAGE_ASSESSMENT = "mobile.ar-damage-assessment"


# ============================================================
# Custom Strategies
# ============================================================
class InsuranceRegionStrategy(Strategy):
    """Enable flag only for specific insurance regions."""

    name = "insuranceRegion"

    def load_provisioning(self) -> list:
        return [self.parameters.get("regions", "").split(",")]

    def apply(self, parameters: dict, context: Optional[dict] = None) -> bool:
        if not context:
            return False
        allowed_regions = [r.strip() for r in parameters.get("regions", "").split(",")]
        user_region = context.get("properties", {}).get("region", "")
        return user_region in allowed_regions


class InsurancePlanStrategy(Strategy):
    """Enable flag only for specific insurance plan tiers."""

    name = "insurancePlan"

    def load_provisioning(self) -> list:
        return [self.parameters.get("plans", "").split(",")]

    def apply(self, parameters: dict, context: Optional[dict] = None) -> bool:
        if not context:
            return False
        allowed_plans = [p.strip() for p in parameters.get("plans", "").split(",")]
        user_plan = context.get("properties", {}).get("plan_tier", "basic")
        return user_plan in allowed_plans


class InsurancePolicyTypeStrategy(Strategy):
    """Enable flag only for specific policy types."""

    name = "insurancePolicyType"

    def load_provisioning(self) -> list:
        return [self.parameters.get("policyTypes", "").split(",")]

    def apply(self, parameters: dict, context: Optional[dict] = None) -> bool:
        if not context:
            return False
        allowed_types = [t.strip() for t in parameters.get("policyTypes", "").split(",")]
        policy_type = context.get("properties", {}).get("policy_type", "")
        return policy_type in allowed_types


# ============================================================
# Unleash Client Singleton
# ============================================================
_client: Optional[UnleashClient] = None


def get_unleash_client() -> UnleashClient:
    global _client
    if _client is None:
        _client = UnleashClient(
            url=os.getenv(
                "UNLEASH_URL",
                "http://unleash-edge.unleash.svc.cluster.local:3063/api",
            ),
            app_name=os.getenv("SERVICE_NAME", "insurance-service"),
            instance_id=os.getenv("POD_NAME", "unknown"),
            environment=os.getenv("ENVIRONMENT", "production"),
            custom_headers={
                "Authorization": os.getenv("UNLEASH_API_TOKEN", ""),
            },
            custom_strategies=[
                InsuranceRegionStrategy,
                InsurancePlanStrategy,
                InsurancePolicyTypeStrategy,
            ],
            cache_directory="/tmp/unleash_cache",
            verbose_log_level=logging.WARNING,
        )
        _client.initialize_client()
        logger.info("Unleash client initialized")
    return _client


# ============================================================
# Feature Flag Evaluation
# ============================================================
def is_enabled(
    flag: FeatureFlag,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    properties: Optional[Dict[str, str]] = None,
    fallback: bool = False,
) -> bool:
    """
    Evaluate a feature flag with optional context.

    Args:
        flag: The feature flag to evaluate
        user_id: The user ID for user-based rollouts
        session_id: The session ID for session-based rollouts
        properties: Additional context properties (region, plan_tier, etc.)
        fallback: Default value if Unleash is unavailable

    Returns:
        bool: Whether the feature is enabled
    """
    try:
        client = get_unleash_client()
        context: Dict[str, Any] = {}

        if user_id:
            context["userId"] = user_id
        if session_id:
            context["sessionId"] = session_id
        if properties:
            context["properties"] = properties

        return client.is_enabled(flag.value, context, fallback_function=lambda: fallback)
    except Exception as e:
        logger.warning(f"Feature flag evaluation failed for {flag}: {e}. Using fallback={fallback}")
        return fallback


def get_variant(
    flag: FeatureFlag,
    user_id: Optional[str] = None,
    properties: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    Get a feature flag variant for A/B testing.

    Returns:
        dict with keys: name, enabled, payload
    """
    try:
        client = get_unleash_client()
        context: Dict[str, Any] = {}
        if user_id:
            context["userId"] = user_id
        if properties:
            context["properties"] = properties

        variant = client.get_variant(flag.value, context)
        return {
            "name": variant.get("name", "disabled"),
            "enabled": variant.get("enabled", False),
            "payload": variant.get("payload", {}),
        }
    except Exception as e:
        logger.warning(f"Variant evaluation failed for {flag}: {e}")
        return {"name": "disabled", "enabled": False, "payload": {}}


# ============================================================
# Decorators
# ============================================================
def feature_flag(
    flag: FeatureFlag,
    fallback: bool = False,
    user_id_param: Optional[str] = None,
):
    """
    Decorator to conditionally execute a function based on a feature flag.

    Usage:
        @feature_flag(FeatureFlag.CLAIMS_AI_FRAUD_DETECTION)
        async def detect_fraud(claim_id: str, user_id: str):
            ...
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            uid = kwargs.get(user_id_param) if user_id_param else None
            if is_enabled(flag, user_id=uid, fallback=fallback):
                return await func(*args, **kwargs)
            logger.debug(f"Feature {flag} is disabled, skipping {func.__name__}")
            return None

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            uid = kwargs.get(user_id_param) if user_id_param else None
            if is_enabled(flag, user_id=uid, fallback=fallback):
                return func(*args, **kwargs)
            logger.debug(f"Feature {flag} is disabled, skipping {func.__name__}")
            return None

        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator


def kill_switch(flag: FeatureFlag):
    """
    Decorator for kill switch pattern — disables function when flag is ON.
    Use for emergency shutdown of problematic features.

    Usage:
        @kill_switch(FeatureFlag.INFRA_MAINTENANCE_MODE)
        async def process_payment(payment_data: dict):
            ...
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            if is_enabled(flag, fallback=False):
                raise RuntimeError(
                    f"Feature {flag} kill switch is active. Operation disabled."
                )
            return await func(*args, **kwargs)

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            if is_enabled(flag, fallback=False):
                raise RuntimeError(
                    f"Feature {flag} kill switch is active. Operation disabled."
                )
            return func(*args, **kwargs)

        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator


# ============================================================
# FastAPI Dependency
# ============================================================
def get_feature_flags_for_user(user_id: str, properties: Optional[Dict] = None) -> Dict[str, bool]:
    """
    Get all relevant feature flags for a specific user.
    Used in API responses to inform frontend of enabled features.
    """
    flags_to_check = [
        FeatureFlag.CLAIMS_AI_FRAUD_DETECTION,
        FeatureFlag.CLAIMS_AUTO_APPROVAL,
        FeatureFlag.CLAIMS_DOCUMENT_OCR,
        FeatureFlag.PAYMENTS_MOBILE_MONEY,
        FeatureFlag.PAYMENTS_CRYPTO,
        FeatureFlag.PAYMENTS_BNPL,
        FeatureFlag.CUSTOMER_AI_CHATBOT,
        FeatureFlag.CUSTOMER_POLICY_COMPARISON,
        FeatureFlag.CUSTOMER_DIGITAL_ONBOARDING,
        FeatureFlag.CUSTOMER_BIOMETRIC_AUTH,
        FeatureFlag.ANALYTICS_REAL_TIME_DASHBOARD,
        FeatureFlag.MOBILE_BIOMETRIC_CLAIM_SUBMISSION,
        FeatureFlag.MOBILE_OFFLINE_MODE,
        FeatureFlag.MOBILE_AR_DAMAGE_ASSESSMENT,
    ]

    return {
        flag.value: is_enabled(flag, user_id=user_id, properties=properties)
        for flag in flags_to_check
    }
