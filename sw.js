/* GymTrack • sw.js (robust, no manual version bumps)
   Strategy:
   - Cache-first for static assets (HTML, CSS, icons, manifest, Chart.js fallback)
   - Network-first for JS modules to avoid mixed HTML/JS versions
   - Force fresh copies on install via {cache:'reload'}
   - Skip waiting + claim
*/

const STATIC_CACHE = 'gymtrack-static-v1'; // can stay stable
const RUNTIME_CACHE = 'gymtrack-runtime-v1';

const SHELL_STATIC = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './lib/chart.umd.min.js'
];

// JS modules handled via network-first to prevent version mismatch
const SHELL_JS = [
  './app.js',
  './db.js',
  './ui.js',
  './charts.js',
  './export.js'
];

self.addEventListener('install', (e) => {
  // Always grab the freshest versions on install
  const requests = [...SHELL_STATIC, ...SHELL_JS].map((u) => new Request(u, { cache: 'reload' }));
  e.waitUntil(
    (async () => {
      const staticCache = await caches.open(STATIC_CACHE);
      await staticCache.addAll(SHELL_STATIC.map((u) => new Request(u, { cache: 'reload' })));
      // Pre-warm runtime cache with JS files (still fetched fresh in install)
      const runtimeCache = await caches.open(RUNTIME_CACHE);
      for (const req of SHELL_JS) {
        try {
          const resp = await fetch(new Request(req, { cache: 'reload' }));
          if (resp.ok) await runtimeCache.put(req, resp.clone());
        } catch (_) { /* offline first install */ }
      }
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      for (const k of keys) {
        if (![STATIC_CACHE, RUNTIME_CACHE].includes(k)) await caches.delete(k);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Helper: file matcher
function isInList(url, list) {
  const p = url.pathname.replace(/^\//, './');
  return list.includes(p);
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  const sameOrigin = url.origin === location.origin;

  // Only manage same-origin files
  if (!sameOrigin) return;

  // JS files: network-first to avoid HTML/JS mismatch
  if (isInList(url, SHELL_JS)) {
    e.respondWith(networkFirst(e.request, RUNTIME_CACHE));
    return;
  }

  // Static shell: cache-first
  if (isInList(url, SHELL_STATIC)) {
    e.respondWith(cacheFirst(e.request, STATIC_CACHE));
    return;
  }

  // Other GETs: try cache, else network, then cache
  e.respondWith(staleWhileRevalidate(e.request, RUNTIME_CACHE));
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;
  const resp = await fetch(req);
  if (resp && resp.ok) cache.put(req, resp.clone());
  return resp;
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const resp = await fetch(req);
    if (resp && resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch {
    const cached = await cache.match(req, { ignoreSearch: true });
    return cached || new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreSearch: true });
  const fetchPromise = fetch(req).then((resp) => {
    if (resp && resp.ok) cache.put(req, resp.clone());
    return resp;
  }).catch(() => null);
  return cached || (await fetchPromise) || new Response('Offline', { status: 503 });
}
