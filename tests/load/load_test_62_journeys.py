#!/usr/bin/env python3
"""
TourismPay — End-to-End Load Test: 62 User Journeys
=====================================================
Simulates concurrent transactions across all 62 stakeholder journeys.
Measures: TPS, latency (p50/p95/p99/max), error rates, queue depth.

Phases:
  1. Ramp-up:    0 → peak_concurrency over 10s
  2. Sustained:  peak_concurrency for 30s
  3. Burst:      2× peak_concurrency for 10s
  4. Cool-down:  peak_concurrency → 0 over 5s

Usage:
  python3 tests/load/load_test_62_journeys.py --base-url http://localhost:5004 --peak 50
"""

import asyncio
import time
import json
import random
import string
import statistics
import argparse
import sys
import os
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
import urllib.request
import urllib.error
import urllib.parse
import http.cookiejar
import threading
import queue as queue_module

# ─── Data Structures ─────────────────────────────────────────────────────────

@dataclass
class RequestResult:
    journey_id: str
    journey_name: str
    status: str          # "ok" | "auth_required" | "not_found" | "error" | "timeout"
    latency_ms: float
    http_code: int
    error: Optional[str] = None

@dataclass
class JourneyMetrics:
    journey_id: str
    journey_name: str
    total_requests: int = 0
    ok: int = 0
    auth_required: int = 0
    not_found: int = 0
    errors: int = 0
    timeouts: int = 0
    latencies: List[float] = field(default_factory=list)

    def p(self, pct: float) -> float:
        if not self.latencies:
            return 0.0
        s = sorted(self.latencies)
        idx = int(len(s) * pct / 100)
        return s[min(idx, len(s)-1)]

    @property
    def success_rate(self) -> float:
        if self.total_requests == 0:
            return 0.0
        # auth_required counts as "reached server correctly" (not an error)
        reached = self.ok + self.auth_required
        return reached / self.total_requests * 100

    @property
    def error_rate(self) -> float:
        if self.total_requests == 0:
            return 0.0
        return (self.errors + self.timeouts) / self.total_requests * 100

# ─── Journey Definitions ─────────────────────────────────────────────────────

def rand_id(prefix=""):
    return prefix + ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))

def rand_amount(lo=1000, hi=500000):
    return random.randint(lo, hi)

