const BUILD_VERSION = import.meta.env.VITE_BUILD_HASH || "dev";

let updatePending = false;

export function initCacheBuster() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "CACHE_PURGED") {
      window.location.reload();
    }
  });

  navigator.serviceWorker.ready.then((registration) => {
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "activated" && !updatePending) {
          updatePending = true;
          window.location.reload();
        }
      });
    });

    // Check for updates every 5 minutes
    setInterval(() => registration.update(), 5 * 60 * 1000);
  });
}

export function getBuildVersion(): string {
  return BUILD_VERSION;
}
