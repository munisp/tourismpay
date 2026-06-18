//! Real-time tax calculation and tip splitting engine (Rust)
//! High-performance, concurrent-safe calculations for multi-jurisdiction tax and tipping.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use sqlx::PgPool;

// ─── Tax Types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum TaxCategory {
    VAT,
    TourismLevy,
    WithholdingTax,
    ServiceCharge,
    DigitalServiceTax,
    EnvironmentalLevy,
    CityTax,
    ExciseDuty,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JurisdictionTaxRule {
    pub id: String,
    pub jurisdiction: String,
    pub category: TaxCategory,
    pub name: String,
    pub rate_bps: u32,         // Basis points (750 = 7.50%)
    pub flat_amount: f64,      // Flat fee (if applicable)
    pub currency: String,
    pub applies_to: String,    // "all", "accommodation", "food", etc.
    pub min_threshold: f64,    // Minimum amount for tax to apply
    pub max_cap: f64,          // Maximum taxable amount (0 = no cap)
    pub is_compound: bool,     // Applied on top of previous taxes
    pub priority: u8,          // Application order (1 = first)
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaxBreakdownItem {
    pub tax_id: String,
    pub name: String,
    pub category: TaxCategory,
    pub rate_bps: u32,
    pub taxable_base: f64,
    pub amount: f64,
    pub is_compound: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaxResult {
    pub subtotal: f64,
    pub total_tax: f64,
    pub grand_total: f64,
    pub breakdown: Vec<TaxBreakdownItem>,
    pub jurisdiction: String,
    pub currency: String,
    pub receipt_ref: String,
    pub calculated_at_ms: u64,
}

// ─── Tip Types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TipMethod {
    Percentage(f64),   // Percentage of bill
    FlatAmount(f64),   // Fixed amount
    RoundUp,           // Round up to nearest unit
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TipSplitEntry {
    pub role: String,
    pub share_bps: u32,  // Basis points (6000 = 60%)
    pub amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TipResult {
    pub bill_amount: f64,
    pub tip_amount: f64,
    pub tax_on_tip: f64,
    pub net_tip: f64,
    pub total_with_tip: f64,
    pub method: String,
    pub currency: String,
    pub splits: Vec<TipSplitEntry>,
    pub cultural_note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TipPoolConfig {
    pub splits: Vec<PoolSplit>,
    pub max_percentage: f64,
    pub suggested_percentages: Vec<f64>,
    pub cultural_note: String,
    pub currency: String,
    pub round_up_unit: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoolSplit {
    pub role: String,
    pub share_bps: u32,
}

// ─── Engine ─────────────────────────────────────────────────────────────────

pub struct TaxTipEngine {
    tax_rules: HashMap<String, Vec<JurisdictionTaxRule>>,
    tip_configs: HashMap<String, TipPoolConfig>,
    db_pool: Option<PgPool>,
}

impl TaxTipEngine {
    pub fn new() -> Self {
        let mut engine = Self {
            tax_rules: HashMap::new(),
            tip_configs: HashMap::new(),
            db_pool: None,
        };
        engine.load_defaults();
        engine
    }

    pub fn with_pool(pool: PgPool) -> Self {
        let mut engine = Self {
            tax_rules: HashMap::new(),
            tip_configs: HashMap::new(),
            db_pool: Some(pool),
        };
        engine.load_defaults();
        engine
    }

    pub async fn hydrate_from_db(&mut self) {
        let pool = match &self.db_pool {
            Some(p) => p,
            None => return,
        };

        // Load tax rules from DB
        let rows = sqlx::query_as::<_, (String, String, String, String, i32, f64, String, String, f64, f64, bool, i32, bool)>(
            "SELECT id, jurisdiction, category, name, rate_bps, flat_amount, currency, applies_to, min_threshold, max_cap, is_compound, priority, is_active FROM tax_tip_rules ORDER BY jurisdiction, priority"
        )
        .fetch_all(pool)
        .await;

        if let Ok(rows) = rows {
            if !rows.is_empty() {
                self.tax_rules.clear();
                for (id, jurisdiction, category, name, rate_bps, flat_amount, currency, applies_to, min_threshold, max_cap, is_compound, priority, is_active) in rows {
                    let cat = match category.as_str() {
                        "VAT" => TaxCategory::VAT,
                        "TourismLevy" => TaxCategory::TourismLevy,
                        "WithholdingTax" => TaxCategory::WithholdingTax,
                        "ServiceCharge" => TaxCategory::ServiceCharge,
                        "DigitalServiceTax" => TaxCategory::DigitalServiceTax,
                        "EnvironmentalLevy" => TaxCategory::EnvironmentalLevy,
                        "CityTax" => TaxCategory::CityTax,
                        "ExciseDuty" => TaxCategory::ExciseDuty,
                        _ => TaxCategory::VAT,
                    };
                    let rule = JurisdictionTaxRule {
                        id, jurisdiction: jurisdiction.clone(), category: cat, name,
                        rate_bps: rate_bps as u32, flat_amount, currency, applies_to,
                        min_threshold, max_cap, is_compound, priority: priority as u8, is_active,
                    };
                    self.tax_rules.entry(jurisdiction).or_insert_with(Vec::new).push(rule);
                }
            }
        }

        // Load tip configs from DB
        let tip_rows = sqlx::query_as::<_, (String, String, f64, String, String, f64)>(
            "SELECT jurisdiction, splits_json, max_percentage, suggested_json, cultural_note, round_up_unit FROM tax_tip_configs ORDER BY jurisdiction"
        )
        .fetch_all(pool)
        .await;

        if let Ok(tip_rows) = tip_rows {
            if !tip_rows.is_empty() {
                self.tip_configs.clear();
                for (jurisdiction, splits_json, max_percentage, suggested_json, cultural_note, round_up_unit) in tip_rows {
                    let splits: Vec<PoolSplit> = serde_json::from_str(&splits_json).unwrap_or_default();
                    let suggested: Vec<f64> = serde_json::from_str(&suggested_json).unwrap_or_default();
                    let currency_code = self.tax_rules.get(&jurisdiction)
                        .and_then(|r| r.first())
                        .map(|r| r.currency.clone())
                        .unwrap_or_else(|| "USD".into());
                    self.tip_configs.insert(jurisdiction, TipPoolConfig {
                        splits, max_percentage, suggested_percentages: suggested,
                        cultural_note, currency: currency_code, round_up_unit,
                    });
                }
            }
        }
    }

    pub async fn seed_defaults_to_db(&self) {
        let pool = match &self.db_pool {
            Some(p) => p,
            None => return,
        };

        for (jurisdiction, rules) in &self.tax_rules {
            for rule in rules {
                let cat_str = format!("{:?}", rule.category);
                let _ = sqlx::query(
                    "INSERT INTO tax_tip_rules (id, jurisdiction, category, name, rate_bps, flat_amount, currency, applies_to, min_threshold, max_cap, is_compound, priority, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (id) DO NOTHING"
                )
                .bind(&rule.id).bind(jurisdiction).bind(&cat_str).bind(&rule.name)
                .bind(rule.rate_bps as i32).bind(rule.flat_amount).bind(&rule.currency)
                .bind(&rule.applies_to).bind(rule.min_threshold).bind(rule.max_cap)
                .bind(rule.is_compound).bind(rule.priority as i32).bind(rule.is_active)
                .execute(pool).await;
            }
        }

        for (jurisdiction, config) in &self.tip_configs {
            let splits_json = serde_json::to_string(&config.splits).unwrap_or_default();
            let suggested_json = serde_json::to_string(&config.suggested_percentages).unwrap_or_default();
            let _ = sqlx::query(
                "INSERT INTO tax_tip_configs (jurisdiction, splits_json, max_percentage, suggested_json, cultural_note, round_up_unit) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (jurisdiction) DO NOTHING"
            )
            .bind(jurisdiction).bind(&splits_json).bind(config.max_percentage)
            .bind(&suggested_json).bind(&config.cultural_note).bind(config.round_up_unit)
            .execute(pool).await;
        }
    }

    fn load_defaults(&mut self) {
        // ─── Tax Rules ──────────────────────────────────────────────────
        self.tax_rules.insert("NG".into(), vec![
            JurisdictionTaxRule { id: "ng-vat".into(), jurisdiction: "NG".into(), category: TaxCategory::VAT, name: "Nigeria VAT".into(), rate_bps: 750, flat_amount: 0.0, currency: "NGN".into(), applies_to: "all".into(), min_threshold: 0.0, max_cap: 0.0, is_compound: false, priority: 1, is_active: true },
            JurisdictionTaxRule { id: "ng-tl".into(), jurisdiction: "NG".into(), category: TaxCategory::TourismLevy, name: "Tourism Development Levy".into(), rate_bps: 500, flat_amount: 0.0, currency: "NGN".into(), applies_to: "accommodation".into(), min_threshold: 0.0, max_cap: 0.0, is_compound: false, priority: 2, is_active: true },
            JurisdictionTaxRule { id: "ng-wht".into(), jurisdiction: "NG".into(), category: TaxCategory::WithholdingTax, name: "Withholding Tax".into(), rate_bps: 1000, flat_amount: 0.0, currency: "NGN".into(), applies_to: "all".into(), min_threshold: 50000.0, max_cap: 0.0, is_compound: false, priority: 10, is_active: true },
        ]);

        self.tax_rules.insert("KE".into(), vec![
            JurisdictionTaxRule { id: "ke-vat".into(), jurisdiction: "KE".into(), category: TaxCategory::VAT, name: "Kenya VAT".into(), rate_bps: 1600, flat_amount: 0.0, currency: "KES".into(), applies_to: "all".into(), min_threshold: 0.0, max_cap: 0.0, is_compound: false, priority: 1, is_active: true },
            JurisdictionTaxRule { id: "ke-tl".into(), jurisdiction: "KE".into(), category: TaxCategory::TourismLevy, name: "Tourism Fund Levy".into(), rate_bps: 200, flat_amount: 0.0, currency: "KES".into(), applies_to: "accommodation".into(), min_threshold: 0.0, max_cap: 0.0, is_compound: false, priority: 2, is_active: true },
            JurisdictionTaxRule { id: "ke-dst".into(), jurisdiction: "KE".into(), category: TaxCategory::DigitalServiceTax, name: "Digital Service Tax".into(), rate_bps: 150, flat_amount: 0.0, currency: "KES".into(), applies_to: "all".into(), min_threshold: 0.0, max_cap: 0.0, is_compound: false, priority: 3, is_active: true },
        ]);

        self.tax_rules.insert("GH".into(), vec![
            JurisdictionTaxRule { id: "gh-vat".into(), jurisdiction: "GH".into(), category: TaxCategory::VAT, name: "Ghana VAT".into(), rate_bps: 1500, flat_amount: 0.0, currency: "GHS".into(), applies_to: "all".into(), min_threshold: 0.0, max_cap: 0.0, is_compound: false, priority: 1, is_active: true },
            JurisdictionTaxRule { id: "gh-nhil".into(), jurisdiction: "GH".into(), category: TaxCategory::ServiceCharge, name: "NHIL".into(), rate_bps: 250, flat_amount: 0.0, currency: "GHS".into(), applies_to: "all".into(), min_threshold: 0.0, max_cap: 0.0, is_compound: false, priority: 2, is_active: true },
            JurisdictionTaxRule { id: "gh-getf".into(), jurisdiction: "GH".into(), category: TaxCategory::ServiceCharge, name: "GETFund Levy".into(), rate_bps: 250, flat_amount: 0.0, currency: "GHS".into(), applies_to: "all".into(), min_threshold: 0.0, max_cap: 0.0, is_compound: false, priority: 3, is_active: true },
            JurisdictionTaxRule { id: "gh-covid".into(), jurisdiction: "GH".into(), category: TaxCategory::ServiceCharge, name: "COVID-19 Levy".into(), rate_bps: 100, flat_amount: 0.0, currency: "GHS".into(), applies_to: "all".into(), min_threshold: 0.0, max_cap: 0.0, is_compound: false, priority: 4, is_active: true },
        ]);

        self.tax_rules.insert("ZA".into(), vec![
            JurisdictionTaxRule { id: "za-vat".into(), jurisdiction: "ZA".into(), category: TaxCategory::VAT, name: "South Africa VAT".into(), rate_bps: 1500, flat_amount: 0.0, currency: "ZAR".into(), applies_to: "all".into(), min_threshold: 0.0, max_cap: 0.0, is_compound: false, priority: 1, is_active: true },
            JurisdictionTaxRule { id: "za-tml".into(), jurisdiction: "ZA".into(), category: TaxCategory::TourismLevy, name: "Tourism Marketing Levy".into(), rate_bps: 100, flat_amount: 0.0, currency: "ZAR".into(), applies_to: "accommodation".into(), min_threshold: 0.0, max_cap: 0.0, is_compound: false, priority: 2, is_active: true },
        ]);

        self.tax_rules.insert("TZ".into(), vec![
            JurisdictionTaxRule { id: "tz-vat".into(), jurisdiction: "TZ".into(), category: TaxCategory::VAT, name: "Tanzania VAT".into(), rate_bps: 1800, flat_amount: 0.0, currency: "TZS".into(), applies_to: "all".into(), min_threshold: 0.0, max_cap: 0.0, is_compound: false, priority: 1, is_active: true },
            JurisdictionTaxRule { id: "tz-tdl".into(), jurisdiction: "TZ".into(), category: TaxCategory::TourismLevy, name: "Tourism Development Levy".into(), rate_bps: 150, flat_amount: 0.0, currency: "TZS".into(), applies_to: "all".into(), min_threshold: 0.0, max_cap: 0.0, is_compound: false, priority: 2, is_active: true },
        ]);

        // ─── Tip Configs ────────────────────────────────────────────────
        self.tip_configs.insert("NG".into(), TipPoolConfig {
            splits: vec![PoolSplit { role: "server".into(), share_bps: 6000 }, PoolSplit { role: "kitchen".into(), share_bps: 2500 }, PoolSplit { role: "support".into(), share_bps: 1500 }],
            max_percentage: 30.0,
            suggested_percentages: vec![10.0, 15.0, 20.0],
            cultural_note: "10-15% is standard at Nigerian restaurants".into(),
            currency: "NGN".into(),
            round_up_unit: 100.0,
        });

        self.tip_configs.insert("KE".into(), TipPoolConfig {
            splits: vec![PoolSplit { role: "server".into(), share_bps: 5500 }, PoolSplit { role: "kitchen".into(), share_bps: 3000 }, PoolSplit { role: "support".into(), share_bps: 1500 }],
            max_percentage: 30.0,
            suggested_percentages: vec![10.0, 15.0, 20.0],
            cultural_note: "10% is standard in Kenya. Safari guides: $10-20/day".into(),
            currency: "KES".into(),
            round_up_unit: 50.0,
        });

        self.tip_configs.insert("ZA".into(), TipPoolConfig {
            splits: vec![PoolSplit { role: "recipient".into(), share_bps: 10000 }],
            max_percentage: 30.0,
            suggested_percentages: vec![10.0, 15.0, 20.0],
            cultural_note: "10-15% at restaurants, R20-50 for car guards".into(),
            currency: "ZAR".into(),
            round_up_unit: 10.0,
        });

        self.tip_configs.insert("GH".into(), TipPoolConfig {
            splits: vec![PoolSplit { role: "server".into(), share_bps: 6500 }, PoolSplit { role: "kitchen".into(), share_bps: 2000 }, PoolSplit { role: "support".into(), share_bps: 1500 }],
            max_percentage: 25.0,
            suggested_percentages: vec![5.0, 10.0, 15.0],
            cultural_note: "5-10% is generous in Ghana".into(),
            currency: "GHS".into(),
            round_up_unit: 5.0,
        });

        self.tip_configs.insert("TZ".into(), TipPoolConfig {
            splits: vec![PoolSplit { role: "recipient".into(), share_bps: 10000 }],
            max_percentage: 30.0,
            suggested_percentages: vec![10.0, 15.0, 20.0],
            cultural_note: "Customary for safari. Guides: $15-20/day, porters: $8-10/day".into(),
            currency: "TZS".into(),
            round_up_unit: 1000.0,
        });

        self.tip_configs.insert("EG".into(), TipPoolConfig {
            splits: vec![PoolSplit { role: "recipient".into(), share_bps: 10000 }],
            max_percentage: 30.0,
            suggested_percentages: vec![10.0, 15.0, 20.0],
            cultural_note: "Baksheesh is deeply cultural. 10-15% at restaurants".into(),
            currency: "EGP".into(),
            round_up_unit: 10.0,
        });

        self.tip_configs.insert("MA".into(), TipPoolConfig {
            splits: vec![PoolSplit { role: "recipient".into(), share_bps: 10000 }],
            max_percentage: 25.0,
            suggested_percentages: vec![10.0, 15.0, 20.0],
            cultural_note: "Pourboire expected. 10% at restaurants, round up taxis".into(),
            currency: "MAD".into(),
            round_up_unit: 10.0,
        });
    }

    /// Calculate taxes for a transaction
    pub fn calculate_tax(&self, jurisdiction: &str, category: &str, subtotal: f64) -> TaxResult {
        let j = jurisdiction.to_uppercase();
        let cat = category.to_lowercase();
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let empty = vec![];
        let rules = self.tax_rules.get(&j).unwrap_or(&empty);

        let applicable: Vec<&JurisdictionTaxRule> = rules.iter()
            .filter(|r| r.is_active)
            .filter(|r| r.applies_to == "all" || r.applies_to == cat)
            .filter(|r| subtotal >= r.min_threshold)
            .collect();

        let mut sorted = applicable;
        sorted.sort_by_key(|r| r.priority);

        let mut breakdown = Vec::new();
        let mut total_tax = 0.0_f64;
        let mut running_base = subtotal;

        for rule in &sorted {
            let taxable = if rule.max_cap > 0.0 && running_base > rule.max_cap {
                rule.max_cap
            } else {
                running_base
            };

            let amount = if rule.flat_amount > 0.0 {
                rule.flat_amount
            } else {
                round_2((taxable * rule.rate_bps as f64) / 10000.0)
            };

            breakdown.push(TaxBreakdownItem {
                tax_id: rule.id.clone(),
                name: rule.name.clone(),
                category: rule.category.clone(),
                rate_bps: rule.rate_bps,
                taxable_base: taxable,
                amount,
                is_compound: rule.is_compound,
            });

            total_tax += amount;
            if rule.is_compound {
                running_base += amount;
            }
        }

        TaxResult {
            subtotal,
            total_tax: round_2(total_tax),
            grand_total: round_2(subtotal + total_tax),
            breakdown,
            jurisdiction: j.clone(),
            currency: rules.first().map(|r| r.currency.clone()).unwrap_or_else(|| "USD".into()),
            receipt_ref: format!("TAX-{}-{}", j, now_ms),
            calculated_at_ms: now_ms,
        }
    }

    /// Calculate a tip and split it among pool members
    pub fn calculate_tip(&self, jurisdiction: &str, bill_amount: f64, method: TipMethod) -> TipResult {
        let j = jurisdiction.to_uppercase();
        let config = self.tip_configs.get(&j);

        let (max_pct, round_unit, cultural_note, currency) = match config {
            Some(c) => (c.max_percentage, c.round_up_unit, c.cultural_note.clone(), c.currency.clone()),
            None => (25.0, 1.0, "Check local customs".into(), "USD".into()),
        };

        let tip_amount = match &method {
            TipMethod::Percentage(pct) => {
                let capped = pct.min(max_pct);
                round_2(bill_amount * capped / 100.0)
            }
            TipMethod::FlatAmount(amt) => round_2(*amt),
            TipMethod::RoundUp => {
                let rounded = (bill_amount / round_unit).ceil() * round_unit;
                let tip = rounded - bill_amount;
                if tip <= 0.0 { round_unit } else { round_2(tip) }
            }
        };

        let method_str = match &method {
            TipMethod::Percentage(_) => "percentage",
            TipMethod::FlatAmount(_) => "flat",
            TipMethod::RoundUp => "round_up",
        };

        // Distribute tip among pool
        let splits = match config {
            Some(c) => {
                c.splits.iter().map(|s| {
                    TipSplitEntry {
                        role: s.role.clone(),
                        share_bps: s.share_bps,
                        amount: round_2(tip_amount * s.share_bps as f64 / 10000.0),
                    }
                }).collect()
            }
            None => vec![TipSplitEntry { role: "recipient".into(), share_bps: 10000, amount: tip_amount }],
        };

        TipResult {
            bill_amount,
            tip_amount,
            tax_on_tip: 0.0, // Most African jurisdictions don't tax tips
            net_tip: tip_amount,
            total_with_tip: round_2(bill_amount + tip_amount),
            method: method_str.into(),
            currency,
            splits,
            cultural_note,
        }
    }

    /// Get supported jurisdictions for tax
    pub fn get_tax_jurisdictions(&self) -> Vec<String> {
        self.tax_rules.keys().cloned().collect()
    }

    /// Get tip config for a jurisdiction
    pub fn get_tip_config(&self, jurisdiction: &str) -> Option<&TipPoolConfig> {
        self.tip_configs.get(&jurisdiction.to_uppercase())
    }

    /// Calculate a multi-recipient tip with concurrent-safe split computation
    pub fn calculate_multi_tip(&self, jurisdiction: &str, bill_amount: f64, total_tip: f64, recipients: &[MultiTipRecipient], split_mode: &str) -> MultiTipResult {
        let j = jurisdiction.to_uppercase();
        let config = self.tip_configs.get(&j);
        let currency = config.map(|c| c.currency.clone()).unwrap_or_else(|| "USD".into());

        let net_tip = round_2(total_tip); // No tax on tips in most African jurisdictions
        let distributions = match split_mode {
            "equal" => self.split_equal(net_tip, recipients),
            "custom_percent" => self.split_by_percent(net_tip, recipients),
            "custom_amount" => self.split_by_amount(net_tip, recipients),
            _ => self.split_equal(net_tip, recipients),
        };

        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        MultiTipResult {
            group_id: format!("MTIP-{}-{}", j, now_ms),
            total_tip: net_tip,
            tax_on_tip: 0.0,
            net_tip,
            grand_total: round_2(bill_amount + total_tip),
            currency,
            split_mode: split_mode.into(),
            recipient_count: recipients.len(),
            distributions,
            receipt: format!("RCPT-MTIP-{}-{}", j, now_ms),
        }
    }

    fn split_equal(&self, net_tip: f64, recipients: &[MultiTipRecipient]) -> Vec<MultiTipDistribution> {
        let n = recipients.len() as f64;
        if n == 0.0 { return vec![]; }
        let per_person = round_2(net_tip / n);
        let remainder = round_2(net_tip - per_person * n);

        recipients.iter().enumerate().map(|(i, r)| {
            let amount = if i == 0 { round_2(per_person + remainder) } else { per_person };
            MultiTipDistribution {
                recipient_id: r.recipient_id.clone(),
                recipient_name: r.recipient_name.clone(),
                role: r.role.clone(),
                amount,
                percentage_bps: ((amount / net_tip) * 10000.0).round() as u32,
            }
        }).collect()
    }

    fn split_by_percent(&self, net_tip: f64, recipients: &[MultiTipRecipient]) -> Vec<MultiTipDistribution> {
        let total_pct: f64 = recipients.iter().map(|r| r.percentage_bps as f64).sum();
        if total_pct == 0.0 { return self.split_equal(net_tip, recipients); }

        let mut result: Vec<MultiTipDistribution> = recipients.iter().map(|r| {
            let normalized = r.percentage_bps as f64 / total_pct;
            let amount = round_2(net_tip * normalized);
            MultiTipDistribution {
                recipient_id: r.recipient_id.clone(),
                recipient_name: r.recipient_name.clone(),
                role: r.role.clone(),
                amount,
                percentage_bps: r.percentage_bps,
            }
        }).collect();

        // Fix rounding error on last recipient
        let len = result.len();
        if len > 1 {
            let sum_others: f64 = result.iter().take(len - 1).map(|d| d.amount).sum();
            result[len - 1].amount = round_2(net_tip - sum_others);
        }
        result
    }

    fn split_by_amount(&self, net_tip: f64, recipients: &[MultiTipRecipient]) -> Vec<MultiTipDistribution> {
        let sum_requested: f64 = recipients.iter().map(|r| r.amount).sum();
        let scale = if sum_requested > 0.0 { net_tip / sum_requested } else { 1.0 };

        recipients.iter().map(|r| {
            let amount = round_2(r.amount * scale);
            MultiTipDistribution {
                recipient_id: r.recipient_id.clone(),
                recipient_name: r.recipient_name.clone(),
                role: r.role.clone(),
                amount,
                percentage_bps: if net_tip > 0.0 { ((amount / net_tip) * 10000.0).round() as u32 } else { 0 },
            }
        }).collect()
    }
}

// ─── Multi-Tip Types ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiTipRecipient {
    pub recipient_id: String,
    pub recipient_name: String,
    pub role: String,
    pub amount: f64,           // For custom_amount mode
    pub percentage_bps: u32,   // For custom_percent mode (basis points)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiTipDistribution {
    pub recipient_id: String,
    pub recipient_name: String,
    pub role: String,
    pub amount: f64,
    pub percentage_bps: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiTipResult {
    pub group_id: String,
    pub total_tip: f64,
    pub tax_on_tip: f64,
    pub net_tip: f64,
    pub grand_total: f64,
    pub currency: String,
    pub split_mode: String,
    pub recipient_count: usize,
    pub distributions: Vec<MultiTipDistribution>,
    pub receipt: String,
}

fn round_2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nigeria_vat_calculation() {
        let engine = TaxTipEngine::new();
        let result = engine.calculate_tax("NG", "food", 10000.0);
        assert_eq!(result.jurisdiction, "NG");
        assert!(result.total_tax > 0.0);
        // 7.5% VAT on 10000 = 750
        let vat_item = result.breakdown.iter().find(|b| b.category == TaxCategory::VAT).unwrap();
        assert_eq!(vat_item.amount, 750.0);
    }

    #[test]
    fn test_kenya_accommodation_taxes() {
        let engine = TaxTipEngine::new();
        let result = engine.calculate_tax("KE", "accommodation", 5000.0);
        // Should include VAT (16%) + Tourism Fund Levy (2%) + DST (1.5%)
        assert!(result.breakdown.len() >= 3);
        assert_eq!(result.subtotal, 5000.0);
    }

    #[test]
    fn test_tip_percentage() {
        let engine = TaxTipEngine::new();
        let result = engine.calculate_tip("NG", 5000.0, TipMethod::Percentage(15.0));
        assert_eq!(result.tip_amount, 750.0);
        assert_eq!(result.total_with_tip, 5750.0);
        assert_eq!(result.splits.len(), 3); // server/kitchen/support
    }

    #[test]
    fn test_tip_round_up() {
        let engine = TaxTipEngine::new();
        let result = engine.calculate_tip("NG", 4750.0, TipMethod::RoundUp);
        // Round up to nearest 100: 4800 - 4750 = 50
        assert_eq!(result.tip_amount, 50.0);
    }

    #[test]
    fn test_unknown_jurisdiction_defaults() {
        let engine = TaxTipEngine::new();
        let result = engine.calculate_tax("XX", "food", 1000.0);
        assert_eq!(result.total_tax, 0.0);
        assert_eq!(result.grand_total, 1000.0);
    }
}
