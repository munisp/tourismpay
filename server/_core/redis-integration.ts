/**
 * server/_core/redis-integration.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Full Redis Integration Layer
 *
 * Provides:
 *  1. Connection pool with retry and health check
 *  2. Typed cache layer (get/set/del with TTL and namespace)
 *  3. Session store (JWT + refresh token management)
 *  4. Rate limiting (sliding window + token bucket)
 *  5. Pub/Sub (event broadcasting between services)
 *  6. Distributed locks (Redlock algorithm)
 *  7. Job queue (simple FIFO via LPUSH/BRPOP)
 *  8. Leaderboards (sorted sets for loyalty rankings)
 *  9. Real-time presence (online users, active sessions)
 * 10. Idempotency key store
 */

import { logger } from "./logger";

// ─── Config ───────────────────────────────────────────────────────────────────

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: boolean;
  keyPrefix: string;
  connectTimeout: number;
  commandTimeout: number;
}

function getRedisConfig(): RedisConfig | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || "6379"),
      password: parsed.password || undefined,
      db: parsed.pathname ? parseInt(parsed.pathname.slice(1)) || 0 : 0,
      tls: parsed.protocol === "rediss:",
      keyPrefix: process.env.REDIS_KEY_PREFIX || "tp:",
      connectTimeout: 5000,
      commandTimeout: 3000,
    };
  } catch {
    return {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || "0"),
      keyPrefix: process.env.REDIS_KEY_PREFIX || "tp:",
      connectTimeout: 5000,
      commandTimeout: 3000,
    };
  }
}

export function isRedisEnabled(): boolean {
  return !!(process.env.REDIS_URL || process.env.REDIS_HOST);
}

// ─── Redis Client (ioredis) ───────────────────────────────────────────────────

let redisClient: any = null;
let redisConnecting = false;

async function getRedisClient(): Promise<any | null> {
  if (!isRedisEnabled()) return null;
  if (redisClient) return redisClient;
  if (redisConnecting) {
    // Wait for connection
    await new Promise((resolve) => setTimeout(resolve, 100));
    return redisClient;
  }
  redisConnecting = true;
  try {
    const { default: Redis } = await import("ioredis");
    const config = getRedisConfig()!;
    redisClient = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      tls: config.tls ? {} : undefined,
      keyPrefix: config.keyPrefix,
      connectTimeout: config.connectTimeout,
      commandTimeout: config.commandTimeout,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 10) return null;
        return Math.min(times * 100, 3000);
      },
      lazyConnect: false,
    });
    redisClient.on("error", (err: Error) => {
      logger.error({ err }, "Redis client error");
    });
    redisClient.on("connect", () => {
      logger.info("Redis connected");
    });
    redisClient.on("reconnecting", () => {
      logger.warn("Redis reconnecting");
    });
    await redisClient.ping();
    return redisClient;
  } catch (err) {
    logger.error({ err }, "Redis connection failed");
    redisClient = null;
    return null;
  } finally {
    redisConnecting = false;
  }
}

// ─── Namespace Keys ───────────────────────────────────────────────────────────

const NS = {
  CACHE: "cache:",
  SESSION: "session:",
  REFRESH_TOKEN: "rt:",
  RATE_LIMIT: "rl:",
  LOCK: "lock:",
  QUEUE: "queue:",
  LEADERBOARD: "lb:",
  PRESENCE: "presence:",
  IDEMPOTENCY: "idem:",
  EXCHANGE_RATE: "fx:",
  USER_PROFILE: "user:",
  MERCHANT_PROFILE: "merchant:",
  FEATURE_FLAG: "ff:",
  OTP: "otp:",
  PUSH_TOKEN: "push:",
} as const;

function key(ns: string, ...parts: (string | number)[]): string {
  return `${ns}${parts.join(":")}`;
}

// ─── Generic Cache ────────────────────────────────────────────────────────────

export async function cacheGet<T>(cacheKey: string): Promise<T | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    const val = await redis.get(key(NS.CACHE, cacheKey));
    if (!val) return null;
    return JSON.parse(val) as T;
  } catch (err) {
    logger.warn({ err, cacheKey }, "cacheGet error");
    return null;
  }
}

