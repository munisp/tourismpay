/**
 * Structured Logger — production-grade logging with request correlation.
 *
 * Replaces console.log/warn/error with structured JSON logging.
 * Supports log levels, request IDs, user context, and timing.
 */
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3, fatal: 4,
};

const CURRENT_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) ??
  (process.env.NODE_ENV === "production" ? "info" : "debug");

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  msg: string;
  requestId?: string;
  userId?: string | number;
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  error?: string;
  stack?: string;
  [key: string]: unknown;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[CURRENT_LEVEL];
}

function emit(entry: LogEntry) {
  const output = JSON.stringify(entry);
  if (entry.level === "error" || entry.level === "fatal") {
    process.stderr.write(output + "\n");
  } else {
    process.stdout.write(output + "\n");
  }
}

export const logger = {
  debug(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog("debug")) emit({ timestamp: new Date().toISOString(), level: "debug", msg, ...meta });
  },
  info(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog("info")) emit({ timestamp: new Date().toISOString(), level: "info", msg, ...meta });
  },
  warn(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog("warn")) emit({ timestamp: new Date().toISOString(), level: "warn", msg, ...meta });
  },
  error(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog("error")) emit({ timestamp: new Date().toISOString(), level: "error", msg, ...meta });
  },
  fatal(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog("fatal")) emit({ timestamp: new Date().toISOString(), level: "fatal", msg, ...meta });
  },
};

/**
 * Express middleware that assigns a request ID and logs request/response.
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers["x-request-id"] as string) ?? crypto.randomUUID();
  const start = Date.now();

  // Attach to request for downstream use
  (req as any).requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const userId = (req as any).user?.id;
    const level: LogLevel = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    if (shouldLog(level)) {
      emit({
        timestamp: new Date().toISOString(),
        level,
        msg: `${req.method} ${req.originalUrl} ${res.statusCode}`,
        requestId,
        userId,
        route: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode,
        durationMs,
      });
    }
  });

  next();
}

export default logger;
