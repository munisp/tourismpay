"""
TourismPay Tax Compliance & Reporting Service (Python)
Handles tax compliance reporting, jurisdiction configuration, remittance tracking,
and ML-based tipping recommendations.
"""
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from pydantic import BaseModel
import json
import math

try:
    from . import db as database
except ImportError:
    try:
        import db as database
    except ImportError:
        database = None


# ─── Jurisdiction Tax Configuration ─────────────────────────────────────────

JURISDICTION_TAX_CONFIG: Dict[str, Dict[str, Any]] = {
    "NG": {
        "name": "Nigeria",
        "currency": "NGN",
        "tax_authority": "Federal Inland Revenue Service (FIRS)",
        "vat_rate": 7.5,
        "tourism_levy_rate": 5.0,
        "withholding_tax_rate": 10.0,
        "digital_service_tax": 6.0,
        "filing_frequency": "monthly",
        "vat_registration_threshold": 25_000_000,  # ₦25M annual turnover
        "remittance_deadline_days": 21,  # 21st of following month
        "penalties": {
            "late_filing_pct": 10.0,
            "late_payment_interest_annual": 21.0,
            "max_penalty_pct": 50.0,
        },
        "exemptions": ["export_services", "medical", "educational"],
        "special_rates": {
            "accommodation": {"tourism_levy": 5.0, "service_charge": 5.0},
            "food": {"vat": 7.5},
            "transport": {"vat": 7.5},
        },
    },
    "KE": {
        "name": "Kenya",
        "currency": "KES",
        "tax_authority": "Kenya Revenue Authority (KRA)",
        "vat_rate": 16.0,
        "tourism_levy_rate": 2.0,
        "digital_service_tax": 1.5,
        "catering_levy": 2.0,
        "excise_alcohol": 20.0,
        "filing_frequency": "monthly",
        "vat_registration_threshold": 5_000_000,  # KES 5M annual
        "remittance_deadline_days": 20,
        "penalties": {
            "late_filing_flat": 10000,
            "late_payment_interest_annual": 24.0,
            "max_penalty_pct": 25.0,
        },
        "exemptions": ["basic_food", "agricultural_inputs", "medical"],
        "special_rates": {
            "accommodation": {"tourism_fund": 2.0},
            "food": {"catering_levy": 2.0},
        },
    },
    "GH": {
        "name": "Ghana",
        "currency": "GHS",
        "tax_authority": "Ghana Revenue Authority (GRA)",
        "vat_rate": 15.0,
        "nhil_rate": 2.5,
        "getfund_rate": 2.5,
        "covid_levy_rate": 1.0,
        "tourism_levy_rate": 1.0,
        "filing_frequency": "monthly",
        "vat_registration_threshold": 200_000,  # GHS 200K
        "remittance_deadline_days": 30,
        "penalties": {
            "late_filing_pct": 5.0,
            "late_payment_interest_annual": 18.0,
        },
        "exemptions": ["basic_food", "medical", "water"],
        "effective_rate": 21.0,  # VAT + NHIL + GETFund + COVID
    },
    "ZA": {
        "name": "South Africa",
        "currency": "ZAR",
        "tax_authority": "South African Revenue Service (SARS)",
        "vat_rate": 15.0,
        "tourism_levy_rate": 1.0,
        "filing_frequency": "bi-monthly",
        "vat_registration_threshold": 1_000_000,  # ZAR 1M
        "remittance_deadline_days": 25,
        "penalties": {
            "late_filing_pct": 10.0,
            "late_payment_interest_annual": 10.5,
        },
        "exemptions": ["basic_food_items", "public_transport"],
        "zero_rated": ["exports", "fuel_levy_goods", "basic_food"],
    },
    "TZ": {
        "name": "Tanzania",
        "currency": "TZS",
        "tax_authority": "Tanzania Revenue Authority (TRA)",
        "vat_rate": 18.0,
        "tourism_levy_rate": 1.5,
        "skills_levy_rate": 4.5,
        "filing_frequency": "monthly",
        "vat_registration_threshold": 200_000_000,  # TZS 200M
        "remittance_deadline_days": 20,
        "penalties": {
            "late_filing_pct": 5.0,
            "late_payment_interest_annual": 15.0,
        },
    },
    "RW": {
        "name": "Rwanda",
        "currency": "RWF",
        "tax_authority": "Rwanda Revenue Authority (RRA)",
        "vat_rate": 18.0,
        "tourism_revenue_share": 5.0,
        "filing_frequency": "monthly",
        "vat_registration_threshold": 20_000_000,  # RWF 20M
        "remittance_deadline_days": 15,
        "penalties": {
            "late_filing_pct": 20.0,
            "late_payment_interest_annual": 18.0,
        },
    },
    "EG": {
        "name": "Egypt",
        "currency": "EGP",
        "tax_authority": "Egyptian Tax Authority (ETA)",
        "vat_rate": 14.0,
        "service_tax_rate": 12.0,
        "filing_frequency": "monthly",
        "vat_registration_threshold": 500_000,  # EGP 500K
        "remittance_deadline_days": 15,
        "penalties": {
            "late_filing_pct": 3.0,
            "late_payment_interest_annual": 12.0,
        },
        "special_rates": {
            "accommodation": {"service_tax": 12.0},
        },
    },
    "MA": {
        "name": "Morocco",
        "currency": "MAD",
        "tax_authority": "Direction Générale des Impôts (DGI)",
        "vat_rate": 20.0,
        "city_tax_flat": 25.0,  # MAD per night
        "tourism_promotion_rate": 2.0,
        "filing_frequency": "quarterly",
        "vat_registration_threshold": 500_000,  # MAD 500K
        "remittance_deadline_days": 30,
        "penalties": {
            "late_filing_pct": 15.0,
            "late_payment_interest_annual": 6.0,
        },
    },
    "UG": {
        "name": "Uganda",
        "currency": "UGX",
        "tax_authority": "Uganda Revenue Authority (URA)",
        "vat_rate": 18.0,
        "tourism_levy_rate": 1.5,
        "filing_frequency": "monthly",
        "vat_registration_threshold": 150_000_000,  # UGX 150M
        "remittance_deadline_days": 15,
        "penalties": {
            "late_filing_pct": 2.0,
            "late_payment_interest_annual": 24.0,
        },
    },
    "ET": {
        "name": "Ethiopia",
        "currency": "ETB",
        "tax_authority": "Ethiopian Revenues and Customs Authority",
        "vat_rate": 15.0,
        "turnover_tax_rate": 2.0,
        "filing_frequency": "monthly",
        "vat_registration_threshold": 500_000,  # ETB 500K
        "remittance_deadline_days": 30,
        "penalties": {
            "late_filing_pct": 5.0,
            "late_payment_interest_annual": 25.0,
        },
    },
}


