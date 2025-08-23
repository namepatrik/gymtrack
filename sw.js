/*
  GymTrack • sw.js
  App shell caching for offline-first. Since data is local (IndexedDB), we mainly cache static assets.
  Also responds to SKIP_WAITING messages for instant updates.
*/

const CACHE = 'gymtrack-v1';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './ui.js',
  './charts.js',
  './export.js',
  './manifest.webmanifest',
  './lib/chart.umd.min.js'
];

self.addEventListener('install', (e)=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(cache=> cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (e)=>{
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=> k!==CACHE).map(k=> caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e)=>{
  if(e.data && e.data.type==='SKIP_WAITING') self.skipWaiting();
});

// Network strategy: cache-first for app shell, network-first fallback for others
self.addEventListener('fetch', (e)=>{
  const url = new URL(e.request.url);
  if(e.request.method !== 'GET') return; // let non-GET fall through

  // Same-origin only for app shell
  const isShell = url.origin === location.origin && APP_SHELL.some(p=> url.pathname.endsWith(p.replace('./','/')));

  if(isShell){
    e.respondWith(caches.match(e.request).then(res=> res || fetch(e.request)));
    return;
  }

  // For other GETs: try cache, then network, then cache put
  e.respondWith((async ()=>{
    const cache = await caches.open(CACHE);
    const cached = await cache.match(e.request);
    if(cached) return cached;
    try{
      const resp = await fetch(e.request);
      if(resp && resp.status===200 && resp.type==='basic') cache.put(e.request, resp.clone());
      return resp;
    }catch(err){
      return cached || new Response('Offline', {status:503, statusText:'Offline'});
    }
  })());
});
