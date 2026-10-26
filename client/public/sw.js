const CACHE_NAME = "abu-raghwa-shell-v2";

// Apply newly published PWA code immediately instead of waiting for old tabs to close.
const skipWaiting = true;
const clientsClaim = true;

self.addEventListener("install", () => {
  if (skipWaiting) self.skipWaiting();
});

self.addEventListener("activate", event => {
  if (clientsClaim) event.waitUntil(self.clients.claim());
});

// Keep navigation online-first so users always receive the current deployment.
// The listener is intentionally lightweight; application data remains server-backed.
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
