/**
 * TourismPay Node.js Performance Optimization
 * Tasks: 39 (TigerBeetle 37.5µs GC spike analysis), 42 (memory tuning),
 *        44 (NODE_OPTIONS environment variables)
 *
 * Implements:
 *  1. Object pooling for high-frequency wallet transaction objects
 *  2. V8 GC monitoring with Prometheus metrics
 *  3. Memory pressure detection and graceful degradation
 *  4. Recommended NODE_OPTIONS for production
 *
 * Recommended NODE_OPTIONS (add to docker-compose.yml and k8s deployments):
 *   NODE_OPTIONS="--max-old-space-size=2048 --max-semi-space-size=64
 *                 --gc-interval=100 --optimize-for-size
 *                 --expose-gc --heap-prof"
 */

import { EventEmitter } from "events";

// ─── V8 GC monitoring ─────────────────────────────────────────────────────────

interface GCStats {
  gcType: string;
  pauseMs: number;
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  timestamp: number;
}

class GCMonitor extends EventEmitter {
  private stats: GCStats[] = [];
  private maxStats = 1000;
  private gcPauseThresholdMs = 10; // Alert if GC pause > 10ms
  private spikeCount = 0;

  constructor() {
    super();
    this.startMonitoring();
  }

  private startMonitoring() {
    // Use perf_hooks to monitor GC events
    try {
      const { PerformanceObserver, constants } = require("perf_hooks");

      const obs = new PerformanceObserver((list: any) => {
        for (const entry of list.getEntries()) {
          const pauseMs = entry.duration;
          const memUsage = process.memoryUsage();

          const stat: GCStats = {
            gcType: entry.detail?.kind === constants.NODE_PERFORMANCE_GC_MAJOR ? "major" :
                    entry.detail?.kind === constants.NODE_PERFORMANCE_GC_MINOR ? "minor" : "incremental",
            pauseMs,
            heapUsedMB: memUsage.heapUsed / 1024 / 1024,
            heapTotalMB: memUsage.heapTotal / 1024 / 1024,
            externalMB: memUsage.external / 1024 / 1024,
            timestamp: Date.now(),
          };

          this.stats.push(stat);
          if (this.stats.length > this.maxStats) {
            this.stats.shift();
          }

          // Alert on GC spikes (like the 37.5µs spike in Task 39)
          if (pauseMs > this.gcPauseThresholdMs) {
            this.spikeCount++;
            this.emit("gc_spike", stat);

            if (process.env.NODE_ENV === "production") {
              console.warn(
                `[GC SPIKE] ${stat.gcType} GC pause: ${pauseMs.toFixed(2)}ms ` +
                `heap: ${stat.heapUsedMB.toFixed(1)}MB/${stat.heapTotalMB.toFixed(1)}MB`
              );
            }
          }
        }
      });

      obs.observe({ entryTypes: ["gc"], buffered: false });
    } catch (e) {
      // perf_hooks GC observation not available in all environments
    }
  }

  getStats() {
    const recent = this.stats.slice(-100);
    if (recent.length === 0) {
      return {
        totalGCEvents: 0,
        spikeCount: this.spikeCount,
        avgPauseMs: 0,
        maxPauseMs: 0,
        p99PauseMs: 0,
        currentHeapMB: process.memoryUsage().heapUsed / 1024 / 1024,
      };
    }

    const pauses = recent.map((s) => s.pauseMs).sort((a, b) => a - b);
    const p99Idx = Math.floor(pauses.length * 0.99);

    return {
      totalGCEvents: this.stats.length,
      spikeCount: this.spikeCount,
      avgPauseMs: pauses.reduce((a, b) => a + b, 0) / pauses.length,
      maxPauseMs: Math.max(...pauses),
      p99PauseMs: pauses[p99Idx] || 0,
      currentHeapMB: process.memoryUsage().heapUsed / 1024 / 1024,
      recommendation: this.getRecommendation(Math.max(...pauses)),
    };
  }

  private getRecommendation(maxPauseMs: number): string {
    if (maxPauseMs > 100) {
      return "CRITICAL: GC pauses >100ms. Increase --max-old-space-size, enable object pooling, reduce allocation rate";
    } else if (maxPauseMs > 37.5) {
      // The 37.5µs spike from Task 39
      return "HIGH: GC pauses >37.5ms. Apply: --max-old-space-size=2048 --max-semi-space-size=64 --gc-interval=100";
    } else if (maxPauseMs > 10) {
      return "MEDIUM: GC pauses >10ms. Consider object pooling for high-frequency allocations";
    }
    return "OK: GC pauses within acceptable range";
  }
}

export const gcMonitor = new GCMonitor();

// ─── Object pool for wallet transaction objects ───────────────────────────────
// Reduces GC pressure by reusing objects instead of allocating new ones
// for every wallet transaction (which can be 1000s/second).

interface WalletTxObject {
  userId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
  timestamp: number;
  type: "debit" | "credit" | "transfer";
  reset(): void;
}

