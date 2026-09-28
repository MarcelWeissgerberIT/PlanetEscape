// Offline cache. The page itself always comes from the network (revalidated, never a stale copy), bundles with a
// content hash in their name are cached for good, and all other files (sprites, icons) are served from the cache
// but refreshed in the background, so redrawn art shows up after one reload. The build stamps VERSION, so every
// deploy starts with a clean cache.
const VERSION = 'pe-__SW_VERSION__';
const HASHED = /-[A-Za-z0-9_-]{8}\.(js|css)$/;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const isAsset = /\/assets\/|\.(webp|png|js|css|woff2?|json)$/.test(url.pathname);
  if (!isAsset) {
    // page: always ask the server (bypassing the HTTP cache), fall back to the cached copy offline
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
    );
    return;
  }
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req);
      const refresh = fetch(req, HASHED.test(url.pathname) ? undefined : { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      if (hit) {
        if (!HASHED.test(url.pathname)) e.waitUntil(refresh); // stale-while-revalidate
        return hit;
      }
      return refresh;
    }),
  );
});
