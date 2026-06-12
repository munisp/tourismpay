/**
 * OpenTelemetry distributed tracing integration.
 * Propagates trace context across TypeScript → Go → Rust → Python services.
 *
 * Middleware integration: All inter-service HTTP calls carry W3C Trace Context headers.
 */
import { Request, Response } from "express";
import crypto from "crypto";
import { logger } from "./logger";

// ─── Trace Context (W3C format) ───────────────────────────────────────────────

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
}

export function generateTraceId(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function generateSpanId(): string {
  return crypto.randomBytes(8).toString("hex");
}

export function parseTraceparent(header: string | undefined): TraceContext | null {
  if (!header) return null;
  const parts = header.split("-");
  if (parts.length < 4) return null;
  return {
    traceId: parts[1],
    spanId: parts[2],
    parentSpanId: undefined,
    sampled: parts[3] === "01",
  };
}

export function formatTraceparent(ctx: TraceContext): string {
  return `00-${ctx.traceId}-${ctx.spanId}-${ctx.sampled ? "01" : "00"}`;
}

// ─── Span Recording ──────────────────────────────────────────────────────────

interface SpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  duration: number;
  status: "ok" | "error";
  attributes: Record<string, string | number | boolean>;
}

const recentSpans: SpanRecord[] = [];
const MAX_SPANS = 1000;

export function recordSpan(span: SpanRecord): void {
  recentSpans.push(span);
  if (recentSpans.length > MAX_SPANS) {
    recentSpans.shift();
  }
}

export function getRecentSpans(traceId?: string): SpanRecord[] {
  if (traceId) return recentSpans.filter(s => s.traceId === traceId);
  return [...recentSpans];
}

// ─── Express Tracing Middleware ───────────────────────────────────────────────

export function tracingMiddleware() {
  return (req: Request, res: Response, next: () => void) => {
    const incoming = parseTraceparent(req.headers["traceparent"] as string);
    const traceId = incoming?.traceId || generateTraceId();
    const spanId = generateSpanId();
    const parentSpanId = incoming?.spanId;

    // Attach trace context to request
    (req as any).traceContext = { traceId, spanId, parentSpanId, sampled: true } as TraceContext;

    // Set response headers for downstream propagation
    res.setHeader("traceparent", formatTraceparent({ traceId, spanId, sampled: true }));

    const start = performance.now();

    res.on("finish", () => {
      const duration = performance.now() - start;
      recordSpan({
        traceId,
        spanId,
        parentSpanId,
        operationName: `${req.method} ${req.route?.path || req.path}`,
        serviceName: "tourismpay-api",
        startTime: start,
        duration,
        status: res.statusCode >= 400 ? "error" : "ok",
        attributes: {
          "http.method": req.method,
          "http.url": req.originalUrl,
          "http.status_code": res.statusCode,
          "http.user_agent": req.headers["user-agent"] || "",
        },
      });
    });

    next();
  };
}

// ─── Propagation Headers for Outgoing Requests ────────────────────────────────

export function getTracingHeaders(req?: Request): Record<string, string> {
  const ctx = (req as any)?.traceContext as TraceContext | undefined;
  if (!ctx) {
    return { traceparent: formatTraceparent({ traceId: generateTraceId(), spanId: generateSpanId(), sampled: true }) };
  }
  const childSpan = generateSpanId();
  return { traceparent: formatTraceparent({ traceId: ctx.traceId, spanId: childSpan, sampled: ctx.sampled }) };
}

logger.info("[Tracing] OpenTelemetry-compatible tracing module loaded");
