"""
Neo4j-GNN Integration with Claims and Underwriting Workflows

This module integrates the Neo4j-GNN fraud detection system with the platform's
claims processing and underwriting workflows via Temporal.
"""

import os
import json
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import Neo4j-GNN integration
from neo4j_gnn_integration import (
    Neo4jGNNIntegration,
    Neo4jConfig,
    GNNPredictionResult,
    FraudRingResult,
)


class RiskDecision(Enum):
    """Risk decision outcomes"""
    AUTO_APPROVE = "auto_approve"
    MANUAL_REVIEW = "manual_review"
    ESCALATE_SIU = "escalate_siu"  # Special Investigation Unit
    AUTO_DECLINE = "auto_decline"


class UnderwritingDecision(Enum):
    """Underwriting decision outcomes"""
    STANDARD_RATE = "standard_rate"
    SUBSTANDARD_RATE = "substandard_rate"
    DECLINE = "decline"
    REFER_TO_UNDERWRITER = "refer_to_underwriter"


@dataclass
class ClaimFraudAssessment:
    """Fraud assessment result for a claim"""
    claim_id: str
    customer_id: str
    policy_id: str
    gnn_fraud_probability: float
    gnn_fraud_class: int
    network_risk_score: float
    fraud_ring_detected: bool
    fraud_ring_id: Optional[str]
    contributing_factors: List[str]
    connected_suspicious_entities: List[str]
    risk_decision: RiskDecision
    recommended_action: str
    assessment_timestamp: str


@dataclass
class UnderwritingRiskAssessment:
    """Risk assessment result for underwriting"""
    application_id: str
    customer_id: str
    product_type: str
    gnn_fraud_probability: float
    network_risk_score: float
    connected_high_risk_count: int
    historical_claim_ratio: float
    underwriting_decision: UnderwritingDecision
    premium_adjustment_factor: float
    risk_factors: List[str]
    assessment_timestamp: str


class ClaimsGNNIntegration:
    """
    Integrates GNN fraud detection with claims processing workflow.
    
    This service is called during claims adjudication to:
    1. Assess fraud probability using GNN
    2. Check for fraud ring involvement
    3. Analyze network connections
    4. Make routing decisions (auto-approve, manual review, SIU)
    """

    def __init__(self, neo4j_gnn: Neo4jGNNIntegration = None):
        self.neo4j_gnn = neo4j_gnn or Neo4jGNNIntegration()
        
        # Thresholds for decision making
        self.auto_approve_threshold = 0.2  # Below this = auto approve
        self.manual_review_threshold = 0.5  # Between auto_approve and this = manual review
        self.siu_threshold = 0.7  # Above this = escalate to SIU

    def assess_claim_fraud(
        self,
        claim_id: str,
        customer_id: str,
        policy_id: str,
        claim_amount: float,
        claim_type: str,
    ) -> ClaimFraudAssessment:
        """
        Assess fraud risk for a claim using GNN.
        
        Called by Temporal workflow during claims processing.
        """
        logger.info(f"Assessing fraud for claim {claim_id}")
        
        # Get GNN prediction for customer
        predictions = self.neo4j_gnn.predict_fraud([customer_id])
        gnn_prediction = predictions[0] if predictions else None
        
        # Get entity fraud context (includes network analysis)
        fraud_context = self.neo4j_gnn.get_entity_fraud_context(customer_id)
        
        # Check for fraud ring involvement
        fraud_rings = self.neo4j_gnn.detect_fraud_rings()
        involved_ring = None
        for ring in fraud_rings:
            if customer_id in ring.members:
                involved_ring = ring
                break
        
        # Calculate combined risk score
        gnn_fraud_prob = gnn_prediction.fraud_probability if gnn_prediction else 0.0
        network_risk = fraud_context.get("network_risk_score", 0.0)
        ring_factor = 0.3 if involved_ring else 0.0
        
        combined_risk = min(1.0, gnn_fraud_prob * 0.5 + network_risk * 0.3 + ring_factor)
        
        # Determine risk decision
        if combined_risk < self.auto_approve_threshold:
            risk_decision = RiskDecision.AUTO_APPROVE
            recommended_action = "Proceed with standard claims adjudication"
        elif combined_risk < self.manual_review_threshold:
            risk_decision = RiskDecision.MANUAL_REVIEW
            recommended_action = "Route to claims adjuster for manual review"
        elif combined_risk < self.siu_threshold:
            risk_decision = RiskDecision.ESCALATE_SIU
            recommended_action = "Escalate to Special Investigation Unit for fraud investigation"
        else:
            risk_decision = RiskDecision.AUTO_DECLINE
            recommended_action = "High fraud probability - recommend decline with investigation"
        
        # Build contributing factors
        contributing_factors = gnn_prediction.contributing_factors if gnn_prediction else []
        if involved_ring:
            contributing_factors.append(f"Part of fraud ring with {len(involved_ring.members)} members")
        if network_risk > 0.3:
            contributing_factors.append(f"High network risk: {fraud_context.get('suspicious_connections_count', 0)} suspicious connections")
        
        return ClaimFraudAssessment(
            claim_id=claim_id,
            customer_id=customer_id,
            policy_id=policy_id,
            gnn_fraud_probability=gnn_fraud_prob,
            gnn_fraud_class=gnn_prediction.fraud_class if gnn_prediction else 0,
            network_risk_score=network_risk,
            fraud_ring_detected=involved_ring is not None,
            fraud_ring_id=involved_ring.ring_id if involved_ring else None,
            contributing_factors=contributing_factors,
            connected_suspicious_entities=fraud_context.get("connections", [])[:5],
            risk_decision=risk_decision,
            recommended_action=recommended_action,
            assessment_timestamp=datetime.utcnow().isoformat(),
        )

    def batch_assess_claims(self, claims: List[Dict[str, Any]]) -> List[ClaimFraudAssessment]:
        """Assess multiple claims in batch for efficiency"""
        assessments = []
        for claim in claims:
            assessment = self.assess_claim_fraud(
                claim_id=claim["claim_id"],
                customer_id=claim["customer_id"],
                policy_id=claim["policy_id"],
                claim_amount=claim.get("amount", 0),
                claim_type=claim.get("type", "unknown"),
            )
            assessments.append(assessment)
        return assessments


