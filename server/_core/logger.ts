/**
 * Structured logger for the TourismPay server.
 * Outputs JSON in production for log aggregation (Datadog, Loki, etc.)
 * and human-readable format in development.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  msg: string;
  timestamp: string;
  [key: string]: unknown;
}

const IS_PROD = process.env.NODE_ENV === "production";

function serialize(entry: LogEntry): string {
  if (IS_PROD) {
    return JSON.stringify(entry);
  }
  const { level, msg, timestamp, ...rest } = entry;
  const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";
  return `[${timestamp}] [${level.toUpperCase()}] ${msg}${extra}`;
}

function normalizeArgs(args: unknown[]): { msg: string; context?: Record<string, unknown> } {
  if (args.length === 0) return { msg: "" };
  const msg = String(args[0]);
  if (args.length === 1) return { msg };

  const rest = args.slice(1);
  if (rest.length === 1 && typeof rest[0] === "object" && rest[0] !== null && !(rest[0] instanceof Error)) {
    return { msg, context: rest[0] as Record<string, unknown> };
  }

  const context: Record<string, unknown> = {};
  rest.forEach((v, i) => {
    if (v instanceof Error) {
      context.error = v.message;
      context.stack = v.stack;
    } else {
      context[`arg${i}`] = v;
    }
  });
  return { msg, context };
}

function emit(level: LogLevel, ...args: unknown[]) {
  const { msg, context } = normalizeArgs(args);
  const entry: LogEntry = {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const line = serialize(entry);

  switch (level) {
    case "error":
      // eslint-disable-next-line no-console
      console.error(line);
      break;
    case "warn":
      // eslint-disable-next-line no-console
      console.warn(line);
      break;
    case "debug":
      // eslint-disable-next-line no-console
      console.debug(line);
      break;
    default:
      // eslint-disable-next-line no-console
      console.log(line);
  }
}

export const logger = {
  debug: (...args: unknown[]) => emit("debug", ...args),
  info: (...args: unknown[]) => emit("info", ...args),
  warn: (...args: unknown[]) => emit("warn", ...args),
  error: (...args: unknown[]) => emit("error", ...args),
};

// ─── Compatibility Aliases ────────────────────────────────────────────────────
/** Express-compatible request logging middleware */
export function requestLoggingMiddleware(
  req: { method?: string; url?: string },
  _res: unknown,
  next: () => void
) {
  logger.info(`${req.method ?? "?"} ${req.url ?? "?"}`);
  next();
}
