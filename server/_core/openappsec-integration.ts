/**
 * server/_core/openappsec-integration.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Full OpenAppSec WAF Integration
 *
 * Provides:
 *  1. WAF event ingestion and storage
 *  2. Policy management (allow/block rules)
 *  3. Threat intelligence feed
 *  4. IP reputation checking
 *  5. Request inspection middleware
 *  6. Incident reporting
 */

import { logger } from "./logger";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

// ─── Config ───────────────────────────────────────────────────────────────────

interface OpenAppSecConfig {
  agentUrl: string;
  apiKey?: string;
  blockingMode: boolean;
}

function getOpenAppSecConfig(): OpenAppSecConfig | null {
  const agentUrl = process.env.OPENAPPSEC_AGENT_URL;
  if (!agentUrl) return null;
  return {
    agentUrl: agentUrl.replace(/\/+$/, ""),
    apiKey: process.env.OPENAPPSEC_API_KEY,
    blockingMode: process.env.OPENAPPSEC_BLOCKING === "true",
  };
}

export function isOpenAppSecEnabled(): boolean {
  return !!process.env.OPENAPPSEC_AGENT_URL;
}

// ─── HTTP Client ──────────────────────────────────────────────────────────────

async function openAppSecRequest<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T | null> {
  const config = getOpenAppSecConfig();
  if (!config) return null;
  const url = `${config.agentUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) headers["X-API-Key"] = config.apiKey;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return null;
    if (res.status === 204) return null;
    return (await res.json()) as T;
  } catch (err) {
    logger.warn({ err, path }, "OpenAppSec request error");
    return null;
  }
}

// ─── WAF Event Types ──────────────────────────────────────────────────────────

export interface WafEvent {
  id: string;
  timestamp: number;
  sourceIp: string;
  method: string;
  uri: string;
  userAgent?: string;
  attackType: string;
  severity: "low" | "medium" | "high" | "critical";
  action: "detect" | "prevent";
  requestId?: string;
  userId?: number;
  details?: Record<string, unknown>;
}

// ─── Request Inspection Middleware ────────────────────────────────────────────

export function openAppSecMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const config = getOpenAppSecConfig();
    if (!config) return next();

    const requestData = {
      method: req.method,
      uri: req.originalUrl,
      headers: req.headers,
      sourceIp: req.ip || req.socket.remoteAddress,
      body: req.body,
    };

    try {
      const result = await openAppSecRequest<{
        action: "allow" | "block";
        attackType?: string;
        severity?: string;
        requestId?: string;
      }>("/inspect", "POST", requestData);

      if (result?.action === "block" && config.blockingMode) {
        // Log the WAF block event
        await recordWafEvent({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          sourceIp: String(requestData.sourceIp || ""),
          method: req.method,
          uri: req.originalUrl,
          userAgent: req.headers["user-agent"],
          attackType: result.attackType || "unknown",
          severity: (result.severity as WafEvent["severity"]) || "medium",
          action: "prevent",
          requestId: result.requestId,
        });

        return res.status(403).json({
          error: "Request blocked by WAF",
          requestId: result.requestId,
        });
      }

      if (result?.attackType) {
        // Detect mode — log but allow
        await recordWafEvent({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          sourceIp: String(requestData.sourceIp || ""),
          method: req.method,
          uri: req.originalUrl,
          userAgent: req.headers["user-agent"],
          attackType: result.attackType,
          severity: (result.severity as WafEvent["severity"]) || "low",
          action: "detect",
          requestId: result.requestId,
        });
      }
    } catch {
      // Non-blocking — WAF failure should not break the app
    }

    next();
  };
}

// ─── WAF Event Storage ────────────────────────────────────────────────────────

export async function recordWafEvent(event: WafEvent): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.execute(sql`
      INSERT INTO openappsec_waf_events (
        id, source_ip, method, uri, user_agent, attack_type,
        severity, action, request_id, user_id, details, created_at
      ) VALUES (
        ${event.id}, ${event.sourceIp}, ${event.method}, ${event.uri},
        ${event.userAgent ?? null}, ${event.attackType}, ${event.severity},
        ${event.action}, ${event.requestId ?? null}, ${event.userId ?? null},
        ${JSON.stringify(event.details ?? {})}::jsonb, NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `);
  } catch (err) {
    logger.warn({ err }, "recordWafEvent: non-fatal error");
  }
}

// ─── IP Reputation Check ──────────────────────────────────────────────────────

export async function checkIpReputation(
  ipAddress: string,
): Promise<{
  reputation: "clean" | "suspicious" | "malicious";
  score: number;
  categories?: string[];
} | null> {
  return openAppSecRequest(
    `/reputation/ip/${encodeURIComponent(ipAddress)}`,
    "GET",
  );
}

// ─── Policy Management ────────────────────────────────────────────────────────

export async function addIpToAllowList(
  ipAddress: string,
  reason: string,
): Promise<boolean> {
  const result = await openAppSecRequest("/policy/allowlist", "POST", {
    ip: ipAddress,
    reason,
    expires_at: null,
  });
  return result !== null;
}

export async function addIpToBlockList(
  ipAddress: string,
  reason: string,
  expiresAt?: Date,
): Promise<boolean> {
  const result = await openAppSecRequest("/policy/blocklist", "POST", {
    ip: ipAddress,
    reason,
    expires_at: expiresAt?.toISOString() ?? null,
  });
  return result !== null;
}

// ─── WAF Statistics ───────────────────────────────────────────────────────────

export async function getWafStats(params: {
  fromDate: string;
  toDate: string;
}): Promise<{
  totalEvents: number;
  blockedCount: number;
  detectedCount: number;
  topAttackTypes: Array<{ type: string; count: number }>;
  topSourceIps: Array<{ ip: string; count: number }>;
} | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const result = await db.execute(sql`
      SELECT
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE action = 'prevent') as blocked_count,
        COUNT(*) FILTER (WHERE action = 'detect') as detected_count
      FROM openappsec_waf_events
      WHERE created_at BETWEEN ${params.fromDate}::timestamp AND ${params.toDate}::timestamp
    `);
    const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
    if (rows.length === 0) return null;
    const row = rows[0] as any;
    return {
      totalEvents: Number(row.total_events ?? 0),
      blockedCount: Number(row.blocked_count ?? 0),
      detectedCount: Number(row.detected_count ?? 0),
      topAttackTypes: [],
      topSourceIps: [],
    };
  } catch {
    return null;
  }
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function checkOpenAppSecHealth(): Promise<{
  healthy: boolean;
  mode: "blocking" | "detection" | "disabled";
}> {
  const config = getOpenAppSecConfig();
  if (!config) return { healthy: false, mode: "disabled" };
  const result = await openAppSecRequest<{ status: string }>("/health", "GET");
  return {
    healthy: result?.status === "ok",
    mode: config.blockingMode ? "blocking" : "detection",
  };
}