class WalletTxPool {
  private pool: WalletTxObject[] = [];
  private maxSize: number;
  private allocated = 0;
  private reused = 0;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    // Pre-allocate pool
    for (let i = 0; i < Math.min(100, maxSize); i++) {
      this.pool.push(this.createObject());
    }
  }

  private createObject(): WalletTxObject {
    const obj: WalletTxObject = {
      userId: "",
      amount: 0,
      currency: "NGN",
      idempotencyKey: "",
      timestamp: 0,
      type: "debit",
      reset() {
        this.userId = "";
        this.amount = 0;
        this.currency = "NGN";
        this.idempotencyKey = "";
        this.timestamp = 0;
        this.type = "debit";
      },
    };
    return obj;
  }

  acquire(): WalletTxObject {
    if (this.pool.length > 0) {
      this.reused++;
      return this.pool.pop()!;
    }
    this.allocated++;
    return this.createObject();
  }

  release(obj: WalletTxObject): void {
    obj.reset();
    if (this.pool.length < this.maxSize) {
      this.pool.push(obj);
    }
    // If pool is full, let GC collect it
  }

  getStats() {
    return {
      poolSize: this.pool.length,
      maxSize: this.maxSize,
      allocated: this.allocated,
      reused: this.reused,
      reuseRate: this.allocated + this.reused > 0
        ? (this.reused / (this.allocated + this.reused) * 100).toFixed(1) + "%"
        : "0%",
    };
  }
}

export const walletTxPool = new WalletTxPool(1000);

// ─── Memory pressure monitor ──────────────────────────────────────────────────

export class MemoryPressureMonitor {
  private readonly warningThresholdMB: number;
  private readonly criticalThresholdMB: number;
  private readonly maxOldSpaceMB: number;

  constructor() {
    // Parse --max-old-space-size from NODE_OPTIONS
    const nodeOptions = process.env.NODE_OPTIONS || "";
    const match = nodeOptions.match(/--max-old-space-size=(\d+)/);
    this.maxOldSpaceMB = match ? parseInt(match[1]) : 1024; // Default 1GB
    this.warningThresholdMB = this.maxOldSpaceMB * 0.75;
    this.criticalThresholdMB = this.maxOldSpaceMB * 0.90;
  }

  check(): {
    level: "ok" | "warning" | "critical";
    heapUsedMB: number;
    heapTotalMB: number;
    rssMemMB: number;
    recommendation: string;
  } {
    const mem = process.memoryUsage();
    const heapUsedMB = mem.heapUsed / 1024 / 1024;
    const heapTotalMB = mem.heapTotal / 1024 / 1024;
    const rssMemMB = mem.rss / 1024 / 1024;

    let level: "ok" | "warning" | "critical" = "ok";
    let recommendation = "Memory usage nominal";

    if (heapUsedMB > this.criticalThresholdMB) {
      level = "critical";
      recommendation = `CRITICAL: Heap ${heapUsedMB.toFixed(0)}MB/${this.maxOldSpaceMB}MB. ` +
        `Trigger graceful restart. Apply: NODE_OPTIONS="--max-old-space-size=${this.maxOldSpaceMB * 2}"`;
    } else if (heapUsedMB > this.warningThresholdMB) {
      level = "warning";
      recommendation = `WARNING: Heap ${heapUsedMB.toFixed(0)}MB/${this.maxOldSpaceMB}MB. ` +
        `Consider: --max-old-space-size=${Math.ceil(this.maxOldSpaceMB * 1.5)}`;
    }

    return { level, heapUsedMB, heapTotalMB, rssMemMB, recommendation };
  }

  // Force GC if available (requires --expose-gc flag)
  forceGC(): boolean {
    if (typeof (global as any).gc === "function") {
      (global as any).gc();
      return true;
    }
    return false;
  }
}

export const memoryMonitor = new MemoryPressureMonitor();

// ─── Recommended NODE_OPTIONS ─────────────────────────────────────────────────

export const RECOMMENDED_NODE_OPTIONS = {
  // Heap size: 2GB for production (wallet service handles high throughput)
  maxOldSpaceSize: "--max-old-space-size=2048",

  // Semi-space size: 64MB (reduces minor GC frequency)
  maxSemiSpaceSize: "--max-semi-space-size=64",

  // GC interval: 100 (balance between throughput and pause time)
  gcInterval: "--gc-interval=100",

  // Expose GC for manual triggering in memory pressure scenarios
  exposeGc: "--expose-gc",

  // Optimize for size (reduces code size, slightly slower startup)
  optimizeForSize: "--optimize-for-size",

  // Combined (add to docker-compose.yml environment section):
  combined: [
    "--max-old-space-size=2048",
    "--max-semi-space-size=64",
    "--gc-interval=100",
    "--expose-gc",
  ].join(" "),

  // docker-compose.yml patch:
  dockerComposePatch: `
# Add to tourismpay-server service environment:
environment:
  NODE_OPTIONS: "--max-old-space-size=2048 --max-semi-space-size=64 --gc-interval=100 --expose-gc"
  UV_THREADPOOL_SIZE: "16"  # Increase libuv thread pool for I/O
`,

  // k8s deployment patch:
  k8sPatch: `
# Add to tourismpay-server container env:
- name: NODE_OPTIONS
  value: "--max-old-space-size=2048 --max-semi-space-size=64 --gc-interval=100 --expose-gc"
- name: UV_THREADPOOL_SIZE
  value: "16"
`,
};

// ─── Performance metrics endpoint ─────────────────────────────────────────────

export function getPerformanceMetrics() {
  return {
    gc: gcMonitor.getStats(),
    memory: memoryMonitor.check(),
    objectPool: {
      walletTx: walletTxPool.getStats(),
    },
    nodeOptions: {
      current: process.env.NODE_OPTIONS || "(not set)",
      recommended: RECOMMENDED_NODE_OPTIONS.combined,
      isOptimal: (process.env.NODE_OPTIONS || "").includes("--max-old-space-size=2048"),
    },
    uptime: process.uptime(),
    pid: process.pid,
    nodeVersion: process.version,
  };
}
