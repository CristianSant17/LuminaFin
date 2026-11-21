const CACHE_VERSION = '2.0.5';
const LOCAL_CACHE = `LuminaFin-local-${CACHE_VERSION}`;
const RUNTIME_CACHE = `LuminaFin-runtime-${CACHE_VERSION}`;
const LOCAL_ASSETS = [
  '.',
  'index.html',
  'style.css',
  'script.js',
  'src/core/money.js',
  'src/core/finance.js',
  'src/core/fixed-expenses.js',
  'src/core/currency.js',
  'src/core/coffers.js',
  'src/core/planning.js',
  'src/core/validation.js',
  'src/storage/schema.js',
  'src/ui/navigation.js',
  'manifest.json',
  'icon.svg',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(LOCAL_CACHE).then((cache) => cache.addAll(LOCAL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames.filter((name) => name !== LOCAL_CACHE && name !== RUNTIME_CACHE)
        .map((name) => caches.delete(name))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isLocal = url.origin === self.location.origin;

  if (!isLocal) {
    event.respondWith(
      (async () => {
        let cached = null;
        let cache = null;
        try {
          cache = await caches.open(RUNTIME_CACHE);
          cached = await cache.match(event.request);
        } catch {
          cache = null;
        }
        const refresh = fetch(event.request).then((response) => {
          if (response && response.ok && cache) {
            return cache.put(event.request, response.clone())
              .catch(() => undefined)
              .then(() => response);
          }
          return response;
        });
        if (cached) {
          event.waitUntil(refresh.catch(() => undefined));
          return cached;
        }
        try {
          return await refresh;
        } catch {
          return new Response('', { status: 504, statusText: 'Offline' });
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      let cachedResponse = null;
      try {
        cachedResponse = await caches.match(event.request, { cacheName: LOCAL_CACHE });
      } catch {
        cachedResponse = null;
      }
      if (cachedResponse) return cachedResponse;
      try {
        const response = await fetch(event.request);
        if (response && response.status === 200 && response.type !== 'opaque') {
          caches.open(LOCAL_CACHE)
            .then((cache) => cache.put(event.request, response.clone()))
            .catch(() => undefined);
        }
        return response;
      } catch {
        if (event.request.destination === 'document') {
          let fallback = null;
          try {
            fallback = await caches.match('index.html');
          } catch {
            fallback = null;
          }
          if (fallback) return fallback;
        }
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })()
  );
});
