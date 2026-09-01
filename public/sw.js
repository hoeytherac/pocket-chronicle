const CACHE = "pocket-chronicle-v0150-2";
const SHELL = [
  "/mobile.html",
  "/mobile.css?v=24",
  "/mobile.js?v=24",
  "/getting-started.html",
  "/exodusters-tables.json?v=1",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-180.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys
      .filter((key) => key.startsWith("pocket-chronicle-") && key !== CACHE)
      .map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  const isMobileNavigation = request.mode === "navigate" && (url.pathname === "/" || url.pathname === "/mobile.html" || url.pathname === "/getting-started.html");
  const isShellAsset = ["/mobile.css", "/mobile.js", "/getting-started.html", "/exodusters-tables.json", "/manifest.webmanifest", "/favicon.svg", "/icon-180.png"].includes(url.pathname);
  if (!isMobileNavigation && !isShellAsset) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  }).catch(async () => {
    const exact = await caches.match(request);
    if (exact) return exact;
    return caches.match(url.pathname === "/getting-started.html" ? "/getting-started.html" : "/mobile.html");
  }));
});