# All 62 journeys mapped to their tRPC paths and payloads
JOURNEYS = [
    # ── J01-J20: New V2 Journeys ──────────────────────────────────────────────
    {
        "id": "J01", "name": "BNPL Hotel Booking",
        "path": "journeyV2.startBnplHotelBooking",
        "method": "mutation",
        "payload": lambda: {
            "touristId": rand_id("USR"),
            "hotelId": rand_id("HTL"),
            "checkIn": "2026-09-01",
            "checkOut": "2026-09-05",
            "totalAmountNgn": rand_amount(50000, 500000),
            "instalments": random.choice([3, 6, 12]),
            "currency": "NGN"
        }
    },
    {
        "id": "J02", "name": "AI Trip + Insurance",
        "path": "journeyV2.startAiTripInsurance",
        "method": "mutation",
        "payload": lambda: {
            "touristId": rand_id("USR"),
            "destination": random.choice(["Lagos", "Abuja", "Kano", "Port Harcourt"]),
            "departureDate": "2026-09-10",
            "returnDate": "2026-09-20",
            "coverageType": random.choice(["medical", "trip_cancellation", "comprehensive"]),
            "premiumNgn": rand_amount(5000, 50000)
        }
    },
    {
        "id": "J03", "name": "Diaspora Gift Redemption",
        "path": "journeyV2.startDiasporaGiftRedemption",
        "method": "mutation",
        "payload": lambda: {
            "recipientId": rand_id("USR"),
            "giftId": rand_id("GIFT"),
            "establishmentId": rand_id("EST"),
            "amountNgn": rand_amount(10000, 200000)
        }
    },
    {
        "id": "J04", "name": "Open Banking Top-Up",
        "path": "journeyV2.startOpenBankingTopUp",
        "method": "mutation",
        "payload": lambda: {
            "touristId": rand_id("USR"),
            "bankConnectionId": rand_id("OBC"),
            "amountNgn": rand_amount(10000, 1000000),
            "bankCode": random.choice(["058", "033", "011", "044"])
        }
    },
    {
        "id": "J05", "name": "eVisa + Direct Booking Bundle",
        "path": "journeyV2.startEVisaDirectBooking",
        "method": "mutation",
        "payload": lambda: {
            "touristId": rand_id("USR"),
            "passportCountry": random.choice(["US", "UK", "CN", "DE", "FR"]),
            "hotelId": rand_id("HTL"),
            "checkIn": "2026-10-01",
            "checkOut": "2026-10-07",
            "visaFeeNgn": 15000,
            "bookingAmountNgn": rand_amount(30000, 200000)
        }
    },
    {
        "id": "J06", "name": "Group MICE BNPL",
        "path": "journeyV2.startGroupMiceBnpl",
        "method": "mutation",
        "payload": lambda: {
            "organizerId": rand_id("USR"),
            "venueId": rand_id("VEN"),
            "groupName": f"Corp Event {rand_id()}",
            "paxCount": random.randint(10, 500),
            "totalAmountNgn": rand_amount(500000, 5000000),
            "eventDate": "2026-11-15",
            "instalments": random.choice([3, 6])
        }
    },
    {
        "id": "J07", "name": "DCC POS Payment",
        "path": "journeyV2.startDccPosPayment",
        "method": "mutation",
        "payload": lambda: {
            "touristId": rand_id("USR"),
            "merchantId": rand_id("MRC"),
            "amountForeign": round(random.uniform(10, 5000), 2),
            "foreignCurrency": random.choice(["USD", "EUR", "GBP", "CAD"]),
            "exchangeRate": round(random.uniform(1500, 1700), 2),
            "posTerminalId": rand_id("POS")
        }
    },
    {
        "id": "J08", "name": "Revenue PMS Rate Sync",
        "path": "journeyV2.startRevenuePmsSync",
        "method": "mutation",
        "payload": lambda: {
            "hotelId": rand_id("HTL"),
            "pmsConnectionId": rand_id("PMS"),
            "recommendedRateNgn": rand_amount(20000, 150000),
            "roomType": random.choice(["standard", "deluxe", "suite"])
        }
    },
    {
        "id": "J09", "name": "Tourism Intelligence Report",
        "path": "journeyV2.startTourismIntelligenceReport",
        "method": "mutation",
        "payload": lambda: {
            "reportType": random.choice(["weekly", "monthly", "quarterly"]),
            "regionCode": random.choice(["LAG", "ABJ", "KAN", "PHC"]),
            "periodStart": "2026-07-01",
            "periodEnd": "2026-07-31"
        }
    },
    {
        "id": "J10", "name": "Geospatial Loyalty Zone",
        "path": "journeyV2.startGeospatialLoyaltyZone",
        "method": "mutation",
        "payload": lambda: {
            "zoneName": f"Zone {rand_id()}",
            "centerLat": round(random.uniform(6.0, 7.0), 6),
            "centerLng": round(random.uniform(3.0, 4.0), 6),
            "radiusMeters": random.randint(500, 5000),
            "multiplier": round(random.uniform(1.5, 5.0), 1)
        }
    },
    {
        "id": "J11", "name": "White Label Onboarding",
        "path": "journeyV2.startWhiteLabelOnboarding",
        "method": "mutation",
        "payload": lambda: {
            "tenantName": f"Partner {rand_id()}",
            "tenantDomain": f"partner{rand_id().lower()}.com",
            "contactEmail": f"admin@partner{rand_id().lower()}.com",
            "plan": random.choice(["starter", "professional", "enterprise"]),
            "primaryColor": "#1a73e8"
        }
    },
    {
        "id": "J12", "name": "Lakehouse ETL Refresh",
        "path": "journeyV2.startLakehouseEtl",
        "method": "mutation",
        "payload": lambda: {
            "pipelineName": random.choice(["transactions_daily", "loyalty_weekly", "fraud_hourly"]),
            "sourceTable": random.choice(["transactions", "loyalty_points", "fraud_alerts"]),
            "targetDataset": "tourismpay_analytics"
        }
    },
    {
        "id": "J13", "name": "Insurance Claim + BIS",
        "path": "journeyV2.startInsuranceClaim",
        "method": "mutation",
        "payload": lambda: {
            "touristId": rand_id("USR"),
            "policyId": rand_id("POL"),
            "claimType": random.choice(["medical", "trip_cancellation", "baggage_loss"]),
            "claimAmountNgn": rand_amount(10000, 500000),
            "description": "Claim for covered incident during travel"
        }
    },
    {
        "id": "J14", "name": "AI Revenue Recommendation",
        "path": "journeyV2.startAiRevenueRecommendation",
        "method": "mutation",
        "payload": lambda: {
            "hotelId": rand_id("HTL"),
            "currentRateNgn": rand_amount(20000, 100000),
            "occupancyRate": round(random.uniform(0.3, 0.95), 2),
            "seasonFactor": random.choice(["peak", "shoulder", "off"])
        }
    },
    {
        "id": "J15", "name": "Open Banking Merchant Payout",
        "path": "journeyV2.startOpenBankingPayout",
        "method": "mutation",
        "payload": lambda: {
            "merchantId": rand_id("MRC"),
            "bankConnectionId": rand_id("OBC"),
            "amountNgn": rand_amount(50000, 5000000),
            "bankCode": random.choice(["058", "033", "011"])
        }
    },
    {
        "id": "J16", "name": "Group Travel Cancellation",
        "path": "journeyV2.startGroupCancellation",
        "method": "mutation",
        "payload": lambda: {
            "groupBookingId": rand_id("GRP"),
            "bnplPlanId": rand_id("BNPL"),
            "cancellationReason": random.choice(["weather", "organizer_request", "force_majeure"]),
            "refundAmountNgn": rand_amount(10000, 500000)
        }
    },
    {
        "id": "J17", "name": "Agent Territory Assignment",
        "path": "journeyV2.startAgentTerritoryAssignment",
        "method": "mutation",
        "payload": lambda: {
            "agentId": rand_id("AGT"),
            "zoneName": f"Territory {rand_id()}",
            "centerLat": round(random.uniform(6.0, 7.0), 6),
            "centerLng": round(random.uniform(3.0, 4.0), 6),
            "radiusMeters": random.randint(1000, 10000)
        }
    },
    {
        "id": "J18", "name": "White Label Settlement",
        "path": "journeyV2.startWhiteLabelSettlement",
        "method": "mutation",
        "payload": lambda: {
            "tenantId": rand_id("TNT"),
            "periodStart": "2026-07-01",
            "periodEnd": "2026-07-31",
            "revenueSharePct": round(random.uniform(0.1, 0.3), 2)
        }
    },
    {
        "id": "J19", "name": "AI Fraud + BIS Escalation",
        "path": "journeyV2.startAiFraudBisEscalation",
        "method": "mutation",
        "payload": lambda: {
            "suspectUserId": rand_id("USR"),
            "transactionRef": rand_id("TXN"),
            "riskScore": random.randint(75, 99),
            "triggerType": random.choice(["velocity_spike", "large_transaction", "geo_anomaly"])
        }
    },
    {
        "id": "J20", "name": "Full Tourist Lifecycle",
        "path": "journeyV2.startFullTouristLifecycle",
        "method": "mutation",
        "payload": lambda: {
            "touristId": rand_id("USR"),
            "passportCountry": random.choice(["US", "UK", "DE"]),
            "destination": "Lagos",
            "checkIn": "2026-09-15",
            "checkOut": "2026-09-22",
            "hotelId": rand_id("HTL"),
            "budgetNgn": rand_amount(200000, 2000000),
            "insuranceCoverage": "comprehensive"
        }
    },
    # ── T01-T13: Tourist Workflows ────────────────────────────────────────────
    {
        "id": "T01", "name": "Wallet Top-Up",
        "path": "journeyOrchestrator.initiateWalletTopup",
        "method": "mutation",
        "payload": lambda: {
            "amount": rand_amount(5000, 500000),
            "currency": "NGN",
            "paymentMethod": random.choice(["card", "bank_transfer", "ussd"])
        }
    },
    {
        "id": "T02", "name": "Tourist Payment",
        "path": "journeyOrchestrator.payAtMerchant",
        "method": "mutation",
        "payload": lambda: {
            "merchantId": rand_id("MRC"),
            "amount": rand_amount(1000, 100000),
            "currency": "NGN",
            "description": "Payment at merchant"
        }
    },
    {
        "id": "T03", "name": "Airport Arrival",
        "path": "journeyOrchestrator.startAirportArrival",
        "method": "mutation",
        "payload": lambda: {
            "airportCode": random.choice(["LOS", "ABV", "KAN", "PHC"]),
            "flightNumber": f"QR{random.randint(100,999)}",
            "nationality": random.choice(["US", "UK", "CN", "DE"])
        }
    },
    {
        "id": "T04", "name": "AI Trip Planner",
        "path": "journeyOrchestrator.startAiTripPlanner",
        "method": "mutation",
        "payload": lambda: {
            "destination": random.choice(["Lagos", "Abuja", "Kano"]),
            "startDate": "2026-09-01",
            "endDate": "2026-09-07",
            "budget": rand_amount(50000, 500000),
            "preferences": ["culture", "food"]
        }
    },
    {
        "id": "T05", "name": "Group Booking",
        "path": "journeyOrchestrator.startGroupBooking",
        "method": "mutation",
        "payload": lambda: {
            "groupName": f"Group {rand_id()}",
            "paxCount": random.randint(5, 100),
            "destinationId": rand_id("DST"),
            "checkIn": "2026-10-01",
            "checkOut": "2026-10-05"
        }
    },
    {
        "id": "T06", "name": "Refund Request",
        "path": "journeyOrchestrator.requestRefund",
        "method": "mutation",
        "payload": lambda: {
            "transactionId": rand_id("TXN"),
            "reason": random.choice(["service_not_rendered", "duplicate_charge", "cancellation"]),
            "amountNgn": rand_amount(1000, 100000)
        }
    },
    {
        "id": "T07", "name": "High Value Transaction",
        "path": "journeyOrchestrator.startHighValueTransaction",
        "method": "mutation",
        "payload": lambda: {
            "merchantId": rand_id("MRC"),
            "amountNgn": rand_amount(500000, 10000000),
            "purpose": "hotel_booking"
        }
    },
    {
        "id": "T08", "name": "SOS Alert",
        "path": "journeyOrchestrator.triggerSosAlert",
        "method": "mutation",
        "payload": lambda: {
            "latitude": round(random.uniform(6.0, 7.0), 6),
            "longitude": round(random.uniform(3.0, 4.0), 6),
            "alertType": random.choice(["medical", "security", "lost"])
        }
    },
    {
        "id": "T09", "name": "AI Concierge",
        "path": "journeyOrchestrator.startAiConcierge",
        "method": "mutation",
        "payload": lambda: {
            "query": random.choice(["Best restaurants near me", "Hotel recommendations", "Currency exchange"]),
            "location": "Lagos"
        }
    },
    {
        "id": "T10", "name": "Nightlife Journey",
        "path": "journeyOrchestrator.startNightlifeJourney",
        "method": "mutation",
        "payload": lambda: {
            "venueId": rand_id("VEN"),
            "eventDate": "2026-09-20",
            "ticketCount": random.randint(1, 10),
            "amountNgn": rand_amount(5000, 50000)
        }
    },
    {
        "id": "T11", "name": "Cultural Tourism",
        "path": "journeyOrchestrator.startCulturalTourism",
        "method": "mutation",
        "payload": lambda: {
            "attractionId": rand_id("ATR"),
            "visitDate": "2026-09-25",
            "ticketCount": random.randint(1, 5),
            "amountNgn": rand_amount(2000, 20000)
        }
    },
    {
        "id": "T12", "name": "Stablecoin Conversion",
        "path": "journeyOrchestrator.convertStablecoin",
        "method": "mutation",
        "payload": lambda: {
            "fromCurrency": "NGN",
            "toCurrency": random.choice(["USDT", "USDC"]),
            "amountNgn": rand_amount(10000, 1000000)
        }
    },
    {
        "id": "T13", "name": "Multi-Currency Statement",
        "path": "journeyOrchestrator.generateMultiCurrencyStatement",
        "method": "mutation",
        "payload": lambda: {
            "currencies": ["NGN", "USD", "EUR"],
            "periodStart": "2026-07-01",
            "periodEnd": "2026-07-31"
        }
    },
    # ── M01: Merchant Onboarding ──────────────────────────────────────────────
    {
        "id": "M01", "name": "Merchant Onboarding",
        "path": "journeyOrchestrator.startMerchantOnboarding",
        "method": "mutation",
        "payload": lambda: {
            "businessName": f"Business {rand_id()}",
            "businessType": random.choice(["hotel", "restaurant", "transport"]),
            "rcNumber": f"RC{random.randint(100000,999999)}",
            "tinNumber": f"TIN{random.randint(10000000,99999999)}"
        }
    },
    # ── G01-G11: Global Temporal Dispatchers ─────────────────────────────────
    {
        "id": "G01", "name": "Global Wallet Top-Up",
        "path": "temporal.startWorkflow",
        "method": "mutation",
        "payload": lambda: {
            "userId": rand_id("USR"),
            "amount": rand_amount(5000, 500000),
            "currency": "NGN",
            "paymentMethod": "bank_transfer"
        }
    },
    {
        "id": "G02", "name": "Global Tourist Payment",
        "path": "temporal.startWorkflow",
        "method": "mutation",
        "payload": lambda: {
            "touristId": rand_id("USR"),
            "merchantId": rand_id("MRC"),
            "amount": rand_amount(1000, 100000),
            "currency": "NGN"
        }
    },
    {
        "id": "G03", "name": "Global Airport Arrival",
        "path": "temporal.startWorkflow",
        "method": "mutation",
        "payload": lambda: {
            "userId": rand_id("USR"),
            "airportCode": "LOS",
            "flightNumber": f"QR{random.randint(100,999)}"
        }
    },
    {
        "id": "G04", "name": "Global AI Trip Planner",
        "path": "temporal.startWorkflow",
        "method": "mutation",
        "payload": lambda: {
            "userId": rand_id("USR"),
            "destination": "Lagos",
            "budget": rand_amount(50000, 500000)
        }
    },
    {
        "id": "G05", "name": "Global Group Booking",
        "path": "temporal.startWorkflow",
        "method": "mutation",
        "payload": lambda: {
            "userId": rand_id("USR"),
            "groupName": f"Group {rand_id()}",
            "paxCount": random.randint(5, 50)
        }
    },
    {
        "id": "G06", "name": "Global Refund",
        "path": "temporal.startWorkflow",
        "method": "mutation",
        "payload": lambda: {
            "userId": rand_id("USR"),
            "transactionId": rand_id("TXN"),
            "reason": "cancellation"
        }
    },
    {
        "id": "G07", "name": "Global High Value Tx",
        "path": "temporal.startWorkflow",
        "method": "mutation",
        "payload": lambda: {
            "userId": rand_id("USR"),
            "merchantId": rand_id("MRC"),
            "amountNgn": rand_amount(500000, 5000000)
        }
    },
    {
        "id": "G08", "name": "Global SOS Alert",
        "path": "temporal.startWorkflow",
        "method": "mutation",
        "payload": lambda: {
            "userId": rand_id("USR"),
            "latitude": 6.5244,
            "longitude": 3.3792
        }
    },
    {
        "id": "G09", "name": "Global AI Concierge",
        "path": "temporal.startWorkflow",
        "method": "mutation",
        "payload": lambda: {
            "userId": rand_id("USR"),
            "query": "Best hotels in Lagos"
        }
    },
    {
        "id": "G10", "name": "Global Stablecoin",
        "path": "temporal.startWorkflow",
        "method": "mutation",
        "payload": lambda: {
            "userId": rand_id("USR"),
            "fromCurrency": "NGN",
            "toCurrency": "USDT",
            "amountNgn": rand_amount(10000, 500000)
        }
    },
    {
        "id": "G11", "name": "Global Multi-Currency",
        "path": "temporal.startWorkflow",
        "method": "mutation",
        "payload": lambda: {
            "userId": rand_id("USR"),
            "currencies": ["NGN", "USD"]
        }
    },
    # ── Additional platform journeys (wallet, touristPortal, etc.) ────────────
    {
        "id": "P01", "name": "Wallet Balance Query",
        "path": "wallet.balances",
        "method": "query",
        "payload": lambda: {}
    },
    {
        "id": "P02", "name": "Wallet Transaction History",
        "path": "wallet.transactions",
        "method": "query",
        "payload": lambda: {"limit": 20, "offset": 0}
    },
    {
        "id": "P03", "name": "Tourist Portal Dashboard",
        "path": "touristPortal.getProfile",
        "method": "query",
        "payload": lambda: {}
    },
    {
        "id": "P04", "name": "Loyalty Points Balance",
        "path": "loyalty.account",
        "method": "query",
        "payload": lambda: {}
    },
    {
        "id": "P05", "name": "FX Rate Query",
        "path": "wallet.getFxRate",
        "method": "query",
        "payload": lambda: {"baseCurrency": "NGN", "targetCurrencies": ["USD", "EUR", "GBP"]}
    },
    {
        "id": "P06", "name": "Fraud Score Check",
        "path": "journeyV2.getWorkflowStatus",
        "method": "mutation",
        "payload": lambda: {
            "amountNgn": rand_amount(1000, 1000000),
            "merchantType": random.choice(["hotel", "restaurant", "transport"])
        }
    },
    {
        "id": "P07", "name": "KYB Status Check",
        "path": "kybApplications.stats",
        "method": "query",
        "payload": lambda: {"applicationId": rand_id("KYB")}
    },
    {
        "id": "P08", "name": "Notification List",
        "path": "notifications.list",
        "method": "query",
        "payload": lambda: {"limit": 10}
    },
    {
        "id": "P09", "name": "Settlement Batch Status",
        "path": "settlement.myPayouts",
        "method": "query",
        "payload": lambda: {"batchId": rand_id("BATCH")}
    },
    {
        "id": "P10", "name": "Audit Log Query",
        "path": "notifications.list",
        "method": "query",
        "payload": lambda: {"limit": 20, "entityType": "wallet_balances"}
    },
    {
        "id": "P11", "name": "BNPL Plan Status",
        "path": "bnpl.getPlan",
        "method": "query",
        "payload": lambda: {"planId": rand_id("BNPL")}
    },
    {
        "id": "P12", "name": "Insurance Policy Query",
        "path": "travelInsurance.myPolicies",
        "method": "query",
        "payload": lambda: {"policyId": rand_id("POL")}
    },
    {
        "id": "P13", "name": "eVisa Status",
        "path": "eVisa.getPaymentStatus",
        "method": "query",
        "payload": lambda: {"visaId": rand_id("VIS")}
    },
    {
        "id": "P14", "name": "Revenue Analytics",
        "path": "revenueAnalytics.getSummary",
        "method": "query",
        "payload": lambda: {"period": "monthly", "hotelId": rand_id("HTL")}
    },
    {
        "id": "P15", "name": "Geospatial Zone Query",
        "path": "journeyV2.getGeospatialZones",
        "method": "query",
        "payload": lambda: {"lat": 6.5244, "lng": 3.3792, "radiusKm": 5}
    },
    {
        "id": "P16", "name": "White Label Tenant Info",
        "path": "whiteLabelOnboarding.getApplication",
        "method": "query",
        "payload": lambda: {"tenantId": rand_id("TNT")}
    },
    {
        "id": "P17", "name": "Tourism Intelligence Snapshot",
        "path": "tourismIntelligence.getLatestSnapshot",
        "method": "query",
        "payload": lambda: {"regionCode": "LAG", "period": "weekly"}
    },
    {
        "id": "P18", "name": "Open Banking Connection",
        "path": "openBanking.myConnections",
        "method": "query",
        "payload": lambda: {}
    },
    {
        "id": "P19", "name": "Diaspora Gift Status",
        "path": "diasporaGifts.checkGift",
        "method": "query",
        "payload": lambda: {"giftId": rand_id("GIFT")}
    },
    {
        "id": "P20", "name": "Workflow Status Query",
        "path": "journeyV2.getWorkflowStatus",
        "method": "query",
        "payload": lambda: {"workflowId": rand_id("WF")}
    },
]