class UnderwritingGNNIntegration:
    """
    Integrates GNN fraud detection with underwriting workflow.
    
    This service is called during policy application to:
    1. Assess applicant fraud risk using GNN
    2. Analyze network connections for risk factors
    3. Adjust premium based on network risk
    4. Make underwriting decisions
    """

    def __init__(self, neo4j_gnn: Neo4jGNNIntegration = None):
        self.neo4j_gnn = neo4j_gnn or Neo4jGNNIntegration()
        
        # Thresholds for underwriting decisions
        self.standard_rate_threshold = 0.15
        self.substandard_rate_threshold = 0.4
        self.decline_threshold = 0.7

    def assess_underwriting_risk(
        self,
        application_id: str,
        customer_id: str,
        product_type: str,
        requested_coverage: float,
        customer_data: Dict[str, Any] = None,
    ) -> UnderwritingRiskAssessment:
        """
        Assess underwriting risk for a policy application using GNN.
        
        Called by Temporal workflow during underwriting process.
        """
        logger.info(f"Assessing underwriting risk for application {application_id}")
        
        # Get GNN prediction for customer
        predictions = self.neo4j_gnn.predict_fraud([customer_id])
        gnn_prediction = predictions[0] if predictions else None
        
        # Get entity fraud context
        fraud_context = self.neo4j_gnn.get_entity_fraud_context(customer_id)
        
        # Calculate risk metrics
        gnn_fraud_prob = gnn_prediction.fraud_probability if gnn_prediction else 0.0
        network_risk = fraud_context.get("network_risk_score", 0.0)
        suspicious_count = fraud_context.get("suspicious_connections_count", 0)
        
        # Get historical claim ratio from customer data
        historical_claim_ratio = 0.0
        if customer_data:
            num_claims = customer_data.get("num_claims", 0)
            num_policies = customer_data.get("num_policies", 1)
            historical_claim_ratio = num_claims / max(num_policies, 1)
        
        # Combined risk score
        combined_risk = (
            gnn_fraud_prob * 0.4 +
            network_risk * 0.3 +
            min(historical_claim_ratio, 1.0) * 0.3
        )
        
        # Determine underwriting decision
        if combined_risk < self.standard_rate_threshold:
            decision = UnderwritingDecision.STANDARD_RATE
            premium_factor = 1.0
        elif combined_risk < self.substandard_rate_threshold:
            decision = UnderwritingDecision.SUBSTANDARD_RATE
            premium_factor = 1.0 + (combined_risk - self.standard_rate_threshold) * 2
        elif combined_risk < self.decline_threshold:
            decision = UnderwritingDecision.REFER_TO_UNDERWRITER
            premium_factor = 1.5
        else:
            decision = UnderwritingDecision.DECLINE
            premium_factor = 0.0  # Not applicable
        
        # Build risk factors
        risk_factors = []
        if gnn_fraud_prob > 0.3:
            risk_factors.append(f"Elevated GNN fraud score: {gnn_fraud_prob:.2%}")
        if network_risk > 0.2:
            risk_factors.append(f"Network risk: {suspicious_count} suspicious connections")
        if historical_claim_ratio > 0.5:
            risk_factors.append(f"High historical claim ratio: {historical_claim_ratio:.2%}")
        
        return UnderwritingRiskAssessment(
            application_id=application_id,
            customer_id=customer_id,
            product_type=product_type,
            gnn_fraud_probability=gnn_fraud_prob,
            network_risk_score=network_risk,
            connected_high_risk_count=suspicious_count,
            historical_claim_ratio=historical_claim_ratio,
            underwriting_decision=decision,
            premium_adjustment_factor=premium_factor,
            risk_factors=risk_factors,
            assessment_timestamp=datetime.utcnow().isoformat(),
        )

    def calculate_risk_adjusted_premium(
        self,
        base_premium: float,
        assessment: UnderwritingRiskAssessment,
    ) -> Dict[str, Any]:
        """Calculate risk-adjusted premium based on GNN assessment"""
        adjusted_premium = base_premium * assessment.premium_adjustment_factor
        
        return {
            "base_premium": base_premium,
            "adjustment_factor": assessment.premium_adjustment_factor,
            "adjusted_premium": adjusted_premium,
            "risk_loading": adjusted_premium - base_premium,
            "risk_factors": assessment.risk_factors,
            "underwriting_decision": assessment.underwriting_decision.value,
        }


