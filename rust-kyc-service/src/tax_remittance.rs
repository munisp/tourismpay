//! Government Tax Remittance Engine (Rust)
//! High-precision batch aggregation, deadline tracking, reconciliation,
//! and compliance scoring for multi-jurisdiction tax remittance.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

// ─── Types ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemittanceBatchCalc {
    pub batch_id: String,
    pub jurisdiction: String,
    pub period: String,
    pub tax_lines: Vec<TaxLineItem>,
    pub total_collected: f64,
    pub total_remitted: f64,
    pub outstanding: f64,
    pub penalty_amount: f64,
    pub interest_amount: f64,
    pub net_payable: f64,
    pub currency: String,
    pub deadline_ms: u64,
    pub is_overdue: bool,
    pub days_overdue: i32,
    pub compliance_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaxLineItem {
    pub tax_type: String,
    pub name: String,
    pub rate_bps: u32,
    pub collected: f64,
    pub remitted: f64,
    pub outstanding: f64,
    pub transaction_count: u32,
    pub authority: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PenaltyCalc {
    pub base_amount: f64,
    pub days_overdue: i32,
    pub penalty_rate_bps: u32,       // Basis points per day
    pub interest_rate_annual_bps: u32, // Annual interest rate in bps
    pub penalty_amount: f64,
    pub interest_amount: f64,
    pub total_payable: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconciliationResult {
    pub jurisdiction: String,
    pub period: String,
    pub expected_total: f64,
    pub actual_collected: f64,
    pub discrepancy: f64,
    pub discrepancy_pct: f64,
    pub status: String, // "matched", "underpaid", "overpaid"
    pub items: Vec<ReconciliationItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconciliationItem {
    pub tax_type: String,
    pub expected: f64,
    pub actual: f64,
    pub difference: f64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilingDeadline {
    pub jurisdiction: String,
    pub period: String,
    pub deadline_ms: u64,
    pub grace_deadline_ms: u64,
    pub days_until_due: i32,
    pub is_overdue: bool,
    pub penalty_starts_at_ms: u64,
}

// ─── Jurisdiction Penalty Rules ─────────────────────────────────────────────

#[derive(Debug, Clone)]
struct PenaltyRule {
    daily_penalty_bps: u32,        // Daily penalty rate in basis points
    annual_interest_bps: u32,      // Annual interest on overdue amount
    max_penalty_pct: f64,          // Maximum penalty cap as percentage
    grace_period_days: u32,
}

// ─── Engine ─────────────────────────────────────────────────────────────────

pub struct TaxRemittanceEngine {
    penalty_rules: HashMap<String, PenaltyRule>,
    filing_days: HashMap<String, u32>,       // Day of month for filing
    frequencies: HashMap<String, String>,     // monthly, bi-monthly, quarterly
}

impl TaxRemittanceEngine {
    pub fn new() -> Self {
        let mut engine = Self {
            penalty_rules: HashMap::new(),
            filing_days: HashMap::new(),
            frequencies: HashMap::new(),
        };
        engine.load_defaults();
        engine
    }

    fn load_defaults(&mut self) {
        // Penalty rules per jurisdiction (based on actual tax authority policies)
        self.penalty_rules.insert("NG".into(), PenaltyRule { daily_penalty_bps: 50, annual_interest_bps: 2100, max_penalty_pct: 25.0, grace_period_days: 7 });
        self.penalty_rules.insert("KE".into(), PenaltyRule { daily_penalty_bps: 100, annual_interest_bps: 2400, max_penalty_pct: 100.0, grace_period_days: 5 });
        self.penalty_rules.insert("GH".into(), PenaltyRule { daily_penalty_bps: 80, annual_interest_bps: 2500, max_penalty_pct: 50.0, grace_period_days: 5 });
        self.penalty_rules.insert("ZA".into(), PenaltyRule { daily_penalty_bps: 33, annual_interest_bps: 1050, max_penalty_pct: 10.0, grace_period_days: 7 });
        self.penalty_rules.insert("TZ".into(), PenaltyRule { daily_penalty_bps: 67, annual_interest_bps: 2200, max_penalty_pct: 25.0, grace_period_days: 7 });
        self.penalty_rules.insert("RW".into(), PenaltyRule { daily_penalty_bps: 50, annual_interest_bps: 1800, max_penalty_pct: 20.0, grace_period_days: 5 });
        self.penalty_rules.insert("EG".into(), PenaltyRule { daily_penalty_bps: 40, annual_interest_bps: 2000, max_penalty_pct: 50.0, grace_period_days: 10 });
        self.penalty_rules.insert("MA".into(), PenaltyRule { daily_penalty_bps: 17, annual_interest_bps: 1200, max_penalty_pct: 15.0, grace_period_days: 10 });
        self.penalty_rules.insert("UG".into(), PenaltyRule { daily_penalty_bps: 67, annual_interest_bps: 2400, max_penalty_pct: 100.0, grace_period_days: 5 });
        self.penalty_rules.insert("ET".into(), PenaltyRule { daily_penalty_bps: 50, annual_interest_bps: 2500, max_penalty_pct: 25.0, grace_period_days: 7 });

        // Filing deadlines (day of month)
        self.filing_days.insert("NG".into(), 21);
        self.filing_days.insert("KE".into(), 20);
        self.filing_days.insert("GH".into(), 15);
        self.filing_days.insert("ZA".into(), 25);
        self.filing_days.insert("TZ".into(), 20);
        self.filing_days.insert("RW".into(), 15);
        self.filing_days.insert("EG".into(), 15);
        self.filing_days.insert("MA".into(), 20);
        self.filing_days.insert("UG".into(), 15);
        self.filing_days.insert("ET".into(), 20);

        // Frequencies
        self.frequencies.insert("NG".into(), "monthly".into());
        self.frequencies.insert("KE".into(), "monthly".into());
        self.frequencies.insert("GH".into(), "monthly".into());
        self.frequencies.insert("ZA".into(), "bi-monthly".into());
        self.frequencies.insert("TZ".into(), "monthly".into());
        self.frequencies.insert("RW".into(), "monthly".into());
        self.frequencies.insert("EG".into(), "monthly".into());
        self.frequencies.insert("MA".into(), "quarterly".into());
        self.frequencies.insert("UG".into(), "monthly".into());
        self.frequencies.insert("ET".into(), "monthly".into());
    }

    /// Calculate penalty and interest for overdue tax remittance
    pub fn calculate_penalty(&self, jurisdiction: &str, outstanding_amount: f64, days_overdue: i32) -> PenaltyCalc {
        let rule = self.penalty_rules.get(jurisdiction).cloned().unwrap_or(
            PenaltyRule { daily_penalty_bps: 50, annual_interest_bps: 2100, max_penalty_pct: 25.0, grace_period_days: 7 }
        );

        let effective_days = if days_overdue > rule.grace_period_days as i32 {
            days_overdue - rule.grace_period_days as i32
        } else {
            0
        };

        // Penalty = outstanding × daily_rate × days
        let daily_rate = rule.daily_penalty_bps as f64 / 10000.0;
        let mut penalty = outstanding_amount * daily_rate * effective_days as f64;

        // Cap penalty at max_penalty_pct
        let max_penalty = outstanding_amount * rule.max_penalty_pct / 100.0;
        if penalty > max_penalty {
            penalty = max_penalty;
        }

        // Interest = outstanding × annual_rate × (days / 365)
        let annual_rate = rule.annual_interest_bps as f64 / 10000.0;
        let interest = outstanding_amount * annual_rate * (effective_days as f64 / 365.0);

        let total = outstanding_amount + penalty + interest;

        PenaltyCalc {
            base_amount: round2(outstanding_amount),
            days_overdue,
            penalty_rate_bps: rule.daily_penalty_bps,
            interest_rate_annual_bps: rule.annual_interest_bps,
            penalty_amount: round2(penalty),
            interest_amount: round2(interest),
            total_payable: round2(total),
        }
    }

    /// Aggregate tax lines into a batch calculation with compliance scoring
    pub fn calculate_batch(&self, jurisdiction: &str, period: &str, tax_lines: Vec<TaxLineItem>) -> RemittanceBatchCalc {
        let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;

        let total_collected: f64 = tax_lines.iter().map(|l| l.collected).sum();
        let total_remitted: f64 = tax_lines.iter().map(|l| l.remitted).sum();
        let outstanding = total_collected - total_remitted;

        let deadline_ms = self.compute_deadline_ms(jurisdiction, period);
        let is_overdue = now_ms > deadline_ms;
        let days_overdue = if is_overdue {
            ((now_ms - deadline_ms) / 86_400_000) as i32
        } else {
            0
        };

        let penalty_calc = if is_overdue && outstanding > 0.0 {
            self.calculate_penalty(jurisdiction, outstanding, days_overdue)
        } else {
            PenaltyCalc {
                base_amount: outstanding,
                days_overdue: 0,
                penalty_rate_bps: 0,
                interest_rate_annual_bps: 0,
                penalty_amount: 0.0,
                interest_amount: 0.0,
                total_payable: outstanding,
            }
        };

        // Compliance score: 100 if fully remitted on time, reduces with outstanding and overdue
        let compliance_score = if total_collected == 0.0 {
            100.0
        } else {
            let ratio = total_remitted / total_collected;
            let base_score = ratio * 100.0;
            let overdue_penalty = if is_overdue { (days_overdue as f64).min(50.0) } else { 0.0 };
            (base_score - overdue_penalty).max(0.0).min(100.0)
        };

        let currency = match jurisdiction {
            "NG" => "NGN", "KE" => "KES", "GH" => "GHS", "ZA" => "ZAR",
            "TZ" => "TZS", "RW" => "RWF", "EG" => "EGP", "MA" => "MAD",
            "UG" => "UGX", "ET" => "ETB", _ => "USD",
        };

        RemittanceBatchCalc {
            batch_id: format!("RBCALC-{}-{}-{}", jurisdiction, period, now_ms),
            jurisdiction: jurisdiction.to_string(),
            period: period.to_string(),
            tax_lines,
            total_collected: round2(total_collected),
            total_remitted: round2(total_remitted),
            outstanding: round2(outstanding),
            penalty_amount: penalty_calc.penalty_amount,
            interest_amount: penalty_calc.interest_amount,
            net_payable: penalty_calc.total_payable,
            currency: currency.to_string(),
            deadline_ms,
            is_overdue,
            days_overdue,
            compliance_score: (compliance_score * 10.0).round() / 10.0,
        }
    }

    /// Reconcile expected vs actual tax collection
    pub fn reconcile(&self, jurisdiction: &str, period: &str, expected_lines: Vec<(String, f64)>, actual_lines: Vec<(String, f64)>) -> ReconciliationResult {
        let mut items = Vec::new();
        let mut expected_total = 0.0;
        let mut actual_total = 0.0;

        let actual_map: HashMap<String, f64> = actual_lines.into_iter().collect();

        for (tax_type, expected) in &expected_lines {
            let actual = actual_map.get(tax_type).copied().unwrap_or(0.0);
            let difference = actual - expected;
            let status = if (difference.abs()) < 0.01 {
                "matched"
            } else if difference < 0.0 {
                "underpaid"
            } else {
                "overpaid"
            };

            items.push(ReconciliationItem {
                tax_type: tax_type.clone(),
                expected: round2(*expected),
                actual: round2(actual),
                difference: round2(difference),
                status: status.to_string(),
            });

            expected_total += expected;
            actual_total += actual;
        }

        let discrepancy = actual_total - expected_total;
        let discrepancy_pct = if expected_total > 0.0 {
            (discrepancy / expected_total) * 100.0
        } else {
            0.0
        };

        let overall_status = if discrepancy.abs() < 0.01 {
            "matched"
        } else if discrepancy < 0.0 {
            "underpaid"
        } else {
            "overpaid"
        };

        ReconciliationResult {
            jurisdiction: jurisdiction.to_string(),
            period: period.to_string(),
            expected_total: round2(expected_total),
            actual_collected: round2(actual_total),
            discrepancy: round2(discrepancy),
            discrepancy_pct: (discrepancy_pct * 100.0).round() / 100.0,
            status: overall_status.to_string(),
            items,
        }
    }

    /// Get filing deadline for a jurisdiction/period
    pub fn get_filing_deadline(&self, jurisdiction: &str, _period: &str) -> FilingDeadline {
        let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;
        let rule = self.penalty_rules.get(jurisdiction).cloned().unwrap_or(
            PenaltyRule { daily_penalty_bps: 50, annual_interest_bps: 2100, max_penalty_pct: 25.0, grace_period_days: 7 }
        );

        let deadline_ms = self.compute_deadline_ms(jurisdiction, _period);
        let grace_ms = deadline_ms + (rule.grace_period_days as u64 * 86_400_000);
        let days_until_due = if now_ms < deadline_ms {
            ((deadline_ms - now_ms) / 86_400_000) as i32
        } else {
            -(((now_ms - deadline_ms) / 86_400_000) as i32)
        };

        FilingDeadline {
            jurisdiction: jurisdiction.to_string(),
            period: _period.to_string(),
            deadline_ms,
            grace_deadline_ms: grace_ms,
            days_until_due,
            is_overdue: now_ms > grace_ms,
            penalty_starts_at_ms: grace_ms,
        }
    }

    fn compute_deadline_ms(&self, jurisdiction: &str, _period: &str) -> u64 {
        let filing_day = self.filing_days.get(jurisdiction).copied().unwrap_or(20);
        let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;
        let day_ms = 86_400_000u64;
        // Simple approximation for demo — in production, parse period string
        now_ms + (filing_day as u64 * day_ms)
    }
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_penalty_calculation_ng() {
        let engine = TaxRemittanceEngine::new();
        let result = engine.calculate_penalty("NG", 1000000.0, 14);
        // 14 days overdue, 7 grace = 7 effective days
        // Penalty: 1,000,000 × 0.005 × 7 = 35,000
        // Interest: 1,000,000 × 0.21 × (7/365) ≈ 4,027
        assert!(result.penalty_amount > 0.0);
        assert!(result.interest_amount > 0.0);
        assert_eq!(result.days_overdue, 14);
    }

    #[test]
    fn test_penalty_within_grace_period() {
        let engine = TaxRemittanceEngine::new();
        let result = engine.calculate_penalty("NG", 1000000.0, 5);
        // 5 days overdue but grace period is 7 → no penalty
        assert_eq!(result.penalty_amount, 0.0);
        assert_eq!(result.interest_amount, 0.0);
    }

    #[test]
    fn test_batch_calculation() {
        let engine = TaxRemittanceEngine::new();
        let lines = vec![
            TaxLineItem {
                tax_type: "VAT".into(), name: "Nigeria VAT".into(), rate_bps: 750,
                collected: 500000.0, remitted: 500000.0, outstanding: 0.0,
                transaction_count: 100, authority: "FIRS".into(),
            },
            TaxLineItem {
                tax_type: "TOURISM_LEVY".into(), name: "Tourism Levy".into(), rate_bps: 500,
                collected: 200000.0, remitted: 0.0, outstanding: 200000.0,
                transaction_count: 50, authority: "NTDC".into(),
            },
        ];
        let result = engine.calculate_batch("NG", "2026-06", lines);
        assert_eq!(result.total_collected, 700000.0);
        assert_eq!(result.total_remitted, 500000.0);
        assert_eq!(result.outstanding, 200000.0);
    }

    #[test]
    fn test_reconciliation() {
        let engine = TaxRemittanceEngine::new();
        let expected = vec![("VAT".to_string(), 1000.0), ("TOURISM".to_string(), 500.0)];
        let actual = vec![("VAT".to_string(), 1000.0), ("TOURISM".to_string(), 480.0)];
        let result = engine.reconcile("KE", "2026-06", expected, actual);
        assert_eq!(result.status, "underpaid");
        assert_eq!(result.discrepancy, -20.0);
    }
}
