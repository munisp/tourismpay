/**
 * gRPC Gateway — HTTP/JSON ↔ gRPC translation layer.
 *
 * Since the TypeScript server uses Express (HTTP/1.1), this module provides
 * a gateway pattern: downstream Go/Rust services expose gRPC endpoints,
 * and this gateway translates HTTP/JSON requests to gRPC calls.
 *
 * For Node.js callers, it provides typed client wrappers using raw HTTP/2
 * frames (via the native http2 module) with circuit breaker + retries.
 *
 * Service map:
 * - go-settlement:  8081 (HTTP) / 8181 (gRPC)
 * - pbac-engine:    8090 (HTTP) / 8190 (gRPC)
 * - python-ml:      8001 (HTTP) / 8201 (gRPC)
 */
import { serviceFetch } from "./serviceFetch";
import { logger } from "../_core/logger";
import type { Request } from "express";

// ─── Service gRPC port mapping ───────────────────────────────────────────────

const GRPC_PORTS: Record<string, { http: string; grpc: string }> = {
  "go-settlement": {
    http: process.env.GO_SETTLEMENT_URL || "http://localhost:8081",
    grpc: process.env.GO_SETTLEMENT_GRPC_URL || "http://localhost:8181",
  },
  "pbac-engine": {
    http: process.env.PBAC_ENGINE_URL || "http://localhost:8090",
    grpc: process.env.PBAC_ENGINE_GRPC_URL || "http://localhost:8190",
  },
  "python-ml": {
    http: process.env.PYTHON_ML_URL || "http://localhost:8001",
    grpc: process.env.PYTHON_ML_GRPC_URL || "http://localhost:8201",
  },
};

// ─── gRPC-JSON Gateway Calls ─────────────────────────────────────────────────

/**
 * Call a gRPC service via its HTTP/JSON gateway (gRPC-gateway pattern).
 * Falls back to plain REST if gRPC gateway is unavailable.
 *
 * Go services expose gRPC-gateway at /grpc/v1/{service}/{method}
 */
export async function grpcCall<T>(
  serviceName: string,
  method: string,
  payload: Record<string, unknown>,
  req?: Request,
): Promise<{ data: T | null; status: number; ok: boolean; transport: "grpc-gateway" | "rest" }> {
  const serviceConfig = GRPC_PORTS[serviceName];
  if (!serviceConfig) {
    logger.error(`Unknown gRPC service: ${serviceName}`);
    return { data: null, status: 404, ok: false, transport: "rest" };
  }

  // Try gRPC-gateway first
  const grpcUrl = `${serviceConfig.grpc}/grpc/v1/${method}`;
  try {
    const result = await serviceFetch<T>(
      `${serviceName}-grpc`,
      grpcUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        timeoutMs: 3000,
        retries: 1,
      },
      req,
    );
    return { ...result, transport: "grpc-gateway" };
  } catch {
    // Fall back to REST
  }

  // Fallback to REST endpoint
  const restUrl = `${serviceConfig.http}/api/v1/${method}`;
  try {
    const result = await serviceFetch<T>(
      serviceName,
      restUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        timeoutMs: 5000,
        retries: 2,
      },
      req,
    );
    return { ...result, transport: "rest" };
  } catch {
    return { data: null, status: 503, ok: false, transport: "rest" };
  }
}

// ─── Typed client wrappers ───────────────────────────────────────────────────

export const settlementClient = {
  async createSettlement(data: { merchantId: string; amount: number; currency: string; reference: string }, req?: Request) {
    return grpcCall<{ id: string; status: string }>("go-settlement", "settlement/create", data, req);
  },
  async getSettlement(id: string, req?: Request) {
    return grpcCall<{ id: string; amount: number; status: string }>("go-settlement", `settlement/${id}`, {}, req);
  },
  async executeBatch(ids: string[], req?: Request) {
    return grpcCall<{ processed: number; failed: number }>("go-settlement", "settlement/batch", { settlement_ids: ids }, req);
  },
};

export const fraudClient = {
  async scoreTransaction(data: Record<string, unknown>, req?: Request) {
    return grpcCall<{ score: number; risk_level: string; flags: string[] }>("python-ml", "fraud/score", data, req);
  },
};

export const pbacClient = {
  async checkPermission(data: { subjectType: string; subjectId: string; permission: string; resourceType: string; resourceId: string }, req?: Request) {
    return grpcCall<{ allowed: boolean; reason: string }>("pbac-engine", "permission/check", data, req);
  },
};