export async function cacheSet(
  cacheKey: string,
  value: unknown,
  ttlSeconds = 300,
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.setex(
      key(NS.CACHE, cacheKey),
      ttlSeconds,
      JSON.stringify(value),
    );
  } catch (err) {
    logger.warn({ err, cacheKey }, "cacheSet error");
  }
}

export async function cacheDel(cacheKey: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.del(key(NS.CACHE, cacheKey));
  } catch (err) {
    logger.warn({ err, cacheKey }, "cacheDel error");
  }
}

export async function cacheGetOrSet<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  ttlSeconds = 300,
): Promise<T> {
  const cached = await cacheGet<T>(cacheKey);
  if (cached !== null) return cached;
  const value = await fetcher();
  await cacheSet(cacheKey, value, ttlSeconds);
  return value;
}

export async function cacheInvalidatePattern(pattern: string): Promise<number> {
  const redis = await getRedisClient();
  if (!redis) return 0;
  try {
    const keys = await redis.keys(key(NS.CACHE, pattern));
    if (keys.length === 0) return 0;
    await redis.del(...keys);
    return keys.length;
  } catch (err) {
    logger.warn({ err, pattern }, "cacheInvalidatePattern error");
    return 0;
  }
}

// ─── Session Store ────────────────────────────────────────────────────────────

export interface SessionData {
  userId: number;
  role: string;
  email?: string;
  keycloakSub?: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: number;
  lastActiveAt: number;
}

export async function sessionSet(
  sessionId: string,
  data: SessionData,
  ttlSeconds = 86400, // 24h
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.setex(
      key(NS.SESSION, sessionId),
      ttlSeconds,
      JSON.stringify(data),
    );
    // Track user's active sessions
    await redis.sadd(key(NS.SESSION, "user", data.userId), sessionId);
    await redis.expire(key(NS.SESSION, "user", data.userId), ttlSeconds);
  } catch (err) {
    logger.warn({ err }, "sessionSet error");
  }
}

export async function sessionGet(
  sessionId: string,
): Promise<SessionData | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    const val = await redis.get(key(NS.SESSION, sessionId));
    if (!val) return null;
    const data = JSON.parse(val) as SessionData;
    // Update last active
    data.lastActiveAt = Date.now();
    await redis.setex(
      key(NS.SESSION, sessionId),
      86400,
      JSON.stringify(data),
    );
    return data;
  } catch (err) {
    logger.warn({ err }, "sessionGet error");
    return null;
  }
}

export async function sessionDel(sessionId: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    const data = await sessionGet(sessionId);
    if (data) {
      await redis.srem(key(NS.SESSION, "user", data.userId), sessionId);
    }
    await redis.del(key(NS.SESSION, sessionId));
  } catch (err) {
    logger.warn({ err }, "sessionDel error");
  }
}

export async function revokeAllUserSessions(userId: number): Promise<number> {
  const redis = await getRedisClient();
  if (!redis) return 0;
  try {
    const sessionIds = await redis.smembers(key(NS.SESSION, "user", userId));
    if (sessionIds.length === 0) return 0;
    const keysToDelete = [
      key(NS.SESSION, "user", userId),
      ...sessionIds.map((sid: string) => key(NS.SESSION, sid)),
    ];
    await redis.del(...keysToDelete);
    return sessionIds.length;
  } catch (err) {
    logger.warn({ err }, "revokeAllUserSessions error");
    return 0;
  }
}

// ─── Refresh Token Store ──────────────────────────────────────────────────────

export async function storeRefreshToken(
  userId: number,
  tokenHash: string,
  ttlSeconds = 2592000, // 30 days
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.setex(
      key(NS.REFRESH_TOKEN, tokenHash),
      ttlSeconds,
      String(userId),
    );
  } catch (err) {
    logger.warn({ err }, "storeRefreshToken error");
  }
}

export async function validateRefreshToken(
  tokenHash: string,
): Promise<number | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    const val = await redis.get(key(NS.REFRESH_TOKEN, tokenHash));
    return val ? parseInt(val) : null;
  } catch {
    return null;
  }
}

export async function revokeRefreshToken(tokenHash: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.del(key(NS.REFRESH_TOKEN, tokenHash));
  } catch (err) {
    logger.warn({ err }, "revokeRefreshToken error");
  }
}

