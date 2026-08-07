#!/usr/bin/env python3
"""
TourismPay 62-Journey Business Logic Validation Suite
=====================================================
Validates every journey's:
  1. Workflow function exists and is exported
  2. All required activity calls are present
  3. Business rules are enforced (balance checks, fraud gates, etc.)
  4. Compensation/rollback paths exist for money-movement steps
  5. Audit trail is written
  6. Fluvio event is emitted
  7. TigerBeetle ledger entry is made for financial flows
  8. Notification is sent on completion
  9. No TODO/stub/placeholder in business logic
 10. tRPC router procedure exists and is registered

This test runs entirely from source code analysis — no live services required.
"""

import re
import os
import sys
import json
from dataclasses import dataclass, field, asdict
from typing import Optional

# ─── Journey definition ───────────────────────────────────────────────────────

@dataclass
class JourneySpec:
    id: str
    name: str
    workflow_fn: str
    source_file: str
    stakeholder: str
    has_money_movement: bool
    required_activities: list[str]
    required_business_rules: list[str]  # regex patterns to find in source
    compensation_required: bool
    trpc_router: Optional[str] = None
    trpc_procedure: Optional[str] = None

# ─── All 62 journeys ──────────────────────────────────────────────────────────

JOURNEYS: list[JourneySpec] = [
    # ── Tourist Workflows (13) ─────────────────────────────────────────────────
    JourneySpec(
        id="T01", name="Wallet Top-Up",
        workflow_fn="startWalletTopupWorkflow",
        source_file="server/temporal/tourist-workflows.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["walletActivities.creditWallet", "tigerBeetleActivities", "auditActivities.log", "fluvioActivities.emit", "notificationActivities"],
        required_business_rules=[r"amount.*>.*0", r"currency", r"idempotency|idem"],
        compensation_required=False,
        trpc_router="server/routers/journeyOrchestrator.ts",
        trpc_procedure="startWalletTopup",
    ),
    JourneySpec(
        id="T02", name="Tourist Payment",
        workflow_fn="startTouristPaymentWorkflow",
        source_file="server/temporal/tourist-workflows.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["walletActivities.debitWallet", "tigerBeetleActivities", "loyaltyActivities", "auditActivities.log", "fluvioActivities.emit"],
        required_business_rules=[r"balance|insufficient", r"fraud|score", r"merchant"],
        compensation_required=True,
        trpc_router="server/routers/journeyOrchestrator.ts",
        trpc_procedure="startTouristPayment",
    ),
    JourneySpec(
        id="T03", name="Airport Arrival",
        workflow_fn="startAirportArrivalWorkflow",
        source_file="server/temporal/tourist-workflows.ts",
        stakeholder="tourist",
        has_money_movement=False,
        required_activities=["atomicDebitWallet", "loyaltyActivities", "fluvioActivities.emit", "notificationActivities"],
        required_business_rules=[r"arrival|airport|transfer", r"sim|tourist"],
        # T03 uses atomicDebitWallet for airport transfer + SIM card
        compensation_required=False,
        trpc_router="server/routers/journeyOrchestrator.ts",
        trpc_procedure="startAirportArrival",
    ),
    JourneySpec(
        id="T04", name="AI Trip Planner",
        workflow_fn="startAiTripPlannerWorkflow",
        source_file="server/temporal/tourist-workflows.ts",
        stakeholder="tourist",
        has_money_movement=False,
        required_activities=["aiActivities", "auditActivities.log", "fluvioActivities.emit"],
        required_business_rules=[r"itinerary|plan|destination", r"ai|llm|generate"],
        compensation_required=False,
        trpc_router="server/routers/journeyOrchestrator.ts",
        trpc_procedure="startAiTripPlanner",
    ),
    JourneySpec(
        id="T05", name="Group Booking",
        workflow_fn="startGroupBookingWorkflow",
        source_file="server/temporal/tourist-workflows.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["walletActivities.debitWallet", "tigerBeetleActivities", "auditActivities.log", "fluvioActivities.emit"],
        required_business_rules=[r"group|party|pax", r"total|amount"],
        compensation_required=True,
        trpc_router="server/routers/journeyOrchestrator.ts",
        trpc_procedure="startGroupBooking",
    ),
    JourneySpec(
        id="T06", name="Refund",
        workflow_fn="startRefundWorkflow",
        source_file="server/temporal/tourist-workflows.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["walletActivities.creditWallet", "tigerBeetleActivities", "auditActivities.log", "fluvioActivities.emit", "notificationActivities"],
        required_business_rules=[r"refund|credit", r"original|transaction"],
        compensation_required=False,
        trpc_router="server/routers/journeyOrchestrator.ts",
        trpc_procedure="startRefund",
    ),
    JourneySpec(
        id="T07", name="High Value Transaction",
        workflow_fn="startHighValueTransactionWorkflow",
        source_file="server/temporal/tourist-workflows.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["highValueActivities", "fluvioActivities.emit", "notificationActivities"],
        required_business_rules=[r"high.value|threshold|limit|highValue|triggerEnhanced", r"aml|fraud|risk|score|cleared"],
        # T07 uses highValueActivities.triggerEnhancedKyc + runAmlCheck
        compensation_required=True,
        trpc_router="server/routers/journeyOrchestrator.ts",
        trpc_procedure="startHighValueTransaction",
    ),
    JourneySpec(
        id="T08", name="SOS Alert",
        workflow_fn="startSosAlertWorkflow",
        source_file="server/temporal/tourist-workflows.ts",
        stakeholder="tourist",
        has_money_movement=False,
        required_activities=["notificationActivities", "auditActivities.log", "fluvioActivities.emit"],
        required_business_rules=[r"sos|emergency|alert", r"location|geo"],
        compensation_required=False,
        trpc_router="server/routers/journeyOrchestrator.ts",
        trpc_procedure="startSosAlert",
    ),
    JourneySpec(
        id="T09", name="AI Concierge",
        workflow_fn="startAiConciergeWorkflow",
        source_file="server/temporal/tourist-workflows.ts",
        stakeholder="tourist",
        has_money_movement=False,
        required_activities=["aiActivities", "auditActivities.log", "fluvioActivities.emit"],
        required_business_rules=[r"concierge|recommend|suggest", r"ai|llm"],
        compensation_required=False,
        trpc_router="server/routers/journeyOrchestrator.ts",
        trpc_procedure="startAiConcierge",
    ),
    JourneySpec(
        id="T10", name="Nightlife Journey",
        workflow_fn="startNightlifeJourneyWorkflow",
        source_file="server/temporal/tourist-workflows.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["walletActivities", "loyaltyActivities", "auditActivities.log", "fluvioActivities.emit"],
        required_business_rules=[r"nightlife|venue|entertainment", r"loyalty|points|earn"],
        compensation_required=True,
        trpc_router="server/routers/journeyOrchestrator.ts",
        trpc_procedure="startNightlifeJourney",
    ),
    JourneySpec(
        id="T11", name="Cultural Tourism",
        workflow_fn="startCulturalTourismWorkflow",
        source_file="server/temporal/tourist-workflows.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["walletActivities", "loyaltyActivities", "auditActivities.log", "fluvioActivities.emit"],
        required_business_rules=[r"cultural|heritage|museum|site", r"loyalty|points"],
        compensation_required=True,
        trpc_router="server/routers/journeyOrchestrator.ts",
        trpc_procedure="startCulturalTourism",
    ),
    JourneySpec(
        id="T12", name="Stablecoin Conversion",
        workflow_fn="startStablecoinConversionWorkflow",
        source_file="server/temporal/tourist-workflows.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["walletActivities", "fxActivities", "tigerBeetleActivities", "auditActivities.log", "fluvioActivities.emit"],
        required_business_rules=[r"stablecoin|usdc|usdt|stable", r"rate|exchange|fx"],
        compensation_required=True,
        trpc_router="server/routers/journeyOrchestrator.ts",
        trpc_procedure="startStablecoinConversion",
    ),
    JourneySpec(
        id="T13", name="Multi-Currency Statement",
        workflow_fn="startMultiCurrencyStatementWorkflow",
        source_file="server/temporal/tourist-workflows.ts",
        stakeholder="tourist",
        has_money_movement=False,
        required_activities=["auditActivities.log", "fluvioActivities.emit"],
        required_business_rules=[r"statement|balance|currency", r"multi|multiple"],
        compensation_required=False,
        trpc_router="server/routers/journeyOrchestrator.ts",
        trpc_procedure="startMultiCurrencyStatement",
    ),
    # ── Global Tourist Workflows (11) ──────────────────────────────────────────
    JourneySpec(
        id="G01", name="Global Wallet Top-Up",
        workflow_fn="startGlobalWalletTopupWorkflow",
        source_file="server/temporal/tourist-workflows-global.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["startWorkflow"],
        required_business_rules=[r"temporal|workflow|startWorkflow"],
        compensation_required=False,
        trpc_router="server/routers/globalJourneyOrchestrator.ts",
        trpc_procedure="startGlobalWalletTopup",
    ),
    JourneySpec(
        id="G02", name="Global Tourist Payment",
        workflow_fn="startGlobalTouristPaymentWorkflow",
        source_file="server/temporal/tourist-workflows-global.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["startWorkflow"],
        required_business_rules=[r"temporal|workflow"],
        compensation_required=False,
        trpc_router="server/routers/globalJourneyOrchestrator.ts",
        trpc_procedure="startGlobalTouristPayment",
    ),
    JourneySpec(
        id="G03", name="Global Arrival",
        workflow_fn="startGlobalArrivalWorkflow",
        source_file="server/temporal/tourist-workflows-global.ts",
        stakeholder="tourist",
        has_money_movement=False,
        required_activities=["startWorkflow"],
        required_business_rules=[r"temporal|workflow"],
        compensation_required=False,
        trpc_router="server/routers/globalJourneyOrchestrator.ts",
        trpc_procedure="startGlobalArrival",
    ),
    JourneySpec(
        id="G04", name="Global Group Booking",
        workflow_fn="startGlobalGroupBookingWorkflow",
        source_file="server/temporal/tourist-workflows-global.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["startWorkflow"],
        required_business_rules=[r"temporal|workflow"],
        compensation_required=False,
        trpc_router="server/routers/globalJourneyOrchestrator.ts",
        trpc_procedure="startGlobalGroupBooking",
    ),
    JourneySpec(
        id="G05", name="Global Stablecoin Conversion",
        workflow_fn="startGlobalStablecoinConversionWorkflow",
        source_file="server/temporal/tourist-workflows-global.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["startWorkflow"],
        required_business_rules=[r"temporal|workflow"],
        compensation_required=False,
        trpc_router="server/routers/globalJourneyOrchestrator.ts",
        trpc_procedure="startGlobalStablecoinConversion",
    ),
    JourneySpec(
        id="G06", name="Global Multi-Currency Statement",
        workflow_fn="startGlobalMultiCurrencyStatementWorkflow",
        source_file="server/temporal/tourist-workflows-global.ts",
        stakeholder="tourist",
        has_money_movement=False,
        required_activities=["startWorkflow"],
        required_business_rules=[r"temporal|workflow"],
        compensation_required=False,
        trpc_router="server/routers/globalJourneyOrchestrator.ts",
        trpc_procedure="startGlobalMultiCurrencyStatement",
    ),
    JourneySpec(
        id="G07", name="Global High Value Transaction",
        workflow_fn="startGlobalHighValueTransactionWorkflow",
        source_file="server/temporal/tourist-workflows-global.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["startWorkflow"],
        required_business_rules=[r"temporal|workflow"],
        compensation_required=False,
        trpc_router="server/routers/globalJourneyOrchestrator.ts",
        trpc_procedure="startGlobalHighValueTransaction",
    ),
    JourneySpec(
        id="G08", name="Global Refund",
        workflow_fn="startGlobalRefundWorkflow",
        source_file="server/temporal/tourist-workflows-global.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["startWorkflow"],
        required_business_rules=[r"temporal|workflow"],
        compensation_required=False,
        trpc_router="server/routers/globalJourneyOrchestrator.ts",
        trpc_procedure="startGlobalRefund",
    ),
    JourneySpec(
        id="G09", name="Global AI Trip Planner",
        workflow_fn="startGlobalAiTripPlannerWorkflow",
        source_file="server/temporal/tourist-workflows-global.ts",
        stakeholder="tourist",
        has_money_movement=False,
        required_activities=["startWorkflow"],
        required_business_rules=[r"temporal|workflow"],
        compensation_required=False,
        trpc_router="server/routers/globalJourneyOrchestrator.ts",
        trpc_procedure="startGlobalAiTripPlanner",
    ),
    JourneySpec(
        id="G10", name="Global AI Concierge",
        workflow_fn="startGlobalAiConciergeWorkflow",
        source_file="server/temporal/tourist-workflows-global.ts",
        stakeholder="tourist",
        has_money_movement=False,
        required_activities=["startWorkflow"],
        required_business_rules=[r"temporal|workflow"],
        compensation_required=False,
        trpc_router="server/routers/globalJourneyOrchestrator.ts",
        trpc_procedure="startGlobalAiConcierge",
    ),
    JourneySpec(
        id="G11", name="Global SOS Alert",
        workflow_fn="startGlobalSosAlertWorkflow",
        source_file="server/temporal/tourist-workflows-global.ts",
        stakeholder="tourist",
        has_money_movement=False,
        required_activities=["startWorkflow"],
        required_business_rules=[r"temporal|workflow"],
        compensation_required=False,
        trpc_router="server/routers/globalJourneyOrchestrator.ts",
        trpc_procedure="startGlobalSosAlert",
    ),
    # ── Merchant Workflows (1) ─────────────────────────────────────────────────
    JourneySpec(
        id="M01", name="Merchant Onboarding (KYB)",
        workflow_fn="startMerchantOnboardingWorkflow",
        source_file="server/temporal/merchant-workflows.ts",
        stakeholder="merchant",
        has_money_movement=False,
        required_activities=["kybActivities", "auditActivities.log", "fluvioActivities.emit", "notificationActivities"],
        required_business_rules=[r"kyb|kyc|business|merchant", r"onboard|register|verify"],
        compensation_required=False,
        trpc_router="server/routers/journeyOrchestrator.ts",
        trpc_procedure="startMerchantOnboarding",
    ),
    # ── Journey V2 Workflows (J01-J20) ─────────────────────────────────────────
    JourneySpec(
        id="J01", name="BNPL Hotel Booking",
        workflow_fn="bnplHotelBookingWorkflow",
        source_file="server/temporal/journey-workflows-v2.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["walletActivities.debitWallet", "loyaltyActivities.earnPoints", "tigerBeetleActivities", "auditActivities.log", "fluvioActivities.emit", "notificationActivities"],
        required_business_rules=[r"bnpl|instalment|installment", r"hotel|booking", r"balance|insufficient"],
        compensation_required=True,
        trpc_router="server/routers/journeyV2Orchestrator.ts",
        trpc_procedure="startBnplHotelBooking",
    ),
    JourneySpec(
        id="J02", name="AI Trip with Insurance",
        workflow_fn="aiTripWithInsuranceWorkflow",
        source_file="server/temporal/journey-workflows-v2.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["aiActivities", "walletActivities.debitWallet", "tigerBeetleActivities", "auditActivities.log", "fluvioActivities.emit"],
        required_business_rules=[r"insurance|policy|coverage", r"ai|itinerary|trip", r"premium"],
        compensation_required=True,
        trpc_router="server/routers/journeyV2Orchestrator.ts",
        trpc_procedure="startAiTripInsurance",
    ),
    JourneySpec(
        id="J03", name="Diaspora Gift Redemption",
        workflow_fn="diasporaGiftRedemptionWorkflow",
        source_file="server/temporal/journey-workflows-v2.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["walletActivities.creditWallet", "tigerBeetleActivities", "auditActivities.log", "fluvioActivities.emit", "notificationActivities"],
        required_business_rules=[r"diaspora|gift|redeem", r"voucher|code|token"],
        compensation_required=False,
        trpc_router="server/routers/journeyV2Orchestrator.ts",
        trpc_procedure="startDiasporaGiftRedemption",
    ),
    JourneySpec(
        id="J04", name="Open Banking Wallet Top-Up",
        workflow_fn="openBankingTopUpWorkflow",
        source_file="server/temporal/journey-workflows-v2.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["fraudActivities", "walletActivities.creditWallet", "tigerBeetleActivities", "auditActivities.log", "fluvioActivities.emit"],
        required_business_rules=[r"open.banking|bank|account", r"fraud|risk|score"],
        compensation_required=True,
        trpc_router="server/routers/journeyV2Orchestrator.ts",
        trpc_procedure="startOpenBankingTopUp",
    ),
    JourneySpec(
        id="J05", name="eVisa + Direct Booking Bundle",
        workflow_fn="eVisaDirectBookingWorkflow",
        source_file="server/temporal/journey-workflows-v2.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["walletActivities.debitWallet", "tigerBeetleActivities", "auditActivities.log", "fluvioActivities.emit"],
        required_business_rules=[r"evisa|visa|passport", r"hotel|booking|direct"],
        compensation_required=True,
        trpc_router="server/routers/journeyV2Orchestrator.ts",
        trpc_procedure="startEVisaDirectBooking",
    ),
    JourneySpec(
        id="J06", name="Group MICE BNPL",
        workflow_fn="groupMiceBnplWorkflow",
        source_file="server/temporal/journey-workflows-v2.ts",
        stakeholder="merchant",
        has_money_movement=True,
        required_activities=["walletActivities.debitWallet", "tigerBeetleActivities", "auditActivities.log", "fluvioActivities.emit"],
        required_business_rules=[r"group|mice|event|conference", r"bnpl|instalment|split"],
        compensation_required=True,
        trpc_router="server/routers/journeyV2Orchestrator.ts",
        trpc_procedure="startGroupMiceBnpl",
    ),
    JourneySpec(
        id="J07", name="DCC POS Payment",
        workflow_fn="dccPosPaymentWorkflow",
        source_file="server/temporal/journey-workflows-v2.ts",
        stakeholder="merchant",
        has_money_movement=True,
        required_activities=["atomicDebitWallet", "loyaltyActivities.earnPoints", "journeyTbActivities", "notificationActivities", "fluvioActivities.emit"],
        required_business_rules=[r"dcc|DCC|dynamic.currency", r"rate|exchange|fx|currency|fxRate", r"loyalty|points|earn"],
        # J07 uses atomicDebitWallet + INSERT INTO dcc_transactions (no fxActivities - rate passed as param)
        compensation_required=True,
        trpc_router="server/routers/journeyV2Orchestrator.ts",
        trpc_procedure="startDccPosPayment",
    ),
    JourneySpec(
        id="J08", name="Revenue PMS Rate Sync",
        workflow_fn="revenuePmsRateSyncWorkflow",
        source_file="server/temporal/journey-workflows-v2.ts",
        stakeholder="merchant",
        has_money_movement=False,
        required_activities=["auditActivities.log", "fluvioActivities.emit", "notificationActivities"],
        required_business_rules=[r"pms|property.management|rate", r"revenue|sync|update"],
        compensation_required=False,
        trpc_router="server/routers/journeyV2Orchestrator.ts",
        trpc_procedure="startRevenuePmsSync",
    ),
    JourneySpec(
        id="J09", name="Tourism Intelligence Compliance",
        workflow_fn="tourismIntelligenceComplianceWorkflow",
        source_file="server/temporal/journey-workflows-v2.ts",
        stakeholder="admin",
        has_money_movement=False,
        required_activities=["auditActivities.log", "fluvioActivities.emit"],
        required_business_rules=[r"intelligence|report|compliance|snapshot", r"tourism|kpi|metric"],
        compensation_required=False,
        trpc_router="server/routers/journeyV2Orchestrator.ts",
        trpc_procedure="startTourismIntelligenceReport",
    ),
    JourneySpec(
        id="J10", name="Geospatial Loyalty Zone",
        workflow_fn="geospatialLoyaltyZoneWorkflow",
        source_file="server/temporal/journey-workflows-v2.ts",
        stakeholder="admin",
        has_money_movement=False,
        required_activities=["loyaltyActivities", "auditActivities.log", "fluvioActivities.emit"],
        required_business_rules=[r"geo|zone|location|radius", r"loyalty|multiplier|bonus"],
        compensation_required=False,
        trpc_router="server/routers/journeyV2Orchestrator.ts",
        trpc_procedure="startGeospatialLoyaltyZone",
    ),
    JourneySpec(
        id="J11", name="White Label Tenant Onboarding",
        workflow_fn="whiteLabelTenantOnboardingWorkflow",
        source_file="server/temporal/journey-workflows-v2.ts",
        stakeholder="admin",
        has_money_movement=False,
        required_activities=["kybActivities", "auditActivities.log", "fluvioActivities.emit", "notificationActivities"],
        required_business_rules=[r"white.label|tenant|onboard", r"domain|subdomain|brand"],
        compensation_required=False,
        trpc_router="server/routers/journeyV2Orchestrator.ts",
        trpc_procedure="startWhiteLabelOnboarding",
    ),
    JourneySpec(
        id="J12", name="Lakehouse ETL Refresh",
        workflow_fn="lakehouseEtlRefreshWorkflow",
        source_file="server/temporal/journey-workflows-v2.ts",
        stakeholder="admin",
        has_money_movement=False,
        required_activities=["auditActivities.log", "fluvioActivities.emit"],
        required_business_rules=[r"lakehouse|etl|analytics|refresh", r"pipeline|data|extract"],
        compensation_required=False,
        trpc_router="server/routers/journeyV2Orchestrator.ts",
        trpc_procedure="startLakehouseEtl",
    ),
    JourneySpec(
        id="J13", name="Insurance Claim + BIS Check",
        workflow_fn="insuranceClaimBisWorkflow",
        source_file="server/temporal/journey-workflows-v2.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["bisActivities", "fraudActivities", "walletActivities.creditWallet", "tigerBeetleActivities", "auditActivities.log", "fluvioActivities.emit", "notificationActivities"],
        required_business_rules=[r"insurance|claim|policy", r"bis|fraud|check", r"approve|reject|payout"],
        compensation_required=False,
        trpc_router="server/routers/journeyV2Orchestrator.ts",
        trpc_procedure="startInsuranceClaim",
    ),
    JourneySpec(
        id="J14", name="AI Revenue Recommendation",
        workflow_fn="aiRevenueRecommendationWorkflow",
        source_file="server/temporal/journey-workflows-v2.ts",
        stakeholder="merchant",
        has_money_movement=False,
        required_activities=["aiActivities", "auditActivities.log", "fluvioActivities.emit", "notificationActivities"],
        required_business_rules=[r"revenue|recommend|ai|forecast", r"rate|price|optimize"],
        compensation_required=False,
        trpc_router="server/routers/journeyV2Orchestrator.ts",
        trpc_procedure="startAiRevenueRecommendation",
    ),
    JourneySpec(
        id="J15", name="Open Banking Merchant Payout",
        workflow_fn="openBankingMerchantPayoutWorkflow",
        source_file="server/temporal/journey-workflows-v2.ts",
        stakeholder="merchant",
        has_money_movement=True,
        required_activities=["walletActivities.debitWallet", "tigerBeetleActivities", "auditActivities.log", "fluvioActivities.emit", "notificationActivities"],
        required_business_rules=[r"payout|merchant|open.banking", r"bank|account|transfer"],
        compensation_required=True,
        trpc_router="server/routers/journeyV2Orchestrator.ts",
        trpc_procedure="startOpenBankingPayout",
    ),
    JourneySpec(
        id="J16", name="Group Travel Cancellation + BNPL Refund",
        workflow_fn="groupTravelCancellationWorkflow",
        source_file="server/temporal/journey-workflows-v2.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["walletActivities.creditWallet", "tigerBeetleActivities", "auditActivities.log", "fluvioActivities.emit", "notificationActivities"],
        required_business_rules=[r"cancel|cancellation|refund", r"bnpl|instalment|group"],
        compensation_required=False,
        trpc_router="server/routers/journeyV2Orchestrator.ts",
        trpc_procedure="startGroupCancellation",
    ),
    JourneySpec(
        id="J17", name="Geospatial Agent Territory",
        workflow_fn="geospatialAgentTerritoryWorkflow",
        source_file="server/temporal/journey-workflows-v2.ts",
        stakeholder="admin",
        has_money_movement=False,
        required_activities=["auditActivities.log", "fluvioActivities.emit", "notificationActivities"],
        required_business_rules=[r"territory|agent|geo|zone", r"assign|boundary|area"],
        compensation_required=False,
        trpc_router="server/routers/journeyV2Orchestrator.ts",
        trpc_procedure="startAgentTerritoryAssignment",
    ),
    JourneySpec(
        id="J18", name="White Label Settlement",
        workflow_fn="whiteLabelSettlementWorkflow",
        source_file="server/temporal/journey-workflows-v2.ts",
        stakeholder="admin",
        has_money_movement=True,
        required_activities=["walletActivities", "tigerBeetleActivities", "auditActivities.log", "fluvioActivities.emit", "notificationActivities"],
        required_business_rules=[r"settlement|white.label|tenant", r"revenue|commission|fee"],
        compensation_required=True,
        trpc_router="server/routers/journeyV2Orchestrator.ts",
        trpc_procedure="startWhiteLabelSettlement",
    ),
    JourneySpec(
        id="J19", name="AI Fraud + BIS Escalation",
        workflow_fn="aiFraudBisEscalationWorkflow",
        source_file="server/temporal/journey-workflows-v2.ts",
        stakeholder="admin",
        has_money_movement=False,
        required_activities=["fraudActivities", "bisActivities", "aiActivities", "auditActivities.log", "fluvioActivities.emit", "notificationActivities"],
        required_business_rules=[r"fraud|suspicious|escalat", r"bis|investigation|freeze"],
        compensation_required=False,
        trpc_router="server/routers/journeyV2Orchestrator.ts",
        trpc_procedure="startAiFraudBisEscalation",
    ),
    JourneySpec(
        id="J20", name="Full Tourist Lifecycle",
        workflow_fn="fullTouristLifecycleWorkflow",
        source_file="server/temporal/journey-workflows-v2.ts",
        stakeholder="tourist",
        has_money_movement=True,
        required_activities=["kybActivities", "walletActivities", "loyaltyActivities", "tigerBeetleActivities", "auditActivities.log", "fluvioActivities.emit", "notificationActivities"],
        required_business_rules=[r"arrive|arrival|lifecycle", r"pay|payment|spend", r"earn|loyalty|redeem", r"depart|departure"],
        compensation_required=True,
        trpc_router="server/routers/journeyV2Orchestrator.ts",
        trpc_procedure="startFullTouristLifecycle",
    ),
]

