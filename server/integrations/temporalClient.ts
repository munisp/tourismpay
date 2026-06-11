/**
 * Temporal Workflow Client — real connection to Temporal server
 * via HTTP API. Falls back to Go Temporal worker service, then in-memory.
 *
 * Manages long-running workflows: KYB onboarding, settlement cycles,
 * fraud investigation lifecycle, tourist trip management.
 */
import { logger } from "../_core/logger";

// ─── Configuration ───────────────────────────────────────────────────────────

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS || "localhost:7233";
const TEMPORAL_HTTP_API = process.env.TEMPORAL_HTTP_API || `http://${TEMPORAL_ADDRESS.replace(":7233", ":8233")}`;
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE || "tourismpay";
const TEMPORAL_WORKER_URL = process.env.TEMPORAL_WORKER_URL || "http://localhost:8101";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WorkflowOptions {
  workflowType: string;
  workflowId: string;
  taskQueue?: string;
  input?: Record<string, unknown>;
  searchAttributes?: Record<string, unknown>;
  memo?: Record<string, unknown>;
  retryPolicy?: { maximumAttempts: number; backoffCoefficient: number };
}

export interface WorkflowExecution {
  workflowId: string;
  runId: string;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "TERMINATED" | "TIMED_OUT";
  startedAt?: string;
  closedAt?: string;
}

// ─── Connection Check ────────────────────────────────────────────────────────

let temporalAvailable: boolean | null = null;
let goWorkerAvailable: boolean | null = null;

async function checkTemporal(): Promise<boolean> {
  if (temporalAvailable !== null) return temporalAvailable;
  try {
    const res = await fetch(`${TEMPORAL_HTTP_API}/api/v1/namespaces/${TEMPORAL_NAMESPACE}`, {
      signal: AbortSignal.timeout(3000),
    });
    temporalAvailable = res.ok;
  } catch {
    temporalAvailable = false;
  }
  setTimeout(() => { temporalAvailable = null; }, 60000);
  return temporalAvailable;
}

async function checkGoWorker(): Promise<boolean> {
  if (goWorkerAvailable !== null) return goWorkerAvailable;
  try {
    const res = await fetch(`${TEMPORAL_WORKER_URL}/health`, { signal: AbortSignal.timeout(3000) });
    goWorkerAvailable = res.ok;
  } catch {
    goWorkerAvailable = false;
  }
  setTimeout(() => { goWorkerAvailable = null; }, 60000);
  return goWorkerAvailable;
}

// ─── Temporal HTTP API ───────────────────────────────────────────────────────

