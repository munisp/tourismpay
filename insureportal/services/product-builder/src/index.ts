/**
 * Insurance Product Builder Service
 * Enables creation of custom insurance products with configurable rules,
 * pricing, and coverage parameters.
 */

interface ProductTemplate {
  id: string;
  name: string;
  category: "motor" | "life" | "health" | "fire" | "marine" | "liability" | "micro";
  coverages: Coverage[];
  pricingRules: PricingRule[];
  underwritingRules: UnderwritingRule[];
  claimRules: ClaimRule[];
}

interface Coverage {
  id: string;
  name: string;
  type: "basic" | "optional" | "addon";
  sumInsuredMin: number;
  sumInsuredMax: number;
  deductiblePercent: number;
  exclusions: string[];
}

interface PricingRule {
  factor: string;
  weight: number;
  formula: "linear" | "stepped" | "table";
  parameters: Record<string, number>;
}

interface UnderwritingRule {
  field: string;
  condition: "gt" | "lt" | "eq" | "in" | "not_in";
  value: string | number | string[];
  action: "accept" | "refer" | "decline" | "load";
  loadingPercent?: number;
}

interface ClaimRule {
  type: string;
  autoApproveMax: number;
  requiredDocuments: string[];
  slaHours: number;
}

// NAICOM product categories with regulatory requirements
const NAICOM_CATEGORIES: Record<string, { minCapital: number; requiredReserve: number }> = {
  motor: { minCapital: 3000000000, requiredReserve: 0.40 },
  life: { minCapital: 8000000000, requiredReserve: 0.50 },
  health: { minCapital: 3000000000, requiredReserve: 0.35 },
  fire: { minCapital: 3000000000, requiredReserve: 0.30 },
  marine: { minCapital: 5000000000, requiredReserve: 0.45 },
  liability: { minCapital: 3000000000, requiredReserve: 0.35 },
  micro: { minCapital: 600000000, requiredReserve: 0.25 },
};

function validateProduct(product: ProductTemplate): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!product.name || product.name.length < 3) {
    errors.push("Product name must be at least 3 characters");
  }

  if (!NAICOM_CATEGORIES[product.category]) {
    errors.push(`Invalid NAICOM category: ${product.category}`);
  }

  if (product.coverages.length === 0) {
    errors.push("At least one coverage is required");
  }

  const basicCoverages = product.coverages.filter(c => c.type === "basic");
  if (basicCoverages.length === 0) {
    errors.push("At least one basic coverage is required");
  }

  for (const coverage of product.coverages) {
    if (coverage.sumInsuredMin >= coverage.sumInsuredMax) {
      errors.push(`Coverage ${coverage.name}: min sum insured must be less than max`);
    }
    if (coverage.deductiblePercent < 0 || coverage.deductiblePercent > 50) {
      errors.push(`Coverage ${coverage.name}: deductible must be 0-50%`);
    }
  }

  if (product.pricingRules.length === 0) {
    errors.push("At least one pricing rule is required");
  }

  return { valid: errors.length === 0, errors };
}

function calculatePremium(product: ProductTemplate, riskFactors: Record<string, number>): number {
  let basePremium = 0;

  for (const rule of product.pricingRules) {
    const factorValue = riskFactors[rule.factor] || 0;
    switch (rule.formula) {
      case "linear":
        basePremium += factorValue * rule.weight * (rule.parameters.coefficient || 1);
        break;
      case "stepped":
        const steps = rule.parameters;
        for (const [threshold, rate] of Object.entries(steps).sort(([a], [b]) => Number(a) - Number(b))) {
          if (factorValue >= Number(threshold)) {
            basePremium += factorValue * rate * rule.weight;
          }
        }
        break;
      case "table":
        basePremium += (rule.parameters[String(Math.floor(factorValue))] || 0) * rule.weight;
        break;
    }
  }

  return Math.round(Math.max(basePremium, 5000)); // NAICOM minimum
}

export { validateProduct, calculatePremium, NAICOM_CATEGORIES };
export type { ProductTemplate, Coverage, PricingRule, UnderwritingRule, ClaimRule };
