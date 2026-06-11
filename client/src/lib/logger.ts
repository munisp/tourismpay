/**
 * Client-side structured logger
 * Replaces direct console.* calls with a centralized logger that can be
 * configured for production (e.g., suppress debug logs, send to telemetry).
 */

const isDev = import.meta.env?.DEV ?? process.env.NODE_ENV !== "production";

export const logger = {
  debug(...args: unknown[]): void {
    if (isDev) console.debug("[DEBUG]", ...args);
  },
  info(...args: unknown[]): void {
    if (isDev) console.info("[INFO]", ...args);
  },
  warn(...args: unknown[]): void {
    console.warn("[WARN]", ...args);
  },
  error(...args: unknown[]): void {
    console.error("[ERROR]", ...args);
  },
  log(...args: unknown[]): void {
    if (isDev) console.log("[LOG]", ...args);
  },
};

export default logger;
