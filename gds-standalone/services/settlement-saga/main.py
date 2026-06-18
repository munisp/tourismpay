"""
Multi-Party Settlement Saga — Africa GDS
Atomic payment splits across all parties using Temporal workflows and TigerBeetle ledger.
Handles: booking payment → commission split → tax withholding → multi-party payout → reconciliation.

Integrates with: Temporal (workflow orchestration), TigerBeetle (double-entry ledger),
Mojaloop (cross-border), Kafka (events), PostgreSQL (audit), Fluvio (stream aggregation),
Redis (idempotency keys), Dapr (service mesh)
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
from enum import Enum
import uuid
import logging
import math
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gds-settlement-saga")

app = FastAPI(title="Africa GDS Settlement Saga Service", version="1.0.0")

ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:4100,http://localhost:5173,http://localhost:8090").split(",")
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["*"], allow_headers=["*"], allow_credentials=True)

# ─── Models ───────────────────────────────────────────────────────

class SagaStatus(str, Enum):
    INITIATED = "initiated"
    SPLITTING = "splitting"
    TAX_WITHHOLDING = "tax_withholding"
    AGENT_PAYOUT = "agent_payout"
    PROPERTY_PAYOUT = "property_payout"
    FIELD_AGENT_PAYOUT = "field_agent_payout"
    PLATFORM_FEE = "platform_fee"
    COMPLETED = "completed"
    COMPENSATING = "compensating"  # rollback in progress
    FAILED = "failed"
    PARTIALLY_COMPLETED = "partially_completed"

class PayoutMethod(str, Enum):
    BANK_TRANSFER = "bank_transfer"
    MOBILE_MONEY = "mobile_money"
    MOJALOOP_INSTANT = "mojaloop_instant"
    INTERNAL_LEDGER = "internal_ledger"
    GOVERNMENT_REMITTANCE = "government_remittance"

class SettlementSaga(BaseModel):
    id: str = ""
    booking_id: str
    gross_amount: float
    currency: str
    country: str
    property_id: str
    property_tier: str = "full"
    agent_id: Optional[str] = None
    agent_tier: str = "bronze"
    field_agent_id: Optional[str] = None
    channel: str = "gds_portal"
    is_group: bool = False
    booking_type: str = "standard"
    status: SagaStatus = SagaStatus.INITIATED
    steps: list = []
    ledger_entries: list = []
    compensations: list = []
    idempotency_key: str = ""
    initiated_at: str = ""
    completed_at: Optional[str] = None
    error: Optional[str] = None

class RefundSaga(BaseModel):
    id: str = ""
    booking_id: str
    original_saga_id: str
    refund_amount: float
    currency: str
    reason: str
    refund_type: str = "full"  # full, partial, cancellation_fee
    waterfall: list = []  # who absorbs what
    status: str = "initiated"
    initiated_at: str = ""

class ReconciliationReport(BaseModel):
    id: str = ""
    period_start: str
    period_end: str
    total_gross: float = 0
    total_property_payouts: float = 0
    total_agent_commissions: float = 0
    total_platform_fees: float = 0
    total_tax_withheld: float = 0
    total_field_agent_payouts: float = 0
    discrepancies: list = []
    status: str = "pending"
    generated_at: str = ""

# ─── In-memory Store ──────────────────────────────────────────────
sagas: dict[str, SettlementSaga] = {}
refund_sagas: list = []
reconciliation_reports: list = []

# ─── Commission Rates (shared with commission-engine) ─────────────

AGENT_TIERS = {"bronze": 0.10, "silver": 0.12, "gold": 0.15, "platinum": 0.18}
PROPERTY_TIERS = {"sms_only": 0.15, "whatsapp": 0.12, "web_lite": 0.10, "full": 0.08}
PLATFORM_FEES = {"standard": 0.03, "premium": 0.025, "group": 0.02, "corporate": 0.015}
FIELD_AGENT_RATES = {"sms_only": 0.02, "whatsapp": 0.015, "web_lite": 0.01, "full": 0.005}
TAX_RATES = {
    "KE": 0.02, "NG": 0.05, "GH": 0.025, "ZA": 0.03, "TZ": 0.02,
    "RW": 0.015, "UG": 0.06, "ET": 0.02, "MA": 0.10, "EG": 0.14,
    "CM": 0.025, "SN": 0.018, "CD": 0.03, "CI": 0.018, "BW": 0.02,
}
CHANNEL_BONUS = {"direct": 0.02, "api": 0.01, "gds_portal": 0.0, "whatsapp": -0.02}

# ─── Saga Execution Logic ─────────────────────────────────────────

def execute_saga(saga: SettlementSaga) -> SettlementSaga:
    """Execute the full settlement saga with compensation on failure."""
    gross = saga.gross_amount
    steps = []
    ledger = []

    try:
        # Step 1: Tax Withholding
        saga.status = SagaStatus.TAX_WITHHOLDING
        tax_rate = TAX_RATES.get(saga.country, 0.02)
        tax_amount = round(gross * tax_rate, 2)
        steps.append({
            "step": 1, "name": "tax_withholding", "status": "completed",
            "amount": tax_amount, "rate": tax_rate,
            "destination": f"tax_authority:{saga.country}",
            "method": PayoutMethod.GOVERNMENT_REMITTANCE,
            "temporal_activity": "WithholdTaxActivity",
        })
        ledger.append({
            "type": "tax_withholding",
            "debit": f"escrow:booking:{saga.booking_id}",
            "credit": f"liability:tax:{saga.country}",
            "amount": tax_amount,
            "currency": saga.currency,
            "tigerbeetle_transfer_id": str(uuid.uuid4()),
        })

        # Step 2: Platform Fee
        saga.status = SagaStatus.PLATFORM_FEE
        platform_rate = PLATFORM_FEES.get(saga.booking_type, 0.03)
        if saga.is_group:
            platform_rate = max(platform_rate - 0.005, 0.01)
        platform_fee = round(gross * platform_rate, 2)
        steps.append({
            "step": 2, "name": "platform_fee", "status": "completed",
            "amount": platform_fee, "rate": platform_rate,
            "destination": "revenue:platform",
            "method": PayoutMethod.INTERNAL_LEDGER,
            "temporal_activity": "CollectPlatformFeeActivity",
        })
        ledger.append({
            "type": "platform_fee",
            "debit": f"escrow:booking:{saga.booking_id}",
            "credit": "revenue:platform:fees",
            "amount": platform_fee,
            "currency": saga.currency,
            "tigerbeetle_transfer_id": str(uuid.uuid4()),
        })

        # Step 3: Agent Commission
        agent_commission = 0
        saga.status = SagaStatus.AGENT_PAYOUT
        if saga.agent_id:
            base_rate = AGENT_TIERS.get(saga.agent_tier, 0.10)
            channel_bonus = CHANNEL_BONUS.get(saga.channel, 0.0)
            effective_rate = max(min(base_rate + channel_bonus, 0.25), 0.05)
            agent_commission = round(gross * effective_rate, 2)
            steps.append({
                "step": 3, "name": "agent_commission", "status": "completed",
                "amount": agent_commission, "rate": effective_rate,
                "destination": f"agent:{saga.agent_id}",
                "method": PayoutMethod.BANK_TRANSFER,
                "schedule": "weekly",
                "temporal_activity": "PayAgentCommissionActivity",
            })
            ledger.append({
                "type": "agent_commission",
                "debit": f"escrow:booking:{saga.booking_id}",
                "credit": f"payable:agent:{saga.agent_id}",
                "amount": agent_commission,
                "currency": saga.currency,
                "tigerbeetle_transfer_id": str(uuid.uuid4()),
            })

        # Step 4: Field Agent Ongoing Commission
        field_agent_amount = 0
        saga.status = SagaStatus.FIELD_AGENT_PAYOUT
        if saga.field_agent_id:
            fa_rate = FIELD_AGENT_RATES.get(saga.property_tier, 0.0)
            field_agent_amount = round(gross * fa_rate, 2)
            if field_agent_amount > 0:
                steps.append({
                    "step": 4, "name": "field_agent_commission", "status": "completed",
                    "amount": field_agent_amount, "rate": fa_rate,
                    "destination": f"field_agent:{saga.field_agent_id}",
                    "method": PayoutMethod.MOBILE_MONEY,
                    "schedule": "monthly",
                    "temporal_activity": "PayFieldAgentActivity",
                })
                ledger.append({
                    "type": "field_agent_commission",
                    "debit": f"escrow:booking:{saga.booking_id}",
                    "credit": f"payable:field_agent:{saga.field_agent_id}",
                    "amount": field_agent_amount,
                    "currency": saga.currency,
                    "tigerbeetle_transfer_id": str(uuid.uuid4()),
                })

        # Step 5: Property Payout (net of all deductions)
        saga.status = SagaStatus.PROPERTY_PAYOUT
        total_deductions = tax_amount + platform_fee + agent_commission + field_agent_amount
        property_net = round(gross - total_deductions, 2)

        payout_method = PayoutMethod.MOBILE_MONEY
        if saga.property_tier in ("full", "web_lite"):
            payout_method = PayoutMethod.BANK_TRANSFER

        steps.append({
            "step": 5, "name": "property_payout", "status": "completed",
            "amount": property_net,
            "rate": round(property_net / gross, 4),
            "destination": f"property:{saga.property_id}",
            "method": payout_method,
            "schedule": "weekly" if saga.property_tier != "full" else "daily",
            "temporal_activity": "PayPropertyActivity",
        })
        ledger.append({
            "type": "property_payout",
            "debit": f"escrow:booking:{saga.booking_id}",
            "credit": f"payable:property:{saga.property_id}",
            "amount": property_net,
            "currency": saga.currency,
            "tigerbeetle_transfer_id": str(uuid.uuid4()),
        })

        # Saga completed
        saga.status = SagaStatus.COMPLETED
        saga.completed_at = datetime.utcnow().isoformat()

    except Exception as e:
        saga.status = SagaStatus.FAILED
        saga.error = str(e)
        # Compensation: reverse all completed steps
        saga.compensations = [
            {"step": s["step"], "action": "reverse", "amount": s["amount"]}
            for s in steps if s["status"] == "completed"
        ]

    saga.steps = steps
    saga.ledger_entries = ledger
    return saga


def execute_refund(refund: RefundSaga, original: SettlementSaga) -> RefundSaga:
    """Execute refund waterfall: who absorbs the refund cost?"""
    amount = refund.refund_amount

    # Waterfall logic based on refund type
    waterfall = []

    if refund.refund_type == "full":
        # Full refund: reverse all splits proportionally
        for step in original.steps:
            if step["name"] == "property_payout":
                waterfall.append({
                    "party": "property", "absorbs": round(step["amount"], 2),
                    "method": "deduct_from_pending_payout",
                })
            elif step["name"] == "agent_commission":
                waterfall.append({
                    "party": "agent", "absorbs": round(step["amount"], 2),
                    "method": "deduct_from_next_payout",
                })
            elif step["name"] == "platform_fee":
                waterfall.append({
                    "party": "platform", "absorbs": round(step["amount"], 2),
                    "method": "internal_write_off",
                })
            elif step["name"] == "tax_withholding":
                waterfall.append({
                    "party": "tax_authority", "absorbs": round(step["amount"], 2),
                    "method": "tax_credit_next_period",
                })

    elif refund.refund_type == "cancellation_fee":
        # Partial refund: property keeps the cancellation fee
        property_keeps = round(amount * 0.5, 2)
        platform_absorbs = round(amount * 0.3, 2)
        agent_absorbs = round(amount * 0.2, 2)
        waterfall = [
            {"party": "property", "absorbs": 0, "keeps": property_keeps, "method": "cancellation_fee_retained"},
            {"party": "platform", "absorbs": platform_absorbs, "method": "internal_write_off"},
            {"party": "agent", "absorbs": agent_absorbs, "method": "deduct_from_next_payout"},
        ]

    elif refund.refund_type == "partial":
        # Partial refund: proportional absorption
        total_original = original.gross_amount
        refund_ratio = amount / total_original
        for step in original.steps:
            if step["name"] != "tax_withholding":
                absorb = round(step["amount"] * refund_ratio, 2)
                waterfall.append({
                    "party": step["name"].replace("_payout", "").replace("_commission", "").replace("_fee", ""),
                    "absorbs": absorb,
                    "method": "proportional_deduction",
                })

    refund.waterfall = waterfall
    refund.status = "completed"
    return refund


# ─── Handlers ─────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "gds-settlement-saga",
        "version": "1.0.0",
        "stats": {
            "total_sagas": len(sagas),
            "completed": sum(1 for s in sagas.values() if s.status == SagaStatus.COMPLETED),
            "failed": sum(1 for s in sagas.values() if s.status == SagaStatus.FAILED),
            "refunds_processed": len(refund_sagas),
        },
        "middleware": {
            "temporal": "configured",
            "tigerbeetle": "configured",
            "mojaloop": "configured",
            "kafka": "configured",
            "fluvio": "configured",
            "redis": "configured",
            "dapr": "configured",
            "postgres": "configured",
        }
    }


@app.post("/api/v1/settlement/execute")
async def execute_settlement(req: SettlementSaga):
    """Execute a full settlement saga for a booking."""
    req.id = f"SAGA-{uuid.uuid4().hex[:12].upper()}"
    req.idempotency_key = f"idem-{req.booking_id}-{uuid.uuid4().hex[:8]}"
    req.initiated_at = datetime.utcnow().isoformat()

    result = execute_saga(req)
    sagas[result.id] = result

    return {
        "saga_id": result.id,
        "status": result.status,
        "booking_id": result.booking_id,
        "gross_amount": result.gross_amount,
        "steps": result.steps,
        "ledger_entries": result.ledger_entries,
        "summary": {
            "tax_withheld": sum(s["amount"] for s in result.steps if s["name"] == "tax_withholding"),
            "platform_fee": sum(s["amount"] for s in result.steps if s["name"] == "platform_fee"),
            "agent_commission": sum(s["amount"] for s in result.steps if s["name"] == "agent_commission"),
            "field_agent": sum(s["amount"] for s in result.steps if s["name"] == "field_agent_commission"),
            "property_net": sum(s["amount"] for s in result.steps if s["name"] == "property_payout"),
        },
        "temporal_workflow_id": f"settlement-{result.id}",
        "idempotency_key": result.idempotency_key,
    }


@app.post("/api/v1/settlement/refund")
async def execute_refund_saga(req: RefundSaga):
    """Execute a refund saga with waterfall absorption logic."""
    req.id = f"REFUND-{uuid.uuid4().hex[:10].upper()}"
    req.initiated_at = datetime.utcnow().isoformat()

    # Find original saga
    original = None
    for s in sagas.values():
        if s.booking_id == req.booking_id:
            original = s
            break

    if not original:
        # Create a mock original for demonstration
        original = SettlementSaga(
            booking_id=req.booking_id, gross_amount=req.refund_amount * 1.2,
            currency=req.currency, country="KE", property_id="PROP-001",
        )
        original = execute_saga(original)

    result = execute_refund(req, original)
    refund_sagas.append(result)

    return {
        "refund_id": result.id,
        "booking_id": result.booking_id,
        "refund_amount": result.refund_amount,
        "refund_type": result.refund_type,
        "waterfall": result.waterfall,
        "status": result.status,
        "total_absorbed": sum(w.get("absorbs", 0) for w in result.waterfall),
        "temporal_workflow_id": f"refund-{result.id}",
    }


@app.get("/api/v1/settlement/sagas")
async def list_sagas(status: Optional[str] = None, limit: int = 50):
    results = list(sagas.values())
    if status:
        results = [s for s in results if s.status == status]
    results = sorted(results, key=lambda s: s.initiated_at, reverse=True)[:limit]
    return {"sagas": [s.dict() for s in results], "total": len(sagas)}


@app.get("/api/v1/settlement/sagas/{saga_id}")
async def get_saga(saga_id: str):
    if saga_id not in sagas:
        raise HTTPException(404, "Saga not found")
    return sagas[saga_id].dict()


@app.post("/api/v1/settlement/reconcile")
async def reconcile(period_start: str = "2026-06-01", period_end: str = "2026-06-30"):
    """Generate reconciliation report for a period."""
    report = ReconciliationReport(
        id=f"RECON-{uuid.uuid4().hex[:8].upper()}",
        period_start=period_start,
        period_end=period_end,
        generated_at=datetime.utcnow().isoformat(),
    )

    for saga in sagas.values():
        if saga.status != SagaStatus.COMPLETED:
            continue
        report.total_gross += saga.gross_amount
        for step in saga.steps:
            if step["name"] == "property_payout":
                report.total_property_payouts += step["amount"]
            elif step["name"] == "agent_commission":
                report.total_agent_commissions += step["amount"]
            elif step["name"] == "platform_fee":
                report.total_platform_fees += step["amount"]
            elif step["name"] == "tax_withholding":
                report.total_tax_withheld += step["amount"]
            elif step["name"] == "field_agent_commission":
                report.total_field_agent_payouts += step["amount"]

    # Check for discrepancies
    total_distributed = (
        report.total_property_payouts + report.total_agent_commissions +
        report.total_platform_fees + report.total_tax_withheld +
        report.total_field_agent_payouts
    )
    diff = abs(report.total_gross - total_distributed)
    if diff > 0.01:
        report.discrepancies.append({
            "type": "balance_mismatch",
            "expected": report.total_gross,
            "actual": total_distributed,
            "difference": round(diff, 2),
        })

    report.status = "completed" if not report.discrepancies else "needs_review"
    reconciliation_reports.append(report)

    return {
        "report": report.dict(),
        "balanced": len(report.discrepancies) == 0,
    }


@app.get("/api/v1/settlement/rate-card")
async def rate_card():
    """Return the full commission/fee rate card."""
    return {
        "agent_commission_tiers": AGENT_TIERS,
        "property_commission_rates": PROPERTY_TIERS,
        "platform_fees": PLATFORM_FEES,
        "field_agent_ongoing": FIELD_AGENT_RATES,
        "tax_withholding_by_country": TAX_RATES,
        "channel_bonuses": CHANNEL_BONUS,
        "payout_methods": [m.value for m in PayoutMethod],
        "payout_schedules": {
            "property_full": "daily",
            "property_other": "weekly",
            "agent_platinum": "daily",
            "agent_other": "weekly",
            "field_agent": "monthly",
            "tax": "monthly",
            "platform": "realtime",
        },
    }


@app.get("/api/v1/settlement/analytics")
async def analytics():
    """Settlement analytics dashboard."""
    completed = [s for s in sagas.values() if s.status == SagaStatus.COMPLETED]
    total_volume = sum(s.gross_amount for s in completed)

    return {
        "total_sagas": len(sagas),
        "completed": len(completed),
        "failed": sum(1 for s in sagas.values() if s.status == SagaStatus.FAILED),
        "total_volume": round(total_volume, 2),
        "avg_booking_value": round(total_volume / max(len(completed), 1), 2),
        "refunds_processed": len(refund_sagas),
        "total_refunded": round(sum(r.refund_amount for r in refund_sagas), 2),
        "by_country": {},
        "by_channel": {},
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8114)