async function startWorkflowViaTemporal(options: WorkflowOptions): Promise<WorkflowExecution> {
  const res = await fetch(
    `${TEMPORAL_HTTP_API}/api/v1/namespaces/${TEMPORAL_NAMESPACE}/workflows/${options.workflowId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflowType: { name: options.workflowType },
        taskQueue: { name: options.taskQueue || "tourismpay-main" },
        input: options.input ? { payloads: [{ metadata: { encoding: "anson/plain" }, data: btoa(JSON.stringify(options.input)) }] } : undefined,
        workflowExecutionTimeout: "3600s",
        retryPolicy: options.retryPolicy ? {
          maximumAttempts: options.retryPolicy.maximumAttempts,
          backoffCoefficient: options.retryPolicy.backoffCoefficient,
        } : undefined,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );

  if (!res.ok) throw new Error(`Temporal start workflow failed: ${res.status}`);
  const data = await res.json() as { runId: string };

  return {
    workflowId: options.workflowId,
    runId: data.runId,
    status: "RUNNING",
    startedAt: new Date().toISOString(),
  };
}

async function getWorkflowViaTemporal(workflowId: string): Promise<WorkflowExecution | null> {
  const res = await fetch(
    `${TEMPORAL_HTTP_API}/api/v1/namespaces/${TEMPORAL_NAMESPACE}/workflows/${workflowId}`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!res.ok) return null;
  const data = await res.json() as {
    workflowExecutionInfo?: {
      execution?: { workflowId: string; runId: string };
      status?: string;
      startTime?: string;
      closeTime?: string;
    };
  };
  const info = data.workflowExecutionInfo;
  if (!info) return null;
  return {
    workflowId: info.execution?.workflowId || workflowId,
    runId: info.execution?.runId || "",
    status: (info.status as WorkflowExecution["status"]) || "RUNNING",
    startedAt: info.startTime,
    closedAt: info.closeTime,
  };
}

// ─── Go Worker Proxy ─────────────────────────────────────────────────────────

async function startWorkflowViaGoWorker(options: WorkflowOptions): Promise<WorkflowExecution> {
  const res = await fetch(`${TEMPORAL_WORKER_URL}/api/v1/temporal/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workflowType: options.workflowType,
      workflowId: options.workflowId,
      input: options.input,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Go worker start workflow failed: ${res.status}`);
  const data = await res.json() as Record<string, string>;
  return {
    workflowId: options.workflowId,
    runId: data.runId || `go-${Date.now()}`,
    status: "RUNNING",
    startedAt: new Date().toISOString(),
  };
}

// ─── In-Memory Fallback ──────────────────────────────────────────────────────

const memoryWorkflows = new Map<string, WorkflowExecution>();

function startWorkflowInMemory(options: WorkflowOptions): WorkflowExecution {
  const exec: WorkflowExecution = {
    workflowId: options.workflowId,
    runId: `mem-${Date.now()}-${Array.from(crypto.getRandomValues(new Uint8Array(4))).map(b => b.toString(36)).join("").slice(0, 6)}`,
    status: "RUNNING",
    startedAt: new Date().toISOString(),
  };
  memoryWorkflows.set(options.workflowId, exec);
  // Auto-complete after simulated duration
  setTimeout(() => {
    const wf = memoryWorkflows.get(options.workflowId);
    if (wf && wf.status === "RUNNING") {
      wf.status = "COMPLETED";
      wf.closedAt = new Date().toISOString();
    }
  }, 5000);
  return exec;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function startWorkflow(options: WorkflowOptions): Promise<{ execution: WorkflowExecution; via: string }> {
  // Try Temporal HTTP API
  if (await checkTemporal()) {
    try {
      const exec = await startWorkflowViaTemporal(options);
      return { execution: exec, via: "temporal" };
    } catch (err) {
      logger.warn("[Temporal] Direct API failed", { error: (err as Error).message });
    }
  }

  // Try Go Worker
  if (await checkGoWorker()) {
    try {
      const exec = await startWorkflowViaGoWorker(options);
      return { execution: exec, via: "go-worker" };
    } catch { /* fall through */ }
  }

  // In-memory fallback
  const exec = startWorkflowInMemory(options);
  logger.warn("[Temporal] Using in-memory workflow", { workflowId: options.workflowId });
  return { execution: exec, via: "in-memory" };
}

export async function getWorkflowStatus(workflowId: string): Promise<WorkflowExecution | null> {
  if (await checkTemporal()) {
    try { return await getWorkflowViaTemporal(workflowId); } catch { /* fall through */ }
  }
  return memoryWorkflows.get(workflowId) || null;
}

export function getTemporalStatus(): {
  temporalAvailable: boolean;
  goWorkerAvailable: boolean;
  inMemoryWorkflowCount: number;
  address: string;
  namespace: string;
} {
  return {
    temporalAvailable: temporalAvailable ?? false,
    goWorkerAvailable: goWorkerAvailable ?? false,
    inMemoryWorkflowCount: memoryWorkflows.size,
    address: TEMPORAL_ADDRESS,
    namespace: TEMPORAL_NAMESPACE,
  };
}

// ─── Convenience Workflow Starters ───────────────────────────────────────────

export const startKYBOnboarding = (establishmentId: number, applicantId: number) =>
  startWorkflow({
    workflowType: "KYBOnboardingWorkflow",
    workflowId: `kyb-onboarding-${establishmentId}`,
    input: { establishmentId, applicantId },
    retryPolicy: { maximumAttempts: 3, backoffCoefficient: 2 },
  });

export const startSettlementCycle = (settlementId: string, participantIds: string[]) =>
  startWorkflow({
    workflowType: "SettlementCycleWorkflow",
    workflowId: `settlement-${settlementId}`,
    input: { settlementId, participantIds },
  });

export const startFraudInvestigation = (alertId: string, entityId: string) =>
  startWorkflow({
    workflowType: "FraudInvestigationWorkflow",
    workflowId: `fraud-investigation-${alertId}`,
    input: { alertId, entityId },
  });
