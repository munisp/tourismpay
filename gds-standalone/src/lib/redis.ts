/**
 * Redis Client — GDS Standalone
 * Provides caching, rate-limit counters, and pub/sub.
 * Degrades gracefully when Redis is unavailable.
 */
import { config } from "../config";

let redis: import("ioredis").default | null = null;
let redisAvailable = false;

async function createRedis(): Promise<import("ioredis").default | null> {
  try {
    const Redis = (await import("ioredis")).default;
    const client = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 200, 2000)),
      lazyConnect: true,
    });
    await client.connect();
    console.log("[Redis] Connected:", config.REDIS_URL.replace(/\/\/[^@]*@/, "//***@"));
    redisAvailable = true;
    client.on("error", (err) => {
      console.warn("[Redis] Error:", err.message);
      redisAvailable = false;
    });
    client.on("reconnecting", () => {
      console.log("[Redis] Reconnecting...");
    });
    client.on("ready", () => {
      redisAvailable = true;
    });
    return client;
  } catch (err) {
    console.warn("[Redis] Unavailable, caching disabled:", (err as Error).message);
    redisAvailable = false;
    return null;
  }
}

export async function getRedis(): Promise<import("ioredis").default | null> {
  if (!redis) {
    redis = await createRedis();
  }
  return redis;
}

export async function cacheGet(key: string): Promise<string | null> {
  const r = await getRedis();
  if (!r) return null;
  try {
    return await r.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds = 300): Promise<void> {
  const r = await getRedis();
  if (!r) return;
  try {
    await r.set(key, value, "EX", ttlSeconds);
  } catch {
    // cache miss is non-fatal
  }
}

export async function cacheDelete(key: string): Promise<void> {
  const r = await getRedis();
  if (!r) return;
  try {
    await r.del(key);
  } catch {
    // non-fatal
  }
}

export async function cacheIncr(key: string, ttlSeconds = 60): Promise<number> {
  const r = await getRedis();
  if (!r) return 0;
  try {
    const val = await r.incr(key);
    if (val === 1) {
      await r.expire(key, ttlSeconds);
    }
    return val;
  } catch {
    return 0;
  }
}

export function isRedisAvailable(): boolean {
  return redisAvailable;
}

export async function redisHealthCheck(): Promise<{
  status: string;
  latency_ms: number;
}> {
  const r = await getRedis();
  if (!r) return { status: "disconnected", latency_ms: -1 };
  const start = Date.now();
  try {
    await r.ping();
    return { status: "connected", latency_ms: Date.now() - start };
  } catch {
    return { status: "error", latency_ms: -1 };
  }
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    redisAvailable = false;
    console.log("[Redis] Closed");
  }
}
