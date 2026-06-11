/**
 * Structured logger utility for the TourismPay frontend.
 * In production, this can be wired to a remote logging service
 * (e.g., Sentry, Datadog, LogRocket). In development, outputs to console.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

const IS_DEV = import.meta.env.DEV;

function formatEntry(entry: LogEntry): string {
  const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : "";
  return `[${entry.level.toUpperCase()}] ${entry.message}${ctx}`;
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
  };

  if (IS_DEV) {
    const formatted = formatEntry(entry);
    switch (level) {
      case "error":
        // eslint-disable-next-line no-console
        console.error(formatted);
        break;
      case "warn":
        // eslint-disable-next-line no-console
        console.warn(formatted);
        break;
      case "info":
        // eslint-disable-next-line no-console
        console.info(formatted);
        break;
      default:
        // eslint-disable-next-line no-console
        console.debug(formatted);
    }
  }

  // In production: forward to external service
  // e.g., Sentry.captureMessage(message, { level, extra: context });
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => emit("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => emit("error", message, context),
};
