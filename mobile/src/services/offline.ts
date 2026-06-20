/**
 * Offline Manager — queue mutations when offline, replay when connection returns.
 * Uses NetInfo for connectivity detection and AsyncStorage for queue persistence.
 */
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface QueuedMutation {
  id: string;
  endpoint: string;
  method: "POST" | "PUT" | "DELETE" | "GET";
  body: unknown;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

type ConnectionListener = (isConnected: boolean) => void;

const QUEUE_KEY = "@tourismpay/offline_queue";
const MAX_RETRIES = 3;

class OfflineManager {
  private isConnected = true;
  private queue: QueuedMutation[] = [];
  private listeners: ConnectionListener[] = [];
  private processing = false;
  private unsubscribe: (() => void) | null = null;

  async initialize(): Promise<void> {
    const state = await NetInfo.fetch();
    this.isConnected = state.isConnected ?? true;

    this.unsubscribe = NetInfo.addEventListener(this.handleConnectivityChange);
    await this.loadQueue();

    if (this.isConnected && this.queue.length > 0) {
      this.processQueue();
    }
  }

  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private handleConnectivityChange = (state: NetInfoState): void => {
    const wasOffline = !this.isConnected;
    this.isConnected = state.isConnected ?? false;

    this.listeners.forEach((fn) => fn(this.isConnected));

    if (wasOffline && this.isConnected && this.queue.length > 0) {
      this.processQueue();
    }
  };

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  onConnectionChange(listener: ConnectionListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  async enqueue(endpoint: string, method: "POST" | "PUT" | "DELETE" | "GET", body: unknown): Promise<string> {
    const mutation: QueuedMutation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      endpoint,
      method,
      body,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: MAX_RETRIES,
    };

    this.queue.push(mutation);
    await this.persistQueue();

    if (this.isConnected && !this.processing) {
      this.processQueue();
    }

    return mutation.id;
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getPendingMutations(): QueuedMutation[] {
    return [...this.queue];
  }

  private async processQueue(): Promise<void> {
    if (this.processing || !this.isConnected || this.queue.length === 0) return;
    this.processing = true;

    const { request } = await import("./api");

    while (this.queue.length > 0 && this.isConnected) {
      const mutation = this.queue[0];

      try {
        await request(mutation.endpoint, {
          method: mutation.method as "GET" | "POST",
          body: mutation.body,
        });
        this.queue.shift();
        await this.persistQueue();
      } catch (err) {
        mutation.retryCount++;
        if (mutation.retryCount >= mutation.maxRetries) {
          this.queue.shift();
          await this.persistQueue();
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000 * mutation.retryCount));
        }
      }
    }

    this.processing = false;
  }

  private async loadQueue(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (raw) {
        this.queue = JSON.parse(raw);
      }
    } catch {
      this.queue = [];
    }
  }

  private async persistQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    } catch {
      // Storage full or unavailable
    }
  }
}

export const offlineManager = new OfflineManager();