# Temporal Activities for workflow integration

async def claims_fraud_assessment_activity(
    claim_id: str,
    customer_id: str,
    policy_id: str,
    claim_amount: float,
    claim_type: str,
) -> Dict[str, Any]:
    """
    Temporal activity for claims fraud assessment.
    
    Called by claims processing workflow.
    """
    service = ClaimsGNNIntegration()
    assessment = service.assess_claim_fraud(
        claim_id=claim_id,
        customer_id=customer_id,
        policy_id=policy_id,
        claim_amount=claim_amount,
        claim_type=claim_type,
    )
    
    return {
        "claim_id": assessment.claim_id,
        "gnn_fraud_probability": assessment.gnn_fraud_probability,
        "network_risk_score": assessment.network_risk_score,
        "fraud_ring_detected": assessment.fraud_ring_detected,
        "risk_decision": assessment.risk_decision.value,
        "recommended_action": assessment.recommended_action,
        "contributing_factors": assessment.contributing_factors,
    }


async def underwriting_risk_assessment_activity(
    application_id: str,
    customer_id: str,
    product_type: str,
    requested_coverage: float,
    base_premium: float,
) -> Dict[str, Any]:
    """
    Temporal activity for underwriting risk assessment.
    
    Called by underwriting workflow.
    """
    service = UnderwritingGNNIntegration()
    assessment = service.assess_underwriting_risk(
        application_id=application_id,
        customer_id=customer_id,
        product_type=product_type,
        requested_coverage=requested_coverage,
    )
    
    premium_result = service.calculate_risk_adjusted_premium(base_premium, assessment)
    
    return {
        "application_id": assessment.application_id,
        "gnn_fraud_probability": assessment.gnn_fraud_probability,
        "network_risk_score": assessment.network_risk_score,
        "underwriting_decision": assessment.underwriting_decision.value,
        "premium_adjustment": premium_result,
        "risk_factors": assessment.risk_factors,
    }


async def batch_fraud_screening_activity(
    entity_ids: List[str],
) -> Dict[str, Any]:
    """
    Temporal activity for batch fraud screening.
    
    Used for periodic fraud detection runs.
    """
    neo4j_gnn = Neo4jGNNIntegration()
    try:
        result = neo4j_gnn.run_fraud_detection_pipeline(
            customer_ids=entity_ids,
            train_model=False,
            store_predictions=True,
        )
        return result
    finally:
        neo4j_gnn.close()


# Factory functions

def create_claims_gnn_integration() -> ClaimsGNNIntegration:
    """Create claims GNN integration service"""
    return ClaimsGNNIntegration()


def create_underwriting_gnn_integration() -> UnderwritingGNNIntegration:
    """Create underwriting GNN integration service"""
    return UnderwritingGNNIntegration()