# ─── Models ──────────────────────────────────────────────────────────────────

class TaxReportRequest(BaseModel):
    jurisdiction_code: str
    merchant_id: str
    period_start: str  # ISO date
    period_end: str
    transactions: List[Dict[str, Any]]


class TaxReportResponse(BaseModel):
    jurisdiction: str
    merchant_id: str
    period: str
    total_taxable: float
    total_tax_collected: float
    breakdown_by_type: Dict[str, float]
    filing_deadline: str
    tax_authority: str
    penalties_if_late: Dict[str, Any]
    status: str
    receipt_numbers: List[str]


class TipRecommendationRequest(BaseModel):
    jurisdiction_code: str
    bill_amount: float
    service_category: str  # "restaurant", "safari", "hotel", "transport"
    service_rating: Optional[int] = None  # 1-5
    party_size: Optional[int] = 1
    is_tourist: bool = True


class TipRecommendation(BaseModel):
    suggested_percentage: float
    suggested_amount: float
    cultural_context: str
    min_appropriate: float
    max_generous: float
    service_specific_note: str
    currency: str


class ComplianceCheckResult(BaseModel):
    jurisdiction: str
    is_compliant: bool
    issues: List[str]
    next_filing_deadline: str
    amount_due: float
    currency: str
    recommendations: List[str]


# ─── Tax Compliance Functions ────────────────────────────────────────────────

