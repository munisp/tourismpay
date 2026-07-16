export class ClaimsWorkflowEngine {
  evaluate(
    workflow: Array<{
      id: string;
      name: string;
      type: string;
      condition?: string;
      autoApproveThreshold?: number;
      requiredDocuments?: string[];
      approverRole?: string;
    }>,
    claim: Record<string, unknown>
  ) {
    const steps: Array<{
      step: string;
      type: string;
      status: string;
      action: string;
      details?: string;
    }> = [];

    for (const step of workflow || []) {
      switch (step.type) {
        case "auto_check":
          if (step.autoApproveThreshold && Number(claim.amount) <= step.autoApproveThreshold) {
            steps.push({ step: step.name, type: step.type, status: "passed", action: "auto_approve", details: `Amount ${claim.amount} <= threshold ${step.autoApproveThreshold}` });
          } else {
            steps.push({ step: step.name, type: step.type, status: "failed", action: "escalate", details: `Amount ${claim.amount} > threshold ${step.autoApproveThreshold}` });
          }
          break;
        case "document_required":
          steps.push({ step: step.name, type: step.type, status: "pending", action: "request_documents", details: `Required: ${(step.requiredDocuments || []).join(", ")}` });
          break;
        case "approval":
          steps.push({ step: step.name, type: step.type, status: "pending", action: "route_to_approver", details: `Approver: ${step.approverRole}` });
          break;
        case "payment":
          steps.push({ step: step.name, type: step.type, status: "pending", action: "initiate_payment" });
          break;
      }
    }

    const autoApprovable = steps.every(s => s.status === "passed" || s.type === "payment");
    return {
      claim_id: claim.id,
      workflow_result: autoApprovable ? "auto_approved" : "manual_review",
      steps,
      estimated_time: autoApprovable ? "< 4 hours" : "1-3 business days",
    };
  }
}
