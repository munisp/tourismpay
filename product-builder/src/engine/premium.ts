export class PremiumFormulaEngine {
  calculate(
    formula: {
      baseRate: number;
      factors: Array<{ variable: string; type: string; values: Record<string, number> }>;
      minPremium: number;
      maxPremium: number;
      taxes: Array<{ name: string; rate: number }>;
    },
    variables: Record<string, unknown>
  ) {
    let premium = formula.baseRate;

    for (const factor of formula.factors || []) {
      const value = String(variables[factor.variable] || "");
      if (factor.type === "multiplier" && factor.values[value]) {
        premium *= factor.values[value];
      } else if (factor.type === "additive" && factor.values[value]) {
        premium += factor.values[value];
      }
    }

    let subtotal = premium;
    const taxDetails: Array<{ name: string; amount: number }> = [];
    for (const tax of formula.taxes || []) {
      const taxAmount = Math.round(subtotal * tax.rate * 100) / 100;
      taxDetails.push({ name: tax.name, amount: taxAmount });
      premium += taxAmount;
    }

    premium = Math.max(formula.minPremium || 0, Math.min(formula.maxPremium || Infinity, premium));
    premium = Math.round(premium * 100) / 100;

    return {
      basePremium: formula.baseRate,
      adjustedPremium: subtotal,
      taxes: taxDetails,
      totalPremium: premium,
      currency: "NGN",
    };
  }
}
