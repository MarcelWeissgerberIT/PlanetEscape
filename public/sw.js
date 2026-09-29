// Offline cache. The page always comes from the network and falls back to the cached copy offline. Bundles with a
// content hash in their name are cached for good; other files (sprites, icons) are served from the cache and
// refreshed in the background. The build stamps VERSION, so every deploy starts with a clean cache.
// Everything is defensive: when anything here fails, the request goes to the network as if there were no worker.
const VERSION = 'pe-__SW_VERSION__';
const HASHED = /-[A-Za-z0-9_-]{8}\.(js|css)$/;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .catch(() => undefined)
      .then(() => self.clients.claim()),
  );
});

async function page(req) {
  try {
    // a plain URL request: copying a navigation Request with options is refused by some browsers
    const res = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
    if (res.ok) {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req.url, copy)).catch(() => undefined);
    }
    return res;
  } catch {
    const hit = (await caches.match(req.url).catch(() => undefined)) || (await caches.match('./index.html').catch(() => undefined));
    return hit || fetch(req);
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (/\.(mp4|webm)$/.test(url.pathname)) return; // videos stream from the network (range requests)
  if (req.mode === 'navigate' || !/\/assets\/|\.(webp|png|js|css|woff2?|json)$/.test(url.pathname)) {
    e.respondWith(page(req));
    return;
  }
  let refreshed = Promise.resolve();
  const answer = (async () => {
    try {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      if (hit && HASHED.test(url.pathname)) return hit;
      const net = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone()).catch(() => undefined);
        return res;
      });
      if (hit) {
        refreshed = net.catch(() => undefined); // stale-while-revalidate
        return hit;
      }
      return await net;
    } catch {
      return fetch(req);
    }
  })();
  e.respondWith(answer);
  e.waitUntil(answer.then(() => refreshed).catch(() => undefined));
});
