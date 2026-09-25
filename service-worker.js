'use strict';

// Bump CACHE_NAME when any precached shell asset changes.
const CACHE_PREFIX = 'spy-in-the-room-shell-';
const CACHE_NAME = 'spy-in-the-room-shell-v17';
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = Object.freeze([
  '/',
  '/index.html',
  '/styles.css',
  '/offline.css',
  '/api-client.js',
  '/game-logic.js',
  '/prefs.js',
  '/game-view.js',
  '/game.js',
  '/analytics-bootstrap.js',
  '/offline.js',
  '/assets/app-icon-64.png',
  '/assets/app-icon-180.png',
  '/assets/app-icon-192.png',
  '/assets/app-icon-512.png',
  '/manifest.webmanifest',
  OFFLINE_URL
]);

function isApiRequest(url) {
  return url.pathname === '/api' || url.pathname.startsWith('/api/');
}

function isPrecachedAsset(request, url) {
  return request.method === 'GET'
    && url.origin === self.location.origin
    && url.search === ''
    && PRECACHE_URLS.includes(url.pathname)
    && !isApiRequest(url);
}

async function precacheShell() {
  const cache = await caches.open(CACHE_NAME);
  const requests = PRECACHE_URLS.map((url) => new Request(new URL(url, self.location.origin), {
    cache: 'reload',
    credentials: 'omit'
  }));

  // This is the only Cache Storage write: an explicit list of public shell assets.
  await cache.addAll(requests);
}

async function handleNavigation(request) {
  try {
    // Navigations are network-first so a deployment can replace stale shell HTML.
    return await fetch(request, { cache: 'no-store' });
  } catch {
    const offlineResponse = await caches.match(OFFLINE_URL);
    return offlineResponse || new Response(
      'No connection. Reconnect and try again.',
      {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      }
    );
  }
}

async function handlePrecachedAsset(request) {
  // Assets are network-first so a stale worker can never pair an old
  // stylesheet or script with a newer HTML shell. The precache is only an
  // offline fallback; the game itself always requires the network.
  try {
    return await fetch(request);
  } catch {
    const cachedResponse = await caches.match(request, { ignoreSearch: true });
    return cachedResponse || new Response(
      'No connection. Reconnect and try again.',
      {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      }
    );
  }
}

self.addEventListener('install', (event) => {
  // A failed precache rejects installation, leaving the previous worker active.
  event.waitUntil(precacheShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'SKIP_WAITING') return;

  // The page may request this only after it has confirmed a safe reload point.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isApiRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isPrecachedAsset(request, url)) {
    event.respondWith(handlePrecachedAsset(request));
  }
});