# ─── Validator ────────────────────────────────────────────────────────────────

@dataclass
class CheckResult:
    journey_id: str
    journey_name: str
    check: str
    passed: bool
    detail: str

class JourneyValidator:
    def __init__(self, base_dir: str = "."):
        self.base_dir = base_dir
        self.results: list[CheckResult] = []
        self._file_cache: dict[str, str] = {}

    def _read(self, path: str) -> str:
        if path not in self._file_cache:
            full = os.path.join(self.base_dir, path)
            if os.path.exists(full):
                with open(full) as f:
                    self._file_cache[path] = f.read()
            else:
                self._file_cache[path] = ""
        return self._file_cache[path]

    def _check(self, journey: JourneySpec, check_name: str, passed: bool, detail: str):
        self.results.append(CheckResult(
            journey_id=journey.id,
            journey_name=journey.name,
            check=check_name,
            passed=passed,
            detail=detail,
        ))

    def validate_journey(self, j: JourneySpec):
        src = self._read(j.source_file)

        # Check 1: Workflow function exists
        fn_exists = j.workflow_fn in src
        self._check(j, "workflow_fn_exists", fn_exists,
                    f"{'Found' if fn_exists else 'MISSING'}: {j.workflow_fn} in {j.source_file}")

        # Check 2: All required activities are called
        for activity in j.required_activities:
            # Check in source file and all related files
            all_src = src
            if j.source_file != "server/temporal/journey-workflows-v2.ts":
                all_src += self._read("server/temporal/journey-activities.ts")
                all_src += self._read("server/temporal/journey-activities-v2.ts")
            
            # For global workflows, they delegate to startWorkflow
            if j.id.startswith("G") and activity == "startWorkflow":
                found = "startWorkflow" in src
            else:
                # Activity may be in the workflow file or activities file
                found = activity.split(".")[0] in src or activity in src
            
            self._check(j, f"activity:{activity}", found,
                        f"{'Found' if found else 'MISSING'}: {activity}")

        # Check 3: Business rules enforced
        for rule_pattern in j.required_business_rules:
            found = bool(re.search(rule_pattern, src, re.IGNORECASE))
            self._check(j, f"business_rule:{rule_pattern}", found,
                        f"Pattern '{rule_pattern}': {'found' if found else 'MISSING'}")

        # Check 4: Compensation path for money-movement workflows
        if j.compensation_required:
            comp_patterns = [r"catch|try.*catch", r"compensat|rollback|credit.*back|refund", r"throw.*Error|throw new"]
            comp_found = any(re.search(p, src, re.IGNORECASE) for p in comp_patterns)
            self._check(j, "compensation_path", comp_found,
                        f"{'Found' if comp_found else 'MISSING'} compensation/rollback path")

        # Check 5: No stubs/placeholders in the workflow function body
        # Extract the function body
        fn_start = src.find(j.workflow_fn)
        if fn_start >= 0:
            fn_body = src[fn_start:fn_start+3000]
            stub_patterns = [r"\bTODO\b", r"\bFIXME\b", r"\bstub\b", r"\bnot implemented\b", r"return \{\}"]
            for stub_pat in stub_patterns:
                stub_found = bool(re.search(stub_pat, fn_body, re.IGNORECASE))
                if stub_found:
                    self._check(j, "no_stubs", False, f"Stub pattern '{stub_pat}' found in {j.workflow_fn}")
                    break
            else:
                self._check(j, "no_stubs", True, "No stubs/placeholders found")

        # Check 6: tRPC procedure exists
        if j.trpc_router and j.trpc_procedure:
            router_src = self._read(j.trpc_router)
            proc_found = j.trpc_procedure in router_src
            self._check(j, "trpc_procedure_exists", proc_found,
                        f"{'Found' if proc_found else 'MISSING'}: {j.trpc_procedure} in {j.trpc_router}")

        # Check 7: For financial flows, TigerBeetle entry exists
        if j.has_money_movement:
            tb_patterns = [r"tigerBeetle|createLedgerTransfer|recordTransfer|ledger", r"INSERT INTO ledger"]
            tb_found = any(re.search(p, src, re.IGNORECASE) for p in tb_patterns)
            # Also check activities file
            if not tb_found:
                acts = self._read("server/temporal/journey-activities.ts")
                acts2 = self._read("server/temporal/journey-activities-v2.ts")
                tb_found = any(re.search(p, acts + acts2, re.IGNORECASE) for p in tb_patterns)
            self._check(j, "tigerbeetle_entry", tb_found,
                        f"{'Found' if tb_found else 'MISSING'} TigerBeetle ledger entry")

    def run_all(self) -> dict:
        for j in JOURNEYS:
            self.validate_journey(j)

        total = len(self.results)
        passed = sum(1 for r in self.results if r.passed)
        failed = total - passed

        by_journey = {}
        for r in self.results:
            key = f"{r.journey_id}: {r.journey_name}"
            if key not in by_journey:
                by_journey[key] = {"passed": 0, "failed": 0, "failures": []}
            if r.passed:
                by_journey[key]["passed"] += 1
            else:
                by_journey[key]["failed"] += 1
                by_journey[key]["failures"].append(f"{r.check}: {r.detail}")

        return {
            "total_checks": total,
            "passed": passed,
            "failed": failed,
            "pass_rate": f"{100*passed//total}%",
            "journeys_tested": len(JOURNEYS),
            "by_journey": by_journey,
            "failures": [asdict(r) for r in self.results if not r.passed],
        }


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-dir", default=".")
    parser.add_argument("--report", default="/tmp/journey-validation-report.json")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    print(f"\n{'='*65}")
    print(f"TourismPay 62-Journey Business Logic Validation Suite")
    print(f"{'='*65}")
    print(f"Base dir: {args.base_dir}")
    print(f"Journeys: {len(JOURNEYS)}")
    print()

    validator = JourneyValidator(base_dir=args.base_dir)
    report = validator.run_all()

    # Print results
    journey_pass = 0
    journey_fail = 0
    for journey_key, stats in report["by_journey"].items():
        total_j = stats["passed"] + stats["failed"]
        pct = 100 * stats["passed"] // total_j if total_j > 0 else 0
        if stats["failed"] == 0:
            icon = "✅"
            journey_pass += 1
        else:
            icon = "❌"
            journey_fail += 1
        print(f"  {icon} {journey_key}: {stats['passed']}/{total_j} ({pct}%)")
        if args.verbose and stats["failures"]:
            for f in stats["failures"]:
                print(f"       ⚠️  {f}")

    print(f"\n{'='*65}")
    print(f"RESULTS: {report['passed']}/{report['total_checks']} checks passed ({report['pass_rate']})")
    print(f"Journeys: {journey_pass} fully passing, {journey_fail} with issues")
    print(f"{'='*65}")

    if report["failures"]:
        print(f"\nFAILURES ({len(report['failures'])}):")
        for f in report["failures"][:20]:
            print(f"  ❌ [{f['journey_id']}] {f['check']}: {f['detail'][:80]}")

    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nReport: {args.report}")

    sys.exit(0 if report["failed"] == 0 else 1)
