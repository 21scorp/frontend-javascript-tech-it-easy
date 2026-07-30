/* WISP service worker — stale-while-revalidate.
   Serves the last known good version instantly (offline play),
   refreshes the cache in the background. Bump VERSION on releases
   that change the file structure. */
const VERSION = "wisp-v1";

const PRECACHE = [
  ".",
  "index.html",
  "css/style.css",
  "js/util.js", "js/config.js", "js/audio.js", "js/state.js",
  "js/particles.js", "js/scene.js", "js/wisp.js", "js/ui.js",
  "js/game.js", "js/main.js",
  "manifest.webmanifest",
  "assets/icon.svg", "assets/icon-192.png", "assets/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(e.request);
      const fresh = fetch(e.request)
        .then((res) => {
          if (res && res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
