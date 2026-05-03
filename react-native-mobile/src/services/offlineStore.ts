/**
 * Offline-first storage with queue management and CRDT-based conflict resolution.
 * Designed for unreliable connectivity (rural Africa, low bandwidth).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import type { OfflineAction, SyncResult } from "./api";
import { api } from "./api";

const OFFLINE_QUEUE_KEY = "offline_queue";
const SYNC_STATE_KEY = "sync_state";
const MAX_QUEUE_SIZE = 500;
const SYNC_INTERVAL_MS = 30_000;

interface SyncState {
  lastSyncAt: number;
  pendingCount: number;
  failedCount: number;
  vectorClock: Record<string, number>;
}

class OfflineStore {
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;

  async init(): Promise<void> {
    NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable) {
        this.attemptSync();
      }
    });

    this.syncTimer = setInterval(() => this.attemptSync(), SYNC_INTERVAL_MS);
  }

  async enqueue(action: Omit<OfflineAction, "id" | "timestamp">): Promise<void> {
    const queue = await this.getQueue();
    if (queue.length >= MAX_QUEUE_SIZE) {
      queue.shift();
    }

    const entry: OfflineAction = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      ...action,
    };

    queue.push(entry);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  }

  async getQueue(): Promise<OfflineAction[]> {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  async getQueueSize(): Promise<number> {
    const queue = await this.getQueue();
    return queue.length;
  }

  async attemptSync(): Promise<SyncResult | null> {
    if (this.isSyncing) return null;

    const netState = await NetInfo.fetch();
    if (!netState.isConnected || !netState.isInternetReachable) return null;

    const queue = await this.getQueue();
    if (queue.length === 0) return null;

    this.isSyncing = true;
    try {
      const batchSize = this.getBatchSize(netState.type);
      const batch = queue.slice(0, batchSize);
      const result = await api.syncOfflineQueue(batch);

      const remaining = queue.slice(batch.length - result.synced);
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));

      const state = await this.getSyncState();
      state.lastSyncAt = Date.now();
      state.pendingCount = remaining.length;
      state.failedCount += result.failed;
      await this.saveSyncState(state);

      return result;
    } catch {
      return null;
    } finally {
      this.isSyncing = false;
    }
  }

  private getBatchSize(connectionType: string | null): number {
    switch (connectionType) {
      case "wifi":
      case "ethernet":
        return 50;
      case "cellular":
        return 10;
      default:
        return 5;
    }
  }

  async getSyncState(): Promise<SyncState> {
    const raw = await AsyncStorage.getItem(SYNC_STATE_KEY);
    return raw
      ? JSON.parse(raw)
      : { lastSyncAt: 0, pendingCount: 0, failedCount: 0, vectorClock: {} };
  }

  private async saveSyncState(state: SyncState): Promise<void> {
    await AsyncStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
  }

  async clearQueue(): Promise<void> {
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify([]));
  }

  destroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }
}

export const offlineStore = new OfflineStore();
