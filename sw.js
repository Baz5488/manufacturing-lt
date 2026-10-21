const CACHE="mfg-lt-v3-6";
const ASSETS=["./","./index.html","./manifest.json","./icon.svg","./lt-core.js?v=3.6","./vendor/xlsx.full.min.js"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      // "reload": take the files from GitHub Pages, not from the browser's HTTP cache (kept up to 10 minutes).
      .then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  // Other sites (e.g. the PROTO CONTROL Tracker capacity feed) always go to the network, never the cache.
  if (new URL(event.request.url).origin !== self.location.origin) return;

  // Always try to get the main document from the network first.
  // This prevents an old cached index.html from hiding new deployments.
  // "no-cache": ask GitHub Pages whether the page changed instead of reusing the browser's copy (up to 10 minutes old).
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request.url, { cache: "no-cache", credentials: "same-origin" })
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
