/**
 * useOfflineItinerary — Offline-first itinerary storage using IndexedDB.
 *
 * Saves trip planner itineraries for offline access. Syncs with service
 * worker cache for full PWA offline experience.
 *
 * Usage:
 *   const { saveOffline, getAll, remove, count, isOnline } = useOfflineItinerary();
 */
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

const DB_NAME = "tourismpay-itineraries";
const DB_VERSION = 1;
const STORE_NAME = "saved-trips";

export interface OfflineItinerary {
  id: string;
  title: string;
  destination: string;
  country: string;
  durationDays: number;
  totalCostUsd: number;
  merchantCoverage: number;
  savedAt: number;
  data: unknown; // Full GeneratedTrip object
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("savedAt", "savedAt", { unique: false });
        store.createIndex("destination", "destination", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllTrips(): Promise<OfflineItinerary[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.index("savedAt").getAll();
    req.onsuccess = () => resolve((req.result ?? []).reverse());
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function saveTrip(trip: OfflineItinerary): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(trip);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function removeTrip(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function getCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export function useOfflineItinerary() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [savedCount, setSavedCount] = useState(0);
  const [savedTrips, setSavedTrips] = useState<OfflineItinerary[]>([]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => {
      setIsOnline(false);
      toast.info("You're offline", { description: "Saved itineraries are still available" });
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Load initial count
  useEffect(() => {
    getCount().then(setSavedCount).catch(() => {});
    getAllTrips().then(setSavedTrips).catch(() => {});
  }, []);

  const saveOffline = useCallback(async (
    id: string,
    title: string,
    tripData: Record<string, unknown>
  ) => {
    try {
      const trip: OfflineItinerary = {
        id,
        title,
        destination: (tripData as { destination?: string }).destination ?? "Unknown",
        country: (tripData as { country?: string }).country ?? "",
        durationDays: (tripData as { durationDays?: number }).durationDays ?? 0,
        totalCostUsd: (tripData as { totalCostUsd?: number }).totalCostUsd ?? 0,
        merchantCoverage: (tripData as { merchantCoverage?: number }).merchantCoverage ?? 0,
        savedAt: Date.now(),
        data: tripData,
      };
      await saveTrip(trip);
      setSavedCount((c) => c + 1);
      setSavedTrips((prev) => [trip, ...prev.filter(t => t.id !== id)]);
      toast.success("Saved for offline access", { description: `${title} available without internet` });
      logger.info(`[OfflineItinerary] Saved: ${title}`);
    } catch (e: unknown) {
      logger.error("[OfflineItinerary] Save error", { error: e instanceof Error ? e.message : String(e) });
      toast.error("Failed to save offline");
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      await removeTrip(id);
      setSavedCount((c) => Math.max(0, c - 1));
      setSavedTrips((prev) => prev.filter(t => t.id !== id));
      toast.success("Removed from offline storage");
    } catch (e: unknown) {
      logger.error("[OfflineItinerary] Remove error", { error: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  const getAll = useCallback(async () => {
    try {
      const trips = await getAllTrips();
      setSavedTrips(trips);
      return trips;
    } catch {
      return [];
    }
  }, []);

  return {
    saveOffline,
    getAll,
    remove,
    savedCount,
    savedTrips,
    isOnline,
  };
}