def generate_tax_report(req: TaxReportRequest) -> TaxReportResponse:
    """Generate a tax compliance report for a merchant in a jurisdiction."""
    config = JURISDICTION_TAX_CONFIG.get(req.jurisdiction_code.upper())
    if not config:
        raise ValueError(f"Unsupported jurisdiction: {req.jurisdiction_code}")

    total_taxable = 0.0
    total_tax = 0.0
    breakdown: Dict[str, float] = {}

    for tx in req.transactions:
        amount = float(tx.get("amount", 0))
        category = tx.get("category", "general")
        total_taxable += amount

        # Calculate VAT
        vat_rate = config["vat_rate"]
        vat_amount = round(amount * vat_rate / 100, 2)
        breakdown["VAT"] = breakdown.get("VAT", 0) + vat_amount
        total_tax += vat_amount

        # Category-specific taxes
        special = config.get("special_rates", {}).get(category, {})
        for tax_name, rate in special.items():
            if tax_name != "vat":
                tax_amount = round(amount * rate / 100, 2)
                breakdown[tax_name] = breakdown.get(tax_name, 0) + tax_amount
                total_tax += tax_amount

        # Tourism levy (if applicable)
        tourism_rate = config.get("tourism_levy_rate", 0)
        if tourism_rate > 0 and category in ("accommodation", "experience", "tourism"):
            tl_amount = round(amount * tourism_rate / 100, 2)
            breakdown["tourism_levy"] = breakdown.get("tourism_levy", 0) + tl_amount
            total_tax += tl_amount

    # Calculate filing deadline
    deadline_days = config.get("remittance_deadline_days", 21)
    period_end_dt = datetime.fromisoformat(req.period_end)
    next_month = period_end_dt.replace(day=1) + timedelta(days=32)
    filing_deadline = next_month.replace(day=min(deadline_days, 28)).isoformat()[:10]

    return TaxReportResponse(
        jurisdiction=req.jurisdiction_code.upper(),
        merchant_id=req.merchant_id,
        period=f"{req.period_start} to {req.period_end}",
        total_taxable=round(total_taxable, 2),
        total_tax_collected=round(total_tax, 2),
        breakdown_by_type=breakdown,
        filing_deadline=filing_deadline,
        tax_authority=config["tax_authority"],
        penalties_if_late=config.get("penalties", {}),
        status="pending_filing",
        receipt_numbers=[f"TAX-{req.jurisdiction_code.upper()}-{i}" for i in range(len(req.transactions))],
    )


def check_compliance(jurisdiction_code: str, merchant_id: str, collected: float, filed: float) -> ComplianceCheckResult:
    """Check if a merchant is compliant with tax obligations."""
    config = JURISDICTION_TAX_CONFIG.get(jurisdiction_code.upper())
    if not config:
        return ComplianceCheckResult(
            jurisdiction=jurisdiction_code,
            is_compliant=True,
            issues=["Unknown jurisdiction"],
            next_filing_deadline="N/A",
            amount_due=0,
            currency="USD",
            recommendations=["Verify jurisdiction code"],
        )

    issues = []
    recommendations = []
    amount_due = max(0, collected - filed)

    if amount_due > 0:
        issues.append(f"Outstanding tax liability: {config['currency']} {amount_due:,.2f}")
        recommendations.append("File and remit outstanding taxes immediately to avoid penalties")

    # Check if threshold is met
    threshold = config.get("vat_registration_threshold", 0)
    if threshold > 0:
        recommendations.append(
            f"VAT registration required at {config['currency']} {threshold:,.0f} annual turnover"
        )

    # Next deadline
    now = datetime.now()
    deadline_days = config.get("remittance_deadline_days", 21)
    next_month = now.replace(day=1) + timedelta(days=32)
    next_deadline = next_month.replace(day=min(deadline_days, 28)).isoformat()[:10]

    is_compliant = len(issues) == 0

    return ComplianceCheckResult(
        jurisdiction=jurisdiction_code.upper(),
        is_compliant=is_compliant,
        issues=issues,
        next_filing_deadline=next_deadline,
        amount_due=amount_due,
        currency=config["currency"],
        recommendations=recommendations,
    )


# ─── Tipping Recommendation Engine ──────────────────────────────────────────