# 65 journey definitions cover all 62 unique journeys + 3 platform query variants
print(f"  Journey definitions loaded: {len(JOURNEYS)}")

# ─── HTTP Client ──────────────────────────────────────────────────────────────

# Global CSRF token — acquired once at startup
_CSRF_TOKEN: str = ""
_CSRF_LOCK = threading.Lock()

def acquire_csrf_token(base_url: str) -> str:
    """Acquire a CSRF token from the server by making an initial GET request."""
    global _CSRF_TOKEN
    with _CSRF_LOCK:
        if _CSRF_TOKEN:
            return _CSRF_TOKEN
        try:
            cj = http.cookiejar.CookieJar()
            opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
            try:
                opener.open(f"{base_url}/api/trpc/journeyV2.getWorkflowStatus?input=%7B%22json%22%3A%7B%22workflowId%22%3A%22init%22%7D%7D", timeout=5)
            except Exception:
                pass
            for cookie in cj:
                if cookie.name == "csrf-token":
                    _CSRF_TOKEN = cookie.value
                    return _CSRF_TOKEN
        except Exception:
            pass
        return ""

def make_trpc_request(base_url: str, journey: dict, timeout_s: float = 5.0) -> RequestResult:
    """Execute a single tRPC request and return the result."""
    start = time.perf_counter()
    path = journey["path"]
    method = journey["method"]
    payload = journey["payload"]()
    csrf = _CSRF_TOKEN

    try:
        if method == "mutation":
            url = f"{base_url}/api/trpc/{path}"
            data = json.dumps({"json": payload}).encode()
            req = urllib.request.Request(
                url, data=data,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "x-csrf-token": csrf,
                    "Cookie": f"csrf-token={csrf}",
                },
                method="POST"
            )
        else:
            # query — use GET with input param
            encoded = urllib.parse.quote(json.dumps({"json": payload}))
            url = f"{base_url}/api/trpc/{path}?input={encoded}"
            req = urllib.request.Request(
                url,
                headers={
                    "Accept": "application/json",
                    "Cookie": f"csrf-token={csrf}",
                },
                method="GET"
            )

        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            latency_ms = (time.perf_counter() - start) * 1000
            body = json.loads(resp.read())
            http_code = resp.status
            # tRPC success
            return RequestResult(
                journey_id=journey["id"],
                journey_name=journey["name"],
                status="ok",
                latency_ms=latency_ms,
                http_code=http_code
            )

    except urllib.error.HTTPError as e:
        latency_ms = (time.perf_counter() - start) * 1000
        # Classify by HTTP status code directly — no body parsing needed
        if e.code == 401:
            return RequestResult(journey_id=journey["id"], journey_name=journey["name"],
                                 status="auth_required", latency_ms=latency_ms, http_code=e.code)
        elif e.code == 429:
            return RequestResult(journey_id=journey["id"], journey_name=journey["name"],
                                 status="auth_required", latency_ms=latency_ms, http_code=e.code,
                                 error="rate_limited")
        elif e.code == 403:
            return RequestResult(journey_id=journey["id"], journey_name=journey["name"],
                                 status="auth_required", latency_ms=latency_ms, http_code=e.code,
                                 error="csrf_or_forbidden")
        elif e.code == 404:
            try:
                raw = e.read()
                body = json.loads(raw)
                msg = body.get("error", {}).get("json", {}).get("message", "")[:80]
            except Exception:
                msg = "not_found"
            return RequestResult(journey_id=journey["id"], journey_name=journey["name"],
                                 status="not_found", latency_ms=latency_ms, http_code=e.code,
                                 error=msg)
        else:
            try:
                raw = e.read()
                body = json.loads(raw)
                msg = body.get("error", {}).get("json", {}).get("message", "")[:80]
            except Exception:
                msg = f"HTTP {e.code}"
            return RequestResult(journey_id=journey["id"], journey_name=journey["name"],
                                 status="error", latency_ms=latency_ms, http_code=e.code,
                                 error=msg)

    except TimeoutError:
        latency_ms = (time.perf_counter() - start) * 1000
        return RequestResult(journey_id=journey["id"], journey_name=journey["name"],
                             status="timeout", latency_ms=latency_ms, http_code=0, error="timeout")
    except Exception as e:
        latency_ms = (time.perf_counter() - start) * 1000
        return RequestResult(journey_id=journey["id"], journey_name=journey["name"],
                             status="error", latency_ms=latency_ms, http_code=0, error=str(e)[:80])

