"""
Role-Based Operational Reports Service
Generates daily operational reports for all stakeholders
"""

import json
from datetime import datetime, timedelta, date
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, asdict
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class UserRole(str, Enum):
    UNDERWRITER = "underwriter"
    CLAIMS_ADJUSTER = "claims_adjuster"
    AGENT = "agent"
    FINANCE = "finance"
    COMPLIANCE = "compliance"
    EXECUTIVE = "executive"
    ACTUARY = "actuary"
    CUSTOMER_SERVICE = "customer_service"
    BOARD = "board"
    REGULATOR = "regulator"
    REINSURER = "reinsurer"


class ReportFrequency(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    ANNUAL = "annual"


@dataclass
class ReportMetric:
    name: str
    value: Any
    unit: str
    trend: Optional[str] = None
    trend_value: Optional[float] = None
    target: Optional[float] = None
    status: Optional[str] = None


@dataclass
class ReportSection:
    title: str
    metrics: List[ReportMetric]
    charts: Optional[List[Dict[str, Any]]] = None
    tables: Optional[List[Dict[str, Any]]] = None
    alerts: Optional[List[str]] = None


@dataclass
class OperationalReport:
    report_id: str
    role: UserRole
    report_date: str
    frequency: ReportFrequency
    title: str
    sections: List[ReportSection]
    generated_at: str
    next_refresh: str


class OperationalReportsService:
    """
    Service for generating role-based operational reports
    Integrates with Lakehouse for analytics data
    """
    
    def __init__(self, lakehouse_config: Dict[str, Any] = None):
        self.lakehouse_config = lakehouse_config or {}
        self.report_generators = {
            UserRole.UNDERWRITER: self._generate_underwriter_report,
            UserRole.CLAIMS_ADJUSTER: self._generate_claims_adjuster_report,
            UserRole.AGENT: self._generate_agent_report,
            UserRole.FINANCE: self._generate_finance_report,
            UserRole.COMPLIANCE: self._generate_compliance_report,
            UserRole.EXECUTIVE: self._generate_executive_report,
            UserRole.ACTUARY: self._generate_actuary_report,
            UserRole.CUSTOMER_SERVICE: self._generate_customer_service_report,
            UserRole.BOARD: self._generate_board_report,
            UserRole.REGULATOR: self._generate_regulator_report,
            UserRole.REINSURER: self._generate_reinsurer_report,
        }
    
    async def generate_report(
        self,
        role: UserRole,
        report_date: Optional[date] = None,
        frequency: ReportFrequency = ReportFrequency.DAILY
    ) -> OperationalReport:
        """Generate operational report for a specific role"""
        report_date = report_date or date.today()
        generator = self.report_generators.get(role)
        
        if not generator:
            raise ValueError(f"No report generator for role: {role}")
        
        return await generator(report_date, frequency)
    
    async def _generate_underwriter_report(
        self,
        report_date: date,
        frequency: ReportFrequency
    ) -> OperationalReport:
        """Generate daily underwriting operations report"""
        
        sections = [
            ReportSection(
                title="Application Queue",
                metrics=[
                    ReportMetric("New Applications", 47, "count", "up", 12.5),
                    ReportMetric("Pending Review", 23, "count", "down", -8.0),
                    ReportMetric("Awaiting Documents", 15, "count", "stable", 0),
                    ReportMetric("Auto-Approved", 31, "count", "up", 15.2),
                ],
                alerts=[
                    "5 high-value applications (>₦50M) require senior review",
                    "3 applications approaching SLA deadline (24h remaining)"
                ]
            ),
            ReportSection(
                title="Risk Assessment",
                metrics=[
                    ReportMetric("Avg Risk Score", 42.3, "score", "stable", 0.5),
                    ReportMetric("High Risk Applications", 8, "count", "up", 2),
                    ReportMetric("Fraud Alerts", 3, "count", "down", -1),
                    ReportMetric("Manual Review Required", 12, "count", "up", 4),
                ],
                charts=[
                    {"type": "pie", "title": "Risk Distribution", "data": {
                        "Low": 45, "Medium": 35, "High": 15, "Critical": 5
                    }}
                ]
            ),
            ReportSection(
                title="Performance Metrics",
                metrics=[
                    ReportMetric("Approval Rate", 78.5, "%", "up", 2.3, target=80.0),
                    ReportMetric("Avg Processing Time", 4.2, "hours", "down", -0.8, target=4.0),
                    ReportMetric("SLA Compliance", 94.2, "%", "up", 1.5, target=95.0),
                    ReportMetric("Referral Rate", 15.3, "%", "stable", 0.2),
                ]
            ),
            ReportSection(
                title="Product Mix",
                metrics=[
                    ReportMetric("Motor Insurance", 35, "%"),
                    ReportMetric("Health Insurance", 28, "%"),
                    ReportMetric("Life Insurance", 22, "%"),
                    ReportMetric("Property Insurance", 10, "%"),
                    ReportMetric("Other", 5, "%"),
                ],
                tables=[{
                    "title": "Top Applications by Premium",
                    "columns": ["Application ID", "Customer", "Product", "Premium", "Risk Score"],
                    "rows": [
                        ["APP-2024-001", "ABC Corp", "Group Health", "₦125M", "Medium"],
                        ["APP-2024-002", "XYZ Ltd", "Property", "₦89M", "Low"],
                        ["APP-2024-003", "DEF Inc", "Fleet Motor", "₦67M", "Medium"],
                    ]
                }]
            )
        ]
        
        return OperationalReport(
            report_id=f"UW-{report_date.isoformat()}-{frequency.value}",
            role=UserRole.UNDERWRITER,
            report_date=report_date.isoformat(),
            frequency=frequency,
            title="Underwriting Operations Dashboard",
            sections=sections,
            generated_at=datetime.utcnow().isoformat(),
            next_refresh=(datetime.utcnow() + timedelta(hours=1)).isoformat()
        )
    
    async def _generate_claims_adjuster_report(
        self,
        report_date: date,
        frequency: ReportFrequency
    ) -> OperationalReport:
        """Generate daily claims operations report"""
        
        sections = [
            ReportSection(
                title="Claims Queue",
                metrics=[
                    ReportMetric("New Claims Today", 28, "count", "up", 8.5),
                    ReportMetric("Open Claims", 156, "count", "down", -3.2),
                    ReportMetric("Pending Investigation", 34, "count", "stable", 0),
                    ReportMetric("Ready for Settlement", 22, "count", "up", 5),
                ],
                alerts=[
                    "2 claims flagged for potential fraud investigation",
                    "8 claims approaching 30-day SLA deadline"
                ]
            ),
            ReportSection(
                title="Fraud Detection",
                metrics=[
                    ReportMetric("Fraud Alerts", 7, "count", "up", 2),
                    ReportMetric("Confirmed Fraud", 2, "count", "stable", 0),
                    ReportMetric("False Positives", 3, "count", "down", -1),
                    ReportMetric("Under Investigation", 5, "count", "up", 1),
                ],
                charts=[
                    {"type": "bar", "title": "Fraud by Type", "data": {
                        "Document Forgery": 3, "Staged Accident": 2, 
                        "Inflated Claim": 4, "Identity Fraud": 1
                    }}
                ]
            ),
            ReportSection(
                title="Settlement Metrics",
                metrics=[
                    ReportMetric("Claims Settled Today", 18, "count"),
                    ReportMetric("Total Settlement Value", 45.6, "₦M"),
                    ReportMetric("Avg Settlement Time", 12.3, "days", "down", -1.2, target=10.0),
                    ReportMetric("Settlement Ratio", 92.5, "%", "up", 0.8),
                ],
                tables=[{
                    "title": "High-Value Claims Pending",
                    "columns": ["Claim ID", "Policy", "Amount", "Status", "Days Open"],
                    "rows": [
                        ["CLM-2024-089", "POL-12345", "₦15.2M", "Investigation", 18],
                        ["CLM-2024-092", "POL-23456", "₦12.8M", "Documentation", 12],
                        ["CLM-2024-095", "POL-34567", "₦9.5M", "Assessment", 8],
                    ]
                }]
            ),
            ReportSection(
                title="Claims by Category",
                metrics=[
                    ReportMetric("Motor Accidents", 45, "%"),
                    ReportMetric("Health Claims", 30, "%"),
                    ReportMetric("Property Damage", 15, "%"),
                    ReportMetric("Life Claims", 7, "%"),
                    ReportMetric("Other", 3, "%"),
                ]
            )
        ]
        
        return OperationalReport(
            report_id=f"CA-{report_date.isoformat()}-{frequency.value}",
            role=UserRole.CLAIMS_ADJUSTER,
            report_date=report_date.isoformat(),
            frequency=frequency,
            title="Claims Operations Dashboard",
            sections=sections,
            generated_at=datetime.utcnow().isoformat(),
            next_refresh=(datetime.utcnow() + timedelta(hours=1)).isoformat()
        )
    
    async def _generate_agent_report(
        self,
        report_date: date,
        frequency: ReportFrequency
    ) -> OperationalReport:
        """Generate daily agent/sales report"""
        
        sections = [
            ReportSection(
                title="Sales Pipeline",
                metrics=[
                    ReportMetric("New Leads", 34, "count", "up", 15.2),
                    ReportMetric("Qualified Prospects", 18, "count", "up", 8.5),
                    ReportMetric("Proposals Sent", 12, "count", "stable", 0),
                    ReportMetric("Policies Issued", 8, "count", "up", 3),
                ],
                charts=[
                    {"type": "funnel", "title": "Sales Funnel", "data": {
                        "Leads": 100, "Qualified": 53, "Proposal": 35, "Closed": 24
                    }}
                ]
            ),
            ReportSection(
                title="Commission Tracking",
                metrics=[
                    ReportMetric("MTD Commission", 2.45, "₦M", "up", 12.3),
                    ReportMetric("Pending Commission", 0.85, "₦M"),
                    ReportMetric("YTD Commission", 18.7, "₦M", "up", 22.5),
                    ReportMetric("Commission Rate", 12.5, "%"),
                ]
            ),
            ReportSection(
                title="Policy Renewals",
                metrics=[
                    ReportMetric("Due This Month", 45, "count"),
                    ReportMetric("Renewed", 32, "count", "up", 5),
                    ReportMetric("Lapsed", 5, "count", "down", -2),
                    ReportMetric("Renewal Rate", 86.5, "%", "up", 2.3, target=90.0),
                ],
                alerts=[
                    "13 high-value policies due for renewal this week",
                    "5 customers have not responded to renewal notices"
                ]
            ),
            ReportSection(
                title="Customer Retention",
                metrics=[
                    ReportMetric("Active Customers", 342, "count"),
                    ReportMetric("New Customers MTD", 28, "count", "up", 8),
                    ReportMetric("Churned Customers", 5, "count", "down", -2),
                    ReportMetric("Retention Rate", 94.2, "%", "up", 1.1, target=95.0),
                ]
            )
        ]
        
        return OperationalReport(
            report_id=f"AG-{report_date.isoformat()}-{frequency.value}",
            role=UserRole.AGENT,
            report_date=report_date.isoformat(),
            frequency=frequency,
            title="Agent Sales Dashboard",
            sections=sections,
            generated_at=datetime.utcnow().isoformat(),
            next_refresh=(datetime.utcnow() + timedelta(hours=1)).isoformat()
        )
    
    async def _generate_finance_report(
        self,
        report_date: date,
        frequency: ReportFrequency
    ) -> OperationalReport:
        """Generate daily finance operations report"""
        
        sections = [
            ReportSection(
                title="Premium Collections",
                metrics=[
                    ReportMetric("Collected Today", 125.6, "₦M", "up", 8.5),
                    ReportMetric("MTD Collections", 2.85, "₦B", "up", 12.3),
                    ReportMetric("Outstanding Premiums", 456.2, "₦M", "down", -5.2),
                    ReportMetric("Collection Rate", 94.5, "%", "up", 1.2, target=95.0),
                ]
            ),
            ReportSection(
                title="Claims Payouts",
                metrics=[
                    ReportMetric("Paid Today", 45.6, "₦M"),
                    ReportMetric("MTD Payouts", 1.23, "₦B"),
                    ReportMetric("Pending Payouts", 234.5, "₦M"),
                    ReportMetric("Avg Payout Time", 3.2, "days", "down", -0.5, target=3.0),
                ]
            ),
            ReportSection(
                title="Cash Flow",
                metrics=[
                    ReportMetric("Net Cash Flow", 80.0, "₦M", "up", 15.2),
                    ReportMetric("Operating Cash", 1.56, "₦B"),
                    ReportMetric("Investment Income", 12.3, "₦M"),
                    ReportMetric("Liquidity Ratio", 1.85, "ratio", "stable", 0, target=1.5),
                ],
                charts=[
                    {"type": "line", "title": "Daily Cash Flow (30 days)", "data": "cash_flow_trend"}
                ]
            ),
            ReportSection(
                title="Reserve Adequacy",
                metrics=[
                    ReportMetric("Claims Reserve", 4.56, "₦B"),
                    ReportMetric("IBNR Reserve", 1.23, "₦B"),
                    ReportMetric("Reserve Ratio", 125.5, "%", "up", 2.3, target=120.0),
                    ReportMetric("Solvency Margin", 185.2, "%", "stable", 0.5, target=150.0),
                ],
                alerts=[
                    "Motor claims reserve approaching threshold - review recommended",
                    "Q4 reinsurance premium due in 15 days"
                ]
            )
        ]
        
        return OperationalReport(
            report_id=f"FN-{report_date.isoformat()}-{frequency.value}",
            role=UserRole.FINANCE,
            report_date=report_date.isoformat(),
            frequency=frequency,
            title="Finance Operations Dashboard",
            sections=sections,
            generated_at=datetime.utcnow().isoformat(),
            next_refresh=(datetime.utcnow() + timedelta(hours=1)).isoformat()
        )
    
    async def _generate_compliance_report(
        self,
        report_date: date,
        frequency: ReportFrequency
    ) -> OperationalReport:
        """Generate daily compliance operations report"""
        
        sections = [
            ReportSection(
                title="KYC/KYB Status",
                metrics=[
                    ReportMetric("Pending KYC", 45, "count", "down", -8),
                    ReportMetric("Completed Today", 32, "count", "up", 12),
                    ReportMetric("Failed Verification", 5, "count", "stable", 0),
                    ReportMetric("KYC Completion Rate", 92.5, "%", "up", 1.5, target=95.0),
                ],
                alerts=[
                    "12 high-risk customers require enhanced due diligence",
                    "3 corporate accounts pending CAC verification"
                ]
            ),
            ReportSection(
                title="AML Screening",
                metrics=[
                    ReportMetric("Screenings Today", 156, "count"),
                    ReportMetric("Alerts Generated", 8, "count", "up", 2),
                    ReportMetric("False Positives", 5, "count"),
                    ReportMetric("Escalated Cases", 3, "count", "up", 1),
                ],
                charts=[
                    {"type": "pie", "title": "Alert Categories", "data": {
                        "PEP Match": 3, "Sanctions": 1, "Adverse Media": 2, "High Risk Country": 2
                    }}
                ]
            ),
            ReportSection(
                title="Regulatory Deadlines",
                metrics=[
                    ReportMetric("Upcoming Filings", 4, "count"),
                    ReportMetric("Days to Next Deadline", 12, "days"),
                    ReportMetric("Overdue Items", 0, "count", "stable", 0),
                    ReportMetric("Filing Compliance", 100, "%", "stable", 0, target=100.0),
                ],
                tables=[{
                    "title": "Upcoming Regulatory Deadlines",
                    "columns": ["Filing", "Regulator", "Due Date", "Status"],
                    "rows": [
                        ["Quarterly Returns", "NAICOM", "2024-03-31", "In Progress"],
                        ["AML Report", "NFIU", "2024-03-15", "Pending"],
                        ["Solvency Report", "NAICOM", "2024-04-15", "Not Started"],
                    ]
                }]
            ),
            ReportSection(
                title="Audit Trail",
                metrics=[
                    ReportMetric("Policy Changes", 234, "count"),
                    ReportMetric("User Access Logs", 1256, "count"),
                    ReportMetric("Data Exports", 12, "count"),
                    ReportMetric("Suspicious Activities", 2, "count", "down", -1),
                ]
            )
        ]
        
        return OperationalReport(
            report_id=f"CO-{report_date.isoformat()}-{frequency.value}",
            role=UserRole.COMPLIANCE,
            report_date=report_date.isoformat(),
            frequency=frequency,
            title="Compliance Operations Dashboard",
            sections=sections,
            generated_at=datetime.utcnow().isoformat(),
            next_refresh=(datetime.utcnow() + timedelta(hours=1)).isoformat()
        )
    
    async def _generate_executive_report(
        self,
        report_date: date,
        frequency: ReportFrequency
    ) -> OperationalReport:
        """Generate executive summary report"""
        
        sections = [
            ReportSection(
                title="Key Performance Indicators",
                metrics=[
                    ReportMetric("Gross Written Premium", 12.5, "₦B", "up", 18.5),
                    ReportMetric("Net Premium", 10.2, "₦B", "up", 15.2),
                    ReportMetric("Claims Ratio", 62.5, "%", "down", -2.3, target=65.0),
                    ReportMetric("Combined Ratio", 92.5, "%", "down", -1.8, target=95.0),
                ],
                charts=[
                    {"type": "line", "title": "GWP Trend (12 months)", "data": "gwp_trend"}
                ]
            ),
            ReportSection(
                title="Profitability",
                metrics=[
                    ReportMetric("Underwriting Profit", 856.2, "₦M", "up", 22.5),
                    ReportMetric("Investment Income", 234.5, "₦M", "up", 8.5),
                    ReportMetric("Operating Profit", 1.09, "₦B", "up", 18.2),
                    ReportMetric("ROE", 18.5, "%", "up", 2.3, target=15.0),
                ]
            ),
            ReportSection(
                title="Growth Metrics",
                metrics=[
                    ReportMetric("New Policies", 2345, "count", "up", 15.2),
                    ReportMetric("Policy Retention", 89.5, "%", "up", 1.2, target=90.0),
                    ReportMetric("Market Share", 8.5, "%", "up", 0.5),
                    ReportMetric("Customer Growth", 12.5, "%", "up", 2.3),
                ]
            ),
            ReportSection(
                title="Risk Overview",
                metrics=[
                    ReportMetric("Solvency Ratio", 185.2, "%", "stable", 0.5, target=150.0),
                    ReportMetric("Capital Adequacy", 225.5, "%", "up", 5.2, target=200.0),
                    ReportMetric("Reinsurance Coverage", 45.5, "%"),
                    ReportMetric("Catastrophe Exposure", 2.5, "₦B"),
                ],
                alerts=[
                    "Q4 results exceed budget by 12%",
                    "New product launch on track for March"
                ]
            )
        ]
        
        return OperationalReport(
            report_id=f"EX-{report_date.isoformat()}-{frequency.value}",
            role=UserRole.EXECUTIVE,
            report_date=report_date.isoformat(),
            frequency=frequency,
            title="Executive Dashboard",
            sections=sections,
            generated_at=datetime.utcnow().isoformat(),
            next_refresh=(datetime.utcnow() + timedelta(hours=4)).isoformat()
        )
    
    async def _generate_actuary_report(
        self,
        report_date: date,
        frequency: ReportFrequency
    ) -> OperationalReport:
        """Generate actuarial analysis report"""
        
        sections = [
            ReportSection(
                title="Claims Experience",
                metrics=[
                    ReportMetric("Claims Frequency", 4.2, "%", "up", 0.3),
                    ReportMetric("Avg Claim Severity", 2.85, "₦M", "up", 5.2),
                    ReportMetric("Loss Development", 1.05, "factor"),
                    ReportMetric("Ultimate Loss Ratio", 64.5, "%", "up", 1.2),
                ],
                charts=[
                    {"type": "triangle", "title": "Loss Development Triangle", "data": "loss_triangle"}
                ]
            ),
            ReportSection(
                title="Reserve Analysis",
                metrics=[
                    ReportMetric("Case Reserves", 3.45, "₦B"),
                    ReportMetric("IBNR", 1.23, "₦B", "up", 8.5),
                    ReportMetric("Reserve Adequacy", 105.2, "%", "stable", 0.5, target=100.0),
                    ReportMetric("Reserve Margin", 234.5, "₦M"),
                ]
            ),
            ReportSection(
                title="Pricing Adequacy",
                metrics=[
                    ReportMetric("Motor - Adequacy", 102.5, "%", "stable", 0),
                    ReportMetric("Health - Adequacy", 98.5, "%", "down", -1.5),
                    ReportMetric("Property - Adequacy", 105.2, "%", "up", 2.3),
                    ReportMetric("Life - Adequacy", 101.2, "%", "stable", 0.2),
                ],
                alerts=[
                    "Health insurance pricing review recommended - loss ratio trending up",
                    "Motor third-party rates may need adjustment in Q2"
                ]
            ),
            ReportSection(
                title="Risk Modeling",
                metrics=[
                    ReportMetric("VaR (99.5%)", 4.56, "₦B"),
                    ReportMetric("Expected Shortfall", 5.23, "₦B"),
                    ReportMetric("Catastrophe PML", 2.85, "₦B"),
                    ReportMetric("Model Confidence", 95.2, "%"),
                ],
                tables=[{
                    "title": "Scenario Analysis",
                    "columns": ["Scenario", "Probability", "Impact", "Capital Required"],
                    "rows": [
                        ["Base Case", "60%", "₦0", "₦2.5B"],
                        ["Adverse", "25%", "₦1.2B", "₦3.7B"],
                        ["Stress", "10%", "₦2.8B", "₦5.3B"],
                        ["Catastrophe", "5%", "₦5.5B", "₦8.0B"],
                    ]
                }]
            )
        ]
        
        return OperationalReport(
            report_id=f"AC-{report_date.isoformat()}-{frequency.value}",
            role=UserRole.ACTUARY,
            report_date=report_date.isoformat(),
            frequency=frequency,
            title="Actuarial Analysis Dashboard",
            sections=sections,
            generated_at=datetime.utcnow().isoformat(),
            next_refresh=(datetime.utcnow() + timedelta(hours=24)).isoformat()
        )
    
    async def _generate_customer_service_report(
        self,
        report_date: date,
        frequency: ReportFrequency
    ) -> OperationalReport:
        """Generate customer service operations report"""
        
        sections = [
            ReportSection(
                title="Ticket Volume",
                metrics=[
                    ReportMetric("New Tickets", 156, "count", "up", 12.5),
                    ReportMetric("Open Tickets", 234, "count", "down", -5.2),
                    ReportMetric("Resolved Today", 142, "count", "up", 8.5),
                    ReportMetric("Escalated", 12, "count", "stable", 0),
                ],
                charts=[
                    {"type": "bar", "title": "Tickets by Channel", "data": {
                        "Phone": 45, "Email": 35, "Chat": 52, "WhatsApp": 24
                    }}
                ]
            ),
            ReportSection(
                title="Response Metrics",
                metrics=[
                    ReportMetric("Avg First Response", 2.5, "minutes", "down", -0.5, target=3.0),
                    ReportMetric("Avg Resolution Time", 4.2, "hours", "down", -0.8, target=4.0),
                    ReportMetric("First Contact Resolution", 78.5, "%", "up", 2.3, target=80.0),
                    ReportMetric("SLA Compliance", 94.5, "%", "up", 1.2, target=95.0),
                ]
            ),
            ReportSection(
                title="Customer Satisfaction",
                metrics=[
                    ReportMetric("CSAT Score", 4.2, "/5", "up", 0.1, target=4.5),
                    ReportMetric("NPS", 45, "score", "up", 3, target=50),
                    ReportMetric("Customer Effort Score", 2.8, "/5", "down", -0.2, target=2.5),
                    ReportMetric("Positive Feedback", 85.5, "%", "up", 2.3),
                ],
                alerts=[
                    "3 negative reviews require follow-up",
                    "VIP customer complaint pending resolution"
                ]
            ),
            ReportSection(
                title="Top Issues",
                metrics=[
                    ReportMetric("Claims Status", 35, "%"),
                    ReportMetric("Policy Changes", 25, "%"),
                    ReportMetric("Billing Inquiries", 20, "%"),
                    ReportMetric("New Quotes", 12, "%"),
                    ReportMetric("Other", 8, "%"),
                ]
            )
        ]
        
        return OperationalReport(
            report_id=f"CS-{report_date.isoformat()}-{frequency.value}",
            role=UserRole.CUSTOMER_SERVICE,
            report_date=report_date.isoformat(),
            frequency=frequency,
            title="Customer Service Dashboard",
            sections=sections,
            generated_at=datetime.utcnow().isoformat(),
            next_refresh=(datetime.utcnow() + timedelta(minutes=30)).isoformat()
        )
    
    async def _generate_board_report(
        self,
        report_date: date,
        frequency: ReportFrequency
    ) -> OperationalReport:
        """Generate board/investor report"""
        
        sections = [
            ReportSection(
                title="Financial Performance",
                metrics=[
                    ReportMetric("Revenue", 15.6, "₦B", "up", 22.5),
                    ReportMetric("Net Profit", 1.85, "₦B", "up", 18.2),
                    ReportMetric("Profit Margin", 11.9, "%", "up", 1.2),
                    ReportMetric("EPS", 12.5, "₦", "up", 15.5),
                ]
            ),
            ReportSection(
                title="Solvency & Capital",
                metrics=[
                    ReportMetric("Solvency Ratio", 185.2, "%", "stable", 0.5, target=150.0),
                    ReportMetric("Capital Adequacy", 225.5, "%", "up", 5.2, target=200.0),
                    ReportMetric("Shareholders Equity", 12.5, "₦B", "up", 8.5),
                    ReportMetric("Book Value/Share", 85.6, "₦", "up", 6.2),
                ]
            ),
            ReportSection(
                title="Growth Trajectory",
                metrics=[
                    ReportMetric("GWP Growth", 18.5, "%", "up", 3.2),
                    ReportMetric("Customer Growth", 15.2, "%", "up", 2.5),
                    ReportMetric("Market Share", 8.5, "%", "up", 0.5),
                    ReportMetric("New Products", 3, "count"),
                ],
                charts=[
                    {"type": "line", "title": "5-Year Growth Trajectory", "data": "growth_trend"}
                ]
            ),
            ReportSection(
                title="Strategic Initiatives",
                metrics=[
                    ReportMetric("Digital Adoption", 65.5, "%", "up", 12.5),
                    ReportMetric("Automation Rate", 45.2, "%", "up", 8.5),
                    ReportMetric("New Channels", 4, "count"),
                    ReportMetric("Partnership Revenue", 2.3, "₦B", "up", 25.5),
                ],
                tables=[{
                    "title": "Strategic Projects Status",
                    "columns": ["Project", "Status", "Completion", "Impact"],
                    "rows": [
                        ["Digital Transformation", "On Track", "75%", "High"],
                        ["Microinsurance Launch", "In Progress", "60%", "Medium"],
                        ["AI Claims Processing", "Completed", "100%", "High"],
                        ["Mobile App 2.0", "On Track", "85%", "High"],
                    ]
                }]
            )
        ]
        
        return OperationalReport(
            report_id=f"BD-{report_date.isoformat()}-{frequency.value}",
            role=UserRole.BOARD,
            report_date=report_date.isoformat(),
            frequency=frequency,
            title="Board & Investor Dashboard",
            sections=sections,
            generated_at=datetime.utcnow().isoformat(),
            next_refresh=(datetime.utcnow() + timedelta(days=1)).isoformat()
        )
    
    async def _generate_regulator_report(
        self,
        report_date: date,
        frequency: ReportFrequency
    ) -> OperationalReport:
        """Generate regulatory compliance report"""
        
        sections = [
            ReportSection(
                title="Compliance Metrics",
                metrics=[
                    ReportMetric("Regulatory Filings", 12, "count"),
                    ReportMetric("On-Time Submissions", 100, "%", "stable", 0, target=100.0),
                    ReportMetric("Open Findings", 2, "count", "down", -1),
                    ReportMetric("Remediation Progress", 85.5, "%", "up", 10.5),
                ]
            ),
            ReportSection(
                title="Capital Adequacy",
                metrics=[
                    ReportMetric("Minimum Capital", 3.0, "₦B"),
                    ReportMetric("Available Capital", 5.56, "₦B"),
                    ReportMetric("Capital Surplus", 2.56, "₦B", "up", 8.5),
                    ReportMetric("CAR", 185.2, "%", "stable", 0.5, target=150.0),
                ]
            ),
            ReportSection(
                title="Risk Exposure",
                metrics=[
                    ReportMetric("Underwriting Risk", 2.5, "₦B"),
                    ReportMetric("Credit Risk", 0.85, "₦B"),
                    ReportMetric("Market Risk", 0.45, "₦B"),
                    ReportMetric("Operational Risk", 0.35, "₦B"),
                ],
                charts=[
                    {"type": "pie", "title": "Risk Distribution", "data": {
                        "Underwriting": 60, "Credit": 20, "Market": 12, "Operational": 8
                    }}
                ]
            ),
            ReportSection(
                title="Consumer Protection",
                metrics=[
                    ReportMetric("Complaints Received", 45, "count"),
                    ReportMetric("Resolved Within SLA", 42, "count"),
                    ReportMetric("Escalated to Regulator", 1, "count"),
                    ReportMetric("Avg Resolution Time", 5.2, "days", "down", -0.8, target=7.0),
                ]
            )
        ]
        
        return OperationalReport(
            report_id=f"RG-{report_date.isoformat()}-{frequency.value}",
            role=UserRole.REGULATOR,
            report_date=report_date.isoformat(),
            frequency=frequency,
            title="Regulatory Compliance Dashboard",
            sections=sections,
            generated_at=datetime.utcnow().isoformat(),
            next_refresh=(datetime.utcnow() + timedelta(days=1)).isoformat()
        )
    
    async def _generate_reinsurer_report(
        self,
        report_date: date,
        frequency: ReportFrequency
    ) -> OperationalReport:
        """Generate reinsurer report"""
        
        sections = [
            ReportSection(
                title="Treaty Performance",
                metrics=[
                    ReportMetric("Ceded Premium", 4.56, "₦B", "up", 15.2),
                    ReportMetric("Ceded Claims", 2.85, "₦B", "up", 8.5),
                    ReportMetric("Commission Received", 0.68, "₦B"),
                    ReportMetric("Treaty Loss Ratio", 62.5, "%", "down", -2.3, target=65.0),
                ]
            ),
            ReportSection(
                title="Claims Experience",
                metrics=[
                    ReportMetric("Reported Claims", 234, "count"),
                    ReportMetric("Settled Claims", 198, "count"),
                    ReportMetric("Outstanding Claims", 36, "count"),
                    ReportMetric("Large Losses (>₦50M)", 5, "count"),
                ],
                tables=[{
                    "title": "Large Loss Notifications",
                    "columns": ["Claim ID", "Type", "Gross Amount", "Ceded Amount", "Status"],
                    "rows": [
                        ["CLM-2024-001", "Property Fire", "₦125M", "₦75M", "Settled"],
                        ["CLM-2024-015", "Motor Fleet", "₦85M", "₦51M", "Open"],
                        ["CLM-2024-023", "Liability", "₦65M", "₦39M", "Reserved"],
                    ]
                }]
            ),
            ReportSection(
                title="Portfolio Analysis",
                metrics=[
                    ReportMetric("Motor Share", 35, "%"),
                    ReportMetric("Property Share", 30, "%"),
                    ReportMetric("Health Share", 20, "%"),
                    ReportMetric("Other Share", 15, "%"),
                ],
                charts=[
                    {"type": "bar", "title": "Premium by Line of Business", "data": "lob_premium"}
                ]
            ),
            ReportSection(
                title="Accumulation",
                metrics=[
                    ReportMetric("PML - Fire", 2.5, "₦B"),
                    ReportMetric("PML - Flood", 1.8, "₦B"),
                    ReportMetric("PML - Motor", 0.95, "₦B"),
                    ReportMetric("Catastrophe Exposure", 3.5, "₦B"),
                ]
            )
        ]
        
        return OperationalReport(
            report_id=f"RE-{report_date.isoformat()}-{frequency.value}",
            role=UserRole.REINSURER,
            report_date=report_date.isoformat(),
            frequency=frequency,
            title="Reinsurer Dashboard",
            sections=sections,
            generated_at=datetime.utcnow().isoformat(),
            next_refresh=(datetime.utcnow() + timedelta(days=1)).isoformat()
        )
    
    async def generate_all_reports(
        self,
        report_date: Optional[date] = None
    ) -> Dict[str, OperationalReport]:
        """Generate all role-based reports"""
        report_date = report_date or date.today()
        reports = {}
        
        for role in UserRole:
            try:
                report = await self.generate_report(role, report_date)
                reports[role.value] = report
            except Exception as e:
                logger.error(f"Error generating report for {role}: {str(e)}")
        
        return reports
