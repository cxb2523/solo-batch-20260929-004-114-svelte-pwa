'use strict';

// SW_VERSION is injected at build time by the `serviceWorkerVersion` plugin
// in rollup.config.js. The cache name is always derived from it so that the
// service worker, the build output and the offline panel all agree on the
// exact same cache name for a given build.
const SW_VERSION = 'v1.0.4-20261007175053';
const CACHE_PREFIX = 'svelte-pwa-static';
const CACHE_NAME = CACHE_PREFIX + '-' + SW_VERSION;

// Pre-cache manifest. Mirrors the real build outputs declared in
// rollup.config.js (public/build/bundle.js + public/build/bundle.css) and
// every icon path listed in public/manifest.json. scripts/verify-pwa.mjs
// fails the build if any entry is missing on disk.
const PRECACHE_URLS = [
  '/index.html',
  '/offline.html',
  '/global.css',
  '/favicon.png',
  '/manifest.json',
  '/build/bundle.js',
  '/build/bundle.css',
  '/images/icons/icon-32x32.png',
  '/images/icons/icon-128x128.png',
  '/images/icons/icon-144x144.png',
  '/images/icons/icon-152x152.png',
  '/images/icons/icon-192x192.png',
  '/images/icons/icon-256x256.png',
  '/images/icons/icon-512x512.png',
  '/images/icons/maskable_icon.png',
];

const OFFLINE_URL = '/offline.html';

// Last navigation fallback, reported to the offline panel in App.svelte.
let lastFallback = null;

self.addEventListener('install', (evt) => {
  console.log('[ServiceWorker] Install', CACHE_NAME);
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching', PRECACHE_URLS.length, 'entries');
      return cache.addAll(PRECACHE_URLS);
    })
  );
});

self.addEventListener('activate', (evt) => {
  console.log('[ServiceWorker] Activate', CACHE_NAME);
  // Only delete caches from other builds of this app; never touch the
  // currently active cache or unrelated caches.
  evt.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME && key.startsWith(CACHE_PREFIX + '-')) {
            console.log('[ServiceWorker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evt) => {
  const request = evt.request;

  // Only handle same-origin GET requests; let everything else hit the network.
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // Navigations (any deep route): network-first, fall back to offline.html.
  if (request.mode === 'navigate') {
    evt.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(async () => {
          lastFallback = { url: url.pathname, at: new Date().toISOString() };
          const cached =
            (await caches.match(OFFLINE_URL, { ignoreSearch: true })) ||
            (await caches.open(CACHE_NAME).then((cache) => cache.match(OFFLINE_URL)));
          if (cached) {
            const clients = await self.clients.matchAll({ type: 'window' });
            clients.forEach((client) =>
              client.postMessage({ type: 'OFFLINE_FALLBACK', url: url.pathname })
            );
            return cached;
          }
          return Response.error();
        })
    );
    return;
  }

  // Static assets and icons: stale-while-revalidate.
  evt.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

self.addEventListener('message', (evt) => {
  const data = evt.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data.type === 'GET_SW_STATUS') {
    caches.open(CACHE_NAME).then(async (cache) => {
      const keys = await cache.keys();
      evt.source.postMessage({
        type: 'SW_STATUS',
        cacheName: CACHE_NAME,
        version: SW_VERSION,
        cachedCount: keys.length,
        lastFallback: lastFallback,
      });
    });
    return;
  }
  if (data.type === 'CLEAR_CACHES') {
    caches.keys().then((keyList) =>
      Promise.all(keyList.map((key) => caches.delete(key)))
    );
  }
});
