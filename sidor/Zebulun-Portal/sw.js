const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `zebulun-portal-cache-${CACHE_VERSION}`;
const APP_SHELL_FILES = [
  'index.html',
  'app.desktop.css',
  'app.mobile.css',
  'app.logic.js',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/feather-icons'
];

// 1. Install Event: Cache the app shell
self.addEventListener('install', (event) => {
  console.log('[SW] Install event triggered. Caching app shell.');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching files:', APP_SHELL_FILES);
        return cache.addAll(APP_SHELL_FILES);
      })
      .then(() => self.skipWaiting()) // Force activation
  );
});

// 2. Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event triggered. Cleaning old caches.');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Claim clients immediately
  );
});

// 3. Fetch Event: Serve from cache (Cache-First for shell, Network-First for data)
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Check if the request is for one of the app shell files
  const isAppShell = APP_SHELL_FILES.includes(requestUrl.pathname.split('/').pop()) || requestUrl.origin === self.location.origin;

  if (isAppShell) {
    // Cache-First strategy for App Shell
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request).then((networkResponse) => {
          // Optional: cache the new response if it's a successful GET
          if (networkResponse.ok && event.request.method === 'GET') {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse.clone()));
          }
          return networkResponse;
        });
      }).catch(() => {
        // Fallback for offline (if even cache fails, though unlikely for shell)
        // You could return an offline.html page here if you had one
      })
    );
  } else {
    // Network-First strategy for API calls or other resources
    event.respondWith(
      fetch(event.request).catch(() => {
        // If network fails, try to match from cache (e.g., for previously fetched data)
        return caches.match(event.request);
      })
    );
  }
});

// Listen for messages from the client (e.g., to show update notification)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

