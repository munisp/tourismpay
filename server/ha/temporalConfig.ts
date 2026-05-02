/**
 * Temporal High-Availability Configuration
 *
 * Defines worker pool settings, workflow retry policies, activity timeouts,
 * and task queue configurations for the TourismPay workflow orchestration layer.
 *
 * Workflows:
 *  - RemittanceWorkflow     → end-to-end remittance lifecycle
 *  - SettlementWorkflow     → daily settlement batch processing
 *  - KYBOnboardingWorkflow  → KYB application state machine
 *  - FraudInvestigation     → automated fraud investigation pipeline
 */

export interface TemporalWorkerConfig {
  taskQueue: string;
  maxConcurrentActivityTaskExecutions: number;
  maxConcurrentWorkflowTaskExecutions: number;
  maxConcurrentLocalActivityExecutions: number;
  workerCount: number;
}

export interface RetryPolicy {
  initialInterval: string;       // e.g. "1s"
  backoffCoefficient: number;
  maximumInterval: string;       // e.g. "100s"
  maximumAttempts: number;
  nonRetryableErrorTypes?: string[];
}

export interface WorkflowConfig {
  name: string;
  taskQueue: string;
  executionTimeout: string;
  runTimeout: string;
  taskTimeout: string;
  retryPolicy: RetryPolicy;
}

export interface ActivityConfig {
  name: string;
  scheduleToCloseTimeout: string;
  scheduleToStartTimeout: string;
  startToCloseTimeout: string;
  heartbeatTimeout?: string;
  retryPolicy: RetryPolicy;
}

export interface TemporalHAConfig {
  namespace: string;
  serverAddresses: string[];
  tls: boolean;
  workers: TemporalWorkerConfig[];
  workflows: WorkflowConfig[];
  activities: ActivityConfig[];
}

export const TEMPORAL_HA_CONFIG: TemporalHAConfig = {
  namespace: process.env.TEMPORAL_NAMESPACE ?? "tourismpay-production",

  // Multi-node Temporal cluster for high availability
  serverAddresses: [
    process.env.TEMPORAL_HOST_1 ?? "temporal-1:7233",
    process.env.TEMPORAL_HOST_2 ?? "temporal-2:7233",
    process.env.TEMPORAL_HOST_3 ?? "temporal-3:7233",
  ],

  tls: process.env.TEMPORAL_TLS === "true",

  workers: [
    {
      taskQueue: "remittance-processing",
      maxConcurrentActivityTaskExecutions: 100,
      maxConcurrentWorkflowTaskExecutions: 50,
      maxConcurrentLocalActivityExecutions: 200,
      workerCount: 3, // 3 worker replicas for HA
    },
    {
      taskQueue: "settlement-processing",
      maxConcurrentActivityTaskExecutions: 20,
      maxConcurrentWorkflowTaskExecutions: 10,
      maxConcurrentLocalActivityExecutions: 40,
      workerCount: 2,
    },
    {
      taskQueue: "kyb-onboarding",
      maxConcurrentActivityTaskExecutions: 50,
      maxConcurrentWorkflowTaskExecutions: 25,
      maxConcurrentLocalActivityExecutions: 100,
      workerCount: 2,
    },
    {
      taskQueue: "fraud-investigation",
      maxConcurrentActivityTaskExecutions: 30,
      maxConcurrentWorkflowTaskExecutions: 15,
      maxConcurrentLocalActivityExecutions: 60,
      workerCount: 2,
    },
  ],

  workflows: [
    {
      name: "RemittanceWorkflow",
      taskQueue: "remittance-processing",
      executionTimeout: "24h",    // Max 24h for a remittance to complete
      runTimeout: "1h",
      taskTimeout: "10s",
      retryPolicy: {
        initialInterval: "1s",
        backoffCoefficient: 2,
        maximumInterval: "100s",
        maximumAttempts: 5,
        nonRetryableErrorTypes: ["KillSwitchActiveError", "ComplianceBlockError"],
      },
    },
    {
      name: "SettlementWorkflow",
      taskQueue: "settlement-processing",
      executionTimeout: "6h",
      runTimeout: "2h",
      taskTimeout: "30s",
      retryPolicy: {
        initialInterval: "5s",
        backoffCoefficient: 2,
        maximumInterval: "300s",
        maximumAttempts: 3,
        nonRetryableErrorTypes: ["SettlementWindowClosedError"],
      },
    },
    {
      name: "KYBOnboardingWorkflow",
      taskQueue: "kyb-onboarding",
      executionTimeout: "30d",    // KYB can take up to 30 days
      runTimeout: "7d",
      taskTimeout: "60s",
      retryPolicy: {
        initialInterval: "10s",
        backoffCoefficient: 1.5,
        maximumInterval: "600s",
        maximumAttempts: 10,
      },
    },
    {
      name: "FraudInvestigationWorkflow",
      taskQueue: "fraud-investigation",
      executionTimeout: "72h",
      runTimeout: "24h",
      taskTimeout: "30s",
      retryPolicy: {
        initialInterval: "2s",
        backoffCoefficient: 2,
        maximumInterval: "120s",
        maximumAttempts: 5,
      },
    },
  ],

  activities: [
    {
      name: "createTigerBeetleTransfer",
      scheduleToCloseTimeout: "30s",
      scheduleToStartTimeout: "10s",
      startToCloseTimeout: "20s",
      heartbeatTimeout: "5s",
      retryPolicy: {
        initialInterval: "500ms",
        backoffCoefficient: 2,
        maximumInterval: "30s",
        maximumAttempts: 5,
        nonRetryableErrorTypes: ["DuplicateTransferError"],
      },
    },
    {
      name: "submitMojaloopTransfer",
      scheduleToCloseTimeout: "60s",
      scheduleToStartTimeout: "10s",
      startToCloseTimeout: "50s",
      heartbeatTimeout: "10s",
      retryPolicy: {
        initialInterval: "1s",
        backoffCoefficient: 2,
        maximumInterval: "60s",
        maximumAttempts: 3,
        nonRetryableErrorTypes: ["ParticipantNotFoundError", "QuoteExpiredError"],
      },
    },
    {
      name: "runBISInvestigation",
      scheduleToCloseTimeout: "5m",
      scheduleToStartTimeout: "30s",
      startToCloseTimeout: "4m",
      heartbeatTimeout: "30s",
      retryPolicy: {
        initialInterval: "5s",
        backoffCoefficient: 2,
        maximumInterval: "120s",
        maximumAttempts: 3,
      },
    },
    {
      name: "sendSettlementNotification",
      scheduleToCloseTimeout: "30s",
      scheduleToStartTimeout: "5s",
      startToCloseTimeout: "25s",
      retryPolicy: {
        initialInterval: "2s",
        backoffCoefficient: 2,
        maximumInterval: "30s",
        maximumAttempts: 5,
      },
    },
  ],
};

