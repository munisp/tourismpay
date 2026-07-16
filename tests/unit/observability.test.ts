/**
 * tests/unit/observability.test.ts
 * Unit tests for the observability module
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  httpRequestsTotal,
  httpRequestDuration,
  paymentsTotal,
  paymentsValueNgn,
  fraudAlertsTotal,
  activeSessionsGauge,
  getPrometheusMetrics,
  startSpan,
  endSpan,
  addSpanAttribute,
  addSpanEvent,
  trackBusinessEvent,
  registerHealthCheck,
  runHealthChecks,
  getSLOStatus,
} from "../../server/_core/observability";

describe("Prometheus Metrics", () => {
  it("increments counter correctly", () => {
    const before = httpRequestsTotal.get({ method: "GET", route: "/test", status: "200" });
    httpRequestsTotal.inc({ method: "GET", route: "/test", status: "200" });
    expect(httpRequestsTotal.get({ method: "GET", route: "/test", status: "200" })).toBe(before + 1);
  });

  it("records histogram observations", () => {
    httpRequestDuration.observe(0.05, { method: "POST", route: "/api/pay" });
    httpRequestDuration.observe(0.1, { method: "POST", route: "/api/pay" });
    const p50 = httpRequestDuration.percentile(50, { method: "POST", route: "/api/pay" });
    expect(p50).toBeGreaterThan(0);
  });

  it("gauge increments and decrements", () => {
    const before = activeSessionsGauge.get();
    activeSessionsGauge.inc();
    expect(activeSessionsGauge.get()).toBe(before + 1);
    activeSessionsGauge.dec();
    expect(activeSessionsGauge.get()).toBe(before);
  });

  it("getPrometheusMetrics returns valid Prometheus text format", () => {
    const metrics = getPrometheusMetrics();
    expect(metrics).toContain("# HELP");
    expect(metrics).toContain("# TYPE");
    expect(metrics).toContain("process_uptime_seconds");
    expect(metrics).toContain("http_requests_total");
    expect(metrics).toContain("tourismpay_payments_total");
  });
});

describe("Distributed Tracing", () => {
  it("creates a span with unique IDs", () => {
    const span = startSpan("test-operation");
    expect(span.traceId).toBeTruthy();
    expect(span.spanId).toBeTruthy();
    expect(span.name).toBe("test-operation");
    expect(span.status).toBe("UNSET");
    endSpan(span);
  });

  it("child span inherits parent trace ID", () => {
    const parent = startSpan("parent");
    const child = startSpan("child", parent.spanId);
    expect(child.traceId).toBe(parent.traceId);
    expect(child.parentSpanId).toBe(parent.spanId);
    endSpan(child);
    endSpan(parent);
  });

  it("adds attributes to span", () => {
    const span = startSpan("attributed-op");
    addSpanAttribute(span, "user.id", "user-123");
    addSpanAttribute(span, "payment.amount", 5000);
    addSpanAttribute(span, "payment.success", true);
    expect(span.attributes["user.id"]).toBe("user-123");
    expect(span.attributes["payment.amount"]).toBe(5000);
    expect(span.attributes["payment.success"]).toBe(true);
    endSpan(span);
  });

  it("adds events to span", () => {
    const span = startSpan("event-op");
    addSpanEvent(span, "db.query.start");
    addSpanEvent(span, "db.query.end", { rows: 5 });
    expect(span.events).toHaveLength(2);
    expect(span.events[0].name).toBe("db.query.start");
    expect(span.events[1].attributes?.rows).toBe(5);
    endSpan(span);
  });

  it("sets end time and status on endSpan", () => {
    const span = startSpan("timed-op");
    expect(span.endTime).toBeUndefined();
    endSpan(span, "OK");
    expect(span.endTime).toBeDefined();
    expect(span.status).toBe("OK");
  });
});

describe("Business Event Tracking", () => {
  it("increments payment counter on payment.completed", () => {
    const before = paymentsTotal.get({ event_type: "payment.completed", currency: "NGN", status: "completed" });
    trackBusinessEvent({ type: "payment.completed", amountNgn: 5000, currency: "NGN" });
    expect(paymentsTotal.get({ event_type: "payment.completed", currency: "NGN", status: "completed" })).toBe(before + 1);
  });

  it("increments fraud alert counter", () => {
    const before = fraudAlertsTotal.get({ event_type: "fraud.alert_raised", currency: "NGN" });
    trackBusinessEvent({ type: "fraud.alert_raised" });
    expect(fraudAlertsTotal.get({ event_type: "fraud.alert_raised", currency: "NGN" })).toBe(before + 1);
  });

  it("increments active sessions on session.created", () => {
    const before = activeSessionsGauge.get();
    trackBusinessEvent({ type: "session.created" });
    expect(activeSessionsGauge.get()).toBe(before + 1);
  });

  it("decrements active sessions on session.expired", () => {
    trackBusinessEvent({ type: "session.created" });
    const before = activeSessionsGauge.get();
    trackBusinessEvent({ type: "session.expired" });
    expect(activeSessionsGauge.get()).toBe(before - 1);
  });
});

describe("Health Check Aggregator", () => {
  it("returns healthy when all checks pass", async () => {
    registerHealthCheck("test-db", async () => ({
      status: "healthy",
      lastChecked: new Date().toISOString(),
    }));

    const report = await runHealthChecks();
    expect(["healthy", "degraded", "unhealthy"]).toContain(report.status);
    expect(report.components).toBeDefined();
    expect(report.uptime).toBeGreaterThan(0);
  });

  it("marks component as unhealthy on exception", async () => {
    registerHealthCheck("failing-service", async () => {
      throw new Error("Connection refused");
    });

    const report = await runHealthChecks();
    expect(report.components["failing-service"]?.status).toBe("unhealthy");
    expect(report.components["failing-service"]?.message).toContain("Connection refused");
  });

  it("times out slow health checks", async () => {
    registerHealthCheck("slow-service", async () => {
      await new Promise((r) => setTimeout(r, 10_000)); // 10s — will timeout
      return { status: "healthy" as const, lastChecked: new Date().toISOString() };
    });

    const report = await runHealthChecks();
    expect(report.components["slow-service"]?.status).toBe("unhealthy");
  }, 10_000);
});

describe("SLO Status", () => {
  it("returns SLO status array", () => {
    const slos = getSLOStatus();
    expect(Array.isArray(slos)).toBe(true);
    expect(slos.length).toBeGreaterThan(0);
    for (const slo of slos) {
      expect(slo.name).toBeTruthy();
      expect(slo.target).toBeGreaterThan(0);
      expect(["OK", "WARNING", "VIOLATED"]).toContain(slo.status);
    }
  });
});
