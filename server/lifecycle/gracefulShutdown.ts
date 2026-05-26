/**
 * Graceful Shutdown Manager — ensures clean process termination.
 *
 * Handles SIGTERM, SIGINT, uncaughtException, unhandledRejection.
 * Drains HTTP connections, closes DB pools, flushes buffers, then exits.
 */
import type { Server } from "http";
import { logger } from "../_core/logger";
import { shutdownRedis } from "../middleware/redisClient";

type ShutdownHook = { name: string; fn: () => Promise<void>; priority: number };

const hooks: ShutdownHook[] = [];
let shuttingDown = false;
const SHUTDOWN_TIMEOUT_MS = 15_000;

export function registerShutdownHook(name: string, fn: () => Promise<void>, priority = 10) {
  hooks.push({ name, fn, priority });
}

export function setupGracefulShutdown(server: Server) {
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Graceful shutdown initiated", { signal });

    // Stop accepting new connections
    server.close(() => {
      logger.info("HTTP server closed, no new connections accepted");
    });

    // Sort hooks by priority (lower = earlier)
    const sorted = [...hooks].sort((a, b) => a.priority - b.priority);

    // Execute shutdown hooks with timeout
    const timer = setTimeout(() => {
      logger.error("Shutdown timeout exceeded, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    for (const hook of sorted) {
      try {
        logger.debug(`Running shutdown hook: ${hook.name}`);
        await Promise.race([
          hook.fn(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Hook timeout")), 5000)),
        ]);
      } catch (err) {
        logger.error(`Shutdown hook failed: ${hook.name}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Always close Redis
    try { await shutdownRedis(); } catch { /* ignore */ }

    clearTimeout(timer);
    logger.info("Graceful shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("uncaughtException", (err) => {
    logger.fatal("Uncaught exception", { error: err.message, stack: err.stack });
    shutdown("uncaughtException").catch(() => process.exit(1));
  });

  process.on("unhandledRejection", (reason) => {
    logger.fatal("Unhandled rejection", {
      error: reason instanceof Error ? reason.message : String(reason),
    });
  });
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}