export function getTemporalConfigSummary() {
  return {
    namespace: TEMPORAL_HA_CONFIG.namespace,
    serverCount: TEMPORAL_HA_CONFIG.serverAddresses.length,
    tlsEnabled: TEMPORAL_HA_CONFIG.tls,
    totalWorkers: TEMPORAL_HA_CONFIG.workers.reduce((sum, w) => sum + w.workerCount, 0),
    taskQueues: TEMPORAL_HA_CONFIG.workers.map(w => w.taskQueue),
    workflowCount: TEMPORAL_HA_CONFIG.workflows.length,
    activityCount: TEMPORAL_HA_CONFIG.activities.length,
    workflows: TEMPORAL_HA_CONFIG.workflows.map(w => ({
      name: w.name,
      taskQueue: w.taskQueue,
      executionTimeout: w.executionTimeout,
      maxAttempts: w.retryPolicy.maximumAttempts,
    })),
  };
}

// ─── Temporal Workflow Simulator ─────────────────────────────────────────────
// Models the full remittance lifecycle as a deterministic state machine.
// In production this would be backed by the Temporal Go SDK; here it provides
// a testable in-process simulation of all state transitions, timeouts, and
// compensation (reversal) logic.

export type WorkflowState =
  | "pending"
  | "quote_requested"
  | "quote_accepted"
  | "transfer_submitted"
  | "completed"
  | "failed"
  | "reversed"
  | "timed_out";

export interface WorkflowTransition {
  from: WorkflowState;
  to: WorkflowState;
  event: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface WorkflowInstance {
  workflowId: string;
  runId: string;
  state: WorkflowState;
  transitions: WorkflowTransition[];
  createdAt: number;
  updatedAt: number;
  timeoutAt: number | null;
  compensationRequired: boolean;
  compensationCompleted: boolean;
  metadata: Record<string, unknown>;
}

export interface WorkflowResult {
  success: boolean;
  finalState: WorkflowState;
  transitions: WorkflowTransition[];
  durationMs: number;
  compensated: boolean;
  error?: string;
}

/** Valid state transitions in the remittance workflow */
export const VALID_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  pending: ["quote_requested", "failed", "timed_out"],
  quote_requested: ["quote_accepted", "failed", "timed_out"],
  quote_accepted: ["transfer_submitted", "failed", "timed_out"],
  transfer_submitted: ["completed", "failed", "timed_out"],
  completed: [], // terminal
  failed: ["reversed"], // compensation path
  reversed: [], // terminal
  timed_out: ["reversed"], // compensation path
};

