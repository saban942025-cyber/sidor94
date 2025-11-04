const CACHE_VERSION = 'v1.0.1'; // עדכון גרסה
const CACHE_NAME = `zebulun-portal-cache-${CACHE_VERSION}`;
const APP_SHELL_FILES = [
  'index.html',
  'app.desktop.css',
  'app.mobile.css',
  'app.logic.js',
  'https://unpkg.com/feather-icons'
  // Tailwind CSS loaded via <style> tag in index.html, not cached here.
];

// 1. Install Event: Cache the app shell
self.addEventListener('install', (event) => {
  console.log('[SW] Install event triggered. Caching app shell.');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching files:', APP_SHELL_FILES);
        // Using addAll with ignoreSearch=true to handle potential query params
        return Promise.all(
          APP_SHELL_FILES.map(url => cache.add(new Request(url, { cache: 'reload' })))
        );
      })
      .then(() => self.skipWaiting()) // Force activation
      .catch(err => console.error('[SW] Cache addAll failed:', err))
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

  // Don't cache Firestore requests
  if (requestUrl.hostname.includes('firestore.googleapis.com')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Don't cache upload endpoint
  if (event.request.url.includes('WEB_APP_URL_PLACEHOLDER')) {
     event.respondWith(fetch(event.request));
     return;
  }

  // Cache-First strategy for App Shell
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // If found in cache, return it
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // Not in cache, fetch from network
      return fetch(event.request).then((networkResponse) => {
        // Optional: cache the new response if it's a successful GET
        if (networkResponse.ok && event.request.method === 'GET') {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse.clone()));
        }
        return networkResponse;
      });
    }).catch((error) => {
      console.error('[SW] Fetch failed:', error);
      // You could return an offline.html page here if you had one
    })
  );
});

// Listen for messages from the client (e.g., to show update notification)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CHECK_VERSION') {
      // Logic to inform client if a new version is available
      // This is often handled by checking a version file on the server
  }
});

