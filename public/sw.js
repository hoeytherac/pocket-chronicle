// Pocket Chronicle is an online Foundry companion. This worker exists only to
// keep the app installable and to remove caches created by older releases. It
// deliberately does not intercept navigation, JavaScript, API, or asset
// requests; every launch comes from the current deployment.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith("pocket-chronicle-")).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});