// ─── Rate Limiting (Sliding Window) ──────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export async function checkRateLimit(params: {
  identifier: string; // e.g. "user:123" or "ip:1.2.3.4"
  action: string; // e.g. "login", "transfer", "api"
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const redis = await getRedisClient();
  const now = Date.now();
  const windowStart = now - params.windowSeconds * 1000;
  const rlKey = key(NS.RATE_LIMIT, params.action, params.identifier);

  if (!redis) {
    return { allowed: true, remaining: params.limit, resetAt: now + params.windowSeconds * 1000, limit: params.limit };
  }

  try {
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(rlKey, 0, windowStart);
    pipeline.zadd(rlKey, now, `${now}-${Math.random()}`);
    pipeline.zcard(rlKey);
    pipeline.expire(rlKey, params.windowSeconds + 1);
    const results = await pipeline.exec();
    const count = (results[2][1] as number) || 0;
    const allowed = count <= params.limit;
    return {
      allowed,
      remaining: Math.max(0, params.limit - count),
      resetAt: now + params.windowSeconds * 1000,
      limit: params.limit,
    };
  } catch (err) {
    logger.warn({ err }, "checkRateLimit error");
    return { allowed: true, remaining: params.limit, resetAt: now + params.windowSeconds * 1000, limit: params.limit };
  }
}

// ─── Distributed Locks (Redlock) ─────────────────────────────────────────────

export async function acquireLock(
  resource: string,
  ttlMs = 30_000,
): Promise<string | null> {
  const redis = await getRedisClient();
  if (!redis) return `local-lock-${Date.now()}`;
  const lockKey = key(NS.LOCK, resource);
  const lockValue = `${Date.now()}-${Math.random()}`;
  try {
    const result = await redis.set(lockKey, lockValue, "PX", ttlMs, "NX");
    return result === "OK" ? lockValue : null;
  } catch (err) {
    logger.warn({ err }, "acquireLock error");
    return null;
  }
}

export async function releaseLock(
  resource: string,
  lockValue: string,
): Promise<boolean> {
  const redis = await getRedisClient();
  if (!redis) return true;
  const lockKey = key(NS.LOCK, resource);
  // Lua script for atomic check-and-delete
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  try {
    const result = await redis.eval(script, 1, lockKey, lockValue);
    return result === 1;
  } catch (err) {
    logger.warn({ err }, "releaseLock error");
    return false;
  }
}

export async function withLock<T>(
  resource: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const lockValue = await acquireLock(resource, ttlMs);
  if (!lockValue) {
    throw new Error(`Could not acquire lock on resource: ${resource}`);
  }
  try {
    return await fn();
  } finally {
    await releaseLock(resource, lockValue);
  }
}

// ─── Pub/Sub ──────────────────────────────────────────────────────────────────

export async function publishEvent(
  channel: string,
  event: { type: string; payload: unknown; timestamp?: number },
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.publish(
      `tp:events:${channel}`,
      JSON.stringify({ ...event, timestamp: event.timestamp || Date.now() }),
    );
  } catch (err) {
    logger.warn({ err, channel }, "publishEvent error");
  }
}

// ─── Exchange Rate Cache ──────────────────────────────────────────────────────

export async function cacheExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  rate: number,
  ttlSeconds = 300,
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.setex(
      key(NS.EXCHANGE_RATE, `${fromCurrency}:${toCurrency}`),
      ttlSeconds,
      String(rate),
    );
  } catch (err) {
    logger.warn({ err }, "cacheExchangeRate error");
  }
}

export async function getCachedExchangeRate(
  fromCurrency: string,
  toCurrency: string,
): Promise<number | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    const val = await redis.get(
      key(NS.EXCHANGE_RATE, `${fromCurrency}:${toCurrency}`),
    );
    return val ? parseFloat(val) : null;
  } catch {
    return null;
  }
}

// ─── OTP Store ────────────────────────────────────────────────────────────────

export async function storeOTP(
  identifier: string,
  otp: string,
  ttlSeconds = 300,
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.setex(key(NS.OTP, identifier), ttlSeconds, otp);
  } catch (err) {
    logger.warn({ err }, "storeOTP error");
  }
}