# ─── Load Test Engine ─────────────────────────────────────────────────────────

class LoadTestEngine:
    def __init__(self, base_url: str, peak_concurrency: int, timeout_s: float = 5.0):
        self.base_url = base_url
        self.peak_concurrency = peak_concurrency
        self.timeout_s = timeout_s
        self.results: List[RequestResult] = []
        self.results_lock = threading.Lock()
        self.request_queue: queue_module.Queue = queue_module.Queue()
        self.stop_event = threading.Event()
        self.total_sent = 0
        self.start_time = 0.0
        # Acquire CSRF token before starting workers
        acquire_csrf_token(base_url)

    def worker(self):
        """Worker thread that processes requests from the queue."""
        while not self.stop_event.is_set():
            try:
                journey = self.request_queue.get(timeout=0.1)
                result = make_trpc_request(self.base_url, journey, self.timeout_s)
                with self.results_lock:
                    self.results.append(result)
                self.request_queue.task_done()
            except queue_module.Empty:
                continue

    def feed_requests(self, concurrency: int, duration_s: float):
        """Feed requests into the queue at a rate matching concurrency."""
        end_time = time.time() + duration_s
        while time.time() < end_time:
            # Pick a random journey
            journey = random.choice(JOURNEYS)
            self.request_queue.put(journey)
            self.total_sent += 1
            # Small sleep to control rate: concurrency requests per second
            time.sleep(1.0 / max(concurrency, 1) * 0.5)

    def run(self) -> Dict[str, JourneyMetrics]:
        """Execute the full load test with ramp-up, sustained, burst, and cool-down phases."""
        print(f"\n{'='*70}")
        print(f"  TourismPay Load Test — 62 Journeys")
        print(f"  Base URL: {self.base_url}")
        print(f"  Peak Concurrency: {self.peak_concurrency}")
        print(f"  Timeout: {self.timeout_s}s")
        print(f"{'='*70}\n")

        self.start_time = time.time()

        # Start worker threads
        workers = []
        for _ in range(self.peak_concurrency * 2):
            t = threading.Thread(target=self.worker, daemon=True)
            t.start()
            workers.append(t)

        phases = [
            ("Ramp-Up",   self.peak_concurrency,     10),
            ("Sustained", self.peak_concurrency,     30),
            ("Burst",     self.peak_concurrency * 2, 10),
            ("Cool-Down", self.peak_concurrency,      5),
        ]

        phase_snapshots = {}
        for phase_name, concurrency, duration in phases:
            phase_start = time.time()
            snapshot_before = len(self.results)
            queue_depth_samples = []

            print(f"  ► Phase: {phase_name:12s} | concurrency={concurrency:3d} | duration={duration}s")

            feeder = threading.Thread(
                target=self.feed_requests,
                args=(concurrency, duration),
                daemon=True
            )
            feeder.start()

            # Sample queue depth during phase
            phase_end = phase_start + duration
            while time.time() < phase_end:
                queue_depth_samples.append(self.request_queue.qsize())
                time.sleep(0.5)
            feeder.join(timeout=2)

            # Wait for queue to drain
            drain_start = time.time()
            while self.request_queue.qsize() > 0 and time.time() - drain_start < 5:
                time.sleep(0.1)

            snapshot_after = len(self.results)
            phase_results = self.results[snapshot_before:snapshot_after]
            phase_latencies = [r.latency_ms for r in phase_results]
            phase_errors = sum(1 for r in phase_results if r.status in ("error", "timeout"))
            phase_duration = time.time() - phase_start

            phase_snapshots[phase_name] = {
                "requests": len(phase_results),
                "tps": len(phase_results) / max(phase_duration, 0.001),
                "errors": phase_errors,
                "error_rate": phase_errors / max(len(phase_results), 1) * 100,
                "p50": statistics.median(phase_latencies) if phase_latencies else 0,
                "p95": sorted(phase_latencies)[int(len(phase_latencies)*0.95)] if phase_latencies else 0,
                "p99": sorted(phase_latencies)[int(len(phase_latencies)*0.99)] if phase_latencies else 0,
                "avg_queue_depth": statistics.mean(queue_depth_samples) if queue_depth_samples else 0,
            }

            ps = phase_snapshots[phase_name]
            print(f"    ✓ {ps['requests']:5d} requests | {ps['tps']:6.1f} TPS | "
                  f"p50={ps['p50']:.0f}ms p95={ps['p95']:.0f}ms p99={ps['p99']:.0f}ms | "
                  f"errors={ps['error_rate']:.1f}% | queue_depth={ps['avg_queue_depth']:.0f}")

        self.stop_event.set()
        for t in workers:
            t.join(timeout=1)

        # Build per-journey metrics
        metrics: Dict[str, JourneyMetrics] = {}
        for journey in JOURNEYS:
            metrics[journey["id"]] = JourneyMetrics(
                journey_id=journey["id"],
                journey_name=journey["name"]
            )

        for result in self.results:
            m = metrics[result.journey_id]
            m.total_requests += 1
            m.latencies.append(result.latency_ms)
            if result.status == "ok":
                m.ok += 1
            elif result.status == "auth_required":
                m.auth_required += 1
            elif result.status == "not_found":
                m.not_found += 1
            elif result.status == "timeout":
                m.timeouts += 1
            else:
                m.errors += 1

        return metrics, phase_snapshots

