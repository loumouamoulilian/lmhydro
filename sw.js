const CACHE = "loumouamou-hydro-v20";
const ASSETS = [
  "/",
  "/index.html",
  "/loumouamou-hydro.html",
  "/loumouamou-canvas.html",
  "/loumouamou-manual.html",
  "/loumouamou-optimized.html",
  "/loumouamou-square.html",
  "/loumouamou-bh.html",
  "/loumouamou-bh-v16.html",
  "/loumouamou-bh-v17.html",
  "/loumouamou-bh-v18.html",
  "/loumouamou-qp-v19.html",
  "/index.html",
  "/styles.css",
  "/styles-canvas.css",
  "/styles-manual.css",
  "/styles-optimized.css",
  "/styles-square.css",
  "/app.js",
  "/app-canvas.js",
  "/app-manual.js",
  "/app-optimized.js",
  "/app-square.js",
  "/app-square-v15.js",
  "/app-bh-v16.js",
  "/app-bh-v17.js",
  "/app-bh-v18.js",
  "/app-qp-v19.js",
  "/app-hydro-v20.js",
  "/manifest.webmanifest",
  "/assets/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached || caches.match("/index.html"));
      return cached || network;
    })
  );
});
