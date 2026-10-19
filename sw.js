const CACHE="mfg-lt-v3-0";
const ASSETS=["./","./index.html","./manifest.json","./icon.svg","./lt-core.js?v=3.0",
  "./analyzer.html","./analyzer-core.js?v=1.0","./analyzer.js?v=1.0","./vendor/xlsx.full.min.js"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
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
  if (event.request.mode === "navigate") {
    // Each page (index.html, analyzer.html) is cached under its own address, without the query.
    const page = new URL(event.request.url);
    page.search = "";
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          if (response.ok) caches.open(CACHE).then(cache => cache.put(page.href, copy));
          return response;
        })
        .catch(() => caches.match(page.href, { ignoreSearch: true })
          .then(hit => hit || caches.match("./index.html")))
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