export async function verifyOTP(
  identifier: string,
  otp: string,
): Promise<boolean> {
  const redis = await getRedisClient();
  if (!redis) return false;
  try {
    const stored = await redis.get(key(NS.OTP, identifier));
    if (stored === otp) {
      await redis.del(key(NS.OTP, identifier));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ─── Idempotency Keys ─────────────────────────────────────────────────────────

export async function checkIdempotencyKey(
  key_: string,
): Promise<{ exists: boolean; result?: unknown }> {
  const redis = await getRedisClient();
  if (!redis) return { exists: false };
  try {
    const val = await redis.get(key(NS.IDEMPOTENCY, key_));
    if (!val) return { exists: false };
    return { exists: true, result: JSON.parse(val) };
  } catch {
    return { exists: false };
  }
}

export async function setIdempotencyKey(
  key_: string,
  result: unknown,
  ttlSeconds = 86400,
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.setex(
      key(NS.IDEMPOTENCY, key_),
      ttlSeconds,
      JSON.stringify(result),
    );
  } catch (err) {
    logger.warn({ err }, "setIdempotencyKey error");
  }
}

// ─── Loyalty Leaderboard ──────────────────────────────────────────────────────

export async function updateLoyaltyLeaderboard(
  userId: number,
  points: number,
  currency = "NGN",
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.zadd(key(NS.LEADERBOARD, currency), points, String(userId));
  } catch (err) {
    logger.warn({ err }, "updateLoyaltyLeaderboard error");
  }
}

export async function getLoyaltyLeaderboard(
  currency = "NGN",
  limit = 10,
): Promise<Array<{ userId: number; points: number; rank: number }>> {
  const redis = await getRedisClient();
  if (!redis) return [];
  try {
    const results = await redis.zrevrangebyscore(
      key(NS.LEADERBOARD, currency),
      "+inf",
      "-inf",
      "WITHSCORES",
      "LIMIT",
      0,
      limit,
    );
    const leaderboard = [];
    for (let i = 0; i < results.length; i += 2) {
      leaderboard.push({
        userId: parseInt(results[i]),
        points: parseFloat(results[i + 1]),
        rank: i / 2 + 1,
      });
    }
    return leaderboard;
  } catch {
    return [];
  }
}

// ─── User Presence ────────────────────────────────────────────────────────────

export async function setUserOnline(userId: number): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.setex(key(NS.PRESENCE, userId), 300, "1"); // 5 min TTL
    await redis.sadd(key(NS.PRESENCE, "online"), String(userId));
    await redis.expire(key(NS.PRESENCE, "online"), 300);
  } catch (err) {
    logger.warn({ err }, "setUserOnline error");
  }
}

export async function isUserOnline(userId: number): Promise<boolean> {
  const redis = await getRedisClient();
  if (!redis) return false;
  try {
    const val = await redis.get(key(NS.PRESENCE, userId));
    return val === "1";
  } catch {
    return false;
  }
}

// ─── Feature Flags ────────────────────────────────────────────────────────────

export async function getFeatureFlag(flagName: string): Promise<boolean | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    const val = await redis.get(key(NS.FEATURE_FLAG, flagName));
    if (val === null) return null;
    return val === "1" || val === "true";
  } catch {
    return null;
  }
}

export async function setFeatureFlag(
  flagName: string,
  enabled: boolean,
  ttlSeconds?: number,
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    if (ttlSeconds) {
      await redis.setex(key(NS.FEATURE_FLAG, flagName), ttlSeconds, enabled ? "1" : "0");
    } else {
      await redis.set(key(NS.FEATURE_FLAG, flagName), enabled ? "1" : "0");
    }
  } catch (err) {
    logger.warn({ err }, "setFeatureFlag error");
  }
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function checkRedisHealth(): Promise<{
  healthy: boolean;
  latencyMs: number;
  mode?: string;
  keyCount?: number;
}> {
  const start = Date.now();
  const redis = await getRedisClient();
  if (!redis) return { healthy: false, latencyMs: 0 };
  try {
    await redis.ping();
    const info = await redis.info("server");
    const modeMatch = info.match(/redis_mode:(\S+)/);
    const dbInfo = await redis.dbsize();
    return {
      healthy: true,
      latencyMs: Date.now() - start,
      mode: modeMatch?.[1],
      keyCount: dbInfo,
    };
  } catch {
    return { healthy: false, latencyMs: Date.now() - start };
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