/** States that require compensation (reversal) */
export const COMPENSATION_STATES: WorkflowState[] = ["failed", "timed_out"];

/** Terminal states */
export const TERMINAL_STATES: WorkflowState[] = ["completed", "reversed"];

export class TemporalWorkflowSimulator {
  private instances: Map<string, WorkflowInstance> = new Map();
  private readonly defaultTimeoutMs: number;
  private readonly maxRetries: number;

  constructor(options: { defaultTimeoutMs?: number; maxRetries?: number } = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000; // 30s default
    this.maxRetries = options.maxRetries ?? 3;
  }

  /** Start a new workflow instance */
  startWorkflow(
    workflowId: string,
    metadata: Record<string, unknown> = {},
    timeoutMs?: number
  ): WorkflowInstance {
    if (this.instances.has(workflowId)) {
      throw new Error(`Workflow ${workflowId} already exists`);
    }

    const now = Date.now();
    const instance: WorkflowInstance = {
      workflowId,
      runId: `run_${Math.random().toString(36).slice(2)}`,
      state: "pending",
      transitions: [],
      createdAt: now,
      updatedAt: now,
      timeoutAt: now + (timeoutMs ?? this.defaultTimeoutMs),
      compensationRequired: false,
      compensationCompleted: false,
      metadata,
    };

    this.instances.set(workflowId, instance);
    return { ...instance };
  }

  /** Advance a workflow to the next state */
  transition(
    workflowId: string,
    event: string,
    targetState: WorkflowState,
    metadata?: Record<string, unknown>
  ): WorkflowInstance {
    const instance = this.instances.get(workflowId);
    if (!instance) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    if (TERMINAL_STATES.includes(instance.state)) {
      throw new Error(
        `Workflow ${workflowId} is in terminal state ${instance.state} and cannot transition`
      );
    }

    const validNextStates = VALID_TRANSITIONS[instance.state];
    if (!validNextStates.includes(targetState)) {
      throw new Error(
        `Invalid transition: ${instance.state} → ${targetState} for event "${event}". ` +
        `Valid next states: [${validNextStates.join(", ")}]`
      );
    }

    const now = Date.now();

    // Check for timeout
    if (instance.timeoutAt && now > instance.timeoutAt && targetState !== "timed_out") {
      throw new Error(
        `Workflow ${workflowId} has timed out (timeout was at ${instance.timeoutAt})`
      );
    }

    const transition: WorkflowTransition = {
      from: instance.state,
      to: targetState,
      event,
      timestamp: now,
      metadata,
    };

    instance.transitions.push(transition);
    instance.state = targetState;
    instance.updatedAt = now;

    // Mark compensation required for failure states
    if (COMPENSATION_STATES.includes(targetState)) {
      instance.compensationRequired = true;
    }

    this.instances.set(workflowId, instance);
    return { ...instance };
  }

  /** Execute the full happy-path lifecycle synchronously (for testing) */
  executeHappyPath(
    workflowId: string,
    metadata: Record<string, unknown> = {}
  ): WorkflowResult {
    const startTime = Date.now();
    this.startWorkflow(workflowId, metadata);

    const transitions: Array<[string, WorkflowState]> = [
      ["fx_quote_requested", "quote_requested"],
      ["fx_quote_accepted", "quote_accepted"],
      ["mojaloop_transfer_prepared", "transfer_submitted"],
      ["tigerbeetle_debit_committed", "completed"],
    ];

    for (const [event, state] of transitions) {
      this.transition(workflowId, event, state);
    }

    const instance = this.instances.get(workflowId)!;
    return {
      success: true,
      finalState: instance.state,
      transitions: instance.transitions,
      durationMs: Date.now() - startTime,
      compensated: false,
    };
  }

