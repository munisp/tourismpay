export class UnderwritingRuleEngine {
  evaluate(
    rules: Array<{
      field: string;
      operator: string;
      value: unknown;
      action: string;
      loadPercentage?: number;
      message?: string;
    }>,
    applicant: Record<string, unknown>
  ) {
    const results: Array<{
      rule: string;
      field: string;
      result: string;
      action: string;
      message?: string;
    }> = [];

    let finalDecision = "accept";
    let totalLoading = 0;

    for (const rule of rules || []) {
      const fieldValue = applicant[rule.field];
      let matched = false;

      switch (rule.operator) {
        case "gt": matched = Number(fieldValue) > Number(rule.value); break;
        case "lt": matched = Number(fieldValue) < Number(rule.value); break;
        case "gte": matched = Number(fieldValue) >= Number(rule.value); break;
        case "lte": matched = Number(fieldValue) <= Number(rule.value); break;
        case "eq": matched = fieldValue === rule.value; break;
        case "ne": matched = fieldValue !== rule.value; break;
        case "in": matched = Array.isArray(rule.value) && (rule.value as unknown[]).includes(fieldValue); break;
      }

      if (matched) {
        results.push({
          rule: `${rule.field} ${rule.operator} ${rule.value}`,
          field: rule.field,
          result: "triggered",
          action: rule.action,
          message: rule.message,
        });

        if (rule.action === "decline") finalDecision = "decline";
        else if (rule.action === "refer" && finalDecision !== "decline") finalDecision = "refer";
        else if (rule.action === "load") totalLoading += rule.loadPercentage || 0;
      }
    }

    return {
      decision: finalDecision,
      loading_percentage: totalLoading,
      rules_evaluated: rules?.length || 0,
      rules_triggered: results.length,
      details: results,
    };
  }
}
