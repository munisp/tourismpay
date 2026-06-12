/**
 * Redis Runtime Client
 *
 * Provides caching, session management, pub/sub, and distributed locking
 * for the TourismPay platform. Falls back gracefully when Redis is unavailable.
 *
 * Usage areas:
 *  - FX rate caching (5-min TTL)
 *  - Kill switch state (instant reads)
 *  - Rate limiting counters
 *  - Session token blacklist
 *  - Pub/Sub for real-time NOC events
 */
import Redis from "ioredis";
import { logger } from "./logger";

// ─── Connection ──────────────────────────────────────────────────────────────

let redis: Redis | null = null;
let subscriber: Redis | null = null;

function getRedisUrl(): string {
  return process.env.REDIS_URL || "redis://localhost:6379";
}

export function getRedis(): Redis | null {
  if (redis) return redis;
  try {
    // Sentinel HA mode: set REDIS_SENTINELS="host1:26379,host2:26379" and REDIS_SENTINEL_NAME="mymaster"
    if (process.env.REDIS_SENTINELS) {
      redis = new Redis({
        sentinels: process.env.REDIS_SENTINELS.split(",").map(s => {
          const parts = s.trim().split(":");
          return { host: parts[0], port: parseInt(parts[1] || "26379", 10) };
        }),
        name: process.env.REDIS_SENTINEL_NAME || "mymaster",
        password: process.env.REDIS_PASSWORD || undefined,
        sentinelPassword: process.env.REDIS_SENTINEL_PASSWORD || undefined,
        maxRetriesPerRequest: 3,
        retryStrategy(times: number) {
          if (times > 5) return null;
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
        enableReadyCheck: true,
        connectTimeout: 5000,
        tls: process.env.REDIS_TLS === "true" ? { rejectUnauthorized: false } : undefined,
      });
    } else {
      redis = new Redis(getRedisUrl(), {
        maxRetriesPerRequest: 3,
        retryStrategy(times: number) {
          if (times > 5) return null;
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
        enableReadyCheck: true,
        connectTimeout: 5000,
        password: process.env.REDIS_PASSWORD || undefined,
        tls: process.env.REDIS_TLS === "true" ? { rejectUnauthorized: false } : undefined,
      });
    }
    redis.on("error", (err: Error) => {
      logger.warn(`[Redis] Connection error: ${err.message}`);
    });
    redis.on("connect", () => {
      logger.info(`[Redis] Connected${process.env.REDIS_SENTINELS ? " (Sentinel HA)" : ""}`);
    });
    redis.connect().catch(() => {
      logger.warn("[Redis] Initial connection failed — operating without cache");
      redis = null;
    });
    return redis;
  } catch {
    return null;
  }
}

// ─── Cache Operations ────────────────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const value = await client.get(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // Graceful degradation — cache miss is acceptable
  }
}

export async function cacheDel(key: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.del(key);
  } catch {
    // Silent failure
  }
}

// ─── FX Rate Cache ───────────────────────────────────────────────────────────

const FX_CACHE_TTL = 300; // 5 minutes
const FX_CACHE_PREFIX = "fx:";

export async function getCachedFxRate(from: string, to: string): Promise<number | null> {
  return cacheGet<number>(`${FX_CACHE_PREFIX}${from}:${to}`);
}

export async function setCachedFxRate(from: string, to: string, rate: number): Promise<void> {
  await cacheSet(`${FX_CACHE_PREFIX}${from}:${to}`, rate, FX_CACHE_TTL);
}

// ─── Kill Switch Cache ───────────────────────────────────────────────────────

const KS_PREFIX = "ks:";

export async function getKillSwitchState(corridor: string): Promise<boolean | null> {
  return cacheGet<boolean>(`${KS_PREFIX}${corridor}`);
}

export async function setKillSwitchState(corridor: string, active: boolean): Promise<void> {
  // Kill switch state persists until explicitly cleared (long TTL)
  await cacheSet(`${KS_PREFIX}${corridor}`, active, 86400);
}

// ─── Rate Limiting (sliding window) ──────────────────────────────────────────

export async function incrementRateLimit(key: string, windowMs: number): Promise<number> {
  const client = getRedis();
  if (!client) return 0; // Can't enforce without Redis — allow request
  try {
    const fullKey = `rl:${key}`;
    const count = await client.incr(fullKey);
    if (count === 1) {
      await client.pexpire(fullKey, windowMs);
    }
    return count;
  } catch {
    return 0;
  }
}

// ─── Session Blacklist ───────────────────────────────────────────────────────

export async function blacklistSession(sessionId: string, ttlSeconds: number): Promise<void> {
  await cacheSet(`sess:blacklist:${sessionId}`, true, ttlSeconds);
}

export async function isSessionBlacklisted(sessionId: string): Promise<boolean> {
  const result = await cacheGet<boolean>(`sess:blacklist:${sessionId}`);
  return result === true;
}

// ─── Pub/Sub ─────────────────────────────────────────────────────────────────

type MessageHandler = (channel: string, message: string) => void;
const handlers: MessageHandler[] = [];

export function getSubscriber(): Redis | null {
  if (subscriber) return subscriber;
  try {
    subscriber = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: null,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });
    subscriber.on("message", (channel, message) => {
      handlers.forEach(h => h(channel, message));
    });
    subscriber.connect().catch(() => {
      subscriber = null;
    });
    return subscriber;
  } catch {
    return null;
  }
}

export function onMessage(handler: MessageHandler): void {
  handlers.push(handler);
}

export async function subscribe(channel: string): Promise<void> {
  const sub = getSubscriber();
  if (!sub) return;
  try {
    await sub.subscribe(channel);
  } catch {
    // Silent
  }
}

export async function publish(channel: string, message: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.publish(channel, message);
  } catch {
    // Silent
  }
}

// ─── Distributed Lock ────────────────────────────────────────────────────────

export async function acquireLock(key: string, ttlMs: number): Promise<boolean> {
  const client = getRedis();
  if (!client) return true; // Without Redis, assume lock acquired (single-instance)
  try {
    const result = await client.set(`lock:${key}`, "1", "PX", ttlMs, "NX");
    return result === "OK";
  } catch {
    return true;
  }
}

export async function releaseLock(key: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.del(`lock:${key}`);
  } catch {
    // Silent
  }
}

// ─── Shutdown ────────────────────────────────────────────────────────────────

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit().catch(() => {});
    redis = null;
  }
  if (subscriber) {
    await subscriber.quit().catch(() => {});
    subscriber = null;
  }
}
