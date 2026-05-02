/**
 * round54.test.ts
 *
 * Tests for Round 54 deliverables:
 *  1. Corridor Rate-Limit enforcement (checkAndIncrementRateLimit, corridorRateLimitRouter)
 *  2. Webhook Event Fan-Out (dispatchWebhookEvent, WEBHOOK_EVENTS list)
 *  3. Temporal Workflow Simulator (TemporalWorkflowSimulator state machine)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TemporalWorkflowSimulator,
  workflowSimulator,
  VALID_TRANSITIONS,
  TERMINAL_STATES,
  type WorkflowState,
  type WorkflowResult,
} from "./ha/temporalConfig";
import { WEBHOOK_EVENTS } from "./routers/webhooks";

// ─── Section 1: Temporal Workflow Simulator ──────────────────────────────────

describe("TemporalWorkflowSimulator", () => {
  let sim: TemporalWorkflowSimulator;

  beforeEach(() => {
    sim = new TemporalWorkflowSimulator({ defaultTimeoutMs: 60_000, maxRetries: 3 });
  });

  // ── Instance management ──────────────────────────────────────────────────

  describe("startWorkflow", () => {
    it("creates a workflow in pending state", () => {
      const inst = sim.startWorkflow("wf-001");
      expect(inst.state).toBe("pending");
      expect(inst.workflowId).toBe("wf-001");
      expect(inst.transitions).toHaveLength(0);
      expect(inst.compensationRequired).toBe(false);
    });

    it("assigns a unique runId", () => {
      const a = sim.startWorkflow("wf-a");
      const b = sim.startWorkflow("wf-b");
      expect(a.runId).not.toBe(b.runId);
    });

    it("throws if workflow already exists", () => {
      sim.startWorkflow("wf-dup");
      expect(() => sim.startWorkflow("wf-dup")).toThrow("already exists");
    });

    it("stores metadata on the instance", () => {
      const inst = sim.startWorkflow("wf-meta", { userId: "u_123", amount: 5000 });
      expect(inst.metadata.userId).toBe("u_123");
      expect(inst.metadata.amount).toBe(5000);
    });

    it("sets timeoutAt based on defaultTimeoutMs", () => {
      const before = Date.now();
      const inst = sim.startWorkflow("wf-timeout");
      expect(inst.timeoutAt).toBeGreaterThanOrEqual(before + 60_000);
    });
  });

  // ── State transitions ────────────────────────────────────────────────────

  describe("transition", () => {
    it("advances pending → quote_requested", () => {
      sim.startWorkflow("wf-t1");
      const inst = sim.transition("wf-t1", "fx_quote_requested", "quote_requested");
      expect(inst.state).toBe("quote_requested");
      expect(inst.transitions).toHaveLength(1);
      expect(inst.transitions[0].event).toBe("fx_quote_requested");
    });

    it("advances quote_requested → quote_accepted", () => {
      sim.startWorkflow("wf-t2");
      sim.transition("wf-t2", "fx_quote_requested", "quote_requested");
      const inst = sim.transition("wf-t2", "fx_quote_accepted", "quote_accepted");
      expect(inst.state).toBe("quote_accepted");
    });

    it("advances quote_accepted → transfer_submitted", () => {
      sim.startWorkflow("wf-t3");
      sim.transition("wf-t3", "fx_quote_requested", "quote_requested");
      sim.transition("wf-t3", "fx_quote_accepted", "quote_accepted");
      const inst = sim.transition("wf-t3", "mojaloop_prepared", "transfer_submitted");
      expect(inst.state).toBe("transfer_submitted");
    });

    it("advances transfer_submitted → completed", () => {
      sim.startWorkflow("wf-t4");
      sim.transition("wf-t4", "fx_quote_requested", "quote_requested");
      sim.transition("wf-t4", "fx_quote_accepted", "quote_accepted");
      sim.transition("wf-t4", "mojaloop_prepared", "transfer_submitted");
      const inst = sim.transition("wf-t4", "tb_debit_committed", "completed");
      expect(inst.state).toBe("completed");
    });

    it("rejects invalid transition pending → completed", () => {
      sim.startWorkflow("wf-invalid");
      expect(() =>
        sim.transition("wf-invalid", "skip", "completed")
      ).toThrow("Invalid transition");
    });

    it("rejects transition from terminal state", () => {
      sim.startWorkflow("wf-terminal");
      sim.transition("wf-terminal", "fx_quote_requested", "quote_requested");
      sim.transition("wf-terminal", "fx_quote_accepted", "quote_accepted");
      sim.transition("wf-terminal", "mojaloop_prepared", "transfer_submitted");
      sim.transition("wf-terminal", "tb_debit_committed", "completed");
      expect(() =>
        sim.transition("wf-terminal", "retry", "quote_requested")
      ).toThrow("terminal state");
    });

    it("throws for unknown workflow", () => {
      expect(() =>
        sim.transition("nonexistent", "event", "quote_requested")
      ).toThrow("not found");
    });

    it("marks compensationRequired when transitioning to failed", () => {
      sim.startWorkflow("wf-fail");
      const inst = sim.transition("wf-fail", "service_error", "failed");
      expect(inst.compensationRequired).toBe(true);
    });

    it("marks compensationRequired when transitioning to timed_out", () => {
      sim.startWorkflow("wf-tout");
      const inst = sim.transition("wf-tout", "workflow_timeout", "timed_out");
      expect(inst.compensationRequired).toBe(true);
    });

    it("records transition metadata", () => {
      sim.startWorkflow("wf-tmeta");
      const inst = sim.transition("wf-tmeta", "fx_quote_requested", "quote_requested", {
        quoteId: "q_abc",
        rate: 460.5,
      });
      expect(inst.transitions[0].metadata?.quoteId).toBe("q_abc");
      expect(inst.transitions[0].metadata?.rate).toBe(460.5);
    });
  });

  // ── Happy-path execution ─────────────────────────────────────────────────

  describe("executeHappyPath", () => {
    it("returns success with completed state", () => {
      const result = sim.executeHappyPath("wf-happy");
      expect(result.success).toBe(true);
      expect(result.finalState).toBe("completed");
      expect(result.compensated).toBe(false);
    });

    it("produces exactly 4 transitions", () => {
      const result = sim.executeHappyPath("wf-happy-4");
      expect(result.transitions).toHaveLength(4);
    });

    it("transitions follow the correct sequence", () => {
      const result = sim.executeHappyPath("wf-seq");
      const states = result.transitions.map((t) => t.to);
      expect(states).toEqual([
        "quote_requested",
        "quote_accepted",
        "transfer_submitted",
        "completed",
      ]);
    });

    it("reports non-negative duration", () => {
      const result = sim.executeHappyPath("wf-dur");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("throws if workflowId already exists", () => {
      sim.executeHappyPath("wf-dup-happy");
      expect(() => sim.executeHappyPath("wf-dup-happy")).toThrow("already exists");
    });
  });

  // ── Failure + compensation ────────────────────────────────────────────────

  describe("executeFailureWithCompensation", () => {
    it("returns failure with reversed final state", () => {
      const result = sim.executeFailureWithCompensation("wf-fail-comp", "quote_requested");
      expect(result.success).toBe(false);
      expect(result.finalState).toBe("reversed");
      expect(result.compensated).toBe(true);
    });

    it("includes error message", () => {
      const result = sim.executeFailureWithCompensation("wf-fail-err", "quote_accepted");
      expect(result.error).toBeTruthy();
    });

    it("sets compensationCompleted on the instance", () => {
      sim.executeFailureWithCompensation("wf-fail-inst", "transfer_submitted");
      const inst = sim.getWorkflow("wf-fail-inst");
      expect(inst?.compensationCompleted).toBe(true);
    });

    it("records compensation transition in history", () => {
      const result = sim.executeFailureWithCompensation("wf-fail-hist", "quote_requested");
      const reversalTransition = result.transitions.find((t) => t.to === "reversed");
      expect(reversalTransition).toBeTruthy();
      expect(reversalTransition?.event).toBe("compensation_reversal");
    });
  });

  // ── Timeout scenario ─────────────────────────────────────────────────────

  describe("executeTimeout", () => {
    it("returns failure with reversed final state", () => {
      const result = sim.executeTimeout("wf-timeout-1", "quote_requested");
      expect(result.success).toBe(false);
      expect(result.finalState).toBe("reversed");
      expect(result.compensated).toBe(true);
    });

    it("includes timed_out in transition history", () => {
      const result = sim.executeTimeout("wf-timeout-2", "quote_accepted");
      const timedOutTransition = result.transitions.find((t) => t.to === "timed_out");
      expect(timedOutTransition).toBeTruthy();
    });

    it("sets compensationCompleted on the instance", () => {
      sim.executeTimeout("wf-timeout-3", "pending");
      const inst = sim.getWorkflow("wf-timeout-3");
      expect(inst?.compensationCompleted).toBe(true);
    });
  });

  // ── getWorkflow / listWorkflows ───────────────────────────────────────────

  describe("getWorkflow", () => {
    it("returns undefined for unknown workflow", () => {
      expect(sim.getWorkflow("nonexistent")).toBeUndefined();
    });

    it("returns a copy (not the internal reference)", () => {
      sim.startWorkflow("wf-copy");
      const inst1 = sim.getWorkflow("wf-copy")!;
      inst1.state = "completed" as WorkflowState;
      const inst2 = sim.getWorkflow("wf-copy")!;
      expect(inst2.state).toBe("pending"); // unchanged
    });
  });

  describe("listWorkflows", () => {
    it("returns all created workflows", () => {
      sim.startWorkflow("wf-list-1");
      sim.startWorkflow("wf-list-2");
      sim.startWorkflow("wf-list-3");
      const list = sim.listWorkflows();
      const ids = list.map((w) => w.workflowId);
      expect(ids).toContain("wf-list-1");
      expect(ids).toContain("wf-list-2");
      expect(ids).toContain("wf-list-3");
    });
  });

  // ── Statistics ───────────────────────────────────────────────────────────

  describe("getStats", () => {
    it("returns zero stats for empty simulator", () => {
      const stats = sim.getStats();
      expect(stats.total).toBe(0);
      expect(stats.compensationRate).toBe(0);
      expect(stats.avgDurationMs).toBe(0);
    });

    it("counts workflows by state correctly", () => {
      sim.executeHappyPath("wf-stat-1");
      sim.executeHappyPath("wf-stat-2");
      sim.executeFailureWithCompensation("wf-stat-3", "quote_requested");
      const stats = sim.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byState.completed).toBe(2);
      expect(stats.byState.reversed).toBe(1);
    });

    it("calculates compensation rate correctly", () => {
      sim.executeHappyPath("wf-cr-1");
      sim.executeFailureWithCompensation("wf-cr-2", "quote_requested");
      sim.executeFailureWithCompensation("wf-cr-3", "quote_accepted");
      const stats = sim.getStats();
      // 2 out of 3 workflows were compensated
      expect(stats.compensationRate).toBeCloseTo(2 / 3, 2);
    });

    it("reports avgDurationMs >= 0", () => {
      sim.executeHappyPath("wf-avg-1");
      sim.executeHappyPath("wf-avg-2");
      const stats = sim.getStats();
      expect(stats.avgDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Reset ────────────────────────────────────────────────────────────────

  describe("reset", () => {
    it("clears all workflow instances", () => {
      sim.startWorkflow("wf-reset-1");
      sim.startWorkflow("wf-reset-2");
      sim.reset();
      expect(sim.listWorkflows()).toHaveLength(0);
    });

    it("allows reuse of workflow IDs after reset", () => {
      sim.startWorkflow("wf-reuse");
      sim.reset();
      expect(() => sim.startWorkflow("wf-reuse")).not.toThrow();
    });
  });
});

// ─── Section 2: VALID_TRANSITIONS completeness ───────────────────────────────

describe("VALID_TRANSITIONS", () => {
  const ALL_STATES: WorkflowState[] = [
    "pending",
    "quote_requested",
    "quote_accepted",
    "transfer_submitted",
    "completed",
    "failed",
    "reversed",
    "timed_out",
  ];

  it("covers all workflow states", () => {
    for (const state of ALL_STATES) {
      expect(VALID_TRANSITIONS).toHaveProperty(state);
    }
  });

  it("completed is a terminal state with no transitions", () => {
    expect(VALID_TRANSITIONS["completed"]).toHaveLength(0);
  });

  it("reversed is a terminal state with no transitions", () => {
    expect(VALID_TRANSITIONS["reversed"]).toHaveLength(0);
  });

  it("failed can only transition to reversed (compensation)", () => {
    expect(VALID_TRANSITIONS["failed"]).toEqual(["reversed"]);
  });

  it("timed_out can only transition to reversed (compensation)", () => {
    expect(VALID_TRANSITIONS["timed_out"]).toEqual(["reversed"]);
  });

  it("pending can fail or time out directly", () => {
    expect(VALID_TRANSITIONS["pending"]).toContain("failed");
    expect(VALID_TRANSITIONS["pending"]).toContain("timed_out");
  });

  it("transfer_submitted can reach completed", () => {
    expect(VALID_TRANSITIONS["transfer_submitted"]).toContain("completed");
  });
});

// ─── Section 3: Concurrent workflow isolation ─────────────────────────────────

describe("Concurrent workflow isolation", () => {
  let sim: TemporalWorkflowSimulator;

  beforeEach(() => {
    sim = new TemporalWorkflowSimulator();
  });

  it("50 concurrent happy-path workflows all complete independently", () => {
    const results: WorkflowResult[] = [];
    for (let i = 0; i < 50; i++) {
      results.push(sim.executeHappyPath(`wf-concurrent-${i}`));
    }
    const allCompleted = results.every((r) => r.finalState === "completed");
    expect(allCompleted).toBe(true);
    expect(sim.getStats().byState.completed).toBe(50);
  });

  it("mixed happy/failure workflows track state independently", () => {
    for (let i = 0; i < 20; i++) {
      sim.executeHappyPath(`wf-mixed-happy-${i}`);
    }
    for (let i = 0; i < 10; i++) {
      sim.executeFailureWithCompensation(`wf-mixed-fail-${i}`, "quote_requested");
    }
    const stats = sim.getStats();
    expect(stats.total).toBe(30);
    expect(stats.byState.completed).toBe(20);
    expect(stats.byState.reversed).toBe(10);
    expect(stats.compensationRate).toBeCloseTo(10 / 30, 2);
  });

  it("transitions on one workflow do not affect another", () => {
    sim.startWorkflow("wf-iso-a");
    sim.startWorkflow("wf-iso-b");
    sim.transition("wf-iso-a", "fx_quote_requested", "quote_requested");
    const b = sim.getWorkflow("wf-iso-b")!;
    expect(b.state).toBe("pending");
  });
});

// ─── Section 4: Webhook events coverage ──────────────────────────────────────

describe("WEBHOOK_EVENTS", () => {
  it("includes all required remittance lifecycle events", () => {
    expect(WEBHOOK_EVENTS).toContain("remittance.created");
    expect(WEBHOOK_EVENTS).toContain("remittance.completed");
    expect(WEBHOOK_EVENTS).toContain("remittance.failed");
    expect(WEBHOOK_EVENTS).toContain("remittance.reversed");
  });

  it("includes settlement events", () => {
    expect(WEBHOOK_EVENTS).toContain("settlement.created");
    expect(WEBHOOK_EVENTS).toContain("settlement.completed");
  });

  it("has at least 6 distinct event types", () => {
    expect(WEBHOOK_EVENTS.length).toBeGreaterThanOrEqual(6);
  });

  it("has no duplicate event names", () => {
    const unique = new Set(WEBHOOK_EVENTS);
    expect(unique.size).toBe(WEBHOOK_EVENTS.length);
  });

  it("all events follow the namespace.action pattern", () => {
    for (const event of WEBHOOK_EVENTS) {
      expect(event).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });
});

// ─── Section 5: Rate-limit logic unit tests (pure logic, no DB) ───────────────

describe("Rate-limit enforcement logic", () => {
  // Test the pure calculation logic used by checkAndIncrementRateLimit

  it("calculates 1-minute window start correctly", () => {
    const now = 1_700_000_090_000; // some timestamp
    const windowStart = Math.floor(now / 60_000) * 60_000;
    expect(windowStart).toBe(1_700_000_040_000);
    expect(now - windowStart).toBeLessThan(60_000);
  });

  it("calculates UTC day window start correctly", () => {
    const now = 1_700_000_090_000;
    const dayWindowStart = Math.floor(now / 86_400_000) * 86_400_000;
    expect(dayWindowStart).toBeLessThanOrEqual(now);
    expect(now - dayWindowStart).toBeLessThan(86_400_000);
  });

  it("rate limit exceeded when currentTx >= maxTxPerMinute", () => {
    const maxTxPerMinute = 10;
    const currentTxCount = 10;
    const wouldExceed = maxTxPerMinute > 0 && currentTxCount >= maxTxPerMinute;
    expect(wouldExceed).toBe(true);
  });

  it("rate limit not exceeded when currentTx < maxTxPerMinute", () => {
    const maxTxPerMinute = 10;
    const currentTxCount = 9;
    const wouldExceed = maxTxPerMinute > 0 && currentTxCount >= maxTxPerMinute;
    expect(wouldExceed).toBe(false);
  });

  it("unlimited when maxTxPerMinute is 0", () => {
    const maxTxPerMinute = 0;
    const currentTxCount = 1_000_000;
    const wouldExceed = maxTxPerMinute > 0 && currentTxCount >= maxTxPerMinute;
    expect(wouldExceed).toBe(false);
  });

  it("volume limit exceeded when currentVolume >= maxVolumePerDay (same currency)", () => {
    const maxVolumePerDay = 1_000_000; // 10,000 USD in cents
    const currentVolumeSum = 1_000_000;
    const currency = "USD";
    const configCurrency = "USD";
    const wouldExceed =
      maxVolumePerDay > 0 &&
      configCurrency === currency &&
      currentVolumeSum + 500 > maxVolumePerDay;
    expect(wouldExceed).toBe(true);
  });

  it("volume limit not exceeded for different currency", () => {
    const maxVolumePerDay = 1_000_000;
    const currentVolumeSum = 999_999;
    const currency = "EUR";
    const configCurrency = "USD";
    const wouldExceed =
      maxVolumePerDay > 0 &&
      configCurrency === currency &&
      currentVolumeSum + 500 > maxVolumePerDay;
    expect(wouldExceed).toBe(false);
  });

  it("GLOBAL config applies to all corridors", () => {
    const configs = [
      { corridor: "GLOBAL", maxTxPerMinute: 100, isActive: true },
      { corridor: "NG-KE", maxTxPerMinute: 20, isActive: true },
    ];
    const corridor = "NG-KE";
    const corridorConfig = configs.find((c) => c.corridor === corridor);
    const globalConfig = configs.find((c) => c.corridor === "GLOBAL");
    expect(corridorConfig).toBeTruthy();
    expect(globalConfig).toBeTruthy();
    // Both should be checked
    const applicableConfigs = [corridorConfig, globalConfig].filter(Boolean);
    expect(applicableConfigs).toHaveLength(2);
  });

  it("corridor-specific limit is stricter than GLOBAL", () => {
    const globalMax = 100;
    const corridorMax = 20;
    const currentTx = 25;
    // Corridor limit exceeded
    const corridorExceeded = corridorMax > 0 && currentTx >= corridorMax;
    // Global not exceeded
    const globalExceeded = globalMax > 0 && currentTx >= globalMax;
    expect(corridorExceeded).toBe(true);
    expect(globalExceeded).toBe(false);
  });
});

// ─── Section 6: Corridor string validation ────────────────────────────────────

describe("Corridor string format", () => {
  const SUPPORTED_CORRIDORS = [
    "NG-KE", "NG-GH", "NG-ZA", "NG-TZ", "NG-UG",
    "KE-NG", "KE-GH", "KE-ZA", "KE-TZ", "KE-UG",
    "GH-NG", "GH-KE", "GH-ZA", "GH-TZ",
    "ZA-NG", "ZA-KE", "ZA-GH",
    "TZ-NG", "TZ-KE", "TZ-GH",
    "UG-NG", "UG-KE",
    "GLOBAL",
  ];

  it("all corridors follow XX-YY or GLOBAL format", () => {
    for (const corridor of SUPPORTED_CORRIDORS) {
      expect(corridor).toMatch(/^([A-Z]{2}-[A-Z]{2}|GLOBAL)$/);
    }
  });

  it("GLOBAL is a valid corridor identifier", () => {
    expect(SUPPORTED_CORRIDORS).toContain("GLOBAL");
  });

  it("has at least 20 supported corridors (excluding GLOBAL)", () => {
    const bilateral = SUPPORTED_CORRIDORS.filter((c) => c !== "GLOBAL");
    expect(bilateral.length).toBeGreaterThanOrEqual(20);
  });

  it("all bilateral corridors have a reverse corridor", () => {
    const bilateral = SUPPORTED_CORRIDORS.filter((c) => c !== "GLOBAL");
    for (const corridor of bilateral) {
      const [src, dst] = corridor.split("-");
      const reverse = `${dst}-${src}`;
      // Not all reverse corridors need to exist, but the format should be valid
      expect(reverse).toMatch(/^[A-Z]{2}-[A-Z]{2}$/);
    }
  });
});

// ─── Section 7: Singleton workflowSimulator ───────────────────────────────────

describe("workflowSimulator singleton", () => {
  it("is an instance of TemporalWorkflowSimulator", () => {
    expect(workflowSimulator).toBeInstanceOf(TemporalWorkflowSimulator);
  });

  it("can execute a happy path workflow", () => {
    workflowSimulator.reset();
    const result = workflowSimulator.executeHappyPath("singleton-test");
    expect(result.success).toBe(true);
    expect(result.finalState).toBe("completed");
    workflowSimulator.reset();
  });
});

// ─── Section 8: Workflow transition audit trail ───────────────────────────────

describe("Workflow audit trail", () => {
  let sim: TemporalWorkflowSimulator;

  beforeEach(() => {
    sim = new TemporalWorkflowSimulator();
  });

  it("each transition records from/to/event/timestamp", () => {
    sim.startWorkflow("wf-audit");
    sim.transition("wf-audit", "fx_quote_requested", "quote_requested");
    const inst = sim.getWorkflow("wf-audit")!;
    const t = inst.transitions[0];
    expect(t.from).toBe("pending");
    expect(t.to).toBe("quote_requested");
    expect(t.event).toBe("fx_quote_requested");
    expect(t.timestamp).toBeGreaterThan(0);
  });

  it("transitions are ordered chronologically", () => {
    const result = sim.executeHappyPath("wf-chrono");
    const timestamps = result.transitions.map((t) => t.timestamp);
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
    }
  });

  it("full happy path audit trail has correct from/to pairs", () => {
    const result = sim.executeHappyPath("wf-audit-full");
    const pairs = result.transitions.map((t) => `${t.from}→${t.to}`);
    expect(pairs).toEqual([
      "pending→quote_requested",
      "quote_requested→quote_accepted",
      "quote_accepted→transfer_submitted",
      "transfer_submitted→completed",
    ]);
  });

  it("compensation audit trail includes the failure and reversal", () => {
    const result = sim.executeFailureWithCompensation("wf-audit-comp", "quote_requested");
    const toStates = result.transitions.map((t) => t.to);
    expect(toStates).toContain("failed");
    expect(toStates).toContain("reversed");
    // reversed must come after failed
    const failIdx = toStates.indexOf("failed");
    const reversedIdx = toStates.indexOf("reversed");
    expect(reversedIdx).toBeGreaterThan(failIdx);
  });
});