TIPPING_PROFILES: Dict[str, Dict[str, Any]] = {
    "NG": {
        "base_pct": 12.0,
        "restaurant": {"min": 10, "max": 20, "note": "Service charge may be included in upscale restaurants"},
        "safari": {"min": 10, "max": 15, "note": "N/A for Nigeria"},
        "hotel": {"min": 5, "max": 15, "note": "₦500-₦2000 for porters, ₦1000-₦5000 for housekeeping daily"},
        "transport": {"min": 5, "max": 10, "note": "Round up for taxis, 10% for long rides"},
        "currency": "NGN",
    },
    "KE": {
        "base_pct": 12.0,
        "restaurant": {"min": 10, "max": 20, "note": "10% standard, 15-20% for exceptional service"},
        "safari": {"min": 15, "max": 25, "note": "$10-20 USD/day for guides, $5-10 for camp staff"},
        "hotel": {"min": 5, "max": 15, "note": "KES 200-500 for porters"},
        "transport": {"min": 5, "max": 10, "note": "Round up for short rides"},
        "currency": "KES",
    },
    "ZA": {
        "base_pct": 15.0,
        "restaurant": {"min": 10, "max": 20, "note": "10-15% is standard, 20% for excellent service"},
        "safari": {"min": 15, "max": 20, "note": "R100-200/day for guides, R50-100 for trackers"},
        "hotel": {"min": 10, "max": 15, "note": "R20-50 per bag for porters"},
        "transport": {"min": 10, "max": 15, "note": "10% for Uber/taxis, R20-50 for car guards"},
        "currency": "ZAR",
    },
    "GH": {
        "base_pct": 8.0,
        "restaurant": {"min": 5, "max": 15, "note": "5-10% is generous, service not always expected"},
        "safari": {"min": 10, "max": 15, "note": "GHS 20-50 for guides"},
        "hotel": {"min": 5, "max": 10, "note": "GHS 5-10 for porters"},
        "transport": {"min": 5, "max": 10, "note": "Round up for short rides"},
        "currency": "GHS",
    },
    "TZ": {
        "base_pct": 15.0,
        "restaurant": {"min": 10, "max": 20, "note": "10% standard in tourist areas"},
        "safari": {"min": 20, "max": 30, "note": "$15-20/day guides, $8-10/day porters (Kilimanjaro)"},
        "hotel": {"min": 5, "max": 15, "note": "$1-2 per bag for porters"},
        "transport": {"min": 5, "max": 10, "note": "Round up for short rides"},
        "currency": "TZS",
    },
    "EG": {
        "base_pct": 12.0,
        "restaurant": {"min": 10, "max": 20, "note": "Baksheesh culture — 10-15% even if service included"},
        "safari": {"min": 10, "max": 20, "note": "EGP 50-100 for temple/site guides"},
        "hotel": {"min": 10, "max": 15, "note": "EGP 20-50 for porters, EGP 50/day housekeeping"},
        "transport": {"min": 5, "max": 15, "note": "EGP 10-20 for short rides, round up always"},
        "currency": "EGP",
    },
    "MA": {
        "base_pct": 12.0,
        "restaurant": {"min": 10, "max": 15, "note": "10% standard, service may be included in tourist spots"},
        "safari": {"min": 10, "max": 20, "note": "MAD 50-100 for day-trip guides"},
        "hotel": {"min": 5, "max": 10, "note": "MAD 10-20 per bag for porters"},
        "transport": {"min": 5, "max": 10, "note": "Round up taxi fares to nearest MAD 10"},
        "currency": "MAD",
    },
    "RW": {
        "base_pct": 10.0,
        "restaurant": {"min": 10, "max": 15, "note": "10% is appropriate"},
        "safari": {"min": 15, "max": 25, "note": "$10-20 for gorilla trek guides per person"},
        "hotel": {"min": 5, "max": 10, "note": "RWF 1000-2000 for porters"},
        "transport": {"min": 5, "max": 10, "note": "Round up for moto-taxis"},
        "currency": "RWF",
    },
}


