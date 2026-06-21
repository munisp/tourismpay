/**
 * Temporal Workflow Runtime Client
 *
 * Provides durable workflow orchestration for long-running processes:
 *  - Remittance processing (multi-step with compliance checks)
 *  - Settlement window management
 *  - KYB onboarding (document verification pipeline)
 *  - Fraud investigation workflows
 *
 * Falls back to synchronous execution when Temporal is unavailable.
 */
import { logger } from "./logger";

// ─── Temporal Client (lazy-loaded to avoid hard dependency) ──────────────────

interface TemporalClient {
  start(workflowId: string, taskQueue: string, workflowFn: string, args: unknown[]): Promise<string>;
  signal(workflowId: string, signalName: string, args: unknown[]): Promise<void>;
  query(workflowId: string, queryName: string): Promise<unknown>;
  cancel(workflowId: string): Promise<void>;
  getStatus(workflowId: string): Promise<{ status: string; result?: unknown }>;
}

let client: TemporalClient | null = null;
let connectionAttempted = false;

export async function getTemporalClient(): Promise<TemporalClient | null> {
  if (client) return client;
  if (connectionAttempted) return null;
  connectionAttempted = true;

  const address = process.env.TEMPORAL_ADDRESS || "localhost:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE || "tourismpay";

  try {
    // Dynamic import — only loads if @temporalio/client is installed
    const modulePath = "@temporalio/client";
    const temporalModule = await (Function("m", "return import(m)")(modulePath) as Promise<any>).catch(() => null);
    if (!temporalModule) {
      logger.warn("[Temporal] @temporalio/client not installed — workflows execute synchronously");
      return null;
    }
    const { Connection, Client } = temporalModule;
    const connection = await Connection.connect({ address });
    const temporalClient = new Client({ connection, namespace });

    client = {
      async start(workflowId, taskQueue, workflowFn, args) {
        const handle = await temporalClient.workflow.start(workflowFn as any, {
          taskQueue,
          workflowId,
          args,
        });
        return handle.workflowId;
      },
      async signal(workflowId, signalName, args) {
        const handle = temporalClient.workflow.getHandle(workflowId);
        await handle.signal(signalName, ...args);
      },
      async query(workflowId, queryName) {
        const handle = temporalClient.workflow.getHandle(workflowId);
        return handle.query(queryName);
      },
      async cancel(workflowId) {
        const handle = temporalClient.workflow.getHandle(workflowId);
        await handle.cancel();
      },
      async getStatus(workflowId) {
        const handle = temporalClient.workflow.getHandle(workflowId);
        const desc = await handle.describe();
        return { status: desc.status.name, result: undefined };
      },
    };
    logger.info(`[Temporal] Connected to ${address}/${namespace}`);
    return client;
  } catch (err) {
    logger.warn(`[Temporal] Connection failed (${address}): ${(err as Error).message} — workflows will execute synchronously`);
    return null;
  }
}

// ─── Task Queues ─────────────────────────────────────────────────────────────

export const TASK_QUEUES = {
  REMITTANCE: "tourismpay-remittance",
  SETTLEMENT: "tourismpay-settlement",
  KYB: "tourismpay-kyb-onboarding",
  FRAUD: "tourismpay-fraud-investigation",
} as const;

// ─── Workflow Starters ───────────────────────────────────────────────────────

export interface RemittanceWorkflowInput {
  remittanceId: string;
  senderId: number;
  recipientId: string;
  amount: string;
  sourceCurrency: string;
  destCurrency: string;
  corridor: string;
}

export async function startRemittanceWorkflow(input: RemittanceWorkflowInput): Promise<string | null> {
  const tc = await getTemporalClient();
  if (!tc) return null; // Fallback: caller handles synchronously
  try {
    return await tc.start(
      `remittance-${input.remittanceId}`,
      TASK_QUEUES.REMITTANCE,
      "remittanceWorkflow",
      [input],
    );
  } catch (err) {
    logger.error(`[Temporal] Failed to start remittance workflow: ${(err as Error).message}`);
    return null;
  }
}

export interface SettlementWorkflowInput {
  windowId: string;
  corridors: string[];
  initiatedBy: string;
}

export async function startSettlementWorkflow(input: SettlementWorkflowInput): Promise<string | null> {
  const tc = await getTemporalClient();
  if (!tc) return null;
  try {
    return await tc.start(
      `settlement-${input.windowId}`,
      TASK_QUEUES.SETTLEMENT,
      "settlementWorkflow",
      [input],
    );
  } catch (err) {
    logger.error(`[Temporal] Failed to start settlement workflow: ${(err as Error).message}`);
    return null;
  }
}

export interface KybOnboardingWorkflowInput {
  applicationId: number;
  establishmentId: number;
  submittedBy: number;
}

export async function startKybOnboardingWorkflow(input: KybOnboardingWorkflowInput): Promise<string | null> {
  const tc = await getTemporalClient();
  if (!tc) return null;
  try {
    return await tc.start(
      `kyb-onboarding-${input.applicationId}`,
      TASK_QUEUES.KYB,
      "kybOnboardingWorkflow",
      [input],
    );
  } catch (err) {
    logger.error(`[Temporal] Failed to start KYB workflow: ${(err as Error).message}`);
    return null;
  }
}

export interface FraudInvestigationWorkflowInput {
  alertId: number;
  severity: string;
  transactionId?: string;
  establishmentId?: number;
}

export async function startFraudInvestigationWorkflow(input: FraudInvestigationWorkflowInput): Promise<string | null> {
  const tc = await getTemporalClient();
  if (!tc) return null;
  try {
    return await tc.start(
      `fraud-investigation-${input.alertId}`,
      TASK_QUEUES.FRAUD,
      "fraudInvestigationWorkflow",
      [input],
    );
  } catch (err) {
    logger.error(`[Temporal] Failed to start fraud investigation workflow: ${(err as Error).message}`);
    return null;
  }
}

// ─── Workflow Signals & Queries ───────────────────────────────────────────────

export async function signalWorkflow(workflowId: string, signal: string, ...args: unknown[]): Promise<boolean> {
  const tc = await getTemporalClient();
  if (!tc) return false;
  try {
    await tc.signal(workflowId, signal, args);
    return true;
  } catch (err) {
    logger.error(`[Temporal] Signal ${signal} to ${workflowId} failed: ${(err as Error).message}`);
    return false;
  }
}

export async function queryWorkflow(workflowId: string, query: string): Promise<unknown | null> {
  const tc = await getTemporalClient();
  if (!tc) return null;
  try {
    return await tc.query(workflowId, query);
  } catch (err) {
    logger.error(`[Temporal] Query ${query} on ${workflowId} failed: ${(err as Error).message}`);
    return null;
  }
}

export async function cancelWorkflow(workflowId: string): Promise<boolean> {
  const tc = await getTemporalClient();
  if (!tc) return false;
  try {
    await tc.cancel(workflowId);
    return true;
  } catch (err) {
    logger.error(`[Temporal] Cancel ${workflowId} failed: ${(err as Error).message}`);
    return false;
  }
}
