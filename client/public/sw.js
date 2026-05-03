/* =============================================================================
   TOURISMPAY SERVICE WORKER v5.0 — Workbox-style Caching & Background Sync
   
   Strategies:
   - CacheFirst: static assets (JS, CSS, images, fonts) with 30-day expiry
   - NetworkFirst: API calls with 5-second timeout fallback to cache
   - StaleWhileRevalidate: HTML pages
   - Background Sync: queued payments (payment-queue-sync)
   
   Versioned precaching with automatic cleanup of stale caches.
   ============================================================================= */

const CACHE_VERSION = "v5.0";
const STATIC_CACHE = `tourismpay-static-${CACHE_VERSION}`;
const API_CACHE = `tourismpay-api-${CACHE_VERSION}`;
const IMAGE_CACHE = `tourismpay-images-${CACHE_VERSION}`;
const FONT_CACHE = `tourismpay-fonts-${CACHE_VERSION}`;
const ALL_CACHES = [STATIC_CACHE, API_CACHE, IMAGE_CACHE, FONT_CACHE];

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
];

// Cache size limits
const MAX_API_ENTRIES = 100;
const MAX_IMAGE_ENTRIES = 200;
const MAX_STATIC_ENTRIES = 300;
const API_CACHE_MAX_AGE_S = 300;      // 5 minutes
const STATIC_CACHE_MAX_AGE_S = 2592000; // 30 days
const IMAGE_CACHE_MAX_AGE_S = 604800;   // 7 days

// ─── IndexedDB helpers (SW has no module imports) ────────────────────────────

const DB_NAME = "tourismpay-offline";
const DB_VERSION = 2;
const STORE_NAME = "payment-queue";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getQueuedPayments() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function removeQueuedPayment(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── Cache Management Helpers ────────────────────────────────────────────────

function isExpired(response, maxAgeSeconds) {
  const dateHeader = response.headers.get("sw-cache-timestamp") || response.headers.get("date");
  if (!dateHeader) return false;
  const cachedAt = new Date(dateHeader).getTime();
  return Date.now() - cachedAt > maxAgeSeconds * 1000;
}

function addTimestamp(response) {
  const headers = new Headers(response.headers);
  headers.set("sw-cache-timestamp", new Date().toISOString());
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    for (let i = 0; i < keys.length - maxEntries; i++) {
      await cache.delete(keys[i]);
    }
  }
}

// ─── Routing Helpers ─────────────────────────────────────────────────────────

function isStaticAsset(url) {
  return /\.(js|css|woff2?|ttf|otf|eot)(\?.*)?$/.test(url.pathname);
}

function isImageAsset(url) {
  return /\.(png|jpe?g|gif|webp|avif|svg|ico)(\?.*)?$/.test(url.pathname);
}

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

// ─── CacheFirst Strategy (static assets) ────────────────────────────────────

async function cacheFirst(request, cacheName, maxAge) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  
  if (cached && !isExpired(cached, maxAge)) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cloned = addTimestamp(response.clone());
      cache.put(request, cloned);
    }
    return response;
  } catch {
    if (cached) return cached;
    return new Response("Offline", { status: 503 });
  }
}

// ─── NetworkFirst Strategy (API calls) ──────────────────────────────────────

async function networkFirst(request, cacheName, timeoutMs = 5000) {
  const cache = await caches.open(cacheName);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (response.ok && request.method === "GET") {
      const cloned = addTimestamp(response.clone());
      cache.put(request, cloned);
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    
    return new Response(JSON.stringify({ error: "You appear to be offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ─── StaleWhileRevalidate Strategy (HTML pages) ─────────────────────────────

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, addTimestamp(response.clone()));
      }
      return response;
    })
    .catch(() => null);

  return cached || (await fetchPromise) || new Response("Offline", { status: 503 });
}

// ─── Install Event ──────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log("[SW] Precaching static assets");
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

// ─── Activate Event (cleanup old caches) ────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith("tourismpay-") && !ALL_CACHES.includes(name))
          .map((name) => {
            console.log("[SW] Deleting old cache:", name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// ─── Fetch Event (routing) ──────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET for caching (except background sync handles POSTs)
  if (event.request.method !== "GET") return;

  // Skip SSE and WebSocket
  if (url.pathname.startsWith("/api/sse") || url.pathname.startsWith("/api/ws")) return;

  // API requests → NetworkFirst with 5s timeout
  if (isApiRequest(url)) {
    event.respondWith(networkFirst(event.request, API_CACHE, 5000));
    return;
  }

  // Images → CacheFirst with 7-day expiry
  if (isImageAsset(url)) {
    event.respondWith(cacheFirst(event.request, IMAGE_CACHE, IMAGE_CACHE_MAX_AGE_S));
    return;
  }

  // Static assets (JS/CSS/fonts) → CacheFirst with 30-day expiry
  if (isStaticAsset(url)) {
    const cacheName = /\.(woff2?|ttf|otf|eot)/.test(url.pathname) ? FONT_CACHE : STATIC_CACHE;
    event.respondWith(cacheFirst(event.request, cacheName, STATIC_CACHE_MAX_AGE_S));
    return;
  }

  // Navigation (HTML pages) → StaleWhileRevalidate
  if (isNavigationRequest(event.request)) {
    event.respondWith(staleWhileRevalidate(event.request, STATIC_CACHE));
    return;
  }

  // Default: network with cache fallback
  event.respondWith(networkFirst(event.request, STATIC_CACHE, 3000));
});

// ─── Background Sync (payment queue) ────────────────────────────────────────

self.addEventListener("sync", (event) => {
  if (event.tag === "payment-queue-sync") {
    event.waitUntil(syncPaymentQueue());
  }
});

async function syncPaymentQueue() {
  try {
    const items = await getQueuedPayments();
    console.log(`[SW] Syncing ${items.length} queued payments`);

    for (const item of items) {
      try {
        const res = await fetch("/api/trpc/qrPayment.processPayment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.payload),
        });
        if (res.ok) {
          await removeQueuedPayment(item.id);
          console.log(`[SW] Synced payment ${item.id}`);
        }
      } catch (err) {
        console.warn(`[SW] Failed to sync payment ${item.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[SW] Payment sync failed:", err);
  }
}

// ─── Periodic Cache Cleanup ─────────────────────────────────────────────────

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "TRIM_CACHES") {
    trimCache(API_CACHE, MAX_API_ENTRIES);
    trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES);
    trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES);
  }
});

// ─── Push Notifications ─────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || "TourismPay", {
        body: data.body || "",
        icon: data.icon || "/icons/icon-192.png",
        badge: data.badge || "/icons/badge-72.png",
        tag: data.tag || "tourismpay-notification",
        data: data.data || {},
        actions: data.actions || [],
      })
    );
  } catch {
    // Not JSON — display as text
    event.waitUntil(
      self.registration.showNotification("TourismPay", {
        body: event.data.text(),
        icon: "/icons/icon-192.png",
      })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