def recommend_tip(req: TipRecommendationRequest) -> TipRecommendation:
    """Generate an ML-informed tipping recommendation based on context."""
    code = req.jurisdiction_code.upper()
    profile = TIPPING_PROFILES.get(code)

    if not profile:
        # Default fallback
        return TipRecommendation(
            suggested_percentage=15.0,
            suggested_amount=round(req.bill_amount * 0.15, 2),
            cultural_context="Check local customs for appropriate tipping amounts.",
            min_appropriate=round(req.bill_amount * 0.10, 2),
            max_generous=round(req.bill_amount * 0.20, 2),
            service_specific_note="Standard tipping range is 10-20%.",
            currency="USD",
        )

    # Get category-specific rates
    cat_profile = profile.get(req.service_category, profile.get("restaurant", {}))
    base_pct = profile["base_pct"]
    min_pct = cat_profile.get("min", 10)
    max_pct = cat_profile.get("max", 20)
    note = cat_profile.get("note", "")

    # Adjust based on service rating (ML-like scoring)
    rating_adjustment = 0.0
    if req.service_rating:
        # Scale: 1 star = -3%, 2 = -1.5%, 3 = 0%, 4 = +2%, 5 = +4%
        rating_adjustment = (req.service_rating - 3) * 1.5

    # Adjust for tourist premium (tourists tend to tip more generously)
    tourist_adjustment = 2.0 if req.is_tourist else 0.0

    # Adjust for party size (larger groups often tip higher percentage)
    party_adjustment = min(3.0, (req.party_size - 1) * 0.5) if req.party_size > 1 else 0.0

    suggested_pct = round(base_pct + rating_adjustment + tourist_adjustment + party_adjustment, 1)
    suggested_pct = max(min_pct, min(max_pct, suggested_pct))

    suggested_amount = round(req.bill_amount * suggested_pct / 100, 2)
    min_amount = round(req.bill_amount * min_pct / 100, 2)
    max_amount = round(req.bill_amount * max_pct / 100, 2)

    cultural_context = f"In {JURISDICTION_TAX_CONFIG.get(code, {}).get('name', code)}, "
    if code == "EG":
        cultural_context += "baksheesh (tipping) is deeply embedded in the culture and expected for most services."
    elif code == "ZA":
        cultural_context += "tipping is an important part of the service economy and many workers rely on tips."
    elif code == "TZ":
        cultural_context += "tipping is especially important for safari and tourism services."
    else:
        cultural_context += f"tipping {min_pct}-{max_pct}% is customary for {req.service_category} services."

    return TipRecommendation(
        suggested_percentage=suggested_pct,
        suggested_amount=suggested_amount,
        cultural_context=cultural_context,
        min_appropriate=min_amount,
        max_generous=max_amount,
        service_specific_note=note,
        currency=profile["currency"],
    )


async def get_jurisdiction_config(code: str) -> Dict[str, Any]:
    """Get full tax configuration for a jurisdiction (DB-first, fallback to defaults)."""
    if database is not None:
        row = await database.fetchrow(
            "SELECT config_json FROM jurisdiction_tax_configs WHERE code=$1", code.upper()
        )
        if row and row.get("config_json"):
            return json.loads(row["config_json"])
    config = JURISDICTION_TAX_CONFIG.get(code.upper())
    if not config:
        return {"error": f"Unsupported jurisdiction: {code}", "supported": list(JURISDICTION_TAX_CONFIG.keys())}
    return config


async def get_all_jurisdictions() -> List[Dict[str, Any]]:
    """Get summary of all supported jurisdictions (DB-first, fallback to defaults)."""
    if database is not None:
        rows = await database.fetch(
            "SELECT code, config_json FROM jurisdiction_tax_configs ORDER BY code"
        )
        if rows:
            result = []
            for row in rows:
                config = json.loads(row["config_json"])
                result.append({
                    "code": row["code"],
                    "name": config.get("name", row["code"]),
                    "currency": config.get("currency", "USD"),
                    "vat_rate": config.get("vat_rate", 0),
                    "tax_authority": config.get("tax_authority", ""),
                    "filing_frequency": config.get("filing_frequency", "monthly"),
                    "total_effective_rate": config.get("effective_rate", config.get("vat_rate", 0)),
                })
            return result
    result = []
    for code, config in JURISDICTION_TAX_CONFIG.items():
        result.append({
            "code": code,
            "name": config["name"],
            "currency": config["currency"],
            "vat_rate": config["vat_rate"],
            "tax_authority": config["tax_authority"],
            "filing_frequency": config.get("filing_frequency", "monthly"),
            "total_effective_rate": config.get("effective_rate", config["vat_rate"]),
        })
    return result


async def seed_jurisdiction_configs_to_db():
    """Seed default jurisdiction configs to PostgreSQL."""
    if database is None:
        return
    await database.execute(
        """CREATE TABLE IF NOT EXISTS jurisdiction_tax_configs (
            code VARCHAR(10) PRIMARY KEY,
            config_json TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"""
    )
    for code, config in JURISDICTION_TAX_CONFIG.items():
        await database.execute(
            "INSERT INTO jurisdiction_tax_configs (code, config_json) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING",
            code, json.dumps(config),
        )
    for code, profile in TIPPING_PROFILES.items():
        await database.execute(
            "INSERT INTO jurisdiction_tax_configs (code, config_json) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET config_json = $2",
            f"TIP_{code}", json.dumps(profile),
        )
