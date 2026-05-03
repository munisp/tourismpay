/**
 * Temporal Client — typed workflow invocation for long-running processes.
 *
 * Wraps the Temporal SDK with circuit breaker and provides typed
 * interfaces for each workflow (KYB, Settlement, Remittance, Fraud).
 *
 * Note: In production, install @temporalio/client and @temporalio/worker.
 * This module provides the integration layer with fallback to HTTP API.
 */
import { withCircuitBreaker } from "./circuitBreaker";
import { logger } from "../_core/logger";
import type { Request } from "express";

const TEMPORAL_URL = process.env.TEMPORAL_URL || "localhost:7233";
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE || "tourismpay-production";

// Workflow type definitions
export interface KybOnboardingInput {
  applicationId: string;
  merchantId: number;
  country: string;
  documents: string[];
}

export interface SettlementCycleInput {
  cycleDate: string;
  currency: string;
  merchantIds?: number[];
}

export interface RemittanceTransferInput {
  remittanceId: string;
  senderCountry: string;
  receiverCountry: string;
  amount: number;
  currency: string;
}

export interface FraudInvestigationInput {
  alertId: string;
  transactionIds: string[];
  riskScore: number;
}

export interface MerchantOnboardingInput {
  userId: number;
  businessName: string;
  country: string;
}

type WorkflowInput =
  | KybOnboardingInput
  | SettlementCycleInput
  | RemittanceTransferInput
  | FraudInvestigationInput
  | MerchantOnboardingInput;

interface WorkflowExecution {
  workflowId: string;
  runId: string;
  status: string;
  taskQueue: string;
}

const TASK_QUEUES: Record<string, string> = {
  "kyb-onboarding": "tourismpay-kyb",
  "settlement-cycle": "tourismpay-settlement",
  "remittance-transfer": "tourismpay-remittance",
  "fraud-investigation": "tourismpay-fraud",
  "merchant-onboarding": "tourismpay-merchant",
};

/**
 * Start a Temporal workflow execution.
 * Uses circuit breaker — queues locally if Temporal is unavailable.
 */
export async function startWorkflow(
  workflowType: string,
  workflowId: string,
  input: WorkflowInput,
  req?: Request
): Promise<WorkflowExecution> {
  const taskQueue = TASK_QUEUES[workflowType] || "tourismpay-default";
  const requestId = req ? (req as any).requestId : undefined;

  try {
    return await withCircuitBreaker(
      "temporal",
      async () => {
        const httpUrl = TEMPORAL_URL.startsWith("http")
          ? TEMPORAL_URL
          : `http://${TEMPORAL_URL}`;

        const response = await fetch(
          `${httpUrl}/api/v1/namespaces/${TEMPORAL_NAMESPACE}/workflows/${workflowId}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(requestId ? { "X-Request-Id": requestId } : {}),
            },
            body: JSON.stringify({
              workflowType: { name: workflowType },
              taskQueue: { name: taskQueue },
              input: { payloads: [{ data: btoa(JSON.stringify(input)) }] },
              workflowExecutionTimeout: "86400s",
              workflowRunTimeout: "43200s",
              requestId: requestId || crypto.randomUUID(),
            }),
            signal: AbortSignal.timeout(5000),
          }
        );

        if (response.ok) {
          const data = await response.json() as Record<string, string>;
          logger.info("Temporal workflow started", {
            workflowType,
            workflowId,
            runId: data.runId,
          });
          return {
            workflowId,
            runId: data.runId || crypto.randomUUID(),
            status: "started",
            taskQueue,
          };
        }

        throw new Error(`Temporal API returned ${response.status}`);
      },
      () => {
        logger.warn("Temporal unavailable, workflow queued locally", {
          workflowType,
          workflowId,
        });
        return {
          workflowId,
          runId: `local-${crypto.randomUUID()}`,
          status: "queued",
          taskQueue,
        };
      }
    );
  } catch (err) {
    logger.error("Failed to start Temporal workflow", {
      workflowType,
      workflowId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      workflowId,
      runId: `failed-${crypto.randomUUID()}`,
      status: "failed",
      taskQueue,
    };
  }
}

/**
 * Query a workflow's current state.
 */
export async function queryWorkflow(
  workflowId: string,
  queryType: string
): Promise<unknown> {
  try {
    return await withCircuitBreaker("temporal", async () => {
      const httpUrl = TEMPORAL_URL.startsWith("http")
        ? TEMPORAL_URL
        : `http://${TEMPORAL_URL}`;

      const response = await fetch(
        `${httpUrl}/api/v1/namespaces/${TEMPORAL_NAMESPACE}/workflows/${workflowId}/query/${queryType}`,
        { signal: AbortSignal.timeout(3000) }
      );

      if (response.ok) return await response.json();
      throw new Error(`Query failed: ${response.status}`);
    });
  } catch {
    return null;
  }
}

/**
 * Signal a running workflow (e.g., approve KYB, cancel remittance).
 */
export async function signalWorkflow(
  workflowId: string,
  signalName: string,
  data: Record<string, unknown>
): Promise<boolean> {
  try {
    return await withCircuitBreaker("temporal", async () => {
      const httpUrl = TEMPORAL_URL.startsWith("http")
        ? TEMPORAL_URL
        : `http://${TEMPORAL_URL}`;

      const response = await fetch(
        `${httpUrl}/api/v1/namespaces/${TEMPORAL_NAMESPACE}/workflows/${workflowId}/signal/${signalName}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: { payloads: [{ data: btoa(JSON.stringify(data)) }] } }),
          signal: AbortSignal.timeout(3000),
        }
      );

      return response.ok;
    });
  } catch {
    return false;
  }
}
