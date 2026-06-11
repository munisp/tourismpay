/* =============================================================================
   TOURISMPAY SERVICE WORKER — Offline Support, Caching & Background Sync
   - Cache-first for static assets
   - Network-first for API calls
   - Offline fallback for navigation
   - Background Sync for queued payments (payment-queue-sync)
   ============================================================================= */

const CACHE_NAME = "tourismpay-v4.0";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
];

// ─── IndexedDB helpers (duplicated from hook — SW has no module imports) ──────

const DB_NAME = "tourismpay-offline";
const DB_VERSION = 1;
const STORE_NAME = "payment-queue";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
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

async function getAllQueued() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putQueued(payment) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).put(payment);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteQueued(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Navigation requests — serve app shell
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Static assets — cache first
  if (url.pathname.match(/\.(js|css|png|jpg|webp|svg|woff2|ico)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Default: network with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// ─── Background Sync — Payment Queue ─────────────────────────────────────────

self.addEventListener("sync", (event) => {
  if (event.tag === "payment-queue-sync") {
    event.waitUntil(replayQueuedPayments());
  }
});

async function replayQueuedPayments() {
  let payments;
  try {
    payments = await getAllQueued();
  } catch {
    return;
  }

  const pending = payments.filter(
    (p) => p.status === "pending" || p.status === "retrying"
  );

  if (pending.length === 0) return;

  for (const payment of pending) {
    try {
      // Update status
      await putQueued({ ...payment, status: "retrying", attempts: payment.attempts + 1 });

      // Call the tRPC pay endpoint directly via fetch
      const response = await fetch("/api/trpc/qrPayment.pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          json: {
            token: payment.token,
            amountUsd: payment.amountUsd,
            currency: payment.currency,
          },
        }),
      });

      if (response.ok) {
        await deleteQueued(payment.id);
        // Notify the open clients that a payment was replayed
        const allClients = await self.clients.matchAll({ type: "window" });
        for (const client of allClients) {
          client.postMessage({
            type: "PAYMENT_REPLAYED",
            paymentId: payment.id,
            amountUsd: payment.amountUsd,
            currency: payment.currency,
          });
        }
      } else {
        const errorText = await response.text().catch(() => "");
        const isUnrecoverable =
          errorText.includes("expired") ||
          errorText.includes("already used") ||
          errorText.includes("invalid");

        if (isUnrecoverable || payment.attempts >= 3) {
          await putQueued({ ...payment, status: "failed", lastError: errorText });
        } else {
          await putQueued({ ...payment, status: "pending", lastError: errorText });
        }
      }
    } catch (err) {
      // Network still offline — leave as pending for next sync
      await putQueued({ ...payment, status: "pending", lastError: err?.message ?? "Network error" });
    }
  }
}

// ─── Push Notifications ───────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: "TourismPay Alert", body: event.data?.text() ?? "" };
  }

  const options = {
    body: data.body || "New alert from TourismPay",
    icon: "/icons/pwa-192.png",
    badge: "/icons/pwa-192.png",
    tag: data.tag || "tourismpay-notification",
    data: { url: data.url || "/" },
    actions: [
      { action: "view", title: "View" },
      { action: "dismiss", title: "Dismiss" },
    ],
    requireInteraction: false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "TourismPay Alert", options)
  );
});

// ─── Notification Click ───────────────────────────────────────────────────────

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "view" || !event.action) {
    const url = event.notification.data?.url || "/";
    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
        // Focus existing window if open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Otherwise open a new window
        return self.clients.openWindow(url);
      })
    );
  }
});

// ─── Message from client ──────────────────────────────────────────────────────

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "REPLAY_QUEUE") {
    replayQueuedPayments();
  }
});
