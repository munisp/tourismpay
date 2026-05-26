/**
 * Redis Client — production-grade session caching, rate limiting, pub/sub.
 *
 * Uses ioredis with automatic reconnection, circuit breaker protection,
 * and in-memory fallback when Redis is temporarily unavailable.
 */
import Redis from "ioredis";
import { logger } from "../_core/logger";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// ─── In-memory fallback cache ────────────────────────────────────────────────
const memoryCache = new Map<string, { value: string; expiresAt: number }>();

setInterval(() => {
  const now = Date.now();
  memoryCache.forEach((entry, key) => {
    if (entry.expiresAt > 0 && entry.expiresAt < now) {
      memoryCache.delete(key);
    }
  });
}, 30_000);

// ─── Redis connection ────────────────────────────────────────────────────────
let redis: Redis | null = null;
let redisReady = false;
let connectAttempts = 0;
const MAX_CONNECT_ATTEMPTS = 10;

function getRedis(): Redis {
  if (redis) return redis;

  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > MAX_CONNECT_ATTEMPTS) return null;
      return Math.min(times * 200, 5000);
    },
    reconnectOnError(err) {
      const targetErrors = ["READONLY", "ECONNRESET"];
      return targetErrors.some((e) => err.message.includes(e));
    },
    lazyConnect: true,
    connectTimeout: 5000,
    commandTimeout: 3000,
    enableReadyCheck: true,
    enableOfflineQueue: true,
  });

  redis.on("connect", () => {
    connectAttempts = 0;
    logger.info("Redis connected", { url: REDIS_URL.replace(/\/\/.*@/, "//***@") });
  });

  redis.on("ready", () => {
    redisReady = true;
    logger.info("Redis ready for commands");
  });

  redis.on("error", (err) => {
    redisReady = false;
    connectAttempts++;
    if (connectAttempts <= 3) {
      logger.warn("Redis connection error", { error: err.message, attempt: connectAttempts });
    }
  });

  redis.on("close", () => {
    redisReady = false;
  });

  redis.connect().catch(() => {
    redisReady = false;
  });

  return redis;
}

// Initialize lazily on first use
let initialized = false;
function ensureInit() {
  if (!initialized) {
    initialized = true;
    getRedis();
  }
}

// ─── Cache operations with fallback ──────────────────────────────────────────

export async function cacheGet(key: string): Promise<string | null> {
  ensureInit();
  if (redisReady && redis) {
    try {
      const val = await redis.get(key);
      if (val !== null) return val;
    } catch {
      // Fall through to memory cache
    }
  }
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt > 0 && entry.expiresAt < Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

export async function cacheSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  ensureInit();
  const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0;
  memoryCache.set(key, { value, expiresAt });

  if (redisReady && redis) {
    try {
      if (ttlSeconds) {
        await redis.set(key, value, "EX", ttlSeconds);
      } else {
        await redis.set(key, value);
      }
    } catch {
      // Memory cache already set as fallback
    }
  }
}

export async function cacheDel(key: string): Promise<void> {
  ensureInit();
  memoryCache.delete(key);
  if (redisReady && redis) {
    try { await redis.del(key); } catch { /* ignore */ }
  }
}

export async function cacheIncr(key: string, ttlSeconds: number): Promise<number> {
  ensureInit();
  if (redisReady && redis) {
    try {
      const pipeline = redis.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, ttlSeconds);
      const results = await pipeline.exec();
      if (results && results[0] && results[0][1] !== null) {
        const count = results[0][1] as number;
        memoryCache.set(key, { value: String(count), expiresAt: Date.now() + ttlSeconds * 1000 });
        return count;
      }
    } catch {
      // Fall through to memory
    }
  }

  const entry = memoryCache.get(key);
  const now = Date.now();
  if (entry && entry.expiresAt > now) {
    const newVal = parseInt(entry.value, 10) + 1;
    entry.value = String(newVal);
    return newVal;
  }
  memoryCache.set(key, { value: "1", expiresAt: now + ttlSeconds * 1000 });
  return 1;
}

export async function cacheUserSession(userId: string | number, userData: string, ttlSeconds = 3600): Promise<void> {
  await cacheSet(`session:${userId}`, userData, ttlSeconds);
}

export async function getCachedUserSession(userId: string | number): Promise<string | null> {
  return cacheGet(`session:${userId}`);
}

export async function invalidateUserSession(userId: string | number): Promise<void> {
  await cacheDel(`session:${userId}`);
}

/** Publish a message to a Redis pub/sub channel */
export async function publish(channel: string, message: string): Promise<void> {
  ensureInit();
  if (redisReady && redis) {
    try { await redis.publish(channel, message); } catch { /* ignore */ }
  }
}

/** Get cache stats */
export function getCacheStats() {
  return {
    inMemorySize: memoryCache.size,
    redisAvailable: redisReady,
    strategy: redisReady ? "redis+memory" : "memory-only",
    connectAttempts,
  };
}

/** Graceful shutdown */
export async function shutdownRedis(): Promise<void> {
  if (redis) {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
    redis = null;
    redisReady = false;
  }
}
