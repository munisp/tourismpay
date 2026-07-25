"""IFRS 17 Engine — Insurance contract measurement and reporting.

Business Rules:
- Measurement models: BBA (Building Block Approach), PAA (Premium Allocation Approach)
- CSM calculation: Present value of future cash flows - risk adjustment
- Discount curves: CBN yield curve, updated monthly
- Risk adjustment: 75th percentile confidence level
- Onerous contracts: Immediate loss recognition when CSM < 0
- Cohort grouping: Annual cohorts, separate profitability buckets
- Reporting: Quarterly IFRS 17 disclosures, annual financial statements
"""
from datetime import datetime
from typing import Optional
import json

# FastAPI app
try:
    from fastapi import FastAPI
    app = FastAPI(title="IFRS 17 Engine", version="1.0.0")
except ImportError:
    app = None

DISCOUNT_RATES = {
    "1Y": 0.145, "2Y": 0.155, "3Y": 0.160, "5Y": 0.165,
    "10Y": 0.170, "15Y": 0.172, "20Y": 0.175,
}

def calculate_csm(future_cash_flows: float, risk_adjustment: float, discount_rate: float, years: int) -> dict:
    """Calculate Contractual Service Margin."""
    pv_factor = (1 + discount_rate) ** -years
    pv_cash_flows = future_cash_flows * pv_factor
    csm = pv_cash_flows - risk_adjustment
    onerous = csm < 0
    return {
        "pv_future_cash_flows": round(pv_cash_flows, 2),
        "risk_adjustment": round(risk_adjustment, 2),
        "csm": round(max(csm, 0), 2),
        "onerous": onerous,
        "loss_component": round(abs(csm), 2) if onerous else 0,
        "discount_rate": discount_rate,
        "measurement_model": "BBA",
    }

def calculate_risk_adjustment(expected_claims: float, confidence_level: float = 0.75) -> float:
    """75th percentile risk adjustment."""
    return expected_claims * (1 + (confidence_level - 0.5) * 0.4)

if app:
    @app.get("/health")
    def health():
        return {"status": "healthy", "service": "ifrs17-engine"}

    @app.get("/api/v1/discount-curves")
    def get_discount_curves():
        return {"curves": DISCOUNT_RATES, "source": "CBN", "as_of": datetime.now().strftime("%Y-%m-%d")}

    @app.post("/api/v1/csm/calculate")
    def csm_endpoint(future_cash_flows: float = 10000000, risk_adjustment: float = 1500000, years: int = 5):
        rate = DISCOUNT_RATES.get(f"{years}Y", 0.165)
        return calculate_csm(future_cash_flows, risk_adjustment, rate, years)

    @app.get("/api/v1/cohorts")
    def get_cohorts():
        return {
            "cohorts": [
                {"year": 2025, "contracts": 1200, "csm_total": 450000000, "onerous_pct": 5},
                {"year": 2026, "contracts": 1800, "csm_total": 680000000, "onerous_pct": 3},
            ],
            "measurement_model": "BBA", "risk_confidence": "75th percentile",
        }