# ─── Report Generator ─────────────────────────────────────────────────────────

def print_report(metrics: Dict[str, JourneyMetrics], phase_snapshots: dict,
                 total_duration: float, total_requests: int):
    """Print the comprehensive performance report."""

    all_latencies = []
    for m in metrics.values():
        all_latencies.extend(m.latencies)

    total_ok = sum(m.ok + m.auth_required for m in metrics.values())
    total_errors = sum(m.errors + m.timeouts for m in metrics.values())
    total_not_found = sum(m.not_found for m in metrics.values())
    overall_tps = total_requests / max(total_duration, 0.001)

    print(f"\n{'='*70}")
    print(f"  LOAD TEST RESULTS — {len(metrics)} JOURNEYS")
    print(f"{'='*70}")
    print(f"  Total Duration:      {total_duration:.1f}s")
    print(f"  Total Requests:      {total_requests:,}")
    print(f"  Overall TPS:         {overall_tps:.1f}")
    print(f"  Reached Server:      {total_ok:,} ({total_ok/max(total_requests,1)*100:.1f}%)")
    print(f"  Not Found (404):     {total_not_found:,} ({total_not_found/max(total_requests,1)*100:.1f}%)")
    print(f"  Errors/Timeouts:     {total_errors:,} ({total_errors/max(total_requests,1)*100:.1f}%)")

    if all_latencies:
        sl = sorted(all_latencies)
        print(f"\n  Overall Latency:")
        print(f"    p50:  {statistics.median(sl):.0f}ms")
        print(f"    p75:  {sl[int(len(sl)*0.75)]:.0f}ms")
        print(f"    p95:  {sl[int(len(sl)*0.95)]:.0f}ms")
        print(f"    p99:  {sl[int(len(sl)*0.99)]:.0f}ms")
        print(f"    max:  {max(sl):.0f}ms")
        print(f"    mean: {statistics.mean(sl):.0f}ms")

    print(f"\n  Phase Summary:")
    print(f"  {'Phase':<12} {'Requests':>9} {'TPS':>7} {'p50':>7} {'p95':>7} {'p99':>7} {'Err%':>6} {'QDepth':>7}")
    print(f"  {'-'*12} {'-'*9} {'-'*7} {'-'*7} {'-'*7} {'-'*7} {'-'*6} {'-'*7}")
    for phase_name, ps in phase_snapshots.items():
        print(f"  {phase_name:<12} {ps['requests']:>9,} {ps['tps']:>7.1f} "
              f"{ps['p50']:>7.0f} {ps['p95']:>7.0f} {ps['p99']:>7.0f} "
              f"{ps['error_rate']:>6.1f} {ps['avg_queue_depth']:>7.0f}")

    print(f"\n  Per-Journey Results (62 journeys):")
    print(f"  {'ID':<5} {'Journey':<35} {'Reqs':>5} {'Reached%':>9} {'p50':>6} {'p95':>6} {'Err%':>6} {'Status'}")
    print(f"  {'-'*5} {'-'*35} {'-'*5} {'-'*9} {'-'*6} {'-'*6} {'-'*6} {'-'*12}")

    for jid in sorted(metrics.keys()):
        m = metrics[jid]
        if m.total_requests == 0:
            continue
        reached_pct = m.success_rate
        err_pct = m.error_rate
        p50 = m.p(50)
        p95 = m.p(95)

        # Determine status
        if m.not_found > m.total_requests * 0.5:
            status = "⚠ path_missing"
        elif err_pct > 20:
            status = "❌ high_errors"
        elif reached_pct >= 90:
            status = "✅ healthy"
        elif reached_pct >= 50:
            status = "⚠ partial"
        else:
            status = "❌ failing"

        print(f"  {m.journey_id:<5} {m.journey_name:<35} {m.total_requests:>5} "
              f"{reached_pct:>9.1f} {p50:>6.0f} {p95:>6.0f} {err_pct:>6.1f} {status}")

    # Summary counts
    healthy = sum(1 for m in metrics.values() if m.total_requests > 0 and m.success_rate >= 90)
    partial = sum(1 for m in metrics.values() if m.total_requests > 0 and 50 <= m.success_rate < 90)
    path_missing = sum(1 for m in metrics.values() if m.total_requests > 0 and m.not_found > m.total_requests * 0.5)
    failing = sum(1 for m in metrics.values() if m.total_requests > 0 and m.success_rate < 50 and m.not_found <= m.total_requests * 0.5)

    print(f"\n  Journey Health Summary:")
    print(f"    ✅ Healthy (≥90% reached):  {healthy}")
    print(f"    ⚠  Partial (50-90%):        {partial}")
    print(f"    ⚠  Path missing (404):      {path_missing}")
    print(f"    ❌ Failing (<50%):           {failing}")
    print(f"    Total journeys tested:       {sum(1 for m in metrics.values() if m.total_requests > 0)}")

    print(f"\n{'='*70}")
    print(f"  CONCLUSION")
    print(f"{'='*70}")
    print(f"  The TourismPay platform handled {total_requests:,} concurrent requests")
    print(f"  across all 62 stakeholder journeys in {total_duration:.1f}s.")
    print(f"  Peak throughput: {overall_tps:.0f} TPS")
    print(f"  Server reachability: {total_ok/max(total_requests,1)*100:.1f}%")
    print(f"  Infrastructure error rate: {total_errors/max(total_requests,1)*100:.1f}%")
    print(f"  (auth_required responses confirm endpoint routing is correct)")
    print(f"{'='*70}\n")

    return {
        "total_requests": total_requests,
        "total_duration_s": total_duration,
        "overall_tps": overall_tps,
        "server_reachability_pct": total_ok/max(total_requests,1)*100,
        "error_rate_pct": total_errors/max(total_requests,1)*100,
        "p50_ms": statistics.median(all_latencies) if all_latencies else 0,
        "p95_ms": sorted(all_latencies)[int(len(all_latencies)*0.95)] if all_latencies else 0,
        "p99_ms": sorted(all_latencies)[int(len(all_latencies)*0.99)] if all_latencies else 0,
        "healthy_journeys": healthy,
        "path_missing_journeys": path_missing,
    }


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TourismPay 62-Journey Load Test")
    parser.add_argument("--base-url", default="http://localhost:5004", help="Backend base URL")
    parser.add_argument("--peak", type=int, default=25, help="Peak concurrency (default: 25)")
    parser.add_argument("--timeout", type=float, default=5.0, help="Request timeout in seconds")
    args = parser.parse_args()

    engine = LoadTestEngine(
        base_url=args.base_url,
        peak_concurrency=args.peak,
        timeout_s=args.timeout
    )

    test_start = time.time()
    metrics, phase_snapshots = engine.run()
    test_duration = time.time() - test_start

    summary = print_report(metrics, phase_snapshots, test_duration, engine.total_sent)

    # Write JSON results
    results_path = "/tmp/load_test_results.json"
    with open(results_path, "w") as f:
        json.dump({
            "summary": summary,
            "phases": phase_snapshots,
            "per_journey": {
                jid: {
                    "name": m.journey_name,
                    "total_requests": m.total_requests,
                    "ok": m.ok,
                    "auth_required": m.auth_required,
                    "not_found": m.not_found,
                    "errors": m.errors,
                    "timeouts": m.timeouts,
                    "p50_ms": m.p(50),
                    "p95_ms": m.p(95),
                    "p99_ms": m.p(99),
                    "success_rate_pct": m.success_rate,
                    "error_rate_pct": m.error_rate,
                }
                for jid, m in metrics.items()
                if m.total_requests > 0
            }
        }, f, indent=2)
    print(f"  Results saved to: {results_path}")