  /** Execute the failure + compensation path */
  executeFailureWithCompensation(
    workflowId: string,
    failAtState: WorkflowState,
    metadata: Record<string, unknown> = {}
  ): WorkflowResult {
    const startTime = Date.now();
    this.startWorkflow(workflowId, metadata);

    const happyPath: Array<[string, WorkflowState]> = [
      ["fx_quote_requested", "quote_requested"],
      ["fx_quote_accepted", "quote_accepted"],
      ["mojaloop_transfer_prepared", "transfer_submitted"],
    ];

    // Execute up to the failure point
    for (const [event, state] of happyPath) {
      if (state === failAtState) break;
      try {
        this.transition(workflowId, event, state);
      } catch {
        break;
      }
    }

    // Inject failure
    const instance = this.instances.get(workflowId)!;
    const currentState = instance.state;
    const validFailStates = VALID_TRANSITIONS[currentState];
    if (validFailStates.includes("failed")) {
      this.transition(workflowId, "service_error", "failed", { reason: `Simulated failure at ${failAtState}` });
    } else if (validFailStates.includes("timed_out")) {
      this.transition(workflowId, "timeout_exceeded", "timed_out", { reason: "Simulated timeout" });
    }

    // Execute compensation
    this.transition(workflowId, "compensation_reversal", "reversed", {
      compensatedAt: Date.now(),
      originalFailState: failAtState,
    });

    const finalInstance = this.instances.get(workflowId)!;
    finalInstance.compensationCompleted = true;
    this.instances.set(workflowId, finalInstance);

    return {
      success: false,
      finalState: finalInstance.state,
      transitions: finalInstance.transitions,
      durationMs: Date.now() - startTime,
      compensated: true,
      error: `Workflow failed at ${failAtState}, compensation completed`,
    };
  }

  /** Simulate a timeout scenario */
  executeTimeout(
    workflowId: string,
    timeoutAfterState: WorkflowState,
    metadata: Record<string, unknown> = {}
  ): WorkflowResult {
    const startTime = Date.now();
    // Start workflow normally
    this.startWorkflow(workflowId, metadata);
    // Null out timeoutAt so the transition guard does not block the timed_out transition
    const inst = this.instances.get(workflowId)!;
    inst.timeoutAt = null;
    this.instances.set(workflowId, inst);
    // Transition directly to timed_out (simulating a workflow timeout)
    this.transition(workflowId, "workflow_timeout", "timed_out", {
      timedOutAt: Date.now(),
      timeoutAfterState,
    });
    // Compensate (reversal)
    this.transition(workflowId, "timeout_compensation", "reversed", {
      compensatedAt: Date.now(),
    });
    const finalInstance = this.instances.get(workflowId)!;
    finalInstance.compensationCompleted = true;
    this.instances.set(workflowId, finalInstance);
    return {
      success: false,
      finalState: finalInstance.state,
      transitions: finalInstance.transitions,
      durationMs: Date.now() - startTime,
      compensated: true,
      error: `Workflow timed out after ${timeoutAfterState}`,
    };
  }

  /** Get a workflow instance by ID */
  getWorkflow(workflowId: string): WorkflowInstance | undefined {
    const instance = this.instances.get(workflowId);
    return instance ? { ...instance } : undefined;
  }

  /** List all workflow instances */
  listWorkflows(): WorkflowInstance[] {
    return Array.from(this.instances.values()).map((i) => ({ ...i }));
  }

  /** Get statistics across all workflows */
  getStats(): {
    total: number;
    byState: Record<WorkflowState, number>;
    compensationRate: number;
    avgDurationMs: number;
  } {
    const instances = Array.from(this.instances.values());
    const byState: Record<WorkflowState, number> = {
      pending: 0,
      quote_requested: 0,
      quote_accepted: 0,
      transfer_submitted: 0,
      completed: 0,
      failed: 0,
      reversed: 0,
      timed_out: 0,
    };

    let compensated = 0;
    let totalDuration = 0;

    for (const inst of instances) {
      byState[inst.state] = (byState[inst.state] ?? 0) + 1;
      if (inst.compensationCompleted) compensated++;
      totalDuration += inst.updatedAt - inst.createdAt;
    }

    return {
      total: instances.length,
      byState,
      compensationRate: instances.length > 0 ? compensated / instances.length : 0,
      avgDurationMs: instances.length > 0 ? totalDuration / instances.length : 0,
    };
  }

  /** Reset all workflow instances (for testing) */
  reset(): void {
    this.instances.clear();
  }
}

/** Singleton simulator instance for use in tests */
export const workflowSimulator = new TemporalWorkflowSimulator({
  defaultTimeoutMs: 30_000,
  maxRetries: 3,
});
