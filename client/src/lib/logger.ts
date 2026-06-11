type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  (import.meta.env.VITE_LOG_LEVEL as LogLevel) || "warn";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
}

export const logger = {
  debug(...args: unknown[]) {
    if (shouldLog("debug")) console.debug("[TourismPay]", ...args);
  },
  info(...args: unknown[]) {
    if (shouldLog("info")) console.info("[TourismPay]", ...args);
  },
  warn(...args: unknown[]) {
    if (shouldLog("warn")) console.warn("[TourismPay]", ...args);
  },
  error(...args: unknown[]) {
    if (shouldLog("error")) console.error("[TourismPay]", ...args);
  },
};
