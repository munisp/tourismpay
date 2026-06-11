/**
 * useOfflinePaymentQueue
 * Manages an offline-first payment queue using IndexedDB.
 *
 * When a tourist tries to pay via QR code but is offline, the payment is
 * queued in IndexedDB. When connectivity is restored (via the online event
 * or Background Sync), queued payments are automatically replayed.
 *
 * Usage:
 *   const { queuePayment, pendingCount, isOnline, retryAll } = useOfflinePaymentQueue();
 */
import { logger } from "@/lib/logger";
import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

const DB_NAME = "tourismpay-offline";
const DB_VERSION = 1;
const STORE_NAME = "payment-queue";

export interface QueuedPayment {
  id: string;
  token: string;
  amountUsd: string;
  currency: string;
  queuedAt: number;
  attempts: number;
  lastError?: string;
  status: "pending" | "retrying" | "failed";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("queuedAt", "queuedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllQueued(): Promise<QueuedPayment[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as QueuedPayment[]);
    req.onerror = () => reject(req.error);
  });
}

async function putQueued(payment: QueuedPayment): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(payment);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteQueued(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOfflinePaymentQueue() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [queue, setQueue] = useState<QueuedPayment[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const replayingRef = useRef(false);

  const payMutation = trpc.qrPayment.pay.useMutation();

  // Load queue from IndexedDB on mount
  useEffect(() => {
    getAllQueued()
      .then(setQueue)
      .catch((err) => logger.warn("[OfflineQueue] Could not load queue:", err));
  }, []);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-replay when coming back online
      replayQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Queue a payment for later replay when offline.
   */
  const queuePayment = useCallback(
    async (payment: { token: string; amountUsd: string; currency: string }) => {
      const queued: QueuedPayment = {
        id: `${payment.token}-${Date.now()}`,
        token: payment.token,
        amountUsd: payment.amountUsd,
        currency: payment.currency,
        queuedAt: Date.now(),
        attempts: 0,
        status: "pending",
      };

      await putQueued(queued);
      setQueue((prev) => [...prev, queued]);

      toast.info("Payment queued for when you're back online", {
        description: `${payment.amountUsd} ${payment.currency} will be sent automatically.`,
        duration: 5000,
      });

      // Register background sync if supported
      if ("serviceWorker" in navigator && "SyncManager" in window) {
        try {
          const registration = await navigator.serviceWorker.ready;
          await (registration as any).sync.register("payment-queue-sync");
        } catch {
          // Background sync not available — will retry on online event
        }
      }

      return queued.id;
    },
    []
  );

  /**
   * Attempt to pay a single queued payment.
   * Returns true on success, false on failure.
   */
  const replayOne = useCallback(
    async (queued: QueuedPayment): Promise<boolean> => {
      // Update status to retrying
      const updated: QueuedPayment = { ...queued, status: "retrying", attempts: queued.attempts + 1 };
      await putQueued(updated);
      setQueue((prev) => prev.map((q) => (q.id === queued.id ? updated : q)));

      try {
        await payMutation.mutateAsync({
          token: queued.token,
          amountUsd: queued.amountUsd,
          currency: queued.currency,
        });

        // Success — remove from queue
        await deleteQueued(queued.id);
        setQueue((prev) => prev.filter((q) => q.id !== queued.id));

        toast.success("Queued payment sent successfully", {
          description: `${queued.amountUsd} ${queued.currency} delivered.`,
        });
        return true;
      } catch (err: any) {
        const errorMsg = err?.message ?? "Unknown error";

        // If token expired or already used, remove from queue (unrecoverable)
        if (
          errorMsg.includes("expired") ||
          errorMsg.includes("already used") ||
          errorMsg.includes("invalid")
        ) {
          await deleteQueued(queued.id);
          setQueue((prev) => prev.filter((q) => q.id !== queued.id));
          toast.error("Queued payment expired", {
            description: "The QR code expired while you were offline. Please scan again.",
          });
          return false;
        }

        // Mark as failed (will retry next time)
        const failed: QueuedPayment = {
          ...updated,
          status: queued.attempts >= 3 ? "failed" : "pending",
          lastError: errorMsg,
        };
        await putQueued(failed);
        setQueue((prev) => prev.map((q) => (q.id === queued.id ? failed : q)));
        return false;
      }
    },
    [payMutation]
  );

  /**
   * Replay all pending payments in the queue.
   */
  const replayQueue = useCallback(async () => {
    if (replayingRef.current) return;
    replayingRef.current = true;
    setIsReplaying(true);

    try {
      const pending = await getAllQueued();
      const toReplay = pending.filter((p) => p.status === "pending" || p.status === "retrying");

      if (toReplay.length === 0) return;

      toast.info(`Replaying ${toReplay.length} queued payment(s)…`);

      let successCount = 0;
      for (const payment of toReplay) {
        const ok = await replayOne(payment);
        if (ok) successCount++;
      }

      if (successCount > 0) {
        toast.success(`${successCount} payment(s) completed successfully.`);
      }
    } finally {
      replayingRef.current = false;
      setIsReplaying(false);
    }
  }, [replayOne]);

  /**
   * Remove a specific payment from the queue (manual dismiss).
   */
  const dismissPayment = useCallback(async (id: string) => {
    await deleteQueued(id);
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const pendingCount = queue.filter((q) => q.status === "pending" || q.status === "retrying").length;
  const failedCount = queue.filter((q) => q.status === "failed").length;

  return {
    isOnline,
    queue,
    pendingCount,
    failedCount,
    isReplaying,
    queuePayment,
    replayQueue,
    dismissPayment,
  };
}
